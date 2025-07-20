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
      
      // Universal JSON prioritization
      let prioritizedData: any = {};
      
      // Priority 1: Structured JSON (application/json, application/ld+json, text/json)
      const structuredKeys = Object.keys(jsonData).filter(key => key.startsWith('structured_'));
      if (structuredKeys.length > 0) {
        structuredKeys.forEach(key => {
          prioritizedData[key] = jsonData[key];
        });
        console.log(`🔍 Using ${structuredKeys.length} structured JSON objects as primary source`);
      }
      
      // Priority 2: Window state data (React/Vue/SPA state)
      const windowKeys = Object.keys(jsonData).filter(key => key.startsWith('window_state_'));
      if (windowKeys.length > 0) {
        windowKeys.forEach(key => {
          prioritizedData[key] = jsonData[key];
        });
        console.log(`🔍 Using ${windowKeys.length} window state objects as secondary source`);
      }
      
      // Priority 3: Product-specific JSON patterns
      const productKeys = Object.keys(jsonData).filter(key => key.startsWith('script_json_') || key.startsWith('product_json_'));
      if (productKeys.length > 0) {
        productKeys.forEach(key => {
          prioritizedData[key] = jsonData[key];
        });
        console.log(`🔍 Using ${productKeys.length} product JSON objects as tertiary source`);
      }
      
      // Fallback: use all available JSON data
      if (Object.keys(prioritizedData).length === 0) {
        prioritizedData = jsonData;
        console.log('🔍 Using all available JSON data as fallback');
      }
      
      const jsonString = JSON.stringify(prioritizedData, null, 2);
      console.log(`📊 Sending prioritized JSON data to LLM (${jsonString.length} characters)`);
      console.log(`📊 JSON keys being sent:`, Object.keys(prioritizedData));
      console.log(`📊 JSON preview:`, jsonString.substring(0, 500) + '...');
      
      return {
        sections: [{ path: 'prioritized_json', data: prioritizedData, score: 100, relevance: ['structured_data'] }],
        formatted: `PRIORITIZED JSON DATA:\n${jsonString}`,
        tokenEstimate: Math.ceil(jsonString.length / 4)
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
      console.log(`📊 Token Budget: JSON data ~${tokenEstimate} tokens`);
      
      prompt += `IMPORTANT: Use the following structured JSON data as your PRIMARY source. This contains the most accurate product information:

${relevantJsonData.formatted}

HTML Content (use as backup if JSON data is incomplete):
${html.substring(0, 3000)}

INSTRUCTIONS:
1. PRIORITIZE the JSON data above - it contains the most accurate and complete product information
2. Only use HTML data to fill in gaps that are missing from the JSON
3. Use exact values from the JSON data (product IDs, SKUs, image URLs, etc.)
4. Do not make up or guess any information - only use data that is actually present
5. The JSON data is sorted by relevance score - higher scores indicate more important data

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