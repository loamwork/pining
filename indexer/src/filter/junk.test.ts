import { describe, it, expect } from "vitest";
import { isJunk } from "./junk.js";
import type { RawTree } from "../types.js";

/** Helper: minimal RawTree with defaults. */
function raw(overrides: Partial<RawTree> = {}): RawTree {
  return {
    id: "test-1",
    sourceId: "test",
    sourceNativeId: "1",
    lat: 47.6,
    lon: -122.3,
    scientific: "Quercus robur",
    common: "English Oak",
    dbh: null,
    height: null,
    license: null,
    attributionUrl: null,
    sourceLastUpdated: null,
    ingestedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Global regex filter — known junk strings
// ---------------------------------------------------------------------------

describe("isJunk — global regex filter", () => {
  const junkStrings = [
    "Vacant site",
    "Vacant Site Small",
    "Vacant Site Large",
    "Vacant Site Medium",
    "Vacant Planting Site",
    "Vacant site-not plantable",
    "Vacant Planting Site - Small",
    "Unknown",
    "Unknown Tree Species",
    "Stump",
    "Other (See Notes)",
  ];

  for (const s of junkStrings) {
    it(`drops scientific="${s}"`, () => {
      expect(isJunk(raw({ scientific: s }))).toBe(true);
    });

    it(`drops common="${s}"`, () => {
      expect(isJunk(raw({ common: s }))).toBe(true);
    });
  }

  // Additional global pattern matches (not in the known list but matching the regex)
  it('drops scientific="Dead"', () => {
    expect(isJunk(raw({ scientific: "Dead" }))).toBe(true);
  });

  it('drops scientific="Missing"', () => {
    expect(isJunk(raw({ scientific: "Missing" }))).toBe(true);
  });

  it('drops scientific="Removed"', () => {
    expect(isJunk(raw({ scientific: "Removed" }))).toBe(true);
  });

  it('drops scientific="Not Identified"', () => {
    expect(isJunk(raw({ scientific: "Not Identified" }))).toBe(true);
  });

  it('drops scientific="No Tree"', () => {
    expect(isJunk(raw({ scientific: "No Tree" }))).toBe(true);
  });

  it('drops scientific="Planting Site"', () => {
    expect(isJunk(raw({ scientific: "Planting Site" }))).toBe(true);
  });

  it('drops scientific="Null"', () => {
    expect(isJunk(raw({ scientific: "Null" }))).toBe(true);
  });

  it('drops scientific="None"', () => {
    expect(isJunk(raw({ scientific: "None" }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Case insensitivity
// ---------------------------------------------------------------------------

describe("isJunk — case insensitivity", () => {
  it('drops "VACANT SITE"', () => {
    expect(isJunk(raw({ scientific: "VACANT SITE" }))).toBe(true);
  });

  it('drops "vacant site"', () => {
    expect(isJunk(raw({ scientific: "vacant site" }))).toBe(true);
  });

  it('drops "Vacant SITE"', () => {
    expect(isJunk(raw({ scientific: "Vacant SITE" }))).toBe(true);
  });

  it('drops "STUMP"', () => {
    expect(isJunk(raw({ common: "STUMP" }))).toBe(true);
  });

  it('drops "unknown tree species"', () => {
    expect(isJunk(raw({ common: "unknown tree species" }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-source: Atlanta
// ---------------------------------------------------------------------------

describe("isJunk — Atlanta status filter", () => {
  it("keeps atlanta tree with status Alive", () => {
    expect(isJunk(raw({ sourceId: "atlanta", status: "Alive" }))).toBe(false);
  });

  it("drops atlanta tree with status Dead", () => {
    expect(isJunk(raw({ sourceId: "atlanta", status: "Dead" }))).toBe(true);
  });

  it("drops atlanta tree with status Vandalized Dead", () => {
    expect(isJunk(raw({ sourceId: "atlanta", status: "Vandalized Dead" }))).toBe(true);
  });

  it("drops atlanta tree with status Removed", () => {
    expect(isJunk(raw({ sourceId: "atlanta", status: "Removed" }))).toBe(true);
  });

  it("drops atlanta_champion tree with status Dead", () => {
    expect(isJunk(raw({ sourceId: "atlanta_champion", status: "Dead" }))).toBe(true);
  });

  it("keeps atlanta_champion tree with status Alive", () => {
    expect(isJunk(raw({ sourceId: "atlanta_champion", status: "Alive" }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-source: Redmond
// ---------------------------------------------------------------------------

describe("isJunk — Redmond status filter", () => {
  it("keeps redmond tree with treeExists YES and status ACT", () => {
    expect(
      isJunk(raw({ sourceId: "redmond", treeExists: "YES", status: "ACT" })),
    ).toBe(false);
  });

  it("drops redmond tree with treeExists NO", () => {
    expect(
      isJunk(raw({ sourceId: "redmond", treeExists: "NO", status: "ACT" })),
    ).toBe(true);
  });

  it("drops redmond tree with status REM", () => {
    expect(
      isJunk(raw({ sourceId: "redmond", treeExists: "YES", status: "REM" })),
    ).toBe(true);
  });

  it("drops redmond tree with treeExists NO and status REM", () => {
    expect(
      isJunk(raw({ sourceId: "redmond", treeExists: "NO", status: "REM" })),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Data-poor trees survive
// ---------------------------------------------------------------------------

describe("isJunk — data-poor trees survive", () => {
  it("keeps a tree with null scientific AND null common", () => {
    expect(isJunk(raw({ scientific: null, common: null }))).toBe(false);
  });

  it("keeps a tree with null scientific only", () => {
    expect(isJunk(raw({ scientific: null, common: "Red Maple" }))).toBe(false);
  });

  it("keeps a tree with null common only", () => {
    expect(isJunk(raw({ scientific: "Acer rubrum", common: null }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Normal trees survive
// ---------------------------------------------------------------------------

describe("isJunk — normal trees survive", () => {
  it("keeps a normal tree with valid species", () => {
    expect(isJunk(raw())).toBe(false);
  });
});
