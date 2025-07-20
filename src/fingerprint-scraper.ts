import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
// Define the ScrapedData interface locally since scraper.ts was deleted
export interface ScrapedData {
  title: string;
  description: string;
  price: string;
  sku: string;
  images: string[];
  availability: string;
  rawHtml: string;
  metadata: Record<string, any>;
}

puppeteer.use(StealthPlugin());

export async function scrapeWithFingerprinting(url: string): Promise<ScrapedData> {
  const scrapeStart = performance.now();
  
  // Generate a realistic browser fingerprint
  const generator = new FingerprintGenerator({
    browsers: [
      { name: 'chrome', minVersion: 120 }
    ],
    devices: ['desktop'],
    locales: ['en-US', 'en']
  });

  const fingerprint = generator.getFingerprint();
  
  console.log('🔍 Using fingerprint:', {
    userAgent: fingerprint.headers['user-agent'],
    headers: Object.keys(fingerprint.headers)
  });

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || 
                   (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-images',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-features=TranslateUI',
      '--no-default-browser-check',
      '--no-pings',
      '--hide-scrollbars',
      '--mute-audio',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-sync',
      '--disable-translate',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--ignore-certificate-errors-spki-list',
      '--allow-running-insecure-content',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-ipc-flooding-protection'
    ]
  });

  const page = await browser.newPage();
  
  try {
    // Inject the fingerprint
    const injector = new FingerprintInjector();
    await injector.attachFingerprintToPuppeteer(page, fingerprint);

    // Set additional headers to look more human
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': fingerprint.headers['user-agent']
    });

    // Add some human-like behavior
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });

    console.log('🌐 Navigating to:', url);
    
    // Navigate and wait for the page to be fully interactive
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Wait for the page to be fully loaded and interactive
    await page.waitForFunction(() => {
      return document.readyState === 'complete' && 
             !document.querySelector('.loading, .spinner, [aria-busy="true"]');
    }, { timeout: 10000 }).catch(() => console.log('Page load timeout, continuing...'));

    // Simulate human interaction to trigger any lazy loading
    await page.mouse.move(100, 100);
    await page.mouse.move(500, 300);
    
    // Scroll through the page to trigger all lazy loading
    await page.evaluate(() => {
      const scrollHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;
      const scrollSteps = Math.ceil(scrollHeight / viewportHeight);
      
      for (let i = 0; i < scrollSteps; i++) {
        window.scrollTo(0, i * viewportHeight);
      }
      window.scrollTo(0, 0);
    });

    // Wait for any remaining network requests
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the full HTML content - let the LLM interpret everything
    const html = await page.content();
    const title = await page.title();
    
    // Use Cheerio to extract ALL images and data attributes
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);
    
    // Extract ALL images from the page - completely universal
    const images: string[] = [];
    $('img').each((_, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src');
      if (src && !images.includes(src)) {
        images.push(src);
      }
    });
    
    // Extract ALL data attributes from ALL elements - completely universal
    const allData: Record<string, any> = {};
    $('*').each((_, element) => {
      const $el = $(element);
      const dataAttrs: Record<string, string> = {};
      
      // Get ALL data attributes using Cheerio's attr method
      const allAttrs = $el.attr();
      if (allAttrs) {
        Object.keys(allAttrs).forEach(attr => {
          if (attr.startsWith('data-')) {
            dataAttrs[attr] = allAttrs[attr];
          }
        });
      }
      
      if (Object.keys(dataAttrs).length > 0) {
        const tagName = $el.prop('tagName')?.toLowerCase() || 'unknown';
        const className = $el.attr('class') || 'no-class';
        const id = $el.attr('id') || 'no-id';
        const key = `${tagName}_${className}_${id}`;
        allData[key] = {
          text: $el.text().trim(),
          data: dataAttrs,
          tagName,
          className,
          id
        };
      }
    });
    
    // Extract ALL text content from ALL elements - completely universal
    const textContent: Record<string, string> = {};
    $('*').each((_, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      if (text && text.length > 0) {
        const tagName = $el.prop('tagName')?.toLowerCase() || 'unknown';
        const className = $el.attr('class') || 'no-class';
        const id = $el.attr('id') || 'no-id';
        const key = `${tagName}_${className}_${id}`;
        textContent[key] = text;
      }
    });
    
    // Extract ALL JSON data from script tags - this is often the most reliable source
    const jsonData: Record<string, any> = {};
    $('script[type="application/json"], script[type="text/json"], script[id*="json"], script[data-comp]').each((_, script) => {
      const $script = $(script);
      const scriptId = $script.attr('id') || 'no-id';
      const scriptType = $script.attr('type') || 'no-type';
      const dataComp = $script.attr('data-comp') || 'no-comp';
      const key = `script_${scriptId}_${scriptType}_${dataComp}`;
      
      try {
        const scriptContent = $script.html();
        if (scriptContent && scriptContent.trim()) {
          const parsed = JSON.parse(scriptContent);
          jsonData[key] = parsed;
        }
      } catch (error) {
        // Skip invalid JSON
        console.log(`Skipping invalid JSON in script ${key}`);
      }
    });
    
    // Also look for JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, script) => {
      const $script = $(script);
      try {
        const scriptContent = $script.html();
        if (scriptContent && scriptContent.trim()) {
          const parsed = JSON.parse(scriptContent);
          jsonData[`ld_json_${$script.attr('id') || 'no-id'}`] = parsed;
        }
      } catch (error) {
        console.log('Skipping invalid JSON-LD');
      }
    });
    
    const extractedData = {
      title,
      images,
      allData,
      textContent,
      jsonData,
      html
    };

    console.log('✅ Successfully scraped with fingerprinting');
    console.log('📊 Extracted data:', {
      title: extractedData.title,
      imageCount: extractedData.images.length,
      dataAttributesCount: Object.keys(extractedData.allData).length,
      textContentCount: Object.keys(extractedData.textContent).length,
      jsonDataCount: Object.keys(extractedData.jsonData).length
    });
    
    return {
      title: extractedData.title,
      description: '',
      price: '',
      sku: '',
      images: extractedData.images,
      availability: '',
      rawHtml: extractedData.html,
      metadata: {
        fingerprint: JSON.stringify(fingerprint),
        userAgent: fingerprint.headers['user-agent'],
        headers: JSON.stringify(fingerprint.headers),
        allData: JSON.stringify(extractedData.allData),
        textContent: JSON.stringify(extractedData.textContent),
        jsonData: JSON.stringify(extractedData.jsonData),
        imageCount: extractedData.images.length.toString(),
        dataAttributesCount: Object.keys(extractedData.allData).length.toString(),
        jsonDataCount: Object.keys(extractedData.jsonData).length.toString(),
        scrapeTime: (performance.now() - scrapeStart).toString(),
        strategy: 'fingerprint'
      }
    };

  } catch (error) {
    console.error('❌ Fingerprinting scraping failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
} 