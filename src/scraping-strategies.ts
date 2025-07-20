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
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));
    
    const options = await ipStrategy.getFetchOptions(url);
    const response = await fetch(url, options as any);
    
    if (!response.ok) {
      if (response.status === 403) {
        console.warn('⚠️ 403 Forbidden - site may be blocking requests');
        throw new Error(`HTTP 403: Access forbidden - site may be blocking automated requests`);
      }
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
    
    // Rotate User-Agents to avoid detection
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ];
    
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    const baseOptions = await ipStrategy.getFetchOptions(url);
    const enhancedOptions: RequestInit = {
      ...baseOptions,
      headers: {
        ...baseOptions.headers,
        'User-Agent': randomUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-GPC': '1'
      }
    };
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    
    let response;
    try {
      response = await fetch(url, enhancedOptions as any);
    } catch (error) {
      console.warn('⚠️ Fetch failed, trying with simpler headers...');
      // Try with simpler headers if the enhanced ones fail
      const simpleOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      };
      response = await fetch(url, simpleOptions as any);
    }
    
    if (!response.ok) {
      if (response.status === 403) {
        console.warn('⚠️ 403 Forbidden - trying mobile user agent...');
        // Try with mobile user agent as fallback
        const mobileOptions = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          }
        };
        response = await fetch(url, mobileOptions as any);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText} - all fallback attempts failed`);
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    }
    
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Extract JSON from script tags - comprehensive extraction
    const jsonData: any = {};
    
    // Universal JSON extraction from all script tags
    const allScripts = document.querySelectorAll('script');
    let scriptIndex = 0;
    
    allScripts.forEach((script) => {
      const content = script.textContent || '';
      const type = script.getAttribute('type') || '';
      const id = script.getAttribute('id') || '';
      
      // Skip empty scripts
      if (!content.trim()) return;
      
      // Priority 1: Structured JSON scripts (application/json, application/ld+json, text/json)
      if (type.includes('json') || type === 'text/json') {
        try {
          const data = JSON.parse(content);
          const key = id ? `structured_${id}` : `structured_${scriptIndex}`;
          jsonData[key] = data;
          console.log(`🔍 Found structured JSON: ${key} (script ${scriptIndex})`);
          console.log(`🔍 Script content preview:`, content.substring(0, 200) + '...');
          scriptIndex++;
        } catch (e) {
          console.log(`❌ Failed to parse structured JSON ${scriptIndex}:`, e);
        }
      }
      
      // Priority 2: Look for JSON patterns in any script tag
      else if (content.includes('"product"') || content.includes('"sku"') || content.includes('"price"') || 
               content.includes('"brand"') || content.includes('"title"') || content.includes('"description"') ||
               content.includes('window.') || content.includes('__INITIAL_STATE__') || content.includes('__PRELOADED_STATE__')) {
        
        // Try to extract JSON objects from the content
        try {
          // Look for window assignments
          const windowMatches = content.match(/window\.\w+\s*=\s*({.+?});/gs);
          if (windowMatches) {
            windowMatches.forEach((match, matchIndex) => {
              try {
                const jsonMatch = match.match(/window\.\w+\s*=\s*({.+?});/s);
                if (jsonMatch) {
                  const data = JSON.parse(jsonMatch[1]);
                  const key = `window_state_${scriptIndex}_${matchIndex}`;
                  jsonData[key] = data;
                  console.log(`🔍 Found window state JSON: ${key}`);
                }
              } catch (e) {
                // Skip invalid JSON
              }
            });
          }
          
          // Look for any JSON object patterns
          const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
          if (jsonMatches) {
            jsonMatches.forEach((match, matchIndex) => {
              try {
                const data = JSON.parse(match);
                if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                  // Only add if it looks like product data
                  if (data.product || data.sku || data.price || data.brand || data.title || 
                      data.offers || data.variants || data.images || data.description) {
                    const key = `script_json_${scriptIndex}_${matchIndex}`;
                    jsonData[key] = data;
                    console.log(`🔍 Found product JSON: ${key}`);
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
    

    
    // Additional JSON extraction from entire HTML content
    if (Object.keys(jsonData).length === 0) {
      console.log('🔍 No JSON found in script tags, searching entire HTML...');
      
      // Look for JSON patterns in the entire HTML
      const jsonPatterns = [
        /"product":\s*\{[^}]*\}/g,
        /"sku":\s*"[^"]*"/g,
        /"price":\s*"[^"]*"/g,
        /"brand":\s*"[^"]*"/g,
        /"title":\s*"[^"]*"/g,
        /"description":\s*"[^"]*"/g
      ];
      
      jsonPatterns.forEach((pattern, index) => {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          jsonData[`html_pattern_${index}`] = matches.slice(0, 10); // Limit to first 10 matches
        }
      });
      
      // Look for Sephora-specific data attributes
      const dataElements = document.querySelectorAll('[data-*]');
      const dataAttributes: any = {};
      dataElements.forEach((el, index) => {
        if (index < 50) { // Limit to first 50 elements
          const attrs = el.attributes;
          for (let i = 0; i < attrs.length; i++) {
            const attr = attrs[i];
            if (attr.name.startsWith('data-') && attr.value) {
              dataAttributes[`${el.tagName}_${attr.name}`] = attr.value;
            }
          }
        }
      });
      
      if (Object.keys(dataAttributes).length > 0) {
        jsonData['data_attributes'] = dataAttributes;
      }
    }
    
    // Basic HTML extraction
    const title = document.querySelector('h1, .product-title, .title')?.textContent?.trim() || '';
    const price = document.querySelector('.price, .product-price, [data-price]')?.textContent?.trim() || '';
    const images = Array.from(document.querySelectorAll('img[src*="product"], img[data-src*="product"]'))
      .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
      .filter(Boolean) as string[];
    
    console.log(`🔍 JSON extraction results: ${Object.keys(jsonData).length} JSON objects found`);
    
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
    
    // Validate that we're not trying to use residential proxy with Puppeteer
    if (ipStrategy.name === 'residential') {
      console.warn('⚠️ Residential proxy not supported with Puppeteer, falling back to datacenter IP');
      // Fall back to datacenter IP for Puppeteer
      const datacenterIP = new DatacenterIP();
      return this.extractWithPuppeteer(url, datacenterIP);
    }
    
    return this.extractWithPuppeteer(url, ipStrategy);
  }
  
  private async extractWithPuppeteer(url: string, ipStrategy: IPStrategy): Promise<ScrapedData> {
    const startTime = performance.now();
    // Import Puppeteer dynamically to avoid startup overhead
    const { scrapeWithFingerprinting } = await import('./fingerprint-scraper.js');
    
    // Pass IP strategy info to the fingerprint scraper
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