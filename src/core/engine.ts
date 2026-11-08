import * as THREE from 'three';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  onResize?: () => void;
}

// Só reconfigura near/far quando a mudança passa desta fração. Em VR, cada
// mudança dispara updateRenderState na sessão — não pode acontecer todo quadro.
const LIMIAR_MUDANCA_CLIP = 0.25;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  // Rig: todo deslocamento do usuário move este grupo. Em sessão WebXR o
  // Three.js sobrescreve a pose da câmera com a do headset a cada quadro —
  // mover a câmera direto não teria efeito. Fora do VR o rig fica na origem
  // e o OrbitControls move a câmera dentro dele.
  readonly rig: THREE.Group;
  private running = false;
  private clock = new THREE.Clock();
  private updateCallbacks: Array<(dt: number, elapsed: number) => void> = [];
  private resizeObserver: ResizeObserver;

  constructor(opts: EngineOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 'local': a cabeça começa na origem do rig. 'local-floor' somaria ~1,6 m
    // de altura — 1,6 raio terrestre nesta escala
    this.renderer.xr.setReferenceSpaceType('local');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000008);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1e9);
    this.camera.position.set(0, 40, 80);

    this.rig = new THREE.Group();
    this.rig.name = 'rig-camera';
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
      opts.onResize?.();
    });
    this.resizeObserver.observe(document.body);
  }

  onUpdate(cb: (dt: number, elapsed: number) => void) {
    this.updateCallbacks.push(cb);
  }

  // setAnimationLoop em vez de requestAnimationFrame da janela: durante a
  // sessão WebXR os quadros vêm da sessão, e o rAF da janela não é chamado
  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.getElapsedTime();
      for (const cb of this.updateCallbacks) cb(dt, elapsed);
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  get isPresenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  // Ajusta os planos de recorte ao que está em cena. Faixa near/far grande
  // demais causa z-fighting; logarithmicDepthBuffer resolveria, mas custa caro
  // no celular
  setClipPlanes(near: number, far: number) {
    const c = this.camera;
    const mudouNear = Math.abs(near - c.near) / c.near > LIMIAR_MUDANCA_CLIP;
    const mudouFar = Math.abs(far - c.far) / c.far > LIMIAR_MUDANCA_CLIP;
    if (!mudouNear && !mudouFar) return;
    c.near = near;
    c.far = far;
    c.updateProjectionMatrix();
  }

  private handleResize() {
    // Em VR o tamanho vem do dispositivo; setSize durante a sessão é ignorado com aviso
    if (this.renderer.xr.isPresenting) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.stop();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}

// Libera da GPU geometrias, materiais e texturas de uma subárvore. Texturas
// compartilhadas pelo cache procedural são reenviadas automaticamente pelo
// Three.js se voltarem a ser usadas
export function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      for (const valor of Object.values(m)) {
        if (valor instanceof THREE.Texture) valor.dispose();
      }
      m.dispose();
    }
  });
}
