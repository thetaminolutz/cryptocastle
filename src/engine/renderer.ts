// Renderer: filmic tone mapping, sRGB output and MSAA. The 3D canvas renders at a
// fraction of the physical resolution (render scale) and is stretched to the screen;
// the DOM UI on top stays sharp. "Pixel look" switches the upscale to nearest-
// neighbour for a retro style.
import * as THREE from 'three';
import { settings } from './settings';

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  width = 0; height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false
    });
    this.gl.setPixelRatio(1);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = false;
    this.gl.info.autoReset = false;
    this.camera = new THREE.PerspectiveCamera(70, 16 / 10, 0.1, 400);
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    settings.onChange((_s, k) => { if (k === 'renderScale' || k === 'pixelLook') this.resize(); });
    this.resize();
  }

  resize() {
    const cssW = window.innerWidth, cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixel = settings.values.pixelLook;
    const scale = pixel ? Math.min(settings.values.renderScale, 0.35) : settings.values.renderScale;
    this.width = Math.max(200, Math.round(cssW * dpr * scale));
    this.height = Math.max(120, Math.round(cssH * dpr * scale));
    this.gl.setSize(this.width, this.height, false);
    this.canvas.classList.toggle('pixelated', pixel);
    this.camera.aspect = cssW / cssH;
    this.camera.updateProjectionMatrix();
  }

  get anisotropy() { return Math.min(8, this.gl.capabilities.getMaxAnisotropy()); }

  render(scene: THREE.Scene) {
    this.gl.render(scene, this.camera);
  }
}
