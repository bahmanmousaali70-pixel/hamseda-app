export type PocketVoicePreset = 'female_short' | 'male_news' | 'hello' | 'custom';

export interface PocketFarsiStatus {
  installed: boolean;
  sizeBytes: number;
  voiceCloneReady: boolean;
  customVoiceLoaded: boolean;
  device: 'webgpu' | 'wasm';
}

export interface PocketInstallProgress {
  file: string;
  bytesDownloaded: number;
  totalBytes: number;
  pct: number;
}

export interface PocketSpeakResult {
  ok: boolean;
  synthesisMs: number;
  g2pMs: number;
  durationSec: number;
  rtf: number;
  device: 'webgpu' | 'wasm';
  error?: string;
}

let worker: Worker | null = null;
let requestId = 1;
let customVoiceReady = false;
let activeAudioEl: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let activeCancelReject: (() => void) | null = null;

type PendingCallback = {
  type: string;
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
};

const waiters: PendingCallback[] = [];
const progressSubscribers = new Set<(p: PocketInstallProgress) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./pocketFarsiWorker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (e: MessageEvent<Record<string, unknown>>) => {
    const msg = e.data;
    const msgType = String(msg.type || '');
    if (msgType === 'installProgress') {
      const p: PocketInstallProgress = {
        file: String(msg.file || ''),
        bytesDownloaded: Number(msg.bytesDownloaded || 0),
        totalBytes: Number(msg.totalBytes || 0),
        pct: Number(msg.pct || 0),
      };
      progressSubscribers.forEach((cb) => cb(p));
      return;
    }

    if (msgType === 'voiceReady') {
      customVoiceReady = true;
    }

    if (msgType === 'uninstalled') {
      customVoiceReady = false;
    }

    const idx = waiters.findIndex((w) => {
      if (msgType === 'error') {
        if (msg.id !== undefined) return w.type === `synth:${msg.id}`;
        return true;
      }
      if (msgType === 'synthDone') return w.type === `synth:${msg.id}`;
      return w.type === msgType;
    });

    if (idx >= 0) {
      const [w] = waiters.splice(idx, 1);
      if (msgType === 'error') {
        w.reject(new Error(String(msg.message || 'خطای اجرای Pocket TTS Farsi')));
      } else {
        w.resolve(msg);
      }
    }
  };

  worker.onerror = (err) => {
    while (waiters.length > 0) {
      const w = waiters.shift();
      w?.reject(new Error(err.message || 'خطای داخلی Web Worker'));
    }
  };
  return worker;
}

function sendAndWait(type: string, expectedResponse: string, payload: Record<string, unknown> = {}) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const w = getWorker();
    waiters.push({type: expectedResponse, resolve, reject});
    w.postMessage({type, ...payload});
  });
}

export function onPocketInstallProgress(cb: (p: PocketInstallProgress) => void): () => void {
  progressSubscribers.add(cb);
  return () => {
    progressSubscribers.delete(cb);
  };
}

export async function getPocketFarsiStatus(): Promise<PocketFarsiStatus> {
  if (typeof Worker === 'undefined' || typeof caches === 'undefined') {
    return {
      installed: false,
      sizeBytes: 0,
      voiceCloneReady: false,
      customVoiceLoaded: false,
      device: 'wasm',
    };
  }
  try {
    const res = await sendAndWait('status', 'statusReport');
    return {
      installed: Boolean(res.installed),
      sizeBytes: Number(res.sizeBytes || 0),
      voiceCloneReady: Boolean(res.voiceCloneReady),
      customVoiceLoaded: customVoiceReady,
      device: res.device === 'webgpu' ? 'webgpu' : 'wasm',
    };
  } catch {
    return {
      installed: false,
      sizeBytes: 0,
      voiceCloneReady: false,
      customVoiceLoaded: customVoiceReady,
      device: 'wasm',
    };
  }
}

export async function installPocketFarsi(includeVoiceClone = false): Promise<PocketFarsiStatus> {
  const res = await sendAndWait('install', 'installed', {includeVoiceClone});
  return {
    installed: Boolean(res.installed),
    sizeBytes: Number(res.sizeBytes || 0),
    voiceCloneReady: Boolean(res.voiceCloneReady),
    customVoiceLoaded: customVoiceReady,
    device: res.device === 'webgpu' ? 'webgpu' : 'wasm',
  };
}

export async function uninstallPocketFarsi(): Promise<PocketFarsiStatus> {
  stopPocketFarsi();
  const res = await sendAndWait('uninstall', 'uninstalled');
  return {
    installed: Boolean(res.installed),
    sizeBytes: Number(res.sizeBytes || 0),
    voiceCloneReady: Boolean(res.voiceCloneReady),
    customVoiceLoaded: false,
    device: res.device === 'webgpu' ? 'webgpu' : 'wasm',
  };
}

export async function resampleAudioBlobTo24kMono(blob: Blob): Promise<Float32Array> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!AudioCtx) throw new Error('مرورگر از پردازش صدا پشتیبانی نمی‌کند.');
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const targetLen = Math.min(decoded.length, Math.floor(decoded.duration * 24000));
    const offline = new OfflineAudioContext(1, Math.max(24000, targetLen), 24000);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    const ch0 = rendered.getChannelData(0);
    return new Float32Array(ch0.subarray(0, Math.min(ch0.length, 5 * 24000)));
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function setPocketCustomVoiceFromBlob(blob: Blob): Promise<void> {
  const pcm24k = await resampleAudioBlobTo24kMono(blob);
  const w = getWorker();
  await new Promise<void>((resolve, reject) => {
    waiters.push({
      type: 'voiceReady',
      resolve: () => resolve(),
      reject,
    });
    w.postMessage({type: 'voice', audio: pcm24k}, [pcm24k.buffer]);
  });
}

function encodeFloat32ToWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);
  let pos = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(pos, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    pos += 2;
  }
  return buf;
}

export function stopPocketFarsi(): void {
  if (worker) {
    worker.postMessage({type: 'cancel', id: requestId});
  }
  if (activeCancelReject) {
    activeCancelReject();
    activeCancelReject = null;
  }
  if (activeAudioEl) {
    activeAudioEl.onended = null;
    activeAudioEl.onerror = null;
    activeAudioEl.pause();
    activeAudioEl.currentTime = 0;
    activeAudioEl = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

export async function speakWithPocketFarsi(
  text: string,
  voice: PocketVoicePreset = 'female_short',
  rate = 1.0
): Promise<PocketSpeakResult> {
  stopPocketFarsi();
  const id = ++requestId;
  try {
    const res = await sendAndWait('synth', `synth:${id}`, {id, text, voice});
    const audio = res.audio as Float32Array;
    const sampleRate = Number(res.sampleRate || 24000);
    const ms = Number(res.ms || 0);
    const g2pMs = Number(res.g2pMs || 0);
    const durationSec = Number(res.durationSec || 0);
    const usedDevice = res.device === 'webgpu' ? 'webgpu' : 'wasm';
    const rtf = durationSec > 0.01 ? ms / 1000 / durationSec : 0;

    if (!audio || audio.length === 0) {
      return {
        ok: false,
        synthesisMs: ms,
        g2pMs,
        durationSec: 0,
        rtf: 0,
        device: usedDevice,
        error: 'خروجی صوتی تولید نشد.',
      };
    }

    const wav = encodeFloat32ToWavBuffer(audio, sampleRate);
    const blob = new Blob([wav], {type: 'audio/wav'});
    const url = URL.createObjectURL(blob);
    activeObjectUrl = url;

    await new Promise<void>((resolve) => {
      const audioEl = new Audio(url);
      audioEl.playbackRate = Math.max(0.7, Math.min(1.4, rate));
      activeAudioEl = audioEl;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        activeCancelReject = null;
        if (activeObjectUrl === url) {
          URL.revokeObjectURL(url);
          activeObjectUrl = null;
        }
        if (activeAudioEl === audioEl) activeAudioEl = null;
        resolve();
      };
      activeCancelReject = done;
      audioEl.onended = done;
      audioEl.onerror = done;
      audioEl.play().catch(done);
    });

    return {
      ok: true,
      synthesisMs: ms,
      g2pMs,
      durationSec,
      rtf,
      device: usedDevice,
    };
  } catch (err) {
    return {
      ok: false,
      synthesisMs: 0,
      g2pMs: 0,
      durationSec: 0,
      rtf: 0,
      device: 'wasm',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
