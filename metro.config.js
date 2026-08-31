/**
 * Metro configuration.
 *
 * Two changes from the Expo default:
 *
 * 1. Extra asset extensions — `.wasm` for the browser build of `expo-sqlite`,
 *    and `.pte` / `.bin` for the ExecuTorch model and tokenizer files that
 *    power on-device CLIP.
 * 2. Cross-origin isolation headers on the dev server, which SharedArrayBuffer
 *    (and therefore SQLite in a browser) requires.
 */

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm', 'pte', 'bin');

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    return middleware(req, res, next);
  },
};

module.exports = config;
