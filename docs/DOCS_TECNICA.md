# Documentação técnica — Explorador do Sistema Solar

Three.js r160 + TypeScript + Vite 5. Estático, sem backend. Alvo: celular no
VR Box / Cardboard a 60 fps.

## Comandos

```bash
npm run dev     # http://localhost:5173 (só localhost)
npm test        # Vitest — testes da escala
npm run build   # tsc -b + vite build → dist/
```

## Escala (`src/utils/scale.ts`)

Fonte única de conversão km → unidades de cena. Nenhum outro arquivo tem
constante de escala própria.

- **Tamanho**: 1 unidade = raio da Terra (6.371 km), igual nos dois modos.
  Proporção real entre todos os corpos (Sol ≈ 109, Júpiter ≈ 11). Piso de
  0,05 só para luas minúsculas. Em VR, 1 unidade = 1 metro
- **Distância modo real**: km / 6.371. Netuno ≈ 706 mil unidades
- **Distância modo visual**: `109,3 + 20 + 150·√UA`. Mercúrio ≈ 223,
  Terra ≈ 279, Netuno ≈ 952, Éris ≈ 1.362
- **Luas modo visual**: `raioPai · (1,5 + 0,6·√(dist/raioPai))`
- Anéis: 1,4–2,3 raios (finos: 1,3–1,7), constantes exportadas

`scale.test.ts` garante nos dois modos: nenhum sistema dentro do Sol, ordem
das órbitas preservada, vizinhos sem sobreposição, luas fora do planeta e dos
anéis. Mudou constante, rode `npm test`.

## Mundo contínuo e origem flutuante (`src/scenes/hub.ts`)

Uma cena só para o espaço. `hub.group` é deslocado a cada quadro para que o
corpo em foco fique em (0,0,0):

- Câmera sempre centrada no planeta, sem troca de cena
- Precisão: posições de milhões de unidades viram coordenadas pequenas perto
  do observador (matrizes calculadas em double no JS)
- `trocarFoco()` em `main.ts` desloca o observador junto com o mundo — a
  troca não causa salto na tela

Ordem no loop: `hub.update()` → `hub.applyFloatingOrigin()` → near/far → estrelas.

Limitação conhecida: linhas de órbita e cinturões têm vértices em coordenadas
grandes; em escala real, longe da origem, podem tremer levemente.

## Iluminação (`src/core/lighting.ts`)

- Espaço: `PointLight` no Sol, `decay = 0`, sem sombra. Ambiente 0,06
- Base terrestre: `DirectionalLight` com sombra 1024 + `HemisphereLight` + HDR
  (`env.hdr`) como environment
- Shaders customizados (Terra, atmosfera, nuvens de Júpiter) recebem `uSunPos`,
  vetor compartilhado escrito por `applyFloatingOrigin()`. Cálculo em
  coordenadas de mundo

## Câmera e VR (`src/core/engine.ts`, `src/main.ts`)

- `engine.rig` (Group) contém a câmera. Fora do VR fica na origem e o
  OrbitControls move a câmera. Em VR, todo deslocamento move o rig
- Loop via `renderer.setAnimationLoop` (obrigatório para WebXR)
- Espaço de referência `local` (cabeça na origem do rig)
- `posicionarObservador()` / `viajar()` abstraem os dois modos:
  fora do VR voo em Bézier com desvio do Sol; em VR fade 0,3s → reposiciona →
  fade, só com guinada (sem inclinar o rig)
- Near/far: near = 10% da distância à superfície mais próxima (0,01–1000);
  far = distância ao foco + 1,2 × extensão da cena. Só reaplica se mudar >25%
  (evita `updateRenderState` por quadro em VR)
- Seleção: `pointerdown`/`pointerup` com limiar de 8 px; arrastar não seleciona.
  Em VR: mira (gaze 1,8s) ou botão 0 do gamepad Bluetooth

## Desempenho

`src/core/perfOverlay.ts` — só em dev. FPS, ms, pior quadro, draw calls,
triângulos, geometrias, texturas. Em VR o resumo vai ao console a cada 5s
(ver pelo `chrome://inspect`).

## Teste no celular

WebXR e Gamepad API exigem contexto seguro. O servidor de dev só escuta em
localhost:

1. Ativar depuração USB no Android e conectar o cabo
2. No Chrome do PC: `chrome://inspect` → Port forwarding → `5173` → `localhost:5173`
3. No Chrome do celular: `http://localhost:5173`

## Dependências e vulnerabilidades conhecidas

- Vite 5.4 e Vitest 3.2.7 têm vulnerabilidades publicadas (servidor de dev e
  `tinypool`). Mitigação: dev só em localhost; Vitest só com `vitest run`,
  nunca com UI. Correção completa: Vite 7+ / Vitest 4+
- O build de produção (estático) não inclui nenhuma dessas dependências
