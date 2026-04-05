import { NextRequest, NextResponse } from "next/server";
import { webSearch, formatSearchResults } from "@/lib/web/search";
import { scrapeUrls } from "@/lib/web/firecrawl";
import { logger } from "@/lib/logger";

/**
 * POST /api/web/agent
 * JSON-RPC 2.0 — Web Search Agent v5 (Tavily + Firecrawl).
 *
 * Product search flow:
 *   1. Tavily Search → find e-commerce URLs
 *   2. Firecrawl Scrape → JS-render pages, get real markdown content
 *   3. Haiku → extract prices from real page content, format with direct URLs
 *
 * General search flow:
 *   1. Tavily Search → get results
 *   2. Haiku → summarize
 */

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id: string | number;
}

// globalThis for persistence
const g = globalThis as typeof globalThis & {
  __aip_ws_tasks?: Map<string, { status: string; artifact?: string; error?: string }>;
};
if (!g.__aip_ws_tasks) g.__aip_ws_tasks = new Map();
const tasks = g.__aip_ws_tasks;

const PRODUCT_KEYWORDS = [
  "fiyat", "price", "ucuz", "cheap", "satın", "buy", "karşılaştır",
  "kaç tl", "kaç lira", "ne kadar", "en uygun", "indirim",
];

function isProductQuery(query: string): boolean {
  return PRODUCT_KEYWORDS.some((kw) => query.toLowerCase().includes(kw));
}

export async function POST(request: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
  }

  const { method, params, id } = body;

  if (method === "task/create") {
    const input = (params?.input as string) || "";
    const taskId = (params?.taskId as string) || `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    tasks.set(taskId, { status: "WORKING" });

    const response = NextResponse.json({
      jsonrpc: "2.0",
      result: { taskId, status: "WORKING" },
      id,
    });

    (async () => {
      try {
        const artifact = isProductQuery(input)
          ? await productSearch(input)
          : await generalSearch(input);
        tasks.set(taskId, { status: "COMPLETED", artifact });
      } catch (err) {
        tasks.set(taskId, {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return response;
  }

  if (method === "task/status") {
    const taskId = params?.taskId as string;
    if (!taskId) {
      return NextResponse.json({ jsonrpc: "2.0", error: { code: -32602, message: "Missing taskId" }, id });
    }
    const task = tasks.get(taskId);
    if (!task) {
      return NextResponse.json({ jsonrpc: "2.0", error: { code: -32001, message: "Task not found" }, id });
    }
    return NextResponse.json({
      jsonrpc: "2.0",
      result: { taskId, status: task.status, ...(task.artifact ? { artifact: task.artifact } : {}), ...(task.error ? { error: task.error } : {}) },
      id,
    });
  }

  return NextResponse.json({ jsonrpc: "2.0", error: { code: -32601, message: `Unknown method: ${method}` }, id });
}

export async function GET() {
  return NextResponse.json({
    did: "did:aip:platform:web-search",
    name: "Web Search Agent",
    version: "5.0.0",
    endpoint: "http://localhost:3000/api/web/agent",
    type: "Task",
    capabilities: [{
      id: "web.search",
      description: "Web Search",
      pricing: { amount: "0.02", token: "USDC", network: "solana" },
    }],
  });
}

/* ------------------------------------------------------------------ */
/*  Product Search: Tavily → Firecrawl → Haiku                        */
/* ------------------------------------------------------------------ */

async function productSearch(userQuery: string): Promise<string> {
  logger.info("web_agent", "product_search_start", { query: userQuery });

  // Step 1: Tavily search — find product URLs
  const searchResult = await webSearch(userQuery, 10, "advanced");

  if (searchResult.results.length === 0) {
    return `"${userQuery}" için sonuç bulunamadı.`;
  }

  // Step 2: Separate direct e-commerce URLs from comparison sites
  const DIRECT_ECOM = ["trendyol.com", "hepsiburada.com", "amazon.com.tr", "n11.com", "mediamarkt.com.tr", "teknosa.com", "itopya.com", "vatanbilgisayar.com", "pttavm.com"];
  const COMPARISON_SITES = ["cimri.com", "akakce.com", "epey.com", "fiyat.com", "en-ucuz.com"];

  const directUrls = searchResult.results.filter((r) =>
    DIRECT_ECOM.some((d) => r.url.includes(d))
  );
  const comparisonUrls = searchResult.results.filter((r) =>
    COMPARISON_SITES.some((d) => r.url.includes(d))
  );

  // Step 3: If not enough direct e-commerce URLs, do a targeted second search
  if (directUrls.length < 3) {
    const siteSearch = await webSearch(
      `${userQuery} site:trendyol.com OR site:hepsiburada.com OR site:amazon.com.tr OR site:n11.com`,
      5, "basic"
    );
    for (const r of siteSearch.results) {
      if (DIRECT_ECOM.some((d) => r.url.includes(d)) && !directUrls.some((d) => d.url === r.url)) {
        directUrls.push(r);
      }
    }
  }

  // Step 4: Pick URLs to scrape — prioritize direct e-commerce, add 1 comparison as fallback
  const urlsToScrape: string[] = [];
  for (const r of directUrls.slice(0, 4)) {
    urlsToScrape.push(r.url);
  }
  // Add max 1 comparison site for extra price data (but Haiku won't use its links)
  if (comparisonUrls.length > 0 && urlsToScrape.length < 5) {
    urlsToScrape.push(comparisonUrls[0].url);
  }
  logger.info("web_agent", "scraping_urls", { urls: urlsToScrape });

  const scrapeResults = await scrapeUrls(urlsToScrape);

  // Step 3: Build data for Haiku
  const pageData: string[] = [
    `PRODUCT SEARCH: "${userQuery}"`,
    `Searched ${searchResult.results.length} sources, scraped ${scrapeResults.filter((r) => r.markdown).length} pages\n`,
  ];

  for (const scrape of scrapeResults) {
    if (!scrape.markdown) continue;
    pageData.push(`--- PAGE: ${scrape.url} ---`);
    pageData.push(`Title: ${scrape.title || "Unknown"}`);
    // Limit markdown content per page
    pageData.push(scrape.markdown.slice(0, 4000));
    pageData.push("");
  }

  // Also include search snippets
  pageData.push("\nSEARCH SNIPPETS:");
  for (const r of searchResult.results.slice(0, 5)) {
    pageData.push(`  - ${r.title} | ${r.url}`);
    pageData.push(`    ${r.content.slice(0, 200)}`);
  }

  const allData = pageData.join("\n");

  // Step 4: Haiku analyzes real page content
  return await analyzeWithHaiku(userQuery, allData);
}

/* ------------------------------------------------------------------ */
/*  General Search: Tavily → Haiku                                     */
/* ------------------------------------------------------------------ */

async function generalSearch(userQuery: string): Promise<string> {
  const searchResult = await webSearch(userQuery, 8, "advanced");
  const rawResults = formatSearchResults(searchResult);

  return await analyzeWithHaiku(userQuery, rawResults);
}

/* ------------------------------------------------------------------ */
/*  Haiku Analysis                                                     */
/* ------------------------------------------------------------------ */

async function analyzeWithHaiku(userQuery: string, data: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return data;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system:
        "You analyze real web page content to answer user queries.\n\n" +
        "For product/price queries:\n" +
        "- Extract EXACT prices from the scraped page content\n" +
        "- Every product MUST have a markdown link to the SELLER'S OWN WEBSITE: [Seller - Product](url)\n" +
        "- CRITICAL: Use URLs from trendyol.com, hepsiburada.com, amazon.com.tr, n11.com, pttavm.com etc.\n" +
        "- NEVER link to cimri.com, akakce.com, epey.com — these are comparison sites, not sellers\n" +
        "- If you found a price on a comparison site, report the seller name and price but link to the seller's direct page from the scraped data\n" +
        "- Sort by price, cheapest first\n" +
        "- End with: 'En uygun: [Seller](direct_url) — Price'\n" +
        "- Filter out accessories, cases, second-hand, game bundles — only the actual product\n\n" +
        "For general queries:\n" +
        "- Summarize findings with [source links](url)\n\n" +
        "RULES:\n" +
        "- Only report prices you can see in the page content\n" +
        "- Answer in the user's language\n" +
        "- Do NOT invent URLs or prices\n" +
        "- NEVER use comparison site URLs as product links",
      messages: [{
        role: "user",
        content: `User: "${userQuery}"\n\n${data}`,
      }],
    });

    const block = response.content[0];
    if (block.type === "text") return block.text;
    return data;
  } catch {
    return data;
  }
}
