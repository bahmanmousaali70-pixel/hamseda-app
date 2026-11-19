const ZWNJ = '\u200c';
export const PERSIAN_LETTERS = 'آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیئ';
const KEPT_PUNCT = '.،؛؟!:';
const ALLOWED = new Set([...PERSIAN_LETTERS, ZWNJ, ...KEPT_PUNCT, ' ']);

const CHAR_MAP: Record<string, string> = {
  ي: 'ی',
  ى: 'ی',
  ۍ: 'ی',
  ې: 'ی',
  ك: 'ک',
  ڪ: 'ک',
  ة: 'ه',
  ۀ: 'ه',
  أ: 'ا',
  إ: 'ا',
  ٱ: 'ا',
  ٲ: 'ا',
  ٳ: 'ا',
  ؤ: 'و',
  ۂ: 'ه',
  ۃ: 'ه',
  ء: '',
  'ـ': '',
};

const DIACRITICS = /[\u064b-\u0655\u0670\u06d6-\u06ed\u0656-\u065f]/g;
const INVISIBLES = /[\u200b\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff\u00ad]/g;

const PUNCT_MAP: Record<string, string> = {
  ',': '،',
  '?': '؟',
  ';': '؛',
  '٬': '',
  '٫': '.',
  '…': '.',
  '»': ' ',
  '«': ' ',
  '“': ' ',
  '”': ' ',
  '‘': ' ',
  '’': ' ',
  '"': ' ',
  "'": ' ',
  '`': ' ',
  '(': ' ',
  ')': ' ',
  '[': ' ',
  ']': ' ',
  '{': ' ',
  '}': ' ',
  '–': ' ',
  '—': ' ',
  '−': ' ',
  '-': ' ',
  '‐': ' ',
  '/': ' ',
  '\\': ' ',
  '*': ' ',
  _: ' ',
  '|': ' ',
  '×': ' ',
  '=': ' ',
  '+': ' ',
};

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES: [bigint, string][] = [
  [10n ** 12n, 'تریلیون'],
  [10n ** 9n, 'میلیارد'],
  [10n ** 6n, 'میلیون'],
  [10n ** 3n, 'هزار'],
];
const FRACTION_UNITS: Record<number, string> = {1: 'دهم', 2: 'صدم', 3: 'هزارم'};
const JOIN = ' و ';

function underThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(HUNDREDS[Math.floor(n / 100)]);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]);
    n %= 10;
  }
  if (n >= 10 && n < 20) {
    parts.push(TEENS[n - 10]);
    n = 0;
  }
  if (n > 0) parts.push(ONES[n]);
  return parts.join(JOIN);
}

export function numberToWords(input: bigint | number | string): string {
  let n = BigInt(input);
  if (n === 0n) return 'صفر';
  const parts: string[] = [];
  for (const [value, name] of SCALES) {
    if (n >= value) {
      const count = n / value;
      n %= value;
      const head = count === 1n && value === 1000n ? '' : underThousand(Number(count)) + ' ';
      parts.push((head + name).trim());
    }
  }
  if (n > 0n) parts.push(underThousand(Number(n)));
  return parts.join(JOIN);
}

const oneByOne = (d: string): string =>
  [...d].map((c) => (c === '0' ? 'صفر' : ONES[Number(c)])).join(' ');

function numberToken(_: string, whole: string, frac?: string): string {
  if (whole.length > 12 || (whole.startsWith('0') && whole.length > 1)) {
    return ' ' + oneByOne(whole) + (frac ? ' ' + oneByOne(frac) : '') + ' ';
  }
  const cleanWhole = whole.replace(/^0+/, '') || '0';
  let words = numberToWords(cleanWhole);
  if (frac) {
    const cleanFrac = frac.replace(/0+$/, '');
    if (!cleanFrac) return ' ' + words + ' ';
    const unit = FRACTION_UNITS[cleanFrac.length];
    words += unit
      ? ' ممیز ' + numberToWords(cleanFrac) + ' ' + unit
      : ' ممیز ' + oneByOne(cleanFrac);
  }
  return ' ' + words + ' ';
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function normalizePersianForPocket(raw: string): string {
  let text = raw.normalize('NFC').replace(INVISIBLES, '').replace(DIACRITICS, '');
  text = [...text].map((c) => (c in CHAR_MAP ? CHAR_MAP[c] : c)).join('');
  text = text
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  text = text.replace(/٬/g, '').replace(/٫/g, '.');
  text = text.replace(/[٪%]/g, ' درصد ');
  text = text.replace(/(?<=\d),(?=\d\d\d\b)/g, '');
  text = text.replace(/(\d+)(?:[.](\d+))?/g, numberToken);
  text = [...text].map((c) => (c in PUNCT_MAP ? PUNCT_MAP[c] : c)).join('');
  text = [...text].map((c) => (ALLOWED.has(c) ? c : ' ')).join('');
  text = text.replace(/\u200c+/g, ZWNJ);
  text = text.replace(/\s*\u200c\s*/g, (m) => (m.includes(' ') ? ' ' : ZWNJ));
  const L = `[${PERSIAN_LETTERS}]`;
  text = text.replace(new RegExp(`(?<!${L})\u200c|\u200c(?!${L})`, 'g'), '');
  const P = `[${esc(KEPT_PUNCT)}]`;
  text = text.replace(new RegExp(`\\s+(${P})`, 'g'), '$1');
  text = text.replace(new RegExp(`(${P})\\1+`, 'g'), '$1');
  text = text.replace(/\s+/g, ' ').trim();
  return text.replace(new RegExp(`^[${esc(KEPT_PUNCT)} ]+`), '');
}

export const isPhonemic = (t: string): boolean =>
  ![...t].some((c) => PERSIAN_LETTERS.includes(c)) && /[A-Za-z]/.test(t);

export interface PersianClause {
  text: string;
  end: 'sentence' | 'clause';
}

export function splitPersian(text: string): PersianClause[] {
  const out: PersianClause[] = [];
  for (const s of text.split(/(?<=[.!؟])\s+/)) {
    const clauses = s.split(/(?<=[،؛:])\s+/).filter((c) => c.trim());
    clauses.forEach((c, i) =>
      out.push({
        text: c.trim(),
        end: i === clauses.length - 1 ? 'sentence' : 'clause',
      })
    );
  }
  return out.filter((c) => /[^\s.!؟،؛:]/.test(c.text));
}

export const g2pInput = (clause: string): string =>
  clause.replace(/[.!؟?،؛:]/g, ' ').replace(/\s+/g, ' ').trim();

const TO_PH: Record<string, string> = {'/': 'a', a: 'A', '@': '?', $: 'S', c: 'C'};
export const toPhonemes = (raw: string): string =>
  [...raw]
    .map((c) => TO_PH[c] ?? c)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

export const stripEzafe = (t: string): string => t.replace(/1/g, '');

export class PocketBPE {
  private readonly map: Map<string, {id: number; score: number}>;
  private readonly cache: Map<string, number[]>;

  constructor(pieces: [string, number, number][]) {
    this.map = new Map();
    pieces.forEach(([p, score, type], id) => {
      if (type === 1) this.map.set(p, {id, score});
    });
    this.cache = new Map();
  }

  encodeWord(w: string): number[] {
    const syms = [...w];
    for (;;) {
      let best = -1;
      let bestScore = -Infinity;
      for (let i = 0; i < syms.length - 1; i++) {
        const entry = this.map.get(syms[i] + syms[i + 1]);
        if (entry && entry.score > bestScore) {
          best = i;
          bestScore = entry.score;
        }
      }
      if (best < 0) break;
      syms.splice(best, 2, syms[best] + syms[best + 1]);
    }
    return syms.map((s) => this.map.get(s)?.id ?? 0);
  }

  encode(text: string): number[] {
    const clean = text.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const ids: number[] = [];
    for (const w of clean.split(' ')) {
      const key = '▁' + w;
      let r = this.cache.get(key);
      if (!r) {
        r = this.encodeWord(key);
        this.cache.set(key, r);
      }
      ids.push(...r);
    }
    return ids;
  }
}

const bindsToNext = (w: string): boolean => w.endsWith('1') || w === 'va' || w === 'ke';

function pack(
  words: string[],
  count: (s: string) => number,
  fits: (s: string) => boolean,
  nChunks: number,
  target: number
): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = (cur + ' ' + w).trim();
    const owed = out.length < nChunks - 1;
    const lastWord = cur ? cur.split(' ').at(-1) ?? '' : '';
    const bound = Boolean(cur) && bindsToNext(lastWord);
    if (cur && !bound && (!fits(trial) || (owed && count(trial) > target))) {
      out.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function packWords(piece: string, count: (s: string) => number, maxTokens: number): string[] {
  const fits = (s: string) => count(s) <= maxTokens;
  if (fits(piece)) return [piece];
  const words = piece.split(' ');
  const total = count(piece);
  let n = Math.max(1, Math.ceil(total / maxTokens));
  let chunks: string[] = [piece];
  for (let k = 0; k < 4; k++) {
    chunks = pack(words, count, fits, n, Math.ceil(total / n));
    if (chunks.length <= n) return chunks;
    n = chunks.length;
  }
  return chunks;
}

export interface PlannedChunk {
  text: string;
  end: 'sentence' | 'clause' | 'none';
}

export function planChunks(
  clauses: {ph: string; end: 'sentence' | 'clause'}[],
  count: (s: string) => number,
  maxTokens = 18,
  minTokens = 8
): PlannedChunk[] {
  const fits = (s: string) => count(s) <= maxTokens;
  const parts: PlannedChunk[] = [];
  for (const c of clauses) {
    const ps = packWords(c.ph, count, maxTokens);
    ps.forEach((p, i) =>
      parts.push({text: p, end: i === ps.length - 1 ? c.end : 'none'})
    );
  }
  const merged: PlannedChunk[] = [];
  for (const p of parts) {
    const prev = merged.at(-1);
    const keepApart = prev && prev.end !== 'none' && count(prev.text) >= minTokens;
    if (prev && !keepApart && fits(prev.text + ' ' + p.text)) {
      prev.text += ' ' + p.text;
      prev.end = p.end;
    } else {
      merged.push({...p});
    }
  }
  for (let i = merged.length - 1; i > 0; i--) {
    if (count(merged[i].text) >= minTokens || merged[i - 1].end !== 'none') continue;
    while (count(merged[i].text) < minTokens) {
      const ws = merged[i - 1].text.split(' ');
      if (ws.length < 2 || count(ws.slice(0, -1).join(' ')) < minTokens) break;
      const penult = ws.at(-2) ?? '';
      if (bindsToNext(penult)) break;
      merged[i - 1].text = ws.slice(0, -1).join(' ');
      merged[i].text = (ws.at(-1) ?? '') + ' ' + merged[i].text;
    }
  }
  return merged;
}

export function g2pWindows(text: string, maxWords = 30): string[] {
  const ws = text.split(' ').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < ws.length; i += maxWords) {
    out.push(ws.slice(i, i + maxWords).join(' '));
  }
  return out;
}
