/** Small pure formatting helpers. Kept free of React so they can be unit tested. */

/** Human readable byte count, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes?: number | null): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "1920 × 1080" or "—" when unknown. */
export function formatDimensions(width?: number | null, height?: number | null): string {
  if (!width || !height) return '—';
  return `${Math.round(width)} × ${Math.round(height)}`;
}

/** Megapixel label used on the photo detail screen. */
export function formatMegapixels(width?: number | null, height?: number | null): string {
  if (!width || !height) return '—';
  const mp = (width * height) / 1_000_000;
  return `${mp < 10 ? mp.toFixed(1) : Math.round(mp)} MP`;
}

/** Seconds -> "m:ss" (videos). */
export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "12 March 2025" */
export function formatDate(ms?: number | null): string {
  if (!ms) return 'Unknown date';
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "March 2025" — used as the sticky heading for date sections. */
export function formatMonthLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2025-03" — stable sort/group key for a month. */
export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Compact relative time, e.g. "3d ago". */
export function formatRelative(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** "1,204" — thousands separators without relying on Intl. */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Splits a comma separated tag blob into a clean array. */
export function parseTagList(blob?: string | null): string[] {
  if (!blob) return [];
  return blob
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Normalises a user supplied tag: lowercase, spaces collapsed to dashes. */
export function normaliseTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .slice(0, 32);
}
