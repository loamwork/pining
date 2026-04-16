import { describe, it, expect } from "vitest";
import {
  normalizeLucityCommon,
  normalizeAustinCommon,
  normalizeBeavertonCommon,
} from "./lucity.js";

describe("normalizeLucityCommon", () => {
  it('inverts "Oak, Coast Live" to "Coast Live Oak"', () => {
    expect(normalizeLucityCommon("Oak, Coast Live")).toBe("Coast Live Oak");
  });

  it('drops abbreviated genus prefix: "Euc, Ghost Gum" to "Ghost Gum"', () => {
    expect(normalizeLucityCommon("Euc, Ghost Gum")).toBe("Ghost Gum");
  });

  it('inverts "Pine, Canary Island" to "Canary Island Pine"', () => {
    expect(normalizeLucityCommon("Pine, Canary Island")).toBe(
      "Canary Island Pine",
    );
  });

  it("returns single-part input as-is", () => {
    expect(normalizeLucityCommon("Red Maple")).toBe("Red Maple");
  });
});

describe("normalizeAustinCommon", () => {
  it('strips parenthetical then inverts: "Oak, Live (Southern)" to "Live Oak"', () => {
    expect(normalizeAustinCommon("Oak, Live (Southern)")).toBe("Live Oak");
  });

  it('strips parenthetical then inverts: "Oak, Texas Live (Escarpment)" to "Texas Live Oak"', () => {
    expect(normalizeAustinCommon("Oak, Texas Live (Escarpment)")).toBe(
      "Texas Live Oak",
    );
  });

  it("handles input without parens same as Lucity", () => {
    expect(normalizeAustinCommon("Elm, Cedar")).toBe("Cedar Elm");
  });
});

describe("normalizeBeavertonCommon", () => {
  it('converts ALLCAPS to title case: "BOWHALL RED MAPLE"', () => {
    expect(normalizeBeavertonCommon("BOWHALL RED MAPLE")).toBe(
      "Bowhall Red Maple",
    );
  });

  it('converts single ALLCAPS word: "MAPLE"', () => {
    expect(normalizeBeavertonCommon("MAPLE")).toBe("Maple");
  });

  it('title-cases mixed input: "Red maple"', () => {
    expect(normalizeBeavertonCommon("Red maple")).toBe("Red Maple");
  });
});
