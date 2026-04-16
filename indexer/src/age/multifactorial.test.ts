import { describe, it, expect } from "vitest";
import { estimateAgeMultifactorial } from "./multifactorial.js";
import type { MultifactorialModelConfig } from "./multifactorial.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const model: MultifactorialModelConfig = JSON.parse(
  readFileSync(resolve(__dirname, "../../config/multifactorial-model.json"), "utf-8"),
);

// ---------------------------------------------------------------------------
// Tilia cordata — known-value check
// ---------------------------------------------------------------------------

describe("estimateAgeMultifactorial — Tilia cordata", () => {
  it("dbh=30cm, height=15m returns ~78, method auf-multifactorial, confidence high", () => {
    const result = estimateAgeMultifactorial(30, 15, "Tilia cordata", model);
    expect(result).not.toBeNull();
    // 38.51 + 5.99*ln(30) + 8.51*ln(15) + (-0.47)*ln(30)*ln(15) = 77.6 → 78
    expect(result!.years).toBe(78);
    expect(result!.method).toBe("auf-multifactorial");
    expect(result!.confidence).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// Fraxinus excelsior — non-null smoke test
// ---------------------------------------------------------------------------

describe("estimateAgeMultifactorial — Fraxinus excelsior", () => {
  it("dbh=25cm, height=12m returns a valid result with correct method", () => {
    const result = estimateAgeMultifactorial(25, 12, "Fraxinus excelsior", model);
    expect(result).not.toBeNull();
    expect(result!.method).toBe("auf-multifactorial");
    expect(result!.confidence).toBe("high");
    expect(result!.years).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Species not in model
// ---------------------------------------------------------------------------

describe("estimateAgeMultifactorial — unknown species", () => {
  it('returns null for "Quercus rubra" (not in model)', () => {
    const result = estimateAgeMultifactorial(30, 15, "Quercus rubra", model);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Missing inputs
// ---------------------------------------------------------------------------

describe("estimateAgeMultifactorial — missing inputs", () => {
  it("returns null when height is null", () => {
    const result = estimateAgeMultifactorial(30, null, "Tilia cordata", model);
    expect(result).toBeNull();
  });

  it("returns null when dbh is null", () => {
    const result = estimateAgeMultifactorial(null, 15, "Tilia cordata", model);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Different from ISA
// ---------------------------------------------------------------------------

describe("estimateAgeMultifactorial — differs from ISA", () => {
  it("Tilia cordata dbh=30cm multifactorial differs from ISA formula", () => {
    const multi = estimateAgeMultifactorial(30, 15, "Tilia cordata", model);
    // ISA: growthFactor * dbhInches * urbanAdj → 3.0 * (30/2.54) * 1.15 ≈ 41
    const dbhInches = 30 / 2.54;
    const isaAge = Math.round(3.0 * dbhInches * 1.15);
    expect(multi).not.toBeNull();
    expect(multi!.years).not.toBe(isaAge);
  });
});
