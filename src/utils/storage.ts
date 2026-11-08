import type { ProgressState, ScaleMode, Difficulty } from '@/data/types';

const KEY = 'solar-explorer:progress:v2';
const SCHEMA_VERSION = 2;

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
      let raw = localStorage.getItem(KEY);
      if (!raw) raw = localStorage.getItem('solar-explorer:progress:v1');
      if (!raw) return { ...DEFAULT };
      const parsed = JSON.parse(raw) as ProgressState;
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
    this.state.completedMissions[bodyId] = { difficulty, correct, at: Date.now() };
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
