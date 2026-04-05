/**
 * Firecrawl — JS-rendered web scraping.
 *
 * Firecrawl renders pages in a real browser, bypasses anti-bot,
 * and returns clean markdown. Perfect for e-commerce sites that
 * render prices via JavaScript.
 *
 * Free tier: 500 credits (1 credit per scrape).
 */
import { logger } from "@/lib/logger";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ScrapeResult {
  url: string;
  markdown: string;
  title?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Firecrawl Client                                                   */
/* ------------------------------------------------------------------ */

/**
 * Scrape a single URL with Firecrawl.
 * Returns JS-rendered page content as clean markdown.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return { url, markdown: "", error: "FIRECRAWL_API_KEY not set" };
  }

  const t0 = Date.now();

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        waitFor: 3000, // Wait 3s for JS to render
        timeout: 15000,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error("firecrawl", "scrape_failed", { url, status: res.status, error: errText });
      return { url, markdown: "", error: `Firecrawl error: ${res.status}` };
    }

    const data = await res.json();
    const markdown = data.data?.markdown || "";
    const title = data.data?.metadata?.title || "";

    logger.info("firecrawl", "scraped", {
      url,
      markdownLength: markdown.length,
      responseTime: Date.now() - t0,
    });

    return { url, markdown, title };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("firecrawl", "error", { url, error: msg });
    return { url, markdown: "", error: msg };
  }
}

/**
 * Scrape multiple URLs in parallel.
 */
export async function scrapeUrls(urls: string[]): Promise<ScrapeResult[]> {
  if (urls.length === 0) return [];

  const t0 = Date.now();
  const results = await Promise.all(urls.map(scrapeUrl));

  logger.info("firecrawl", "batch_done", {
    total: urls.length,
    success: results.filter((r) => r.markdown).length,
    failed: results.filter((r) => r.error).length,
    totalTime: Date.now() - t0,
  });

  return results;
}
