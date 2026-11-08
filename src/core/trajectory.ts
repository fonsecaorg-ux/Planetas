import * as THREE from 'three';
import type { ScaleMode } from '@/data/types';
import { scalePointKm } from '@/utils/scale';

export interface TrajectoryPoint { x: number; y: number; z: number } // em km

function toScene(pointsKm: TrajectoryPoint[], mode: ScaleMode): THREE.Vector3[] {
  return pointsKm.map((p) => new THREE.Vector3(...scalePointKm(p.x, p.y, p.z, mode)));
}

export class Trajectory {
  readonly group: THREE.Group;
  private line: THREE.Line;
  private probe: THREE.Mesh;
  private curve: THREE.CatmullRomCurve3;
  private t = 0;
  private speed: number;

  constructor(pointsKm: TrajectoryPoint[], scaleMode: ScaleMode, color = 0xfbbf24, speed = 0.05) {
    this.speed = speed;
    this.group = new THREE.Group();
    this.curve = new THREE.CatmullRomCurve3(toScene(pointsKm, scaleMode));
    const geo = new THREE.BufferGeometry().setFromPoints(this.curve.getPoints(200));
    const mat = new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1, transparent: true, opacity: 0.7 });
    this.line = new THREE.Line(geo, mat);
    this.line.computeLineDistances();
    this.group.add(this.line);

    const probeGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const probeMat = new THREE.MeshBasicMaterial({ color });
    this.probe = new THREE.Mesh(probeGeo, probeMat);
    this.group.add(this.probe);
    this.probe.position.copy(this.curve.getPoint(0));
  }

  update(dt: number, timeSpeed: number) {
    this.t = (this.t + dt * this.speed * timeSpeed) % 1;
    this.probe.position.copy(this.curve.getPoint(this.t));
  }

  setScaleMode(mode: ScaleMode, pointsKm: TrajectoryPoint[]) {
    this.curve = new THREE.CatmullRomCurve3(toScene(pointsKm, mode));
    const geo = new THREE.BufferGeometry().setFromPoints(this.curve.getPoints(200));
    this.line.geometry.dispose();
    this.line.geometry = geo;
    this.line.computeLineDistances();
  }

  dispose() {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.probe.geometry.dispose();
    (this.probe.material as THREE.Material).dispose();
  }
}
