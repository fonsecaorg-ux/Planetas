import * as THREE from 'three';

/** Portal interestelar — desbloqueado ao completar a exploração do sistema solar. */
export class ExoPortal {
  readonly group: THREE.Group;
  readonly hitbox: THREE.Mesh;
  unlocked = false;
  private ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private glowSprite: THREE.Sprite;
  private t = 0;

  constructor() {
    this.group = new THREE.Group();

    // Anel externo (torus)
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(8, 0.55, 16, 48),
      new THREE.MeshBasicMaterial({ color: 0x112266, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    this.group.add(this.ring);

    // Disco de brilho interior
    const gc = document.createElement('canvas');
    gc.width = 128; gc.height = 128;
    const gx = gc.getContext('2d')!;
    const grad = gx.createRadialGradient(64, 64, 0, 64, 64, 60);
    grad.addColorStop(0,   'rgba(100,180,255,0.75)');
    grad.addColorStop(0.5, 'rgba(30, 100,255,0.30)');
    grad.addColorStop(1,   'rgba(0,  0,  80, 0)');
    gx.fillStyle = grad;
    gx.fillRect(0, 0, 128, 128);
    this.glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.22 })
    );
    this.glowSprite.scale.setScalar(16);
    this.group.add(this.glowSprite);

    // Label
    const lc = document.createElement('canvas');
    lc.width = 320; lc.height = 48;
    const lx = lc.getContext('2d')!;
    lx.font = 'bold 18px monospace';
    lx.fillStyle = '#7dd3fc';
    lx.textAlign = 'center';
    lx.fillText('\u{1F30C} Portal Interestelar', 160, 32);
    const labelSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lc), transparent: true, depthWrite: false })
    );
    labelSprite.scale.set(24, 4, 1);
    labelSprite.position.y = 12;
    this.group.add(labelSprite);

    // Hitbox invisível para raycasting
    this.hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(10, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    (this.hitbox as any).userData = { bodyId: 'exo-portal' };
    this.group.add(this.hitbox);
  }

  unlock() {
    this.unlocked = true;
    this.ring.material.color.setHex(0x2255ff);
    this.ring.material.opacity = 0.65;
    this.glowSprite.material.opacity = 0.75;
  }

  /** Reposiciona o portal de acordo com a escala (visual vs real). */
  setPosition(orbitDist: number) {
    this.group.position.set(orbitDist * 0.6, 15, orbitDist * 0.8);
  }

  update(dt: number) {
    this.t += dt;
    this.ring.rotation.z += dt * (this.unlocked ? 0.45 : 0.08);
    if (this.unlocked) {
      this.ring.material.opacity = 0.45 + Math.sin(this.t * 2.0) * 0.22;
      this.glowSprite.material.opacity = 0.45 + Math.sin(this.t * 1.5 + 1) * 0.18;
    }
  }

  dispose() {
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.glowSprite.material.map?.dispose();
    this.glowSprite.material.dispose();
    this.hitbox.geometry.dispose();
    (this.hitbox.material as THREE.Material).dispose();
  }
}
