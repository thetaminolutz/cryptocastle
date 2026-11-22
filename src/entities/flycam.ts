// M2 test camera: free flight over the world (replaced by the player in M3).
import * as THREE from 'three';
import { input } from '../engine/input';
import { settings } from '../engine/settings';

export class FlyCam {
  yaw = Math.PI * 0.75;
  pitch = -0.25;
  readonly position = new THREE.Vector3(8, 80, 8);
  readonly forward = new THREE.Vector3();

  update(dt: number, camera: THREE.PerspectiveCamera) {
    const s = settings.values;
    const sens = 0.0042 * s.cameraSensitivity;
    this.yaw -= input.lookDX * sens;
    this.pitch -= input.lookDY * sens * (s.invertY ? -1 : 1);
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    const speed = input.sprint ? 32 : 12;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.position.x += (fx * input.move.y + rx * input.move.x) * speed * dt;
    this.position.z += (fz * input.move.y + rz * input.move.x) * speed * dt;
    if (input.button('jump').down) this.position.y += speed * dt;
    if (input.button('down').down) this.position.y -= speed * dt;
    this.position.y = Math.max(2, Math.min(200, this.position.y));

    camera.position.copy(this.position);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.forward.set(fx, 0, fz);
  }
}
