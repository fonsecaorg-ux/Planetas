// Fonte única de escala do projeto. Nenhum outro arquivo converte km em
// unidades de cena por conta própria.
//
// Modelo no padrão Titans of Space:
// - Tamanho: proporção real entre todos os corpos, igual nos dois modos.
//   1 unidade = raio da Terra (Sol ≈ 109, Júpiter ≈ 11). Em VR, 1 unidade = 1 m
// - Distância: o modo muda só a distância.
//   "real" usa a mesma unidade do raio — vastidão verdadeira.
//   "visual" comprime com raiz quadrada da distância em UA, mantendo a ordem
//   das órbitas e garantindo cada sistema fora do Sol e sem sobrepor vizinhos

import type { ScaleMode } from '../data/types';

export const KM_POR_UNIDADE = 6371;
export const UA_KM = 149597870.7;

// Luas pequenas (Fobos, 11 km) ficariam com 0,002 unidade — invisíveis e
// impossíveis de mirar no celular. Só elas são afetadas pelo piso.
export const RAIO_MINIMO = 0.05;

const SOL_RAIO_KM = 696340;

// Compressão do modo visual: distância = raio do Sol + folga + K·√UA.
// Valores escolhidos para Mercúrio ficar a ~113 unidades da superfície do
// Sol e o vão Júpiter–Saturno (o mais apertado) comportar as duas luas mais
// externas. Alterar exige rodar scale.test.ts
const VISUAL_FOLGA_SOL = 20;
const VISUAL_K = 150;

// Luas no modo visual: distância relativa ao raio do planeta-mãe, também
// comprimida por raiz. Base acima do anel externo de Saturno (2,3 raios)
const LUA_BASE = 1.5;
const LUA_K = 0.6;

// Anéis em raios do planeta — compartilhado entre geometria e testes
export const ANEL_INTERNO = 1.4;
export const ANEL_EXTERNO = 2.3;
export const ANEL_FINO_INTERNO = 1.3;
export const ANEL_FINO_EXTERNO = 1.7;

export function bodyRadius(km: number): number {
  if (km <= 0) return 0;
  return Math.max(km / KM_POR_UNIDADE, RAIO_MINIMO);
}

export function orbitDistance(km: number, mode: ScaleMode): number {
  if (km <= 0) return 0;
  if (mode === 'real') return km / KM_POR_UNIDADE;
  return bodyRadius(SOL_RAIO_KM) + VISUAL_FOLGA_SOL + VISUAL_K * Math.sqrt(km / UA_KM);
}

export function moonDistance(km: number, parentRadiusKm: number, mode: ScaleMode): number {
  if (mode === 'real') return km / KM_POR_UNIDADE;
  return bodyRadius(parentRadiusKm) * (LUA_BASE + LUA_K * Math.sqrt(km / parentRadiusKm));
}

// Ponto em km (ex.: trajetória da Voyager) para cena. No modo visual a
// compressão é radial, a mesma das órbitas, para a curva acompanhar os planetas
export function scalePointKm(x: number, y: number, z: number, mode: ScaleMode): [number, number, number] {
  const r = Math.hypot(x, y, z);
  if (r === 0) return [0, 0, 0];
  const f = orbitDistance(r, mode) / r;
  return [x * f, y * f, z * f];
}

export interface CorpoComSistema {
  radiusKm: number;
  rings?: boolean;
  thinRings?: boolean;
  satellites?: { radiusKm: number; distanceKm: number }[];
}

// Raio que o corpo ocupa com anéis e luas — usado para checar sobreposição
// entre vizinhos e para enquadrar a câmera
export function systemRadius(b: CorpoComSistema, mode: ScaleMode): number {
  const r = bodyRadius(b.radiusKm);
  let ext = r;
  if (b.rings) ext = r * (b.thinRings ? ANEL_FINO_EXTERNO : ANEL_EXTERNO);
  for (const s of b.satellites ?? []) {
    ext = Math.max(ext, moonDistance(s.distanceKm, b.radiusKm, mode) + bodyRadius(s.radiusKm));
  }
  return ext;
}

// Maior distância que a cena precisa enxergar (Voyager ≈ 2,5e10 km)
export function sceneExtent(mode: ScaleMode): number {
  return orbitDistance(3e10, mode);
}

export function lightTravelSeconds(km: number): number {
  const c = 299792.458; // km/s
  return km / c;
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`;
  if (seconds < 31557600) return `${(seconds / 86400).toFixed(1)} dias`;
  return `${(seconds / 31557600).toFixed(1)} anos`;
}
