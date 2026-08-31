/**
 * Insights — what the library is actually made of.
 *
 * The numbers all come straight from SQL aggregates over the index, so this
 * screen costs a handful of queries rather than a pass over every photo.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, SectionLabel } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/contexts/library-context';
import { getMonthlyCounts } from '@/db/photos';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, formatCount, formatDate, formatMonthLabel } from '@/lib/format';

export default function InsightsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { stats, userTags, autoTags, albums, revision } = useLibrary();
  const [monthly, setMonthly] = useState<{ month: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMonthlyCounts(12)
      .then((rows) => {
        if (!cancelled) {
          setMonthly(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  if (!stats || loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const peak = Math.max(1, ...monthly.map((m) => m.count));
  const untagged = Math.max(0, stats.total - stats.tagged);

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: theme.background }}>
      <View style={styles.tiles}>
        <StatTile label="Indexed" value={formatCount(stats.total)} icon="images-outline" />
        <StatTile label="Videos" value={formatCount(stats.videos)} icon="videocam-outline" />
        <StatTile label="Screenshots" value={formatCount(stats.screenshots)} icon="phone-portrait-outline" />
        <StatTile label="Favourites" value={formatCount(stats.favorites)} icon="heart-outline" />
        <StatTile label="Tagged" value={formatCount(stats.tagged)} icon="pricetag-outline" />
        <StatTile label="With text" value={formatCount(stats.withText)} icon="text-outline" />
      </View>

      <View>
        <SectionLabel>Storage tracked</SectionLabel>
        <Card>
          <ThemedText style={styles.big}>{formatBytes(stats.bytes)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            File sizes are recorded for demo photos and for anything the deep scan has measured.
          </ThemedText>
        </Card>
      </View>

      {monthly.length > 0 ? (
        <View>
          <SectionLabel>Photos per month</SectionLabel>
          <Card>
            {/* A bar chart drawn with plain views — no chart library needed for
                twelve rows, and it themes itself for free. */}
            {monthly.map((row) => {
              const [year, month] = row.month.split('-').map(Number);
              const label = formatMonthLabel(new Date(year, month - 1, 1).getTime());
              return (
                <View key={row.month} style={styles.barRow}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.barLabel} numberOfLines={1}>
                    {label}
                  </ThemedText>
                  <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${(row.count / peak) * 100}%`, backgroundColor: theme.accent },
                      ]}
                    />
                  </View>
                  <ThemedText type="small" style={styles.barValue}>
                    {row.count}
                  </ThemedText>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      <View>
        <SectionLabel>Span</SectionLabel>
        <Card>
          <Row label="Oldest item" value={stats.oldest ? formatDate(stats.oldest) : '—'} />
          <Row label="Newest item" value={stats.newest ? formatDate(stats.newest) : '—'} />
          <Row label="Device albums" value={formatCount(albums.length)} />
          <Row label="Distinct tags" value={formatCount(userTags.length + autoTags.length)} />
        </Card>
      </View>

      {untagged > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Review ${untagged} untagged photos`}
          onPress={() => router.push('/search')}>
          <Card style={{ borderColor: theme.accent }}>
            <ThemedText type="smallBold">{formatCount(untagged)} items have no tags of your own</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Search `is:untagged` to work through them, or long press in the library to tag several at once.
            </ThemedText>
          </Card>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Ionicons name={icon} size={17} color={theme.textSecondary} />
      <ThemedText style={styles.tileValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    gap: 2,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileValue: { fontSize: 22, fontWeight: '700' },
  big: { fontSize: 26, fontWeight: '700' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 3 },
  barLabel: { width: 116 },
  barTrack: { flex: 1, height: 10, borderRadius: Radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: Radius.pill },
  barValue: { width: 40, textAlign: 'right', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  rowValue: { fontWeight: '600' },
});
