/**
 * Library — the home screen.
 *
 * A month-grouped grid over the whole index, with one-tap smart filters and a
 * long-press multi-select mode for bulk tagging and filing.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { CollectionPicker } from '@/components/collection-picker';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { PhotoGrid } from '@/components/photo-grid';
import { PromptModal } from '@/components/prompt-modal';
import { ScanBanner } from '@/components/scan-banner';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLibrary } from '@/contexts/library-context';
import { useSettings } from '@/contexts/settings-context';
import { addToCollection, createCollection } from '@/db/collections';
import type { Photo } from '@/db/photos';
import { useHaptics } from '@/hooks/use-haptics';
import { usePhotoQuery } from '@/hooks/use-photo-query';
import { useTheme } from '@/hooks/use-theme';
import { formatCount } from '@/lib/format';

/** One-tap filters, expressed in the same query language as the search box. */
const QUICK_FILTERS: { label: string; query: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'All', query: '', icon: 'grid-outline' },
  { label: 'Favourites', query: 'is:favorite', icon: 'heart-outline' },
  { label: 'Screenshots', query: 'is:screenshot', icon: 'phone-portrait-outline' },
  { label: 'Videos', query: 'is:video', icon: 'videocam-outline' },
  { label: 'Documents', query: 'tag:document', icon: 'document-text-outline' },
  { label: 'Untagged', query: 'is:untagged', icon: 'pricetag-outline' },
  { label: 'Large', query: 'is:large', icon: 'expand-outline' },
];

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const haptics = useHaptics();
  const { settings, update } = useSettings();
  const { stats, scan, startScan, toggleFavorite, addTag, invalidate, permissionDenied, setDemoLibrary } =
    useLibrary();
  const [seedingDemo, setSeedingDemo] = useState(false);

  // One tap from empty to fully populated: the sample library is the fastest
  // way to see the app working, so it is offered right here rather than only
  // behind Settings.
  const seedDemo = useCallback(async () => {
    if (seedingDemo) return;
    setSeedingDemo(true);
    try {
      await setDemoLibrary(true);
      update({ demoLibrary: true });
    } finally {
      setSeedingDemo(false);
    }
  }, [seedingDemo, setDemoLibrary, update]);

  const [activeFilter, setActiveFilter] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagPromptOpen, setTagPromptOpen] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);

  const query = QUICK_FILTERS[activeFilter].query;
  const { photos, total, loading } = usePhotoQuery(query, settings.sortOrder);
  const selectionMode = selectedIds.size > 0;

  const toggleSelection = useCallback((photo: Photo) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(photo.id)) next.delete(photo.id);
      else next.add(photo.id);
      return next;
    });
  }, []);

  const handlePress = useCallback(
    (photo: Photo) => {
      if (selectionMode) toggleSelection(photo);
      else router.push(`/photo/${encodeURIComponent(photo.id)}`);
    },
    [router, selectionMode, toggleSelection]
  );

  const handleLongPress = useCallback(
    (photo: Photo) => {
      haptics('medium');
      toggleSelection(photo);
    },
    [haptics, toggleSelection]
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const applyToSelection = useCallback(
    async (work: (photoId: string) => Promise<unknown>) => {
      const ids = [...selectedIds];
      for (const id of ids) await work(id);
      clearSelection();
      haptics('success');
    },
    [selectedIds, clearSelection, haptics]
  );

  const subtitle = useMemo(() => {
    if (!stats) return 'Opening your index…';
    if (stats.total === 0) return 'Nothing indexed yet';
    const shown = query ? `${formatCount(total)} of ${formatCount(stats.total)}` : formatCount(stats.total);
    return `${shown} items · ${formatCount(stats.tagged)} tagged`;
  }, [stats, total, query]);

  const cycleColumns = useCallback(() => {
    const next = settings.gridColumns === 4 ? 2 : ((settings.gridColumns + 1) as 2 | 3 | 4);
    update({ gridColumns: next });
  }, [settings.gridColumns, update]);

  const isEmpty = !loading && photos.length === 0;
  const indexEmpty = (stats?.total ?? 0) === 0;

  return (
    <Screen>
      <ScreenHeader
        title={selectionMode ? `${selectedIds.size} selected` : 'Library'}
        subtitle={selectionMode ? 'Tap to add or remove' : subtitle}
        action={
          selectionMode ? (
            <IconButton name="close" accessibilityLabel="Clear selection" onPress={clearSelection} />
          ) : (
            <View style={styles.headerActions}>
              <IconButton
                name={settings.gridColumns === 2 ? 'grid-outline' : 'apps-outline'}
                accessibilityLabel={`Grid size, currently ${settings.gridColumns} columns`}
                onPress={cycleColumns}
              />
              <IconButton
                name="sync-outline"
                accessibilityLabel="Scan device for new photos"
                variant="filled"
                disabled={scan.running}
                onPress={startScan}
              />
            </View>
          )
        }
      />

      <ScanBanner />

      {!selectionMode ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Without this the horizontal strip flexes to fill the column.
          style={styles.filterStrip}
          contentContainerStyle={styles.filters}>
          {QUICK_FILTERS.map((filter, index) => (
            <Chip
              key={filter.label}
              label={filter.label}
              icon={filter.icon}
              selected={index === activeFilter}
              onPress={() => setActiveFilter(index)}
            />
          ))}
        </ScrollView>
      ) : null}

      <PhotoGrid
        photos={photos}
        columns={settings.gridColumns}
        loading={loading}
        grouped={settings.sortOrder === 'newest' || settings.sortOrder === 'oldest'}
        showFilenames={settings.showFilenames}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onPressPhoto={handlePress}
        onLongPressPhoto={handleLongPress}
        ListEmptyComponent={
          isEmpty ? (
            indexEmpty ? (
              <EmptyState
                icon="images-outline"
                title="Your index is empty"
                message={
                  permissionDenied
                    ? 'Sift could not read your photos. Grant access in system settings, or try the sample library.'
                    : 'Scan your device to build the index, or try the app with 26 bundled sample photos first.'
                }
                actionLabel={permissionDenied ? 'Open Settings tab' : 'Scan my photos'}
                onAction={() => (permissionDenied ? router.push('/settings') : startScan())}
                secondaryActionLabel={seedingDemo ? 'Loading samples…' : 'Try with sample photos'}
                onSecondaryAction={seedDemo}
              />
            ) : (
              <EmptyState
                icon="funnel-outline"
                title="Nothing matches that filter"
                message={`No items match “${QUICK_FILTERS[activeFilter].label}”. Try another filter or search with the full query language.`}
                actionLabel="Go to Search"
                onAction={() => router.push('/search')}
              />
            )
          ) : null
        }
      />

      {selectionMode ? (
        <View style={[styles.actionBar, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}>
          <ActionBarButton
            icon="heart-outline"
            label="Favourite"
            onPress={() => applyToSelection((id) => toggleFavorite(id, true))}
          />
          <ActionBarButton icon="pricetag-outline" label="Tag" onPress={() => setTagPromptOpen(true)} />
          <ActionBarButton
            icon="albums-outline"
            label="Collect"
            onPress={() => setCollectionPickerOpen(true)}
          />
        </View>
      ) : null}

      <PromptModal
        visible={tagPromptOpen}
        title={`Tag ${selectedIds.size} ${selectedIds.size === 1 ? 'item' : 'items'}`}
        description="Tags are lowercase and dash separated. They become searchable immediately."
        placeholder="holiday"
        confirmLabel="Add tag"
        onCancel={() => setTagPromptOpen(false)}
        onConfirm={async (value) => {
          setTagPromptOpen(false);
          if (value.trim()) await applyToSelection((id) => addTag(id, value));
        }}
      />

      <CollectionPicker
        visible={collectionPickerOpen}
        onClose={() => setCollectionPickerOpen(false)}
        onCreateNew={() => {
          setCollectionPickerOpen(false);
          setNewCollectionOpen(true);
        }}
        onSelect={async (collectionId) => {
          setCollectionPickerOpen(false);
          await applyToSelection((id) => addToCollection(collectionId, id));
        }}
      />

      <PromptModal
        visible={newCollectionOpen}
        title="New collection"
        placeholder="Trip to Malé"
        confirmLabel="Create"
        onCancel={() => setNewCollectionOpen(false)}
        onConfirm={async (value) => {
          setNewCollectionOpen(false);
          const id = await createCollection(value);
          if (id != null) {
            await applyToSelection((photoId) => addToCollection(id, photoId));
            invalidate();
          }
        }}
      />
    </Screen>
  );
}

/** One button inside the multi-select action bar. */
function ActionBarButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={20} color={theme.text} />
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: Spacing.two },
  filterStrip: { flexGrow: 0, flexShrink: 0 },
  filters: {
    gap: Spacing.two,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.two,
    paddingBottom: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: { alignItems: 'center', gap: 2, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
