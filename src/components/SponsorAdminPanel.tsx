import React, {useEffect, useState} from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Coins,
  Crown,
  Edit3,
  Eye,
  ExternalLink,
  Loader2,
  Lock,
  LogOut,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {toPersianDigits} from '../data/persianLibrary';
import {
  ADMIN_EMAIL,
  auth,
  isVerifiedAdminUser,
  onAuthStateChanged,
  signInAdminWithGoogle,
  signOutAdminToAnonymous,
  type User,
} from '../services/firebaseClient';
import {
  createSponsorAd,
  DEFAULT_AD_DURATION_SECONDS,
  DEFAULT_AD_REWARD_COINS,
  deleteSponsorAd,
  formatSponsorErrorFa,
  isSponsorAdLive,
  normalizeSponsorUrlInput,
  sanitizeHttpUrl,
  SPONSOR_PACKAGE_PRESETS,
  subscribeAllSponsorAdsAdmin,
  updateSponsorAd,
} from '../services/sponsorAdsService';
import type {SponsorAdItem, SponsorPackageTier} from '../types/app';

interface SponsorAdminPanelProps {
  onStatusToast: (msg: string) => void;
  onPreviewAd?: (ad: SponsorAdItem) => void;
}

const PACKAGE_TIER_ORDER: SponsorPackageTier[] = ['starter', 'standard', 'featured', 'exclusive'];

function getDaysRemainingLabel(ad: SponsorAdItem): {text: string; expired: boolean} {
  if (!ad.expiresAt || ad.expiresAt <= 0) {
    return {text: 'بدون تاریخ انقضا', expired: false};
  }
  const diffMs = ad.expiresAt - Date.now();
  if (diffMs <= 0) {
    return {text: 'منقضی شده', expired: true};
  }
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return {text: `${toPersianDigits(days)} روز مانده`, expired: false};
}

export const SponsorAdminPanel: React.FC<SponsorAdminPanelProps> = ({onStatusToast, onPreviewAd}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ads, setAds] = useState<SponsorAdItem[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);

  // Ad Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('https://');
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_AD_DURATION_SECONDS);
  const [rewardCoins, setRewardCoins] = useState(DEFAULT_AD_REWARD_COINS);
  const [packageTier, setPackageTier] = useState<SponsorPackageTier>('standard');
  const [priority, setPriority] = useState<number>(SPONSOR_PACKAGE_PRESETS.standard.priority);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [brandLabel, setBrandLabel] = useState('');
  const [recalculateExpiryOnSave, setRecalculateExpiryOnSave] = useState(true);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{type: 'error' | 'success'; text: string} | null>(null);
  const [previewImgStatus, setPreviewImgStatus] = useState<'idle' | 'ok' | 'broken'>('idle');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  const isAdmin = isVerifiedAdminUser(currentUser);

  useEffect(() => {
    if (!isAdmin) {
      setAds([]);
      return;
    }
    setLoadingAds(true);
    const unsub = subscribeAllSponsorAdsAdmin(
      (list) => {
        setAds(list);
        setLoadingAds(false);
      },
      (msg) => {
        setLoadingAds(false);
        onStatusToast(msg);
      }
    );
    return () => unsub();
  }, [isAdmin, onStatusToast]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setImageUrl('');
    setLinkUrl('https://');
    setDurationSeconds(DEFAULT_AD_DURATION_SECONDS);
    setRewardCoins(DEFAULT_AD_REWARD_COINS);
    setPackageTier('standard');
    setPriority(SPONSOR_PACKAGE_PRESETS.standard.priority);
    setDurationDays(30);
    setBrandLabel('');
    setRecalculateExpiryOnSave(true);
    setActive(true);
    setPreviewImgStatus('idle');
  };

  const applyPackagePreset = (tier: SponsorPackageTier) => {
    const preset = SPONSOR_PACKAGE_PRESETS[tier];
    setPackageTier(tier);
    setDurationDays(preset.durationDays);
    setPriority(preset.priority);
    setRewardCoins(preset.defaultCoins);
    setRecalculateExpiryOnSave(true);
  };

  const handleGoogleAdminLogin = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInAdminWithGoogle();
      onStatusToast('ورود مدیر با حساب گوگل تایید شد. پنل مدیریت اسپانسر فعال گردید.');
    } catch (err) {
      const code = (err as {code?: string})?.code;
      let msg = err instanceof Error ? err.message : 'ورود ادمین تایید نشد.';
      if (code === 'auth/popup-closed-by-user') {
        msg = 'پنجره ورود گوگل بسته شد.';
      } else if (code === 'auth/popup-blocked') {
        msg = 'مرورگر پنجره ورود گوگل را مسدود کرد؛ لطفاً اجازه پاپ‌آپ بدهید یا صفحه را در مرورگر کروم باز کنید.';
      } else if (code === 'auth/unauthorized-domain') {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        msg = `دامنه فعلی (${origin}) در فهرست Authorized Domains فایربیس ثبت نشده است.`;
      }
      setAuthError(msg);
      onStatusToast(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAdminSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutAdminToAnonymous();
      resetForm();
      setFormFeedback(null);
      onStatusToast('خروج از حالت مدیریت انجام شد؛ دستگاه به حالت عادی برگشت.');
    } catch {
      onStatusToast('خطا در خروج از پنل مدیریت.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    const cleanTitle = title.trim();
    const cleanDesc = description.trim();
    if (cleanTitle.length < 2 || cleanDesc.length < 2) {
      const msg = 'لطفاً عنوان برند و متن معرفی (حداقل ۲ حرف) را وارد کنید.';
      setFormFeedback({type: 'error', text: msg});
      onStatusToast(msg);
      return;
    }

    const normalizedLink = normalizeSponsorUrlInput(linkUrl);
    const safeLink = sanitizeHttpUrl(normalizedLink);
    if (!safeLink) {
      const msg = 'لینک مقصد معتبر نیست؛ مثلاً بنویسید: https://tapnfc.ir';
      setFormFeedback({type: 'error', text: msg});
      onStatusToast(msg);
      return;
    }

    const normalizedImg = normalizeSponsorUrlInput(imageUrl);
    const safeImg = normalizedImg ? sanitizeHttpUrl(normalizedImg) : '';
    if (normalizedImg && !safeImg) {
      const msg = 'لینک تصویر بنر نامعتبر است؛ اگر تصویر ندارید این فیلد را خالی بگذارید یا آدرس https://... بگذارید.';
      setFormFeedback({type: 'error', text: msg});
      onStatusToast(msg);
      return;
    }

    const cleanDays = Math.max(0, Math.min(365, Math.round(durationDays || 0)));
    const nextExpiresAt = cleanDays > 0 ? Date.now() + cleanDays * 24 * 60 * 60 * 1000 : 0;

    setSaving(true);
    try {
      if (editingId) {
        await updateSponsorAd(editingId, {
          title: cleanTitle,
          description: cleanDesc,
          imageUrl: safeImg || '',
          linkUrl: safeLink,
          durationSeconds,
          rewardCoins,
          packageTier,
          priority,
          durationDays: cleanDays,
          ...(recalculateExpiryOnSave ? {expiresAt: nextExpiresAt} : {}),
          brandLabel: brandLabel.trim(),
          active,
        });
        const msg = `تغییرات بنر «${cleanTitle}» ذخیره شد و فوراً برای کاربران فعال است.`;
        setFormFeedback({type: 'success', text: msg});
        onStatusToast(msg);
      } else {
        await createSponsorAd({
          title: cleanTitle,
          description: cleanDesc,
          imageUrl: safeImg || '',
          linkUrl: safeLink,
          durationSeconds,
          rewardCoins,
          packageTier,
          priority,
          durationDays: cleanDays,
          expiresAt: nextExpiresAt,
          brandLabel: brandLabel.trim(),
          active,
        });
        const msg = `بنر «${cleanTitle}» (${SPONSOR_PACKAGE_PRESETS[packageTier].shortLabel}) ثبت و منتشر شد!`;
        setFormFeedback({type: 'success', text: msg});
        onStatusToast(msg);
      }
      resetForm();
    } catch (err) {
      const readable = formatSponsorErrorFa(err, 'خطا در ذخیره آگهی اسپانسر.');
      setFormFeedback({type: 'error', text: readable});
      onStatusToast(readable);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (ad: SponsorAdItem) => {
    setEditingId(ad.id);
    setTitle(ad.title);
    setDescription(ad.description);
    setImageUrl(ad.imageUrl);
    setLinkUrl(ad.linkUrl);
    setDurationSeconds(ad.durationSeconds);
    setRewardCoins(ad.rewardCoins);
    setPackageTier(ad.packageTier ?? 'standard');
    setPriority(ad.priority ?? SPONSOR_PACKAGE_PRESETS[ad.packageTier ?? 'standard'].priority);
    setDurationDays(ad.durationDays ?? 0);
    setBrandLabel(ad.brandLabel ?? '');
    setRecalculateExpiryOnSave(false);
    setActive(ad.active);
    setFormFeedback(null);
  };

  const handleToggleActive = async (ad: SponsorAdItem) => {
    try {
      await updateSponsorAd(ad.id, {active: !ad.active});
      onStatusToast(ad.active ? 'آگهی متوقف شد.' : 'آگهی فعال شد.');
    } catch (err) {
      onStatusToast(formatSponsorErrorFa(err, 'خطا در تغییر وضعیت آگهی.'));
    }
  };

  const handleExtendDays = async (ad: SponsorAdItem, extraDays = 30) => {
    try {
      const baseMs = ad.expiresAt && ad.expiresAt > Date.now() ? ad.expiresAt : Date.now();
      const nextExp = baseMs + extraDays * 24 * 60 * 60 * 1000;
      const nextDurationDays = Math.min(365, (ad.durationDays || 0) + extraDays);
      await updateSponsorAd(ad.id, {
        expiresAt: nextExp,
        durationDays: nextDurationDays,
        active: true,
      });
      onStatusToast(`مدت نمایش «${ad.title}» به میزان ${toPersianDigits(extraDays)} روز تمدید شد.`);
    } catch (err) {
      onStatusToast(formatSponsorErrorFa(err, 'خطا در تمدید قرارداد آگهی.'));
    }
  };

  const handleResetStats = async (ad: SponsorAdItem) => {
    try {
      await updateSponsorAd(ad.id, {impressions: 0, clicks: 0});
      onStatusToast(`آمار بازدید و کلیک «${ad.title}» صفر شد.`);
    } catch (err) {
      onStatusToast(formatSponsorErrorFa(err, 'خطا در صفر کردن آمار آگهی.'));
    }
  };

  const handleDelete = async (ad: SponsorAdItem) => {
    try {
      await deleteSponsorAd(ad.id);
      if (editingId === ad.id) resetForm();
      onStatusToast('آگهی حذف شد.');
    } catch (err) {
      onStatusToast(formatSponsorErrorFa(err, 'خطا در حذف آگهی.'));
    }
  };

  const liveExclusiveAd = ads.find((a) => isSponsorAdLive(a) && a.packageTier === 'exclusive');

  return (
    <section className="luxury-card p-6 sm:p-7 space-y-5 border border-amber-400/35">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
            <ShieldCheck className="w-4 h-4" />
            <span>مدیریت امن تبلیغات اسپانسری (محافظت‌شده در قوانین ابری Firebase)</span>
          </div>
          <h2 className="mt-1 text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
            پنل اختصاصی ثبت، زمان‌بندی، اولویت و اسپانسر انحصاری
          </h2>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={handleAdminSignOut}
            disabled={authBusy}
            className="min-h-[42px] px-4 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-subtle)] text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer self-start"
          >
            <LogOut className="w-4 h-4" />
            <span>خروج ادمین</span>
          </button>
        )}
      </div>

      {!isAdmin ? (
        <div className="space-y-3">
          <div className="rounded-2xl luxury-surface-subtle p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  دسترسی صرفاً برای مالک اصلی هم‌صدا
                </div>
                <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
                  بدون رمز ثابت در کد؛ امنیت نوشتن و ویرایش تبلیغات مستقیماً روی سرور فایربیس فقط برای ایمیل تاییدشده{' '}
                  <span className="font-mono-num font-bold" dir="ltr">
                    {ADMIN_EMAIL}
                  </span>{' '}
                  قفل شده است.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleAdminLogin}
              disabled={authBusy}
              className="min-h-[46px] px-5 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-60"
            >
              {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>ورود ادمین با گوگل</span>
            </button>
          </div>

          {authError && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs leading-6 text-rose-800 dark:text-rose-200">
              {authError}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>نشست ادمین تایید شد ({currentUser?.email})</span>
            </span>
            <span className="text-emerald-700 dark:text-emerald-300 font-bold">
              {toPersianDigits(ads.filter((a) => isSponsorAdLive(a)).length)} آگهی در حال نمایش
            </span>
          </div>

          {liveExclusiveAd && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/70 px-4 py-3 flex items-start gap-2.5 text-xs leading-6 text-amber-900 dark:text-amber-200">
              <Crown className="w-4 h-4 shrink-0 mt-1 text-amber-600 dark:text-amber-300" />
              <div>
                <strong>حالت اسپانسر انحصاری فعال است:</strong> برند{' '}
                <strong>{liveExclusiveAd.brandLabel?.trim() || liveExclusiveAd.title}</strong> هم‌اکنون در فوتر تمام کاربران نمایش داده می‌شود و سایر آگهی‌های رقیب تا پایان این قرارداد پنهان شده‌اند.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Create/Edit Form */}
            <form onSubmit={handleSaveAd} className="lg:col-span-6 space-y-3.5 rounded-2xl luxury-surface-subtle p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {editingId ? 'ویرایش بنر اسپانسر' : 'افزودن بنر جدید اسپانسر'}
                </h3>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                  >
                    انصراف از ویرایش
                  </button>
                )}
              </div>

              {/* 1-Click Tariff Presets */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  انتخاب سریع پکیج تعرفه (پیش‌تنظیم خودکار مدت، اولویت و سکه)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {PACKAGE_TIER_ORDER.map((tierId) => {
                    const preset = SPONSOR_PACKAGE_PRESETS[tierId];
                    const selected = packageTier === tierId;
                    return (
                      <button
                        key={tierId}
                        type="button"
                        onClick={() => applyPackagePreset(tierId)}
                        className={`min-h-[38px] px-2 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                          selected
                            ? 'border-emerald-700 bg-emerald-800 text-white dark:border-amber-400 dark:bg-emerald-700'
                            : 'border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-slate-700 dark:text-slate-200 hover:brightness-95'
                        }`}
                      >
                        {preset.shortLabel}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {SPONSOR_PACKAGE_PRESETS[packageTier].hint}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  عنوان برند یا کمپین
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثلاً: تخفیف ویژه کافه کتاب سرو"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  متن معرفی کوتاه تبلیغ
                </label>
                <textarea
                  rows={2}
                  required
                  maxLength={300}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="متن جذاب و محترمانه برای معرفی محصول یا خدمت اسپانسر..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    لینک مستقیم عکس بنر (jpg/png — اختیاری)
                  </label>
                  <input
                    type="text"
                    inputMode="url"
                    dir="ltr"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setPreviewImgStatus('idle');
                    }}
                    placeholder="https://example.com/banner.jpg"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    لینک مقصد کلیک (الزامی)
                  </label>
                  <input
                    type="text"
                    inputMode="url"
                    dir="ltr"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://sponsor-site.ir"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {(() => {
                const candidateImg = sanitizeHttpUrl(normalizeSponsorUrlInput(imageUrl));
                if (!candidateImg) return null;
                return (
                  <div className="rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] p-2.5 space-y-1.5">
                    {previewImgStatus !== 'broken' && (
                      <img
                        src={candidateImg}
                        alt="پیش‌نمایش بنر"
                        referrerPolicy="no-referrer"
                        onLoad={() => setPreviewImgStatus('ok')}
                        onError={() => setPreviewImgStatus('broken')}
                        className="w-full max-h-36 object-cover rounded-lg"
                      />
                    )}
                    {previewImgStatus === 'broken' && (
                      <div className="text-[11px] leading-5 text-amber-700 dark:text-amber-300">
                        نکته: این آدرس یک فایل مستقیم تصویر (jpg/png/webp) نیست یا اجازه بارگذاری تصویر ندارد؛ بنر به‌صورت کارت رنگی متنی نمایش داده خواهد شد.
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    زمان تایمر (ثانیه)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(Number(e.target.value) || 10)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    پاداش سکه (۵-۵۰۰)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={rewardCoins}
                    onChange={(e) => setRewardCoins(Number(e.target.value) || 30)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    اولویت صف (۱ تا ۱۰)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={priority}
                    onChange={(e) => setPriority(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    مدت (روز · ۰=دائم)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={durationDays}
                    onChange={(e) => {
                      setDurationDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)));
                      setRecalculateExpiryOnSave(true);
                    }}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {packageTier === 'exclusive' && (
                <div className="rounded-xl border border-amber-400/50 bg-amber-50/70 dark:bg-amber-950/25 p-3 space-y-1.5">
                  <label className="block text-xs font-bold text-amber-900 dark:text-amber-200">
                    نام کوتاه برند برای نمایش انحصاری در فوتر کل برنامه
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={brandLabel}
                    onChange={(e) => setBrandLabel(e.target.value)}
                    placeholder="مثلاً: فروشگاه تردلند یا برند حامی"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-amber-300 dark:border-amber-700/70 bg-[var(--luxury-surface)] text-xs text-slate-900 dark:text-white"
                  />
                  <p className="text-[10px] text-amber-800 dark:text-amber-300">
                    تا پایان اعتبار این قرارداد، نام این برند جایگزین فوتر پیش‌فرض شده و آگهی‌های غیرانحصاری نمایش داده نمی‌شوند.
                  </p>
                </div>
              )}

              {editingId && (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recalculateExpiryOnSave}
                    onChange={(e) => setRecalculateExpiryOnSave(e.target.checked)}
                    className="w-4 h-4 accent-emerald-700"
                  />
                  <span>
                    تاریخ انقضا از همین لحظه ({durationDays > 0 ? `${toPersianDigits(durationDays)} روز آینده` : 'بدون محدودیت'}) محاسبه شود
                  </span>
                </label>
              )}

              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 accent-emerald-700"
                />
                <span>این آگهی بلافاصله برای کاربران فعال و قابل نمایش باشد</span>
              </label>

              {formFeedback && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 text-xs leading-6 font-semibold ${
                    formFeedback.type === 'error'
                      ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
                      : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                  }`}
                >
                  {formFeedback.text}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[46px] rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{editingId ? 'ذخیره تغییرات بنر' : 'ثبت و انتشار بنر جدید'}</span>
              </button>
            </form>

            {/* Existing Ads List & Stats */}
            <div className="lg:col-span-6 space-y-3">
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                آگهی‌های ثبت‌شده ({toPersianDigits(ads.length)})
              </div>
              {loadingAds ? (
                <div className="py-10 flex items-center justify-center text-slate-500 gap-2 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال بارگذاری تبلیغات از سرور...</span>
                </div>
              ) : ads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--luxury-border)] p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  هنوز آگهی اسپانسری ثبت نشده است؛ فعلاً بنر پیش‌فرض TapNFC.ir نمایش داده می‌شود.
                </div>
              ) : (
                <div className="space-y-3 max-h-[620px] overflow-y-auto pr-0.5">
                  {ads.map((ad) => {
                    const tierMeta = SPONSOR_PACKAGE_PRESETS[ad.packageTier ?? 'standard'];
                    const remaining = getDaysRemainingLabel(ad);
                    const ctr =
                      ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 1000) / 10 : 0;
                    const liveNow = isSponsorAdLive(ad);

                    return (
                      <div
                        key={ad.id}
                        className={`rounded-2xl border p-4 space-y-3 bg-[var(--luxury-surface)] ${
                          ad.packageTier === 'exclusive' && liveNow
                            ? 'border-amber-400/75 ring-1 ring-amber-400/30'
                            : 'border-[var(--luxury-border)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                                {ad.title}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                  liveNow
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                    : remaining.expired
                                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                      : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {liveNow ? 'در حال پخش' : remaining.expired ? 'منقضی شده' : 'متوقف'}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-200 inline-flex items-center gap-1">
                                {ad.packageTier === 'exclusive' ? (
                                  <Crown className="w-3 h-3" />
                                ) : (
                                  <Sparkles className="w-3 h-3" />
                                )}
                                <span>{tierMeta.shortLabel}</span>
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--luxury-subtle)] text-slate-600 dark:text-slate-300">
                                اولویت {toPersianDigits(ad.priority ?? tierMeta.priority)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                              {ad.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" />
                            <span>{toPersianDigits(ad.impressions)} نمایش</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MousePointerClick className="w-3.5 h-3.5" />
                            <span>
                              {toPersianDigits(ad.clicks)} کلیک ({toPersianDigits(ctr)}٪)
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-amber-500" />
                            <span>
                              +{toPersianDigits(ad.rewardCoins)} سکه · {toPersianDigits(ad.durationSeconds)}ثانیه
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="w-3.5 h-3.5" />
                            <span>{remaining.text}</span>
                          </span>
                          <a
                            href={sanitizeHttpUrl(ad.linkUrl) || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-700 dark:text-amber-300 hover:underline mr-auto"
                            dir="ltr"
                          >
                            <span>{ad.linkUrl.replace(/^https?:\/\//i, '').slice(0, 24)}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--luxury-border)]">
                          {onPreviewAd && (
                            <button
                              type="button"
                              onClick={() => onPreviewAd(ad)}
                              className="min-h-[36px] px-2.5 rounded-lg bg-emerald-700/10 dark:bg-amber-400/15 text-xs font-bold text-emerald-800 dark:text-amber-300 flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>پیش‌نمایش</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleActive(ad)}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[var(--luxury-subtle)] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                          >
                            {ad.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            <span>{ad.active ? 'توقف' : 'فعال'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExtendDays(ad, 30)}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[var(--luxury-subtle)] text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 cursor-pointer"
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                            <span>+۳۰ روز</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetStats(ad)}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[var(--luxury-subtle)] text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                            title="صفر کردن آمار نمایش و کلیک"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>ریست آمار</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditing(ad)}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[var(--luxury-subtle)] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>ویرایش</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(ad)}
                            className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1 cursor-pointer mr-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

