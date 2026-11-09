import * as THREE from 'three';
import type { BodyData } from '@/data/types';

const W = 320;
const H = 60;
const AR = W / H;

function accentColor(type: string): string {
  if (type === 'star')  return '#ffd700';
  if (type === 'dwarf') return '#a89fc8';
  return '#00d4ff';
}

function buildTexture(name: string, type: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const accent = accentColor(type);

  // pílula semitransparente
  ctx.fillStyle = 'rgba(2,10,24,0.78)';
  ctx.beginPath(); ctx.roundRect(2, 6, W - 4, H - 12, 10); ctx.fill();

  // borda colorida
  ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
  ctx.stroke();

  // ponto indicador
  ctx.fillStyle = accent;
  ctx.shadowColor = accent; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(18, H / 2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // nome em maiúsculo, fonte monoespaçada
  ctx.fillStyle = '#f0f6ff';
  ctx.font = `bold 22px 'Courier New', monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), 32, H / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Label 3D que mantém tamanho aparente constante na tela. */
export class PlanetLabel {
  readonly sprite: THREE.Sprite;
  readonly yOffset: number;

  constructor(body: BodyData) {
    const mat = new THREE.SpriteMaterial({
      map: buildTexture(body.name, body.type),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.renderOrder = 15;
    // Offset acima do centro do corpo (sobrescrito pelo chamador se necessário)
    this.yOffset = Math.max(body.radiusKm / 6371, 0.5) * 3 + 4;
    this.sprite.position.y = this.yOffset;
    this.sprite.scale.set(AR, 1, 1);
  }

  /** Chame a cada frame; dist = distância câmera → sprite em unidades de cena. */
  updateScale(dist: number) {
    // Aparência constante: tamanho proporcional à distância
    // K=0.045 → ~14u de altura a 300u de dist (vista panorâmica)
    const h = Math.max(dist * 0.045, 1.5);
    this.sprite.scale.set(h * AR, h, 1);
  }

  dispose() {
    (this.sprite.material as THREE.SpriteMaterial).map?.dispose();
    this.sprite.material.dispose();
  }
}
