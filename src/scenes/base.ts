import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AstronautData, RocketData, BodyData } from '@/data/types';
import { Astronaut } from '@/core/astronaut';
import { Rocket } from '@/core/rocket';
import { createDaylight } from '@/core/lighting';
import { disposeObject3D } from '@/core/engine';
import { narrate } from '@/core/narration';

export type JourneyState = 'idle' | 'chegada' | 'treinamento' | 'contagem' | 'lancamento' | 'concluido';

const gltfLoader = new GLTFLoader();

// ---------------------------------------------------------------------------
// Painel 3D — quiz/status desenhado com CanvasTexture para funcionar em WebXR
// ---------------------------------------------------------------------------
const PANEL_W = 4;
const PANEL_H = 3;
const CANVAS_W = 512;
const CANVAS_H = 384;
// Regiões dos botões no canvas (px, y de cima)
const BTN_Y0 = [160, 215, 270, 325];
const BTN_H_PX = 50;

class JourneyPanel {
  readonly group: THREE.Group;
  readonly buttonHitboxes: { mesh: THREE.Mesh; id: string }[] = [];
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private panelMesh: THREE.Mesh;

  constructor(position: THREE.Vector3) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);

    const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide });
    this.panelMesh = new THREE.Mesh(geo, mat);
    this.group.add(this.panelMesh);

    // Suporte do painel
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, position.y, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    pole.position.set(0, -position.y / 2, 0);
    this.group.add(pole);

    // Hitboxes para os 4 botões de resposta
    for (let i = 0; i < 4; i++) {
      const yUV = (BTN_Y0[i] + BTN_H_PX / 2) / CANVAS_H;
      const worldY = (0.5 - yUV) * PANEL_H;
      const hb = new THREE.Mesh(
        new THREE.BoxGeometry(PANEL_W * 0.9, (BTN_H_PX / CANVAS_H) * PANEL_H, 0.1),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hb.position.set(0, worldY, 0.06);
      hb.userData = { bodyId: `quiz:${i}` };
      this.group.add(hb);
      this.buttonHitboxes.push({ mesh: hb, id: `quiz:${i}` });
    }

    this.renderIdle();
  }

  renderArrival() {
    this.draw((ctx) => {
      this.drawBackground(ctx, '#0a1628');
      ctx.fillStyle = '#7dd3fc';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚀 BEM-VINDO AO CENTRO DE CONTROLE', CANVAS_W / 2, 70);
      ctx.fillStyle = '#e8eef7';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Prepare-se para a missão espacial!', CANVAS_W / 2, 120);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('Aguardando início do treinamento...', CANVAS_W / 2, 200);
    });
  }

  renderQuestion(question: string, options: string[], feedback?: string, answered?: number, correct?: number) {
    this.draw((ctx) => {
      this.drawBackground(ctx, '#0a1628');
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎯 MISSÃO — TREINAMENTO', CANVAS_W / 2, 40);
      ctx.fillStyle = '#e8eef7';
      ctx.font = '17px system-ui, sans-serif';
      this.drawWrapped(ctx, question, 24, 80, CANVAS_W - 48, 22);

      options.forEach((opt, i) => {
        const y0 = BTN_Y0[i];
        let bg = 'rgba(255,255,255,0.08)';
        let border = 'rgba(255,255,255,0.2)';
        if (answered !== undefined) {
          if (i === correct) { bg = 'rgba(34,197,94,0.25)'; border = '#22c55e'; }
          else if (i === answered && i !== correct) { bg = 'rgba(239,68,68,0.25)'; border = '#ef4444'; }
        }
        ctx.fillStyle = bg;
        ctx.strokeStyle = border;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(16, y0, CANVAS_W - 32, BTN_H_PX - 4, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e8eef7';
        ctx.font = '15px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}. ${opt}`, 28, y0 + 29);
      });

      if (feedback) {
        ctx.fillStyle = answered === correct ? '#22c55e' : '#ef4444';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(feedback, CANVAS_W / 2, 365);
      }
    });
  }

  renderCountdown(seconds: number) {
    this.draw((ctx) => {
      this.drawBackground(ctx, '#0a0a1a');
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CONTAGEM REGRESSIVA', CANVAS_W / 2, 60);
      ctx.fillStyle = '#e8eef7';
      ctx.font = `bold ${seconds <= 3 ? '100' : '80'}px system-ui, sans-serif`;
      ctx.fillText(seconds > 0 ? String(seconds) : 'IGNIÇÃO!', CANVAS_W / 2, 220);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Todos os sistemas nominais', CANVAS_W / 2, 310);
    });
  }

  renderLaunch() {
    this.draw((ctx) => {
      this.drawBackground(ctx, '#0a0a1a');
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚀 DECOLAGEM!', CANVAS_W / 2, 120);
      ctx.fillStyle = '#e8eef7';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Aceleração nominal.', CANVAS_W / 2, 200);
      ctx.fillText('Partindo para o espaço...', CANVAS_W / 2, 240);
    });
  }

  renderIdle() {
    this.draw((ctx) => {
      this.drawBackground(ctx, '#060e1a');
      ctx.fillStyle = '#334466';
      ctx.font = '18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Painel de Missão', CANVAS_W / 2, CANVAS_H / 2);
    });
  }

  private draw(fn: (ctx: CanvasRenderingContext2D) => void) {
    this.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    fn(this.ctx);
    this.texture.needsUpdate = true;
  }

  private drawBackground(ctx: CanvasRenderingContext2D, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // Borda
    ctx.strokeStyle = 'rgba(125,211,252,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);
  }

  private drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x + maxW / 2, y);
        line = word;
        y += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x + maxW / 2, y);
  }

  dispose() {
    this.panelMesh.geometry.dispose();
    (this.panelMesh.material as THREE.Material).dispose();
    this.texture.dispose();
    for (const hb of this.buttonHitboxes) {
      hb.mesh.geometry.dispose();
    }
  }
}

export class BaseScene {
  readonly group: THREE.Group;
  readonly astronauts: Astronaut[] = [];
  readonly rockets: Rocket[] = [];
  readonly hitboxes: { mesh: THREE.Mesh; id: string }[] = [];
  private monitors: THREE.Mesh[] = [];

  // --- Máquina de estados da jornada ---
  private journeyState: JourneyState = 'idle';
  private journeyPanel: JourneyPanel | null = null;
  private quizData: BodyData['mission'] | null = null;
  private quizDifficulty: 'easy' | 'medium' = 'easy';
  private quizAnswered: number | undefined = undefined;
  private countdownSecs = 10;
  private countdownElapsed = 0;
  private launchElapsed = 0;
  private chegadaElapsed = 0;

  onJourneyComplete?: () => void;
  onCameraRequest?: (pos: THREE.Vector3, target: THREE.Vector3) => void;

  constructor(astronautData: AstronautData[], rocketData: RocketData[], activeId: string | null) {
    this.group = new THREE.Group();
    createDaylight(this.group);

    // Terreno
    const groundGeo = new THREE.PlaneGeometry(80, 60);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Pista de acesso
    const roadGeo = new THREE.PlaneGeometry(6, 60);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, 0);
    this.group.add(road);

    // Prédio de controle (escritório)
    this.buildControlBuilding();

    // Estacionamento + carros
    this.buildParking();

    // Plataforma de lançamento + foguetes
    this.buildLaunchPad(rocketData);

    // Astronautas
    astronautData.forEach((a, i) => {
      const astro = new Astronaut(a, i);
      astro.group.position.set(-8 + i * 2, 0.5, 18);
      if (a.id === activeId) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 24), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.1;
        astro.group.add(ring);
      }
      this.astronauts.push(astro);
      this.group.add(astro.group);
    });

    // Céu (fundo)
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(200, 16, 16), new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide })));
  }

  private buildControlBuilding() {
    const w = 12, h = 6, d = 8;
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c8, roughness: 0.6 });
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
    building.position.set(-10, h / 2, -15);
    building.castShadow = true;
    building.receiveShadow = true;
    this.group.add(building);

    // Janelas (planos emissivos)
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
    for (let i = 0; i < 4; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), windowMat);
      win.position.set(-10 - w / 2 + 0.01, 2.5 + (i % 2) * 1.5, -15 + (i < 2 ? -2 : 2));
      win.rotation.y = -Math.PI / 2;
      this.group.add(win);
    }

    // Porta
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), doorMat);
    door.position.set(-10, 1.25, -15 + d / 2 + 0.01);
    this.group.add(door);

    // Antena
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    ant.position.set(-10, h + 2, -15);
    this.group.add(ant);

    // Letreiro
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CENTRO DE CONTROLE', 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(-10, h + 0.5, -15 + d / 2 + 0.01);
    this.group.add(sign);

    // Hitbox
    const hb = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    hb.position.set(-10, h / 2, -15);
    this.group.add(hb);
    this.hitboxes.push({ mesh: hb, id: 'building' });

    // Interior: sala de monitores (um grupo dentro do prédio)
    this.buildMonitorRoom();
  }

  private buildMonitorRoom() {
    // Posicionado dentro do prédio (aprox.)
    const roomGroup = new THREE.Group();
    roomGroup.position.set(-10, 0, -15);

    // Monitores (planos com canvas de dados)
    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#22c55e';
      ctx.font = '12px monospace';
      const lines = ['SYS OK', 'ORBIT: STABLE', 'FUEL: 98%', 'COMM: ACTIVE', `T+${i * 12}:00`];
      lines.forEach((l, j) => ctx.fillText(l, 8, 20 + j * 18));
      // gráfico
      ctx.strokeStyle = '#7dd3fc';
      ctx.beginPath();
      for (let x = 0; x < 256; x++) {
        const y = 90 + Math.sin(x / 20 + i) * 20;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const tex = new THREE.CanvasTexture(canvas);
      const mon = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: tex }));
      mon.position.set(-2 + (i % 3) * 1.4, 2.0, -2.5 + Math.floor(i / 3) * 1.2);
      roomGroup.add(mon);
      this.monitors.push(mon);
    }

    // Mesa
    const desk = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: 0x555555 }));
    desk.position.set(0, 0.9, -1.5);
    roomGroup.add(desk);

    this.group.add(roomGroup);
  }

  private buildParking() {
    const lotGeo = new THREE.PlaneGeometry(14, 10);
    const lotMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7 });
    const lot = new THREE.Mesh(lotGeo, lotMat);
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(8, 0.02, 10);
    this.group.add(lot);

    const carModels = ['models/car_sedan.glb', 'models/car_suv.glb', 'models/car_taxi.glb'];
    const fallbackColors = [0x3b82f6, 0xef4444, 0xf59e0b];
    for (let i = 0; i < 3; i++) {
      const spot = new THREE.Group();
      spot.position.set(4 + i * 3.5, 0, 10);
      spot.rotation.y = Math.PI / 2;
      this.group.add(spot);

      // fallback procedural
      const fallback = this.buildCar(fallbackColors[i]);
      fallback.name = 'procedural';
      spot.add(fallback);

      gltfLoader.load(
        carModels[i],
        (gltf) => {
          const proc = spot.getObjectByName('procedural');
          if (proc) spot.remove(proc);
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.z, size.y) || 1;
          model.scale.setScalar(2.4 / maxDim);
          const box2 = new THREE.Box3().setFromObject(model);
          model.position.y -= box2.min.y;
          model.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });
          spot.add(model);
        },
        undefined,
        () => {
          /* mantém fallback */
        }
      );

      const hb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
      hb.position.set(4 + i * 3.5, 0.6, 10);
      this.group.add(hb);
      this.hitboxes.push({ mesh: hb, id: `car:${i}` });
    }
  }

  private buildCar(color: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.0), mat);
    body.position.y = 0.5;
    body.castShadow = true;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.9), mat);
    cabin.position.set(-0.2, 1.0, 0);
    g.add(cabin);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 12);
    for (const [x, z] of [[-0.7, 0.5], [-0.7, -0.5], [0.7, 0.5], [0.7, -0.5]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.25, z);
      g.add(w);
    }
    return g;
  }

  private buildLaunchPad(rocketData: RocketData[]) {
    const padGeo = new THREE.CylinderGeometry(4, 4, 0.3, 24);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(12, 0.15, -5);
    this.group.add(pad);

    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    tower.position.set(12, 3, -9);
    this.group.add(tower);

    rocketData.forEach((r, i) => {
      const rocket = new Rocket(r, i);
      rocket.group.position.set(10 + i * 2.5, 0, -5);
      rocket['baseY'] = 0; // alinhar base ao chão da cena
      // acesso controlado: baseY é privado; usamos any para reset de launch na base
      (rocket as any).baseY = 0;
      this.rockets.push(rocket);
      this.group.add(rocket.group);
      this.hitboxes.push({ mesh: rocket.hitbox, id: `rocket:${r.id}` });
    });
  }

  update(dt: number, timeSpeed: number) {
    for (const a of this.astronauts) a.update(dt, timeSpeed);
    for (const r of this.rockets) r.update(dt, timeSpeed);
    this.tickJourney(dt);
  }

  // -------------------------------------------------------------------------
  // Jornada terrestre: chegada → treinamento → contagem → lançamento → hub
  // -------------------------------------------------------------------------

  /**
   * Inicia a jornada. Cria o painel 3D e começa o estado `chegada`.
   * Deve ser chamado após rebuildSelectable() para que os hitboxes do
   * painel sejam incluídos na lista de selectable de main.ts.
   * Chame rebuildSelectable() novamente após esta função.
   */
  startJourney(bodyData: BodyData, onComplete: () => void, onCamera: (pos: THREE.Vector3, target: THREE.Vector3) => void) {
    this.quizData = bodyData.mission;
    this.onJourneyComplete = onComplete;
    this.onCameraRequest = onCamera;
    this.quizDifficulty = 'easy';
    this.quizAnswered = undefined;

    // Painel posicionado à frente dos astronautas, voltado para a câmera (+Z)
    if (!this.journeyPanel) {
      this.journeyPanel = new JourneyPanel(new THREE.Vector3(0, 2.5, 10));
      this.group.add(this.journeyPanel.group);
      for (const hb of this.journeyPanel.buttonHitboxes) {
        this.hitboxes.push(hb);
      }
    }

    this.setJourneyState('chegada');
  }

  handlePanelClick(optionIndex: number) {
    if (this.journeyState !== 'treinamento' || !this.quizData || this.quizAnswered !== undefined) return;
    const q = this.quizData[this.quizDifficulty];
    this.quizAnswered = optionIndex;
    const isCorrect = optionIndex === q.answer;
    this.journeyPanel?.renderQuestion(q.q, q.options, isCorrect ? '✅ Correto!' : '❌ Errado!', optionIndex, q.answer);
    if (isCorrect) {
      narrate('treinamento_correto');
      setTimeout(() => this.setJourneyState('contagem'), 2500);
    } else {
      narrate('treinamento_errado');
      setTimeout(() => { this.quizAnswered = undefined; this.renderCurrentQuiz(); }, 2500);
    }
  }

  private setJourneyState(state: JourneyState) {
    this.journeyState = state;
    switch (state) {
      case 'chegada':
        this.chegadaElapsed = 0;
        this.journeyPanel?.renderArrival();
        narrate('chegada');
        this.onCameraRequest?.(new THREE.Vector3(0, 12, 30), new THREE.Vector3(0, 2, 0));
        break;
      case 'treinamento':
        this.quizAnswered = undefined;
        this.renderCurrentQuiz();
        narrate('treinamento');
        this.onCameraRequest?.(new THREE.Vector3(-3, 3, 22), new THREE.Vector3(0, 2, 10));
        break;
      case 'contagem':
        this.countdownSecs = 10;
        this.countdownElapsed = 0;
        this.journeyPanel?.renderCountdown(10);
        narrate('contagem');
        this.onCameraRequest?.(new THREE.Vector3(5, 15, 10), new THREE.Vector3(12, 0, -5));
        break;
      case 'lancamento':
        this.launchElapsed = 0;
        this.journeyPanel?.renderLaunch();
        narrate('lancamento');
        for (const r of this.rockets) r.launch();
        break;
      case 'concluido':
        narrate('transicao');
        setTimeout(() => this.onJourneyComplete?.(), 2000);
        break;
    }
  }

  private renderCurrentQuiz() {
    if (!this.quizData || !this.journeyPanel) return;
    const q = this.quizData[this.quizDifficulty];
    this.journeyPanel.renderQuestion(q.q, q.options);
  }

  private tickJourney(dt: number) {
    if (this.journeyState === 'chegada') {
      this.chegadaElapsed += dt;
      if (this.chegadaElapsed >= 3) this.setJourneyState('treinamento');
    } else if (this.journeyState === 'contagem') {
      this.countdownElapsed += dt;
      if (this.countdownElapsed >= 1) {
        this.countdownSecs--;
        this.countdownElapsed = 0;
        this.journeyPanel?.renderCountdown(this.countdownSecs);
        if (this.countdownSecs <= 0) this.setJourneyState('lancamento');
      }
    } else if (this.journeyState === 'lancamento') {
      this.launchElapsed += dt;
      if (this.launchElapsed >= 4) this.setJourneyState('concluido');
    }
  }

  // A base é recriada a cada visita; sem isto cada ida e volta vaza
  // geometrias, texturas de letreiro/monitores e os modelos dos astronautas
  dispose() {
    this.journeyPanel?.dispose();
    disposeObject3D(this.group);
  }
}
