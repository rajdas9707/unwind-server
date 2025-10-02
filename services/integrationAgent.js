const axios = require('axios');

/**
 * Integration Agent Service
 * Connects React Native mobile app, LLM service, and MongoDB backend
 * Processes journal entries with AI analysis and structured responses
 */
class IntegrationAgent {
  constructor() {
    // LLM Service Configuration
    this.llmServiceUrl = process.env.LLM_SERVICE_URL || 'http://localhost:3001';
    this.llmTimeout = parseInt(process.env.LLM_TIMEOUT) || 30000;
    this.maxRetries = parseInt(process.env.LLM_MAX_RETRIES) || 2;
  }

  /**
   * Process journal entry through complete workflow:
   * 1. Accept plain text input from mobile app
   * 2. Send to LLM service for analysis
   * 3. Parse and validate LLM response
   * 4. Return structured JSON response
   */
  async processJournalEntry(journalText, options = {}) {
    if (!journalText || typeof journalText !== 'string' || !journalText.trim()) {
      throw new Error('Journal text must be a non-empty string');
    }

    try {
      // Step 1: Prepare the LLM prompt with specific instructions
      const prompt = this.buildAnalysisPrompt(journalText.trim());
      
      // Step 2: Send to LLM service with retry logic
      const llmResponse = await this.callLLMServiceWithRetry(prompt, options);
      
      // Step 3: Parse and validate the response
      const analysisResult = this.parseAndValidateLLMResponse(llmResponse);
      
      // Step 4: Return structured result
      return {
        success: true,
        originalText: journalText.trim(),
        analysis: analysisResult,
        processedAt: new Date().toISOString(),
        metadata: {
          llmProvider: llmResponse.provider || 'unknown',
          model: llmResponse.model || 'unknown',
          tokensUsed: llmResponse.metadata?.tokens_used || null,
          responseTime: llmResponse.metadata?.response_time || null
        }
      };

    } catch (error) {
      console.error('Integration Agent Error:', error.message);
      throw new Error(`Failed to process journal entry: ${error.message}`);
    }
  }

  /**
   * Build structured prompt for LLM analysis
   * Ensures consistent JSON response format
   */
  buildAnalysisPrompt(journalText) {
    return `Please analyze the following journal entry and provide a structured response in EXACTLY this JSON format:

{
  "summary": ["point1", "point2", "point3"],
  "sentiment": "Positive | Negative | Neutral",
  "sentiment_reasoning": "1-2 line explanation for the sentiment",
  "wrongdoings_and_solutions": [
    {"wrongdoing": "specific issue identified", "solution": "practical actionable solution"},
    {"wrongdoing": "another issue if any", "solution": "corresponding solution"}
  ],
  "overall_score": 7
}

IMPORTANT INSTRUCTIONS:
1. Generate a SHORT SUMMARY in point form (maximum 5 points)
2. Perform SENTIMENT ANALYSIS - classify as exactly one of: "Positive", "Negative", or "Neutral"
3. Provide 1-2 line reasoning for the sentiment classification
4. Identify WRONGDOINGS if any (actions, thoughts, or behaviors that could be improved)
5. For each wrongdoing, suggest a PRACTICAL SOLUTION that is specific and actionable
6. If no wrongdoings are identified, return an empty array: []
7. Provide an OVERALL SCORE out of 10 reflecting the quality/clarity of the journal entry
8. Respond ONLY with valid JSON, no additional text or formatting

Journal Entry:
"${journalText}"

JSON Response:`;
  }

  /**
   * Call LLM service with retry logic and timeout handling
   */
  async callLLMServiceWithRetry(prompt, options = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const response = await axios.post(
          `${this.llmServiceUrl}/api/ask`,
          {
            prompt: prompt,
            options: {
              max_tokens: options.max_tokens || 1000,
              temperature: options.temperature || 0.3,
              ...options
            }
          },
          {
            timeout: this.llmTimeout,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data && response.data.response) {
          return {
            response: response.data.response,
            provider: response.data.provider,
            model: response.data.model,
            metadata: response.data.metadata
          };
        } else {
          throw new Error('Invalid response format from LLM service');
        }

      } catch (error) {
        lastError = error;
        console.warn(`LLM service call attempt ${attempt} failed:`, error.message);
        
        // Don't retry on certain errors
        if (error.response?.status === 400 || error.response?.status === 401) {
          break;
        }
        
        // Add delay before retry
        if (attempt < this.maxRetries + 1) {
          await this.delay(1000 * attempt);
        }
      }
    }
    
    throw new Error(`LLM service unavailable after ${this.maxRetries + 1} attempts: ${lastError.message}`);
  }

  /**
   * Parse and validate LLM response to ensure proper JSON format
   */
  parseAndValidateLLMResponse(llmResponse) {
    try {
      let jsonText = llmResponse.response.trim();
      
      // Extract JSON from response if it's wrapped in other text
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
      
      const parsed = JSON.parse(jsonText);
      
      // Validate required fields
      const validation = this.validateAnalysisResponse(parsed);
      if (!validation.isValid) {
        throw new Error(`Invalid LLM response structure: ${validation.errors.join(', ')}`);
      }
      
      return parsed;
      
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('LLM returned invalid JSON format');
      }
      throw error;
    }
  }

  /**
   * Validate the structure and content of the analysis response
   */
  validateAnalysisResponse(response) {
    const errors = [];
    
    // Check required fields
    if (!Array.isArray(response.summary)) {
      errors.push('summary must be an array');
    } else if (response.summary.length === 0) {
      errors.push('summary cannot be empty');
    } else if (response.summary.length > 5) {
      errors.push('summary cannot have more than 5 points');
    }
    
    if (!['Positive', 'Negative', 'Neutral'].includes(response.sentiment)) {
      errors.push('sentiment must be exactly "Positive", "Negative", or "Neutral"');
    }
    
    if (!response.sentiment_reasoning || typeof response.sentiment_reasoning !== 'string') {
      errors.push('sentiment_reasoning must be a non-empty string');
    }
    
    if (!Array.isArray(response.wrongdoings_and_solutions)) {
      errors.push('wrongdoings_and_solutions must be an array');
    } else {
      response.wrongdoings_and_solutions.forEach((item, index) => {
        if (!item.wrongdoing || !item.solution) {
          errors.push(`wrongdoings_and_solutions[${index}] must have both wrongdoing and solution fields`);
        }
      });
    }
    
    if (typeof response.overall_score !== 'number' || response.overall_score < 0 || response.overall_score > 10) {
      errors.push('overall_score must be a number between 0 and 10');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Health check for the integration agent
   */
  async healthCheck() {
    try {
      // Test connection to LLM service
      const response = await axios.get(`${this.llmServiceUrl}/api/health`, {
        timeout: 5000
      });
      
      return {
        status: 'healthy',
        llmService: {
          url: this.llmServiceUrl,
          status: response.status === 200 ? 'connected' : 'error',
          responseTime: response.headers['x-response-time'] || 'unknown'
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        llmService: {
          url: this.llmServiceUrl,
          status: 'disconnected',
          error: error.message
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Test the integration with a sample journal entry
   */
  async testIntegration() {
    const sampleJournal = "Today was a challenging day at work. I made a mistake during the presentation and felt embarrassed. However, I learned from it and my colleagues were supportive. I'm grateful for their understanding.";
    
    try {
      const result = await this.processJournalEntry(sampleJournal);
      return {
        success: true,
        message: 'Integration test passed',
        sampleResult: result
      };
    } catch (error) {
      return {
        success: false,
        message: 'Integration test failed',
        error: error.message
      };
    }
  }

  /**
   * Utility function for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const integrationAgent = new IntegrationAgent();
module.exports = integrationAgent;