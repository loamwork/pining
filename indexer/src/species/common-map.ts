/**
 * Common-name -> scientific-name lookup.
 *
 * Loads `config/common-to-scientific.json` and provides case-insensitive
 * lookup returning the resolved scientific name and taxonomic rank.
 */

import { readFileSync } from "node:fs";

interface CommonToScientificConfig {
  entries: Record<string, string>;
}

/**
 * Loads the common-to-scientific config and builds a case-insensitive
 * lookup map (lowercase common name -> scientific name).
 */
export function loadCommonNameMap(configPath: string): Map<string, string> {
  const raw = readFileSync(configPath, "utf-8");
  const config: CommonToScientificConfig = JSON.parse(raw);

  const map = new Map<string, string>();
  for (const [common, scientific] of Object.entries(config.entries)) {
    map.set(common.toLowerCase(), scientific);
  }
  return map;
}

/**
 * Looks up a normalized common name in the map.
 *
 * Returns `{ scientific, rank }` where rank is "species" if the scientific
 * value contains a space (i.e. binomial), or "genus" if it is a single word.
 *
 * Returns `null` if the input is empty or not found.
 */
export function lookupCommonName(
  common: string,
  map: Map<string, string>,
): { scientific: string; rank: "species" | "genus" } | null {
  if (!common) return null;

  const scientific = map.get(common.toLowerCase());
  if (!scientific) return null;

  const rank = scientific.includes(" ") ? "species" : "genus";
  return { scientific, rank };
}
