import 'dotenv/config';
import {execFile} from 'child_process';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {Readable} from 'stream';
import {GoogleGenAI, ThinkingLevel, Type} from '@google/genai';
import {MsEdgeTTS, OUTPUT_FORMAT} from 'msedge-tts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({limit: '2mb'}));
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getTtsAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getAlphaAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1alpha',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  res.json({ok: true, aiReady: hasKey});
});

app.post('/api/morning-message', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error: 'سرویس هوش مصنوعی در دسترس نیست. حالت آفلاین فعال است.',
      offlineFallback: true,
    });
    return;
  }

  try {
    const dayPart = typeof req.body?.dayPart === 'string' ? req.body.dayPart : 'morning';
    const mood = typeof req.body?.mood === 'string' ? req.body.mood : 'پرانرژی و امیدوار';
    const goalsSummary = typeof req.body?.goalsSummary === 'string' ? req.body.goalsSummary : '';
    const recipient = typeof req.body?.recipient === 'string' ? req.body.recipient : 'من و زری';

    const prompt = `یک پیام صمیمی، انگیزشی، ادبی و بسیار دلنشین به زبان فارسی روان و امروزی بنویس برای «${recipient}».
زمان روز: ${dayPart === 'morning' ? 'صبح دل‌انگیز' : dayPart === 'midday' ? 'میانه روز و تجدید انرژی' : 'شامگاه و آرامش شکرگذاری'}
حال و هوای فعلی: ${mood}
${goalsSummary ? `برخی اهداف امروز: ${goalsSummary}` : ''}
پیام باید گرم، واقعی، غیرکلیشه‌ای، پر از امید و عشق به زندگی مشترک و پیشرفت هدفمند باشد.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'تو نویسنده و مربی زندگی فارسی‌زبان هستی. پاسخ را فقط با ساختار JSON خواسته‌شده برگردان و از جملات کوتاه، روان و قابل خواندن با صدای بلند استفاده کن.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {type: Type.STRING, description: 'تیتر کوتاه و الهام‌بخش فارسی'},
            message: {type: Type.STRING, description: 'متن پیام صبحگاهی یا انرژی‌بخش در ۲ تا ۳ جمله روان'},
            affirmation: {type: Type.STRING, description: 'یک جمله تاکیدی مثبت و کوتاه برای تکرار امروز'},
            energyTip: {type: Type.STRING, description: 'یک اقدام عملی کوچک برای بالا بردن انرژی امروز'},
          },
          required: ['title', 'message', 'affirmation', 'energyTip'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Morning message generation failed:', err);
    res.status(500).json({
      error: 'خطا در دریافت پیام هوشمند. از پیام‌های کتابخانه آفلاین استفاده می‌شود.',
    });
  }
});

interface CachedAudioEntry {
  base64: string;
  mimeType: 'audio/wav' | 'audio/mpeg';
}

const ttsServerCache = new Map<string, CachedAudioEntry>();
const MAX_SERVER_TTS_CACHE = 160;
const TTS_DISK_CACHE_DIR = '/tmp/rmz_tts_cache';
const ttsModelCooldownUntil = new Map<string, number>();
const textModelCooldownUntil = new Map<string, number>();

try {
  fs.mkdirSync(TTS_DISK_CACHE_DIR, {recursive: true});
} catch {
  // ignore if tmp dir unavailable
}

function getCacheFilePath(cacheKey: string, ext: 'wav' | 'mp3'): string {
  const hash = crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 32);
  return path.join(TTS_DISK_CACHE_DIR, `${hash}.${ext}`);
}

function readCachedAudio(cacheKey: string): CachedAudioEntry | null {
  const mem = ttsServerCache.get(cacheKey);
  if (mem) return mem;
  try {
    const wavPath = getCacheFilePath(cacheKey, 'wav');
    if (fs.existsSync(wavPath)) {
      const buf = fs.readFileSync(wavPath);
      if (buf.length > 44) {
        const entry: CachedAudioEntry = {base64: buf.toString('base64'), mimeType: 'audio/wav'};
        ttsServerCache.set(cacheKey, entry);
        return entry;
      }
    }
    const mp3Path = getCacheFilePath(cacheKey, 'mp3');
    if (fs.existsSync(mp3Path)) {
      const buf = fs.readFileSync(mp3Path);
      if (buf.length > 100) {
        const entry: CachedAudioEntry = {base64: buf.toString('base64'), mimeType: 'audio/mpeg'};
        ttsServerCache.set(cacheKey, entry);
        return entry;
      }
    }
  } catch {
    // ignore disk read errors
  }
  return null;
}

function writeCachedAudio(cacheKey: string, entry: CachedAudioEntry): void {
  if (ttsServerCache.size >= MAX_SERVER_TTS_CACHE) {
    const oldestKey = ttsServerCache.keys().next().value;
    if (oldestKey) ttsServerCache.delete(oldestKey);
  }
  ttsServerCache.set(cacheKey, entry);
  try {
    const ext = entry.mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
    fs.writeFileSync(getCacheFilePath(cacheKey, ext), Buffer.from(entry.base64, 'base64'));
  } catch {
    // ignore disk write errors
  }
}

function escapeXmlForSsml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const FINGLISH_WORD_MAP: Record<string, string> = {
  bahman: 'بَهمن',
  mousaali: 'موساعلی',
  musaali: 'موساعلی',
  mousa: 'موسی',
  musa: 'موسی',
  zari: 'زَری',
  zahra: 'زهرا',
  mehdi: 'مهدی',
  mohammad: 'محمد',
  muhammad: 'محمد',
  ali: 'علی',
  reza: 'رضا',
  hossein: 'حسین',
  hasan: 'حسن',
  sara: 'سارا',
  maryam: 'مریم',
  mina: 'مینا',
  neda: 'ندا',
  amir: 'امیر',
  saeed: 'سعید',
  omid: 'امید',
  navid: 'نوید',
  pouya: 'پویا',
  arash: 'آرش',
  radin: 'رادین',
  negin: 'نگین',
  nasim: 'نسیم',
  mom: 'مامان',
  maman: 'مامان',
  baba: 'بابا',
  dad: 'پدر',
  khanoom: 'خانوم',
  khanom: 'خانم',
  agha: 'آقا',
  jan: 'جان',
  joon: 'جون',
  jun: 'جون',
  salam: 'سَلام',
  slm: 'سَلام',
  salm: 'سَلام',
  khobi: 'خوبی',
  khoobi: 'خوبی',
  khubi: 'خوبی',
  chetori: 'چطوری',
  chetor: 'چطور',
  chetory: 'چطوری',
  merci: 'مِرسی',
  mersi: 'مِرسی',
  mersy: 'مِرسی',
  mamnoon: 'ممنون',
  mamnun: 'ممنون',
  mamnon: 'ممنون',
  fadat: 'فدات',
  fedat: 'فدات',
  azizam: 'عزیزم',
  aziz: 'عزیز',
  eshgham: 'عشقم',
  delam: 'دلم',
  ghorbonet: 'قربونت',
  ghorbunet: 'قربونت',
  khabar: 'خبر',
  chiz: 'چیز',
  chizi: 'چیزی',
  man: 'من',
  to: 'تو',
  shoma: 'شما',
  beman: 'به من',
  behem: 'بهم',
  bezang: 'بزنگ',
  zang: 'زنگ',
  bezan: 'بزن',
  omadam: 'اومدم',
  oomadam: 'اومدم',
  umadam: 'اومدم',
  miram: 'میرم',
  miam: 'میام',
  khone: 'خونه',
  khoone: 'خونه',
  khune: 'خونه',
  kar: 'کار',
  kare: 'کارِ',
  sob: 'صبح',
  sobh: 'صبح',
  shab: 'شب',
  bekheir: 'بخیر',
  bekheyr: 'بخیر',
  khosh: 'خوش',
  are: 'آره',
  bale: 'بله',
  na: 'نه',
  kheili: 'خیلی',
  kheyli: 'خیلی',
  babakhshid: 'ببخشید',
  bebakhshid: 'ببخشید',
  lotfan: 'لطفاً',
  mokhles: 'مخلص',
  dost: 'دوست',
  doost: 'دوست',
  daram: 'دارم',
  dooset: 'دوستت',
  doset: 'دوستت',
  ok: 'اوکِی',
  okay: 'اوکِی',
  hello: 'هلو',
  hi: 'های',
  hey: 'هِی',
  bye: 'بای',
  good: 'گود',
  morning: 'مورنینگ',
  night: 'نایت',
  please: 'پلیز',
  thanks: 'تَنکس',
  thank: 'تَنک',
  sorry: 'ساری',
  love: 'لاو',
  you: 'یو',
  call: 'کال',
  calling: 'کالینگ',
  incoming: 'اینکامینگ',
  from: 'فرام',
  design: 'دیزاین',
  tech: 'تک',
  support: 'ساپورت',
  manager: 'منیجر',
  office: 'آفیس',
  work: 'وُرک',
  home: 'هوم',
  team: 'تیم',
  project: 'پروژه',
  dr: 'دکتر',
  mr: 'آقای',
  mrs: 'خانم',
  ms: 'خانم',
  sms: 'اس‌ام‌اس',
  rcs: 'آر‌سی‌اس',
  vpn: 'وی‌پی‌ان',
  wifi: 'وای‌فای',
};

function transliterateSingleLatinWord(rawWord: string): string {
  const clean = rawWord.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  if (!clean) return rawWord;
  const lower = clean.toLowerCase();
  if (FINGLISH_WORD_MAP[lower]) {
    return FINGLISH_WORD_MAP[lower];
  }

  let s = lower;
  s = s.replace(/tion\b/g, 'شِن');
  s = s.replace(/sion\b/g, 'ژِن');
  s = s.replace(/sh/g, 'ش');
  s = s.replace(/ch/g, 'چ');
  s = s.replace(/kh/g, 'خ');
  s = s.replace(/gh/g, 'ق');
  s = s.replace(/zh/g, 'ژ');
  s = s.replace(/ph/g, 'ف');
  s = s.replace(/th/g, 'ت');
  s = s.replace(/ck/g, 'ک');
  s = s.replace(/qu/g, 'کو');
  s = s.replace(/oo|ou/g, 'او');
  s = s.replace(/ee|ea/g, 'ای');
  s = s.replace(/ai|ay|ey|ei/g, 'اِی');
  s = s.replace(/au|aw/g, 'آ');

  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const isFirst = i === 0;
    const isLast = i === s.length - 1;
    if (/[\u0600-\u06FF]/.test(ch)) {
      out += ch;
      continue;
    }
    switch (ch) {
      case 'a':
        out += isFirst ? 'آ' : isLast ? 'ا' : 'اَ';
        break;
      case 'b':
        out += 'ب';
        break;
      case 'c':
        out += s[i + 1] === 'e' || s[i + 1] === 'i' || s[i + 1] === 'y' ? 'س' : 'ک';
        break;
      case 'd':
        out += 'د';
        break;
      case 'e':
        out += isFirst ? 'اِ' : isLast ? 'ه' : 'ِ';
        break;
      case 'f':
        out += 'ف';
        break;
      case 'g':
        out += 'گ';
        break;
      case 'h':
        out += 'ه';
        break;
      case 'i':
        out += isFirst ? 'ای' : 'ی';
        break;
      case 'j':
        out += 'ج';
        break;
      case 'k':
        out += 'ک';
        break;
      case 'l':
        out += 'ل';
        break;
      case 'm':
        out += 'م';
        break;
      case 'n':
        out += 'ن';
        break;
      case 'o':
        out += isFirst ? 'اُ' : 'و';
        break;
      case 'p':
        out += 'پ';
        break;
      case 'q':
        out += 'ق';
        break;
      case 'r':
        out += 'ر';
        break;
      case 's':
        out += 'س';
        break;
      case 't':
        out += 'ت';
        break;
      case 'u':
        out += isFirst ? 'او' : 'و';
        break;
      case 'v':
        out += 'و';
        break;
      case 'w':
        out += 'و';
        break;
      case 'x':
        out += 'کس';
        break;
      case 'y':
        out += isFirst ? 'ی' : 'ی';
        break;
      case 'z':
        out += 'ز';
        break;
      default:
        break;
    }
  }
  return out || rawWord;
}

function normalizeFinglishAndEnglishToPersian(input: string): string {
  if (!/[A-Za-z]/.test(input)) return input;
  return input.replace(/[A-Za-z]+(?:['’.-][A-Za-z]+)*/g, (token) => {
    const parts = token.split(/(['’.-])/);
    return parts
      .map((part) => (/^[A-Za-z]+$/.test(part) ? transliterateSingleLatinWord(part) : part === '.' ? ' ' : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  });
}

const latinPhoneticCache = new Map<string, string>();

async function transliterateLatinToPersianPhonetic(input: string, ai: GoogleGenAI | null): Promise<string> {
  if (!/[A-Za-z]{2,}/.test(input)) {
    return input;
  }
  const cached = latinPhoneticCache.get(input);
  if (cached) return cached;

  const heuristic = normalizeFinglishAndEnglishToPersian(input);
  if (!ai || Date.now() < (textModelCooldownUntil.get('gemini-4-hydrogen') ?? 0)) {
    return heuristic;
  }

  try {
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2800));
    const genPromise = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `متن زیر ترکیبی از فارسی و نام‌ها یا پیامک‌های فینگلیش/انگلیسی است.
فقط بخش‌های حروف انگلیسی/فینگلیش را به شکل خوانا و دقیق به خط فارسی آوایی (با اعراب کوتاه در صورت نیاز مثل بَهمن موساعلی، سَلام، زَری، دیزاین، کال) بازنویسی کن تا یک گوینده فارسی‌زبان بدون مکث و اشتباه بخواند.
کلمات فارسی موجود، علائم و معنی جمله را هیچ تغییری نده و هیچ توضیح اضافه‌ای ننویس؛ فقط متن آماده خواندن را برگردان:

${input}`,
      config: {
        thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
      },
    });

    const resp = await Promise.race([genPromise, timeoutPromise]);
    const rawOut = resp && typeof resp === 'object' && 'text' in resp ? (resp.text ?? '').trim() : '';
    const cleaned = rawOut
      .replace(/^["«']+|["»']+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned && !/[A-Za-z]{2,}/.test(cleaned) && cleaned.length <= input.length * 4 + 40) {
      if (latinPhoneticCache.size >= 300) {
        const first = latinPhoneticCache.keys().next().value;
        if (first) latinPhoneticCache.delete(first);
      }
      latinPhoneticCache.set(input, cleaned);
      return cleaned;
    }
  } catch {
    // Fall back silently to fast deterministic Finglish transliteration
  }

  return heuristic;
}

async function synthesizeEdgePersianMp3(text: string, voiceName: string): Promise<string | null> {
  const voiceProfiles: Record<string, {edgeVoice: string; rate: string; pitch: string}> = {
    Kore: {edgeVoice: 'fa-IR-DilaraNeural', rate: '+0%', pitch: '+2Hz'},
    Zephyr: {edgeVoice: 'fa-IR-DilaraNeural', rate: '-6%', pitch: '+0Hz'},
    Puck: {edgeVoice: 'fa-IR-FaridNeural', rate: '+6%', pitch: '+12Hz'},
    Charon: {edgeVoice: 'fa-IR-FaridNeural', rate: '-2%', pitch: '-6Hz'},
    Fenrir: {edgeVoice: 'fa-IR-FaridNeural', rate: '+3%', pitch: '+0Hz'},
  };
  const profile = voiceProfiles[voiceName] ?? voiceProfiles.Kore;
  const tts = new MsEdgeTTS({connectionTimeoutMs: 7000, synthesisTimeoutMs: 11000});

  try {
    await tts.setMetadata(profile.edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const {audioStream} = tts.toStream(escapeXmlForSsml(text), {
      rate: profile.rate,
      pitch: profile.pitch,
    });

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('edge-tts timeout')), 10000);
      audioStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      audioStream.on('end', () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const buf = Buffer.concat(chunks);
    if (buf.length < 100) return null;
    return buf.toString('base64');
  } catch (err) {
    console.warn('Edge neural Persian TTS fallback error:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    try {
      tts.close();
    } catch {
      // ignore close errors
    }
  }
}

function parseSampleRateFromMimeType(mimeType?: string): number {
  let sampleRate = 24000;
  const rateMatch = mimeType?.match(/rate=(\d+)/i);
  if (rateMatch) {
    const parsed = Number(rateMatch[1]);
    if (Number.isFinite(parsed) && parsed >= 8000 && parsed <= 48000) {
      sampleRate = parsed;
    }
  }
  return sampleRate;
}

function buildWavBufferFromRawPcm(rawPcm: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + rawPcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(rawPcm.length, 40);
  return Buffer.concat([header, rawPcm]);
}

function ensureWavBase64(base64Data: string, mimeType?: string): string {
  const raw = Buffer.from(base64Data, 'base64');
  if (raw.length >= 12 && raw.subarray(0, 4).toString('ascii') === 'RIFF') {
    return base64Data;
  }
  return buildWavBufferFromRawPcm(raw, parseSampleRateFromMimeType(mimeType)).toString('base64');
}

function stripRiffHeaderIfPresent(buf: Buffer): Buffer {
  if (buf.length > 44 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE') {
    return Buffer.from(buf.subarray(44));
  }
  return buf;
}

const VOICE_GENDER_HINT: Record<string, string> = {
  Kore: 'Adult female speaker. Warm, affectionate, deeply natural everyday Tehran Persian female voice with smooth fluent phrasing.',
  Zephyr: 'Adult female speaker. Soft, calm, expressive, soothing Tehran Persian female voice with natural human warmth.',
  Puck: 'Young adult male speaker. Warm, cheerful, energetic, crisp everyday Tehran Persian voice.',
  Charon: 'Adult male speaker. Deep baritone, warm, steady, articulate Tehran Persian male voice.',
  Fenrir: 'Adult male speaker. Resonant, confident, clear, natural Tehran Persian male voice.',
};

interface TtsCandidate {
  client: GoogleGenAI;
  model: string;
  is25: boolean;
  withMetadata: boolean;
}

function buildTtsCandidates(baseAi: GoogleGenAI | null, betaAi: GoogleGenAI | null, alphaAi: GoogleGenAI | null): TtsCandidate[] {
  const candidates: TtsCandidate[] = [];
  const now = Date.now();
  const primaryClient = betaAi ?? baseAi;
  const fallbackClient = betaAi ?? baseAi;

  if (primaryClient && now >= (ttsModelCooldownUntil.get('gemini-3.8-flash-lite-tts') ?? 0)) {
    candidates.push({client: primaryClient, model: 'gemini-3.8-flash-lite-tts', is25: false, withMetadata: true});
    if (alphaAi && alphaAi !== primaryClient) {
      candidates.push({client: alphaAi, model: 'gemini-3.8-flash-lite-tts', is25: false, withMetadata: true});
    }
  }
  if (now >= (ttsModelCooldownUntil.get('gemini-2.5-flash-preview-tts') ?? 0) && fallbackClient) {
    candidates.push({client: fallbackClient, model: 'gemini-2.5-flash-preview-tts', is25: true, withMetadata: false});
  }
  if (alphaAi && now >= (ttsModelCooldownUntil.get('gemini-3.8-flash-tts') ?? 0)) {
    candidates.push({client: alphaAi, model: 'gemini-3.8-flash-tts', is25: false, withMetadata: true});
  }
  return candidates;
}

function recordTtsCandidateError(cand: TtsCandidate, voiceName: string, err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const isExpectedFallback =
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('NOT_FOUND');
  if (isExpectedFallback) {
    console.info(`TTS fallback from ${cand.model} (${voiceName}) to next engine.`);
  } else {
    console.warn(`TTS on ${cand.model} (${voiceName}) failed:`, msg.slice(0, 180));
  }
  if (
    cand.model.startsWith('gemini-3.8') &&
    (msg.includes('Cannot find field') || msg.includes('INVALID_ARGUMENT') || msg.includes('NOT_FOUND'))
  ) {
    ttsModelCooldownUntil.set(cand.model, Date.now() + 30 * 60 * 1000);
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
    const isDailyLimit = msg.includes('PerDay') || msg.includes('per day');
    ttsModelCooldownUntil.set(cand.model, Date.now() + (isDailyLimit ? 10 * 60 * 1000 : 30 * 1000));
    return true;
  }
  return false;
}

let ttsQueueTail: Promise<void> = Promise.resolve();
let lastTtsCallAt = 0;

function runWithTtsPacing<T>(task: () => Promise<T>): Promise<T> {
  const scheduled = ttsQueueTail.then(async () => {
    const gap = Date.now() - lastTtsCallAt;
    if (gap < 250) {
      await new Promise((r) => setTimeout(r, 250 - gap));
    }
    lastTtsCallAt = Date.now();
    return task();
  });
  ttsQueueTail = scheduled.then(
    () => undefined,
    () => undefined
  );
  return scheduled;
}

app.post('/api/tts', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({error: 'متن برای تبدیل به گفتار ارسال نشده است.'});
    return;
  }
  if (text.length > 1500) {
    res.status(400).json({error: 'طول متن نباید بیشتر از ۱۵۰۰ کاراکتر باشد.'});
    return;
  }

  const allowedVoices = ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'];
  const voiceName = allowedVoices.includes(req.body?.voiceName) ? req.body.voiceName : 'Kore';
  const forceRefresh = Boolean(req.body?.forceRefresh);
  // v4_gemini cache strictly stores ONLY genuine styled Gemini WAV audio — NEVER robotic Edge MP3 fallbacks.
  const cacheKey = `v4_gemini::${voiceName}::${text}`;
  if (!forceRefresh) {
    const cached = readCachedAudio(cacheKey);
    if (cached && cached.mimeType === 'audio/wav') {
      res.json({
        audioBase64: cached.base64,
        mimeType: cached.mimeType,
        voiceName,
        cached: true,
        provider: 'gemini',
      });
      return;
    }
  }

  const baseAi = getAiClient();
  const betaAi = getTtsAiClient();
  const alphaAi = getAlphaAiClient();
  const speechText = /[A-Za-z]{2,}/.test(text)
    ? await transliterateLatinToPersianPhonetic(text, baseAi ?? betaAi)
    : text;

  const customStyle = typeof req.body?.style === 'string' && req.body.style.trim() ? req.body.style.trim() : '';
  const style = `${VOICE_GENDER_HINT[voiceName]} ${customStyle}`.trim();

  try {
    let wavBase64: string | undefined;
    let modelUsed: string | undefined;
    let sawQuotaError = false;

    if (baseAi || betaAi || alphaAi) {
      const attemptSynthesis = async (): Promise<{
        wavBase64?: string;
        modelUsed?: string;
        sawQuotaError: boolean;
      }> => {
        const candidates = buildTtsCandidates(baseAi, betaAi, alphaAi);

        let foundWav: string | undefined;
        let usedModel: string | undefined;
        let hitQuota = false;

        for (const cand of candidates) {
          if (Date.now() < (ttsModelCooldownUntil.get(cand.model) ?? 0)) {
            continue;
          }
          try {
            const contents = cand.is25
              ? [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: `Read aloud ONLY this exact transcript in warm, fluent, natural Tehran Persian (${style}). Do not add extra words:\n\n${speechText}`,
                      },
                    ],
                  },
                ]
              : cand.withMetadata
                ? [{role: 'user', parts: [{text: speechText, speechMetadata: {style}}]}]
                : [{role: 'user', parts: [{text: speechText}]}];

            const response = await cand.client.models.generateContent({
              model: cand.model,
              contents,
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {voiceName},
                  },
                },
              },
            });
            const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (inline?.data) {
              foundWav = ensureWavBase64(inline.data, inline.mimeType);
              usedModel = cand.withMetadata ? `${cand.model}+meta` : cand.model;
              break;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (cand.withMetadata && (msg.includes('speechMetadata') || msg.includes('Cannot find field'))) {
              continue;
            }
            if (recordTtsCandidateError(cand, voiceName, err)) {
              hitQuota = true;
            }
          }
        }
        return {wavBase64: foundWav, modelUsed: usedModel, sawQuotaError: hitQuota};
      };

      const firstRes = await runWithTtsPacing(attemptSynthesis);
      wavBase64 = firstRes.wavBase64;
      modelUsed = firstRes.modelUsed;
      sawQuotaError = firstRes.sawQuotaError;
    }

    if (wavBase64) {
      writeCachedAudio(cacheKey, {base64: wavBase64, mimeType: 'audio/wav'});
      res.json({
        audioBase64: wavBase64,
        mimeType: 'audio/wav',
        voiceName,
        spokenText: speechText,
        provider: 'gemini',
        modelUsed,
      });
      return;
    }

    // Emergency neural fallback (NEVER written to v4_gemini cache so studio voices recover automatically!)
    const edgeMp3 = await synthesizeEdgePersianMp3(speechText, voiceName);
    if (edgeMp3) {
      res.json({
        audioBase64: edgeMp3,
        mimeType: 'audio/mpeg',
        voiceName,
        spokenText: speechText,
        provider: 'neural-fallback',
      });
      return;
    }

    res.json({
      fallbackOffline: true,
      spokenText: speechText,
      reason: sawQuotaError ? 'quota' : 'unavailable',
    });
  } catch (err) {
    console.error('TTS route error:', err instanceof Error ? err.message : err);
    const edgeMp3 = await synthesizeEdgePersianMp3(speechText, voiceName);
    if (edgeMp3) {
      res.json({
        audioBase64: edgeMp3,
        mimeType: 'audio/mpeg',
        voiceName,
        spokenText: speechText,
        provider: 'neural-fallback',
      });
      return;
    }
    res.json({
      fallbackOffline: true,
      spokenText: speechText,
      reason: 'error',
    });
  }
});

app.post('/api/tts-stream', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({error: 'متن برای تبدیل به گفتار ارسال نشده است.'});
    return;
  }
  if (text.length > 1500) {
    res.status(400).json({error: 'طول متن نباید بیشتر از ۱۵۰۰ کاراکتر باشد.'});
    return;
  }

  const allowedVoices = ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'];
  const voiceName = allowedVoices.includes(req.body?.voiceName) ? req.body.voiceName : 'Kore';
  const forceRefresh = Boolean(req.body?.forceRefresh);
  const cacheKey = `v4_gemini::${voiceName}::${text}`;

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendLine = (payload: Record<string, unknown>) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`${JSON.stringify(payload)}\n`);
    }
  };

  let clientClosed = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
    }
  });

  if (!forceRefresh) {
    const cached = readCachedAudio(cacheKey);
    if (cached && cached.mimeType === 'audio/wav') {
      sendLine({
        type: 'wav',
        audioBase64: cached.base64,
        mimeType: cached.mimeType,
        voiceName,
        cached: true,
        provider: 'gemini',
      });
      res.end();
      return;
    }
  }

  const baseAi = getAiClient();
  const betaAi = getTtsAiClient();
  const alphaAi = getAlphaAiClient();
  const speechText = /[A-Za-z]{2,}/.test(text)
    ? await transliterateLatinToPersianPhonetic(text, baseAi ?? betaAi)
    : text;

  const customStyle = typeof req.body?.style === 'string' && req.body.style.trim() ? req.body.style.trim() : '';
  const style = `${VOICE_GENDER_HINT[voiceName]} ${customStyle}`.trim();

  let sawQuotaError = false;
  let streamedAnyChunk = false;
  let streamModelUsed: string | undefined;

  try {
    if (baseAi || betaAi || alphaAi) {
      const candidates = buildTtsCandidates(baseAi, betaAi, alphaAi);

      for (const cand of candidates) {
        if (clientClosed || Date.now() < (ttsModelCooldownUntil.get(cand.model) ?? 0)) {
          continue;
        }
        try {
          const contents = cand.is25
            ? [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `Read aloud ONLY this exact transcript in warm, fluent, natural Tehran Persian (${style}). Do not add extra words:\n\n${speechText}`,
                    },
                  ],
                },
              ]
            : cand.withMetadata
              ? [{role: 'user', parts: [{text: speechText, speechMetadata: {style}}]}]
              : [{role: 'user', parts: [{text: speechText}]}];

          const pcmChunks: Buffer[] = [];
          let chunkSampleRate = 24000;
          let emittedInThisAttempt = 0;

          const responseStream = await cand.client.models.generateContentStream({
            model: cand.model,
            contents,
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {voiceName},
                },
              },
            },
          });

          for await (const chunk of responseStream) {
            if (clientClosed) break;
            const parts = chunk.candidates?.[0]?.content?.parts ?? [];
            for (const part of parts) {
              const inline = part.inlineData;
              if (!inline?.data) continue;
              chunkSampleRate = parseSampleRateFromMimeType(inline.mimeType);
              let rawBuf: Buffer = Buffer.from(inline.data, 'base64');
              if (emittedInThisAttempt === 0) {
                rawBuf = stripRiffHeaderIfPresent(rawBuf);
              }
              if (rawBuf.length === 0) continue;
              pcmChunks.push(rawBuf);
              emittedInThisAttempt++;
              streamedAnyChunk = true;
              sendLine({
                type: 'pcm',
                data: rawBuf.toString('base64'),
                sampleRate: chunkSampleRate,
                model: cand.model,
              });
            }
          }

          if (clientClosed) {
            if (!res.writableEnded) res.end();
            return;
          }

          if (pcmChunks.length > 0) {
            streamModelUsed = cand.withMetadata ? `${cand.model}+meta` : cand.model;
            const fullWavBase64 = buildWavBufferFromRawPcm(Buffer.concat(pcmChunks), chunkSampleRate).toString('base64');
            writeCachedAudio(cacheKey, {base64: fullWavBase64, mimeType: 'audio/wav'});
            sendLine({
              type: 'done',
              provider: 'gemini',
              modelUsed: streamModelUsed,
              spokenText: speechText,
              sampleRate: chunkSampleRate,
            });
            res.end();
            return;
          }
        } catch (err) {
          if (streamedAnyChunk) {
            // Stream broke mid-way after chunks already started playing; close cleanly without mixing engines.
            sendLine({type: 'done', provider: 'gemini', partial: true});
            res.end();
            return;
          }
          const msg = err instanceof Error ? err.message : String(err);
          if (cand.withMetadata && (msg.includes('speechMetadata') || msg.includes('Cannot find field'))) {
            continue;
          }
          if (recordTtsCandidateError(cand, voiceName, err)) {
            sawQuotaError = true;
          }
        }
      }
    }

    if (!clientClosed && !streamedAnyChunk) {
      const edgeMp3 = await synthesizeEdgePersianMp3(speechText, voiceName);
      if (edgeMp3) {
        sendLine({
          type: 'fallback_audio',
          audioBase64: edgeMp3,
          mimeType: 'audio/mpeg',
          voiceName,
          spokenText: speechText,
          provider: 'neural-fallback',
        });
        res.end();
        return;
      }

      sendLine({
        type: 'fallback_offline',
        spokenText: speechText,
        reason: sawQuotaError ? 'quota' : 'unavailable',
      });
    }
    if (!res.writableEnded) res.end();
  } catch (err) {
    console.info('TTS stream fallback notice:', err instanceof Error ? err.message : err);
    if (!clientClosed && !streamedAnyChunk) {
      sendLine({
        type: 'fallback_offline',
        spokenText: speechText,
        reason: 'error',
      });
    }
    if (!res.writableEnded) res.end();
  }
});

app.post('/api/caller-pronounce', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({error: 'سرویس آنلاین در دسترس نیست.'});
    return;
  }

  const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const template = typeof req.body?.template === 'string' ? req.body.template.trim() : 'تماس ورودی از طرف {name}';
  if (!rawName) {
    res.status(400).json({error: 'نام مخاطب وارد نشده است.'});
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `نام مخاطب: "${rawName}"
الگوی اعلام تماس: "${template}"
لطفاً متن نهایی اعلام تماس را طوری بنویس که یک گوینده دوزبانه فارسی و انگلیسی آن را کاملاً روان و بدون مکث اشتباه بخواند. اگر نام فینگلیش است، تلفظ طبیعی آن را حفظ کن و یک راهنمای آوایی کوتاه هم بده.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            spokenScript: {type: Type.STRING, description: 'متن دقیق و روان برای خواندن توسط سیستم صوتی'},
            persianPhonetic: {type: Type.STRING, description: 'راهنمای تلفظ فارسی برای حالت آفلاین'},
            detectedLanguage: {type: Type.STRING, description: 'persian یا latin یا bilingual'},
          },
          required: ['spokenScript', 'persianPhonetic', 'detectedLanguage'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Caller pronounce helper failed:', err);
    res.status(500).json({error: 'خطا در تحلیل تلفظ نام مخاطب.'});
  }
});

app.post('/api/special-message', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error: 'سرویس آنلاین پیام‌ساز در دسترس نیست؛ از قالب‌های آماده آفلاین استفاده کنید.',
      offlineFallback: true,
    });
    return;
  }

  const occasion = typeof req.body?.occasion === 'string' ? req.body.occasion.trim() : 'پیام مناسبتی';
  const recipient = typeof req.body?.recipient === 'string' ? req.body.recipient.trim() : 'عزیز دلم';
  const senderName = typeof req.body?.senderName === 'string' ? req.body.senderName.trim() : 'بهمن';
  const tone = typeof req.body?.tone === 'string' ? req.body.tone.trim() : 'صمیمی و گرم';
  const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';

  try {
    const prompt = `یک پیام فارسی بسیار خوش‌بیان، ادبی اما صمیمی و غیرکلیشه‌ای بنویس.
مناسبت یا موضوع: ${occasion}
مخاطب پیام (برای چه کسی): ${recipient}
فرستنده: ${senderName}
لحن دلخواه: ${tone}
${details ? `نکات یا خاطرات دلخواه برای اشاره در متن: ${details}` : ''}
پیام باید طوری باشد که هم برای ارسال در پیام‌رسان/پیامک عالی باشد و هم وقتی با صدای بلند خوانده می‌شود بسیار دلنشین و طبیعی به گوش برسد.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'تو نویسنده چیره‌دست فارسی برای متن‌های صمیمی، تبریک تولد، سالگرد، آشتی، قدردانی و دلگرمی هستی. فقط JSON خواسته‌شده را برگردان.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {type: Type.STRING, description: 'عنوان کوتاه و زیبا برای پیام'},
            text: {type: Type.STRING, description: 'متن کامل پیام در ۳ تا ۵ جمله روان و احساسی'},
            shortVersion: {type: Type.STRING, description: 'نسخه کوتاه ۱ یا ۲ جمله‌ای مناسب پیامک'},
            occasion: {type: Type.STRING, description: 'نام مناسبت'},
          },
          required: ['title', 'text', 'shortVersion', 'occasion'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Special message generation failed:', err);
    res.status(500).json({error: 'خطا در ساخت پیام مناسبتی هوشمند.'});
  }
});

app.post('/api/batch-phonetic', async (req, res) => {
  const rawNames = Array.isArray(req.body?.names) ? (req.body.names as unknown[]) : [];
  const cleanNames = Array.from(
    new Set(
      rawNames
        .filter((n): n is string => typeof n === 'string')
        .map((n) => n.trim())
        .filter((n) => n.length > 0 && n.length <= 90)
    )
  ).slice(0, 160);

  if (cleanNames.length === 0) {
    res.json({phonetics: {}});
    return;
  }

  const phonetics: Record<string, string> = {};
  const latinNames: string[] = [];

  for (const name of cleanNames) {
    const lower = name.toLowerCase();
    if (!/[A-Za-z]/.test(name)) {
      phonetics[lower] = name;
    } else {
      phonetics[lower] = normalizeFinglishAndEnglishToPersian(name);
      latinNames.push(name);
    }
  }

  const ai = getAiClient();
  if (ai && latinNames.length > 0) {
    for (let i = 0; i < latinNames.length; i += 80) {
      const chunk = latinNames.slice(i, i + 80);
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `این فهرست نام‌های مخاطبین دفترچه تلفن است که بخشی یا تمام آن‌ها به خط انگلیسی یا فینگلیش نوشته شده‌اند.
برای هر نام، تلفظ دقیق و بسیار روان آن را به خط فارسی آوایی (با اعراب کوتاه در صورت نیاز مثل بَهمن موساعلی، زَری جان، دکتر احمدی، سارا دِیزاین، بابا، مامان) برگردان تا موتور صوتی فارسی بدون خطا و بدون نیاز به انگلیسی بخواند:
${JSON.stringify(chunk)}`,
          config: {
            thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                entries: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      raw: {type: Type.STRING, description: 'Exact input name string'},
                      persianPhonetic: {type: Type.STRING, description: 'Fluent Persian phonetic spelling'},
                    },
                    required: ['raw', 'persianPhonetic'],
                  },
                },
              },
              required: ['entries'],
            },
          },
        });
        const parsed = JSON.parse((response.text ?? '{}').trim()) as {
          entries?: {raw?: string; persianPhonetic?: string}[];
        };
        for (const item of parsed.entries ?? []) {
          const raw = typeof item.raw === 'string' ? item.raw.trim().toLowerCase() : '';
          const ph = typeof item.persianPhonetic === 'string' ? item.persianPhonetic.trim() : '';
          if (raw && ph && !/[A-Za-z]{2,}/.test(ph)) {
            phonetics[raw] = ph;
          }
        }
      } catch (err) {
        console.warn('Batch phonetic AI chunk fallback:', err instanceof Error ? err.message : err);
      }
    }
  }

  res.json({phonetics});
});

interface ServerMusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  streamUrl: string;
  durationSec?: number;
  isLiveStream?: boolean;
  country?: string;
  tags?: string;
  source: 'audius' | 'archive' | 'radio';
  externalUrl?: string;
}

function isSafePublicAudioUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host === '[::]' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.startsWith('[fe80:') ||
      host.startsWith('fe80:') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function wrapRadioStreamUrl(rawUrl: string): string {
  const cleaned = rawUrl.trim();
  if (cleaned.startsWith('http://')) {
    return `/api/audio-proxy?url=${encodeURIComponent(cleaned)}`;
  }
  return cleaned;
}

interface RadioBrowserStation {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  favicon?: string;
  tags?: string;
  country?: string;
  countrycode?: string;
  codec?: string;
  bitrate?: number;
  votes?: number;
}

const CURATED_IRAN_STATIONS: ServerMusicTrack[] = [
  {
    id: 'curated_navahang',
    title: 'رادیو نواهنگ (موزیک پاپ و آرام ایرانی)',
    artist: 'Radio Navahang · پخش زنده شبانه‌روزی',
    streamUrl: 'https://navairan.com/;stream.nsv',
    isLiveStream: true,
    country: 'ایران / فارسی',
    tags: 'persian, pop, iranian music',
    source: 'radio',
    externalUrl: 'https://navahang.com',
  },
  {
    id: 'curated_hamrah',
    title: 'رادیو همراه (موسیقی و گفتار فارسی)',
    artist: 'Radio Hamrah · پخش زنده فارسی',
    streamUrl: 'https://stream.zenolive.com/gxdq0awu30duv.aac',
    isLiveStream: true,
    country: 'فارسی',
    tags: 'persian, talk, music',
    source: 'radio',
  },
  {
    id: 'curated_persian_vibe',
    title: 'رادیو پرشین وایب (موزیک شاد و مدرن ایرانی)',
    artist: 'Persian Vibe Radio · موسیقی فارسی',
    streamUrl: 'https://radio.aydayazdani.com/stream',
    isLiveStream: true,
    country: 'ایران / فارسی',
    tags: 'persian, pop, music',
    source: 'radio',
  },
  {
    id: 'curated_simorgh',
    title: 'رادیو سیمرغ (آهنگ‌های فارسی و دلنشین)',
    artist: 'Radio Simorgh · پخش زنده فارسی',
    streamUrl: 'https://stream.zeno.fm/9svfnobkrxrvv',
    isLiveStream: true,
    country: 'ایران / فارسی',
    tags: 'persian, music, nostalgic',
    source: 'radio',
  },
  {
    id: 'curated_faaz',
    title: 'رادیو فاز (آهنگ‌های جدید ایرانی)',
    artist: 'Radio Faaz · موزیک فارسی',
    streamUrl: 'https://free.rcast.net/230792',
    isLiveStream: true,
    country: 'ایران / فارسی',
    tags: 'persian, pop',
    source: 'radio',
  },
  {
    id: 'curated_parsa',
    title: 'رادیو پارسا (موسیقی ایرانی)',
    artist: 'Radio Parsa · پخش زنده ایران',
    streamUrl: wrapRadioStreamUrl('http://parsa.icdndhcp.com:18000/stream'),
    isLiveStream: true,
    country: 'ایران',
    tags: 'persian, iranian',
    source: 'radio',
  },
  {
    id: 'curated_mibl',
    title: 'رادیو میبل (موسیقی و برنامه فارسی)',
    artist: 'MIBL Persian Radio · پخش زنده',
    streamUrl: 'https://www.miblradio.com.au/mibl',
    isLiveStream: true,
    country: 'فارسی / استرالیا',
    tags: 'persian, talk, music',
    source: 'radio',
  },
  {
    id: 'curated_hamsafar',
    title: 'رادیو همسفر (ترانه‌های فارسی و کلاسیک)',
    artist: 'Radio Hamsafar · پخش زنده',
    streamUrl: wrapRadioStreamUrl('http://n10.radiojar.com/pyea7q9h5ehvv'),
    isLiveStream: true,
    country: 'فارسی',
    tags: 'persian, music, traditional',
    source: 'radio',
  },
  {
    id: 'curated_farda',
    title: 'رادیو فردا (خبر و برنامه زنده فارسی)',
    artist: 'Radio Farda · پخش زنده ۲۴ ساعته',
    streamUrl: 'https://stream.radiojar.com/cp13r2cpn3quv',
    isLiveStream: true,
    country: 'فارسی',
    tags: 'persian, news, talk',
    source: 'radio',
  },
  {
    id: 'curated_rfi_persian',
    title: 'رادیو فرانسه بخش فارسی (RFI)',
    artist: 'RFI Persan · خبر و فرهنگ',
    streamUrl: wrapRadioStreamUrl('http://live02.rfi.fr/rfienpersan-64k.mp3'),
    isLiveStream: true,
    country: 'فرانسه / فارسی',
    tags: 'persian, news, culture',
    source: 'radio',
  },
  {
    id: 'curated_kirn',
    title: 'رادیو ایران ۶۷۰ (لس‌آنجلس)',
    artist: 'KIRN Radio Iran · پخش زنده فارسی',
    streamUrl: wrapRadioStreamUrl('http://ice41.securenetsystems.net/KIRN'),
    isLiveStream: true,
    country: 'آمریکا / فارسی',
    tags: 'persian, talk, iranian',
    source: 'radio',
  },
];

const CURATED_WORLD_CHILL_STATIONS: ServerMusicTrack[] = [
  {
    id: 'curated_somafm_groove',
    title: 'SomaFM Groove Salad (امبینت و آرامش)',
    artist: 'آمریکا · پخش زنده بدون تبلیغ',
    streamUrl: 'https://ice2.somafm.com/groovesalad-128-mp3',
    isLiveStream: true,
    country: 'United States',
    tags: 'ambient, chillout, downtempo',
    source: 'radio',
    externalUrl: 'https://somafm.com/groovesalad/',
  },
  {
    id: 'curated_smooth_chill',
    title: 'Smooth Chill (موزیک آرامش‌بخش شبانه)',
    artist: 'بریتانیا · پخش زنده لایت',
    streamUrl: 'https://media-ssl.musicradio.com/SmoothChill',
    isLiveStream: true,
    country: 'United Kingdom',
    tags: 'chill, lounge, relaxing',
    source: 'radio',
  },
  {
    id: 'curated_somafm_drone',
    title: 'SomaFM Drone Zone (مدیتیشن و خواب آرام)',
    artist: 'آمریکا · صدای فضایی و آرام',
    streamUrl: 'https://ice1.somafm.com/dronezone-128-mp3',
    isLiveStream: true,
    country: 'United States',
    tags: 'ambient, sleep, meditation',
    source: 'radio',
  },
];

async function queryRadioBrowser(queryPathAndParams: string): Promise<RadioBrowserStation[]> {
  const hosts = ['https://de1.api.radio-browser.info', 'https://all.api.radio-browser.info'];
  for (const host of hosts) {
    try {
      const r = await fetch(`${host}/json/stations/search?${queryPathAndParams}`, {
        headers: {'User-Agent': 'Hamseda/1.0'},
        signal: AbortSignal.timeout(6500),
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        return data as RadioBrowserStation[];
      }
    } catch {
      // try next mirror
    }
  }
  return [];
}

async function queryTuneInStations(query: string, maxResolve = 6): Promise<ServerMusicTrack[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];
  try {
    const searchUrl = `https://opml.radiotime.com/Search.ashx?query=${encodeURIComponent(cleaned)}&filter=s:station&render=json`;
    const searchRes = await fetch(searchUrl, {
      headers: {'User-Agent': 'Hamseda/1.0'},
      signal: AbortSignal.timeout(5500),
    });
    if (!searchRes.ok) return [];
    const json = (await searchRes.json()) as {
      body?: Array<{
        type?: string;
        guide_id?: string;
        preset_id?: string;
        text?: string;
        subtext?: string;
        image?: string;
        genre_id?: string;
      }>;
    };
    const items = (json.body ?? [])
      .filter((item) => item?.type === 'audio' && (item.guide_id || item.preset_id) && item.text)
      .slice(0, maxResolve);

    const resolved = await Promise.all(
      items.map(async (item): Promise<ServerMusicTrack | null> => {
        const stationId = String(item.guide_id || item.preset_id || '').trim();
        if (!stationId) return null;
        try {
          const tuneRes = await fetch(
            `https://opml.radiotime.com/Tune.ashx?id=${encodeURIComponent(stationId)}&render=json`,
            {
              headers: {'User-Agent': 'Hamseda/1.0'},
              signal: AbortSignal.timeout(4500),
            }
          );
          if (!tuneRes.ok) return null;
          const tuneData = (await tuneRes.json()) as {
            body?: Array<{url?: string; media_type?: string; bitrate?: number}>;
          };
          const streams = tuneData.body ?? [];
          const picked = streams.find((s) => {
            const u = String(s?.url || '').trim();
            if (!u) return false;
            const low = u.toLowerCase();
            if (low.includes('georestricted') || low.includes('nostream') || low.includes('.m3u8') || low.includes('.pls')) {
              return false;
            }
            return Boolean(isSafePublicAudioUrl(u));
          });
          if (!picked?.url) return null;
          const parsedUrl = isSafePublicAudioUrl(picked.url);
          if (!parsedUrl) return null;
          return {
            id: `tunein_${stationId}`,
            title: String(item.text || '').trim(),
            artist: [item.subtext ? String(item.subtext).trim() : 'پخش زنده رادیویی', picked.bitrate ? `${picked.bitrate} kbps` : '']
              .filter(Boolean)
              .join(' · '),
            artworkUrl: item.image && String(item.image).startsWith('https://') ? String(item.image) : undefined,
            streamUrl: wrapRadioStreamUrl(parsedUrl.href),
            isLiveStream: true,
            tags: 'tunein, radio',
            source: 'radio',
          };
        } catch {
          return null;
        }
      })
    );
    return resolved.filter((x): x is ServerMusicTrack => x !== null);
  } catch {
    return [];
  }
}

function mapRadioStationsToTracks(stations: RadioBrowserStation[], maxItems = 24): ServerMusicTrack[] {
  const out: ServerMusicTrack[] = [];
  const seenStreams = new Set<string>();

  for (const st of stations) {
    const rawName = String(st?.name || '').replace(/\s+/g, ' ').trim();
    const rawStream = String(st?.url_resolved || st?.url || '').trim();
    if (!rawName || rawName.length > 90 || rawName.includes('?ref=')) continue;
    if (rawStream.includes('.m3u8') || rawStream.includes('.pls')) continue;
    const parsedUrl = isSafePublicAudioUrl(rawStream);
    if (!parsedUrl) continue;

    const dedupeKey = parsedUrl.href.toLowerCase();
    if (seenStreams.has(dedupeKey)) continue;
    seenStreams.add(dedupeKey);

    const country = String(st.country || '').trim();
    const bitrateInfo = st.bitrate && st.bitrate > 0 ? `${st.bitrate} kbps` : '';
    const artistParts = ['پخش زنده رادیویی', country, bitrateInfo].filter(Boolean);

    out.push({
      id: `radio_${st.stationuuid || crypto.createHash('md5').update(dedupeKey).digest('hex').slice(0, 12)}`,
      title: rawName,
      artist: artistParts.join(' · '),
      artworkUrl: st.favicon && String(st.favicon).startsWith('https://') ? String(st.favicon) : undefined,
      streamUrl: wrapRadioStreamUrl(parsedUrl.href),
      isLiveStream: true,
      country: country || undefined,
      tags: String(st.tags || '').slice(0, 120) || undefined,
      source: 'radio',
      externalUrl: st.homepage && String(st.homepage).startsWith('http') ? String(st.homepage) : undefined,
    });
    if (out.length >= maxItems) break;
  }
  return out;
}

function buildFallbackMusicQueries(persianMood: string): {
  audiusQuery: string;
  archiveQuery: string;
  radioTag: string;
} {
  const m = persianMood.toLowerCase();
  if (m.includes('آریان') || m.includes('arian')) {
    return {audiusQuery: 'Arian Band', archiveQuery: '"Arian" OR "Arian Band" OR "گروه آریان"', radioTag: 'persian'};
  }
  if (m.includes('کالکشن') || m.includes('قدیمی') || m.includes('نوستالژی') || m.includes('خاطره')) {
    return {audiusQuery: 'Persian oldies', archiveQuery: '"Persian oldies" OR "Iranian oldies" OR "Persian pop classics"', radioTag: 'persian'};
  }
  if (m.includes('شجریان') || m.includes('سنتی') || m.includes('همایون')) {
    return {audiusQuery: 'shajarian', archiveQuery: 'shajarian OR santoor', radioTag: 'persian'};
  }
  if (m.includes('پاپ') || m.includes('عاشقانه') || m.includes('ملایم')) {
    return {audiusQuery: 'persian', archiveQuery: 'persian music', radioTag: 'persian'};
  }
  if (m.includes('پیانو') || m.includes('باران') || m.includes('بی‌کلام') || m.includes('رمانتیک')) {
    return {audiusQuery: 'relaxing piano instrumental', archiveQuery: 'relaxing piano', radioTag: 'ambient'};
  }
  if (m.includes('رادیو')) {
    return {audiusQuery: 'night chill lounge', archiveQuery: 'persian classical', radioTag: 'chillout'};
  }
  return {audiusQuery: 'persian chill', archiveQuery: 'persian traditional', radioTag: 'ambient'};
}

async function fetchArchiveFullTracks(query: string): Promise<ServerMusicTrack[]> {
  try {
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${query}) AND mediatype:(audio)`)}&fl[]=identifier,title,creator&sort[]=downloads+desc&rows=14&output=json`;
    const searchRes = await fetch(searchUrl, {signal: AbortSignal.timeout(5500)});
    if (!searchRes.ok) return [];
    const searchJson = (await searchRes.json()) as {
      response?: {docs?: {identifier?: string; title?: string; creator?: string | string[]}[]};
    };
    const docs = searchJson?.response?.docs ?? [];
    if (docs.length === 0) return [];

    const metaResults = await Promise.allSettled(
      docs.slice(0, 8).map(async (doc) => {
        if (!doc.identifier) return [];
        const mRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}/files`, {
          signal: AbortSignal.timeout(4500),
        });
        if (!mRes.ok) return [];
        const mJson = (await mRes.json()) as {
          result?: {name?: string; format?: string; title?: string; artist?: string; length?: string}[];
        };
        const files = (mJson.result ?? []).filter((f) => {
          const name = String(f.name || '').toLowerCase();
          const secs = parseFloat(String(f.length || '0'));
          return (name.endsWith('.mp3') || name.endsWith('.ogg')) && (!Number.isFinite(secs) || secs === 0 || secs >= 60);
        });
        const tracksForDoc: ServerMusicTrack[] = [];
        for (const f of files.slice(0, 3)) {
          if (!f.name) continue;
          const secsRaw = parseFloat(String(f.length || '0'));
          const durationSec = Number.isFinite(secsRaw) && secsRaw >= 60 ? Math.round(secsRaw) : undefined;
          const cleanName = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
          const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
          tracksForDoc.push({
            id: `archive_${doc.identifier}_${tracksForDoc.length}`,
            title: String(f.title || doc.title || cleanName),
            artist: String(f.artist || creator || 'آرشیو موسیقی'),
            streamUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
            durationSec,
            source: 'archive',
            externalUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
          });
        }
        return tracksForDoc;
      })
    );

    const out: ServerMusicTrack[] = [];
    for (const r of metaResults) {
      if (r.status === 'fulfilled') out.push(...r.value);
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchPlayableMusicPlaylist(moodOrGenre: string, _ai: GoogleGenAI | null): Promise<ServerMusicTrack[]> {
  const rawQuery = moodOrGenre.trim().slice(0, 180);
  const fallback = buildFallbackMusicQueries(rawQuery);
  const normalized = rawQuery.toLowerCase().replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');

  // Expand common Persian artist / collection wording into source-friendly aliases.
  // We search the user's exact phrase as well, so arbitrary artist names are not discarded.
  let audiusQueries = [fallback.audiusQuery, rawQuery];
  let archiveQueries = [fallback.archiveQuery, rawQuery];
  if (/(آریان|arian)/i.test(normalized)) {
    audiusQueries = ['Arian Band', 'Arian Iranian pop', rawQuery];
    archiveQueries = ['"Arian" OR "Arian Band" OR "گروه آریان"', '"Arian Iranian band"', rawQuery];
  } else if (/(کالکشن|مجموعه|قدیمی|نوستالژی|خاطره)/.test(normalized)) {
    audiusQueries = ['Persian oldies', 'Iranian pop classics', 'Persian classic pop'];
    archiveQueries = ['"Persian oldies" OR "Iranian oldies"', '"Persian pop classics"', 'Iranian old music collection'];
  } else if (/^[a-z0-9\s&'-]+$/i.test(rawQuery)) {
    audiusQueries = [rawQuery, fallback.audiusQuery];
    archiveQueries = [`"${rawQuery}"`, fallback.archiveQuery];
  }
  const unique = (items: string[]) => [...new Set(items.map((v) => v.trim()).filter(Boolean))].slice(0, 3);
  audiusQueries = unique(audiusQueries);
  archiveQueries = unique(archiveQueries);

  const [audiusResults, archiveResults] = await Promise.all([
    Promise.allSettled(audiusQueries.map(async (query) => {
      const response = await fetch(
        `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&limit=18&app_name=roozhaye`,
        {signal: AbortSignal.timeout(7000)}
      );
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload?.data) ? payload.data : [];
    })),
    Promise.allSettled(archiveQueries.map((query) => fetchArchiveFullTracks(query))),
  ]);

  const tracks: ServerMusicTrack[] = [];
  const seenIds = new Set<string>();
  for (const result of audiusResults) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      if (!item?.id || !item?.title) continue;
      const duration = typeof item.duration === 'number' ? item.duration : 0;
      if (duration > 0 && duration < 60) continue;
      const id = `audius_${item.id}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      tracks.push({
        id,
        title: String(item.title),
        artist: String(item.user?.name || item.user?.handle || 'Audius Artist'),
        artworkUrl: item.artwork?.['150x150'] || item.artwork?.['480x480'] || undefined,
        streamUrl: `https://api.audius.co/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=roozhaye`,
        durationSec: duration >= 60 ? duration : undefined,
        source: 'audius',
        externalUrl: item.permalink ? `https://audius.co${item.permalink}` : undefined,
      });
    }
  }
  for (const result of archiveResults) {
    if (result.status !== 'fulfilled') continue;
    for (const track of result.value) {
      if (seenIds.has(track.id)) continue;
      seenIds.add(track.id);
      tracks.push(track);
    }
  }

  // Never pad a failed artist search with unrelated music: return only actual matches.
  return tracks.slice(0, 30);
}
app.post('/api/radio-stations', async (req, res) => {
  const category = typeof req.body?.category === 'string' ? req.body.category : 'iran';
  const rawQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';

  try {
    let tracks: ServerMusicTrack[] = [];
    let notice = '';

    if (category === 'custom' && rawQuery) {
      let enQuery = rawQuery;
      const persianDict: Record<string, string> = {
        'ایران': 'iran',
        'تهران': 'tehran',
        'شیراز': 'shiraz',
        'اصفهان': 'isfahan',
        'مشهد': 'mashhad',
        'تبریز': 'tabriz',
        'فارسی': 'persian',
        'سنتی': 'persian',
        'پاپ': 'pop',
        'پیانو': 'piano',
        'آرام': 'chillout',
        'جاز': 'jazz',
        'کلاسیک': 'classical',
        'ترکیه': 'turkey',
        'فرانسه': 'france',
        'آلمان': 'germany',
        'آمریکا': 'usa',
        'انگلیس': 'uk',
        'رادیو جوان': 'radio javan',
        'رادیو خورشید': 'radio khorshid',
        'رادیو همراه': 'radio hamrah',
        'رادیو نواهنگ': 'navahang',
        'رادیو فردا': 'radio farda',
        'جوان': 'radio javan',
        'خورشید': 'radio khorshid',
        'همراه': 'radio hamrah',
        'نواهنگ': 'navahang',
        'فردا': 'radio farda',
      };
      for (const [fa, en] of Object.entries(persianDict)) {
        if (rawQuery.includes(fa)) {
          enQuery = en;
          break;
        }
      }
      const ai = getAiClient();
      if (ai && /[\u0600-\u06FF]/.test(rawQuery) && enQuery === rawQuery) {
        try {
          const r = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Translate this Persian radio station search query into 1 or 2 crisp English keywords or station name/country for Radio Browser search (no explanation): "${rawQuery}"`,
            config: {thinkingConfig: {thinkingLevel: ThinkingLevel.LOW}},
          });
          const cand = (r.text ?? '').replace(/["'\n]/g, '').trim();
          if (cand && cand.length <= 40) enQuery = cand;
        } catch {
          // keep fallback
        }
      }

      const curatedMatches = CURATED_IRAN_STATIONS.filter((st) => {
        const hay = `${st.title} ${st.artist} ${st.tags || ''}`.toLowerCase();
        return hay.includes(enQuery.toLowerCase()) || hay.includes(rawQuery.toLowerCase());
      });

      const [byName, byTag, byCountry, tuneInMatches] = await Promise.all([
        queryRadioBrowser(`name=${encodeURIComponent(enQuery)}&limit=15&hidebroken=true&order=votes&reverse=true`),
        queryRadioBrowser(`tag=${encodeURIComponent(enQuery.toLowerCase())}&limit=15&hidebroken=true&order=votes&reverse=true`),
        queryRadioBrowser(`country=${encodeURIComponent(enQuery)}&limit=12&hidebroken=true&order=votes&reverse=true`),
        queryTuneInStations(enQuery, 6),
      ]);
      const browserTracks = mapRadioStationsToTracks([...byName, ...byTag, ...byCountry], 24);
      const seen = new Set<string>();
      for (const item of [...curatedMatches, ...tuneInMatches, ...browserTracks]) {
        if (seen.has(item.streamUrl)) continue;
        seen.add(item.streamUrl);
        tracks.push(item);
      }

      const lowRaw = `${rawQuery} ${enQuery}`.toLowerCase();
      if (tracks.length === 0) {
        const isClosedPersianBroadcaster = /(javan|جوان|khorshid|خورشید)/.test(lowRaw);
        notice = isClosedPersianBroadcaster
          ? `ایستگاه «${rawQuery}» استریم عمومی باز در دایرکتوری‌های رادیویی ندارد؛ رادیوهای زنده موسیقی فارسی جایگزین برای پخش فوری آورده شدند.`
          : `ایستگاه مستقیمی با عبارت «${rawQuery}» در دایرکتوری‌های آزاد پیدا نشد؛ رادیوهای زنده فارسی زیر آماده پخش هستند.`;
        tracks = CURATED_IRAN_STATIONS.slice(0, 8);
      }
    } else if (category === 'persian_music') {
      const [persianTag, iranianTag, persianName, irStations] = await Promise.all([
        queryRadioBrowser('tag=persian&limit=20&hidebroken=true&order=votes&reverse=true'),
        queryRadioBrowser('tag=iranian&limit=15&hidebroken=true&order=votes&reverse=true'),
        queryRadioBrowser('name=persian&limit=15&hidebroken=true&order=votes&reverse=true'),
        queryRadioBrowser('countrycode=IR&limit=15&hidebroken=true&order=votes&reverse=true'),
      ]);
      const mapped = mapRadioStationsToTracks([...persianTag, ...iranianTag, ...persianName, ...irStations], 26);
      const musicCurated = CURATED_IRAN_STATIONS.filter((c) => !c.tags?.includes('news'));
      const seen = new Set(musicCurated.map((c) => c.streamUrl));
      tracks = [...musicCurated, ...mapped.filter((m) => !seen.has(m.streamUrl))].slice(0, 26);
    } else if (category === 'iran') {
      const [irStations, persianTag, persianLang, persianName] = await Promise.all([
        queryRadioBrowser('countrycode=IR&limit=25&hidebroken=true&order=votes&reverse=true'),
        queryRadioBrowser('tag=persian&limit=20&hidebroken=true&order=votes&reverse=true'),
        queryRadioBrowser('language=persian&limit=15&hidebroken=true&order=votes&reverse=true'),
        queryRadioBrowser('name=persian&limit=15&hidebroken=true&order=votes&reverse=true'),
      ]);
      const combined = [...irStations, ...persianTag, ...persianLang, ...persianName];
      const mapped = mapRadioStationsToTracks(combined, 24);
      const seen = new Set(CURATED_IRAN_STATIONS.map((c) => c.streamUrl));
      tracks = [...CURATED_IRAN_STATIONS, ...mapped.filter((m) => !seen.has(m.streamUrl))].slice(0, 28);
    } else if (category === 'chill') {
      const [ambient, lounge, piano] = await Promise.all([
        queryRadioBrowser('tag=chillout&limit=14&hidebroken=true&order=votes&reverse=true'),
        queryRadioBrowser('tag=ambient&limit=12&hidebroken=true&order=votes&reverse=true'),
        queryRadioBrowser('tag=piano&limit=10&hidebroken=true&order=votes&reverse=true'),
      ]);
      const mapped = mapRadioStationsToTracks([...ambient, ...lounge, ...piano], 24);
      const seen = new Set(mapped.map((m) => m.streamUrl));
      tracks = [...CURATED_WORLD_CHILL_STATIONS.filter((c) => !seen.has(c.streamUrl)), ...mapped].slice(0, 26);
    } else {
      // 'world'
      const [topGlobal, classicJazz] = await Promise.all([
        queryRadioBrowser('limit=24&hidebroken=true&order=votes&reverse=true'),
        queryRadioBrowser('tag=pop&limit=12&hidebroken=true&order=clickcount&reverse=true'),
      ]);
      const mapped = mapRadioStationsToTracks([...topGlobal, ...classicJazz], 26);
      tracks = mapped.length > 0 ? mapped : CURATED_WORLD_CHILL_STATIONS;
    }

    res.json({
      category,
      stations: tracks,
      notice: notice || undefined,
    });
  } catch (err) {
    console.error('Radio stations lookup error:', err);
    res.json({
      category,
      stations: category === 'iran' || category === 'persian_music' ? CURATED_IRAN_STATIONS : CURATED_WORLD_CHILL_STATIONS,
    });
  }
});

app.get('/api/audio-proxy', async (req, res) => {
  const target = typeof req.query?.url === 'string' ? req.query.url : '';
  const parsedUrl = isSafePublicAudioUrl(target);
  if (!parsedUrl) {
    res.status(400).json({error: 'نشانی صوتی نامعتبر است.'});
    return;
  }

  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), 12000);
  req.on('close', () => {
    clearTimeout(connectTimer);
    controller.abort();
  });

  try {
    const reqHeaders: Record<string, string> = {'User-Agent': 'RoozhayeManOZari/1.0'};
    if (typeof req.headers.range === 'string') {
      reqHeaders.Range = req.headers.range;
    }
    const upstream = await fetch(parsedUrl.href, {
      headers: reqHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(connectTimer);

    if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
      res.status(502).json({error: 'پخش جریان صوتی در دسترس نیست.'});
      return;
    }
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Cache-Control', contentLength ? 'public, max-age=300' : 'no-store');

    const nodeStream = Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
    nodeStream.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    nodeStream.pipe(res);
  } catch (err) {
    clearTimeout(connectTimer);
    if ((err as {name?: string})?.name !== 'AbortError') {
      console.warn('Audio proxy error:', err instanceof Error ? err.message : err);
    }
    if (!res.headersSent) {
      res.status(502).json({error: 'خطا در دریافت جریان صوتی.'});
    }
  }
});

app.post('/api/night-discover', async (req, res) => {
  const ai = getAiClient();
  const betaAi = getTtsAiClient();
  const mode = req.body?.mode === 'music' ? 'music' : 'movies';
  const moodOrGenre = typeof req.body?.moodOrGenre === 'string' ? req.body.moodOrGenre.trim() : '';
  const mediaType = typeof req.body?.mediaType === 'string' ? req.body.mediaType : 'both';

  if (mode === 'music') {
    try {
      const tracks = await fetchPlayableMusicPlaylist(moodOrGenre || 'پیانو و موسیقی آرامش‌بخش ایرانی', ai ?? betaAi);
      const links = tracks
        .filter((t) => t.externalUrl)
        .slice(0, 6)
        .map((t) => ({title: `${t.title} — ${t.artist}`, url: t.externalUrl!}));

      const summaryList = tracks
        .slice(0, 5)
        .map((t, i) => `${i + 1}. ${t.title} اثر ${t.artist}`)
        .join('، ');

      res.json({
        mode: 'music',
        title: `پلی‌لیست آماده پخش: ${moodOrGenre || 'آرامش شبانه'}`,
        markdownText:
          tracks.length > 0
            ? `${tracks.length} قطعه و ایستگاه آماده پخش پیدا شد. روی هر آهنگ بزنید تا مستقیماً پخش شود.`
            : 'قطعه‌ای برای این عبارت پیدا نشد؛ عبارت دیگری (مثل شجریان، پیانو، یا آرامش) را امتحان کنید.',
        spokenSummary: summaryList
          ? `پلی‌لیست امشب شامل ${summaryList}`
          : 'پلی‌لیست موسیقی آماده است.',
        tracks,
        links,
        fetchedAt: Date.now(),
      });
      return;
    } catch (err) {
      console.error('Music playlist discovery failed:', err);
      res.status(500).json({error: 'خطا در جستجوی پلی‌لیست موسیقی.'});
      return;
    }
  }

  if (!ai && !betaAi) {
    res.status(503).json({
      error: 'برای جستجوی آنلاین شبانه به اتصال اینترنت نیاز است.',
      offlineFallback: true,
    });
    return;
  }

  try {
    const prompt = `۴ ${mediaType === 'series' ? 'سریال' : mediaType === 'movie' ? 'فیلم سینمایی' : 'فیلم سینمایی و سریال'} مطرح یا جدید با امتیاز IMDb بالا (ترجیحاً بالای ۷.۵) که **دوبله فارسی** رسمی یا حرفه‌ای آن در پلتفرم‌های معتبر یا سایت‌های فیلم موجود است را پیدا و معرفی کن${moodOrGenre ? ` در ژانر یا حال‌وهوای: ${moodOrGenre}` : ' (مناسب تماشای شبانه دو نفره، جذاب و خوش‌ساخت)'}.
برای هر مورد دقیقاً ذکر کن:
- نام فارسی و نام انگلیسی + سال انتشار
- امتیاز IMDb و وضعیت دوبله فارسی
- خلاصه داستان کوتاه و جذاب (بدون لو دادن پایان) و دلیل پیشنهاد امشب.`;

    let response;
    const groundedClient = betaAi ?? ai!;
    try {
      response = await groundedClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'پاسخ را کاملاً به فارسی روان، منظم و خوانا بنویس. با جستجوی وب فقط موارد واقعی و معتبر را معرفی کن.',
          tools: [{googleSearch: {}}],
        },
      });
    } catch (groundingErr) {
      console.warn(
        'Night discover googleSearch failed, falling back to direct model response:',
        groundingErr instanceof Error ? groundingErr.message : groundingErr,
      );
      const fallbackClient = ai ?? betaAi!;
      response = await fallbackClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'پاسخ را کاملاً به فارسی روان، منظم و خوانا بنویس. فقط آثار واقعی و شناخته‌شده با امتیاز واقعی IMDb و دوبله فارسی معروف را معرفی کن.',
        },
      });
    }

    const markdownText = (response.text ?? '').trim();
    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const links: {title: string; url: string}[] = [];
    for (const chunk of rawChunks) {
      const uri = chunk?.web?.uri;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        links.push({
          title: chunk?.web?.title || uri,
          url: uri,
        });
      }
    }

    const plainLines = markdownText
      .replace(/[#*_`>[\]()]/g, ' ')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const spokenSummary =
      plainLines.length > 520 ? `${plainLines.slice(0, 520)}...` : plainLines;

    res.json({
      mode,
      title: 'پیشنهاد فیلم و سریال دوبله امتیاز بالا برای امشب',
      markdownText,
      spokenSummary,
      links: links.slice(0, 8),
      fetchedAt: Date.now(),
    });
  } catch (err) {
    console.error('Night discover failed:', err);
    res.status(500).json({error: 'خطا در جستجوی آنلاین شبانه.'});
  }
});



app.post('/api/podcast-search', async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim().slice(0, 180) : '';
  if (!query) {
    res.status(400).json({error: 'نام یا موضوع پادکست را وارد کنید.'});
    return;
  }

  const normalizeFa = (value: string) =>
    value
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[ۀة]/g, 'ه')
      .replace(/[\u200c\u200f\u064b-\u065f\u0670]/g, ' ')
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const PERSIAN_FILLER_WORDS = new Set([
    'کتاب',
    'کتابهای',
    'صوتی',
    'پادکست',
    'پادکستهای',
    'فارسی',
    'اپیزود',
    'قسمت',
    'بخش',
    'فصل',
    'جدید',
    'کامل',
    'دانلود',
    'پخش',
    'گوش',
    'در',
    'به',
    'با',
    'از',
    'برای',
    'رو',
    'را',
    'نوشته',
  ]);

  const rawTokens = normalizeFa(query)
    .split(' ')
    .filter((w) => w.length >= 2);
  let coreTokens = rawTokens.filter((w) => !PERSIAN_FILLER_WORDS.has(w));
  if (coreTokens.length === 0) {
    // Allow general topic searches like "کتاب صوتی داستان" when non-language tokens exist,
    // while keeping pure browse queries like "پادکست فارسی" empty so all recent episodes show.
    const strictBrowse = new Set(['پادکست', 'پادکستهای', 'فارسی', 'کتاب', 'صوتی']);
    coreTokens = rawTokens.filter((w) => !strictBrowse.has(w));
  }
  const coreQuery = coreTokens.join(' ');

  const PERSIAN_HUNDREDS: Record<string, number> = {
    صد: 100, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500,
  };
  const PERSIAN_TENS: Record<string, number> = {
    بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90,
  };
  const PERSIAN_UNITS_AND_TEENS: Record<string, number> = {
    نوزدهم: 19, نوزده: 19,
    هجدهم: 18, هجده: 18,
    هفدهم: 17, هفده: 17,
    شانزدهم: 16, شانزده: 16,
    پانزدهم: 15, پانزده: 15,
    چهاردهم: 14, چهارده: 14,
    سیزدهم: 13, سیزده: 13,
    دوازدهم: 12, دوازده: 12,
    یازدهم: 11, یازده: 11,
    دهم: 10, ده: 10,
    نهم: 9, نه: 9,
    هشتم: 8, هشت: 8,
    هفتم: 7, هفت: 7,
    ششم: 6, شش: 6,
    پنجم: 5, پنج: 5,
    چهارم: 4, چهار: 4,
    سوم: 3, سه: 3,
    دوم: 2, دو: 2,
    اول: 1, یکم: 1, یک: 1,
  };

  const parsePersianWordsNumber = (phrase: string): number | null => {
    const clean = normalizeFa(phrase).replace(/\bو\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return null;
    const words = clean.split(' ');
    let total = 0;
    let consumed = 0;
    for (const w of words) {
      if (PERSIAN_HUNDREDS[w] !== undefined) {
        total += PERSIAN_HUNDREDS[w];
        consumed++;
      } else if (PERSIAN_TENS[w] !== undefined) {
        total += PERSIAN_TENS[w];
        consumed++;
      } else if (PERSIAN_UNITS_AND_TEENS[w] !== undefined) {
        total += PERSIAN_UNITS_AND_TEENS[w];
        consumed++;
      } else {
        break;
      }
    }
    return consumed > 0 && total > 0 ? total : null;
  };

  const extractEpisodeOrder = (title: string): number | null => {
    const nTitle = normalizeFa(title);
    const numMatch = nTitle.match(/(?:قسمت|اپیزود|بخش|فصل|جلسه|شماره|ep|episode|part)\s*(\d{1,4})/);
    if (numMatch?.[1]) return Number(numMatch[1]);

    const kwPhrase = nTitle.match(
      /(?:قسمت|اپیزود|بخش|فصل|جلسه|شماره)\s+([\u0600-\u06ff\s]{2,40})/
    );
    if (kwPhrase?.[1]) {
      const val = parsePersianWordsNumber(kwPhrase[1]);
      if (val !== null) return val;
    }

    const trailingDigits = nTitle.match(/\b(\d{1,3})\s*$/);
    if (trailingDigits?.[1]) return Number(trailingDigits[1]);

    // Last-resort scan for bounded ordinal tokens anywhere in title (compounds before standalone units)
    const tokens = nTitle.split(' ');
    for (let i = 0; i < tokens.length; i++) {
      if (
        PERSIAN_HUNDREDS[tokens[i]] !== undefined ||
        PERSIAN_TENS[tokens[i]] !== undefined ||
        PERSIAN_UNITS_AND_TEENS[tokens[i]] !== undefined
      ) {
        const val = parsePersianWordsNumber(tokens.slice(i, i + 5).join(' '));
        if (val !== null) return val;
      }
    }
    return null;
  };

  const unescapeXmlEntities = (value: string) =>
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .trim();

  const decodeXml = (value: string) =>
    unescapeXmlEntities(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  type ItunesPodcastEntry = {
    collectionId?: number;
    collectionName?: string;
    artistName?: string;
    feedUrl?: string;
    artworkUrl600?: string;
    artworkUrl100?: string;
    trackViewUrl?: string;
    collectionViewUrl?: string;
    primaryGenreName?: string;
    trackName?: string;
    episodeUrl?: string;
    releaseDate?: string;
    trackTimeMillis?: number;
    description?: string;
    shortDescription?: string;
  };

  type ServerPodcastEpisode = {
    title: string;
    audioUrl: string;
    publishedAt?: string;
    description?: string;
    duration?: string;
  };

  const fetchItunes = async (
    term: string,
    entity: 'podcast' | 'podcastEpisode',
    country: string,
    limit: number
  ): Promise<ItunesPodcastEntry[]> => {
    if (!term.trim()) return [];
    try {
      const searchUrl = new URL('https://itunes.apple.com/search');
      searchUrl.searchParams.set('term', term);
      searchUrl.searchParams.set('entity', entity);
      searchUrl.searchParams.set('limit', String(limit));
      searchUrl.searchParams.set('country', country);
      const searchRes = await fetch(searchUrl, {
        headers: {'User-Agent': 'Hamseda/1.0'},
        signal: AbortSignal.timeout(6500),
      });
      if (!searchRes.ok) return [];
      const searchData = (await searchRes.json()) as {results?: ItunesPodcastEntry[]};
      return searchData.results ?? [];
    } catch {
      return [];
    }
  };

  const checkDirectAudioAlive = async (url: string): Promise<boolean> => {
    try {
      const r = await fetch(url, {
        method: 'HEAD',
        headers: {'User-Agent': 'Hamseda/1.0'},
        redirect: 'follow',
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok && r.status !== 206) return false;
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      return !ct.includes('json') && !ct.includes('html') && !ct.includes('xml');
    } catch {
      return false;
    }
  };

  try {
    const [usPodcasts, corePodcasts, directEpisodes] = await Promise.all([
      fetchItunes(query, 'podcast', 'us', 12),
      coreQuery && normalizeFa(coreQuery) !== normalizeFa(query)
        ? fetchItunes(coreQuery, 'podcast', 'us', 12)
        : Promise.resolve([]),
      coreTokens.length > 0
        ? fetchItunes(coreQuery || query, 'podcastEpisode', 'us', 25)
        : Promise.resolve([]),
    ]);
    const irPodcasts =
      usPodcasts.length + corePodcasts.length < 4
        ? await fetchItunes(coreQuery || query, 'podcast', 'ir', 10)
        : [];

    const podcastMap = new Map<string, ItunesPodcastEntry>();
    const directEpisodesByFeed = new Map<string, Array<{rawAudioUrl: string; ep: ServerPodcastEpisode}>>();

    const registerShow = (p: ItunesPodcastEntry) => {
      const rawFeed = typeof p.feedUrl === 'string' ? p.feedUrl.trim() : '';
      if (!/^https?:\/\/\S+$/i.test(rawFeed) || !isSafePublicAudioUrl(rawFeed)) return '';
      const key = rawFeed.toLowerCase();
      if (!podcastMap.has(key)) {
        podcastMap.set(key, {
          collectionId: p.collectionId,
          collectionName: p.collectionName,
          artistName: p.artistName,
          feedUrl: rawFeed,
          artworkUrl600: p.artworkUrl600,
          artworkUrl100: p.artworkUrl100,
          trackViewUrl: p.trackViewUrl || p.collectionViewUrl,
          primaryGenreName: p.primaryGenreName,
        });
      }
      return key;
    };

    for (const p of [...usPodcasts, ...corePodcasts, ...irPodcasts]) {
      registerShow(p);
    }

    for (const epHit of directEpisodes) {
      const key = registerShow(epHit);
      if (!key || !epHit.episodeUrl || !epHit.trackName) continue;
      const safeEpUrl = isSafePublicAudioUrl(epHit.episodeUrl.trim());
      if (!safeEpUrl) continue;
      const durSec = epHit.trackTimeMillis ? Math.round(epHit.trackTimeMillis / 1000) : 0;
      const durText =
        durSec > 0
          ? `${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, '0')}`
          : undefined;
      const arr = directEpisodesByFeed.get(key) ?? [];
      arr.push({
        rawAudioUrl: safeEpUrl.href,
        ep: {
          title: epHit.trackName.trim(),
          audioUrl: wrapRadioStreamUrl(safeEpUrl.href),
          publishedAt: epHit.releaseDate ? epHit.releaseDate.slice(0, 10) : undefined,
          duration: durText,
          description: (epHit.shortDescription || epHit.description || '').slice(0, 280) || undefined,
        },
      });
      directEpisodesByFeed.set(key, arr);
    }

    const candidateFeeds = Array.from(podcastMap.entries()).slice(0, 10);

    const scoredResults = await Promise.all(
      candidateFeeds.map(async ([feedKey, podcast]) => {
        const allParsedEpisodes: ServerPodcastEpisode[] = [];
        const seenEpTitles = new Set<string>();
        let rssReachableWithItems = false;

        try {
          const feedRes = await fetch(podcast.feedUrl!, {
            headers: {'User-Agent': 'Hamseda/1.0'},
            signal: AbortSignal.timeout(7000),
          });
          if (feedRes.ok) {
            const xml = await feedRes.text();
            const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
            if (items.length > 0) rssReachableWithItems = true;
            for (const item of items) {
              const titleMatch = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
              const enclosureMatch = item.match(/<enclosure\b[^>]*\burl=["']([^"']+)["']/i);
              const mediaContentMatch = item.match(/<media:content\b[^>]*\burl=["']([^"']+)["']/i);
              const dateMatch = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
              const durationMatch = item.match(/<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/i);
              const descriptionMatch = item.match(
                /<(?:description|itunes:summary)[^>]*>([\s\S]*?)<\/(?:description|itunes:summary)>/i
              );
              const rawAudioUrl = unescapeXmlEntities(enclosureMatch?.[1] || mediaContentMatch?.[1] || '');
              const safeAudio = isSafePublicAudioUrl(rawAudioUrl);
              if (!safeAudio) continue;
              const cleanTitle = decodeXml(titleMatch?.[1] ?? 'قسمت بدون عنوان');
              const tKey = normalizeFa(cleanTitle);
              if (tKey && seenEpTitles.has(tKey)) continue;
              if (tKey) seenEpTitles.add(tKey);
              allParsedEpisodes.push({
                title: cleanTitle,
                audioUrl: wrapRadioStreamUrl(safeAudio.href),
                publishedAt: dateMatch ? decodeXml(dateMatch[1]) : undefined,
                duration: durationMatch ? decodeXml(durationMatch[1]) : undefined,
                description: descriptionMatch ? decodeXml(descriptionMatch[1]).slice(0, 320) : undefined,
              });
            }
          }
        } catch {
          // RSS unavailable or timed out
        }

        // Merge direct iTunes episode hits (rescues older SoundCloud/Anchor items missing from RSS head),
        // but skip dead deleted feeds where RSS was 0 items AND direct audio returns 404.
        const directHits = directEpisodesByFeed.get(feedKey) ?? [];
        if (directHits.length > 0) {
          const canUseDirect =
            rssReachableWithItems || (await checkDirectAudioAlive(directHits[0].rawAudioUrl));
          if (canUseDirect) {
            for (const hit of directHits) {
              const tKey = normalizeFa(hit.ep.title);
              if (tKey && seenEpTitles.has(tKey)) continue;
              if (tKey) seenEpTitles.add(tKey);
              allParsedEpisodes.push(hit.ep);
            }
          }
        }

        // Score & categorize episodes against coreTokens
        const showTitleNorm = normalizeFa(podcast.collectionName || '');
        const showTitleMatchesAll =
          coreTokens.length > 0 && coreTokens.every((t) => showTitleNorm.includes(t));

        const strongTitleMatches: ServerPodcastEpisode[] = [];
        const weakOrDescMatches: ServerPodcastEpisode[] = [];
        const nonMatchingEpisodes: ServerPodcastEpisode[] = [];

        if (coreTokens.length > 0) {
          for (const ep of allParsedEpisodes) {
            const tNorm = normalizeFa(ep.title);
            const dNorm = normalizeFa(ep.description || '');
            const titleHits = coreTokens.filter((t) => tNorm.includes(t)).length;
            const descHits = coreTokens.filter((t) => dNorm.includes(t)).length;
            if (titleHits === coreTokens.length) {
              strongTitleMatches.push(ep);
            } else if (
              (coreTokens.length >= 3 && titleHits >= Math.ceil(coreTokens.length / 2)) ||
              descHits === coreTokens.length
            ) {
              weakOrDescMatches.push(ep);
            } else {
              nonMatchingEpisodes.push(ep);
            }
          }
        }

        const matchedEpisodes =
          strongTitleMatches.length > 0 ? strongTitleMatches : weakOrDescMatches;
        const otherEpisodes =
          strongTitleMatches.length > 0
            ? [...weakOrDescMatches, ...nonMatchingEpisodes]
            : nonMatchingEpisodes;

        // If user searched a specific series/audiobook and episodes are numbered (اپیزود اول، دوم...)
        // sort matched episodes ascending from part 1 -> N so listening starts cleanly at Chapter 1!
        if (matchedEpisodes.length >= 2 || (showTitleMatchesAll && allParsedEpisodes.length >= 2)) {
          const targetArr = matchedEpisodes.length >= 2 ? matchedEpisodes : allParsedEpisodes;
          const orders = targetArr.map((ep) => extractEpisodeOrder(ep.title));
          if (orders.filter((n) => n !== null).length >= Math.min(3, targetArr.length)) {
            targetArr.sort((a, b) => {
              const oa = extractEpisodeOrder(a.title);
              const ob = extractEpisodeOrder(b.title);
              if (oa !== null && ob !== null) return oa - ob;
              if (oa !== null) return -1;
              if (ob !== null) return 1;
              return 0;
            });
          }
        }

        const primaryEpisodes =
          matchedEpisodes.length > 0
            ? matchedEpisodes.slice(0, 60)
            : allParsedEpisodes.slice(0, showTitleMatchesAll ? 60 : 20);
        const secondaryEpisodes =
          matchedEpisodes.length > 0 ? otherEpisodes.slice(0, 25) : [];

        const score =
          (primaryEpisodes.length > 0 ? 50 : -500) +
          (showTitleMatchesAll ? 200 : 0) +
          matchedEpisodes.length * 20;

        return {
          score,
          matchedCount: matchedEpisodes.length,
          showTitleMatchesAll,
          podcast: {
            id: String(podcast.collectionId ?? podcast.feedUrl),
            title: podcast.collectionName ?? 'پادکست بدون نام',
            author: podcast.artistName ?? '',
            artworkUrl: podcast.artworkUrl600 ?? podcast.artworkUrl100 ?? '',
            feedUrl: podcast.feedUrl,
            externalUrl: podcast.trackViewUrl ?? podcast.feedUrl,
            category: podcast.primaryGenreName ?? '',
            totalEpisodes: allParsedEpisodes.length,
            totalFeedEpisodes: allParsedEpisodes.length,
            matchedCount: matchedEpisodes.length,
            episodes: primaryEpisodes,
            otherEpisodes: secondaryEpisodes,
          },
        };
      })
    );

    const withPlayable = scoredResults.filter((r) => r.podcast.episodes.length > 0);
    const pool = withPlayable.length > 0 ? withPlayable : scoredResults;
    const hasTopicMatches =
      coreTokens.length > 0 &&
      pool.some((r) => r.matchedCount > 0 || r.showTitleMatchesAll);
    const filteredPool = hasTopicMatches
      ? pool.filter((r) => r.matchedCount > 0 || r.showTitleMatchesAll)
      : pool;

    filteredPool.sort((a, b) => b.score - a.score);

    res.json({
      query,
      coreQuery: coreQuery || undefined,
      podcasts: filteredPool.map((r) => r.podcast),
      fetchedAt: Date.now(),
    });
  } catch (err) {
    console.error('Podcast search failed:', err);
    res.status(502).json({error: 'جستجوی پادکست موقتاً در دسترس نیست؛ اتصال اینترنت را بررسی کنید.'});
  }
});

function isQuotaExhaustedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota');
}

function isModelNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('404') || msg.includes('NOT_FOUND');
}

function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('timed out') || msg.includes('AbortError');
}

function markTextModelCooldown(modelName: string, err: unknown): void {
  if (isQuotaExhaustedError(err) || isModelNotFoundError(err)) {
    const cooldownMs = isModelNotFoundError(err) ? 60 * 60 * 1000 : 15 * 60 * 1000;
    textModelCooldownUntil.set(modelName, Date.now() + cooldownMs);
  } else if (isTimeoutError(err)) {
    textModelCooldownUntil.set(modelName, Date.now() + 2 * 60 * 1000);
  }
}

function getAvailableTextModels(): string[] {
  const now = Date.now();
  return ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'].filter(
    (m) => now >= (textModelCooldownUntil.get(m) ?? 0)
  );
}

app.post('/api/assistant-chat', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({error: 'موتور گفت‌وگوی آنلاین در دسترس نیست.'});
    return;
  }

  const assistantName = typeof req.body?.assistantName === 'string' ? req.body.assistantName.slice(0, 40) : 'هم‌صدا';
  const selfName = typeof req.body?.selfName === 'string' ? req.body.selfName.slice(0, 60) : 'دوست من';
  const partnerName = typeof req.body?.partnerName === 'string' ? req.body.partnerName.slice(0, 60) : '';
  const userMessage = typeof req.body?.userMessage === 'string' ? req.body.userMessage.trim().slice(0, 4000) : '';
  const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
  const history = rawHistory
    .filter((item: {role?: string; text?: string}) =>
      (item?.role === 'user' || item?.role === 'assistant') &&
      typeof item?.text === 'string' && item.text.trim()
    )
    .slice(-12)
    .map((item: {role: 'user' | 'assistant'; text: string}) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{text: item.text.slice(0, 2000)}],
    }));

  if (!userMessage) {
    res.status(400).json({error: 'پیام خالی است.'});
    return;
  }

  try {
    const availableModels = getAvailableTextModels();
    const chatAttempts: Array<{model: string; useThinking: boolean}> = [];
    for (const model of availableModels) {
      if (model === 'gemini-4-hydrogen') {
        chatAttempts.push({model, useThinking: true});
        chatAttempts.push({model, useThinking: false});
      } else {
        chatAttempts.push({model, useThinking: false});
      }
    }
    const chatSystem = `تو مغز گفت‌وگوی «${assistantName}» هستی؛ یک همراه فارسی‌زبان صمیمی، باهوش، دقیق و طبیعی برای ${selfName}${partnerName ? ` و خانواده‌اش، از جمله ${partnerName}` : ''}.
قواعد:
- فارسی محاوره‌ای روان و طبیعی بنویس؛ نه لحن اداری، نه جمله‌های رباتی و کلیشه‌ای.
- سابقه همین مکالمه را واقعاً دنبال کن؛ اگر کاربر به «این»، «اون»، «همون» یا حرف قبلی اشاره کرد، از تاریخچه برای فهم منظور استفاده کن.
- پاسخ را متناسب با سؤال بده؛ برای سؤال ساده کوتاه و برای موضوع پیچیده با توضیح کافی.
- اگر چیزی را نمی‌دانی، صادقانه بگو و اطلاعات یا خاطره‌ای جعل نکن.
- تو فقط موتور گفت‌وگویی هستی و به‌تنهایی هیچ تماس، پیام، خرید یا تغییر تنظیمات گوشی را اجرا نمی‌کنی. هر درخواست اجرایی باید به مسیریاب فرمان برنامه سپرده شود؛ هرگز ادعا نکن کاری انجام شده است.
- پاسخ را بدون عنوان و قالب JSON، فقط به صورت متن فارسی برگردان.`;

    let replyText = '';
    let lastChatErr: unknown = null;
    for (const attempt of chatAttempts) {
      if (Date.now() < (textModelCooldownUntil.get(attempt.model) ?? 0)) {
        continue;
      }
      try {
        const response = await withPromiseTimeout(
          ai.models.generateContent({
            model: attempt.model,
            contents: [
              ...history,
              {role: 'user', parts: [{text: userMessage}]},
            ],
            config: {
              systemInstruction: chatSystem,
              ...(attempt.useThinking ? {thinkingConfig: {thinkingLevel: ThinkingLevel.LOW}} : {}),
            },
          }),
          13000,
          `Assistant chat (${attempt.model})`
        );
        const parts = response.candidates?.[0]?.content?.parts ?? [];
        const partsText = parts
          .filter((p) => typeof p?.text === 'string' && !(p as {thought?: boolean}).thought)
          .map((p) => p.text || '')
          .join('')
          .trim();
        replyText = (response.text || partsText || '').trim();
        if (replyText) break;
      } catch (modelErr) {
        lastChatErr = modelErr;
        markTextModelCooldown(attempt.model, modelErr);
        if (isQuotaExhaustedError(modelErr)) {
          console.info(`Assistant chat quota cooldown activated for ${attempt.model}.`);
        } else {
          console.warn(
            `Assistant chat on ${attempt.model} (thinking=${attempt.useThinking}) failed:`,
            modelErr instanceof Error ? modelErr.message.slice(0, 180) : modelErr
          );
        }
      }
    }

    if (!replyText) {
      if (availableModels.length === 0 || isQuotaExhaustedError(lastChatErr)) {
        res.status(429).json({
          error:
            'سهمیه رایگان روزانه مدل هوشمند پر شده است. می‌توانید در Settings > Secrets کلید دارای صورتحساب متصل کنید یا فعلاً از حالت آفلاین استفاده کنید.',
          quotaExceeded: true,
        });
        return;
      }
      if (lastChatErr) {
        console.error('Assistant conversation engine failed:', lastChatErr);
      }
      res.status(502).json({error: 'پاسخ خالی از موتور گفت‌وگو دریافت شد.'});
      return;
    }
    res.json({replyText});
  } catch (err) {
    console.error('Assistant conversation engine failed:', err);
    res.status(500).json({error: 'موتور گفت‌وگو نتوانست پاسخ بسازد.'});
  }
});

type PublicSearchResult = {title: string; url: string; snippet: string};

function decodeSearchHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapSearchUrl(rawUrl: string, base: string): string {
  try {
    const parsed = new URL(rawUrl, base);
    const redirected =
      parsed.searchParams.get('q') ||
      parsed.searchParams.get('uddg') ||
      parsed.searchParams.get('url');
    const candidate = redirected ? decodeURIComponent(redirected) : parsed.href;
    if (
      /^https?:\/\//i.test(candidate) &&
      !/^(https?:\/\/)?(www\.)?(google|duckduckgo)\.com\//i.test(candidate)
    ) {
      return candidate;
    }
  } catch {
    // Ignore malformed result links.
  }
  return '';
}

async function searchPublicWeb(query: string): Promise<PublicSearchResult[]> {
  const cleanQuery = query.trim().slice(0, 240);
  if (!cleanQuery) return [];

  const engines = [
    {kind: 'bing' as const, url: 'https://www.bing.com/search?q=' + encodeURIComponent(cleanQuery)},
    {kind: 'duckduckgo' as const, url: 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(cleanQuery)},
    {kind: 'google' as const, url: 'https://www.google.com/search?hl=fa&num=10&q=' + encodeURIComponent(cleanQuery)},
  ];

  const parseResults = (html: string, kind: 'bing' | 'duckduckgo' | 'google'): PublicSearchResult[] => {
    const found: PublicSearchResult[] = [];
    const seen = new Set<string>();
    const add = (rawHref: string, rawTitle: string, rawSnippet: string) => {
      const href = rawHref.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      const url = unwrapSearchUrl(href, kind === 'duckduckgo' ? 'https://html.duckduckgo.com' : kind === 'bing' ? 'https://www.bing.com' : 'https://www.google.com');
      const title = decodeSearchHtml(rawTitle).replace(/\s+/g, ' ').trim();
      const snippet = decodeSearchHtml(rawSnippet).replace(/\s+/g, ' ').trim();
      if (!url || !title || seen.has(url) || !/^https?:\/\//i.test(url)) return;
      seen.add(url);
      found.push({title: title.slice(0, 160), url, snippet: snippet.slice(0, 500)});
    };

    if (kind === 'bing') {
      const blocks = [...html.matchAll(/<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)];
      for (const block of blocks) {
        const anchor = block[1].match(/<h2\b[^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!anchor) continue;
        const snippet = block[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
        add(anchor[1], anchor[2], snippet);
        if (found.length >= 8) break;
      }
    } else if (kind === 'duckduckgo') {
      const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
        .filter((match) => /\bresult__a\b/i.test(match[1]));
      for (let i = 0; i < anchors.length; i++) {
        const match = anchors[i];
        const href = match[1].match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
        const start = (match.index ?? 0) + match[0].length;
        const end = anchors[i + 1]?.index ?? Math.min(html.length, start + 2600);
        const block = html.slice(start, end);
        const snippet = block.match(/<(?:a|div)\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i)?.[1] || '';
        add(href, match[2], snippet);
        if (found.length >= 8) break;
      }
    } else {
      const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?<h3\b[\s\S]*?<\/h3>[\s\S]*?)<\/a>/gi)];
      for (let i = 0; i < anchors.length; i++) {
        const match = anchors[i];
        const href = match[1].match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
        const next = anchors[i + 1]?.index ?? Math.min(html.length, (match.index ?? 0) + 4200);
        add(href, match[2], html.slice((match.index ?? 0) + match[0].length, next));
        if (found.length >= 8) break;
      }
    }
    return found;
  };

  const attempts = await Promise.allSettled(engines.map(async (engine) => {
    const response = await fetch(engine.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return [];
    return parseResults(await response.text(), engine.kind);
  }));

  const merged: PublicSearchResult[] = [];
  const seen = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.status !== 'fulfilled') continue;
    for (const result of attempt.value) {
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      merged.push(result);
    }
  }
  return merged.slice(0, 10);
}
async function fetchPublicPageContent(rawUrl: string): Promise<string> {
  const safe = isSafePublicAudioUrl(rawUrl);
  if (!safe) return '';
  try {
    const r = await fetch(safe.href, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,text/plain',
        'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(2400),
    });
    if (!r.ok) return '';
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('text/plain') && !ct.includes('xhtml')) {
      return '';
    }
    const rawHtml = await r.text();
    const cleaned = rawHtml
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|tr|h[1-6]|br|td|th)>/gi, ' \n ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&zwnj;/gi, '\u200c')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
    if (!cleaned) return '';

    // Grab top window plus any key mid-page section (prioritize "مواد لازم", "نرخ فعلی", etc.)
    const head = cleaned.slice(0, 900);
    const bodyAfterIntro = cleaned.slice(600);
    const keyMatch =
      bodyAfterIntro.match(/(مواد لازم|نرخ فعلی|جدول قیمت|طلای ۱۸ عیار|طلای 18 عیار)/i) ??
      bodyAfterIntro.match(/(طرز تهیه|دستور پخت|قیمت لحظه|دمای هوا|پیش‌بینی)/i);
    if (keyMatch && keyMatch.index !== undefined) {
      const start = Math.max(600, 600 + keyMatch.index - 80);
      const focused = cleaned.slice(start, start + 2600);
      return `${head}\n...\n${focused}`.slice(0, 3600);
    }
    return cleaned.slice(0, 3400);
  } catch {
    return '';
  }
}

function describeWmoWeatherCode(code: number): string {
  if (code === 0) return 'صاف و آفتابی';
  if (code === 1 || code === 2) return 'کمی تا نیمه‌ابری';
  if (code === 3) return 'ابری';
  if (code === 45 || code === 48) return 'مه‌آلود';
  if ([51, 53, 55, 56, 57].includes(code)) return 'نم‌نم باران';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'بارانی';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'برفی';
  if ([95, 96, 99].includes(code)) return 'رگبار و رعدوبرق';
  return 'معتدل';
}

async function fetchWeatherSummaryIfRelevant(query: string): Promise<string> {
  const isWeather = /(آب\s*و\s*هوا|اب\s*و\s*هوا|آب‌وهوا|هواشناسی|دمای\s*هوا|وضعیت\s*هوا|هوای\s+[\u0600-\u06ff]{2,})/.test(
    query
  );
  if (!isWeather) return '';

  const stopWords = new Set([
    'آب', 'و', 'هوا', 'هوای', 'آب‌وهوا', 'اب', 'هواشناسی', 'دمای', 'دما', 'وضعیت',
    'امروز', 'فردا', 'پس‌فردا', 'الان', 'فعلی', 'چطوره', 'چگونه', 'است', 'چنده', 'چند',
    'درجه', 'شهر', 'استان', 'بگو', 'لطفاً', 'لطفا', 'را', 'رو', 'در', 'به',
  ]);
  const tokens = query
    .replace(/[^\p{L}\p{N}\s\u200c]+/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopWords.has(t));
  const cityCandidate = tokens.join(' ').trim() || 'تهران';

  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityCandidate)}&count=1&language=fa`,
      {signal: AbortSignal.timeout(4000)}
    );
    if (!geoRes.ok) return '';
    const geoData = (await geoRes.json()) as {
      results?: Array<{name?: string; country?: string; latitude?: number; longitude?: number}>;
    };
    const loc = geoData.results?.[0];
    if (!loc || loc.latitude === undefined || loc.longitude === undefined) return '';

    const forecastRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`,
      {signal: AbortSignal.timeout(4000)}
    );
    if (!forecastRes.ok) return '';
    const w = (await forecastRes.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        wind_speed_10m?: number;
        weather_code?: number;
      };
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
      };
    };
    const temp = w.current?.temperature_2m;
    const hum = w.current?.relative_humidity_2m;
    const wind = w.current?.wind_speed_10m;
    const cond = describeWmoWeatherCode(Number(w.current?.weather_code ?? 0));
    const maxToday = w.daily?.temperature_2m_max?.[0];
    const minToday = w.daily?.temperature_2m_min?.[0];
    const maxTomorrow = w.daily?.temperature_2m_max?.[1];
    const minTomorrow = w.daily?.temperature_2m_min?.[1];

    if (temp === undefined) return '';
    const parts = [
      `هوای فعلی ${loc.name || cityCandidate}: ${cond}، دمای ${temp} درجه سانتی‌گراد`,
    ];
    if (minToday !== undefined && maxToday !== undefined) {
      parts.push(`کمینه امروز ${minToday} و بیشینه ${maxToday} درجه`);
    }
    if (hum !== undefined) parts.push(`رطوبت ${hum} درصد`);
    if (wind !== undefined) parts.push(`سرعت باد ${wind} کیلومتر بر ساعت`);
    if (minTomorrow !== undefined && maxTomorrow !== undefined) {
      parts.push(`پیش‌بینی فردا بین ${minTomorrow} تا ${maxTomorrow} درجه`);
    }
    return parts.join('، ') + '.';
  } catch {
    return '';
  }
}

function buildDeterministicContentFallback(
  query: string,
  results: PublicSearchResult[],
  pageTexts: string[],
  weatherSummary: string
): string {
  if (weatherSummary) return weatherSummary;

  const isPriceQuery = /(قیمت|نرخ|دلار|طلا|سکه|ارز|تومان|ریال|بورس|خودرو)/.test(query);
  const isRecipeQuery = /(دستور|طرز تهیه|پخت|درست کردن|مواد لازم|غذا|خورش|خورشت|پلو|کباب|آش|سوپ|کیک|دسر)/.test(
    query
  );

  if (isPriceQuery) {
    const allLines = pageTexts.flatMap((t) =>
      (t || '')
        .split(/\n+|(?<=[.!؟])\s+/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter((l) => l.length >= 16 && l.length <= 260)
    );
    const strictPriceLines = allLines.filter(
      (l) =>
        /(\d[\d,٬.]{3,})/.test(l) &&
        /(تومان|ریال|نرخ فعلی|قیمت لحظه|دلار|سکه|طلای ۱۸|طلای 18|گرم طلا)/.test(l) &&
        !/(استاندارد جهانی|تقسیم کنیم|تعریف)/.test(l)
    );
    if (strictPriceLines.length > 0) {
      return strictPriceLines.slice(0, 3).join(' — ');
    }
  }

  for (const text of pageTexts) {
    if (!text) continue;
    const lines = text
      .split(/\n+|(?<=[.!؟])\s+/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length >= 25 && l.length <= 260)
      .filter(
        (l) =>
          !/^(خانه|صفحه نخست|منو|جستجو|ورود|ثبت‌نام|ثبت نام|کلیه حقوق|تبلیغات|نظر|دیدگاه|لینک کوتاه)/i.test(l)
      );

    if (isPriceQuery) {
      const priceLines = lines.filter((l) => /(\d[\d,٬.]{3,})/.test(l) && /(تومان|ریال|دلار|طلا|سکه|نرخ|قیمت)/.test(l));
      if (priceLines.length > 0) {
        return priceLines.slice(0, 3).join(' — ');
      }
    }

    if (isRecipeQuery) {
      const recipeStartIdx = text.search(/مواد لازم/i);
      const focusedSlice = recipeStartIdx >= 0 ? text.slice(recipeStartIdx, recipeStartIdx + 1200) : '';
      const focusedLines = (focusedSlice || text)
        .split(/\n+|(?<=[.!؟])\s+/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter((l) => l.length >= 12 && l.length <= 240);
      const ingLines = focusedLines.filter((l) =>
        /(مواد لازم|گرم|قاشق|پیمانه|عدد|کیلو|لیوان|فنجان|تفت|سرخ کنید|بپزید|اضافه کنید|دم بکشد|آب بریزید|خیس کنید)/.test(l)
      );
      if (ingLines.length >= 2) {
        return ingLines.slice(0, 6).join('، ');
      }
    }

    const keywords = query
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    const matchingLines = lines.filter((l) => keywords.some((k) => l.includes(k)));
    if (matchingLines.length >= 2) {
      return matchingLines.slice(0, 3).join(' ');
    }
  }

  return results
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.title}: ${item.snippet || item.url}`)
    .join('\n');
}

function withPromiseTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

app.post('/api/assistant-command', async (req, res) => {
  const utterance = typeof req.body?.utterance === 'string' ? req.body.utterance.trim() : '';
  if (!utterance) {
    res.status(400).json({error: 'دستور یا سوالی دریافت نشد.'});
    return;
  }

  const assistantName =
    typeof req.body?.assistantName === 'string' && req.body.assistantName.trim()
      ? req.body.assistantName.trim()
      : 'هم‌صدا';
  const deviceOwner = req.body?.deviceOwner === 'zari' ? 'zari' : 'man';
  const myName = typeof req.body?.myName === 'string' && req.body.myName.trim() ? req.body.myName.trim() : 'بهمن';
  const partnerName =
    typeof req.body?.partnerName === 'string' && req.body.partnerName.trim() ? req.body.partnerName.trim() : 'زری';
  const ownerSelf = deviceOwner === 'zari' ? partnerName : myName;
  const partnerOther = deviceOwner === 'zari' ? myName : partnerName;

  const localTimeText = typeof req.body?.localTimeText === 'string' ? req.body.localTimeText.trim() : '';
  const jalaliDate = typeof req.body?.jalaliDate === 'string' ? req.body.jalaliDate.trim() : '';
  const rawContacts = Array.isArray(req.body?.contacts) ? (req.body.contacts as {name?: string; phone?: string; persianPhonetic?: string}[]) : [];
  const needsContactsInPrompt = /(تماس|زنگ|شماره|پیام|مسیج|اس ام اس|اس‌ام‌اس|بفرست|بگو به|به .* بگو)/.test(
    utterance
  );
  const compactContacts = needsContactsInPrompt
    ? rawContacts
        .filter((c) => c && typeof c.name === 'string' && c.name.trim())
        .slice(0, 60)
        .map((c) => ({
          name: String(c.name).trim(),
          phone: String(c.phone || '').trim(),
          phonetic: String(c.persianPhonetic || '').trim(),
        }))
    : [];

  const ai = getAiClient();
  const isDirectLiveWebQuery =
    /(جستجو|جست‌وجو|جست و جو|سرچ|تو اینترنت|در اینترنت|تو وب|آب و هوا|اب و هوا|آب‌وهوا|هواشناسی|دمای هوا|وضعیت هوا|هوای |قیمت|نرخ|دلار|طلا|سکه|بورس|اخبار|خبر امروز|نتیجه بازی|امروز چنده|چند است|چقدر است|دستور پخت|طرز تهیه|مواد لازم|چطوری درست|چطور درست)/.test(
      utterance
    ) && !/(تماس|زنگ|پیامک|اس ام اس|باز کن|تلگرام|واتساپ|تایمر|آلارم|چراغ|رادیو|پادکست|موزیک)/.test(utterance);

  if (!ai && !isDirectLiveWebQuery) {
    res.status(503).json({
      error: 'سرویس هوشمند آنلاین موقتاً در دسترس نیست؛ دستورات آفلاین همچنان فعالند.',
      offlineFallback: true,
    });
    return;
  }

  try {
    const prompt = `تو «${assistantName}» دستیار صوتی شخصی و همه‌کاره روی گوشی «${ownerSelf}» هستی (همراه زندگی او: «${partnerOther}»).
زمان فعلی گوشی: ${localTimeText || 'نامشخص'} — تاریخ امروز: ${jalaliDate || 'امروز'}.
${compactContacts.length > 0 ? `مخاطبین دفترچه تلفن برای تطبیق نام و شماره:\n${JSON.stringify(compactContacts)}` : ''}

درخواست ${ownerSelf}:
"${utterance}"

وظیفه:
۱. تشخیص بده کدام action دقیقاً اجرا شود:
- web_search: جستجوی زنده در اینترنت، اخبار روز، قیمت ارز/طلا/خودرو، آب‌وهوا، دستور پخت، آموزش، پیدا کردن سایت یا منبع دانلود و هر اطلاعات جدید اینترنتی (query را بنویس).
- download_url: وقتی کاربر لینک مستقیم دانلود می‌خواهد یا آدرس دانلود داده (اگر آدرس https:// مشخص نیست، query را بنویس تا با جستجوی اینترنتی لینک پیدا شود؛ اگر آدرس مشخص است در downloadUrl بگذار).
- open_url: باز کردن مستقیم یک سایت یا آدرس اینترنتی در مرورگر گوشی (آدرس کامل در downloadUrl یا query).
- open_app: باز کردن هر برنامه نصب‌شده روی گوشی مثل تلگرام، واتساپ، اینستاگرام، نشان، بلد، گوگل مپ، روبیکا، ایتا، اسنپ، ماشین حساب، تنظیمات، کروم، یوتیوب، گالری و... (نام برنامه در targetName).
- open_navigation: مسیریابی و باز کردن نقشه تا یک مکان یا آدرس (نام مقصد در query).
- flashlight_on / flashlight_off: روشن یا خاموش کردن چراغ قوه گوشی.
- open_wifi_settings / open_bluetooth_settings / open_mobile_data_settings / open_location_settings: باز کردن پنل سریع وای‌فای، اینترنت همراه، بلوتوث یا GPS.
- set_alarm / set_timer: تنظیم ساعت بیدارباش (alarmHour, alarmMinute با فرمت ۲۴ ساعته، عنوان در goalTitle) یا تایمر (timerMinutes به دقیقه).
- brightness_up / brightness_down / brightness_max / brightness_min: کم و زیاد کردن نور صفحه نمایش.
- tell_time: پرسیدن ساعت یا تاریخ امروز.
- ask_sms_body: درخواست ارسال پیامک به یک شخص وقتی متن پیامک هنوز گفته نشده.
- send_sms: ارسال پیامک وقتی هم مخاطب و هم متن پیام هر دو مشخص هستند (smsBody پر شود).
- make_call / end_call: برقراری تماس یا قطع تماس تلفنی.
- volume_up / volume_down / volume_max / volume_mute: تنظیم بلندی صدا.
- ringer_silent / ringer_vibrate / ringer_normal: گذاشتن گوشی روی سایلنت، ویبره یا حالت عادی.
- take_photo / record_video: باز کردن دوربین عکس یا فیلم‌برداری.
- record_audio_start / record_audio_stop: شروع یا توقف ضبط صدا.
- play_radio / play_music / play_podcast / stop_audio: پخش رادیو زنده، موزیک شبانه، جستجوی پادکست و توقف پخش.
- open_tab: باز کردن یکی از بخش‌های برنامه (tab: today | assistant | gratitude | night | voice | caller | sync). اگر کاربر بخش‌های داخلی امروز را خواست todaySection را یکی از planner | shopping_meals | finance_bills | health_vault | growth_lab بگذار.
- add_goal: افزودن یک هدف/یادآور جدید به لیست امروز (goalTitle پر شود).
- add_shopping_item: افزودن یک یا چند مورد به لیست خرید خانه (shoppingItems آرایه رشته‌ها پر شود).
- add_expense: ثبت هزینه روزانه به تومان (expenseTitle عنوان هزینه، expenseAmount مبلغ عدد صحیح به تومان، expenseCategory یکی از food | bills | transport | health | family | other).
- daily_briefing: گزارش هوشمند ۳۰ ثانیه‌ای صبحگاهی یا جمع‌بندی امشب (briefingMode: morning | evening).
- open_drive_mode: باز کردن حالت ایمن رانندگی با دکمه‌های بزرگ.
- daily_english: خواندن ۵ عبارت انگلیسی روزمره امروز همراه با تلفظ و ترجمه فارسی.
- answer: گفت‌وگو، مشورت یا پرسش عمومی. اگر پاسخ به اطلاعات به‌روز اینترنتی نیاز دارد needsLiveWeb را true کن.

۲. اگر در مخاطبین اسم مشابه یا هم‌آوا پیدا شد، دقیق‌ترین targetName و targetPhone را پر کن؛ اگر تطبیق مبهم است، مخاطب را حدس نزن و سؤال روشن‌کننده بپرس.
۳. اگر کاربر نام برنامه «تلگرام» را گفت و درخواست پیام دادن داشت، هرگز آن را به پیامک تبدیل نکن؛ action را open_app با targetName «تلگرام» قرار بده و توضیح بده ارسال پیام تلگرام باید داخل خود برنامه انجام شود.
۴. هرگز ادعا نکن پیام ارسال شده است؛ ارسال پیامک نیازمند تأیید صریح کاربر در مرحله بعدی است.
۵. replyText را به فارسی محاوره‌ای بسیار گرم و کوتاه (۱ تا ۲ جمله برای خواندن با صدای بلند) بنویس.`;

    const routerSchema = {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: [
            'answer',
            'web_search',
            'download_url',
            'open_url',
            'open_app',
            'open_navigation',
            'flashlight_on',
            'flashlight_off',
            'open_wifi_settings',
            'open_bluetooth_settings',
            'open_mobile_data_settings',
            'open_location_settings',
            'set_alarm',
            'set_timer',
            'brightness_up',
            'brightness_down',
            'brightness_max',
            'brightness_min',
            'tell_time',
            'ask_sms_body',
            'send_sms',
            'make_call',
            'end_call',
            'volume_up',
            'volume_down',
            'volume_max',
            'volume_mute',
            'ringer_silent',
            'ringer_vibrate',
            'ringer_normal',
            'take_photo',
            'record_video',
            'record_audio_start',
            'record_audio_stop',
            'open_tab',
            'play_radio',
            'play_music',
            'play_podcast',
            'stop_audio',
            'add_goal',
            'add_gratitude',
            'add_shopping_item',
            'add_expense',
            'daily_briefing',
            'open_drive_mode',
            'daily_english',
          ],
        },
        replyText: {type: Type.STRING, description: 'Short warm spoken Persian reply for TTS'},
        needsLiveWeb: {type: Type.BOOLEAN, description: 'True if real-time web lookup improves the answer'},
        targetName: {type: Type.STRING, description: 'Matched contact name or app name'},
        targetPhone: {type: Type.STRING, description: 'Matched phone number if call/SMS'},
        smsBody: {type: Type.STRING, description: 'SMS body text if already spoken'},
        tab: {type: Type.STRING, description: 'Target app tab id if open_tab'},
        todaySection: {type: Type.STRING, description: 'Sub-section inside today tab: planner | shopping_meals | finance_bills | health_vault | growth_lab'},
        query: {type: Type.STRING, description: 'Search, music, radio, or navigation query'},
        goalTitle: {type: Type.STRING, description: 'Goal text or alarm label'},
        shoppingItems: {type: Type.ARRAY, items: {type: Type.STRING}, description: 'List of items to add to shopping list'},
        expenseTitle: {type: Type.STRING, description: 'Expense title if add_expense'},
        expenseAmount: {type: Type.INTEGER, description: 'Expense amount in Toman if add_expense'},
        expenseCategory: {type: Type.STRING, description: 'Expense category: food | bills | transport | health | family | other'},
        briefingMode: {type: Type.STRING, description: 'morning or evening if daily_briefing'},
        downloadUrl: {type: Type.STRING, description: 'Explicit https URL if user gave one or website domain'},
        downloadTitle: {type: Type.STRING, description: 'Short file/page title'},
        alarmHour: {type: Type.INTEGER, description: 'Alarm hour 0-23 if set_alarm'},
        alarmMinute: {type: Type.INTEGER, description: 'Alarm minute 0-59 if set_alarm'},
        timerMinutes: {type: Type.INTEGER, description: 'Timer duration in minutes if set_timer'},
      },
      required: ['action', 'replyText'],
    };

    type ParsedAssistantCommand = {
      action?: string;
      replyText?: string;
      needsLiveWeb?: boolean;
      targetName?: string;
      targetPhone?: string;
      smsBody?: string;
      tab?: string;
      todaySection?: string;
      query?: string;
      goalTitle?: string;
      shoppingItems?: string[];
      expenseTitle?: string;
      expenseAmount?: number;
      expenseCategory?: string;
      briefingMode?: 'morning' | 'evening';
      downloadUrl?: string;
      downloadTitle?: string;
      alarmHour?: number;
      alarmMinute?: number;
      timerMinutes?: number;
      links?: {title: string; url: string}[];
    };

    const extractJsonObject = (raw: string): ParsedAssistantCommand | null => {
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      if (!cleaned) return null;
      try {
        return JSON.parse(cleaned) as ParsedAssistantCommand;
      } catch {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          try {
            return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as ParsedAssistantCommand;
          } catch {
            return null;
          }
        }
        return null;
      }
    };

    let parsed: ParsedAssistantCommand | null = null;
    let lastRouterErr: unknown = null;
    let fastWebRouted = false;

    if (isDirectLiveWebQuery) {
      fastWebRouted = true;
      parsed = {
        action: 'web_search',
        query: utterance,
        replyText: 'در حال بررسی نتایج زنده اینترنت هستم.',
      };
    } else if (ai) {
      for (const modelName of getAvailableTextModels()) {
        try {
          const timeoutMs = modelName === 'gemini-4-hydrogen' ? 8500 : 10000;
          const response = await withPromiseTimeout(
            ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                ...(modelName === 'gemini-4-hydrogen' ? {thinkingConfig: {thinkingLevel: ThinkingLevel.LOW}} : {}),
                responseMimeType: 'application/json',
                responseSchema: routerSchema,
              },
            }),
            timeoutMs,
            `Assistant command router (${modelName})`
          );
          const candidate = extractJsonObject(response.text ?? '');
          if (candidate && candidate.action) {
            parsed = candidate;
            break;
          }
        } catch (routerErr) {
          lastRouterErr = routerErr;
          markTextModelCooldown(modelName, routerErr);
          console.info(
            `Assistant router on ${modelName} switched to fallback:`,
            routerErr instanceof Error ? routerErr.message.slice(0, 120) : routerErr
          );
        }
      }
    }

    if (!parsed) {
      const looksLikeLiveWebQuery =
        /(جستجو|جست‌وجو|جست و جو|سرچ|تو اینترنت|در اینترنت|تو وب|آب و هوا|اب و هوا|آب‌وهوا|هواشناسی|دمای هوا|هوای |قیمت|نرخ|دلار|طلا|سکه|بورس|اخبار|خبر امروز|نتیجه بازی|امروز چنده|چند است|چقدر است|دستور پخت|طرز تهیه|مواد لازم|چطوری درست|چطور درست)/.test(
          utterance
        );
      if (looksLikeLiveWebQuery) {
        fastWebRouted = true;
        parsed = {
          action: 'web_search',
          query: utterance,
          replyText: 'در حال بررسی نتایج زنده اینترنت هستم.',
        };
      } else if (getAvailableTextModels().length === 0 || isQuotaExhaustedError(lastRouterErr)) {
        res.status(429).json({
          error:
            'سهمیه رایگان روزانه مدل هوشمند پر شده است؛ برای گفت‌وگوی نامحدود از Settings > Secrets کلید دارای صورتحساب را تنظیم کنید یا فعلاً از دستورات آفلاین استفاده کنید.',
          quotaExceeded: true,
        });
        return;
      } else {
        res.status(503).json({
          error: 'پاسخ‌گوی هوشمند آنلاین موقتاً با تاخیر مواجه است؛ از حالت آفلاین استفاده می‌شود.',
          offlineFallback: true,
        });
        return;
      }
    }

    const action = parsed.action || 'answer';
    const shouldSearchWeb =
      action === 'web_search' ||
      (action === 'download_url' && !parsed.downloadUrl) ||
      (action === 'answer' && Boolean(parsed.needsLiveWeb));

    if (shouldSearchWeb) {
      const searchClient = ai ? (getTtsAiClient() ?? ai) : null;
      const requestedQuery = (parsed.query || utterance).trim();
      let gotGroundedAnswer = false;
      const groundingModels = getAvailableTextModels();
      if (!fastWebRouted && searchClient && groundingModels.includes('gemini-4-hydrogen')) {
        try {
          const searchPrompt =
            action === 'download_url'
              ? `کاربر (${ownerSelf}) این مورد را برای پیدا کردن صفحه معتبر دانلود در اینترنت خواسته است: "${requestedQuery}".
به فارسی کوتاه و شفاف نتیجه را بگو و منابع/صفحات معتبر وب را پیدا کن تا لینک آن‌ها به کاربر نمایش داده شود.`
              : `به درخواست «${ownerSelf}» با استفاده از جستجوی زنده گوگل به فارسی بسیار روان، دقیق و خلاصه (در ۲ تا ۴ جمله مناسب خواندن صوتی) پاسخ بده:
"${requestedQuery}"`;

          const webRes = await withPromiseTimeout(
            searchClient.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: searchPrompt,
              config: {
                systemInstruction:
                  'پاسخ را کوتاه، دقیق و به فارسی روان بنویس تا هم خواندنی باشد و هم با صدای بلند دلنشین پخش شود. اطلاعات به‌روز اینترنتی را از جستجوی گوگل بگیر. اگر جستجو انجام نشد یا منبع نداری، ادعای جستجو و آمار نکن.',
                tools: [{googleSearch: {}}],
              },
            }),
            9000,
            'Google Search grounding'
          );

          const webText = (webRes.text ?? '').replace(/[#*_`]/g, '').trim();
          const rawChunks = webRes.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          const links: {title: string; url: string}[] = [];
          const seenUrls = new Set<string>();

          for (const ch of rawChunks) {
            const uri = ch?.web?.uri;
            if (uri && (uri.startsWith('https://') || uri.startsWith('http://')) && !seenUrls.has(uri)) {
              seenUrls.add(uri);
              links.push({
                title: (ch?.web?.title || uri).slice(0, 70),
                url: uri,
              });
            }
            if (links.length >= 6) break;
          }

          if (webText && links.length > 0) {
            parsed.replyText = webText;
            parsed.links = links;
            gotGroundedAnswer = true;
          }
          if (action === 'download_url' && links.length > 0 && !parsed.downloadUrl) {
            parsed.downloadUrl = links[0].url;
            parsed.downloadTitle = links[0].title;
          }
        } catch (searchErr) {
          markTextModelCooldown('gemini-4-hydrogen', searchErr);
          console.info(
            'Google Search grounding skipped; using direct public search:',
            searchErr instanceof Error ? searchErr.message.slice(0, 120) : searchErr
          );
        }
      }

      if (!gotGroundedAnswer) {
        const [results, weatherSummary] = await Promise.all([
          searchPublicWeb(requestedQuery),
          fetchWeatherSummaryIfRelevant(requestedQuery),
        ]);
        const googleSearchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(requestedQuery);

        if (results.length > 0 || weatherSummary) {
          const topResults = results.slice(0, 3);
          const pageTexts = await Promise.all(
            topResults.map((item) => fetchPublicPageContent(item.url))
          );

          const sourceBlocks: string[] = [];
          if (weatherSummary) {
            sourceBlocks.push(`[داده زنده هواشناسی Open-Meteo]\n${weatherSummary}`);
          }
          results.slice(0, 5).forEach((item, index) => {
            const pageBody = index < pageTexts.length ? pageTexts[index] : '';
            sourceBlocks.push(
              `[${index + 1}] ${item.title}\nURL: ${item.url}\nاسنیپت: ${item.snippet || 'ندارد'}${
                pageBody ? `\nمتن استخراج‌شده صفحه:\n${pageBody}` : ''
              }`
            );
          });
          const sourceText = sourceBlocks.join('\n\n');

          parsed.links = results.slice(0, 5).map(({title, url}) => ({title, url}));
          parsed.links.push({title: 'مشاهده در گوگل', url: googleSearchUrl});

          if (weatherSummary) {
            parsed.replyText = weatherSummary;
          } else {
            try {
              let summaryText = '';
              if (ai) {
                for (const sumModel of getAvailableTextModels()) {
                  try {
                    const summary = await withPromiseTimeout(
                      ai.models.generateContent({
                        model: sumModel,
                        contents: `پرسش کاربر: "${requestedQuery}"

اطلاعات و متن واقعی صفحات وب زیر را بخوان و مستقیماً «خودِ پاسخ و خلاصه واقعی موضوع» را به فارسی روان، شفاف و قابل خواندن با صدای بلند (در ۲ تا ۴ جمله) بگو:
- اگر قیمت یا نرخ خواسته شده: قیمت‌های دقیق، واحد (تومان/ریال/دلار) و تاریخ موجود در متن را بگو.
- اگر دستور پخت غذا خواسته شده: مواد لازم اصلی و خلاصه مراحل کلیدی پخت را خلاصه بگو.
- هرگز معرفیِ وب‌سایت ننویس. فقط جواب واقعی را از دل متن‌ها دربیاور و عدد/حقیقتی خارج از منابع نساز.

${sourceText}`,
                        config: {
                          systemInstruction:
                            'تو دستیار فارسی دقیق هستی. مستقیم اصل جواب را از متن واقعی صفحات استخراج کن و خلاصه و گویا بگو؛ از معرفی سایت‌ها خودداری کن و هیچ عدد یا واقعیتی نساز.',
                          ...(sumModel === 'gemini-4-hydrogen' ? {thinkingConfig: {thinkingLevel: ThinkingLevel.LOW}} : {}),
                        },
                      }),
                      4000,
                      `Public search summarization (${sumModel})`
                    );
                    summaryText = (summary.text ?? '').replace(/[#*_`]/g, '').trim();
                    if (summaryText) break;
                  } catch (sumErr) {
                    markTextModelCooldown(sumModel, sumErr);
                  }
                }
              }
              parsed.replyText =
                summaryText ||
                buildDeterministicContentFallback(requestedQuery, results, pageTexts, weatherSummary);
            } catch (summaryErr) {
              console.info(
                'Search summarization used direct page extraction:',
                summaryErr instanceof Error ? summaryErr.message : summaryErr
              );
              parsed.replyText = buildDeterministicContentFallback(
                requestedQuery,
                results,
                pageTexts,
                weatherSummary
              );
            }
          }
          if (action === 'download_url' && !parsed.downloadUrl && results.length > 0) {
            parsed.downloadUrl = results[0].url;
            parsed.downloadTitle = results[0].title;
          }
        } else {
          parsed.replyText =
            'برای این سؤال نتوانستم نتیجه زنده و قابل‌اعتماد دریافت کنم. جستجوی گوگل را باز می‌کنم تا مستقیم بررسی کنی.';
          parsed.links = [{title: 'جستجوی گوگل برای این سؤال', url: googleSearchUrl}];
        }
      }
    }

    if (action === 'open_url' && !parsed.downloadUrl && parsed.query) {
      const q = parsed.query.trim();
      parsed.downloadUrl = q.startsWith('http') ? q : `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    }

    res.json(parsed);
  } catch (err) {
    if (isQuotaExhaustedError(err)) {
      res.status(429).json({
        error: 'سهمیه رایگان روزانه مدل هوشمند پر شده است؛ فعلاً از دستورات آفلاین یا جست‌وجوی وب استفاده کنید.',
        quotaExceeded: true,
      });
      return;
    }
    console.error('Assistant command AI error:', err);
    res.status(500).json({error: 'خطا در پردازش دستور صوتی.'});
  }
});

app.post('/api/summarize-text', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 20000) : '';
  if (text.length < 30) {
    res.status(400).json({error: 'لطفاً متن طولانی‌تری برای خلاصه‌سازی وارد کنید (حداقل ۳۰ کاراکتر).'});
    return;
  }

  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error: 'سرویس خلاصه‌سازی هوشمند در دسترس نیست.',
      offlineFallback: true,
    });
    return;
  }

  try {
    const models = getAvailableTextModels();
    if (models.length === 0) {
      res.status(429).json({
        error: 'سهمیه موقت مدل هوشمند تکمیل شده است؛ از خلاصه‌ساز آفلاین استفاده می‌شود.',
        offlineFallback: true,
      });
      return;
    }

    const schema = {
      type: Type.OBJECT,
      properties: {
        title: {type: Type.STRING, description: 'Short Persian title summarizing the text'},
        bullets: {
          type: Type.ARRAY,
          items: {type: Type.STRING},
          description: 'Exactly 3 crisp, informative Persian key takeaway bullets',
        },
        spokenSummary: {
          type: Type.STRING,
          description: 'Fluent 2 to 4 sentence conversational Persian summary ready for text-to-speech playback',
        },
      },
      required: ['title', 'bullets', 'spokenSummary'],
    };

    const prompt = `متن زیر را با دقت بخوان و به فارسی روان و دقیق خلاصه کن:
۱. یک عنوان کوتاه و روشن (title) بساز.
۲. دقیقاً ۳ نکته کلیدی و کاربردی (bullets) استخراج کن.
۳. یک خلاصه شنیداری طبیعی و خوش‌آهنگ (spokenSummary، بین ۲ تا ۴ جمله) بنویس که بدون علامت‌های اضافه برای خواندن صوتی آماده باشد.
اطلاعات را تحریف یا اضافه نکن و فقط به محتوای همین متن تکیه کن.

متن:
${text}`;

    let parsedResult: {title?: string; bullets?: string[]; spokenSummary?: string} | null = null;
    let lastErr: unknown = null;

    for (const model of models) {
      try {
        const response = await withPromiseTimeout(
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: schema,
              ...(model === 'gemini-4-hydrogen' ? {thinkingConfig: {thinkingLevel: ThinkingLevel.LOW}} : {}),
            },
          }),
          10000,
          `Summarize text (${model})`
        );
        const raw = (response.text || '').trim();
        if (!raw) continue;
        const jsonCandidate = JSON.parse(raw) as {title?: string; bullets?: string[]; spokenSummary?: string};
        if (jsonCandidate && typeof jsonCandidate.spokenSummary === 'string' && Array.isArray(jsonCandidate.bullets)) {
          parsedResult = jsonCandidate;
          break;
        }
      } catch (err) {
        lastErr = err;
        markTextModelCooldown(model, err);
      }
    }

    if (!parsedResult) {
      if (isQuotaExhaustedError(lastErr)) {
        res.status(429).json({
          error: 'سهمیه رایگان مدل تکمیل شده است؛ خلاصه آفلاین فعال می‌شود.',
          offlineFallback: true,
        });
        return;
      }
      res.status(502).json({
        error: 'پاسخ خلاصه‌ساز آماده نشد؛ از خلاصه‌ساز آفلاین استفاده کنید.',
        offlineFallback: true,
      });
      return;
    }

    res.json({
      title: (parsedResult.title || 'خلاصه متن').trim(),
      bullets: (parsedResult.bullets || []).map((b) => String(b).trim()).filter(Boolean).slice(0, 3),
      spokenSummary: (parsedResult.spokenSummary || '').trim(),
    });
  } catch (err) {
    console.error('Summarize text endpoint error:', err);
    res.status(500).json({
      error: 'خطا در خلاصه‌سازی متن.',
      offlineFallback: true,
    });
  }
});

app.get('/api/download-source-zip', (_req, res) => {
  const outZip = path.join(os.tmpdir(), `hamseda-app-upgrade-${Date.now()}.zip`);
  const pyScript = [
    'import os, sys, zipfile',
    'root, out_zip = sys.argv[1], sys.argv[2]',
    'skip_dirs = {".git", "node_modules", "dist", "dev-dist", ".aistudio", "workspace", ".gradle", "build"}',
    'skip_files = {".env", ".env.local"}',
    'with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:',
    '  for dirpath, dirnames, filenames in os.walk(root):',
    '    dirnames[:] = [d for d in dirnames if d not in skip_dirs]',
    '    for fn in filenames:',
    '      if fn in skip_files or (fn.startswith(".env.") and fn != ".env.example") or fn.endswith(".zip"):',
    '        continue',
    '      full = os.path.join(dirpath, fn)',
    '      rel = os.path.relpath(full, root)',
    '      zf.write(full, rel)',
  ].join('\n');

  execFile('python3', ['-c', pyScript, __dirname, outZip], {timeout: 30000}, (err) => {
    if (err || !fs.existsSync(outZip)) {
      console.error('Source zip generation error:', err);
      res.status(500).json({error: 'امکان ساخت فایل زیپ سورس پروژه نبود.'});
      return;
    }
    res.download(outZip, 'hamseda-app-upgrade.zip', (dlErr) => {
      fs.unlink(outZip, () => {});
      if (dlErr && !res.headersSent) {
        res.status(500).end();
      }
    });
  });
});

app.all('/api/*', (_req, res) => {
  res.status(404).json({error: 'مسیر API یافت نشد.'});
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) return next();
        const patched = result.code.replace(
          /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
          'const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} });'
        );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(patched);
      } catch (e) {
        next(e);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Roozhaye Man o Zari server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
