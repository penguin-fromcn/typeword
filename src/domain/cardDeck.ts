import type { Word } from './types';

export type CardDirection = 'next' | 'previous';
export type SelectionState = 'none' | 'partial' | 'all';

export function filterStudyWords(words: Word[]): Word[] {
  return words.filter((word) => word.studyEnabled);
}

export function selectionState(selected: number, total: number): SelectionState {
  if (total <= 0 || selected <= 0) return 'none';
  return selected >= total ? 'all' : 'partial';
}

export function stepCardIndex(
  currentIndex: number,
  length: number,
  direction: CardDirection,
): number {
  if (length <= 0) return -1;
  if (currentIndex < 0) return direction === 'next' ? 0 : length - 1;
  const delta = direction === 'next' ? 1 : -1;
  return (currentIndex + delta + length) % length;
}

export function groupMemberIds(words: Word[], groupId: string | null): string[] {
  return words.filter((word) => word.groupId === groupId).map((word) => word.id);
}

export function groupStudySelection(
  words: Word[],
  groupId: string | null,
): { selected: number; total: number; state: SelectionState } {
  const members = words.filter((word) => word.groupId === groupId);
  const selected = members.filter((word) => word.studyEnabled).length;
  return {
    selected,
    total: members.length,
    state: selectionState(selected, members.length),
  };
}
