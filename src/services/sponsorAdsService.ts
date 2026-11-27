import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {apiUrl, safeReadJsonResponse} from './apiConfig';
import {
  auth,
  db,
  ensureAnonymousDeviceIdentity,
  handleFirestoreError,
  OperationType,
} from './firebaseClient';
import type {CoinGatedFeatureKey, SponsorAdItem, SponsorPackageTier} from '../types/app';

export const SPONSOR_CONTACT_PROFILE_URL = 'https://tapnfc.ir/bahman-mousaali';

export const SPONSOR_PACKAGE_PRESETS: Record<
  SponsorPackageTier,
  {
    id: SponsorPackageTier;
    label: string;
    shortLabel: string;
    durationDays: number;
    priority: number;
    defaultCoins: number;
    hint: string;
  }
> = {
  starter: {
    id: 'starter',
    label: 'پکیج آشنایی (۷ روز)',
    shortLabel: 'آشنایی ۷ روزه',
    durationDays: 7,
    priority: 3,
    defaultCoins: 30,
    hint: 'نمایش معمولی در چرخه سکه به مدت ۷ روز',
  },
  standard: {
    id: 'standard',
    label: 'پکیج استاندارد ماهانه (۳۰ روز)',
    shortLabel: 'استاندارد ۳۰ روزه',
    durationDays: 30,
    priority: 5,
    defaultCoins: 30,
    hint: 'حضور مداوم در چرخه سکه به مدت ۳۰ روز',
  },
  featured: {
    id: 'featured',
    label: 'پکیج ویژه پربازدید (اولویت‌دار)',
    shortLabel: 'ویژه اولویت‌دار',
    durationDays: 30,
    priority: 9,
    defaultCoins: 45,
    hint: 'اولویت اول صف نمایش + پاداش سکه بالاتر',
  },
  exclusive: {
    id: 'exclusive',
    label: 'اسپانسر انحصاری (تک‌برند)',
    shortLabel: 'انحصاری تک‌برند',
    durationDays: 30,
    priority: 10,
    defaultCoins: 50,
    hint: 'حذف آگهی رقیب + نمایش نام برند در فوتر کل برنامه',
  },
};

export const STARTER_COINS = 50;
export const DAILY_BONUS_COINS = 10;
export const DEFAULT_AD_REWARD_COINS = 30;
export const DEFAULT_AD_DURATION_SECONDS = 10;

const WALLET_STORAGE_KEY = 'hamseda_coin_wallet_v1';
const WALLET_TOKEN_STORAGE_KEY = 'hamseda_coin_wallet_token_v1';

export const COIN_COSTS: Record<CoinGatedFeatureKey, {cost: number; label: string}> = {
  ai_morning_message: {cost: 5, label: 'تولید پیام روز هوشمند'},
  ai_special_message: {cost: 5, label: 'ساخت پیام مناسبتی هوشمند'},
  ai_movies_discover: {cost: 5, label: 'پیشنهادگر هوشمند فیلم و سریال'},
  ai_music_discover: {cost: 5, label: 'جستجوی آنلاین پلی‌لیست موسیقی'},
  ai_assistant_online: {cost: 3, label: 'پرسش‌وپاسخ آنلاین دستیار هوشمند'},
  ai_studio_voice: {cost: 5, label: 'ساخت صدای استودیویی فارسی'},
  ai_phonetic: {cost: 2, label: 'تحلیل هوشمند تلفظ دوزبانه'},
};

export interface AdQuotaStatus {
  usedInWindow: number;
  maxPerWindow: number;
  remainingInWindow: number;
  windowHours: number;
  nextAvailableAt: number | null;
  remainingMs: number;
}

export type SocialSponsorMissionId = 'instagram_tapnfc' | 'bale_tapnfc';

export interface SocialSponsorMissionInfo {
  id: SocialSponsorMissionId;
  platform: 'instagram' | 'bale';
  title: string;
  subtitle: string;
  handleDisplay: string;
  url: string;
  rewardCoins: number;
  minAwaySeconds: number;
}

export const SOCIAL_SPONSOR_MISSIONS: SocialSponsorMissionInfo[] = [
  {
    id: 'instagram_tapnfc',
    platform: 'instagram',
    title: 'فالو پیج اینستاگرام اسپانسر (tapnfc.ir)',
    subtitle: 'باز کردن صفحه اینستاگرام، فالو پیج و بازگشت برای دریافت سکه یک‌بار',
    handleDisplay: '@tapnfc.ir',
    url: 'https://instagram.com/tapnfc.ir',
    rewardCoins: 150,
    minAwaySeconds: 0,
  },
  {
    id: 'bale_tapnfc',
    platform: 'bale',
    title: 'عضویت در کانال رسمی بله (tapnfc.ir)',
    subtitle: 'باز کردن کانال رسمی بله، عضویت و بازگشت برای دریافت سکه یک‌بار',
    handleDisplay: 'ble.ir/join/3FruE362Hv',
    url: 'https://ble.ir/join/3FruE362Hv',
    rewardCoins: 150,
    minAwaySeconds: 0,
  },
];

export interface WalletSnapshot {
  coins: number;
  lastDailyBonusDate: string;
  totalAdsWatched: number;
  adQuota?: AdQuotaStatus;
  claimedSocialMissions?: string[];
}

export class SponsorAdCooldownError extends Error {
  adQuota: AdQuotaStatus;
  constructor(message: string, adQuota: AdQuotaStatus) {
    super(message);
    this.name = 'SponsorAdCooldownError';
    this.adQuota = adQuota;
  }
}

export function formatCooldownDurationFa(remainingMs: number): string {
  const safeMs = Math.max(0, Math.round(remainingMs));
  const totalSec = Math.ceil(safeMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const toFa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  const pad2 = (n: number) => toFa(Number(n)).padStart(2, '۰');
  return `${toFa(hours)}:${pad2(mins)}:${pad2(secs)}`;
}

const pendingReceiptByFeature = new Map<CoinGatedFeatureKey, string>();
const lastMetricCooldownByKey = new Map<string, number>();

function getTodayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function normalizeSponsorUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function sanitizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /[\s\u0000-\u001f]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return null;
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function formatSponsorErrorFa(err: unknown, fallback = 'خطا در عملیات تبلیغات.'): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (!raw) return fallback;
  let extracted = raw;
  try {
    const parsed = JSON.parse(raw) as {error?: string};
    if (parsed && typeof parsed.error === 'string') {
      extracted = parsed.error;
    }
  } catch {
    // not JSON
  }
  const lower = extracted.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('insufficient permissions')) {
    return 'دسترسی فایربیس تایید نشد؛ روی «خروج ادمین» بزنید و دوباره با حساب گوگل مدیر (mehdi.secret7@gmail.com) وارد شوید.';
  }
  if (lower.includes('unavailable') || lower.includes('offline') || lower.includes('network')) {
    return 'ارتباط با سرور فایربیس برقرار نشد؛ اتصال اینترنت یا فیلترشکن را بررسی کنید.';
  }
  return extracted.length > 220 ? fallback : extracted;
}

export function readWalletSnapshot(): WalletSnapshot {
  const today = getTodayDateKey();
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!raw) {
      const initial: WalletSnapshot = {
        coins: STARTER_COINS,
        lastDailyBonusDate: today,
        totalAdsWatched: 0,
      };
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<WalletSnapshot>;
    const coins =
      typeof parsed.coins === 'number' && Number.isFinite(parsed.coins)
        ? Math.max(0, Math.min(5000, Math.round(parsed.coins)))
        : STARTER_COINS;
    const totalAdsWatched =
      typeof parsed.totalAdsWatched === 'number' && Number.isFinite(parsed.totalAdsWatched)
        ? Math.max(0, Math.round(parsed.totalAdsWatched))
        : 0;
    const lastBonus = typeof parsed.lastDailyBonusDate === 'string' ? parsed.lastDailyBonusDate : today;
    const claimedSocialMissions = Array.isArray(parsed.claimedSocialMissions)
      ? parsed.claimedSocialMissions.filter((x): x is string => typeof x === 'string')
      : [];

    return {
      coins,
      lastDailyBonusDate: lastBonus,
      totalAdsWatched,
      claimedSocialMissions,
    };
  } catch {
    return {coins: STARTER_COINS, lastDailyBonusDate: today, totalAdsWatched: 0, claimedSocialMissions: []};
  }
}

export function writeWalletSnapshot(next: WalletSnapshot): void {
  try {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

function readWalletToken(): string {
  try {
    return localStorage.getItem(WALLET_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeWalletToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(WALLET_TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // ignore storage errors
  }
}

async function getFirebaseAuthToken(): Promise<string> {
  const user = auth.currentUser ?? (await ensureAnonymousDeviceIdentity());
  return user.getIdToken();
}

export async function syncWalletWithServer(): Promise<WalletSnapshot | null> {
  try {
    const idToken = await getFirebaseAuthToken();
    const res = await fetch(apiUrl('/api/wallet/bootstrap'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({walletToken: readWalletToken()}),
    });
    const parsed = await safeReadJsonResponse<{wallet?: WalletSnapshot; walletToken?: string}>(res);
    if (!res.ok || parsed.isHtml || !parsed.data?.wallet || !parsed.data?.walletToken) {
      return null;
    }
    writeWalletToken(parsed.data.walletToken);
    writeWalletSnapshot(parsed.data.wallet);
    return parsed.data.wallet;
  } catch {
    return null;
  }
}

export async function spendCoinsOnServer(feature: CoinGatedFeatureKey): Promise<{
  ok: boolean;
  wallet?: WalletSnapshot;
  error?: string;
}> {
  const idToken = await getFirebaseAuthToken();
  const res = await fetch(apiUrl('/api/wallet/spend'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      feature,
      walletToken: readWalletToken(),
    }),
  });
  const parsed = await safeReadJsonResponse<{
    wallet?: WalletSnapshot;
    walletToken?: string;
    spendReceiptToken?: string;
    error?: string;
  }>(res);

  if (parsed.isHtml || !parsed.data) {
    throw new Error('پاسخ معتبری از سرور کیف پول دریافت نشد.');
  }

  if (parsed.data.walletToken) {
    writeWalletToken(parsed.data.walletToken);
  }
  if (parsed.data.wallet) {
    writeWalletSnapshot(parsed.data.wallet);
  }

  if (res.status === 402 || !res.ok) {
    return {
      ok: false,
      wallet: parsed.data.wallet,
      error: parsed.data.error,
    };
  }

  if (parsed.data.spendReceiptToken) {
    pendingReceiptByFeature.set(feature, parsed.data.spendReceiptToken);
  }
  return {
    ok: true,
    wallet: parsed.data.wallet,
  };
}

export async function getAuthenticatedHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  try {
    const idToken = await getFirebaseAuthToken();
    headers.Authorization = `Bearer ${idToken}`;
  } catch {
    // caller handles 401 cleanly
  }
  return headers;
}

export async function getCoinProtectedHeaders(feature: CoinGatedFeatureKey): Promise<Record<string, string>> {
  const headers = await getAuthenticatedHeaders();
  const receipt = pendingReceiptByFeature.get(feature);
  if (receipt) {
    pendingReceiptByFeature.delete(feature);
    headers['X-Coin-Receipt'] = receipt;
  }
  return headers;
}

export async function startSponsorAdSession(adId: string): Promise<{
  sessionToken: string;
  rewardCoins: number;
  durationSeconds: number;
  adQuota?: AdQuotaStatus;
}> {
  const idToken = await getFirebaseAuthToken();
  const res = await fetch(apiUrl('/api/ads/session/start'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      adId,
      walletToken: readWalletToken(),
    }),
  });
  const parsed = await safeReadJsonResponse<{
    code?: string;
    adQuota?: AdQuotaStatus;
    wallet?: WalletSnapshot;
    walletToken?: string;
    sessionToken?: string;
    rewardCoins?: number;
    durationSeconds?: number;
    error?: string;
  }>(res);
  if (parsed.data?.walletToken) writeWalletToken(parsed.data.walletToken);
  if (parsed.data?.wallet) writeWalletSnapshot(parsed.data.wallet);
  if (res.status === 429 && parsed.data?.code === 'AD_QUOTA_COOLDOWN' && parsed.data.adQuota) {
    throw new SponsorAdCooldownError(
      parsed.data.error || 'سهمیه ۳ ساعته مشاهده تبلیغ شما تکمیل شده است.',
      parsed.data.adQuota
    );
  }
  if (parsed.isHtml || !res.ok || !parsed.data?.sessionToken) {
    throw new Error(parsed.data?.error || 'امکان شروع تایمر امن حامی وجود نداشت.');
  }
  return {
    sessionToken: parsed.data.sessionToken,
    rewardCoins: parsed.data.rewardCoins ?? DEFAULT_AD_REWARD_COINS,
    durationSeconds: parsed.data.durationSeconds ?? DEFAULT_AD_DURATION_SECONDS,
    adQuota: parsed.data.adQuota,
  };
}

export async function claimSponsorAdSession(sessionToken: string): Promise<{
  wallet: WalletSnapshot;
  earnedCoins: number;
}> {
  const idToken = await getFirebaseAuthToken();
  const res = await fetch(apiUrl('/api/ads/session/claim'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      sessionToken,
      walletToken: readWalletToken(),
    }),
  });
  const parsed = await safeReadJsonResponse<{
    code?: string;
    adQuota?: AdQuotaStatus;
    wallet?: WalletSnapshot;
    walletToken?: string;
    earnedCoins?: number;
    error?: string;
  }>(res);
  if (parsed.data?.walletToken) writeWalletToken(parsed.data.walletToken);
  if (parsed.data?.wallet) writeWalletSnapshot(parsed.data.wallet);
  if (res.status === 429 && parsed.data?.code === 'AD_QUOTA_COOLDOWN' && parsed.data.adQuota) {
    throw new SponsorAdCooldownError(
      parsed.data.error || 'سهمیه ۳ ساعته مشاهده تبلیغ شما تکمیل شده است.',
      parsed.data.adQuota
    );
  }
  if (parsed.isHtml || !res.ok || !parsed.data?.wallet || !parsed.data?.walletToken) {
    throw new Error(parsed.data?.error || 'تایید پاداش سکه از سرور انجام نشد.');
  }
  return {
    wallet: parsed.data.wallet,
    earnedCoins: parsed.data.earnedCoins ?? DEFAULT_AD_REWARD_COINS,
  };
}

export async function startSocialMissionSession(missionId: SocialSponsorMissionId): Promise<{
  missionToken: string;
  missionId: SocialSponsorMissionId;
  rewardCoins: number;
  minAwaySeconds: number;
}> {
  const idToken = await getFirebaseAuthToken();
  const res = await fetch(apiUrl('/api/social-missions/start'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      missionId,
      walletToken: readWalletToken(),
    }),
  });
  const parsed = await safeReadJsonResponse<{
    code?: string;
    missionToken?: string;
    missionId?: SocialSponsorMissionId;
    rewardCoins?: number;
    minAwaySeconds?: number;
    wallet?: WalletSnapshot;
    walletToken?: string;
    error?: string;
  }>(res);
  if (parsed.data?.walletToken) writeWalletToken(parsed.data.walletToken);
  if (parsed.data?.wallet) writeWalletSnapshot(parsed.data.wallet);
  if (parsed.isHtml || !res.ok || !parsed.data?.missionToken) {
    throw new Error(parsed.data?.error || 'امکان شروع بررسی عضویت وجود نداشت.');
  }
  return {
    missionToken: parsed.data.missionToken,
    missionId: parsed.data.missionId ?? missionId,
    rewardCoins: parsed.data.rewardCoins ?? 150,
    minAwaySeconds: parsed.data.minAwaySeconds ?? 0,
  };
}

export async function claimSocialMissionSession(missionToken: string): Promise<{
  wallet: WalletSnapshot;
  earnedCoins: number;
  missionId: SocialSponsorMissionId;
}> {
  const idToken = await getFirebaseAuthToken();
  const res = await fetch(apiUrl('/api/social-missions/claim'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      missionToken,
      walletToken: readWalletToken(),
    }),
  });
  const parsed = await safeReadJsonResponse<{
    wallet?: WalletSnapshot;
    walletToken?: string;
    earnedCoins?: number;
    missionId?: SocialSponsorMissionId;
    error?: string;
  }>(res);
  if (parsed.data?.walletToken) writeWalletToken(parsed.data.walletToken);
  if (parsed.data?.wallet) writeWalletSnapshot(parsed.data.wallet);
  if (parsed.isHtml || !res.ok || !parsed.data?.wallet || !parsed.data?.walletToken) {
    throw new Error(parsed.data?.error || 'تایید و ثبت سکه عضویت انجام نشد.');
  }
  return {
    wallet: parsed.data.wallet,
    earnedCoins: parsed.data.earnedCoins ?? 150,
    missionId: parsed.data.missionId ?? 'instagram_tapnfc',
  };
}

export const HOUSE_SPONSOR_AD: SponsorAdItem = {
  id: 'house-tapnfc',
  title: 'حمایت ویژه هم‌صدا · TapNFC.ir',
  description: 'کارت ویزیت هوشمند، منوی دیجیتال و تگ‌های NFC اختصاصی برای معرفی حرفه‌ای کسب‌وکار شما.',
  imageUrl: '',
  linkUrl: 'https://tapnfc.ir',
  rewardCoins: DEFAULT_AD_REWARD_COINS,
  durationSeconds: DEFAULT_AD_DURATION_SECONDS,
  active: true,
  impressions: 0,
  clicks: 0,
  createdByUid: 'house',
};

function getTimestampMillis(val: unknown): number {
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as {toMillis?: unknown}).toMillis === 'function') {
    return (val as {toMillis: () => number}).toMillis();
  }
  return 0;
}

function mapDocToSponsorAd(id: string, data: Record<string, unknown>): SponsorAdItem {
  const tierRaw = typeof data.packageTier === 'string' ? data.packageTier : undefined;
  const packageTier: SponsorPackageTier =
    tierRaw === 'starter' || tierRaw === 'standard' || tierRaw === 'featured' || tierRaw === 'exclusive'
      ? tierRaw
      : 'standard';
  const defaultPriority = SPONSOR_PACKAGE_PRESETS[packageTier].priority;
  return {
    id: typeof data.id === 'string' ? data.id : id,
    title: String(data.title || 'آگهی حامی هم‌صدا'),
    description: String(data.description || ''),
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    linkUrl: String(data.linkUrl || 'https://tapnfc.ir'),
    rewardCoins: typeof data.rewardCoins === 'number' ? data.rewardCoins : DEFAULT_AD_REWARD_COINS,
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : DEFAULT_AD_DURATION_SECONDS,
    active: Boolean(data.active),
    packageTier,
    priority: typeof data.priority === 'number' ? Math.max(1, Math.min(10, Math.round(data.priority))) : defaultPriority,
    durationDays: typeof data.durationDays === 'number' ? Math.max(0, Math.round(data.durationDays)) : 0,
    expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : 0,
    brandLabel: typeof data.brandLabel === 'string' ? data.brandLabel : '',
    impressions: typeof data.impressions === 'number' ? data.impressions : 0,
    clicks: typeof data.clicks === 'number' ? data.clicks : 0,
    createdByUid: String(data.createdByUid || ''),
  };
}

export function isSponsorAdLive(ad: SponsorAdItem, now = Date.now()): boolean {
  if (!ad.active || !sanitizeHttpUrl(ad.linkUrl)) return false;
  if (typeof ad.expiresAt === 'number' && ad.expiresAt > 0 && ad.expiresAt < now) return false;
  return true;
}

export function getExclusiveFooterSponsor(
  ads: SponsorAdItem[],
  now = Date.now()
): {label: string; url: string} | null {
  const exclusives = ads
    .filter((a) => isSponsorAdLive(a, now) && a.packageTier === 'exclusive')
    .sort((a, b) => (b.priority ?? 10) - (a.priority ?? 10));
  if (exclusives.length === 0) return null;
  const top = exclusives[0];
  return {
    label: (top.brandLabel || '').trim() || top.title,
    url: sanitizeHttpUrl(top.linkUrl) || 'https://tapnfc.ir',
  };
}

export async function fetchActiveSponsorAds(): Promise<SponsorAdItem[]> {
  if (!auth.currentUser) return [];
  const path = 'sponsorAds';
  try {
    const q = query(collection(db, path), where('active', '==', true));
    const snap = await getDocs(q);
    const itemsWithTs: {item: SponsorAdItem; ts: number}[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      itemsWithTs.push({
        item: mapDocToSponsorAd(docSnap.id, data),
        ts: getTimestampMillis(data.updatedAt) || getTimestampMillis(data.createdAt),
      });
    });
    itemsWithTs.sort((a, b) => b.ts - a.ts);
    return itemsWithTs.map((entry) => entry.item);
  } catch (err) {
    console.warn('Could not load sponsor ads from Firestore, using fallback:', err);
    return [];
  }
}

export function subscribeActiveSponsorAds(
  onUpdate: (ads: SponsorAdItem[]) => void
): () => void {
  if (!auth.currentUser) {
    onUpdate([]);
    return () => {};
  }
  const path = 'sponsorAds';
  const q = query(collection(db, path), where('active', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const itemsWithTs: {item: SponsorAdItem; ts: number}[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        itemsWithTs.push({
          item: mapDocToSponsorAd(docSnap.id, data),
          ts: getTimestampMillis(data.updatedAt) || getTimestampMillis(data.createdAt),
        });
      });
      itemsWithTs.sort((a, b) => b.ts - a.ts);
      onUpdate(itemsWithTs.map((entry) => entry.item));
    },
    (err) => {
      console.warn('Active sponsor ads listener notice:', err instanceof Error ? err.message : err);
    }
  );
}

export function pickSponsorAdForUser(ads: SponsorAdItem[], indexHint = 0): SponsorAdItem {
  const now = Date.now();
  const valid = ads.filter((a) => isSponsorAdLive(a, now));
  if (valid.length === 0) return HOUSE_SPONSOR_AD;

  // If an active non-expired Exclusive contract exists, suppress competitor ads completely
  const exclusiveAds = valid
    .filter((a) => a.packageTier === 'exclusive')
    .sort((a, b) => (b.priority ?? 10) - (a.priority ?? 10));
  if (exclusiveAds.length > 0) {
    return exclusiveAds[Math.abs(indexHint) % exclusiveAds.length];
  }

  // Otherwise sort by priority descending and weight featured/high-priority slots
  const sorted = [...valid].sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5));
  const weighted: SponsorAdItem[] = [];
  for (const ad of sorted) {
    const p = ad.priority ?? 5;
    const copies = p >= 8 ? 3 : p >= 5 ? 2 : 1;
    for (let i = 0; i < copies; i += 1) {
      weighted.push(ad);
    }
  }
  return weighted[Math.abs(indexHint) % weighted.length];
}

export function subscribeAllSponsorAdsAdmin(
  onUpdate: (ads: SponsorAdItem[]) => void,
  onError: (msg: string) => void
): () => void {
  const path = 'sponsorAds';
  const q = query(collection(db, path), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: SponsorAdItem[] = [];
      snap.forEach((d) => {
        list.push(mapDocToSponsorAd(d.id, d.data() as Record<string, unknown>));
      });
      onUpdate(list);
    },
    (err) => {
      onError(formatSponsorErrorFa(err, 'خطا در دریافت لیست آگهی‌ها'));
    }
  );
}

export async function createSponsorAd(input: {
  title: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  rewardCoins: number;
  durationSeconds: number;
  active: boolean;
  packageTier?: SponsorPackageTier;
  priority?: number;
  durationDays?: number;
  expiresAt?: number;
  brandLabel?: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('ابتدا وارد حساب ادمین شوید.');
  const safeLink = sanitizeHttpUrl(input.linkUrl);
  if (!safeLink) throw new Error('لینک مقصد باید با https:// یا http:// شروع شود.');
  const safeImage = input.imageUrl.trim() ? sanitizeHttpUrl(input.imageUrl) : '';
  if (input.imageUrl.trim() && !safeImage) {
    throw new Error('نشانی تصویر بنر باید با https:// یا http:// شروع شود.');
  }

  const packageTier: SponsorPackageTier = input.packageTier ?? 'standard';
  const durationDays = Math.max(0, Math.min(365, Math.round(input.durationDays ?? 0)));
  const computedExpiresAt =
    typeof input.expiresAt === 'number'
      ? Math.max(0, Math.round(input.expiresAt))
      : durationDays > 0
        ? Date.now() + durationDays * 24 * 60 * 60 * 1000
        : 0;
  const priority = Math.max(
    1,
    Math.min(10, Math.round(input.priority ?? SPONSOR_PACKAGE_PRESETS[packageTier].priority))
  );

  const id = `ad-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const path = `sponsorAds/${id}`;
  const docData = {
    id,
    title: input.title.trim().slice(0, 120),
    description: input.description.trim().slice(0, 300),
    imageUrl: safeImage || '',
    linkUrl: safeLink.slice(0, 1000),
    rewardCoins: Math.max(5, Math.min(500, Math.round(input.rewardCoins || DEFAULT_AD_REWARD_COINS))),
    durationSeconds: Math.max(5, Math.min(60, Math.round(input.durationSeconds || DEFAULT_AD_DURATION_SECONDS))),
    active: Boolean(input.active),
    packageTier,
    priority,
    durationDays,
    expiresAt: computedExpiresAt,
    brandLabel: (input.brandLabel || '').trim().slice(0, 60),
    impressions: 0,
    clicks: 0,
    createdByUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'sponsorAds', id), docData);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateSponsorAd(
  adId: string,
  patch: {
    title?: string;
    description?: string;
    imageUrl?: string;
    linkUrl?: string;
    rewardCoins?: number;
    durationSeconds?: number;
    active?: boolean;
    packageTier?: SponsorPackageTier;
    priority?: number;
    durationDays?: number;
    expiresAt?: number;
    brandLabel?: string;
    impressions?: number;
    clicks?: number;
  }
): Promise<void> {
  const path = `sponsorAds/${adId}`;
  const fields: Record<string, unknown> = {updatedAt: serverTimestamp()};
  if (typeof patch.title === 'string') fields.title = patch.title.trim().slice(0, 120);
  if (typeof patch.description === 'string') fields.description = patch.description.trim().slice(0, 300);
  if (typeof patch.imageUrl === 'string') {
    if (patch.imageUrl.trim()) {
      const safe = sanitizeHttpUrl(patch.imageUrl);
      if (!safe) throw new Error('نشانی تصویر نامعتبر است.');
      fields.imageUrl = safe;
    } else {
      fields.imageUrl = '';
    }
  }
  if (typeof patch.linkUrl === 'string') {
    const safe = sanitizeHttpUrl(patch.linkUrl);
    if (!safe) throw new Error('لینک مقصد باید معتبر و با https:// یا http:// باشد.');
    fields.linkUrl = safe;
  }
  if (typeof patch.rewardCoins === 'number') {
    fields.rewardCoins = Math.max(5, Math.min(500, Math.round(patch.rewardCoins)));
  }
  if (typeof patch.durationSeconds === 'number') {
    fields.durationSeconds = Math.max(5, Math.min(60, Math.round(patch.durationSeconds)));
  }
  if (typeof patch.active === 'boolean') fields.active = patch.active;
  if (patch.packageTier) fields.packageTier = patch.packageTier;
  if (typeof patch.priority === 'number') {
    fields.priority = Math.max(1, Math.min(10, Math.round(patch.priority)));
  }
  if (typeof patch.durationDays === 'number') {
    fields.durationDays = Math.max(0, Math.min(365, Math.round(patch.durationDays)));
  }
  if (typeof patch.expiresAt === 'number') {
    fields.expiresAt = Math.max(0, Math.round(patch.expiresAt));
  }
  if (typeof patch.brandLabel === 'string') {
    fields.brandLabel = patch.brandLabel.trim().slice(0, 60);
  }
  if (typeof patch.impressions === 'number') {
    fields.impressions = Math.max(0, Math.round(patch.impressions));
  }
  if (typeof patch.clicks === 'number') {
    fields.clicks = Math.max(0, Math.round(patch.clicks));
  }

  try {
    await updateDoc(doc(db, 'sponsorAds', adId), fields);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteSponsorAd(adId: string): Promise<void> {
  const path = `sponsorAds/${adId}`;
  try {
    await deleteDoc(doc(db, 'sponsorAds', adId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function recordSponsorAdImpression(adId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!adId || adId === HOUSE_SPONSOR_AD.id || !uid) return;
  const cooldownKey = `imp:${adId}:${uid}`;
  const now = Date.now();
  if ((lastMetricCooldownByKey.get(cooldownKey) ?? 0) + 11000 > now) return;
  lastMetricCooldownByKey.set(cooldownKey, now);

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'sponsorAds', adId, 'userMetrics', uid),
      {uid, lastImpressionAt: serverTimestamp()},
      {merge: true}
    );
    batch.update(doc(db, 'sponsorAds', adId), {
      impressions: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch {
    // non-fatal analytics failure (e.g. within 10s server cooldown)
  }
}

export async function recordSponsorAdClick(adId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!adId || adId === HOUSE_SPONSOR_AD.id || !uid) return;
  const cooldownKey = `clk:${adId}:${uid}`;
  const now = Date.now();
  if ((lastMetricCooldownByKey.get(cooldownKey) ?? 0) + 11000 > now) return;
  lastMetricCooldownByKey.set(cooldownKey, now);

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'sponsorAds', adId, 'userMetrics', uid),
      {uid, lastClickAt: serverTimestamp()},
      {merge: true}
    );
    batch.update(doc(db, 'sponsorAds', adId), {
      clicks: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch {
    // non-fatal analytics failure (e.g. within 10s server cooldown)
  }
}
