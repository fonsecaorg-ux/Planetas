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
    }
    this.criarOrbitas(opts.data.bodies, opts.scaleMode);

    const earth = this.bodies.get('earth');
    if (earth) {
      // Tripulação — começa na Terra e acompanha o corpo em foco
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
    const raios = bodies
      .filter((b) => b.id !== 'sun' && b.type !== 'belt' && b.type !== 'exoplanet')
      .map((b) => orbitDistance(b.distanceKm, scaleMode));
    // Cada segmento tem 2 vértices de 3 floats
    const pos = new Float32Array(raios.length * ORBITA_SEGMENTOS * 6);
    let k = 0;
    for (const dist of raios) {
      for (let i = 0; i < ORBITA_SEGMENTOS; i++) {
        const a0 = (i / ORBITA_SEGMENTOS) * Math.PI * 2;
        const a1 = ((i + 1) / ORBITA_SEGMENTOS) * Math.PI * 2;
        pos[k++] = Math.cos(a0) * dist; pos[k++] = 0; pos[k++] = Math.sin(a0) * dist;
        pos[k++] = Math.cos(a1) * dist; pos[k++] = 0; pos[k++] = Math.sin(a1) * dist;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.35 });
    this.orbitas = new THREE.LineSegments(geo, mat);
    this.group.add(this.orbitas);
  }

  private removerOrbitas() {
    if (!this.orbitas) return;
    this.group.remove(this.orbitas);
    this.orbitas.geometry.dispose();
    (this.orbitas.material as THREE.Material).dispose();
    this.orbitas = null;
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

  // Reposiciona a tripulação em volta do corpo. No Sol ela fica na Terra
  private escortTo(body: CelestialBody) {
    const alvo = body.data.type === 'star' ? this.bodies.get('earth') : body;
    if (!alvo) return;
    this.astronauts.forEach((astro, i) => {
      const raio = alvo.radius + ESCOLTA_ALTURA + i * ESCOLTA_ESPACAMENTO;
      const angulo = (i / Math.max(this.astronauts.length, 1)) * Math.PI * 2;
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
  }

  getBody(id: string): CelestialBody | undefined {
    return this.bodies.get(id);
  }

  dispose() {
    for (const b of this.bodies.values()) b.dispose();
    for (const belt of this.belts) belt.dispose();
    for (const t of this.trajectories) t.dispose();
    this.removerOrbitas();
  }
}
