// ---------------------------------------------------------------------------
// Pipeline report — aggregates stats and detects anomalies
// ---------------------------------------------------------------------------

export interface SourceStats {
  sourceId: string;
  totalIn: number;
  dropped: number;
  byAgeMethod: Record<string, number>;
  bySpeciesRank: Record<string, number>;
  medianAge: number | null;
}

export interface PipelineReport {
  totalTreesIndexed: number;
  totalTilesProduced: number;
  totalCompressedSizeMb: number;
  sourceStats: SourceStats[];
  anomalies: string[];
}

/**
 * Build a pipeline report from per-source stats, tile count, and total
 * compressed output size.
 *
 * Detects anomalies:
 * - Median age < 5 or > 200 for any source
 * - More than 5% of trees with age method "none" for any source
 * - Zero tiles produced
 */
export function buildReport(
  sourceStats: SourceStats[],
  tileCount: number,
  totalCompressedBytes: number,
): PipelineReport {
  const totalTreesIndexed = sourceStats.reduce(
    (sum, s) => sum + s.totalIn - s.dropped,
    0,
  );

  const anomalies: string[] = [];

  if (tileCount === 0) {
    anomalies.push("No tiles were produced.");
  }

  for (const s of sourceStats) {
    if (s.medianAge !== null && s.medianAge < 5) {
      anomalies.push(
        `Source "${s.sourceId}" has suspiciously low median age: ${s.medianAge} years.`,
      );
    }
    if (s.medianAge !== null && s.medianAge > 200) {
      anomalies.push(
        `Source "${s.sourceId}" has suspiciously high median age: ${s.medianAge} years.`,
      );
    }

    const indexed = s.totalIn - s.dropped;
    const noneCount = s.byAgeMethod["none"] ?? 0;
    if (indexed > 0 && noneCount / indexed > 0.05) {
      const pct = ((noneCount / indexed) * 100).toFixed(1);
      anomalies.push(
        `Source "${s.sourceId}" has ${pct}% of trees with age method "none".`,
      );
    }
  }

  return {
    totalTreesIndexed,
    totalTilesProduced: tileCount,
    totalCompressedSizeMb: Math.round((totalCompressedBytes / 1024 / 1024) * 100) / 100,
    sourceStats,
    anomalies,
  };
}
