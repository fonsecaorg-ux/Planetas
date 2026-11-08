import corpos from './corpos.json';
import type { SolarSystemData } from './types';

export function loadSolarSystemData(): SolarSystemData {
  return corpos as unknown as SolarSystemData;
}

export function findBody(data: SolarSystemData, id: string) {
  return data.bodies.find((b) => b.id === id);
}
