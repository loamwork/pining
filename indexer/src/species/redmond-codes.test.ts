import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadRedmondCodes, decodeRedmondCode } from "./redmond-codes.js";

const configPath = resolve(
  process.cwd(),
  "config/redmond-species-codes.json",
);

describe("loadRedmondCodes", () => {
  it("loads the config and returns a Map", () => {
    const map = loadRedmondCodes(configPath);
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBeGreaterThan(0);
  });
});

describe("decodeRedmondCode", () => {
  const codeMap = loadRedmondCodes(configPath);

  it('known code: "QUERUB" -> species', () => {
    const result = decodeRedmondCode("QUERUB", codeMap);
    expect(result).toEqual({
      scientific: "Quercus rubra",
      rank: "species",
    });
  });

  it("UNK code -> null", () => {
    const result = decodeRedmondCode("UNK", codeMap);
    expect(result).toBeNull();
  });

  it("OTHER code -> null", () => {
    const result = decodeRedmondCode("OTHER", codeMap);
    expect(result).toBeNull();
  });

  it("unknown code not in map -> null", () => {
    const result = decodeRedmondCode("ZZZZZZ", codeMap);
    expect(result).toBeNull();
  });

  it("empty string -> null", () => {
    const result = decodeRedmondCode("", codeMap);
    expect(result).toBeNull();
  });
});
