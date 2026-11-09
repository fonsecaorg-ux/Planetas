import * as THREE from 'three';
import type { AstronautData } from '@/data/types';

// Escala base do personagem (altura total ≈ 1.2 unidades)
const S = 1.2;

export class Astronaut {
  readonly data: AstronautData;
  readonly group: THREE.Group;
  readonly hitbox: THREE.Mesh;

  private t: number;
  private bodyGroup: THREE.Group;
  private headGroup: THREE.Group;
  private headBaseY: number;
  private armL: THREE.Object3D | null = null;
  private armR: THREE.Object3D | null = null;
  private eyeGroupL: THREE.Group;
  private eyeGroupR: THREE.Group;
  private blinkTimer: number;
  private nextBlink: number;
  private blinkProgress = 0;

  constructor(data: AstronautData, _index: number) {
    this.data = data;
    this.group = new THREE.Group();
    this.t = Math.random() * Math.PI * 2;
    this.blinkTimer = Math.random() * 3;
    this.nextBlink = 2.5 + Math.random() * 3;

    // Hitbox invisível para raycasting
    const hbGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const hbMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(hbGeo, hbMat);
    this.hitbox.position.y = 0.6;
    (this.hitbox as any).userData = { bodyId: `astronaut:${data.id}` };
    this.group.add(this.hitbox);

    const skinColor = data.skinColor ?? '#c68642';
    const eyeColor  = data.eyeColor  ?? '#3a7bd5';

    // Corpo + cabeça
    this.bodyGroup = this._buildBody(data.suitColor);
    this.group.add(this.bodyGroup);
    this.armL = this.bodyGroup.getObjectByName('armL') ?? null;
    this.armR = this.bodyGroup.getObjectByName('armR') ?? null;

    const { group: hg, eyeGroupL, eyeGroupR } = this._buildHead(skinColor, eyeColor, data.helmetColor);
    this.headGroup = hg;
    this.eyeGroupL = eyeGroupL;
    this.eyeGroupR = eyeGroupR;
    this.headBaseY = 0.825 * S;
    hg.position.y = this.headBaseY;
    this.group.add(hg);
  }

  // ── Construção do corpo ─────────────────────────────────────────────────────

  private _mat(
    color: THREE.ColorRepresentation,
    roughness: number,
    metalness: number,
    opacity = 1,
  ): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      transparent: opacity < 1,
      opacity,
    });
  }

  private _buildBody(suitColor: string): THREE.Group {
    const g = new THREE.Group();
    const sc = new THREE.Color(suitColor);
    const dark = sc.clone().multiplyScalar(0.62);

    const suit     = this._mat(sc,   0.40, 0.15);
    const darkSuit = this._mat(dark, 0.50, 0.22);

    // Torso arredondado
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14 * S, 0.22 * S, 8, 16), suit);
    torso.position.y = 0.46 * S;
    torso.castShadow = true;
    g.add(torso);

    // Mochila de suporte à vida
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.17 * S, 0.22 * S, 0.08 * S), darkSuit);
    bp.position.set(0, 0.47 * S, -0.165 * S);
    bp.castShadow = true;
    g.add(bp);

    // Painel no peito (emissive sutil)
    const panelMat = new THREE.MeshStandardMaterial({
      color: dark,
      roughness: 0.3,
      metalness: 0.5,
      emissive: sc,
      emissiveIntensity: 0.18,
    });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.14 * S, 0.11 * S, 0.04 * S), panelMat);
    panel.position.set(0, 0.5 * S, 0.148 * S);
    g.add(panel);

    // Braços
    const armMat = this._mat(sc, 0.40, 0.15);
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.063 * S, 0.22 * S, 6, 12), armMat);
    armL.name = 'armL';
    armL.position.set(-0.22 * S, 0.43 * S, 0);
    armL.rotation.z = 0.18;
    armL.castShadow = true;
    g.add(armL);

    const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.063 * S, 0.22 * S, 6, 12), armMat);
    armR.name = 'armR';
    armR.position.set(0.22 * S, 0.43 * S, 0);
    armR.rotation.z = -0.18;
    armR.castShadow = true;
    g.add(armR);

    // Luvas
    const gloveMat = this._mat(dark, 0.50, 0.10);
    for (const gx of [-0.248 * S, 0.248 * S]) {
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.07 * S, 10, 10), gloveMat);
      glove.position.set(gx, 0.3 * S, 0);
      g.add(glove);
    }

    // Pernas
    for (const lx of [-0.09 * S, 0.09 * S]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08 * S, 0.20 * S, 6, 12), suit);
      leg.position.set(lx, 0.165 * S, 0);
      leg.castShadow = true;
      g.add(leg);

      // Botas (ligeiramente arredondadas)
      const boot = new THREE.Mesh(new THREE.SphereGeometry(0.092 * S, 12, 10), darkSuit);
      boot.position.set(lx, 0.038 * S, 0.02 * S);
      boot.scale.set(1, 0.75, 1.3);
      boot.castShadow = true;
      g.add(boot);
    }

    // Anel do pescoço (encaixe do capacete)
    const neckRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.065 * S, 0.025 * S, 8, 20),
      this._mat(dark, 0.3, 0.6),
    );
    neckRing.rotation.x = Math.PI / 2;
    neckRing.position.y = 0.625 * S;
    g.add(neckRing);

    return g;
  }

  private _buildHead(
    skinColor: string,
    eyeColor: string,
    helmetColor: string,
  ): { group: THREE.Group; eyeGroupL: THREE.Group; eyeGroupR: THREE.Group } {
    const g = new THREE.Group();

    // Cabeça grande — proporção Disney
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.195 * S, 24, 20),
      this._mat(skinColor, 0.55, 0),
    );
    head.castShadow = true;
    g.add(head);

    // Bochechas coradas (Disney signature)
    const cheekMat = new THREE.MeshStandardMaterial({
      color: 0xe8826a,
      roughness: 0.6,
      transparent: true,
      opacity: 0.42,
    });
    for (const cx of [-0.135 * S, 0.135 * S]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.055 * S, 10, 10), cheekMat);
      cheek.position.set(cx, -0.045 * S, 0.165 * S);
      g.add(cheek);
    }

    // Olhos grandes em 4 camadas
    const makeEye = (side: number): THREE.Group => {
      const eg = new THREE.Group();
      eg.position.set(side * 0.085 * S, 0.03 * S, 0.165 * S);

      // Sclera branca
      eg.add(Object.assign(
        new THREE.Mesh(new THREE.SphereGeometry(0.072 * S, 14, 14), this._mat(0xffffff, 0.1, 0)),
        { castShadow: false },
      ));

      // Íris colorida
      const iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.054 * S, 12, 12),
        this._mat(eyeColor, 0.05, 0.1),
      );
      iris.position.z = 0.025 * S;
      eg.add(iris);

      // Pupila preta
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.036 * S, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x060a0e }),
      );
      pupil.position.z = 0.044 * S;
      eg.add(pupil);

      // Ponto de luz (Disney signature highlight)
      const hl = new THREE.Mesh(
        new THREE.SphereGeometry(0.014 * S, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      hl.position.set(-0.018 * S, 0.022 * S, 0.056 * S);
      eg.add(hl);

      return eg;
    };

    const eyeGroupL = makeEye(-1);
    const eyeGroupR = makeEye(1);
    g.add(eyeGroupL);
    g.add(eyeGroupR);

    // Capacete fishbowl (MeshPhysicalMaterial transparente)
    const hc = new THREE.Color(helmetColor);
    const helmetMat = new THREE.MeshPhysicalMaterial({
      color: hc.clone().multiplyScalar(0.4),
      transparent: true,
      opacity: 0.26,
      roughness: 0,
      metalness: 0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      side: THREE.DoubleSide,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.245 * S, 28, 22), helmetMat);
    g.add(dome);

    // Faixa do visor (tint colorido na frente)
    const visorMat = new THREE.MeshStandardMaterial({
      color: hc,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 0.22,
    });
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.242 * S, 20, 10, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.5),
      visorMat,
    );
    visor.position.z = 0.01 * S;
    g.add(visor);

    // Aro inferior do capacete
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.235 * S, 0.028 * S, 10, 32),
      this._mat(hc, 0.3, 0.7),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.19 * S;
    g.add(ring);

    return { group: g, eyeGroupL, eyeGroupR };
  }

  // ── Animação Disney ─────────────────────────────────────────────────────────

  update(dt: number, timeSpeed: number) {
    this.t += dt * timeSpeed;

    // Squash & stretch — respiração (Princípio 2 da animação Disney)
    const breath = Math.sin(this.t * 1.7);
    const sy = 1 + breath * 0.024;
    this.bodyGroup.scale.y = sy;
    this.bodyGroup.scale.x = this.bodyGroup.scale.z = 1 / Math.sqrt(sy);

    // Balanço lateral suave (peso do corpo)
    this.bodyGroup.rotation.z = Math.sin(this.t * 0.75) * 0.035;

    // Cabeça olha em volta com follow-through
    this.headGroup.rotation.y = Math.sin(this.t * 0.42) * 0.18;
    this.headGroup.position.y = this.headBaseY + Math.sin(this.t * 1.7 + 0.4) * 0.009 * S;

    // Braços balançam suavemente (oposto à respiração)
    if (this.armL) (this.armL as THREE.Object3D).rotation.x = Math.sin(this.t * 1.7 + Math.PI) * 0.08;
    if (this.armR) (this.armR as THREE.Object3D).rotation.x = Math.sin(this.t * 1.7) * 0.08;

    // Piscar de olhos periódico
    this.blinkTimer += dt * timeSpeed;
    if (this.blinkTimer > this.nextBlink) {
      this.blinkTimer = 0;
      this.nextBlink = 2.5 + Math.random() * 3;
      this.blinkProgress = 0.001;
    }
    if (this.blinkProgress > 0) {
      this.blinkProgress += dt * 10 * timeSpeed;
      const phase = this.blinkProgress < 1 ? this.blinkProgress : 2 - this.blinkProgress;
      const ey = Math.max(0.05, 1 - Math.min(1, phase) * 0.92);
      this.eyeGroupL.scale.y = ey;
      this.eyeGroupR.scale.y = ey;
      if (this.blinkProgress >= 2) {
        this.blinkProgress = 0;
        this.eyeGroupL.scale.y = 1;
        this.eyeGroupR.scale.y = 1;
      }
    }
  }
}
