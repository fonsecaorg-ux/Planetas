import * as THREE from 'three';
import type { BodyData } from '@/data/types';

// Navegação VR em dois estados, fixa ao rig:
// - Recolhido (padrão): só um botão "🚀 Destinos" abaixo do centro da visão.
// - Expandido: grade de planetas na frente do usuário; escolher um destino
//   ou olhar o "✕" recolhe de volta. Assim o menu nunca fica preso na frente.
// `hitboxes` contém apenas os alvos do estado atual — main.ts deve chamar
// rebuildSelectable() depois de setExpanded().
export class VRNavPanel {
  readonly group: THREE.Group;
  readonly hitboxes: THREE.Mesh[] = [];
  expanded = false;

  private panel: THREE.Group;
  private pill: THREE.Group;
  private planetHitboxes: THREE.Mesh[] = [];
  private panelShield: THREE.Mesh;
  private closeHitbox: THREE.Mesh;
  private pillHitbox: THREE.Mesh;
  private pillMat: THREE.MeshBasicMaterial;
  private hint: THREE.Sprite | null = null;
  private hintMat: THREE.SpriteMaterial | null = null;
  private t = 0;
  private hintT = 0;
  private textures: THREE.CanvasTexture[] = [];

  constructor(rig: THREE.Group, bodies: BodyData[]) {
    this.group = new THREE.Group();

    // 15 corpos: 3 colunas mantêm o painel dentro de ~±20° do centro da visão
    const planets = bodies.filter((b) => b.type !== 'belt' && b.type !== 'exoplanet');
    const COLS = 3;
    const BTN_W = 11;
    const BTN_H = 4;
    const GAP_X = 1.0;
    const GAP_Y = 0.9;
    const rows = Math.ceil(planets.length / COLS);
    const panelW = COLS * BTN_W + (COLS - 1) * GAP_X + 4;
    const panelH = rows * BTN_H + (rows - 1) * GAP_Y + 5;

    // --- Painel expandido ---
    this.panel = new THREE.Group();

    // Fundo: também funciona como escudo de gaze (gazeInert) para o olhar não
    // atravessar o menu e selecionar um planeta atrás dele
    const bgGeo = new THREE.PlaneGeometry(panelW, panelH);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x060e1e,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    this.panelShield = new THREE.Mesh(bgGeo, bgMat);
    this.panelShield.renderOrder = 199;
    (this.panelShield as any).userData = { gazeInert: true };
    this.panel.add(this.panelShield);

    const borderGeo = new THREE.EdgesGeometry(bgGeo);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x3b4f80, transparent: true, opacity: 0.7, depthTest: false });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.renderOrder = 200;
    this.panel.add(border);

    // Título
    const titleSprite = this._textSprite('🚀 Escolha o destino', 36, '#7dd3fc', 512, 64);
    titleSprite.scale.set(panelW * 0.55, 1.5, 1);
    titleSprite.position.set(-panelW * 0.14, panelH / 2 - 1.6, 0.05);
    this.panel.add(titleSprite);

    // Botão fechar (✕) no canto superior direito
    const closeBtn = this._canvasPlane(96, 96, (ctx) => {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.arc(48, 48, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#93b4e8';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#e8eef7';
      ctx.font = 'bold 48px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✕', 48, 50);
    }, 2.6, 2.6);
    closeBtn.position.set(panelW / 2 - 2.2, panelH / 2 - 2.2, 0.03);
    closeBtn.renderOrder = 201;
    this.panel.add(closeBtn);

    const chGeo = new THREE.PlaneGeometry(4, 4);
    const chMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, depthTest: false });
    this.closeHitbox = new THREE.Mesh(chGeo, chMat);
    this.closeHitbox.position.set(panelW / 2 - 2.2, panelH / 2 - 2.2, 0.04);
    (this.closeHitbox as any).userData = { navClose: true };
    this.panel.add(this.closeHitbox);

    // Botões dos planetas
    planets.forEach((planet, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = -panelW / 2 + 2 + col * (BTN_W + GAP_X) + BTN_W / 2;
      const y = panelH / 2 - 3.6 - row * (BTN_H + GAP_Y) - BTN_H / 2;

      const btn = this._canvasPlane(256, 80, (ctx) => {
        ctx.fillStyle = '#0d1a35';
        this._roundRect(ctx, 0, 0, 256, 80, 12);
        ctx.fill();
        ctx.fillStyle = planet.color;
        ctx.fillRect(0, 0, 8, 80);
        ctx.beginPath();
        ctx.arc(36, 40, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8eef7';
        ctx.font = 'bold 30px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(planet.name, 65, 48);
      }, BTN_W, BTN_H);
      btn.position.set(x, y, 0.03);
      btn.renderOrder = 201;
      this.panel.add(btn);

      const hbGeo = new THREE.PlaneGeometry(BTN_W + 1.2, BTN_H + 0.8);
      const hbMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, depthTest: false });
      const hitbox = new THREE.Mesh(hbGeo, hbMat);
      hitbox.position.set(x, y, 0.04);
      (hitbox as any).userData = { bodyId: planet.id };
      this.panel.add(hitbox);
      this.planetHitboxes.push(hitbox);
    });

    // Centralizado levemente abaixo do olhar — é um menu modal temporário
    this.panel.position.set(0, -2.5, -52);
    this.panel.rotation.x = 0.08;
    this.group.add(this.panel);

    // --- Botão recolhido "🚀 Destinos" ---
    this.pill = new THREE.Group();
    const pillPlane = this._canvasPlane(320, 96, (ctx) => {
      ctx.fillStyle = 'rgba(6,14,30,0.92)';
      this._roundRect(ctx, 2, 2, 316, 92, 46);
      ctx.fill();
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 4;
      this._roundRect(ctx, 2, 2, 316, 92, 46);
      ctx.stroke();
      ctx.fillStyle = '#e8eef7';
      ctx.font = 'bold 40px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚀 Destinos', 160, 52);
    }, 10, 3);
    this.pillMat = pillPlane.material as THREE.MeshBasicMaterial;
    pillPlane.renderOrder = 201;
    this.pill.add(pillPlane);

    const phGeo = new THREE.PlaneGeometry(12, 5);
    const phMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, depthTest: false });
    this.pillHitbox = new THREE.Mesh(phGeo, phMat);
    this.pillHitbox.position.z = 0.02;
    (this.pillHitbox as any).userData = { navToggle: true };
    this.pill.add(this.pillHitbox);

    // ~11° abaixo do centro: fácil de achar olhando para baixo, fora do caminho
    this.pill.position.set(0, -9, -46);
    this.pill.rotation.x = 0.18;
    this.group.add(this.pill);

    rig.add(this.group);

    // Dica inicial apontando para o botão (removida pelo update após ~8 s)
    this.hintMat = new THREE.SpriteMaterial({
      map: this._makeTexture(400, 100, (ctx) => {
        ctx.fillStyle = 'rgba(0,10,30,0.85)';
        this._roundRect(ctx, 0, 0, 400, 100, 18);
        ctx.fill();
        ctx.fillStyle = '#7dd3fc';
        ctx.font = 'bold 30px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Para viajar, olhe para o botão', 200, 40);
        ctx.fillText('🚀 Destinos logo abaixo  ▼', 200, 78);
      }),
      transparent: true,
      depthTest: false,
    });
    this.hint = new THREE.Sprite(this.hintMat);
    this.hint.scale.set(12, 3, 1);
    this.hint.position.set(0, -3, -44);
    this.hint.renderOrder = 9000;
    this.group.add(this.hint);

    this.setExpanded(false);
  }

  /** Alterna entre grade de destinos e botão recolhido. Chamar rebuildSelectable() depois. */
  setExpanded(v: boolean) {
    this.expanded = v;
    this.panel.visible = v;
    this.pill.visible = !v;
    this.hitboxes.length = 0;
    if (v) {
      this.hitboxes.push(...this.planetHitboxes, this.closeHitbox, this.panelShield);
      // Dica cumpriu o papel: usuário achou o botão
      this._removeHint();
    } else {
      this.hitboxes.push(this.pillHitbox);
    }
  }

  /** Chamado no loop de render (rAF da janela congela em sessão XR). */
  update(dt: number) {
    this.t += dt;
    if (!this.expanded) {
      this.pillMat.opacity = 0.75 + Math.sin(this.t * 2.5) * 0.25;
    }
    if (this.hint && this.hintMat) {
      this.hintT += dt;
      this.hintMat.opacity = 0.55 + Math.abs(Math.sin(this.hintT * 2.2)) * 0.45;
      if (this.hintT > 8) this._removeHint();
    }
  }

  private _removeHint() {
    if (!this.hint) return;
    this.group.remove(this.hint);
    this.hintMat?.map?.dispose();
    this.hintMat?.dispose();
    this.hint = null;
    this.hintMat = null;
  }

  private _makeTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const tex = new THREE.CanvasTexture(c);
    this.textures.push(tex);
    return tex;
  }

  private _canvasPlane(cw: number, ch: number, draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number): THREE.Mesh {
    const tex = this._makeTexture(cw, ch, draw);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }

  private _textSprite(text: string, size: number, color: string, cw: number, ch: number): THREE.Sprite {
    const tex = this._makeTexture(cw, ch, (ctx) => {
      ctx.fillStyle = color;
      ctx.font = `bold ${size}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(text, cw / 2, ch * 0.7);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.renderOrder = 201;
    return sprite;
  }

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  dispose() {
    this._removeHint();
    this.group.parent?.remove(this.group);
    for (const tex of this.textures) tex.dispose();
    this.textures = [];
    this.hitboxes.length = 0;
    this.planetHitboxes.length = 0;
  }
}
