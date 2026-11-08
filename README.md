# Explorador do Sistema Solar

Simulação espacial imersiva do sistema solar, construída com **Three.js + TypeScript + Vite**. Projetada para durar: arquitetura modular, dados versionáveis, extensível para exoplanetas, missões históricas e multiplayer local.

## Visão

Não é um app educativo genérico. É uma simulação com rigor visual e físico (escalas, texturas, iluminação, sombras) que impressiona tanto uma criança de 9 anos quanto ela mesma aos 19. Prioriza fidelidade visual/física sobre gamificação simplista.

## Stack

- Three.js r160+ (WebGL, WebXR nativo)
- TypeScript (strict)
- Vite (build/dev)
- Sem backend — estático, deploy em Vercel/Netlify/GitHub Pages

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de produção
npm run preview    # preview do build
```

## Estrutura

```
src/
  main.ts                 # orquestração
  core/
    engine.ts             # renderer, scene, camera, loop
    lighting.ts           # Sol como única fonte direcional
    starfield.ts          # campo de estrelas (catálogo simplificado)
    body.ts               # CelestialBody (mesh, atmosfera, anéis, luas, LOD)
    belt.ts               # cinturões (partículas)
    lod.ts                # helper de LOD
  data/
    corpos.json           # dados reais versionáveis
    types.ts
    loader.ts
  scenes/
    hub.ts                # hub orbital
    planet.ts             # cena individual
    transitions.ts        # easing de câmera
  ui/
    hud.ts                # HUD, card de dados, missão, certificado
  xr/
    xrManager.ts          # WebXR + gaze
  shaders/
    atmosphere.ts, rings.ts, jupiter.ts
  utils/
    storage.ts            # progresso (localStorage, schema sincronizável)
    scale.ts              # modos visual/real
    easing.ts
    textures.ts           # texturas procedurais + fallback para arquivos
```

## Modos de escala

- **Visual**: distâncias/radios compactados para navegação.
- **Real**: proporções reais, com aviso de tempo de viagem da luz.

Toggle no HUD (canto superior direito).

## Texturas

As texturas são geradas proceduralmente como fallback (canvas). Para usar texturas reais (NASA/JPL, Solar System Scope — domínio público/licença livre), coloque arquivos em `public/textures/` com os nomes referenciados em `corpos.json` (`texture`, `nightTexture`, `cloudTexture`, `normalMap`). O loader tenta o arquivo e cai para procedural se ausente.

Documente a fonte de cada asset adicionado em `public/textures/SOURCES.md`.

## Adicionar novos corpos celestes

1. Adicione uma entrada em `src/data/corpos.json` seguindo o schema de `BodyData` (ver `src/data/types.ts`).
2. Campos obrigatórios: `id`, `name`, `type`, `radiusKm`, `massKg`, `distanceAU`, `distanceKm`, `orbitalPeriodDays`, `rotationPeriodHours`, `temperatureK`, `gravityRelative`, `atmosphere`, `moons`, `color`, `curiosities`, `mission`.
3. Satélites: array `satellites` com `id`, `name`, `radiusKm`, `distanceKm`, `orbitalPeriodDays`, `color`.
4. Anéis: `rings: true` (+ `thinRings: true` para anéis finos).
5. Atmosfera glow: `atmosphereGlow: true`.
6. Nuvens animadas: `animatedClouds: true`.
7. O hub e as cenas pegam automaticamente. Nenhuma mudança de código necessária para corpos padrão.

### Exoplanetas (ponto de extensão)

Adicione corpos com `type: 'planet'` e distância em UA grande, ou crie uma nova cena em `src/scenes/`. O schema já suporta.

### Missões históricas (Voyager, Apollo)

Ponto de extensão: criar `src/scenes/mission.ts` com trajetórias (curvas) e registrar no hub como pontos de interesse. Não implementado — estrutura pronta.

### Multiplayer local

Ponto de extensão: `src/net/` com WebRTC/BroadcastChannel para sincronizar câmera/planeta selecionado entre dois dispositivos. Progresso já é exportável (`ProgressStore.exportJSON`).

## Progresso

`localStorage` sob chave `solar-explorer:progress:v1`, schema versionado (`ProgressState`). Métodos `exportJSON()`/`importJSON()` permitem migração futura para backend/conta sem quebrar.

## Interação

- Mouse/touch: OrbitControls + raycasting (clique/touch seleciona).
- VR (Cardboard, gaze): detecção via `navigator.xr`; fixação por 1.8s com feedback. Fallback gracioso se não suportado.

## Performance

- Texturas procedurais em 256px por padrão; LOD geométrico por distância da câmera (troca high/low poly).
- `devicePixelRatio` limitado a 2.
- Sombras PCF suaves.

## Deploy

### Vercel / Netlify
- Build command: `npm run build`
- Output dir: `dist`
- Base: `./` (já configurado em `vite.config.ts`)

### GitHub Pages
- Defina `base` em `vite.config.ts` para o nome do repo se necessário: `base: '/nome-do-repo/'`.
- Deploy da pasta `dist`.

## Licença

Código: MIT. Assets de terceiros (texturas NASA/JPL, Solar System Scope) seguem suas respectivas licenças (domínio público/licença livre) — documentar fonte em `public/textures/SOURCES.md`.
