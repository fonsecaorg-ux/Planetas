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

    // Rótulo
    const label = this.makeLabel(data.name);
    label.position.y = 1.6 + index * 0.1;
    this.group.add(label);

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
    const bodyColor = new THREE.Color(data.color);
    const accent = new THREE.Color(data.accent);
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4, metalness: 0.5 });
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.3, metalness: 0.6 });
    const height = 0.9 + index * 0.15;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, height * 0.7, 16), bodyMat);
    body.position.y = height * 0.35;
    body.castShadow = true;
    this.visual.add(body);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, height * 0.08, 16), accentMat);
    band.position.y = height * 0.5;
    this.visual.add(band);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, height * 0.2, 16), accentMat);
    nose.position.y = height * 0.8;
    nose.castShadow = true;
    this.visual.add(nose);

    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, height * 0.25, 0.12), bodyMat);
      const a = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.12, height * 0.12, Math.sin(a) * 0.12);
      fin.rotation.y = a;
      fin.castShadow = true;
      this.visual.add(fin);
    }
  }

  private makeLabel(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(0, 4, 256, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 24);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.4, 0.26, 1);
    return sprite;
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
