import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional quieter second choice, rendered below the primary action. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

/** Shown wherever a list has nothing to display, always with a way forward. */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name={icon} size={28} color={theme.textSecondary} />
      </View>
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
        {message}
      </ThemedText>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
          ]}>
          <ThemedText style={[styles.actionText, { color: theme.onAccent }]}>{actionLabel}</ThemedText>
        </Pressable>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondaryActionLabel}
          onPress={onSecondaryAction}
          style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.6 : 1 }]}>
          <ThemedText style={[styles.actionText, { color: theme.accent }]}>
            {secondaryActionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six, paddingHorizontal: Spacing.four },
  iconCircle: { width: 64, height: 64, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', marginTop: Spacing.one },
  message: { textAlign: 'center', maxWidth: 320 },
  action: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.pill,
  },
  actionText: { fontSize: 14, fontWeight: '700' },
  secondary: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
});
