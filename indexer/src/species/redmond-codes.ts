/**
 * Redmond species-code decoder.
 *
 * Loads `config/redmond-species-codes.json` and provides lookup for the
 * 6-character Lucity species codes used by the Redmond source.
 */

import { readFileSync } from "node:fs";

interface RedmondCodesConfig {
  codes: Record<string, { scientific: string; common: string } | null>;
}

/**
 * Loads the Redmond species-code config into a Map.
 *
 * Null entries (UNK, OTHER) are preserved as `null` values so lookups
 * can distinguish "known-null" from "not in map".
 */
export function loadRedmondCodes(
  configPath: string,
): Map<string, { scientific: string; common: string } | null> {
  const raw = readFileSync(configPath, "utf-8");
  const config: RedmondCodesConfig = JSON.parse(raw);

  const map = new Map<
    string,
    { scientific: string; common: string } | null
  >();
  for (const [code, value] of Object.entries(config.codes)) {
    map.set(code, value);
  }
  return map;
}

/**
 * Decodes a Redmond species code.
 *
 * Returns `{ scientific, rank }` for a valid code, or `null` for UNK,
 * OTHER, empty, or unknown codes.
 */
export function decodeRedmondCode(
  code: string,
  codeMap: Map<string, { scientific: string; common: string } | null>,
): { scientific: string; rank: "species" | "genus" } | null {
  if (!code) return null;

  const entry = codeMap.get(code);

  // Not in map, or explicitly null (UNK, OTHER)
  if (!entry) return null;

  const rank = entry.scientific.includes(" ") ? "species" : "genus";
  return { scientific: entry.scientific, rank };
}
