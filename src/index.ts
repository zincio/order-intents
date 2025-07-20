import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeEcommercePage } from './scraper.js';
import { AIProcessor } from './ai-processor.js';
import { Product } from './schema.js';

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
app.use(express.json({ limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
  try {
    const { url, useAI = true, strategy = 'fingerprint' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Scraping: ${url} with strategy: ${strategy}, useAI: ${useAI}`);
    
    let scrapedData;
    
    // Use different scraping strategies
    switch (strategy) {
      case 'fingerprint':
        const { scrapeWithFingerprinting } = await import('./fingerprint-scraper.js');
        scrapedData = await scrapeWithFingerprinting(url);
        break;
      case 'stealth':
        const { scrapeWithStealth } = await import('./stealth-scraper.js');
        scrapedData = await scrapeWithStealth(url);
        break;
      case 'puppeteer':
        const { scrapeEcommercePage: scrapeWithPuppeteer } = await import('./scraper.js');
        scrapedData = await scrapeWithPuppeteer(url);
        break;
      case 'fetch':
        // For fetch strategy, we'll use the main scraper which has fallback logic
        const { scrapeEcommercePage: scrapeWithFetch } = await import('./scraper.js');
        scrapedData = await scrapeWithFetch(url);
        break;
      default:
        const { scrapeWithFingerprinting: defaultScraper } = await import('./fingerprint-scraper.js');
        scrapedData = await defaultScraper(url);
    }
    
    if (useAI) {
      // Use AI to extract structured product data
      const aiProcessor = new AIProcessor();
      const productData = await aiProcessor.extractProductData(scrapedData.rawHtml, url);
      res.json(productData);
    } else {
      // Return raw scraped data
      res.json({
        status: 'completed',
        timestamp: Math.floor(Date.now() / 1000),
        rawData: scrapedData
      });
    }
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ 
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Math.floor(Date.now() / 1000)
    });
  }
});

// CLI endpoint for direct usage
app.get('/scrape/:url(*)', async (req, res) => {
  try {
    const url = decodeURIComponent(req.params.url);
    const useAI = req.query.ai === 'true';
    const strategy = req.query.strategy as string || 'fingerprint';
    
    console.log(`CLI Scraping: ${url} with strategy: ${strategy}, useAI: ${useAI}`);
    
    let scrapedData;
    
    // Use different scraping strategies
    switch (strategy) {
      case 'fingerprint':
        const { scrapeWithFingerprinting } = await import('./fingerprint-scraper.js');
        scrapedData = await scrapeWithFingerprinting(url);
        break;
      case 'stealth':
        const { scrapeWithStealth } = await import('./stealth-scraper.js');
        scrapedData = await scrapeWithStealth(url);
        break;
      case 'puppeteer':
        const { scrapeEcommercePage } = await import('./scraper.js');
        scrapedData = await scrapeEcommercePage(url);
        break;
      case 'fetch':
        // For fetch strategy, we'll use the main scraper which has fallback logic
        const { scrapeEcommercePage: scrapeWithFetch } = await import('./scraper.js');
        scrapedData = await scrapeWithFetch(url);
        break;
      default:
        const { scrapeWithFingerprinting: defaultScraper } = await import('./fingerprint-scraper.js');
        scrapedData = await defaultScraper(url);
    }
    
    if (useAI) {
      const aiProcessor = new AIProcessor();
      const productData = await aiProcessor.extractProductData(scrapedData.rawHtml, url);
      res.json(productData);
    } else {
      res.json({
        status: 'completed',
        timestamp: Math.floor(Date.now() / 1000),
        rawData: scrapedData
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

app.listen(PORT, () => {
  console.log(`🚀 Ecommerce Scraper Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Scrape endpoint: POST http://localhost:${PORT}/scrape`);
  console.log(`⚡ CLI endpoint: GET http://localhost:${PORT}/scrape/{url}?ai=true`);
}); 