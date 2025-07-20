import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AIProcessor } from './ai-processor.js';
import { getIPStrategy, getExtractionStrategy } from './scraping-strategies.js';
import { ProductSchema } from './schema.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limiting
const rateLimiter = new RateLimiterMemory({
  points: 10, // Number of requests
  duration: 60, // Per 60 seconds
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP for development
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));

// Serve static files with no caching for development
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Serve the main page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Get available strategies
app.get('/strategies', (req, res) => {
  const { IP_STRATEGIES, EXTRACTION_STRATEGIES } = require('./scraping-strategies.js');
  res.json({
    ipStrategies: IP_STRATEGIES.map((s: any) => ({ name: s.name, description: s.description })),
    extractionStrategies: EXTRACTION_STRATEGIES.map((s: any) => ({ name: s.name, description: s.description }))
  });
});

// Rate limiting middleware
app.use(async (req: any, res: any, next: any) => {
  try {
    await rateLimiter.consume(req.ip || 'unknown');
    next();
  } catch (error) {
    res.status(429).json({ error: 'Too many requests' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main scraping endpoint
app.post('/scrape', async (req, res) => {
  const startTime = performance.now();
  let processTime = 0, scrapeTime = 0, llmTime = 0;
  
  try {
    const { url, useAI = true, strategy = 'fingerprint' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Scraping: ${url} with strategy: ${strategy}, useAI: ${useAI}`);
    
    // Process time (request handling, validation, etc.) - only server overhead
    const processStart = performance.now();
    
    // Validate and prepare request
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL provided');
    }
    
    // Import strategy modules (this is server overhead)
    const { getIPStrategy, getExtractionStrategy } = await import('./scraping-strategies.js');
    
    // End process time measurement here - before actual scraping
    processTime = performance.now() - processStart;
    
    // Now do the actual scraping (this is not server overhead)
    const ipStrategy = getIPStrategy(req.body.ipStrategy || 'datacenter');
    const extractionStrategy = getExtractionStrategy(strategy);
    
    console.log(`🔍 Using IP strategy: ${ipStrategy.name} (${ipStrategy.description})`);
    console.log(`🔍 Using extraction strategy: ${extractionStrategy.name} (${extractionStrategy.description})`);
    
    const scrapedData = await extractionStrategy.extract(url, ipStrategy);
    scrapeTime = parseFloat(scrapedData.metadata?.scrapeTime) || 0;
    
    console.log('Backend timing calculation:', {
      processTime: Math.round(processTime),
      scrapeTime: Math.round(scrapeTime),
      rawScrapeTime: scrapedData.metadata?.scrapeTime,
      metadata: scrapedData.metadata
    });
    
    if (useAI) {
      // Use AI to extract structured product data
      const aiProcessor = new AIProcessor();
      console.log('🔍 Backend: Calling AI processor...');
      const aiResult = await aiProcessor.extractProductData(scrapedData.rawHtml, url, scrapedData.metadata);
      console.log('🔍 Backend: AI processor returned:', {
        hasProduct: !!aiResult.product,
        hasLlmInput: !!aiResult.llmInput,
        productStatus: aiResult.product?.status,
        llmInputKeys: aiResult.llmInput ? Object.keys(aiResult.llmInput) : 'none'
      });
      
      llmTime = parseFloat(scrapedData.metadata?.llmTime) || 0;
      
      // Create the response object
      const responseData = {
        status: 'completed',
        timestamp: Math.floor(Date.now() / 1000),
        aiOutput: aiResult.product,
        jsonData: scrapedData.metadata?.jsonData ? JSON.parse(scrapedData.metadata.jsonData) : null,
        htmlData: {
          title: scrapedData.title,
          price: scrapedData.price,
          sku: scrapedData.sku,
          images: scrapedData.images,
          allData: scrapedData.metadata?.allData ? JSON.parse(scrapedData.metadata.allData) : null,
          textContent: scrapedData.metadata?.textContent ? JSON.parse(scrapedData.metadata.textContent) : null
        },
        llmInput: aiResult.llmInput,
        metadata: {
          ...scrapedData.metadata,
          method: strategy,
          strategy: scrapedData.metadata?.strategy || 'json-parse',
          timing: {
            process: Math.round(processTime),
            scrape: Math.round(scrapeTime),
            llm: Math.round(llmTime),
            total: Math.round(performance.now() - startTime)
          },
          extraction: scrapedData.metadata?.strategy || 'json-parse'
        }
      };
      
      console.log('🔍 Backend: Response data keys:', Object.keys(responseData));
      console.log('🔍 Backend: llmInput in response:', !!responseData.llmInput);
      console.log('🔍 Backend: llmInput keys:', responseData.llmInput ? Object.keys(responseData.llmInput) : 'none');
      
      // Return comprehensive data for UI tabs
      res.json(responseData);
    } else {
      // Return raw scraped data
      res.json({
        status: 'completed',
        timestamp: Math.floor(Date.now() / 1000),
        rawData: scrapedData,
        metadata: {
          method: strategy,
          strategy: scrapedData.metadata?.strategy || 'json-parse',
          extraction: scrapedData.metadata?.strategy || 'json-parse',
          timing: {
            process: Math.round(processTime),
            scrape: Math.round(scrapeTime),
            llm: 0,
            total: Math.round(performance.now() - startTime)
          }
        }
      });
    }
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ 
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Math.floor(Date.now() / 1000),
      metadata: {
        timing: {
          process: Math.round(processTime),
          scrape: Math.round(scrapeTime),
          llm: Math.round(llmTime),
          total: Math.round(performance.now() - startTime)
        }
      }
    });
  }
});

// CLI endpoint for direct usage
app.get('/scrape/:url(*)', async (req, res) => {
  try {
    const url = decodeURIComponent(req.params.url);
    const useAI = req.query.ai === 'true';
    const ipStrategy = req.query.ipStrategy as string || 'datacenter';
    const strategy = req.query.strategy as string || 'fetch-headers';
    
    console.log(`CLI Scraping: ${url} with IP: ${ipStrategy}, strategy: ${strategy}, useAI: ${useAI}`);
    
    const startTime = performance.now();
    
    // Use the new strategy system
    const ipStrategyInstance = getIPStrategy(ipStrategy);
    const extractionStrategy = getExtractionStrategy(strategy);
    const scrapedData = await extractionStrategy.extract(url, ipStrategyInstance);
    
    const scrapeTime = Math.round(performance.now() - startTime);
    
    if (useAI) {
      const aiStartTime = performance.now();
      const aiProcessor = new AIProcessor();
      const productData = await aiProcessor.extractProductData(scrapedData.rawHtml, url, scrapedData.metadata);
      const llmTime = Math.round(performance.now() - aiStartTime);
      
      res.json({
        ...productData,
        metadata: {
          ...productData.metadata,
          timing: {
            scrape: scrapeTime,
            llm: llmTime,
            total: scrapeTime + llmTime
          }
        }
      });
    } else {
      res.json({
        status: 'completed',
        timestamp: Math.floor(Date.now() / 1000),
        rawData: scrapedData,
        metadata: {
          timing: {
            scrape: scrapeTime,
            total: scrapeTime
          }
        }
      });
    }
  } catch (error) {
    console.error('CLI Scraping error:', error);
    res.status(500).json({ 
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Math.floor(Date.now() / 1000)
    });
  }
});

// Test function for inline testing
async function testScraper() {
  const testUrl = 'https://www.sephora.com/product/lip-sleeping-mask-P420652';
  console.log(`🧪 Testing scraper with: ${testUrl}`);
  
  try {
    const ipStrategyInstance = getIPStrategy('datacenter');
    const extractionStrategy = getExtractionStrategy('fetch-headers');
    const result = await extractionStrategy.extract(testUrl, ipStrategyInstance);
    
    console.log('\n📊 SCRAPING RESULTS:');
    console.log('HTML length:', result.rawHtml.length);
    console.log('Metadata keys:', Object.keys(result.metadata));
    
    // Show JSON data found
    const jsonData = result.metadata.jsonData;
    if (jsonData) {
      console.log('JSON data found:', Object.keys(jsonData).length);
      console.log('JSON keys:', Object.keys(jsonData));
      
      // Show the PageJSON data if found
      const pageJsonKey = Object.keys(jsonData).find(key => key.includes('PageJSON') || key.includes('linkStore'));
      if (pageJsonKey) {
        console.log('PageJSON found:', pageJsonKey);
        console.log('PageJSON content preview:', JSON.stringify(jsonData[pageJsonKey], null, 2).substring(0, 1000) + '...');
        
        // Show specific product data if available
        const pageData = jsonData[pageJsonKey];
        if (pageData?.page?.product) {
          const product = pageData.page.product;
          console.log('\n🎯 PRODUCT DATA FROM JSON:');
          console.log('Product ID:', product.productId);
          console.log('Title:', product.seoTitle);
          console.log('Description:', product.seoMetaDescription);
          
          // Look for variants/skus
          if (product.variants || product.skus || product.availableSkus) {
            console.log('Variants found:', product.variants || product.skus || product.availableSkus);
          }
          
          // Look for images
          if (product.images || product.media) {
            console.log('Images found:', product.images || product.media);
          }
        }
      }
    }
    
    // Test AI processing
    console.log('\n🤖 Testing AI processing...');
    const aiProcessor = new AIProcessor();
    const aiResult = await aiProcessor.extractProductData(result.rawHtml, testUrl, result.metadata);
    console.log('AI Result:', JSON.stringify(aiResult, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if --test flag is provided
if (process.argv.includes('--test')) {
  testScraper().then(() => process.exit(0));
} else {
  app.listen(PORT, () => {
    console.log(`🚀 Ecommerce Scraper Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔍 Scrape endpoint: POST http://localhost:${PORT}/scrape`);
    console.log(`⚡ CLI endpoint: GET http://localhost:${PORT}/scrape/{url}?ai=true`);
    console.log(`🧪 Test mode: npm run dev -- --test`);
  });
} 