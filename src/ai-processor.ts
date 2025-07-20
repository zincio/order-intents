import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Product, ProductSchema } from './schema.js';

export class AIProcessor {
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  async extractProductData(html: string, url: string): Promise<Product> {
    try {
      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: ProductSchema,
        prompt: this.buildPrompt(html, url),
        temperature: 0.1, // Low temperature for consistent extraction
      });

      // Validate and return the structured data
      const validatedData = ProductSchema.parse({
        ...object,
        status: 'completed',
        timestamp: Math.floor(Date.now() / 1000)
      });

      return validatedData;

    } catch (error) {
      console.error('AI processing error:', error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown AI processing error',
        timestamp: Math.floor(Date.now() / 1000)
      };
    }
  }

  private buildPrompt(html: string, url: string): string {
    return `Extract product information from this ecommerce page HTML.

URL: ${url}

HTML Content:
${html.substring(0, 15000)}

Extract as much information as possible from the HTML. Focus on:
- Product title, brand, price
- Available sizes, colors, variants
- Product images
- Product description and features
- Categories and breadcrumbs
- Reviews and ratings
- Product identifiers (UPC, EAN, etc.)
- Package dimensions and weight

Only include fields that you can confidently extract from the data. If a field is not available, omit it rather than guessing.`;
  }
} 