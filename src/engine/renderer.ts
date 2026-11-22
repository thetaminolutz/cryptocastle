// Low-resolution 3D rendering for the pixel look: the WebGL canvas is rendered at
// ~45% of the physical screen resolution (DPR capped at 1) and stretched to full
// screen by CSS with nearest-neighbour (image-rendering: pixelated). The DOM UI on
// top stays at full resolution.
import * as THREE from 'three';
import { settings } from './settings';

THREE.ColorManagement.enabled = false;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  width = 0; height = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false
    });
    this.gl.setPixelRatio(1);
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.shadowMap.enabled = false;
    this.gl.info.autoReset = false;
    this.camera = new THREE.PerspectiveCamera(72, 16 / 10, 0.1, 400);
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    settings.onChange((_s, k) => { if (k === 'renderScale') this.resize(); });
    this.resize();
  }

  resize() {
    const cssW = window.innerWidth, cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = settings.values.renderScale;
    this.width = Math.max(160, Math.round(cssW * dpr * scale));
    this.height = Math.max(100, Math.round(cssH * dpr * scale));
    this.gl.setSize(this.width, this.height, false); // CSS keeps 100% size
    this.camera.aspect = cssW / cssH;
    this.camera.updateProjectionMatrix();
  }

  render(scene: THREE.Scene) {
    this.gl.info.reset();
    this.gl.render(scene, this.camera);
  }
}
