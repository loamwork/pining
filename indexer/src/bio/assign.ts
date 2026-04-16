// ---------------------------------------------------------------------------
// Bio assignment — determines which bio tier and index each tree gets
// ---------------------------------------------------------------------------

import type { AgeEstimate, SpeciesResolution } from "../types.js";

export interface BioAssignmentResult {
  bioIndex: number;
  /** Species ID for regular bios; -1 for elder, -2 for mystery. */
  bioSpeciesFk: number;
  bioType: "elder" | "swagger" | "species" | "mystery";
}

// ---------------------------------------------------------------------------
// Deterministic hash — same treeId always produces the same bioIndex
// ---------------------------------------------------------------------------

function deterministicHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ---------------------------------------------------------------------------
// Main assignment function
// ---------------------------------------------------------------------------

/**
 * Assign a bio tier and index to a tree based on its characteristics.
 *
 * Tier priority:
 *   1. Elder — ancient trees, or champion/heritage trees that are >= 200 yrs
 *      old or have no computable age (method "none", err on side of respect).
 *   2. Swagger — champion/heritage trees that didn't qualify as elder.
 *   3. Mystery — unknown-species trees.
 *   4. Species — everything else (full 20-bio pool).
 */
export function assignBio(
  treeId: string,
  speciesResolution: SpeciesResolution,
  ageEstimate: AgeEstimate,
  isAncient: boolean,
  isChampion: boolean,
  isHeritage: boolean,
  speciesIdMap: Map<string, number>,
): BioAssignmentResult {
  const hash = deterministicHash(treeId);

  // Elder: ancient, OR champion/heritage with age >= 200 or no computable age
  if (
    isAncient ||
    ((isChampion || isHeritage) &&
      (ageEstimate.method === "none" || ageEstimate.years >= 200))
  ) {
    return {
      bioType: "elder",
      bioSpeciesFk: -1,
      bioIndex: hash % 20,
    };
  }

  // Swagger: champion/heritage that didn't qualify as elder
  if (isChampion || isHeritage) {
    return {
      bioType: "swagger",
      bioSpeciesFk:
        speciesIdMap.get(speciesResolution.scientificResolved ?? "") ?? -2,
      bioIndex: hash % 12,
    };
  }

  // Mystery: unknown species
  if (speciesResolution.rank === "unknown") {
    return {
      bioType: "mystery",
      bioSpeciesFk: -2,
      bioIndex: hash % 20,
    };
  }

  // Species: everything else (full pool)
  return {
    bioType: "species",
    bioSpeciesFk:
      speciesIdMap.get(speciesResolution.scientificResolved ?? "") ?? -2,
    bioIndex: hash % 20,
  };
}
