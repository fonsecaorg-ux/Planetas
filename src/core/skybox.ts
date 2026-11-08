import * as THREE from 'three';

/**
 * Skybox equiretangular com a textura NASA Deep Star Maps (2K).
 *
 * Arquivo esperado: /public/textures/starmap_2020_2k.jpg
 * Download: https://svs.gsfc.nasa.gov/4851
 *   → "2048 x 1024 JPEG" (Starmap 2020)
 *
 * Se a textura não for encontrada, o céu fica preto e as estrelas procedurais
 * do starfield.ts continuam visíveis sem nenhuma quebra.
 */

const SKYBOX_RADIUS = 950;

export function createSkybox(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(SKYBOX_RADIUS, 64, 32);

  const mat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;

  new THREE.TextureLoader().load(
    '/textures/starmap_2020_2k.jpg',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      // Corrige a rotação para o plano galáctico ficar na horizontal
      // (textura NASA usa coordenadas galácticas centradas no centro da Via Láctea)
      mat.map = tex;
      mat.needsUpdate = true;
    },
    undefined,
    () => {
      console.info(
        '[skybox] starmap_2020_2k.jpg não encontrado em /public/textures/.\n' +
        'Baixe em: https://svs.gsfc.nasa.gov/4851 e salve como public/textures/starmap_2020_2k.jpg'
      );
    },
  );

  return mesh;
}
