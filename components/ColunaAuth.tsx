/**
 * The auth screens' shared shell: a keyboard-aware scroll area with a single
 * centred column, matching the old site's `w-full max-w-md` login card.
 *
 * All three auth routes used to build this themselves and drifted: login had
 * `maxWidth` but no `alignSelf`, so on a wide window its column sat pinned to
 * the left edge instead of centred, while register and reset had no column at
 * all and stretched the full viewport. Sharing the shell makes the three
 * screens line up by construction.
 */
import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

/** Old site column width (`max-w-md`). */
export const LARGURA_COLUNA = 448;

export default function ColunaAuth({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          // `alignItems` centres the column horizontally; `justifyContent`
          // keeps it vertically centred on tall windows.
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.xl,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            alignItems: 'stretch',
            maxWidth: LARGURA_COLUNA,
            width: '100%',
          }}
        >
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
