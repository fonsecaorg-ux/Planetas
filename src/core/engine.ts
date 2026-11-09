import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  onResize?: () => void;
}

const LIMIAR_MUDANCA_CLIP = 0.25;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: THREE.Group;
  readonly bloomPass: UnrealBloomPass;
  private composer: EffectComposer;
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
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.setReferenceSpaceType('local');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000008);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1e9);
    this.camera.position.set(0, 40, 80);

    this.rig = new THREE.Group();
    this.rig.name = 'rig-camera';
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    // Post-processing: bloom seletivo (threshold alto → só objetos muito brilhantes)
    // Fora de XR o composer substitui o render direto; em XR usa renderer direto
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.65,  // strength
      0.5,   // radius
      0.88,  // threshold — só o Sol e emissivos muito intensos
    );
    this.composer.addPass(this.bloomPass);

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
      opts.onResize?.();
    });
    this.resizeObserver.observe(document.body);
  }

  onUpdate(cb: (dt: number, elapsed: number) => void) {
    this.updateCallbacks.push(cb);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.getElapsedTime();
      for (const cb of this.updateCallbacks) cb(dt, elapsed);
      // XR não suporta EffectComposer; usa render direto durante sessão VR
      if (this.renderer.xr.isPresenting) {
        this.renderer.render(this.scene, this.camera);
      } else {
        this.composer.render();
      }
    });
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  get isPresenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

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
    if (this.renderer.xr.isPresenting) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }

  dispose() {
    this.stop();
    this.resizeObserver.disconnect();
    this.composer.dispose();
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
