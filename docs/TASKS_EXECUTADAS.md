# Tasks executadas

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
