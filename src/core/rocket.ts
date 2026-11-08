import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RocketData } from '@/data/types';

const gltfLoader = new GLTFLoader();

export class Rocket {
  readonly data: RocketData;
  readonly group: THREE.Group;
  readonly hitbox: THREE.Mesh;
  private visual: THREE.Group;
  private t = 0;
  private launching = false;
  private launchT = 0;
  private baseY = 0;
  private flame: THREE.Mesh | null = null;
  private disposed = false;

  constructor(data: RocketData, index: number) {
    this.data = data;
    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.group.add(this.visual);

    if (data.model) {
      this.loadModel(data.model, index);
    } else {
      this.buildProcedural(data, index);
    }

    // Rótulo
    const label = this.makeLabel(data.name);
    label.position.y = 1.4 + index * 0.1;
    this.group.add(label);

    // Hitbox (local ao grupo)
    const hbGeo = new THREE.SphereGeometry(0.9, 8, 8);
    const hbMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(hbGeo, hbMat);
    this.group.add(this.hitbox);
    (this.hitbox as any).userData = { bodyId: `rocket:${data.id}` };

    // Posição padrão (hub: ao redor da Terra). Chamadores podem sobrescrever.
    const radius = 3.5 + index * 0.8;
    const angle = (index / 3) * Math.PI * 2 + 1.0;
    this.group.position.set(Math.cos(angle) * radius, -0.5, Math.sin(angle) * radius);
    this.baseY = -0.5;
    this.group.rotation.z = 0.15;
  }

  private loadModel(path: string, index: number) {
    gltfLoader.load(
      path,
      (gltf) => {
        if (this.disposed) return;
        const model = gltf.scene;
        // Normalizar escala/tamanho para caber no contexto (Kenney craft ~1u)
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const target = 1.2 + index * 0.15;
        const s = target / maxDim;
        model.scale.setScalar(s);
        // Centralizar base
        box.setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center);
        box.setFromObject(model);
        model.position.y -= box.min.y;

        model.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        // Orientar "para cima" como foguete (Kenney crafts podem estar deitados)
        model.rotation.x = -Math.PI / 2;
        // Reajustar base após rotação
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y -= box2.min.y;

        this.visual.add(model);
      },
      undefined,
      () => {
        if (!this.disposed) this.buildProcedural(this.data, index);
      }
    );
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

    const flameGeo = new THREE.ConeGeometry(0.06, 0.2, 12);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.7 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = -0.1;
    flame.rotation.x = Math.PI;
    this.visual.add(flame);
    this.flame = flame;
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
      if (this.flame) {
        this.flame.scale.y = 1 + this.launchT * 3;
        (this.flame.material as THREE.MeshBasicMaterial).opacity = 0.9;
      }
      if (this.launchT > 2.0) {
        this.launching = false;
        this.group.position.y = this.baseY;
        this.group.rotation.z = 0.15;
        if (this.flame) {
          this.flame.scale.y = 1;
          (this.flame.material as THREE.MeshBasicMaterial).opacity = 0.7;
        }
      }
    } else {
      this.group.rotation.z = 0.15 + Math.sin(this.t * 1.5) * 0.05;
    }
  }

  dispose() {
    this.disposed = true;
  }
}
