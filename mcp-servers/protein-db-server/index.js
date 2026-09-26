/**
 * SciLoop — Protein DB MCP Server
 *
 * Wraps PDB (RCSB), AlphaFold DB, and UniProt REST APIs as MCP tools.
 * Tools: search_pdb, fetch_alphafold, get_uniprot_info
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "protein-db-mcp",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool: search_pdb
// ---------------------------------------------------------------------------
server.tool(
  "search_pdb",
  "Search the RCSB Protein Data Bank for crystal structures of a protein.",
  {
    gene_name: z.string().describe("Gene name (e.g., 'EGFR')"),
    organism: z.string().default("Homo sapiens").describe("Organism name (default: Homo sapiens)"),
    max_results: z.number().min(1).max(20).default(5).describe("Max results to return"),
  },
  async ({ gene_name, organism, max_results }) => {
    try {
      const query = {
        query: {
          type: "group",
          logical_operator: "and",
          nodes: [
            {
              type: "terminal",
              service: "full_text",
              parameters: { value: gene_name },
            },
            {
              type: "terminal",
              service: "text",
              parameters: {
                attribute: "rcsb_entity_source_organism.taxonomy_lineage.name",
                operator: "exact_match",
                value: organism,
              },
            },
          ],
        },
        return_type: "entry",
        request_options: {
          paginate: { start: 0, rows: max_results },
          scoring_strategy: "combined",
          sort: [{ sort_by: "score", direction: "desc" }],
        },
      };

      const searchRes = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });

      if (!searchRes.ok) {
        throw new Error(`PDB search returned ${searchRes.status}`);
      }

      const searchData = await searchRes.json();
      const pdbIds = (searchData.result_set || []).map((r) => r.identifier);

      // Fetch summary for each PDB entry
      const entries = [];
      for (const pdbId of pdbIds.slice(0, max_results)) {
        try {
          const entryRes = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId}`);
          const entryData = await entryRes.json();

          entries.push({
            pdb_id: pdbId,
            title: entryData.struct?.title || "Unknown",
            method: entryData.exptl?.[0]?.method || "Unknown",
            resolution: entryData.rcsb_entry_info?.resolution_combined?.[0] || null,
            deposit_date: entryData.rcsb_accession_info?.deposit_date || null,
            url: `https://www.rcsb.org/structure/${pdbId}`,
          });
        } catch {
          entries.push({ pdb_id: pdbId, error: "Could not fetch details" });
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            gene_name,
            organism,
            entries,
            total_found: searchData.total_count || 0,
            evidence_type: "literature",
            provenance: {
              api_endpoint: "https://search.rcsb.org/rcsbsearch/v2/query",
              query_used: `gene:${gene_name} organism:${organism}`,
              retrieved_at: new Date().toISOString(),
              tool_name: "search_pdb",
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error searching PDB: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: fetch_alphafold
// ---------------------------------------------------------------------------
server.tool(
  "fetch_alphafold",
  "Fetch AlphaFold predicted structure metadata for a UniProt accession.",
  {
    uniprot_id: z.string().describe("UniProt accession ID (e.g., 'P00533' for human EGFR)"),
  },
  async ({ uniprot_id }) => {
    try {
      const afUrl = `https://alphafold.ebi.ac.uk/api/prediction/${uniprot_id}`;
      const afRes = await fetch(afUrl);

      if (!afRes.ok) {
        throw new Error(`AlphaFold API returned ${afRes.status} for ${uniprot_id}`);
      }

      const afData = await afRes.json();
      const prediction = Array.isArray(afData) ? afData[0] : afData;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            uniprot_id,
            entry_id: prediction.entryId || null,
            gene: prediction.gene || null,
            organism: prediction.organismScientificName || null,
            model_url: prediction.pdbUrl || null,
            cif_url: prediction.cifUrl || null,
            pae_image_url: prediction.paeImageUrl || null,
            model_created: prediction.modelCreatedDate || null,
            global_plddt: prediction.globalMetricValue || null,
            evidence_type: "computational_prediction",
            note: "AlphaFold structure prediction — NOT an experimental structure",
            provenance: {
              api_endpoint: afUrl,
              query_used: `uniprot:${uniprot_id}`,
              retrieved_at: new Date().toISOString(),
              tool_name: "fetch_alphafold",
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching AlphaFold data for ${uniprot_id}: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: get_uniprot_info
// ---------------------------------------------------------------------------
server.tool(
  "get_uniprot_info",
  "Get protein information from UniProt: function, domains, pathways, subcellular location.",
  {
    gene_name: z.string().describe("Gene name (e.g., 'EGFR')"),
    organism: z.string().default("human").describe("Organism (default: human)"),
  },
  async ({ gene_name, organism }) => {
    try {
      const searchUrl = `https://rest.uniprot.org/uniprotkb/search?query=gene:${encodeURIComponent(gene_name)}+AND+organism_name:${encodeURIComponent(organism)}+AND+reviewed:true&format=json&size=1`;
      const searchRes = await fetch(searchUrl, {
        headers: { Accept: "application/json" },
      });
      const searchData = await searchRes.json();

      if (!searchData.results || searchData.results.length === 0) {
        return {
          content: [{ type: "text", text: `No UniProt entry found for ${gene_name} in ${organism}` }],
        };
      }

      const entry = searchData.results[0];

      // Extract key information
      const functions = (entry.comments || [])
        .filter((c) => c.commentType === "FUNCTION")
        .map((c) => c.texts?.map((t) => t.value).join(" ") || "");

      const subcellular = (entry.comments || [])
        .filter((c) => c.commentType === "SUBCELLULAR LOCATION")
        .map((c) => c.subcellularLocations?.map((sl) => sl.location?.value).join(", ") || "");

      const pathways = (entry.comments || [])
        .filter((c) => c.commentType === "PATHWAY")
        .map((c) => c.texts?.map((t) => t.value).join("; ") || "");

      const domains = (entry.features || [])
        .filter((f) => f.type === "Domain")
        .map((f) => ({
          name: f.description,
          start: f.location?.start?.value,
          end: f.location?.end?.value,
        }));

      const diseases = (entry.comments || [])
        .filter((c) => c.commentType === "DISEASE")
        .map((c) => ({
          name: c.disease?.diseaseId || "Unknown",
          description: c.texts?.map((t) => t.value).join(" ") || "",
        }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            uniprot_id: entry.primaryAccession,
            gene_name: entry.genes?.[0]?.geneName?.value || gene_name,
            protein_name: entry.proteinDescription?.recommendedName?.fullName?.value || "Unknown",
            organism: entry.organism?.scientificName || organism,
            length: entry.sequence?.length || null,
            functions,
            subcellular_locations: subcellular,
            pathways,
            domains,
            diseases,
            evidence_type: "literature",
            provenance: {
              api_endpoint: "https://rest.uniprot.org/uniprotkb/search",
              query_used: `gene:${gene_name} organism:${organism}`,
              retrieved_at: new Date().toISOString(),
              tool_name: "get_uniprot_info",
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching UniProt info for ${gene_name}: ${error.message}` }],
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
  console.error("Protein DB MCP server running on stdio");
}

main().catch(console.error);
