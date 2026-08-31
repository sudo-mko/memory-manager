/** Explains what smart search does, what it costs, and where the limits are. */

import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, SectionLabel } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What it does',
    body: [
      'CLIP is a model from OpenAI trained on hundreds of millions of image and caption pairs. It learned to place a picture and a sentence describing it close together in the same 512-dimensional space.',
      'Sift uses that twice: to work out what each photo shows, and to turn a sentence you type into a point in the same space so the nearest photos can be found.',
    ],
  },
  {
    title: 'What runs where',
    body: [
      'Both encoders run on this device through ExecuTorch. No photo and no search phrase is ever uploaded.',
      'The models are downloaded once from Hugging Face. After that, smart search works with the device offline.',
    ],
  },
  {
    title: 'Two parts, two sizes',
    body: [
      'Visual recognition (92 MB) reads your photos. It gives every photo its visual tags and powers “Find similar”. The tag vocabulary itself ships inside the app, so this half is useful on its own.',
      'Searching in your own words (244 MB) is only needed to encode what you type. It is a separate download because it is much larger and many people will not need it.',
    ],
  },
  {
    title: 'How search combines the two',
    body: [
      'Operators still filter, and your words rank what is left. So “beach is:favorite after:2024-06” means: of your favourites since June 2024, the ones that most look like a beach.',
      'You can always switch back to matching words literally with the toggle above the results.',
    ],
  },
  {
    title: 'Where it gets things wrong',
    body: [
      'Visual tags come from a fixed vocabulary of 113 concepts, so anything outside it will not be tagged — though searching in your own words is not restricted that way.',
      'CLIP judges the picture as a whole. A small object in a busy scene is easy for it to miss, and it cannot read faces, names or dates.',
      'Tags are suggestions. Your own tags always take priority and are never overwritten.',
    ],
  },
];

export default function SmartSearchHelpScreen() {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: theme.background }}>
      {SECTIONS.map((section) => (
        <View key={section.title}>
          <SectionLabel>{section.title}</SectionLabel>
          <Card style={styles.card}>
            {section.body.map((paragraph) => (
              <ThemedText key={paragraph} type="small" themeColor="textSecondary">
                {paragraph}
              </ThemedText>
            ))}
          </Card>
        </View>
      ))}

      <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
        Model: openai/clip-vit-base-patch32 · 512-dimensional embeddings · runs via ExecuTorch
      </ThemedText>
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
  card: { gap: Spacing.two },
  footnote: { textAlign: 'center', paddingTop: Spacing.two },
});
