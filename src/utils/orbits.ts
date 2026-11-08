/**
 * Cálculo de posições planetárias por elementos keplerianos (JPL, época J2000.0).
 *
 * Formulação: Standish (1992) "Keplerian Elements for Approximate Positions of
 * the Major Planets", Astronomical Almanac 1990, pp. E46-E47.
 *
 * Precisão: ~0,5° para as próximas décadas (suficiente para visualização).
 * Sem perturbações de N-corpos — para simulação de alta precisão use o JPL HORIZONS.
 */

import * as THREE from 'three';
import type { OrbitalElements } from '@/data/types';
import { orbitDistance, UA_KM } from '@/utils/scale';
import type { ScaleMode } from '@/data/types';

// J2000.0 = 1º de janeiro de 2000, 12:00 TT = Unix timestamp (ms):
const J2000_MS = 946728000000;

export function daysSinceJ2000(date?: Date): number {
  const ms = date ? date.getTime() : Date.now();
  return (ms - J2000_MS) / 86400000;
}

/** Resolve a equação de Kepler M = E – e·sin(E) por iteração de Newton-Raphson. */
function solveKepler(M_rad: number, e: number): number {
  let E = M_rad;
  for (let n = 0; n < 10; n++) {
    const dE = (M_rad - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

function deg2rad(d: number) { return d * (Math.PI / 180); }

/**
 * Posição heliocêntrica eclíptica (J2000) em UA, retornada como vetor Three.js:
 *   Three.js X = X eclíptico
 *   Three.js Y = Z eclíptico (pólo norte)
 *   Three.js Z = Y eclíptico (segundo eixo no plano)
 *
 * Em seguida comprima com `scaleMode` para manter compatibilidade com as
 * demais distâncias da cena.
 */
function eclipticXYZ(el: OrbitalElements, days: number): [number, number, number] {
  const { a, e, i, omega, w_bar, L0 } = el;

  // Anomalia média M (graus) com taxa de variação kepleriana
  const n_deg_day = 360 / (365.25 * Math.pow(a, 1.5)); // 3ª lei de Kepler
  let M_deg = (L0 - w_bar) + n_deg_day * days;
  M_deg = ((M_deg % 360) + 360) % 360; // normaliza 0–360
  const M = deg2rad(M_deg);

  const E = solveKepler(M, e);

  // Anomalia verdadeira ν
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2),
  );

  const r = a * (1 - e * Math.cos(E)); // raio em UA

  // Argumento do periélio ω = ω̄ – Ω
  const w = deg2rad(w_bar - omega);
  const Om = deg2rad(omega);
  const inc = deg2rad(i);
  const u = nu + w; // argumento de latitude

  // Posição em coordenadas eclípticas
  const x = r * (Math.cos(Om) * Math.cos(u) - Math.sin(Om) * Math.sin(u) * Math.cos(inc));
  const y = r * (Math.sin(Om) * Math.cos(u) + Math.cos(Om) * Math.sin(u) * Math.cos(inc));
  const z = r * (Math.sin(u) * Math.sin(inc));

  return [x, y, z]; // UA: x/y no plano eclíptico, z = altura
}

/**
 * Posição em unidades de cena (modo visual ou real), pronta para atribuir
 * ao `group.position` de um corpo.
 *
 * A direção é preservada dos elementos keplerianos; apenas a distância
 * radial é comprimida (modo visual) ou mantida na escala real.
 */
export function keplerianPosition(
  el: OrbitalElements,
  scaleMode: ScaleMode,
  days?: number,
): THREE.Vector3 {
  const d = days ?? daysSinceJ2000();
  const [xe, ye, ze] = eclipticXYZ(el, d);

  const r_AU = Math.sqrt(xe * xe + ye * ye + ze * ze);
  if (r_AU === 0) return new THREE.Vector3();

  const r_scene = orbitDistance(r_AU * UA_KM, scaleMode);
  const scale = r_scene / r_AU;

  // Mapeamento eclíptico → Three.js (Y-cima = polo norte eclíptico)
  return new THREE.Vector3(xe * scale, ze * scale, ye * scale);
}

/**
 * Pontos (UA → cena) para desenhar a elipse orbital com inclinação real.
 * Segments: 128 é suficiente para uma elipse suave.
 */
export function keplerianOrbitPath(
  el: OrbitalElements,
  scaleMode: ScaleMode,
  segments = 128,
): THREE.Vector3[] {
  // Varre a anomalia verdadeira de 0 a 2π
  const pts: THREE.Vector3[] = [];
  const { a, e, i, omega, w_bar } = el;
  const w = deg2rad(w_bar - omega);
  const Om = deg2rad(omega);
  const inc = deg2rad(i);

  for (let k = 0; k <= segments; k++) {
    const nu = (k / segments) * 2 * Math.PI;
    const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
    const u = nu + w;
    const xe = r * (Math.cos(Om) * Math.cos(u) - Math.sin(Om) * Math.sin(u) * Math.cos(inc));
    const ye = r * (Math.sin(Om) * Math.cos(u) + Math.cos(Om) * Math.sin(u) * Math.cos(inc));
    const ze = r * Math.sin(u) * Math.sin(inc);

    const r_AU = Math.sqrt(xe * xe + ye * ye + ze * ze);
    const r_scene = r_AU > 0 ? orbitDistance(r_AU * UA_KM, scaleMode) : 0;
    const sc = r_AU > 0 ? r_scene / r_AU : 0;
    pts.push(new THREE.Vector3(xe * sc, ze * sc, ye * sc));
  }
  return pts;
}
