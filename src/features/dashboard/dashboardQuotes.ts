export interface DashboardQuote {
  lines: readonly [string, string];
}

export const DASHBOARD_QUOTES: readonly DashboardQuote[] = [
  { lines: ['把遗忘，', '交给曲线。'] },
  { lines: ['纸会泛黄，', '字仍发亮。'] },
  { lines: ['风翻过书页，', '时间记住你。'] },
  { lines: ['灯火可亲，', '字句可温。'] },
  { lines: ['一词一世界，', '一页一浮生。'] },
  { lines: ['落笔有声，', '遗忘无痕。'] },
  { lines: ['山河远阔，', '词语可渡。'] },
  { lines: ['晨光落纸上，', '词语开始生长。'] },
  { lines: ['光阴缓慢，', '字句锋利。'] },
  { lines: ['以字为舟，', '渡过遗忘。'] },
  { lines: ['读书是，', '与时间对坐。'] },
  { lines: ['纸上得来，', '心上生根。'] },
  { lines: ['岁月不居，', '笔墨常青。'] },
  { lines: ['每个新词，', '都是远方来信。'] },
  { lines: ['把陌生写下，', '把熟悉留住。'] },
  { lines: ['记忆缓慢，', '值得耐心。'] },
  { lines: ['反复是，', '最温柔的记忆术。'] },
  { lines: ['今日之字，', '来日之桥。'] },
  { lines: ['与词相对，', '如与灯坐。'] },
  { lines: ['词里有路，', '路通远方。'] },
  { lines: ['字句无声，', '心里点灯。'] },
  { lines: ['不积跬步，', '无以至千里。'] },
  { lines: ['纸上二三字，', '抵得过遗忘。'] },
  { lines: ['慢字入心，', '快词过眼。'] },
  { lines: ['眼过千遍，', '不如手过一遍。'] },
  { lines: ['记性靠不住，', '纸笔最诚实。'] },
  { lines: ['与其怨忘性，', '不如多写一行。'] },
  { lines: ['时间会拿走，', '笔会留下。'] },
  { lines: ['词是时间的锚，', '一字一句地沉。'] },
  { lines: ['把词读薄，', '把日子读厚。'] },
  { lines: ['灯下三个词，', '胜过半宿空想。'] },
  { lines: ['字写在纸上，', '路长在脚下。'] },
  { lines: ['每一次默写，', '都是和时间握手。'] },
  { lines: ['一字一呼吸，', '一页一日落。'] },
  { lines: ['词语是火种，', '复习是添柴。'] },
  { lines: ['慢读一遍，', '胜过快翻十页。'] },
  { lines: ['记忆如草木，', '需时时浇灌。'] },
  { lines: ['心有所往，', '词有所归。'] },
  { lines: ['旧纸新墨，', '皆不负人。'] },
  { lines: ['字在纸上，', '人在词里。'] },
  { lines: ['以词为灯，', '照见来路。'] },
  { lines: ['岁月有痕，', '字句有光。'] },
  { lines: ['愿你所读，', '终成你说。'] },
  { lines: ['日拱一卒，', '功不唐捐。'] },
];

export function randomQuoteIndex(random: () => number = Math.random): number {
  const count = DASHBOARD_QUOTES.length;
  const roll = Math.min(Math.max(random(), 0), 0.999_999);
  return Math.floor(roll * count);
}

export function nextQuoteIndex(
  currentIndex: number,
  random: () => number = Math.random,
): number {
  const count = DASHBOARD_QUOTES.length;
  if (count <= 1) return 0;
  const current = ((Math.trunc(currentIndex) % count) + count) % count;
  const roll = Math.min(Math.max(random(), 0), 0.999_999);
  return (current + 1 + Math.floor(roll * (count - 1))) % count;
}
