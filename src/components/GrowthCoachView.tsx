import React, {useMemo, useState} from 'react';
import {
  BookOpen,
  Brain,
  Check,
  ClipboardPaste,
  Copy,
  FileText,
  GraduationCap,
  Loader2,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  DAILY_ENGLISH_PHRASES,
  getTodayEnglishPhrases,
  PERSONALITY_PROFILES,
  toPersianDigits,
} from '../data/persianLibrary';
import {apiUrl, safeReadJsonResponse} from '../services/apiConfig';
import {summarizeTextOffline, type TextSummaryResult} from '../services/dailyBriefing';
import type {PersonalityFocusId} from '../types/app';

/* ============================================================================
 * 1. Daily English Practice Panel (Bilingual Audio + Learned Tracker)
 * ============================================================================ */

interface DailyEnglishPanelProps {
  learnedIds: string[];
  onToggleLearned: (id: string) => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onSpeakAllToday: () => void;
}

export const DailyEnglishPanel: React.FC<DailyEnglishPanelProps> = ({
  learnedIds,
  onToggleLearned,
  onSpeakText,
  onSpeakAllToday,
}) => {
  const [topicFilter, setTopicFilter] = useState<'today' | 'all' | 'daily' | 'travel' | 'couple' | 'work'>('today');

  const todayFive = useMemo(() => getTodayEnglishPhrases(5), []);

  const visiblePhrases = useMemo(() => {
    if (topicFilter === 'today') return todayFive;
    if (topicFilter === 'all') return DAILY_ENGLISH_PHRASES;
    return DAILY_ENGLISH_PHRASES.filter((p) => p.topic === topicFilter);
  }, [topicFilter, todayFive]);

  const learnedCount = learnedIds.length;

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <GraduationCap className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>
              مرور صوتی دوزبانه · یادگرفته‌شده: {toPersianDigits(learnedCount)} از {toPersianDigits(DAILY_ENGLISH_PHRASES.length)}
            </span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            ۵ عبارت انگلیسی کاربردی امروز
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            هر روز ۵ عبارت تازه همراه با تلفظ روان فارسی و انگلیسی؛ مناسب برای شنیدن در مسیر و هنگام رانندگی.
          </p>
        </div>

        <button
          type="button"
          onClick={onSpeakAllToday}
          className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Volume2 className="w-4 h-4" />
          <span>شنیدن ۵ عبارت امروز پشت‌سرهم</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 p-1 luxury-surface-subtle rounded-xl w-fit">
        {(
          [
            {id: 'today', label: '۵ عبارت امروز'},
            {id: 'couple', label: 'همراهی'},
            {id: 'daily', label: 'روزمره'},
            {id: 'travel', label: 'سفر'},
            {id: 'work', label: 'کار'},
            {id: 'all', label: `همه (${toPersianDigits(DAILY_ENGLISH_PHRASES.length)})`},
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTopicFilter(tab.id)}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              topicFilter === tab.id ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visiblePhrases.map((item) => {
          const isLearned = learnedIds.includes(item.id);
          const speakPayload = `${item.english}. به فارسی یعنی: ${item.persian}`;
          return (
            <div
              key={item.id}
              className={`rounded-2xl p-4 sm:p-5 luxury-surface-subtle flex flex-col justify-between gap-4 border ${
                isLearned
                  ? 'border-emerald-300/70 dark:border-emerald-700/70'
                  : 'border-[#E6E2D8] dark:border-emerald-950/60'
              }`}
            >
              <div className="space-y-2">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  موضوع: {item.topicLabel}
                </div>
                <div dir="ltr" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-7 text-left">
                  {item.english}
                </div>
                <div className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                  تلفظ: {item.phonetic}
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-200 leading-7">
                  معنی: {item.persian}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E6E2D8] dark:border-emerald-950/60">
                <button
                  type="button"
                  onClick={() => onSpeakText(speakPayload, `عبارت انگلیسی: ${item.english}`, 'custom')}
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>پخش دوزبانه</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleLearned(item.id)}
                  className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    isLearned
                      ? 'bg-emerald-700 border-emerald-700 text-white'
                      : 'border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1412] text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isLearned ? 'یاد گرفتم' : 'ثبت یادگیری'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* ============================================================================
 * 2. Long Text / Article Audio Summarizer Panel
 * ============================================================================ */

interface TextSummarizerPanelProps {
  isOnline: boolean;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
}

export const TextSummarizerPanel: React.FC<TextSummarizerPanelProps> = ({
  isOnline,
  onSpeakText,
  onStatusToast,
}) => {
  const [rawText, setRawText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TextSummaryResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && clip.trim()) {
        setRawText(clip.trim().slice(0, 20000));
        onStatusToast?.('متن از حافظه گوشی جای‌گذاری شد.');
      } else {
        onStatusToast?.('متنی در حافظه کلیپ‌بورد پیدا نشد.');
      }
    } catch {
      onStatusToast?.('مرورگر اجازه خواندن خودکار کلیپ‌بورد نداد؛ متن را دستی جای‌گذاری کنید.');
    }
  };

  const handleSummarize = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = rawText.trim();
    if (cleaned.length < 30) {
      onStatusToast?.('لطفاً متن طولانی‌تری وارد کنید (حداقل ۳۰ کاراکتر).');
      return;
    }

    setBusy(true);
    try {
      if (isOnline) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 11000);
        try {
          const res = await fetch(apiUrl('/api/summarize-text'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            signal: controller.signal,
            body: JSON.stringify({text: cleaned.slice(0, 20000)}),
          });
          if (res.ok) {
            const parsed = await safeReadJsonResponse<TextSummaryResult>(res);
            if (!parsed.isHtml && parsed.data && parsed.data.spokenSummary) {
              setResult({...parsed.data, isOffline: false});
              setBusy(false);
              return;
            }
          }
        } finally {
          window.clearTimeout(timer);
        }
      }

      // Seamless offline fallback
      const offline = summarizeTextOffline(cleaned);
      setResult(offline);
    } catch {
      setResult(summarizeTextOffline(cleaned));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyResult = async () => {
    if (!result) return;
    const payload = `${result.title}\n\n${result.bullets.map((b, i) => `${toPersianDigits(i + 1)}. ${b}`).join('\n')}\n\n${result.spokenSummary}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      onStatusToast?.('خلاصه متن کپی شد.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onStatusToast?.('کپی خودکار انجام نشد.');
    }
  };

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <FileText className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>چکیده‌ساز هوشمند آنلاین + پردازشگر آفلاین در نبود اینترنت</span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            خلاصه‌خوان صوتی متن‌ها و مقالات طولانی
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            هر خبر، مقاله یا پیام طولانی را اینجا بگذارید تا هم‌صدا در ۳ نکته کلیدی خلاصه‌اش کند و برایتان بخواند.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePaste}
            className="min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1412] text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <ClipboardPaste className="w-4 h-4" />
            <span>جای‌گذاری متن</span>
          </button>
          {rawText && (
            <button
              type="button"
              onClick={() => {
                setRawText('');
                setResult(null);
              }}
              aria-label="پاک کردن متن"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-[#DFDBD0] dark:border-emerald-900 flex items-center justify-center text-slate-500 hover:text-rose-600 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSummarize} className="space-y-3">
        <textarea
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="متن مقاله، ایمیل کاری یا پیام طولانی خود را اینجا کپی و پیست کنید..."
          className="w-full p-4 rounded-2xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm leading-7 text-slate-900 dark:text-white placeholder:text-slate-400"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            طول متن: {toPersianDigits(rawText.trim().length)} کاراکتر
          </span>
          <button
            type="submit"
            disabled={busy}
            className="min-h-[44px] px-5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{busy ? 'در حال خلاصه‌سازی...' : 'ساخت خلاصه و آماده پخش صوتی'}</span>
          </button>
        </div>
      </form>

      {result && (
        <div className="rounded-2xl luxury-surface-subtle p-5 sm:p-6 space-y-4 border border-emerald-200/70 dark:border-emerald-900/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-emerald-800 dark:text-amber-300">
                {result.isOffline ? 'خلاصه استخراجی آفلاین' : 'خلاصه هوشمند آنلاین'}
              </div>
              <h3 className="mt-0.5 text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                {result.title}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSpeakText(result.spokenSummary, result.title, 'custom')}
                className="min-h-[40px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Volume2 className="w-4 h-4" />
                <span>شنیدن خلاصه با صدا</span>
              </button>
              <button
                type="button"
                onClick={handleCopyResult}
                className="min-h-[40px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1412] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                <span>کپی</span>
              </button>
            </div>
          </div>

          <ul className="space-y-2 text-sm text-slate-800 dark:text-slate-200 leading-7">
            {result.bullets.map((b, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="font-bold text-emerald-800 dark:text-amber-300 tabular-nums shrink-0">
                  {toPersianDigits(idx + 1)}.
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <div className="pt-3 border-t border-[#E6E2D8] dark:border-emerald-950/60 text-xs sm:text-sm leading-7 text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-white">متن شنیداری: </span>
            {result.spokenSummary}
          </div>
        </div>
      )}
    </section>
  );
};

/* ============================================================================
 * 3. Scientific Personality-Matched Micro-Exercises Panel
 * ============================================================================ */

interface PersonalityGrowthPanelProps {
  activeFocus: PersonalityFocusId;
  completedIdsToday: string[];
  onChangeFocus: (focus: PersonalityFocusId) => void;
  onToggleExerciseDone: (exerciseId: string) => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
}

export const PersonalityGrowthPanel: React.FC<PersonalityGrowthPanelProps> = ({
  activeFocus,
  completedIdsToday,
  onChangeFocus,
  onToggleExerciseDone,
  onSpeakText,
}) => {
  const profile = useMemo(
    () => PERSONALITY_PROFILES.find((p) => p.id === activeFocus) ?? PERSONALITY_PROFILES[0],
    [activeFocus]
  );

  const doneCount = profile.exercises.filter((ex) => completedIdsToday.includes(ex.id)).length;

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Brain className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>
              تمرین‌های ۲ تا ۵ دقیقه‌ای مبتنی بر علوم اعصاب، ACT و CBT · انجام‌شده امروز: {toPersianDigits(doneCount)} از{' '}
              {toPersianDigits(profile.exercises.length)}
            </span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            تمرین‌های علمی متناسب با تیپ شخصیتی
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            تیپ غالب امروز یا روحیه خودتان را انتخاب کنید تا دقیقاً همان تمرین علمی متناسب را با راهنمای صوتی انجام دهید.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            onSpeakText(
              `تیپ شخصیتی انتخابی: ${profile.title}. ${profile.tagline} ${profile.scientificBasis}`,
              profile.title,
              'energy'
            )
          }
          className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Volume2 className="w-4 h-4" />
          <span>توضیح صوتی این تیپ</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 p-1.5 luxury-surface-subtle rounded-2xl">
        {PERSONALITY_PROFILES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChangeFocus(p.id)}
            className={`min-h-[40px] px-3.5 rounded-xl text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap ${
              p.id === profile.id
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-emerald-950/40'
            }`}
          >
            {p.title}
          </button>
        ))}
      </div>

      <div className="rounded-2xl luxury-surface-subtle p-4 sm:p-5 space-y-1.5 border border-emerald-200/60 dark:border-emerald-900/50">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-amber-300">
          <BookOpen className="w-4 h-4" />
          <span>پشتوانه علمی · {profile.scientificBasis}</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-7">{profile.tagline}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {profile.exercises.map((ex, idx) => {
          const done = completedIdsToday.includes(ex.id);
          return (
            <div
              key={ex.id}
              className={`rounded-2xl p-5 luxury-surface-subtle flex flex-col justify-between gap-4 border ${
                done ? 'border-emerald-400/70 dark:border-emerald-700/70' : 'border-[#E6E2D8] dark:border-emerald-950/60'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>تمرین {toPersianDigits(idx + 1)}</span>
                  <span>حدود {toPersianDigits(ex.durationMin)} دقیقه</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-6">{ex.title}</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-7">{ex.steps}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E6E2D8] dark:border-emerald-950/60">
                <button
                  type="button"
                  onClick={() => onSpeakText(ex.spokenGuide, ex.title, 'energy')}
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>راهنمای صوتی</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleExerciseDone(ex.id)}
                  className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    done
                      ? 'bg-emerald-700 border-emerald-700 text-white'
                      : 'border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1412] text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{done ? 'انجام شد' : 'تیک امروز'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
