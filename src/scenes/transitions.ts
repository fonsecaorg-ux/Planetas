import * as THREE from 'three';
import { easeInOutCubic } from '@/utils/easing';

export interface CameraTransition {
  from: THREE.Vector3;
  to: THREE.Vector3;
  // Ponto de controle da curva de Bézier quadrática. Ausente = linha reta
  via?: THREE.Vector3;
  lookFrom: THREE.Vector3;
  lookTo: THREE.Vector3;
  duration: number;
  elapsed: number;
  onUpdate?: (t: number) => void;
  onComplete?: () => void;
}

export function animateCamera(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3 },
  toPos: THREE.Vector3,
  toTarget: THREE.Vector3,
  duration = 1.6,
  onComplete?: () => void,
  via?: THREE.Vector3,
): CameraTransition {
  const t: CameraTransition = {
    from: camera.position.clone(),
    to: toPos.clone(),
    via: via?.clone(),
    lookFrom: controls.target.clone(),
    lookTo: toTarget.clone(),
    duration,
    elapsed: 0,
    onComplete,
  };
  return t;
}

// Desloca uma transição em andamento junto com o mundo (origem flutuante),
// para a câmera não "pular" quando o corpo em foco muda
export function shiftTransition(t: CameraTransition, delta: THREE.Vector3) {
  t.from.add(delta);
  t.to.add(delta);
  t.via?.add(delta);
  t.lookFrom.add(delta);
  t.lookTo.add(delta);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function stepTransition(t: CameraTransition, dt: number, camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3 }) {
  t.elapsed += dt;
  const u = Math.min(t.elapsed / t.duration, 1);
  const e = easeInOutCubic(u);
  if (t.via) {
    _a.lerpVectors(t.from, t.via, e);
    _b.lerpVectors(t.via, t.to, e);
    camera.position.lerpVectors(_a, _b, e);
  } else {
    camera.position.lerpVectors(t.from, t.to, e);
  }
  controls.target.lerpVectors(t.lookFrom, t.lookTo, e);
  if (u >= 1 && t.onComplete) {
    t.onComplete();
    t.onComplete = undefined;
  }
}

// Ponto de controle que desvia a viagem por cima de uma esfera (o Sol) quando
// a linha reta passaria por dentro dela. Retorna undefined se não precisa
export function detourAround(from: THREE.Vector3, to: THREE.Vector3, center: THREE.Vector3, radius: number): THREE.Vector3 | undefined {
  const seg = _a.subVectors(to, from);
  const len2 = seg.lengthSq();
  if (len2 === 0) return undefined;
  const k = THREE.MathUtils.clamp(_b.subVectors(center, from).dot(seg) / len2, 0, 1);
  const maisProximo = from.clone().addScaledVector(seg, k);
  if (maisProximo.distanceTo(center) > radius * 1.3) return undefined;
  const meio = from.clone().add(to).multiplyScalar(0.5);
  meio.y = center.y + radius * 3;
  return meio;
}

// Escurecimento da tela para saltos em VR. Deslocar o usuário com a cabeça
// parada e o mundo passando é o gatilho clássico de enjoo; escurecer, mover e
// clarear é o padrão de conforto. Plano preto preso à frente da câmera.
const FADE_DURACAO_S = 0.3;

export class ScreenFade {
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private fase: 'parado' | 'escurecendo' | 'clareando' = 'parado';
  private t = 0;
  private noEscuro?: () => void;

  constructor(camera: THREE.Camera) {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.mesh.position.set(0, 0, -0.1);
    this.mesh.renderOrder = 10000;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
  }

  get ativo(): boolean {
    return this.fase !== 'parado';
  }

  // Escurece, executa a ação com a tela preta e clareia
  run(acaoNoEscuro: () => void) {
    this.noEscuro = acaoNoEscuro;
    this.fase = 'escurecendo';
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.fase === 'parado') return;
    this.t += dt;
    const p = Math.min(this.t / FADE_DURACAO_S, 1);
    if (this.fase === 'escurecendo') {
      this.mat.opacity = p;
      if (p >= 1) {
        this.noEscuro?.();
        this.noEscuro = undefined;
        this.fase = 'clareando';
        this.t = 0;
      }
    } else {
      this.mat.opacity = 1 - p;
      if (p >= 1) {
        this.fase = 'parado';
        this.mesh.visible = false;
      }
    }
  }
}
