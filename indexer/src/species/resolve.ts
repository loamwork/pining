/**
 * Species resolution controller.
 *
 * Orchestrates scientific-name resolution for a single tree by trying,
 * in priority order: direct binomial, genus-only, Redmond code decoding,
 * and common-name lookup (with per-source normalization).
 */

import type { RawTree, SpeciesResolution } from "../types.js";
import { lookupCommonName } from "./common-map.js";
import { decodeRedmondCode } from "./redmond-codes.js";
import {
  normalizeLucityCommon,
  normalizeAustinCommon,
  normalizeBeavertonCommon,
} from "../normalize/lucity.js";

/** Pattern for Redmond-style all-uppercase species codes. */
const REDMOND_CODE_RE = /^[A-Z]{3,}$/;

/**
 * Resolves the species for a single tree.
 *
 * Resolution order:
 * 1. Binomial scientific name (contains a space)
 * 2. Genus-only scientific name (single non-empty word)
 * 3. Redmond species code (sourceId "redmond" + all-uppercase code)
 * 4. Common-name lookup (with per-source normalization)
 * 5. Unknown
 */
export function resolveSpecies(
  tree: RawTree,
  commonNameMap: Map<string, string>,
  redmondCodeMap: Map<string, { scientific: string; common: string } | null>,
): SpeciesResolution {
  const sci = tree.scientific?.trim() || null;

  // 1. Binomial — scientific contains a space
  if (sci && sci.includes(" ")) {
    return {
      rank: "species",
      scientificRaw: sci,
      scientificResolved: sci,
      inferredFrom: null,
    };
  }

  // 2. Genus-only — single non-empty word
  if (sci && !sci.includes(" ")) {
    // But first check if it looks like a Redmond code
    if (tree.sourceId === "redmond" && REDMOND_CODE_RE.test(sci)) {
      // Fall through to step 3
    } else {
      return {
        rank: "genus",
        scientificRaw: sci,
        scientificResolved: sci,
        inferredFrom: null,
      };
    }
  }

  // 3. Redmond species code
  if (tree.sourceId === "redmond" && sci && REDMOND_CODE_RE.test(sci)) {
    const decoded = decodeRedmondCode(sci, redmondCodeMap);
    if (decoded) {
      return {
        rank: decoded.rank,
        scientificRaw: sci,
        scientificResolved: decoded.scientific,
        inferredFrom: "species-code-map",
      };
    }
    // Code didn't decode (UNK, OTHER, or unknown) — fall through
  }

  // 4. Common-name rescue
  const commonRaw = tree.common?.trim() || null;
  if (commonRaw) {
    let normalized = commonRaw;

    // Per-source normalization
    if (tree.sourceId === "irvine") {
      normalized = normalizeLucityCommon(commonRaw);
    } else if (
      tree.sourceId === "austin" ||
      tree.sourceId === "austin_downtown"
    ) {
      normalized = normalizeAustinCommon(commonRaw);
    } else if (tree.sourceId === "beaverton") {
      normalized = normalizeBeavertonCommon(commonRaw);
    }

    const looked = lookupCommonName(normalized, commonNameMap);
    if (looked) {
      return {
        rank: looked.rank,
        scientificRaw: sci,
        scientificResolved: looked.scientific,
        inferredFrom: "common-name-map",
      };
    }
  }

  // 5. Nothing resolved
  return {
    rank: "unknown",
    scientificRaw: sci,
    scientificResolved: null,
    inferredFrom: null,
  };
}
