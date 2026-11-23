// Player-tweakable settings, persisted in localStorage (small, non-critical).
// Saves (game state) go to IndexedDB in M5.

export type QualityPreset = 'low' | 'medium' | 'high';

export interface Settings {
  quality: QualityPreset;
  viewDistance: number;   // chunks, 4..10
  renderScale: number;    // 0.35..1 of physical screen resolution
  fpsCap: 30 | 60;
  shadows: number;        // 0 off, 1 medium, 2 high
  vegetation: number;     // 0 low, 1 medium, 2 high (grass distance/density)
  pixelLook: boolean;     // retro nearest-neighbour upscale
  damageNumbers: boolean;
  hitSound: boolean;      // warning sound when hit (muting it is dangerous)
  showFps: boolean;
  autoQuality: boolean;
  particles: number;      // 0..1
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  joystickSize: number;   // px radius
  cameraSensitivity: number;
  invertY: boolean;
  leftHanded: boolean;
}

export const PRESETS: Record<QualityPreset, Pick<Settings, 'viewDistance' | 'renderScale' | 'particles' | 'shadows' | 'vegetation'>> = {
  low: { viewDistance: 4, renderScale: 0.45, particles: 0.4, shadows: 0, vegetation: 0 },
  medium: { viewDistance: 6, renderScale: 0.62, particles: 0.75, shadows: 1, vegetation: 1 },
  high: { viewDistance: 8, renderScale: 0.8, particles: 1, shadows: 2, vegetation: 2 }
};

const DEFAULTS: Settings = {
  quality: 'medium',
  ...PRESETS.medium,
  fpsCap: 60,
  pixelLook: false,
  damageNumbers: true,
  hitSound: true,
  showFps: false,
  autoQuality: true,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  ambienceVolume: 0.6,
  joystickSize: 70,
  cameraSensitivity: 1,
  invertY: false,
  leftHanded: false
};

const KEY = 'duskmere.settings.v2';
type Listener = (s: Settings, changed: keyof Settings) => void;

class SettingsStore {
  readonly values: Settings;
  private listeners: Listener[] = [];

  constructor() {
    let stored: Partial<Settings> = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* private mode */ }
    this.values = { ...DEFAULTS, ...stored };
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
    for (const l of this.listeners) l(this.values, key);
  }

  applyPreset(p: QualityPreset) {
    this.set('quality', p);
    const v = PRESETS[p];
    this.set('viewDistance', v.viewDistance);
    this.set('renderScale', v.renderScale);
    this.set('particles', v.particles);
    this.set('shadows', v.shadows);
    this.set('vegetation', v.vegetation);
  }

  onChange(l: Listener) { this.listeners.push(l); }
}

export const settings = new SettingsStore();
