import type { ProgressState, ScaleMode, Difficulty, MissionRecord, DiaryEntry } from '@/data/types';

// XP/Level system
export const XP_LEVELS = [
  { level: 1,  minXP: 0,    name: 'Recruta' },
  { level: 2,  minXP: 100,  name: 'Cadete' },
  { level: 3,  minXP: 250,  name: 'Piloto' },
  { level: 4,  minXP: 450,  name: 'Explorador' },
  { level: 5,  minXP: 700,  name: 'Veterano' },
  { level: 6,  minXP: 1000, name: 'Especialista' },
  { level: 7,  minXP: 1350, name: 'Cientista' },
  { level: 8,  minXP: 1750, name: 'Comandante' },
  { level: 9,  minXP: 2200, name: 'General' },
  { level: 10, minXP: 2700, name: 'Almirante Galáctico' },
];

export function getLevelForXP(xp: number): { level: number; name: string; nextXP: number } {
  let entry = XP_LEVELS[0];
  for (const e of XP_LEVELS) {
    if (xp >= e.minXP) entry = e;
    else break;
  }
  const idx = XP_LEVELS.indexOf(entry);
  const nextXP = idx < XP_LEVELS.length - 1 ? XP_LEVELS[idx + 1].minXP : entry.minXP;
  return { level: entry.level, name: entry.name, nextXP };
}

const KEY = 'solar-explorer:progress:v3';
const SCHEMA_VERSION = 3;

const DEFAULT: ProgressState = {
  version: SCHEMA_VERSION,
  visited: [],
  completedMissions: {},
  certificateName: null,
  certificateDate: null,
  scaleMode: 'visual',
  timeSpeed: 1,
  onboardingDone: false,
  activeAstronaut: null,
};

export class ProgressStore {
  private state: ProgressState;

  constructor() {
    this.state = this.load();
  }

  private load(): ProgressState {
    try {
      let raw = localStorage.getItem(KEY)
        || localStorage.getItem('solar-explorer:progress:v2')
        || localStorage.getItem('solar-explorer:progress:v1');
      if (!raw) return { ...DEFAULT };
      const parsed = JSON.parse(raw) as ProgressState;
      // Migração v2→v3: completedMissions tinha { difficulty, correct, at }
      // agora tem { easy?, medium? } para não sobrescrever acertos entre dificuldades
      if (parsed.completedMissions) {
        for (const [key, val] of Object.entries(parsed.completedMissions)) {
          if ('difficulty' in (val as object)) {
            const old = val as { difficulty: Difficulty; correct: boolean; at: number };
            const rec: MissionRecord = {};
            rec[old.difficulty] = { correct: old.correct, at: old.at };
            parsed.completedMissions[key] = rec;
          }
        }
      }
      return { ...DEFAULT, ...parsed, version: SCHEMA_VERSION };
    } catch {
      return { ...DEFAULT };
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* storage indisponível — segue em memória */
    }
    this.onSave?.();
  }

  get(): ProgressState {
    return this.state;
  }

  markVisited(id: string) {
    if (!this.state.visited.includes(id)) {
      this.state.visited.push(id);
      this.save();
    }
  }

  recordMission(bodyId: string, difficulty: Difficulty, correct: boolean) {
    const existing = this.state.completedMissions[bodyId] ?? {};
    // Preserva o acerto de outra dificuldade; sobrescreve apenas a dificuldade respondida
    this.state.completedMissions[bodyId] = { ...existing, [difficulty]: { correct, at: Date.now() } };
    this.save();
  }

  setScaleMode(m: ScaleMode) {
    this.state.scaleMode = m;
    this.save();
  }

  setTimeSpeed(v: number) {
    this.state.timeSpeed = v;
    this.save();
  }

  setCertificate(name: string) {
    this.state.certificateName = name;
    this.state.certificateDate = new Date().toISOString();
    this.save();
  }

  setOnboardingDone() {
    this.state.onboardingDone = true;
    this.save();
  }

  setActiveAstronaut(id: string | null) {
    this.state.activeAstronaut = id;
    this.save();
  }

  setJourneyDone() {
    this.state.journeyDone = true;
    this.save();
  }

  hasBadge(id: string): boolean {
    return (this.state.earnedBadges ?? []).includes(id);
  }

  addBadge(id: string): boolean {
    if (this.hasBadge(id)) return false;
    this.state.earnedBadges = [...(this.state.earnedBadges ?? []), id];
    this.save();
    return true;
  }

  /** Registra entrada no diário (uma por corpo; ignora duplicatas). */
  addDiaryEntry(entry: DiaryEntry) {
    const entries = this.state.diaryEntries ?? [];
    if (entries.some((e) => e.bodyId === entry.bodyId)) return;
    this.state.diaryEntries = [entry, ...entries];
    this.save();
  }

  getDiaryEntries(): DiaryEntry[] {
    return this.state.diaryEntries ?? [];
  }

  /** Adiciona XP e recalcula nível. Retorna resultado com flag de level-up. */
  addXP(amount: number): { xp: number; level: number; levelName: string; nextXP: number; leveledUp: boolean } {
    const before = this.state.xp ?? 0;
    const newXP = before + amount;
    this.state.xp = newXP;
    const result = getLevelForXP(newXP);
    const prevLevel = this.state.level ?? 1;
    const leveledUp = result.level > prevLevel;
    this.state.level = result.level;
    this.save();
    return { xp: newXP, level: result.level, levelName: result.name, nextXP: result.nextXP, leveledUp };
  }

  /** Registra descoberta de objeto oculto. Retorna true se foi novo. */
  discoverObject(id: string): boolean {
    const list = this.state.discoveredObjects ?? [];
    if (list.includes(id)) return false;
    this.state.discoveredObjects = [...list, id];
    this.save();
    return true;
  }

  /** Marca passo de capítulo como concluído. */
  completeChapterStep(chapterId: string, stepId: string) {
    const map = { ...(this.state.chapterStepsCompleted ?? {}) };
    const steps = map[chapterId] ?? [];
    if (!steps.includes(stepId)) {
      map[chapterId] = [...steps, stepId];
      this.state.chapterStepsCompleted = map;
      this.save();
    }
  }

  isChapterStepDone(chapterId: string, stepId: string): boolean {
    return (this.state.chapterStepsCompleted?.[chapterId] ?? []).includes(stepId);
  }

  isChapterComplete(chapterId: string, totalSteps: number): boolean {
    return (this.state.chapterStepsCompleted?.[chapterId] ?? []).length >= totalSteps;
  }

  /** Inicializa estado da missão semanal para a semana dada (apaga anterior). */
  initWeeklyMission(week: number) {
    if (this.state.weeklyMissionWeek === week) return;
    this.state.weeklyMissionWeek = week;
    this.state.weeklyMissionAnswered = Array(5).fill(false);
    this.state.weeklyMissionCorrect = Array(5).fill(false);
    this.save();
  }

  recordWeeklyAnswer(week: number, idx: number, correct: boolean) {
    if (this.state.weeklyMissionWeek !== week) this.initWeeklyMission(week);
    const answered = [...(this.state.weeklyMissionAnswered ?? Array(5).fill(false))];
    const correctArr = [...(this.state.weeklyMissionCorrect ?? Array(5).fill(false))];
    answered[idx] = true;
    correctArr[idx] = correct;
    this.state.weeklyMissionAnswered = answered;
    this.state.weeklyMissionCorrect = correctArr;
    this.save();
  }

  isWeeklyComplete(week: number): boolean {
    if (this.state.weeklyMissionWeek !== week) return false;
    return (this.state.weeklyMissionAnswered ?? []).every(Boolean);
  }

  /** Callback disparado após cada save — usado pelo cloudSync para debounce. */
  onSave?: () => void;

  reset() {
    this.state = { ...DEFAULT };
    this.save();
  }

  /** Exporta para sincronização futura com backend. */
  exportJSON(): string {
    return JSON.stringify(this.state);
  }

  importJSON(json: string) {
    try {
      const parsed = JSON.parse(json) as ProgressState;
      this.state = { ...DEFAULT, ...parsed, version: SCHEMA_VERSION };
      this.save();
    } catch {
      /* ignora */
    }
  }
}
