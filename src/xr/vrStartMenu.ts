import * as THREE from 'three';

// Menu de entrada do VR: duas escolhas grandes, some após a seleção.
// "Passeio" = nave viaja sozinha com narração; "Explorar" = gaze livre.
export class VRStartMenu {
  readonly group: THREE.Group;
  readonly hitboxes: THREE.Mesh[] = [];
  private textures: THREE.CanvasTexture[] = [];
  private borderMats: THREE.MeshBasicMaterial[] = [];
  private t = 0;

  constructor(rig: THREE.Group) {
    this.group = new THREE.Group();

    // Fundo: bloqueia o gaze de atravessar e selecionar planetas atrás
    const bgGeo = new THREE.PlaneGeometry(38, 13);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x060e1e, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.renderOrder = 199;
    (bg as any).userData = { gazeInert: true };
    this.group.add(bg);
    this.hitboxes.push(bg);

    // Título
    const title = this._sprite(620, 70, (ctx) => {
      ctx.fillStyle = '#7dd3fc';
      ctx.font = 'bold 40px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Como você quer explorar?', 310, 50);
    });
    title.scale.set(20, 2.3, 1);
    title.position.set(0, 4.6, 0.05);
    this.group.add(title);

    // Botões
    const defs: Array<{ mode: 'tour' | 'free'; title: string; sub: string; color: string }> = [
      { mode: 'tour', title: '▶  Passeio', sub: 'a nave viaja sozinha', color: '#22c55e' },
      { mode: 'free', title: '🧭  Explorar', sub: 'olhe num planeta para viajar', color: '#7dd3fc' },
    ];
    defs.forEach((d, i) => {
      const x = i === 0 ? -8.5 : 8.5;
      const btn = this._plane(512, 192, (ctx) => {
        ctx.fillStyle = '#0d1a35';
        this._round(ctx, 4, 4, 504, 184, 24);
        ctx.fill();
        ctx.fillStyle = d.color;
        ctx.font = 'bold 56px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.title, 256, 88);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '30px Arial, sans-serif';
        ctx.fillText(d.sub, 256, 146);
      }, 15, 5.6);
      btn.position.set(x, -0.6, 0.03);
      btn.renderOrder = 201;
      this.group.add(btn);

      // Borda pulsante
      const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(15.2, 5.8));
      const borderMat = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.8, depthTest: false });
      this.borderMats.push(borderMat);
      const border = new THREE.LineSegments(borderGeo, new THREE.LineBasicMaterial({
        color: d.color, transparent: true, opacity: 0.8, depthTest: false,
      }));
      border.position.set(x, -0.6, 0.04);
      border.renderOrder = 202;
      this.group.add(border);

      // Hitbox
      const hbGeo = new THREE.PlaneGeometry(16.5, 7);
      const hbMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, depthTest: false });
      const hb = new THREE.Mesh(hbGeo, hbMat);
      hb.position.set(x, -0.6, 0.05);
      (hb as any).userData = { vrMode: d.mode };
      this.group.add(hb);
      this.hitboxes.push(hb);
    });

    // Dica embaixo
    const hint = this._sprite(620, 56, (ctx) => {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '26px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Olhe fixamente num botão para escolher', 310, 38);
    });
    hint.scale.set(17, 1.5, 1);
    hint.position.set(0, -5, 0.05);
    this.group.add(hint);

    // Reto à frente, levemente abaixo do horizonte
    this.group.position.set(0, -1.5, -40);
    this.group.rotation.x = 0.05;
    rig.add(this.group);
  }

  update(dt: number) {
    this.t += dt;
    const pulse = 0.55 + Math.abs(Math.sin(this.t * 2)) * 0.45;
    this.group.traverse((o) => {
      if (o instanceof THREE.LineSegments) {
        (o.material as THREE.LineBasicMaterial).opacity = pulse;
      }
    });
  }

  private _sprite(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Sprite {
    const tex = this._tex(w, h, draw);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.renderOrder = 203;
    return sprite;
  }

  private _plane(cw: number, ch: number, draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number): THREE.Mesh {
    const tex = this._tex(cw, ch, draw);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }

  private _tex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const tex = new THREE.CanvasTexture(c);
    this.textures.push(tex);
    return tex;
  }

  private _round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
