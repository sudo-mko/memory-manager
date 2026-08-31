/**
 * Collections — everything that groups photos.
 *
 * Three kinds of grouping in one place: user collections (manual), saved
 * searches (dynamic smart folders that re-evaluate every time you open them),
 * and the device albums discovered during the scan.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, SectionLabel } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { PromptModal } from '@/components/prompt-modal';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/contexts/library-context';
import { createCollection, deleteCollection } from '@/db/collections';
import { deleteSavedSearch } from '@/db/saved-searches';
import { useTheme } from '@/hooks/use-theme';
import { formatCount } from '@/lib/format';

export default function CollectionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { collections, savedSearches, albums, stats, invalidate } = useLibrary();
  const [createOpen, setCreateOpen] = useState(false);

  const nothingYet = collections.length === 0 && savedSearches.length === 0 && albums.length === 0;

  return (
    <Screen>
      <ScreenHeader
        title="Collections"
        subtitle={`${collections.length} collections · ${savedSearches.length} saved searches · ${albums.length} albums`}
        action={
          <IconButton
            name="add"
            variant="filled"
            accessibilityLabel="Create a collection"
            onPress={() => setCreateOpen(true)}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {nothingYet ? (
          <EmptyState
            icon="albums-outline"
            title="Nothing to group yet"
            message={
              (stats?.total ?? 0) === 0
                ? 'Index some photos first — albums appear here automatically after a scan.'
                : 'Create a collection to group photos by hand, or save a search to build a smart folder that updates itself.'
            }
            actionLabel="New collection"
            onAction={() => setCreateOpen(true)}
          />
        ) : null}

        {collections.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Your collections</SectionLabel>
            <View style={styles.grid}>
              {collections.map((collection) => (
                <Pressable
                  key={collection.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${collection.name}, ${collection.count} photos`}
                  onPress={() => router.push(`/collection/${collection.id}`)}
                  onLongPress={async () => {
                    await deleteCollection(collection.id);
                    invalidate();
                  }}
                  style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.7 : 1 }]}>
                  <View style={[styles.cover, { backgroundColor: theme.backgroundElement }]}>
                    {collection.cover ? (
                      <Image source={{ uri: collection.cover }} style={styles.coverImage} contentFit="cover" />
                    ) : (
                      <Ionicons name="albums-outline" size={26} color={theme.textSecondary} />
                    )}
                  </View>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {collection.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatCount(collection.count)} {collection.count === 1 ? 'photo' : 'photos'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Long press a collection to delete it.
            </ThemedText>
          </View>
        ) : null}

        {savedSearches.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Smart folders</SectionLabel>
            <Card style={styles.list}>
              {/* Open and delete are siblings, not nested pressables — nesting
                  one button inside another is invalid markup on web and makes
                  the tap target ambiguous everywhere else. */}
              {savedSearches.map((search, index) => (
                <View
                  key={search.id}
                  style={[
                    styles.row,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  ]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open saved search ${search.name}`}
                    onPress={() => router.push(`/collection/saved-${search.id}`)}
                    style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}>
                    <View style={[styles.iconCircle, { backgroundColor: theme.accentSoft }]}>
                      <Ionicons name="sparkles-outline" size={16} color={theme.accent} />
                    </View>
                    <View style={styles.rowText}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {search.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {search.query}
                      </ThemedText>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete saved search ${search.name}`}
                    hitSlop={10}
                    onPress={async () => {
                      await deleteSavedSearch(search.id);
                      invalidate();
                    }}>
                    <Ionicons name="trash-outline" size={17} color={theme.textSecondary} />
                  </Pressable>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {albums.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Device albums</SectionLabel>
            <View style={styles.grid}>
              {albums.map((album) => (
                <Pressable
                  key={album.name}
                  accessibilityRole="button"
                  accessibilityLabel={`${album.name}, ${album.count} photos`}
                  onPress={() => router.push(`/collection/album-${encodeURIComponent(album.name)}`)}
                  style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.7 : 1 }]}>
                  <View style={[styles.cover, { backgroundColor: theme.backgroundElement }]}>
                    {album.cover ? (
                      <Image source={{ uri: album.cover }} style={styles.coverImage} contentFit="cover" />
                    ) : (
                      <Ionicons name="folder-outline" size={26} color={theme.textSecondary} />
                    )}
                  </View>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {album.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatCount(album.count)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <PromptModal
        visible={createOpen}
        title="New collection"
        description="Collections group photos across albums — a trip, a project, receipts to file."
        placeholder="Trip to Malé"
        confirmLabel="Create"
        onCancel={() => setCreateOpen(false)}
        onConfirm={async (value) => {
          setCreateOpen(false);
          if (value.trim()) {
            await createCollection(value);
            invalidate();
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.five },
  section: { gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  tile: { width: '30%', minWidth: 100, gap: 2 },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.one,
  },
  coverImage: { width: '100%', height: '100%' },
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  iconCircle: { width: 34, height: 34, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  hint: { marginLeft: Spacing.one },
});
