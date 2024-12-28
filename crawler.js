// File: crawler.js

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

/**
 * Configurations
 */
const MAX_DEPTH = 3; // Depth of recursive crawling
const PRODUCT_PATTERNS = [/\/product\//, /\/item\//, /\/p\//]; // Common product URL patterns
const TIMEOUT = 10000; // Timeout for requests
const PARALLEL_REQUESTS = 5; // Number of concurrent requests
const RETRY_LIMIT = 3; // Number of retry attempts for failed requests
const DELAY_BETWEEN_REQUESTS = 1000; // Delay between requests in milliseconds

/**
 * Helper function to validate URLs
 */
const isValidUrl = (url, baseDomain) => {
  try {
    const parsedUrl = new URL(url, baseDomain);
    return parsedUrl.hostname.includes(baseDomain);
  } catch (e) {
    return false;
  }
};

/**
 * Check if URL matches product patterns
 */
const isProductUrl = (url) => {
  return PRODUCT_PATTERNS.some((pattern) => pattern.test(url));
};

/**
 * Helper function to introduce a delay
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Crawl a single URL
 */
const crawlUrl = async (url, baseDomain, visitedUrls, depth) => {
  if (depth > MAX_DEPTH || visitedUrls.has(url)) return [];
  visitedUrls.add(url);

  let attempts = 0;
  while (attempts < RETRY_LIMIT) {
    try {
      const response = await axios.get(url, {
        timeout: TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        },
      });
      const $ = cheerio.load(response.data);

      const productUrls = new Set();
      const internalUrls = [];

      // Find all links on the page
      $('a[href]').each((_, element) => {
        const link = $(element).attr('href');

        if (isValidUrl(link, baseDomain)) {
          const absoluteUrl = new URL(link, baseDomain).href;

          if (isProductUrl(absoluteUrl)) {
            productUrls.add(absoluteUrl);
          } else if (!visitedUrls.has(absoluteUrl)) {
            internalUrls.push(absoluteUrl);
          }
        }
      });

      // Recursively crawl internal links
      for (const internalUrl of internalUrls) {
        await delay(DELAY_BETWEEN_REQUESTS); // Throttle requests
        const childProductUrls = await crawlUrl(internalUrl, baseDomain, visitedUrls, depth + 1);
        childProductUrls.forEach((url) => productUrls.add(url));
      }

      return Array.from(productUrls);
    } catch (err) {
      if (err.response?.status === 429) {
        console.log(`Rate limit hit for ${url}. Retrying after delay...`);
        await delay(3000); // Wait 3 seconds before retrying
        attempts++;
      } else {
        console.error(`Failed to crawl ${url}:`, err.message);
        return [];
      }
    }
  }
  return [];
};

/**
 * Main crawler function
 */
const crawlDomain = async (domain) => {
  console.log(`Crawling domain: ${domain}`);
  const visitedUrls = new Set();
  const productUrls = await crawlUrl(domain, domain, visitedUrls, 0);
  return { domain, productUrls };
};

/**
 * Parallel execution of crawling tasks
 */
const crawlDomains = async (domains) => {
  const results = [];

  for (let i = 0; i < domains.length; i += PARALLEL_REQUESTS) {
    const tasks = domains.slice(i, i + PARALLEL_REQUESTS).map(crawlDomain);
    const batchResults = await Promise.all(tasks);
    results.push(...batchResults);
  }

  return results;
};

/**
 * Save results to a file
 */
const saveResults = (results) => {
  const outputPath = path.join(__dirname, 'output.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${outputPath}`);
};

/**
 * Entry point
 */
(async () => {
  const domains = [
    'https://example1.com',
    'https://example2.com',
    'https://example3.com',
  ]; // Replace with actual domains

  const results = await crawlDomains(domains);
  saveResults(results);
})();
