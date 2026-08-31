/**
 * Resolves the active colour palette from the user's theme preference, falling
 * back to the OS setting when they have chosen "System".
 */

import { useColorScheme as useSystemColorScheme } from 'react-native';

import { Colors, type Theme } from '@/constants/theme';
import { useSettings } from '@/contexts/settings-context';

export function useColorSchemeName(): 'light' | 'dark' {
  const system = useSystemColorScheme();
  const { settings } = useSettings();
  if (settings.themePreference === 'light') return 'light';
  if (settings.themePreference === 'dark') return 'dark';
  return system === 'dark' ? 'dark' : 'light';
}

export function useTheme(): Theme {
  return Colors[useColorSchemeName()];
}
