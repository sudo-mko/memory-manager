import { StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = ViewProps & {
  /** Which safe-area edges to pad. Screens under a stack header omit `top`. */
  edges?: Edge[];
};

/** Themed page container that centres content on wide screens (tablet/web). */
export function Screen({ children, style, edges = ['top'], ...rest }: ScreenProps) {
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]} {...rest}>
      <SafeAreaView edges={edges} style={styles.safe}>
        <View style={[styles.content, style]}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, alignItems: 'center' },
  content: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
});
