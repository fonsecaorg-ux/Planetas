import type { ProgressState, ScaleMode, Difficulty, MissionRecord } from '@/data/types';

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
