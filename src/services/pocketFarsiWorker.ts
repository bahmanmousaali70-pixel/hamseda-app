import * as ort from 'onnxruntime-web/webgpu';
import {
  g2pInput,
  g2pWindows,
  isPhonemic,
  normalizePersianForPocket,
  planChunks,
  PocketBPE,
  splitPersian,
  stripEzafe,
  toPhonemes,
} from './pocketFarsiText';

import {
  applyEdgeFade,
  cleanVoiceCloneInput,
  denoisePocketChunks,
  type PocketDenoiseLevel,
  softLimitAndNormalize,
} from './pocketAudioDenoiser';

export type PocketPrecisionMode = 'q4' | 'high';

const REPO = 'https://huggingface.co/mrfakename/pocket-tts-farsi-v2-ONNX/resolve/main/';
const CACHE_NAME = 'pocket-tts-farsi-v2-onnx-v1';

ort.env.wasm.wasmPaths = new URL('/ort/', self.location.origin).href;
ort.env.wasm.numThreads = 1;

const SR = 24000;
const FRAME = 1920;
const L = 6;
const H = 16;
const HD = 64;
const DIM = 1024;
const LD = 32;
const TEMP_BY_DENOISE: Record<PocketDenoiseLevel, number> = {
  strong: 0.06,
  balanced: 0.13,
  raw: 0.3,
};
const EOS_THR = -2.0;
const MAX_TOK = 18;
const CAP_RATIO = 0.97;
const PAUSE = {none: 0.08, clause: 0.2, sentence: 0.36} as const;

const CORE_FILES_WASM = [
  'onnx/flow_lm_step_q4.onnx',
  'onnx/mimi_decoder.onnx',
  'onnx/g2p_encoder_kv.onnx',
  'onnx/g2p_decoder_kv.onnx',
  'text_embeddings.f16.bin',
  'latent_proj.f32.bin',
  'bos_emb.f32.bin',
  'tokenizer_ph.json',
  'voices/female_short.f32.bin',
  'voices/male_news.f32.bin',
  'voices/hello.f32.bin',
];

const CORE_FILES_FP16_GPU = [
  'onnx/flow_lm_step_q4f16.onnx',
  ...CORE_FILES_WASM.slice(1),
];

const CORE_FILES_HIGH_CPU = [
  'onnx/flow_lm_step_fp16.onnx',
  ...CORE_FILES_WASM.slice(1),
];

type PostType =
  | 'statusReport'
  | 'installProgress'
  | 'installed'
  | 'uninstalled'
  | 'ready'
  | 'voiceReady'
  | 'synthDone'
  | 'error';

const post = (type: PostType, data: Record<string, unknown> = {}, transfer: Transferable[] = []) => {
  self.postMessage({type, ...data}, {transfer});
};

let flow: ort.InferenceSession | null = null;
let dec: ort.InferenceSession | null = null;
let venc: ort.InferenceSession | null = null;
let g2pE: ort.InferenceSession | null = null;
let g2pD: ort.InferenceSession | null = null;
let bpe: PocketBPE | null = null;
let lut: Uint16Array | null = null;
let W: Float32Array | null = null;
let bos: Float32Array | null = null;
let device: 'webgpu' | 'wasm' = 'wasm';
let hasF16 = false;
let activeVariant = 'q4';
let activePrecision: PocketPrecisionMode = 'q4';
let readyPromise: Promise<void> | null = null;
let cancelledSynthId = 0;

const voiceCache = new Map<string, ort.Tensor[]>();
const g2pCache = new Map<string, string>();

const F16 = new Float32Array(65536);
for (let i = 0; i < 65536; i++) {
  const s = (i & 0x8000) >> 15;
  const e = (i & 0x7c00) >> 10;
  const f = i & 0x03ff;
  if (e === 0) F16[i] = (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  else if (e === 31) F16[i] = f ? NaN : s ? -Infinity : Infinity;
  else F16[i] = (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

async function detectComputeBackend(): Promise<{device: 'webgpu' | 'wasm'; f16: boolean}> {
  try {
    const gpuObj = (navigator as unknown as {gpu?: {requestAdapter: (opts: unknown) => Promise<{features?: Set<string>} | null>}}).gpu;
    if (gpuObj) {
      const adapter = await gpuObj.requestAdapter({powerPreference: 'high-performance'});
      if (adapter) {
        return {device: 'webgpu', f16: Boolean(adapter.features?.has('shader-f16'))};
      }
    }
  } catch {
    // Fall back safely to WASM CPU
  }
  return {device: 'wasm', f16: false};
}

async function fetchCached(
  path: string,
  onProgress?: (got: number, total: number, cached: boolean) => void
): Promise<ArrayBuffer> {
  const url = REPO + path;
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    cache = null;
  }

  if (cache) {
    const hit = await cache.match(url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      onProgress?.(buf.byteLength, buf.byteLength, true);
      return buf;
    }
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`دانلود ${path} ناموفق بود (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    if (cache) {
      try {
        await cache.put(url, new Response(buf.slice(0), {headers: {'content-type': 'application/octet-stream'}}));
      } catch {
        // ignore quota errors cleanly
      }
    }
    onProgress?.(buf.byteLength, buf.byteLength, false);
    return buf;
  }

  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress?.(got, total || got, false);
  }

  const out = new Uint8Array(got);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }

  if (cache) {
    try {
      await cache.put(
        url,
        new Response(out.slice().buffer, {headers: {'content-type': 'application/octet-stream'}})
      );
    } catch {
      // Cache write failure should not prevent one-off synthesis
    }
  }
  onProgress?.(got, got, false);
  return out.buffer;
}

async function inspectCacheStatus() {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    cache = null;
  }
  if (!cache) {
    return {
      installed: false,
      highPrecisionInstalled: false,
      sizeBytes: 0,
      voiceCloneReady: false,
      device: 'wasm' as const,
    };
  }

  const keys = await cache.keys();
  const keySet = new Set(keys.map((r) => r.url));
  let totalBytes = 0;
  for (const req of keys) {
    const resp = await cache.match(req);
    if (resp) {
      const len = Number(resp.headers.get('content-length') || '0');
      if (len > 0) totalBytes += len;
      else {
        const b = await resp.arrayBuffer();
        totalBytes += b.byteLength;
      }
    }
  }

  const hasQ4 =
    keySet.has(REPO + 'onnx/flow_lm_step_q4.onnx') ||
    keySet.has(REPO + 'onnx/flow_lm_step_q4f16.onnx');
  const highPrecisionInstalled = keySet.has(REPO + 'onnx/flow_lm_step_fp16.onnx');
  const requiredRest = [
    'onnx/mimi_decoder.onnx',
    'onnx/g2p_encoder_kv.onnx',
    'onnx/g2p_decoder_kv.onnx',
    'text_embeddings.f16.bin',
    'latent_proj.f32.bin',
    'bos_emb.f32.bin',
    'tokenizer_ph.json',
    'voices/female_short.f32.bin',
  ];
  const installed = (hasQ4 || highPrecisionInstalled) && requiredRest.every((f) => keySet.has(REPO + f));
  const voiceCloneReady = keySet.has(REPO + 'onnx/voice_encoder.onnx');
  const backend = await detectComputeBackend();
  return {
    installed,
    highPrecisionInstalled,
    sizeBytes: totalBytes,
    voiceCloneReady,
    device: backend.device,
  };
}

async function resetSessions() {
  for (const pres of voiceCache.values()) {
    pres.forEach((t) => {
      try {
        t.dispose();
      } catch {
        // ignore
      }
    });
  }
  voiceCache.clear();
  g2pCache.clear();

  const sessions = [flow, dec, venc, g2pE, g2pD];
  flow = null;
  dec = null;
  venc = null;
  g2pE = null;
  g2pD = null;
  bpe = null;
  lut = null;
  W = null;
  bos = null;
  readyPromise = null;

  for (const s of sessions) {
    if (s) {
      try {
        await s.release();
      } catch {
        // ignore
      }
    }
  }
}

async function installModels(includeVoiceClone = false, precision: PocketPrecisionMode = 'q4') {
  const backend = await detectComputeBackend();
  const baseList =
    precision === 'high'
      ? CORE_FILES_HIGH_CPU
      : backend.device === 'webgpu' && backend.f16
        ? CORE_FILES_FP16_GPU
        : CORE_FILES_WASM;
  const files = includeVoiceClone ? [...baseList, 'onnx/voice_encoder.onnx'] : baseList;

  const progressMap = new Map<string, {got: number; total: number}>();
  files.forEach((f) => progressMap.set(f, {got: 0, total: 1}));

  const emitTotal = (currentFile: string) => {
    let gotSum = 0;
    let totalSum = 0;
    for (const v of progressMap.values()) {
      gotSum += v.got;
      totalSum += Math.max(v.got, v.total);
    }
    post('installProgress', {
      file: currentFile,
      bytesDownloaded: gotSum,
      totalBytes: totalSum,
      pct: totalSum > 0 ? Math.min(99, Math.round((gotSum * 100) / totalSum)) : 0,
    });
  };

  for (const file of files) {
    await fetchCached(file, (got, total) => {
      progressMap.set(file, {got, total: total || got});
      emitTotal(file);
    });
  }

  const st = await inspectCacheStatus();
  post('installed', st);
}

async function ensureInitialized(requestedPrecision: PocketPrecisionMode = 'q4') {
  const st = await inspectCacheStatus();
  const effectivePrecision: PocketPrecisionMode =
    requestedPrecision === 'high' && st.highPrecisionInstalled ? 'high' : 'q4';

  if (flow && dec && g2pE && g2pD && bpe && lut && W && bos && activePrecision === effectivePrecision) {
    return;
  }
  if (flow && activePrecision !== effectivePrecision) {
    await resetSessions();
  }
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const backend = await detectComputeBackend();
    if (effectivePrecision === 'high') {
      device = 'wasm';
      hasF16 = false;
      activeVariant = 'fp16';
    } else {
      device = backend.device;
      hasF16 = backend.f16;
      activeVariant = device === 'webgpu' && hasF16 ? 'q4f16' : 'q4';
    }
    activePrecision = effectivePrecision;

    const createSessions = async (targetDevice: 'webgpu' | 'wasm', variantName: string) => {
      const flowFile = `onnx/flow_lm_step_${variantName}.onnx`;
      const [flowB, decB, geB, gdB, lutB, wB, bosB, tokB] = await Promise.all([
        fetchCached(flowFile),
        fetchCached('onnx/mimi_decoder.onnx'),
        fetchCached('onnx/g2p_encoder_kv.onnx'),
        fetchCached('onnx/g2p_decoder_kv.onnx'),
        fetchCached('text_embeddings.f16.bin'),
        fetchCached('latent_proj.f32.bin'),
        fetchCached('bos_emb.f32.bin'),
        fetchCached('tokenizer_ph.json'),
      ]);

      lut = new Uint16Array(lutB);
      W = new Float32Array(wB);
      bos = new Float32Array(bosB);
      const tokJson = JSON.parse(new TextDecoder().decode(tokB)) as {
        pieces: [string, number, number][];
      };
      bpe = new PocketBPE(tokJson.pieces);

      const epOpts: ort.InferenceSession.SessionOptions = {
        executionProviders: [targetDevice],
        graphOptimizationLevel: 'all',
      };
      const flowOpts: ort.InferenceSession.SessionOptions = {...epOpts};
      if (targetDevice === 'webgpu') {
        const prefOut: Record<string, 'gpu-buffer'> = {};
        for (let i = 0; i < L; i++) {
          prefOut[`present_key_${i}`] = 'gpu-buffer';
          prefOut[`present_value_${i}`] = 'gpu-buffer';
        }
        flowOpts.preferredOutputLocation = prefOut;
      }

      flow = await ort.InferenceSession.create(flowB, flowOpts);
      [dec, g2pE, g2pD] = await Promise.all([
        ort.InferenceSession.create(decB, epOpts),
        ort.InferenceSession.create(geB, {executionProviders: ['wasm']}),
        ort.InferenceSession.create(gdB, {executionProviders: ['wasm']}),
      ]);
      device = targetDevice;
      activeVariant = variantName;
    };

    try {
      await createSessions(device, activeVariant);
    } catch (err) {
      if (activeVariant === 'fp16' || device === 'webgpu') {
        await resetSessions();
        activePrecision = 'q4';
        await createSessions('wasm', 'q4');
      } else {
        throw err;
      }
    }

    const vs = await voiceState('female_short');
    await generateChunk(vs, 'salAm', TEMP_BY_DENOISE.strong, 3);
    post('ready', {device, variant: activeVariant, precision: activePrecision});
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}

async function g2p(text: string): Promise<string> {
  const cached = g2pCache.get(text);
  if (cached !== undefined) return cached;
  if (!g2pE || !g2pD) throw new Error('G2P sessions not initialized');

  const bytes = new TextEncoder().encode(text);
  const ids = new BigInt64Array(bytes.length + 1);
  bytes.forEach((b, i) => {
    ids[i] = BigInt(b + 3);
  });
  ids[bytes.length] = 1n;

  const enc = await g2pE.run({
    input_ids: new ort.Tensor('int64', ids, [1, ids.length]),
  });

  const feed: Record<string, ort.Tensor> = {};
  for (const i of [0, 1]) {
    feed[`cross_key_${i}`] = enc[`cross_key_${i}`];
    feed[`cross_value_${i}`] = enc[`cross_value_${i}`];
    feed[`past_key_${i}`] = new ort.Tensor('float32', new Float32Array(0), [1, 6, 0, 64]);
    feed[`past_value_${i}`] = new ort.Tensor('float32', new Float32Array(0), [1, 6, 0, 64]);
  }

  const out: number[] = [];
  let tok = 0;
  const maxLen = Math.min(512, bytes.length * 2 + 16);
  for (let s = 0; s < maxLen; s++) {
    feed.token = new ort.Tensor('int64', BigInt64Array.from([BigInt(tok)]), [1, 1]);
    const r = await g2pD.run(feed);
    const logits = r.logits.data as Float32Array;
    let best = 0;
    for (let i = 1; i < logits.length; i++) {
      if (logits[i] > logits[best]) best = i;
    }
    for (const i of [0, 1]) {
      feed[`past_key_${i}`] = r[`present_key_${i}`];
      feed[`past_value_${i}`] = r[`present_value_${i}`];
    }
    if (best === 1) break;
    out.push(best);
    tok = best;
  }

  const decoded = new TextDecoder().decode(
    new Uint8Array(out.filter((x) => x >= 3).map((x) => x - 3))
  );
  g2pCache.set(text, decoded);
  return decoded;
}

function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function noiseT(temp: number): ort.Tensor {
  const n = new Float32Array(LD);
  const sd = Math.sqrt(Math.max(0.005, temp));
  for (let i = 0; i < LD; i++) n[i] = gauss() * sd;
  return new ort.Tensor('float32', n, [1, LD]);
}

function emptyPast(): ort.Tensor[] {
  const p: ort.Tensor[] = [];
  for (let i = 0; i < 2 * L; i++) {
    p.push(new ort.Tensor('float32', new Float32Array(0), [1, H, 0, HD]));
  }
  return p;
}

async function step(embeds: Float32Array, S: number, past: ort.Tensor[], temp: number) {
  if (!flow) throw new Error('FlowLM not initialized');
  const feed: Record<string, ort.Tensor> = {
    inputs_embeds: new ort.Tensor('float32', embeds, [1, S, DIM]),
    noise: noiseT(temp),
  };
  for (let i = 0; i < L; i++) {
    feed[`past_key_${i}`] = past[2 * i];
    feed[`past_value_${i}`] = past[2 * i + 1];
  }
  const o = await flow.run(feed);
  const presents: ort.Tensor[] = [];
  for (let i = 0; i < L; i++) {
    presents.push(o[`present_key_${i}`], o[`present_value_${i}`]);
  }
  const eosData = o.eos_logit.data as Float32Array;
  return {
    latent: new Float32Array(o.latent.data as Float32Array),
    eos: eosData[0],
    presents,
  };
}

const dispose = (ts: ort.Tensor[]) =>
  ts.forEach((t) => {
    try {
      t.dispose();
    } catch {
      // ignore
    }
  });

function proj(lat: Float32Array): Float32Array {
  if (!W) throw new Error('Latent proj missing');
  const x = new Float32Array(DIM);
  for (let r = 0; r < DIM; r++) {
    let s = 0;
    const o = r * LD;
    for (let c = 0; c < LD; c++) s += W[o + c] * lat[c];
    x[r] = s;
  }
  return x;
}

async function voiceState(name: string): Promise<ort.Tensor[]> {
  const hit = voiceCache.get(name);
  if (hit) return hit;
  const buf = await fetchCached(`voices/${name}.f32.bin`);
  const emb = new Float32Array(buf);
  const r = await step(emb, emb.length / DIM, emptyPast(), TEMP_BY_DENOISE.strong);
  voiceCache.set(name, r.presents);
  return r.presents;
}

async function encodeCustomVoice(audio24k: Float32Array) {
  await ensureInitialized();
  if (!venc) {
    const encoderBuf = await fetchCached('onnx/voice_encoder.onnx');
    venc = await ort.InferenceSession.create(encoderBuf, {executionProviders: ['wasm']});
  }
  const cleanedInput = cleanVoiceCloneInput(trimSilence(audio24k, 80), SR);
  const clipped = cleanedInput.subarray(0, 5 * SR);
  const paddedLen = Math.max(FRAME, Math.ceil(clipped.length / FRAME) * FRAME);
  const padded = new Float32Array(paddedLen);
  padded.set(clipped);

  const out = await venc.run({audio: new ort.Tensor('float32', padded, [1, 1, paddedLen])});
  const embTensor = out.voice_embeds;
  const emb = new Float32Array(embTensor.data as Float32Array);
  const old = voiceCache.get('custom');
  if (old) dispose(old);
  const r = await step(emb, embTensor.dims[1], emptyPast(), TEMP_BY_DENOISE.strong);
  voiceCache.set('custom', r.presents);
  post('voiceReady', {name: 'custom'});
}

function trimSilence(a: Float32Array, keepMs = 120): Float32Array {
  if (!a.length) return a;
  let s2 = 0;
  for (const v of a) s2 += v * v;
  const rms = Math.sqrt(s2 / a.length);
  if (rms <= 0) return a;
  const win = Math.floor(0.02 * SR);
  const thr = 0.04 * rms;
  let first = -1;
  let last = -1;
  for (let i = 0; i < Math.max(a.length - win, 1); i += win) {
    let e = 0;
    for (let j = i; j < i + win && j < a.length; j++) e += a[j] * a[j];
    if (Math.sqrt(e / win) > thr) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return a;
  const m = Math.floor((keepMs / 1000) * SR);
  return a.slice(Math.max(0, first - m), Math.min(a.length, last + win + m));
}

function concatFloat32(arrs: Float32Array[]): Float32Array {
  const n = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(n);
  let p = 0;
  for (const a of arrs) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

async function generateChunk(
  voice: ort.Tensor[],
  ph: string,
  temp: number,
  maxFrames?: number,
  runStats?: {steps: number}
): Promise<{audio: Float32Array; frames: number; cap: number}> {
  if (!bpe || !lut || !bos || !dec) throw new Error('Engine not initialized');
  const ids = bpe.encode(ph);
  const cap = maxFrames || Math.ceil((ids.length / 3 + 2) * 12.5);
  const emb = new Float32Array(ids.length * DIM);
  ids.forEach((id, j) => {
    const o = id * DIM;
    for (let k = 0; k < DIM; k++) emb[j * DIM + k] = F16[lut![o + k]];
  });

  let r = await step(emb, ids.length, voice, temp);
  let past = r.presents;
  let x = proj(bos);
  const lats: Float32Array[] = [];

  for (let s = 0; s < cap; s++) {
    r = await step(x, 1, past, temp);
    dispose(past);
    past = r.presents;
    if (r.eos > EOS_THR) break;
    lats.push(r.latent);
    x = proj(r.latent);
  }
  dispose(past);
  if (runStats) runStats.steps += lats.length + 1;

  if (!lats.length) return {audio: new Float32Array(0), frames: 0, cap};

  const lat = new Float32Array(lats.length * LD);
  lats.forEach((l, i) => lat.set(l, i * LD));
  const {audio} = await dec.run({latent: new ort.Tensor('float32', lat, [1, lats.length, LD])});
  const rawAudio = new Float32Array((await audio.getData()) as Float32Array);
  try {
    audio.dispose();
  } catch {
    // ignore
  }
  return {audio: rawAudio, frames: lats.length, cap};
}

interface RawSegment {
  audio: Float32Array;
  pauseAfter: number;
}

async function robustChunkRaw(
  voice: ort.Tensor[],
  ph: string,
  temp: number,
  endPauseSec: number,
  runStats: {steps: number},
  depth = 0
): Promise<RawSegment[]> {
  const clean = stripEzafe(ph).replace(/\s+/g, ' ').trim();
  let shortest: Float32Array = new Float32Array(0);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateChunk(voice, clean, temp, undefined, runStats);
    if (r.frames < CAP_RATIO * r.cap) {
      return [{audio: r.audio, pauseAfter: endPauseSec}];
    }
    if (!shortest.length || r.audio.length < shortest.length) shortest = r.audio;
  }
  const words = ph.split(' ');
  if (depth >= 2 || words.length < 4) {
    return [{audio: shortest, pauseAfter: endPauseSec}];
  }
  const half = words.length >> 1;
  const a = await robustChunkRaw(voice, words.slice(0, half).join(' '), temp, 0.05, runStats, depth + 1);
  const b = await robustChunkRaw(voice, words.slice(half).join(' '), temp, endPauseSec, runStats, depth + 1);
  return [...a, ...b];
}

async function runSynth(
  id: number,
  text: string,
  voice: string,
  denoiseLevel: PocketDenoiseLevel = 'strong',
  precision: PocketPrecisionMode = 'q4'
) {
  await ensureInitialized(precision);
  if (!bpe) throw new Error('Tokenizer missing');

  const t0 = performance.now();
  const runStats = {steps: 0};
  const temp = TEMP_BY_DENOISE[denoiseLevel] ?? TEMP_BY_DENOISE.strong;
  const count = (s: string) => bpe!.encode(stripEzafe(s)).length;

  let clauses: {ph: string; end: 'sentence' | 'clause'}[] = [];
  if (isPhonemic(text)) {
    clauses = text
      .split(/(?<=[.!,])\s+|\n+/)
      .map((c) => ({
        ph: c.replace(/[.!,]/g, ' ').replace(/\s+/g, ' ').trim(),
        end: (/[.!]$/.test(c.trim()) ? 'sentence' : 'clause') as 'sentence' | 'clause',
      }))
      .filter((c) => c.ph);
  } else {
    const norm = normalizePersianForPocket(text);
    if (!norm) throw new Error('متن فارسی معتبری یافت نشد.');
    for (const c of splitPersian(norm)) {
      if (id <= cancelledSynthId) throw new Error('تولید صدا لغو شد.');
      const parts: string[] = [];
      for (const w of g2pWindows(g2pInput(c.text))) {
        parts.push(toPhonemes(await g2p(w)));
      }
      const ph = parts.join(' ').trim();
      if (ph) clauses.push({ph, end: c.end});
    }
  }

  const tG2p = performance.now();
  const chunks = planChunks(clauses, count, MAX_TOK);
  const vs = await voiceState(voice);
  const rawSegments: RawSegment[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (id <= cancelledSynthId) throw new Error('تولید صدا لغو شد.');
    const pauseSec = i < chunks.length - 1 ? PAUSE[chunks[i].end] : 0;
    const segs = await robustChunkRaw(vs, chunks[i].text, temp, pauseSec, runStats);
    rawSegments.push(...segs);
  }

  const denoisedAudios = denoisePocketChunks(
    rawSegments.map((s) => s.audio),
    SR,
    denoiseLevel
  );

  const pieces: Float32Array[] = [];
  for (let i = 0; i < denoisedAudios.length; i++) {
    const trimmed = applyEdgeFade(trimSilence(denoisedAudios[i], 90), SR, 10);
    pieces.push(trimmed);
    const pauseSec = rawSegments[i].pauseAfter;
    if (pauseSec > 0) {
      pieces.push(new Float32Array(Math.floor(pauseSec * SR)));
    }
  }

  const all = denoiseLevel === 'raw' ? concatFloat32(pieces) : softLimitAndNormalize(concatFloat32(pieces), 0.88);
  const ms = Math.round(performance.now() - t0);
  const durationSec = all.length / SR;
  post(
    'synthDone',
    {
      id,
      audio: all,
      sampleRate: SR,
      ms,
      g2pMs: Math.round(tG2p - t0),
      durationSec,
      steps: runStats.steps,
      device,
      variant: activeVariant,
      precision: activePrecision,
    },
    [all.buffer]
  );
}

let queue: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent) => {
  const m = e.data as {
    type: string;
    id?: number;
    text?: string;
    voice?: string;
    denoise?: PocketDenoiseLevel;
    precision?: PocketPrecisionMode;
    includeVoiceClone?: boolean;
    audio?: Float32Array;
  };
  if (m.type === 'cancel') {
    cancelledSynthId = Math.max(cancelledSynthId, m.id ?? cancelledSynthId + 1);
    return;
  }
  queue = queue.then(async () => {
    try {
      if (m.type === 'status') {
        const st = await inspectCacheStatus();
        post('statusReport', st);
      } else if (m.type === 'install') {
        await installModels(Boolean(m.includeVoiceClone), m.precision || 'q4');
      } else if (m.type === 'uninstall') {
        await resetSessions();
        try {
          await caches.delete(CACHE_NAME);
        } catch {
          // ignore
        }
        post('uninstalled', await inspectCacheStatus());
      } else if (m.type === 'voice' && m.audio) {
        await encodeCustomVoice(m.audio);
      } else if (m.type === 'synth' && m.id && m.text) {
        await runSynth(
          m.id,
          m.text,
          m.voice || 'female_short',
          m.denoise || 'strong',
          m.precision || 'q4'
        );
      }
    } catch (err) {
      post('error', {
        id: m.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
};
