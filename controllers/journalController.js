const Journal = require('../models/Journal');
const integrationAgent = require('../services/integrationAgent');

/**
 * Journal Processing Controller
 * Handles journal entries with AI analysis integration
 * Coordinates between React Native client, LLM service, and MongoDB storage
 */
const journalController = {

  /**
   * Create new journal entry with AI analysis
   * POST /api/journal/process
   * 
   * Flow:
   * 1. Accept plain text input from mobile app
   * 2. Send to LLM service for analysis
   * 3. Save journal entry with analysis results to MongoDB
   * 4. Return structured response to mobile app
   */
  async createWithAnalysis(req, res) {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { content, date, tags, mood, analyzeWithAI = true } = req.body;
      
      console.log(`[journal-process] Creating journal entry with AI analysis - userId=${userId}`);
      
      // Validate required fields
      if (!content || !date) {
        return res.status(400).json({ 
          error: 'Content and date are required' 
        });
      }

      if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ 
          error: 'Content must be a non-empty string' 
        });
      }

      let aiAnalysis = null;
      let processingError = null;

      // Process with AI if requested
      if (analyzeWithAI) {
        try {
          console.log(`[journal-process] Sending to AI analysis - contentLength=${content.length}`);
          
          const analysisResult = await integrationAgent.processJournalEntry(content.trim());
          
          // Transform the analysis result to match our schema
          aiAnalysis = {
            summary: analysisResult.analysis.summary,
            sentiment: analysisResult.analysis.sentiment,
            sentimentReasoning: analysisResult.analysis.sentiment_reasoning,
            wrongdoingsAndSolutions: analysisResult.analysis.wrongdoings_and_solutions,
            overallScore: analysisResult.analysis.overall_score,
            processedAt: new Date(analysisResult.processedAt),
            llmMetadata: {
              provider: analysisResult.metadata.llmProvider,
              model: analysisResult.metadata.model,
              tokensUsed: analysisResult.metadata.tokensUsed,
              responseTime: analysisResult.metadata.responseTime
            }
          };
          
          console.log(`[journal-process] AI analysis completed - sentiment=${aiAnalysis.sentiment}, score=${aiAnalysis.overallScore}`);
          
        } catch (aiError) {
          console.error(`[journal-process] AI analysis failed:`, aiError.message);
          processingError = aiError.message;
          
          // Continue saving the journal entry even if AI analysis fails
          // The user's content should not be lost due to AI service issues
        }
      }

      // Create and save journal entry
      const journalEntry = new Journal({
        userId,
        content: content.trim(),
        date,
        tags: tags || [],
        mood: mood || 'neutral',
        aiAnalysis: aiAnalysis
      });

      const savedEntry = await journalEntry.save();
      
      console.log(`[journal-process] Journal entry saved - id=${savedEntry._id}, hasAiAnalysis=${!!aiAnalysis}`);

      // Prepare response
      const response = {
        success: true,
        entry: savedEntry,
        aiAnalysisStatus: {
          processed: !!aiAnalysis,
          error: processingError
        }
      };

      // Include analysis summary in response for immediate use
      if (aiAnalysis) {
        response.analysisPreview = {
          sentiment: aiAnalysis.sentiment,
          overallScore: aiAnalysis.overallScore,
          summaryPointsCount: aiAnalysis.summary.length,
          issuesIdentified: aiAnalysis.wrongdoingsAndSolutions.length
        };
      }

      return res.status(201).json(response);

    } catch (error) {
      console.error(`[journal-process] Error creating journal entry:`, error);
      return res.status(500).json({ 
        error: 'Failed to create journal entry',
        details: error.message 
      });
    }
  },

  /**
   * Analyze existing journal entry
   * POST /api/journal/:id/analyze
   * 
   * Allows retroactive analysis of existing journal entries
   */
  async analyzeExisting(req, res) {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const { forceReanalysis = false } = req.body;

      console.log(`[journal-analyze] Analyzing existing entry - userId=${userId}, id=${id}`);

      // Find the journal entry
      const entry = await Journal.findOne({ _id: id, userId });
      if (!entry) {
        return res.status(404).json({ error: 'Journal entry not found' });
      }

      // Check if already analyzed and not forcing reanalysis
      if (entry.aiAnalysis && !forceReanalysis) {
        return res.status(200).json({
          success: true,
          message: 'Entry already analyzed',
          analysis: entry.aiAnalysis
        });
      }

      // Perform AI analysis
      const analysisResult = await integrationAgent.processJournalEntry(entry.content);

      // Update the entry with analysis
      const aiAnalysis = {
        summary: analysisResult.analysis.summary,
        sentiment: analysisResult.analysis.sentiment,
        sentimentReasoning: analysisResult.analysis.sentiment_reasoning,
        wrongdoingsAndSolutions: analysisResult.analysis.wrongdoings_and_solutions,
        overallScore: analysisResult.analysis.overall_score,
        processedAt: new Date(analysisResult.processedAt),
        llmMetadata: {
          provider: analysisResult.metadata.llmProvider,
          model: analysisResult.metadata.model,
          tokensUsed: analysisResult.metadata.tokensUsed,
          responseTime: analysisResult.metadata.responseTime
        }
      };

      entry.aiAnalysis = aiAnalysis;
      const updatedEntry = await entry.save();

      console.log(`[journal-analyze] Analysis completed - sentiment=${aiAnalysis.sentiment}, score=${aiAnalysis.overallScore}`);

      return res.status(200).json({
        success: true,
        entry: updatedEntry,
        analysis: aiAnalysis
      });

    } catch (error) {
      console.error(`[journal-analyze] Error analyzing journal entry:`, error);
      return res.status(500).json({
        error: 'Failed to analyze journal entry',
        details: error.message
      });
    }
  },

  /**
   * Get journal entries with analysis filter options
   * GET /api/journal/analyzed
   */
  async getAnalyzedEntries(req, res) {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { 
        sentiment, 
        minScore, 
        maxScore, 
        hasIssues,
        date,
        limit = 50, 
        page = 1 
      } = req.query;

      console.log(`[journal-analyzed] Fetching analyzed entries - userId=${userId}`);

      // Build query
      const query = { 
        userId,
        aiAnalysis: { $exists: true, $ne: null }
      };

      if (sentiment) {
        query['aiAnalysis.sentiment'] = sentiment;
      }

      if (minScore !== undefined) {
        query['aiAnalysis.overallScore'] = { $gte: parseInt(minScore) };
      }

      if (maxScore !== undefined) {
        if (query['aiAnalysis.overallScore']) {
          query['aiAnalysis.overallScore'].$lte = parseInt(maxScore);
        } else {
          query['aiAnalysis.overallScore'] = { $lte: parseInt(maxScore) };
        }
      }

      if (hasIssues === 'true') {
        query['aiAnalysis.wrongdoingsAndSolutions.0'] = { $exists: true };
      } else if (hasIssues === 'false') {
        query['aiAnalysis.wrongdoingsAndSolutions'] = { $size: 0 };
      }

      if (date) {
        query.date = date;
      }

      const skip = (page - 1) * limit;

      const entries = await Journal.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip);

      const total = await Journal.countDocuments(query);

      // Calculate analysis statistics
      const stats = await Journal.aggregate([
        { $match: { userId, aiAnalysis: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: null,
            avgScore: { $avg: '$aiAnalysis.overallScore' },
            sentimentCounts: {
              $push: '$aiAnalysis.sentiment'
            },
            totalIssues: {
              $sum: { $size: '$aiAnalysis.wrongdoingsAndSolutions' }
            },
            totalEntries: { $sum: 1 }
          }
        }
      ]);

      const analysisStats = stats[0] || {
        avgScore: 0,
        sentimentCounts: [],
        totalIssues: 0,
        totalEntries: 0
      };

      // Count sentiments
      const sentimentDistribution = analysisStats.sentimentCounts.reduce((acc, sentiment) => {
        acc[sentiment] = (acc[sentiment] || 0) + 1;
        return acc;
      }, {});

      return res.json({
        entries,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalEntries: total
        },
        analysisStats: {
          averageScore: Math.round(analysisStats.avgScore * 100) / 100,
          sentimentDistribution,
          totalIssuesIdentified: analysisStats.totalIssues,
          totalAnalyzedEntries: analysisStats.totalEntries
        }
      });

    } catch (error) {
      console.error(`[journal-analyzed] Error fetching analyzed entries:`, error);
      return res.status(500).json({
        error: 'Failed to fetch analyzed journal entries',
        details: error.message
      });
    }
  },

  /**
   * Get integration agent health status
   * GET /api/journal/ai-status
   */
  async getAIStatus(req, res) {
    try {
      const healthCheck = await integrationAgent.healthCheck();
      return res.json(healthCheck);
    } catch (error) {
      console.error(`[journal-ai-status] Error checking AI status:`, error);
      return res.status(500).json({
        error: 'Failed to check AI service status',
        details: error.message
      });
    }
  },

  /**
   * Test integration with sample data
   * POST /api/journal/test-integration
   * (For development/debugging only)
   */
  async testIntegration(req, res) {
    try {
      const testResult = await integrationAgent.testIntegration();
      return res.json(testResult);
    } catch (error) {
      console.error(`[journal-test] Integration test failed:`, error);
      return res.status(500).json({
        error: 'Integration test failed',
        details: error.message
      });
    }
  }
};

module.exports = journalController;