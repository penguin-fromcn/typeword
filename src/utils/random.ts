export { systemRandom } from '../domain/scheduler';
export type { RandomFn } from '../domain/scheduler';

export function pickRandom<T>(items: T[], random: () => number = Math.random): T | undefined {
  if (items.length === 0) return undefined;
  const value = Math.min(Math.max(random(), 0), 0.999999999);
  return items[Math.floor(value * items.length)];
}
