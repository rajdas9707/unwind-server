const express = require("express");
const router = express.Router();
const Journal = require("../models/Journal");

// Get all journal entries for the authenticated user
router.get("/", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { date, limit = 50, page = 1 } = req.query;
    console.log(
      `[journal] GET / - userId=${userId} date=${date} page=${page} limit=${limit}`
    );

    const query = { userId };
    if (date) {
      query.date = date;
    }

    const skip = (page - 1) * limit;

    const entries = await Journal.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Journal.countDocuments(query);

    res.json({
      entries,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalEntries: total,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get journal entry by ID for the authenticated user
router.get("/:id", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    console.log(`[journal] GET /:id - userId=${userId} id=${id}`);

    const entry = await Journal.findOne({ _id: id, userId });

    if (!entry) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new journal entry for the authenticated user
router.post("/", async (req, res) => {
  console.log(req.body);
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { content, date, tags, mood } = req.body;
    console.log(`[journal] POST / - userId=${userId} body=`, {
      contentLength: content?.length,
      date,
      tagsCount: tags?.length,
      mood,
    });

    if (!content || !date) {
      return res.status(400).json({ error: "Content and date are required" });
    }

    const entry = new Journal({
      userId,
      content,
      date,
      tags: tags || [],
      mood: mood || "neutral",
    });

    const savedEntry = await entry.save();
    console.log(
      `[journal] CREATED _id=${savedEntry._id} userId=${userId} date=${savedEntry.date}`
    );
    return res.status(201).json(savedEntry);
  } catch (error) {
    console.error(`[journal] POST error`, error);
    return res.status(500).json({ error: error.message });
  }
});

// Update journal entry for the authenticated user
router.put("/:id", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { content, tags, mood } = req.body;
    console.log(`[journal] PUT /:id - userId=${userId} id=${id}`);

    const entry = await Journal.findOne({ _id: id, userId });

    if (!entry) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    if (content) entry.content = content;
    if (tags) entry.tags = tags;
    if (mood) entry.mood = mood;

    const updatedEntry = await entry.save();
    res.json(updatedEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete journal entry for the authenticated user
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    console.log(`[journal] DELETE /:id - userId=${userId} id=${id}`);

    const entry = await Journal.findOne({ _id: id, userId });

    if (!entry) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    await Journal.deleteOne({ _id: id, userId });
    res.json({ message: "Journal entry deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get journal statistics for the authenticated user
router.get("/stats", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    console.log(`[journal] GET /stats - userId=${userId}`);

    const totalEntries = await Journal.countDocuments({ userId });
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const thisMonthEntries = await Journal.countDocuments({
      userId,
      date: { $regex: `^${thisMonth}` },
    });

    // Get mood distribution
    const moodStats = await Journal.aggregate([
      { $match: { userId } },
      { $group: { _id: "$mood", count: { $sum: 1 } } },
    ]);

    res.json({
      totalEntries,
      thisMonthEntries,
      moodDistribution: moodStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
