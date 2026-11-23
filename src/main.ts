import './style.css';
import { blockSafariGestures } from './engine/gestures';
import { setupPWA, requestPersistentStorage } from './engine/pwa';
import { input } from './engine/input';
import { audio } from './engine/audio';
import { showEnter, showTitle, showSlots } from './ui/screens';
import type { SaveData } from './engine/save';
import { Game } from './game/game';
import { seedFromString } from './world/noise';

blockSafariGestures();
setupPWA();
input.attachKeyboard();

// iOS: the AudioContext may only start inside a user gesture.
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui')!;
let game: Game | null = null;

function startGame(slot = 0, data: SaveData | null = null) {
  void requestPersistentStorage();
  audio.heartbeat();
  const params = new URLSearchParams(location.search);
  const seed = data ? data.seed : params.has('seed') ? seedFromString(params.get('seed')!) : params.has('skip') ? seedFromString('duskmere') : (Math.random() * 2 ** 31) >>> 0;
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'THE WORLD STIRS…';
  uiRoot.appendChild(loading);
  // let the loading text paint before generating textures
  setTimeout(() => {
    game = new Game(canvas, uiRoot, { slot, seed, data });
    game.start();
    (window as unknown as { __game: Game }).__game = game;
    setTimeout(() => loading.remove(), 1200);
  }, 50);
}

function title() {
  showTitle(() => showSlots((slot, data) => {
    if (data) startGame(slot, data);
    else showEnter(() => startGame(slot, null), title);
  }, title));
}

if (new URLSearchParams(location.search).has('skip')) startGame(2, null);
else title();
