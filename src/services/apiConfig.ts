import {Capacitor} from '@capacitor/core';

const SERVER_URL_KEY = 'rmz_cloud_api_base_v1';
const DEFAULT_NATIVE_API_BASE = 'https://ais-pre-5dqrp6vmbjkluesjlbth6l-737153117526.europe-west2.run.app';

export function getCloudApiBaseUrl(): string {
  if (!Capacitor.isNativePlatform()) {
    return '';
  }
  try {
    const saved = localStorage.getItem(SERVER_URL_KEY)?.trim();
    if (saved) {
      const normalizedSaved = saved.replace(/\/+$/, '');
      // Migrate installations that still point to legacy placeholder .ai.studio domains.
      if (
        normalizedSaved === 'https://roozhaye-manozari-7.ai.studio' ||
        normalizedSaved === 'https://hamseda-voice-suite.ai.studio'
      ) {
        localStorage.setItem(SERVER_URL_KEY, DEFAULT_NATIVE_API_BASE);
        return DEFAULT_NATIVE_API_BASE;
      }
      return normalizedSaved;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_NATIVE_API_BASE;
}

export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function setCloudApiBaseUrl(url: string): string {
  const cleaned = normalizeServerUrl(url);
  try {
    if (cleaned) {
      localStorage.setItem(SERVER_URL_KEY, cleaned);
    } else {
      localStorage.removeItem(SERVER_URL_KEY);
    }
  } catch {
    // ignore
  }
  return cleaned;
}

export function apiUrl(path: string): string {
  const base = getCloudApiBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function safeReadJsonResponse<T = Record<string, unknown>>(
  res: Response
): Promise<{data: T | null; isHtml: boolean}> {
  try {
    const raw = await res.text();
    const trimmed = raw.trimStart();
    if (!trimmed) {
      return {data: null, isHtml: false};
    }
    if (trimmed.startsWith('<')) {
      return {data: null, isHtml: true};
    }
    return {data: JSON.parse(trimmed) as T, isHtml: false};
  } catch {
    return {data: null, isHtml: false};
  }
}
