import { create } from 'zustand';

export type DialogTone = 'info' | 'success' | 'warning' | 'danger';
export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface DialogRequestOptions {
  title: string;
  message: string;
  detail?: string;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface QueuedDialog extends DialogRequestOptions {
  id: string;
  kind: 'alert' | 'confirm';
  resolve: (accepted: boolean) => void;
}

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
}

interface FeedbackState {
  activeDialog: QueuedDialog | null;
  dialogQueue: QueuedDialog[];
  toasts: ToastItem[];
  showAlert: (options: Omit<DialogRequestOptions, 'cancelLabel'>) => Promise<void>;
  requestConfirm: (options: DialogRequestOptions) => Promise<boolean>;
  resolveActiveDialog: (accepted: boolean) => void;
  pushToast: (options: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }) => string;
  dismissToast: (id: string) => void;
  clearAllFeedback: () => void;
}

let seq = 0;
function nextFeedbackId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  activeDialog: null,
  dialogQueue: [],
  toasts: [],

  showAlert: (options) =>
    new Promise<void>((resolve) => {
      const item: QueuedDialog = {
        ...options,
        id: nextFeedbackId('dlg'),
        kind: 'alert',
        tone: options.tone ?? 'info',
        confirmLabel: options.confirmLabel ?? 'OK',
        resolve: () => resolve(),
      };
      set((s) =>
        s.activeDialog
          ? { dialogQueue: [...s.dialogQueue, item] }
          : { activeDialog: item }
      );
    }),

  requestConfirm: (options) =>
    new Promise<boolean>((resolve) => {
      const item: QueuedDialog = {
        ...options,
        id: nextFeedbackId('dlg'),
        kind: 'confirm',
        tone: options.tone ?? 'warning',
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        resolve,
      };
      set((s) =>
        s.activeDialog
          ? { dialogQueue: [...s.dialogQueue, item] }
          : { activeDialog: item }
      );
    }),

  resolveActiveDialog: (accepted) => {
    const current = get().activeDialog;
    if (!current) return;
    const [, ...rest] = [current, ...get().dialogQueue];
    const [nextDialog, ...remainingQueue] = rest;
    set({
      activeDialog: nextDialog ?? null,
      dialogQueue: remainingQueue,
    });
    current.resolve(accepted);
  },

  pushToast: (options) => {
    const id = nextFeedbackId('toast');
    const toast: ToastItem = {
      id,
      title: options.title,
      message: options.message,
      tone: options.tone,
      durationMs: options.durationMs ?? 4500,
    };
    set((s) => ({
      toasts: [...s.toasts.slice(-3), toast],
    }));
    return id;
  },

  dismissToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),

  clearAllFeedback: () => {
    const current = get().activeDialog;
    const queue = get().dialogQueue;
    set({ activeDialog: null, dialogQueue: [], toasts: [] });
    if (current) current.resolve(false);
    for (const q of queue) q.resolve(false);
  },
}));
