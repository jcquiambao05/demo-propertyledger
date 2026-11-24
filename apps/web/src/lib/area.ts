// Square Meters (m²) primary measurement utilities with automatic Hectares (ha) conversion.
// 1 hectare = 10,000 square meters.

export const SQM_PER_HA = 10000;

export function haToSqm(areaHa: number): number {
  if (!Number.isFinite(areaHa)) return 0;
  return Math.round(areaHa * SQM_PER_HA);
}

export function sqmToHa(areaSqm: number): number {
  if (!Number.isFinite(areaSqm)) return 0;
  return Number((areaSqm / SQM_PER_HA).toFixed(4));
}

/**
 * Formats a backend `areaHa` value primarily in Square Meters (`m²` / `sq m`),
 * optionally appending `(X.XX ha)` when the area is at least 1 hectare (10,000 m²).
 */
export function formatAreaSqm(
  areaHa?: number | null,
  options?: { includeHa?: boolean },
): string {
  if (typeof areaHa !== "number" || !Number.isFinite(areaHa)) return "—";
  const sqm = haToSqm(areaHa);
  const sqmStr = `${sqm.toLocaleString("en-PH")} m²`;
  if (options?.includeHa && sqm >= SQM_PER_HA) {
    return `${sqmStr} (${areaHa.toFixed(2)} ha)`;
  }
  return sqmStr;
}
