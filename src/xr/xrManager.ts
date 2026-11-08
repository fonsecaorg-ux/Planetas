import * as THREE from 'three';

// Cor do anel indica o modo de seleção ativo: azul = olhar fixo, verde = controle
const GAZE_RING_COLOR = 0x7dd3fc;
const GAMEPAD_RING_COLOR = 0x22c55e;

export interface XRManagerOptions {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  onGazeSelect: (obj: THREE.Object3D | null) => void;
}

export class XRManager {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private onGazeSelect: (obj: THREE.Object3D | null) => void;
  private supported = false;
  private session: XRSession | null = null;
  private gazeTimer = 0;
  private gazeTarget: THREE.Object3D | null = null;
  private raycaster = new THREE.Raycaster();
  private gazeDuration = 1.8;
  private gazeRing: THREE.Mesh;
  // Estado anterior do botão principal por gamepad — disparo só na borda de subida
  private gamepadPrevPressed = new Map<number, boolean>();

  constructor(opts: XRManagerOptions) {
    this.renderer = opts.renderer;
    this.camera = opts.camera;
    this.onGazeSelect = opts.onGazeSelect;
    const ringGeo = new THREE.RingGeometry(0.03, 0.04, 32);
    // Sem teste de profundidade: a mira precisa aparecer mesmo com um planeta
    // mais perto que 0,6 unidade da câmera
    const ringMat = new THREE.MeshBasicMaterial({ color: GAZE_RING_COLOR, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    this.gazeRing = new THREE.Mesh(ringGeo, ringMat);
    this.gazeRing.renderOrder = 9999;
    this.gazeRing.position.set(0, 0, -0.6);
    this.gazeRing.visible = false;
    this.camera.add(this.gazeRing);
    this.checkSupport();
  }

  private async checkSupport() {
    if ('xr' in navigator) {
      try {
        this.supported = await (navigator as any).xr.isSessionSupported('immersive-vr');
      } catch {
        this.supported = false;
      }
    }
    const btn = document.getElementById('vr-btn');
    if (btn) {
      btn.style.display = this.supported ? 'block' : 'none';
    }
  }

  isSupported() { return this.supported; }

  async enterVR() {
    if (!this.supported) return;
    try {
      const session = await (navigator as any).xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });
      this.session = session;
      this.renderer.xr.enabled = true;
      await this.renderer.xr.setSession(session);
      session.addEventListener('end', () => {
        this.session = null;
        this.renderer.xr.enabled = false;
      });
    } catch (e) {
      console.warn('XR session failed', e);
    }
  }

  // Atualiza gaze: raycast do centro da tela, progresso circular.
  update(dt: number, selectable: THREE.Object3D[]) {
    if (!this.session) {
      this.gazeRing.visible = false;
      return;
    }
    this.gazeRing.visible = true;
    const origin = new THREE.Vector2(0, 0);
    this.raycaster.setFromCamera(origin, this.camera);
    const hits = this.raycaster.intersectObjects(selectable, true);
    const target = hits.length ? hits[0].object : null;

    // Controle Bluetooth (VR Box): com gamepad conectado, o botão principal
    // seleciona na hora e o dwell fica desligado para não disparar sozinho
    const { connected, pressedNow } = this.pollGamepads();
    const ringMat = this.gazeRing.material as THREE.MeshBasicMaterial;
    if (connected) {
      ringMat.color.setHex(GAMEPAD_RING_COLOR);
      this.gazeTarget = target;
      this.gazeTimer = 0;
      this.gazeRing.scale.setScalar(target ? 1.3 : 1);
      ringMat.opacity = target ? 1 : 0.4;
      if (pressedNow && target) {
        this.onGazeSelect(target);
        if (navigator.vibrate) navigator.vibrate(50);
      }
      return;
    }
    ringMat.color.setHex(GAZE_RING_COLOR);

    if (target && target === this.gazeTarget) {
      this.gazeTimer += dt;
      const p = Math.min(this.gazeTimer / this.gazeDuration, 1);
      this.gazeRing.scale.setScalar(1 + p * 0.6);
      (this.gazeRing.material as THREE.MeshBasicMaterial).opacity = 0.4 + p * 0.6;
      if (this.gazeTimer >= this.gazeDuration) {
        this.onGazeSelect(target);
        this.gazeTimer = 0;
        if (navigator.vibrate) navigator.vibrate(50);
      }
    } else {
      this.gazeTarget = target;
      this.gazeTimer = 0;
      this.gazeRing.scale.setScalar(1);
      (this.gazeRing.material as THREE.MeshBasicMaterial).opacity = 0.4;
    }
  }

  // Lê todos os gamepads e indica se o buttons[0] de algum passou de solto
  // para pressionado neste frame. Gamepad visto pela primeira vez só registra
  // o estado, para um botão já segurado na conexão não virar seleção.
  private pollGamepads(): { connected: boolean; pressedNow: boolean } {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let connected = false;
    let pressedNow = false;
    const seen = new Set<number>();
    for (const pad of pads) {
      if (!pad || !pad.connected || !pad.buttons.length) continue;
      connected = true;
      seen.add(pad.index);
      const pressed = pad.buttons[0].pressed;
      const prev = this.gamepadPrevPressed.get(pad.index);
      if (prev === false && pressed) pressedNow = true;
      this.gamepadPrevPressed.set(pad.index, pressed);
    }
    for (const idx of this.gamepadPrevPressed.keys()) {
      if (!seen.has(idx)) this.gamepadPrevPressed.delete(idx);
    }
    return { connected, pressedNow };
  }

  // Fallback não-VR: clique/touch via raycasting tratado em main.ts
}
