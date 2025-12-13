import mongoose from 'mongoose'

const conversationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['private', 'group'],
    default: 'private'
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  // Group specific fields
  groupName: {
    type: String,
    default: ''
  },
  groupAvatar: {
    type: String,
    default: ''
  },
  groupDescription: {
    type: String,
    default: ''
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Last message for preview
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  // Pinned messages
  pinnedMessages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  // Muted by users
  mutedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    until: { type: Date }
  }],
  // Archived by users
  archivedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, { timestamps: true })

// Index for faster queries
conversationSchema.index({ participants: 1 })
conversationSchema.index({ updatedAt: -1 })

export default mongoose.model('Conversation', conversationSchema)
