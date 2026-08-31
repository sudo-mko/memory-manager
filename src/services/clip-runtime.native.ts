/**
 * ExecuTorch runtime resolution — iOS and Android.
 *
 * Resolved lazily and defensively. The native module is missing in Expo Go, so
 * importing it must never be allowed to crash the app: a build without it
 * simply reports smart search as unavailable and everything else keeps working.
 */

import type { ExecutorchApi } from './clip-runtime';

let cached: ExecutorchApi | null | undefined;

export function getExecutorch(): ExecutorchApi | null {
  if (cached !== undefined) return cached;

  try {
    // Deliberately a runtime require, not a static import: a top-level import
    // would be evaluated on app start and would throw in a build that has no
    // native binary, taking the whole app down with it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('react-native-executorch');
    if (typeof core?.ImageEmbeddingsModule?.fromModelName !== 'function') {
      cached = null;
      return cached;
    }

    // The resource fetcher downloads and caches the model files. It has to be
    // registered once, before any model is requested.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExpoResourceFetcher } = require('react-native-executorch-expo-resource-fetcher');
    core.initExecutorch({ resourceFetcher: ExpoResourceFetcher });

    cached = core as ExecutorchApi;
  } catch {
    // Expo Go, or a development build made before the dependency was added.
    cached = null;
  }
  return cached;
}

export type { ExecutorchApi };
