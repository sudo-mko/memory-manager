/**
 * Photo detail.
 *
 * Everything Sift knows about one asset, and every way to teach it more:
 * tags, a note, collections, and optional text extraction. Tapping the image
 * hides the panels so the photo can be viewed properly.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, SectionLabel } from '@/components/card';
import { Chip } from '@/components/chip';
import { CollectionPicker } from '@/components/collection-picker';
import { IconButton } from '@/components/icon-button';
import { PromptModal } from '@/components/prompt-modal';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/contexts/library-context';
import { useSettings } from '@/contexts/settings-context';
import { addToCollection, createCollection, getCollectionsForPhoto, removeFromCollection } from '@/db/collections';
import { getPhoto, type Photo } from '@/db/photos';
import { useHaptics } from '@/hooks/use-haptics';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, formatDate, formatDimensions, formatDuration, formatMegapixels } from '@/lib/format';
import { describeOcrError, extractText } from '@/services/ocr';

export default function PhotoDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const haptics = useHaptics();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useSettings();
  const { revision, toggleFavorite, archivePhoto, savePhotoNote, savePhotoText, addTag, removeTag, invalidate } =
    useLibrary();

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [memberOf, setMemberOf] = useState<number[]>([]);

  const [tagPromptOpen, setTagPromptOpen] = useState(false);
  const [notePromptOpen, setNotePromptOpen] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);

  const photoId = typeof id === 'string' ? decodeURIComponent(id) : '';

  // Re-read from the index whenever a mutation bumps the revision, so the panel
  // below the image always reflects what is actually stored.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [row, collections] = await Promise.all([
        getPhoto(photoId),
        getCollectionsForPhoto(photoId),
      ]);
      if (cancelled) return;
      setPhoto(row);
      setMemberOf(collections);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [photoId, revision]);

  const handleShare = useCallback(async () => {
    if (!photo) return;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot share files from Sift.');
        return;
      }
      await Sharing.shareAsync(photo.uri);
    } catch {
      Alert.alert('Could not share', 'The system would not hand this file to the share sheet.');
    }
  }, [photo]);

  const handleReadText = useCallback(async () => {
    if (!photo) return;
    setOcrBusy(true);
    try {
      const text = await extractText(photo.uri, settings.ocrApiKey);
      await savePhotoText(photo.id, text);
      haptics('success');
    } catch (error) {
      Alert.alert('Text extraction', describeOcrError(error));
    } finally {
      setOcrBusy(false);
    }
  }, [photo, settings.ocrApiKey, savePhotoText, haptics]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!photo) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={30} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          This photo is no longer in the index.
        </ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            Go back
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={immersive ? 'Show photo details' : 'Hide photo details'}
          onPress={() => setImmersive((current) => !current)}>
          <Image
            source={{ uri: photo.uri }}
            style={[styles.image, immersive && styles.imageImmersive]}
            contentFit="contain"
          />
        </Pressable>

        {!immersive ? (
          <View style={styles.panel}>
            <View style={styles.titleRow}>
              <View style={styles.titleText}>
                <ThemedText style={styles.filename} numberOfLines={1}>
                  {photo.filename}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(photo.createdAt)}
                  {photo.albumName ? ` · ${photo.albumName}` : ''}
                </ThemedText>
              </View>
              <IconButton
                name={photo.favorite ? 'heart' : 'heart-outline'}
                accessibilityLabel={photo.favorite ? 'Remove from favourites' : 'Add to favourites'}
                variant={photo.favorite ? 'filled' : 'tinted'}
                onPress={() => toggleFavorite(photo.id, !photo.favorite)}
              />
            </View>

            <View style={styles.actionRow}>
              <ActionTile
                icon="pricetag-outline"
                label="Tag"
                onPress={() => setTagPromptOpen(true)}
              />
              <ActionTile
                icon="albums-outline"
                label="Collect"
                onPress={() => setCollectionPickerOpen(true)}
              />
              <ActionTile
                icon="create-outline"
                label="Note"
                onPress={() => setNotePromptOpen(true)}
              />
              <ActionTile
                icon="sparkles-outline"
                label="Similar"
                onPress={() => router.push({ pathname: '/similar/[id]', params: { id: photo.id } })}
              />
              <ActionTile icon="share-outline" label="Share" onPress={handleShare} />
              <ActionTile
                icon={photo.archived ? 'eye-outline' : 'archive-outline'}
                label={photo.archived ? 'Restore' : 'Hide'}
                onPress={() => archivePhoto(photo.id, !photo.archived)}
              />
            </View>

            <View>
              <SectionLabel>Your tags</SectionLabel>
              <View style={styles.chips}>
                {photo.userTags.map((tag) => (
                  <Chip key={tag} label={tag} selected onRemove={() => removeTag(photo.id, tag)} />
                ))}
                <Chip label="Add tag" icon="add" onPress={() => setTagPromptOpen(true)} />
              </View>
            </View>

            {photo.visualTags.length ? (
              <View>
                <SectionLabel>Recognised in the picture</SectionLabel>
                <View style={styles.chips}>
                  {photo.visualTags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      icon="sparkles"
                      onPress={() => router.push({ pathname: '/search', params: { q: `tag:${tag}` } })}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View>
              <SectionLabel>From file metadata</SectionLabel>
              <View style={styles.chips}>
                {photo.autoTags.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    No automatic tags for this item.
                  </ThemedText>
                ) : (
                  photo.autoTags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      onPress={() => router.push({ pathname: '/search', params: { q: `tag:${tag}` } })}
                    />
                  ))
                )}
              </View>
            </View>

            <View>
              <SectionLabel>Details</SectionLabel>
              <Card>
                <DetailRow label="Dimensions" value={formatDimensions(photo.width, photo.height)} />
                <DetailRow label="Resolution" value={formatMegapixels(photo.width, photo.height)} />
                <DetailRow label="File size" value={formatBytes(photo.fileSize)} />
                {photo.mediaType === 'video' ? (
                  <DetailRow label="Duration" value={formatDuration(photo.duration) || '—'} />
                ) : null}
                <DetailRow label="Source" value={photo.source === 'demo' ? 'Demo library' : 'Device'} />
                <DetailRow label="Fingerprint" value={photo.phash && photo.phash !== 'unsupported' ? photo.phash : 'Not hashed yet'} />
                <DetailRow label="Visual index" value={photo.hasEmbedding ? 'Encoded with CLIP' : 'Not encoded yet'} />
              </Card>
            </View>

            {photo.note ? (
              <View>
                <SectionLabel>Note</SectionLabel>
                <Card>
                  <ThemedText type="small">{photo.note}</ThemedText>
                </Card>
              </View>
            ) : null}

            <View>
              <SectionLabel>Text in this image</SectionLabel>
              <Card>
                {photo.ocrText ? (
                  <>
                    <ThemedText type="small">{photo.ocrText}</ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Copy extracted text"
                      onPress={async () => {
                        await Clipboard.setStringAsync(photo.ocrText ?? '');
                        haptics('success');
                      }}>
                      <ThemedText type="smallBold" style={{ color: theme.accent }}>
                        Copy text
                      </ThemedText>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      {settings.ocrApiKey
                        ? 'Extract the words inside this image so they become searchable.'
                        : 'Add a free OCR.space key in Settings to search the text inside your screenshots.'}
                    </ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Read text from this image"
                      disabled={ocrBusy}
                      onPress={handleReadText}
                      style={styles.ocrButton}>
                      {ocrBusy ? <ActivityIndicator size="small" color={theme.accent} /> : null}
                      <ThemedText type="smallBold" style={{ color: theme.accent }}>
                        {ocrBusy ? 'Reading…' : 'Read text'}
                      </ThemedText>
                    </Pressable>
                  </>
                )}
              </Card>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <PromptModal
        visible={tagPromptOpen}
        title="Add a tag"
        description="Lowercase, dash separated. Searchable straight away."
        placeholder="beach"
        confirmLabel="Add"
        onCancel={() => setTagPromptOpen(false)}
        onConfirm={async (value) => {
          setTagPromptOpen(false);
          if (value.trim()) await addTag(photo.id, value);
        }}
      />

      <PromptModal
        visible={notePromptOpen}
        title="Note"
        description="Notes are indexed, so anything you write here becomes searchable."
        placeholder="Where this was taken, who is in it…"
        initialValue={photo.note ?? ''}
        confirmLabel="Save note"
        multiline
        onCancel={() => setNotePromptOpen(false)}
        onConfirm={async (value) => {
          setNotePromptOpen(false);
          await savePhotoNote(photo.id, value);
        }}
      />

      <CollectionPicker
        visible={collectionPickerOpen}
        memberOf={memberOf}
        onClose={() => setCollectionPickerOpen(false)}
        onCreateNew={() => {
          setCollectionPickerOpen(false);
          setNewCollectionOpen(true);
        }}
        onSelect={async (collectionId) => {
          setCollectionPickerOpen(false);
          // Tapping a collection the photo is already in removes it again.
          if (memberOf.includes(collectionId)) await removeFromCollection(collectionId, photo.id);
          else await addToCollection(collectionId, photo.id);
          invalidate();
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
          const collectionId = await createCollection(value);
          if (collectionId != null) {
            await addToCollection(collectionId, photo.id);
            invalidate();
          }
        }}
      />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.detailValue} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

function ActionTile({
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
      style={({ pressed }) => [
        styles.actionTile,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.65 : 1 },
      ]}>
      <Ionicons name={icon} size={19} color={theme.text} />
      <ThemedText style={styles.actionLabel}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  scroll: {
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  image: { width: '100%', height: 380, backgroundColor: '#00000010' },
  imageImmersive: { height: 620 },
  panel: { padding: Spacing.three, gap: Spacing.four },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  titleText: { flex: 1, gap: 2 },
  filename: { fontSize: 18, fontWeight: '700' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actionTile: {
    flexGrow: 1,
    flexBasis: 88,
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
  },
  actionLabel: { fontSize: 11, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  detailValue: { flexShrink: 1, textAlign: 'right', fontWeight: '600' },
  ocrButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.one },
});
