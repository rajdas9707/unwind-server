const mongoose = require('mongoose');

const mistakeSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  mistake: {
    type: String,
    required: true
  },
  solution: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: [
      'work_career',
      'relationships',
      'health',
      'finance',
      'personal_growth',
      'communication',
      'time_management',
      'decision_making',
      'other'
    ],
    default: 'other'
  },
  date: {
    type: String,
    required: true,
    index: true
  },
  avoided: {
    type: Boolean,
    default: false
  },
  streakInfo: {
    currentStreak: {
      type: Number,
      default: 0
    },
    bestStreak: {
      type: Number,
      default: 0
    },
    lastAvoidedDate: {
      type: String,
      default: ''
    }
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  type: {
    type: String,
    default: 'mistake'
  }
}, {
  timestamps: true
});

// Index for efficient queries
mistakeSchema.index({ userId: 1, date: -1 });
mistakeSchema.index({ userId: 1, createdAt: -1 });
mistakeSchema.index({ userId: 1, category: 1 });

module.exports = mongoose.model('Mistake', mistakeSchema);