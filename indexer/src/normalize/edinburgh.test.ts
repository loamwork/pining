import { describe, it, expect } from "vitest";
import { parseEdinburghDbhBand } from "./edinburgh.js";

describe("parseEdinburghDbhBand", () => {
  it('parses "10 - 20" to midpoint 15', () => {
    expect(parseEdinburghDbhBand("10 - 20")).toBe(15);
  });

  it('parses "50 - 60" to midpoint 55', () => {
    expect(parseEdinburghDbhBand("50 - 60")).toBe(55);
  });

  it('parses open-ended "90 +" to 100', () => {
    expect(parseEdinburghDbhBand("90 +")).toBe(100);
  });

  it('parses "20 - 30" to midpoint 25', () => {
    expect(parseEdinburghDbhBand("20 - 30")).toBe(25);
  });

  it("returns null for empty string", () => {
    expect(parseEdinburghDbhBand("")).toBeNull();
  });

  it("returns null for null or undefined", () => {
    expect(parseEdinburghDbhBand(null as unknown as string)).toBeNull();
    expect(parseEdinburghDbhBand(undefined as unknown as string)).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(parseEdinburghDbhBand("invalid")).toBeNull();
  });
});
