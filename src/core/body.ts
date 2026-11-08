import * as THREE from 'three';
import type { BodyData, SatelliteData, ScaleMode } from '@/data/types';
import {
  bodyRadius,
  orbitDistance,
  moonDistance,
  ANEL_INTERNO,
  ANEL_EXTERNO,
  ANEL_FINO_INTERNO,
  ANEL_FINO_EXTERNO,
} from '@/utils/scale';
import { loadTexture, proceduralClouds, proceduralRings, proceduralTexture } from '@/utils/textures';
import { atmosphereVertex, atmosphereFragment } from '@/shaders/atmosphere';
import { ringsVertex, ringsFragment } from '@/shaders/rings';
import { jupiterCloudVertex, jupiterCloudFragment } from '@/shaders/jupiter';
import { createSunGlow } from '@/core/sunGlow';
import { keplerianPosition, daysSinceJ2000 } from '@/utils/orbits';

export interface BodyOptions {
  data: BodyData;
  scaleMode: ScaleMode;
  // Posição do Sol em coordenadas de mundo. Referência compartilhada entre
  // todos os corpos, atualizada a cada quadro pela origem flutuante
  sunPosition: THREE.Vector3;
}

// Acima desta distância (em raios do próprio corpo) a esfera troca para a
// versão de baixa resolução
const LOD_DISTANCIA_EM_RAIOS = 40;

const _posMundo = new THREE.Vector3();

interface SatelliteObj {
  data: SatelliteData;
  mesh: THREE.Mesh;
  group: THREE.Group;
  angle: number;
  dist: number;
}

export class CelestialBody {
  readonly data: BodyData;
  readonly group: THREE.Group;
  readonly orbitGroup: THREE.Group;
  readonly mesh: THREE.Mesh;
  /** Esfera invisível 1.75× o raio visual — usada exclusivamente para raycasting. */
  readonly hitbox: THREE.Mesh;
  readonly radius: number;
  private atmosphere?: THREE.Mesh;
  private cloudLayer?: THREE.Mesh;
  private cloudMat?: THREE.ShaderMaterial;
  private ring?: THREE.Mesh;
  private satellites: SatelliteObj[] = [];
  private highGeo: THREE.BufferGeometry;
  private lowGeo: THREE.BufferGeometry;
  private currentLevel = 0;
  private scaleMode: ScaleMode;
  private angle = Math.random() * Math.PI * 2;
  private sunPosition: THREE.Vector3;
  // Dias desde J2000.0: sincronizado com o timeSpeed da cena a cada frame
  private simDays = daysSinceJ2000();
  // Texturas chegam de forma assíncrona; se o corpo já foi descartado, não aplica
  private disposed = false;

  constructor(opts: BodyOptions) {
    this.data = opts.data;
    this.scaleMode = opts.scaleMode;
    this.sunPosition = opts.sunPosition;

    this.orbitGroup = new THREE.Group();
    this.group = new THREE.Group();
    this.orbitGroup.add(this.group);

    const r = bodyRadius(opts.data.radiusKm);
    this.radius = r;
    this.highGeo = new THREE.SphereGeometry(r, 48, 48);
    this.lowGeo = new THREE.SphereGeometry(r, 16, 16);

    // Sol não recebe luz — ele é a luz. Sem tone mapping para não apagar o brilho
    const mat: THREE.Material = opts.data.type === 'star'
      ? new THREE.MeshBasicMaterial({ color: new THREE.Color(opts.data.color), toneMapped: false })
      : new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.data.color), roughness: 0.9, metalness: 0 });
    this.mesh = new THREE.Mesh(this.highGeo, mat);
    this.group.add(this.mesh);

    // Hitbox invisível: área de toque/seleção maior que a geometria visual
    const hitboxGeo = new THREE.SphereGeometry(r * 1.75, 8, 8);
    this.hitbox = new THREE.Mesh(hitboxGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.userData = { bodyId: opts.data.id };
    this.group.add(this.hitbox);

    this.loadTextures(opts.data);

    // Glow sprite para estrelas (Sol): sem bloom de pós-processamento (mobile VR)
    if (opts.data.type === 'star') {
      this.group.add(createSunGlow(r));
    }

    if (opts.data.tilt) {
      this.group.rotation.z = THREE.MathUtils.degToRad(opts.data.tilt);
    }

    if (opts.data.atmosphereGlow) {
      const atmMat = new THREE.ShaderMaterial({
        vertexShader: atmosphereVertex,
        fragmentShader: atmosphereFragment,
        uniforms: {
          uColor: { value: new THREE.Color(opts.data.id === 'venus' ? 0xffe0a0 : 0x6ab0ff) },
          uIntensity: { value: opts.data.id === 'venus' ? 1.2 : 1.6 },
          uSunPos: { value: this.sunPosition },
        },
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
      });
      this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 48, 48), atmMat);
      this.group.add(this.atmosphere);
    }

    if (opts.data.rings) {
      this.buildRings(opts.data.thinRings ?? false);
    }

    if (opts.data.animatedClouds) {
      this.cloudMat = new THREE.ShaderMaterial({
        vertexShader: jupiterCloudVertex,
        fragmentShader: jupiterCloudFragment,
        uniforms: {
          uTexture: { value: proceduralClouds() },
          uTime: { value: 0 },
          uOpacity: { value: 0.45 },
          uSunPos: { value: this.sunPosition },
        },
        transparent: true,
        depthWrite: false,
      });
      this.cloudLayer = new THREE.Mesh(new THREE.SphereGeometry(r * 1.012, 48, 48), this.cloudMat);
      this.group.add(this.cloudLayer);
    }

    for (const s of opts.data.satellites ?? []) {
      this.buildSatellite(s);
    }

    this.updatePosition();
  }

  private async loadTextures(d: BodyData) {
    let kind = 'rocky';
    if (d.id === 'sun') kind = 'sun';
    else if (d.id === 'earth') kind = 'earth';
    else if (d.id === 'jupiter' || d.id === 'saturn' || d.id === 'uranus' || d.id === 'neptune') kind = 'gas';

    if (d.id === 'earth') {
      const dayTex = await loadTexture(d.texture, 'earth', d.color);
      const nightTex = d.nightTexture
        ? await loadTexture(d.nightTexture, 'earth', '#0a0a2a')
        : proceduralTexture('rocky', '#0a0a2a');
      const cloudTex = d.cloudTexture
        ? await loadTexture(d.cloudTexture, 'earth', '#ffffff')
        : proceduralClouds();
      const { earthVertex, earthFragment } = await import('@/shaders/earth');
      if (this.disposed) return;
      const mat = new THREE.ShaderMaterial({
        vertexShader: earthVertex,
        fragmentShader: earthFragment,
        uniforms: {
          uDay: { value: dayTex },
          uNight: { value: nightTex },
          uClouds: { value: cloudTex },
          uSunPos: { value: this.sunPosition },
        },
      });
      (this.mesh.material as THREE.Material).dispose();
      this.mesh.material = mat;
      return;
    }

    const tex = await loadTexture(d.texture, kind, d.color);
    if (this.disposed) return;
    const m = this.mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    m.map = tex;
    // A textura já carrega a cor; manter a cor base escureceria o resultado
    m.color.set(0xffffff);
    m.needsUpdate = true;

    if (d.normalMap && m instanceof THREE.MeshStandardMaterial) {
      try {
        const nTex = await loadTexture(d.normalMap, 'rocky', '#8080ff');
        if (this.disposed) return;
        nTex.colorSpace = THREE.NoColorSpace;
        m.normalMap = nTex;
        m.needsUpdate = true;
      } catch { /* sem normal map, segue com a esfera lisa */ }
    }
  }

  private async buildRings(thin: boolean) {
    const r = this.radius;
    const inner = r * (thin ? ANEL_FINO_INTERNO : ANEL_INTERNO);
    const outer = r * (thin ? ANEL_FINO_EXTERNO : ANEL_EXTERNO);
    const geo = new THREE.RingGeometry(inner, outer, 128);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const t = (Math.sqrt(x * x + y * y) - inner) / (outer - inner);
      uv.setXY(i, t, 0.5);
    }
    const ringTexName = this.data.id === 'saturn' ? 'saturn_ring.png' : undefined;
    const tex = ringTexName
      ? await loadTexture(ringTexName, 'rings', this.data.color)
      : proceduralRings();
    if (this.disposed) { geo.dispose(); return; }
    const mat = new THREE.ShaderMaterial({
      vertexShader: ringsVertex,
      fragmentShader: ringsFragment,
      uniforms: {
        uTexture: { value: tex },
        uOpacity: { value: thin ? 0.4 : 0.85 },
        uInner: { value: inner },
        uOuter: { value: outer },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(geo, mat);
    this.ring.rotation.x = Math.PI / 2;
    this.group.add(this.ring);
  }

  private buildSatellite(s: SatelliteData) {
    const geo = new THREE.SphereGeometry(bodyRadius(s.radiusKm), 24, 24);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    const satGroup = new THREE.Group();
    satGroup.add(mesh);
    this.group.add(satGroup);
    this.satellites.push({
      data: s,
      mesh,
      group: satGroup,
      angle: Math.random() * Math.PI * 2,
      dist: moonDistance(s.distanceKm, this.data.radiusKm, this.scaleMode),
    });
  }

  private updatePosition() {
    if (this.data.type === 'belt') return;
    if (this.data.orbitalElements) {
      const pos = keplerianPosition(this.data.orbitalElements, this.scaleMode, this.simDays);
      this.group.position.copy(pos);
    } else {
      const d = orbitDistance(this.data.distanceKm, this.scaleMode);
      this.group.position.set(Math.cos(this.angle) * d, 0, Math.sin(this.angle) * d);
    }
  }

  update(dt: number, timeSpeed: number, cameraPos?: THREE.Vector3) {
    if (cameraPos) {
      this.group.getWorldPosition(_posMundo);
      const wantLow = cameraPos.distanceTo(_posMundo) > this.radius * LOD_DISTANCIA_EM_RAIOS;
      if (wantLow && this.currentLevel !== 1) {
        this.mesh.geometry = this.lowGeo;
        this.currentLevel = 1;
      } else if (!wantLow && this.currentLevel !== 0) {
        this.mesh.geometry = this.highGeo;
        this.currentLevel = 0;
      }
    }

    if (this.data.type === 'star') {
      this.mesh.rotation.y += 0.05 * dt * timeSpeed;
      return;
    }
    if (this.data.orbitalPeriodDays > 0) {
      if (this.data.orbitalElements) {
        // Avança a simulação pelo tempo real escalado; 10 é o fator de compressão
        // de tempo já aplicado no loop principal (dt em segundos de jogo)
        this.simDays += (dt * timeSpeed) / (86400 / 10);
      } else {
        const omega = (2 * Math.PI) / (this.data.orbitalPeriodDays * 10);
        this.angle += omega * dt * timeSpeed;
      }
      this.updatePosition();
    }
    if (this.data.rotationPeriodHours > 0) {
      const spin = (2 * Math.PI) / (this.data.rotationPeriodHours * 10);
      this.mesh.rotation.y += spin * dt * timeSpeed;
    }
    for (const s of this.satellites) {
      const omega = (2 * Math.PI) / (s.data.orbitalPeriodDays * 5);
      const dir = s.data.retrograde ? -1 : 1;
      s.angle += omega * dt * timeSpeed * dir;
      s.group.position.set(Math.cos(s.angle) * s.dist, 0, Math.sin(s.angle) * s.dist);
      s.mesh.rotation.y += 0.5 * dt * timeSpeed;
    }
    if (this.cloudMat) {
      this.cloudMat.uniforms.uTime.value += dt * timeSpeed;
    }
  }

  // Tamanho não muda entre modos — só as distâncias da órbita e das luas
  setScaleMode(mode: ScaleMode) {
    this.scaleMode = mode;
    for (const s of this.satellites) {
      s.dist = moonDistance(s.data.distanceKm, this.data.radiusKm, mode);
    }
    this.updatePosition();
  }

  getWorldPosition(target: THREE.Vector3) {
    this.group.getWorldPosition(target);
  }

  /** Liga/desliga glow de hover no mesh visível (apenas MeshStandardMaterial). */
  setHighlight(on: boolean) {
    const mat = this.mesh.material;
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.emissive.setHex(on ? 0x1a3a66 : 0x000000);
      mat.emissiveIntensity = on ? 1.5 : 0;
    }
  }

  dispose() {
    this.disposed = true;
    this.highGeo.dispose();
    this.lowGeo.dispose();
    this.hitbox.geometry.dispose();
    disposeMaterial(this.mesh.material as THREE.Material);
    for (const m of [this.atmosphere, this.ring, this.cloudLayer]) {
      if (!m) continue;
      m.geometry.dispose();
      disposeMaterial(m.material as THREE.Material);
    }
    for (const s of this.satellites) {
      s.mesh.geometry.dispose();
      disposeMaterial(s.mesh.material as THREE.Material);
    }
  }
}

function disposeMaterial(m: THREE.Material) {
  const comMapa = m as THREE.Material & { map?: THREE.Texture | null; normalMap?: THREE.Texture | null };
  comMapa.map?.dispose();
  comMapa.normalMap?.dispose();
  m.dispose();
}
