const express = require('express');
const router = express.Router();
const Mistake = require('../models/Mistake');

// Get all mistake entries for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, category, limit = 50, page = 1 } = req.query;
    
    const query = { userId };
    if (date) {
      query.date = date;
    }
    if (category) {
      query.category = category;
    }
    
    const skip = (page - 1) * limit;
    
    const entries = await Mistake.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Mistake.countDocuments(query);
    
    res.json({
      entries,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalEntries: total
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get mistake entry by ID
router.get('/:userId/:id', async (req, res) => {
  try {
    const { userId, id } = req.params;
    
    const entry = await Mistake.findOne({ _id: id, userId });
    
    if (!entry) {
      return res.status(404).json({ error: 'Mistake entry not found' });
    }
    
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new mistake entry
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { mistake, solution, category, date, tags } = req.body;
    
    if (!mistake || !solution || !date) {
      return res.status(400).json({ error: 'Mistake, solution, and date are required' });
    }
    
    const entry = new Mistake({
      userId,
      mistake,
      solution,
      category: category || 'other',
      date,
      tags: tags || []
    });
    
    const savedEntry = await entry.save();
    res.status(201).json(savedEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update mistake entry
router.put('/:userId/:id', async (req, res) => {
  try {
    const { userId, id } = req.params;
    const { mistake, solution, category, avoided, tags } = req.body;
    
    const entry = await Mistake.findOne({ _id: id, userId });
    
    if (!entry) {
      return res.status(404).json({ error: 'Mistake entry not found' });
    }
    
    if (mistake) entry.mistake = mistake;
    if (solution) entry.solution = solution;
    if (category) entry.category = category;
    if (avoided !== undefined) {
      entry.avoided = avoided;
      
      // Update streak info
      if (avoided) {
        const today = new Date().toISOString().split('T')[0];
        const lastAvoidedDate = entry.streakInfo.lastAvoidedDate;
        
        if (lastAvoidedDate) {
          const lastDate = new Date(lastAvoidedDate);
          const currentDate = new Date(today);
          const daysDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
          
          if (daysDiff === 1) {
            // Consecutive day
            entry.streakInfo.currentStreak += 1;
          } else {
            // Not consecutive, reset streak
            entry.streakInfo.currentStreak = 1;
          }
        } else {
          // First time avoiding
          entry.streakInfo.currentStreak = 1;
        }
        
        entry.streakInfo.lastAvoidedDate = today;
        
        // Update best streak
        if (entry.streakInfo.currentStreak > entry.streakInfo.bestStreak) {
          entry.streakInfo.bestStreak = entry.streakInfo.currentStreak;
        }
      }
    }
    if (tags) entry.tags = tags;
    
    const updatedEntry = await entry.save();
    res.json(updatedEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete mistake entry
router.delete('/:userId/:id', async (req, res) => {
  try {
    const { userId, id } = req.params;
    
    const entry = await Mistake.findOne({ _id: id, userId });
    
    if (!entry) {
      return res.status(404).json({ error: 'Mistake entry not found' });
    }
    
    await Mistake.deleteOne({ _id: id, userId });
    res.json({ message: 'Mistake entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle avoided status
router.patch('/:userId/:id/toggle-avoided', async (req, res) => {
  try {
    const { userId, id } = req.params;
    
    const entry = await Mistake.findOne({ _id: id, userId });
    
    if (!entry) {
      return res.status(404).json({ error: 'Mistake entry not found' });
    }
    
    entry.avoided = !entry.avoided;
    
    // Update streak info when marking as avoided
    if (entry.avoided) {
      const today = new Date().toISOString().split('T')[0];
      const lastAvoidedDate = entry.streakInfo.lastAvoidedDate;
      
      if (lastAvoidedDate) {
        const lastDate = new Date(lastAvoidedDate);
        const currentDate = new Date(today);
        const daysDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 1) {
          entry.streakInfo.currentStreak += 1;
        } else {
          entry.streakInfo.currentStreak = 1;
        }
      } else {
        entry.streakInfo.currentStreak = 1;
      }
      
      entry.streakInfo.lastAvoidedDate = today;
      
      if (entry.streakInfo.currentStreak > entry.streakInfo.bestStreak) {
        entry.streakInfo.bestStreak = entry.streakInfo.currentStreak;
      }
    }
    
    const updatedEntry = await entry.save();
    res.json(updatedEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get mistake statistics
router.get('/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const totalEntries = await Mistake.countDocuments({ userId });
    const avoidedEntries = await Mistake.countDocuments({ userId, avoided: true });
    
    // Get category distribution
    const categoryStats = await Mistake.aggregate([
      { $match: { userId } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    
    // Get best streak across all mistakes
    const bestStreakStats = await Mistake.aggregate([
      { $match: { userId } },
      { $group: { _id: null, bestStreak: { $max: '$streakInfo.bestStreak' } } }
    ]);
    
    res.json({
      totalEntries,
      avoidedEntries,
      avoidanceRate: totalEntries > 0 ? (avoidedEntries / totalEntries * 100).toFixed(1) : 0,
      categoryDistribution: categoryStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      bestStreak: bestStreakStats[0]?.bestStreak || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;