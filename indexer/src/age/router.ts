// ---------------------------------------------------------------------------
// Age estimation router — single entry point for all age methods
// ---------------------------------------------------------------------------

import type {
  RawTree,
  AgeEstimate,
  SpeciesResolution,
  GrowthFactorTable,
  UrbanAdjustmentConfig,
} from "../types.js";
import type { MultifactorialModelConfig } from "./multifactorial.js";
import { estimateAgeMultifactorial } from "./multifactorial.js";
import { estimateAgeIsa } from "./isa-growth.js";
import {
  estimateAgePlantedDate,
  estimateAgeInstallYear,
  estimateAgeEdinburghBand,
} from "./alternatives.js";

const NONE_ESTIMATE: AgeEstimate = {
  years: 0,
  method: "none",
  confidence: "none",
};

/**
 * Routes a tree to the best available age estimation method.
 *
 * Priority order:
 *   1. AUF multifactorial (requires numeric dbh + height + species in model)
 *   2. Planted date (Atlanta sources)
 *   3. Install year (Redmond source)
 *   4. Edinburgh DBH band (string DBH from Edinburgh)
 *   5. ISA growth factor (numeric DBH fallback)
 *   6. None
 */
export function estimateAge(
  tree: RawTree,
  speciesResolution: SpeciesResolution,
  growthFactors: GrowthFactorTable,
  urbanAdjustment: UrbanAdjustmentConfig,
  multifactorialModel: MultifactorialModelConfig,
): AgeEstimate {
  // 1. Multifactorial — requires numeric DBH, numeric height, and species
  //    present in the model.
  if (
    typeof tree.dbh === "number" &&
    typeof tree.height === "number"
  ) {
    const result = estimateAgeMultifactorial(
      tree.dbh,
      tree.height,
      speciesResolution.scientificResolved,
      multifactorialModel,
    );
    if (result !== null) return result;
  }

  // 2. Planted date — Atlanta sources.
  if (
    (tree.sourceId === "atlanta" || tree.sourceId === "atlanta_champion") &&
    tree.planted != null
  ) {
    const result = estimateAgePlantedDate(tree.planted as string);
    if (result !== null) return result;
  }

  // 3. Install year — Redmond source.
  if (tree.sourceId === "redmond" && tree.installYear != null) {
    const result = estimateAgeInstallYear(tree.installYear as number);
    if (result !== null) return result;
  }

  // 4. Edinburgh band — string DBH from Edinburgh source.
  if (tree.sourceId === "edinburgh" && typeof tree.dbh === "string") {
    const result = estimateAgeEdinburghBand(
      tree.dbh as string,
      speciesResolution.scientificResolved,
      speciesResolution.rank,
      growthFactors,
      urbanAdjustment,
    );
    if (result !== null) return result;
  }

  // 5. ISA growth factor — numeric DBH fallback.
  if (typeof tree.dbh === "number") {
    const result = estimateAgeIsa(
      tree.dbh,
      speciesResolution.scientificResolved,
      speciesResolution.rank,
      speciesResolution.inferredFrom,
      growthFactors,
      urbanAdjustment,
    );
    if (result !== null) return result;
  }

  // 6. None — no method could produce an estimate.
  return NONE_ESTIMATE;
}
