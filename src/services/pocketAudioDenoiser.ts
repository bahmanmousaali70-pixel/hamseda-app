export type PocketDenoiseLevel = 'strong' | 'balanced' | 'raw';

const FFT_N = 512;
const FFT_HALF = FFT_N >> 1;
const FFT_HOP = 128;

const HANN_WIN = new Float32Array(FFT_N);
for (let i = 0; i < FFT_N; i++) {
  HANN_WIN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / FFT_N));
}

const BIT_REV = new Uint16Array(FFT_N);
for (let i = 0; i < FFT_N; i++) {
  let x = i;
  let r = 0;
  for (let b = 0; b < 9; b++) {
    r = (r << 1) | (x & 1);
    x >>= 1;
  }
  BIT_REV[i] = r;
}

const TW_COS = new Float32Array(FFT_HALF);
const TW_SIN = new Float32Array(FFT_HALF);
for (let i = 0; i < FFT_HALF; i++) {
  const angle = (2 * Math.PI * i) / FFT_N;
  TW_COS[i] = Math.cos(angle);
  TW_SIN[i] = Math.sin(angle);
}

function fft512(re: Float32Array, im: Float32Array, inverse: boolean): void {
  for (let i = 0; i < FFT_N; i++) {
    const j = BIT_REV[i];
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let size = 2; size <= FFT_N; size <<= 1) {
    const half = size >> 1;
    const step = FFT_N / size;
    for (let i = 0; i < FFT_N; i += size) {
      let twIdx = 0;
      for (let j = 0; j < half; j++) {
        const c = TW_COS[twIdx];
        const s = inverse ? TW_SIN[twIdx] : -TW_SIN[twIdx];
        const idxA = i + j;
        const idxB = idxA + half;
        const bre = re[idxB];
        const bim = im[idxB];
        const tRe = bre * c - bim * s;
        const tIm = bre * s + bim * c;
        re[idxB] = re[idxA] - tRe;
        im[idxB] = im[idxA] - tIm;
        re[idxA] += tRe;
        im[idxA] += tIm;
        twIdx += step;
      }
    }
  }

  if (inverse) {
    const invN = 1 / FFT_N;
    for (let i = 0; i < FFT_N; i++) {
      re[i] *= invN;
      im[i] *= invN;
    }
  }
}

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function makeHighPassCoeffs(cutoffHz: number, sampleRate: number, q = 0.7071): BiquadCoeffs {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cosW0) / (2 * a0),
    b1: -(1 + cosW0) / a0,
    b2: (1 + cosW0) / (2 * a0),
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  };
}

function makeLowPassCoeffs(cutoffHz: number, sampleRate: number, q = 0.7071): BiquadCoeffs {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cosW0) / (2 * a0),
    b1: (1 - cosW0) / a0,
    b2: (1 - cosW0) / (2 * a0),
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(samples: Float32Array, c: BiquadCoeffs): Float32Array {
  const out = new Float32Array(samples.length);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = c.b0 * x + z1;
    z1 = c.b1 * x - c.a1 * y + z2;
    z2 = c.b2 * x - c.a2 * y;
    out[i] = y;
  }
  return out;
}

function removeDcOffset(samples: Float32Array): Float32Array {
  if (!samples.length) return samples;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const mean = sum / samples.length;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] - mean;
  return out;
}

export function applyEdgeFade(samples: Float32Array, sampleRate: number, fadeMs = 10): Float32Array {
  if (!samples.length) return samples;
  const fadeSamples = Math.min(Math.floor(samples.length / 2), Math.floor((fadeMs / 1000) * sampleRate));
  if (fadeSamples <= 1) return samples;
  const out = new Float32Array(samples);
  for (let i = 0; i < fadeSamples; i++) {
    const t = i / fadeSamples;
    const gain = 0.5 * (1 - Math.cos(Math.PI * t));
    out[i] *= gain;
    out[out.length - 1 - i] *= gain;
  }
  return out;
}

export function softLimitAndNormalize(samples: Float32Array, targetPeak = 0.88): Float32Array {
  if (!samples.length) return samples;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak < 1e-5) return samples;

  const out = new Float32Array(samples.length);
  // Boost overly quiet synthesis slightly, or scale down loud spikes before gentle soft limiting
  const gain = peak > targetPeak ? targetPeak / peak : peak < 0.35 ? Math.min(2.2, 0.72 / peak) : 1.0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] * gain;
    const abs = Math.abs(x);
    if (abs > 0.85) {
      const sign = x < 0 ? -1 : 1;
      out[i] = sign * (0.85 + 0.13 * Math.tanh((abs - 0.85) / 0.15));
    } else {
      out[i] = x;
    }
  }
  return out;
}

interface FrameAnalysis {
  energy: number;
  magSq: Float32Array;
}

function analyzeNoiseProfile(chunks: Float32Array[]): Float32Array {
  const frames: FrameAnalysis[] = [];
  const re = new Float32Array(FFT_N);
  const im = new Float32Array(FFT_N);

  for (const chunk of chunks) {
    if (chunk.length < FFT_N) continue;
    for (let start = 0; start <= chunk.length - FFT_N; start += FFT_HOP) {
      re.fill(0);
      im.fill(0);
      for (let i = 0; i < FFT_N; i++) {
        re[i] = chunk[start + i] * HANN_WIN[i];
      }
      fft512(re, im, false);
      const magSq = new Float32Array(FFT_HALF + 1);
      let energy = 0;
      for (let k = 0; k <= FFT_HALF; k++) {
        const p = re[k] * re[k] + im[k] * im[k];
        magSq[k] = p;
        if (k >= 2) energy += p;
      }
      if (energy > 1e-11) {
        frames.push({energy, magSq});
      }
    }
  }

  const noisePsd = new Float32Array(FFT_HALF + 1);
  if (frames.length < 4) return noisePsd;

  frames.sort((a, b) => a.energy - b.energy);
  const p75Energy = frames[Math.min(frames.length - 1, Math.floor(frames.length * 0.75))].energy;
  const minEnergy = frames[0].energy;

  // Guard against over-subtracting speech if the clip has almost no quiet pause frames
  const hasClearSilenceFrames = frames.length >= 10 && minEnergy <= p75Energy * 0.14;
  const sampleCount = Math.max(3, Math.min(frames.length, Math.floor(frames.length * 0.18)));

  let used = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (hasClearSilenceFrames && frames[i].energy > p75Energy * 0.18 && used >= 3) break;
    for (let k = 0; k <= FFT_HALF; k++) {
      noisePsd[k] += frames[i].magSq[k];
    }
    used++;
  }

  const safetyScale = hasClearSilenceFrames ? 1.0 : 0.35;
  const invUsed = used > 0 ? safetyScale / used : 0;
  for (let k = 0; k <= FFT_HALF; k++) {
    noisePsd[k] *= invUsed;
  }

  // Smooth PSD slightly across neighbor bins to eliminate narrowband estimation spikes
  const smoothed = new Float32Array(FFT_HALF + 1);
  smoothed[0] = noisePsd[0];
  smoothed[FFT_HALF] = noisePsd[FFT_HALF];
  for (let k = 1; k < FFT_HALF; k++) {
    smoothed[k] = 0.25 * noisePsd[k - 1] + 0.5 * noisePsd[k] + 0.25 * noisePsd[k + 1];
  }
  return smoothed;
}

function wienerDenoiseChunk(
  chunk: Float32Array,
  noisePsd: Float32Array,
  oversub: number,
  minGain: number,
  sampleRate: number
): Float32Array {
  if (chunk.length < FFT_N) return chunk;

  const len = chunk.length;
  const out = new Float32Array(len);
  const wsum = new Float32Array(len);
  const re = new Float32Array(FFT_N);
  const im = new Float32Array(FFT_N);
  const magSq = new Float32Array(FFT_HALF + 1);
  const gain = new Float32Array(FFT_HALF + 1);
  const gainSmooth = new Float32Array(FFT_HALF + 1);
  const prevCleanSq = new Float32Array(FFT_HALF + 1);

  const alphaDD = 0.88;
  const hissKneeBin = Math.floor((6500 / sampleRate) * FFT_N);

  for (let start = -(FFT_N - FFT_HOP); start < len; start += FFT_HOP) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FFT_N; i++) {
      const idx = start + i;
      const sample = idx >= 0 && idx < len ? chunk[idx] : 0;
      re[i] = sample * HANN_WIN[i];
    }

    fft512(re, im, false);

    for (let k = 0; k <= FFT_HALF; k++) {
      magSq[k] = re[k] * re[k] + im[k] * im[k];
    }

    for (let k = 0; k <= FFT_HALF; k++) {
      // Slightly stronger attenuation in high-frequency quantization hiss band (> 6.5 kHz)
      const bandWeight = k >= hissKneeBin ? oversub * 1.25 : oversub;
      const noiseFloor = noisePsd[k] * bandWeight;
      if (noiseFloor <= 1e-13) {
        gain[k] = 1;
        continue;
      }
      const gamma = magSq[k] / noiseFloor;
      const xi = alphaDD * (prevCleanSq[k] / noiseFloor) + (1 - alphaDD) * Math.max(gamma - 1, 0);
      const wiener = xi / (1 + xi);
      gain[k] = Math.max(minGain, Math.min(1, wiener));
    }

    gainSmooth[0] = gain[0];
    gainSmooth[FFT_HALF] = gain[FFT_HALF];
    for (let k = 1; k < FFT_HALF; k++) {
      gainSmooth[k] = 0.2 * gain[k - 1] + 0.6 * gain[k] + 0.2 * gain[k + 1];
    }

    for (let k = 0; k <= FFT_HALF; k++) {
      const g = gainSmooth[k];
      re[k] *= g;
      im[k] *= g;
      prevCleanSq[k] = g * g * magSq[k];
    }
    for (let k = 1; k < FFT_HALF; k++) {
      const g = gainSmooth[k];
      re[FFT_N - k] *= g;
      im[FFT_N - k] *= g;
    }

    fft512(re, im, true);

    for (let i = 0; i < FFT_N; i++) {
      const idx = start + i;
      if (idx >= 0 && idx < len) {
        const w = HANN_WIN[i];
        out[idx] += re[i] * w;
        wsum[idx] += w * w;
      }
    }
  }

  for (let i = 0; i < len; i++) {
    out[i] = wsum[i] > 1e-6 ? out[i] / wsum[i] : chunk[i];
  }
  return out;
}

export function denoisePocketChunks(
  rawChunks: Float32Array[],
  sampleRate: number,
  level: PocketDenoiseLevel
): Float32Array[] {
  if (level === 'raw') {
    return rawChunks.map((c) => applyEdgeFade(removeDcOffset(c), sampleRate, 6));
  }

  const hpfCutoff = level === 'strong' ? 75 : 65;
  const lpfCutoff = level === 'strong' ? 8800 : 9800;
  const oversub = level === 'strong' ? 1.65 : 1.15;
  const minGain = level === 'strong' ? 0.08 : 0.18;

  const hpf = makeHighPassCoeffs(hpfCutoff, sampleRate);
  const lpf = makeLowPassCoeffs(lpfCutoff, sampleRate);

  const prefiltered = rawChunks.map((chunk) =>
    chunk.length > 0 ? applyBiquad(removeDcOffset(chunk), hpf) : chunk
  );

  const noisePsd = analyzeNoiseProfile(prefiltered);

  return prefiltered.map((chunk) => {
    if (chunk.length === 0) return chunk;
    const denoised = wienerDenoiseChunk(chunk, noisePsd, oversub, minGain, sampleRate);
    const bandLimited = applyBiquad(denoised, lpf);
    return applyEdgeFade(bandLimited, sampleRate, 10);
  });
}

export function cleanVoiceCloneInput(samples: Float32Array, sampleRate = 24000): Float32Array {
  if (!samples.length) return samples;
  const noDc = removeDcOffset(samples);
  const hpf = makeHighPassCoeffs(80, sampleRate);
  const filtered = applyBiquad(noDc, hpf);
  const denoisedChunks = denoisePocketChunks([filtered], sampleRate, 'balanced');
  return softLimitAndNormalize(applyEdgeFade(denoisedChunks[0], sampleRate, 10), 0.85);
}
