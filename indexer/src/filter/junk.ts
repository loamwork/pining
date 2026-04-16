// ---------------------------------------------------------------------------
// Pining indexer — junk-record filter (Stage 2)
// ---------------------------------------------------------------------------
// Called ~8.3M times so we pre-compile the regex and keep branching minimal.

import type { RawTree } from "../types.js";

/**
 * Case-insensitive, start-anchored regex for junk species / common names.
 * Matches known placeholder and non-tree values found across municipal
 * data sources.
 */
const JUNK_RE =
  /^(vacant|unknown|stump|dead|missing|removed|not identified|no tree|other \(see|planting site|null|none)/i;

/**
 * Returns `true` if the record should be dropped from the pipeline.
 *
 * Rules:
 * 1. Global regex filter on `scientific` / `common` fields.
 * 2. Per-source status filters (Atlanta, Redmond).
 * 3. Data-poor trees (both fields null) are NOT junk — they survive.
 */
export function isJunk(tree: RawTree): boolean {
  // --- Global regex filter ---
  if (tree.scientific !== null && JUNK_RE.test(tree.scientific)) return true;
  if (tree.common !== null && JUNK_RE.test(tree.common)) return true;

  // --- Per-source: Atlanta / Atlanta Champion ---
  if (tree.sourceId === "atlanta" || tree.sourceId === "atlanta_champion") {
    if (tree.status !== "Alive") return true;
  }

  // --- Per-source: Redmond ---
  if (tree.sourceId === "redmond") {
    if (tree.treeExists !== "YES") return true;
    if (tree.status === "REM") return true;
  }

  return false;
}
