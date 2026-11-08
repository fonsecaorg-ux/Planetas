import * as THREE from 'three';

// LOD simples: troca geometria conforme distância da câmera.
export class SimpleLOD {
  private levels: { distance: number; geometry: THREE.BufferGeometry }[];
  private mesh: THREE.Mesh;
  private current = -1;

  constructor(mesh: THREE.Mesh, levels: { distance: number; geometry: THREE.BufferGeometry }[]) {
    this.mesh = mesh;
    this.levels = levels.sort((a, b) => a.distance - b.distance);
  }

  update(cameraPos: THREE.Vector3) {
    const d = cameraPos.distanceTo(this.mesh.position);
    let idx = this.levels.length - 1;
    for (let i = 0; i < this.levels.length; i++) {
      if (d < this.levels[i].distance) { idx = i; break; }
    }
    if (idx !== this.current) {
      this.current = idx;
      this.mesh.geometry.dispose();
      this.mesh.geometry = this.levels[idx].geometry;
    }
  }
}
