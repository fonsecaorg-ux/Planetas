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
  private dustRing: THREE.Mesh | null = null;
  private scaleMode: ScaleMode;

  constructor(data: BodyData, scaleMode: ScaleMode) {
    this.data = data;
    this.scaleMode = scaleMode;
    this.group = new THREE.Group();
    this.points = this.build();
    this.group.add(this.points);
    this.dustRing = this.buildDustRing();
    if (this.dustRing) this.group.add(this.dustRing);
  }

  private buildDustRing(): THREE.Mesh | null {
    if (this.data.id !== 'asteroid-belt') return null;
    const [rMin, rMax] = this.radiusRange();
    const inner = orbitDistance(rMin * UA_KM * 0.88, this.scaleMode);
    const outer = orbitDistance(rMax * UA_KM * 1.12, this.scaleMode);
    const geo = new THREE.RingGeometry(inner, outer, 128);
    // Reatribui UVs para gradient inner→outer (mesmo padrão dos anéis planetários)
    const pos = geo.attributes.position;
    const uv  = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const t = (Math.sqrt(x * x + y * y) - inner) / (outer - inner);
      uv.setXY(i, t, 0.5);
    }
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9a8060,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
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
    if (this.dustRing) {
      this.group.remove(this.dustRing);
      this.dustRing.geometry.dispose();
      (this.dustRing.material as THREE.Material).dispose();
    }
    this.dustRing = this.buildDustRing();
    if (this.dustRing) this.group.add(this.dustRing);
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    if (this.dustRing) {
      this.dustRing.geometry.dispose();
      (this.dustRing.material as THREE.Material).dispose();
    }
  }
}
