import * as THREE from 'three';
import type { BodyData, ScaleMode } from '@/data/types';
import { orbitDistance, UA_KM } from '@/utils/scale';

// Partículas com tamanho fixo em pixels: o cinturão vai de centenas a dezenas
// de milhares de unidades conforme o modo; tamanho em unidades de mundo
// viraria pó invisível em um modo e blocos gigantes no outro.
const TAMANHO_PX_ASTEROIDES = 1.6;
const TAMANHO_PX_KUIPER = 1.3;

export class Belt {
  readonly data: BodyData;
  readonly group: THREE.Group;
  private points: THREE.Points;
  private scaleMode: ScaleMode;

  constructor(data: BodyData, scaleMode: ScaleMode) {
    this.data = data;
    this.scaleMode = scaleMode;
    this.group = new THREE.Group();
    this.points = this.build();
    this.group.add(this.points);
  }

  private radiusRange(): [number, number] {
    // asteroid belt: 2.1-3.3 AU; kuiper: 30-55 AU
    if (this.data.id === 'asteroid-belt') return [2.1, 3.3];
    return [30, 55];
  }

  private build(): THREE.Points {
    const asteroides = this.data.id === 'asteroid-belt';
    const count = asteroides ? 1200 : 2000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const [rMin, rMax] = this.radiusRange();
    for (let i = 0; i < count; i++) {
      const au = rMin + Math.random() * (rMax - rMin);
      const d = orbitDistance(au * UA_KM, this.scaleMode);
      const theta = Math.random() * Math.PI * 2;
      const incl = (Math.random() - 0.5) * 0.15;
      positions[i * 3] = Math.cos(theta) * d;
      positions[i * 3 + 1] = Math.sin(incl) * d * 0.05;
      positions[i * 3 + 2] = Math.sin(theta) * d;
      const c = 0.5 + Math.random() * 0.3;
      colors[i * 3] = c; colors[i * 3 + 1] = c * 0.9; colors[i * 3 + 2] = c * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: asteroides ? TAMANHO_PX_ASTEROIDES : TAMANHO_PX_KUIPER,
      vertexColors: true,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
    });
    return new THREE.Points(geo, mat);
  }

  update(dt: number, timeSpeed: number) {
    this.group.rotation.y += 0.001 * dt * timeSpeed;
  }

  setScaleMode(mode: ScaleMode) {
    this.scaleMode = mode;
    this.group.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points = this.build();
    this.group.add(this.points);
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
