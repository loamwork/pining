import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GrowthFactorTable, UrbanAdjustmentConfig } from "../types.js";
import { estimateAgeIsa } from "./isa-growth.js";

const growthFactors: GrowthFactorTable = JSON.parse(
  readFileSync(resolve(process.cwd(), "config/growth-factors.json"), "utf-8"),
);
const urbanAdjustment: UrbanAdjustmentConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "config/urban-adjustment.json"), "utf-8"),
);

describe("estimateAgeIsa", () => {
  it("unit conversion correctness: 25.4cm -> 10in, factor 4.0, adj 1.15 -> 46", () => {
    // dbh=25.4cm => 10 inches; Quercus rubra factor=4.0; default adj=1.15
    // age = Math.round(10 * 4.0 * 1.15) = 46
    // If DBH wasn't converted: Math.round(25.4 * 4.0 * 1.15) = 117
    const result = estimateAgeIsa(
      25.4,
      "Quercus rubra",
      "species",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).not.toBeNull();
    expect(result!.years).toBe(46);
  });

  it("species-level match: Acer platanoides", () => {
    const result = estimateAgeIsa(
      30,
      "Acer platanoides",
      "species",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).not.toBeNull();
    expect(result!.method).toBe("isa-dbh-growth-factor");
    expect(result!.confidence).toBe("high");
  });

  it("genus-max fallback: genus-only 'Acer' picks Sugar maple factor 5.5", () => {
    // Acer species factors: 5.0, 3.0, 4.5, 4.5, 3.0, 5.5, 4.5 => max = 5.5
    // dbh=25.4cm => 10 inches; age = Math.round(10 * 5.5 * 1.15) = 63
    const result = estimateAgeIsa(
      25.4,
      "Acer",
      "genus",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).not.toBeNull();
    expect(result!.years).toBe(63);
    expect(result!.method).toBe("isa-dbh-growth-factor-genus-max");
    expect(result!.confidence).toBe("medium");
  });

  it("common-name rescued confidence: species match downgrades high -> medium", () => {
    const result = estimateAgeIsa(
      25.4,
      "Quercus rubra",
      "species",
      "common-name-map",
      growthFactors,
      urbanAdjustment,
    );
    expect(result).not.toBeNull();
    expect(result!.method).toBe("isa-dbh-growth-factor");
    expect(result!.confidence).toBe("medium");
  });

  it("urban adjustment applied: 1.15 produces different age than 1.0", () => {
    const withAdj = estimateAgeIsa(
      50,
      "Quercus rubra",
      "species",
      null,
      growthFactors,
      urbanAdjustment,
    );

    const noAdj: UrbanAdjustmentConfig = {
      ...urbanAdjustment,
      default: 1.0,
    };
    const withoutAdj = estimateAgeIsa(
      50,
      "Quercus rubra",
      "species",
      null,
      growthFactors,
      noAdj,
    );

    expect(withAdj).not.toBeNull();
    expect(withoutAdj).not.toBeNull();
    expect(withAdj!.years).not.toBe(withoutAdj!.years);
  });

  it("ALLCAPS scientific name matches title-case entry (Ithaca)", () => {
    const result = estimateAgeIsa(
      25.4,
      "ACER SACCHARINUM",
      "species",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).not.toBeNull();
    expect(result!.method).toBe("isa-dbh-growth-factor");
    expect(result!.years).toBeGreaterThan(0);
  });

  it("ALLCAPS with cultivar matches base species (Park Ridge)", () => {
    const result = estimateAgeIsa(
      25.4,
      "TILIA CORDATA 'GLENLEVEN'",
      "species",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).not.toBeNull();
    expect(result!.method).toBe("isa-dbh-growth-factor");
    expect(result!.years).toBeGreaterThan(0);
  });

  it("genus-max works case-insensitively", () => {
    const result = estimateAgeIsa(
      25.4,
      "ACER",
      "genus",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).not.toBeNull();
    expect(result!.method).toBe("isa-dbh-growth-factor-genus-max");
    expect(result!.years).toBeGreaterThan(0);
  });

  it("no factor found: unknown species returns null", () => {
    const result = estimateAgeIsa(
      25.4,
      "Xyzus nonexistus",
      "species",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).toBeNull();
  });

  it("unknown rank: returns null", () => {
    const result = estimateAgeIsa(
      25.4,
      "Quercus rubra",
      "unknown",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).toBeNull();
  });

  it("zero DBH: returns null", () => {
    const result = estimateAgeIsa(
      0,
      "Quercus rubra",
      "species",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).toBeNull();
  });

  it("null DBH: returns null", () => {
    const result = estimateAgeIsa(
      null as unknown as number,
      "Quercus rubra",
      "species",
      null,
      growthFactors,
      urbanAdjustment,
    );
    expect(result).toBeNull();
  });
});
