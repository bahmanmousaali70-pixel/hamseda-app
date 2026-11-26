import type {PartnerAlertItem, PartnerAlertMode, VoiceName} from '../types/app';
import {isNativeAndroid, triggerNativePartnerAlertFeedback} from './nativeAndroidBridge';
import {speakFluentPersian} from './speechEngine';

const HANDLED_ALERTS_KEY = 'hamseda_handled_partner_alerts_v1';
const CONSECUTIVE_VIBRATION_PATTERN = [300, 140, 300, 140, 480, 160, 300, 140, 480];

let alertAudioCtx: AudioContext | null = null;

function getAlertAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Ctor) return null;
  if (!alertAudioCtx || alertAudioCtx.state === 'closed') {
    alertAudioCtx = new Ctor();
  }
  return alertAudioCtx;
}

export async function unlockPartnerAlertAudio(): Promise<boolean> {
  const ctx = getAlertAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

export function triggerConsecutiveVibration(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    return navigator.vibrate(CONSECUTIVE_VIBRATION_PATTERN);
  } catch {
    return false;
  }
}

export async function playPoliteAttentionAlarm(): Promise<boolean> {
  const ctx = getAlertAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state !== 'running') return false;

    const now = ctx.currentTime;
    // Balanced 50%-level gain so the alert is clearly audible outdoors without jarring blast.
    const notes: {freq: number; start: number; dur: number; peak: number}[] = [
      {freq: 587.33, start: 0.0, dur: 0.16, peak: 0.24},
      {freq: 783.99, start: 0.19, dur: 0.18, peak: 0.28},
      {freq: 987.77, start: 0.4, dur: 0.24, peak: 0.26},
      {freq: 783.99, start: 0.72, dur: 0.16, peak: 0.24},
      {freq: 987.77, start: 0.92, dur: 0.34, peak: 0.28},
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.freq, now + n.start);
      gain.gain.setValueAtTime(0.0001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(n.peak, now + n.start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.03);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1280));
    return true;
  } catch {
    return false;
  }
}

export function getHandledPartnerAlertIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HANDLED_ALERTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function markPartnerAlertHandled(alertId: string): void {
  try {
    const existing = Array.from(getHandledPartnerAlertIds());
    const next = [alertId, ...existing.filter((id) => id !== alertId)].slice(0, 60);
    localStorage.setItem(HANDLED_ALERTS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage limits
  }
}

export async function showPartnerAlertSystemNotification(alert: PartnerAlertItem): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const options: NotificationOptions & {vibrate?: number[]; renotify?: boolean} = {
    body: alert.spokenText,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'hamseda-shopping-alert',
    renotify: true,
    requireInteraction: true,
    silent: alert.mode === 'vibrate',
    vibrate: alert.mode === 'alarm' ? undefined : CONSECUTIVE_VIBRATION_PATTERN,
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(alert.title, options);
        return;
      }
    }
    new Notification(alert.title, options);
  } catch {
    // ignore notification errors when backgrounded
  }
}

export interface PartnerAlertExecutionReport {
  vibrated: boolean;
  alarmPlayed: boolean;
  speechStarted: boolean;
  volumeAdjustedToHalf: boolean;
  needsTapToPlayAudio: boolean;
}

export async function executePartnerAlertEffects(options: {
  mode: PartnerAlertMode;
  title: string;
  spokenText: string;
  voiceName: VoiceName;
  speechRate: number;
  alertRecord?: PartnerAlertItem;
  skipNotification?: boolean;
}): Promise<PartnerAlertExecutionReport> {
  const {mode, spokenText, voiceName, speechRate, alertRecord, skipNotification} = options;
  const shouldVibrate = mode === 'vibrate' || mode === 'both';
  const shouldAlarm = mode === 'alarm' || mode === 'both';

  let vibrated = false;
  let volumeAdjustedToHalf = false;
  let alarmPlayed = false;
  let speechStarted = false;
  let needsTapToPlayAudio = false;

  if (isNativeAndroid()) {
    const nativeRes = await triggerNativePartnerAlertFeedback({
      vibrate: shouldVibrate,
      ensureVolume: shouldAlarm,
      minVolumePercent: 50,
    });
    vibrated = Boolean(nativeRes.vibrated);
    volumeAdjustedToHalf = Boolean(nativeRes.volumeAdjusted);
  }

  if (shouldVibrate && !vibrated) {
    vibrated = triggerConsecutiveVibration();
  }

  if (!skipNotification && alertRecord) {
    void showPartnerAlertSystemNotification(alertRecord);
  }

  if (shouldAlarm) {
    alarmPlayed = await playPoliteAttentionAlarm();
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      void speakFluentPersian({
        text: spokenText,
        title: options.title,
        category: 'custom',
        voiceName,
        rate: speechRate,
        onStart: () => {
          speechStarted = true;
          done();
        },
        onEnd: done,
        onError: () => {
          needsTapToPlayAudio = !speechStarted;
          done();
        },
      });
      window.setTimeout(done, 4500);
    });
    if (!alarmPlayed && !speechStarted) {
      needsTapToPlayAudio = true;
    }
  }

  return {
    vibrated,
    alarmPlayed,
    speechStarted,
    volumeAdjustedToHalf,
    needsTapToPlayAudio,
  };
}
