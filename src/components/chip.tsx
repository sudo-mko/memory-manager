import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useHaptics } from '@/hooks/use-haptics';
import { useTheme } from '@/hooks/use-theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Shows a trailing ✕ that calls `onRemove` instead of `onPress`. */
  onRemove?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
};

/** Pill-shaped filter / tag control. */
/**
 * Pill-shaped filter / tag control.
 *
 * A removable chip renders as a plain container holding two separate buttons.
 * Nesting one pressable inside another produces invalid markup on the web
 * target and an ambiguous tap target everywhere else.
 */
export function Chip({ label, selected, onPress, onRemove, icon, count }: ChipProps) {
  const theme = useTheme();
  const haptics = useHaptics();

  const surface = {
    backgroundColor: selected ? theme.accent : theme.backgroundElement,
    borderColor: selected ? theme.accent : theme.border,
  };
  const foreground = selected ? theme.onAccent : theme.textSecondary;

  const body = (
    <>
      {icon ? <Ionicons name={icon} size={13} color={foreground} /> : null}
      <ThemedText
        type="small"
        style={[styles.label, selected && { color: theme.onAccent }]}
        numberOfLines={1}>
        {label}
      </ThemedText>
      {count != null ? (
        <View style={[styles.count, { backgroundColor: selected ? theme.onAccent : theme.background }]}>
          <ThemedText
            type="small"
            style={[styles.countText, { color: selected ? theme.accent : theme.textSecondary }]}>
            {count}
          </ThemedText>
        </View>
      ) : null}
    </>
  );

  if (onRemove) {
    return (
      <View style={[styles.chip, surface]}>
        {onPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: Boolean(selected) }}
            onPress={() => {
              haptics('light');
              onPress();
            }}
            style={({ pressed }) => [styles.inner, { opacity: pressed ? 0.7 : 1 }]}>
            {body}
          </Pressable>
        ) : (
          <View style={styles.inner}>{body}</View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          hitSlop={8}
          onPress={() => {
            haptics('light');
            onRemove();
          }}>
          <Ionicons name="close" size={14} color={foreground} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={count != null ? `${label}, ${count} photos` : label}
      onPress={
        onPress
          ? () => {
              haptics('light');
              onPress();
            }
          : undefined
      }
      style={({ pressed }) => [styles.chip, surface, { opacity: pressed ? 0.7 : 1 }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  label: { fontSize: 13, fontWeight: '600' },
  count: { minWidth: 20, paddingHorizontal: 5, borderRadius: Radius.pill, alignItems: 'center' },
  countText: { fontSize: 11, fontWeight: '700' },
});
