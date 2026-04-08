/**
 * Realtime Web Enrichment — auto-detect queries needing current data
 * and inject web search + Firecrawl results into AI prompts.
 *
 * This solves the "2024 stale data" problem by enriching agent prompts
 * with live web data before calling the LLM.
 */
import { webSearch, formatSearchResults, type SearchResponse } from "./search";
import { scrapeUrls, type ScrapeResult } from "./firecrawl";
import { logger } from "@/lib/logger";

/* ------------------------------------------------------------------ */
/*  Current data detection                                             */
/* ------------------------------------------------------------------ */

/** Keywords that strongly indicate the query needs real-time web data */
const CURRENT_DATA_PATTERNS = [
  // Temporal
  /\b(current|latest|today|now|recent|new|this week|this month|2025|2026)\b/i,
  /\b(güncel|bugün|şu an|son|yeni|bu hafta|bu ay)\b/i,
  // Financial
  /\b(price|fiyat|rate|kur|market cap|tvl|volume|hacim|borsa|stock)\b/i,
  // News / Events
  /\b(news|haber|event|etkinlik|announcement|duyuru|update|güncelleme)\b/i,
  // Specific queries
  /\b(weather|hava durumu|score|skor|election|seçim|trending)\b/i,
  // Crypto / DeFi
  /\b(bitcoin|btc|ethereum|eth|solana|sol|usdc|usdt|defi|nft)\b/i,
  // Comparison / Shopping
  /\b(best|en iyi|compare|karşılaştır|review|inceleme|recommend|öner)\b/i,
  // "What is X" patterns that likely need current info
  /\b(how much|ne kadar|what is the|kaç|nedir)\b/i,
];

/** Patterns that indicate the query does NOT need web data (pure text processing) */
const NO_WEB_PATTERNS = [
  /\b(translate|çevir|özetle|summarize|rewrite|yeniden yaz)\b/i,
  /\b(format|düzenle|classify|sınıflandır|categorize)\b/i,
  /\b(code|kod|debug|fix|refactor|audit)\b/i,
  /\b(explain this|bunu açıkla|analyze this text|bu metni)\b/i,
];

/**
 * Detect whether a query needs real-time web data.
 * Returns a confidence score 0-1.
 */
export function detectCurrentDataNeed(query: string): number {
  const q = query.toLowerCase();

  // Check exclusion patterns first
  const noWebScore = NO_WEB_PATTERNS.filter((p) => p.test(q)).length;
  if (noWebScore >= 2) return 0; // Clearly a text processing task

  // Count matching current-data patterns
  const matchCount = CURRENT_DATA_PATTERNS.filter((p) => p.test(q)).length;

  // Question marks boost the score (user asking a question)
  const hasQuestion = q.includes("?") || q.includes("mı") || q.includes("mi");

  let score = matchCount * 0.15;
  if (hasQuestion) score += 0.1;

  return Math.min(score, 1);
}

/**
 * Threshold for auto web enrichment.
 * Queries scoring above this get web data injected.
 */
const ENRICHMENT_THRESHOLD = 0.25;

/* ------------------------------------------------------------------ */
/*  Web enrichment                                                     */
/* ------------------------------------------------------------------ */

export interface EnrichmentResult {
  enriched: boolean;
  webContext: string;
  searchResponse?: SearchResponse;
  scrapeResults?: ScrapeResult[];
  queryUsed: string;
}

/**
 * Auto-enrich a query with web search results if it needs current data.
 *
 * Flow:
 * 1. Detect if query needs current data
 * 2. If yes, run Tavily search
 * 3. For top results, scrape with Firecrawl for full content
 * 4. Return formatted context string to inject into prompt
 */
export async function autoEnrichWithWebData(
  query: string,
  options?: {
    forceEnrich?: boolean;
    maxSearchResults?: number;
    maxScrapeUrls?: number;
    scrapeEnabled?: boolean;
  },
): Promise<EnrichmentResult> {
  const {
    forceEnrich = false,
    maxSearchResults = 5,
    maxScrapeUrls = 3,
    scrapeEnabled = true,
  } = options ?? {};

  const score = detectCurrentDataNeed(query);
  const shouldEnrich = forceEnrich || score >= ENRICHMENT_THRESHOLD;

  if (!shouldEnrich) {
    return { enriched: false, webContext: "", queryUsed: query };
  }

  logger.info("enrichment", "starting", { query: query.slice(0, 100), score });

  // Step 1: Web search
  const searchResponse = await webSearch(query, maxSearchResults, "advanced");

  if (searchResponse.error || searchResponse.results.length === 0) {
    logger.warn("enrichment", "search_empty", { query: query.slice(0, 100), error: searchResponse.error });
    return {
      enriched: false,
      webContext: "",
      searchResponse,
      queryUsed: query,
    };
  }

  // Step 2: Scrape top URLs for full content (if Firecrawl is available)
  let scrapeResults: ScrapeResult[] = [];
  if (scrapeEnabled && process.env.FIRECRAWL_API_KEY) {
    const urlsToScrape = searchResponse.results
      .slice(0, maxScrapeUrls)
      .map((r) => r.url);

    scrapeResults = await scrapeUrls(urlsToScrape);
  }

  // Step 3: Build context string
  const contextParts: string[] = [
    `[LIVE WEB DATA — retrieved ${new Date().toISOString().slice(0, 16)}]`,
    "",
  ];

  // Add search result summaries
  const searchSummary = formatSearchResults(searchResponse);
  contextParts.push(searchSummary);

  // Add scraped full content (truncated to avoid token overflow)
  const successfulScrapes = scrapeResults.filter((r) => r.markdown && !r.error);
  if (successfulScrapes.length > 0) {
    contextParts.push("\n--- DETAILED PAGE CONTENT ---\n");
    for (const s of successfulScrapes) {
      const truncated = s.markdown.slice(0, 3000);
      contextParts.push(`Source: ${s.url}`);
      if (s.title) contextParts.push(`Title: ${s.title}`);
      contextParts.push(truncated);
      contextParts.push("---\n");
    }
  }

  const webContext = contextParts.join("\n");

  logger.info("enrichment", "completed", {
    query: query.slice(0, 100),
    searchResults: searchResponse.results.length,
    scrapedPages: successfulScrapes.length,
    contextLength: webContext.length,
  });

  return {
    enriched: true,
    webContext,
    searchResponse,
    scrapeResults,
    queryUsed: query,
  };
}

/**
 * Get the current date string for system prompt injection.
 */
export function getCurrentDateString(): string {
  const now = new Date();
  return `Today's date: ${now.toISOString().slice(0, 10)} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })})`;
}
