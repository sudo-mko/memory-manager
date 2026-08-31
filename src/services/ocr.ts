/**
 * Optional cloud text extraction.
 *
 * Sift is offline-first — nothing here is required for the app to work. When the
 * user opts in and supplies a free OCR.space key, screenshots and photos of
 * documents get their text pulled out and folded into the search index, so
 * `is:text` and plain word searches start finding words *inside* pictures.
 *
 * Everything is wrapped in explicit error types so the UI can tell the user what
 * actually went wrong instead of showing a generic failure.
 */

import { ImageManipulator, SaveFormat, manipulateAsync } from 'expo-image-manipulator';

const ENDPOINT = 'https://api.ocr.space/parse/image';
/** OCR.space rejects payloads over 1MB on the free tier. */
const MAX_EDGE = 1400;
const TIMEOUT_MS = 20_000;

export type OcrErrorKind = 'no-key' | 'network' | 'timeout' | 'rate-limit' | 'unreadable' | 'server';

export class OcrError extends Error {
  readonly kind: OcrErrorKind;
  constructor(kind: OcrErrorKind, message: string) {
    super(message);
    this.name = 'OcrError';
    this.kind = kind;
  }
}

/** Friendly copy for each failure mode, shown directly in the UI. */
export function describeOcrError(error: unknown): string {
  if (error instanceof OcrError) {
    switch (error.kind) {
      case 'no-key':
        return 'Add a free OCR.space API key in Settings to read text from images.';
      case 'network':
        return 'No connection. Text extraction needs internet — everything else works offline.';
      case 'timeout':
        return 'The text service took too long to respond. Try again in a moment.';
      case 'rate-limit':
        return 'Free tier limit reached. Try again later or use your own API key.';
      case 'unreadable':
        return 'No readable text was found in this image.';
      default:
        return error.message;
    }
  }
  return 'Text extraction failed unexpectedly.';
}

/** Downscales the image and returns base64 JPEG suitable for upload. */
async function toUploadableBase64(uri: string): Promise<string | null> {
  const resize = { width: MAX_EDGE };
  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize(resize);
    const image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    return result.base64 ?? null;
  } catch {
    try {
      const result = await manipulateAsync(uri, [{ resize }], {
        format: SaveFormat.JPEG,
        compress: 0.7,
        base64: true,
      });
      return result.base64 ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * Extracts text from a single image.
 * @throws {OcrError} with a `kind` the caller can branch on.
 */
export async function extractText(uri: string, apiKey: string): Promise<string> {
  if (!apiKey.trim()) throw new OcrError('no-key', 'No API key configured');

  const base64 = await toUploadableBase64(uri);
  if (!base64) throw new OcrError('unreadable', 'Could not read this image file');

  const body = new FormData();
  body.append('base64Image', `data:image/jpeg;base64,${base64}`);
  body.append('language', 'eng');
  body.append('isOverlayRequired', 'false');
  body.append('OCREngine', '2');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { apikey: apiKey.trim() },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new OcrError(aborted ? 'timeout' : 'network', 'Could not reach the text service');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) throw new OcrError('rate-limit', 'Too many requests');
  if (!response.ok) throw new OcrError('server', `Text service returned ${response.status}`);

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new OcrError('server', 'Text service returned an unreadable response');
  }

  if (payload?.IsErroredOnProcessing) {
    const detail = Array.isArray(payload.ErrorMessage) ? payload.ErrorMessage[0] : payload.ErrorMessage;
    throw new OcrError('server', detail || 'Text service could not process this image');
  }

  const text: string = (payload?.ParsedResults ?? [])
    .map((result: any) => result?.ParsedText ?? '')
    .join('\n')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) throw new OcrError('unreadable', 'No text found');
  return text;
}
