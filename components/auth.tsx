/** Small pieces shared by the auth screens. */
import React from 'react';
import { Pressable, View } from 'react-native';

import { Icone } from './icons';
import { Texto } from './ui';
import { REGRAS_DE_SENHA } from '../lib/auth';
import { useTheme } from '../theme';

export function Divisor() {
  const { colors, spacing } = useTheme();
  const linha = { flex: 1, height: 1, backgroundColor: colors.line, opacity: 0.15 };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={linha} /><Texto v="suave">OU</Texto><View style={linha} />
    </View>
  );
}

export function OlhoDaSenha({ visivel, alternar }: { visivel: boolean; alternar: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={alternar} hitSlop={8} accessibilityLabel={visivel ? 'Ocultar senha' : 'Mostrar senha'}>
      <Icone nome={visivel ? 'olhoFechado' : 'olho'} cor={colors.mutedForeground} />
    </Pressable>
  );
}

export function RegrasDeSenha({ senha }: { senha: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4, paddingHorizontal: 8 }}>
      {REGRAS_DE_SENHA.map(([rotulo, ok]) => (
        <View key={rotulo} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icone nome={ok(senha) ? 'check' : 'fechar'} cor={ok(senha) ? colors.success : colors.faintForeground} tamanho={14} traco={2.2} />
          <Texto v="legenda" cor={ok(senha) ? colors.foreground : undefined}>{rotulo}</Texto>
        </View>
      ))}
    </View>
  );
}
