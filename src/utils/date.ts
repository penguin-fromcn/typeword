import { DAY_MS } from '../domain/constants';

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '未记录';
  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatDate(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp));
}

export function formatInterval(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return '现在';
  const minutes = Math.round(days * 24 * 60);
  if (minutes < 60) return `${minutes} 分钟`;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} 小时`;
  if (days < 30) {
    const rounded = Math.round(days * 10) / 10;
    return `${rounded} 天`;
  }
  return `${Math.round(days / 30)} 个月`;
}

export function formatNextReview(timestamp: number, now: number): string {
  const diff = timestamp - now;
  if (diff <= 0) {
    const overdue = Math.abs(diff);
    if (overdue < 60_000) return '现在';
    if (overdue < 3_600_000) return `已到期 ${Math.round(overdue / 60_000)} 分钟`;
    if (overdue < DAY_MS) return `已到期 ${Math.round(overdue / 3_600_000)} 小时`;
    return `已到期 ${Math.round(overdue / DAY_MS)} 天`;
  }
  return `约 ${formatInterval(diff / DAY_MS)}后`;
}

export function formatWeight(value: number): string {
  return value.toFixed(2);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatStreak(count: number): string {
  return count > 0 ? `${count} 连击` : '尚未连击';
}
