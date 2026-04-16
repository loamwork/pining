import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GrowthFactorTable, UrbanAdjustmentConfig } from "../types.js";
import {
  estimateAgePlantedDate,
  estimateAgeInstallYear,
  estimateAgeEdinburghBand,
} from "./alternatives.js";

const currentYear = new Date().getFullYear();

const growthFactors: GrowthFactorTable = JSON.parse(
  readFileSync(resolve(process.cwd(), "config/growth-factors.json"), "utf-8"),
);
const urbanAdjustment: UrbanAdjustmentConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "config/urban-adjustment.json"), "utf-8"),
);

// ---------------------------------------------------------------------------
// estimateAgePlantedDate
// ---------------------------------------------------------------------------

describe("estimateAgePlantedDate", () => {
  it("happy path: ISO date string yields correct age", () => {
    const result = estimateAgePlantedDate("2015-02-07T00:00:00.000Z");
    expect(result).not.toBeNull();
    expect(result!.years).toBe(currentYear - 2015);
    expect(result!.method).toBe("planted-date");
    expect(result!.confidence).toBe("high");
  });

  it("null input returns null", () => {
    expect(estimateAgePlantedDate(null)).toBeNull();
  });

  it("undefined input returns null", () => {
    expect(estimateAgePlantedDate(undefined)).toBeNull();
  });

  it("empty string returns null", () => {
    expect(estimateAgePlantedDate("")).toBeNull();
  });

  it("invalid date string returns null", () => {
    expect(estimateAgePlantedDate("not-a-date")).toBeNull();
  });

  it("future date returns null (age would be negative)", () => {
    const futureDate = `${currentYear + 5}-01-01T00:00:00.000Z`;
    expect(estimateAgePlantedDate(futureDate)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// estimateAgeInstallYear
// ---------------------------------------------------------------------------

describe("estimateAgeInstallYear", () => {
  it("happy path: past year yields correct age", () => {
    const result = estimateAgeInstallYear(2008);
    expect(result).not.toBeNull();
    expect(result!.years).toBe(currentYear - 2008);
    expect(result!.method).toBe("install-year");
    expect(result!.confidence).toBe("high");
  });

  it("null input returns null", () => {
    expect(estimateAgeInstallYear(null)).toBeNull();
  });

  it("undefined input returns null", () => {
    expect(estimateAgeInstallYear(undefined)).toBeNull();
  });

  it("future year returns null", () => {
    expect(estimateAgeInstallYear(currentYear + 5)).toBeNull();
  });

  it("zero returns null", () => {
    expect(estimateAgeInstallYear(0)).toBeNull();
  });

  it("negative number returns null", () => {
    expect(estimateAgeInstallYear(-100)).toBeNull();
  });

  it("non-integer returns null", () => {
    expect(estimateAgeInstallYear(2008.5)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// estimateAgeEdinburghBand
// ---------------------------------------------------------------------------

describe("estimateAgeEdinburghBand", () => {
  it('band "10 - 20" with species yields ISA age, method isa-dbh-range-band, confidence medium', () => {
    const result = estimateAgeEdinburghBand(
      "10 - 20",
      "Tilia cordata",
      "species",
      growthFactors,
      urbanAdjustment,
    );
    expect(result).not.toBeNull();
    // midpoint is 15cm; ISA should produce a reasonable age
    expect(result!.years).toBeGreaterThan(0);
    expect(result!.method).toBe("isa-dbh-range-band");
    expect(result!.confidence).toBe("medium");
  });

  it('band "90 +" produces older age than "10 - 20"', () => {
    const small = estimateAgeEdinburghBand(
      "10 - 20",
      "Tilia cordata",
      "species",
      growthFactors,
      urbanAdjustment,
    );
    const large = estimateAgeEdinburghBand(
      "90 +",
      "Tilia cordata",
      "species",
      growthFactors,
      urbanAdjustment,
    );
    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    expect(large!.years).toBeGreaterThan(small!.years);
  });

  it("null band returns null", () => {
    expect(
      estimateAgeEdinburghBand(
        null,
        "Tilia cordata",
        "species",
        growthFactors,
        urbanAdjustment,
      ),
    ).toBeNull();
  });

  it("undefined band returns null", () => {
    expect(
      estimateAgeEdinburghBand(
        undefined,
        "Tilia cordata",
        "species",
        growthFactors,
        urbanAdjustment,
      ),
    ).toBeNull();
  });

  it("unparseable band returns null", () => {
    expect(
      estimateAgeEdinburghBand(
        "garbage",
        "Tilia cordata",
        "species",
        growthFactors,
        urbanAdjustment,
      ),
    ).toBeNull();
  });

  it("unknown species rank returns null (ISA cannot compute)", () => {
    expect(
      estimateAgeEdinburghBand(
        "10 - 20",
        null,
        "unknown",
        growthFactors,
        urbanAdjustment,
      ),
    ).toBeNull();
  });
});
