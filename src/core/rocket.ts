import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RocketData } from '@/data/types';

const gltfLoader = new GLTFLoader();

// Partes do foguete Kenney (ordem de baixo para cima)
const KENNEY_PARTS = [
  'models/rocket_finsA.glb',
  'models/rocket_baseA.glb',
  'models/rocket_fuelA.glb',
  'models/rocket_topA.glb',
];

function buildFlameTexture(): THREE.Texture {
  const W = 64; const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Chama: branco quente no centro → laranja → transparente na borda
  const grad = ctx.createRadialGradient(W / 2, H * 0.75, 2, W / 2, H * 0.75, W * 0.5);
  grad.addColorStop(0,   'rgba(255,255,220,1.0)');
  grad.addColorStop(0.25,'rgba(255,200,60,0.95)');
  grad.addColorStop(0.55,'rgba(255,100,20,0.7)');
  grad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Rocket {
  readonly data: RocketData;
  readonly group: THREE.Group;
  readonly hitbox: THREE.Mesh;
  private visual: THREE.Group;
  private t = 0;
  private launching = false;
  private launchT = 0;
  private baseY = 0;
  private flameSprite: THREE.Sprite | null = null;
  private disposed = false;

  constructor(data: RocketData, index: number) {
    this.data = data;
    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.group.add(this.visual);

    // Sempre tenta montar o foguete com partes Kenney primeiro
    this.loadKenneyParts(data, index);

    // Hitbox
    const hbGeo = new THREE.SphereGeometry(0.9, 8, 8);
    const hbMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(hbGeo, hbMat);
    this.hitbox.position.y = 0.6;
    this.group.add(this.hitbox);
    (this.hitbox as any).userData = { bodyId: `rocket:${data.id}` };

    // Chama Sprite (AdditiveBlending) — funciona tanto com Kenney quanto procedural
    const flameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: buildFlameTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0,
    }));
    flameSprite.scale.set(0.35, 0.65, 1);
    flameSprite.position.y = -0.1;
    flameSprite.renderOrder = 10;
    this.visual.add(flameSprite);
    this.flameSprite = flameSprite;

    // Posição padrão ao redor da Terra
    const radius = 3.5 + index * 0.8;
    const angle = (index / 3) * Math.PI * 2 + 1.0;
    this.group.position.set(Math.cos(angle) * radius, -0.5, Math.sin(angle) * radius);
    this.baseY = -0.5;
    this.group.rotation.z = 0.15;
  }

  private loadKenneyParts(data: RocketData, index: number) {
    let loaded = 0;
    const models: (THREE.Group | null)[] = new Array(KENNEY_PARTS.length).fill(null);

    KENNEY_PARTS.forEach((path, pi) => {
      gltfLoader.load(
        path,
        (gltf) => {
          if (this.disposed) return;
          models[pi] = gltf.scene;
          loaded++;
          if (loaded === KENNEY_PARTS.length) this._assembleKenneyRocket(models, data, index);
        },
        undefined,
        () => {
          // parte ausente: conta mesmo assim
          loaded++;
          if (loaded === KENNEY_PARTS.length) {
            if (this.disposed) return;
            const hasAny = models.some(Boolean);
            if (hasAny) this._assembleKenneyRocket(models, data, index);
            else        this.buildProcedural(data, index);
          }
        },
      );
    });
  }

  private _assembleKenneyRocket(models: (THREE.Group | null)[], data: RocketData, index: number) {
    if (this.disposed) return;
    const bodyColor = new THREE.Color(data.color);
    const accentColor = new THREE.Color(data.accent);
    let currentY = 0;

    models.forEach((model, mi) => {
      if (!model) return;

      // Medir antes de modificar
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Colorir: peças pares com cor principal, ímpares com accent
      model.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).material = new THREE.MeshStandardMaterial({
            color: mi % 2 === 0 ? bodyColor : accentColor,
            roughness: 0.4,
            metalness: 0.5,
          });
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      // Centralizar horizontalmente e empilhar
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y += currentY - box.min.y;
      currentY += size.y;

      this.visual.add(model);
    });

    // Escalar para altura alvo (pequeno para caber na cena)
    const totalBox = new THREE.Box3().setFromObject(this.visual);
    const totalSize = new THREE.Vector3();
    totalBox.getSize(totalSize);
    if (totalSize.y > 0) {
      const targetH = 1.3 + index * 0.2;
      const s = targetH / totalSize.y;
      this.visual.scale.setScalar(s);
    }
  }

  private buildProcedural(data: RocketData, index: number) {
    if (this.disposed) return;
    const sc = new THREE.Color(data.color);
    const ac = new THREE.Color(data.accent);
    const H  = 1.0 + index * 0.12;
    const R  = H / 14;

    const bodyMat   = new THREE.MeshStandardMaterial({ color: sc, roughness: 0.35, metalness: 0.3 });
    const accentMat = new THREE.MeshStandardMaterial({ color: ac, roughness: 0.3,  metalness: 0.5 });
    const darkMat   = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.5, metalness: 0.4 });
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.3, metalness: 0.85 });

    // 1º estágio
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.03, H * 0.58, 20), bodyMat);
    s1.position.y = H * 0.29; s1.castShadow = true;
    this.visual.add(s1);

    // faixa de accent
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.002, R * 1.002, H * 0.025, 20), accentMat);
    stripe.position.y = H * 0.18;
    this.visual.add(stripe);

    // interstage
    const ist = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, H * 0.025, 20), darkMat);
    ist.position.y = H * 0.593;
    this.visual.add(ist);

    // 2º estágio
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.98, H * 0.19, 20), bodyMat);
    s2.position.y = H * 0.595 + H * 0.19 * 0.5; s2.castShadow = true;
    this.visual.add(s2);

    // ogiva
    const og = new THREE.Mesh(new THREE.ConeGeometry(R * 0.95, H * 0.17, 20), bodyMat);
    og.position.y = H * 0.595 + H * 0.19 + H * 0.085; og.castShadow = true;
    this.visual.add(og);

    // bocais (1 central + 4 externos)
    for (let i = 0; i < 5; i++) {
      const a = i === 0 ? 0 : ((i - 1) / 4) * Math.PI * 2;
      const ex = i === 0 ? 0 : Math.cos(a) * R * 0.5;
      const ez = i === 0 ? 0 : Math.sin(a) * R * 0.5;
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.09, R * 0.14, R * 0.3, 10), nozzleMat);
      nozzle.rotation.x = Math.PI;
      nozzle.position.set(ex, 0, ez);
      this.visual.add(nozzle);
    }

    // grid fins
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(H * 0.025, H * 0.04, H * 0.048), darkMat);
      fin.position.set(Math.cos(a) * R * 1.1, H * 0.54, Math.sin(a) * R * 1.1);
      fin.rotation.y = a;
      this.visual.add(fin);
    }

    // pernas de pouso (dobradas)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(H * 0.012, H * 0.1, H * 0.012), darkMat);
      leg.position.set(Math.cos(a) * R * 0.9, H * 0.055, Math.sin(a) * R * 0.9);
      leg.rotation.y = a; leg.rotation.z = 0.25;
      this.visual.add(leg);
    }
  }

  launch() {
    this.launching = true;
    this.launchT = 0;
    this.baseY = this.group.position.y;
  }

  update(dt: number, timeSpeed: number) {
    this.t += dt * timeSpeed;

    if (this.launching) {
      this.launchT += dt * timeSpeed;
      this.group.position.y = this.baseY + this.launchT * 4;
      this.group.rotation.z = 0.15 * (1 - Math.min(this.launchT, 1));

      if (this.flameSprite) {
        const scale = 0.35 + this.launchT * 0.8;
        const flicker = 0.85 + Math.random() * 0.3;
        this.flameSprite.scale.set(scale * 0.6 * flicker, scale * flicker, 1);
        (this.flameSprite.material as THREE.SpriteMaterial).opacity = 0.9;
      }

      if (this.launchT > 2.0) {
        this.launching = false;
        this.group.position.y = this.baseY;
        this.group.rotation.z = 0.15;
        if (this.flameSprite) {
          (this.flameSprite.material as THREE.SpriteMaterial).opacity = 0;
          this.flameSprite.scale.set(0.35, 0.65, 1);
        }
      }
    } else {
      this.group.rotation.z = 0.15 + Math.sin(this.t * 1.5) * 0.05;
      // Chama de idle: pequena, piscando levemente
      if (this.flameSprite) {
        (this.flameSprite.material as THREE.SpriteMaterial).opacity = 0.12 + Math.sin(this.t * 8) * 0.06;
        this.flameSprite.scale.set(0.2, 0.3, 1);
      }
    }
  }

  dispose() {
    this.disposed = true;
  }
}
