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
import { PlanetLabel } from '@/core/planetLabel';
import { MoonBase } from '@/core/moonBase';
import { SatelliteMoon } from '@/core/satelliteMoon';
import { ExoPortal } from '@/core/exoPortal';

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
  private labels: Map<string, PlanetLabel> = new Map();
  moonBase: MoonBase | null = null;
  readonly satellites: SatelliteMoon[] = [];
  exoPortal: ExoPortal | null = null;
  private sunPosition: THREE.Vector3;
  private focusId = 'sun';

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

      // Label 3D flutuando acima de cada corpo
      const label = new PlanetLabel(b);
      body.group.add(label.sprite);
      this.labels.set(b.id, label);

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
  }

  private criarOrbitas(bodies: BodyData[], scaleMode: ScaleMode) {
    this.removerOrbitas();
    const planets = bodies.filter((b) => b.id !== 'sun' && b.type !== 'belt' && b.type !== 'exoplanet');

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
    // Escala das labels mantida constante na tela
    if (cp) {
      for (const [id, label] of this.labels) {
        const body = this.bodies.get(id);
        if (!body) continue;
        body.group.getWorldPosition(_posDetalhe);
        label.sprite.getWorldPosition(_posDetalhe);
        label.updateScale(cp.distanceTo(_posDetalhe));
      }
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

  dispose() {
    for (const b of this.bodies.values()) b.dispose();
    for (const belt of this.belts) belt.dispose();
    for (const t of this.trajectories) t.dispose();
    this.removerOrbitas();
    this.moonBase?.dispose();
    for (const sat of this.satellites) sat.dispose();
    this.exoPortal?.dispose();
    for (const l of this.labels.values()) l.dispose();
    this.labels.clear();
  }
}
