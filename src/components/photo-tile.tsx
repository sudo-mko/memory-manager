import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Photo } from '@/db/photos';
import { formatDuration } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';

type PhotoTileProps = {
  photo: Photo;
  size: number;
  showFilename?: boolean;
  selected?: boolean;
  /** When true the tile renders a selection checkbox instead of badges. */
  selectionMode?: boolean;
  onPress: (photo: Photo) => void;
  onLongPress?: (photo: Photo) => void;
};

/**
 * One square tile in the library grid.
 *
 * Memoised because a grid re-renders on every scroll frame; `recyclingKey`
 * tells expo-image to swap the bitmap instead of tearing down the view when a
 * row is reused.
 */
function PhotoTileComponent({
  photo,
  size,
  showFilename,
  selected,
  selectionMode,
  onPress,
  onLongPress,
}: PhotoTileProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`${photo.filename}${photo.favorite ? ', favourite' : ''}`}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={() => onPress(photo)}
      onLongPress={onLongPress ? () => onLongPress(photo) : undefined}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.tile,
        {
          width: size,
          height: size,
          // A themed surface keeps dark screenshots from disappearing into a
          // dark canvas, and gives every tile a visible edge while loading.
          backgroundColor: theme.backgroundElement,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <Image
        source={{ uri: photo.uri }}
        style={styles.image}
        contentFit="cover"
        // No fade-in: a cached image can resolve before the transition starts
        // and stay stuck at zero opacity, leaving a blank tile.
        recyclingKey={photo.id}
        cachePolicy="memory-disk"
      />

      {selected ? (
        <View style={[styles.selectionOverlay, { borderColor: theme.accent }]} />
      ) : null}

      {selectionMode ? (
        <View
          style={[
            styles.check,
            {
              backgroundColor: selected ? theme.accent : 'rgba(0,0,0,0.35)',
              borderColor: selected ? theme.accent : 'rgba(255,255,255,0.8)',
            },
          ]}>
          {selected ? <Ionicons name="checkmark" size={13} color={theme.onAccent} /> : null}
        </View>
      ) : (
        <>
          {photo.favorite ? (
            <View style={styles.badgeTopRight}>
              <Ionicons name="heart" size={13} color="#FF6B83" />
            </View>
          ) : null}
          {photo.mediaType === 'video' ? (
            <View style={styles.videoBadge}>
              <Ionicons name="play" size={9} color="#fff" />
              <ThemedText style={styles.videoText}>{formatDuration(photo.duration)}</ThemedText>
            </View>
          ) : null}
        </>
      )}

      {showFilename ? (
        <View style={styles.filenameStrip}>
          <ThemedText style={styles.filename} numberOfLines={1}>
            {photo.filename}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

export const PhotoTile = memo(PhotoTileComponent);

const styles = StyleSheet.create({
  tile: { borderRadius: Radius.sm, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderRadius: Radius.sm,
  },
  check: {
    position: 'absolute',
    top: Spacing.one + 1,
    right: Spacing.one + 1,
    width: 20,
    height: 20,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTopRight: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    padding: 2,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  videoBadge: {
    position: 'absolute',
    bottom: Spacing.one,
    left: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  videoText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  filenameStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 4,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  filename: { color: '#fff', fontSize: 9, fontWeight: '600' },
});
