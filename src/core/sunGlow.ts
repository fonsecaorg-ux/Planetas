import * as THREE from 'three';

/**
 * Sprite de glow solar: halo suave que sempre aponta para a câmera.
 *
 * Sem UnrealBloomPass nem pós-processamento — mobile VR não tem budget para isso.
 * O efeito é um Sprite com textura canvas de gradiente radial e blending aditivo:
 * barato, sempre-câmera e compatível com WebXR.
 */

function buildGlowTexture(size = 128): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0.0, 'rgba(255, 240, 180, 1.0)'); // núcleo quente
  grad.addColorStop(0.08,'rgba(255, 220, 100, 0.9)'); // coroa amarela
  grad.addColorStop(0.25,'rgba(255, 160, 40, 0.5)');  // anel laranja
  grad.addColorStop(0.55,'rgba(255, 80, 10, 0.15)');  // borda avermelhada
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');       // transparente

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param sunRadius - raio do Sol em unidades de cena (bodyRadius(696340))
 * @returns THREE.Sprite centrado na origem — adicione ao mesmo Group do Sol
 */
export function createSunGlow(sunRadius: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: buildGlowTexture(256),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
    toneMapped: false,
  });

  const sprite = new THREE.Sprite(mat);
  // Escala: 6× o raio do Sol para o halo ser visível a distância
  const s = sunRadius * 6;
  sprite.scale.set(s, s, 1);
  sprite.renderOrder = 1; // renderiza depois da geometria sólida
  return sprite;
}
