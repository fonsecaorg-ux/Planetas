import * as THREE from 'three';
import catalogData from '@/data/estrelas.json';

// Paleta por tipo espectral (mesma usada no catálogo)
// 0=OB (azul), 1=A (branco-azulado), 2=FG (branco-amarelado), 3=K (laranja), 4=M (vermelho)
const SPECTRAL_RGB: [number, number, number][] = [
  [0.6, 0.7, 1.0],   // O/B
  [0.85, 0.9, 1.0],  // A
  [1.0, 1.0, 0.95],  // F/G
  [1.0, 0.85, 0.6],  // K
  [1.0, 0.6, 0.4],   // M
];

const STAR_RADIUS = 900;

// RA (horas) + Dec (graus) → vetor unitário na convenção Three.js (Y-up)
// x = cos(dec)·cos(ra),  y = sin(dec),  z = cos(dec)·sin(ra)
function radec2xyz(ra_h: number, dec_deg: number): [number, number, number] {
  const ra = ra_h * (Math.PI / 12);   // horas → radianos
  const dc = dec_deg * (Math.PI / 180);
  const cd = Math.cos(dc);
  return [cd * Math.cos(ra), Math.sin(dc), cd * Math.sin(ra)];
}

/**
 * Campo de estrelas com posições reais do catálogo Yale BSC5 / HYG.
 *
 * As 120 estrelas mais brilhantes (mag < 3.5) estão hardcoded em estrelas.json
 * com posições precisas J2000.  As restantes são geradas proceduralmente com
 * distribuição estatística Hipparcos para completar o céu.
 * Execute scripts/process-hyg.mjs para substituir o JSON por dados completos.
 */
export function createStarfield(totalCount = 6000): THREE.Points {
  const catalog = (catalogData as any).s as [number, number, number, number][];

  const count = Math.max(totalCount, catalog.length);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  // ── Estrelas do catálogo (posições reais) ──────────────────────────────────
  for (let i = 0; i < catalog.length; i++) {
    const [ra, dec, mag, sp] = catalog[i];
    const [x, y, z] = radec2xyz(ra, dec);
    const r = STAR_RADIUS;
    positions[i * 3]     = x * r;
    positions[i * 3 + 1] = y * r;
    positions[i * 3 + 2] = z * r;

    const brightness = Math.pow(10, -0.4 * (mag - 1.5));
    const spIdx = Math.min(Math.max(sp ?? 2, 0), 4);
    const c = SPECTRAL_RGB[spIdx];
    colors[i * 3]     = c[0] * brightness;
    colors[i * 3 + 1] = c[1] * brightness;
    colors[i * 3 + 2] = c[2] * brightness;
    sizes[i] = Math.max(0.8, 2.8 - mag * 0.3);
  }

  // ── Fundo procedural (distribuição Hipparcos, mag 3.5–6) ──────────────────
  for (let i = catalog.length; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = STAR_RADIUS + Math.random() * 20;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const mag = 3.5 + Math.pow(Math.random(), 0.5) * 2.5;
    const brightness = Math.pow(10, -0.4 * (mag - 1.5));
    const ci = Math.floor(Math.random() * SPECTRAL_RGB.length);
    const c = SPECTRAL_RGB[ci];
    colors[i * 3]     = c[0] * brightness;
    colors[i * 3 + 1] = c[1] * brightness;
    colors[i * 3 + 2] = c[2] * brightness;
    sizes[i] = Math.max(0.4, 2.0 - mag * 0.25);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 1.2,
    vertexColors: true,
    sizeAttenuation: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
