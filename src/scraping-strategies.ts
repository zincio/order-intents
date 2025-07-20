import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ScrapedData {
  title: string;
  price: string;
  sku: string;
  images: string[];
  rawHtml: string;
  metadata: any;
}

export interface IPStrategy {
  name: string;
  description: string;
  getFetchOptions(url: string): Promise<RequestInit>;
}

export interface ExtractionStrategy {
  name: string;
  description: string;
  extract(url: string, ipStrategy: IPStrategy): Promise<ScrapedData>;
}

// IP Strategies
export class DatacenterIP implements IPStrategy {
  name = 'datacenter';
  description = 'Direct connection (datacenter IP)';
  
  async getFetchOptions(url: string): Promise<RequestInit> {
    return {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    } as RequestInit;
  }
}

export class ResidentialIP implements IPStrategy {
  name = 'residential';
  description = 'Residential proxy (via Oculus)';
  
  async getFetchOptions(url: string): Promise<RequestInit> {
    const oculusUsername = process.env.OCULUS_USERNAME;
    const oculusPassword = process.env.OCULUS_PASSWORD;
    const oculusCountry = process.env.OCULUS_COUNTRY || 'US';
    const oculusSession = process.env.OCULUS_SESSION || Math.floor(Math.random() * 10000).toString();
    
    if (!oculusUsername || !oculusPassword) {
      console.warn('⚠️ Oculus credentials not found, falling back to datacenter IP');
      return new DatacenterIP().getFetchOptions(url);
    }
    
    // Oculus proxy format: oc-{username}-country-{country}-session-{session}:{password}@proxy.oculus-proxy.com:31114
    const proxyUrl = `http://${oculusUsername}-country-${oculusCountry}-session-${oculusSession}:${oculusPassword}@proxy.oculus-proxy.com:31114`;
    
    console.log(`🔍 Using Oculus proxy: ${oculusUsername}-country-${oculusCountry}-session-${oculusSession}@proxy.oculus-proxy.com:31114`);
    
    // Create proxy agent
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    
    return {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    } as RequestInit;
  }
}

// Extraction Strategies
export class FetchStrategy implements ExtractionStrategy {
  name = 'fetch';
  description = 'Simple HTTP fetch';
  
  async extract(url: string, ipStrategy: IPStrategy): Promise<ScrapedData> {
    const startTime = performance.now();
    console.log(`🔍 Fetch strategy: ${url} with ${ipStrategy.name} IP`);
    
    const options = await ipStrategy.getFetchOptions(url);
    const response = await fetch(url, options as any);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Basic HTML extraction
    const title = document.querySelector('h1, .product-title, .title')?.textContent?.trim() || '';
    const price = document.querySelector('.price, .product-price, [data-price]')?.textContent?.trim() || '';
    const images = Array.from(document.querySelectorAll('img[src*="product"], img[data-src*="product"]'))
      .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
      .filter(Boolean) as string[];
    
    return {
      title,
      price,
      sku: '',
      images,
      rawHtml: html,
      metadata: {
        strategy: 'fetch',
        ipStrategy: ipStrategy.name,
        scrapeTime: performance.now() - startTime,
        method: 'fetch'
      }
    };
  }
}

export class FetchHeadersStrategy implements ExtractionStrategy {
  name = 'fetch-headers';
  description = 'Fetch with browser-like headers';
  
  async extract(url: string, ipStrategy: IPStrategy): Promise<ScrapedData> {
    const startTime = performance.now();
    console.log(`🔍 Fetch+Headers strategy: ${url} with ${ipStrategy.name} IP`);
    
    const baseOptions = await ipStrategy.getFetchOptions(url);
    const enhancedOptions: RequestInit = {
      ...baseOptions,
      headers: {
        ...baseOptions.headers,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      }
    };
    
    const response = await fetch(url, enhancedOptions as any);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Extract JSON from script tags - comprehensive extraction
    const jsonData: any = {};
    
    // First, look for structured JSON scripts
    const structuredScripts = document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]');
    structuredScripts.forEach((script, index) => {
      try {
        const data = JSON.parse(script.textContent || '');
        jsonData[`script_${index}`] = data;
      } catch (e) {
        // Skip invalid JSON
      }
    });
    
    // Look for all script tags and extract JSON patterns
    const allScripts = document.querySelectorAll('script');
    allScripts.forEach((script, index) => {
      const content = script.textContent || '';
      
      // Look for window assignments
      if (content.includes('window.__INITIAL_STATE__') || 
          content.includes('window.__PRELOADED_STATE__') ||
          content.includes('window.__APOLLO_STATE__') ||
          content.includes('window.__NEXT_DATA__')) {
        try {
          const jsonMatch = content.match(/window\.\w+\s*=\s*({.+?});/s);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[1]);
            jsonData[`window_state_${index}`] = data;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
      
      // Look for Sephora-specific patterns (linkStore_text/json_PageJSON)
      if (content.includes('linkStore_text/json_PageJSON') || content.includes('PageJSON')) {
        try {
          // Find JSON object patterns in the script
          const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
          if (jsonMatches) {
            jsonMatches.forEach((match, matchIndex) => {
              try {
                const data = JSON.parse(match);
                if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                  jsonData[`sephora_json_${index}_${matchIndex}`] = data;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
      
      // Look for any JSON-like content in script tags
      if (content.includes('"product"') || content.includes('"sku"') || content.includes('"price"')) {
        try {
          // Try to extract JSON objects from the content
          const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
          if (jsonMatches) {
            jsonMatches.forEach((match, matchIndex) => {
              try {
                const data = JSON.parse(match);
                if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                  // Only add if it looks like product data
                  if (data.product || data.sku || data.price || data.brand || data.title) {
                    jsonData[`product_json_${index}_${matchIndex}`] = data;
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });
    
    // Basic HTML extraction
    const title = document.querySelector('h1, .product-title, .title')?.textContent?.trim() || '';
    const price = document.querySelector('.price, .product-price, [data-price]')?.textContent?.trim() || '';
    const images = Array.from(document.querySelectorAll('img[src*="product"], img[data-src*="product"]'))
      .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
      .filter(Boolean) as string[];
    
    return {
      title,
      price,
      sku: '',
      images,
      rawHtml: html,
      metadata: {
        strategy: 'fetch-headers',
        ipStrategy: ipStrategy.name,
        scrapeTime: performance.now() - startTime,
        method: 'fetch-headers',
        jsonData: Object.keys(jsonData).length > 0 ? JSON.stringify(jsonData) : null
      }
    };
  }
}

export class PuppeteerStrategy implements ExtractionStrategy {
  name = 'puppeteer';
  description = 'Full browser simulation (Puppeteer)';
  
  async extract(url: string, ipStrategy: IPStrategy): Promise<ScrapedData> {
    const startTime = performance.now();
    console.log(`🔍 Puppeteer strategy: ${url} with ${ipStrategy.name} IP`);
    
    // Import Puppeteer dynamically to avoid startup overhead
    const { scrapeWithFingerprinting } = await import('./fingerprint-scraper.js');
    
    // TODO: Configure Puppeteer to use residential proxy when ipStrategy is residential
    const result = await scrapeWithFingerprinting(url);
    
    return {
      ...result,
      metadata: {
        ...result.metadata,
        strategy: 'puppeteer',
        ipStrategy: ipStrategy.name,
        scrapeTime: performance.now() - startTime,
        method: 'puppeteer'
      }
    };
  }
}

// Strategy Registry
export const IP_STRATEGIES: IPStrategy[] = [
  new DatacenterIP(),
  new ResidentialIP()
];

export const EXTRACTION_STRATEGIES: ExtractionStrategy[] = [
  new FetchStrategy(),
  new FetchHeadersStrategy(),
  new PuppeteerStrategy()
];

export function getIPStrategy(name: string): IPStrategy {
  const strategy = IP_STRATEGIES.find(s => s.name === name);
  if (!strategy) {
    throw new Error(`Unknown IP strategy: ${name}`);
  }
  return strategy;
}

export function getExtractionStrategy(name: string): ExtractionStrategy {
  const strategy = EXTRACTION_STRATEGIES.find(s => s.name === name);
  if (!strategy) {
    throw new Error(`Unknown extraction strategy: ${name}`);
  }
  return strategy;
} 