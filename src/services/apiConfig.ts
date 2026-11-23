const SERVER_URL_KEY = 'rmz_cloud_api_base_v1';
const DEFAULT_API_BASE = 'https://hamseda-app.ai.studio';
const LEGACY_API_BASES = new Set([
  'https://hamseda-app-518643423697.europe-west2.run.app',
  'https://roozhaye-manozari-7.ai.studio',
  'https://hamseda-voice-suite.ai.studio',
  'https://ais-pre-5dqrp6vmbjkluesjlbth6l-737153117526.europe-west2.run.app',
  'https://ais-dev-5dqrp6vmbjkluesjlbth6l-737153117526.europe-west2.run.app',
]);

export function getCloudApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem(SERVER_URL_KEY)?.trim();
    if (saved) {
      const normalizedSaved = saved.replace(/\/+$/, '');
      if (LEGACY_API_BASES.has(normalizedSaved)) {
        localStorage.setItem(SERVER_URL_KEY, DEFAULT_API_BASE);
        return DEFAULT_API_BASE;
      }
      return normalizedSaved;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_API_BASE;
}

export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
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
  return base + (path.startsWith('/') ? path : '/' + path);
}

export function wsUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  const base = getCloudApiBaseUrl();
  const wsBase = base.replace(/^http(s?):\/\//i, 'ws$1://');
  return wsBase + normalizedPath;
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
