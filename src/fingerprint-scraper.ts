import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import { ScrapedData } from './scraper.js';

puppeteer.use(StealthPlugin());

export async function scrapeWithFingerprinting(url: string): Promise<ScrapedData> {
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
      '--disable-javascript',
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
    
    // Navigate with realistic timing
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // Add some random mouse movements to look human
    await page.mouse.move(
      Math.random() * 1920,
      Math.random() * 1080
    );

    // Wait a bit for any dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

    // Scroll a bit to simulate human behavior
    await page.evaluate(() => {
      window.scrollTo(0, Math.random() * 500);
    });

    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    const html = await page.content();
    const title = await page.title();
    
    console.log('✅ Successfully scraped with fingerprinting');
    
    return {
      title,
      description: '',
      price: '',
      sku: '',
      images: [],
      availability: '',
      rawHtml: html,
      metadata: {
        fingerprint: JSON.stringify(fingerprint),
        userAgent: fingerprint.headers['user-agent'],
        headers: JSON.stringify(fingerprint.headers)
      }
    };

  } catch (error) {
    console.error('❌ Fingerprinting scraping failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
} 