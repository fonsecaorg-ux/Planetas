import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Engine } from '@/core/engine';
import { loadSolarSystemData } from '@/data/loader';
import { ProgressStore, getLevelForXP } from '@/utils/storage';
import { HubScene } from '@/scenes/hub';
import { BaseScene } from '@/scenes/base';
import { MoonSurfaceScene } from '@/scenes/moonSurface';
import { animateCamera, stepTransition, shiftTransition, detourAround, ScreenFade } from '@/scenes/transitions';
import type { CameraTransition } from '@/scenes/transitions';
import { HUD } from '@/ui/hud';
import { XRManager } from '@/xr/xrManager';
import type { BodyData, ScaleMode, MissionQuestion } from '@/data/types';
import questionPool from '@/data/questionPool.json';
import { lightTravelSeconds, formatTime, sceneExtent, ANEL_EXTERNO } from '@/utils/scale';
import { clamp } from '@/utils/easing';
import { createStarfield } from '@/core/starfield';
import { createSkybox } from '@/core/skybox';
import { PerfOverlay } from '@/core/perfOverlay';
import rocketsData from '@/data/rockets.json';
import { AudioEngine } from '@/core/audio';
import { CloudSync } from '@/core/cloudSync';
import astronautsData from '@/data/astronauts.json';
import narrativeLines from '@/data/narrativeLines.json';
import { HIDDEN_OBJECTS } from '@/data/hiddenObjects';
import { CHAPTERS } from '@/data/chapters';
import { VRStartMenu } from '@/xr/vrStartMenu';

// --- Sistema de Badges ---
const BADGES = [
  { id: 'first-mission',        icon: '🚀', name: 'Primeira Missão',        desc: 'Respondeu sua primeira pergunta de missão' },
  { id: 'half-missions',        icon: '🌗', name: 'Meio Caminho',            desc: 'Completou missões em metade dos corpos' },
  { id: 'all-missions',         icon: '🏆', name: 'Mestre do Sistema Solar', desc: 'Completou missões em todos os corpos' },
  { id: 'moon-visited',         icon: '🌙', name: 'Lunar',                   desc: 'Visitou a Lua' },
  { id: 'moon-flag',            icon: '🚩', name: 'Comandante Lunar',        desc: 'Plantou a bandeira do Brasil na Lua' },
  { id: 'moon-rocks',           icon: '🪨', name: 'Geólogo Lunar',           desc: 'Coletou as 5 amostras lunares' },
  { id: 'portal-unlocked',      icon: '🌌', name: 'Portal Interestelar',     desc: 'Desbloqueou o portal exoplanetário' },
  { id: 'all-planets',          icon: '🪐', name: 'Grande Viajante',         desc: 'Visitou todos os planetas' },
  { id: 'grande-missao',        icon: '⭐', name: 'Grande Missão',           desc: 'Completou a Grande Missão' },
  { id: 'grande-missao-3stars', icon: '🌟', name: 'Estrela Tripla',         desc: 'Acertou 8+ na Grande Missão' },
  // Replayability badges
  { id: 'first-discovery',      icon: '🔍', name: 'Olhos de Águia',         desc: 'Descobriu o primeiro objeto oculto' },
  { id: 'all-discoveries',      icon: '🗝️', name: 'Caçador de Segredos',   desc: 'Descobriu todos os objetos ocultos do sistema solar' },
  { id: 'chapter-1',            icon: '🌋', name: 'Explorador Interno',      desc: 'Concluiu a Expedição: Os Planetas Internos' },
  { id: 'chapter-2',            icon: '🌪️', name: 'Domador de Gigantes',   desc: 'Concluiu a Expedição: Os Gigantes Gasosos' },
  { id: 'chapter-3',            icon: '🧊', name: 'Desbravador Gelado',      desc: 'Concluiu a Expedição: As Fronteiras Geladas' },
  { id: 'chapter-4',            icon: '🎖️', name: 'Explorador Completo',   desc: 'Concluiu todas as expedições do sistema solar' },
  { id: 'weekly-first',         icon: '📅', name: 'Missão Semanal',          desc: 'Completou sua primeira Missão Semanal' },
  { id: 'level-5',              icon: '⭐', name: 'Veterano',                desc: 'Alcançou o nível 5 de explorador' },
  { id: 'level-max',            icon: '🌟', name: 'Almirante Galáctico',     desc: 'Alcançou o nível máximo de explorador' },
];

// --- Evolução da Estação ---
const STATION_MODULES: Array<{
  id: string;
  condition: (state: ReturnType<typeof store.get>) => boolean;
}> = [
  { id: 'lab',         condition: (s) => (s.visited?.length ?? 0) >= 3 },
  { id: 'observatory', condition: (s) => (s.discoveredObjects?.length ?? 0) >= 3 },
  { id: 'garden',      condition: (s) => (s.chapterStepsCompleted?.['chapter-1']?.length ?? 0) >= 3 },
  { id: 'hangar',      condition: (s) => (s.level ?? 1) >= 5 },
];

function checkStationEvolution() {
  const state = store.get();
  for (const mod of STATION_MODULES) {
    if (!state.stationModules?.includes(mod.id) && mod.condition(state)) {
      const isNew = store.unlockStationModule(mod.id);
      if (isNew) {
        const labels: Record<string, string> = {
          lab: '🔬 Laboratório desbloqueado!',
          observatory: '🔭 Observatório desbloqueado!',
          garden: '🌱 Jardim Orbital desbloqueado!',
          hangar: '🚀 Hangar Ampliado desbloqueado!',
        };
        hud.showBadgeToast('🛰️', 'Estação Evoluiu!', labels[mod.id] ?? mod.id);
      }
    }
  }
}

// --- Sistema de Missão Semanal ---
function getISOWeek(): number {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function seededRandom(seed: number) {
  let s = seed & 0x7fffffff || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function buildAllQuestions(): MissionQuestion[] {
  const pool = questionPool as Record<string, Record<string, MissionQuestion[]>>;
  const all: MissionQuestion[] = [];
  for (const b of data.bodies) {
    if (b.type === 'belt' || b.type === 'exoplanet') continue;
    all.push(b.mission.easy, b.mission.medium);
    const bp = pool[b.id];
    if (bp?.easy)   all.push(...bp.easy);
    if (bp?.medium) all.push(...bp.medium);
  }
  return all;
}

function getWeeklyMissions(week: number): MissionQuestion[] {
  const all = buildAllQuestions();
  const rng = seededRandom(week * 7919 + 42);
  const shuffled = [...all].sort(() => rng() - 0.5);
  return shuffled.slice(0, 5);
}

// --- Sistema de Desafio Diário ---
const DAILY_KEY = 'solar-explorer:daily';
interface DailyState { date: string; answered: boolean; correct: boolean; streak: number }

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyState(): DailyState {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      const s = JSON.parse(raw) as DailyState;
      if (s.date === getTodayString()) return s;
      // Novo dia — streak quebra se ontem não respondeu (simplificado: mantém se foi ontem)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      return { date: getTodayString(), answered: false, correct: false, streak: s.date === yesterday && s.correct ? s.streak : 0 };
    }
  } catch { /* */ }
  return { date: getTodayString(), answered: false, correct: false, streak: 0 };
}

function saveDailyState(s: DailyState) {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(s)); } catch { /* */ }
}

function buildBaseQuestions(): MissionQuestion[] {
  const pool = questionPool as Record<string, Record<string, MissionQuestion[]>>;
  const easy: MissionQuestion[] = [];
  const medium: MissionQuestion[] = [];
  for (const b of data.bodies) {
    if (b.type === 'belt') continue;
    easy.push(b.mission.easy, b.mission.medium);
    const bp = pool[b.id];
    if (bp?.easy)   easy.push(...bp.easy);
    if (bp?.medium) medium.push(...bp.medium);
  }
  const shuffle = <T>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  return [shuffle(easy)[0], shuffle(medium)[0], shuffle(medium)[1]];
}

function getDailyQuestion(): MissionQuestion {
  const pool = questionPool as Record<string, Record<string, MissionQuestion[]>>;
  const all: MissionQuestion[] = [];
  for (const b of data.bodies) {
    if (b.type === 'belt') continue;
    all.push(b.mission.easy, b.mission.medium);
    const bp = pool[b.id];
    if (bp?.easy)   all.push(...bp.easy);
    if (bp?.medium) all.push(...bp.medium);
  }
  // Semente determinística por data para ser igual para todos no mesmo dia
  const seed = getTodayString().replace(/-/g, '').split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0);
  return all[Math.abs(seed) % all.length];
}

// Vista geral de cada modo, olhando para o Sol. No real a Terra está a
// ~23 mil unidades do Sol — a vista mostra o sistema interno como pontos
const VISTA_GERAL: Record<ScaleMode, THREE.Vector3> = {
  visual: new THREE.Vector3(0, 300, 650),
  real: new THREE.Vector3(0, 9000, 30000),
};

// Chegada a um corpo: distância em raios de enquadramento (anéis incluídos)
// mais folga fixa para a tripulação não ficar entre a câmera e o planeta
const CHEGADA_EM_RAIOS = 3.2;
const CHEGADA_FOLGA = 2;
// Peso da direção do Sol na chegada: chegar pelo lado iluminado
const CHEGADA_PESO_SOL = 0.6;

const VIAGEM_DURACAO_MIN_S = 1.5;
const VIAGEM_DURACAO_MAX_S = 4;

// Mouse preciso: 10px. Touchpad/touch/caneta: 28px (o dedo desliza ao pressionar)
const LIMIAR_MOUSE_PX  = 10;
const LIMIAR_TOUCH_PX  = 28;

// Near proporcional à superfície mais próxima: pequeno o bastante para não
// cortar o que está perto, grande o bastante para não perder precisão de profundidade
const NEAR_FRACAO_SUPERFICIE = 0.1;
const NEAR_MIN = 0.01;
const NEAR_MAX = 1000;
const BASE_NEAR = 0.1;
const BASE_FAR = 500;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

const engine = new Engine({ canvas });

// HDR de ambiente só na base terrestre. No espaço ele iluminaria o lado
// noturno dos planetas por igual
let hdrEnv: THREE.Texture | null = null;
new RGBELoader().load('/textures/env.hdr', (tex) => {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  hdrEnv = tex;
  if (currentScene === 'base') engine.scene.environment = tex;
});

const data = loadSolarSystemData();
const store = new ProgressStore();
const audio = new AudioEngine();
// Sync anônimo com Firestore (no-op se VITE_FIREBASE_* não estiver configurado)
const cloudSync = new CloudSync(store);
const progress = store.get();

let scaleMode: ScaleMode = progress.scaleMode;
let timeSpeed = progress.timeSpeed;
let currentScene: 'hub' | 'planet' | 'base' | 'lua' = 'hub';
let selectedBodyId: string | null = null;
let baseScene: BaseScene | null = null;
let moonScene: MoonSurfaceScene | null = null;
let transition: CameraTransition | null = null;

// Posição do Sol em coordenadas de mundo, compartilhada com os shaders
const sunPosition = new THREE.Vector3();
const ORIGEM = new THREE.Vector3(0, 0, 0);
const _tmp = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _camPos = new THREE.Vector3();

const controls = new OrbitControls(engine.camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const hub = new HubScene({ data, scaleMode, sunPosition, activeAstronaut: store.get().activeAstronaut });
engine.scene.add(hub.group);
hub.applyFloatingOrigin();

// Céu fora do mundo deslocado: acompanha a câmera e fica sempre no fundo.
// Skybox equiretangular (Via Láctea) + campo de estrelas procedural sobreposto.
const skybox = createSkybox();
engine.scene.add(skybox);

const starfield = createStarfield();
starfield.renderOrder = -1;
engine.scene.add(starfield);

const fade = new ScreenFade(engine.camera);

// Medidor e acesso à cena pelo console só com ?debug=1 — vale também no
// build de produção, para medir no celular sem expor nada ao usuário comum
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const perf = DEBUG ? new PerfOverlay(engine.renderer) : null;
if (DEBUG) {
  (window as any).__explorador = { engine, hub, starfield, THREE };
}

function getMissionScore(): number {
  return Object.values(store.get().completedMissions).reduce(
    (sum, m) => sum + (m.easy?.correct ? 1 : 0) + (m.medium?.correct ? 1 : 0), 0,
  );
}

function checkAndAwardBadge(id: string) {
  if (store.addBadge(id)) {
    const def = BADGES.find((b) => b.id === id);
    if (def) hud.showBadgeToast(def.icon, def.name, def.desc);
  }
}

function awardXP(amount: number) {
  const result = store.addXP(amount);
  hud.showXPGain(amount);
  hud.updateXPPill(result.xp, result.level, result.levelName, result.nextXP);
  if (result.leveledUp) {
    hud.showLevelUp(result.level, result.levelName);
    if (result.level >= 5) checkAndAwardBadge('level-5');
    if (result.level >= 10) checkAndAwardBadge('level-max');
  }
}

function recordDiaryVisit(bodyData: BodyData) {
  store.addDiaryEntry({
    bodyId: bodyData.id,
    name: bodyData.name,
    type: bodyData.type,
    visitedAt: new Date().toISOString(),
    curiosity: bodyData.curiosities[0] ?? '',
  });
}

function checkChapterProgress() {
  const state = store.get();
  const visited = state.visited;
  const missions = state.completedMissions;
  const discovered = state.discoveredObjects ?? [];

  for (const chapter of CHAPTERS) {
    if (store.isChapterComplete(chapter.id, chapter.steps.length)) continue;
    for (const step of chapter.steps) {
      if (store.isChapterStepDone(chapter.id, step.id)) continue;
      let done = false;
      if (step.type === 'visit' && step.bodyId) {
        done = visited.includes(step.bodyId);
      } else if (step.type === 'answer' && step.bodyId) {
        const rec = missions[step.bodyId];
        done = !!(rec?.easy?.correct || rec?.medium?.correct);
      } else if (step.type === 'discover' && step.count !== undefined) {
        done = discovered.length >= step.count;
      } else if (step.type === 'weekly') {
        done = store.isWeeklyComplete(getISOWeek());
      } else if (step.type === 'grande') {
        done = store.hasBadge('grande-missao');
      }
      if (done) store.completeChapterStep(chapter.id, step.id);
    }
    // Check if chapter is now complete after updates
    if (store.isChapterComplete(chapter.id, chapter.steps.length)) {
      awardXP(chapter.xpReward);
      checkAndAwardBadge(chapter.badge);
    }
  }
}

// HUD
const hud = new HUD(uiRoot, {
  onSelectBody: (id) => selectBody(id),
  onScaleMode: (m) => setScaleMode(m),
  onTimeSpeed: (v) => { timeSpeed = v; store.setTimeSpeed(v); },
  onMissionAnswer: (bodyId, diff, correct) => {
    store.recordMission(bodyId, diff, correct);
    const name = store.get().certificateName || 'Explorador';
    cloudSync.submitLeaderboard(name, getMissionScore());
    // XP
    if (correct) awardXP(diff === 'easy' ? 15 : 25);
    // Badge checks
    const missions = store.get().completedMissions;
    const answeredCount = Object.keys(missions).length;
    if (answeredCount >= 1) checkAndAwardBadge('first-mission');
    const half = Math.ceil(mainBodies.length / 2);
    if (answeredCount >= half) checkAndAwardBadge('half-missions');
    if (answeredCount >= mainBodies.length) checkAndAwardBadge('all-missions');
    checkChapterProgress();
    checkStationEvolution();
  },
  onDifficulty: () => {},
  onCertificate: () => showCertificate(),
  onCertificateName: (name) => { store.setCertificate(name); },
  onGrandeMissao: () => {
    audio.grandeMissao();
    hud.showGrandeMissao(buildGrandeMissaoQuestions());
  },
  onGrandeMissaoComplete: (score, _total) => {
    const name = store.get().certificateName || 'Explorador';
    cloudSync.submitLeaderboard(name, getMissionScore());
    checkAndAwardBadge('grande-missao');
    if (score >= 8) checkAndAwardBadge('grande-missao-3stars');
    awardXP(50);
    checkChapterProgress();
  },
  onBadges: () => {
    hud.showBadges(BADGES, store.get().earnedBadges ?? []);
  },
  onProgressMap: () => {
    hud.showProgressMap(data.bodies, store.get());
  },
  onNavigate: (id) => selectBody(id),
  onComparePlanet: (currentBodyId) => {
    const current = data.bodies.find((b) => b.id === currentBodyId);
    if (current) hud.showComparePicker(data.bodies, current);
  },
  onProfile: () => {
    hud.showProfile(store.get(), BADGES, store.get().earnedBadges ?? []);
  },
  onDailyChallenge: () => {
    const state = getDailyState();
    hud.setDailyStreak(state.streak);
    hud.showDailyChallenge(getDailyQuestion(), state, (correct) => {
      const newStreak = correct ? state.streak + 1 : 0;
      saveDailyState({ date: getTodayString(), answered: true, correct, streak: newStreak });
      hud.setDailyStreak(newStreak);
      if (correct) checkAndAwardBadge('first-mission');
    });
  },
  onLeaderboard: async () => {
    const entries = await cloudSync.getLeaderboard();
    hud.showLeaderboard(entries, cloudSync.getAnonId());
  },
  onAstronautSelect: (name) => {
    store.setCertificate(name);
    const astro = astronautsData.astronauts.find((a: any) => a.name === name);
    if (astro) store.setActiveAstronaut(astro.id);
    hud.showCertificate(name, store.get().certificateDate!);
  },
  onDiary: () => hud.showDiary(
    store.getDiaryEntries(),
    store.get().discoveredObjects ?? [],
    HIDDEN_OBJECTS.map((o) => ({ id: o.id, bodyId: o.bodyId, name: o.name, color: o.color })),
    store.getStationModules(),
  ),
  onExpedition: () => openExpeditionPanel(),
  onBase: () => { if (currentScene === 'base' || currentScene === 'lua') goBackToHub(); else switchToBase(); },
  onTour: () => {
    if (currentScene === 'base' || currentScene === 'lua') goBackToHub();
    startVRTour();
  },
  onPhoto: () => {
    const frame = engine.captureFrame();
    // Nome do personagem ativo (ex.: JUAN_GUI7); certificado só como reserva
    const ativo = (astronautsData.astronauts as any[]).find((a) => a.id === store.get().activeAstronaut);
    hud.showPhotoPreview(frame, ativo?.name || store.get().certificateName || 'Explorador');
  },
  onRecordToggle: () => toggleRecording(),
  onPlaySound: (kind) => {
    if (kind === 'click') audio.click();
    else if (kind === 'success') audio.success();
    else if (kind === 'error') audio.error();
    else if (kind === 'launch') audio.launch();
    else if (kind === 'transition') audio.transition();
    else if (kind === 'quiz1') audio.quizResult(1);
    else if (kind === 'quiz2') audio.quizResult(2);
    else if (kind === 'quiz3') audio.quizResult(3);
  },
  onSpeak: (text) => audio.speak(text),
  onReset: () => store.reset(),
  onBack: () => goBackToHub(),
  onCloseCard: () => closeCard(),
  onPlanetCreator: () => hud.showPlanetCreator((opts) => {
    const group = hub.addCustomPlanet({ name: opts.name, color: opts.color, radius: opts.radius, rings: opts.rings, moons: opts.moons });
    hud.showBadgeToast('🪐', `${opts.name} criado!`, 'Novo planeta adicionado ao sistema solar.');
    // Voar até ele
    const target = group.position.clone();
    viajar(target.clone().add(new THREE.Vector3(0, opts.radius * 2, opts.radius * 6)), target);
  }),
  xrRenderer: engine.renderer,
}, progress);
// Lua fora: o painel dela não tem quiz (badge all-missions ficaria impossível)
// e incluí-la no requisito do portal regrediria quem já o desbloqueou
const mainBodies = data.bodies.filter((b) => b.type !== 'belt' && b.type !== 'exoplanet' && b.type !== 'moon');
hud.setBodyCount(mainBodies.length);
hud.setMainBodyIds(mainBodies.map((b) => b.id));
cloudSync.onStatusChange = (s) => hud.setSyncStatus(s);
hud.updateProgress(store.get());
// Inicializar XP pill com estado salvo
const _initXP = store.get().xp ?? 0;
const _initLevel = getLevelForXP(_initXP);
hud.updateXPPill(_initXP, _initLevel.level, _initLevel.name, _initLevel.nextXP);
// Restaurar portal se já completado em sessão anterior
if (store.get().visited.filter((id) => mainBodies.some((b) => b.id === id)).length >= mainBodies.length) {
  hub.exoPortal?.unlock();
}

if (!store.get().onboardingDone) {
  hud.showOnboarding((astroId) => {
    store.setOnboardingDone();
    if (astroId) {
      store.setActiveAstronaut(astroId);
      const a = astronautsData.astronauts.find((x: any) => x.id === astroId);
      if (a) store.setCertificate(a.name);
    }
    // highlight pós-onboarding
    setTimeout(() => {
      const baseBtn = document.querySelector('#base-btn') as HTMLElement | null;
      const scaleToggle = document.querySelector('.scale-toggle') as HTMLElement | null;
      baseBtn?.classList.add('pulse-hint');
      scaleToggle?.classList.add('pulse-hint');
      setTimeout(() => {
        baseBtn?.classList.remove('pulse-hint');
        scaleToggle?.classList.remove('pulse-hint');
      }, 6000);
    }, 400);
  });
}

// Inicializa streak do desafio diário no botão
hud.setDailyStreak(getDailyState().streak);

// Narrativa de abertura — Modo História
setTimeout(() => {
  hud.showNarrativeBubble('JUAN_GUI7', '#7dd3fc', 'Bem-vindo ao Sistema Solar! Sou JUAN_GUI7, seu comandante. Clique nos planetas para começar nossa exploração!');
}, 3800);

// XR
const xr = new XRManager({
  renderer: engine.renderer,
  camera: engine.camera,
  onGazeSelect: (obj) => {
    if (!obj) return;
    const ud = (obj as any).userData ?? {};
    if (ud.vrMode) {
      vrStartMenu?.dispose();
      vrStartMenu = null;
      rebuildSelectable();
      if (ud.vrMode === 'tour') startVRTour();
      else audio.speak('Exploração livre. Olhe fixamente num planeta para viajar até ele.');
      return;
    }
    if (ud.bodyId) {
      // Olhar num planeta durante o passeio assume o controle manual
      stopVRTour();
      selectBody(ud.bodyId);
    }
  },
});

// --- Eventos Cósmicos ---
(function scheduleCosmic() {
  const delay = 180_000 + Math.random() * 240_000; // 3–7 min
  setTimeout(() => {
    const events: Array<'meteor' | 'comet' | 'eclipse'> = ['meteor', 'comet', 'eclipse'];
    const type = events[Math.floor(Math.random() * events.length)];
    hud.showCosmicEventBanner(type);
    if (type === 'meteor') hub.startMeteorShower();
    else if (type === 'comet') hub.startComet();
    else hub.startEclipse();
    scheduleCosmic();
  }, delay);
})();

// raycasting selection
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selectable: THREE.Object3D[] = [];

function rebuildSelectable() {
  selectable = [];
  // Na Lua os toques são tratados pela própria cena (caminhar até o ponto)
  if (currentScene === 'lua') return;
  if (currentScene === 'base' && baseScene) {
    for (const h of baseScene.hitboxes) {
      (h.mesh as any).userData = { bodyId: h.id };
      selectable.push(h.mesh);
    }
    return;
  }
  for (const b of hub.bodies.values()) {
    // Usa hitbox (1.75× raio visual) em vez do mesh para melhor área de toque
    selectable.push(b.hitbox);
  }
  if (hub.station) selectable.push(hub.station.hitbox);
  for (const r of hub.rockets) {
    (r.hitbox as any).userData = { bodyId: `rocket:${r.data.id}` };
    selectable.push(r.hitbox);
  }
  // Lua (hitbox invisível no moonGroup)
  if (hub.moonBase) selectable.push(hub.moonBase.moonHitbox);
  // Astronautas (hitbox em cada grupo)
  for (const a of hub.astronauts) selectable.push(a.hitbox);
  // Portal interestelar (somente após desbloqueio)
  if (hub.exoPortal?.unlocked) selectable.push(hub.exoPortal.hitbox);
  // Objetos ocultos
  for (const hb of hub.hiddenObjectHitboxes) selectable.push(hb);
  // Menu de entrada do VR (só enquanto não escolheu o modo)
  if (engine.isPresenting && vrStartMenu) {
    for (const hb of vrStartMenu.hitboxes) selectable.push(hb);
  }
}
rebuildSelectable();

function selecionarNoPonto(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, engine.camera);
  // Na Lua: toque no chão = caminhar até lá
  if (currentScene === 'lua') {
    moonScene?.handleTap(raycaster);
    return;
  }
  const hits = raycaster.intersectObjects(selectable, true);
  const id = hits.length ? (hits[0].object as any).userData?.bodyId : undefined;
  if (id) selectBody(id);
}

// Highlight de hover — corpo atualmente sob o cursor
let hoveredBodyId: string | null = null;
function atualizarHover(clientX: number, clientY: number) {
  if (currentScene !== 'hub' && currentScene !== 'planet') return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, engine.camera);
  const hits = raycaster.intersectObjects(selectable, true);
  const id: string | undefined = hits.length ? (hits[0].object as any).userData?.bodyId : undefined;
  if (id === hoveredBodyId) return;
  if (hoveredBodyId) hub.getBody(hoveredBodyId)?.setHighlight(false);
  hoveredBodyId = id ?? null;
  if (hoveredBodyId) hub.getBody(hoveredBodyId)?.setHighlight(true);
}
canvas.addEventListener('pointermove', (e) => atualizarHover(e.clientX, e.clientY));

// Um handler só para mouse e toque. click + touchend disparavam juntos no
// celular, e soltar o dedo depois de girar a câmera selecionava o que estava embaixo
let pointerInicio: { x: number; y: number; id: number; type: string } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  pointerInicio = { x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType };
});

let _ultimoToque = 0;
canvas.addEventListener('pointerup', (e) => {
  const ini = pointerInicio;
  pointerInicio = null;
  if (!ini || ini.id !== e.pointerId) return;
  const limiar = ini.type === 'mouse' ? LIMIAR_MOUSE_PX : LIMIAR_TOUCH_PX;
  if (Math.hypot(e.clientX - ini.x, e.clientY - ini.y) > limiar) return;

  // Duplo toque (≤300 ms) → alterna visibilidade do HUD
  const agora = Date.now();
  if (agora - _ultimoToque < 300) {
    hud.toggleHUD();
    _ultimoToque = 0;
    return;
  }
  _ultimoToque = agora;

  selecionarNoPonto(e.clientX, e.clientY);
});

// --- Observador: câmera fora do VR, rig dentro dele ---

function posicaoObservador(out: THREE.Vector3): THREE.Vector3 {
  return engine.isPresenting ? out.copy(engine.rig.position) : out.copy(engine.camera.position);
}

// Coloca o observador na hora, olhando para o alvo
function posicionarObservador(pos: THREE.Vector3, alvo: THREE.Vector3) {
  if (engine.isPresenting) {
    engine.rig.position.copy(pos);
    // Só guinada: inclinar o rig no VR desorienta. A câmera olha para -Z;
    // o rig gira para -Z apontar para o alvo no plano horizontal
    engine.rig.rotation.set(0, Math.atan2(pos.x - alvo.x, pos.z - alvo.z), 0);
  } else {
    engine.camera.position.copy(pos);
    controls.target.copy(alvo);
    controls.update();
  }
}

function moverObservador(delta: THREE.Vector3) {
  if (engine.isPresenting) {
    engine.rig.position.add(delta);
  } else {
    engine.camera.position.add(delta);
    controls.target.add(delta);
  }
  if (transition) shiftTransition(transition, delta);
}

// Troca o corpo em foco. O mundo é deslocado para o novo corpo ficar na
// origem; o observador vai junto, então nada salta na tela
function trocarFoco(id: string) {
  if (!hub.getBody(id) || hub.focus.data.id === id) return;
  _delta.copy(hub.focus.group.position).sub(hub.localPositionOf(id, _tmp));
  hub.setFocus(id);
  hub.applyFloatingOrigin();
  // getWorldPosition logo em seguida (estação, foguetes) leria a matriz do quadro anterior
  hub.group.updateMatrixWorld(true);
  moverObservador(_delta);
}

function raioEnquadramento(body: { radius: number; data: BodyData }): number {
  return body.radius * (body.data.rings ? ANEL_EXTERNO : 1);
}

function ajustarLimitesControles() {
  if (currentScene === 'base') {
    controls.minDistance = 1;
    controls.maxDistance = 200;
    return;
  }
  if (currentScene === 'lua') {
    controls.minDistance = 2;
    controls.maxDistance = 80;
    return;
  }
  controls.minDistance = hub.focus.radius * 1.2;
  controls.maxDistance = sceneExtent(scaleMode) * 1.5;
}

// Ponto de chegada em volta do corpo em foco (que está na origem): pelo lado
// iluminado, misturado com a direção de onde o observador vem
function pontoDeChegada(out: THREE.Vector3): THREE.Vector3 {
  const foco = hub.focus;
  const dist = raioEnquadramento(foco) * CHEGADA_EM_RAIOS + CHEGADA_FOLGA;
  const aproximacao = posicaoObservador(_tmp).normalize();
  out.copy(aproximacao);
  if (foco.data.type !== 'star') {
    const paraSol = sunPosition.clone().normalize();
    out.multiplyScalar(1 - CHEGADA_PESO_SOL).addScaledVector(paraSol, CHEGADA_PESO_SOL);
  }
  out.y += 0.25;
  return out.normalize().multiplyScalar(dist);
}

// Viagem até um ponto olhando para o alvo. Fora do VR: voo suave, com
// desvio por cima do Sol. Em VR: escurece, reposiciona e clareia
function viajar(destino: THREE.Vector3, alvo: THREE.Vector3, aoChegar?: () => void) {
  if (engine.isPresenting) {
    transition = null;
    fade.run(() => {
      posicionarObservador(destino, alvo);
      aoChegar?.();
    });
    return;
  }
  const origem = engine.camera.position;
  const escala = Math.max(destino.distanceTo(alvo), 1e-3);
  const duracao = clamp(1.2 + 0.6 * Math.log10(1 + origem.distanceTo(destino) / escala), VIAGEM_DURACAO_MIN_S, VIAGEM_DURACAO_MAX_S);
  const via = detourAround(origem, destino, sunPosition, hub.getBody('sun')!.radius);
  // Limites do OrbitControls puxariam a câmera no meio do voo
  controls.enabled = false;
  controls.minDistance = 0;
  transition = animateCamera(engine.camera, controls, destino, alvo, duracao, () => {
    controls.enabled = true;
    ajustarLimitesControles();
    aoChegar?.();
  }, via);
}

function atualizarIndicadorEscala(bodyData?: BodyData) {
  if (!bodyData) {
    hud.setScaleIndicator(scaleMode === 'real' ? 'Escala real ativa.' : '');
  } else if (scaleMode === 'real') {
    const lt = lightTravelSeconds(bodyData.distanceKm);
    hud.setScaleIndicator(`Escala real: luz do Sol leva ${formatTime(lt)} para chegar aqui.`);
  } else {
    hud.setScaleIndicator('Modo visual: distâncias compactadas, tamanhos em proporção real.');
  }
}

function selectBody(id: string) {
  audio.click();
  stopVRTour();
  // Destino celeste escolhido estando na base ou na Lua (ex.: "Viajar" do
  // Diário): volta ao hub primeiro, senão a viagem seria numa cena inexistente
  const alvoCeleste = id === 'moon' || id === 'station'
    || data.bodies.some((b) => b.id === id && b.type !== 'belt' && b.type !== 'exoplanet');
  if ((currentScene === 'base' || currentScene === 'lua') && alvoCeleste) goBackToHub();
  if (id === 'station') {
    store.markVisited('station');
    hud.updateProgress(store.get());
    trocarFoco('earth');
    const pos = hub.station!.group.getWorldPosition(new THREE.Vector3());
    audio.transition();
    viajar(pos.clone().add(new THREE.Vector3(0, 6, 10)), pos, () => hud.showStation());
    return;
  }
  if (id.startsWith('quiz:')) {
    const idx = parseInt(id.slice('quiz:'.length));
    baseScene?.handlePanelClick(idx);
    return;
  }
  if (id === 'building') {
    hud.showStation();
    const card = document.querySelector('#planet-card') as HTMLElement;
    if (card) {
      card.innerHTML = `
        ${cardHeader('🏢 Centro de Controle')}
        <div class="subtitle">Sede do time de exploradores</div>
        <p style="font-size:0.85rem;opacity:0.85;">Sala de monitores, estações de trabalho e comunicação com a frota. Aqui a equipe coordena lançamentos, missões e telemetria.</p>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" id="cert-btn">📜 Certificado</button>
        </div>
      `;
      card.querySelector('#close-btn')?.addEventListener('click', () => closeCard());
      card.querySelector('#back-btn')?.addEventListener('click', () => goBackToHub());
      card.querySelector('#cert-btn')?.addEventListener('click', () => showCertificate());
    }
    return;
  }
  if (id === 'rocket:launch') {
    hud.showStation();
    const card = document.querySelector('#planet-card') as HTMLElement;
    if (card) {
      const done = store.get().journeyDone;
      card.innerHTML = `
        ${cardHeader('🚀 Veículo de Lançamento')}
        <div class="subtitle">${done ? 'Missão já concluída' : 'Foguete pronto para lançamento'}</div>
        <p style="font-size:0.85rem;opacity:0.85;margin:8px 0;">
          ${done
            ? 'Você já completou a missão de treinamento. Pode lançar novamente ou explorar livremente.'
            : 'Complete o treinamento de missão antes do lançamento. Responda 3 perguntas sobre o Sistema Solar.'}
        </p>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" id="launch-mission-btn">🚀 ${done ? 'Lançar novamente' : 'Iniciar missão'}</button>
          <button class="btn" id="hub-btn">🌌 Sistema Solar</button>
        </div>
      `;
      card.querySelector('#close-btn')?.addEventListener('click', () => closeCard());
      card.querySelector('#back-btn')?.addEventListener('click', () => goBackToHub());
      card.querySelector('#launch-mission-btn')?.addEventListener('click', () => { closeCard(); startBaseJourney(); });
      card.querySelector('#hub-btn')?.addEventListener('click', () => goBackToHub());
    }
    return;
  }
  if (id.startsWith('car:')) {
    const card = document.querySelector('#planet-card') as HTMLElement;
    if (card) {
      card.classList.add('visible');
      card.innerHTML = `
        ${cardHeader('🚗 Veículo de Transporte')}
        <div class="subtitle">Transporte da equipe até a plataforma de lançamento</div>
        <p style="font-size:0.85rem;opacity:0.85;">Os astronautas usam este veículo para se deslocar entre o centro de controle e a plataforma de lançamento.</p>
      `;
      card.querySelector('#close-btn')?.addEventListener('click', () => closeCard());
      card.querySelector('#back-btn')?.addEventListener('click', () => goBackToHub());
    }
    return;
  }
  if (id === 'moon') {
    trocarFoco('earth');
    hub.applyFloatingOrigin();
    hub.group.updateMatrixWorld(true);
    const moonPos = new THREE.Vector3();
    hub.moonBase!.moonGroup.getWorldPosition(moonPos);
    const wasNew = !store.get().visited.includes('moon');
    store.markVisited('moon');
    if (wasNew) {
      awardXP(10);
      store.addDiaryEntry({ bodyId: 'moon', name: 'Lua', type: 'moon', visitedAt: new Date().toISOString(), curiosity: 'A Lua é o único astro além da Terra onde humanos já pisaram — durante as missões Apollo entre 1969 e 1972.' });
    }
    checkChapterProgress();
    checkStationEvolution();
    audio.transition();
    viajar(moonPos.clone().add(new THREE.Vector3(0, 2, 5)), moonPos, () => {
      showMoonPanel();
      const moonLine = (narrativeLines as Record<string, { astronaut: string; color: string; text: string }>)['moon'];
      if (moonLine) hud.showNarrativeBubble(moonLine.astronaut, moonLine.color, moonLine.text);
      checkAndAwardBadge('moon-visited');
    });
    return;
  }
  if (id.startsWith('astronaut:')) {
    const astroId = id.slice('astronaut:'.length);
    const astroData = (astronautsData.astronauts as any[]).find((a) => a.id === astroId);
    if (!astroData) return;
    const card = document.querySelector('#planet-card') as HTMLElement;
    if (card) {
      card.classList.add('visible');
      card.innerHTML = `
        ${cardHeader(`👨‍🚀 ${astroData.name}`)}
        <div class="subtitle" style="color:${astroData.suitColor}">${astroData.role}</div>
        <p style="font-size:0.85rem;opacity:0.85;margin:8px 0;">${astroData.bio}</p>
        <div style="display:flex;gap:10px;align-items:center;margin-top:12px;">
          <div style="width:30px;height:30px;border-radius:50%;background:${astroData.suitColor};border:3px solid ${astroData.helmetColor};flex-shrink:0"></div>
          <span style="font-size:0.78rem;opacity:0.7">Traje: <b>${astroData.suitColor}</b> · Capacete: <b>${astroData.helmetColor}</b></span>
        </div>
        ${astroId === 'astro-juan' ? '<div style="margin-top:12px;padding:8px 10px;background:rgba(0,150,59,0.18);border:1px solid rgba(0,150,59,0.5);border-radius:7px;font-size:0.82rem;color:#ffd700">🚩 Plantou a bandeira do Brasil na Lua</div>' : ''}
      `;
      card.querySelector('#close-btn')?.addEventListener('click', () => closeCard());
      card.querySelector('#back-btn')?.addEventListener('click', () => goBackToHub());
    }
    return;
  }
  if (id.startsWith('rocket:')) {
    const rid = id.slice('rocket:'.length);
    const rocketData = rocketsData.rockets.find((r: any) => r.id === rid);
    const rocket = hub.rockets.find((r) => r.data.id === rid);
    if (!rocketData || !rocket) return;
    store.markVisited(id);
    hud.updateProgress(store.get());
    trocarFoco('earth');
    rocket.launch();
    const pos = rocket.group.getWorldPosition(new THREE.Vector3());
    audio.transition();
    audio.launch();
    viajar(pos.clone().add(new THREE.Vector3(0, 3, 6)), pos, () => hud.showRocket(rocketData as any));
    return;
  }
  if (id === 'exo-portal') {
    hud.showExoPortal(data.bodies.filter((b) => b.type === 'exoplanet'));
    return;
  }

  if (id.startsWith('hidden:')) {
    const objId = id.slice('hidden:'.length);
    const obj = HIDDEN_OBJECTS.find((o) => o.id === objId);
    if (!obj) return;
    const isNew = store.discoverObject(objId);
    if (isNew) {
      awardXP(obj.xp);
      hud.showHiddenObjectFound(obj.name, obj.fact, obj.xp);
      checkAndAwardBadge('first-discovery');
      if ((store.get().discoveredObjects ?? []).length >= HIDDEN_OBJECTS.length) {
        checkAndAwardBadge('all-discoveries');
      }
      checkChapterProgress();
      checkStationEvolution();
    }
    return;
  }

  const bodyData = data.bodies.find((b) => b.id === id);
  if (!bodyData || bodyData.type === 'belt' || !hub.getBody(id)) return;

  const wasNew = !store.get().visited.includes(id);
  store.markVisited(id);
  if (wasNew) awardXP(10);
  hud.updateProgress(store.get());
  checkChapterProgress();
  checkStationEvolution();
  // Verificar se todos os planetas foram visitados → desbloquear portal
  if (!hub.exoPortal?.unlocked) {
    const visited = store.get().visited.filter((vid) => mainBodies.some((b) => b.id === vid));
    if (visited.length >= mainBodies.length) {
      hub.exoPortal?.unlock();
      rebuildSelectable();
      checkAndAwardBadge('portal-unlocked');
      checkAndAwardBadge('all-planets');
    }
  }
  hud.hidePlanet();

  trocarFoco(id);
  audio.transition();
  viajar(pontoDeChegada(new THREE.Vector3()), ORIGEM, () => {
    currentScene = 'planet';
    selectedBodyId = id;
    audio.arrival(bodyData.type);
    recordDiaryVisit(bodyData);
    const line = (narrativeLines as Record<string, { astronaut: string; color: string; text: string }>)[id];
    if (line) hud.showNarrativeBubble(line.astronaut, line.color, line.text);
    hud.showPlanet(bodyData);
    atualizarIndicadorEscala(bodyData);
  });
}

/** Painel da Lua com destaque para a missão do JUAN_GUI7. */
function showMoonPanel() {
  const card = document.querySelector('#planet-card') as HTMLElement;
  if (!card) return;
  card.classList.add('visible');
  card.innerHTML = `
    ${cardHeader('🌙 Lua')}
    <div class="subtitle">Satélite natural da Terra</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0;font-size:0.8rem;opacity:0.8;">
      <div>⚫ Raio: 1.737 km</div>
      <div>🔄 Órbita: 27,3 dias</div>
      <div>🌡️ −173°C / +127°C</div>
      <div>⚖️ Gravidade: 1/6 ⊕</div>
      <div>💨 Sem atmosfera</div>
      <div>📏 384.400 km da Terra</div>
    </div>
    <div style="padding:10px;background:rgba(0,150,59,0.14);border:1px solid rgba(0,150,59,0.45);border-radius:8px;">
      <div style="font-size:0.85rem;font-weight:bold;color:#ffd700;margin-bottom:5px">🚩 Missão Bandeira do Brasil</div>
      <div style="font-size:0.8rem;line-height:1.5;opacity:0.95"><b>JUAN_GUI7</b>, Comandante Lunar, tem a missão de plantar a Bandeira do Brasil na superfície — primeiro explorador brasileiro a conquistar a Lua.</div>
    </div>
    <button class="btn" id="moon-land-btn" style="margin-top:10px;width:100%;background:linear-gradient(135deg,#4a4a6a,#8a8aba);border:1px solid rgba(255,215,0,0.5);font-weight:700;">🌙 Pousar na Lua</button>
    <div class="mission" style="margin-top:10px;" id="moon-mission"></div>
  `;
  card.querySelector('#close-btn')?.addEventListener('click', () => closeCard());
  card.querySelector('#back-btn')?.addEventListener('click', () => goBackToHub());
  card.querySelector('#moon-land-btn')?.addEventListener('click', () => switchToMoonSurface());
  renderMoonQuiz(card.querySelector('#moon-mission') as HTMLElement);
}

/** Quiz da Lua dentro do painel — mesma mecânica das missões dos planetas. */
function renderMoonQuiz(container: HTMLElement | null) {
  const moonData = data.bodies.find((b) => b.id === 'moon');
  if (!container || !moonData) return;
  const q = moonData.mission.easy;
  const jaFeita = store.get().completedMissions['moon']?.easy?.correct;
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
      <span style="font-size:0.85rem;">🎯</span>
      <span style="font-weight:700;font-size:0.82rem;flex:1;">Missão da Lua</span>
      ${jaFeita ? '<span style="font-size:0.72rem;color:#22c55e;">✅ Concluída</span>' : ''}
    </div>
    <div class="q">${q.q}</div>
    <div class="opts">
      ${q.options.map((o, i) => `<button class="opt" data-idx="${i}">${o}</button>`).join('')}
    </div>
    <div id="moon-fb" style="margin-top:6px;font-size:0.8rem;min-height:18px;"></div>
  `;
  container.querySelectorAll('.opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      if ((btn as HTMLElement).dataset.locked === '1') return;
      const idx = parseInt((btn as HTMLElement).dataset.idx!);
      const correct = idx === q.answer;
      container.querySelectorAll('.opt').forEach((b, i) => {
        b.classList.toggle('correct', i === q.answer);
        if (i === idx && !correct) b.classList.add('wrong');
        (b as HTMLElement).dataset.locked = '1';
      });
      const fb = container.querySelector('#moon-fb') as HTMLElement;
      fb.textContent = correct ? '✅ Correto! Você ganhou XP!' : '❌ Quase! A resposta certa está em verde.';
      fb.style.color = correct ? '#22c55e' : '#ef4444';
      if (correct) {
        audio.success();
        if (!jaFeita) awardXP(15);
      } else {
        audio.error();
      }
      store.recordMission('moon', 'easy', correct);
    });
  });
}

/** Fecha o painel de informações sem mover a câmera. */
function closeCard() {
  hud.hidePlanet();
}

function openExpeditionPanel() {
  const week = getISOWeek();
  store.initWeeklyMission(week);
  const weeklyMissions = getWeeklyMissions(week);
  const refreshPanel = () => {
    const st = store.get();
    hud.showExpeditionPanel(
      CHAPTERS,
      st.chapterStepsCompleted ?? {},
      weeklyMissions,
      {
        week,
        answered: st.weeklyMissionAnswered ?? Array(5).fill(false),
        correct: st.weeklyMissionCorrect ?? Array(5).fill(false),
      },
      (idx, correct) => {
        store.recordWeeklyAnswer(week, idx, correct);
        if (correct) awardXP(10);
        if (store.isWeeklyComplete(week)) {
          awardXP(30);
          checkAndAwardBadge('weekly-first');
          checkChapterProgress();
        }
        refreshPanel();
      },
    );
  };
  refreshPanel();
}

/** HTML do cabeçalho de card com ✕ (fecha) e "← Voltar ao mapa" (vai ao hub). */
function cardHeader(title: string): string {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
      <h2 style="margin:0;flex:1;">${title}</h2>
      <button class="btn" id="close-btn" title="Fechar painel" style="padding:0;width:36px;height:36px;min-width:36px;font-size:1rem;">✕</button>
      <button class="btn" id="back-btn" style="font-size:0.8rem;">← Voltar ao mapa</button>
    </div>`;
}

function goBackToHub() {
  audio.ambient();
  const vindoDeSuperficie = currentScene === 'base' || currentScene === 'lua';
  if (baseScene) {
    engine.scene.remove(baseScene.group);
    baseScene.dispose();
    baseScene = null;
    engine.scene.add(hub.group);
    engine.scene.environment = null;
    starfield.visible = true;
    // Restaura bloom do espaço e exposição original
    engine.bloomPass.enabled = true;
    engine.bloomPass.strength = 0.65;
    engine.bloomPass.threshold = 0.88;
    engine.renderer.toneMappingExposure = 1.1;
  }
  if (moonScene) {
    engine.scene.remove(moonScene.group);
    moonScene.dispose();
    moonScene = null;
    engine.scene.add(hub.group);
    engine.bloomPass.enabled = true;
    engine.bloomPass.strength = 0.65;
    engine.bloomPass.threshold = 0.88;
    engine.renderer.toneMappingExposure = 1.1;
  }
  currentScene = 'hub';
  selectedBodyId = null;
  trocarFoco('sun');
  rebuildSelectable();
  hud.hidePlanet();
  hud.setBaseButtonMode(false);
  atualizarIndicadorEscala();
  if (vindoDeSuperficie) {
    posicionarObservador(VISTA_GERAL[scaleMode], ORIGEM);
    ajustarLimitesControles();
  } else {
    viajar(VISTA_GERAL[scaleMode].clone(), ORIGEM);
  }
}

function switchToMoonSurface() {
  stopVRTour();
  audio.stopAmbient();
  transition = null;
  controls.enabled = true;
  engine.scene.remove(hub.group);
  engine.scene.environment = null;
  starfield.visible = true; // céu lunar: estrelas sempre visíveis (sem atmosfera)
  engine.bloomPass.enabled = false;
  engine.renderer.toneMappingExposure = 1.0;
  const juanData = (astronautsData.astronauts as any[]).find((a) => a.id === 'astro-juan');
  moonScene?.dispose();
  moonScene = new MoonSurfaceScene(juanData, store.hasBadge('moon-flag'));
  moonScene.onFlagPlanted = () => {
    audio.success();
    awardXP(30);
    checkAndAwardBadge('moon-flag');
    checkChapterProgress();
    hud.showNarrativeBubble('JUAN_GUI7', '#7dd3fc', 'A bandeira do Brasil está na Lua! Missão cumprida, comandante! 🚩');
    audio.speak('A bandeira do Brasil está na Lua! Missão cumprida, comandante!');
  };
  const primeiraColeta = !store.hasBadge('moon-rocks');
  moonScene.onSampleCollected = (n, total) => {
    audio.success();
    if (primeiraColeta) awardXP(5);
    if (n >= total) {
      checkAndAwardBadge('moon-rocks');
      if (primeiraColeta) awardXP(25);
      hud.showNarrativeBubble('JUAN_GUI7', '#67e8f9', 'Coleção completa! Você é um verdadeiro geólogo lunar! 🪨✨');
      audio.speak('Coleção completa! Você é um verdadeiro geólogo lunar!');
    } else {
      hud.showBadgeToast('🪨', `Amostra lunar ${n}/${total}`, primeiraColeta ? '+5 XP — continue procurando os cristais!' : 'Continue procurando os cristais!');
    }
  };
  engine.scene.add(moonScene.group);
  currentScene = 'lua';
  rebuildSelectable();
  ajustarLimitesControles();
  const jp = moonScene.juanPosition;
  posicionarObservador(jp.clone().add(new THREE.Vector3(0, 3.5, 9)), jp.clone().add(new THREE.Vector3(0, 1, 0)));
  hud.hidePlanet();
  hud.setBaseButtonMode(true);
  hud.setScaleIndicator('Superfície da Lua — toque no chão para o Juan caminhar');
  hud.showNarrativeBubble('JUAN_GUI7', '#7dd3fc', 'Pouso confirmado! Toque no chão e eu caminho até lá. Plante a bandeira no círculo dourado e colete os 5 cristais brilhantes! 🪨');
  audio.speak('Pouso confirmado! Toque no chão para caminhar. Plante a bandeira no círculo dourado e colete os cinco cristais brilhantes!');
}

function switchToBase() {
  audio.stopAmbient();
  transition = null;
  controls.enabled = true;
  engine.scene.remove(hub.group);
  starfield.visible = false;
  engine.scene.environment = hdrEnv;
  // Bloom desabilitado na base: luz direcional + HDR env explodem o threshold e
  // deixam tudo branco. O bloom é só pra brilho de estrelas no espaço.
  engine.bloomPass.enabled = false;
  engine.renderer.toneMappingExposure = 0.75;
  baseScene?.dispose();
  baseScene = new BaseScene(astronautsData.astronauts as any, rocketsData.rockets as any, store.get().activeAstronaut);
  engine.scene.add(baseScene.group);
  currentScene = 'base';
  rebuildSelectable();
  ajustarLimitesControles();
  posicionarObservador(new THREE.Vector3(-5, 18, 42), new THREE.Vector3(8, 4, -5));
  hud.hidePlanet();
  hud.setBaseButtonMode(true);
  hud.setScaleIndicator('Base de lançamento — toque em 🌌 Espaço para voltar ao Sistema Solar');

  // Se missão já concluída, mostra painel de retorno — sem travar
  if (store.get().journeyDone && baseScene) {
    const s = store.get();
    baseScene.showReturnState({
      name: s.certificateName || 'Explorador',
      visited: s.visited.length,
      missions: Object.keys(s.completedMissions).length,
      score: Object.values(s.completedMissions).reduce((acc, m: any) => acc + (m.score || 0), 0),
    });
  }
  rebuildSelectable();
}

function startBaseJourney() {
  if (!baseScene) return;
  baseScene.startJourney(
    buildBaseQuestions(),
    () => { store.setJourneyDone(); goBackToHub(); },
    (pos, target) => { viajar(pos, target); },
  );
  rebuildSelectable();
}


function setScaleMode(m: ScaleMode) {
  scaleMode = m;
  store.setScaleMode(m);
  hud.setScaleMode(m);
  // O corpo em foco continua na origem: a origem flutuante absorve a mudança
  // de posição, e o observador mantém o enquadramento
  hub.setScaleMode(m, data);
  hub.applyFloatingOrigin();
  if (currentScene === 'base' || currentScene === 'lua') return;
  ajustarLimitesControles();
  if (currentScene === 'hub') {
    viajar(VISTA_GERAL[m].clone(), ORIGEM);
    atualizarIndicadorEscala();
  } else if (selectedBodyId) {
    atualizarIndicadorEscala(data.bodies.find((b) => b.id === selectedBodyId));
  }
}

function showCertificate() {
  const saved = store.get().certificateName || '';
  const name = saved || 'Explorador';
  store.setCertificate(name);
  hud.showCertificate(name, store.get().certificateDate!);
}

function buildGrandeMissaoQuestions(): MissionQuestion[] {
  const all: MissionQuestion[] = [];
  const pool = questionPool as Record<string, Record<string, MissionQuestion[]>>;
  const portalUnlocked = hub.exoPortal?.unlocked ?? false;
  for (const b of data.bodies) {
    if (b.type === 'belt') continue;
    if (b.type === 'exoplanet' && !portalUnlocked) continue;
    all.push(b.mission.easy, b.mission.medium);
    const bp = pool[b.id];
    if (bp?.easy)   all.push(...bp.easy);
    if (bp?.medium) all.push(...bp.medium);
  }
  // Fisher-Yates shuffle e seleciona 10
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, 10);
}

// --- Gravação de tela: captura o canvas 3D + áudio do jogo ---
// O vídeo sai limpo (sem menus HTML). Narração por voz (speechSynthesis)
// não é capturável pelo navegador — só os sons sintetizados entram.
const REC_MAX_S = 180;
let recorder: MediaRecorder | null = null;
let recChunks: Blob[] = [];
let recTimeout: number | null = null;

function toggleRecording() {
  if (recorder) { stopRecording(); return; }
  audio.click();
  const stream = canvas.captureStream(30);
  const audioStream = audio.captureStream();
  if (audioStream) for (const t of audioStream.getAudioTracks()) stream.addTrack(t);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    .find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
  } catch {
    hud.showBadgeToast('⚠️', 'Gravação indisponível', 'Este navegador não suporta gravar a tela.');
    recorder = null;
    return;
  }
  recChunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) recChunks.push(e.data); };
  recorder.start(1000);
  hud.setRecordingState(true);
  // Limite para não estourar a memória do celular
  recTimeout = window.setTimeout(() => stopRecording(), REC_MAX_S * 1000);
}

function stopRecording() {
  if (!recorder) return;
  if (recTimeout !== null) { clearTimeout(recTimeout); recTimeout = null; }
  const r = recorder;
  const mime = r.mimeType || 'video/webm';
  recorder = null;
  hud.setRecordingState(false);
  audio.click();
  r.onstop = () => {
    const blob = new Blob(recChunks, { type: mime });
    recChunks = [];
    if (blob.size > 0) hud.showVideoPreview(blob);
  };
  r.stop();
}

// --- Sessão VR: menu de modo na entrada, passeio automático opcional ---
let vrStartMenu: VRStartMenu | null = null;

// Passeio automático: a nave viaja sozinha de corpo em corpo com narração.
// Qualquer gaze num planeta interrompe e devolve o controle manual.
const TOUR_STOPS = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const TOUR_DWELL_S = 30;
let vrTour: { i: number; t: number } | null = null;

function startVRTour() {
  vrTour = { i: 0, t: 0 };
  hud.hidePlanet();
  // Fora do VR ("modo cinema"), mostra a barra com botão de parar
  if (!engine.isPresenting) hud.showTourBanner(() => stopVRTour());
  audio.speak('Iniciando passeio pelo Sistema Solar. Relaxe e aproveite a viagem!');
  tourVisit(TOUR_STOPS[0]);
}

function stopVRTour() {
  if (!vrTour) return;
  vrTour = null;
  audio.stopSpeaking();
  hud.hideTourBanner();
}

function tourVisit(id: string) {
  const bodyData = data.bodies.find((b) => b.id === id);
  if (!bodyData) return;
  audio.transition();
  if (id === 'moon') {
    trocarFoco('earth');
    hub.applyFloatingOrigin();
    hub.group.updateMatrixWorld(true);
    const moonPos = new THREE.Vector3();
    hub.moonBase!.moonGroup.getWorldPosition(moonPos);
    viajar(moonPos.clone().add(new THREE.Vector3(0, 2, 5)), moonPos, () => {
      audio.arrival('moon');
      audio.speak(`Lua. ${bodyData.curiosities[0] ?? ''}`);
      if (!engine.isPresenting) hud.showNarrativeBubble('JUAN_GUI7', '#7dd3fc', `🌙 Lua — ${bodyData.curiosities[0] ?? ''}`);
    });
    return;
  }
  trocarFoco(id);
  viajar(pontoDeChegada(new THREE.Vector3()), ORIGEM, () => {
    audio.arrival(bodyData.type);
    audio.speak(`${bodyData.name}. ${bodyData.curiosities[0] ?? ''}`);
    if (!engine.isPresenting) hud.showNarrativeBubble('JUAN_GUI7', '#7dd3fc', `${bodyData.name} — ${bodyData.curiosities[0] ?? ''}`);
  });
}

engine.renderer.xr.addEventListener('sessionstart', () => {
  // VR só funciona no espaço: se estava na base ou na Lua, volta ao hub
  if (currentScene === 'base' || currentScene === 'lua') goBackToHub();
  transition = null;
  controls.enabled = false;
  engine.camera.position.set(0, 0, 0);
  engine.camera.quaternion.identity();
  // Posicionar rig no plano orbital (y=12) olhando horizontalmente para o Sol
  // — o usuário vê os planetas distribuídos à frente em vez de precisar olhar para cima
  const vrPos = new THREE.Vector3(0, 12, 480);
  posicionarObservador(vrPos, ORIGEM);
  stopVRTour();
  vrStartMenu?.dispose();
  vrStartMenu = new VRStartMenu(engine.rig);
  rebuildSelectable();
});

engine.renderer.xr.addEventListener('sessionend', () => {
  stopVRTour();
  vrStartMenu?.dispose();
  vrStartMenu = null;
  const pos = engine.rig.position.clone();
  engine.rig.position.set(0, 0, 0);
  engine.rig.rotation.set(0, 0, 0);
  engine.camera.aspect = window.innerWidth / window.innerHeight;
  engine.camera.updateProjectionMatrix();
  controls.enabled = true;
  posicionarObservador(pos, currentScene === 'base' ? new THREE.Vector3(0, 2, 0) : ORIGEM);
  rebuildSelectable();
});

// Menor distância da câmera até a superfície de algum corpo — define o near
function superficieMaisProxima(camPos: THREE.Vector3): number {
  let min = Infinity;
  for (const b of hub.bodies.values()) {
    _tmp.copy(b.group.position).add(hub.group.position);
    min = Math.min(min, camPos.distanceTo(_tmp) - raioEnquadramento(b));
  }
  return min;
}

// loading
const loading = document.getElementById('loading') as HTMLElement;
const fill = loading.querySelector('.loading__fill') as HTMLElement;
let progressPct = 0;
const loadInterval = setInterval(() => {
  progressPct = Math.min(100, progressPct + 8);
  fill.style.width = progressPct + '%';
  if (progressPct >= 100) {
    clearInterval(loadInterval);
    setTimeout(() => loading.classList.add('hidden'), 300);
  }
}, 80);

posicionarObservador(VISTA_GERAL[scaleMode], ORIGEM);
ajustarLimitesControles();

// render loop
engine.onUpdate((dt) => {
  perf?.update(dt);
  if (transition) {
    stepTransition(transition, dt, engine.camera, controls);
    if (transition.elapsed >= transition.duration) transition = null;
  }
  // Em VR a pose da câmera é do headset; o OrbitControls brigaria com ela
  if (!engine.isPresenting) controls.update();
  fade.update(dt);

  if (currentScene === 'base') {
    baseScene?.update(dt, timeSpeed);
    engine.setClipPlanes(BASE_NEAR, BASE_FAR);
    if (baseScene && baseScene.shakeIntensity > 0) {
      engine.camera.position.x += (Math.random() - 0.5) * baseScene.shakeIntensity;
      engine.camera.position.y += (Math.random() - 0.5) * baseScene.shakeIntensity * 0.4;
      engine.camera.position.z += (Math.random() - 0.5) * baseScene.shakeIntensity * 0.3;
    }
  } else if (currentScene === 'lua' && moonScene) {
    moonScene.update(dt);
    engine.setClipPlanes(0.05, 1500);
    // Câmera acompanha o Juan suavemente
    controls.target.lerp(_tmp.copy(moonScene.juanPosition).add(_delta.set(0, 1, 0)), 0.08);
    engine.camera.getWorldPosition(_camPos);
    starfield.position.copy(_camPos);
    starfield.scale.setScalar(1.2);
    skybox.position.copy(_camPos);
    skybox.scale.setScalar(1.26);
  } else {
    hub.update(dt, timeSpeed, engine.camera);
    hub.applyFloatingOrigin();
    engine.camera.getWorldPosition(_camPos);
    const near = clamp(superficieMaisProxima(_camPos) * NEAR_FRACAO_SUPERFICIE, NEAR_MIN, NEAR_MAX);
    const far = _camPos.length() + sceneExtent(scaleMode) * 1.2;
    engine.setClipPlanes(near, far);
    // Estrelas e skybox centrados no observador, logo antes do far
    starfield.position.copy(_camPos);
    starfield.scale.setScalar((engine.camera.far * 0.8) / 1000);
    skybox.position.copy(_camPos);
    skybox.scale.setScalar((engine.camera.far * 0.8) / 950);
  }
  if (engine.isPresenting) vrStartMenu?.update(dt);
  // Passeio automático (VR ou modo cinema): avança após o tempo de contemplação
  if (vrTour && (currentScene === 'hub' || currentScene === 'planet')) {
    vrTour.t += dt;
    if (vrTour.t >= TOUR_DWELL_S) {
      vrTour.t = 0;
      vrTour.i = (vrTour.i + 1) % TOUR_STOPS.length;
      tourVisit(TOUR_STOPS[vrTour.i]);
    }
  }
  xr.update(dt, selectable);
});

// VR button
document.addEventListener('xr:enter', () => xr.enterVR());

engine.start();

// Exportação do certificado como imagem (canvas 2D, sem dependências externas)
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t && t.id === 'cert-export') {
    const name = (document.querySelector('.cert__card .name') as HTMLElement)?.textContent || 'Explorador';
    const date = new Date().toLocaleDateString('pt-BR');
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏅 Certificado', canvas.width / 2, 120);
    ctx.fillStyle = '#e8eef7';
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillText('Explorador do Sistema Solar', canvas.width / 2, 180);
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText(name, canvas.width / 2, 300);
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = '#e8eef7';
    ctx.fillText('Concluiu a missão de exploração do sistema solar.', canvas.width / 2, 400);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Data: ' + date, canvas.width / 2, 520);
    ctx.font = '60px system-ui, sans-serif';
    ctx.fillText('🚀🪐✨', canvas.width / 2, 620);
    const link = document.createElement('a');
    link.download = 'certificado.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
});
