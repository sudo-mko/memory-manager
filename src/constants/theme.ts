/**
 * Sift design tokens.
 *
 * A single source of truth for colour, spacing, radius and type so every screen
 * looks like it belongs to the same app. Colours are defined for both light and
 * dark schemes and resolved at runtime by `useTheme()`.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    /** Primary body text. */
    text: '#11131A',
    /** App canvas. */
    background: '#FFFFFF',
    /** Cards, tiles, inputs. */
    backgroundElement: '#F2F3F7',
    /** Pressed / active surface. */
    backgroundSelected: '#E4E6EE',
    /** Muted copy, captions, metadata. */
    textSecondary: '#5C6272',
    /** Brand accent — used for selection, active tabs and primary actions. */
    accent: '#5B4BE1',
    /** Accent wash for chips and highlights. */
    accentSoft: '#EBE8FE',
    /** Text/icon colour that sits on top of `accent`. */
    onAccent: '#FFFFFF',
    /** Hairline separators. */
    border: '#E2E4EC',
    danger: '#D6314B',
    success: '#0F8A5F',
    warning: '#B4690E',
    /** Scrim behind full-screen media. */
    overlay: 'rgba(0,0,0,0.55)',
  },
  dark: {
    text: '#F4F5F8',
    background: '#0B0C10',
    backgroundElement: '#181A21',
    backgroundSelected: '#24262F',
    textSecondary: '#9AA0B0',
    accent: '#8B7CF6',
    accentSoft: '#241F45',
    onAccent: '#0B0C10',
    border: '#24262F',
    danger: '#FF6B83',
    success: '#3DD68C',
    warning: '#F0A741',
    overlay: 'rgba(0,0,0,0.72)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
/** Widened so the light and dark palettes are interchangeable at runtime. */
export type Theme = { readonly [K in ThemeColor]: string };

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** 4pt spacing scale. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 64 }) ?? 0;
export const MaxContentWidth = 900;
