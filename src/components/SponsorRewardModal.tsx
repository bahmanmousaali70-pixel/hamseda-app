import React, {useEffect, useRef, useState} from 'react';
import {CheckCircle2, Coins, ExternalLink, PauseCircle, Sparkles, Timer, X} from 'lucide-react';
import {toPersianDigits} from '../data/persianLibrary';
import {
  HOUSE_SPONSOR_AD,
  recordSponsorAdClick,
  recordSponsorAdImpression,
  sanitizeHttpUrl,
} from '../services/sponsorAdsService';
import type {SponsorAdItem} from '../types/app';

interface SponsorRewardModalProps {
  open: boolean;
  ad: SponsorAdItem | null;
  reasonLabel?: string;
  currentCoins: number;
  requiredCoins?: number;
  onClose: () => void;
  onClaimReward: (earnedCoins: number, adId: string) => void;
}

export const SponsorRewardModal: React.FC<SponsorRewardModalProps> = ({
  open,
  ad,
  reasonLabel,
  currentCoins,
  requiredCoins,
  onClose,
  onClaimReward,
}) => {
  const activeAd = ad ?? HOUSE_SPONSOR_AD;
  const totalSeconds = Math.max(5, Math.min(60, Math.round(activeAd.durationSeconds || 10)));
  const rewardCoins = Math.max(5, Math.round(activeAd.rewardCoins || 30));

  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [isPausedByBlur, setIsPausedByBlur] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const impressionRecordedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      impressionRecordedRef.current = null;
      return;
    }
    setSecondsLeft(totalSeconds);
    setImageBroken(false);
    setIsPausedByBlur(typeof document !== 'undefined' && document.visibilityState !== 'visible');

    if (impressionRecordedRef.current !== activeAd.id) {
      impressionRecordedRef.current = activeAd.id;
      void recordSponsorAdImpression(activeAd.id);
    }
  }, [open, activeAd.id, totalSeconds]);

  useEffect(() => {
    if (!open) return;
    const onVisibility = () => {
      setIsPausedByBlur(document.visibilityState !== 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [open]);

  useEffect(() => {
    if (!open || secondsLeft <= 0 || isPausedByBlur) return;
    const timer = window.setTimeout(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [open, secondsLeft, isPausedByBlur]);

  if (!open) return null;

  const safeHref = sanitizeHttpUrl(activeAd.linkUrl) ?? 'https://tapnfc.ir';
  const safeImg = activeAd.imageUrl ? sanitizeHttpUrl(activeAd.imageUrl) : null;
  const progressPct = Math.min(100, Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100));
  const finished = secondsLeft <= 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="دریافت سکه هدیه با مشاهده حامی هم‌صدا"
    >
      <div className="w-full max-w-lg rounded-3xl luxury-card overflow-hidden shadow-2xl border border-amber-400/35">
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-[var(--luxury-border)] bg-[var(--luxury-subtle)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                دریافت {toPersianDigits(rewardCoins)} سکه هدیه هم‌صدا
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                موجودی فعلی: {toPersianDigits(currentCoins)} سکه
                {typeof requiredCoins === 'number' && requiredCoins > 0
                  ? ` · مورد نیاز برای ${reasonLabel || 'این قابلیت'}: ${toPersianDigits(requiredCoins)} سکه`
                  : ''}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره حامی"
            className="min-w-[40px] min-h-[40px] rounded-xl border border-[var(--luxury-border)] text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {safeImg && !imageBroken ? (
            <div className="rounded-2xl overflow-hidden border border-[var(--luxury-border)] bg-slate-950/10 aspect-[16/9]">
              <img
                src={safeImg}
                alt={activeAd.title}
                referrerPolicy="no-referrer"
                onError={() => setImageBroken(true)}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="rounded-2xl p-5 bg-gradient-to-l from-emerald-900 to-emerald-800 text-white flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs text-amber-300 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>حامی رسمی هم‌صدا</span>
                </div>
                <div className="text-base sm:text-lg font-extrabold">{activeAd.title}</div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              {activeAd.title}
            </h3>
            <p className="text-xs sm:text-sm leading-7 text-slate-600 dark:text-slate-300">
              {activeAd.description}
            </p>
          </div>

          {/* CTA Link to Sponsor */}
          <a
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              void recordSponsorAdClick(activeAd.id);
            }}
            className="w-full min-h-[46px] px-4 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-subtle)] hover:brightness-95 text-slate-900 dark:text-white text-xs sm:text-sm font-bold flex items-center justify-between gap-2 transition-all"
          >
            <span>مشاهده معرفی و سایت حامی</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-amber-300 text-xs" dir="ltr">
              <span>{safeHref.replace(/^https?:\/\//i, '').split('/')[0]}</span>
              <ExternalLink className="w-4 h-4" />
            </span>
          </a>

          {/* 10s Anti-Cheat Timer Progress */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                {finished ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>زمان تکمیل شد — سکه آماده دریافت است!</span>
                  </>
                ) : isPausedByBlur ? (
                  <>
                    <PauseCircle className="w-4 h-4 text-amber-500" />
                    <span>تایمر متوقف شد (برای ادامه در صفحه بمانید)</span>
                  </>
                ) : (
                  <>
                    <Timer className="w-4 h-4 text-amber-600 dark:text-amber-300" />
                    <span>{toPersianDigits(secondsLeft)} ثانیه تا دریافت {toPersianDigits(rewardCoins)} سکه</span>
                  </>
                )}
              </span>
              <span className="font-mono-num text-slate-500 dark:text-slate-400">
                {toPersianDigits(progressPct)}٪
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-500"
                style={{width: `${progressPct}%`}}
              />
            </div>
          </div>

          {/* Claim Button */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              disabled={!finished}
              onClick={() => onClaimReward(rewardCoins, activeAd.id)}
              className={`flex-1 min-h-[48px] px-4 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all ${
                finished
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer shadow-md'
                  : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>
                {finished
                  ? `دریافت +${toPersianDigits(rewardCoins)} سکه و ادامه`
                  : `لطفاً ${toPersianDigits(secondsLeft)} ثانیه صبر کنید`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
