import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';

export interface ScrapedData {
  title: string;
  description: string;
  price: string;
  sku: string;
  images: string[];
  availability: string;
  rawHtml: string;
  metadata: Record<string, string>;
}

// Browser instance cache for performance
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_BIN || 
                   (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection'
      ]
    });
  }
  return browser;
}

// Fallback scraping using fetch for sites that block Puppeteer
async function scrapeEcommercePageFallback(url: string): Promise<ScrapedData> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract basic information
    const title = $('title').text().trim() || $('h1').first().text().trim();
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || '';

    // Extract price information
    const price = extractPrice($);
    
    // Extract SKU information
    const sku = extractSku($);
    
    // Extract images
    const images = extractImages($);
    
    // Extract availability
    const availability = extractAvailability($);
    
    // Extract metadata
    const metadata = extractMetadata($);

    return {
      title,
      description,
      price,
      sku,
      images,
      availability,
      rawHtml: html,
      metadata
    };
  } catch (error) {
    throw new Error(`Fallback scraping failed for ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Main scraping function with fingerprinting fallback
export async function scrapeEcommercePage(url: string): Promise<ScrapedData> {
  try {
    return await scrapeEcommercePageWithPuppeteer(url);
  } catch (error) {
    console.log(`Puppeteer scraping failed, trying fingerprinting method: ${error instanceof Error ? error.message : 'Unknown error'}`);
    try {
      const { scrapeWithFingerprinting } = await import('./fingerprint-scraper.js');
      return await scrapeWithFingerprinting(url);
    } catch (fingerprintError) {
      console.log(`Fingerprinting failed, trying stealth method: ${fingerprintError instanceof Error ? fingerprintError.message : 'Unknown error'}`);
      try {
        const { scrapeWithStealth } = await import('./stealth-scraper.js');
        return await scrapeWithStealth(url);
      } catch (stealthError) {
        console.log(`Stealth scraping failed, trying fallback method: ${stealthError instanceof Error ? stealthError.message : 'Unknown error'}`);
        return await scrapeEcommercePageFallback(url);
      }
    }
  }
}

// Puppeteer-based scraping
async function scrapeEcommercePageWithPuppeteer(url: string): Promise<ScrapedData> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  
  try {
    browser = await getBrowser();
    page = await browser.newPage();
    
    // Set performance optimizations
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      // Block unnecessary resources for faster loading
      if (['image', 'stylesheet', 'font', 'media', 'script'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set additional headers
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });
    
    // Navigate with timeout and retry logic
    let html = '';
    let retries = 3;
    
    while (retries > 0) {
      try {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        
        // Wait for body to be present
        await page.waitForSelector('body', { timeout: 10000 });
        
        // Get the HTML content
        html = await page.content();
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error(`Failed to load page after 3 attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        console.log(`Retry ${3 - retries}/3 for ${url}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const $ = cheerio.load(html);

    // Extract basic information
    const title = $('title').text().trim() || $('h1').first().text().trim();
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || '';

    // Extract price information
    const price = extractPrice($);
    
    // Extract SKU information
    const sku = extractSku($);
    
    // Extract images
    const images = extractImages($);
    
    // Extract availability
    const availability = extractAvailability($);
    
    // Extract metadata
    const metadata = extractMetadata($);

    return {
      title,
      description,
      price,
      sku,
      images,
      availability,
      rawHtml: html,
      metadata
    };

  } catch (error) {
    console.error(`Scraping error for ${url}:`, error);
    throw new Error(`Failed to scrape ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error('Error closing page:', closeError);
      }
    }
  }
}

function extractPrice($: cheerio.CheerioAPI): string {
  // Common price selectors
  const priceSelectors = [
    '[data-price]',
    '.price',
    '.product-price',
    '.current-price',
    '.sale-price',
    '.regular-price',
    '[class*="price"]',
    '[id*="price"]'
  ];

  for (const selector of priceSelectors) {
    const element = $(selector).first();
    if (element.length) {
      const text = element.text().trim();
      const price = text.match(/[\d,]+\.?\d*/);
      if (price) return price[0];
    }
  }

  return '';
}

function extractSku($: cheerio.CheerioAPI): string {
  // Common SKU selectors
  const skuSelectors = [
    '[data-sku]',
    '.sku',
    '.product-sku',
    '[class*="sku"]',
    '[id*="sku"]',
    'meta[property="product:sku"]'
  ];

  for (const selector of skuSelectors) {
    const element = $(selector).first();
    if (element.length) {
      const sku = element.attr('data-sku') || 
                 element.attr('content') || 
                 element.text().trim();
      if (sku) return sku;
    }
  }

  return '';
}

function extractImages($: cheerio.CheerioAPI): string[] {
  const images: string[] = [];
  
  // Product image selectors
  const imageSelectors = [
    '.product-image img',
    '.product-photo img',
    '[data-product-image]',
    '.gallery-image img',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]'
  ];

  for (const selector of imageSelectors) {
    $(selector).each((_, element) => {
      const src = $(element).attr('src') || 
                  $(element).attr('data-src') || 
                  $(element).attr('content');
      if (src && !images.includes(src)) {
        images.push(src);
      }
    });
  }

  return images.slice(0, 10); // Limit to 10 images
}

function extractAvailability($: cheerio.CheerioAPI): string {
  const availabilitySelectors = [
    '.availability',
    '.stock-status',
    '[data-availability]',
    '.in-stock',
    '.out-of-stock'
  ];

  for (const selector of availabilitySelectors) {
    const element = $(selector).first();
    if (element.length) {
      return element.text().trim();
    }
  }

  return '';
}

function extractMetadata($: cheerio.CheerioAPI): Record<string, string> {
  const metadata: Record<string, string> = {};
  
  // Extract all meta tags
  $('meta').each((_, element) => {
    const name = $(element).attr('name') || $(element).attr('property');
    const content = $(element).attr('content');
    if (name && content) {
      metadata[name] = content;
    }
  });

  return metadata;
}

// Cleanup function for graceful shutdown
export async function cleanup(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
} 