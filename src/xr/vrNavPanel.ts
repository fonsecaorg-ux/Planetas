import * as THREE from 'three';
import type { BodyData } from '@/data/types';

// Painel de navegação VR fixo ao rig — aparece abaixo do campo de visão central.
// O usuário olha ligeiramente para baixo para ver os botões dos planetas;
// olhar fixo num botão por ~1,8 s seleciona o planeta.
export class VRNavPanel {
  readonly group: THREE.Group;
  readonly hitboxes: THREE.Mesh[] = [];
  private textures: THREE.CanvasTexture[] = [];

  constructor(rig: THREE.Group, bodies: BodyData[]) {
    this.group = new THREE.Group();

    const planets = bodies.filter((b) => b.type !== 'belt' && b.type !== 'exoplanet');
    const COLS = 2;
    const BTN_W = 13;
    const BTN_H = 4.5;
    const GAP_X = 1.2;
    const GAP_Y = 1.0;
    const rows = Math.ceil(planets.length / COLS);
    const panelW = COLS * BTN_W + (COLS - 1) * GAP_X + 4;
    const panelH = rows * BTN_H + (rows - 1) * GAP_Y + 5;

    // Fundo do painel
    const bgGeo = new THREE.PlaneGeometry(panelW, panelH);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x060e1e,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.renderOrder = 199;
    this.group.add(bg);

    // Borda do painel
    const borderGeo = new THREE.EdgesGeometry(bgGeo);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x3b4f80, transparent: true, opacity: 0.7, depthTest: false });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.renderOrder = 200;
    this.group.add(border);

    // Título
    const titleCanvas = document.createElement('canvas');
    titleCanvas.width = 512; titleCanvas.height = 64;
    const tc = titleCanvas.getContext('2d')!;
    tc.fillStyle = '#7dd3fc';
    tc.font = 'bold 36px Arial, sans-serif';
    tc.textAlign = 'center';
    tc.fillText('🚀 Destino', 256, 44);
    const titleTex = new THREE.CanvasTexture(titleCanvas);
    this.textures.push(titleTex);
    const titleMat = new THREE.SpriteMaterial({ map: titleTex, transparent: true, depthTest: false });
    const titleSprite = new THREE.Sprite(titleMat);
    titleSprite.scale.set(panelW * 0.6, 1.5, 1);
    titleSprite.position.set(0, panelH / 2 - 1.2, 0.05);
    titleSprite.renderOrder = 201;
    this.group.add(titleSprite);

    // Botões dos planetas
    planets.forEach((planet, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = -panelW / 2 + 2 + col * (BTN_W + GAP_X) + BTN_W / 2;
      const y = panelH / 2 - 3 - row * (BTN_H + GAP_Y) - BTN_H / 2;

      // Canvas do botão
      const c = document.createElement('canvas');
      c.width = 256; c.height = 80;
      const ctx = c.getContext('2d')!;

      // Fundo
      ctx.fillStyle = '#0d1a35';
      this._roundRect(ctx, 0, 0, 256, 80, 12);
      ctx.fill();

      // Borda colorida esquerda
      ctx.fillStyle = planet.color;
      ctx.fillRect(0, 0, 8, 80);

      // Círculo colorido
      ctx.fillStyle = planet.color;
      ctx.beginPath();
      ctx.arc(36, 40, 18, 0, Math.PI * 2);
      ctx.fill();

      // Nome
      ctx.fillStyle = '#e8eef7';
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(planet.name, 65, 48);

      const tex = new THREE.CanvasTexture(c);
      this.textures.push(tex);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
      const geo = new THREE.PlaneGeometry(BTN_W, BTN_H);
      const btn = new THREE.Mesh(geo, mat);
      btn.position.set(x, y, 0.03);
      btn.renderOrder = 201;
      this.group.add(btn);

      // Hitbox (um pouco maior que o botão visual)
      const hbGeo = new THREE.PlaneGeometry(BTN_W + 1.5, BTN_H + 1.5);
      const hbMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, depthTest: false });
      const hitbox = new THREE.Mesh(hbGeo, hbMat);
      hitbox.position.set(x, y, 0.04);
      (hitbox as any).userData = { bodyId: planet.id };
      hitbox.renderOrder = 202;
      this.group.add(hitbox);
      this.hitboxes.push(hitbox);
    });

    // Posicionar painel: ligeiramente abaixo e à frente do usuário no espaço local do rig
    this.group.position.set(0, -14, -50);
    // Inclinar levemente para que fique mais natural ao olhar para baixo
    this.group.rotation.x = 0.28;

    rig.add(this.group);
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
    this.group.parent?.remove(this.group);
    for (const tex of this.textures) tex.dispose();
    this.textures = [];
    this.hitboxes.length = 0;
  }
}
