import { TauriRepository } from './tauriRepository';
import type { Repository } from './types';
import { WebRepository } from './webRepository';

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const repository: Repository = hasTauriRuntime()
  ? new TauriRepository()
  : new WebRepository();

export const isDesktopRuntime = repository.kind === 'tauri';
