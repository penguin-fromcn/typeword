import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface UiState {
  toasts: ToastItem[];
  bootWarning: string | null;
  databasePath: string;
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
  setBootWarning: (message: string | null) => void;
  setDatabasePath: (path: string) => void;
}

let counter = 0;

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  bootWarning: null,
  databasePath: '',

  pushToast: (message, tone = 'info') => {
    counter += 1;
    const id = counter;
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }] }));
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },

  setBootWarning: (message) => set({ bootWarning: message }),
  setDatabasePath: (path) => set({ databasePath: path }),
}));
