export type BodyType = 'star' | 'planet' | 'dwarf' | 'belt' | 'moon' | 'exoplanet';

export interface MissionQuestion {
  q: string;
  options: string[];
  answer: number;
}

export interface Mission {
  easy: MissionQuestion;
  medium: MissionQuestion;
}

export interface RocketData {
  id: string;
  name: string;
  model?: string;
  type: string;
  heightM: number;
  massKg: string;
  thrustKN: number;
  stages: number;
  payloadKg: number;
  deltaVms: number;
  crew: string[];
  color: string;
  accent: string;
  curiosities: string[];
  mission: string;
}

export interface AstronautData {
  id: string;
  name: string;
  gender: 'male' | 'female';
  model?: string;
  suitColor: string;
  helmetColor: string;
  skinColor?: string;
  eyeColor?: string;
  bio: string;
  role: string;
}

export interface SatelliteData {
  id: string;
  name: string;
  radiusKm: number;
  distanceKm: number;
  orbitalPeriodDays: number;
  texture?: string;
  color: string;
  hasAtmosphere?: boolean;
  retrograde?: boolean;
}

/** Elementos keplerianos JPL (época J2000.0) */
export interface OrbitalElements {
  /** Semi-eixo maior em UA */
  a: number;
  /** Excentricidade */
  e: number;
  /** Inclinação em graus */
  i: number;
  /** Longitude do nó ascendente em graus */
  omega: number;
  /** Longitude do periélio em graus (= Ω + ω) */
  w_bar: number;
  /** Longitude média em J2000.0 em graus */
  L0: number;
}

export interface BodyData {
  id: string;
  name: string;
  type: BodyType;
  radiusKm: number;
  massKg: string;
  distanceAU: number;
  distanceKm: number;
  orbitalPeriodDays: number;
  orbitalElements?: OrbitalElements;
  rotationPeriodHours: number;
  temperatureK: number;
  gravityRelative: number;
  atmosphere: string;
  moons: number;
  color: string;
  texture?: string;
  nightTexture?: string;
  cloudTexture?: string;
  normalMap?: string;
  atmosphereGlow?: boolean;
  atmosphereColor?: string;
  atmosphereIntensity?: number;
  atmosphereScale?: number;
  animatedClouds?: boolean;
  rings?: boolean;
  thinRings?: boolean;
  tilt?: number;
  curiosities: string[];
  mission: Mission;
  satellites?: SatelliteData[];
}

export interface SolarSystemData {
  version: string;
  scaleAUkm: number;
  bodies: BodyData[];
}

export type ScaleMode = 'visual' | 'real';

export type Difficulty = 'easy' | 'medium';

export interface MissionRecord {
  easy?: { correct: boolean; at: number };
  medium?: { correct: boolean; at: number };
}

export interface ProgressState {
  version: number;
  visited: string[];
  completedMissions: Record<string, MissionRecord>;
  certificateName: string | null;
  certificateDate: string | null;
  scaleMode: ScaleMode;
  timeSpeed: number;
  onboardingDone: boolean;
  activeAstronaut: string | null;
  journeyDone?: boolean;
  earnedBadges?: string[];
  diaryEntries?: DiaryEntry[];
  stationModules?: string[];
  // Replayability systems
  xp?: number;
  level?: number;
  discoveredObjects?: string[];
  weeklyMissionWeek?: number;
  weeklyMissionAnswered?: boolean[];
  weeklyMissionCorrect?: boolean[];
  chapterStepsCompleted?: Record<string, string[]>;
}

export interface DiaryEntry {
  bodyId: string;
  name: string;
  type: BodyType;
  visitedAt: string; // ISO 8601
  curiosity: string; // primeira curiosidade do corpo
}

export interface HiddenObjectData {
  id: string;
  bodyId: string;
  name: string;
  fact: string;
  xp: number;
  offset: [number, number, number];
  color: string;
}

export type ChapterStepType = 'visit' | 'answer' | 'discover' | 'weekly' | 'grande';

export interface ChapterStep {
  id: string;
  type: ChapterStepType;
  bodyId?: string;
  count?: number;
  label: string;
}

export interface ChapterData {
  id: string;
  title: string;
  description: string;
  badge: string;
  xpReward: number;
  steps: ChapterStep[];
}
