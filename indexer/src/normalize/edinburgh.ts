/**
 * Edinburgh string-band DBH parser.
 *
 * Edinburgh stores DBH as string ranges (e.g. "10 - 20") instead of numbers.
 * This function converts them to a numeric centimetre midpoint.
 */

/** Pattern for a closed range like "10 - 20". */
const RANGE_RE = /^(\d+)\s*-\s*(\d+)$/;

/** Pattern for an open-ended range like "90 +". */
const OPEN_RE = /^(\d+)\s*\+$/;

/**
 * Parse an Edinburgh DBH band string to a numeric cm midpoint.
 *
 * - `"10 - 20"` -> 15  (midpoint of range)
 * - `"90 +"`    -> 100 (floor + 10 as conservative estimate)
 * - `""`, `null`, `undefined`, or unparseable -> `null`
 */
export function parseEdinburghDbhBand(s: string): number | null {
  if (s == null || s === "") return null;

  const rangeMatch = RANGE_RE.exec(s);
  if (rangeMatch) {
    const lo = Number(rangeMatch[1]);
    const hi = Number(rangeMatch[2]);
    return (lo + hi) / 2;
  }

  const openMatch = OPEN_RE.exec(s);
  if (openMatch) {
    return Number(openMatch[1]) + 10;
  }

  return null;
}
