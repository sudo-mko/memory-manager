import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Platform } from 'react-native';

import { useSettings } from '@/contexts/settings-context';

/**
 * Haptic feedback that respects the user's preference and silently no-ops on
 * platforms (web) or devices that do not support it.
 */
export function useHaptics() {
  const { settings } = useSettings();

  const tap = useCallback(
    (style: 'light' | 'medium' | 'success' = 'light') => {
      if (!settings.hapticsEnabled || Platform.OS === 'web') return;
      const run =
        style === 'success'
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          : Haptics.impactAsync(
              style === 'medium'
                ? Haptics.ImpactFeedbackStyle.Medium
                : Haptics.ImpactFeedbackStyle.Light
            );
      run.catch(() => {
        // Haptics are cosmetic — never surface a failure to the user.
      });
    },
    [settings.hapticsEnabled]
  );

  return tap;
}
