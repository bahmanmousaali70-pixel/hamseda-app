import {VOICE_PERSONAS} from '../data/persianLibrary';
import type {AudioLibraryEntry, VoiceName} from '../types/app';
import {apiUrl, safeReadJsonResponse} from './apiConfig';
import {
  base64ToArrayBuffer,
  getAudioClipBuffer,
  getAudioClipRecord,
  hashTextKey,
  isRiffWavBuffer,
  saveAudioClip,
} from './audioLibraryDb';
import {
  isNativeAndroid,
  precacheNativeWav,
  speakNativeBilingual,
  speakOfflineEngineNative,
  speakOfflineNeuralPersian,
  stopNativeAudio,
} from './nativeAndroidBridge';
import {
  getPocketFarsiStatus,
  type PocketDenoiseLevel,
  type PocketPrecisionMode,
  type PocketVoicePreset,
  renderPocketFarsiWavBuffer,
  speakWithPocketFarsi,
  stopPocketFarsi,
} from './pocketFarsiEngine';

export type OfflineEngineId = 'ava_gyro' | 'mana_piper' | 'amir_piper' | 'pocket_farsi';
const PREFERRED_OFFLINE_ENGINE_KEY = 'hamseda_preferred_offline_engine';
const PREFER_OFFLINE_SPEECH_KEY = 'hamseda_prefer_offline_speech';
const POCKET_VOICE_KEY = 'hamseda_pocket_voice_preset';
const POCKET_DENOISE_KEY = 'hamseda_pocket_denoise_level';
const POCKET_PRECISION_KEY = 'hamseda_pocket_precision_mode';

export function getPreferOfflineSpeech(): boolean {
  try {
    return localStorage.getItem(PREFER_OFFLINE_SPEECH_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPreferOfflineSpeech(enabled: boolean): void {
  try {
    localStorage.setItem(PREFER_OFFLINE_SPEECH_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

export function getPreferredOfflineEngineId(): OfflineEngineId {
  try {
    const raw = localStorage.getItem(PREFERRED_OFFLINE_ENGINE_KEY);
    if (
      raw === 'ava_gyro' ||
      raw === 'mana_piper' ||
      raw === 'amir_piper' ||
      raw === 'pocket_farsi'
    ) {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return 'ava_gyro';
}

export function setPreferredOfflineEngineId(id: OfflineEngineId): void {
  try {
    localStorage.setItem(PREFERRED_OFFLINE_ENGINE_KEY, id);
  } catch {
    // ignore storage errors
  }
}

export function getPocketVoicePreset(): PocketVoicePreset {
  try {
    const raw = localStorage.getItem(POCKET_VOICE_KEY);
    if (
      raw === 'female_short' ||
      raw === 'male_news' ||
      raw === 'hello' ||
      raw === 'custom'
    ) {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'female_short';
}

export function setPocketVoicePreset(preset: PocketVoicePreset): void {
  try {
    localStorage.setItem(POCKET_VOICE_KEY, preset);
  } catch {
    // ignore
  }
}

export function getPocketDenoiseLevel(): PocketDenoiseLevel {
  try {
    const raw = localStorage.getItem(POCKET_DENOISE_KEY);
    if (raw === 'strong' || raw === 'balanced' || raw === 'raw') return raw;
  } catch {
    // ignore
  }
  return 'strong';
}

export function setPocketDenoiseLevel(level: PocketDenoiseLevel): void {
  try {
    localStorage.setItem(POCKET_DENOISE_KEY, level);
  } catch {
    // ignore
  }
}

export function getPocketPrecisionMode(): PocketPrecisionMode {
  try {
    const raw = localStorage.getItem(POCKET_PRECISION_KEY);
    if (raw === 'q4' || raw === 'high') return raw;
  } catch {
    // ignore
  }
  return 'q4';
}

export function setPocketPrecisionMode(mode: PocketPrecisionMode): void {
  try {
    localStorage.setItem(POCKET_PRECISION_KEY, mode);
  } catch {
    // ignore
  }
}

let sharedAudioCtx: AudioContext | null = null;
let activeSourceNode: AudioBufferSourceNode | null = null;
let activeAudioEl: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let activeStreamController: AbortController | null = null;
const activeStreamSources = new Set<AudioBufferSourceNode>();
let playbackToken = 0;

export interface SpeakOptions {
  text: string;
  title: string;
  category: AudioLibraryEntry['category'];
  voiceName?: VoiceName;
  style?: string;
  rate?: number;
  clipId?: string;
  forceOnlineRefresh?: boolean;
  onLoading?: () => void;
  onStart?: (source: 'cache' | 'gemini' | 'neural-fallback' | 'offline-speech') => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

function getPersonaInfo(voiceName: VoiceName) {
  return (
    VOICE_PERSONAS.find((v) => v.id === voiceName) ?? {
      id: voiceName,
      label: 'نگین · خانم',
      gender: 'female' as const,
      tone: 'Adult female speaker. Warm Tehran Persian voice',
    }
  );
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export function unlockAudioPlayback(): void {
  const ctx = getOrCreateAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    try {
      const silent = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // ignore silent unlock errors
    }
  }
}

export function stopAllSpeech(): void {
  playbackToken++;
  if (activeStreamController) {
    try {
      activeStreamController.abort();
    } catch {
      // already aborted
    }
    activeStreamController = null;
  }
  for (const node of activeStreamSources) {
    try {
      node.onended = null;
      node.stop();
      node.disconnect();
    } catch {
      // already stopped
    }
  }
  activeStreamSources.clear();
  if (activeSourceNode) {
    try {
      activeSourceNode.onended = null;
      activeSourceNode.stop();
      activeSourceNode.disconnect();
    } catch {
      // already stopped
    }
    activeSourceNode = null;
  }
  if (activeAudioEl) {
    activeAudioEl.onended = null;
    activeAudioEl.onerror = null;
    activeAudioEl.pause();
    activeAudioEl.currentTime = 0;
    activeAudioEl = null;
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  stopPocketFarsi();
  if (isNativeAndroid()) {
    stopNativeAudio().catch(() => {});
  }
}

export function playSoftChime(style: 'gentle' | 'classic' | 'chime' = 'chime'): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) {
        resolve();
        return;
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const notes =
        style === 'chime'
          ? [523.25, 659.25, 783.99, 1046.5]
          : style === 'gentle'
            ? [440, 554.37, 659.25]
            : [587.33, 880, 587.33];

      const step = 0.15;
      const now = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * step);
        gain.gain.setValueAtTime(0.001, now + idx * step);
        gain.gain.exponentialRampToValueAtTime(0.14, now + idx * step + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * step + 0.34);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * step);
        osc.stop(now + idx * step + 0.35);
      });

      setTimeout(resolve, notes.length * step * 1000 + 180);
    } catch {
      resolve();
    }
  });
}

async function playWavBuffer(buffer: ArrayBuffer, rate: number, token: number): Promise<void> {
  const ctx = getOrCreateAudioContext();

  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
      if (token !== playbackToken) return;

      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = rate;
        source.connect(ctx.destination);
        activeSourceNode = source;
        source.onended = () => {
          if (activeSourceNode === source) {
            activeSourceNode = null;
          }
          resolve();
        };
        source.start(0);
      });
      return;
    } catch (err) {
      console.warn('AudioContext decode fallback to HTMLAudioElement:', err);
    }
  }

  if (token !== playbackToken) return;
  await new Promise<void>((resolve, reject) => {
    const bytes = new Uint8Array(buffer);
    const isWav =
      bytes.length >= 4 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46;
    const blob = new Blob([buffer], {type: isWav ? 'audio/wav' : 'audio/mpeg'});
    const url = URL.createObjectURL(blob);
    activeUrl = url;
    const audio = new Audio(url);
    audio.playbackRate = rate;
    activeAudioEl = audio;

    audio.onended = () => {
      if (activeUrl === url) {
        URL.revokeObjectURL(url);
        activeUrl = null;
      }
      if (activeAudioEl === audio) {
        activeAudioEl = null;
      }
      resolve();
    };
    audio.onerror = () => {
      if (activeUrl === url) {
        URL.revokeObjectURL(url);
        activeUrl = null;
      }
      if (activeAudioEl === audio) {
        activeAudioEl = null;
      }
      reject(new Error('خطا در پخش فایل صوتی'));
    };

    audio.play().catch(reject);
  });
}

export function splitBilingualSegments(text: string): {text: string; lang: 'fa-IR' | 'en-US'}[] {
  const segments: {text: string; lang: 'fa-IR' | 'en-US'}[] = [];
  const tokenRegex = /([A-Za-z][A-Za-z0-9\s.,'_-]*)|([^\x00-\x7F]+[\d۰-۹\s،.؟!]*)|([\d۰-۹.,!?،؛:\-\s]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const chunk = match[0].trim();
    if (!chunk) continue;
    const hasLatin = /[A-Za-z]/.test(chunk);
    const hasPersian = /[\u0600-\u06FF]/.test(chunk);
    const lang: 'fa-IR' | 'en-US' = hasLatin && !hasPersian ? 'en-US' : 'fa-IR';

    const last = segments[segments.length - 1];
    if (last && last.lang === lang) {
      last.text = `${last.text} ${chunk}`;
    } else {
      segments.push({text: chunk, lang});
    }
  }
  return segments.length > 0 ? segments : [{text, lang: 'fa-IR'}];
}

function pickGenderedVoice(
  voices: SpeechSynthesisVoice[],
  langPrefix: 'fa' | 'en',
  gender: 'male' | 'female'
): SpeechSynthesisVoice | undefined {
  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  if (matching.length === 0) return undefined;
  const maleHints = ['male', 'man', 'david', 'mark', 'daniel', 'george', 'alex', 'farid', 'masoud', 'ardeshir', 'mard', 'm1', 'm2'];
  const femaleHints = ['female', 'woman', 'sara', 'daria', 'zira', 'samantha', 'karen', 'victoria', 'zan', 'f1', 'f2'];
  const hints = gender === 'male' ? maleHints : femaleHints;

  const hinted = matching.find((v) => hints.some((h) => v.name.toLowerCase().includes(h)));
  if (hinted) return hinted;
  if (matching.length > 1) {
    return gender === 'male' ? matching[matching.length - 1] : matching[0];
  }
  return matching[0];
}

export function speakOfflineBilingual(
  text: string,
  rate = 1,
  gender: 'male' | 'female' = 'female',
  tokenOverride?: number
): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve(false);
      return;
    }

    const activeTok = tokenOverride ?? playbackToken;
    const synth = window.speechSynthesis;
    synth.cancel();

    const getVoicesReady = (): Promise<SpeechSynthesisVoice[]> => {
      const current = synth.getVoices();
      if (current.length > 0) return Promise.resolve(current);
      return new Promise((res) => {
        const timeout = setTimeout(() => res(synth.getVoices()), 450);
        synth.onvoiceschanged = () => {
          clearTimeout(timeout);
          res(synth.getVoices());
        };
      });
    };

    getVoicesReady().then((voices) => {
      if (activeTok !== playbackToken) {
        resolve(false);
        return;
      }

      const faVoice = pickGenderedVoice(voices, 'fa', gender);
      const enVoice = pickGenderedVoice(voices, 'en', gender);
      const hasPersianChars = /[\u0600-\u06FF]/.test(text);
      if (hasPersianChars && !faVoice) {
        resolve(false);
        return;
      }
      const segments = splitBilingualSegments(text);
      let idx = 0;
      let anyStarted = false;

      const speakNext = () => {
        if (activeTok !== playbackToken || idx >= segments.length) {
          resolve(anyStarted);
          return;
        }
        const seg = segments[idx++];
        const utter = new SpeechSynthesisUtterance(seg.text);
        utter.lang = seg.lang;
        utter.rate = rate;
        // Distinct pitch adjustment so male/female remain distinguishable even on single-voice Android TTS
        utter.pitch = gender === 'male' ? 0.76 : 1.08;
        if (seg.lang === 'fa-IR' && faVoice) utter.voice = faVoice;
        if (seg.lang === 'en-US' && enVoice) utter.voice = enVoice;

        let settled = false;
        const safetyTimer = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            speakNext();
          }
        }, Math.max(4000, seg.text.length * 140));

        utter.onstart = () => {
          anyStarted = true;
        };
        utter.onend = () => {
          if (!settled) {
            settled = true;
            clearTimeout(safetyTimer);
            speakNext();
          }
        };
        utter.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(safetyTimer);
            speakNext();
          }
        };
        synth.speak(utter);
      };

      speakNext();
    });
  });
}

export async function generateAndCacheGeminiWav(params: {
  text: string;
  title: string;
  category: AudioLibraryEntry['category'];
  voiceName?: VoiceName;
  style?: string;
  clipId?: string;
  forceRefresh?: boolean;
}): Promise<{id: string; buffer: ArrayBuffer; isStudioWav: boolean} | {fallbackOffline: true; reason: string}> {
  const voiceName: VoiceName = params.voiceName ?? 'Kore';
  const id = params.clipId ?? hashTextKey(params.text, voiceName);
  const persona = getPersonaInfo(voiceName);
  const style = [persona.tone, params.style ?? 'Fluent natural Tehran Persian voice.'].filter(Boolean).join(' ');

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/tts'), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    signal: controller.signal,
    body: JSON.stringify({
      text: params.text,
      voiceName,
      style,
      forceRefresh: Boolean(params.forceRefresh),
    }),
    });
  } finally {
    window.clearTimeout(timeout);
  }

  const parsed = await safeReadJsonResponse<{
    audioBase64?: string;
    mimeType?: string;
    provider?: 'gemini' | 'neural-fallback';
    fallbackOffline?: boolean;
    reason?: string;
    error?: string;
  }>(res);

  if (parsed.isHtml) {
    console.warn('TTS endpoint returned HTML instead of JSON; falling back safely.');
    return {fallbackOffline: true, reason: 'html-response'};
  }

  if (!res.ok) {
    throw new Error(parsed.data?.error || 'خطا در ارتباط با سرویس صوتی');
  }

  const data = parsed.data;
  if (!data || data.fallbackOffline || !data.audioBase64) {
    return {fallbackOffline: true, reason: data?.reason || 'unavailable'};
  }

  const buffer = base64ToArrayBuffer(data.audioBase64);
  const isStudioWav = data.provider === 'gemini' && isRiffWavBuffer(buffer);

  if (isStudioWav) {
    await saveAudioClip(
      {
        id,
        title: params.title,
        text: params.text,
        category: params.category,
        voiceName,
        style,
        source: 'gemini',
        studioVersion: 4,
      },
      buffer
    );

    if (isNativeAndroid()) {
      precacheNativeWav(params.text, voiceName, buffer).catch(() => {});
    }
  } else {
    // Only store non-studio fallback if there is no genuine studio WAV already saved for this ID
    const existing = await getAudioClipRecord(id);
    if (!existing || !isRiffWavBuffer(existing.wavData) || existing.entry.source !== 'gemini') {
      await saveAudioClip(
        {
          id,
          title: params.title,
          text: params.text,
          category: params.category,
          voiceName,
          style,
          source: 'fallback',
        },
        buffer
      );
    }
  }

  return {id, buffer, isStudioWav};
}

function buildWavFromPcmChunks(chunks: Uint8Array[], sampleRate = 24000): ArrayBuffer {
  let totalPcmLen = 0;
  for (const c of chunks) totalPcmLen += c.length;
  const wav = new Uint8Array(44 + totalPcmLen);
  const view = new DataView(wav.buffer);
  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) wav[offset + i] = str.charCodeAt(i);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + totalPcmLen, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, totalPcmLen, true);
  let pos = 44;
  for (const c of chunks) {
    wav.set(c, pos);
    pos += c.length;
  }
  return wav.buffer;
}

async function cacheClipRecord(params: {
  id: string;
  title: string;
  text: string;
  category: AudioLibraryEntry['category'];
  voiceName: VoiceName;
  style: string;
  buffer: ArrayBuffer;
  isStudioWav: boolean;
}): Promise<void> {
  if (params.isStudioWav) {
    await saveAudioClip(
      {
        id: params.id,
        title: params.title,
        text: params.text,
        category: params.category,
        voiceName: params.voiceName,
        style: params.style,
        source: 'gemini',
        studioVersion: 4,
      },
      params.buffer
    );
    if (isNativeAndroid()) {
      precacheNativeWav(params.text, params.voiceName, params.buffer).catch(() => {});
    }
    return;
  }

  const existing = await getAudioClipRecord(params.id);
  if (!existing || !isRiffWavBuffer(existing.wavData) || existing.entry.source !== 'gemini') {
    await saveAudioClip(
      {
        id: params.id,
        title: params.title,
        text: params.text,
        category: params.category,
        voiceName: params.voiceName,
        style: params.style,
        source: 'fallback',
      },
      params.buffer
    );
  }
}

async function streamAndCacheGeminiSpeech(params: {
  text: string;
  title: string;
  category: AudioLibraryEntry['category'];
  voiceName: VoiceName;
  style?: string;
  rate: number;
  clipId: string;
  forceRefresh?: boolean;
  hasCachedStudioWav?: boolean;
  token: number;
  onStart?: (source: 'cache' | 'gemini' | 'neural-fallback' | 'offline-speech') => void;
}): Promise<{played: true; source: 'gemini' | 'neural-fallback'} | {played: false; reason: string}> {
  const persona = getPersonaInfo(params.voiceName);
  const style = [persona.tone, params.style ?? 'Fluent natural Tehran Persian voice.'].filter(Boolean).join(' ');

  const controller = new AbortController();
  activeStreamController = controller;
  const firstChunkTimeout = window.setTimeout(() => controller.abort(), 11000);
  let totalTimeout = 0;

  let res: Response;
  try {
    res = await fetch(apiUrl('/api/tts-stream'), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: controller.signal,
      body: JSON.stringify({
        text: params.text,
        voiceName: params.voiceName,
        style,
        forceRefresh: Boolean(params.forceRefresh),
      }),
    });
  } catch (err) {
    window.clearTimeout(firstChunkTimeout);
    if (activeStreamController === controller) activeStreamController = null;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || contentType.includes('text/html') || !res.body) {
    window.clearTimeout(firstChunkTimeout);
    if (activeStreamController === controller) activeStreamController = null;
    return {played: false, reason: 'unavailable'};
  }

  const ctx = getOrCreateAudioContext();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  const pcmChunks: Uint8Array[] = [];
  let leftoverByte: number | null = null;
  let lastSampleRate = 24000;
  let startedStreaming = false;
  let nextPlayTime = 0;
  let pendingNodes = 0;
  let isPartial = false;
  let finishAllNodesResolve: (() => void) | null = null;
  const allNodesDone = new Promise<void>((resolve) => {
    finishAllNodesResolve = resolve;
  });

  const safeRate = Math.max(0.5, Math.min(2.0, Number(params.rate) || 1));

  const schedulePcmChunk = async (chunkBytes: Uint8Array, sampleRate: number): Promise<void> => {
    if (!ctx || params.token !== playbackToken) return;
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    if (params.token !== playbackToken) return;

    let merged: Uint8Array;
    if (leftoverByte !== null) {
      merged = new Uint8Array(chunkBytes.length + 1);
      merged[0] = leftoverByte;
      merged.set(chunkBytes, 1);
      leftoverByte = null;
    } else {
      merged = chunkBytes;
    }

    const evenLen = merged.length - (merged.length % 2);
    if (merged.length % 2 === 1) {
      leftoverByte = merged[merged.length - 1];
    }
    if (evenLen <= 0) return;

    const sampleCount = evenLen / 2;
    const float32 = new Float32Array(sampleCount);
    const view = new DataView(merged.buffer, merged.byteOffset, evenLen);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }

    const audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = safeRate;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.025, nextPlayTime);
    nextPlayTime = startAt + audioBuffer.duration / safeRate;

    pendingNodes++;
    activeStreamSources.add(source);
    source.onended = () => {
      activeStreamSources.delete(source);
      pendingNodes = Math.max(0, pendingNodes - 1);
      if (pendingNodes === 0 && finishAllNodesResolve) {
        finishAllNodesResolve();
      }
    };

    if (!startedStreaming) {
      startedStreaming = true;
      params.onStart?.('gemini');
    }
    source.start(startAt);
  };

  try {
    totalTimeout = window.setTimeout(() => controller.abort(), 30000);
    while (true) {
      if (params.token !== playbackToken) {
        controller.abort();
        break;
      }
      const {done, value} = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, {stream: true});
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        let event: {
          type?: string;
          data?: string;
          sampleRate?: number;
          audioBase64?: string;
          provider?: 'gemini' | 'neural-fallback';
          reason?: string;
          partial?: boolean;
        };
        try {
          event = JSON.parse(trimmed);
        } catch {
          continue;
        }

        if (event.type === 'pcm' && event.data) {
          window.clearTimeout(firstChunkTimeout);
          lastSampleRate = typeof event.sampleRate === 'number' && event.sampleRate >= 8000 ? event.sampleRate : 24000;
          const bytes = new Uint8Array(base64ToArrayBuffer(event.data));
          if (bytes.length > 0) {
            pcmChunks.push(bytes);
            await schedulePcmChunk(bytes, lastSampleRate);
          }
        } else if (event.type === 'wav' && event.audioBase64) {
          window.clearTimeout(firstChunkTimeout);
          window.clearTimeout(totalTimeout);
          if (activeStreamController === controller) activeStreamController = null;
          const buffer = base64ToArrayBuffer(event.audioBase64);
          const isStudio = isRiffWavBuffer(buffer);
          await cacheClipRecord({
            id: params.clipId,
            title: params.title,
            text: params.text,
            category: params.category,
            voiceName: params.voiceName,
            style,
            buffer,
            isStudioWav: isStudio,
          });
          if (params.token !== playbackToken) return {played: true, source: 'gemini'};
          params.onStart?.('gemini');
          await playWavBuffer(buffer, safeRate, params.token);
          return {played: true, source: 'gemini'};
        } else if (event.type === 'fallback_audio' && event.audioBase64 && !startedStreaming) {
          window.clearTimeout(firstChunkTimeout);
          window.clearTimeout(totalTimeout);
          if (activeStreamController === controller) activeStreamController = null;
          if (params.hasCachedStudioWav) {
            return {played: false, reason: 'prefer-cached-studio'};
          }
          const buffer = base64ToArrayBuffer(event.audioBase64);
          await cacheClipRecord({
            id: params.clipId,
            title: params.title,
            text: params.text,
            category: params.category,
            voiceName: params.voiceName,
            style,
            buffer,
            isStudioWav: false,
          });
          if (params.token !== playbackToken) return {played: true, source: 'neural-fallback'};
          params.onStart?.('neural-fallback');
          await playWavBuffer(buffer, safeRate, params.token);
          return {played: true, source: 'neural-fallback'};
        } else if (event.type === 'fallback_offline' && !startedStreaming) {
          window.clearTimeout(firstChunkTimeout);
          window.clearTimeout(totalTimeout);
          if (activeStreamController === controller) activeStreamController = null;
          return {played: false, reason: event.reason || 'unavailable'};
        } else if (event.type === 'done' && event.partial) {
          isPartial = true;
        }
      }
    }
  } catch (err) {
    if (!startedStreaming) {
      window.clearTimeout(firstChunkTimeout);
      window.clearTimeout(totalTimeout);
      if (activeStreamController === controller) activeStreamController = null;
      throw err;
    }
    isPartial = true;
  } finally {
    window.clearTimeout(firstChunkTimeout);
    window.clearTimeout(totalTimeout);
    if (activeStreamController === controller) activeStreamController = null;
  }

  if (params.token !== playbackToken) {
    return {played: true, source: 'gemini'};
  }

  if (pcmChunks.length > 0) {
    const fullWav = buildWavFromPcmChunks(pcmChunks, lastSampleRate);
    if (!isPartial) {
      cacheClipRecord({
        id: params.clipId,
        title: params.title,
        text: params.text,
        category: params.category,
        voiceName: params.voiceName,
        style,
        buffer: fullWav,
        isStudioWav: true,
      }).catch(() => {});
    }

    if (startedStreaming) {
      if (pendingNodes > 0) {
        await allNodesDone;
      }
      return {played: true, source: 'gemini'};
    }

    params.onStart?.('gemini');
    await playWavBuffer(fullWav, safeRate, params.token);
    return {played: true, source: 'gemini'};
  }

  return {played: false, reason: 'empty-stream'};
}

export async function speakFluentPersian(
  options: SpeakOptions
): Promise<'cache' | 'gemini' | 'neural-fallback' | 'offline-speech'> {
  stopAllSpeech();
  unlockAudioPlayback();
  const token = playbackToken;
  const voiceName: VoiceName = options.voiceName ?? 'Kore';
  const persona = getPersonaInfo(voiceName);
  const rate = options.rate ?? 1;
  const clipId = options.clipId ?? hashTextKey(options.text, voiceName);

  const preferOffline = getPreferOfflineSpeech();

  try {
    if (!preferOffline) {
      const cachedRecord = !options.forceOnlineRefresh ? await getAudioClipRecord(clipId) : null;
      if (token !== playbackToken) return 'cache';

      const cachedIsTrueStudioWav =
        Boolean(cachedRecord) &&
        isRiffWavBuffer(cachedRecord?.wavData) &&
        cachedRecord?.entry.source === 'gemini';
      const cachedIsStyledV4 = cachedIsTrueStudioWav && cachedRecord?.entry.studioVersion === 4;

      // 1. Play immediately from offline cache ONLY if it's latest styled studio WAV (or when offline)
      if (cachedRecord && (cachedIsStyledV4 || !navigator.onLine)) {
        options.onStart?.('cache');
        await playWavBuffer(cachedRecord.wavData, rate, token);
        if (token === playbackToken) options.onEnd?.();
        return 'cache';
      }

      // 2. Stream styled Studio Gemini PCM chunks progressively for instant first-audio playback & offline caching
      {
        // Do not trust navigator.onLine inside Android WebView; attempt the cloud stream
        // and fall back to the local offline engine only after a bounded network timeout.
        options.onLoading?.();
        try {
          const streamed = await streamAndCacheGeminiSpeech({
            text: options.text,
            title: options.title,
            category: options.category,
            voiceName,
            style: options.style,
            rate,
            clipId,
            forceRefresh: Boolean(options.forceOnlineRefresh),
            hasCachedStudioWav: cachedIsTrueStudioWav,
            token,
            onStart: options.onStart,
          });
          if (token !== playbackToken) return 'gemini';
          if (streamed.played) {
            options.onEnd?.();
            return streamed.source;
          }
        } catch (err) {
          console.info('Online streaming TTS fallback to cached/offline speech:', err);
        }

        // If network attempt failed or quota was hit but we had a clip cached locally, play it seamlessly
        if (cachedRecord) {
          options.onStart?.(cachedIsTrueStudioWav ? 'cache' : 'neural-fallback');
          await playWavBuffer(cachedRecord.wavData, rate, token);
          if (token === playbackToken) options.onEnd?.();
          return cachedIsTrueStudioWav ? 'cache' : 'neural-fallback';
        }
      }
    }

    if (token !== playbackToken) return 'offline-speech';

    // 3. Offline TTS engines (Pocket TTS Farsi ONNX / Sherpa-ONNX native engines / Web Speech fallback)
    options.onStart?.('offline-speech');
    let ok = false;
    const preferredOffline = getPreferredOfflineEngineId();

    if (preferredOffline === 'pocket_farsi') {
      const pocketStatus = await getPocketFarsiStatus();
      if (token !== playbackToken) return 'offline-speech';
      if (pocketStatus.installed) {
        const pocketVoice = getPocketVoicePreset();
        const safeVoice =
          pocketVoice === 'custom' && !pocketStatus.customVoiceLoaded ? 'female_short' : pocketVoice;
        const pocketRes = await speakWithPocketFarsi(options.text, safeVoice, rate, {
          denoise: getPocketDenoiseLevel(),
          precision:
            getPocketPrecisionMode() === 'high' && pocketStatus.highPrecisionInstalled
              ? 'high'
              : 'q4',
        });
        ok = pocketRes.ok;
      }
      if (token !== playbackToken) return 'offline-speech';
    }

    if (!ok && isNativeAndroid()) {
      const nativeEngine =
        preferredOffline === 'pocket_farsi' ? 'ava_gyro' : preferredOffline;
      const nativeRes = await speakOfflineEngineNative({
        engineId: nativeEngine,
        text: options.text,
        rate,
      });
      ok = nativeRes.ok;
      if (!ok) ok = await speakOfflineNeuralPersian(options.text, rate);
      if (!ok) ok = await speakNativeBilingual(options.text, persona.gender, rate);
      if (token !== playbackToken) return 'offline-speech';
    }

    if (!ok && preferredOffline !== 'pocket_farsi') {
      const pocketStatus = await getPocketFarsiStatus();
      if (token !== playbackToken) return 'offline-speech';
      if (pocketStatus.installed) {
        const pocketRes = await speakWithPocketFarsi(options.text, getPocketVoicePreset(), rate, {
          denoise: getPocketDenoiseLevel(),
          precision:
            getPocketPrecisionMode() === 'high' && pocketStatus.highPrecisionInstalled
              ? 'high'
              : 'q4',
        });
        ok = pocketRes.ok;
      }
      if (token !== playbackToken) return 'offline-speech';
    }

    if (!ok) {
      ok = await speakOfflineBilingual(options.text, rate, persona.gender, token);
      if (token === playbackToken) options.onEnd?.();
      return 'offline-speech';
    }
    options.onEnd?.();
    return 'offline-speech';
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'خطا در پخش صوت';
    options.onError?.(msg);
    options.onEnd?.();
    return 'offline-speech';
  }
}

export async function playCachedClipById(id: string, rate = 1): Promise<boolean> {
  stopAllSpeech();
  unlockAudioPlayback();
  const token = playbackToken;
  const buf = await getAudioClipBuffer(id);
  if (!buf) return false;
  await playWavBuffer(buf, rate, token);
  return true;
}

const WAKE_PROMPT_TEXT = 'جانم، بفرمایید';
let lastWakePrecacheSignature = '';

export async function precacheWakePromptNative(options: {
  defaultVoice: VoiceName;
  isOnline: boolean;
  preferOfflineSpeech: boolean;
  preferredOffline: OfflineEngineId;
  forcePocketRefresh?: boolean;
}): Promise<void> {
  if (!isNativeAndroid()) return;
  const pocketVoice = getPocketVoicePreset();
  const pocketDenoise = getPocketDenoiseLevel();
  const pocketPrecision = getPocketPrecisionMode();
  const sig = `${options.defaultVoice}|${options.isOnline ? 1 : 0}|${options.preferOfflineSpeech ? 1 : 0}|${options.preferredOffline}|${pocketVoice}|${pocketDenoise}|${pocketPrecision}`;
  if (!options.forcePocketRefresh && sig === lastWakePrecacheSignature) return;
  lastWakePrecacheSignature = sig;

  try {
    if (!options.preferOfflineSpeech) {
      const clipId = hashTextKey(WAKE_PROMPT_TEXT, options.defaultVoice);
      const existing = await getAudioClipBuffer(clipId);
      if (existing && isRiffWavBuffer(existing)) {
        await precacheNativeWav(WAKE_PROMPT_TEXT, options.defaultVoice, existing);
      } else if (options.isOnline) {
        await generateAndCacheGeminiWav({
          text: WAKE_PROMPT_TEXT,
          title: 'پاسخ بیدارباش رفیقو',
          category: 'custom',
          voiceName: options.defaultVoice,
          clipId,
        });
      }
    }

    if (options.preferredOffline === 'pocket_farsi') {
      const pocketStatus = await getPocketFarsiStatus();
      if (pocketStatus.installed) {
        const safeVoice =
          pocketVoice === 'custom' && !pocketStatus.customVoiceLoaded ? 'female_short' : pocketVoice;
        const safePrec: PocketPrecisionMode =
          pocketPrecision === 'high' && pocketStatus.highPrecisionInstalled ? 'high' : 'q4';
        const wav = await renderPocketFarsiWavBuffer(WAKE_PROMPT_TEXT, safeVoice, {
          denoise: pocketDenoise,
          precision: safePrec,
        });
        if (wav) {
          await precacheNativeWav(WAKE_PROMPT_TEXT, 'pocket_farsi', wav);
        }
      }
    }
  } catch {
    // Non-fatal precache attempt; runtime fallback handles offline speech automatically
  }
}
