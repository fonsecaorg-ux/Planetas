import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();

export class SpaceStation {
  readonly group: THREE.Group;
  readonly hitbox: THREE.Mesh;
  private t = 0;
  private disposed = false;

  constructor() {
    this.group = new THREE.Group();
    this.buildProcedural();

    gltfLoader.load(
      'models/station_structure.glb',
      (gltf) => {
        if (this.disposed) return;
        // remove procedural
        for (const c of [...this.group.children]) {
          if (c.name === 'procedural') {
            this.group.remove(c);
            c.traverse((o) => {
              const m = o as THREE.Mesh;
              m.geometry?.dispose?.();
              const mat = m.material as THREE.Material | THREE.Material[] | undefined;
              if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
              else mat?.dispose?.();
            });
          }
        }
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        model.scale.setScalar(2.2 / maxDim);
        const box2 = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        box2.getCenter(center);
        model.position.sub(center);
        model.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        this.group.add(model);
      },
      undefined,
      () => {
        /* mantém procedural */
      }
    );

    this.group.scale.setScalar(0.6);

    const hbGeo = new THREE.SphereGeometry(2.5, 8, 8);
    const hbMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(hbGeo, hbMat);
    this.group.add(this.hitbox);
  }

  private buildProcedural() {
    if (this.group.userData.proceduralBuilt) return;
    this.group.userData.proceduralBuilt = true;
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xc8d0dc, roughness: 0.4, metalness: 0.6 });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.4, 16), coreMat);
    core.rotation.z = Math.PI / 2;
    core.castShadow = true;
    core.name = 'procedural';
    this.group.add(core);
    for (const s of [-1, 1]) {
      const mod = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.6, 12), coreMat);
      mod.rotation.z = Math.PI / 2;
      mod.position.set(s * 1.6, 0, 0);
      mod.name = 'procedural';
      this.group.add(mod);
    }
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3, metalness: 0.7 });
    for (const s of [-1, 1]) {
      for (const z of [-0.6, 0.6]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.9), panelMat);
        panel.position.set(s * 2.6, 0, z);
        panel.name = 'procedural';
        this.group.add(panel);
      }
    }
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.7 })
    );
    dome.position.set(0, 0.6, 0);
    dome.name = 'procedural';
    this.group.add(dome);
  }

  update(dt: number, timeSpeed: number) {
    this.t += dt * timeSpeed;
    this.group.rotation.y += 0.2 * dt * timeSpeed;
    this.group.position.y = Math.sin(this.t) * 0.1;
  }

  dispose() {
    this.disposed = true;
  }
}
