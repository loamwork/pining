import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadCommonNameMap, lookupCommonName } from "./common-map.js";

const configPath = resolve(process.cwd(), "config/common-to-scientific.json");

describe("loadCommonNameMap", () => {
  it("loads the config and returns a Map", () => {
    const map = loadCommonNameMap(configPath);
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBeGreaterThan(0);
  });
});

describe("lookupCommonName", () => {
  const map = loadCommonNameMap(configPath);

  it('exact match: "Norway Maple" -> species', () => {
    const result = lookupCommonName("Norway Maple", map);
    expect(result).toEqual({
      scientific: "Acer platanoides",
      rank: "species",
    });
  });

  it('case insensitive: "norway maple" matches', () => {
    const result = lookupCommonName("norway maple", map);
    expect(result).toEqual({
      scientific: "Acer platanoides",
      rank: "species",
    });
  });

  it('genus-only mapping: "Maple" -> genus', () => {
    const result = lookupCommonName("Maple", map);
    expect(result).toEqual({
      scientific: "Acer",
      rank: "genus",
    });
  });

  it('no match: "Nonexistent Tree" -> null', () => {
    const result = lookupCommonName("Nonexistent Tree", map);
    expect(result).toBeNull();
  });

  it("empty string -> null", () => {
    const result = lookupCommonName("", map);
    expect(result).toBeNull();
  });
});
