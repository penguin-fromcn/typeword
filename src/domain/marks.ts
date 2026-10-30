import type { WordMark } from './types';

export interface MarkOption {
  value: Exclude<WordMark, 'none'>;
  label: string;
  icon: 'star' | 'bookmark' | 'check';
}

export const MARK_OPTIONS: MarkOption[] = [
  { value: 'starred', label: '收藏', icon: 'star' },
  { value: 'later', label: '稍后再看', icon: 'bookmark' },
  { value: 'mastered', label: '已掌握', icon: 'check' },
];

export const MARK_LABELS: Record<WordMark, string> = {
  none: '未标记',
  starred: '收藏',
  later: '稍后再看',
  mastered: '已掌握',
};
