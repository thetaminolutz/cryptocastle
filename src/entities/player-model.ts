// "The Nameless One": a smooth low-poly figure in torn clothes with a blank face,
// built from capsules and animated in code (walk, run, swim, climb, roll).
import * as THREE from 'three';
import type { Player } from './player';

export class PlayerModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legL: THREE.Group; private legR: THREE.Group;
  private armL: THREE.Group; private armR: THREE.Group;
  private head: THREE.Mesh;
  private phase = 0;
  private rollSpin = 0;

  constructor() {
    const cloth = new THREE.MeshLambertMaterial({ color: 0x5e4e3e });
    const clothDark = new THREE.MeshLambertMaterial({ color: 0x3f342b });
    const skin = new THREE.MeshLambertMaterial({ color: 0xcfc6bb });
    const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2c });

    const limb = (r: number, len: number, mat: THREE.Material) => {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), mat);
      m.position.y = -len / 2 - r * 0.6;
      pivot.add(m);
      return pivot;
    };
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.42, 4, 10), cloth);
    torso.position.y = 1.18;
    torso.scale.set(1, 1, 0.72);
    // ragged hem
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.22, 9, 1, true), clothDark);
    hem.position.y = 0.88;
    (hem.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin); // blank, smooth face
    this.head.position.y = 1.66;
    this.head.scale.set(0.95, 1.12, 0.98);
    this.legL = limb(0.085, 0.5, clothDark); this.legL.position.set(-0.11, 0.86, 0);
    this.legR = limb(0.085, 0.5, clothDark); this.legR.position.set(0.11, 0.86, 0);
    this.armL = limb(0.065, 0.46, cloth); this.armL.position.set(-0.28, 1.45, 0);
    this.armR = limb(0.065, 0.46, cloth); this.armR.position.set(0.28, 1.45, 0);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.95, 6), wood);
    stick.position.set(0, -0.62, -0.25);
    stick.rotation.x = Math.PI / 2.4;
    this.armR.add(stick);
    this.body.add(torso, hem, this.head, this.legL, this.legR, this.armL, this.armR);
    this.root.add(this.body);
  }

  update(dt: number, p: Player, visible: boolean) {
    this.root.visible = visible;
    this.root.position.copy(p.pos);
    this.root.rotation.y = p.yaw;
    const moving = Math.min(1, p.speed / 4.4);
    this.phase += dt * (3 + p.speed * 1.6);
    const sw = Math.sin(this.phase);
    let legAmp = 0.75 * moving, armAmp = 0.6 * moving;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, Math.abs(Math.cos(this.phase)) * 0.05 * moving, 0);
    this.armL.rotation.set(0, 0, 0.08); this.armR.rotation.set(0, 0, -0.08);

    if (p.state === 'swim') {
      this.body.rotation.x = -0.9 * Math.min(1, p.speed / 2 + 0.3);
      this.body.position.y = 0.6;
      legAmp = 0.4; armAmp = 0.9;
      this.armL.rotation.z = 0.8 + Math.sin(this.phase) * 0.6; this.armR.rotation.z = -0.8 - Math.sin(this.phase) * 0.6;
    } else if (p.state === 'climb') {
      this.armL.rotation.x = Math.PI * 0.85 + sw * 0.3; this.armR.rotation.x = Math.PI * 0.85 - sw * 0.3;
      this.legL.rotation.x = 0.5 + sw * 0.4; this.legR.rotation.x = 0.5 - sw * 0.4;
      return;
    } else if (p.state === 'roll') {
      this.rollSpin += dt * 15;
      this.body.position.y = 0.55;
      this.body.rotation.x = -this.rollSpin;
      this.legL.rotation.x = 1.2; this.legR.rotation.x = 1.2;
      return;
    } else if (p.state === 'air') {
      legAmp = 0.2; armAmp = 0.2;
      this.legL.rotation.x = 0.35; this.legR.rotation.x = -0.15;
    }
    this.rollSpin = 0;
    this.legL.rotation.x = sw * legAmp;
    this.legR.rotation.x = -sw * legAmp;
    this.armL.rotation.x += -sw * armAmp;
    this.armR.rotation.x += sw * armAmp;
  }
}
