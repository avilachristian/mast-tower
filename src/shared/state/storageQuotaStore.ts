import { create } from 'zustand';
import { apiClient } from '@/shared/api/client';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import {
  formatStorageBytes,
  R2_DEFAULT_QUOTA_BYTES,
  type R2StorageStatus,
} from '@/shared/storage/r2Quota';

interface StorageQuotaState {
  status: R2StorageStatus | null;
  loading: boolean;
  bannerDismissed: boolean;
  lastWarnedLevel: 'ok' | 'warning' | 'blocked' | null;

  applyStatus: (next: R2StorageStatus, notifyTransition?: boolean) => void;
  refreshStatus: (notifyTransition?: boolean) => Promise<R2StorageStatus | null>;
  reconcileStatus: () => Promise<R2StorageStatus | null>;
  dismissBanner: () => void;
  reset: () => void;
}

export const useStorageQuotaStore = create<StorageQuotaState>((set, get) => ({
  status: null,
  loading: false,
  bannerDismissed: false,
  lastWarnedLevel: null,

  applyStatus: (next, notifyTransition = true) => {
    const prevLevel = get().lastWarnedLevel;
    const shouldNotify =
      notifyTransition &&
      (next.level === 'warning' || next.level === 'blocked') &&
      prevLevel !== next.level;

    set({
      status: next,
      bannerDismissed: prevLevel !== next.level ? false : get().bannerDismissed,
      lastWarnedLevel: next.level,
    });

    if (shouldNotify && next.message) {
      useFeedbackStore.getState().pushToast({
        tone: next.level === 'blocked' ? 'error' : 'warning',
        title:
          next.level === 'blocked'
            ? 'R2 Uploads Blocked (< 100 MB Left)'
            : 'Low R2 Storage Warning (<= 1 GB Left)',
        message: `${formatStorageBytes(next.remainingBytes)} remaining out of ${formatStorageBytes(next.limitBytes || R2_DEFAULT_QUOTA_BYTES)}.`,
        durationMs: 7000,
      });
    }
  },

  refreshStatus: async (notifyTransition = true) => {
    set({ loading: true });
    try {
      const res = await apiClient.getStorageStatus();
      get().applyStatus(res.storage, notifyTransition);
      set({ loading: false });
      return res.storage;
    } catch {
      set({ loading: false });
      return null;
    }
  },

  reconcileStatus: async () => {
    set({ loading: true });
    try {
      const res = await apiClient.reconcileStorageStatus();
      get().applyStatus(res.storage, true);
      set({ loading: false });
      useFeedbackStore.getState().pushToast({
        tone: 'info',
        title: 'R2 Storage Synced',
        message: `${formatStorageBytes(res.storage.usedBytes)} used across ${res.storage.objectCount} stored images.`,
      });
      return res.storage;
    } catch (err) {
      set({ loading: false });
      useFeedbackStore.getState().pushToast({
        tone: 'error',
        title: 'Storage Sync Failed',
        message: err instanceof Error ? err.message : 'Unable to check R2 bucket.',
      });
      return null;
    }
  },

  dismissBanner: () => set({ bannerDismissed: true }),

  reset: () =>
    set({
      status: null,
      loading: false,
      bannerDismissed: false,
      lastWarnedLevel: null,
    }),
}));
