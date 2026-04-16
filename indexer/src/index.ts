// ---------------------------------------------------------------------------
// Pining indexer — CLI entry point and pipeline orchestrator
// ---------------------------------------------------------------------------
// Usage:
//   npx tsx src/index.ts --arborlog ../arborlog/live-data
//   npx tsx src/index.ts --arborlog ../arborlog/live-data --source nyc
//   npx tsx src/index.ts --arborlog ../arborlog/live-data --dry-run
// ---------------------------------------------------------------------------

import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  RawTree,
  ProcessedTree,
  GrowthFactorTable,
  UrbanAdjustmentConfig,
  RegionConfig,
  AgeMethod,
} from "./types.js";
import type { MultifactorialModelConfig } from "./age/multifactorial.js";
import { streamArray } from "./stream.js";
import { isJunk } from "./filter/junk.js";
import { resolveSpecies } from "./species/resolve.js";
import { loadCommonNameMap } from "./species/common-map.js";
import { loadRedmondCodes } from "./species/redmond-codes.js";
import { estimateAge } from "./age/router.js";
import { assignBio } from "./bio/assign.js";
import {
  createTileDb,
  insertTree,
  insertSpecies,
  insertSpeciesBios,
  insertSource,
  finalizeTile,
  getTileId,
  getTileBounds,
  type SourceInfo,
} from "./output/sqlite.js";
import {
  compressTile,
  tileAreaKm2,
  buildManifest,
  writeManifest,
  type TileManifestEntry,
  type RegionSummary,
} from "./output/manifest.js";
import { buildReport, type SourceStats } from "./report.js";

import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BiosCache {
  species: Record<string, string[]>;
  elder: string[];
  mystery: string[];
}

interface RegionsConfig {
  version: string;
  tileSizeKm: number;
  regions: RegionConfig[];
}

interface CliArgs {
  arborlogPath: string;
  sourceFilter: string | null;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let arborlogPath: string | null = null;
  let sourceFilter: string | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--arborlog" && i + 1 < args.length) {
      arborlogPath = resolve(args[++i]);
    } else if (args[i] === "--source" && i + 1 < args.length) {
      sourceFilter = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  if (!arborlogPath) {
    console.error(
      "Usage: npx tsx src/index.ts --arborlog <path> [--source <id>] [--dry-run]",
    );
    process.exit(1);
  }

  return { arborlogPath, sourceFilter, dryRun };
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function loadJsonConfig<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function loadBiosCache(dataDir: string): BiosCache {
  const biosPath = join(dataDir, "species-bios.json");
  if (!existsSync(biosPath)) {
    console.warn(
      "No species-bios.json found — run generate-bios first for bio assignment.",
    );
    return { species: {}, elder: [], mystery: [] };
  }
  const raw = loadJsonConfig<BiosCache & Record<string, unknown>>(biosPath);
  return {
    species: raw.species ?? {},
    elder: raw.elder ?? [],
    mystery: raw.mystery ?? [],
  };
}

// ---------------------------------------------------------------------------
// Source-to-region mapping
// ---------------------------------------------------------------------------

function buildSourceToRegionMap(
  regions: RegionConfig[],
): Map<string, RegionConfig> {
  const map = new Map<string, RegionConfig>();
  for (const region of regions) {
    for (const src of region.sources) {
      map.set(src, region);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Stats tracking
// ---------------------------------------------------------------------------

interface PerSourceTracker {
  sourceId: string;
  totalIn: number;
  dropped: number;
  byAgeMethod: Record<string, number>;
  bySpeciesRank: Record<string, number>;
  ages: number[];
}

function newTracker(sourceId: string): PerSourceTracker {
  return {
    sourceId,
    totalIn: 0,
    dropped: 0,
    byAgeMethod: {},
    bySpeciesRank: {},
    ages: [],
  };
}

function trackerToStats(t: PerSourceTracker): SourceStats {
  const sorted = t.ages.slice().sort((a, b) => a - b);
  const medianAge =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[Math.floor(sorted.length / 2)]
        : Math.round(
            (sorted[Math.floor(sorted.length / 2) - 1] +
              sorted[Math.floor(sorted.length / 2)]) /
              2,
          );

  return {
    sourceId: t.sourceId,
    totalIn: t.totalIn,
    dropped: t.dropped,
    byAgeMethod: t.byAgeMethod,
    bySpeciesRank: t.bySpeciesRank,
    medianAge,
  };
}

// ---------------------------------------------------------------------------
// Tile DB management
// ---------------------------------------------------------------------------

interface TileState {
  db: InstanceType<typeof Database>;
  filePath: string;
  region: string;
  treeCount: number;
  insertedSpecies: Set<number>;
  insertedSources: Set<number>;
}

function ensureTileDb(
  tileId: string,
  region: string,
  tilesDir: string,
  tileMap: Map<string, TileState>,
  biosCache: BiosCache,
  speciesIdMap: Map<string, number>,
  speciesNames: Map<number, { scientific: string | null; common: string | null }>,
): TileState {
  let state = tileMap.get(tileId);
  if (state) return state;

  const filePath = join(tilesDir, `${tileId}.sqlite`);
  const db = createTileDb(filePath);

  // Insert elder pseudo-species and bios
  insertSpecies(db, -1, null, null);
  if (biosCache.elder.length > 0) {
    insertSpeciesBios(db, -1, biosCache.elder);
  }

  // Insert mystery pseudo-species and bios
  insertSpecies(db, -2, null, null);
  if (biosCache.mystery.length > 0) {
    insertSpeciesBios(db, -2, biosCache.mystery);
  }

  state = {
    db,
    filePath,
    region,
    treeCount: 0,
    insertedSpecies: new Set<number>([-1, -2]),
    insertedSources: new Set<number>(),
  };
  tileMap.set(tileId, state);
  return state;
}

function ensureSpeciesInTile(
  tile: TileState,
  speciesId: number,
  speciesNames: Map<number, { scientific: string | null; common: string | null }>,
  biosCache: BiosCache,
): void {
  if (tile.insertedSpecies.has(speciesId)) return;
  tile.insertedSpecies.add(speciesId);

  const names = speciesNames.get(speciesId);
  insertSpecies(tile.db, speciesId, names?.scientific ?? null, names?.common ?? null);

  // Insert species bios if available
  const sci = names?.scientific;
  if (sci && biosCache.species[sci]) {
    insertSpeciesBios(tile.db, speciesId, biosCache.species[sci]);
  }
}

function ensureSourceInTile(
  tile: TileState,
  sourceNumericId: number,
  info: SourceInfo,
): void {
  if (tile.insertedSources.has(sourceNumericId)) return;
  tile.insertedSources.add(sourceNumericId);
  insertSource(tile.db, sourceNumericId, info);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function runPipeline(cli: CliArgs): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const configDir = resolve(__dirname, "../config");
  const dataDir = resolve(__dirname, "../data");
  const outputDir = resolve(__dirname, "../output");
  const tilesDir = join(outputDir, "tiles");

  // 1. Load configs
  console.log("Loading configs...");
  const growthFactors = loadJsonConfig<GrowthFactorTable>(
    join(configDir, "growth-factors.json"),
  );
  const urbanAdjustment = loadJsonConfig<UrbanAdjustmentConfig>(
    join(configDir, "urban-adjustment.json"),
  );
  const multifactorialModel = loadJsonConfig<MultifactorialModelConfig>(
    join(configDir, "multifactorial-model.json"),
  );
  const commonNameMap = loadCommonNameMap(join(configDir, "common-to-scientific.json"));
  const redmondCodeMap = loadRedmondCodes(join(configDir, "redmond-species-codes.json"));
  const regionsConfig = loadJsonConfig<RegionsConfig>(join(configDir, "regions.json"));
  const biosCache = loadBiosCache(dataDir);

  const tileSizeKm = regionsConfig.tileSizeKm;
  const sourceToRegion = buildSourceToRegionMap(regionsConfig.regions);

  // 2. Determine source files
  const allFiles = readdirSync(cli.arborlogPath).filter(
    (f) => f.endsWith(".json") && f !== "manifest.json",
  );

  const sourceFiles = cli.sourceFilter
    ? allFiles.filter((f) => f.replace(".json", "") === cli.sourceFilter)
    : allFiles;

  if (sourceFiles.length === 0) {
    console.error(`No source files found${cli.sourceFilter ? ` for --source ${cli.sourceFilter}` : ""}.`);
    process.exit(1);
  }

  console.log(`Processing ${sourceFiles.length} source file(s)...`);

  // 3. Build lookup maps
  const speciesIdMap = new Map<string, number>();
  const speciesNames = new Map<number, { scientific: string | null; common: string | null }>();
  let nextSpeciesId = 1;

  const sourceIdMap = new Map<string, number>();
  let nextSourceId = 1;

  const tileMap = new Map<string, TileState>();
  const trackers = new Map<string, PerSourceTracker>();

  // Ensure output dirs
  if (!cli.dryRun) {
    mkdirSync(tilesDir, { recursive: true });
  }

  // 4. Process each source file
  for (const file of sourceFiles) {
    const sourceId = file.replace(".json", "");
    const region = sourceToRegion.get(sourceId);

    if (!region) {
      console.warn(`Source "${sourceId}" not mapped to any region — skipping.`);
      continue;
    }

    // Assign source numeric ID
    if (!sourceIdMap.has(sourceId)) {
      sourceIdMap.set(sourceId, nextSourceId++);
    }
    const sourceNumericId = sourceIdMap.get(sourceId)!;

    const tracker = newTracker(sourceId);
    trackers.set(sourceId, tracker);

    const filePath = join(cli.arborlogPath, file);
    console.log(`  ${sourceId} (${region.name})...`);

    await streamArray(filePath, (raw) => {
      const tree = raw as unknown as RawTree;
      tracker.totalIn++;

      // a. Junk filter
      if (isJunk(tree)) {
        tracker.dropped++;
        return;
      }

      // b. Species resolution
      const speciesRes = resolveSpecies(tree, commonNameMap, redmondCodeMap);

      // c. Age estimation
      const ageEst = estimateAge(
        tree,
        speciesRes,
        growthFactors,
        urbanAdjustment,
        multifactorialModel,
      );

      // Track species ID
      const sciKey = speciesRes.scientificResolved ?? "";
      if (sciKey && !speciesIdMap.has(sciKey)) {
        const id = nextSpeciesId++;
        speciesIdMap.set(sciKey, id);
        speciesNames.set(id, {
          scientific: speciesRes.scientificResolved,
          common: tree.common?.trim() || null,
        });
      }

      // Determine flags
      const isChampion =
        sourceId === "atlanta_champion" ||
        sourceId === "san_jose_heritage" ||
        sourceId === "pdx_heritage";
      const isHeritage = isChampion;
      const isAncient = ageEst.years >= 200;

      // d. Bio assignment
      const bioResult = assignBio(
        tree.id,
        speciesRes,
        ageEst,
        isAncient,
        isChampion,
        isHeritage,
        speciesIdMap,
      );

      // e. Build ProcessedTree
      const processed: ProcessedTree = {
        id: tree.id,
        sourceId,
        lat: tree.lat,
        lon: tree.lon,
        scientific: speciesRes.scientificResolved,
        common: tree.common?.trim() || null,
        dbhCm: typeof tree.dbh === "number" ? tree.dbh : null,
        heightM: typeof tree.height === "number" ? tree.height : null,
        ageYears: ageEst.years > 0 ? ageEst.years : null,
        ageMethod: ageEst.method,
        ageConfidence: ageEst.confidence,
        speciesRank: speciesRes.rank,
        bioIndex: bioResult.bioIndex,
        bioSpeciesFk: bioResult.bioSpeciesFk,
        bioType: bioResult.bioType,
        isChampion,
        isHeritage,
        isAncient,
        license: tree.license ?? null,
        attribution: tree.attributionUrl ?? null,
        sourceUpdated: tree.sourceLastUpdated ?? null,
      };

      // Track stats
      tracker.byAgeMethod[ageEst.method] =
        (tracker.byAgeMethod[ageEst.method] ?? 0) + 1;
      tracker.bySpeciesRank[speciesRes.rank] =
        (tracker.bySpeciesRank[speciesRes.rank] ?? 0) + 1;
      if (ageEst.years > 0) {
        tracker.ages.push(ageEst.years);
      }

      // f–g. Tile assignment and database writes (skip in dry-run)
      if (!cli.dryRun) {
        const tileId = getTileId(tree.lat, tree.lon, region.id, tileSizeKm);
        const tile = ensureTileDb(
          tileId,
          region.id,
          tilesDir,
          tileMap,
          biosCache,
          speciesIdMap,
          speciesNames,
        );

        // Ensure species and source lookups
        if (sciKey && speciesIdMap.has(sciKey)) {
          ensureSpeciesInTile(tile, speciesIdMap.get(sciKey)!, speciesNames, biosCache);
        }
        ensureSourceInTile(tile, sourceNumericId, {
          sourceId,
          license: processed.license,
          attribution: processed.attribution,
          sourceUpdated: processed.sourceUpdated,
        });

        insertTree(tile.db, processed, sourceNumericId);
        tile.treeCount++;
      }
    });

    const indexed = tracker.totalIn - tracker.dropped;
    console.log(
      `    ${tracker.totalIn} in, ${tracker.dropped} dropped, ${indexed} indexed`,
    );
  }

  // 5. Finalize
  const allStats = Array.from(trackers.values()).map(trackerToStats);

  if (!cli.dryRun) {
    // Finalize, compress, and build manifest
    console.log("\nFinalizing tiles...");
    const tileEntries: TileManifestEntry[] = [];
    let totalCompressedBytes = 0;

    for (const [tileId, tile] of tileMap) {
      finalizeTile(tile.db);

      const { compressedPath, fileSize, fileSizeCompressed, hash } =
        compressTile(tile.filePath);

      const bounds = getTileBounds(tileId, tileSizeKm);
      const area = tileAreaKm2(bounds);
      const density = area > 0 ? Math.round(tile.treeCount / area) : 0;

      tileEntries.push({
        id: tileId,
        region: tile.region,
        bounds,
        treeCount: tile.treeCount,
        density,
        fileSize,
        fileSizeCompressed,
        hash,
      });

      totalCompressedBytes += fileSizeCompressed;
    }

    // Build region summaries
    const regionSummaries: RegionSummary[] = regionsConfig.regions
      .map((r) => {
        const regionTiles = tileEntries.filter((t) => t.region === r.id);
        return {
          id: r.id,
          name: r.name,
          sources: r.sources,
          treeCount: regionTiles.reduce((sum, t) => sum + t.treeCount, 0),
          tileCount: regionTiles.length,
        };
      })
      .filter((r) => r.tileCount > 0);

    const manifest = buildManifest(tileEntries, regionSummaries);
    writeManifest(manifest, join(outputDir, "manifest.json"));

    console.log(
      `Wrote ${tileEntries.length} tiles, ${(totalCompressedBytes / 1024 / 1024).toFixed(1)} MB compressed`,
    );

    // Build and print report
    const report = buildReport(allStats, tileEntries.length, totalCompressedBytes);
    printReport(report);
  } else {
    // Dry run — just print stats
    const report = buildReport(allStats, 0, 0);
    printReport(report);
  }
}

// ---------------------------------------------------------------------------
// Report printing
// ---------------------------------------------------------------------------

function printReport(report: ReturnType<typeof buildReport>): void {
  console.log("\n" + "=".repeat(60));
  console.log("  PIPELINE REPORT");
  console.log("=".repeat(60));
  console.log(`  Total trees indexed: ${report.totalTreesIndexed.toLocaleString()}`);
  console.log(`  Total tiles produced: ${report.totalTilesProduced}`);
  console.log(`  Total compressed size: ${report.totalCompressedSizeMb} MB`);

  console.log("\n  Per-source breakdown:");
  for (const s of report.sourceStats) {
    const indexed = s.totalIn - s.dropped;
    const dropPct =
      s.totalIn > 0 ? ((s.dropped / s.totalIn) * 100).toFixed(1) : "0.0";
    console.log(
      `    ${s.sourceId}: ${indexed.toLocaleString()} indexed (${s.totalIn.toLocaleString()} in, ${dropPct}% dropped)` +
        (s.medianAge !== null ? `, median age ${s.medianAge}yr` : ""),
    );
  }

  if (report.anomalies.length > 0) {
    console.log("\n  Anomalies:");
    for (const a of report.anomalies) {
      console.log(`    - ${a}`);
    }
  }

  console.log("=".repeat(60));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const cli = parseArgs(process.argv);
runPipeline(cli).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
