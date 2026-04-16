import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  compressTile,
  tileAreaKm2,
  buildManifest,
  writeManifest,
  type TileManifestEntry,
  type RegionSummary,
} from "./manifest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-test-"));
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("manifest", () => {
  // 1. compressTile
  it("compresses a file, creates .gz, compressed < original, hash is hex", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "test.sqlite");

    // Write a file with enough repetitive content that gzip will shrink it
    const content = "ABCDEFGHIJ".repeat(1000);
    fs.writeFileSync(filePath, content);

    const result = compressTile(filePath);

    // .gz file exists
    expect(fs.existsSync(result.compressedPath)).toBe(true);
    expect(result.compressedPath).toBe(`${filePath}.gz`);

    // Compressed size < original
    expect(result.fileSizeCompressed).toBeLessThan(result.fileSize);
    expect(result.fileSize).toBe(content.length);

    // Hash is a 64-character hex string (SHA-256)
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  // 2. buildManifest
  it("builds a manifest with version, generatedAt, tiles, and regions", () => {
    const tiles: TileManifestEntry[] = [
      {
        id: "nyc_882_-934",
        region: "nyc",
        bounds: { minLat: 40.7, maxLat: 40.75, minLon: -74.0, maxLon: -73.95 },
        treeCount: 500,
        density: 1200,
        fileSize: 50000,
        fileSizeCompressed: 20000,
        hash: "abc123",
      },
    ];

    const regions: RegionSummary[] = [
      {
        id: "nyc",
        name: "New York City",
        sources: ["nyc", "nyc_forestry"],
        treeCount: 500,
        tileCount: 1,
      },
    ];

    const manifest = buildManifest(tiles, regions);

    expect(manifest.version).toBe("1.0.0");
    expect(manifest.generatedAt).toBeTruthy();
    expect(manifest.tileSize).toBe("5km");
    expect(manifest.tiles).toHaveLength(1);
    expect(manifest.tiles[0].id).toBe("nyc_882_-934");
    expect(manifest.regions).toHaveLength(1);
    expect(manifest.regions[0].id).toBe("nyc");
    expect(manifest.regions[0].treeCount).toBe(500);
  });

  // 3. tileAreaKm2
  it("computes approximate tile area from bounds", () => {
    // 1 degree lat x 1 degree lon at ~45° ≈ 111 km x 79 km = 8769 km²
    const area = tileAreaKm2({
      minLat: 40.0,
      maxLat: 41.0,
      minLon: -74.0,
      maxLon: -73.0,
    });

    // 111 * 79 = 8769
    expect(area).toBeCloseTo(8769, 0);

    // Smaller tile: 0.05 deg lat x 0.06 deg lon
    // latKm = 0.05 * 111 = 5.55, lonKm = 0.06 * 79 = 4.74
    // area = 5.55 * 4.74 ≈ 26.307
    const small = tileAreaKm2({
      minLat: 40.0,
      maxLat: 40.05,
      minLon: -74.0,
      maxLon: -73.94,
    });
    expect(small).toBeCloseTo(26.307, 0);
  });

  // 4. writeManifest writes valid JSON to disk
  it("writes manifest to disk as JSON", () => {
    const dir = makeTmpDir();
    const outPath = path.join(dir, "manifest.json");

    const manifest = buildManifest([], []);
    writeManifest(manifest, outPath);

    expect(fs.existsSync(outPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outPath, "utf-8"));
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.tiles).toEqual([]);
    expect(parsed.regions).toEqual([]);
  });
});
