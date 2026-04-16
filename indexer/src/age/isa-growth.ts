/**
 * ISA growth-factor age estimation.
 *
 * Estimates a tree's age from its diameter at breast height (DBH) using the
 * ISA growth-factor formula:
 *
 *   age = dbhInches * growthFactor * urbanAdjustment
 *
 * Supports species-level exact matches and genus-max fallback (picks the
 * highest factor among all species in the same genus, biasing toward older
 * estimates when the exact species is unknown).
 */

import type {
  AgeEstimate,
  GrowthFactorTable,
  UrbanAdjustmentConfig,
} from "../types.js";

export function estimateAgeIsa(
  dbhCm: number,
  scientific: string | null,
  speciesRank: "species" | "genus" | "unknown",
  inferredFrom: "common-name-map" | "species-code-map" | null,
  growthFactors: GrowthFactorTable,
  urbanAdjustment: UrbanAdjustmentConfig,
): AgeEstimate | null {
  // 1. Guard: invalid DBH
  if (dbhCm == null || dbhCm <= 0) return null;

  // Early exit for unknown rank
  if (speciesRank === "unknown") return null;

  // 2. Convert cm -> inches (CRITICAL: 1 inch = 2.54 cm)
  const dbhInches = dbhCm / 2.54;

  // 3. Find growth factor
  let factor: number | null = null;
  let isGenusMax = false;

  if (speciesRank === "species") {
    // Try exact species match
    const entry = growthFactors.species.find(
      (e) => e.scientific === scientific,
    );
    if (entry) {
      factor = entry.factor;
    } else {
      // Species not found in table -- fall through to genus-max
      const genus = scientific ? scientific.split(" ")[0] : null;
      if (genus) {
        factor = genusMaxFactor(genus, growthFactors);
        if (factor !== null) isGenusMax = true;
      }
    }
  } else if (speciesRank === "genus") {
    // Genus-only: extract genus (which IS the scientific string for genus-rank)
    const genus = scientific ? scientific.split(" ")[0] : null;
    if (genus) {
      factor = genusMaxFactor(genus, growthFactors);
      if (factor !== null) isGenusMax = true;
    }
  }

  if (factor === null) return null;

  // 4. Urban adjustment
  const adjustment =
    scientific && scientific in urbanAdjustment.bySpecies
      ? urbanAdjustment.bySpecies[scientific]
      : urbanAdjustment.default;

  // 5. Calculate age
  const age = Math.round(dbhInches * factor * adjustment);

  // 6. Method and confidence
  const method = isGenusMax
    ? ("isa-dbh-growth-factor-genus-max" as const)
    : ("isa-dbh-growth-factor" as const);

  let confidence: "high" | "medium" | "low" = isGenusMax ? "medium" : "high";

  // Downgrade confidence if species was inferred from common-name or species-code
  if (inferredFrom !== null) {
    if (confidence === "high") confidence = "medium";
    else if (confidence === "medium") confidence = "low";
  }

  return { years: age, method, confidence };
}

/**
 * Finds the maximum growth factor among all species sharing the given genus.
 * Returns null if no species in the table match the genus.
 */
function genusMaxFactor(
  genus: string,
  growthFactors: GrowthFactorTable,
): number | null {
  let max: number | null = null;
  for (const entry of growthFactors.species) {
    if (entry.genus === genus) {
      if (max === null || entry.factor > max) {
        max = entry.factor;
      }
    }
  }
  return max;
}
