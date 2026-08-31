/**
 * Collection detail.
 *
 * One route serves all three kinds of grouping, distinguished by an id prefix:
 *   `12`            a user collection
 *   `saved-3`       a saved search, re-run live every time it is opened
 *   `album-Camera`  a device album
 */

import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLibrary } from '@/contexts/library-context';
import { useSettings } from '@/contexts/settings-context';
import { listCollectionPhotoIds } from '@/db/collections';
import { getPhotosByIds, type Photo } from '@/db/photos';
import { usePhotoQuery } from '@/hooks/use-photo-query';
import { formatCount } from '@/lib/format';

type Target =
  | { kind: 'collection'; id: number; title: string }
  | { kind: 'query'; query: string; title: string }
  | { kind: 'missing' };

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { settings } = useSettings();
  const { collections, savedSearches, revision } = useLibrary();

  const raw = typeof id === 'string' ? decodeURIComponent(id) : '';

  const target = useMemo<Target>(() => {
    if (raw.startsWith('album-')) {
      const name = raw.slice('album-'.length);
      // Quoting keeps album names with spaces as a single operand.
      return { kind: 'query', query: `album:"${name}"`, title: name };
    }
    if (raw.startsWith('saved-')) {
      const savedId = Number(raw.slice('saved-'.length));
      const saved = savedSearches.find((s) => s.id === savedId);
      return saved
        ? { kind: 'query', query: saved.query, title: saved.name }
        : { kind: 'missing' };
    }
    const collectionId = Number(raw);
    if (!Number.isNaN(collectionId)) {
      const collection = collections.find((c) => c.id === collectionId);
      return { kind: 'collection', id: collectionId, title: collection?.name ?? 'Collection' };
    }
    return { kind: 'missing' };
  }, [raw, collections, savedSearches]);

  // Saved searches and albums are just queries, so they reuse the search hook.
  const queryResult = usePhotoQuery(
    target.kind === 'query' ? target.query : '',
    settings.sortOrder,
    { debounceMs: 0 }
  );

  const [manualPhotos, setManualPhotos] = useState<Photo[]>([]);
  const [manualLoading, setManualLoading] = useState(target.kind === 'collection');

  useEffect(() => {
    if (target.kind !== 'collection') return;
    let cancelled = false;
    (async () => {
      setManualLoading(true);
      const ids = await listCollectionPhotoIds(target.id);
      const rows = await getPhotosByIds(ids);
      if (!cancelled) {
        setManualPhotos(rows);
        setManualLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setManualLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [target, revision]);

  const title = target.kind === 'missing' ? 'Not found' : target.title;

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  if (target.kind === 'missing') {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="help-circle-outline"
          title="Not found"
          message="This collection or saved search no longer exists."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const photos = target.kind === 'collection' ? manualPhotos : queryResult.photos;
  const loading = target.kind === 'collection' ? manualLoading : queryResult.loading;

  return (
    <View style={styles.root}>
      <PhotoGrid
        photos={photos}
        columns={settings.gridColumns}
        loading={loading}
        showFilenames={settings.showFilenames}
        onPressPhoto={(photo) => router.push(`/photo/${encodeURIComponent(photo.id)}`)}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatCount(photos.length)} {photos.length === 1 ? 'item' : 'items'}
              {target.kind === 'query' ? ` · ${target.query}` : ''}
            </ThemedText>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="images-outline"
              title="Nothing here yet"
              message={
                target.kind === 'collection'
                  ? 'Open a photo and tap Collect to file it here, or long press photos in the library to add several at once.'
                  : 'No indexed photos match this query right now.'
              }
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  header: { paddingHorizontal: Spacing.one, paddingBottom: Spacing.two },
});
