// ---------------------------------------------------------------------------
// Pining indexer — shared types
// ---------------------------------------------------------------------------

/** A record straight from arborlog's JSON output. */
export interface RawTree {
  id: string;
  sourceId: string;
  sourceNativeId: string;
  lat: number;
  lon: number;
  scientific: string | null;
  common: string | null;
  /** Diameter at breast height in centimeters. */
  dbh: number | null;
  /** Height in meters. */
  height: number | null;
  license: string | null;
  attributionUrl: string | null;
  sourceLastUpdated: string | null;
  ingestedAt: string | null;
  /**
   * Per-source extras — planted, installYear, status, treeExists,
   * maturity, plantingSeason, etc.
   */
  [key: string]: unknown;
}

/** Result of resolving a tree's scientific name. */
export interface SpeciesResolution {
  rank: "species" | "genus" | "unknown";
  /** What arborlog had. */
  scientificRaw: string | null;
  /** After resolution. */
  scientificResolved: string | null;
  inferredFrom: "common-name-map" | "species-code-map" | null;
}

/** How the age estimate was derived. */
export type AgeMethod =
  | "auf-multifactorial"
  | "isa-dbh-growth-factor"
  | "isa-dbh-growth-factor-genus-max"
  | "isa-dbh-range-band"
  | "planted-date"
  | "install-year"
  | "none";

/** Point-estimate age for a single tree. */
export interface AgeEstimate {
  /** Integer point estimate in years. */
  years: number;
  method: AgeMethod;
  confidence: "high" | "medium" | "low" | "none";
}

/** Which bio (flavor text) was assigned to this tree. */
export interface BioAssignment {
  bioIndex: number;
  /** Species ID for regular bios; -1 for elder, -2 for mystery. */
  bioSpeciesFk: number;
  bioType: "elder" | "swagger" | "species" | "mystery";
}

/** Fully processed tree record ready for SQLite output. */
export interface ProcessedTree {
  id: string;
  sourceId: string;
  lat: number;
  lon: number;
  /** Resolved scientific name. */
  scientific: string | null;
  common: string | null;
  dbhCm: number | null;
  heightM: number | null;
  ageYears: number | null;
  ageMethod: AgeMethod;
  ageConfidence: "high" | "medium" | "low" | "none";
  speciesRank: "species" | "genus" | "unknown";
  bioIndex: number;
  bioSpeciesFk: number;
  bioType: "elder" | "swagger" | "species" | "mystery";
  isChampion: boolean;
  isHeritage: boolean;
  isAncient: boolean;
  license: string | null;
  attribution: string | null;
  sourceUpdated: string | null;
}

// ---------------------------------------------------------------------------
// Reference-data types
// ---------------------------------------------------------------------------

/** One row in the ISA growth-factor table. */
export interface GrowthFactorEntry {
  scientific: string;
  common: string;
  genus: string;
  factor: number;
  citationRef: string;
}

/** The full growth-factor lookup table. */
export interface GrowthFactorTable {
  version: string;
  sources: string[];
  unit: string;
  species: GrowthFactorEntry[];
}

/** Urban-environment adjustment factors for age estimation. */
export interface UrbanAdjustmentConfig {
  version: string;
  sources: string[];
  default: number;
  bySpecies: Record<string, number>;
}

/** A geographic region grouping one or more arborlog sources. */
export interface RegionConfig {
  id: string;
  name: string;
  sources: string[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}
