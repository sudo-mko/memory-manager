import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useHaptics } from '@/hooks/use-haptics';
import { useTheme } from '@/hooks/use-theme';

type SettingRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  /** Renders a switch when provided. */
  value?: boolean;
  onValueChange?: (next: boolean) => void;
  onPress?: () => void;
  /** Trailing text for navigation-style rows. */
  detail?: string;
  destructive?: boolean;
  disabled?: boolean;
};

/** One row inside a settings card: toggle, navigation, or action. */
export function SettingRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  onPress,
  detail,
  destructive,
  disabled,
}: SettingRowProps) {
  const theme = useTheme();
  const haptics = useHaptics();
  const isSwitch = typeof value === 'boolean' && Boolean(onValueChange);
  const tint = destructive ? theme.danger : theme.text;

  const content = (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Ionicons name={icon} size={19} color={destructive ? theme.danger : theme.textSecondary} />
      <View style={styles.text}>
        <ThemedText style={[styles.title, { color: tint }]}>{title}</ThemedText>
        {description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        ) : null}
      </View>
      {isSwitch ? (
        <Switch
          value={value}
          onValueChange={(next) => {
            haptics('light');
            onValueChange?.(next);
          }}
          disabled={disabled}
          trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
          thumbColor="#FFFFFF"
        />
      ) : (
        <View style={styles.trailing}>
          {detail ? (
            <ThemedText type="small" themeColor="textSecondary">
              {detail}
            </ThemedText>
          ) : null}
          {onPress ? <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} /> : null}
        </View>
      )}
    </View>
  );

  if (!onPress || isSwitch) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={() => {
        haptics('light');
        onPress();
      }}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  text: { flex: 1, gap: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.45 },
});
