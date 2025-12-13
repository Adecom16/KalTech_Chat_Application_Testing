import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

import User from './models/User.js'
import Conversation from './models/Conversation.js'
import Message from './models/Message.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
})

const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'kaltech-secret-key-2024'
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kaltech_chat'

app.use(cors())
app.use(express.json())

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
app.use('/uploads', express.static(uploadsDir))

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
})

// MongoDB Connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err))

// ============================================
// AUTH MIDDLEWARE
// ============================================
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token provided' })
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.id)
    if (!user) return res.status(401).json({ error: 'User not found' })
    req.user = user
    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// ============================================
// AUTH ROUTES
// ============================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    const user = new User({ name, email, password })
    await user.save()

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' })
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar, about: user.about }
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Failed to register' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await User.findOne({ email })
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' })
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar, about: user.about }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Failed to login' })
  }
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ 
    id: req.user._id, 
    name: req.user.name, 
    email: req.user.email, 
    avatar: req.user.avatar,
    about: req.user.about,
    online: req.user.online,
    lastSeen: req.user.lastSeen
  })
})

// ============================================
// USER ROUTES
// ============================================
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const { search } = req.query
    let query = { _id: { $ne: req.user._id } }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    }

    const users = await User.find(query)
      .select('name email avatar online lastSeen about')
      .sort({ name: 1 })
      .limit(50)
    
    res.json(users)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

app.put('/api/users/profile', authMiddleware, async (req, res) => {
  try {
    const { name, about } = req.body
    const updates = {}
    if (name) updates.name = name
    if (about !== undefined) updates.about = about

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true })
    res.json({ id: user._id, name: user.name, email: user.email, avatar: user.avatar, about: user.about })
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    
    const avatarUrl = `/uploads/${req.file.filename}`
    await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl })
    res.json({ avatar: avatarUrl })
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload avatar' })
  }
})

// ============================================
// CONVERSATION ROUTES
// ============================================
app.get('/api/conversations', authMiddleware, async (req, res) => {
  try {
    const { archived } = req.query
    let query = { participants: req.user._id }
    
    if (archived === 'true') {
      query.archivedBy = req.user._id
    } else {
      query.archivedBy = { $ne: req.user._id }
    }

    const conversations = await Conversation.find(query)
      .populate('participants', 'name email avatar online lastSeen')
      .populate('lastMessage')
      .populate('admins', 'name')
      .sort({ updatedAt: -1 })

    const result = await Promise.all(conversations.map(async (conv) => {
      const unreadCount = await Message.countDocuments({
        conversationId: conv._id,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id }
      })

      let displayData = {}
      if (conv.type === 'group') {
        displayData = {
          name: conv.groupName,
          avatar: conv.groupAvatar,
          isGroup: true
        }
      } else {
        const otherUser = conv.participants.find(p => p._id.toString() !== req.user._id.toString())
        displayData = {
          name: otherUser?.name || 'Unknown',
          avatar: otherUser?.avatar || '',
          online: otherUser?.online || false,
          lastSeen: otherUser?.lastSeen,
          participantId: otherUser?._id,
          isGroup: false
        }
      }

      return {
        id: conv._id,
        ...displayData,
        type: conv.type,
        participants: conv.participants,
        lastMessage: conv.lastMessage ? {
          text: conv.lastMessage.text,
          type: conv.lastMessage.type,
          sender: conv.lastMessage.sender,
          createdAt: conv.lastMessage.createdAt
        } : null,
        unreadCount,
        isMuted: conv.mutedBy.some(m => m.user.toString() === req.user._id.toString()),
        updatedAt: conv.updatedAt
      }
    }))

    res.json(result)
  } catch (error) {
    console.error('Get conversations error:', error)
    res.status(500).json({ error: 'Failed to fetch conversations' })
  }
})

app.post('/api/conversations', authMiddleware, async (req, res) => {
  try {
    const { participantId } = req.body
    if (!participantId) return res.status(400).json({ error: 'Participant ID required' })

    // Check existing conversation
    let conversation = await Conversation.findOne({
      type: 'private',
      participants: { $all: [req.user._id, participantId], $size: 2 }
    }).populate('participants', 'name email avatar online lastSeen')

    if (!conversation) {
      conversation = new Conversation({
        type: 'private',
        participants: [req.user._id, participantId]
      })
      await conversation.save()
      await conversation.populate('participants', 'name email avatar online lastSeen')
    }

    const otherUser = conversation.participants.find(p => p._id.toString() !== req.user._id.toString())
    res.json({
      id: conversation._id,
      name: otherUser?.name,
      avatar: otherUser?.avatar,
      online: otherUser?.online,
      lastSeen: otherUser?.lastSeen,
      participantId: otherUser?._id,
      type: 'private',
      isGroup: false
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to create conversation' })
  }
})

// Create group
app.post('/api/conversations/group', authMiddleware, async (req, res) => {
  try {
    const { name, participants, description } = req.body
    if (!name || !participants?.length) {
      return res.status(400).json({ error: 'Group name and participants required' })
    }

    const conversation = new Conversation({
      type: 'group',
      groupName: name,
      groupDescription: description || '',
      participants: [req.user._id, ...participants],
      admins: [req.user._id],
      createdBy: req.user._id
    })
    await conversation.save()

    // Create system message
    const systemMsg = new Message({
      conversationId: conversation._id,
      sender: req.user._id,
      text: `${req.user.name} created group "${name}"`,
      type: 'system'
    })
    await systemMsg.save()

    await conversation.populate('participants', 'name email avatar online')
    res.json({
      id: conversation._id,
      name: conversation.groupName,
      avatar: conversation.groupAvatar,
      type: 'group',
      isGroup: true,
      participants: conversation.participants
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to create group' })
  }
})

// Archive/Unarchive conversation
app.put('/api/conversations/:id/archive', authMiddleware, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id)
    if (!conv) return res.status(404).json({ error: 'Conversation not found' })

    const isArchived = conv.archivedBy.includes(req.user._id)
    if (isArchived) {
      conv.archivedBy = conv.archivedBy.filter(id => id.toString() !== req.user._id.toString())
    } else {
      conv.archivedBy.push(req.user._id)
    }
    await conv.save()
    res.json({ archived: !isArchived })
  } catch (error) {
    res.status(500).json({ error: 'Failed to archive conversation' })
  }
})

// Mute/Unmute conversation
app.put('/api/conversations/:id/mute', authMiddleware, async (req, res) => {
  try {
    const { duration } = req.body // hours, 0 = unmute
    const conv = await Conversation.findById(req.params.id)
    if (!conv) return res.status(404).json({ error: 'Conversation not found' })

    conv.mutedBy = conv.mutedBy.filter(m => m.user.toString() !== req.user._id.toString())
    
    if (duration > 0) {
      conv.mutedBy.push({
        user: req.user._id,
        until: new Date(Date.now() + duration * 60 * 60 * 1000)
      })
    }
    await conv.save()
    res.json({ muted: duration > 0 })
  } catch (error) {
    res.status(500).json({ error: 'Failed to mute conversation' })
  }
})


// ============================================
// MESSAGE ROUTES
// ============================================
app.get('/api/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { before, limit = 50 } = req.query
    const conv = await Conversation.findOne({ _id: req.params.id, participants: req.user._id })
    if (!conv) return res.status(404).json({ error: 'Conversation not found' })

    let query = { 
      conversationId: req.params.id,
      deletedFor: { $ne: req.user._id }
    }
    if (before) query.createdAt = { $lt: new Date(before) }

    const messages = await Message.find(query)
      .populate('sender', 'name avatar')
      .populate('replyTo', 'text sender type')
      .populate('reactions.user', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    // Mark as delivered
    await Message.updateMany(
      { 
        conversationId: req.params.id, 
        sender: { $ne: req.user._id },
        'deliveredTo.user': { $ne: req.user._id }
      },
      { $push: { deliveredTo: { user: req.user._id } } }
    )

    res.json(messages.reverse().map(m => ({
      id: m._id,
      text: m.deleted ? 'This message was deleted' : m.text,
      type: m.type,
      fileUrl: m.deleted ? '' : m.fileUrl,
      fileName: m.fileName,
      fileSize: m.fileSize,
      sender: m.sender,
      replyTo: m.replyTo,
      reactions: m.reactions,
      readBy: m.readBy,
      deliveredTo: m.deliveredTo,
      deleted: m.deleted,
      edited: m.edited,
      createdAt: m.createdAt,
      isMine: m.sender._id.toString() === req.user._id.toString()
    })))
  } catch (error) {
    console.error('Get messages error:', error)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

app.post('/api/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { text, type = 'text', replyTo } = req.body
    const conv = await Conversation.findOne({ _id: req.params.id, participants: req.user._id })
    if (!conv) return res.status(404).json({ error: 'Conversation not found' })

    const message = new Message({
      conversationId: req.params.id,
      sender: req.user._id,
      text: text?.trim() || '',
      type,
      replyTo: replyTo || null
    })
    await message.save()

    // Update conversation
    conv.lastMessage = message._id
    conv.updatedAt = new Date()
    await conv.save()

    await message.populate('sender', 'name avatar')
    if (replyTo) await message.populate('replyTo', 'text sender type')

    const messageData = {
      id: message._id,
      conversationId: message.conversationId,
      text: message.text,
      type: message.type,
      sender: message.sender,
      replyTo: message.replyTo,
      reactions: [],
      createdAt: message.createdAt,
      isMine: true
    }

    // Emit to all participants
    conv.participants.forEach(p => {
      if (p.toString() !== req.user._id.toString()) {
        io.to(p.toString()).emit('new_message', { ...messageData, isMine: false })
      }
    })

    res.json(messageData)
  } catch (error) {
    console.error('Send message error:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// Upload file message
app.post('/api/conversations/:id/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    
    const conv = await Conversation.findOne({ _id: req.params.id, participants: req.user._id })
    if (!conv) return res.status(404).json({ error: 'Conversation not found' })

    const fileUrl = `/uploads/${req.file.filename}`
    const ext = path.extname(req.file.originalname).toLowerCase()
    let type = 'file'
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) type = 'image'
    else if (['.mp4', '.webm', '.mov'].includes(ext)) type = 'video'
    else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) type = 'audio'

    const message = new Message({
      conversationId: req.params.id,
      sender: req.user._id,
      text: req.body.caption || '',
      type,
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size
    })
    await message.save()

    conv.lastMessage = message._id
    await conv.save()

    await message.populate('sender', 'name avatar')

    const messageData = {
      id: message._id,
      conversationId: message.conversationId,
      text: message.text,
      type: message.type,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      sender: message.sender,
      createdAt: message.createdAt,
      isMine: true
    }

    conv.participants.forEach(p => {
      if (p.toString() !== req.user._id.toString()) {
        io.to(p.toString()).emit('new_message', { ...messageData, isMine: false })
      }
    })

    res.json(messageData)
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: 'Failed to upload file' })
  }
})

// Mark messages as read
app.put('/api/conversations/:id/read', authMiddleware, async (req, res) => {
  try {
    const result = await Message.updateMany(
      { 
        conversationId: req.params.id, 
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id }
      },
      { $push: { readBy: { user: req.user._id } } }
    )

    // Notify sender about read status
    const conv = await Conversation.findById(req.params.id)
    conv.participants.forEach(p => {
      if (p.toString() !== req.user._id.toString()) {
        io.to(p.toString()).emit('messages_read', { 
          conversationId: req.params.id, 
          readBy: req.user._id 
        })
      }
    })

    res.json({ updated: result.modifiedCount })
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' })
  }
})

// Delete message
app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
  try {
    const { forEveryone } = req.query
    const message = await Message.findById(req.params.id)
    if (!message) return res.status(404).json({ error: 'Message not found' })

    if (forEveryone === 'true' && message.sender.toString() === req.user._id.toString()) {
      message.deleted = true
      message.text = ''
      message.fileUrl = ''
      await message.save()

      const conv = await Conversation.findById(message.conversationId)
      conv.participants.forEach(p => {
        io.to(p.toString()).emit('message_deleted', { 
          messageId: message._id, 
          conversationId: message.conversationId 
        })
      })
    } else {
      message.deletedFor.push(req.user._id)
      await message.save()
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete message' })
  }
})

// Edit message
app.put('/api/messages/:id', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body
    const message = await Message.findOne({ _id: req.params.id, sender: req.user._id })
    if (!message) return res.status(404).json({ error: 'Message not found' })

    message.text = text
    message.edited = true
    message.editedAt = new Date()
    await message.save()

    const conv = await Conversation.findById(message.conversationId)
    conv.participants.forEach(p => {
      io.to(p.toString()).emit('message_edited', { 
        messageId: message._id, 
        conversationId: message.conversationId,
        text: message.text
      })
    })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to edit message' })
  }
})

// Add reaction
app.post('/api/messages/:id/reaction', authMiddleware, async (req, res) => {
  try {
    const { emoji } = req.body
    const message = await Message.findById(req.params.id)
    if (!message) return res.status(404).json({ error: 'Message not found' })

    // Remove existing reaction from user
    message.reactions = message.reactions.filter(r => r.user.toString() !== req.user._id.toString())
    
    if (emoji) {
      message.reactions.push({ user: req.user._id, emoji })
    }
    await message.save()

    const conv = await Conversation.findById(message.conversationId)
    conv.participants.forEach(p => {
      io.to(p.toString()).emit('message_reaction', { 
        messageId: message._id, 
        conversationId: message.conversationId,
        reactions: message.reactions
      })
    })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to add reaction' })
  }
})


// ============================================
// SOCKET.IO
// ============================================
const onlineUsers = new Map()

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id)

  socket.on('user_online', async (userId) => {
    onlineUsers.set(userId, socket.id)
    socket.join(userId)
    socket.userId = userId
    
    await User.findByIdAndUpdate(userId, { online: true, lastSeen: new Date() })
    io.emit('user_status', { userId, online: true })
  })

  socket.on('typing', async ({ conversationId, isTyping }) => {
    const conv = await Conversation.findById(conversationId)
    if (conv) {
      conv.participants.forEach(p => {
        if (p.toString() !== socket.userId) {
          io.to(p.toString()).emit('user_typing', { 
            conversationId, 
            userId: socket.userId, 
            isTyping 
          })
        }
      })
    }
  })

  socket.on('disconnect', async () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId)
      await User.findByIdAndUpdate(socket.userId, { online: false, lastSeen: new Date() })
      io.emit('user_status', { userId: socket.userId, online: false, lastSeen: new Date() })
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`🚀 Kaltech Chat Server running on http://localhost:${PORT}`)
})
