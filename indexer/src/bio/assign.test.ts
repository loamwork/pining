import { describe, it, expect } from "vitest";
import type { AgeEstimate, SpeciesResolution } from "../types.js";
import { assignBio } from "./assign.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSpecies(
  rank: SpeciesResolution["rank"],
  scientific: string | null = null,
): SpeciesResolution {
  return {
    rank,
    scientificRaw: scientific,
    scientificResolved: scientific,
    inferredFrom: null,
  };
}

function makeAge(
  years: number,
  method: AgeEstimate["method"] = "isa-dbh-growth-factor",
  confidence: AgeEstimate["confidence"] = "medium",
): AgeEstimate {
  return { years, method, confidence };
}

const noAge: AgeEstimate = { years: 0, method: "none", confidence: "none" };

const speciesIdMap = new Map([
  ["Quercus rubra", 42],
  ["Acer rubrum", 15],
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assignBio", () => {
  it("ancient tree -> elder", () => {
    const result = assignBio(
      "tree_ancient_001",
      makeSpecies("species", "Quercus rubra"),
      makeAge(500),
      /* isAncient */ true,
      /* isChampion */ false,
      /* isHeritage */ false,
      speciesIdMap,
    );

    expect(result.bioType).toBe("elder");
    expect(result.bioSpeciesFk).toBe(-1);
    expect(result.bioIndex).toBeGreaterThanOrEqual(0);
    expect(result.bioIndex).toBeLessThan(20);
  });

  it("champion tree, age 350 -> elder", () => {
    const result = assignBio(
      "tree_champ_350",
      makeSpecies("species", "Quercus rubra"),
      makeAge(350),
      /* isAncient */ false,
      /* isChampion */ true,
      /* isHeritage */ false,
      speciesIdMap,
    );

    expect(result.bioType).toBe("elder");
    expect(result.bioSpeciesFk).toBe(-1);
  });

  it("champion tree, age null (method 'none') -> elder (null age fallback)", () => {
    const result = assignBio(
      "tree_champ_noage",
      makeSpecies("species", "Quercus rubra"),
      noAge,
      /* isAncient */ false,
      /* isChampion */ true,
      /* isHeritage */ false,
      speciesIdMap,
    );

    // method "none" means we can't compute age -- err on side of respect
    expect(result.bioType).toBe("elder");
    expect(result.bioSpeciesFk).toBe(-1);
  });

  it("heritage tree, age 80 -> swagger", () => {
    const result = assignBio(
      "tree_heritage_80",
      makeSpecies("species", "Acer rubrum"),
      makeAge(80),
      /* isAncient */ false,
      /* isChampion */ false,
      /* isHeritage */ true,
      speciesIdMap,
    );

    expect(result.bioType).toBe("swagger");
    expect(result.bioIndex).toBeGreaterThanOrEqual(0);
    expect(result.bioIndex).toBeLessThan(12);
  });

  it("champion tree, age 50 -> swagger", () => {
    const result = assignBio(
      "tree_champ_50",
      makeSpecies("species", "Quercus rubra"),
      makeAge(50),
      /* isAncient */ false,
      /* isChampion */ true,
      /* isHeritage */ false,
      speciesIdMap,
    );

    expect(result.bioType).toBe("swagger");
    expect(result.bioIndex).toBeGreaterThanOrEqual(0);
    expect(result.bioIndex).toBeLessThan(12);
  });

  it("regular tree, known species -> species", () => {
    const result = assignBio(
      "tree_regular_001",
      makeSpecies("species", "Acer rubrum"),
      makeAge(40),
      /* isAncient */ false,
      /* isChampion */ false,
      /* isHeritage */ false,
      speciesIdMap,
    );

    expect(result.bioType).toBe("species");
    expect(result.bioIndex).toBeGreaterThanOrEqual(0);
    expect(result.bioIndex).toBeLessThan(20);
  });

  it("unknown species -> mystery", () => {
    const result = assignBio(
      "tree_unknown_001",
      makeSpecies("unknown"),
      makeAge(30),
      /* isAncient */ false,
      /* isChampion */ false,
      /* isHeritage */ false,
      speciesIdMap,
    );

    expect(result.bioType).toBe("mystery");
    expect(result.bioSpeciesFk).toBe(-2);
    expect(result.bioIndex).toBeGreaterThanOrEqual(0);
    expect(result.bioIndex).toBeLessThan(20);
  });

  it("deterministic: same treeId always produces same bioIndex", () => {
    const species = makeSpecies("species", "Quercus rubra");
    const age = makeAge(60);

    const result1 = assignBio(
      "tree_deterministic",
      species,
      age,
      false,
      false,
      false,
      speciesIdMap,
    );
    const result2 = assignBio(
      "tree_deterministic",
      species,
      age,
      false,
      false,
      false,
      speciesIdMap,
    );

    expect(result1.bioIndex).toBe(result2.bioIndex);
    expect(result1.bioType).toBe(result2.bioType);
    expect(result1.bioSpeciesFk).toBe(result2.bioSpeciesFk);
  });

  it("different tree IDs usually produce different indices", () => {
    const species = makeSpecies("species", "Quercus rubra");
    const age = makeAge(60);
    const ids = Array.from({ length: 20 }, (_, i) => `tree_${String(i).padStart(3, "0")}`);

    const indices = ids.map(
      (id) =>
        assignBio(id, species, age, false, false, false, speciesIdMap).bioIndex,
    );

    // With 20 IDs mod 20, we'd expect at least some variation.
    const unique = new Set(indices);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("species FK lookup: known species resolves to correct ID", () => {
    const result = assignBio(
      "tree_fk_test",
      makeSpecies("species", "Quercus rubra"),
      makeAge(40),
      /* isAncient */ false,
      /* isChampion */ false,
      /* isHeritage */ false,
      speciesIdMap,
    );

    expect(result.bioSpeciesFk).toBe(42);
  });

  it("species FK lookup: unknown species in map falls back to -2", () => {
    const result = assignBio(
      "tree_fk_miss",
      makeSpecies("species", "Betula pendula"),
      makeAge(40),
      /* isAncient */ false,
      /* isChampion */ false,
      /* isHeritage */ false,
      speciesIdMap,
    );

    expect(result.bioSpeciesFk).toBe(-2);
  });

  it("swagger uses species FK from map, not pseudo-species", () => {
    const result = assignBio(
      "tree_swagger_fk",
      makeSpecies("species", "Acer rubrum"),
      makeAge(80),
      /* isAncient */ false,
      /* isChampion */ true,
      /* isHeritage */ false,
      speciesIdMap,
    );

    expect(result.bioType).toBe("swagger");
    expect(result.bioSpeciesFk).toBe(15);
  });

  it("heritage tree, age exactly 200 -> elder (boundary)", () => {
    const result = assignBio(
      "tree_heritage_200",
      makeSpecies("species", "Quercus rubra"),
      makeAge(200),
      /* isAncient */ false,
      /* isChampion */ false,
      /* isHeritage */ true,
      speciesIdMap,
    );

    expect(result.bioType).toBe("elder");
    expect(result.bioSpeciesFk).toBe(-1);
  });

  it("heritage tree, age 199 -> swagger (just below boundary)", () => {
    const result = assignBio(
      "tree_heritage_199",
      makeSpecies("species", "Quercus rubra"),
      makeAge(199),
      /* isAncient */ false,
      /* isChampion */ false,
      /* isHeritage */ true,
      speciesIdMap,
    );

    expect(result.bioType).toBe("swagger");
  });

  it("genus-rank tree -> species bio (not mystery)", () => {
    const result = assignBio(
      "tree_genus_001",
      makeSpecies("genus", "Quercus"),
      makeAge(40),
      /* isAncient */ false,
      /* isChampion */ false,
      /* isHeritage */ false,
      speciesIdMap,
    );

    expect(result.bioType).toBe("species");
  });
});
