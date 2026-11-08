import * as THREE from 'three';

// Luz do Sol no espaço: pontual, na posição do Sol, sem queda com a distância
// (decay 0). Com queda física, Saturno em diante ficaria preto — mesma licença
// artística do Titans of Space. Sem sombra: sombra de luz pontual renderiza a
// cena 6 vezes por quadro, inviável a 60 fps no celular.
const INTENSIDADE_SOL = 3.0;

// Fill mínimo para o lado noturno não virar recorte preto contra o fundo
const INTENSIDADE_AMBIENTE_ESPACO = 0.06;

export function createSolarLight(world: THREE.Object3D): THREE.PointLight {
  const light = new THREE.PointLight(0xffffff, INTENSIDADE_SOL, 0, 0);
  light.position.set(0, 0, 0);
  world.add(light);
  world.add(new THREE.AmbientLight(0x223344, INTENSIDADE_AMBIENTE_ESPACO));
  return light;
}

// Luz do dia na base terrestre: direcional vinda do alto, com sombra em mapa
// pequeno (1024) e área limitada à base para caber no orçamento do celular.
export function createDaylight(group: THREE.Object3D): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(0xfff4e0, 2.5);
  light.position.set(30, 50, 20);
  light.target.position.set(0, 0, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -45;
  light.shadow.camera.right = 45;
  light.shadow.camera.top = 45;
  light.shadow.camera.bottom = -45;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = 150;
  light.shadow.bias = -0.0005;
  group.add(light, light.target);
  group.add(new THREE.HemisphereLight(0x87ceeb, 0x3a4a3a, 0.6));
  return light;
}
