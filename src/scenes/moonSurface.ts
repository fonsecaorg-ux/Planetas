import * as THREE from 'three';
import type { AstronautData } from '@/data/types';
import { Astronaut } from '@/core/astronaut';
import { disposeObject3D } from '@/core/engine';

// Superfície da Lua explorável: toque no chão para o Juan caminhar (com
// pulinhos de baixa gravidade e pegadas), chegue ao círculo dourado e
// plante a bandeira do Brasil. Terra e Via Láctea no céu.

interface Crater { x: number; z: number; r: number; depth: number }

const WALK_SPEED = 3.2;
const WORLD_LIMIT = 95;
const FLAG_POS = new THREE.Vector3(6, 0, -8);
const PLANT_DIST = 1.8;
const PLANT_DURATION_S = 1.8;

function buildFlagCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 170;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#009c3b';
  ctx.fillRect(0, 0, 256, 170);
  ctx.fillStyle = '#ffdf00';
  ctx.beginPath();
  ctx.moveTo(128, 12); ctx.lineTo(248, 85); ctx.lineTo(128, 158); ctx.lineTo(8, 85);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#002776';
  ctx.beginPath(); ctx.arc(128, 85, 50, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(128, 85); ctx.rotate(-0.15);
  ctx.fillStyle = '#fffde7';
  ctx.fillRect(-58, -6, 116, 13);
  ctx.fillStyle = '#002776';
  ctx.font = 'bold 7px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ORDEM E PROGRESSO', 0, 1);
  ctx.restore();
  ctx.fillStyle = '#fffde7';
  for (const [sx, sy] of [[105, 52], [128, 42], [148, 55], [112, 72], [145, 70], [118, 92], [142, 88], [98, 80], [130, 100]] as [number, number][]) {
    ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  return canvas;
}

// Posições fixas das amostras: espalhadas o bastante para dar um passeio
const SAMPLE_SPOTS: Array<[number, number]> = [[-8, 6], [14, 10], [-18, -14], [10, -24], [-5, -32]];
const COLLECT_DIST = 1.4;

export class MoonSurfaceScene {
  readonly group: THREE.Group;
  readonly juan: Astronaut;
  onFlagPlanted?: () => void;
  onSampleCollected?: (collected: number, total: number) => void;

  private ground: THREE.Mesh;
  private craters: Crater[] = [];
  private flagSpot: THREE.Group;
  private spotRingMat: THREE.MeshBasicMaterial;
  private hintSprite: THREE.Sprite | null = null;
  private flag: THREE.Group;
  private planted: boolean;
  private planting = false;
  private plantT = 0;
  private walkTarget: THREE.Vector3 | null = null;
  private t = 0;
  private footprints: THREE.Mesh[] = [];
  private lastStep = new THREE.Vector3();
  private footGeo: THREE.CircleGeometry;
  private footMat: THREE.MeshBasicMaterial;
  private earth: THREE.Mesh;
  private samples: Array<{ group: THREE.Group; collected: boolean }> = [];
  private collectedCount = 0;

  constructor(juanData: AstronautData, alreadyPlanted: boolean) {
    this.group = new THREE.Group();
    this.planted = alreadyPlanted;

    // Luz solar dura (sem atmosfera) + luz fraca azulada da Terra
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(60, 90, 40);
    this.group.add(sun);
    this.group.add(new THREE.AmbientLight(0x404858, 0.8));

    // --- Terreno com crateras ---
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 16 + Math.random() * 75;
      this.craters.push({
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        r: 3 + Math.random() * 8,
        depth: 0.3 + Math.random() * 1.0,
      });
    }
    const geo = new THREE.PlaneGeometry(260, 260, 128, 128);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    this.ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 1, metalness: 0 }));
    this.group.add(this.ground);

    // Pedras espalhadas
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7c7870, roughness: 0.95 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 12 + Math.random() * 85;
      const s = 0.2 + Math.random() * 1.1;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      const rx = Math.cos(a) * d, rz = Math.sin(a) * d;
      rock.position.set(rx, this.heightAt(rx, rz) + s * 0.4, rz);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.group.add(rock);
    }

    // --- Terra no céu ---
    const earthMat = new THREE.MeshBasicMaterial({ color: 0x3b6cb0 });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(11, 32, 32), earthMat);
    this.earth.position.set(-80, 95, -170);
    this.group.add(this.earth);
    new THREE.TextureLoader().load('/textures/earth_day.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      earthMat.map = tex;
      earthMat.color.setScalar(1);
      earthMat.needsUpdate = true;
    });
    // Halo da Terra
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const gctx = glowCanvas.getContext('2d')!;
    const grad = gctx.createRadialGradient(64, 64, 30, 64, 64, 64);
    grad.addColorStop(0, 'rgba(110,170,255,0.5)');
    grad.addColorStop(1, 'rgba(110,170,255,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    glow.scale.setScalar(34);
    glow.position.copy(this.earth.position);
    this.group.add(glow);

    // --- Juan ---
    this.juan = new Astronaut(juanData, 0);
    this.juan.group.position.set(0, this.heightAt(0, 0), 0);
    this.juan.group.rotation.y = Math.atan2(FLAG_POS.x, FLAG_POS.z);
    this.group.add(this.juan.group);
    this.lastStep.copy(this.juan.group.position);

    // --- Pegadas (geometria/material compartilhados) ---
    this.footGeo = new THREE.CircleGeometry(0.09, 10);
    this.footMat = new THREE.MeshBasicMaterial({ color: 0x5e5b54, transparent: true, opacity: 0.55 });

    // --- Ponto da bandeira ---
    FLAG_POS.y = this.heightAt(FLAG_POS.x, FLAG_POS.z);
    this.flagSpot = new THREE.Group();
    this.spotRingMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 40), this.spotRingMat);
    ring.rotation.x = -Math.PI / 2;
    this.flagSpot.add(ring);
    this.flagSpot.position.copy(FLAG_POS).add(new THREE.Vector3(0, 0.06, 0));
    this.group.add(this.flagSpot);

    // Placa flutuante "plante aqui"
    const hc = document.createElement('canvas');
    hc.width = 420; hc.height = 90;
    const hctx = hc.getContext('2d')!;
    hctx.fillStyle = 'rgba(0,10,30,0.8)';
    hctx.beginPath(); hctx.roundRect(0, 0, 420, 90, 18); hctx.fill();
    hctx.fillStyle = '#ffd700';
    hctx.font = 'bold 34px Arial, sans-serif';
    hctx.textAlign = 'center';
    hctx.fillText('🚩 Plante a bandeira aqui!', 210, 42);
    hctx.fillStyle = 'rgba(255,255,255,0.6)';
    hctx.font = '24px Arial, sans-serif';
    hctx.fillText('toque no chão para caminhar  ▼', 210, 74);
    this.hintSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false,
    }));
    this.hintSprite.scale.set(5.6, 1.2, 1);
    this.hintSprite.position.copy(FLAG_POS).add(new THREE.Vector3(0, 2.6, 0));
    this.group.add(this.hintSprite);

    // --- Amostras lunares colecionáveis (cristais brilhantes) ---
    const sampleGlowCanvas = document.createElement('canvas');
    sampleGlowCanvas.width = sampleGlowCanvas.height = 64;
    const sgc = sampleGlowCanvas.getContext('2d')!;
    const sgrad = sgc.createRadialGradient(32, 32, 4, 32, 32, 32);
    sgrad.addColorStop(0, 'rgba(120,235,255,0.85)');
    sgrad.addColorStop(1, 'rgba(120,235,255,0)');
    sgc.fillStyle = sgrad;
    sgc.fillRect(0, 0, 64, 64);
    const sampleGlowTex = new THREE.CanvasTexture(sampleGlowCanvas);

    for (const [sx, sz] of SAMPLE_SPOTS) {
      const sg = new THREE.Group();
      const crystal = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.26, 0),
        new THREE.MeshStandardMaterial({
          color: 0x67e8f9, roughness: 0.2, metalness: 0.3,
          emissive: 0x2cc5e8, emissiveIntensity: 1.1,
        }),
      );
      crystal.position.y = 0.35;
      sg.add(crystal);
      const sglow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sampleGlowTex, blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false, opacity: 0.8,
      }));
      sglow.scale.setScalar(1.6);
      sglow.position.y = 0.35;
      sg.add(sglow);
      sg.position.set(sx, this.heightAt(sx, sz), sz);
      this.group.add(sg);
      this.samples.push({ group: sg, collected: false });
    }

    // --- Bandeira (invisível até plantar) ---
    this.flag = this._buildFlag();
    this.flag.position.copy(FLAG_POS);
    this.group.add(this.flag);
    if (this.planted) {
      this.flag.scale.setScalar(1);
      this._hideSpot();
    } else {
      this.flag.scale.set(1, 0.001, 1);
      this.flag.visible = false;
    }
  }

  private heightAt(x: number, z: number): number {
    let h = Math.sin(x * 0.22) * Math.cos(z * 0.19) * 0.28 + Math.sin(x * 0.85 + z * 0.65) * 0.05;
    for (const c of this.craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) {
        h -= c.depth * (Math.cos((d / c.r) * Math.PI) * 0.5 + 0.5);
      } else if (d < c.r * 1.3) {
        h += c.depth * 0.18 * (1 - (d - c.r) / (c.r * 0.3));
      }
    }
    return h;
  }

  private _buildFlag(): THREE.Group {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.3 });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 2.0, 8), steel);
    pole.position.y = 1.0;
    g.add(pole);

    const crossBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.3, 6), steel);
    crossBar.rotation.z = Math.PI / 2;
    crossBar.position.set(0.65, 1.86, 0);
    g.add(crossBar);

    const tex = new THREE.CanvasTexture(buildFlagCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.85),
      new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }),
    );
    cloth.position.set(0.65, 1.42, 0);
    g.add(cloth);
    return g;
  }

  private _hideSpot() {
    this.flagSpot.visible = false;
    if (this.hintSprite) {
      this.group.remove(this.hintSprite);
      (this.hintSprite.material as THREE.SpriteMaterial).map?.dispose();
      this.hintSprite.material.dispose();
      this.hintSprite = null;
    }
  }

  /** Toque na tela: raycast no chão → caminhar até o ponto. */
  handleTap(raycaster: THREE.Raycaster): boolean {
    const hit = raycaster.intersectObject(this.ground, false)[0];
    if (!hit) return false;
    const p = hit.point.clone();
    const d = Math.hypot(p.x, p.z);
    if (d > WORLD_LIMIT) p.multiplyScalar(WORLD_LIMIT / d);
    this.walkTarget = p;
    return true;
  }

  get juanPosition(): THREE.Vector3 { return this.juan.group.position; }

  update(dt: number) {
    this.t += dt;
    this.juan.update(dt, 1);

    // Pulso do anel dourado
    if (this.flagSpot.visible) {
      this.spotRingMat.opacity = 0.5 + Math.abs(Math.sin(this.t * 2.4)) * 0.5;
      this.flagSpot.scale.setScalar(1 + Math.sin(this.t * 2.4) * 0.08);
    }
    if (this.hintSprite) {
      this.hintSprite.position.y = FLAG_POS.y + 2.6 + Math.sin(this.t * 1.8) * 0.15;
    }

    // Caminhada com pulinhos de baixa gravidade
    if (this.walkTarget && !this.planting) {
      const pos = this.juan.group.position;
      const dx = this.walkTarget.x - pos.x;
      const dz = this.walkTarget.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.15) {
        this.walkTarget = null;
        pos.y = this.heightAt(pos.x, pos.z);
      } else {
        const step = Math.min(WALK_SPEED * dt, dist);
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        pos.y = this.heightAt(pos.x, pos.z) + Math.abs(Math.sin(this.t * 5.5)) * 0.16;
        this.juan.group.rotation.y = Math.atan2(dx, dz);

        // Pegadas
        if (pos.distanceTo(this.lastStep) > 0.55) {
          this.lastStep.copy(pos);
          const print = new THREE.Mesh(this.footGeo, this.footMat);
          print.rotation.x = -Math.PI / 2;
          print.position.set(pos.x, this.heightAt(pos.x, pos.z) + 0.02, pos.z);
          this.group.add(print);
          this.footprints.push(print);
          if (this.footprints.length > 90) {
            const old = this.footprints.shift()!;
            this.group.remove(old);
          }
        }
      }

      // Chegou perto do ponto da bandeira → plantar
      if (!this.planted && Math.hypot(pos.x - FLAG_POS.x, pos.z - FLAG_POS.z) < PLANT_DIST) {
        this.walkTarget = null;
        this.planting = true;
        this.plantT = 0;
        this.flag.visible = true;
        this.juan.group.rotation.y = Math.atan2(FLAG_POS.x - pos.x, FLAG_POS.z - pos.z);
      }
    }

    // Animação de plantar: mastro cresce do chão
    if (this.planting) {
      this.plantT += dt / PLANT_DURATION_S;
      const k = Math.min(this.plantT, 1);
      const ease = 1 - Math.pow(1 - k, 3);
      this.flag.scale.set(1, Math.max(ease, 0.001), 1);
      if (k >= 1) {
        this.planting = false;
        this.planted = true;
        this._hideSpot();
        this.onFlagPlanted?.();
      }
    }

    // Amostras: giram, flutuam e são coletadas por proximidade
    const jp = this.juan.group.position;
    for (const s of this.samples) {
      if (s.collected) continue;
      s.group.rotation.y += dt * 1.2;
      s.group.children[0].position.y = 0.35 + Math.sin(this.t * 2.5 + s.group.position.x) * 0.08;
      if (Math.hypot(jp.x - s.group.position.x, jp.z - s.group.position.z) < COLLECT_DIST) {
        s.collected = true;
        this.group.remove(s.group);
        this.collectedCount++;
        this.onSampleCollected?.(this.collectedCount, this.samples.length);
      }
    }

    // Bandeira balança de leve + Terra gira devagar
    if (this.flag.visible && !this.planting) {
      this.flag.rotation.y = Math.sin(this.t * 0.6) * 0.06;
    }
    this.earth.rotation.y += dt * 0.02;
  }

  dispose() {
    this.footGeo.dispose();
    this.footMat.dispose();
    disposeObject3D(this.group);
  }
}
