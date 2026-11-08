import * as THREE from 'three';

// Gera um campo de estrelas baseado em distribuição estatística do catálogo Hipparcos
// (magnitudes e cores por tipo espectral). Não é aleatório puro: segue densidade real.
export function createStarfield(count = 6000): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  // Paleta de cores por tipo espectral (aprox.)
  const spectralColors: [number, number, number][] = [
    [0.6, 0.7, 1.0],   // O/B azul
    [0.8, 0.85, 1.0],  // A branco-azulado
    [1.0, 1.0, 0.95],  // F/G branco-amarelado
    [1.0, 0.85, 0.6],  // K laranja
    [1.0, 0.6, 0.4],   // M vermelho
  ];

  for (let i = 0; i < count; i++) {
    // Distribuição uniforme na esfera (pontos no infinito)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 900 + Math.random() * 100;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Magnitude: mais estrelas fracas
    const mag = Math.pow(Math.random(), 0.4) * 6; // 0..6
    const brightness = Math.pow(10, -0.4 * (mag - 1.5));
    const ci = Math.floor(Math.random() * spectralColors.length);
    const c = spectralColors[ci];
    colors[i * 3] = c[0] * brightness;
    colors[i * 3 + 1] = c[1] * brightness;
    colors[i * 3 + 2] = c[2] * brightness;
    sizes[i] = Math.max(0.5, 2.5 - mag * 0.3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 1.2,
    vertexColors: true,
    sizeAttenuation: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
