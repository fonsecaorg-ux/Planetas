import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AstronautData, RocketData, MissionQuestion } from '@/data/types';
import { Astronaut } from '@/core/astronaut';
import { Rocket } from '@/core/rocket';
import { createDaylight } from '@/core/lighting';
import { disposeObject3D } from '@/core/engine';
import { narrate } from '@/core/narration';

const _gltf = new GLTFLoader();

export type JourneyState = 'idle' | 'pronto' | 'treinamento' | 'resultado' | 'contagem' | 'lancamento' | 'concluido';

// ─────────────────────────────────────────────────────────────────────────────
// Design system do painel
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:          '#030c18',
  bg2:         '#060f20',
  cyan:        '#00d4ff',
  cyanGlow:    'rgba(0,212,255,0.12)',
  cyanDim:     'rgba(0,212,255,0.3)',
  cyanBright:  'rgba(0,212,255,0.75)',
  amber:       '#f59e0b',
  amberDim:    'rgba(245,158,11,0.18)',
  green:       '#10b981',
  greenDim:    'rgba(16,185,129,0.22)',
  red:         '#f87171',
  redDim:      'rgba(248,113,113,0.22)',
  textHi:      '#f0f6ff',
  textMid:     '#8aaccf',
  textLow:     '#304a68',
  divider:     'rgba(0,212,255,0.12)',
};

const PANEL_W   = 4.5;
const PANEL_H   = 3.375; // mantém aspect 4:3
const CANVAS_W  = 1024;
const CANVAS_H  = 768;

// Posição Y (topo do botão, em px a partir do topo do canvas) e altura
const BTN_H_PX = 82;
const BTN_GAP  = 10;
const BTN_AREA_Y0 = 288; // início da área de botões
const BTN_Y0 = Array.from({ length: 4 }, (_, i) => BTN_AREA_Y0 + i * (BTN_H_PX + BTN_GAP));

// ─────────────────────────────────────────────────────────────────────────────
// Painel 3D CanvasTexture — funciona dentro de WebXR (HTML não renderiza em XR)
// ─────────────────────────────────────────────────────────────────────────────
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
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 4;

    const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide });
    this.panelMesh = new THREE.Mesh(geo, mat);
    this.group.add(this.panelMesh);

    // Base metálica do painel
    this._buildStand(position.y);

    // Hitboxes dos 4 botões de resposta
    for (let i = 0; i < 4; i++) {
      const yUV   = (BTN_Y0[i] + BTN_H_PX / 2) / CANVAS_H;
      const worldY = (0.5 - yUV) * PANEL_H;
      const hb = new THREE.Mesh(
        new THREE.BoxGeometry(PANEL_W * 0.9, (BTN_H_PX / CANVAS_H) * PANEL_H + 0.05, 0.1),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hb.position.set(0, worldY, 0.07);
      hb.userData = { bodyId: `quiz:${i}` };
      this.group.add(hb);
      this.buttonHitboxes.push({ mesh: hb, id: `quiz:${i}` });
    }

    // Hitbox: botão INICIAR MISSÃO (quiz:99) e REPETIR (quiz:98) — centro inferior
    for (const id of ['quiz:99', 'quiz:98']) {
      const hb = new THREE.Mesh(
        new THREE.BoxGeometry(PANEL_W * 0.6, 0.32, 0.1),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hb.position.set(0, (0.5 - 660 / CANVAS_H) * PANEL_H, 0.07);
      hb.userData = { bodyId: id };
      this.group.add(hb);
      this.buttonHitboxes.push({ mesh: hb, id });
    }

    this.renderIdle();
  }

  // ── Renders públicos ────────────────────────────────────────────────────────

  renderArrival() {
    this._draw(() => {
      const ctx = this.ctx;
      this._base();
      this._header('CENTRO DE CONTROLE DE MISSÃO', 'CONEXÃO ESTABELECIDA', C.green);

      // Ícone central
      ctx.font = '80px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🛰️', CANVAS_W / 2, 310);

      // Bloco de briefing
      this._card(80, 350, CANVAS_W - 160, 220, C.cyanDim, C.cyan);

      ctx.fillStyle = C.cyan;
      ctx.font = `bold 20px 'Courier New', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('> BRIEFING DA MISSÃO', 108, 388);

      ctx.fillStyle = C.textHi;
      ctx.font = '17px system-ui, sans-serif';
      this._wrapped('Bem-vindo ao Centro de Controle. Antes do lançamento, você deve completar o treinamento de missão e demonstrar conhecimento do sistema solar.',
        108, 415, CANVAS_W - 216, 24);

      // Barra de progresso de boot
      ctx.fillStyle = C.textMid;
      ctx.font = `14px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('INICIALIZANDO SISTEMAS...', CANVAS_W / 2, 606);
      this._progressBar(80, 622, CANVAS_W - 160, 14, 0.75, C.cyan);

      this._footer('AGUARDANDO INÍCIO DO TREINAMENTO');
    });
  }

  renderReady() {
    this._draw(() => {
      const ctx = this.ctx;
      this._base();
      this._header('BASE DE LANÇAMENTO', 'PRONTO PARA MISSÃO', C.green);

      ctx.font = '72px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🚀', CANVAS_W / 2, 260);

      this._card(100, 300, CANVAS_W - 200, 200, C.cyanGlow, C.cyanDim);
      ctx.fillStyle = C.cyan;
      ctx.font = `bold 18px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('MISSÃO DE TREINAMENTO', CANVAS_W / 2, 335);
      ctx.fillStyle = C.textHi;
      ctx.font = '16px system-ui, sans-serif';
      this._wrapped('Responda 3 perguntas sobre o Sistema Solar. Acerte ao menos 2 de 3 para liberar o lançamento.', 130, 368, CANVAS_W - 260, 24);

      // Botão INICIAR
      ctx.fillStyle = C.cyan;
      ctx.shadowColor = C.cyan; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.roundRect(220, 596, CANVAS_W - 440, 86, 10); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#030c18';
      ctx.font = `bold 22px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('▶  INICIAR MISSÃO', CANVAS_W / 2, 648);

      this._footer('CLIQUE NO BOTÃO ACIMA PARA COMEÇAR');
    });
  }

  renderResult(correct: number, total: number) {
    this._draw(() => {
      const ctx = this.ctx;
      this._base();
      const passed = correct >= 2;
      this._header('RESULTADO FINAL', passed ? 'APROVADO ✓' : 'INSUFICIENTE', passed ? C.green : C.amber);

      ctx.font = '72px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(passed ? '✅' : '⚠️', CANVAS_W / 2, 250);

      const scoreColor = passed ? C.green : C.amber;
      ctx.fillStyle = scoreColor;
      ctx.font = `bold 52px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${correct} / ${total}`, CANVAS_W / 2, 365);

      ctx.fillStyle = C.textHi;
      ctx.font = '18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(passed ? 'Autorização de lançamento concedida!' : `Mínimo: 2 de ${total}. Tente novamente.`, CANVAS_W / 2, 418);

      if (!passed) {
        // Botão REPETIR
        ctx.fillStyle = C.amber;
        ctx.shadowColor = C.amber; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.roundRect(220, 596, CANVAS_W - 440, 86, 10); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#030c18';
        ctx.font = `bold 22px 'Courier New', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('↺  REPETIR MISSÃO', CANVAS_W / 2, 648);
        this._footer('CLIQUE PARA TENTAR NOVAMENTE');
      } else {
        this._footer('INICIANDO CONTAGEM REGRESSIVA...');
      }
    });
  }

  renderQuestion(
    question: string,
    options: string[],
    feedback?: string,
    answered?: number,
    correct?: number,
    questionNum = 1,
    totalQuestions = 3,
  ) {
    this._draw(() => {
      const ctx = this.ctx;
      this._base();
      this._header('TREINAMENTO DE VOO', `${questionNum}/${totalQuestions}`, C.amber);

      // Indicador de progresso das perguntas
      const dotR = 10;
      for (let i = 0; i < totalQuestions; i++) {
        const cx = CANVAS_W / 2 + (i - (totalQuestions - 1) / 2) * 32;
        this.ctx.fillStyle = i < questionNum ? C.amber : 'rgba(255,255,255,0.15)';
        this.ctx.beginPath(); this.ctx.arc(cx, 86, dotR, 0, Math.PI * 2); this.ctx.fill();
      }

      // Box da pergunta
      this._card(40, 108, CANVAS_W - 80, 158, C.amberDim, C.amber);

      ctx.fillStyle = C.amber;
      ctx.font = `bold 14px 'Courier New', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('> PERGUNTA DE MISSÃO', 68, 134);

      ctx.fillStyle = C.textHi;
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'left';
      this._wrapped(question, 60, 162, CANVAS_W - 120, 26);

      // Botões de opção
      const letters = ['A', 'B', 'C', 'D'];
      options.forEach((opt, i) => {
        const y0 = BTN_Y0[i];
        let bgColor   = C.cyanGlow;
        let borderCol = C.cyanDim;
        let textCol   = C.textHi;
        let letterBg  = C.cyanDim;

        if (answered !== undefined) {
          if (i === correct) {
            bgColor = C.greenDim; borderCol = C.green; letterBg = C.green; textCol = '#d1fae5';
          } else if (i === answered && i !== correct) {
            bgColor = C.redDim; borderCol = C.red; letterBg = C.red; textCol = '#fee2e2';
          } else {
            textCol = C.textLow; borderCol = 'rgba(0,212,255,0.08)'; bgColor = 'transparent';
          }
        }

        // Fundo do botão
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderCol;
        ctx.lineWidth = answered !== undefined && (i === correct || i === answered) ? 2 : 1.5;
        ctx.beginPath();
        ctx.roundRect(40, y0, CANVAS_W - 80, BTN_H_PX, 8);
        ctx.fill();
        ctx.stroke();

        // Badge da letra
        ctx.fillStyle = letterBg;
        ctx.beginPath();
        ctx.roundRect(56, y0 + 16, 50, BTN_H_PX - 32, 6);
        ctx.fill();
        ctx.fillStyle = answered !== undefined && (i === correct || i === answered) ? '#fff' : C.cyan;
        ctx.font = `bold 20px 'Courier New', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(letters[i], 81, y0 + BTN_H_PX / 2 + 7);

        // Texto da opção
        ctx.fillStyle = textCol;
        ctx.font = '17px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(opt, 120, y0 + BTN_H_PX / 2 + 7);
      });

      // Feedback
      if (feedback) {
        const isOk = answered === correct;
        this._feedbackBar(feedback, isOk ? C.green : C.red, isOk ? '✓' : '✗');
      } else {
        this._footer('TOQUE EM UMA OPÇÃO PARA RESPONDER');
      }
    });
  }

  renderCountdown(seconds: number) {
    this._draw(() => {
      const ctx = this.ctx;
      this._base();
      const urgent = seconds <= 3;
      this._header('SEQUÊNCIA DE LANÇAMENTO', urgent ? 'ALARME ATIVO' : 'INICIADA', urgent ? C.red : C.amber);

      // Ring de contagem regressiva
      const cx = CANVAS_W / 2;
      const cy = 370;
      const R  = 155;
      const frac = Math.max(seconds, 0) / 10;

      // Fundo do ring
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 18;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      // Arco de progresso
      const col = urgent ? C.red : C.cyan;
      ctx.strokeStyle = col;
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.shadowColor = col;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineCap = 'butt';

      // Número central
      ctx.fillStyle = urgent ? C.red : C.textHi;
      ctx.font = `bold ${seconds > 0 ? '110' : '60'}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(seconds > 0 ? String(seconds) : 'IGNIÇÃO!', cx, cy);
      ctx.textBaseline = 'alphabetic';

      // Status
      const lines = ['SYS: NOMINAL', 'COMBUSTÍVEL: 100%', 'CÂMARA: PRESSURIZANDO'];
      ctx.fillStyle = C.textMid;
      ctx.font = `13px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, cx, 568 + i * 22));

      this._footer(urgent ? '⚠  LANÇAMENTO IMINENTE' : 'TODOS OS SISTEMAS VERIFICADOS');
    });
  }

  renderLaunch() {
    this._draw(() => {
      const ctx = this.ctx;
      this._base();
      this._header('DECOLAGEM', 'MISSÃO CONCLUÍDA', C.green);

      // Rocket icon grande
      ctx.font = '90px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🚀', CANVAS_W / 2, 300);

      // Check-list de sistemas
      const checks = [
        '✓  TRAJETÓRIA NOMINAL',
        '✓  COMUNICAÇÃO ATIVA',
        '✓  MISSÃO BEM-SUCEDIDA',
        '✓  PORTAL ESPACIAL ABERTO',
      ];
      checks.forEach((line, i) => {
        ctx.fillStyle = i < 3 ? C.green : C.cyan;
        ctx.font = `bold 20px 'Courier New', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(line, CANVAS_W / 2, 390 + i * 44);
      });

      this._footer('INICIANDO TRANSIÇÃO PARA O HUB ESPACIAL...');
    });
  }

  renderIdle() {
    this._draw(() => {
      this._base();
      this.ctx.fillStyle = C.textLow;
      this.ctx.font = `16px 'Courier New', monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('PAINEL DE MISSÃO — AGUARDANDO', CANVAS_W / 2, CANVAS_H / 2);
      this.ctx.textBaseline = 'alphabetic';
    });
  }

  renderComplete(stats: { name: string; visited: number; missions: number; score: number }) {
    this._draw(() => {
      const ctx = this.ctx;
      this._base();
      this._header('BASE DE LANÇAMENTO', 'MISSÃO CONCLUÍDA ✓', C.green);

      ctx.font = '64px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🏆', CANVAS_W / 2, 230);

      ctx.fillStyle = C.textHi;
      ctx.font = `bold 24px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(stats.name.toUpperCase(), CANVAS_W / 2, 285);

      const statItems: [string, number][] = [
        ['Visitados', stats.visited],
        ['Missões', stats.missions],
        ['Pontuação', stats.score],
      ];
      statItems.forEach(([label, val], i) => {
        const cx = 170 + i * 230;
        this._card(cx - 95, 310, 190, 110, C.cyanGlow, C.cyanDim);
        ctx.fillStyle = C.cyan;
        ctx.font = `bold 36px 'Courier New', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(String(val), cx, 370);
        ctx.fillStyle = C.textMid;
        ctx.font = `12px 'Courier New', monospace`;
        ctx.fillText(label.toUpperCase(), cx, 400);
      });

      this._footer('EXPLORE O SISTEMA SOLAR LIVREMENTE');
    });
  }

  dispose() {
    this.panelMesh.geometry.dispose();
    (this.panelMesh.material as THREE.Material).dispose();
    this.texture.dispose();
    for (const hb of this.buttonHitboxes) hb.mesh.geometry.dispose();
  }

  // ── Helpers privados de desenho ─────────────────────────────────────────────

  private _draw(fn: () => void) {
    this.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    fn();
    this.texture.needsUpdate = true;
  }

  /** Fundo + grid + scanlines + bordas de canto */
  private _base() {
    const ctx = this.ctx;

    // Fundo com gradiente radial sutil
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    bg.addColorStop(0,   '#040d1c');
    bg.addColorStop(0.5, '#030b18');
    bg.addColorStop(1,   '#02070f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid técnico (linhas finas)
    ctx.strokeStyle = 'rgba(0,212,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_W; x += 48) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y < CANVAS_H; y += 48) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }

    // Scanlines sutis (melhor performance que loop de linhas)
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < CANVAS_H; y += 4) {
      ctx.fillRect(0, y, CANVAS_W, 2);
    }

    // Vinheta radial
    const vig = ctx.createRadialGradient(CANVAS_W/2, CANVAS_H/2, CANVAS_H*0.3, CANVAS_W/2, CANVAS_H/2, CANVAS_H*0.85);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Bordas de canto (HUD brackets)
    this._corners(C.cyanDim, 40, 24, 3);

    // Borda geral fina
    ctx.strokeStyle = C.cyanDim;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);
  }

  /** Brackets de canto estilo HUD */
  private _corners(color: string, size: number, margin: number, lw: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    const m = margin;
    const s = size;
    const W = CANVAS_W, H = CANVAS_H;
    // top-left
    ctx.beginPath(); ctx.moveTo(m + s, m); ctx.lineTo(m, m); ctx.lineTo(m, m + s); ctx.stroke();
    // top-right
    ctx.beginPath(); ctx.moveTo(W - m - s, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + s); ctx.stroke();
    // bottom-left
    ctx.beginPath(); ctx.moveTo(m, H - m - s); ctx.lineTo(m, H - m); ctx.lineTo(m + s, H - m); ctx.stroke();
    // bottom-right
    ctx.beginPath(); ctx.moveTo(W - m - s, H - m); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m, H - m - s); ctx.stroke();
  }

  /** Barra de header com título e badge de status */
  private _header(title: string, status: string, statusColor: string) {
    const ctx = this.ctx;

    // Fundo do header
    const hg = ctx.createLinearGradient(0, 0, 0, 72);
    hg.addColorStop(0, 'rgba(0,212,255,0.12)');
    hg.addColorStop(1, 'rgba(0,212,255,0.0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, CANVAS_W, 72);

    ctx.strokeStyle = 'rgba(0,212,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 72); ctx.lineTo(CANVAS_W, 72); ctx.stroke();

    // Logo ponto piscante
    ctx.fillStyle = statusColor;
    ctx.shadowColor = statusColor;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(44, 36, 7, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Título
    ctx.fillStyle = C.textHi;
    ctx.font = `bold 20px 'Courier New', monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(title, 68, 42);

    // Badge de status (direita)
    const bw = ctx.measureText(status).width + 28;
    ctx.fillStyle = `${statusColor}22`;
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(CANVAS_W - bw - 44, 18, bw, 32, 4);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = statusColor;
    ctx.font = `bold 13px 'Courier New', monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(status, CANVAS_W - 58, 38);
  }

  /** Card de fundo com borda colorida */
  private _card(x: number, y: number, w: number, h: number, fill: string, border: string) {
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill(); ctx.stroke();
    // Detalhe de canto superior-esquerdo
    ctx.strokeStyle = border;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y + 20); ctx.lineTo(x, y); ctx.lineTo(x + 20, y); ctx.stroke();
  }

  /** Barra de progresso horizontal */
  private _progressBar(x: number, y: number, w: number, h: number, pct: number, color: string) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.roundRect(x, y, w * Math.min(pct, 1), h, h / 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  /** Faixa de feedback no rodapé */
  private _feedbackBar(msg: string, color: string, icon: string) {
    const ctx = this.ctx;
    ctx.fillStyle = `${color}18`;
    ctx.fillRect(0, CANVAS_H - 60, CANVAS_W, 60);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, CANVAS_H - 60); ctx.lineTo(CANVAS_W, CANVAS_H - 60); ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = `bold 22px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${icon}  ${msg}`, CANVAS_W / 2, CANVAS_H - 25);
  }

  /** Rodapé de texto simples */
  private _footer(msg: string) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,212,255,0.08)';
    ctx.fillRect(0, CANVAS_H - 48, CANVAS_W, 48);
    ctx.strokeStyle = C.divider;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, CANVAS_H - 48); ctx.lineTo(CANVAS_W, CANVAS_H - 48); ctx.stroke();
    ctx.fillStyle = C.textMid;
    ctx.font = `13px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(msg, CANVAS_W / 2, CANVAS_H - 20);
  }

  /** Texto com quebra de linha */
  private _wrapped(text: string, x: number, y: number, maxW: number, lineH: number) {
    const ctx = this.ctx;
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }

  /** Suporte/pedestal metálico do painel */
  private _buildStand(panelY: number) {
    // Haste vertical
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, panelY, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.5, metalness: 0.8 }),
    );
    pole.position.set(0, -panelY / 2, 0);
    this.group.add(pole);

    // Base circular
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6, metalness: 0.7 }),
    );
    base.position.set(0, -panelY + 0.04, 0);
    this.group.add(base);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shaders do céu
// ─────────────────────────────────────────────────────────────────────────────
const skyVert = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFrag = /* glsl */`
  varying vec3 vWorld;
  void main() {
    float h = normalize(vWorld).y; // -1 a 1

    // Cores da hora dourada (amanhecer antes do lançamento)
    vec3 zenith   = vec3(0.07, 0.11, 0.30);   // azul noturno no topo
    vec3 midBlue  = vec3(0.18, 0.40, 0.72);   // azul do dia
    vec3 horizon  = vec3(0.95, 0.60, 0.22);   // dourado/laranja no horizonte
    vec3 ground   = vec3(0.12, 0.20, 0.08);   // verde escuro embaixo

    vec3 sky;
    if (h >= 0.0) {
      float t = pow(h, 0.6);
      sky = mix(horizon, mix(midBlue, zenith, t), smoothstep(0.0, 0.25, h));
    } else {
      sky = mix(horizon, ground, min(-h * 3.0, 1.0));
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Cena da base de lançamento
// ─────────────────────────────────────────────────────────────────────────────
export class BaseScene {
  readonly group: THREE.Group;
  readonly astronauts: Astronaut[] = [];
  readonly rockets: Rocket[] = [];
  readonly hitboxes: { mesh: THREE.Mesh; id: string }[] = [];
  private monitors: THREE.Mesh[] = [];

  private journeyState: JourneyState = 'idle';
  private journeyPanel: JourneyPanel | null = null;
  private quizQuestions: MissionQuestion[] = [];
  private quizIndex = 0;
  private quizCorrect = 0;
  private quizAnswered: number | undefined = undefined;
  private countdownSecs = 10;
  private countdownElapsed = 0;
  private launchElapsed = 0;
  // Animated flag
  private flagGeo: THREE.BufferGeometry | null = null;
  private flagOrigPos: Float32Array | null = null;
  private flagTime = 0;
  // Clouds
  private clouds: Array<{ mesh: THREE.Mesh; speed: number }> = [];
  // Smoke
  private smokeGeo: THREE.BufferGeometry | null = null;
  private smokePos: Float32Array | null = null;
  private smokeVel: Float32Array | null = null;
  private smokeActive = false;
  // Veículo de lançamento dedicado (base scene)
  private launchVehicle: THREE.Group | null = null;
  private launchVehicleT = 0;
  private launchVehicleLaunching = false;
  private launchFlame: THREE.Sprite | null = null;
  // Cinematic launch (D)
  private dirLight!: THREE.DirectionalLight;
  private padLights: THREE.SpotLight[] = [];
  private flashTimer = 0;
  private blinkTimer = 0;
  shakeIntensity = 0;
  // Animated monitors (F)
  private monitorCtxs: CanvasRenderingContext2D[] = [];
  private monitorTexs: THREE.CanvasTexture[] = [];
  private monitorTimer = 0;
  // Patrol (E)
  private patrolActive = false;
  private patrolTime = 0;

  onJourneyComplete?: () => void;
  onCameraRequest?: (pos: THREE.Vector3, target: THREE.Vector3) => void;

  constructor(astronautData: AstronautData[], rocketData: RocketData[], activeId: string | null) {
    this.group = new THREE.Group();
    this.dirLight = createDaylight(this.group);

    this._buildSky();
    this._buildGround();
    this._buildControlBuilding();
    this._buildLaunchComplex(rocketData);
    this._buildVegetation();
    this._buildFlagpole();
    this._buildClouds();
    this._buildSmoke();

    astronautData.forEach((a, i) => {
      const astro = new Astronaut(a, i);
      astro.group.position.set(-8 + i * 2.2, 0, 18);
      if (a.id === activeId) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.28, 0.035, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.1;
        astro.group.add(ring);
      }
      this.astronauts.push(astro);
      this.group.add(astro.group);
    });
  }

  // ── Ambiente ────────────────────────────────────────────────────────────────

  private _buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    sky.renderOrder = -1;
    this.group.add(sky);
  }

  private _buildGround() {
    // Grama principal
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Pista de asfalto (central)
    this.group.add(this._plane(6, 100, 0x1a1a1a, 0, 0.01, 0, 0.9));

    // Plataformas de concreto
    this.group.add(this._plane(30, 20, 0x4a4a4a, 8, 0.02, -8, 0.8)); // área do lançamento
    this.group.add(this._plane(20, 12, 0x3c3c3c, -10, 0.02, -15, 0.8)); // estacionamento

    // Faixas na pista
    const stripMat = new THREE.MeshStandardMaterial({ color: 0xf0e030, roughness: 0.8 });
    for (let z = -40; z < 40; z += 10) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5), stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.03, z);
      this.group.add(strip);
    }
  }

  private _plane(w: number, d: number, color: number, x: number, y: number, z: number, rough: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness: rough }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    return m;
  }

  private _buildControlBuilding() {
    const g = new THREE.Group();
    g.position.set(-11, 0, -16);

    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xd4cfc4, roughness: 0.75 });
    const glassMat    = new THREE.MeshStandardMaterial({ color: 0x2a4a7f, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 });
    const steelMat    = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4, metalness: 0.8 });

    // Corpo principal do prédio
    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 10), concreteMat);
    body.position.y = 3.5;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // Cobertura (recuada)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.6, 10.4), steelMat);
    roof.position.y = 7.3;
    g.add(roof);

    // Faixa de janelas — andar térreo
    for (let i = 0; i < 5; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), glassMat);
      win.position.set(-5 + i * 2.5, 1.8, 5.02);
      g.add(win);
    }
    // Faixa de janelas — 1º andar
    for (let i = 0; i < 5; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), glassMat);
      win.position.set(-5 + i * 2.5, 4.2, 5.02);
      g.add(win);
    }

    // Porta de entrada
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.8, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x1a2535, roughness: 0.5 }),
    );
    door.position.set(0, 1.4, 5.1);
    g.add(door);

    // Marquise da entrada
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.15, 1.5), steelMat);
    canopy.position.set(0, 3.2, 5.8);
    g.add(canopy);

    // Colunas
    for (const x of [-1.6, 1.6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8), concreteMat);
      col.position.set(x, 1.6, 5.75);
      g.add(col);
    }

    // Letreiro
    g.add(this._sign('CONTROLE DE MISSÃO', 0, 7.1, 5.02, 8, 1.2));

    // Antena + prato de satélite
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5, 6), steelMat);
    ant.position.set(5, 10, -1);
    g.add(ant);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steelMat);
    dish.rotation.x = Math.PI / 3;
    dish.position.set(5, 12.5, -1);
    g.add(dish);

    // HVAC rooftop
    for (let i = 0; i < 3; i++) {
      const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.2), steelMat);
      hvac.position.set(-4 + i * 4, 8.0, -1);
      g.add(hvac);
    }

    // Hitbox
    const hb = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hb.position.y = 3.5;
    g.add(hb);
    this.hitboxes.push({ mesh: hb, id: 'building' });

    // Sala de monitores interna (visível pela janela)
    this._buildMonitorRoom(g);

    this.group.add(g);
  }

  private _buildMonitorRoom(parent: THREE.Group) {
    const room = new THREE.Group();
    room.position.set(0, 0, -2);

    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 160;
      const ctx = canvas.getContext('2d')!;

      // Fundo
      ctx.fillStyle = '#030c18';
      ctx.fillRect(0, 0, 256, 160);

      // Grade de fundo
      ctx.strokeStyle = 'rgba(0,212,255,0.08)';
      for (let x = 0; x < 256; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 160); ctx.stroke(); }
      for (let y = 0; y < 160; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }

      // Telemetria
      ctx.fillStyle = '#00d4ff';
      ctx.font = '10px Courier New, monospace';
      const data = [`SYS-${i + 1}: NOMINAL`, `ORBIT: T+${(i * 14 + 8).toString().padStart(2, '0')}:${(i * 7 % 60).toString().padStart(2, '0')}`, `FUEL: ${98 - i}%`, `TEMP: ${200 + i * 12}K`];
      data.forEach((d, j) => ctx.fillText(d, 8, 22 + j * 16));

      // Gráfico de osciloscópio
      ctx.strokeStyle = i % 2 === 0 ? '#00d4ff' : '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < 256; x++) {
        const y = 118 + Math.sin(x / 15 + i * 1.2) * 18 + Math.sin(x / 7 + i) * 8;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      const tex = new THREE.CanvasTexture(canvas);
      const mon = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.88),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      mon.position.set(-2.5 + (i % 3) * 2.5, 2.4 + Math.floor(i / 3) * 1.1, -1.5);
      room.add(mon);
      this.monitors.push(mon);
      this.monitorCtxs.push(ctx);
      this.monitorTexs.push(tex);
    }

    // Mesa de trabalho
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(8, 0.08, 1.4), deskMat);
    desk.position.set(0, 0.96, -0.8);
    room.add(desk);
    const deskLeg = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.96, 0.08), deskMat);
    deskLeg.position.set(0, 0.48, -0.5);
    room.add(deskLeg);

    parent.add(room);
  }

  private _buildLaunchComplex(_rocketData: RocketData[]) {
    const steel = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.5, metalness: 0.75 });
    const conc  = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.8 });

    // Base da plataforma
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.5, 0.5, 24), conc);
    pad.position.set(14, 0.25, -5);
    this.group.add(pad);

    // Vala de deflexão de chama (canaleta)
    const channel = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 }));
    channel.position.set(14, -0.1, -1);
    this.group.add(channel);

    // Torre de serviço principal
    const tower = this._gantryTower(14, -5, steel);
    this.group.add(tower);

    // Veículo de lançamento — construção procedural tipo Falcon 9
    this.launchVehicle = this._buildLaunchVehicle();
    this.group.add(this.launchVehicle);

    // Estrutura modular extra (decorativa) ao lado do launch pad
    _gltf.load('/models/station_structure.glb', (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3(); box.getSize(size);
      model.scale.setScalar(3.5 / Math.max(size.x, size.y, size.z));
      const box2 = new THREE.Box3().setFromObject(model);
      model.position.y -= box2.min.y;
      model.position.set(22, model.position.y, -5);
      model.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(model);
    }, undefined, () => {});

    // Holofotes na base
    for (const [ox, oz] of [[-3, 3], [3, 3], [-3, -13], [3, -13]]) {
      const light = new THREE.SpotLight(0xfff8e0, 2.5, 60, Math.PI / 8, 0.4);
      light.position.set(14 + ox, 8, -5 + oz);
      light.target.position.set(14, 0, -5);
      this.group.add(light);
      this.group.add(light.target);
      this.padLights.push(light);

      // Mesh do holofote
      const floodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.5, 8), steel);
      floodMesh.position.set(14 + ox, 8, -5 + oz);
      floodMesh.rotation.z = Math.PI / 2.5;
      this.group.add(floodMesh);
    }

    // Estacionamento (simplificado — sem GLB para evitar latência)
    this._buildParkingLot();
  }

  /** Veículo de lançamento Falcon-9 style — procedural, escala real para a cena */
  private _buildLaunchVehicle(): THREE.Group {
    const H  = 15;    // altura total (unidades)
    const R  = H / 20; // raio do corpo principal (proporção slim)

    const whiteMat  = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.30, metalness: 0.18 });
    const darkMat   = new THREE.MeshStandardMaterial({ color: 0x1c1c2a, roughness: 0.50, metalness: 0.35 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x1a56db, roughness: 0.35, metalness: 0.20 });
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.28, metalness: 0.90 });

    const g = new THREE.Group();

    // 1º estágio (58% da altura)
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.03, H * 0.58, 24), whiteMat);
    s1.position.y = H * 0.29; s1.castShadow = true;
    g.add(s1);

    // faixa de accent logo abaixo da metade
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.002, R * 1.002, H * 0.022, 24), accentMat);
    stripe.position.y = H * 0.17;
    g.add(stripe);

    // interstage (anel de transição)
    const ist = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, H * 0.024, 24), darkMat);
    ist.position.y = H * 0.592;
    g.add(ist);

    // 2º estágio (18%)
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.96, R * 0.98, H * 0.18, 24), whiteMat);
    s2.position.y = H * 0.592 + H * 0.18 * 0.5; s2.castShadow = true;
    g.add(s2);

    // ogiva — tronco + cone afilado
    const fT = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.96, R * 0.96, H * 0.09, 24), whiteMat);
    fT.position.y = H * 0.592 + H * 0.18 + H * 0.045; fT.castShadow = true;
    g.add(fT);
    const fC = new THREE.Mesh(new THREE.ConeGeometry(R * 0.96, H * 0.11, 24), whiteMat);
    fC.position.y = H * 0.592 + H * 0.18 + H * 0.09 + H * 0.055; fC.castShadow = true;
    g.add(fC);

    // bocais Merlin (1 central + 8 externos)
    for (let i = 0; i < 9; i++) {
      const a  = i === 0 ? 0 : ((i - 1) / 8) * Math.PI * 2;
      const ex = i === 0 ? 0 : Math.cos(a) * R * 0.52;
      const ez = i === 0 ? 0 : Math.sin(a) * R * 0.52;
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.085, R * 0.14, R * 0.5, 12), nozzleMat);
      nozzle.rotation.x = Math.PI;
      nozzle.position.set(ex, 0, ez);
      g.add(nozzle);
    }

    // grid fins (4, no topo do 1º estágio)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(H * 0.025, H * 0.042, H * 0.05), darkMat);
      fin.position.set(Math.cos(a) * R * 1.12, H * 0.555, Math.sin(a) * R * 1.12);
      fin.rotation.y = a;
      g.add(fin);
    }

    // pernas de pouso (4, dobradas ao longo do corpo)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(H * 0.012, H * 0.11, H * 0.012), darkMat);
      leg.position.set(Math.cos(a) * R * 0.9, H * 0.055, Math.sin(a) * R * 0.9);
      leg.rotation.y = a; leg.rotation.z = 0.22;
      g.add(leg);
    }

    // chama de idle (sprite aditivo)
    const flameCanvas = document.createElement('canvas');
    flameCanvas.width = 64; flameCanvas.height = 128;
    const fc = flameCanvas.getContext('2d')!;
    const fg = fc.createRadialGradient(32, 96, 2, 32, 96, 32);
    fg.addColorStop(0,   'rgba(255,255,220,1)');
    fg.addColorStop(0.3, 'rgba(255,180,40,0.9)');
    fg.addColorStop(0.65,'rgba(255,80,10,0.5)');
    fg.addColorStop(1,   'rgba(0,0,0,0)');
    fc.fillStyle = fg;
    fc.fillRect(0, 0, 64, 128);
    const flameTex = new THREE.CanvasTexture(flameCanvas);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }));
    flame.scale.set(1.2, 2.0, 1);
    flame.position.y = -0.5;
    flame.renderOrder = 10;
    g.add(flame);
    this.launchFlame = flame;

    // posição: centro do pad, vertical
    g.position.set(14, 0.5, -5);
    return g;
  }

  /** Torre de serviço tipo gantry com estrutura treliçada */
  private _gantryTower(x: number, z: number, mat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const H = 22, W = 1.5;

    // 4 colunas verticais
    for (const [ox, oz] of [[-W, -W], [W, -W], [-W, W], [W, W]]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, H, 6), mat);
      col.position.set(ox, H / 2, oz);
      g.add(col);
    }

    // Plataformas horizontais a cada 4m
    for (let y = 4; y <= H; y += 4) {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.3, 0.12, W * 2 + 0.3), mat);
      plat.position.y = y;
      g.add(plat);
    }

    // Travessas diagonais (X visual)
    for (let y = 0; y < H; y += 4) {
      for (const side of [-1, 1]) {
        const diag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.4, 0.08), mat);
        diag.position.set(side * W, y + 2, 0);
        diag.rotation.z = Math.PI / 4;
        g.add(diag);
      }
    }

    // Braço de serviço (swing arm)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 0.3), mat);
    arm.position.set(-2.5, 12, 0);
    g.add(arm);

    return g;
  }

  private _buildParkingLot() {
    // 3 modelos diferentes para variedade visual
    const carModels = [
      '/models/car_sedan.glb',
      '/models/car_suv.glb',
      '/models/car_taxi.glb',
    ];
    const carColors = [0x2563eb, 0xdc2626, 0xd97706];
    const carPos = [[4, 10], [7.5, 10], [11, 10]] as [number, number][];

    carPos.forEach(([px, pz], i) => {
      // Hitbox sempre criada (para raycasting funcionar antes do modelo carregar)
      const hb = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.2, 1.4),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hb.position.set(px, 0.6, pz);
      this.group.add(hb);
      this.hitboxes.push({ mesh: hb, id: `car:${i}` });

      // Placeholder procedural (removido quando o GLB chegar)
      const placeholder = this._buildCarProcedural(carColors[i]);
      placeholder.position.set(px, 0, pz);
      placeholder.rotation.y = Math.PI / 2;
      this.group.add(placeholder);

      _gltf.load(
        carModels[i],
        (gltf) => {
          this.group.remove(placeholder);
          const model = gltf.scene;

          // Normalizar tamanho para ~2.4u de comprimento
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.z) || 1;
          model.scale.setScalar(2.4 / maxDim);

          // Sentar na grama (y = 0)
          const box2 = new THREE.Box3().setFromObject(model);
          model.position.y -= box2.min.y;

          // Colorir carroceria principal com a cor do slot
          const bodyColor = new THREE.Color(carColors[i]);
          model.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            // Heurística Kenney: mesh mais largo é a carroceria
            if (mat && size.x > 0.5) {
              mesh.material = new THREE.MeshStandardMaterial({
                color: bodyColor,
                roughness: 0.35,
                metalness: 0.25,
              });
            }
          });

          model.position.set(px, model.position.y, pz);
          model.rotation.y = Math.PI / 2;
          this.group.add(model);
        },
        undefined,
        () => { /* GLB ausente: placeholder fica */ },
      );
    });
  }

  private _buildCarProcedural(color: number): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.65, 1.1), bodyMat);
    body.position.y = 0.5; body.castShadow = true; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.95), bodyMat);
    cabin.position.set(-0.15, 1.05, 0); g.add(cabin);

    for (const [wx, wz] of [[-0.8, 0.52], [-0.8, -0.52], [0.8, 0.52], [0.8, -0.52]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 14), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.26, wz);
      g.add(wheel);
    }
    return g;
  }

  private _buildVegetation() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3e2b, roughness: 0.9 });
    const leafMat  = new THREE.MeshStandardMaterial({ color: 0x1a5e20, roughness: 0.95 });
    const positions = [
      [-20, 15], [-22, 5], [-22, -5], [-22, -20],
      [22, 10], [22, -5], [22, -20], [-5, 25], [5, 25],
    ] as [number, number][];

    for (const [tx, tz] of positions) {
      const h = 2.5 + Math.random() * 1.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 6), trunkMat);
      trunk.position.set(tx, h / 2, tz);
      this.group.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9 + Math.random() * 0.4, 2.5, 7), leafMat);
      crown.position.set(tx, h + 1.1, tz);
      this.group.add(crown);
    }
  }

  private _buildFlagpole() {
    const steel = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.9 });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 10, 8), steel);
    pole.position.set(-18, 5, -10);
    this.group.add(pole);

    // Bandeira com geometria subdividida para animação de ondulação
    const flagCanvas = document.createElement('canvas');
    flagCanvas.width = 200; flagCanvas.height = 128;
    const ctx = flagCanvas.getContext('2d')!;
    ctx.fillStyle = '#009c3b'; ctx.fillRect(0, 0, 200, 128);
    ctx.fillStyle = '#ffdf00';
    ctx.beginPath(); ctx.moveTo(100, 8); ctx.lineTo(192, 64); ctx.lineTo(100, 120); ctx.lineTo(8, 64); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#002776';
    ctx.beginPath(); ctx.arc(100, 64, 38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ORDEM E PROGRESSO', 100, 68);

    const flagTex = new THREE.CanvasTexture(flagCanvas);
    const geo = new THREE.PlaneGeometry(2.2, 1.4, 14, 8);
    this.flagGeo = geo;
    this.flagOrigPos = Float32Array.from(geo.attributes.position.array as Float32Array);
    const flag = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }));
    flag.position.set(-16.9, 8.8, -10);
    this.group.add(flag);
  }

  private _buildClouds() {
    const makeCloudTex = (): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const cx = c.getContext('2d')!;
      const blobs: [number, number, number][] = [[80, 64, 70], [140, 56, 60], [170, 72, 50], [50, 72, 44], [210, 60, 44]];
      for (const [bx, by, r] of blobs) {
        const g = cx.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.4)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = g;
        cx.fillRect(0, 0, 256, 128);
      }
      return new THREE.CanvasTexture(c);
    };

    const positions: [number, number, number][] = [[-40, 70, -80], [30, 65, -120], [-80, 80, -60], [70, 75, -100]];
    const speeds = [1.8, 1.2, 2.2, 1.5];
    for (let i = 0; i < positions.length; i++) {
      const [px, py, pz] = positions[i];
      const w = 30 + Math.random() * 20;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * 0.45),
        new THREE.MeshBasicMaterial({ map: makeCloudTex(), transparent: true, opacity: 0.45 + Math.random() * 0.2, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.15;
      mesh.position.set(px, py, pz);
      this.group.add(mesh);
      this.clouds.push({ mesh, speed: speeds[i] });
    }
  }

  private _buildSmoke() {
    const count = 100;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = 14 + (Math.random() - 0.5) * 1.5;
      pos[i * 3 + 1] = -20; // abaixo do solo (inativo)
      pos[i * 3 + 2] = -5 + (Math.random() - 0.5) * 1.5;
      vel[i * 3]     = (Math.random() - 0.5) * 0.6;
      vel[i * 3 + 1] = 1.2 + Math.random() * 2.0;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    this.smokePos = pos;
    this.smokeVel = vel;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    this.smokeGeo = geo;
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbbbbbb, size: 1.8, transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true }));
    this.group.add(pts);
  }

  /** Letreiro com texto em canvas */
  private _sign(text: string, x: number, y: number, z: number, w: number, h: number): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const bg = ctx.createLinearGradient(0, 0, 512, 0);
    bg.addColorStop(0, '#0a1628');
    bg.addColorStop(0.5, '#0d1f3c');
    bg.addColorStop(1, '#0a1628');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);

    ctx.strokeStyle = 'rgba(0,212,255,0.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 508, 124);

    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 28px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(x, y, z);
    return sign;
  }

  // ── Loop e estado ────────────────────────────────────────────────────────────

  update(dt: number, timeSpeed: number) {
    for (const a of this.astronauts) a.update(dt, timeSpeed);
    for (const r of this.rockets) r.update(dt, timeSpeed);
    this.tickJourney(dt);
    this._animateFlag(dt);
    this._animateClouds(dt);
    if (this.smokeActive) this._animateSmoke(dt);
    this._animateFlash(dt);
    this._animateMonitors(dt);
    this._animateLaunchVehicle(dt);
    if (this.patrolActive) this._animatePatrol(dt);
  }

  private _animateLaunchVehicle(dt: number) {
    if (!this.launchVehicle || !this.launchFlame) return;
    const flame = this.launchFlame;
    const mat = flame.material as THREE.SpriteMaterial;

    if (this.launchVehicleLaunching) {
      this.launchVehicleT += dt;
      this.launchVehicle.position.y = 0.5 + this.launchVehicleT * 5.5;
      // chama cresce e pisca
      const flicker = 0.88 + Math.random() * 0.24;
      const sc = (1.0 + this.launchVehicleT * 1.2) * flicker;
      flame.scale.set(sc * 0.9, sc * 1.8, 1);
      mat.opacity = 0.9;
    } else {
      // idle: chama pequena e piscante
      mat.opacity = 0.08 + Math.sin(Date.now() / 80) * 0.04;
      flame.scale.set(0.5, 0.9, 1);
    }
  }

  private _animateFlash(dt: number) {
    if (this.flashTimer <= 0) return;
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      this.flashTimer = 0;
      this.dirLight.intensity = 2.5;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - 0.08);
    } else {
      this.dirLight.intensity = 2.5 + (this.flashTimer / 0.5) * 5.5;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 0.04);
    }
  }

  private _animateMonitors(dt: number) {
    if (this.monitorCtxs.length === 0) return;
    this.monitorTimer += dt;
    if (this.monitorTimer < 0.5) return;
    this.monitorTimer = 0;
    const t = performance.now() / 1000;
    this.monitorCtxs.forEach((ctx, i) => {
      // Só redesenha waveform (não apaga dados — preserva texto)
      ctx.fillStyle = '#030c18';
      ctx.fillRect(0, 60, 256, 100);
      ctx.strokeStyle = i % 2 === 0 ? '#00d4ff' : '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < 256; x++) {
        const y = 118 + Math.sin(x / 15 + i * 1.2 + t) * 18 + Math.sin(x / 7 + i + t * 1.5) * 8;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      this.monitorTexs[i].needsUpdate = true;
    });
  }

  private _animatePatrol(dt: number) {
    this.patrolTime += dt * 0.25;
    this.astronauts.forEach((astro, i) => {
      const angle = this.patrolTime + (i / Math.max(this.astronauts.length, 1)) * Math.PI * 2;
      const r = 5;
      astro.group.position.set(
        Math.cos(angle) * r - 5,
        0,
        Math.sin(angle) * r + 15,
      );
      astro.group.rotation.y = Math.atan2(-Math.sin(angle), -Math.cos(angle));
    });
  }

  private _animateFlag(dt: number) {
    if (!this.flagGeo || !this.flagOrigPos) return;
    this.flagTime += dt;
    const pos = this.flagGeo.attributes.position as THREE.BufferAttribute;
    const orig = this.flagOrigPos;
    for (let i = 0; i < pos.count; i++) {
      const lx = orig[i * 3];        // x local: −1.1 (mastro) → +1.1 (ponta livre)
      const t  = (lx + 1.1) / 2.2;  // 0 no mastro, 1 na ponta livre
      const w1 = Math.sin(lx * 2.8 - this.flagTime * 3.5) * 0.14 * t * t;
      const w2 = Math.sin(lx * 5.5 - this.flagTime * 5.2 + 1.0) * 0.05 * t;
      pos.setZ(i, w1 + w2);
    }
    pos.needsUpdate = true;
  }

  private _animateClouds(dt: number) {
    for (const { mesh, speed } of this.clouds) {
      mesh.position.x += speed * dt;
      if (mesh.position.x > 160) mesh.position.x = -160;
    }
  }

  private _animateSmoke(dt: number) {
    if (!this.smokeGeo || !this.smokePos || !this.smokeVel) return;
    const attr = this.smokeGeo.attributes.position as THREE.BufferAttribute;
    const count = this.smokePos.length / 3;
    for (let i = 0; i < count; i++) {
      this.smokePos[i * 3]     += this.smokeVel[i * 3] * dt;
      this.smokePos[i * 3 + 1] += this.smokeVel[i * 3 + 1] * dt;
      this.smokePos[i * 3 + 2] += this.smokeVel[i * 3 + 2] * dt;
      if (this.smokePos[i * 3 + 1] > 25) {
        this.smokePos[i * 3]     = 14 + (Math.random() - 0.5) * 1.5;
        this.smokePos[i * 3 + 1] = 0;
        this.smokePos[i * 3 + 2] = -5 + (Math.random() - 0.5) * 1.5;
      }
      attr.setXYZ(i, this.smokePos[i * 3], this.smokePos[i * 3 + 1], this.smokePos[i * 3 + 2]);
    }
    attr.needsUpdate = true;
  }

  startJourney(
    questions: MissionQuestion[],
    onComplete: () => void,
    onCamera: (pos: THREE.Vector3, target: THREE.Vector3) => void,
  ) {
    this.quizQuestions = questions;
    this.quizIndex = 0;
    this.quizCorrect = 0;
    this.quizAnswered = undefined;
    this.onJourneyComplete = onComplete;
    this.onCameraRequest = onCamera;

    if (!this.journeyPanel) {
      this.journeyPanel = new JourneyPanel(new THREE.Vector3(0, 2.5, 10));
      this.group.add(this.journeyPanel.group);
      for (const hb of this.journeyPanel.buttonHitboxes) this.hitboxes.push(hb);
    }

    this.setJourneyState('pronto');
  }

  showReturnState(stats: { name: string; visited: number; missions: number; score: number }) {
    if (!this.journeyPanel) {
      this.journeyPanel = new JourneyPanel(new THREE.Vector3(0, 2.5, 10));
      this.group.add(this.journeyPanel.group);
      for (const hb of this.journeyPanel.buttonHitboxes) this.hitboxes.push(hb);
    }
    this.journeyPanel.renderComplete(stats);
    this.journeyState = 'concluido';
    this.patrolActive = true;
    this._updateMonitors(stats);
  }

  private _updateMonitors(stats: { visited: number; missions: number; score: number }) {
    const labels = [`VISITADOS: ${stats.visited}`, `MISSÕES: ${stats.missions}`, `PONTOS: ${stats.score}`];
    this.monitorCtxs.forEach((ctx, i) => {
      ctx.fillStyle = '#030c18';
      ctx.fillRect(0, 0, 256, 160);
      ctx.strokeStyle = 'rgba(0,212,255,0.08)';
      for (let x = 0; x < 256; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 160); ctx.stroke(); }
      for (let y = 0; y < 160; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
      ctx.fillStyle = '#00d4ff';
      ctx.font = '10px Courier New, monospace';
      ctx.fillText(labels[i % labels.length], 8, 22);
      ctx.fillStyle = i % 2 === 0 ? '#00d4ff' : '#10b981';
      ctx.font = 'bold 22px Courier New, monospace';
      ctx.fillText(String(i < 3 ? [stats.visited, stats.missions, stats.score][i] : '—'), 8, 55);
      this.monitorTexs[i].needsUpdate = true;
    });
  }

  handlePanelClick(optionIndex: number) {
    // Botão INICIAR MISSÃO
    if (optionIndex === 99) {
      if (this.journeyState === 'pronto') this.setJourneyState('treinamento');
      return;
    }
    // Botão REPETIR MISSÃO
    if (optionIndex === 98) {
      if (this.journeyState === 'resultado') {
        this.quizIndex = 0;
        this.quizCorrect = 0;
        this.setJourneyState('treinamento');
      }
      return;
    }
    if (this.journeyState !== 'treinamento' || this.quizAnswered !== undefined) return;
    const q = this.quizQuestions[this.quizIndex];
    if (!q) return;

    this.quizAnswered = optionIndex;
    const isCorrect = optionIndex === q.answer;
    if (isCorrect) this.quizCorrect++;

    const total = this.quizQuestions.length;
    this.journeyPanel?.renderQuestion(
      q.q, q.options,
      isCorrect ? 'CORRETO ✓' : 'INCORRETO ✗',
      optionIndex, q.answer,
      this.quizIndex + 1, total,
    );

    if (isCorrect) narrate('treinamento_correto');
    else narrate('treinamento_errado');

    setTimeout(() => {
      this.quizAnswered = undefined;
      this.quizIndex++;
      if (this.quizIndex >= total) {
        this.setJourneyState('resultado');
      } else {
        this._renderCurrentQuiz();
      }
    }, 2000);
  }

  private setJourneyState(state: JourneyState) {
    this.journeyState = state;
    switch (state) {
      case 'pronto':
        this.journeyPanel?.renderReady();
        narrate('chegada');
        this.onCameraRequest?.(new THREE.Vector3(0, 12, 32), new THREE.Vector3(0, 2, 0));
        break;
      case 'treinamento':
        this.quizAnswered = undefined;
        this._renderCurrentQuiz();
        narrate('treinamento');
        this.onCameraRequest?.(new THREE.Vector3(-3, 3.5, 22), new THREE.Vector3(0, 2.5, 10));
        break;
      case 'resultado':
        this.journeyPanel?.renderResult(this.quizCorrect, this.quizQuestions.length);
        if (this.quizCorrect >= 2) {
          setTimeout(() => this.setJourneyState('contagem'), 2200);
        }
        break;
      case 'contagem':
        this.countdownSecs = 10;
        this.countdownElapsed = 0;
        this.blinkTimer = 0;
        this.journeyPanel?.renderCountdown(10);
        narrate('contagem');
        this.onCameraRequest?.(new THREE.Vector3(5, 16, 12), new THREE.Vector3(14, 0, -5));
        break;
      case 'lancamento':
        this.launchElapsed = 0;
        this.smokeActive = true;
        this.shakeIntensity = 0.12;
        this.flashTimer = 0.5;
        this.dirLight.intensity = 8.0;
        for (const l of this.padLights) l.intensity = 5.0;
        this.journeyPanel?.renderLaunch();
        narrate('lancamento');
        this.launchVehicleLaunching = true;
        this.launchVehicleT = 0;
        break;
      case 'concluido':
        this.shakeIntensity = 0;
        for (const l of this.padLights) l.intensity = 2.5;
        narrate('transicao');
        setTimeout(() => this.onJourneyComplete?.(), 2500);
        break;
    }
  }

  private _renderCurrentQuiz() {
    if (!this.journeyPanel) return;
    const q = this.quizQuestions[this.quizIndex];
    if (!q) return;
    this.journeyPanel.renderQuestion(q.q, q.options, undefined, undefined, undefined, this.quizIndex + 1, this.quizQuestions.length);
  }

  private tickJourney(dt: number) {
    if (this.journeyState === 'contagem') {
      this.countdownElapsed += dt;
      // Shake progressivo nos últimos 3 segundos
      if (this.countdownSecs <= 3) {
        this.shakeIntensity = 0.03 + (3 - this.countdownSecs) * 0.015;
      }
      // Blink dos holofotes durante toda a contagem
      this.blinkTimer += dt;
      if (this.blinkTimer >= 0.5) {
        this.blinkTimer = 0;
        const on = this.padLights[0]?.intensity > 1;
        for (const l of this.padLights) l.intensity = on ? 0.6 : 2.5;
      }
      if (this.countdownElapsed >= 1) {
        this.countdownSecs--;
        this.countdownElapsed = 0;
        this.journeyPanel?.renderCountdown(this.countdownSecs);
        if (this.countdownSecs <= 0) {
          this.shakeIntensity = 0;
          this.setJourneyState('lancamento');
        }
      }
    } else if (this.journeyState === 'lancamento') {
      this.launchElapsed += dt;
      // Câmera segue o foguete subindo (uma chamada suave a T+2s)
      if (Math.abs(this.launchElapsed - 2.0) < dt * 1.5) {
        this.onCameraRequest?.(new THREE.Vector3(8, 22, 18), new THREE.Vector3(14, 28, -5));
      }
      if (this.launchElapsed >= 4.5) this.setJourneyState('concluido');
    }
  }

  dispose() {
    this.journeyPanel?.dispose();
    disposeObject3D(this.group);
  }
}
