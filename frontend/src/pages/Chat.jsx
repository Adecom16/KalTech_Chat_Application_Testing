import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'

const API_URL = 'http://localhost:3001'

export default function Chat() {
  const [conversations, setConversations] = useState([])
  const [users, setUsers] = useState([])
  const [selectedConv, setSelectedConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [socket, setSocket] = useState(null)
  const [showSidebar, setShowSidebar] = useState('chats')
  const [searchQuery, setSearchQuery] = useState('')
  const [typingUsers, setTypingUsers] = useState({})
  const [onlineUserIds, setOnlineUserIds] = useState(new Set())
  const [replyTo, setReplyTo] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [selectedUsers, setSelectedUsers] = useState([])
  const [groupName, setGroupName] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileData, setProfileData] = useState({ name: '', about: '' })
  const [disappearingMode, setDisappearingMode] = useState(false)
  
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const navigate = useNavigate()

  const getToken = () => localStorage.getItem('kaltech_token')
  const getHeaders = () => ({
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json'
  })

  // Fetch functions
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { headers: getHeaders() })
      if (res.ok) {
        const user = await res.json()
        setCurrentUser(user)
        setProfileData({ name: user.name, about: user.about })
        return user
      } else {
        navigate('/')
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
    }
    return null
  }, [navigate])

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`, { headers: getHeaders() })
      const data = await res.json()
      setConversations(data)
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async (search = '') => {
    try {
      const res = await fetch(`${API_URL}/api/users?search=${search}`, { headers: getHeaders() })
      const data = await res.json()
      setUsers(data)
    } catch (err) {
      console.error('Failed to fetch users:', err)
    }
  }, [])

  const fetchMessages = useCallback(async (convId) => {
    try {
      const res = await fetch(`${API_URL}/api/conversations/${convId}/messages`, { headers: getHeaders() })
      const data = await res.json()
      setMessages(data)
      
      // Mark messages as read via socket
      if (socket && data.length > 0) {
        const unreadIds = data.filter(m => !m.isMine && !m.readBy?.some(r => r.user === currentUser?.id)).map(m => m.id)
        if (unreadIds.length > 0) {
          socket.emit('message_seen', { conversationId: convId, messageIds: unreadIds })
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    }
  }, [socket, currentUser])

  // Initialize socket and fetch data
  useEffect(() => {
    const token = getToken()
    if (!token) { navigate('/'); return }

    const initializeChat = async () => {
      const user = await fetchCurrentUser()
      if (!user) return

      const newSocket = io(API_URL, {
        transports: ['websocket', 'polling']
      })
      
      newSocket.on('connect', () => {
        console.log('Socket connected!')
        newSocket.emit('user_online', user.id)
      })

      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err)
      })

      setSocket(newSocket)
      fetchConversations()
      fetchUsers()
    }

    initializeChat()

    return () => {
      if (socket) socket.close()
    }
  }, [navigate])

  // Socket event listeners
  useEffect(() => {
    if (!socket || !currentUser) return

    // Receive list of online users
    socket.on('online_users', (userIds) => {
      setOnlineUserIds(new Set(userIds))
    })

    // User status change (online/offline)
    socket.on('user_status', ({ userId, online, lastSeen }) => {
      setOnlineUserIds(prev => {
        const newSet = new Set(prev)
        if (online) {
          newSet.add(userId)
        } else {
          newSet.delete(userId)
        }
        return newSet
      })

      // Update users list
      setUsers(prev => prev.map(u => 
        u._id === userId ? { ...u, online, lastSeen } : u
      ))

      // Update conversations
      setConversations(prev => prev.map(c => 
        c.participantId === userId ? { ...c, online, lastSeen } : c
      ))

      // Update selected conversation
      if (selectedConv?.participantId === userId) {
        setSelectedConv(prev => prev ? { ...prev, online, lastSeen } : null)
      }
    })

    // New message received
    socket.on('new_message', (message) => {
      console.log('New message received:', message)
      
      // Add to messages if in the same conversation
      if (selectedConv?.id === message.conversationId) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === message.id)) return prev
          return [...prev, message]
        })
        
        // Mark as read immediately
        socket.emit('message_seen', { 
          conversationId: message.conversationId, 
          messageIds: [message.id] 
        })
      }
      
      // Update conversations list
      fetchConversations()
    })

    // Typing indicator
    socket.on('user_typing', ({ conversationId, userId, userName, isTyping }) => {
      setTypingUsers(prev => ({
        ...prev,
        [conversationId]: isTyping ? userName || 'Someone' : null
      }))
    })

    // Messages read by recipient
    socket.on('messages_read', ({ conversationId, readBy, messageIds }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => {
          if (m.isMine && (!messageIds || messageIds.includes(m.id))) {
            return { ...m, readBy: [...(m.readBy || []), { user: readBy }] }
          }
          return m
        }))
      }
    })

    // Message deleted
    socket.on('message_deleted', ({ messageId, conversationId }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => 
          m.id === messageId ? { ...m, deleted: true, text: 'This message was deleted', fileUrl: '' } : m
        ))
      }
    })

    // Message edited
    socket.on('message_edited', ({ messageId, conversationId, text }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => 
          m.id === messageId ? { ...m, text, edited: true } : m
        ))
      }
    })

    // Message reaction
    socket.on('message_reaction', ({ messageId, conversationId, reactions }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => 
          m.id === messageId ? { ...m, reactions } : m
        ))
      }
    })

    // Media viewed (for disappearing messages)
    socket.on('media_viewed', ({ messageId }) => {
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, viewed: true } : m
      ))
    })

    // Media expired
    socket.on('media_expired', ({ messageId, conversationId }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => 
          m.id === messageId ? { ...m, deleted: true, text: 'Media expired', fileUrl: '' } : m
        ))
      }
    })

    return () => {
      socket.off('online_users')
      socket.off('user_status')
      socket.off('new_message')
      socket.off('user_typing')
      socket.off('messages_read')
      socket.off('message_deleted')
      socket.off('message_edited')
      socket.off('message_reaction')
      socket.off('media_viewed')
      socket.off('media_expired')
    }
  }, [socket, currentUser, selectedConv, fetchConversations])

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Check if user is online
  const isUserOnline = (userId) => onlineUserIds.has(userId)

  // Handlers
  const selectConversation = (conv) => {
    setSelectedConv(conv)
    setMessages([])
    setReplyTo(null)
    fetchMessages(conv.id)
    setShowSidebar('chats')
  }

  const startNewChat = async (user) => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ participantId: user._id })
      })
      const conv = await res.json()
      setSelectedConv({ ...conv, online: isUserOnline(user._id) })
      setMessages([])
      fetchConversations()
      setShowSidebar('chats')
    } catch (err) {
      console.error('Failed to start chat:', err)
    }
  }

  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return
    try {
      const res = await fetch(`${API_URL}/api/conversations/group`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: groupName, participants: selectedUsers.map(u => u._id) })
      })
      const conv = await res.json()
      setSelectedConv(conv)
      setMessages([])
      fetchConversations()
      setShowSidebar('chats')
      setGroupName('')
      setSelectedUsers([])
    } catch (err) {
      console.error('Failed to create group:', err)
    }
  }

  const handleTyping = () => {
    if (!selectedConv || !socket) return
    socket.emit('typing', { 
      conversationId: selectedConv.id, 
      isTyping: true,
      userName: currentUser?.name 
    })
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { 
        conversationId: selectedConv.id, 
        isTyping: false,
        userName: currentUser?.name 
      })
    }, 2000)
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConv) return

    setSending(true)
    try {
      const res = await fetch(`${API_URL}/api/conversations/${selectedConv.id}/messages`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ text: newMessage, replyTo: replyTo?.id })
      })
      const message = await res.json()
      setMessages(prev => [...prev, message])
      setNewMessage('')
      setReplyTo(null)
      fetchConversations()
      
      // Stop typing indicator
      if (socket) {
        socket.emit('typing', { conversationId: selectedConv.id, isTyping: false })
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedConv) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('disappearing', disappearingMode.toString())

    try {
      const res = await fetch(`${API_URL}/api/conversations/${selectedConv.id}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
      })
      const message = await res.json()
      setMessages(prev => [...prev, message])
      fetchConversations()
    } catch (err) {
      console.error('Failed to upload file:', err)
    }
    e.target.value = ''
  }

  const handleViewMedia = (message) => {
    if (message.disappearing && !message.isMine && socket) {
      socket.emit('view_media', { messageId: message.id })
    }
    window.open(`${API_URL}${message.fileUrl}`)
  }

  const deleteMessage = async (messageId, forEveryone = false) => {
    try {
      await fetch(`${API_URL}/api/messages/${messageId}?forEveryone=${forEveryone}`, {
        method: 'DELETE',
        headers: getHeaders()
      })
      if (forEveryone) {
        setMessages(prev => prev.map(m => 
          m.id === messageId ? { ...m, deleted: true, text: 'This message was deleted', fileUrl: '' } : m
        ))
      } else {
        setMessages(prev => prev.filter(m => m.id !== messageId))
      }
    } catch (err) {
      console.error('Failed to delete message:', err)
    }
    setContextMenu(null)
  }

  const addReaction = async (messageId, emoji) => {
    try {
      await fetch(`${API_URL}/api/messages/${messageId}/reaction`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ emoji })
      })
    } catch (err) {
      console.error('Failed to add reaction:', err)
    }
    setShowEmojiPicker(null)
  }

  const updateProfile = async () => {
    try {
      await fetch(`${API_URL}/api/users/profile`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(profileData)
      })
      setCurrentUser(prev => ({ ...prev, ...profileData }))
      setEditingProfile(false)
    } catch (err) {
      console.error('Failed to update profile:', err)
    }
  }

  const logout = () => {
    localStorage.removeItem('kaltech_token')
    if (socket) socket.close()
    navigate('/')
  }

  const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  
  const formatLastSeen = (date) => {
    if (!date) return ''
    const d = new Date(date)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `today at ${formatTime(date)}`
    return d.toLocaleDateString()
  }

  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏']

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }


  return (
    <div className="h-screen flex bg-gray-900" onClick={() => { setContextMenu(null); setShowEmojiPicker(null) }}>
      {/* Sidebar */}
      <div className="w-96 bg-gray-800 flex flex-col border-r border-gray-700">
        {/* Header */}
        <div className="p-4 bg-gray-800 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowSidebar('profile')}>
            <div className="relative">
              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold overflow-hidden">
                {currentUser?.avatar ? (
                  <img src={`${API_URL}${currentUser.avatar}`} className="w-full h-full object-cover" alt="" />
                ) : currentUser?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800"></div>
            </div>
            <span className="text-white font-medium">{currentUser?.name}</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowSidebar('users')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full" title="New Chat">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            <button onClick={() => setShowSidebar('newGroup')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full" title="New Group">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button onClick={logout} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-full" title="Logout">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); if (showSidebar === 'users') fetchUsers(e.target.value) }}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-400"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {showSidebar === 'profile' && (
            <div className="p-4">
              <button onClick={() => setShowSidebar('chats')} className="text-green-500 mb-4 flex items-center gap-2 hover:text-green-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <div className="text-center mb-6">
                <div className="w-32 h-32 bg-green-600 rounded-full mx-auto flex items-center justify-center text-white text-4xl font-bold overflow-hidden">
                  {currentUser?.avatar ? (
                    <img src={`${API_URL}${currentUser.avatar}`} className="w-full h-full object-cover" alt="" />
                  ) : currentUser?.name?.charAt(0).toUpperCase()}
                </div>
              </div>
              {editingProfile ? (
                <div className="space-y-4">
                  <input type="text" value={profileData.name} onChange={(e) => setProfileData(p => ({ ...p, name: e.target.value }))} className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg" placeholder="Name" />
                  <textarea value={profileData.about} onChange={(e) => setProfileData(p => ({ ...p, about: e.target.value }))} className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg resize-none" placeholder="About" rows={3} />
                  <div className="flex gap-2">
                    <button onClick={updateProfile} className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save</button>
                    <button onClick={() => setEditingProfile(false)} className="flex-1 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gray-700 p-4 rounded-lg"><p className="text-gray-400 text-sm">Name</p><p className="text-white">{currentUser?.name}</p></div>
                  <div className="bg-gray-700 p-4 rounded-lg"><p className="text-gray-400 text-sm">About</p><p className="text-white">{currentUser?.about}</p></div>
                  <div className="bg-gray-700 p-4 rounded-lg"><p className="text-gray-400 text-sm">Email</p><p className="text-white">{currentUser?.email}</p></div>
                  <button onClick={() => setEditingProfile(true)} className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Edit Profile</button>
                </div>
              )}
            </div>
          )}

          {showSidebar === 'users' && (
            <div>
              <div className="px-4 py-2 text-gray-400 text-sm flex items-center gap-2">
                <button onClick={() => setShowSidebar('chats')} className="text-green-500 hover:text-green-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                Start new chat
              </div>
              {users.map(user => (
                <div key={user._id} onClick={() => startNewChat(user)} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700 cursor-pointer">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold overflow-hidden">
                      {user.avatar ? <img src={`${API_URL}${user.avatar}`} className="w-full h-full object-cover" alt="" /> : user.name?.charAt(0).toUpperCase()}
                    </div>
                    {isUserOnline(user._id) && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-gray-800"></div>}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{user.name}</p>
                    <p className="text-gray-400 text-sm">{isUserOnline(user._id) ? <span className="text-green-500">online</span> : user.about || user.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showSidebar === 'newGroup' && (
            <div className="p-4">
              <button onClick={() => { setShowSidebar('chats'); setSelectedUsers([]) }} className="text-green-500 mb-4 flex items-center gap-2 hover:text-green-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <input type="text" placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg mb-4" />
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedUsers.map(u => (
                    <span key={u._id} className="bg-green-600 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
                      {u.name}
                      <button onClick={() => setSelectedUsers(prev => prev.filter(x => x._id !== u._id))} className="hover:text-red-300">×</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-gray-400 text-sm mb-2">Select participants:</p>
              {users.map(user => (
                <div key={user._id} onClick={() => setSelectedUsers(prev => prev.find(u => u._id === user._id) ? prev.filter(u => u._id !== user._id) : [...prev, user])} className={`flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg mb-1 ${selectedUsers.find(u => u._id === user._id) ? 'bg-green-600/20' : 'hover:bg-gray-700'}`}>
                  <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-white">{user.name?.charAt(0).toUpperCase()}</div>
                  <p className="text-white flex-1">{user.name}</p>
                  {selectedUsers.find(u => u._id === user._id) && <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                </div>
              ))}
              {selectedUsers.length > 0 && groupName.trim() && (
                <button onClick={createGroup} className="w-full py-3 bg-green-600 text-white rounded-lg mt-4 font-medium hover:bg-green-700">Create Group ({selectedUsers.length})</button>
              )}
            </div>
          )}

          {showSidebar === 'chats' && (
            conversations.filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase())).map(conv => (
              <div key={conv.id} onClick={() => selectConversation(conv)} className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-700/50 ${selectedConv?.id === conv.id ? 'bg-gray-700' : 'hover:bg-gray-700/50'}`}>
                <div className="relative">
                  <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold overflow-hidden">
                    {conv.isGroup ? '👥' : conv.avatar ? <img src={`${API_URL}${conv.avatar}`} className="w-full h-full object-cover" alt="" /> : conv.name?.charAt(0).toUpperCase()}
                  </div>
                  {!conv.isGroup && (isUserOnline(conv.participantId) || conv.online) && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-gray-800"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-white font-medium truncate">{conv.name}</p>
                    <span className="text-gray-500 text-xs">{conv.lastMessage ? formatTime(conv.lastMessage.createdAt) : ''}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-gray-400 text-sm truncate">
                      {typingUsers[conv.id] ? (
                        <span className="text-green-500 italic">typing...</span>
                      ) : conv.lastMessage?.text || 'No messages yet'}
                    </p>
                    {conv.unreadCount > 0 && <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center">{conv.unreadCount}</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>


      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-900">
        {selectedConv ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 bg-gray-800 flex items-center gap-3 border-b border-gray-700">
              <div className="relative">
                <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold overflow-hidden">
                  {selectedConv.isGroup ? '👥' : selectedConv.avatar ? <img src={`${API_URL}${selectedConv.avatar}`} className="w-full h-full object-cover" alt="" /> : selectedConv.name?.charAt(0).toUpperCase()}
                </div>
                {!selectedConv.isGroup && (isUserOnline(selectedConv.participantId) || selectedConv.online) && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800"></div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">{selectedConv.name}</p>
                <p className="text-sm">
                  {typingUsers[selectedConv.id] ? (
                    <span className="text-green-500 italic">typing...</span>
                  ) : selectedConv.isGroup ? (
                    <span className="text-gray-400">{selectedConv.participants?.length || 0} participants</span>
                  ) : (isUserOnline(selectedConv.participantId) || selectedConv.online) ? (
                    <span className="text-green-500">online</span>
                  ) : (
                    <span className="text-gray-400">last seen {formatLastSeen(selectedConv.lastSeen)}</span>
                  )}
                </p>
              </div>
              {/* Disappearing mode toggle */}
              <button 
                onClick={() => setDisappearingMode(!disappearingMode)} 
                className={`p-2 rounded-full ${disappearingMode ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                title={disappearingMode ? 'Disappearing media ON' : 'Disappearing media OFF'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23374151\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-500">
                    <p className="text-4xl mb-2">💬</p>
                    <p>No messages yet</p>
                    <p className="text-sm">Send a message to start the conversation</p>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const showDate = idx === 0 || new Date(messages[idx - 1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString()
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="text-center my-4">
                          <span className="bg-gray-700 text-gray-300 text-xs px-3 py-1 rounded-full">{new Date(msg.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                      {msg.type === 'system' ? (
                        <div className="text-center my-2">
                          <span className="bg-gray-700/50 text-gray-400 text-xs px-3 py-1 rounded-full">{msg.text}</span>
                        </div>
                      ) : (
                        <div className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`relative max-w-md rounded-lg px-3 py-2 group ${msg.isMine ? 'bg-green-700' : 'bg-gray-700'} ${msg.deleted ? 'opacity-60 italic' : ''}`}
                            onContextMenu={(e) => { e.preventDefault(); if (!msg.deleted) setContextMenu({ x: e.clientX, y: e.clientY, message: msg }) }}
                          >
                            {/* Reply preview */}
                            {msg.replyTo && (
                              <div className="bg-black/20 rounded px-2 py-1 mb-2 border-l-2 border-green-400 text-sm">
                                <p className="text-green-400 text-xs font-medium">{msg.replyTo.sender?.name || 'Unknown'}</p>
                                <p className="text-gray-300 truncate text-xs">{msg.replyTo.text}</p>
                              </div>
                            )}
                            
                            {/* Sender name for groups */}
                            {!msg.isMine && selectedConv.isGroup && !msg.deleted && (
                              <p className="text-green-400 text-xs font-medium mb-1">{msg.sender?.name}</p>
                            )}
                            
                            {/* Media content */}
                            {!msg.deleted && msg.type === 'image' && msg.fileUrl && (
                              <div className="relative">
                                <img 
                                  src={`${API_URL}${msg.fileUrl}`} 
                                  alt="" 
                                  className="max-w-full rounded mb-1 cursor-pointer max-h-64 object-cover" 
                                  onClick={() => handleViewMedia(msg)} 
                                />
                                {msg.disappearing && (
                                  <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  </div>
                                )}
                              </div>
                            )}
                            {!msg.deleted && msg.type === 'video' && msg.fileUrl && (
                              <video src={`${API_URL}${msg.fileUrl}`} controls className="max-w-full rounded mb-1 max-h-64" />
                            )}
                            {!msg.deleted && msg.type === 'audio' && msg.fileUrl && (
                              <audio src={`${API_URL}${msg.fileUrl}`} controls className="mb-1" />
                            )}
                            {!msg.deleted && msg.type === 'file' && msg.fileUrl && (
                              <a href={`${API_URL}${msg.fileUrl}`} download={msg.fileName} className="flex items-center gap-2 bg-black/20 rounded p-2 mb-1 hover:bg-black/30">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                <div>
                                  <p className="text-white text-sm truncate max-w-[180px]">{msg.fileName}</p>
                                  <p className="text-gray-400 text-xs">{(msg.fileSize / 1024).toFixed(1)} KB</p>
                                </div>
                              </a>
                            )}
                            
                            {/* Text */}
                            {msg.text && <p className="text-white whitespace-pre-wrap break-words">{msg.text}</p>}
                            
                            {/* Reactions */}
                            {msg.reactions?.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {msg.reactions.map((r, i) => (
                                  <span key={i} className="bg-black/30 rounded-full px-1.5 py-0.5 text-xs cursor-pointer hover:bg-black/50">{r.emoji}</span>
                                ))}
                              </div>
                            )}
                            
                            {/* Time & status */}
                            <div className="flex items-center justify-end gap-1 mt-1">
                              {msg.edited && <span className="text-gray-400 text-xs italic">edited</span>}
                              <span className="text-gray-400 text-xs">{formatTime(msg.createdAt)}</span>
                              {msg.isMine && !msg.deleted && (
                                <span className="text-xs ml-1">
                                  {msg.readBy?.length > 0 ? (
                                    <span className="text-blue-400">✓✓</span>
                                  ) : msg.deliveredTo?.length > 0 ? (
                                    <span className="text-gray-400">✓✓</span>
                                  ) : (
                                    <span className="text-gray-500">✓</span>
                                  )}
                                </span>
                              )}
                            </div>
                            
                            {/* Quick reaction button */}
                            {!msg.deleted && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id) }}
                                className="absolute -bottom-2 -right-2 bg-gray-600 rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 hover:bg-gray-500 transition-opacity"
                              >
                                😊
                              </button>
                            )}
                            
                            {/* Emoji picker */}
                            {showEmojiPicker === msg.id && (
                              <div className="absolute bottom-full right-0 mb-2 bg-gray-700 rounded-lg p-2 flex gap-1 shadow-xl z-10" onClick={e => e.stopPropagation()}>
                                {emojis.map(emoji => (
                                  <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="hover:scale-125 transition-transform text-lg p-1">{emoji}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Context Menu */}
            {contextMenu && (
              <div className="fixed bg-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px]" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
                <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null) }} className="w-full px-4 py-2 text-left text-white hover:bg-gray-600 flex items-center gap-3 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                  Reply
                </button>
                <button onClick={() => { navigator.clipboard.writeText(contextMenu.message.text); setContextMenu(null) }} className="w-full px-4 py-2 text-left text-white hover:bg-gray-600 flex items-center gap-3 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Copy
                </button>
                {contextMenu.message.isMine && (
                  <>
                    <hr className="border-gray-600 my-1" />
                    <button onClick={() => deleteMessage(contextMenu.message.id, false)} className="w-full px-4 py-2 text-left text-white hover:bg-gray-600 flex items-center gap-3 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete for me
                    </button>
                    <button onClick={() => deleteMessage(contextMenu.message.id, true)} className="w-full px-4 py-2 text-left text-red-400 hover:bg-gray-600 flex items-center gap-3 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete for everyone
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Reply Preview */}
            {replyTo && (
              <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex items-center gap-3">
                <div className="w-1 h-10 bg-green-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-green-500 text-sm font-medium">{replyTo.isMine ? 'You' : replyTo.sender?.name}</p>
                  <p className="text-gray-400 text-sm truncate">{replyTo.text || 'Media'}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-white p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 bg-gray-800 border-t border-gray-700">
              {disappearingMode && (
                <div className="text-center text-xs text-green-500 mb-2 flex items-center justify-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Disappearing media mode - Photos/videos will disappear after viewing
                </div>
              )}
              <form onSubmit={sendMessage} className="flex items-center gap-3">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-white p-2 hover:bg-gray-700 rounded-full transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                </button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => { setNewMessage(e.target.value); handleTyping() }}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-400"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="bg-green-600 text-white p-3 rounded-full hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="text-8xl mb-6 opacity-30">💬</div>
              <h2 className="text-2xl text-gray-400 font-light mb-2">Kaltech Chat</h2>
              <p className="text-gray-500">Select a conversation to start messaging</p>
              <p className="text-gray-600 text-sm mt-4">Send and receive messages in real-time</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
