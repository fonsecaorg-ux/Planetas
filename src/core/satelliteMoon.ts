import * as THREE from 'three';
import type { SatelliteData } from '@/data/types';
import { loadTexture } from '@/utils/textures';

// Raio mínimo visual para luas pequenas ficarem visíveis
const MIN_VISUAL_RADIUS = 0.045;

function buildMiniLabel(name: string): THREE.Sprite {
  const W = 128; const H = 28;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(2,10,24,0.65)';
  ctx.beginPath();
  ctx.roundRect(1, 2, W - 2, H - 4, 5);
  ctx.fill();
  ctx.strokeStyle = '#777799'; ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = '#ccccdd';
  ctx.font = "bold 13px 'Courier New', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), W / 2, H / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  sp.renderOrder = 14;
  sp.scale.set((W / H) * 0.6, 0.6, 1);
  return sp;
}

function buildOrbitCircle(radius: number): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x556677, transparent: true, opacity: 0.22, depthWrite: false });
  return new THREE.Line(geo, mat);
}

/**
 * Lua pequena orbitando um planeta (Fobos, Deimos, etc.).
 * Adicionar a body.group — o grupo orbita no referencial do planeta pai.
 */
export class SatelliteMoon {
  readonly group: THREE.Group;
  private mesh: THREE.Mesh;
  private t = 0;
  readonly orbitRadius: number;
  private periodS: number;

  constructor(data: SatelliteData, parentRadius: number, index: number) {
    this.group = new THREE.Group();

    // Raio visual da lua: mínimo garantido para visibilidade
    const visualRadius = Math.max(MIN_VISUAL_RADIUS, data.radiusKm / 6371);

    // Órbita visual: baseada no raio do planeta pai + espaçamento por índice
    this.orbitRadius = Math.max(
      parentRadius * 2.5 + index * parentRadius * 1.8,
      parentRadius + (data.distanceKm / (data.distanceKm + 1)) * parentRadius * 2,
    );
    this.periodS = data.orbitalPeriodDays * 24 * 3600;

    // Linha de órbita
    this.group.add(buildOrbitCircle(this.orbitRadius));

    // Mesh da lua
    const geo = new THREE.SphereGeometry(visualRadius, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.9 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.x = this.orbitRadius;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    // Label flutuante
    const label = buildMiniLabel(data.name);
    label.position.set(this.orbitRadius, visualRadius + 0.3, 0);
    this.group.add(label);

    // Textura se disponível
    if (data.texture) {
      loadTexture(data.texture, 'rocky', data.color).then(tex => {
        mat.map = tex;
        mat.color.setScalar(1);
        mat.needsUpdate = true;
      });
    }

    // Fase inicial aleatória para evitar que todas comecem no mesmo ponto
    this.t = Math.random() * this.periodS;
  }

  update(dt: number, timeSpeed: number) {
    this.t += dt * timeSpeed;
    const angle = (this.t / this.periodS) * Math.PI * 2;
    this.mesh.position.set(
      Math.cos(angle) * this.orbitRadius,
      0,
      Math.sin(angle) * this.orbitRadius,
    );
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
