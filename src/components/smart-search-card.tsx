/**
 * Smart search setup.
 *
 * The one place where the cost of the feature is stated plainly — what gets
 * downloaded, how big it is, and what each part buys — before anything is
 * committed to. The two encoders are offered separately because the useful
 * half is also the small half.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Card, SectionLabel } from '@/components/card';
import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useClip } from '@/contexts/clip-context';
import { ENCODE_BATCH_SIZE } from '@/services/semantic-index';
import type { EncoderKind, EncoderState } from '@/services/clip';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, formatCount } from '@/lib/format';

export function SmartSearchCard() {
  const theme = useTheme();
  const router = useRouter();
  const {
    supported,
    canEncode,
    encoders,
    encodedCount,
    pendingCount,
    indexing,
    indexProgress,
    indexError,
    downloadSizes,
    enableEncoder,
    startIndexing,
    cancelIndexing,
    forgetEmbeddings,
  } = useClip();

  const confirmForget = () => {
    Alert.alert(
      'Remove visual index?',
      'Clears every CLIP embedding and the tags recognised from them. Your photos, your own tags and your collections are untouched. Re-encoding rebuilds it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void forgetEmbeddings() },
      ]
    );
  };

  return (
    <View>
      <SectionLabel>Smart search</SectionLabel>
      <Card style={styles.card}>
        <View style={styles.intro}>
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="sparkles" size={17} color={theme.accent} />
          </View>
          <View style={styles.flex}>
            <ThemedText type="smallBold">Find photos by what they show</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Runs OpenAI&apos;s CLIP model on this device. Nothing is uploaded — the
              models are downloaded once and everything after that works offline.
            </ThemedText>
          </View>
        </View>

        {!supported ? (
          <View style={[styles.notice, { borderColor: theme.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              This build cannot run the models. Smart search needs the native build —
              see &quot;Running the app&quot; in the README.
            </ThemedText>
          </View>
        ) : !canEncode ? (
          <View style={[styles.notice, { borderColor: theme.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              Live encoding is off on emulators — some host CPUs advertise instructions
              the emulator cannot run, which crashes the model. The sample library is
              pre-encoded, so everything is still demonstrable here; use a real device
              for live encoding.
            </ThemedText>
          </View>
        ) : null}

        <EncoderRow
          kind="image"
          title="Visual recognition"
          description="Tags what each photo shows and powers “Find similar”."
          size={downloadSizes.image}
          state={encoders.image}
          disabled={!supported || !canEncode}
          onEnable={() => void enableEncoder('image')}
        />

        <EncoderRow
          kind="text"
          title="Search in your own words"
          description="Turns a typed sentence into a search. Needs visual recognition first."
          size={downloadSizes.text}
          state={encoders.text}
          disabled={!supported || !canEncode || encoders.image.status !== 'ready'}
          onEnable={() => void enableEncoder('text')}
        />

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.statusRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {formatCount(encodedCount)} encoded
            {pendingCount > 0 ? ` · ${formatCount(pendingCount)} waiting` : ' · up to date'}
          </ThemedText>
          {encodedCount > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Remove visual index" onPress={confirmForget}>
              <ThemedText type="small" style={{ color: theme.danger }}>
                Remove
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        {indexing && indexProgress ? (
          <View style={styles.progressBlock}>
            <ProgressBar value={indexProgress.total ? indexProgress.done / indexProgress.total : 0} />
            <View style={styles.statusRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex} numberOfLines={1}>
                Encoding {indexProgress.done} of {indexProgress.total}
                {indexProgress.current ? ` · ${indexProgress.current}` : ''}
              </ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Stop encoding" onPress={cancelIndexing}>
                <ThemedText type="small" style={{ color: theme.accent }}>
                  Stop
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : pendingCount > 0 && supported && canEncode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Encode the next ${Math.min(ENCODE_BATCH_SIZE, pendingCount)} photos`}
            onPress={() => void startIndexing()}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              Encode next {formatCount(Math.min(ENCODE_BATCH_SIZE, pendingCount))}
            </ThemedText>
          </Pressable>
        ) : null}

        {indexError ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {indexError}
          </ThemedText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How smart search works"
          onPress={() => router.push('/smart-search-help')}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            How this works
          </ThemedText>
        </Pressable>
      </Card>
    </View>
  );
}

/** One downloadable encoder, with its size and current state. */
function EncoderRow({
  kind,
  title,
  description,
  size,
  state,
  disabled,
  onEnable,
}: {
  kind: EncoderKind;
  title: string;
  description: string;
  size: number;
  state: EncoderState;
  disabled: boolean;
  onEnable: () => void;
}) {
  const theme = useTheme();
  const busy = state.status === 'downloading' || state.status === 'loading';

  return (
    <View style={styles.encoder}>
      <View style={styles.statusRow}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        </View>

        {state.status === 'ready' ? (
          <View style={styles.readyRow}>
            <Ionicons name="checkmark-circle" size={17} color={theme.success} />
            <ThemedText type="small" themeColor="textSecondary">
              Ready
            </ThemedText>
          </View>
        ) : busy ? (
          <ThemedText type="small" themeColor="textSecondary">
            {state.status === 'loading' ? 'Loading…' : `${Math.round(state.progress * 100)}%`}
          </ThemedText>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Download ${title}, ${formatBytes(size)}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onEnable}
            style={({ pressed }) => [
              styles.download,
              {
                borderColor: theme.border,
                opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}>
            <Ionicons name="cloud-download-outline" size={14} color={theme.text} />
            <ThemedText type="small" style={styles.downloadLabel}>
              {formatBytes(size)}
            </ThemedText>
          </Pressable>
        )}
      </View>

      {busy ? (
        <View style={styles.progressBlock}>
          <ProgressBar value={state.progress} />
        </View>
      ) : null}

      {state.error && state.status === 'error' ? (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityLabel={`${kind} encoder error`}>
          {state.error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  intro: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  badge: { width: 34, height: 34, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  encoder: { gap: Spacing.two },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  download: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  downloadLabel: { fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth },
  progressBlock: { gap: Spacing.one },
  action: { alignItems: 'center', paddingVertical: Spacing.two + 2, borderRadius: Radius.pill },
});
