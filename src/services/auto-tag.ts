/**
 * On-device auto tagging.
 *
 * Tidy makes you organise everything by hand. Sift derives a first pass of tags
 * from metadata that is already on the device — filename conventions used by
 * Android/iOS and messaging apps, the containing album, shape, resolution and
 * capture time — so a freshly scanned library is searchable immediately and
 * completely offline. Pure functions, so each rule is unit testable.
 */

export type AutoTagInput = {
  filename: string;
  albumName?: string | null;
  width: number;
  height: number;
  mediaType: 'photo' | 'video';
  createdAt: number;
  fileSize?: number | null;
};

/** Filename prefixes that identify how a file was produced. */
const FILENAME_RULES: { pattern: RegExp; tags: string[] }[] = [
  { pattern: /^screenshot|^screen_shot|^scr_|screenshot/i, tags: ['screenshot'] },
  { pattern: /^screen ?recording/i, tags: ['screenshot', 'recording'] },
  { pattern: /^img_e\d+/i, tags: ['edited'] },
  { pattern: /^img_|^dsc|^dscf|^p\d{7}|^pxl_/i, tags: ['camera'] },
  { pattern: /^vid_|^mvimg|^movie/i, tags: ['camera'] },
  { pattern: /whatsapp/i, tags: ['whatsapp', 'received'] },
  { pattern: /telegram/i, tags: ['telegram', 'received'] },
  { pattern: /signal-/i, tags: ['signal', 'received'] },
  { pattern: /instagram|fb_img|facebook/i, tags: ['social', 'received'] },
  { pattern: /snapchat/i, tags: ['social', 'received'] },
  { pattern: /download|^received_/i, tags: ['downloaded', 'received'] },
  { pattern: /selfie|^psx|front_?cam/i, tags: ['selfie'] },
  { pattern: /scan(ned)?[-_ ]?\d|^cam?scanner|^doc_/i, tags: ['document', 'scan'] },
  { pattern: /receipt|invoice|bill[-_ ]?\d/i, tags: ['receipt', 'document'] },
  { pattern: /passport|licen[cs]e|^id[-_ ]/i, tags: ['document', 'id'] },
  { pattern: /qr[-_ ]?code|barcode/i, tags: ['qr'] },
  { pattern: /meme|funny/i, tags: ['meme'] },
  { pattern: /wallpaper|background/i, tags: ['wallpaper'] },
  { pattern: /\.(gif)$/i, tags: ['gif', 'animated'] },
  { pattern: /\.(png)$/i, tags: ['png'] },
  { pattern: /\.(heic|heif)$/i, tags: ['heic'] },
  { pattern: /\.(webp)$/i, tags: ['webp'] },
];

/** Album names that carry meaning on most Android devices. */
const ALBUM_RULES: { pattern: RegExp; tags: string[] }[] = [
  { pattern: /screenshot/i, tags: ['screenshot'] },
  { pattern: /camera|dcim/i, tags: ['camera'] },
  { pattern: /whatsapp/i, tags: ['whatsapp', 'received'] },
  { pattern: /download/i, tags: ['downloaded'] },
  { pattern: /telegram/i, tags: ['telegram'] },
  { pattern: /instagram|facebook|twitter|tiktok/i, tags: ['social'] },
  { pattern: /document|scan/i, tags: ['document'] },
  { pattern: /music|audio/i, tags: ['music'] },
];

/** Common phone screen aspect ratios, used as a screenshot tiebreaker. */
function looksLikeScreenAspect(width: number, height: number): boolean {
  if (!width || !height) return false;
  const ratio = Math.max(width, height) / Math.min(width, height);
  // 16:9 (1.777), 18:9 (2.0), 19.5:9 (2.166), 20:9 (2.222)
  return ratio > 1.7 && ratio < 2.3 && Math.min(width, height) >= 640;
}

/** Shape tags let the user search `is:portrait` style queries. */
function shapeTags(width: number, height: number): string[] {
  if (!width || !height) return [];
  const tags: string[] = [];
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.03) tags.push('square');
  else if (ratio > 1) tags.push('landscape');
  else tags.push('portrait');
  // A panorama is a *wide* extreme. A 2:1 portrait is just a phone screen, so
  // tall extremes get their own tag instead of being mislabelled.
  if (ratio >= 2) tags.push('panorama');
  else if (ratio <= 0.5) tags.push('tall');

  const megapixels = (width * height) / 1_000_000;
  if (megapixels >= 8) tags.push('high-res');
  else if (megapixels < 0.3) tags.push('thumbnail');
  return tags;
}

const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer',
                 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];

/** Time-of-day and calendar tags, e.g. `night`, `weekend`, `2024`. */
function timeTags(createdAt: number): string[] {
  if (!createdAt) return [];
  const date = new Date(createdAt);
  const hour = date.getHours();
  const tags: string[] = [String(date.getFullYear())];

  if (hour < 5) tags.push('night');
  else if (hour < 12) tags.push('morning');
  else if (hour < 17) tags.push('afternoon');
  else if (hour < 21) tags.push('evening');
  else tags.push('night');

  const day = date.getDay();
  if (day === 0 || day === 6) tags.push('weekend');
  tags.push(SEASONS[date.getMonth()]);
  return tags;
}

/**
 * Derives the full auto tag set for one asset.
 * The result is deduplicated, lowercase and safe to store as a comma blob.
 */
export function deriveAutoTags(input: AutoTagInput): string[] {
  const tags = new Set<string>();
  const name = input.filename ?? '';

  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(name)) rule.tags.forEach((t) => tags.add(t));
  }
  if (input.albumName) {
    for (const rule of ALBUM_RULES) {
      if (rule.pattern.test(input.albumName)) rule.tags.forEach((t) => tags.add(t));
    }
  }

  tags.add(input.mediaType === 'video' ? 'video' : 'photo');
  if (input.mediaType === 'video' && input.width && input.height) {
    // Vertical video is almost always a phone recording or a reel.
    if (input.height > input.width) tags.add('vertical-video');
  }

  // A PNG at an exact screen aspect ratio is a screenshot even when the file
  // was renamed on the way through a chat app.
  if (!tags.has('screenshot') && /\.png$/i.test(name) && looksLikeScreenAspect(input.width, input.height)) {
    tags.add('screenshot');
  }

  shapeTags(input.width, input.height).forEach((t) => tags.add(t));
  timeTags(input.createdAt).forEach((t) => tags.add(t));

  if (input.fileSize != null) {
    if (input.fileSize >= 10 * 1024 * 1024) tags.add('heavy');
    else if (input.fileSize > 0 && input.fileSize < 100 * 1024) tags.add('tiny');
  }

  // Commas are the storage delimiter, so they can never appear inside a tag.
  return [...tags].map((t) => t.replace(/,/g, '')).filter(Boolean).sort();
}
