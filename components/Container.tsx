/**
 * Content measure — port of `.app-container` / `.app-container-chat`:
 *
 *   width: 100%; max-width: 64rem (48rem for chat); margin-inline: auto;
 *   padding-inline: clamp(1rem, 10vw, 4rem);
 *
 * The old site centres every screen's content inside one of these two, which
 * is what keeps the app from running edge-to-edge on a wide window. Screens
 * wrap their sections in it rather than setting their own horizontal padding.
 */
import React, { type ReactNode } from 'react';
import { View, useWindowDimensions, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';

export default function Container({
  children,
  chat = false,
  style,
}: {
  children: ReactNode;
  /** Use the narrower 48rem chat measure. */
  chat?: boolean;
  style?: ViewStyle;
}) {
  const { layout } = useTheme();
  const { width } = useWindowDimensions();

  return (
    <View
      style={[
        {
          width: '100%',
          maxWidth: chat ? layout.chatMaxWidth : layout.containerMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter(width),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
