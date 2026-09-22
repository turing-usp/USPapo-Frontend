/** Admin group: web only (the backend authorizes each request by the Perfis.uspapo_role = admin). */
import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { Backdrop } from '../../components/Cena';

export default function LayoutAdmin() {
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return (
    <>
      <Backdrop />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </>
  );
}
