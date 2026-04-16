import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import type { RawTree } from "../types.js";
import { loadCommonNameMap } from "./common-map.js";
import { loadRedmondCodes } from "./redmond-codes.js";
import { resolveSpecies } from "./resolve.js";

const commonMap = loadCommonNameMap(
  resolve(process.cwd(), "config/common-to-scientific.json"),
);
const redmondMap = loadRedmondCodes(
  resolve(process.cwd(), "config/redmond-species-codes.json"),
);

/** Minimal RawTree stub with just the fields resolveSpecies needs. */
function stubTree(
  overrides: Partial<RawTree> & { sourceId: string },
): RawTree {
  return {
    id: "test-1",
    sourceNativeId: "1",
    lat: 0,
    lon: 0,
    scientific: null,
    common: null,
    dbh: null,
    height: null,
    license: null,
    attributionUrl: null,
    sourceLastUpdated: null,
    ingestedAt: null,
    ...overrides,
  } as RawTree;
}

describe("resolveSpecies", () => {
  it("binomial: scientific with space -> species", () => {
    const tree = stubTree({
      sourceId: "portland",
      scientific: "Quercus rubra",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result).toEqual({
      rank: "species",
      scientificRaw: "Quercus rubra",
      scientificResolved: "Quercus rubra",
      inferredFrom: null,
    });
  });

  it("genus-only: single-word scientific -> genus", () => {
    const tree = stubTree({
      sourceId: "portland",
      scientific: "Acer",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result).toEqual({
      rank: "genus",
      scientificRaw: "Acer",
      scientificResolved: "Acer",
      inferredFrom: null,
    });
  });

  it("Redmond code: sourceId 'redmond', scientific 'QUERUB' -> species via code map", () => {
    const tree = stubTree({
      sourceId: "redmond",
      scientific: "QUERUB",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result).toEqual({
      rank: "species",
      scientificRaw: "QUERUB",
      scientificResolved: "Quercus rubra",
      inferredFrom: "species-code-map",
    });
  });

  it("common name rescue (Irvine): inverts Lucity format then looks up", () => {
    const tree = stubTree({
      sourceId: "irvine",
      scientific: null,
      common: "Oak, Coast Live",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result).toEqual({
      rank: "species",
      scientificRaw: null,
      scientificResolved: "Quercus agrifolia",
      inferredFrom: "common-name-map",
    });
  });

  it("common name rescue (Austin): strips parens, inverts, looks up", () => {
    const tree = stubTree({
      sourceId: "austin",
      scientific: null,
      common: "Oak, Live (Southern)",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result).toEqual({
      rank: "species",
      scientificRaw: null,
      scientificResolved: "Quercus virginiana",
      inferredFrom: "common-name-map",
    });
  });

  it("common name rescue (Beaverton): title-cases then looks up", () => {
    const tree = stubTree({
      sourceId: "beaverton",
      scientific: null,
      common: "NORWAY MAPLE",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result).toEqual({
      rank: "species",
      scientificRaw: null,
      scientificResolved: "Acer platanoides",
      inferredFrom: "common-name-map",
    });
  });

  it("genus from common: Beaverton 'MAPLE' -> genus Acer", () => {
    const tree = stubTree({
      sourceId: "beaverton",
      scientific: null,
      common: "MAPLE",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result).toEqual({
      rank: "genus",
      scientificRaw: null,
      scientificResolved: "Acer",
      inferredFrom: "common-name-map",
    });
  });

  it("epithet-only scientific falls through to common-name rescue (Northbrook)", () => {
    const tree = stubTree({
      sourceId: "northbrook",
      scientific: "americana",
      common: "American Elm",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result.rank).toBe("species");
    expect(result.inferredFrom).toBe("common-name-map");
    expect(result.scientificResolved).toBe("Ulmus americana");
  });

  it("epithet-only 'rubrum' with common 'Red Maple' resolves via common (Glencoe)", () => {
    const tree = stubTree({
      sourceId: "glencoe",
      scientific: "rubrum",
      common: "Red Maple",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result.rank).toBe("species");
    expect(result.inferredFrom).toBe("common-name-map");
    expect(result.scientificResolved).toBe("Acer rubrum");
  });

  it("capitalized single word is still treated as genus", () => {
    const tree = stubTree({
      sourceId: "portland",
      scientific: "Acer",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result.rank).toBe("genus");
    expect(result.inferredFrom).toBeNull();
  });

  it("unknown: null scientific AND null common -> unknown", () => {
    const tree = stubTree({
      sourceId: "portland",
      scientific: null,
      common: null,
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result).toEqual({
      rank: "unknown",
      scientificRaw: null,
      scientificResolved: null,
      inferredFrom: null,
    });
  });

  it("unresolvable common: common not in map -> unknown", () => {
    const tree = stubTree({
      sourceId: "portland",
      scientific: null,
      common: "XYZ Nonsense",
    });
    const result = resolveSpecies(tree, commonMap, redmondMap);
    expect(result).toEqual({
      rank: "unknown",
      scientificRaw: null,
      scientificResolved: null,
      inferredFrom: null,
    });
  });
});
