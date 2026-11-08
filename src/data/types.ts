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

export interface BodyData {
  id: string;
  name: string;
  type: BodyType;
  radiusKm: number;
  massKg: string;
  distanceAU: number;
  distanceKm: number;
  orbitalPeriodDays: number;
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

export interface ProgressState {
  version: number;
  visited: string[];
  completedMissions: Record<string, { difficulty: Difficulty; correct: boolean; at: number }>;
  certificateName: string | null;
  certificateDate: string | null;
  scaleMode: ScaleMode;
  timeSpeed: number;
  onboardingDone: boolean;
  activeAstronaut: string | null;
}
