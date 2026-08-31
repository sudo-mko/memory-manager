/**
 * Search — the reason Sift exists.
 *
 * One field drives the whole query language. Below it, the app shows what it
 * understood, offers the tags it already knows about, and remembers what you
 * searched for last so a useful query is never more than one tap away.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { PhotoGrid } from '@/components/photo-grid';
import { PromptModal } from '@/components/prompt-modal';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SearchField } from '@/components/search-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useClip } from '@/contexts/clip-context';
import { useLibrary } from '@/contexts/library-context';
import { useSettings } from '@/contexts/settings-context';
import type { Photo } from '@/db/photos';
import { listRecentSearches, recordRecentSearch, saveSearch } from '@/db/saved-searches';
import { usePhotoQuery } from '@/hooks/use-photo-query';
import { useSemanticQuery } from '@/hooks/use-semantic-query';
import { useTheme } from '@/hooks/use-theme';
import { describeQuery, freeText, parseQuery } from '@/lib/query-parser';
import { formatCount } from '@/lib/format';

/** Ready-made queries that teach the syntax by example. */
const SUGGESTIONS = [
  'is:screenshot after:2025-01',
  'tag:receipt',
  'is:video is:favorite',
  'w>1500 is:landscape',
  'whatsapp -is:video',
  'is:untagged is:large',
];

/** Plain-language examples, shown only when the text encoder is loaded. */
const MEANING_SUGGESTIONS = [
  'sunset over a field',
  'a document with printed text',
  'a screenshot of an app',
  'photos of people',
  'the ocean at night',
];

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { settings } = useSettings();
  const { userTags, autoTags, visualTags, invalidate } = useLibrary();

  // A deep link (e.g. tapping an automatic tag on a photo) can preload the field.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const linkedQuery = typeof q === 'string' ? q : '';
  const [queryText, setQueryText] = useState(linkedQuery);
  // Adjusting state during render is React's own answer to "reset state when a
  // prop changes" — it avoids the extra commit an effect would cost, and keeps
  // the field editable afterwards.
  const [appliedLink, setAppliedLink] = useState(linkedQuery);
  if (linkedQuery !== appliedLink) {
    setAppliedLink(linkedQuery);
    if (linkedQuery) setQueryText(linkedQuery);
  }
  const [recents, setRecents] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);

  const { canSearchByMeaning, encodedCount } = useClip();
  // Meaning search is the better default once it is available, but only for
  // queries that actually contain words — `is:video after:2024` has nothing to
  // rank semantically.
  const [preferMeaning, setPreferMeaning] = useState(true);

  const parsed = useMemo(() => parseQuery(queryText), [queryText]);
  const phrase = freeText(parsed);
  const smartActive = canSearchByMeaning && preferMeaning && phrase.length > 0;

  const keyword = usePhotoQuery(queryText, settings.sortOrder, { limit: smartActive ? 1 : 600 });
  const semantic = useSemanticQuery(queryText, { enabled: smartActive });

  const photos = smartActive ? semantic.hits.map((hit) => hit.photo) : keyword.photos;
  const total = smartActive ? semantic.hits.length : keyword.total;
  const loading = smartActive ? semantic.loading : keyword.loading;
  const hasQuery = queryText.trim().length > 0;

  // Refresh the recents list whenever the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listRecentSearches()
        .then((rows) => {
          if (!cancelled) setRecents(rows);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const commitSearch = useCallback(async () => {
    if (!queryText.trim()) return;
    await recordRecentSearch(queryText);
    setRecents(await listRecentSearches());
  }, [queryText]);

  const openPhoto = useCallback(
    (photo: Photo) => router.push(`/photo/${encodeURIComponent(photo.id)}`),
    [router]
  );

  const topTags = useMemo(() => {
    // User tags first — they are the ones the person actually chose.
    return [...userTags.slice(0, 8), ...autoTags.slice(0, 12)];
  }, [userTags, autoTags]);

  const header = (
    <View style={styles.header}>
      {hasQuery ? (
        <View style={styles.headerBlock}>
          <View style={styles.resultRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {loading
                ? smartActive
                  ? 'Understanding…'
                  : 'Searching…'
                : `${formatCount(total)} ${total === 1 ? 'result' : 'results'} · ${describeQuery(parsed)}`}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save this search"
              onPress={() => setSaveOpen(true)}
              hitSlop={8}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Save
              </ThemedText>
            </Pressable>
          </View>

          {canSearchByMeaning && phrase ? (
            <View style={styles.modeRow}>
              <Chip
                label="By meaning"
                icon="sparkles"
                selected={preferMeaning}
                onPress={() => setPreferMeaning(true)}
              />
              <Chip
                label="By words"
                icon="text-outline"
                selected={!preferMeaning}
                onPress={() => setPreferMeaning(false)}
              />
            </View>
          ) : null}

          {semantic.error && smartActive ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {semantic.error}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {!hasQuery ? (
        <View style={styles.discovery}>
          {recents.length > 0 ? (
            <Section title="Recent">
              <View style={styles.wrap}>
                {recents.map((recent) => (
                  <Chip
                    key={recent}
                    label={recent}
                    icon="time-outline"
                    onPress={() => setQueryText(recent)}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          {canSearchByMeaning ? (
            <Section title="Describe what you are looking for">
              <View style={styles.wrap}>
                {MEANING_SUGGESTIONS.map((suggestion) => (
                  <Chip
                    key={suggestion}
                    label={suggestion}
                    icon="sparkles"
                    onPress={() => {
                      setPreferMeaning(true);
                      setQueryText(suggestion);
                    }}
                  />
                ))}
              </View>
            </Section>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set up search by meaning"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [
                styles.promo,
                { backgroundColor: theme.accentSoft, opacity: pressed ? 0.75 : 1 },
              ]}>
              <Ionicons name="sparkles" size={18} color={theme.accent} />
              <View style={styles.flex}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Search by meaning
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {encodedCount > 0
                    ? 'Turn on the text encoder in Settings to describe photos in your own words.'
                    : 'Set up on-device CLIP in Settings to find photos by what they show.'}
                </ThemedText>
              </View>
            </Pressable>
          )}

          <Section title="Try a query">
            <View style={styles.wrap}>
              {SUGGESTIONS.map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  icon="options-outline"
                  onPress={() => setQueryText(suggestion)}
                />
              ))}
            </View>
          </Section>

          {visualTags.length > 0 ? (
            <Section title="Recognised in your photos">
              <View style={styles.wrap}>
                {visualTags.slice(0, 14).map((tag) => (
                  <Chip
                    key={tag.name}
                    label={tag.name}
                    icon="sparkles"
                    count={tag.count}
                    onPress={() => setQueryText(`tag:${tag.name}`)}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          {topTags.length > 0 ? (
            <Section title="Tags from filenames and dates">
              <View style={styles.wrap}>
                {topTags.map((tag) => (
                  <Chip
                    key={tag.name}
                    label={tag.name}
                    count={tag.count}
                    onPress={() => setQueryText(`tag:${tag.name}`)}
                  />
                ))}
              </View>
            </Section>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <ScreenHeader
        title="Search"
        subtitle="Words, tags, dates, dimensions — all in one field"
        action={
          <IconButton
            name="help-circle-outline"
            accessibilityLabel="Search syntax help"
            onPress={() => router.push('/query-help')}
          />
        }
      />

      <View style={styles.fieldWrapper}>
        <SearchField value={queryText} onChangeText={setQueryText} onSubmit={commitSearch} />
      </View>

      <PhotoGrid
        photos={hasQuery ? photos : []}
        columns={settings.gridColumns}
        loading={hasQuery && loading}
        showFilenames={settings.showFilenames}
        onPressPhoto={openPhoto}
        ListHeaderComponent={header}
        ListEmptyComponent={
          hasQuery && !loading ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              message={`Nothing in the index matches “${queryText.trim()}”. Check the syntax, or widen the query by removing a filter.`}
              actionLabel="Clear search"
              onAction={() => setQueryText('')}
            />
          ) : null
        }
      />

      <PromptModal
        visible={saveOpen}
        title="Save this search"
        description={queryText}
        placeholder="Name it, e.g. Receipts 2025"
        confirmLabel="Save"
        onCancel={() => setSaveOpen(false)}
        onConfirm={async (name) => {
          setSaveOpen(false);
          await saveSearch(name || queryText, queryText);
          invalidate();
        }}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name="chevron-forward" size={13} color="#8A8F9C" />
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title}
        </ThemedText>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrapper: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  header: { gap: Spacing.three },
  headerBlock: { gap: Spacing.two, paddingBottom: Spacing.two },
  modeRow: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.one },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  flex: { flex: 1 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.one },
  discovery: { gap: Spacing.four, paddingTop: Spacing.one },
  section: { gap: Spacing.two },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
