/**
 * Alternative age estimation methods for sources that provide
 * planted dates, install years, or string-band DBH values instead
 * of numeric DBH.
 */

import type {
  AgeEstimate,
  GrowthFactorTable,
  UrbanAdjustmentConfig,
} from "../types.js";
import { parseEdinburghDbhBand } from "../normalize/edinburgh.js";
import { estimateAgeIsa } from "./isa-growth.js";

/**
 * Atlanta: planted date -> age.
 *
 * Parses an ISO date string and computes the tree's age as the
 * difference between the current year and the planted year.
 */
export function estimateAgePlantedDate(
  planted: string | null | undefined,
): AgeEstimate | null {
  if (planted == null || planted === "") return null;

  const d = new Date(planted);
  if (Number.isNaN(d.getTime())) return null;

  const age = new Date().getFullYear() - d.getFullYear();
  if (age <= 0) return null;

  return { years: age, method: "planted-date", confidence: "high" };
}

/**
 * Redmond: install year -> age.
 *
 * Computes the tree's age as the difference between the current year
 * and the install year.
 */
export function estimateAgeInstallYear(
  installYear: number | null | undefined,
): AgeEstimate | null {
  if (installYear == null) return null;
  if (!Number.isInteger(installYear) || installYear <= 0) return null;

  const age = new Date().getFullYear() - installYear;
  if (age <= 0) return null;

  return { years: age, method: "install-year", confidence: "high" };
}

/**
 * Edinburgh: string-band DBH -> ISA age.
 *
 * Parses the band string to a cm midpoint, then feeds it through the
 * standard ISA growth-factor formula. The method is overridden to
 * "isa-dbh-range-band" and confidence is capped at "medium" because
 * the band introduces extra uncertainty.
 */
export function estimateAgeEdinburghBand(
  dbhBand: string | null | undefined,
  scientific: string | null,
  speciesRank: "species" | "genus" | "unknown",
  growthFactors: GrowthFactorTable,
  urbanAdjustment: UrbanAdjustmentConfig,
): AgeEstimate | null {
  if (dbhBand == null) return null;

  const midpointCm = parseEdinburghDbhBand(dbhBand);
  if (midpointCm === null) return null;

  // Delegate to ISA; inferredFrom is null because Edinburgh provides
  // its own species data — no name rescue is involved at this stage.
  const isaResult = estimateAgeIsa(
    midpointCm,
    scientific,
    speciesRank,
    null,
    growthFactors,
    urbanAdjustment,
  );

  if (isaResult === null) return null;

  // Override method and cap confidence for band-derived estimates.
  return {
    years: isaResult.years,
    method: "isa-dbh-range-band",
    confidence:
      isaResult.confidence === "high" ? "medium" : isaResult.confidence,
  };
}
