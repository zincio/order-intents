import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Product, ProductSchema } from './schema.js';
import { JsonProcessor } from './json-processor.js';

export class AIProcessor {
  private jsonProcessor: JsonProcessor;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.jsonProcessor = new JsonProcessor();
  }

  async extractProductData(html: string, url: string, metadata?: any): Promise<{ product: Product; llmInput: any }> {
    const llmStart = performance.now();
    
    console.log('🔍 AI Processor Debug: Starting extraction');
    console.log('🔍 URL:', url);
    console.log('🔍 HTML length:', html.length);
    console.log('🔍 Metadata keys:', metadata ? Object.keys(metadata) : 'none');
    
    try {
      // Extract and prioritize relevant JSON data using smart scoring
      const relevantJsonData = this.extractRelevantJsonData(metadata);
      console.log('🔍 Relevant JSON data extracted:', relevantJsonData ? 'YES' : 'NO');
      
      // Build the prompt that will be sent to the AI
      const prompt = this.buildPrompt(html, url, relevantJsonData);
      console.log('🔍 Prompt built, length:', prompt.length);
      console.log('🔍 Prompt preview (first 500 chars):', prompt.substring(0, 500));
      
      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: ProductSchema,
        prompt: prompt,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      // Validate and return the structured data
      const validatedData = ProductSchema.parse({
        ...object,
        status: 'completed',
        timestamp: Math.floor(Date.now() / 1000)
      });

      const llmTime = performance.now() - llmStart;
      console.log(`🤖 AI Processing completed in ${Math.round(llmTime)}ms`);
      
      // Add timing to the metadata if it exists
      if (metadata) {
        metadata.llmTime = llmTime;
      }

      // Create the LLM input object
      const llmInput = {
        prompt: prompt,
        jsonData: relevantJsonData,
        tokenEstimate: relevantJsonData?.tokenEstimate || 0,
        wasTruncated: relevantJsonData?.wasTruncated || false,
        originalTokenEstimate: relevantJsonData?.originalTokenEstimate || 0,
        model: 'gpt-4o-mini',
        temperature: 0.1
      };
      
      console.log('🔍 LLM Input object created:', {
        promptLength: llmInput.prompt.length,
        hasJsonData: !!llmInput.jsonData,
        tokenEstimate: llmInput.tokenEstimate,
        model: llmInput.model
      });

      // Return both the product data and the LLM input
      const result = {
        product: validatedData,
        llmInput: llmInput
      };
      
      console.log('🔍 AI Processor returning result with llmInput:', !!result.llmInput);
      return result;

    } catch (error) {
      console.error('❌ AI processing error:', error);
      const errorResult = {
        product: {
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Unknown AI processing error',
          timestamp: Math.floor(Date.now() / 1000)
        },
        llmInput: {
          error: error instanceof Error ? error.message : 'Unknown AI processing error',
          prompt: 'Error occurred during prompt generation'
        }
      };
      console.log('🔍 AI Processor returning error result with llmInput:', !!errorResult.llmInput);
      return errorResult;
    }
  }

  private extractRelevantJsonData(metadata: any): any {
    if (!metadata?.jsonData) return null;
    
    try {
      const jsonData = JSON.parse(metadata.jsonData);
      
      console.log(`🔍 Raw JSON data keys:`, Object.keys(jsonData));
      console.log(`🔍 Raw JSON data size: ${JSON.stringify(jsonData).length} characters`);
      
      // Use the JSON processor to intelligently extract and score relevant sections
      const relevantSections = this.jsonProcessor.extractRelevantJsonData(jsonData, 3);
      
      console.log(`🔍 JSON processor found ${relevantSections.length} relevant sections`);
      console.log(`🔍 Relevant sections array:`, relevantSections);
      relevantSections.forEach((section, index) => {
        console.log(`🔍 Section ${index + 1}: ${section.path} (score: ${section.score}, relevance: ${section.relevance.join(', ')})`);
      });
      
      // If no sections found, fall back to using all JSON data
      if (relevantSections.length === 0) {
        console.warn('⚠️ No relevant sections found by JSON processor, falling back to all JSON data');
        const fallbackSections = [{
          path: 'fallback_all_json',
          data: jsonData,
          score: 1,
          relevance: ['fallback']
        }];
        relevantSections.push(...fallbackSections);
      }
      
      // Format the data for AI consumption
      const formatted = this.jsonProcessor.formatForAI(relevantSections);
      const tokenEstimate = this.jsonProcessor.estimateTokens(relevantSections);
      
      console.log(`📊 Token estimate: ${tokenEstimate} tokens`);
      console.log(`📊 Formatted data length: ${formatted.length} characters`);
      console.log(`📊 Formatted data preview:`, formatted.substring(0, 500) + '...');
      
      // Check if we need to truncate due to token limits
      const maxTokens = 8000; // Conservative limit for GPT-4o-mini
      if (tokenEstimate > maxTokens) {
        console.warn(`⚠️ Token estimate (${tokenEstimate}) exceeds limit (${maxTokens}), truncating...`);
        
        // Take only the top sections that fit within token limit
        let truncatedSections: any[] = [];
        let currentTokens = 0;
        
        for (const section of relevantSections) {
          const sectionTokens = Math.ceil(JSON.stringify(section.data).length / 4);
          if (currentTokens + sectionTokens <= maxTokens) {
            truncatedSections.push(section);
            currentTokens += sectionTokens;
          } else {
            console.log(`🔍 Stopping at section ${section.path} to stay within token limit`);
            break;
          }
        }
        
        const truncatedFormatted = this.jsonProcessor.formatForAI(truncatedSections);
        const truncatedTokenEstimate = this.jsonProcessor.estimateTokens(truncatedSections);
        
        console.log(`📊 After truncation: ${truncatedTokenEstimate} tokens, ${truncatedFormatted.length} characters`);
        
        return {
          sections: truncatedSections,
          formatted: truncatedFormatted,
          tokenEstimate: truncatedTokenEstimate,
          wasTruncated: true,
          originalTokenEstimate: tokenEstimate
        };
      }
      
      return {
        sections: relevantSections,
        formatted: formatted,
        tokenEstimate: tokenEstimate,
        wasTruncated: false
      };
    } catch (error) {
      console.log('Error parsing JSON data:', error);
      return null;
    }
  }

  // Remove the old extractProductFields method as it's no longer needed

  private buildPrompt(html: string, url: string, relevantJsonData?: any): string {
    let prompt = `Extract product information from this ecommerce page.

URL: ${url}

`;

    // Prioritize JSON data if available
    if (relevantJsonData?.formatted) {
      const tokenEstimate = relevantJsonData.tokenEstimate || 0;
      const wasTruncated = relevantJsonData.wasTruncated || false;
      console.log(`📊 Token Budget: JSON data ~${tokenEstimate} tokens${wasTruncated ? ' (truncated)' : ''}`);
      
      prompt += `IMPORTANT: Use the following intelligently processed JSON data as your PRIMARY source. This data has been scored and prioritized for relevance:

${relevantJsonData.formatted}

HTML Content (use as backup if JSON data is incomplete):
${html.substring(0, 3000)}

INSTRUCTIONS:
1. PRIORITIZE the JSON data above - it contains the most accurate and complete product information
2. The JSON data is sorted by relevance score - higher scores indicate more important data
3. Only use HTML data to fill in gaps that are missing from the JSON
4. Use exact values from the JSON data (product IDs, SKUs, image URLs, etc.)
5. Do not make up or guess any information - only use data that is actually present
${wasTruncated ? `6. NOTE: This data was truncated due to size limits. Focus on the highest-scoring sections first.` : ''}

SPECIAL INSTRUCTIONS FOR VARIANTS AND SKUs:
- Look for any arrays or objects that contain product variations, offers, variants, colors, sizes, or similar structures
- Extract ALL available variants, not just the first few
- Map variants to their corresponding SKUs, product IDs, or unique identifiers when available
- Include all product options you can find in the JSON data
- Be thorough in extracting complete product information from the structured data
`;
    } else {
      prompt += `HTML Content:
${html.substring(0, 10000)}

Extract as much information as possible from the HTML. Focus on:
- Product title, brand, price
- Available sizes, colors, variants
- Product images
- Product description and features
- Categories and breadcrumbs
- Reviews and ratings
- Product identifiers (UPC, EAN, etc.)
- Package dimensions and weight

SPECIAL INSTRUCTIONS FOR VARIANTS AND SKUs:
- Look for any arrays or objects that contain product variations, offers, variants, colors, sizes, or similar structures
- Extract ALL available variants, not just the first few
- Map variants to their corresponding SKUs, product IDs, or unique identifiers when available
- Include all product options you can find in the data
- Be thorough in extracting complete product information

Only include fields that you can confidently extract from the data. If a field is not available, omit it rather than guessing.`;
    }

    return prompt;
  }
} 