import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SectionList,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { PhotoTile } from '@/components/photo-tile';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { Photo } from '@/db/photos';
import { formatMonthLabel, monthKey } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';

const GAP = 3;
const HORIZONTAL_PADDING = Spacing.two;

type PhotoGridProps = {
  photos: Photo[];
  columns: number;
  loading?: boolean;
  /** Groups tiles under sticky month headings. */
  grouped?: boolean;
  showFilenames?: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onPressPhoto: (photo: Photo) => void;
  onLongPressPhoto?: (photo: Photo) => void;
  ListHeaderComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
};

/** Splits a flat list into fixed-width rows for the grid renderer. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * The library grid.
 *
 * Rows — not individual photos — are the list items. That keeps `FlatList` and
 * `SectionList` on a single column internally, which is what makes sticky month
 * headers possible while still rendering a grid.
 */
export function PhotoGrid({
  photos,
  columns,
  loading,
  grouped,
  showFilenames,
  selectionMode,
  selectedIds,
  onPressPhoto,
  onLongPressPhoto,
  ListHeaderComponent,
  ListEmptyComponent,
}: PhotoGridProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const tileSize = useMemo(() => {
    const usable = Math.min(width, MaxContentWidth) - HORIZONTAL_PADDING * 2;
    return Math.floor((usable - GAP * (columns - 1)) / columns);
  }, [width, columns]);

  const renderRow = (row: Photo[]) => (
    <View style={styles.row}>
      {row.map((photo) => (
        <PhotoTile
          key={photo.id}
          photo={photo}
          size={tileSize}
          showFilename={showFilenames}
          selectionMode={selectionMode}
          selected={selectedIds?.has(photo.id)}
          onPress={onPressPhoto}
          onLongPress={onLongPressPhoto}
        />
      ))}
      {/* Spacers keep the final row left-aligned instead of stretched. */}
      {row.length < columns
        ? Array.from({ length: columns - row.length }, (_, i) => (
            <View key={`spacer-${i}`} style={{ width: tileSize }} />
          ))
        : null}
    </View>
  );

  const sections = useMemo(() => {
    if (!grouped) return [];
    const buckets = new Map<string, Photo[]>();
    for (const photo of photos) {
      const key = photo.createdAt ? monthKey(photo.createdAt) : 'unknown';
      const bucket = buckets.get(key);
      if (bucket) bucket.push(photo);
      else buckets.set(key, [photo]);
    }
    return [...buckets.entries()].map(([key, group]) => ({
      title: key === 'unknown' ? 'Undated' : formatMonthLabel(group[0].createdAt),
      count: group.length,
      data: chunk(group, columns),
    }));
  }, [photos, grouped, columns]);

  const rows = useMemo(() => (grouped ? [] : chunk(photos, columns)), [photos, grouped, columns]);

  if (loading && photos.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} />
        <ThemedText type="small" themeColor="textSecondary">
          Reading the index…
        </ThemedText>
      </View>
    );
  }

  if (grouped) {
    return (
      <SectionList
        sections={sections}
        keyExtractor={(row, index) => `${row[0]?.id ?? 'row'}-${index}`}
        renderItem={({ item }) => renderRow(item)}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
            <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {section.count}
            </ThemedText>
          </View>
        )}
        stickySectionHeadersEnabled
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.content}
        initialNumToRender={12}
        windowSize={9}
        removeClippedSubviews
      />
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row, index) => `${row[0]?.id ?? 'row'}-${index}`}
      renderItem={({ item }) => renderRow(item)}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={styles.content}
      initialNumToRender={12}
      windowSize={9}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: BottomTabInset + Spacing.five },
  row: { flexDirection: 'row', gap: GAP, marginBottom: GAP },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
