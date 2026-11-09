import * as THREE from 'three';

// 1 unidade = raio terrestre (6371 km)
const MOON_RADIUS = 1737.4 / 6371; // ≈ 0.273
const ORBIT_RADIUS = 10;           // unidades visuais
const ORBIT_PERIOD_S = 27.32 * 24 * 3600; // segundos de jogo (1 s = 1 s real)

function buildFlagCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 170;
  const ctx = canvas.getContext('2d')!;

  // Fundo verde
  ctx.fillStyle = '#009c3b';
  ctx.fillRect(0, 0, 256, 170);

  // Losango amarelo
  ctx.fillStyle = '#ffdf00';
  ctx.beginPath();
  ctx.moveTo(128, 12);
  ctx.lineTo(248, 85);
  ctx.lineTo(128, 158);
  ctx.lineTo(8, 85);
  ctx.closePath();
  ctx.fill();

  // Círculo azul
  ctx.fillStyle = '#002776';
  ctx.beginPath();
  ctx.arc(128, 85, 50, 0, Math.PI * 2);
  ctx.fill();

  // Faixa branca diagonal
  ctx.save();
  ctx.translate(128, 85);
  ctx.rotate(-0.15);
  ctx.fillStyle = '#fffde7';
  ctx.fillRect(-58, -6, 116, 13);
  ctx.fillStyle = '#002776';
  ctx.font = 'bold 7px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ORDEM E PROGRESSO', 0, 1);
  ctx.restore();

  // Estrelas
  ctx.fillStyle = '#fffde7';
  for (const [sx, sy] of [
    [105, 52], [128, 42], [148, 55],
    [112, 72], [145, 70], [118, 92],
    [142, 88], [98, 80], [130, 100],
  ] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

/** Lua orbitando a Terra com bandeira do Brasil plantada. */
export class MoonBase {
  readonly group: THREE.Group;     // parente = earth.group
  readonly moonGroup: THREE.Group; // orbita ao redor da Terra
  readonly moonHitbox: THREE.Mesh; // hitbox invisível para raycasting
  private moon: THREE.Mesh;
  private t = 0;

  constructor() {
    this.group = new THREE.Group();
    this.moonGroup = new THREE.Group();
    this.moonGroup.position.set(ORBIT_RADIUS, 0, 0);
    this.group.add(this.moonGroup);

    // Órbita visual (parente do group, não do moonGroup — fica estática)
    this.group.add(this._buildOrbitLine());

    // Mesh da Lua
    const geo = new THREE.SphereGeometry(MOON_RADIUS, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: '#c4c0b8',
      roughness: 0.95,
      metalness: 0.0,
    });
    this.moon = new THREE.Mesh(geo, mat);
    this.moon.castShadow = true;
    this.moon.receiveShadow = true;
    this.moonGroup.add(this.moon);

    // Hitbox invisível (1.8× raio) para clique fácil
    const hbGeo = new THREE.SphereGeometry(MOON_RADIUS * 1.8, 8, 8);
    const hbMat = new THREE.MeshBasicMaterial({ visible: false });
    this.moonHitbox = new THREE.Mesh(hbGeo, hbMat);
    (this.moonHitbox as any).userData = { bodyId: 'moon' };
    this.moonGroup.add(this.moonHitbox);

    // Label da Lua
    this.moonGroup.add(this._buildMoonLabel());

    // Bandeira do Brasil (mastro + pano)
    const flag = this._buildFlag();
    // Posicionada no equador da superfície (+X)
    flag.position.set(MOON_RADIUS + 0.02, 0.0, 0.1);
    flag.rotation.y = -Math.PI / 6;
    this.moonGroup.add(flag);
  }

  /** Adiciona um astronauta à superfície da Lua, próximo à bandeira. */
  placeAstronaut(astro: { group: THREE.Group }) {
    this.moonGroup.add(astro.group);
    // Pé na superfície, levemente afastado da bandeira
    astro.group.position.set(MOON_RADIUS + 0.3, 0.0, 0.5);
    astro.group.rotation.y = Math.PI;
  }

  private _buildFlag(): THREE.Group {
    const g = new THREE.Group();

    // Mastro
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: '#cccccc', metalness: 0.7, roughness: 0.3 })
    );
    pole.position.y = 0.25;
    g.add(pole);

    // Haste horizontal (suporte da bandeira)
    const crossBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.38, 6),
      new THREE.MeshStandardMaterial({ color: '#cccccc', metalness: 0.7, roughness: 0.3 })
    );
    crossBar.rotation.z = Math.PI / 2;
    crossBar.position.set(0.19, 0.46, 0);
    g.add(crossBar);

    // Tecido da bandeira
    const tex = new THREE.CanvasTexture(buildFlagCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.25),
      new THREE.MeshStandardMaterial({
        map: tex,
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.0,
      })
    );
    // Alinhado ao mastro, preso pela haste superior
    mesh.position.set(0.19, 0.325, 0);
    g.add(mesh);

    return g;
  }

  private _buildOrbitLine(): THREE.Line {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(a) * ORBIT_RADIUS,
        0,
        Math.sin(a) * ORBIT_RADIUS,
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    return new THREE.Line(geo, mat);
  }

  private _buildMoonLabel(): THREE.Sprite {
    const W = 160; const H = 36;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(2,10,24,0.72)';
    ctx.beginPath(); ctx.roundRect(2, 4, W - 4, H - 8, 7); ctx.fill();
    ctx.strokeStyle = '#888888'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#dddddd';
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LUA', W / 2, H / 2 + 1);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    }));
    sp.renderOrder = 15;
    sp.position.y = MOON_RADIUS + 0.8;
    sp.scale.set((W / H) * 1.0, 1.0, 1);
    return sp;
  }

  update(dt: number, timeSpeed: number) {
    this.t += dt * timeSpeed;
    const angle = (this.t / ORBIT_PERIOD_S) * Math.PI * 2;
    this.moonGroup.position.set(
      Math.cos(angle) * ORBIT_RADIUS,
      0,
      Math.sin(angle) * ORBIT_RADIUS,
    );
  }

  dispose() {
    this.moon.geometry.dispose();
    (this.moon.material as THREE.Material).dispose();
  }
}
