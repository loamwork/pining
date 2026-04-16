// ---------------------------------------------------------------------------
// AUF multifactorial age estimation (Lukaszkiewicz & Kosmala 2008)
// ---------------------------------------------------------------------------

import type { AgeEstimate } from "../types.js";

export interface MultifactorialCoefficients {
  a: number;
  b: number;
  c: number;
  d: number;
  r2: number;
}

export interface MultifactorialModelConfig {
  version: string;
  source: string;
  formula: string;
  notes: string;
  species: Record<string, MultifactorialCoefficients>;
}

/**
 * Estimate tree age using the AUF multifactorial model.
 *
 * Formula: age = a + b * ln(dbh_cm) + c * ln(height_m) + d * ln(dbh_cm) * ln(height_m)
 *
 * Only covers three species: Tilia cordata, Fraxinus excelsior, Aesculus hippocastanum.
 * Returns null if any input is missing/invalid or species is not in the model.
 */
export function estimateAgeMultifactorial(
  dbhCm: number | null,
  heightM: number | null,
  scientific: string | null,
  model: MultifactorialModelConfig,
): AgeEstimate | null {
  // Guard: DBH must be present and positive
  if (dbhCm == null || dbhCm <= 0) return null;

  // Guard: height must be present and positive
  if (heightM == null || heightM <= 0) return null;

  // Guard: species must be in the model
  if (scientific == null || !(scientific in model.species)) return null;

  const { a, b, c, d } = model.species[scientific];
  const lnDbh = Math.log(dbhCm);
  const lnH = Math.log(heightM);
  const age = Math.round(a + b * lnDbh + c * lnH + d * lnDbh * lnH);

  // Guard: calculated age must be positive
  if (age <= 0) return null;

  return {
    years: age,
    method: "auf-multifactorial",
    confidence: "high",
  };
}
