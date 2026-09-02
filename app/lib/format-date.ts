/** Stable server/client formatting (avoids locale + timezone hydration mismatches). */
export function formatListTimestamp(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi} UTC`;
}

export function formatSavedBannerTime(ms: number): string {
  return formatListTimestamp(ms);
}
