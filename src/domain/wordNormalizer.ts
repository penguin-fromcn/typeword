export const UNICODE_DASHES = /[\u2010-\u2015\u2212]/g;
export const CURLY_APOSTROPHES = /[\u2018\u2019\u02BC]/g;

/**
 * 统一用户输入与词条答案的形态，不删除任何字母。
 * 全角转半角、弯引号转直引号、空白折叠、大小写归一，保留连字符与短语空格。
 */
export function normalizeWord(input: string): string {
  return input
    .normalize('NFKC')
    .replace(CURLY_APOSTROPHES, "'")
    .replace(UNICODE_DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function collapseDisplayWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function isNormalizedMatch(left: string, right: string): boolean {
  return normalizeWord(left) === normalizeWord(right);
}
