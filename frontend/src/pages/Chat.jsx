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
  const [replyTo, setReplyTo] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [selectedUsers, setSelectedUsers] = useState([])
  const [groupName, setGroupName] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileData, setProfileData] = useState({ name: '', about: '' })
  
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const navigate = useNavigate()

  const getToken = () => localStorage.getItem('kaltech_token')
  const getHeaders = () => ({
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json'
  })

  const fetchCurrentUser = useCallback(async (socketInstance) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { headers: getHeaders() })
      if (res.ok) {
        const user = await res.json()
        setCurrentUser(user)
        setProfileData({ name: user.name, about: user.about })
        socketInstance?.emit('user_online', user.id)
      } else {
        navigate('/')
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
    }
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
      fetch(`${API_URL}/api/conversations/${convId}/read`, { method: 'PUT', headers: getHeaders() })
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    }
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) { navigate('/'); return }

    const newSocket = io(API_URL)
    setSocket(newSocket)
    fetchCurrentUser(newSocket)
    fetchConversations()
    fetchUsers()

    return () => newSocket.close()
  }, [navigate, fetchCurrentUser, fetchConversations, fetchUsers])

  useEffect(() => {
    if (!socket) return

    socket.on('new_message', (message) => {
      if (selectedConv?.id === message.conversationId) {
        setMessages(prev => [...prev, message])
        fetch(`${API_URL}/api/conversations/${message.conversationId}/read`, { method: 'PUT', headers: getHeaders() })
      }
      fetchConversations()
    })

    socket.on('user_status', ({ userId, online, lastSeen }) => {
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, online, lastSeen } : u))
      setConversations(prev => prev.map(c => c.participantId === userId ? { ...c, online, lastSeen } : c))
      if (selectedConv?.participantId === userId) {
        setSelectedConv(prev => ({ ...prev, online, lastSeen }))
      }
    })

    socket.on('user_typing', ({ conversationId, userId, isTyping }) => {
      setTypingUsers(prev => ({ ...prev, [conversationId]: isTyping ? userId : null }))
    })

    socket.on('messages_read', ({ conversationId, readBy }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => m.isMine ? { ...m, readBy: [...(m.readBy || []), { user: readBy }] } : m))
      }
    })

    socket.on('message_deleted', ({ messageId, conversationId }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true, text: 'This message was deleted' } : m))
      }
    })

    socket.on('message_edited', ({ messageId, conversationId, text }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text, edited: true } : m))
      }
    })

    socket.on('message_reaction', ({ messageId, conversationId, reactions }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m))
      }
    })

    return () => {
      socket.off('new_message')
      socket.off('user_status')
      socket.off('user_typing')
      socket.off('messages_read')
      socket.off('message_deleted')
      socket.off('message_edited')
      socket.off('message_reaction')
    }
  }, [socket, selectedConv, fetchConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      setSelectedConv(conv)
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
    socket.emit('typing', { conversationId: selectedConv.id, isTyping: true })
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { conversationId: selectedConv.id, isTyping: false })
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

  const deleteMessage = async (messageId, forEveryone = false) => {
    try {
      await fetch(`${API_URL}/api/messages/${messageId}?forEveryone=${forEveryone}`, {
        method: 'DELETE',
        headers: getHeaders()
      })
      if (forEveryone) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true, text: 'This message was deleted' } : m))
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
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }


  return (
    <div className="h-screen flex bg-black" onClick={() => { setContextMenu(null); setShowEmojiPicker(null) }}>
      {/* Sidebar */}
      <div className="w-96 bg-neutral-950 flex flex-col border-r border-neutral-800">
        {/* Header */}
        <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowSidebar('profile')}>
            <div className="w-10 h-10 bg-neutral-800 border border-neutral-700 rounded-full flex items-center justify-center text-white font-bold">
              {currentUser?.avatar ? (
                <img src={`${API_URL}${currentUser.avatar}`} className="w-full h-full rounded-full object-cover" alt="" />
              ) : currentUser?.name?.charAt(0).toUpperCase()}
            </div>
            <span className="text-white font-medium">{currentUser?.name}</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowSidebar('users')} className="p-2 text-neutral-400 hover:text-gold hover:bg-neutral-800 rounded-full transition-colors" title="New Chat">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            <button onClick={() => setShowSidebar('newGroup')} className="p-2 text-neutral-400 hover:text-gold hover:bg-neutral-800 rounded-full transition-colors" title="New Group">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button onClick={logout} className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded-full transition-colors" title="Logout">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-neutral-800">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); if (showSidebar === 'users') fetchUsers(e.target.value) }}
            className="w-full px-4 py-2 bg-neutral-900 text-white rounded-lg border border-neutral-800 focus:outline-none focus:border-gold transition-colors"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {showSidebar === 'profile' && (
            <div className="p-4">
              <button onClick={() => setShowSidebar('chats')} className="text-gold mb-4 flex items-center gap-2 hover:text-gold-light transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <div className="text-center mb-6">
                <div className="w-28 h-28 bg-neutral-800 border-2 border-gold rounded-full mx-auto flex items-center justify-center text-white text-3xl font-bold mb-4">
                  {currentUser?.avatar ? (
                    <img src={`${API_URL}${currentUser.avatar}`} className="w-full h-full rounded-full object-cover" alt="" />
                  ) : currentUser?.name?.charAt(0).toUpperCase()}
                </div>
              </div>
              {editingProfile ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => setProfileData(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-2 bg-neutral-900 text-white rounded-lg border border-neutral-700 focus:border-gold focus:outline-none"
                    placeholder="Name"
                  />
                  <textarea
                    value={profileData.about}
                    onChange={(e) => setProfileData(p => ({ ...p, about: e.target.value }))}
                    className="w-full px-4 py-2 bg-neutral-900 text-white rounded-lg border border-neutral-700 focus:border-gold focus:outline-none resize-none"
                    placeholder="About"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button onClick={updateProfile} className="flex-1 py-2 bg-gold text-black rounded-lg font-medium hover:bg-gold-light transition-colors">Save</button>
                    <button onClick={() => setEditingProfile(false)} className="flex-1 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
                    <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">Name</p>
                    <p className="text-white">{currentUser?.name}</p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
                    <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">About</p>
                    <p className="text-white">{currentUser?.about}</p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
                    <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">Email</p>
                    <p className="text-white">{currentUser?.email}</p>
                  </div>
                  <button onClick={() => setEditingProfile(true)} className="w-full py-2 bg-gold text-black rounded-lg font-medium hover:bg-gold-light transition-colors">Edit Profile</button>
                </div>
              )}
            </div>
          )}

          {showSidebar === 'users' && (
            <div>
              <div className="px-4 py-3 text-neutral-400 text-sm flex items-center gap-2 border-b border-neutral-800">
                <button onClick={() => setShowSidebar('chats')} className="text-gold hover:text-gold-light transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                Start new chat
              </div>
              {users.map(user => (
                <div
                  key={user._id}
                  onClick={() => startNewChat(user)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-900 cursor-pointer border-b border-neutral-800/50 transition-colors"
                >
                  <div className="relative">
                    <div className="w-12 h-12 bg-neutral-800 border border-neutral-700 rounded-full flex items-center justify-center text-white font-bold">
                      {user.avatar ? (
                        <img src={`${API_URL}${user.avatar}`} className="w-full h-full rounded-full object-cover" alt="" />
                      ) : user.name?.charAt(0).toUpperCase()}
                    </div>
                    {user.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-gold rounded-full border-2 border-neutral-950"></div>}
                  </div>
                  <div>
                    <p className="text-white font-medium">{user.name}</p>
                    <p className="text-neutral-500 text-sm">{user.about || user.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showSidebar === 'newGroup' && (
            <div className="p-4">
             us <button onClick={() => { setShowSidebar('chats'); setSelectedUsers([]) }} className="text-gold mb-4 flex items-center gap-2 hover:text-gold-light transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <input
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-4 py-2 bg-neutral-900 text-white rounded-lg border border-neutral-700 focus:border-gold focus:outline-none mb-4"
              />
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedUsers.map(u => (
                    <span key={u._id} className="bg-gold/20 text-gold border border-gold/30 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                      {u.name}
                      <button onClick={() => setSelectedUsers(prev => prev.filter(x => x._id !== u._id))} className="hover:text-white">×</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-neutral-500 text-sm mb-2">Select participants:</p>
              {users.map(user => (
                <div
                  key={user._id}
                  onClick={() => setSelectedUsers(prev => 
                    prev.find(u => u._id === user._id) 
                      ? prev.filter(u => u._id !== user._id)
                      : [...prev, user]
                  )}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg mb-1 transition-colors ${
                    selectedUsers.find(u => u._id === user._id) ? 'bg-gold/10 border border-gold/30' : 'hover:bg-neutral-900 border border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 bg-neutral-800 border border-neutral-700 rounded-full flex items-center justify-center text-white">
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-white flex-1">{user.name}</p>
                  {selectedUsers.find(u => u._id === user._id) && (
                    <svg className="w-5 h-5 text-gold" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  )}
                </div>
              ))}
              {selectedUsers.length > 0 && groupName.trim() && (
                <button onClick={createGroup} className="w-full py-3 bg-gold text-black rounded-lg mt-4 font-semibold hover:bg-gold-light transition-colors">
                  Create Group ({selectedUsers.length} participants)
                </button>
              )}
            </div>
          )}

          {showSidebar === 'chats' && (
            conversations.filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase())).map(conv => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-neutral-800/50 transition-colors ${
                  selectedConv?.id === conv.id ? 'bg-neutral-900 border-l-2 border-l-gold' : 'hover:bg-neutral-900/50'
                }`}
              >
                <div className="relative">
                  <div className="w-12 h-12 bg-neutral-800 border border-neutral-700 rounded-full flex items-center justify-center text-white font-bold">
                    {conv.isGroup ? '👥' : conv.avatar ? (
                      <img src={`${API_URL}${conv.avatar}`} className="w-full h-full rounded-full object-cover" alt="" />
                    ) : conv.name?.charAt(0).toUpperCase()}
                  </div>
                  {!conv.isGroup && conv.online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-gold rounded-full border-2 border-neutral-950"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-white font-medium truncate">{conv.name}</p>
                    <span className="text-neutral-500 text-xs">{conv.lastMessage ? formatTime(conv.lastMessage.createdAt) : ''}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-neutral-500 text-sm truncate">
                      {typingUsers[conv.id] ? (
                        <span className="text-gold">typing...</span>
                      ) : conv.lastMessage?.text || 'No messages yet'}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="bg-gold text-black text-xs px-2 py-0.5 rounded-full font-medium">{conv.unreadCount}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>


      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-black">
        {selectedConv ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 bg-neutral-900 border-b border-neutral-800 flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-neutral-800 border border-neutral-700 rounded-full flex items-center justify-center text-white font-bold">
                  {selectedConv.isGroup ? '👥' : selectedConv.avatar ? (
                    <img src={`${API_URL}${selectedConv.avatar}`} className="w-full h-full rounded-full object-cover" alt="" />
                  ) : selectedConv.name?.charAt(0).toUpperCase()}
                </div>
                {!selectedConv.isGroup && selectedConv.online && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-gold rounded-full border-2 border-neutral-900"></div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">{selectedConv.name}</p>
                <p className="text-neutral-500 text-sm">
                  {typingUsers[selectedConv.id] ? (
                    <span className="text-gold">typing...</span>
                  ) : selectedConv.isGroup ? (
                    `${selectedConv.participants?.length || 0} participants`
                  ) : selectedConv.online ? (
                    <span className="text-gold">online</span>
                  ) : (
                    `last seen ${formatLastSeen(selectedConv.lastSeen)}`
                  )}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-neutral-950">
              {messages.map((msg, idx) => {
                const showDate = idx === 0 || new Date(messages[idx - 1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString()
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="text-center my-4">
                        <span className="bg-neutral-800 text-neutral-400 text-xs px-3 py-1 rounded-full">
                          {new Date(msg.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {msg.type === 'system' ? (
                      <div className="text-center">
                        <span className="bg-neutral-800/50 text-neutral-500 text-xs px-3 py-1 rounded-full">{msg.text}</span>
                      </div>
                    ) : (
                      <div className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`relative max-w-md rounded-lg px-3 py-2 ${
                            msg.isMine 
                              ? 'bg-neutral-800 border border-neutral-700' 
                              : 'bg-neutral-900 border border-neutral-800'
                          } ${msg.deleted ? 'opacity-60 italic' : ''}`}
                          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, message: msg }) }}
                        >
                          {msg.replyTo && (
                            <div className="bg-black/30 rounded px-2 py-1 mb-2 border-l-2 border-gold text-sm">
                              <p className="text-gold text-xs">{msg.replyTo.sender?.name}</p>
                              <p className="text-neutral-400 truncate">{msg.replyTo.text}</p>
                            </div>
                          )}
                          
                          {!msg.isMine && selectedConv.isGroup && (
                            <p className="text-gold text-xs font-medium mb-1">{msg.sender?.name}</p>
                          )}
                          
                          {msg.type === 'image' && msg.fileUrl && (
                            <img src={`${API_URL}${msg.fileUrl}`} alt="" className="max-w-full rounded mb-1 cursor-pointer" onClick={() => window.open(`${API_URL}${msg.fileUrl}`)} />
                          )}
                          {msg.type === 'video' && msg.fileUrl && (
                            <video src={`${API_URL}${msg.fileUrl}`} controls className="max-w-full rounded mb-1" />
                          )}
                          {msg.type === 'audio' && msg.fileUrl && (
                            <audio src={`${API_URL}${msg.fileUrl}`} controls className="mb-1" />
                          )}
                          {msg.type === 'file' && msg.fileUrl && (
                            <a href={`${API_URL}${msg.fileUrl}`} download={msg.fileName} className="flex items-center gap-2 bg-black/30 rounded p-2 mb-1 hover:bg-black/50 transition-colors">
                              <svg className="w-8 h-8 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                              <div>
                                <p className="text-white text-sm truncate max-w-[200px]">{msg.fileName}</p>
                                <p className="text-neutral-500 text-xs">{(msg.fileSize / 1024).toFixed(1)} KB</p>
                              </div>
                            </a>
                          )}
                          
                          <p className="text-white whitespace-pre-wrap break-words">{msg.text}</p>
                          
                          {msg.reactions?.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {msg.reactions.map((r, i) => (
                                <span key={i} className="bg-black/30 rounded-full px-1.5 py-0.5 text-xs">{r.emoji}</span>
                              ))}
                            </div>
                          )}
                          
                          <div className="flex items-center justify-end gap-1 mt-1">
                            {msg.edited && <span className="text-neutral-500 text-xs">edited</span>}
                            <span className="text-neutral-500 text-xs">{formatTime(msg.createdAt)}</span>
                            {msg.isMine && !msg.deleted && (
                              <span className="text-xs">
                                {msg.readBy?.length > 0 ? (
                                  <span className="text-gold">✓✓</span>
                                ) : msg.deliveredTo?.length > 0 ? (
                                  <span className="text-neutral-400">✓✓</span>
                                ) : (
                                  <span className="text-neutral-600">✓</span>
                                )}
                              </span>
                            )}
                          </div>
                          
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id) }}
                            className="absolute -bottom-2 -right-2 bg-neutral-700 rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-neutral-600 text-sm"
                          >
                            😊
                          </button>
                          
                          {showEmojiPicker === msg.id && (
                            <div className="absolute bottom-full right-0 mb-1 bg-neutral-800 border border-neutral-700 rounded-lg p-2 flex gap-1 shadow-lg" onClick={e => e.stopPropagation()}>
                              {emojis.map(emoji => (
                                <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="hover:scale-125 transition-transform text-lg">
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Context Menu */}
            {contextMenu && (
              <div
                className="fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-2 z-50"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onClick={e => e.stopPropagation()}
              >
                <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null) }} className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 transition-colors">
                  <svg className="w-4 h-4 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                  Reply
                </button>
                <button onClick={() => { navigator.clipboard.writeText(contextMenu.message.text); setContextMenu(null) }} className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 transition-colors">
                  <svg className="w-4 h-4 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Copy
                </button>
                {contextMenu.message.isMine && !contextMenu.message.deleted && (
                  <>
                    <button onClick={() => deleteMessage(contextMenu.message.id, false)} className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 transition-colors">
                      <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete for me
                    </button>
                    <button onClick={() => deleteMessage(contextMenu.message.id, true)} className="w-full px-4 py-2 text-left text-red-400 hover:bg-neutral-700 flex items-center gap-2 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete for everyone
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Reply Preview */}
            {replyTo && (
              <div className="px-4 py-2 bg-neutral-900 border-t border-neutral-800 flex items-center gap-3">
                <div className="flex-1 border-l-2 border-gold pl-3">
                  <p className="text-gold text-sm">{replyTo.isMine ? 'You' : replyTo.sender?.name}</p>
                  <p className="text-neutral-400 text-sm truncate">{replyTo.text}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-neutral-500 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 bg-neutral-900 border-t border-neutral-800">
              <form onSubmit={sendMessage} className="flex items-center gap-3">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-neutral-500 hover:text-gold p-2 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                </button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => { setNewMessage(e.target.value); handleTyping() }}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 bg-black text-white rounded-full border border-neutral-800 focus:outline-none focus:border-gold transition-colors"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="bg-gold text-black p-3 rounded-full hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-neutral-950">
            <div className="text-center">
              <div className="text-6xl mb-6">💬</div>
              <h2 className="text-2xl text-white font-light mb-2">Kaltech <span className="text-gold">Chat</span></h2>
              <p className="text-neutral-500">Select a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
