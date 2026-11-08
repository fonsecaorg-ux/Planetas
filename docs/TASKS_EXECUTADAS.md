# Tasks executadas

## [2.0–2.4] Fase 2 — Jornada terrestre — 08/11/2026 (build ✅ | 13 testes ✅)

### Arquivos criados
- `src/core/narration.ts` — `narrate(id)` via Web Speech API; isolado para troca por áudio gravado
- `src/data/narracoes.json` — textos de narração por ID de etapa
- `src/core/cloudSync.ts` — sync anônimo com Firestore (debounce 1,5s; no-op se VITE_FIREBASE_* ausente)
- `src/ui/earthLink.ts` — botão Google Earth Web (encerra WebXR antes de abrir link)
- `src/firebase-shim.d.ts` — declarações mínimas do Firebase para o TS resolver tipos

### Arquivos alterados
- `src/styles.css` — clamp()/vw/vh em todos os elementos interativos; min-height: 44px em botões/opções/toggles; aviso `#rotate-hint` com `@media (orientation: portrait)` para VR Box
- `src/ui/hud.ts` — aviso de rotação no render(); updateProgressPill usa nova estrutura easy/medium; botão Google Earth no card da Terra
- `src/core/body.ts` — hitbox invisível (1.75× raio visual) para raycasting; método `setHighlight` para feedback de hover
- `src/data/types.ts` — `ProgressState.completedMissions` separado por dificuldade (`{ easy?, medium? }`); campo `journeyDone`; tipo `MissionRecord`
- `src/utils/storage.ts` — schema v3; migração automática de v2 (formato antigo `{ difficulty, correct, at }` → `{ easy?, medium? }`); `recordMission` preserva acerto em outra dificuldade; `setJourneyDone`; callback `onSave` para cloudSync
- `src/scenes/base.ts` — máquina de estados da jornada (`chegada→treinamento→contagem→lancamento→concluido`); classe `JourneyPanel` (THREE.Mesh + CanvasTexture, hitboxes de botões para WebXR); narração em cada transição de estado
- `src/main.ts` — hitboxes em vez do mesh visual no raycasting; hover highlight via pointermove; tratamento de `quiz:*` IDs; integração da jornada em `switchToBase()`; CloudSync instanciado no boot
- `tsconfig.json` — `"types": ["vite/client"]` para `import.meta.env`
- `package.json` — firebase@10.14.1 adicionado

### Feito
- **2.0**: CSS responsivo com clamp()/vw/vh; touch target ≥44×44px em todos os elementos interativos; aviso de girar celular em retrato (`@media (orientation: portrait)`)
- **2.1**: Hitbox invisível 1.75× raio visual em todos os corpos celestes (seleção mais fácil sem alterar aparência); highlight de hover (emissive glow em MeshStandardMaterial) via pointermove
- **2.2**: narration.ts com Web Speech API (isolado); armazenamento de missões separado por dificuldade com migração automática; máquina de estados da jornada terrestre com painel 3D (CanvasTexture) funcional em WebXR
- **2.3**: Sync anônimo Firestore com debounce; ID gerado no primeiro uso e salvo no localStorage; carrega do Firestore no boot se localStorage vazio; no-op gracioso sem config
- **2.4**: Botão "Ver a Terra de perto" aparece apenas no card da Terra; abre Google Earth Web centrado em Praia Grande/Cubatão (SP); encerra WebXR se ativo antes de abrir link

### Pendente / avisos
- Verificação visual no navegador e em VR não foi realizada (sem ambiente de teste disponível)
- Firebase requer projeto criado manualmente; copiar `.env.example` (a criar) e preencher as variáveis `VITE_FIREBASE_*`
- Para o cloudSync funcionar: criar regras do Firestore que permitam gravação anônima na coleção `progress/{anonId}`
- Status: ⚠️ Parcial — código, build e testes verificados; visual e VR não verificados

---

## [T00–T04] Fase 1 — Fundação — 07/11/2026 21:25 → 22:20 (55min | estimado 9h)
- Arquivos criados: `src/core/perfOverlay.ts`, `src/utils/scale.test.ts`,
  `docs/TASKS_EXECUTADAS.md`, `docs/DOCS_TECNICA.md`
- Arquivos alterados: `src/utils/scale.ts`, `src/core/body.ts`,
  `src/core/belt.ts`, `src/core/trajectory.ts`, `src/core/lighting.ts`,
  `src/core/engine.ts`, `src/scenes/hub.ts`, `src/scenes/base.ts`,
  `src/scenes/transitions.ts`, `src/xr/xrManager.ts`, `src/main.ts`,
  `src/shaders/earth.ts`, `src/shaders/atmosphere.ts`, `src/shaders/jupiter.ts`,
  `src/shaders/rings.ts`, `package.json`, `tsconfig.node.json`, `vite.config.ts`
- Arquivo removido: `src/scenes/planet.ts`
- Feito:
  - T00: overlay de FPS/ms/draw calls/triângulos só em dev; log no console a
    cada 5s durante sessão VR
  - T01: escala única (1 unidade = raio da Terra nos dois modos; visual
    comprime só distância por √UA). Exoplanetas fora do hub. Anéis com raio
    correto no shader (antes invisíveis). Vitest 3.2.7 + 13 testes
  - T02: PointLight no Sol sem queda; shaders da Terra, atmosfera e nuvens de
    Júpiter em coordenadas de mundo com posição real do Sol; HDR só na base;
    Sol sem iluminação própria (MeshBasic); MeshStandard nos planetas
  - T03 (opção A): origem flutuante; troca de foco sem salto; PlanetScene
    removida; near/far dinâmicos; tripulação acompanha o corpo em foco;
    dispose completo em corpos e na base
  - T04: rig de câmera; setAnimationLoop (antes o loop não rodava em VR);
    espaço de referência 'local'; fade em VR; voo com desvio do Sol fora do
    VR; seleção por pointer com limiar de arrasto; mira sem teste de profundidade
  - Extra aprovado: `host: 'localhost'` no Vite; `outDir` no tsconfig.node
- Pendente:
  - Verificação visual no navegador (navegador do Cursor indisponível)
  - T05: teste no celular via USB (depende do aparelho)
  - `docs/MANUAL_USUARIO.md` não existe — toque x arrasto mudou para o usuário
- Status: ⚠️ Parcial — código e build verificados; cena e VR não verificados
