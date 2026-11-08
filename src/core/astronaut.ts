import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AstronautData } from '@/data/types';

export class Astronaut {
  readonly data: AstronautData;
  readonly group: THREE.Group;
  private t = Math.random() * Math.PI * 2;
  private mixer: THREE.AnimationMixer | null = null;

  constructor(data: AstronautData, index: number) {
    this.data = data;
    this.group = new THREE.Group();

    // Placeholder enquanto o modelo carrega
    const phGeo = new THREE.CapsuleGeometry(0.12, 0.4, 4, 8);
    const phMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(data.suitColor), roughness: 0.6 });
    const placeholder = new THREE.Mesh(phGeo, phMat);
    placeholder.position.y = 0.3;
    placeholder.castShadow = true;
    this.group.add(placeholder);

    // Posição orbital ao redor do corpo pai
    const radius = 2.5 + index * 0.6;
    const angle = (index / 3) * Math.PI * 2;
    this.group.position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);

    // Etiqueta com nome
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.name, 64, 22);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 1.2;
    sprite.scale.set(0.8, 0.2, 1);
    this.group.add(sprite);

    // Carregar modelo GLTF (se disponível)
    if (data.model) {
      const loader = new GLTFLoader();
      loader.load(
        data.model,
        (gltf) => {
          // remover placeholder
          this.group.remove(placeholder);
          phGeo.dispose();
          phMat.dispose();

          const model = gltf.scene;
          // escalar para ~1.0 de altura
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const scale = size.y > 0 ? 0.9 / size.y : 1;
          model.scale.setScalar(scale);

          // centralizar na base
          const box2 = new THREE.Box3().setFromObject(model);
          const center = box2.getCenter(new THREE.Vector3());
          model.position.x -= center.x;
          model.position.z -= center.z;
          model.position.y -= box2.min.y;

          // aplicar cor do traje (override de material)
          const suitColor = new THREE.Color(data.suitColor);
          model.traverse((child: any) => {
            if (child.isMesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: suitColor,
                roughness: 0.5,
                metalness: 0.1,
              });
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // capacete
          const headY = 0.9 * 0.95;
          const helmet = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 16, 16),
            new THREE.MeshStandardMaterial({ color: new THREE.Color(data.helmetColor), roughness: 0.3, metalness: 0.4 })
          );
          helmet.position.set(0, headY, 0);
          model.add(helmet);

          this.group.add(model);

          // Animação (walk) se disponível
          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(model);
            const clip = gltf.animations[0];
            const action = this.mixer.clipAction(clip);
            action.play();
          }
        },
        undefined,
        () => {
          // falha no carregamento: mantém placeholder
        }
      );
    }
  }

  update(dt: number, timeSpeed: number) {
    this.t += dt * 0.5 * timeSpeed;
    this.group.position.y = 0.5 + Math.sin(this.t * 2) * 0.15;
    this.group.rotation.y += 0.3 * dt * timeSpeed;
    if (this.mixer) this.mixer.update(dt * timeSpeed);
  }
}
