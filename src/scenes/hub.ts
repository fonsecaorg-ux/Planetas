import * as THREE from 'three';
import type { SolarSystemData, BodyData, ScaleMode } from '@/data/types';
import { CelestialBody } from '@/core/body';
import { Belt } from '@/core/belt';
import { Trajectory, TrajectoryPoint } from '@/core/trajectory';
import { SpaceStation } from '@/core/station';
import { Astronaut } from '@/core/astronaut';
import astronautsData from '@/data/astronauts.json';
import { Rocket } from '@/core/rocket';
import rocketsData from '@/data/rockets.json';
import { createSolarLight } from '@/core/lighting';
import { orbitDistance } from '@/utils/scale';
import { keplerianOrbitPath } from '@/utils/orbits';
import { MoonBase } from '@/core/moonBase';
import { SatelliteMoon } from '@/core/satelliteMoon';
import { ExoPortal } from '@/core/exoPortal';
import { HIDDEN_OBJECTS } from '@/data/hiddenObjects';

export interface HubSceneOptions {
  data: SolarSystemData;
  scaleMode: ScaleMode;
  // Vetor compartilhado com os shaders; o hub escreve nele a posição do Sol
  sunPosition: THREE.Vector3;
  activeAstronaut?: string | null;
}

// Astronautas acompanham o corpo em foco a esta altura acima da superfície
const ESCOLTA_ALTURA = 1.5;
const ESCOLTA_ESPACAMENTO = 0.6;

// Estação, foguetes e astronautas medem até ~1,5 raio terrestre. Abaixo de
// ~0,17° aparentes (3 px numa tela de 1080 px) viram ponto invisível, mas
// cada um segue custando draw calls e skinning — medido no Adreno 618:
// 38 das 84 draw calls da visão geral eram desses modelos
const DETALHE_TAMANHO = 1.5;
const DETALHE_ANGULO_MIN = 0.003;
const DETALHE_DISTANCIA_MAX = DETALHE_TAMANHO / DETALHE_ANGULO_MIN;

const ORBITA_SEGMENTOS = 128;

const _posCamera = new THREE.Vector3();
const _posDetalhe = new THREE.Vector3();

// Mundo contínuo do sistema solar. `group` é deslocado a cada quadro para que
// o corpo em foco fique na origem (origem flutuante): centraliza a câmera no
// planeta sem trocar de cena e mantém a precisão de float32 da GPU em escala
// real, onde as posições passam de milhões de unidades.
export class HubScene {
  readonly group: THREE.Group;
  readonly bodies: Map<string, CelestialBody> = new Map();
  readonly belts: Belt[] = [];
  readonly trajectories: Trajectory[] = [];
  readonly astronauts: Astronaut[] = [];
  readonly rockets: Rocket[] = [];
  station: SpaceStation | null = null;
  private trajectoryPoints: TrajectoryPoint[][] = [];
  // Todas as órbitas num único LineSegments: uma draw call em vez de uma por planeta
  private orbitas: THREE.LineSegments | null = null;
  private orbitasGlow: THREE.LineSegments | null = null;
  moonBase: MoonBase | null = null;
  readonly satellites: SatelliteMoon[] = [];
  exoPortal: ExoPortal | null = null;
  private sunPosition: THREE.Vector3;
  private focusId = 'sun';
  readonly hiddenObjectHitboxes: THREE.Mesh[] = [];
  private hiddenObjectMaterials: Array<{ mesh: THREE.MeshStandardMaterial; glow: THREE.SpriteMaterial }> = [];
  private hiddenT = 0;

  constructor(opts: HubSceneOptions) {
    this.group = new THREE.Group();
    this.sunPosition = opts.sunPosition;

    createSolarLight(this.group);

    // Exoplanetas ficam fora: estão a anos-luz e não cabem em nenhuma das
    // duas escalas. Os dados seguem em corpos.json para um destino próprio
    for (const b of opts.data.bodies) {
      if (b.type === 'exoplanet') continue;
      if (b.type === 'belt') {
        const belt = new Belt(b, opts.scaleMode);
        this.belts.push(belt);
        this.group.add(belt.group);
        continue;
      }
      const body = new CelestialBody({ data: b, scaleMode: opts.scaleMode, sunPosition: this.sunPosition });
      this.bodies.set(b.id, body);
      this.group.add(body.orbitGroup);

      // Luas naturais (exceto a Lua da Terra, tratada pela MoonBase)
      if (b.satellites) {
        b.satellites.forEach((sat, si) => {
          if (sat.id === 'moon') return; // já tratado por MoonBase
          const satMoon = new SatelliteMoon(sat, body.radius, si);
          body.group.add(satMoon.group);
          this.satellites.push(satMoon);
        });
      }
    }
    this.criarOrbitas(opts.data.bodies, opts.scaleMode);

    const earth = this.bodies.get('earth');
    if (earth) {
      // Lua com bandeira do Brasil (JUAN_GUI7 fica nela)
      this.moonBase = new MoonBase();
      earth.group.add(this.moonBase.group);

      // Tripulação
      astronautsData.astronauts.forEach((a, i) => {
        const astro = new Astronaut(a as any, i);
        this.astronauts.push(astro);
        if (opts.activeAstronaut === a.id) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 24), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
          ring.rotation.x = Math.PI / 2;
          ring.position.y = -0.15;
          astro.group.add(ring);
        }
      });

      // JUAN_GUI7 (primeiro astronauta) planta a bandeira na Lua
      const juanAstro = this.astronauts.find(a => a.data.id === 'astro-juan');
      if (juanAstro) this.moonBase.placeAstronaut(juanAstro);

      // Os demais acompanham o corpo em foco
      this.escortTo(earth);

      // Estação espacial (sede do time)
      const st = new SpaceStation();
      this.station = st;
      st.group.position.set(4.0, 1.0, 0);
      earth.group.add(st.group);
      (st.hitbox as any).userData = { bodyId: 'station' };

      // Foguetes (frota)
      rocketsData.rockets.forEach((r, i) => {
        const rocket = new Rocket(r as any, i);
        this.rockets.push(rocket);
        earth.group.add(rocket.group);
      });
    }

    // Portal interestelar (bônus ao completar o sistema solar)
    const portalDist = orbitDistance(3e9, opts.scaleMode); // ~20 UA em escala visual
    this.exoPortal = new ExoPortal();
    this.exoPortal.setPosition(portalDist);
    this.group.add(this.exoPortal.group);

    // Missão histórica: Voyager 1
    const voyagerPoints: TrajectoryPoint[] = [
      { x: 1.5e8, y: 0, z: 0 },
      { x: 7.8e8, y: 5e7, z: 1e8 },
      { x: 1.4e9, y: -1e8, z: 2e8 },
      { x: 2.2e10, y: 5e9, z: 1e10 },
    ];
    const traj = new Trajectory(voyagerPoints, opts.scaleMode, 0xfbbf24, 0.03);
    this.trajectories.push(traj);
    this.trajectoryPoints.push(voyagerPoints);
    this.group.add(traj.group);

    this._buildHiddenObjects();
  }

  private _buildHiddenObjects() {
    for (const obj of HIDDEN_OBJECTS) {
      const body = this.bodies.get(obj.bodyId);
      if (!body) continue;

      const r = body.radius;
      const icoR = Math.min(1.2, Math.max(0.15, r * 0.08));
      const color = new THREE.Color(obj.color);

      // Icosahedron emissivo
      const geo = new THREE.IcosahedronGeometry(icoR, 1);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.5,
        roughness: 0.4,
        metalness: 0.3,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);

      // Glow sprite
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 64; glowCanvas.height = 64;
      const gc = glowCanvas.getContext('2d')!;
      const grad = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `${obj.color}ff`);
      grad.addColorStop(0.4, `${obj.color}88`);
      grad.addColorStop(1, `${obj.color}00`);
      gc.fillStyle = grad;
      gc.fillRect(0, 0, 64, 64);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.7,
      });
      const glow = new THREE.Sprite(glowMat);
      const gs = icoR * 5;
      glow.scale.set(gs, gs, 1);
      glow.renderOrder = 10;
      mesh.add(glow);

      // Hitbox invisível (maior para facilitar clique)
      const hbR = Math.min(2.5, Math.max(0.4, r * 0.15));
      const hbGeo = new THREE.SphereGeometry(hbR, 8, 8);
      const hbMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hbGeo, hbMat);
      hitbox.add(mesh);
      (hitbox as any).userData = { bodyId: `hidden:${obj.id}` };

      // Posicionar no planeta (em unidades de raio)
      const [ox, oy, oz] = obj.offset;
      hitbox.position.set(ox * r, oy * r, oz * r);

      body.group.add(hitbox);
      this.hiddenObjectHitboxes.push(hitbox);
      this.hiddenObjectMaterials.push({ mesh: mat, glow: glowMat });
    }
  }

  private criarOrbitas(bodies: BodyData[], scaleMode: ScaleMode) {
    this.removerOrbitas();
    const planets = bodies.filter((b) => b.id !== 'sun' && b.type !== 'belt' && b.type !== 'exoplanet' && b.type !== 'dwarf');

    // Zona interna (≤ Marte) e zona externa — cores distintas
    const INNER_IDS = new Set(['mercury', 'venus', 'earth', 'mars']);
    const COLOR_INNER = 0x00aaff;  // azul-ciano
    const COLOR_OUTER = 0x9966ff;  // lilás

    const totalPairs = planets.length * ORBITA_SEGMENTOS;
    const posArr = new Float32Array(totalPairs * 6);
    // Cor por vértice (R,G,B) para misturar inner/outer numa única geometria
    const colArr = new Float32Array(totalPairs * 6);
    let k = 0;

    for (const b of planets) {
      let pts: { x: number; y: number; z: number }[];

      if (b.orbitalElements) {
        pts = keplerianOrbitPath(b.orbitalElements, scaleMode, ORBITA_SEGMENTOS);
      } else {
        const dist = orbitDistance(b.distanceKm, scaleMode);
        pts = Array.from({ length: ORBITA_SEGMENTOS + 1 }, (_, i) => {
          const a = (i / ORBITA_SEGMENTOS) * Math.PI * 2;
          return { x: Math.cos(a) * dist, y: 0, z: Math.sin(a) * dist };
        });
      }

      const hex = INNER_IDS.has(b.id) ? COLOR_INNER : COLOR_OUTER;
      const cr = ((hex >> 16) & 255) / 255;
      const cg = ((hex >> 8)  & 255) / 255;
      const cb = ( hex        & 255) / 255;

      for (let i = 0; i < ORBITA_SEGMENTOS; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1] ?? pts[0];
        posArr[k]   = p0.x; posArr[k+1] = p0.y; posArr[k+2] = p0.z;
        posArr[k+3] = p1.x; posArr[k+4] = p1.y; posArr[k+5] = p1.z;
        colArr[k]   = cr; colArr[k+1] = cg; colArr[k+2] = cb;
        colArr[k+3] = cr; colArr[k+4] = cg; colArr[k+5] = cb;
        k += 6;
      }
    }

    const makeGeo = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      return g;
    };

    // Linha base: sólida, opacidade média
    const matBase = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.orbitas = new THREE.LineSegments(makeGeo(), matBase);
    this.group.add(this.orbitas);

    // Camada de glow: mesma geometria, blending aditivo, bem transparente
    const matGlow = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.orbitasGlow = new THREE.LineSegments(makeGeo(), matGlow);
    this.group.add(this.orbitasGlow);
  }

  private removerOrbitas() {
    for (const ls of [this.orbitas, this.orbitasGlow]) {
      if (!ls) continue;
      this.group.remove(ls);
      ls.geometry.dispose();
      (ls.material as THREE.Material).dispose();
    }
    this.orbitas = null;
    this.orbitasGlow = null;
  }

  // Esconde os modelos de detalhe longe demais para ocupar pixels. O
  // raycaster ignora `visible`, então a seleção pelas hitboxes não muda
  private cortarDetalhesDistantes(cp: THREE.Vector3) {
    const perto = (g: THREE.Object3D) =>
      g.getWorldPosition(_posDetalhe).distanceTo(cp) < DETALHE_DISTANCIA_MAX;
    for (const a of this.astronauts) a.group.visible = perto(a.group);
    for (const r of this.rockets) r.group.visible = perto(r.group);
    if (this.station) this.station.group.visible = perto(this.station.group);
  }

  // Reposiciona a tripulação em volta do corpo. JUAN_GUI7 fica sempre na Lua.
  private escortTo(body: CelestialBody) {
    const alvo = body.data.type === 'star' ? this.bodies.get('earth') : body;
    if (!alvo) return;
    // Exclui JUAN_GUI7 — ele está fixo na Lua
    const terrAstros = this.astronauts.filter(a => a.data.id !== 'astro-juan');
    terrAstros.forEach((astro, i) => {
      const raio = alvo.radius + ESCOLTA_ALTURA + i * ESCOLTA_ESPACAMENTO;
      const angulo = (i / Math.max(terrAstros.length, 1)) * Math.PI * 2;
      alvo.group.add(astro.group);
      astro.group.position.set(Math.cos(angulo) * raio, astro.group.position.y, Math.sin(angulo) * raio);
    });
  }

  get focus(): CelestialBody {
    return this.bodies.get(this.focusId)!;
  }

  setFocus(id: string) {
    const body = this.bodies.get(id);
    if (!body) return;
    this.focusId = id;
    this.escortTo(body);
  }

  // Posição do corpo no referencial do mundo (antes do deslocamento)
  localPositionOf(id: string, target: THREE.Vector3): THREE.Vector3 {
    const b = this.bodies.get(id);
    return b ? target.copy(b.group.position) : target.set(0, 0, 0);
  }

  // Desloca o mundo para o corpo em foco ficar na origem e publica a nova
  // posição do Sol para os shaders. Chamar depois de update()
  applyFloatingOrigin() {
    this.group.position.copy(this.focus.group.position).negate();
    this.sunPosition.copy(this.group.position);
  }

  update(dt: number, timeSpeed: number, camera?: THREE.Camera) {
    const cp = camera ? camera.getWorldPosition(_posCamera) : undefined;
    for (const b of this.bodies.values()) {
      b.update(dt, timeSpeed, cp);
    }
    if (this.moonBase) this.moonBase.update(dt, timeSpeed);
    for (const sat of this.satellites) sat.update(dt, timeSpeed);
    this.exoPortal?.update(dt);
    for (const belt of this.belts) belt.update(dt, timeSpeed);
    for (const t of this.trajectories) t.update(dt, timeSpeed);
    if (cp) this.cortarDetalhesDistantes(cp);
    // Astronauta fora da tela não precisa avançar a animação de esqueleto
    for (const a of this.astronauts) if (a.group.visible) a.update(dt, timeSpeed);
    if (this.station) this.station.update(dt, timeSpeed);
    for (const r of this.rockets) r.update(dt, timeSpeed);
    // Pulso dos objetos ocultos
    this.hiddenT += dt;
    for (const { mesh, glow } of this.hiddenObjectMaterials) {
      const p = 0.6 + Math.sin(this.hiddenT * 2.2) * 0.3;
      mesh.emissiveIntensity = 2.0 + Math.sin(this.hiddenT * 2.2) * 1.0;
      glow.opacity = p;
    }
    // Eventos cósmicos
    if (this._cosmicTick) this._cosmicTick(dt);
  }

  setScaleMode(mode: ScaleMode, data: SolarSystemData) {
    for (const b of this.bodies.values()) b.setScaleMode(mode);
    for (const belt of this.belts) belt.setScaleMode(mode);
    for (let i = 0; i < this.trajectories.length; i++) {
      this.trajectories[i].setScaleMode(mode, this.trajectoryPoints[i]);
    }
    this.criarOrbitas(data.bodies, mode);
    if (this.exoPortal) this.exoPortal.setPosition(orbitDistance(3e9, mode));
  }

  getBody(id: string): CelestialBody | undefined {
    return this.bodies.get(id);
  }

  /** Inicia uma chuva de meteoros: ~60 traços voando pelo sistema. Dura ~9 s. */
  startMeteorShower(): () => void {
    const COUNT = 60;
    const meteors: THREE.Line[] = [];
    const speeds: number[] = [];
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false });

    for (let i = 0; i < COUNT; i++) {
      const spread = 180;
      const origin = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread * 0.4 + 20,
        (Math.random() - 0.5) * spread,
      );
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6 - 0.2,
        -0.6 - Math.random() * 0.4,
        (Math.random() - 0.5) * 0.6,
      ).normalize();
      const len = 4 + Math.random() * 6;
      const pts = [origin.clone(), origin.clone().addScaledVector(dir, len)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, lineMat);
      (line as any).__dir = dir;
      (line as any).__speed = 18 + Math.random() * 20;
      this.group.add(line);
      meteors.push(line);
      speeds.push(0);
    }

    let elapsed = 0;
    const tick = (dt: number) => {
      elapsed += dt;
      const fade = elapsed > 7 ? 1 - (elapsed - 7) / 2 : 1;
      (lineMat as THREE.LineBasicMaterial).opacity = Math.max(0, 0.85 * fade);
      for (const m of meteors) {
        const speed = (m as any).__speed as number;
        const dir = (m as any).__dir as THREE.Vector3;
        m.position.addScaledVector(dir, speed * dt);
      }
    };
    this._cosmicTick = tick;

    const cleanup = () => {
      this._cosmicTick = null;
      for (const m of meteors) {
        this.group.remove(m);
        m.geometry.dispose();
      }
      lineMat.dispose();
    };
    setTimeout(cleanup, 9000);
    return cleanup;
  }

  /** Lança um cometa brilhante atravessando o sistema solar. Dura ~8 s. */
  startComet(): () => void {
    const color = new THREE.Color(0x88ddff);
    const headGeo = new THREE.SphereGeometry(1.2, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4, toneMapped: false });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(-160, 30, -80);

    // Cauda: cone translúcido
    const tailGeo = new THREE.ConeGeometry(1.0, 22, 8);
    const tailMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, transparent: true, opacity: 0.35, side: THREE.DoubleSide, toneMapped: false });
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.rotation.z = -Math.PI / 2;
    tail.position.set(-11, 0, 0);
    head.add(tail);
    this.group.add(head);

    const dir = new THREE.Vector3(1, -0.15, 0.3).normalize();
    const speed = 44;
    let elapsed = 0;

    const tick = (dt: number) => {
      elapsed += dt;
      head.position.addScaledVector(dir, speed * dt);
      const fade = elapsed > 6 ? 1 - (elapsed - 6) / 2 : 1;
      headMat.emissiveIntensity = 4 * fade;
      tailMat.opacity = 0.35 * fade;
    };
    this._cosmicTick = tick;

    const cleanup = () => {
      this._cosmicTick = null;
      this.group.remove(head);
      headGeo.dispose(); headMat.dispose();
      tailGeo.dispose(); tailMat.dispose();
    };
    setTimeout(cleanup, 8000);
    return cleanup;
  }

  /** Eclipse: escurece gradualmente e clareia — 10 s no total. */
  startEclipse(): () => void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;pointer-events:none;z-index:50;opacity:0;transition:opacity 2s;';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '0.72'; });
    const t1 = setTimeout(() => { overlay.style.opacity = '0'; }, 5000);
    const t2 = setTimeout(() => { overlay.remove(); this._cosmicTick = null; }, 7000);

    const cleanup = () => {
      clearTimeout(t1); clearTimeout(t2);
      this._cosmicTick = null;
      overlay.remove();
    };
    return cleanup;
  }

  _cosmicTick: ((dt: number) => void) | null = null;

  /** Adiciona um planeta criado pelo usuário à cena (posicionado além do cinturão). */
  addCustomPlanet(opts: {
    name: string; color: string; radius: number; rings: boolean; moons: number;
  }): THREE.Group {
    const color = new THREE.Color(opts.color);
    const geo = new THREE.SphereGeometry(opts.radius, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    const group = new THREE.Group();
    group.add(mesh);

    if (opts.rings) {
      const rInner = opts.radius * 1.4, rOuter = opts.radius * 2.2;
      const rGeo = new THREE.RingGeometry(rInner, rOuter, 48);
      const rMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.rotation.x = Math.PI / 2.4;
      group.add(ring);
    }
    for (let i = 0; i < Math.min(opts.moons, 5); i++) {
      const angle = (i / opts.moons) * Math.PI * 2;
      const dist = opts.radius * (2.8 + i * 0.7);
      const mGeo = new THREE.SphereGeometry(opts.radius * 0.12, 8, 8);
      const mMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
      const moon = new THREE.Mesh(mGeo, mMat);
      moon.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      group.add(moon);
    }

    group.position.set(0, 0, -380);
    (group as any).userData = { bodyId: `custom:${opts.name}` };
    this.group.add(group);
    return group;
  }

  dispose() {
    for (const b of this.bodies.values()) b.dispose();
    for (const belt of this.belts) belt.dispose();
    for (const t of this.trajectories) t.dispose();
    this.removerOrbitas();
    this.moonBase?.dispose();
    for (const sat of this.satellites) sat.dispose();
    this.exoPortal?.dispose();
  }
}
