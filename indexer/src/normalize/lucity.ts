/**
 * Lucity / Austin / Beaverton common-name normalization helpers.
 *
 * Several arborlog sources store common names in non-standard formats.
 * These functions clean the data before species-lookup in Stage 3.
 */

/** Abbreviated genus prefixes that should be dropped entirely when inverting. */
const ABBREV_GENUS = new Set(["euc", "euc."]);

/**
 * Irvine (Lucity) format: inverts "Genus, Descriptor" to "Descriptor Genus".
 *
 * If the genus part (before the comma) is an abbreviated prefix (e.g. "Euc"),
 * it is dropped and only the descriptor is returned.
 *
 * Single-part input (no comma) is returned as-is.
 */
export function normalizeLucityCommon(s: string): string {
  const idx = s.indexOf(",");
  if (idx === -1) return s;

  const genus = s.slice(0, idx).trim();
  const descriptor = s.slice(idx + 1).trim();

  if (ABBREV_GENUS.has(genus.toLowerCase())) {
    return descriptor;
  }

  return `${descriptor} ${genus}`;
}

/**
 * Austin format: strip parenthetical variants first, then apply Lucity inversion.
 *
 * `"Oak, Live (Southern)"` -> strip parens -> `"Oak, Live"` -> `"Live Oak"`
 */
export function normalizeAustinCommon(s: string): string {
  const stripped = s.replace(/\s*\([^)]*\)/g, "").trim();
  return normalizeLucityCommon(stripped);
}

/**
 * Beaverton format: convert to title case (first letter of each word uppercase,
 * remainder lowercase).
 *
 * `"BOWHALL RED MAPLE"` -> `"Bowhall Red Maple"`
 */
export function normalizeBeavertonCommon(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
