import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaBuildInfo {
  version: string;
  buildId: string;
  builtAt?: string;
}

export type UpdateCheckStatus =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'update_available'
  | 'offline'
  | 'unsupported'
  | 'error';

const JUST_UPDATED_SESSION_KEY = 'mast2-pwa-just-updated-v1';
const AUTO_CHECK_MIN_INTERVAL_MS = 60_000;
const PERIODIC_CHECK_INTERVAL_MS = 15 * 60_000;

export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
export const APP_BUILD_TIME =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';

interface PwaState {
  isOnline: boolean;
  isStandalone: boolean;
  swRegistered: boolean;
  offlineReady: boolean;
  offlineReadyDismissed: boolean;
  updateAvailable: boolean;
  updateDismissed: boolean;
  isUpdating: boolean;
  justUpdated: boolean;
  checkStatus: UpdateCheckStatus;
  lastCheckedAt: string | null;
  currentBuild: PwaBuildInfo;
  pendingBuild: PwaBuildInfo | null;
  canInstall: boolean;
  errorMessage: string | null;

  checkForUpdates: (manual?: boolean) => Promise<void>;
  applyUpdate: () => Promise<void>;
  dismissUpdateBanner: () => void;
  dismissOfflineReady: () => void;
  dismissJustUpdated: () => void;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

let swRegistration: ServiceWorkerRegistration | null = null;
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
let reloadingForUpdate = false;
let lastAutoCheckMs = 0;

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const mediaMatch =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone
  );
  return mediaMatch || iosStandalone;
}

function readJustUpdatedFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const val = window.sessionStorage.getItem(JUST_UPDATED_SESSION_KEY);
    if (val === '1') {
      window.sessionStorage.removeItem(JUST_UPDATED_SESSION_KEY);
      return true;
    }
  } catch {
    // Ignore sessionStorage errors
  }
  return false;
}

function markJustUpdatedFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(JUST_UPDATED_SESSION_KEY, '1');
  } catch {
    // Ignore sessionStorage errors
  }
}

async function queryWorkerBuildInfo(
  worker: ServiceWorker | null | undefined
): Promise<PwaBuildInfo | null> {
  if (!worker || typeof MessageChannel === 'undefined') return null;
  return new Promise<PwaBuildInfo | null>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      const data = event.data as Partial<PwaBuildInfo> | undefined;
      if (data?.version && data?.buildId) {
        resolve({ version: data.version, buildId: data.buildId });
      } else {
        resolve(null);
      }
    };
    try {
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function syncWaitingWorker(reg: ServiceWorkerRegistration): Promise<boolean> {
  if (!reg.waiting) return false;
  const pendingBuild = await queryWorkerBuildInfo(reg.waiting);
  usePwaStore.setState({
    updateAvailable: true,
    updateDismissed: false,
    checkStatus: 'update_available',
    ...(pendingBuild ? { pendingBuild } : {}),
  });
  return true;
}

function watchInstallingWorker(
  reg: ServiceWorkerRegistration,
  worker: ServiceWorker
): void {
  worker.addEventListener('statechange', () => {
    if (worker.state !== 'installed') return;
    if (navigator.serviceWorker.controller) {
      void syncWaitingWorker(reg);
    } else {
      void queryWorkerBuildInfo(worker).then((info) => {
        usePwaStore.setState({
          offlineReady: true,
          offlineReadyDismissed: false,
          ...(info ? { currentBuild: { ...info, builtAt: APP_BUILD_TIME } } : {}),
        });
      });
    }
  });
}

export const usePwaStore = create<PwaState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isStandalone: detectStandaloneMode(),
  swRegistered: false,
  offlineReady: false,
  offlineReadyDismissed: false,
  updateAvailable: false,
  updateDismissed: false,
  isUpdating: false,
  justUpdated: readJustUpdatedFlag(),
  checkStatus: 'idle',
  lastCheckedAt: null,
  currentBuild: {
    version: APP_VERSION,
    buildId: '',
    builtAt: APP_BUILD_TIME,
  },
  pendingBuild: null,
  canInstall: false,
  errorMessage: null,

  checkForUpdates: async (manual = true) => {
    if (typeof window === 'undefined') return;
    if (!get().isOnline) {
      set({
        checkStatus: 'offline',
        errorMessage: 'You are currently offline.',
      });
      return;
    }

    if (!('serviceWorker' in navigator) || !swRegistration) {
      if (manual) {
        set({
          checkStatus: 'unsupported',
          errorMessage: import.meta.env.DEV
            ? 'Offline updates activate in production builds (npm run build).'
            : 'Service worker is not active in this browser.',
        });
      }
      return;
    }

    const nowMs = Date.now();
    if (!manual && nowMs - lastAutoCheckMs < AUTO_CHECK_MIN_INTERVAL_MS) {
      return;
    }
    lastAutoCheckMs = nowMs;

    set({ checkStatus: 'checking', errorMessage: null });

    try {
      await swRegistration.update();

      // Check version.json directly with cache bypassed so Cloudflare edge caches don't hide updates.
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const remote = (await res.json()) as Partial<PwaBuildInfo>;
          const currentId = get().currentBuild.buildId;
          if (remote.buildId && currentId && remote.buildId !== currentId) {
            await swRegistration.update();
          }
          if (remote.version && remote.buildId) {
            set({
              pendingBuild:
                remote.buildId !== currentId
                  ? {
                      version: remote.version,
                      buildId: remote.buildId,
                      builtAt: remote.builtAt,
                    }
                  : get().pendingBuild,
            });
          }
        }
      } catch {
        // Ignore version.json fetch error; swRegistration.update() still handles SW checks.
      }

      if (swRegistration.installing) {
        await new Promise<void>((resolve) => {
          const installing = swRegistration!.installing!;
          const done = () => resolve();
          const timer = setTimeout(done, 4000);
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' || installing.state === 'redundant') {
              clearTimeout(timer);
              done();
            }
          });
        });
      }

      const hasWaiting = await syncWaitingWorker(swRegistration);
      set({
        lastCheckedAt: new Date().toISOString(),
        checkStatus: hasWaiting ? 'update_available' : 'up_to_date',
      });
    } catch (err) {
      set({
        checkStatus: 'error',
        errorMessage:
          err instanceof Error ? err.message : 'Unable to check for updates.',
      });
    }
  },

  applyUpdate: async () => {
    if (!swRegistration) return;
    const waiting = swRegistration.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    set({ isUpdating: true });
    markJustUpdatedFlag();
    waiting.postMessage({ type: 'SKIP_WAITING' });
  },

  dismissUpdateBanner: () => set({ updateDismissed: true }),
  dismissOfflineReady: () => set({ offlineReadyDismissed: true }),
  dismissJustUpdated: () => set({ justUpdated: false }),

  promptInstall: async () => {
    if (!deferredInstallPrompt) return 'unavailable';
    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        deferredInstallPrompt = null;
        set({ canInstall: false });
      }
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  },
}));

/**
 * Registers the PWA Service Worker (in production builds), tracks online/offline
 * status, and checks for updates automatically when returning to the app.
 */
export function registerPwaServiceWorker(): void {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  window.addEventListener('online', () => {
    usePwaStore.setState({ isOnline: true });
    void usePwaStore.getState().checkForUpdates(false);
  });

  window.addEventListener('offline', () => {
    usePwaStore.setState({ isOnline: false });
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    usePwaStore.setState({ canInstall: true });
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    usePwaStore.setState({ canInstall: false, isStandalone: true });
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    if (usePwaStore.getState().isUpdating) {
      reloadingForUpdate = true;
      window.location.reload();
    }
  });

  void navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then(async (reg) => {
      swRegistration = reg;
      usePwaStore.setState({ swRegistered: true });

      const activeInfo = await queryWorkerBuildInfo(
        reg.active ?? navigator.serviceWorker.controller
      );
      if (activeInfo) {
        usePwaStore.setState({
          currentBuild: { ...activeInfo, builtAt: APP_BUILD_TIME },
        });
      }

      if (reg.waiting && navigator.serviceWorker.controller) {
        await syncWaitingWorker(reg);
      }

      if (reg.installing) {
        watchInstallingWorker(reg, reg.installing);
      }

      reg.addEventListener('updatefound', () => {
        if (reg.installing) {
          watchInstallingWorker(reg, reg.installing);
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void usePwaStore.getState().checkForUpdates(false);
        }
      });

      window.setInterval(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void usePwaStore.getState().checkForUpdates(false);
        }
      }, PERIODIC_CHECK_INTERVAL_MS);

      if (navigator.onLine) {
        void usePwaStore.getState().checkForUpdates(false);
      }
    })
    .catch((err) => {
      usePwaStore.setState({
        errorMessage:
          err instanceof Error ? err.message : 'Service worker registration failed.',
      });
    });
}

