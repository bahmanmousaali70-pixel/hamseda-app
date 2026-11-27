import React, {useEffect, useState} from 'react';
import {AudioLines, Cpu, Globe, Sparkles, UserRound, X} from 'lucide-react';

interface OnboardingGuideModalProps {
  open: boolean;
  initialMyName: string;
  initialPartnerName: string;
  onComplete: (names: {myName?: string; partnerName?: string}, openVoiceLibrary?: boolean) => void;
}

export const OnboardingGuideModal: React.FC<OnboardingGuideModalProps> = ({
  open,
  initialMyName,
  initialPartnerName,
  onComplete,
}) => {
  const [myNameInput, setMyNameInput] = useState('');
  const [partnerNameInput, setPartnerNameInput] = useState('');

  useEffect(() => {
    if (!open) return;
    setMyNameInput(initialMyName && initialMyName !== 'من' ? initialMyName : '');
    setPartnerNameInput(initialPartnerName && initialPartnerName !== 'همراه' ? initialPartnerName : '');
  }, [open, initialMyName, initialPartnerName]);

  if (!open) return null;

  const submit = (openVoiceLibrary: boolean) => {
    onComplete(
      {
        myName: myNameInput.trim() || undefined,
        partnerName: partnerNameInput.trim() || undefined,
      },
      openVoiceLibrary
    );
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="راهنمای شروع سریع هم‌صدا"
    >
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl luxury-card overflow-hidden shadow-2xl border border-amber-400/35">
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-[var(--luxury-border)] bg-gradient-to-l from-emerald-900/10 via-amber-500/10 to-transparent shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/hamseda-icon.png"
              alt="لوگوی هم‌صدا"
              className="w-11 h-11 rounded-2xl object-cover shadow-sm shrink-0 border border-amber-400/30"
            />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-800 dark:text-amber-300">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>راهنمای سریع شروع کار (نمایش فقط بار اول)</span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate">
                به هم‌صدا خوش آمدید
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => submit(false)}
            aria-label="بستن راهنما"
            className="min-w-[40px] min-h-[40px] rounded-xl border border-[var(--luxury-border)] text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Quick Name Personalization */}
          <div className="rounded-2xl border border-[var(--luxury-border)] bg-[var(--luxury-subtle)] p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900 dark:text-white">
              <UserRound className="w-4 h-4 text-emerald-700 dark:text-amber-300 shrink-0" />
              <span>نام خودتان را وارد کنید تا هم‌صدا شما را با نام خودتان صدا بزند</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  نام شما
                </label>
                <input
                  type="text"
                  value={myNameInput}
                  onChange={(e) => setMyNameInput(e.target.value)}
                  placeholder="مثلاً: علی، سارا، مریم..."
                  maxLength={40}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs sm:text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  نام همراه یا هم‌مسیر (اختیاری)
                </label>
                <input
                  type="text"
                  value={partnerNameInput}
                  onChange={(e) => setPartnerNameInput(e.target.value)}
                  placeholder="اختیاری؛ مثلاً نام همسر یا همکار"
                  maxLength={40}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-surface)] text-xs sm:text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* 3 Concise Visual Tips */}
          <div className="space-y-2.5">
            <div className="rounded-2xl border border-sky-300/60 dark:border-sky-800/60 bg-sky-50/75 dark:bg-sky-950/30 p-3.5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-600/15 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
                <Globe className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                  ۱. اتصال فیلترشکن (VPN) برای سرویس‌های آنلاین
                </div>
                <p className="text-xs leading-6 text-slate-700 dark:text-slate-300">
                  برای برخی بخش‌های آنلاین مثل جستجوی هوشمند دستیار، دریافت پیام‌های روز و دانلود اولیه صداها، بهتر است{' '}
                  <strong>فیلترشکن (VPN)</strong> گوشی روشن باشد.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-300/70 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/35 p-3.5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-700/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                <AudioLines className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                  ۲. صدای طبیعی و غیررباتی (دانلود از کتابخانه صوتی)
                </div>
                <p className="text-xs leading-6 text-slate-700 dark:text-slate-300">
                  برای اینکه صدای هم‌صدا گرم، روان و غیررباتی باشد و در حالت آفلاین هم بدون مشکل بخواند، حتماً در بخش{' '}
                  <strong>«کتابخانه صوتی»</strong> یکی از صداها یا بسته صوتی آفلاین را دانلود کنید.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-300/75 dark:border-amber-700/60 bg-amber-50/85 dark:bg-amber-950/30 p-3.5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                  ۳. نکته مهم موتور ۴: ارتقا به نسخه ۱۶ بیتی را دانلود کنید
                </div>
                <p className="text-xs leading-6 text-slate-700 dark:text-slate-300">
                  اگر در آزمایشگاه موتورهای آفلاین، <strong>«موتور ۴»</strong> را نصب کردید، پس از نصب حتماً دکمه{' '}
                  <strong>«ارتقا به نسخه ۱۶ بیتی کم‌نویز»</strong> را هم دانلود کنید تا صدا کاملاً واضح، طبیعی و{' '}
                  <strong>بدون نیاز به اینترنت و فیلترشکن</strong> کار کند.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-5 py-4 border-t border-[var(--luxury-border)] bg-[var(--luxury-subtle)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => submit(false)}
            className="flex-1 min-h-[46px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs sm:text-sm font-extrabold cursor-pointer transition-colors"
          >
            متوجه شدم، ورود به هم‌صدا
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            className="min-h-[46px] px-4 rounded-xl border border-emerald-700/35 dark:border-amber-400/40 bg-[var(--luxury-surface)] hover:brightness-95 text-emerald-900 dark:text-amber-200 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <AudioLines className="w-4 h-4 shrink-0" />
            <span>رفتن به کتابخانه صوتی</span>
          </button>
        </div>
      </div>
    </div>
  );
};
