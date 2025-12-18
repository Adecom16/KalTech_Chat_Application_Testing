import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useTheme } from '../context/ThemeContext'

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
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingIntervalRef = useRef(null)
  const socketRef = useRef(null)
  const navigate = useNavigate()
  const { darkMode, toggleTheme } = useTheme()

  const getToken = () => localStorage.getItem('kaltech_token')
  const getHeaders = () => ({
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json'
  })

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { headers: getHeaders() })
      if (res.ok) {
        const user = await res.json()
        setCurrentUser(user)
        setProfileData({ name: user.name, about: user.about })
        localStorage.setItem('kaltech_user', JSON.stringify(user))
        return user
      } else {
        navigate('/')
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
      navigate('/')
    }
    return null
  }, [navigate])

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async (search = '') => {
    try {
      const res = await fetch(`${API_URL}/api/users?search=${search}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    }
  }, [])

  const fetchMessages = useCallback(async (convId) => {
    try {
      const res = await fetch(`${API_URL}/api/conversations/${convId}/messages`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
        localStorage.setItem(`messages_${convId}`, JSON.stringify(data))
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    }
  }, [])

  const initSocket = useCallback((userId) => {
    if (socketRef.current?.connected) return socketRef.current

    const newSocket = io(API_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })

    newSocket.on('connect', () => {
      console.log('✅ Socket connected:', newSocket.id)
      newSocket.emit('user_online', userId)
    })

    newSocket.on('disconnect', () => {
      console.log('❌ Socket disconnected')
    })

    newSocket.on('reconnect', () => {
      console.log('🔄 Socket reconnected')
      newSocket.emit('user_online', userId)
    })

    socketRef.current = newSocket
    setSocket(newSocket)
    return newSocket
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) { navigate('/'); return }

    const init = async () => {
      const cachedUser = localStorage.getItem('kaltech_user')
      if (cachedUser) {
        const user = JSON.parse(cachedUser)
        setCurrentUser(user)
        setProfileData({ name: user.name, about: user.about })
        initSocket(user.id)
      }

      const user = await fetchCurrentUser()
      if (user) {
        initSocket(user.id)
        const cachedConvId = localStorage.getItem('selectedConvId')
        if (cachedConvId) {
          const cachedMessages = localStorage.getItem(`messages_${cachedConvId}`)
          if (cachedMessages) {
            setMessages(JSON.parse(cachedMessages))
          }
        }
      }
      
      await fetchConversations()
      await fetchUsers()
    }

    init()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [navigate, fetchCurrentUser, fetchConversations, fetchUsers, initSocket])

  useEffect(() => {
    const cachedConvId = localStorage.getItem('selectedConvId')
    if (cachedConvId && conversations.length > 0 && !selectedConv) {
      const conv = conversations.find(c => c.id === cachedConvId)
      if (conv) {
        setSelectedConv(conv)
        fetchMessages(conv.id)
      }
    }
  }, [conversations, selectedConv, fetchMessages])

  useEffect(() => {
    const sock = socketRef.current
    if (!sock || !currentUser) return

    const handleOnlineUsers = (userIds) => setOnlineUserIds(new Set(userIds))
    const handleUserStatus = ({ userId, online, lastSeen }) => {
      setOnlineUserIds(prev => {
        const newSet = new Set(prev)
        online ? newSet.add(userId) : newSet.delete(userId)
        return newSet
      })
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, online, lastSeen } : u))
      setConversations(prev => prev.map(c => c.participantId === userId ? { ...c, online, lastSeen } : c))
      if (selectedConv?.participantId === userId) {
        setSelectedConv(prev => prev ? { ...prev, online, lastSeen } : null)
      }
    }
    const handleNewMessage = (message) => {
      if (selectedConv?.id === message.conversationId) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev
          const updated = [...prev, message]
          localStorage.setItem(`messages_${message.conversationId}`, JSON.stringify(updated))
          return updated
        })
        sock.emit('message_seen', { conversationId: message.conversationId, messageIds: [message.id] })
      }
      fetchConversations()
    }
    const handleTyping = ({ conversationId, userName, isTyping }) => {
      setTypingUsers(prev => ({ ...prev, [conversationId]: isTyping ? userName : null }))
    }
    const handleMessagesRead = ({ conversationId, messageIds }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => 
          m.isMine && (!messageIds || messageIds.includes(m.id)) 
            ? { ...m, status: 'read', readBy: [...(m.readBy || []), { user: 'read' }] } 
            : m
        ))
      }
    }
    const handleMessageDeleted = ({ messageId, conversationId }) => {
      if (selectedConv?.id === conversationId) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true, text: 'This message was deleted', fileUrl: '' } : m))
      }
    }

    sock.on('online_users', handleOnlineUsers)
    sock.on('user_status', handleUserStatus)
    sock.on('new_message', handleNewMessage)
    sock.on('user_typing', handleTyping)
    sock.on('messages_read', handleMessagesRead)
    sock.on('message_deleted', handleMessageDeleted)

    return () => {
      sock.off('online_users', handleOnlineUsers)
      sock.off('user_status', handleUserStatus)
      sock.off('new_message', handleNewMessage)
      sock.off('user_typing', handleTyping)
      sock.off('messages_read', handleMessagesRead)
      sock.off('message_deleted', handleMessageDeleted)
    }
  }, [socket, currentUser, selectedConv, fetchConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isUserOnline = (userId) => onlineUserIds.has(userId)

  const selectConversation = (conv) => {
    setSelectedConv(conv)
    setReplyTo(null)
    localStorage.setItem('selectedConvId', conv.id)
    const cached = localStorage.getItem(`messages_${conv.id}`)
    if (cached) setMessages(JSON.parse(cached))
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
      if (res.ok) {
        const conv = await res.json()
        setSelectedConv({ ...conv, online: isUserOnline(user._id) })
        setMessages([])
        localStorage.setItem('selectedConvId', conv.id)
        fetchConversations()
        setShowSidebar('chats')
      }
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
      if (res.ok) {
        const conv = await res.json()
        setSelectedConv(conv)
        setMessages([])
        fetchConversations()
        setShowSidebar('chats')
        setGroupName('')
        setSelectedUsers([])
      }
    } catch (err) {
      console.error('Failed to create group:', err)
    }
  }

  const handleTyping = () => {
    if (!selectedConv || !socketRef.current) return
    socketRef.current.emit('typing', { conversationId: selectedConv.id, isTyping: true, userName: currentUser?.name })
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('typing', { conversationId: selectedConv.id, isTyping: false })
    }, 2000)
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConv || sending) return

    const tempId = `temp_${Date.now()}`
    const optimisticMessage = {
      id: tempId,
      text: newMessage.trim(),
      type: 'text',
      sender: { _id: currentUser.id, name: currentUser.name },
      createdAt: new Date().toISOString(),
      isMine: true,
      status: 'sending',
      replyTo: replyTo
    }

    setMessages(prev => [...prev, optimisticMessage])
    setNewMessage('')
    setReplyTo(null)
    setSending(true)

    try {
      const res = await fetch(`${API_URL}/api/conversations/${selectedConv.id}/messages`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ text: optimisticMessage.text, replyTo: replyTo?.id })
      })
      
      if (res.ok) {
        const message = await res.json()
        setMessages(prev => prev.map(m => m.id === tempId ? { ...message, status: 'sent' } : m))
        fetchConversations()
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m))
      }
    } catch (err) {
      console.error('Failed to send message:', err)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m))
    } finally {
      setSending(false)
      socketRef.current?.emit('typing', { conversationId: selectedConv.id, isTyping: false })
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
      if (res.ok) {
        const message = await res.json()
        setMessages(prev => [...prev, { ...message, status: 'sent' }])
        fetchConversations()
      }
    } catch (err) {
      console.error('Failed to upload file:', err)
    }
    e.target.value = ''
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data)
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      recordingIntervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000)
    } catch (err) {
      console.error('Failed to start recording:', err)
      alert('Could not access microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      clearInterval(recordingIntervalRef.current)
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) mediaRecorderRef.current.stop()
    setIsRecording(false)
    setAudioBlob(null)
    setRecordingTime(0)
    clearInterval(recordingIntervalRef.current)
  }

  const sendVoiceNote = async () => {
    if (!audioBlob || !selectedConv) return

    const formData = new FormData()
    formData.append('file', audioBlob, `voice_${Date.now()}.webm`)

    try {
      const res = await fetch(`${API_URL}/api/conversations/${selectedConv.id}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
      })
      if (res.ok) {
        const message = await res.json()
        setMessages(prev => [...prev, { ...message, status: 'sent' }])
        fetchConversations()
      }
    } catch (err) {
      console.error('Failed to send voice note:', err)
    }
    setAudioBlob(null)
    setRecordingTime(0)
  }

  const deleteMessage = async (messageId, forEveryone = false) => {
    try {
      await fetch(`${API_URL}/api/messages/${messageId}?forEveryone=${forEveryone}`, {
        method: 'DELETE',
        headers: getHeaders()
      })
      if (forEveryone) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deleted: true, text: 'This message was deleted', fileUrl: '' } : m))
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
      const res = await fetch(`${API_URL}/api/users/profile`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(profileData)
      })
      if (res.ok) {
        setCurrentUser(prev => ({ ...prev, ...profileData }))
        localStorage.setItem('kaltech_user', JSON.stringify({ ...currentUser, ...profileData }))
        setEditingProfile(false)
      }
    } catch (err) {
      console.error('Failed to update profile:', err)
    }
  }

  const logout = () => {
    localStorage.removeItem('kaltech_token')
    localStorage.removeItem('kaltech_user')
    localStorage.removeItem('selectedConvId')
    socketRef.current?.disconnect()
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
  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏']

  const MessageStatus = ({ message }) => {
    if (!message.isMine) return null
    const status = message.status || (message.readBy?.length > 0 ? 'read' : message.deliveredTo?.length > 0 ? 'delivered' : 'sent')
    return (
      <span className="ml-1">
        {status === 'sending' && <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>○</span>}
        {status === 'sent' && <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>✓</span>}
        {status === 'delivered' && <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>✓✓</span>}
        {status === 'read' && <span className="text-katech-gold">✓✓</span>}
        {status === 'failed' && <span className="text-red-500">!</span>}
      </span>
    )
  }

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-katech-black' : 'bg-katech-white'}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-katech-gold border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className={`text-lg font-medium ${darkMode ? 'text-katech-white' : 'text-katech-black'}`}>Loading Katech Chat...</p>
        </div>
      </div>
    )
  }


  return (
    <div className={`h-screen flex ${darkMode ? 'bg-katech-black' : 'bg-katech-light-surface'}`} onClick={() => { setContextMenu(null); setShowEmojiPicker(null) }}>
      {/* Sidebar */}
      <div className={`w-96 flex flex-col border-r shadow-lg ${darkMode ? 'bg-katech-dark-surface border-katech-dark-border' : 'bg-katech-white border-katech-light-border'}`}>
        {/* Header */}
        <div className="p-4 bg-katech-black flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowSidebar('profile')}>
            <div className="relative">
              <div className="w-10 h-10 bg-katech-gold/20 rounded-full flex items-center justify-center text-katech-gold font-bold overflow-hidden border border-katech-gold/30">
                {currentUser?.avatar ? <img src={`${API_URL}${currentUser.avatar}`} className="w-full h-full object-cover" alt="" /> : currentUser?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-katech-black"></div>
            </div>
            <span className="text-katech-white font-medium">{currentUser?.name}</span>
          </div>
          <div className="flex gap-1">
            <button onClick={toggleTheme} className="p-2 text-katech-gold/80 hover:text-katech-gold hover:bg-katech-gold/10 rounded-full transition-colors" title="Toggle Theme">
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            <button onClick={() => setShowSidebar('users')} className="p-2 text-katech-gold/80 hover:text-katech-gold hover:bg-katech-gold/10 rounded-full transition-colors" title="New Chat">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            <button onClick={() => setShowSidebar('newGroup')} className="p-2 text-katech-gold/80 hover:text-katech-gold hover:bg-katech-gold/10 rounded-full transition-colors" title="New Group">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button onClick={logout} className="p-2 text-katech-gold/80 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors" title="Logout">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className={`px-4 py-3 ${darkMode ? 'bg-katech-black/50' : 'bg-katech-light-surface'}`}>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); if (showSidebar === 'users') fetchUsers(e.target.value) }}
            className={`w-full px-4 py-2 rounded-full focus:outline-none focus:ring-2 focus:ring-katech-gold/50 focus:border-katech-gold transition-colors ${darkMode ? 'bg-katech-dark-surface border-katech-dark-border text-katech-white placeholder-katech-dark-muted' : 'bg-katech-white border-katech-light-border text-katech-black placeholder-katech-light-muted'} border`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {showSidebar === 'profile' && (
            <div className="p-4">
              <button onClick={() => setShowSidebar('chats')} className="text-katech-gold mb-4 flex items-center gap-2 hover:text-katech-gold-light font-medium">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <div className="text-center mb-6">
                <div className="w-28 h-28 bg-katech-gold/20 rounded-full mx-auto flex items-center justify-center text-katech-gold text-3xl font-bold overflow-hidden shadow-lg border-2 border-katech-gold/30">
                  {currentUser?.avatar ? <img src={`${API_URL}${currentUser.avatar}`} className="w-full h-full object-cover" alt="" /> : currentUser?.name?.charAt(0).toUpperCase()}
                </div>
              </div>
              {editingProfile ? (
                <div className="space-y-4">
                  <input type="text" value={profileData.name} onChange={(e) => setProfileData(p => ({ ...p, name: e.target.value }))} className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-katech-gold/50 ${darkMode ? 'bg-katech-black border-katech-dark-border text-katech-white' : 'bg-katech-light-surface border-katech-light-border text-katech-black'} border`} placeholder="Name" />
                  <textarea value={profileData.about} onChange={(e) => setProfileData(p => ({ ...p, about: e.target.value }))} className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-katech-gold/50 resize-none ${darkMode ? 'bg-katech-black border-katech-dark-border text-katech-white' : 'bg-katech-light-surface border-katech-light-border text-katech-black'} border`} placeholder="About" rows={3} />
                  <div className="flex gap-2">
                    <button onClick={updateProfile} className="flex-1 py-2 bg-katech-gold text-katech-black rounded-lg font-medium hover:bg-katech-gold-dark hover:shadow-lg transition-all">Save</button>
                    <button onClick={() => setEditingProfile(false)} className={`flex-1 py-2 rounded-lg font-medium ${darkMode ? 'bg-katech-dark-border text-katech-white hover:bg-katech-dark-muted' : 'bg-katech-light-border text-katech-black hover:bg-gray-300'}`}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-katech-black' : 'bg-katech-light-surface'}`}><p className={`text-sm ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>Name</p><p className={`font-medium ${darkMode ? 'text-katech-white' : 'text-katech-black'}`}>{currentUser?.name}</p></div>
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-katech-black' : 'bg-katech-light-surface'}`}><p className={`text-sm ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>About</p><p className={darkMode ? 'text-katech-white' : 'text-katech-black'}>{currentUser?.about}</p></div>
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-katech-black' : 'bg-katech-light-surface'}`}><p className={`text-sm ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>Email</p><p className={darkMode ? 'text-katech-white' : 'text-katech-black'}>{currentUser?.email}</p></div>
                  <button onClick={() => setEditingProfile(true)} className="w-full py-3 bg-katech-gold text-katech-black rounded-lg font-medium hover:bg-katech-gold-dark hover:shadow-lg transition-all">Edit Profile</button>
                </div>
              )}
            </div>
          )}

          {showSidebar === 'users' && (
            <div>
              <div className={`px-4 py-3 text-sm flex items-center gap-2 border-b ${darkMode ? 'text-katech-dark-muted border-katech-dark-border' : 'text-katech-light-muted border-katech-light-border'}`}>
                <button onClick={() => setShowSidebar('chats')} className="text-katech-gold hover:text-katech-gold-light">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                Start new chat
              </div>
              {users.map(user => (
                <div key={user._id} onClick={() => startNewChat(user)} className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b transition-colors ${darkMode ? 'hover:bg-katech-black border-katech-dark-border' : 'hover:bg-katech-light-surface border-katech-light-border'}`}>
                  <div className="relative">
                    <div className="w-12 h-12 bg-katech-gold/20 rounded-full flex items-center justify-center text-katech-gold font-bold overflow-hidden border border-katech-gold/30">
                      {user.avatar ? <img src={`${API_URL}${user.avatar}`} className="w-full h-full object-cover" alt="" /> : user.name?.charAt(0).toUpperCase()}
                    </div>
                    {isUserOnline(user._id) && <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 ${darkMode ? 'border-katech-dark-surface' : 'border-katech-white'}`}></div>}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${darkMode ? 'text-katech-white' : 'text-katech-black'}`}>{user.name}</p>
                    <p className="text-sm">{isUserOnline(user._id) ? <span className="text-green-500 font-medium">online</span> : <span className={darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}>{user.about || user.email}</span>}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showSidebar === 'newGroup' && (
            <div className="p-4">
              <button onClick={() => { setShowSidebar('chats'); setSelectedUsers([]) }} className="text-katech-gold mb-4 flex items-center gap-2 hover:text-katech-gold-light font-medium">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <input type="text" placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-katech-gold/50 mb-4 ${darkMode ? 'bg-katech-black border-katech-dark-border text-katech-white placeholder-katech-dark-muted' : 'bg-katech-light-surface border-katech-light-border text-katech-black placeholder-katech-light-muted'} border`} />
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedUsers.map(u => (
                    <span key={u._id} className="bg-katech-gold text-katech-black px-3 py-1 rounded-full text-sm flex items-center gap-1">
                      {u.name}
                      <button onClick={() => setSelectedUsers(prev => prev.filter(x => x._id !== u._id))} className="hover:text-red-600 ml-1">×</button>
                    </span>
                  ))}
                </div>
              )}
              <p className={`text-sm mb-2 ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>Select participants:</p>
              {users.map(user => (
                <div key={user._id} onClick={() => setSelectedUsers(prev => prev.find(u => u._id === user._id) ? prev.filter(u => u._id !== user._id) : [...prev, user])} className={`flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg mb-1 transition-colors ${selectedUsers.find(u => u._id === user._id) ? 'bg-katech-gold/10 border border-katech-gold/30' : darkMode ? 'hover:bg-katech-black' : 'hover:bg-katech-light-surface'}`}>
                  <div className="w-10 h-10 bg-katech-gold/20 rounded-full flex items-center justify-center text-katech-gold font-medium border border-katech-gold/30">{user.name?.charAt(0).toUpperCase()}</div>
                  <p className={`flex-1 ${darkMode ? 'text-katech-white' : 'text-katech-black'}`}>{user.name}</p>
                  {selectedUsers.find(u => u._id === user._id) && <svg className="w-5 h-5 text-katech-gold" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                </div>
              ))}
              {selectedUsers.length > 0 && groupName.trim() && (
                <button onClick={createGroup} className="w-full py-3 bg-katech-gold text-katech-black rounded-lg mt-4 font-medium hover:bg-katech-gold-dark hover:shadow-lg transition-all">Create Group ({selectedUsers.length})</button>
              )}
            </div>
          )}

          {showSidebar === 'chats' && (
            conversations.filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase())).map(conv => (
              <div key={conv.id} onClick={() => selectConversation(conv)} className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b transition-colors ${selectedConv?.id === conv.id ? 'bg-katech-gold/10' : darkMode ? 'hover:bg-katech-black border-katech-dark-border' : 'hover:bg-katech-light-surface border-katech-light-border'}`}>
                <div className="relative">
                  <div className="w-12 h-12 bg-katech-gold/20 rounded-full flex items-center justify-center text-katech-gold font-bold overflow-hidden border border-katech-gold/30">
                    {conv.isGroup ? '👥' : conv.avatar ? <img src={`${API_URL}${conv.avatar}`} className="w-full h-full object-cover" alt="" /> : conv.name?.charAt(0).toUpperCase()}
                  </div>
                  {!conv.isGroup && (isUserOnline(conv.participantId) || conv.online) && (
                    <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 ${darkMode ? 'border-katech-dark-surface' : 'border-katech-white'}`}></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className={`font-medium truncate ${darkMode ? 'text-katech-white' : 'text-katech-black'}`}>{conv.name}</p>
                    <span className={`text-xs ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>{conv.lastMessage ? formatTime(conv.lastMessage.createdAt) : ''}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm truncate">
                      {typingUsers[conv.id] ? (
                        <span className="text-katech-gold italic font-medium">typing...</span>
                      ) : (
                        <span className={darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}>{conv.lastMessage?.text || 'No messages yet'}</span>
                      )}
                    </p>
                    {conv.unreadCount > 0 && <span className="bg-katech-gold text-katech-black text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center font-medium">{conv.unreadCount}</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>


      {/* Chat Area */}
      <div className={`flex-1 flex flex-col ${darkMode ? 'bg-katech-dark-surface' : 'bg-katech-white'}`}>
        {selectedConv ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 bg-katech-black flex items-center gap-3 shadow-md">
              <div className="relative">
                <div className="w-10 h-10 bg-katech-gold/20 rounded-full flex items-center justify-center text-katech-gold font-bold overflow-hidden border border-katech-gold/30">
                  {selectedConv.isGroup ? '👥' : selectedConv.avatar ? <img src={`${API_URL}${selectedConv.avatar}`} className="w-full h-full object-cover" alt="" /> : selectedConv.name?.charAt(0).toUpperCase()}
                </div>
                {!selectedConv.isGroup && (isUserOnline(selectedConv.participantId) || selectedConv.online) && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-katech-black"></div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-katech-white font-medium">{selectedConv.name}</p>
                <p className="text-sm">
                  {typingUsers[selectedConv.id] ? (
                    <span className="text-katech-gold italic">typing...</span>
                  ) : selectedConv.isGroup ? (
                    <span className="text-katech-dark-muted">{selectedConv.participants?.length || 0} participants</span>
                  ) : (isUserOnline(selectedConv.participantId) || selectedConv.online) ? (
                    <span className="text-green-400 font-medium">online</span>
                  ) : (
                    <span className="text-katech-dark-muted">last seen {formatLastSeen(selectedConv.lastSeen)}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-2 ${darkMode ? 'bg-katech-black' : 'bg-katech-light-surface'}`}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className={`text-center ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>
                    <div className="text-6xl mb-4">💬</div>
                    <p className="font-medium">No messages yet</p>
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
                          <span className={`text-xs px-3 py-1 rounded-full font-medium ${darkMode ? 'bg-katech-dark-surface text-katech-dark-muted' : 'bg-katech-light-border text-katech-light-muted'}`}>{new Date(msg.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                      {msg.type === 'system' ? (
                        <div className="text-center my-2">
                          <span className={`text-xs px-3 py-1 rounded-full ${darkMode ? 'bg-katech-dark-surface text-katech-dark-muted' : 'bg-katech-light-border text-katech-light-muted'}`}>{msg.text}</span>
                        </div>
                      ) : (
                        <div className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`relative max-w-md rounded-2xl px-4 py-2 group shadow-sm ${
                              msg.isMine 
                                ? 'bg-katech-gold text-katech-black rounded-br-md' 
                                : darkMode 
                                  ? 'bg-katech-dark-surface text-katech-white border border-katech-dark-border rounded-bl-md' 
                                  : 'bg-katech-white text-katech-black border border-katech-light-border rounded-bl-md'
                            } ${msg.deleted ? 'opacity-60 italic' : ''} ${msg.status === 'failed' ? 'border-2 border-red-400' : ''}`}
                            onContextMenu={(e) => { e.preventDefault(); if (!msg.deleted) setContextMenu({ x: e.clientX, y: e.clientY, message: msg }) }}
                          >
                            {msg.replyTo && (
                              <div className={`rounded px-2 py-1 mb-2 border-l-2 text-sm ${msg.isMine ? 'bg-katech-black/10 border-katech-black/50' : darkMode ? 'bg-katech-black border-katech-gold' : 'bg-katech-light-surface border-katech-gold'}`}>
                                <p className={`text-xs font-medium ${msg.isMine ? 'text-katech-black/80' : 'text-katech-gold'}`}>{msg.replyTo.sender?.name || 'Unknown'}</p>
                                <p className={`truncate text-xs ${msg.isMine ? 'text-katech-black/70' : darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>{msg.replyTo.text}</p>
                              </div>
                            )}
                            
                            {!msg.isMine && selectedConv.isGroup && !msg.deleted && (
                              <p className="text-katech-gold text-xs font-medium mb-1">{msg.sender?.name}</p>
                            )}
                            
                            {!msg.deleted && msg.type === 'image' && msg.fileUrl && (
                              <img src={`${API_URL}${msg.fileUrl}`} alt="" className="max-w-full rounded-lg mb-2 cursor-pointer max-h-64 object-cover" onClick={() => window.open(`${API_URL}${msg.fileUrl}`)} />
                            )}
                            {!msg.deleted && msg.type === 'video' && msg.fileUrl && (
                              <video src={`${API_URL}${msg.fileUrl}`} controls className="max-w-full rounded-lg mb-2 max-h-64" />
                            )}
                            {!msg.deleted && msg.type === 'audio' && msg.fileUrl && (
                              <div className={`flex items-center gap-2 p-3 rounded-xl min-w-[250px] ${msg.isMine ? 'bg-katech-black/15' : darkMode ? 'bg-katech-dark-surface' : 'bg-katech-light-surface'}`}>
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${msg.isMine ? 'bg-katech-black/20' : 'bg-katech-gold/20'}`}>
                                  <svg className={`w-5 h-5 ${msg.isMine ? 'text-katech-black' : 'text-katech-gold'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                                </div>
                                <audio src={`${API_URL}${msg.fileUrl}`} controls className="flex-1 h-10 max-w-[200px]" />
                              </div>
                            )}
                            {!msg.deleted && msg.type === 'file' && msg.fileUrl && (
                              <a href={`${API_URL}${msg.fileUrl}`} download={msg.fileName} className={`flex items-center gap-2 p-2 rounded-lg mb-2 ${msg.isMine ? 'bg-katech-black/10 hover:bg-katech-black/20' : darkMode ? 'bg-katech-black hover:bg-katech-black/80' : 'bg-katech-light-surface hover:bg-katech-light-border'}`}>
                                <svg className={`w-8 h-8 ${msg.isMine ? 'text-katech-black/80' : darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                <div>
                                  <p className={`text-sm truncate max-w-[180px] ${msg.isMine ? 'text-katech-black' : darkMode ? 'text-katech-white' : 'text-katech-black'}`}>{msg.fileName}</p>
                                  <p className={`text-xs ${msg.isMine ? 'text-katech-black/70' : darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>{(msg.fileSize / 1024).toFixed(1)} KB</p>
                                </div>
                              </a>
                            )}
                            
                            {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                            
                            {msg.reactions?.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {msg.reactions.map((r, i) => (
                                  <span key={i} className={`rounded-full px-1.5 py-0.5 text-xs cursor-pointer ${msg.isMine ? 'bg-katech-black/20' : darkMode ? 'bg-katech-black' : 'bg-katech-light-surface'}`}>{r.emoji}</span>
                                ))}
                              </div>
                            )}
                            
                            <div className={`flex items-center justify-end gap-1 mt-1 text-xs ${msg.isMine ? 'text-katech-black/70' : darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>
                              {msg.edited && <span className="italic">edited</span>}
                              <span>{formatTime(msg.createdAt)}</span>
                              <MessageStatus message={msg} />
                            </div>
                            
                            {!msg.deleted && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id) }}
                                className={`absolute -bottom-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow ${msg.isMine ? darkMode ? 'bg-katech-dark-surface text-katech-gold' : 'bg-katech-white text-katech-gold' : 'bg-katech-gold text-katech-black'}`}
                              >
                                😊
                              </button>
                            )}
                            
                            {showEmojiPicker === msg.id && (
                              <div className={`absolute bottom-full right-0 mb-2 rounded-lg p-2 flex gap-1 shadow-xl z-10 border ${darkMode ? 'bg-katech-dark-surface border-katech-dark-border' : 'bg-katech-white border-katech-light-border'}`} onClick={e => e.stopPropagation()}>
                                {emojis.map(emoji => (
                                  <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className={`hover:scale-125 transition-transform text-lg p-1 rounded ${darkMode ? 'hover:bg-katech-black' : 'hover:bg-katech-light-surface'}`}>{emoji}</button>
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
              <div className={`fixed rounded-xl shadow-2xl py-2 z-50 min-w-[180px] border ${darkMode ? 'bg-katech-dark-surface border-katech-dark-border' : 'bg-katech-white border-katech-light-border'}`} style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
                <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null) }} className={`w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm ${darkMode ? 'text-katech-white hover:bg-katech-black' : 'text-katech-black hover:bg-katech-light-surface'}`}>
                  <svg className={`w-4 h-4 ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                  Reply
                </button>
                <button onClick={() => { navigator.clipboard.writeText(contextMenu.message.text); setContextMenu(null) }} className={`w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm ${darkMode ? 'text-katech-white hover:bg-katech-black' : 'text-katech-black hover:bg-katech-light-surface'}`}>
                  <svg className={`w-4 h-4 ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Copy
                </button>
                {contextMenu.message.isMine && (
                  <>
                    <hr className={`my-1 ${darkMode ? 'border-katech-dark-border' : 'border-katech-light-border'}`} />
                    <button onClick={() => deleteMessage(contextMenu.message.id, false)} className={`w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm ${darkMode ? 'text-katech-white hover:bg-katech-black' : 'text-katech-black hover:bg-katech-light-surface'}`}>
                      <svg className={`w-4 h-4 ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete for me
                    </button>
                    <button onClick={() => deleteMessage(contextMenu.message.id, true)} className="w-full px-4 py-2.5 text-left text-red-500 hover:bg-red-500/10 flex items-center gap-3 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete for everyone
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Reply Preview */}
            {replyTo && (
              <div className={`px-4 py-3 border-t flex items-center gap-3 ${darkMode ? 'bg-katech-dark-surface border-katech-dark-border' : 'bg-katech-light-surface border-katech-light-border'}`}>
                <div className="w-1 h-12 bg-katech-gold rounded-full"></div>
                <div className="flex-1">
                  <p className="text-katech-gold text-sm font-medium">{replyTo.isMine ? 'You' : replyTo.sender?.name}</p>
                  <p className={`text-sm truncate ${darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}`}>{replyTo.text || 'Media'}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className={`p-1 ${darkMode ? 'text-katech-dark-muted hover:text-katech-white' : 'text-katech-light-muted hover:text-katech-black'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}

            {/* Voice Recording UI */}
            {(isRecording || audioBlob) && (
              <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20 flex items-center gap-3">
                <div className="flex-1 flex items-center gap-3">
                  {isRecording ? (
                    <>
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-red-500 font-medium">Recording... {formatRecordingTime(recordingTime)}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 text-katech-gold" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                      <span className={darkMode ? 'text-katech-white' : 'text-katech-black'}>Voice note ready ({formatRecordingTime(recordingTime)})</span>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={cancelRecording} className={`p-2 rounded-full ${darkMode ? 'text-katech-dark-muted hover:text-red-500 hover:bg-red-500/10' : 'text-katech-light-muted hover:text-red-500 hover:bg-red-500/10'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  {isRecording ? (
                    <button onClick={stopRecording} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                    </button>
                  ) : (
                    <button onClick={sendVoiceNote} className="p-2 bg-katech-gold text-katech-black rounded-full hover:bg-katech-gold-dark">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Input */}
            {!isRecording && !audioBlob && (
              <div className={`px-4 py-3 border-t ${darkMode ? 'bg-katech-dark-surface border-katech-dark-border' : 'bg-katech-light-surface border-katech-light-border'}`}>
                <form onSubmit={sendMessage} className="flex items-center gap-3">
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className={`p-2 rounded-full transition-colors ${darkMode ? 'text-katech-dark-muted hover:text-katech-gold hover:bg-katech-gold/10' : 'text-katech-light-muted hover:text-katech-gold hover:bg-katech-gold/10'}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  </button>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => { setNewMessage(e.target.value); handleTyping() }}
                    placeholder="Type a message..."
                    className={`flex-1 px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-katech-gold/50 focus:border-katech-gold transition-colors ${darkMode ? 'bg-katech-black border-katech-dark-border text-katech-white placeholder-katech-dark-muted' : 'bg-katech-white border-katech-light-border text-katech-black placeholder-katech-light-muted'} border`}
                    disabled={sending}
                  />
                  {newMessage.trim() ? (
                    <button
                      type="submit"
                      disabled={sending}
                      className="bg-katech-gold text-katech-black p-3 rounded-full hover:bg-katech-gold-dark hover:shadow-lg disabled:opacity-50 transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="bg-katech-gold text-katech-black p-3 rounded-full hover:bg-katech-gold-dark hover:shadow-lg transition-all"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    </button>
                  )}
                </form>
              </div>
            )}
          </>
        ) : (
          <div className={`flex-1 flex items-center justify-center ${darkMode ? 'bg-katech-black' : 'bg-katech-light-surface'}`}>
            <div className="text-center">
              <div className="w-32 h-32 bg-katech-gold/20 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg border-2 border-katech-gold/30">
                <span className="text-5xl">💬</span>
              </div>
              <h2 className={`text-2xl font-medium mb-2 ${darkMode ? 'text-katech-white' : 'text-katech-black'}`}>Katech Chat</h2>
              <p className={darkMode ? 'text-katech-dark-muted' : 'text-katech-light-muted'}>Select a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
