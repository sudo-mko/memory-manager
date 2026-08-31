import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Radius } from '@/constants/theme';
import { useHaptics } from '@/hooks/use-haptics';
import { useTheme } from '@/hooks/use-theme';

type IconButtonProps = {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** `plain` blends into the background, `filled` uses the accent colour. */
  variant?: 'plain' | 'tinted' | 'filled';
  size?: number;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Circular icon button used in headers, toolbars and the photo viewer. */
export function IconButton({
  name,
  onPress,
  variant = 'tinted',
  size = 20,
  accessibilityLabel,
  disabled,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const haptics = useHaptics();

  const background =
    variant === 'filled' ? theme.accent : variant === 'tinted' ? theme.backgroundElement : 'transparent';
  const foreground = variant === 'filled' ? theme.onAccent : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => {
        haptics('light');
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          width: size * 2,
          height: size * 2,
          opacity: disabled ? 0.4 : pressed ? 0.65 : 1,
        },
        style,
      ]}>
      <Ionicons name={name} size={size} color={foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
});
