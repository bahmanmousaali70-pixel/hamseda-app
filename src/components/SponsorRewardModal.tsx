import React, {useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Instagram,
  Loader2,
  Megaphone,
  PauseCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import {toPersianDigits} from '../data/persianLibrary';
import {
  type AdQuotaStatus,
  claimSocialMissionSession,
  claimSponsorAdSession,
  formatCooldownDurationFa,
  HOUSE_SPONSOR_AD,
  recordSponsorAdClick,
  recordSponsorAdImpression,
  sanitizeHttpUrl,
  SOCIAL_SPONSOR_MISSIONS,
  type SocialSponsorMissionId,
  type SocialSponsorMissionInfo,
  SponsorAdCooldownError,
  startSocialMissionSession,
  startSponsorAdSession,
  type WalletSnapshot,
} from '../services/sponsorAdsService';
import type {SponsorAdItem} from '../types/app';

interface SponsorRewardModalProps {
  open: boolean;
  ad: SponsorAdItem | null;
  reasonLabel?: string;
  currentCoins: number;
  requiredCoins?: number;
  adQuota?: AdQuotaStatus;
  claimedSocialMissions?: string[];
  previewOnly?: boolean;
  onClose: () => void;
  onOpenTariffs?: () => void;
  onClaimReward: (result: {earnedCoins: number; adId: string; wallet: WalletSnapshot}) => void;
  onSocialRewardClaimed?: (result: {
    earnedCoins: number;
    missionId: SocialSponsorMissionId;
    wallet: WalletSnapshot;
  }) => void;
}

interface SocialMissionUiState {
  missionToken?: string;
  starting: boolean;
  claiming: boolean;
  startedAtMs?: number;
  leftAppObserved: boolean;
  error: string | null;
}

const INITIAL_SOCIAL_MISSION_STATE: SocialMissionUiState = {
  starting: false,
  claiming: false,
  leftAppObserved: false,
  error: null,
};

export const SponsorRewardModal: React.FC<SponsorRewardModalProps> = ({
  open,
  ad,
  reasonLabel,
  currentCoins,
  requiredCoins,
  adQuota,
  claimedSocialMissions = [],
  previewOnly = false,
  onClose,
  onOpenTariffs,
  onClaimReward,
  onSocialRewardClaimed,
}) => {
  const activeAd = ad ?? HOUSE_SPONSOR_AD;
  const fallbackTotalSeconds = Math.max(5, Math.min(60, Math.round(activeAd.durationSeconds || 10)));
  const fallbackRewardCoins = Math.max(5, Math.round(activeAd.rewardCoins || 30));

  const [totalSeconds, setTotalSeconds] = useState(fallbackTotalSeconds);
  const [rewardCoins, setRewardCoins] = useState(fallbackRewardCoins);
  const [secondsLeft, setSecondsLeft] = useState(fallbackTotalSeconds);
  const [isPausedByBlur, setIsPausedByBlur] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [activeQuota, setActiveQuota] = useState<AdQuotaStatus | null>(adQuota ?? null);
  const [cooldownQuota, setCooldownQuota] = useState<AdQuotaStatus | null>(null);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const [socialStates, setSocialStates] = useState<Record<SocialSponsorMissionId, SocialMissionUiState>>({
    instagram_tapnfc: {...INITIAL_SOCIAL_MISSION_STATE},
    bale_tapnfc: {...INITIAL_SOCIAL_MISSION_STATE},
  });
  const impressionRecordedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      impressionRecordedRef.current = null;
      setSessionToken(null);
      setSessionError(null);
      setCooldownQuota(null);
      setCooldownRemainingMs(0);
      setClaiming(false);
      setSessionStarting(false);
      setSocialStates({
        instagram_tapnfc: {...INITIAL_SOCIAL_MISSION_STATE},
        bale_tapnfc: {...INITIAL_SOCIAL_MISSION_STATE},
      });
      return;
    }

    let cancelled = false;
    setTotalSeconds(fallbackTotalSeconds);
    setRewardCoins(fallbackRewardCoins);
    setSecondsLeft(fallbackTotalSeconds);
    setImageBroken(false);
    setSessionToken(null);
    setSessionError(null);
    setCooldownQuota(null);
    setCooldownRemainingMs(0);
    setActiveQuota(adQuota ?? null);
    setIsPausedByBlur(typeof document !== 'undefined' && document.visibilityState !== 'visible');

    if (previewOnly) {
      setSessionStarting(false);
      setSessionToken('preview-only');
      return;
    }

    setSessionStarting(true);

    void startSponsorAdSession(activeAd.id)
      .then((res) => {
        if (cancelled) return;
        setSessionToken(res.sessionToken);
        setTotalSeconds(res.durationSeconds);
        setSecondsLeft(res.durationSeconds);
        setRewardCoins(res.rewardCoins);
        if (res.adQuota) {
          setActiveQuota(res.adQuota);
        }
        if (impressionRecordedRef.current !== activeAd.id) {
          impressionRecordedRef.current = activeAd.id;
          void recordSponsorAdImpression(activeAd.id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof SponsorAdCooldownError) {
          setCooldownQuota(err.adQuota);
          setActiveQuota(err.adQuota);
          setCooldownRemainingMs(err.adQuota.remainingMs);
          setSessionError(null);
          return;
        }
        setSessionError(err instanceof Error ? err.message : 'برای ثبت امن تایمر و دریافت سکه، اتصال اینترنت لازم است.');
      })
      .finally(() => {
        if (!cancelled) setSessionStarting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeAd.id, fallbackTotalSeconds, fallbackRewardCoins, adQuota, previewOnly]);

  useEffect(() => {
    if (!open || !cooldownQuota) return;
    const updateTick = () => {
      if (cooldownQuota.nextAvailableAt) {
        setCooldownRemainingMs(Math.max(0, cooldownQuota.nextAvailableAt - Date.now()));
      } else {
        setCooldownRemainingMs((prev) => Math.max(0, prev - 1000));
      }
    };
    updateTick();
    const interval = window.setInterval(updateTick, 1000);
    return () => window.clearInterval(interval);
  }, [open, cooldownQuota]);

  useEffect(() => {
    if (!open) return;
    const markExternalLeave = () => {
      setSocialStates((prev) => {
        let changed = false;
        const next = {...prev};
        (['instagram_tapnfc', 'bale_tapnfc'] as SocialSponsorMissionId[]).forEach((id) => {
          if (next[id].startedAtMs && !next[id].leftAppObserved) {
            next[id] = {...next[id], leftAppObserved: true};
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };
    const onVisibility = () => {
      const hidden = document.visibilityState !== 'visible';
      setIsPausedByBlur(hidden);
      if (hidden) markExternalLeave();
    };
    const onBlur = () => {
      markExternalLeave();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !sessionToken || sessionError || cooldownQuota || secondsLeft <= 0 || isPausedByBlur) return;
    const timer = window.setTimeout(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [open, sessionToken, sessionError, cooldownQuota, secondsLeft, isPausedByBlur]);

  if (!open) return null;

  const safeHref = sanitizeHttpUrl(activeAd.linkUrl) ?? 'https://tapnfc.ir';
  const safeImg = activeAd.imageUrl ? sanitizeHttpUrl(activeAd.imageUrl) : null;
  const progressPct = sessionToken
    ? Math.min(100, Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100))
    : 0;
  const finished = Boolean(sessionToken) && !sessionError && !cooldownQuota && secondsLeft <= 0;
  const currentAttemptNumber = activeQuota
    ? Math.min(activeQuota.maxPerWindow, activeQuota.usedInWindow + 1)
    : 1;

  const handleClaim = async () => {
    if (previewOnly) {
      onClose();
      return;
    }
    if (!finished || !sessionToken || claiming) return;
    setClaiming(true);
    setSessionError(null);
    try {
      const result = await claimSponsorAdSession(sessionToken);
      onClaimReward({
        earnedCoins: result.earnedCoins,
        adId: activeAd.id,
        wallet: result.wallet,
      });
    } catch (err) {
      if (err instanceof SponsorAdCooldownError) {
        setCooldownQuota(err.adQuota);
        setActiveQuota(err.adQuota);
        setCooldownRemainingMs(err.adQuota.remainingMs);
        setSessionToken(null);
      } else {
        setSessionError(err instanceof Error ? err.message : 'دریافت پاداش با خطا مواجه شد.');
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleOpenSocialLink = async (mission: SocialSponsorMissionInfo) => {
    if (previewOnly) return;
    setSocialStates((prev) => ({
      ...prev,
      [mission.id]: {
        ...prev[mission.id],
        starting: true,
        startedAtMs: prev[mission.id].startedAtMs ?? Date.now(),
        error: null,
      },
    }));
    try {
      const started = await startSocialMissionSession(mission.id);
      setSocialStates((prev) => ({
        ...prev,
        [mission.id]: {
          ...prev[mission.id],
          starting: false,
          missionToken: started.missionToken,
          startedAtMs: prev[mission.id].startedAtMs ?? Date.now(),
          error: null,
        },
      }));
    } catch (err) {
      setSocialStates((prev) => ({
        ...prev,
        [mission.id]: {
          ...prev[mission.id],
          starting: false,
          error: err instanceof Error ? err.message : 'امکان شروع بررسی عضویت وجود نداشت.',
        },
      }));
    }
  };

  const handleClaimSocial = async (mission: SocialSponsorMissionInfo) => {
    if (previewOnly) return;
    const state = socialStates[mission.id];
    if (!state.missionToken || state.claiming) return;

    setSocialStates((prev) => ({
      ...prev,
      [mission.id]: {...prev[mission.id], claiming: true, error: null},
    }));

    try {
      const result = await claimSocialMissionSession(state.missionToken);
      setSocialStates((prev) => ({
        ...prev,
        [mission.id]: {
          ...prev[mission.id],
          claiming: false,
          error: null,
        },
      }));
      onSocialRewardClaimed?.({
        earnedCoins: result.earnedCoins,
        missionId: result.missionId,
        wallet: result.wallet,
      });
    } catch (err) {
      setSocialStates((prev) => ({
        ...prev,
        [mission.id]: {
          ...prev[mission.id],
          claiming: false,
          error: err instanceof Error ? err.message : 'ثبت سکه عضویت انجام نشد.',
        },
      }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="افزایش سکه و دریافت سکه هدیه هم‌صدا"
    >
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-3xl luxury-card overflow-hidden shadow-2xl border border-amber-400/35">
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-[var(--luxury-border)] bg-[var(--luxury-subtle)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
              {cooldownQuota ? <Clock className="w-5 h-5" /> : <Coins className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                {cooldownQuota
                  ? 'افزایش سکه · عضویت شبکه‌های اسپانسر (+۳۰۰ سکه)'
                  : `افزایش سکه و دریافت ${toPersianDigits(rewardCoins)} سکه هدیه`}
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
            aria-label="بستن پنجره سکه"
            className="min-w-[40px] min-h-[40px] rounded-xl border border-[var(--luxury-border)] text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          {sessionStarting ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-700 dark:text-amber-300" />
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                در حال بررسی سهمیه سکه و آماده‌سازی امن...
              </div>
            </div>
          ) : cooldownQuota ? (
            /* Cooldown active: Do NOT show ANY sponsor banner/ad/link — even if new ads exist */
            <div className="space-y-4">
              <div className="rounded-2xl luxury-surface-subtle p-4 sm:p-5 text-center space-y-3 border border-amber-400/35">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  سهمیه ۲ تبلیغ در این بازه ۳ ساعته تکمیل شد
                </h3>
                <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
                  هر کاربر در هر بازه <strong>۳ ساعته</strong> حداکثر <strong>۲ بار</strong> با مشاهده تبلیغ سکه می‌گیرد؛ اما می‌توانید همین الان از بخش عضویت در اینستاگرام و بله اسپانسر در پایین سکه بگیرید.
                </p>

                <div className="inline-flex flex-col items-center px-5 py-2.5 rounded-2xl bg-[var(--luxury-surface)] border border-[var(--luxury-border)]">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    زمان باقیمانده تا باز شدن دوباره تبلیغات
                  </span>
                  <span className="mt-1 text-xl font-mono-num font-black text-emerald-800 dark:text-amber-300" dir="ltr">
                    {formatCooldownDurationFa(cooldownRemainingMs)}
                  </span>
                </div>
              </div>

              {onOpenTariffs && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTariffs();
                  }}
                  className="w-full min-h-[44px] px-4 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-subtle)] text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Megaphone className="w-4 h-4 text-emerald-700 dark:text-amber-300" />
                  <span>مشاهده تعرفه ثبت تبلیغ</span>
                </button>
              )}
            </div>
          ) : sessionError && !sessionToken ? (
            <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs leading-6 text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{sessionError}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span>
                  سهمیه دوره ۳ ساعته: نوبت {toPersianDigits(currentAttemptNumber)} از{' '}
                  {toPersianDigits(activeQuota?.maxPerWindow ?? 2)}
                </span>
                {onOpenTariffs && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTariffs();
                    }}
                    className="text-emerald-700 dark:text-amber-300 hover:underline cursor-pointer"
                  >
                    سفارش تبلیغ و تعرفه‌ها
                  </button>
                )}
              </div>

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
                <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-l from-emerald-900 to-emerald-800 text-white flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-amber-300 font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {activeAd.packageTier === 'exclusive'
                          ? 'اسپانسر انحصاری هم‌صدا'
                          : 'حامی رسمی هم‌صدا'}
                      </span>
                    </div>
                    <div className="text-base sm:text-lg font-extrabold">{activeAd.title}</div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {activeAd.packageTier === 'exclusive' && (
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      اسپانسر انحصاری هم‌صدا
                      {activeAd.brandLabel ? ` · ${activeAd.brandLabel}` : ''}
                    </span>
                  </div>
                )}
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
                className="w-full min-h-[44px] px-4 rounded-xl border border-[var(--luxury-border)] bg-[var(--luxury-subtle)] hover:brightness-95 text-slate-900 dark:text-white text-xs sm:text-sm font-bold flex items-center justify-between gap-2 transition-all"
              >
                <span>مشاهده معرفی و سایت حامی</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-amber-300 text-xs" dir="ltr">
                  <span>{safeHref.replace(/^https?:\/\//i, '').split('/')[0]}</span>
                  <ExternalLink className="w-4 h-4" />
                </span>
              </a>

              {sessionError && (
                <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{sessionError}</span>
                </div>
              )}

              {/* 10s Server-Verified Timer Progress */}
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
              <button
                type="button"
                disabled={!previewOnly && (!finished || claiming)}
                onClick={handleClaim}
                className={`w-full min-h-[46px] px-4 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all ${
                  previewOnly || (finished && !claiming)
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer shadow-md'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                }`}
              >
                {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                <span>
                  {previewOnly
                    ? 'بستن پیش‌نمایش ادمین'
                    : claiming
                      ? 'در حال ثبت امن سکه...'
                      : finished
                        ? `دریافت +${toPersianDigits(rewardCoins)} سکه و ادامه`
                        : `لطفاً ${toPersianDigits(secondsLeft)} ثانیه صبر کنید`}
                </span>
              </button>
            </div>
          )}

          {/* Official Sponsor Social Missions (+150 Instagram & +150 Bale) */}
          {!previewOnly && (
            <div className="pt-3 border-t border-[var(--luxury-border)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-amber-300 shrink-0" />
                  <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    پاداش ویژه عضویت در شبکه‌های اسپانسر (tapnfc.ir)
                  </h4>
                </div>
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-200 text-[11px] font-extrabold shrink-0">
                  تا +۳۰۰ سکه
                </span>
              </div>
              <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                هر ماموریت فقط <strong>یک‌بار</strong> برای هر کاربر فعال است؛ وارد پیج یا کانال شوید، عضو شوید و پس از بازگشت سکه هدیه را دریافت کنید.
              </p>

              <div className="space-y-3">
                {SOCIAL_SPONSOR_MISSIONS.map((mission) => {
                  const isClaimed = claimedSocialMissions.includes(mission.id);
                  const state = socialStates[mission.id];
                  const canClaim =
                    Boolean(state.missionToken) &&
                    state.leftAppObserved &&
                    !state.claiming;

                  return (
                    <div
                      key={mission.id}
                      className={`rounded-2xl border p-3.5 space-y-2.5 ${
                        isClaimed
                          ? 'border-emerald-500/35 bg-emerald-500/5'
                          : 'border-[var(--luxury-border)] bg-[var(--luxury-subtle)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              mission.platform === 'instagram'
                                ? 'bg-pink-500/15 text-pink-600 dark:text-pink-300'
                                : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                            }`}
                          >
                            {mission.platform === 'instagram' ? (
                              <Instagram className="w-4 h-4" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                              {mission.title}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate" dir="ltr">
                              {mission.handleDisplay}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold shrink-0 ${
                            isClaimed
                              ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                          }`}
                        >
                          {isClaimed ? 'دریافت شده ✓' : `+${toPersianDigits(mission.rewardCoins)} سکه`}
                        </span>
                      </div>

                      {!isClaimed && (
                        <>
                          <a
                            href={mission.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => void handleOpenSocialLink(mission)}
                            className={`w-full min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold flex items-center justify-between gap-2 transition-all ${
                              mission.platform === 'instagram'
                                ? 'bg-gradient-to-l from-pink-600 to-rose-600 text-white hover:brightness-95'
                                : 'bg-gradient-to-l from-sky-600 to-cyan-700 text-white hover:brightness-95'
                            }`}
                          >
                            <span>
                              ۱. ورود به {mission.platform === 'instagram' ? 'پیج اینستاگرام @tapnfc.ir' : 'کانال رسمی بله'} و عضویت
                            </span>
                            <ExternalLink className="w-4 h-4 shrink-0" />
                          </a>

                          {state.starting && (
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>در حال آماده‌سازی...</span>
                            </div>
                          )}

                          {state.startedAtMs && (
                            <div className="space-y-2 pt-1 border-t border-[var(--luxury-border)]">
                              {!state.leftAppObserved && (
                                <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                                  لطفاً پس از باز شدن {mission.platform === 'instagram' ? 'اینستاگرام' : 'بله'} و عضویت به برنامه برگردید.
                                </div>
                              )}

                              {state.error && (
                                <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-[11px] text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{state.error}</span>
                                </div>
                              )}

                              <button
                                type="button"
                                disabled={!canClaim}
                                onClick={() => void handleClaimSocial(mission)}
                                className={`w-full min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                                  canClaim
                                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer shadow-sm'
                                    : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                {state.claiming ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Coins className="w-4 h-4" />
                                )}
                                <span>
                                  {state.claiming
                                    ? 'در حال واریز سکه...'
                                    : state.leftAppObserved
                                      ? `۲. عضو شدم · دریافت +${toPersianDigits(mission.rewardCoins)} سکه`
                                      : 'ابتدا وارد صفحه/کانال شوید و برگردید'}
                                </span>
                              </button>
                            </div>
                          )}

                          {!state.startedAtMs && state.error && (
                            <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-[11px] text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{state.error}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

