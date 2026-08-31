/**
 * Photos that look like this one.
 *
 * Ranked by CLIP embedding distance, so it finds the same scene shot again,
 * the same document photographed twice, or a re-compressed copy — cases that
 * neither filename nor date can connect.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useClip } from '@/contexts/clip-context';
import { getPhoto, type Photo } from '@/db/photos';
import { imageImageRelevance } from '@/lib/vector';
import { useTheme } from '@/hooks/use-theme';
import { ensurePhotoEncoded } from '@/services/semantic-index';
import { findSimilarPhotos } from '@/services/semantic-search';

type Match = { photo: Photo; similarity: number };

export default function SimilarPhotosScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { supported } = useClip();

  const [source, setSource] = useState<Photo | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const photoId = typeof id === 'string' ? decodeURIComponent(id) : '';

  const [retryKey, setRetryKey] = useState(0);
  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const photo = await getPhoto(photoId);
        if (cancelled) return;
        setSource(photo);
        if (!photo) return;

        // The photo may not have been reached by the background pass yet, so
        // encode it on demand rather than showing an empty screen.
        const embedding = await ensurePhotoEncoded(photo);
        if (cancelled) return;
        if (!embedding) {
          setError(
            supported
              ? 'This photo could not be encoded, so there is nothing to compare it against.'
              : 'Visual matching needs the native build of Sift.'
          );
          return;
        }

        const found = await findSimilarPhotos(photo, embedding);
        if (!cancelled) setMatches(found);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not look for similar photos.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [photoId, supported, retryKey]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
        <ThemedText type="small" themeColor="textSecondary">
          Comparing images…
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: theme.background }}>
      {source ? (
        <Card style={styles.sourceCard}>
          <Image source={{ uri: source.uri }} style={styles.sourceImage} contentFit="cover" />
          <View style={styles.flex}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {source.filename}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {matches.length
                ? `${matches.length} visually similar ${matches.length === 1 ? 'photo' : 'photos'}`
                : 'No close visual matches'}
            </ThemedText>
          </View>
        </Card>
      ) : null}

      {error ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Cannot compare this photo"
          message={error}
          actionLabel="Try again"
          onAction={retry}
        />
      ) : null}

      {!error && matches.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title="Nothing else looks like this"
          message="No other encoded photo is a close visual match. Encoding more of your library in Settings will widen the search."
        />
      ) : null}

      <View style={styles.grid}>
        {matches.map((match) => (
          <Pressable
            key={match.photo.id}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${match.photo.filename}, ${Math.round(
              imageImageRelevance(match.similarity) * 100
            )} percent similar`}
            onPress={() => router.push(`/photo/${encodeURIComponent(match.photo.id)}`)}
            style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.7 : 1 }]}>
            <Image source={{ uri: match.photo.uri }} style={styles.thumb} contentFit="cover" />
            <View style={[styles.scorePill, { backgroundColor: theme.accent }]}>
              <Ionicons name="sparkles" size={10} color={theme.onAccent} />
              <ThemedText style={[styles.scoreText, { color: theme.onAccent }]}>
                {Math.round(imageImageRelevance(match.similarity) * 100)}%
              </ThemedText>
            </View>
            <ThemedText type="small" numberOfLines={1} style={styles.name}>
              {match.photo.filename}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  flex: { flex: 1, gap: 2 },
  sourceCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  sourceImage: { width: 56, height: 56, borderRadius: Radius.md, backgroundColor: '#00000010' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: 108, gap: 2 },
  thumb: { width: 108, height: 108, borderRadius: Radius.md, backgroundColor: '#00000010' },
  scorePill: {
    position: 'absolute',
    top: Spacing.one,
    left: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  scoreText: { fontSize: 10, fontWeight: '800' },
  name: { fontWeight: '600' },
});
