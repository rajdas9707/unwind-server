const mongoose = require('mongoose');

const journalSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: true,
    index: true
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  mood: {
    type: String,
    enum: ['very_happy', 'happy', 'neutral', 'sad', 'very_sad'],
    default: 'neutral'
  },
  type: {
    type: String,
    default: 'journal'
  },
  // LLM Analysis Results
  aiAnalysis: {
    summary: {
      type: [String],
      maxlength: 5
    },
    sentiment: {
      type: String,
      enum: ['Positive', 'Negative', 'Neutral']
    },
    sentimentReasoning: {
      type: String,
      maxlength: 500
    },
    wrongdoingsAndSolutions: [{
      wrongdoing: {
        type: String,
        required: true,
        maxlength: 200
      },
      solution: {
        type: String,
        required: true,
        maxlength: 300
      }
    }],
    overallScore: {
      type: Number,
      min: 0,
      max: 10
    },
    processedAt: {
      type: Date,
      default: Date.now
    },
    llmMetadata: {
      provider: String,
      model: String,
      tokensUsed: Number,
      responseTime: Number
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
journalSchema.index({ userId: 1, date: -1 });
journalSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Journal', journalSchema);