import { useSyncExternalStore } from 'react';
import { speechService, type SpeechBackend } from '../services/speechService';

export function useSpeechAvailability(): boolean {
  return useSyncExternalStore(
    speechService.subscribe,
    speechService.getSnapshot,
    speechService.getSnapshot,
  );
}

export function useSpeechBackend(): SpeechBackend {
  return useSyncExternalStore(
    speechService.subscribe,
    speechService.getBackendSnapshot,
    speechService.getBackendSnapshot,
  );
}
