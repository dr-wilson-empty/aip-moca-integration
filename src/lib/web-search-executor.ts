/**
 * Direct in-process web search execution.
 * Bypasses HTTP self-call on serverless platforms.
 */
import { webSearch, formatSearchResults } from "@/lib/web/search";
import { scrapeUrls } from "@/lib/web/firecrawl";
import { logger } from "@/lib/logger";

const PRODUCT_KEYWORDS = ["price", "buy", "fiyat", "satın", "compare", "karşılaştır", "shop", "store", "mağaza", "ucuz", "cheapest", "deal"];

function isProductQuery(query: string): boolean {
  const q = query.toLowerCase();
  return PRODUCT_KEYWORDS.some((kw) => q.includes(kw));
}

export async function executeWebSearchDirect(
  input: string,
): Promise<{ status: "COMPLETED" | "FAILED"; artifact?: string; error?: string }> {
  try {
    const artifact = isProductQuery(input)
      ? await productSearch(input)
      : await generalSearch(input);
    return { status: "COMPLETED", artifact };
  } catch (err) {
    return { status: "FAILED", error: err instanceof Error ? err.message : String(err) };
  }
}

async function generalSearch(userQuery: string): Promise<string> {
  const searchResponse = await webSearch(userQuery);
  if (!searchResponse || searchResponse.results.length === 0) {
    return "No search results found for your query.";
  }

  const formatted = formatSearchResults(searchResponse);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return formatted;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: "You are a web search assistant. Summarize the search results into a clear, well-structured response. Include source URLs. Respond in the same language as the query.",
    messages: [{ role: "user", content: `Query: ${userQuery}\n\nSearch Results:\n${formatted}` }],
  });

  const text = response.content.find((b) => b.type === "text");
  return text?.text ?? formatted;
}

async function productSearch(userQuery: string): Promise<string> {
  logger.info("web_agent", "product_search_start", { query: userQuery });

  const searchResponse = await webSearch(userQuery);
  if (!searchResponse || searchResponse.results.length === 0) {
    return "No product results found.";
  }

  const urls = searchResponse.results
    .filter((r: { url?: string }) => r.url)
    .map((r: { url: string }) => r.url)
    .slice(0, 3);

  let scrapedContent = "";
  if (urls.length > 0) {
    logger.info("web_agent", "scraping_urls", { urls });
    const scraped = await scrapeUrls(urls);
    scrapedContent = scraped
      .filter((s) => !s.error && s.markdown)
      .map((s) => `Source: ${s.url}\n${s.markdown.slice(0, 3000)}`)
      .join("\n\n---\n\n");
  }

  const formatted = formatSearchResults(searchResponse);
  const context = scrapedContent
    ? `Search Results:\n${formatted}\n\nScraped Page Content:\n${scrapedContent}`
    : `Search Results:\n${formatted}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return formatted;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: "You are a product search assistant. Extract prices, availability, and direct purchase URLs from the search results and scraped content. Format clearly with prices and links. Respond in the same language as the query.",
    messages: [{ role: "user", content: `Query: ${userQuery}\n\n${context}` }],
  });

  const text = response.content.find((b) => b.type === "text");
  return text?.text ?? formatted;
}
