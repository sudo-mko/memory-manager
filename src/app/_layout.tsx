/**
 * Root layout.
 *
 * Providers wrap a native stack; the tab bar itself lives in `(tabs)/_layout`,
 * so pushing a detail screen covers the tabs the way it does in every native
 * photo app.
 */

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/theme';
import { ClipProvider } from '@/contexts/clip-context';
import { LibraryProvider } from '@/contexts/library-context';
import { SettingsProvider, useSettings } from '@/contexts/settings-context';
import { useColorSchemeName } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden — nothing to do.
});

/** Inner shell: needs to be a child of the providers to read the theme. */
function RootNavigator() {
  const scheme = useColorSchemeName();
  const palette = Colors[scheme];
  const { ready } = useSettings();

  // Hold the splash until preferences are loaded so the app never flashes the
  // wrong theme on launch.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  const navigationTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      primary: palette.accent,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.border,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: palette.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="photo/[id]"
          options={{ title: '', headerTransparent: true, animation: 'fade' }}
        />
        <Stack.Screen name="collection/[id]" options={{ title: 'Collection' }} />
        <Stack.Screen name="duplicates" options={{ title: 'Duplicates' }} />
        <Stack.Screen name="similar/[id]" options={{ title: 'Similar photos' }} />
        <Stack.Screen name="insights" options={{ title: 'Insights' }} />
        <Stack.Screen name="query-help" options={{ title: 'Search syntax', presentation: 'modal' }} />
        <Stack.Screen
          name="smart-search-help"
          options={{ title: 'Smart search', presentation: 'modal' }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider>
        <LibraryProvider>
          <ClipProvider>
            <RootNavigator />
          </ClipProvider>
        </LibraryProvider>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}
