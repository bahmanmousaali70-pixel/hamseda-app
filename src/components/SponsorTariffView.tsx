import React, {useEffect, useRef, useState} from 'react';
import {
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  EyeOff,
  Megaphone,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import {
  COIN_COSTS,
  DAILY_BONUS_COINS,
  DEFAULT_AD_REWARD_COINS,
  SPONSOR_CONTACT_PROFILE_URL,
  STARTER_COINS,
} from '../services/sponsorAdsService';
import {toPersianDigits} from '../data/persianLibrary';
import {SponsorAdminPanel} from './SponsorAdminPanel';
import type {SponsorAdItem} from '../types/app';

interface SponsorTariffViewProps {
  adminUnlocked: boolean;
  onUnlockAdmin: () => void;
  onHideAdmin: () => void;
  onOpenRewardModal: () => void;
  onPreviewAd?: (ad: SponsorAdItem) => void;
  onStatusToast: (msg: string) => void;
}

interface TariffTier {
  id: string;
  name: string;
  duration: string;
  irrPrice: string;
  usdPrice: string;
  badge?: string;
  features: string[];
  highlighted?: boolean;
}

const TARIFF_TIERS: TariffTier[] = [
  {
    id: 'starter',
    name: 'پکیج آشنایی (تست)',
    duration: '۷ روز',
    irrPrice: '۹۵۰,۰۰۰ تومان',
    usdPrice: '۱۹ دلار',
    features: [
      'نمایش بنر ۱۶:۹ + تیتر و متن معرفی + لینک مستقیم',
      'تایمر ۱۰ ثانیه‌ای واقعی و ضداسپم (بدون پرش مزاحم)',
      'شمارنده دقیق بازدید و کلیک مستقیم کاربر روی سایت/پیج',
    ],
  },
  {
    id: 'standard',
    name: 'پکیج استاندارد ماهانه',
    duration: '۳۰ روز کامل',
    irrPrice: '۲,۹۰۰,۰۰۰ تومان',
    usdPrice: '۴۹ دلار',
    badge: 'پیشنهادی و اقتصادی',
    highlighted: true,
    features: [
      'حضور مداوم در چرخه سکه هدیه هوش مصنوعی هم‌صدا',
      'دریافت توجه واقعی کاربر در ۱۰ ثانیه + دکمه ورود به سایت',
      'امکان ویرایش بنر، متن یا لینک مقصد در طول ماه',
    ],
  },
  {
    id: 'featured',
    name: 'پکیج ویژه پربازدید',
    duration: '۳۰ روز اولویت‌دار',
    irrPrice: '۵,۸۰۰,۰۰۰ تومان',
    usdPrice: '۹۵ دلار',
    badge: 'بالاترین نرخ کلیک',
    features: [
      'اولویت اول نمایش در صف تبلیغات اسپانسری',
      'تنظیم دلخواه جایزه سکه (+۳۰ تا +۶۰ سکه برای جذابیت کلیک)',
      'معرفی اختصاصی همراه با تصویر تمام‌عرض باکیفیت',
    ],
  },
  {
    id: 'exclusive',
    name: 'اسپانسر انحصاری (تک‌برند)',
    duration: '۱ ماه انحصاری',
    irrPrice: 'توافقی (از ۹ میلیون تومان)',
    usdPrice: 'از ۱۵۰ دلار',
    features: [
      'نمایش انحصاری نام برند در فوتر و بخش حمایت تمام کاربران',
      'عدم نمایش آگهی رقیب در طول مدت قرارداد اختصاصی',
      'مناسب فروشگاه‌های بزرگ، برندهای دیجیتال و خدمات خانواده',
    ],
  },
];

export const SponsorTariffView: React.FC<SponsorTariffViewProps> = ({
  adminUnlocked,
  onUnlockAdmin,
  onHideAdmin,
  onOpenRewardModal,
  onPreviewAd,
  onStatusToast,
}) => {
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<number | null>(null);
  const [tapProgress, setTapProgress] = useState(0);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current !== null) {
        window.clearTimeout(tapTimerRef.current);
      }
    };
  }, []);

  // Secret 5-tap trigger known only to the owner on the header shield icon
  const handleSecretBadgeTap = () => {
    if (adminUnlocked) return;
    tapCountRef.current += 1;
    setTapProgress(tapCountRef.current);

    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current);
    }

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setTapProgress(0);
      onUnlockAdmin();
      onStatusToast('بخش مدیریت اسپانسر باز شد؛ با حساب گوگل مجاز وارد شوید.');
      return;
    }

    tapTimerRef.current = window.setTimeout(() => {
      tapCountRef.current = 0;
      setTapProgress(0);
    }, 2600);
  };

  return (
    <div className="space-y-8">
      {/* Public Hero & Non-Intrusive Ad Philosophy */}
      <section className="luxury-card p-6 sm:p-8 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2.5 max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-amber-300">
              <button
                type="button"
                onClick={handleSecretBadgeTap}
                className="w-8 h-8 rounded-xl bg-emerald-700/10 dark:bg-amber-400/15 text-emerald-800 dark:text-amber-300 flex items-center justify-center cursor-default select-none"
                aria-label="نشان حامیان هم‌صدا"
              >
                <ShieldCheck className={`w-4 h-4 ${tapProgress >= 3 ? 'scale-110 transition-transform' : ''}`} />
              </button>
              <span>حمایت هوشمند و تعرفه تبلیغات در هم‌صدا</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
              معرفی محترمانه کسب‌وکار شما، بدون آزار کاربران
            </h1>
            <p className="text-xs sm:text-sm leading-7 text-slate-600 dark:text-slate-300">
              در هم‌صدا هیچ بنر مزاحم، پاپ‌آپ ناگهانی یا شلوغی تبلیغاتی در بخش‌های روزمره وجود ندارد. کاربر فقط زمانی که بخواهد برای قابلیت‌های پیشرفته هوش مصنوعی{' '}
              <strong>+{toPersianDigits(DEFAULT_AD_REWARD_COINS)} سکه رایگان</strong> بگیرد، با انتخاب خودش بنر اسپانسر را{' '}
              <strong>۱۰ ثانیه</strong> با تمرکز کامل مشاهده می‌کند و در صورت تمایل روی لینک سایت شما می‌زند.
            </p>
          </div>

          <div className="shrink-0 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onOpenRewardModal}
              className="min-h-[46px] px-5 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Coins className="w-4 h-4 text-amber-300" />
              <span>دریافت سکه رایگان (مشاهده حامی)</span>
            </button>
          </div>
        </div>

        {/* Model Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="rounded-2xl luxury-surface-subtle p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800 dark:text-amber-300">
              <Timer className="w-4 h-4" />
              <span>مکث ۱۰ ثانیه‌ای اختیاری</span>
            </div>
            <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
              تایمر فقط زمانی جلو می‌رود که کاربر صفحه را باز نگه دارد؛ بنابراین برند شما واقعاً دیده و خوانده می‌شود.
            </p>
          </div>

          <div className="rounded-2xl luxury-surface-subtle p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800 dark:text-amber-300">
              <Clock className="w-4 h-4" />
              <span>محدودیت ضداسپم (۳ ساعت / ۲ بار)</span>
            </div>
            <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
              هر دستگاه در هر بازه ۳ ساعته حداکثر ۲ تبلیغ می‌بیند تا ارزش سکه‌ها و کیفیت واقعی کلیک‌ها حفظ شود.
            </p>
          </div>

          <div className="rounded-2xl luxury-surface-subtle p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800 dark:text-amber-300">
              <Sparkles className="w-4 h-4" />
              <span>بخش‌های رایگان همیشه باز</span>
            </div>
            <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
              شروع با {toPersianDigits(STARTER_COINS)} سکه +{' '}
              {toPersianDigits(DAILY_BONUS_COINS)} سکه هدیه روزانه خودکار؛ همه ابزارهای آفلاین، رادیو، لیست خرید و تماس همیشه رایگان هستند.
            </p>
          </div>
        </div>
      </section>

      {/* Public Tariff Table */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              جدول تعرفه‌های درج تبلیغ اسپانسری (ایران و بین‌الملل)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              ساختار: تصویر بنر ۱۶:۹ + تیتر برند + توضیح معرفی + دکمه لینک مستقیم به سایت، اینستاگرام یا فروشگاه شما
            </p>
          </div>
          <div className="shrink-0 flex flex-wrap items-center gap-2">
            <a
              href={SPONSOR_CONTACT_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
            >
              <MessageCircle className="w-4 h-4" />
              <span>ارتباط و رزرو مستقیم (پروفایل من)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {TARIFF_TIERS.map((tier) => (
            <article
              key={tier.id}
              className={`rounded-2xl p-5 flex flex-col justify-between gap-4 border transition-all ${
                tier.highlighted
                  ? 'luxury-card border-amber-400/70 ring-1 ring-amber-400/35'
                  : 'luxury-card'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-700 dark:text-amber-300">{tier.duration}</span>
                  {tier.badge && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-200">
                      {tier.badge}
                    </span>
                  )}
                </div>

                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{tier.name}</h3>

                <div className="rounded-xl luxury-surface-subtle px-3.5 py-2.5 space-y-0.5">
                  <div className="text-base font-black text-emerald-800 dark:text-amber-300">{tier.irrPrice}</div>
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    تعرفه بین‌المللی: {tier.usdPrice}
                  </div>
                </div>

                <ul className="space-y-2 pt-1">
                  {tier.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-xs leading-6 text-slate-700 dark:text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-amber-300 shrink-0 mt-1" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href={SPONSOR_CONTACT_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`min-h-[44px] px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                  tier.highlighted
                    ? 'bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 text-white'
                    : 'border border-[var(--luxury-border)] bg-[var(--luxury-subtle)] text-slate-900 dark:text-white hover:brightness-95'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                <span>رزرو و هماهنگی تبلیغ</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-75" />
              </a>
            </article>
          ))}
        </div>
      </section>

      {/* Transparent Coin System Overview */}
      <section className="luxury-card p-6 sm:p-7 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-amber-300">
          <Megaphone className="w-4 h-4" />
          <span>شفافیت کامل سیستم سکه هم‌صدا</span>
        </div>
        <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
          کدام بخش‌ها با سکه کار می‌کنند و کدام بخش‌ها همیشه رایگان‌اند؟
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl luxury-surface-subtle p-4 space-y-2.5">
            <div className="text-xs font-extrabold text-slate-900 dark:text-white">
              ۷ قابلیت هوش مصنوعی متصل به سکه (تامین هزینه سرور):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(COIN_COSTS).map(([key, item]) => (
                <div
                  key={key}
                  className="rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{item.label}</span>
                  <span className="font-mono-num font-extrabold text-amber-700 dark:text-amber-300 shrink-0">
                    {toPersianDigits(item.cost)} سکه
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl luxury-surface-subtle p-4 space-y-2.5">
            <div className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
              بخش‌های کاملاً رایگان و نامحدود (بدون نیاز به سکه):
            </div>
            <ul className="text-xs leading-7 text-slate-700 dark:text-slate-200 space-y-1">
              <li>• برنامه‌ریزی اهداف، عادت‌ها، لیست خرید و آلارم/ویبره بین دو گوشی</li>
              <li>• مدیریت هزینه‌ها، تسویه حساب، اقساط، داروها و پرونده سلامت خانواده</li>
              <li>• اعلام صوتی تماس ورودی و پیامک (موتورهای آفلاین داخل گوشی)</li>
              <li>• پخش رادیوهای زنده ایران و جهان + ۴ موتور صوتی آفلاین</li>
              <li>• فرمان‌های آفلاین دستیار صوتی و همگام‌سازی ابری بین دو گوشی</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Hidden Admin Panel — Only visible to owner after secret unlock or verified Google Admin login */}
      {adminUnlocked && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
              حالت مدیر فعال شد
            </span>
            <button
              type="button"
              onClick={onHideAdmin}
              className="min-h-[38px] px-3 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>مخفی کردن پنل</span>
            </button>
          </div>
          <SponsorAdminPanel onStatusToast={onStatusToast} onPreviewAd={onPreviewAd} />
        </div>
      )}
    </div>
  );
};
