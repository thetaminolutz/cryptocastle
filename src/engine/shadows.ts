// Sun/moon shadow map that follows the player. Casters are all objects on layer 1;
// each may provide its own depth material (instanced props need theirs).
import * as THREE from 'three';
import { U, depthOnlyMaterial } from '../world/shaders';

export const SHADOW_LAYER = 1;

export class ShadowSystem {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
  private target: THREE.WebGLRenderTarget;
  private size = 0;
  private radius = 50;
  private casters = new Map<THREE.Object3D, THREE.Material>();
  private center = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  enabled = false;
  get radiusM() { return this.radius; }

  constructor() {
    this.camera.layers.set(SHADOW_LAYER);
    this.target = this.makeTarget(16);
  }

  private makeTarget(size: number) {
    const depth = new THREE.DepthTexture(size, size);
    depth.type = THREE.UnsignedIntType;
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = depth.magFilter = THREE.LinearFilter;
    const rt = new THREE.WebGLRenderTarget(size, size, { depthTexture: depth, format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: true });
    U.uShadowMap.value = depth;
    return rt;
  }

  /** quality: 0 off, 1 medium, 2 high */
  setQuality(q: number) {
    this.enabled = q > 0;
    const size = q === 2 ? 2048 : q === 1 ? 1536 : 16;
    this.radius = q === 2 ? 70 : 48;
    if (size !== this.size) {
      this.target.dispose();
      this.target = this.makeTarget(size);
      this.size = size;
    }
    U.uShadowOn.value = this.enabled ? 1 : 0;
    U.uShadowSize.value = size;
    U.uShadowTexel.value = (this.radius * 2) / size;
  }

  add(obj: THREE.Object3D, mat: THREE.Material = depthOnlyMaterial) {
    obj.traverse((o) => o.layers.enable(SHADOW_LAYER));
    this.casters.set(obj, mat);
  }
  remove(obj: THREE.Object3D) { this.casters.delete(obj); }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, focus: THREE.Vector3) {
    if (!this.enabled) return;
    const dir = U.uLightDir.value;
    if (dir.y < 0.05) { U.uShadowOn.value = 0; return; }
    U.uShadowOn.value = 1;
    const cam = this.camera, r = this.radius;
    // snap the centre to whole shadow texels in light space → no shimmering
    cam.position.set(0, 0, 0);
    cam.lookAt(this.tmp.copy(dir).negate());
    cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse.clone();
    const texel = (2 * r) / this.size;
    this.center.copy(focus).applyMatrix4(inv);
    this.center.x = Math.round(this.center.x / texel) * texel;
    this.center.y = Math.round(this.center.y / texel) * texel;
    this.center.applyMatrix4(cam.matrixWorld);
    cam.position.copy(this.center).addScaledVector(dir, 250);
    cam.lookAt(this.center);
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 50; cam.far = 450;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    U.uShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

    const saved: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    for (const [obj, mat] of this.casters) {
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && o.layers.test(cam.layers)) { saved.push([m, m.material]); m.material = mat; }
      });
    }
    const bg = scene.background;
    scene.background = null;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    scene.background = bg;
    for (const [m, mat] of saved) m.material = mat;
  }
}
