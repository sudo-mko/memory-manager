/**
 * On-device CLIP.
 *
 * CLIP (Contrastive Language-Image Pre-training, OpenAI) maps pictures and
 * sentences into one shared 512-dimensional space, so the distance between "a
 * photo of a dog on a beach" and an actual photo of a dog on a beach is small.
 * That is what lets Sift answer questions about what a picture *shows* rather
 * than what its filename happens to say.
 *
 * Both encoders run locally through ExecuTorch — no image and no query ever
 * leaves the device. They are split deliberately:
 *
 * - **Image encoder** (~92 MB, int8) gives visual auto-tags, "find similar",
 *   and duplicate-resistant grouping. Zero-shot labelling works from this
 *   alone, because the label vectors are precomputed and shipped in the app.
 * - **Text encoder** (~242 MB) is only needed to turn a typed sentence into a
 *   vector, so it is a separate, optional download.
 *
 * Everything here degrades safely: if nothing is downloaded, the rest of the
 * app behaves exactly as it did before.
 */

import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import type { ImageEmbeddingsModule, TextEmbeddingsModule } from 'react-native-executorch';

import { EMBEDDING_DIM, normalise } from '@/lib/vector';
import { getExecutorch } from '@/services/clip-runtime';

/**
 * Longest edge handed to the encoder. CLIP works at 224x224, so anything above
 * this is decoded and thrown away; capping it keeps the temporary file small
 * without starving the model of detail.
 */
const MAX_INPUT_EDGE = 512;

/**
 * Resolves an image reference the native encoder can actually open.
 *
 * MediaLibrary hands back `content://` on Android (and `ph://` on iOS). Those
 * are resolved by the Android content layer, not by a file path, and the
 * encoder's native image loader reads paths — handing it a content URI crashes
 * the process rather than raising a catchable error. Re-encoding through the
 * image manipulator produces a real file in the cache directory, which it can
 * read, and shrinks the image at the same time.
 */
async function toReadableFile(uri: string): Promise<string | null> {
  if (uri.startsWith('file://') || uri.startsWith('/')) return uri;

  const resize = { width: MAX_INPUT_EDGE };
  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize(resize);
    const image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
    return result.uri ?? null;
  } catch {
    try {
      const result = await manipulateAsync(uri, [{ resize }], {
        format: SaveFormat.JPEG,
        compress: 0.92,
      });
      return result.uri ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * Whether to use the quantized (int8) image encoder.
 *
 * int8 is a quarter of the size and faster, but its XNNPACK kernels use the
 * Advanced SIMD `i8mm` matrix-multiply instructions. Android emulators expose
 * the SVE form (`svei8mm`) without the Advanced SIMD one, so those kernels hit
 * an unsupported opcode and the process dies with SIGILL — an illegal
 * instruction cannot be caught, so this has to be avoided rather than handled.
 *
 * Real phones have `i8mm`, so they get the small, fast model; emulators fall
 * back to fp32, which uses ordinary NEON floating-point kernels and runs
 * everywhere.
 */
const USE_QUANTIZED_IMAGE_ENCODER = true;

/**
 * Detects the one environment where running the encoders would kill the app.
 *
 * Some Android emulator system images on Apple M4-class hosts advertise the
 * SME instruction set to the guest while the hypervisor cannot execute it.
 * XNNPACK sees the flag, selects SME kernels, and the process dies with
 * SIGILL — which is not catchable, so it must be avoided rather than handled.
 * Verified on this project: both the int8 and fp32 CLIP encoders crash
 * identically on an API 35 image under an M4 Pro, while the API 36 image
 * (whose kernel masks SME) runs them fine. The same failure class is
 * documented across the ecosystem (podman, .NET).
 *
 * The probe reads the guest's own CPU flags, so it distinguishes broken
 * emulator images from fixed ones instead of writing off emulators wholesale.
 * Real devices skip the check: a phone that advertises SME can execute it.
 */
let encodeHazard: boolean | undefined;

async function hasEncodeHazard(): Promise<boolean> {
  if (encodeHazard !== undefined) return encodeHazard;
  if (Device.isDevice) {
    encodeHazard = false;
    return encodeHazard;
  }
  try {
    const cpuinfo = await FileSystem.readAsStringAsync('file:///proc/cpuinfo');
    encodeHazard = /sme/.test(cpuinfo);
  } catch {
    // Cannot verify — on an emulator, stay on the safe side.
    encodeHazard = true;
  }
  return encodeHazard;
}

/** Copy shown wherever encoding is unavailable, worded for the actual cause. */
export const EMULATOR_LIMITATION_MESSAGE =
  'Live encoding is switched off on this emulator: its kernel advertises CPU ' +
  'instructions the host cannot execute, which crashes the model. The sample ' +
  'library ships pre-encoded, so visual tags, Find similar and search still ' +
  'work here. Use a real device, or an Android 16 (API 36) emulator image.';

/** Approximate download sizes, shown before the user commits to a download. */
export const MODEL_SIZES = {
  image: 92 * 1024 * 1024,
  text: 244 * 1024 * 1024,
} as const;

export type EncoderKind = 'image' | 'text';

export type EncoderStatus = 'unavailable' | 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

export type EncoderState = {
  status: EncoderStatus;
  /** 0–1 while downloading. */
  progress: number;
  error: string | null;
};

const INITIAL_STATE: EncoderState = { status: 'idle', progress: 0, error: null };

type Listener = (state: Record<EncoderKind, EncoderState>) => void;

/** True when the native ExecuTorch module is present in this build. */
export function isClipSupported(): boolean {
  return getExecutorch() !== null;
}

/** True when this environment can also *run* the encoders (see above). */
export async function canEncodeOnThisDevice(): Promise<boolean> {
  return isClipSupported() && !(await hasEncodeHazard());
}

/**
 * Owns the two encoders and their lifecycle.
 *
 * A singleton because the models are large: loading a second copy would double
 * an already significant memory footprint. Callers subscribe for state rather
 * than each holding their own instance.
 */
class ClipEngine {
  private imageModule: ImageEmbeddingsModule | null = null;
  private textModule: TextEmbeddingsModule | null = null;
  private state: Record<EncoderKind, EncoderState> = {
    image: { ...INITIAL_STATE },
    text: { ...INITIAL_STATE },
  };
  private listeners = new Set<Listener>();
  /** In-flight loads, so concurrent callers share one download. */
  private pending: Partial<Record<EncoderKind, Promise<void>>> = {};

  getState(): Record<EncoderKind, EncoderState> {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(kind: EncoderKind, patch: Partial<EncoderState>): void {
    this.state = { ...this.state, [kind]: { ...this.state[kind], ...patch } };
    for (const listener of this.listeners) listener(this.state);
  }

  isReady(kind: EncoderKind): boolean {
    return this.state[kind].status === 'ready';
  }

  /**
   * Downloads (first time) and loads an encoder.
   * Safe to call repeatedly: an already-loaded encoder resolves immediately and
   * concurrent calls share a single in-flight promise.
   */
  async load(kind: EncoderKind): Promise<void> {
    if (this.isReady(kind)) return;
    const runtime = getExecutorch();
    if (!runtime) {
      this.update(kind, {
        status: 'unavailable',
        error: 'Smart search needs the native build of Sift. See the README for `expo run:android`.',
      });
      throw new Error('ExecuTorch is not available in this build');
    }
    if (await hasEncodeHazard()) {
      this.update(kind, { status: 'unavailable', error: EMULATOR_LIMITATION_MESSAGE });
      throw new Error('On-device encoding is not available in this emulator image');
    }

    const existing = this.pending[kind];
    if (existing) return existing;

    const work = (async () => {
      const api = runtime;
      this.update(kind, { status: 'downloading', progress: 0, error: null });
      try {
        const onProgress = (progress: number) => {
          this.update(kind, { status: progress >= 1 ? 'loading' : 'downloading', progress });
        };

        if (kind === 'image') {
          this.imageModule = await api.ImageEmbeddingsModule.fromModelName(
            api.models.image_embedding.clip_vit_base_patch32_image({
              quant: USE_QUANTIZED_IMAGE_ENCODER,
            }),
            onProgress
          );
        } else {
          this.textModule = await api.TextEmbeddingsModule.fromModelName(
            api.models.text_embedding.clip_vit_base_patch32_text(),
            onProgress
          );
        }
        this.update(kind, { status: 'ready', progress: 1, error: null });
      } catch (error) {
        this.update(kind, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Could not load the model',
        });
        throw error;
      } finally {
        delete this.pending[kind];
      }
    })();

    this.pending[kind] = work;
    return work;
  }

  /** Frees an encoder's native memory. */
  unload(kind: EncoderKind): void {
    if (kind === 'image') {
      this.imageModule?.delete();
      this.imageModule = null;
    } else {
      this.textModule?.delete();
      this.textModule = null;
    }
    this.update(kind, { status: 'idle', progress: 0, error: null });
  }

  unloadAll(): void {
    this.unload('image');
    this.unload('text');
  }

  /**
   * Embeds one image. Returns null rather than throwing when a single file
   * cannot be decoded, so one bad photo never aborts a whole indexing run.
   */
  async embedImage(uri: string): Promise<Float32Array | null> {
    if (!this.imageModule) await this.load('image');
    if (!this.imageModule) return null;

    const readable = await toReadableFile(uri);
    if (!readable) return null;

    try {
      const raw = await this.imageModule.forward(readable);
      return sanitise(raw);
    } catch {
      return null;
    }
  }

  /** Embeds a search phrase. Throws, because a failed query must be reported. */
  async embedText(text: string): Promise<Float32Array> {
    if (!this.textModule) await this.load('text');
    if (!this.textModule) throw new Error('Text encoder is not loaded');
    const raw = await this.textModule.forward(text);
    const vector = sanitise(raw);
    if (!vector) throw new Error('The text encoder returned an unusable result');
    return vector;
  }
}

/**
 * Validates and unit-normalises a raw model output.
 *
 * ExecuTorch already returns a normalised vector, but normalising again is
 * cheap and makes every downstream comparison a plain dot product regardless of
 * where the vector came from — model, bundled asset, or database.
 */
function sanitise(raw: Float32Array | null | undefined): Float32Array | null {
  if (!raw || raw.length !== EMBEDDING_DIM) return null;
  for (let i = 0; i < raw.length; i += 1) {
    if (!Number.isFinite(raw[i])) return null;
  }
  return normalise(raw);
}

export const clip = new ClipEngine();
