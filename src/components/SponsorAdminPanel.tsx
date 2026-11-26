import React, {useEffect, useState} from 'react';
import {
  CheckCircle2,
  Coins,
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
  ShieldCheck,
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
  sanitizeHttpUrl,
  subscribeAllSponsorAdsAdmin,
  updateSponsorAd,
} from '../services/sponsorAdsService';
import type {SponsorAdItem} from '../types/app';

interface SponsorAdminPanelProps {
  onStatusToast: (msg: string) => void;
}

export const SponsorAdminPanel: React.FC<SponsorAdminPanelProps> = ({onStatusToast}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [authBusy, setAuthBusy] = useState(false);
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
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

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
    setActive(true);
  };

  const handleGoogleAdminLogin = async () => {
    setAuthBusy(true);
    try {
      await signInAdminWithGoogle();
      onStatusToast('ورود مدیر با حساب گوگل تایید شد. پنل مدیریت اسپانسر فعال گردید.');
    } catch (err) {
      const code = (err as {code?: string})?.code;
      if (code === 'auth/popup-closed-by-user') {
        onStatusToast('پنجره ورود گوگل بسته شد.');
      } else if (code === 'auth/popup-blocked') {
        onStatusToast('مرورگر پنجره ورود گوگل را مسدود کرد؛ لطفاً اجازه پاپ‌آپ بدهید.');
      } else {
        onStatusToast(err instanceof Error ? err.message : 'ورود ادمین تایید نشد.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAdminSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutAdminToAnonymous();
      resetForm();
      onStatusToast('خروج از حالت مدیریت انجام شد؛ دستگاه به حالت عادی برگشت.');
    } catch {
      onStatusToast('خطا در خروج از پنل مدیریت.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2 || description.trim().length < 2) {
      onStatusToast('لطفاً عنوان و توضیح کوتاه تبلیغ را وارد کنید.');
      return;
    }
    if (!sanitizeHttpUrl(linkUrl)) {
      onStatusToast('نشانی لینک مقصد باید با https:// یا http:// شروع شود.');
      return;
    }
    if (imageUrl.trim() && !sanitizeHttpUrl(imageUrl)) {
      onStatusToast('نشانی تصویر بنر باید با https:// یا http:// شروع شود.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateSponsorAd(editingId, {
          title,
          description,
          imageUrl,
          linkUrl,
          durationSeconds,
          rewardCoins,
          active,
        });
        onStatusToast('تغییرات بنر اسپانسر در سرور ثبت شد.');
      } else {
        await createSponsorAd({
          title,
          description,
          imageUrl,
          linkUrl,
          durationSeconds,
          rewardCoins,
          active,
        });
        onStatusToast('بنر جدید اسپانسر ساخته و منتشر شد.');
      }
      resetForm();
    } catch (err) {
      onStatusToast(err instanceof Error ? err.message : 'خطا در ذخیره آگهی اسپانسر.');
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
    setActive(ad.active);
  };

  const handleToggleActive = async (ad: SponsorAdItem) => {
    try {
      await updateSponsorAd(ad.id, {active: !ad.active});
      onStatusToast(ad.active ? 'آگهی متوقف شد.' : 'آگهی فعال شد.');
    } catch {
      onStatusToast('خطا در تغییر وضعیت آگهی.');
    }
  };

  const handleDelete = async (ad: SponsorAdItem) => {
    try {
      await deleteSponsorAd(ad.id);
      if (editingId === ad.id) resetForm();
      onStatusToast('آگهی حذف شد.');
    } catch {
      onStatusToast('خطا در حذف آگهی.');
    }
  };

  return (
    <section className="luxury-card p-6 sm:p-7 space-y-5 border border-amber-400/35">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
            <ShieldCheck className="w-4 h-4" />
            <span>مدیریت امن تبلیغات اسپانسری (محافظت‌شده در قوانین ابری Firebase)</span>
          </div>
          <h2 className="mt-1 text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
            پنل اختصاصی ثبت و کنترل بنر اسپانسر
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
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 px-4 py-3 flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>نشست ادمین تایید شد ({currentUser?.email})</span>
            </span>
            <span className="text-emerald-700 dark:text-emerald-300">
              {toPersianDigits(ads.filter((a) => a.active).length)} آگهی فعال
            </span>
          </div>

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
                    لینک تصویر بنر (https:// — اختیاری)
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/banner.jpg"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    لینک مقصد کلیک (الزامی)
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    required
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://sponsor-site.ir"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    زمان نمایش (ثانیه)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(Number(e.target.value) || 10)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-sm font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    پاداش کاربر (سکه)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={rewardCoins}
                    onChange={(e) => setRewardCoins(Number(e.target.value) || 30)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-sm font-mono-num text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 accent-emerald-700"
                />
                <span>این آگهی بلافاصله برای کاربران فعال و قابل نمایش باشد</span>
              </label>

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
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-0.5">
                  {ads.map((ad) => (
                    <div
                      key={ad.id}
                      className="rounded-2xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                              {ad.title}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                ad.active
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {ad.active ? 'فعال' : 'متوقف'}
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
                          <span>{toPersianDigits(ad.clicks)} کلیک</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5 text-amber-500" />
                          <span>+{toPersianDigits(ad.rewardCoins)} سکه · {toPersianDigits(ad.durationSeconds)}ثانیه</span>
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

                      <div className="flex items-center gap-2 pt-1 border-t border-[var(--luxury-border)]">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(ad)}
                          className="min-h-[38px] px-3 rounded-lg bg-[var(--luxury-subtle)] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                        >
                          {ad.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          <span>{ad.active ? 'توقف' : 'فعال‌سازی'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(ad)}
                          className="min-h-[38px] px-3 rounded-lg bg-[var(--luxury-subtle)] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>ویرایش</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ad)}
                          className="min-h-[38px] px-3 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1.5 cursor-pointer mr-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
