# Ecommerce Scraper

A fast and performant TypeScript server for scraping ecommerce pages with advanced fingerprinting and AI-powered structured data extraction.

## Features

- 🚀 **High Performance**: Optimized web scraping with Puppeteer and Cheerio
- 🤖 **AI-Powered**: Uses Vercel AI SDK for intelligent structured data extraction
- 🛡️ **Advanced Fingerprinting**: Bypasses bot detection with Apify fingerprint-suite
- 🌐 **Multiple Strategies**: Fingerprinting, stealth, puppeteer, and fetch fallbacks
- 🛡️ **Rate Limiting**: Built-in protection against abuse
- 📝 **Comprehensive Output**: Extracts title, brand, price, variants, images, and metadata

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Or run in development mode
npm run dev
```

## Environment Setup

Create a `.env` file in the root directory:

```env
PORT=8080
OPENAI_API_KEY=your_openai_api_key_here
```

## Usage

### Web Interface

The scraper includes a minimal web UI for easy testing:

1. Start the server: `npm run dev`
2. Open http://localhost:8080 in your browser
3. Enter a product URL and select scraping strategy
4. View the structured JSON output

### HTTP API

#### Health Check

```bash
curl http://localhost:8080/health
```

#### Scrape Single Page

```bash
# POST request with JSON body
curl -X POST http://localhost:8080/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/product/123", "strategy": "fingerprint", "useAI": true}'
```

#### Direct URL Scraping

```bash
# GET request with URL parameter
curl "http://localhost:8080/scrape/https%3A//example.com/product/123?strategy=fingerprint&ai=true"
```

## API Response Format

### With AI Processing

```json
{
  "status": "completed",
  "title": "Product Name",
  "brand": "Brand Name",
  "price": 99.99,
  "all_variants": [
    {
      "variant_specifics": [
        {
          "dimension": "Size",
          "value": "Large"
        }
      ],
      "product_id": "ABC123"
    }
  ],
  "main_image": "https://example.com/image1.jpg",
  "images": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
  "product_description": "Product description text",
  "feature_bullets": ["Feature 1", "Feature 2"],
  "categories": ["Category 1", "Category 2"],
  "review_count": 150,
  "stars": 4.5,
  "product_id": "ABC123"
}
```

### Without AI Processing

```json
{
  "url": "https://example.com/product/123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "rawData": {
    "title": "Product Title",
    "description": "Product Description",
    "price": "$99.99",
    "images": ["https://example.com/image1.jpg"],
    "html": "<html>...</html>"
  }
}
```

## Performance Optimizations

- **Resource Blocking**: Blocks unnecessary resources (images, CSS, fonts) during scraping
- **Browser Caching**: Reuses browser instances for faster subsequent requests
- **Request Interception**: Optimizes network requests for speed
- **Timeout Management**: Configurable timeouts to prevent hanging requests
- **Rate Limiting**: Built-in protection against abuse

## Supported Ecommerce Platforms

The scraper is designed to work with most ecommerce platforms including:

- Shopify stores
- WooCommerce sites
- Magento stores
- Custom ecommerce platforms
- Amazon (basic support)
- eBay (basic support)

## Error Handling

The application includes comprehensive error handling:

- Network timeouts
- Invalid URLs
- Blocked requests
- AI processing failures
- Graceful degradation to fallback extraction

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Deployment

The project is configured for deployment on Railway:

1. **Fork/Clone** this repository
2. **Connect** to Railway from your GitHub account
3. **Set Environment Variables**:
   - `OPENAI_API_KEY`: Your OpenAI API key
4. **Deploy** - Railway will automatically build and deploy

The app will be available at your Railway URL.

## Project Structure

```
src/
├── index.ts              # Main HTTP server
├── scraper.ts            # Basic web scraping logic
├── fingerprint-scraper.ts # Advanced fingerprinting scraper
├── stealth-scraper.ts    # Stealth mode scraper
├── ai-processor.ts       # AI-powered structured data extraction
├── schema.ts             # Zod schema for product data
└── public/
    └── index.html        # Web UI
```

## Dependencies

- **Puppeteer**: Headless browser automation
- **Cheerio**: Server-side jQuery for HTML parsing
- **Vercel AI SDK**: AI-powered structured data extraction
- **Express**: HTTP server framework
- **Apify fingerprint-suite**: Advanced browser fingerprinting
- **Puppeteer-extra**: Enhanced Puppeteer with stealth plugins

## License

ISC 