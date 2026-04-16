// ---------------------------------------------------------------------------
// Tile manifest — compression, hashing, and manifest generation
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TileManifestEntry {
  id: string;
  region: string;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  treeCount: number;
  density: number; // trees per km²
  fileSize: number;
  fileSizeCompressed: number;
  hash: string;
}

export interface RegionSummary {
  id: string;
  name: string;
  sources: string[];
  treeCount: number;
  tileCount: number;
}

export interface TileManifest {
  version: string;
  generatedAt: string;
  tileSize: string;
  tiles: TileManifestEntry[];
  regions: RegionSummary[];
}

// ---------------------------------------------------------------------------
// 1. compressTile
// ---------------------------------------------------------------------------

/**
 * Compress a tile SQLite file with gzip, compute SHA-256 hash of the
 * compressed output, and return metadata.
 */
export function compressTile(sqlitePath: string): {
  compressedPath: string;
  fileSize: number;
  fileSizeCompressed: number;
  hash: string;
} {
  const raw = readFileSync(sqlitePath);
  const compressed = gzipSync(raw);
  const compressedPath = `${sqlitePath}.gz`;
  writeFileSync(compressedPath, compressed);

  const hash = createHash("sha256").update(compressed).digest("hex");

  return {
    compressedPath,
    fileSize: raw.length,
    fileSizeCompressed: compressed.length,
    hash,
  };
}

// ---------------------------------------------------------------------------
// 2. tileAreaKm2
// ---------------------------------------------------------------------------

/**
 * Compute tile area in km² from bounds.
 *
 * Uses a flat-Earth approximation at ~45° latitude:
 *   latKm = (maxLat - minLat) * 111
 *   lonKm = (maxLon - minLon) * 79
 */
export function tileAreaKm2(bounds: {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}): number {
  const latKm = (bounds.maxLat - bounds.minLat) * 111;
  const lonKm = (bounds.maxLon - bounds.minLon) * 79;
  return latKm * lonKm;
}

// ---------------------------------------------------------------------------
// 3. buildManifest
// ---------------------------------------------------------------------------

/**
 * Build the full tile manifest from tile entries and region summaries.
 */
export function buildManifest(
  tiles: TileManifestEntry[],
  regions: RegionSummary[],
): TileManifest {
  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    tileSize: "5km",
    tiles,
    regions,
  };
}

// ---------------------------------------------------------------------------
// 4. writeManifest
// ---------------------------------------------------------------------------

/**
 * Write manifest to disk as formatted JSON.
 */
export function writeManifest(manifest: TileManifest, outputPath: string): void {
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
}
