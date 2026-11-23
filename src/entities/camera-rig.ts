// Third-person orbit camera (default) with terrain collision, and a first-person mode.
import * as THREE from 'three';
import { input } from '../engine/input';
import { settings } from '../engine/settings';
import type { World } from '../world/world';
import type { Player } from './player';

export class CameraRig {
  yaw = Math.PI * 0.75;
  pitch = -0.2;
  firstPerson = false;
  /** preferred third-person distance (m) */
  distance = 4.4;
  private dist = 4.4;
  private smoothTarget = new THREE.Vector3();
  private initialised = false;
  readonly forward = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private n = new THREE.Vector3();

  update(dt: number, camera: THREE.PerspectiveCamera, player: Player, world: World) {
    const s = settings.values;
    const sens = 0.0045 * s.cameraSensitivity;
    this.yaw -= input.lookDX * sens;
    this.pitch -= input.lookDY * sens * (s.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.35, this.pitch));

    const eye = player.eye;
    if (!this.initialised) { this.smoothTarget.copy(eye); this.initialised = true; }
    // follow smoothly vertically (soft steps), tightly horizontally
    this.smoothTarget.x = eye.x; this.smoothTarget.z = eye.z;
    this.smoothTarget.y += (eye.y - this.smoothTarget.y) * Math.min(1, dt * 14);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const back = this.tmp.set(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));

    if (this.firstPerson) {
      camera.position.copy(eye);
    } else {
      // shoulder offset to the right, then pull in if terrain blocks the view
      const target = new THREE.Vector3(this.smoothTarget.x, this.smoothTarget.y - 0.1, this.smoothTarget.z);
      target.x += Math.cos(this.yaw) * 0.45; target.z -= Math.sin(this.yaw) * 0.45;
      let want = this.distance;
      const p = new THREE.Vector3();
      for (let d = 0.3; d <= this.distance; d += 0.25) {
        p.copy(target).addScaledVector(back, d);
        if (world.sdf(p, this.n) > -0.35) { want = Math.max(0.3, d - 0.35); break; }
      }
      this.dist += (want - this.dist) * Math.min(1, dt * (want < this.dist ? 25 : 4));
      camera.position.copy(target).addScaledVector(back, this.dist);
    }
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
