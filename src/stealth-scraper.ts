import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { ScrapedData } from './scraper.js';

puppeteer.use(StealthPlugin());

export async function scrapeWithStealth(url: string): Promise<ScrapedData> {
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
      '--disable-default-apps'
    ]
  });

  const page = await browser.newPage();
  
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });

    const html = await page.content();
    
    // Return raw HTML for testing
    return {
      title: await page.title(),
      description: '',
      price: '',
      sku: '',
      images: [],
      availability: '',
      rawHtml: html,
      metadata: {}
    };
  } finally {
    await browser.close();
  }
} 