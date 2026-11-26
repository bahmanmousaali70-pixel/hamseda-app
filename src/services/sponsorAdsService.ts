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
} from 'firebase/firestore';
import {auth, db, handleFirestoreError, OperationType} from './firebaseClient';
import type {CoinGatedFeatureKey, SponsorAdItem} from '../types/app';

export const STARTER_COINS = 50;
export const DAILY_BONUS_COINS = 10;
export const DEFAULT_AD_REWARD_COINS = 30;
export const DEFAULT_AD_DURATION_SECONDS = 10;

const WALLET_STORAGE_KEY = 'hamseda_coin_wallet_v1';

export const COIN_COSTS: Record<CoinGatedFeatureKey, {cost: number; label: string}> = {
  ai_morning_message: {cost: 5, label: 'تولید پیام روز هوشمند'},
  ai_special_message: {cost: 5, label: 'ساخت پیام مناسبتی هوشمند'},
  ai_movies_discover: {cost: 5, label: 'پیشنهادگر هوشمند فیلم و سریال'},
  ai_music_discover: {cost: 5, label: 'جستجوی آنلاین پلی‌لیست موسیقی'},
  ai_assistant_online: {cost: 3, label: 'پرسش‌وپاسخ آنلاین دستیار هوشمند'},
  ai_studio_voice: {cost: 5, label: 'ساخت صدای استودیویی فارسی'},
  ai_phonetic: {cost: 2, label: 'تحلیل هوشمند تلفظ دوزبانه'},
};

export interface WalletSnapshot {
  coins: number;
  lastDailyBonusDate: string;
  totalAdsWatched: number;
}

function getTodayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function sanitizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
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
    const baseCoins = typeof parsed.coins === 'number' && Number.isFinite(parsed.coins)
      ? Math.max(0, Math.round(parsed.coins))
      : STARTER_COINS;
    const totalAdsWatched = typeof parsed.totalAdsWatched === 'number' && Number.isFinite(parsed.totalAdsWatched)
      ? Math.max(0, Math.round(parsed.totalAdsWatched))
      : 0;
    const lastBonus = typeof parsed.lastDailyBonusDate === 'string' ? parsed.lastDailyBonusDate : '';

    if (lastBonus !== today) {
      const updated: WalletSnapshot = {
        coins: baseCoins + DAILY_BONUS_COINS,
        lastDailyBonusDate: today,
        totalAdsWatched,
      };
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    }

    return {
      coins: baseCoins,
      lastDailyBonusDate: lastBonus,
      totalAdsWatched,
    };
  } catch {
    return {coins: STARTER_COINS, lastDailyBonusDate: today, totalAdsWatched: 0};
  }
}

export function writeWalletSnapshot(next: WalletSnapshot): void {
  try {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
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

function mapDocToSponsorAd(id: string, data: Record<string, unknown>): SponsorAdItem {
  return {
    id: typeof data.id === 'string' ? data.id : id,
    title: String(data.title || 'آگهی حامی هم‌صدا'),
    description: String(data.description || ''),
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    linkUrl: String(data.linkUrl || 'https://tapnfc.ir'),
    rewardCoins: typeof data.rewardCoins === 'number' ? data.rewardCoins : DEFAULT_AD_REWARD_COINS,
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : DEFAULT_AD_DURATION_SECONDS,
    active: Boolean(data.active),
    impressions: typeof data.impressions === 'number' ? data.impressions : 0,
    clicks: typeof data.clicks === 'number' ? data.clicks : 0,
    createdByUid: String(data.createdByUid || ''),
  };
}

export async function fetchActiveSponsorAds(): Promise<SponsorAdItem[]> {
  if (!auth.currentUser) return [];
  const path = 'sponsorAds';
  try {
    const q = query(collection(db, path), where('active', '==', true));
    const snap = await getDocs(q);
    const items: SponsorAdItem[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      items.push(mapDocToSponsorAd(docSnap.id, data));
    });
    return items;
  } catch (err) {
    console.warn('Could not load sponsor ads from Firestore, using fallback:', err);
    return [];
  }
}

export function pickSponsorAdForUser(ads: SponsorAdItem[], indexHint = 0): SponsorAdItem {
  const valid = ads.filter((a) => a.active && sanitizeHttpUrl(a.linkUrl));
  if (valid.length === 0) return HOUSE_SPONSOR_AD;
  return valid[Math.abs(indexHint) % valid.length];
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
      onError(err instanceof Error ? err.message : 'خطا در دریافت لیست آگهی‌ها');
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
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('ابتدا وارد حساب ادمین شوید.');
  const safeLink = sanitizeHttpUrl(input.linkUrl);
  if (!safeLink) throw new Error('لینک مقصد باید با https:// یا http:// شروع شود.');
  const safeImage = input.imageUrl.trim() ? sanitizeHttpUrl(input.imageUrl) : '';
  if (input.imageUrl.trim() && !safeImage) {
    throw new Error('نشانی تصویر بنر باید با https:// یا http:// شروع شود.');
  }

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
  if (!adId || adId === HOUSE_SPONSOR_AD.id || !auth.currentUser) return;
  try {
    await updateDoc(doc(db, 'sponsorAds', adId), {
      impressions: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // non-fatal analytics failure
  }
}

export async function recordSponsorAdClick(adId: string): Promise<void> {
  if (!adId || adId === HOUSE_SPONSOR_AD.id || !auth.currentUser) return;
  try {
    await updateDoc(doc(db, 'sponsorAds', adId), {
      clicks: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // non-fatal analytics failure
  }
}
