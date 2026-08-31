/**
 * ExecuTorch runtime resolution — non-native fallback.
 *
 * This is the file Metro picks for the web bundle (and anything that is not
 * iOS or Android). It resolves to nothing, which is what lets the browser build
 * ship without pulling in a native-only package that cannot be bundled there.
 * `clip-runtime.native.ts` holds the real implementation.
 */

import type { ImageEmbeddingsModule, TextEmbeddingsModule } from 'react-native-executorch';

export type ExecutorchApi = {
  ImageEmbeddingsModule: typeof ImageEmbeddingsModule;
  TextEmbeddingsModule: typeof TextEmbeddingsModule;
  models: any;
};

/** Always null off-device: there is no native binary to talk to. */
export function getExecutorch(): ExecutorchApi | null {
  return null;
}
