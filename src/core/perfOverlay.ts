import type * as THREE from 'three';

// Medidor de desempenho, ativado com ?debug=1 na URL. A meta é 60 fps no celular
// (VR Box / Cardboard); sem medir no aparelho não há como afirmar isso.
// Em sessão VR o overlay HTML não aparece, então o resumo também vai para o
// console a cada 5s — visível no chrome://inspect com o celular no USB.

const JANELA_AMOSTRA_S = 0.5;
const INTERVALO_LOG_XR_S = 5;

export class PerfOverlay {
  private el: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private frames = 0;
  private acumulado = 0;
  private piorQuadroMs = 0;
  private desdeLog = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.el = document.createElement('div');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.cssText = [
      'position:fixed', 'top:4px', 'left:4px', 'z-index:200',
      'font:11px/1.35 monospace', 'color:#e8eef7', 'background:rgba(0,0,0,0.6)',
      'padding:4px 6px', 'border-radius:4px', 'pointer-events:none', 'white-space:pre',
    ].join(';');
    document.body.appendChild(this.el);
  }

  // Chamado a cada quadro antes do render: renderer.info ainda traz os
  // números do quadro anterior (o render zera o contador ao começar).
  update(dt: number) {
    this.frames++;
    this.acumulado += dt;
    this.desdeLog += dt;
    this.piorQuadroMs = Math.max(this.piorQuadroMs, dt * 1000);
    if (this.acumulado < JANELA_AMOSTRA_S) return;

    const fps = this.frames / this.acumulado;
    const mediaMs = (this.acumulado / this.frames) * 1000;
    const info = this.renderer.info;
    const texto =
      `${fps.toFixed(0)} fps  ${mediaMs.toFixed(1)} ms (pior ${this.piorQuadroMs.toFixed(0)})\n` +
      `draw ${info.render.calls}  tri ${(info.render.triangles / 1000).toFixed(0)}k\n` +
      `geo ${info.memory.geometries}  tex ${info.memory.textures}`;
    this.el.textContent = texto;

    if (this.renderer.xr.isPresenting && this.desdeLog >= INTERVALO_LOG_XR_S) {
      console.info('[perf XR]', texto.replace(/\n/g, ' | '));
      this.desdeLog = 0;
    }

    this.frames = 0;
    this.acumulado = 0;
    this.piorQuadroMs = 0;
  }
}
