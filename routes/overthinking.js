const express = require('express');
const router = express.Router();
const Overthinking = require('../models/Overthinking');

// Get all overthinking entries for a user
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
    
    const entries = await Overthinking.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Overthinking.countDocuments(query);
    
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

// Get overthinking entry by ID
router.get('/:userId/:id', async (req, res) => {
  try {
    const { userId, id } = req.params;
    
    const entry = await Overthinking.findOne({ _id: id, userId });
    
    if (!entry) {
      return res.status(404).json({ error: 'Overthinking entry not found' });
    }
    
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new overthinking entry
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { thought, solution, date, category, intensity, tags } = req.body;
    
    if (!thought || !date) {
      return res.status(400).json({ error: 'Thought and date are required' });
    }
    
    const entry = new Overthinking({
      userId,
      thought,
      solution: solution || '',
      date,
      category: category || 'other',
      intensity: intensity || 5,
      tags: tags || []
    });
    
    const savedEntry = await entry.save();
    res.status(201).json(savedEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update overthinking entry
router.put('/:userId/:id', async (req, res) => {
  try {
    const { userId, id } = req.params;
    const { thought, solution, category, intensity, dumped, tags } = req.body;
    
    const entry = await Overthinking.findOne({ _id: id, userId });
    
    if (!entry) {
      return res.status(404).json({ error: 'Overthinking entry not found' });
    }
    
    if (thought) entry.thought = thought;
    if (solution !== undefined) entry.solution = solution;
    if (category) entry.category = category;
    if (intensity) entry.intensity = intensity;
    if (dumped !== undefined) entry.dumped = dumped;
    if (tags) entry.tags = tags;
    
    const updatedEntry = await entry.save();
    res.json(updatedEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete overthinking entry
router.delete('/:userId/:id', async (req, res) => {
  try {
    const { userId, id } = req.params;
    
    const entry = await Overthinking.findOne({ _id: id, userId });
    
    if (!entry) {
      return res.status(404).json({ error: 'Overthinking entry not found' });
    }
    
    await Overthinking.deleteOne({ _id: id, userId });
    res.json({ message: 'Overthinking entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dump a thought (mark as released)
router.patch('/:userId/:id/dump', async (req, res) => {
  try {
    const { userId, id } = req.params;
    
    const entry = await Overthinking.findOne({ _id: id, userId });
    
    if (!entry) {
      return res.status(404).json({ error: 'Overthinking entry not found' });
    }
    
    entry.dumped = true;
    const updatedEntry = await entry.save();
    
    res.json(updatedEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get overthinking statistics
router.get('/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const totalEntries = await Overthinking.countDocuments({ userId });
    const dumpedEntries = await Overthinking.countDocuments({ userId, dumped: true });
    
    // Get category distribution
    const categoryStats = await Overthinking.aggregate([
      { $match: { userId } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    
    // Get average intensity
    const intensityStats = await Overthinking.aggregate([
      { $match: { userId } },
      { $group: { _id: null, avgIntensity: { $avg: '$intensity' } } }
    ]);
    
    res.json({
      totalEntries,
      dumpedEntries,
      releaseRate: totalEntries > 0 ? (dumpedEntries / totalEntries * 100).toFixed(1) : 0,
      categoryDistribution: categoryStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      averageIntensity: intensityStats[0]?.avgIntensity?.toFixed(1) || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;