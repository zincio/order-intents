import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

interface ScrapedData {
  title: string;
  price: string;
  sku: string;
  images: string[];
  rawHtml: string;
  metadata: any;
}

export async function scrapeWithFastStrategy(url: string): Promise<ScrapedData> {
  const startTime = performance.now();
  console.log(`🚀 Fast scraping: ${url}`);
  
  try {
    // Strategy 1: Try to find and call the site's API directly
    const apiData = await tryDirectAPI(url);
    if (apiData) {
      console.log('✅ Direct API success');
      return {
        ...apiData,
        rawHtml: '', // Not needed for API data
        metadata: {
          strategy: 'api-direct',
          scrapeTime: performance.now() - startTime,
          method: 'fast'
        }
      };
    }

    // Strategy 2: Fetch with browser headers and extract JSON
    const fetchData = await tryFetchWithHeaders(url);
    if (fetchData) {
      console.log('✅ Fetch with headers success');
      return {
        ...fetchData,
        metadata: {
          strategy: 'fetch-json',
          scrapeTime: performance.now() - startTime,
          method: 'fast'
        }
      };
    }

    // Strategy 3: Extract JSON-LD structured data
    const jsonLdData = await tryJsonLdExtraction(url);
    if (jsonLdData) {
      console.log('✅ JSON-LD extraction success');
      return {
        ...jsonLdData,
        metadata: {
          strategy: 'json-ld',
          scrapeTime: performance.now() - startTime,
          method: 'fast'
        }
      };
    }

    // Strategy 4: Try mobile API endpoints
    const mobileData = await tryMobileAPI(url);
    if (mobileData) {
      console.log('✅ Mobile API success');
      return {
        ...mobileData,
        metadata: {
          strategy: 'mobile-api',
          scrapeTime: performance.now() - startTime,
          method: 'fast'
        }
      };
    }

    console.log('❌ All fast strategies failed, falling back to Puppeteer');
    throw new Error('Fast strategies failed');

  } catch (error) {
    console.log('❌ Fast scraping failed:', error.message);
    throw error;
  }
}

async function tryDirectAPI(url: string): Promise<ScrapedData | null> {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const path = urlObj.pathname;
    
    // Common API patterns for different sites
    const apiPatterns = [
      // Sephora
      `https://www.sephora.com/api/users/profiles/current/product/${path.split('/').pop()}`,
      // Amazon
      `https://www.amazon.com/gp/product/ajax/ref=dp_aod_ALL_m1?asin=${path.split('/').pop()}`,
      // Generic product API
      `${urlObj.origin}/api/products${path}`,
      `${urlObj.origin}/api/v1/products${path}`,
      `${urlObj.origin}/products${path}.json`,
    ];

    for (const apiUrl of apiPatterns) {
      try {
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': url,
          },
          timeout: 5000
        });

        if (response.ok) {
          const data = await response.json();
          return parseAPIResponse(data, domain);
        }
      } catch (e) {
        // Continue to next pattern
      }
    }
  } catch (error) {
    // Continue to next strategy
  }
  
  return null;
}

async function tryFetchWithHeaders(url: string): Promise<ScrapedData | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 10000
    });

    if (!response.ok) return null;

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract JSON from script tags
    const scripts = document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]');
    const jsonData: any = {};

    scripts.forEach((script, index) => {
      try {
        const data = JSON.parse(script.textContent || '');
        jsonData[`script_${index}`] = data;
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Look for JSON in script tags with specific patterns
    const allScripts = document.querySelectorAll('script');
    allScripts.forEach((script, index) => {
      const content = script.textContent || '';
      if (content.includes('window.__INITIAL_STATE__') || 
          content.includes('window.__PRELOADED_STATE__') ||
          content.includes('window.__APOLLO_STATE__') ||
          content.includes('window.__NEXT_DATA__')) {
        try {
          // Extract JSON from window assignments
          const jsonMatch = content.match(/window\.\w+\s*=\s*({.+?});/s);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[1]);
            jsonData[`window_state_${index}`] = data;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });

    if (Object.keys(jsonData).length > 0) {
      return parseJsonData(jsonData, url);
    }

  } catch (error) {
    console.log('Fetch with headers failed:', error.message);
  }
  
  return null;
}

async function tryJsonLdExtraction(url: string): Promise<ScrapedData | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      timeout: 8000
    });

    if (!response.ok) return null;

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract JSON-LD structured data
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    const jsonLdData: any[] = [];

    jsonLdScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent || '');
        if (Array.isArray(data)) {
          jsonLdData.push(...data);
        } else {
          jsonLdData.push(data);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });

    if (jsonLdData.length > 0) {
      return parseJsonLdData(jsonLdData, url);
    }

  } catch (error) {
    console.log('JSON-LD extraction failed:', error.message);
  }
  
  return null;
}

async function tryMobileAPI(url: string): Promise<ScrapedData | null> {
  try {
    const urlObj = new URL(url);
    const mobileUrl = url.replace(urlObj.hostname, `m.${urlObj.hostname}`);
    
    const response = await fetch(mobileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 8000
    });

    if (!response.ok) return null;

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Mobile sites often have simpler structure
    const title = document.querySelector('h1, .product-title, .title')?.textContent?.trim() || '';
    const price = document.querySelector('.price, .product-price, [data-price]')?.textContent?.trim() || '';
    const images = Array.from(document.querySelectorAll('img[src*="product"], img[data-src*="product"]'))
      .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
      .filter(Boolean) as string[];

    if (title || price || images.length > 0) {
      return {
        title,
        price,
        sku: '',
        images,
        rawHtml: html,
        metadata: {
          strategy: 'mobile-html',
          method: 'fast'
        }
      };
    }

  } catch (error) {
    console.log('Mobile API failed:', error.message);
  }
  
  return null;
}

function parseAPIResponse(data: any, domain: string): ScrapedData {
  // Generic API response parsing
  const title = data.title || data.name || data.productName || '';
  const price = data.price || data.currentPrice || data.salePrice || '';
  const sku = data.sku || data.productId || data.id || '';
  const images = data.images || data.imageUrls || data.media || [];

  return {
    title,
    price: price.toString(),
    sku: sku.toString(),
    images: Array.isArray(images) ? images : [],
    rawHtml: '',
    metadata: {
      strategy: 'api-direct',
      method: 'fast'
    }
  };
}

function parseJsonData(jsonData: any, url: string): ScrapedData {
  // Parse various JSON patterns found in script tags
  let title = '';
  let price = '';
  let sku = '';
  let images: string[] = [];

  // Look for product data in common patterns
  Object.values(jsonData).forEach((data: any) => {
    if (typeof data === 'object' && data) {
      // Common product data patterns
      if (data.product) {
        title = data.product.title || data.product.name || title;
        price = data.product.price || data.product.currentPrice || price;
        sku = data.product.sku || data.product.productId || sku;
        if (data.product.images) {
          images = [...images, ...data.product.images];
        }
      }
      
      // Direct product properties
      if (data.title && !title) title = data.title;
      if (data.price && !price) price = data.price;
      if (data.sku && !sku) sku = data.sku;
      if (data.images && !images.length) images = data.images;
    }
  });

  return {
    title,
    price: price.toString(),
    sku: sku.toString(),
    images: Array.isArray(images) ? images : [],
    rawHtml: '',
    metadata: {
      strategy: 'fetch-json',
      method: 'fast',
      jsonData: JSON.stringify(jsonData)
    }
  };
}

function parseJsonLdData(jsonLdData: any[], url: string): ScrapedData {
  // Parse JSON-LD structured data
  let title = '';
  let price = '';
  let sku = '';
  let images: string[] = [];

  jsonLdData.forEach(data => {
    if (data['@type'] === 'Product') {
      title = data.name || data.title || title;
      price = data.offers?.price || data.price || price;
      sku = data.sku || data.productID || data.gtin || sku;
      
      if (data.image) {
        if (Array.isArray(data.image)) {
          images = [...images, ...data.image];
        } else {
          images.push(data.image);
        }
      }
    }
  });

  return {
    title,
    price: price.toString(),
    sku: sku.toString(),
    images,
    rawHtml: '',
    metadata: {
      strategy: 'json-ld',
      method: 'fast',
      jsonData: JSON.stringify(jsonLdData)
    }
  };
} 