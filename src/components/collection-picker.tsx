import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useLibrary } from '@/contexts/library-context';
import { useTheme } from '@/hooks/use-theme';

type CollectionPickerProps = {
  visible: boolean;
  /** Collections the photo is already in, so they render as ticked. */
  memberOf?: number[];
  onClose: () => void;
  onSelect: (collectionId: number) => void;
  onCreateNew: () => void;
};

/** Bottom sheet for filing photos into a collection. */
export function CollectionPicker({
  visible,
  memberOf = [],
  onClose,
  onSelect,
  onCreateNew,
}: CollectionPickerProps) {
  const theme = useTheme();
  const { collections } = useLibrary();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss" onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <ThemedText style={styles.title}>Add to collection</ThemedText>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a new collection"
              onPress={onCreateNew}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
              <View style={[styles.iconCircle, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="add" size={18} color={theme.accent} />
              </View>
              <ThemedText style={[styles.rowLabel, { color: theme.accent }]}>New collection</ThemedText>
            </Pressable>

            {collections.map((collection) => {
              const isMember = memberOf.includes(collection.id);
              return (
                <Pressable
                  key={collection.id}
                  accessibilityRole="button"
                  accessibilityLabel={collection.name}
                  accessibilityState={{ selected: isMember }}
                  onPress={() => onSelect(collection.id)}
                  style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
                  <View style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons
                      name={collection.icon as keyof typeof Ionicons.glyphMap}
                      size={17}
                      color={theme.textSecondary}
                    />
                  </View>
                  <View style={styles.rowText}>
                    <ThemedText style={styles.rowLabel}>{collection.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {collection.count} {collection.count === 1 ? 'photo' : 'photos'}
                    </ThemedText>
                  </View>
                  {isMember ? <Ionicons name="checkmark-circle" size={20} color={theme.accent} /> : null}
                </Pressable>
              );
            })}

            {collections.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                You have no collections yet. Create one to group photos across albums.
              </ThemedText>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
  },
  grabber: { width: 40, height: 4, borderRadius: Radius.pill, alignSelf: 'center', marginBottom: Spacing.three },
  title: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two },
  list: { flexGrow: 0 },
  listContent: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  iconCircle: { width: 36, height: 36, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  hint: { paddingVertical: Spacing.three },
});
