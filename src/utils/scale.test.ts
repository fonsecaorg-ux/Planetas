import { describe, it, expect } from 'vitest';
import corpos from '../data/corpos.json';
import type { BodyData, ScaleMode } from '../data/types';
import {
  bodyRadius,
  orbitDistance,
  moonDistance,
  systemRadius,
  scalePointKm,
  ANEL_EXTERNO,
  ANEL_FINO_EXTERNO,
  RAIO_MINIMO,
} from './scale';

const bodies = (corpos as unknown as { bodies: BodyData[] }).bodies;
const sol = bodies.find((b) => b.id === 'sun')!;
const terra = bodies.find((b) => b.id === 'earth')!;

// Corpos que orbitam no hub: tudo menos o Sol, cinturões e exoplanetas
const orbitantes = bodies
  .filter((b) => b.id !== 'sun' && b.type !== 'belt' && b.type !== 'exoplanet')
  .sort((a, b) => a.distanceKm - b.distanceKm);

const MODOS: ScaleMode[] = ['visual', 'real'];

describe('tamanho dos corpos', () => {
  it('mantém a proporção real Sol/Terra', () => {
    expect(bodyRadius(sol.radiusKm) / bodyRadius(terra.radiusKm)).toBeCloseTo(696340 / 6371, 3);
  });

  it('Terra tem 1 unidade de raio', () => {
    expect(bodyRadius(terra.radiusKm)).toBe(1);
  });

  it('aplica o piso só em corpos minúsculos', () => {
    expect(bodyRadius(11.27)).toBe(RAIO_MINIMO); // Fobos
    expect(bodyRadius(1737.4)).toBeGreaterThan(RAIO_MINIMO); // Lua
  });
});

describe.each(MODOS)('órbitas no modo %s', (modo) => {
  it('nenhum sistema encosta no Sol', () => {
    const raioSol = bodyRadius(sol.radiusKm);
    for (const b of orbitantes) {
      const bordaInterna = orbitDistance(b.distanceKm, modo) - systemRadius(b, modo);
      expect(bordaInterna, b.id).toBeGreaterThan(raioSol * 1.1);
    }
  });

  it('preserva a ordem das distâncias', () => {
    for (let i = 1; i < orbitantes.length; i++) {
      const anterior = orbitDistance(orbitantes[i - 1].distanceKm, modo);
      const atual = orbitDistance(orbitantes[i].distanceKm, modo);
      expect(atual, `${orbitantes[i - 1].id} < ${orbitantes[i].id}`).toBeGreaterThan(anterior);
    }
  });

  it('sistemas vizinhos não se sobrepõem', () => {
    for (let i = 1; i < orbitantes.length; i++) {
      const a = orbitantes[i - 1];
      const b = orbitantes[i];
      const vao = orbitDistance(b.distanceKm, modo) - orbitDistance(a.distanceKm, modo);
      expect(vao, `${a.id} × ${b.id}`).toBeGreaterThan(systemRadius(a, modo) + systemRadius(b, modo));
    }
  });

  it('luas ficam fora do planeta e dos anéis', () => {
    for (const b of orbitantes) {
      const r = bodyRadius(b.radiusKm);
      const limite = b.rings ? r * (b.thinRings ? ANEL_FINO_EXTERNO : ANEL_EXTERNO) : r;
      for (const s of b.satellites ?? []) {
        const d = moonDistance(s.distanceKm, b.radiusKm, modo);
        expect(d - bodyRadius(s.radiusKm), `${b.id}/${s.id}`).toBeGreaterThan(limite);
      }
    }
  });
});

describe('compressão de pontos em km', () => {
  it('ponto no raio da órbita da Terra cai na órbita da Terra', () => {
    const [x] = scalePointKm(terra.distanceKm, 0, 0, 'visual');
    expect(x).toBeCloseTo(orbitDistance(terra.distanceKm, 'visual'), 6);
  });

  it('origem continua na origem', () => {
    expect(scalePointKm(0, 0, 0, 'visual')).toEqual([0, 0, 0]);
  });
});
