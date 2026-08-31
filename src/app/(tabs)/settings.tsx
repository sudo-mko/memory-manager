/**
 * Settings — preferences, index maintenance and the optional cloud feature.
 *
 * Every destructive action states what it will do before it does it, and the
 * demo library gives anyone a fully populated app without touching their photos.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Card, SectionLabel } from '@/components/card';
import { Chip } from '@/components/chip';
import { PromptModal } from '@/components/prompt-modal';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SettingRow } from '@/components/setting-row';
import { SmartSearchCard } from '@/components/smart-search-card';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useLibrary } from '@/contexts/library-context';
import { useSettings, type ThemePreference } from '@/contexts/settings-context';
import { clearIndex } from '@/db/database';
import { clearRecentSearches } from '@/db/saved-searches';
import { DEMO_ASSET_COUNT } from '@/services/demo-library';
import { formatBytes, formatCount, formatRelative } from '@/lib/format';
import type { SortOrder } from '@/db/photos';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const SORTS: { value: SortOrder; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'largest', label: 'Largest' },
  { value: 'name', label: 'Name' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, update, reset } = useSettings();
  const { stats, scan, startScan, setDemoLibrary, invalidate } = useLibrary();

  const [keyPromptOpen, setKeyPromptOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirmReset = () => {
    Alert.alert(
      'Reset the index?',
      'This clears every indexed photo, tag and collection from Sift. Your actual photos are never touched — a new scan rebuilds the index.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearIndex();
            update({ demoLibrary: false });
            invalidate();
          },
        },
      ]
    );
  };

  const toggleDemo = async (next: boolean) => {
    setBusy(true);
    try {
      await setDemoLibrary(next);
      update({ demoLibrary: next });
    } catch {
      Alert.alert('Could not load the demo library', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Settings"
        subtitle={
          stats
            ? `${formatCount(stats.total)} indexed · ${formatBytes(stats.bytes)} tracked`
            : 'Loading index…'
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <SectionLabel>Index</SectionLabel>
          <Card>
            <SettingRow
              icon="sync-outline"
              title="Scan device photos"
              description={
                scan.lastIndexedAt
                  ? `Last scan ${formatRelative(scan.lastIndexedAt)}`
                  : 'Build the index from your photo library'
              }
              onPress={startScan}
              disabled={scan.running}
              detail={scan.running ? 'Running…' : undefined}
            />
            <SettingRow
              icon="copy-outline"
              title="Find duplicates"
              description="Exact copies and near-identical shots"
              onPress={() => router.push('/duplicates')}
            />
            <SettingRow
              icon="bar-chart-outline"
              title="Insights"
              description="What your library is actually made of"
              onPress={() => router.push('/insights')}
            />
          </Card>
        </View>

        <SmartSearchCard />

        <View>
          <SectionLabel>Try it without your photos</SectionLabel>
          <Card>
            <SettingRow
              icon="flask-outline"
              title="Demo library"
              description={`Adds ${DEMO_ASSET_COUNT} bundled sample photos so every feature works offline, with no permissions.`}
              value={settings.demoLibrary}
              onValueChange={toggleDemo}
              disabled={busy}
            />
          </Card>
        </View>

        <View>
          <SectionLabel>Appearance</SectionLabel>
          <Card>
            <View style={styles.optionBlock}>
              <ThemedText type="smallBold">Theme</ThemedText>
              <View style={styles.chips}>
                {THEMES.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={settings.themePreference === option.value}
                    onPress={() => update({ themePreference: option.value })}
                  />
                ))}
              </View>
            </View>

            <View style={styles.optionBlock}>
              <ThemedText type="smallBold">Grid size</ThemedText>
              <View style={styles.chips}>
                {([2, 3, 4] as const).map((columns) => (
                  <Chip
                    key={columns}
                    label={`${columns} across`}
                    selected={settings.gridColumns === columns}
                    onPress={() => update({ gridColumns: columns })}
                  />
                ))}
              </View>
            </View>

            <View style={styles.optionBlock}>
              <ThemedText type="smallBold">Default sort</ThemedText>
              <View style={styles.chips}>
                {SORTS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={settings.sortOrder === option.value}
                    onPress={() => update({ sortOrder: option.value })}
                  />
                ))}
              </View>
            </View>

            <SettingRow
              icon="text-outline"
              title="Show filenames"
              description="Overlay the filename on each tile"
              value={settings.showFilenames}
              onValueChange={(next) => update({ showFilenames: next })}
            />
            <SettingRow
              icon="pulse-outline"
              title="Haptic feedback"
              value={settings.hapticsEnabled}
              onValueChange={(next) => update({ hapticsEnabled: next })}
            />
          </Card>
        </View>

        <View>
          <SectionLabel>Text in images (optional)</SectionLabel>
          <Card>
            <SettingRow
              icon="scan-outline"
              title="OCR API key"
              description={
                settings.ocrApiKey
                  ? 'Key saved. Open any photo and tap “Read text” to index the words inside it.'
                  : 'Sift works fully offline. Add a free OCR.space key to also search the text inside screenshots.'
              }
              detail={settings.ocrApiKey ? 'Set' : 'Not set'}
              onPress={() => setKeyPromptOpen(true)}
            />
          </Card>
        </View>

        <View>
          <SectionLabel>Data</SectionLabel>
          <Card>
            <SettingRow
              icon="time-outline"
              title="Clear recent searches"
              onPress={async () => {
                await clearRecentSearches();
                invalidate();
              }}
            />
            <SettingRow
              icon="refresh-outline"
              title="Reset preferences"
              description="Theme, grid size and sort order back to defaults"
              onPress={reset}
            />
            <SettingRow
              icon="trash-outline"
              title="Reset index"
              description="Clears indexed photos, tags and collections"
              destructive
              onPress={confirmReset}
            />
          </Card>
        </View>

        <View style={styles.about}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.aboutText}>
            Sift — a local-first image index and search app.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.aboutText}>
            Your photos are never uploaded. The index lives in SQLite on this device.
          </ThemedText>
        </View>
      </ScrollView>

      <PromptModal
        visible={keyPromptOpen}
        title="OCR.space API key"
        description="Free keys are available from ocr.space. Leave empty to switch text extraction off."
        placeholder="K123456789"
        initialValue={settings.ocrApiKey}
        confirmLabel="Save key"
        onCancel={() => setKeyPromptOpen(false)}
        onConfirm={(value) => {
          setKeyPromptOpen(false);
          update({ ocrApiKey: value.trim() });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.four,
  },
  optionBlock: { gap: Spacing.two, paddingVertical: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  about: { alignItems: 'center', gap: 2, paddingTop: Spacing.two },
  aboutText: { textAlign: 'center' },
});
