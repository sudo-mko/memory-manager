import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/contexts/library-context';
import { formatCount } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';

const PHASE_LABEL: Record<string, string> = {
  permission: 'Checking photo access…',
  albums: 'Reading albums…',
  scanning: 'Indexing your library',
  cleanup: 'Tidying the index…',
  done: 'Finishing up…',
};

/**
 * Live scan status. Rendered above the grid so a long index never looks like a
 * frozen screen, and always offers a way to stop.
 */
export function ScanBanner() {
  const theme = useTheme();
  const { scan, cancelScan } = useLibrary();

  if (!scan.running && !scan.error) return null;

  if (scan.error) {
    return (
      <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
        <Ionicons name="alert-circle" size={18} color={theme.danger} />
        <ThemedText type="small" style={styles.flex}>
          {scan.error}
        </ThemedText>
      </View>
    );
  }

  const progress = scan.progress;
  const ratio = progress && progress.total > 0 ? progress.scanned / progress.total : 0;

  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.flex}>
        <View style={styles.headerRow}>
          <ThemedText type="smallBold">{PHASE_LABEL[progress?.phase ?? 'scanning']}</ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="Stop scanning" onPress={cancelScan} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Stop
            </ThemedText>
          </Pressable>
        </View>
        {progress && progress.total > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {formatCount(progress.scanned)} of {formatCount(progress.total)}
          </ThemedText>
        ) : null}
        <View style={styles.progress}>
          <ProgressBar value={ratio} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    margin: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1, gap: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { marginTop: Spacing.one + 2 },
});
