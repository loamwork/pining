// ---------------------------------------------------------------------------
// Pining indexer — SQLite tile writer
// ---------------------------------------------------------------------------
// Creates per-tile SQLite databases with R-tree spatial indexes, writes
// processed tree records, and manages normalized lookup tables (species,
// species_bios, sources).
// ---------------------------------------------------------------------------

import Database from "better-sqlite3";
import type { ProcessedTree } from "../types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TileInfo {
  id: string;
  region: string;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  filePath: string;
  treeCount: number;
  fileSize: number;
  fileSizeCompressed: number;
  hash: string;
}

export interface SourceInfo {
  sourceId: string;
  license: string | null;
  attribution: string | null;
  sourceUpdated: string | null;
}

// ---------------------------------------------------------------------------
// Constants for tile grid
// ---------------------------------------------------------------------------

// At ~45deg latitude (midpoint of US):
// 1deg lat ~= 111 km, 1deg lon ~= 79 km
const KM_PER_DEG_LAT = 111;
const KM_PER_DEG_LON = 79;

// ---------------------------------------------------------------------------
// 1. createTileDb
// ---------------------------------------------------------------------------

export function createTileDb(filePath: string): InstanceType<typeof Database> {
  const db = new Database(filePath);

  // Enable WAL mode for better write performance during bulk inserts
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE species (
      id INTEGER PRIMARY KEY,
      scientific TEXT,
      common TEXT
    );

    CREATE TABLE species_bios (
      species_id INTEGER NOT NULL,
      bio_index INTEGER NOT NULL,
      bio_text TEXT NOT NULL,
      PRIMARY KEY (species_id, bio_index)
    );

    CREATE TABLE sources (
      id INTEGER PRIMARY KEY,
      source_id TEXT NOT NULL,
      license TEXT,
      attribution TEXT,
      source_updated TEXT
    );

    CREATE TABLE trees (
      id TEXT PRIMARY KEY,
      source_fk INTEGER NOT NULL REFERENCES sources(id),
      species_fk INTEGER REFERENCES species(id),
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      dbh_cm REAL,
      height_m REAL,
      age_years INTEGER,
      age_method TEXT NOT NULL,
      age_confidence TEXT NOT NULL,
      species_rank TEXT NOT NULL,
      bio_index INTEGER NOT NULL,
      bio_species_fk INTEGER NOT NULL,
      bio_type TEXT NOT NULL,
      is_champion INTEGER DEFAULT 0,
      is_heritage INTEGER DEFAULT 0,
      is_ancient INTEGER DEFAULT 0
    );

    CREATE VIRTUAL TABLE trees_rtree USING rtree(
      rowid,
      min_lat, max_lat,
      min_lon, max_lon
    );

    CREATE INDEX idx_trees_dbh ON trees(dbh_cm DESC);
    CREATE INDEX idx_trees_age ON trees(age_years DESC);
  `);

  return db;
}

// ---------------------------------------------------------------------------
// 2. insertSpecies
// ---------------------------------------------------------------------------

export function insertSpecies(
  db: InstanceType<typeof Database>,
  id: number,
  scientific: string | null,
  common: string | null,
): void {
  db.prepare("INSERT INTO species (id, scientific, common) VALUES (?, ?, ?)").run(
    id,
    scientific,
    common,
  );
}

// ---------------------------------------------------------------------------
// 3. insertSpeciesBios
// ---------------------------------------------------------------------------

export function insertSpeciesBios(
  db: InstanceType<typeof Database>,
  speciesId: number,
  bios: string[],
): void {
  const stmt = db.prepare(
    "INSERT INTO species_bios (species_id, bio_index, bio_text) VALUES (?, ?, ?)",
  );
  for (let i = 0; i < bios.length; i++) {
    stmt.run(speciesId, i, bios[i]);
  }
}

// ---------------------------------------------------------------------------
// 4. insertSource
// ---------------------------------------------------------------------------

export function insertSource(
  db: InstanceType<typeof Database>,
  id: number,
  info: SourceInfo,
): void {
  db.prepare(
    "INSERT INTO sources (id, source_id, license, attribution, source_updated) VALUES (?, ?, ?, ?, ?)",
  ).run(id, info.sourceId, info.license, info.attribution, info.sourceUpdated);
}

// ---------------------------------------------------------------------------
// 5. insertTree
// ---------------------------------------------------------------------------

export function insertTree(
  db: InstanceType<typeof Database>,
  tree: ProcessedTree,
  sourceFk: number,
): void {
  // Determine species_fk: null for mystery/unknown trees without a resolved species
  const speciesFk =
    tree.speciesRank === "unknown" && tree.scientific === null ? null : tree.bioSpeciesFk;

  const info = db
    .prepare(
      `INSERT INTO trees (
        id, source_fk, species_fk, lat, lon,
        dbh_cm, height_m, age_years, age_method, age_confidence,
        species_rank, bio_index, bio_species_fk, bio_type,
        is_champion, is_heritage, is_ancient
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )`,
    )
    .run(
      tree.id,
      sourceFk,
      speciesFk,
      tree.lat,
      tree.lon,
      tree.dbhCm,
      tree.heightM,
      tree.ageYears,
      tree.ageMethod,
      tree.ageConfidence,
      tree.speciesRank,
      tree.bioIndex,
      tree.bioSpeciesFk,
      tree.bioType,
      tree.isChampion ? 1 : 0,
      tree.isHeritage ? 1 : 0,
      tree.isAncient ? 1 : 0,
    );

  // Insert into the R-tree using the rowid from the trees insert
  db.prepare(
    "INSERT INTO trees_rtree (rowid, min_lat, max_lat, min_lon, max_lon) VALUES (?, ?, ?, ?, ?)",
  ).run(info.lastInsertRowid, tree.lat, tree.lat, tree.lon, tree.lon);
}

// ---------------------------------------------------------------------------
// 6. finalizeTile
// ---------------------------------------------------------------------------

export function finalizeTile(db: InstanceType<typeof Database>): void {
  db.exec("ANALYZE");
  db.close();
}

// ---------------------------------------------------------------------------
// 7. getTileId
// ---------------------------------------------------------------------------

export function getTileId(
  lat: number,
  lon: number,
  regionId: string,
  tileSizeKm: number,
): string {
  const latStep = tileSizeKm / KM_PER_DEG_LAT;
  const lonStep = tileSizeKm / KM_PER_DEG_LON;

  const gridRow = Math.floor(lat / latStep);
  const gridCol = Math.floor(lon / lonStep);

  return `${regionId}_${gridRow}_${gridCol}`;
}

// ---------------------------------------------------------------------------
// 8. getTileBounds
// ---------------------------------------------------------------------------

export function getTileBounds(
  tileId: string,
  tileSizeKm: number,
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const latStep = tileSizeKm / KM_PER_DEG_LAT;
  const lonStep = tileSizeKm / KM_PER_DEG_LON;

  // Parse tileId: regionId_row_col
  // regionId may contain underscores, so take last two segments as row/col
  const parts = tileId.split("_");
  const gridCol = parseInt(parts.pop()!, 10);
  const gridRow = parseInt(parts.pop()!, 10);

  const minLat = gridRow * latStep;
  const maxLat = (gridRow + 1) * latStep;
  const minLon = gridCol * lonStep;
  const maxLon = (gridCol + 1) * lonStep;

  return { minLat, maxLat, minLon, maxLon };
}
