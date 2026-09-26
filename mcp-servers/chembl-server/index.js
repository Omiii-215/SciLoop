/**
 * SciLoop — ChEMBL MCP Server
 *
 * Wraps the ChEMBL REST API as MCP tools.
 * Tools: search_target, get_active_compounds, get_compound_details
 *
 * API docs: https://www.ebi.ac.uk/chembl/api/data/docs
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const CHEMBL_BASE = "https://www.ebi.ac.uk/chembl/api/data";

const server = new McpServer({
  name: "chembl-mcp",
  version: "1.0.0",
});

/**
 * Helper to fetch JSON from ChEMBL API with proper headers.
 */
async function chemblFetch(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`ChEMBL API returned ${res.status} for ${url}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Tool: search_target
// ---------------------------------------------------------------------------
server.tool(
  "search_target",
  "Search ChEMBL for a drug target by gene name. Returns ChEMBL target IDs needed for compound queries.",
  {
    gene_name: z.string().describe("Gene/target name (e.g., 'EGFR')"),
    organism: z.string().default("Homo sapiens").describe("Organism (default: Homo sapiens)"),
  },
  async ({ gene_name, organism }) => {
    try {
      const url = `${CHEMBL_BASE}/target/search.json?q=${encodeURIComponent(gene_name)}&limit=10`;
      const data = await chemblFetch(url);

      const targets = (data.targets || [])
        .filter((t) => {
          const orgMatch = !organism || (t.organism || "").toLowerCase().includes(organism.toLowerCase());
          return orgMatch;
        })
        .map((t) => ({
          target_chembl_id: t.target_chembl_id,
          pref_name: t.pref_name,
          target_type: t.target_type,
          organism: t.organism,
          gene_names: t.target_components?.map((c) => c.target_component_synonyms
            ?.filter((s) => s.syn_type === "GENE_SYMBOL")
            .map((s) => s.component_synonym)
          ).flat().filter(Boolean) || [],
        }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            gene_name,
            targets,
            evidence_type: "literature",
            provenance: {
              api_endpoint: `${CHEMBL_BASE}/target/search.json`,
              query_used: gene_name,
              retrieved_at: new Date().toISOString(),
              tool_name: "search_target",
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error searching ChEMBL target: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: get_active_compounds
// ---------------------------------------------------------------------------
server.tool(
  "get_active_compounds",
  "Get known active compounds for a ChEMBL target. Returns SMILES, activity values, and assay data.",
  {
    target_id: z.string().describe("ChEMBL target ID (e.g., 'CHEMBL203' for EGFR)"),
    activity_type: z.string().default("IC50").describe("Activity type to filter (e.g., IC50, Ki, EC50)"),
    max_nm: z.number().default(1000).describe("Maximum activity value in nM to consider as 'active'"),
    max_results: z.number().min(1).max(100).default(20).describe("Maximum compounds to return"),
  },
  async ({ target_id, activity_type, max_nm, max_results }) => {
    try {
      const url = `${CHEMBL_BASE}/activity.json?target_chembl_id=${target_id}&standard_type=${encodeURIComponent(activity_type)}&standard_value__lte=${max_nm}&standard_units=nM&limit=${max_results}`;
      const data = await chemblFetch(url);

      const compounds = (data.activities || []).map((a) => ({
        molecule_chembl_id: a.molecule_chembl_id,
        canonical_smiles: a.canonical_smiles,
        activity_type: a.standard_type,
        activity_value: a.standard_value ? parseFloat(a.standard_value) : null,
        activity_units: a.standard_units,
        assay_chembl_id: a.assay_chembl_id,
        assay_description: a.assay_description,
        pchembl_value: a.pchembl_value ? parseFloat(a.pchembl_value) : null,
      }));

      // Deduplicate by molecule ID, keep best activity
      const uniqueMap = new Map();
      for (const c of compounds) {
        const existing = uniqueMap.get(c.molecule_chembl_id);
        if (!existing || (c.activity_value && (!existing.activity_value || c.activity_value < existing.activity_value))) {
          uniqueMap.set(c.molecule_chembl_id, c);
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            target_id,
            activity_type,
            threshold_nm: max_nm,
            compounds: [...uniqueMap.values()],
            total_activities: data.page_meta?.total_count || compounds.length,
            evidence_type: "literature",
            note: "Activity data from ChEMBL — experimentally measured values from published assays",
            provenance: {
              api_endpoint: `${CHEMBL_BASE}/activity.json`,
              query_used: `target:${target_id} type:${activity_type} ≤${max_nm}nM`,
              retrieved_at: new Date().toISOString(),
              tool_name: "get_active_compounds",
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching compounds: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: get_compound_details
// ---------------------------------------------------------------------------
server.tool(
  "get_compound_details",
  "Get detailed information about a specific compound from ChEMBL.",
  {
    chembl_id: z.string().describe("ChEMBL compound ID (e.g., 'CHEMBL941')"),
  },
  async ({ chembl_id }) => {
    try {
      const url = `${CHEMBL_BASE}/molecule/${chembl_id}.json`;
      const data = await chemblFetch(url);

      const props = data.molecule_properties || {};
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            chembl_id: data.molecule_chembl_id,
            pref_name: data.pref_name,
            smiles: data.molecule_structures?.canonical_smiles || null,
            inchi_key: data.molecule_structures?.standard_inchi_key || null,
            molecule_type: data.molecule_type,
            max_phase: data.max_phase,
            properties: {
              molecular_weight: props.full_mwt ? parseFloat(props.full_mwt) : null,
              alogp: props.alogp ? parseFloat(props.alogp) : null,
              hba: props.hba ? parseInt(props.hba) : null,
              hbd: props.hbd ? parseInt(props.hbd) : null,
              psa: props.psa ? parseFloat(props.psa) : null,
              ro5_violations: props.num_ro5_violations ? parseInt(props.num_ro5_violations) : null,
              aromatic_rings: props.aromatic_rings ? parseInt(props.aromatic_rings) : null,
              rotatable_bonds: props.rtb ? parseInt(props.rtb) : null,
            },
            evidence_type: "literature",
            provenance: {
              api_endpoint: `${CHEMBL_BASE}/molecule/${chembl_id}.json`,
              query_used: chembl_id,
              retrieved_at: new Date().toISOString(),
              tool_name: "get_compound_details",
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching compound details for ${chembl_id}: ${error.message}` }],
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
  console.error("ChEMBL MCP server running on stdio");
}

main().catch(console.error);
