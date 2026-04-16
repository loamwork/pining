import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import type { ProcessedTree } from "../types.js";
import {
  createTileDb,
  insertSpecies,
  insertSpeciesBios,
  insertSource,
  insertTree,
  finalizeTile,
  getTileId,
  getTileBounds,
  type TileInfo,
  type SourceInfo,
} from "./sqlite.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {}
  }
  tmpDirs.length = 0;
});

function makeTree(overrides: Partial<ProcessedTree> = {}): ProcessedTree {
  return {
    id: "tree-001",
    sourceId: "nyc-parks",
    lat: 40.75,
    lon: -73.98,
    scientific: "Quercus rubra",
    common: "Red Oak",
    dbhCm: 45.5,
    heightM: 18.2,
    ageYears: 85,
    ageMethod: "isa-dbh-growth-factor",
    ageConfidence: "medium",
    speciesRank: "species",
    bioIndex: 0,
    bioSpeciesFk: 1,
    bioType: "species",
    isChampion: false,
    isHeritage: false,
    isAncient: false,
    license: "CC-BY-4.0",
    attribution: "NYC Parks",
    sourceUpdated: "2025-01-15",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SQLite tile writer", () => {
  // 1. Create and query
  it("creates a tile db, inserts species/source/trees, and queries via R-tree", () => {
    const dir = makeTmpDir();
    const dbPath = path.join(dir, "test.db");
    const db = createTileDb(dbPath);

    // Insert lookup data
    insertSpecies(db, 1, "Quercus rubra", "Red Oak");
    insertSource(db, 1, {
      sourceId: "nyc-parks",
      license: "CC-BY-4.0",
      attribution: "NYC Parks",
      sourceUpdated: "2025-01-15",
    });

    // Insert 3 trees at different locations
    const t1 = makeTree({ id: "t1", lat: 40.750, lon: -73.980 });
    const t2 = makeTree({ id: "t2", lat: 40.751, lon: -73.979 });
    const t3 = makeTree({ id: "t3", lat: 40.800, lon: -73.900 }); // further away

    insertTree(db, t1, 1);
    insertTree(db, t2, 1);
    insertTree(db, t3, 1);

    // Verify all 3 are in the trees table
    const allTrees = db.prepare("SELECT COUNT(*) as cnt FROM trees").get() as { cnt: number };
    expect(allTrees.cnt).toBe(3);

    // R-tree bounding box query around first two trees
    const nearby = db
      .prepare(
        `SELECT t.id FROM trees t
         JOIN trees_rtree r ON t.rowid = r.rowid
         WHERE r.min_lat >= ? AND r.max_lat <= ?
           AND r.min_lon >= ? AND r.max_lon <= ?`,
      )
      .all(40.749, 40.752, -73.981, -73.978) as { id: string }[];

    expect(nearby.map((r) => r.id).sort()).toEqual(["t1", "t2"]);

    finalizeTile(db);
  });

  // 2. Bio join
  it("joins trees to species_bios via species_fk", () => {
    const dir = makeTmpDir();
    const db = createTileDb(path.join(dir, "bio.db"));

    insertSpecies(db, 1, "Quercus rubra", "Red Oak");
    insertSpeciesBios(db, 1, [
      "The mighty red oak can live 500 years.",
      "Red oaks produce acorns loved by squirrels.",
    ]);
    insertSource(db, 1, {
      sourceId: "test",
      license: null,
      attribution: null,
      sourceUpdated: null,
    });

    const tree = makeTree({ id: "bio-tree", bioIndex: 1, bioSpeciesFk: 1, bioType: "species" });
    insertTree(db, tree, 1);

    const row = db
      .prepare(
        `SELECT t.id, sb.bio_text
         FROM trees t
         JOIN species_bios sb ON sb.species_id = t.bio_species_fk
                              AND sb.bio_index = t.bio_index
         WHERE t.id = ?`,
      )
      .get("bio-tree") as { id: string; bio_text: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.bio_text).toBe("Red oaks produce acorns loved by squirrels.");

    finalizeTile(db);
  });

  // 3. Mystery tree — species_fk null, bio from pseudo-species -2
  it("handles mystery trees with null species_fk and pseudo-species bios", () => {
    const dir = makeTmpDir();
    const db = createTileDb(path.join(dir, "mystery.db"));

    // Insert the mystery pseudo-species bios
    insertSpecies(db, -2, null, null);
    insertSpeciesBios(db, -2, [
      "This tree keeps its identity a secret.",
      "A mystery wrapped in bark.",
    ]);

    insertSource(db, 1, {
      sourceId: "test",
      license: null,
      attribution: null,
      sourceUpdated: null,
    });

    const tree = makeTree({
      id: "mystery-1",
      scientific: null,
      common: null,
      speciesRank: "unknown",
      bioIndex: 0,
      bioSpeciesFk: -2,
      bioType: "mystery",
    });
    // species_fk is null for mystery trees
    insertTree(db, tree, 1);

    // LEFT JOIN on species (should be null), JOIN on species_bios (should work)
    const row = db
      .prepare(
        `SELECT t.id, s.scientific, sb.bio_text
         FROM trees t
         LEFT JOIN species s ON s.id = t.species_fk
         JOIN species_bios sb ON sb.species_id = t.bio_species_fk
                              AND sb.bio_index = t.bio_index
         WHERE t.id = ?`,
      )
      .get("mystery-1") as { id: string; scientific: string | null; bio_text: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.scientific).toBeNull();
    expect(row!.bio_text).toBe("This tree keeps its identity a secret.");

    finalizeTile(db);
  });

  // 4. Tile ID computation
  it("returns consistent tile IDs for nearby coords and different IDs for distant coords", () => {
    const tileSizeKm = 5;

    // Two points very close together in NYC
    const id1 = getTileId(40.750, -73.980, "nyc", tileSizeKm);
    const id2 = getTileId(40.751, -73.979, "nyc", tileSizeKm);
    expect(id1).toBe(id2);

    // A point far away (San Francisco)
    const id3 = getTileId(37.780, -122.420, "nyc", tileSizeKm);
    expect(id3).not.toBe(id1);

    // Verify format: regionId_row_col
    expect(id1).toMatch(/^nyc_\d+_-?\d+$/);
    expect(id3).toMatch(/^nyc_\d+_-?\d+$/);
  });

  // 5. R-tree spatial query — NYC vs SF
  it("returns only spatially matching trees from R-tree queries", () => {
    const dir = makeTmpDir();
    const db = createTileDb(path.join(dir, "spatial.db"));

    insertSpecies(db, 1, "Quercus rubra", "Red Oak");
    insertSpecies(db, 2, "Sequoia sempervirens", "Coast Redwood");
    insertSource(db, 1, {
      sourceId: "multi",
      license: null,
      attribution: null,
      sourceUpdated: null,
    });

    // NYC tree
    const nyc = makeTree({
      id: "nyc-tree",
      lat: 40.75,
      lon: -73.98,
    });
    // SF tree
    const sf = makeTree({
      id: "sf-tree",
      lat: 37.78,
      lon: -122.42,
      scientific: "Sequoia sempervirens",
      common: "Coast Redwood",
    });

    insertTree(db, nyc, 1);
    insertTree(db, sf, 1);

    // Query bounding box tightly around NYC
    const nycResults = db
      .prepare(
        `SELECT t.id FROM trees t
         JOIN trees_rtree r ON t.rowid = r.rowid
         WHERE r.min_lat >= ? AND r.max_lat <= ?
           AND r.min_lon >= ? AND r.max_lon <= ?`,
      )
      .all(40.0, 41.0, -74.5, -73.0) as { id: string }[];

    expect(nycResults).toHaveLength(1);
    expect(nycResults[0].id).toBe("nyc-tree");

    // Query bounding box around SF
    const sfResults = db
      .prepare(
        `SELECT t.id FROM trees t
         JOIN trees_rtree r ON t.rowid = r.rowid
         WHERE r.min_lat >= ? AND r.max_lat <= ?
           AND r.min_lon >= ? AND r.max_lon <= ?`,
      )
      .all(37.0, 38.0, -123.0, -122.0) as { id: string }[];

    expect(sfResults).toHaveLength(1);
    expect(sfResults[0].id).toBe("sf-tree");

    finalizeTile(db);
  });

  // 6. getTileBounds round-trips with getTileId
  it("getTileBounds returns bounds that contain the original point", () => {
    const tileSizeKm = 5;
    const lat = 40.75;
    const lon = -73.98;

    const tileId = getTileId(lat, lon, "nyc", tileSizeKm);
    const bounds = getTileBounds(tileId, tileSizeKm);

    expect(bounds.minLat).toBeLessThanOrEqual(lat);
    expect(bounds.maxLat).toBeGreaterThan(lat);
    expect(bounds.minLon).toBeLessThanOrEqual(lon);
    expect(bounds.maxLon).toBeGreaterThan(lon);
  });
});
