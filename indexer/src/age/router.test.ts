import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  RawTree,
  GrowthFactorTable,
  UrbanAdjustmentConfig,
} from "../types.js";
import type { MultifactorialModelConfig } from "./multifactorial.js";
import { estimateAge } from "./router.js";

// ---------------------------------------------------------------------------
// Load real config files
// ---------------------------------------------------------------------------

const growthFactors: GrowthFactorTable = JSON.parse(
  readFileSync(resolve(process.cwd(), "config/growth-factors.json"), "utf-8"),
);
const urbanAdjustment: UrbanAdjustmentConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "config/urban-adjustment.json"), "utf-8"),
);
const multifactorialModel: MultifactorialModelConfig = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "config/multifactorial-model.json"),
    "utf-8",
  ),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("estimateAge router", () => {
  it("routes to multifactorial when species is in model with dbh + height", () => {
    const tree = {
      dbh: 30,
      height: 15,
      sourceId: "some-source",
    } as RawTree;
    const species = {
      rank: "species" as const,
      scientificRaw: "Tilia cordata",
      scientificResolved: "Tilia cordata",
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    expect(result.method).toBe("auf-multifactorial");
    expect(result.confidence).toBe("high");
    expect(result.years).toBeGreaterThan(0);
  });

  it("falls through to ISA when species not in multifactorial model", () => {
    const tree = {
      dbh: 25.4,
      height: 10,
      sourceId: "some-source",
    } as RawTree;
    const species = {
      rank: "species" as const,
      scientificRaw: "Quercus rubra",
      scientificResolved: "Quercus rubra",
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    expect(result.method).toBe("isa-dbh-growth-factor");
    expect(result.years).toBeGreaterThan(0);
  });

  it("routes to planted-date for Atlanta source with planted field", () => {
    const tree = {
      sourceId: "atlanta",
      planted: "2015-02-07T00:00:00.000Z",
      dbh: null,
      height: null,
    } as unknown as RawTree;
    const species = {
      rank: "unknown" as const,
      scientificRaw: null,
      scientificResolved: null,
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    expect(result.method).toBe("planted-date");
    expect(result.confidence).toBe("high");
    expect(result.years).toBeGreaterThan(0);
  });

  it("routes to install-year for Redmond source with installYear field", () => {
    const tree = {
      sourceId: "redmond",
      installYear: 2008,
      dbh: null,
      height: null,
    } as unknown as RawTree;
    const species = {
      rank: "unknown" as const,
      scientificRaw: null,
      scientificResolved: null,
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    expect(result.method).toBe("install-year");
    expect(result.confidence).toBe("high");
    expect(result.years).toBeGreaterThan(0);
  });

  it("routes to install-year for Redmond source with string installYear", () => {
    const tree = {
      sourceId: "redmond",
      installYear: "2008",
      dbh: null,
      height: null,
    } as unknown as RawTree;
    const species = {
      rank: "unknown" as const,
      scientificRaw: null,
      scientificResolved: null,
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    expect(result.method).toBe("install-year");
    expect(result.confidence).toBe("high");
    expect(result.years).toBeGreaterThan(0);
  });

  it("routes to Edinburgh band for edinburgh source with string dbh", () => {
    const tree = {
      sourceId: "edinburgh",
      dbh: "10 - 20" as unknown,
      height: null,
    } as RawTree;
    const species = {
      rank: "species" as const,
      scientificRaw: "Tilia cordata",
      scientificResolved: "Tilia cordata",
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    expect(result.method).toBe("isa-dbh-range-band");
    expect(result.years).toBeGreaterThan(0);
  });

  it("routes to ISA for numeric dbh without height", () => {
    const tree = {
      dbh: 50,
      height: null,
      sourceId: "some-source",
    } as RawTree;
    const species = {
      rank: "species" as const,
      scientificRaw: "Acer rubrum",
      scientificResolved: "Acer rubrum",
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    expect(result.method).toBe("isa-dbh-growth-factor");
    expect(result.years).toBeGreaterThan(0);
  });

  it("routes to ISA genus-max for genus-only species", () => {
    const tree = {
      dbh: 50,
      height: null,
      sourceId: "some-source",
    } as RawTree;
    const species = {
      rank: "genus" as const,
      scientificRaw: "Acer",
      scientificResolved: "Acer",
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    expect(result.method).toBe("isa-dbh-growth-factor-genus-max");
    expect(result.years).toBeGreaterThan(0);
  });

  it("returns none when nothing can estimate age", () => {
    const tree = {
      dbh: null,
      height: null,
      sourceId: "some-source",
    } as RawTree;
    const species = {
      rank: "unknown" as const,
      scientificRaw: null,
      scientificResolved: null,
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    expect(result.method).toBe("none");
    expect(result.confidence).toBe("none");
    expect(result.years).toBe(0);
  });

  it("multifactorial takes priority over ISA when both could apply", () => {
    const tree = {
      dbh: 30,
      height: 15,
      sourceId: "some-source",
    } as RawTree;
    const species = {
      rank: "species" as const,
      scientificRaw: "Tilia cordata",
      scientificResolved: "Tilia cordata",
      inferredFrom: null,
    };

    const result = estimateAge(
      tree,
      species,
      growthFactors,
      urbanAdjustment,
      multifactorialModel,
    );

    // Tilia cordata IS in the multifactorial model AND has numeric dbh,
    // so multifactorial must take priority over ISA.
    expect(result.method).toBe("auf-multifactorial");
    expect(result.method).not.toBe("isa-dbh-growth-factor");
  });
});
