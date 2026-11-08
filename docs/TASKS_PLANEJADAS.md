# Tasks planejadas — Explorador do Sistema Solar

Referência de qualidade: Titans of Space (presença e escala em VR), NASA Eyes
(fidelidade de dados), SpaceEngine (atmosfera, Sol, céu), Solar System Scope
(clareza do card).

Dispositivo-alvo: celular no VR Box / Cardboard, **60 fps no celular**. Desktop
e headset standalone não são otimizados nesta fase.

Ordem definida: **Fase 1 Fundação → Fase 2 Jornada terrestre → Fase 3 Céu e Sol**.
Cada fase só começa depois da anterior validada no celular.

---

## Fase 1 — Fundação

| ID | Task | Depende de | Estimativa | Status |
|---|---|---|---|---|
| T00 | Medidor de desempenho (dev) | — | 30min | ✅ Concluído |
| T01 | Modelo de escala único | T00 | 2h30 | ✅ Concluído (13 testes) |
| T02 | Iluminação solar correta | T01 | 1h30 | ⚠️ Escrito, visual não verificado |
| T03 | Centralização de cena e precisão numérica | T01 | 2h (opção A escolhida) | ⚠️ Escrito, visual não verificado |
| T04 | Câmera em VR e entrada | T03 | 2h | ⚠️ Escrito, não testado em VR |
| T05 | Teste no celular via USB | T04 | 30min | ⏳ Depende do Diego com o celular |

### T00 — Medidor de desempenho (dev)
Sem medição não há como afirmar 60 fps. Overlay só em `import.meta.env.DEV`:
FPS, ms por quadro, draw calls, triângulos e texturas (`renderer.info`). Sem
dependência nova.
- Arquivos: `src/core/perfOverlay.ts` (novo), `src/main.ts`

### T01 — Modelo de escala único
Problema: no modo Visual o Sol (raio 13,9) engole Mercúrio (1,16), Vênus, Terra
e Marte (4,56). Raio e distância usam fatores arbitrários, repetidos em 5
arquivos.

Modelo proposto, no padrão Titans of Space:
- **Visual** — tamanhos com proporção real entre si (um fator só para todos os
  corpos, Sol incluído; Terra = 1 unidade, Sol ≈ 109). Distâncias comprimidas
  por função monotônica que garante cada órbita fora do Sol e sem
  sobreposição entre vizinhos (incluindo anéis). Luas com distância relativa
  ao raio do planeta-mãe, sempre fora dele e dos anéis
- **Real** — raio e distância na mesma escala verdadeira. Unidade = raio da
  Terra (6.371 km) nos dois modos — o modo muda só a distância
- Exoplanetas saem do hub (estão a anos-luz; não cabem em nenhuma das duas
  escalas). Dados preservados em `corpos.json` para um destino próprio futuro
- Todo código de escala passa por `src/utils/scale.ts`. `body.ts`, `hub.ts`,
  `belt.ts`, `trajectory.ts` deixam de ter constantes próprias
- Testes unitários das funções de escala (Vitest, dependência de dev):
  nenhum planeta dentro do Sol, ordem das órbitas preservada, luas fora do
  planeta e dos anéis, nos dois modos
- Arquivos: `src/utils/scale.ts`, `src/core/body.ts`, `src/scenes/hub.ts`,
  `src/core/belt.ts`, `src/core/trajectory.ts`, `src/main.ts`,
  `src/utils/scale.test.ts` (novo), `package.json`

### T02 — Iluminação solar correta
Problemas: a luz direcional está em (0,0,0) apontando para (0,0,0) — sem
direção. `sunDir` é fixo em (1,0,0). Os shaders da Terra e da atmosfera misturam
normal em coordenadas de câmera com direção do Sol em coordenadas de mundo — o
dia/noite gira junto com a câmera. O HDR de ambiente ilumina o lado noturno.
- `PointLight` no Sol, `decay = 0` (luz não enfraquece com a distância — senão
  os planetas externos ficam pretos; mesma licença artística do Titans)
- Sem sombra no espaço: sombra de luz pontual renderiza a cena 6 vezes por
  quadro, inviável a 60 fps no celular. Eclipses ficam para depois, se valer
- Direção do Sol calculada por corpo a cada quadro (posição do corpo → Sol)
- Shaders da Terra e atmosfera em coordenadas de mundo
- HDR de ambiente desligado no espaço (lado noturno escuro, como SpaceEngine).
  Mantido na base terrestre (Fase 2)
- `MeshPhysicalMaterial` → `MeshStandardMaterial` (clearcoat custa caro no
  celular e não aparece a essa distância)
- Arquivos: `src/core/lighting.ts`, `src/core/body.ts`, `src/shaders/earth.ts`,
  `src/shaders/atmosphere.ts`, `src/scenes/hub.ts`, `src/scenes/planet.ts`,
  `src/main.ts`

### T03 — Centralização de cena e precisão numérica
Problema: na cena de planeta, `update()` recoloca o planeta na distância
orbital todo quadro; a câmera olha para a origem vazia. Em escala real, a
precisão de float32 a milhões de unidades faz a geometria tremer.

- **Opção A (recomendada) — origem flutuante no mundo contínuo.** Abandona a
  troca para `PlanetScene`. O mundo inteiro é deslocado para que o corpo em
  foco fique sempre na origem. Resolve centralização, resolve precisão em
  escala real e é a base do "mundo contínuo" do Titans — a viagem até o
  planeta deixa de ser corte de cena. `near`/`far` da câmera ajustados pelo
  foco (sem `logarithmicDepthBuffer`, que custa caro no celular).
  Os astronautas que hoje aparecem em volta do planeta passam a ser
  posicionados em volta do corpo em foco
- **Opção B — correção pontual.** Mantém `PlanetScene` e congela a órbita do
  corpo dentro dela. Resolve só a centralização. Precisão em escala real e
  corte de cena continuam
- Nas duas: `dispose()` completo (campo de estrelas, atmosfera, anéis, luas,
  astronautas, luz) — hoje cada visita a planeta vaza memória de GPU
- Arquivos (A): `src/main.ts`, `src/scenes/hub.ts`, `src/core/body.ts`,
  `src/core/engine.ts`, `src/scenes/planet.ts` (removido ou reduzido)
- Arquivos (B): `src/scenes/planet.ts`, `src/core/body.ts`, `src/main.ts`

### T04 — Câmera em VR e entrada
Problemas: em sessão WebXR o Three.js sobrescreve a posição da câmera com a
pose do headset — as transições atuais não movem o usuário em VR. A câmera não
está na cena, então o anel de mira (filho dela) nunca é desenhado. `touchend` e
`click` disparam juntos no celular; soltar o dedo após girar a câmera seleciona.
- Rig de câmera (`THREE.Group` com a câmera dentro, adicionado à cena). Todo
  deslocamento move o rig. `OrbitControls` só fora do VR
- Transição confortável para VR: velocidade suave, sem rotação forçada do
  rig, fade para preto curto em saltos longos
- Seleção por `pointerdown`/`pointerup` com limiar de movimento — um handler
  só para mouse e toque; arrastar não seleciona
- Arquivos: `src/core/engine.ts`, `src/scenes/transitions.ts`,
  `src/xr/xrManager.ts`, `src/main.ts`

### T05 — Teste no celular via HTTPS
WebXR (e o Gamepad API no Chrome) exigem contexto seguro. Pelo IP da rede
(`http://192.168.0.12:5175`) o botão VR não aparece no celular.
- Opção sem dependência: depuração USB + encaminhamento de porta no
  `chrome://inspect` — o celular acessa `localhost`
- Opção com dependência: `@vitejs/plugin-basic-ssl` (certificado autoassinado)
- Arquivos: nenhum (opção USB) ou `vite.config.ts`, `package.json`

---

## Fase 2 — Jornada terrestre (detalhar após Fase 1)

Base terrestre como abertura narrativa, não modo secundário:
base → carro ou a pé até o controle de missão → treinamento (quiz) →
contagem regressiva → lançamento → câmera acompanha a subida → transição
para o espaço. Quiz, certificado e progresso viram etapas da jornada.

- Narração isolada em módulo próprio (`narrate(id)`), hoje com Web Speech API,
  pronta para apontar para arquivos de áudio estáticos depois
- Interface dentro da cena (painéis 3D) — o HUD em HTML não aparece em VR
- Corrigir gravação do quiz (Fácil/Médio separados; erro não apaga acerto)

## Fase 3 — Céu e Sol (detalhar após Fase 2)

- Via Láctea panorâmica (domínio público, NASA Deep Star Maps) + estrelas
  brilhantes de catálogo real (HYG)
- Brilho do Sol por sprites (bloom de pós-processamento é caro demais para
  VR no celular)
- Posições reais dos planetas na data atual (elementos orbitais aproximados
  do JPL), órbitas com inclinação e excentricidade
- Atmosfera com espalhamento (Rayleigh/Mie simplificado)

---

## Pendências de configuração

- ✅ `tsconfig.node.json` com `outDir` em `node_modules/.tmp` — `vite.config.js`
  não volta mais para a raiz
- ⚠️ Vite 5 e Vitest 3.2.7 com vulnerabilidades conhecidas (dev). Correção
  completa exige Vite 7+/Vitest 4+ — task própria, a planejar
