# Fontes

As fontes do manual de identidade visual do Turing USP (2021), do Google
Fonts (licença OFL, nos arquivos `*-OFL.txt`):

| Arquivo | Uso (`fonts` em `theme/index.tsx`) |
|---|---|
| `Changa-Medium.ttf` | títulos, botões e navegação (`title`) |
| `MPLUS1p-Regular.ttf`, `MPLUS1p-Bold.ttf` | texto (`body`, `bodyBold`) |
| `RobotoMono-Regular.ttf` | código e detalhes (`mono`) |

A Orbitron do manual é exclusiva do logotipo do Turing, que o app desenha
em SVG (`TuringWordmark`), então não entra aqui.

Os arquivos são subconjuntos (o M PLUS 1p completo tem 1,7 MB por peso, por
causa do japonês): latim, grego, pontuação, moedas, setas, operadores
matemáticos e símbolos. Um caractere fora deles cai na fonte do sistema.
Gerados com o `pyftsubset` do fontTools, a partir dos TTF estáticos dos
pacotes `@expo-google-fonts/*`:

```sh
pyftsubset ORIGEM.ttf --layout-features='*' --recalc-average-width --output-file=DESTINO.ttf \
  --unicodes="U+0020-007E,U+00A0-00FF,U+0100-024F,U+0300-036F,U+0370-03FF,U+2000-206F,U+20A0-20CF,U+2100-218F,U+2190-21FF,U+2200-23FF,U+2460-24FF,U+2500-257F,U+25A0-27BF,U+FB00-FB06,U+FFFD"
```

- `--recalc-average-width`: o navegador calcula a largura de um `<input>`
  pela largura média da fonte; com a do japonês, os campos ficavam largos
  demais.
- No M PLUS 1p, as reticências (U+2026) são o glifo japonês, centralizado
  na altura; nos dois pesos ele foi trocado por três pontos de base (um
  glifo composto do ponto final), para o texto truncado terminar em "...".
