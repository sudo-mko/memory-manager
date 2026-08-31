/** Reference sheet for the search language, reachable from the Search tab. */

import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, SectionLabel } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SECTIONS: { title: string; rows: { syntax: string; meaning: string }[] }[] = [
  {
    title: 'Text',
    rows: [
      { syntax: 'beach sunset', meaning: 'Both words must appear somewhere' },
      { syntax: '"family dinner"', meaning: 'Exact phrase' },
      { syntax: '-whatsapp', meaning: 'Exclude anything matching' },
    ],
  },
  {
    title: 'Tags and albums',
    rows: [
      { syntax: 'tag:receipts', meaning: 'Has that tag (yours or automatic)' },
      { syntax: '-tag:meme', meaning: 'Does not have that tag' },
      { syntax: 'album:Camera', meaning: 'Lives in that device album' },
    ],
  },
  {
    title: 'Smart flags',
    rows: [
      { syntax: 'is:screenshot', meaning: 'Detected as a screenshot' },
      { syntax: 'is:selfie · is:video · is:photo', meaning: 'By kind' },
      { syntax: 'is:favorite · is:untagged', meaning: 'By your own marks' },
      { syntax: 'is:portrait · is:landscape · is:square · is:panorama', meaning: 'By shape' },
      { syntax: 'is:large · is:text', meaning: '8MP or more · has extracted text' },
    ],
  },
  {
    title: 'Dates',
    rows: [
      { syntax: 'after:2024-01', meaning: 'On or after January 2024' },
      { syntax: 'before:2025-03-01', meaning: 'Before 1 March 2025' },
      { syntax: 'year:2024 · month:2024-05', meaning: 'Within that whole period' },
    ],
  },
  {
    title: 'Numbers',
    rows: [
      { syntax: 'w>2000', meaning: 'Wider than 2000 pixels' },
      { syntax: 'h<=500', meaning: 'No taller than 500 pixels' },
      { syntax: 'size>5mb', meaning: 'Larger than 5 MB' },
    ],
  },
];

export default function QueryHelpScreen() {
  const theme = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: theme.background }}>
      <ThemedText type="small" themeColor="textSecondary">
        Operators combine with AND. Anything Sift does not recognise is treated as
        plain text, so a malformed query still returns results instead of an error.
      </ThemedText>

      {SECTIONS.map((section) => (
        <View key={section.title}>
          <SectionLabel>{section.title}</SectionLabel>
          <Card>
            {section.rows.map((row) => (
              <View key={row.syntax} style={styles.row}>
                <ThemedText type="code" style={[styles.syntax, { color: theme.accent }]}>
                  {row.syntax}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.meaning}
                </ThemedText>
              </View>
            ))}
          </Card>
        </View>
      ))}

      <View>
        <SectionLabel>Put together</SectionLabel>
        <Card>
          <ThemedText type="code" style={{ color: theme.accent }}>
            is:screenshot after:2025-01 -tag:meme w&gt;1000
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Screenshots taken this year, at least 1000px wide, that you have not
            tagged as memes.
          </ThemedText>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  row: { gap: 2, paddingVertical: Spacing.one },
  syntax: { fontSize: 13 },
});
