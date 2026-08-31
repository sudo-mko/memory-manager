/**
 * Duplicate finder.
 *
 * Two detection passes with very different costs, so the screen is explicit
 * about which one it is showing and what running the expensive one will do.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, SectionLabel } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/contexts/library-context';
import {
  countUnhashed,
  findExactDuplicates,
  findSimilarGroups,
  runDeepScan,
  type DuplicateGroup,
} from '@/services/duplicates';
import { useHaptics } from '@/hooks/use-haptics';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, formatCount } from '@/lib/format';

/** Photos hashed per deep-scan run, so a tap has a predictable cost. */
const DEEP_SCAN_BATCH = 250;

export default function DuplicatesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const haptics = useHaptics();
  const { archivePhoto, revision } = useLibrary();

  const [mode, setMode] = useState<'exact' | 'similar'>('exact');
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [unhashed, setUnhashed] = useState(0);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [found, pending] = await Promise.all([
        mode === 'exact' ? findExactDuplicates() : findSimilarGroups(),
        countUnhashed(),
      ]);
      setGroups(found);
      setUnhashed(pending);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch {
        setLoading(false);
      }
    })();
  }, [load, revision]);

  const handleDeepScan = useCallback(async () => {
    setScanProgress({ done: 0, total: DEEP_SCAN_BATCH });
    try {
      await runDeepScan(DEEP_SCAN_BATCH, setScanProgress);
      haptics('success');
      await load();
    } finally {
      setScanProgress(null);
    }
  }, [haptics, load]);

  const reclaimable = groups.reduce((sum, group) => sum + group.reclaimable, 0);

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: theme.background }}>
      <View style={styles.modes}>
        <Chip label="Exact copies" selected={mode === 'exact'} onPress={() => setMode('exact')} />
        <Chip label="Look-alikes" selected={mode === 'similar'} onPress={() => setMode('similar')} />
      </View>

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {mode === 'exact'
            ? 'Exact matching compares dimensions and file size — instant, and runs straight off the index.'
            : 'Look-alike matching compares a 160-bit visual fingerprint — tone, vertical structure and colour — so it also catches re-compressed and resized copies.'}
        </ThemedText>
        {groups.length > 0 ? (
          <ThemedText type="smallBold">
            {formatCount(groups.length)} {groups.length === 1 ? 'group' : 'groups'} ·{' '}
            {formatBytes(reclaimable)} reclaimable
          </ThemedText>
        ) : null}
      </Card>

      {mode === 'similar' ? (
        <Card>
          <ThemedText type="smallBold">Visual fingerprints</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {unhashed > 0
              ? `${formatCount(unhashed)} photos still need a fingerprint. Hashing runs on device — nothing leaves your phone.`
              : 'Every photo in the index has a fingerprint.'}
          </ThemedText>
          {scanProgress ? (
            <View style={styles.progress}>
              <ProgressBar value={scanProgress.total ? scanProgress.done / scanProgress.total : 0} />
              <ThemedText type="small" themeColor="textSecondary">
                Hashing {scanProgress.done} of {scanProgress.total}
              </ThemedText>
            </View>
          ) : unhashed > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fingerprint more photos"
              onPress={handleDeepScan}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Fingerprint next {Math.min(DEEP_SCAN_BATCH, unhashed)}
              </ThemedText>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="No duplicates found"
          message={
            mode === 'similar' && unhashed > 0
              ? 'Fingerprint your photos first — look-alike detection needs them.'
              : 'Nothing in the index looks like a duplicate. That is good news.'
          }
        />
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <SectionLabel>
              {group.photos.length} copies · {formatBytes(group.reclaimable)} reclaimable ·{' '}
              {Math.round(group.confidence * 100)}% match
            </SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
              {group.photos.map((photo, index) => (
                <View key={photo.id} style={styles.card}>
                  <Pressable
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Open ${photo.filename}`}
                    onPress={() => router.push(`/photo/${encodeURIComponent(photo.id)}`)}>
                    <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" />
                    {index === 0 ? (
                      <View style={[styles.keepBadge, { backgroundColor: theme.success }]}>
                        <ThemedText style={styles.keepText}>KEEP</ThemedText>
                      </View>
                    ) : null}
                  </Pressable>
                  <ThemedText type="small" numberOfLines={1} style={styles.cardName}>
                    {photo.filename}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatBytes(photo.fileSize)}
                  </ThemedText>
                  {index > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Hide ${photo.filename} from the index`}
                      onPress={async () => {
                        await archivePhoto(photo.id, true);
                        haptics('medium');
                      }}
                      style={styles.hideButton}>
                      <Ionicons name="archive-outline" size={13} color={theme.danger} />
                      <ThemedText type="small" style={{ color: theme.danger }}>
                        Hide
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        ))
      )}

      <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
        Hiding removes a photo from Sift&apos;s index only. Sift never deletes files from your device.
      </ThemedText>
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
  modes: { flexDirection: 'row', gap: Spacing.two },
  progress: { gap: Spacing.one, marginTop: Spacing.one },
  loading: { paddingVertical: Spacing.six, alignItems: 'center' },
  group: { gap: Spacing.one },
  strip: { gap: Spacing.two, paddingVertical: Spacing.one },
  card: { width: 108, gap: 2 },
  thumb: { width: 108, height: 108, borderRadius: Radius.md, backgroundColor: '#00000010' },
  keepBadge: {
    position: 'absolute',
    top: Spacing.one,
    left: Spacing.one,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  keepText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  cardName: { fontWeight: '600' },
  hideButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingTop: 2 },
  footnote: { textAlign: 'center', paddingTop: Spacing.two },
});
