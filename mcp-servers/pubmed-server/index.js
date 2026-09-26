/**
 * SciLoop — PubMed MCP Server
 *
 * Wraps the NCBI PubMed E-utilities API as MCP tools.
 * Tools: search_pubmed, fetch_abstract, extract_claims
 *
 * Endpoints used:
 *   - esearch: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi
 *   - efetch:  https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const server = new McpServer({
  name: "pubmed-mcp",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool: search_pubmed
// ---------------------------------------------------------------------------
server.tool(
  "search_pubmed",
  "Search PubMed for scientific articles. Returns PMIDs, titles, and publication dates.",
  {
    query: z.string().describe("PubMed search query (supports MeSH terms and Boolean operators)"),
    max_results: z.number().min(1).max(50).default(10).describe("Maximum number of results to return (1-50)"),
  },
  async ({ query, max_results }) => {
    try {
      // Step 1: ESearch to get PMIDs
      const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${max_results}&retmode=json&sort=relevance`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();

      const pmids = searchData.esearchresult?.idlist || [];
      if (pmids.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ results: [], total_found: 0, query }, null, 2) }],
        };
      }

      // Step 2: ESummary to get article details
      const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;
      const summaryRes = await fetch(summaryUrl);
      const summaryData = await summaryRes.json();

      const results = pmids.map((pmid) => {
        const article = summaryData.result?.[pmid] || {};
        return {
          pmid,
          title: article.title || "Unknown",
          authors: (article.authors || []).map((a) => a.name).slice(0, 5),
          journal: article.fulljournalname || article.source || "Unknown",
          pub_date: article.pubdate || "Unknown",
          doi: (article.articleids || []).find((id) => id.idtype === "doi")?.value || null,
        };
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            results,
            total_found: parseInt(searchData.esearchresult?.count || "0"),
            query,
            evidence_type: "literature",
            provenance: {
              api_endpoint: searchUrl.split("?")[0],
              query_used: query,
              retrieved_at: new Date().toISOString(),
              tool_name: "search_pubmed",
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error searching PubMed: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: fetch_abstract
// ---------------------------------------------------------------------------
server.tool(
  "fetch_abstract",
  "Fetch the full abstract and metadata for a specific PubMed article by PMID.",
  {
    pmid: z.string().describe("PubMed ID (e.g., '12345678')"),
  },
  async ({ pmid }) => {
    try {
      // Fetch abstract as XML (more complete than JSON for abstracts)
      const fetchUrl = `${EUTILS_BASE}/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
      const fetchRes = await fetch(fetchUrl);
      const xmlText = await fetchRes.text();

      // Parse key fields from XML
      const title = xmlText.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/s)?.[1] || "Unknown";
      const abstractParts = [...xmlText.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/gs)];
      const abstract = abstractParts.map((m) => m[1].replace(/<[^>]+>/g, "")).join("\n\n") || "No abstract available";
      const journal = xmlText.match(/<Title>(.*?)<\/Title>/)?.[1] || "Unknown";
      const year = xmlText.match(/<PubDate>.*?<Year>(.*?)<\/Year>/s)?.[1] || "Unknown";

      // Extract author list
      const authors = [...xmlText.matchAll(/<LastName>(.*?)<\/LastName>\s*<ForeName>(.*?)<\/ForeName>/g)]
        .map((m) => `${m[2]} ${m[1]}`)
        .slice(0, 10);

      // Extract MeSH terms
      const meshTerms = [...xmlText.matchAll(/<DescriptorName[^>]*>(.*?)<\/DescriptorName>/g)]
        .map((m) => m[1]);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            pmid,
            title: title.replace(/<[^>]+>/g, ""),
            abstract,
            authors,
            journal,
            year,
            mesh_terms: meshTerms,
            evidence_type: "literature",
            provenance: {
              api_endpoint: `${EUTILS_BASE}/efetch.fcgi`,
              query_used: `pmid:${pmid}`,
              retrieved_at: new Date().toISOString(),
              tool_name: "fetch_abstract",
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching abstract for PMID ${pmid}: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PubMed MCP server running on stdio");
}

main().catch(console.error);
