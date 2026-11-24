// Service-worker registration with an in-game "Update available" prompt,
// plus persistent-storage request so iOS keeps our IndexedDB saves.
import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../ui/toast';

export function setupPWA() {
  if (!('serviceWorker' in navigator)) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      showToast('Update available – tap to reload', () => update(true), 0);
    },
    onOfflineReady() {
      showToast('Ready to play offline', undefined, 3500);
    }
  });
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* unsupported */ }
  return false;
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
