import React, {useMemo, useState} from 'react';
import {ExternalLink, Gamepad2, Globe2, Play, Radio, Search, Youtube} from 'lucide-react';

type LanguageMode = 'fa' | 'global';

const cleanVideoId = (value: string): string | null => {
  const input = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || null;
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtube-nocookie.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'live', 'shorts'].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
};

export const GTA6StreamsView: React.FC = () => {
  const [language, setLanguage] = useState<LanguageMode>('fa');
  const [query, setQuery] = useState('');
  const [videoInput, setVideoInput] = useState('');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const searchTerms = useMemo(() => {
    const base = query.trim() || 'GTA 6';
    const languageTerm = language === 'fa' ? 'فارسی Persian Farsi' : 'English international';
    return {
      youtube: `${base} live stream ${languageTerm}`,
      twitch: `${base} ${language === 'fa' ? 'Persian Farsi' : 'English'}`,
    };
  }, [language, query]);

  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerms.youtube)}&sp=EgJAAQ%253D%253D`;
  const twitchUrl = `https://www.twitch.tv/search?term=${encodeURIComponent(searchTerms.twitch)}`;

  const startVideo = () => {
    const id = cleanVideoId(videoInput);
    if (id) {
      setActiveVideoId(id);
    }
  };

  return (
    <section className="luxury-card p-5 sm:p-7 space-y-5">
      <div className="flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-700 to-slate-900 border border-violet-400/30 flex items-center justify-center shrink-0">
          <Gamepad2 className="w-6 h-6 text-violet-200" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-rose-500" />
            <span>پخش زنده بازی</span>
            <span aria-hidden="true">·</span>
            <span>یوتیوب و توییچ</span>
          </div>
          <h2 className="mt-0.5 text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">استریم‌های GTA 6</h2>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#F0EEE8] dark:bg-[#091210] border border-[#E6E2D8] dark:border-emerald-950/80">
        <button
          type="button"
          onClick={() => setLanguage('fa')}
          className={`min-h-[44px] rounded-xl text-sm font-semibold transition-all cursor-pointer ${
            language === 'fa'
              ? 'bg-white dark:bg-[#152622] text-emerald-900 dark:text-amber-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          فارسی‌زبان‌ها
        </button>
        <button
          type="button"
          onClick={() => setLanguage('global')}
          className={`min-h-[44px] rounded-xl text-sm font-semibold transition-all cursor-pointer ${
            language === 'global'
              ? 'bg-white dark:bg-[#152622] text-emerald-900 dark:text-amber-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          بین‌المللی
        </button>
      </div>

      <div className="flex gap-2.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="جستجوی GTA 6، گیم‌پلی، مأموریت و..."
          className="min-w-0 flex-1 min-h-[48px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[48px] px-5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white flex items-center gap-2 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0"
        >
          <Search className="w-4 h-4" />
          <span>جستجو</span>
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-right rounded-2xl border border-[#E6E2D8] dark:border-red-950/70 bg-[#FAF9F6] dark:bg-red-950/15 p-4 flex items-center gap-3 hover:border-red-400/70 transition-colors"
        >
          <Youtube className="w-7 h-7 text-red-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-slate-900 dark:text-white">استریم زنده یوتیوب</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {language === 'fa' ? 'جستجوی استریمرهای فارسی‌زبان' : 'جستجوی استریمرهای سراسر جهان'}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-500" />
        </a>
        <a
          href={twitchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-right rounded-2xl border border-[#E6E2D8] dark:border-violet-950/70 bg-[#FAF9F6] dark:bg-violet-950/15 p-4 flex items-center gap-3 hover:border-violet-400/70 transition-colors"
        >
          <Gamepad2 className="w-7 h-7 text-violet-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-slate-900 dark:text-white">استریم در توییچ</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {language === 'fa' ? 'کانال‌های فارسی و ایرانی' : 'کانال‌های بین‌المللی'}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-500" />
        </a>
      </div>

      <div className="rounded-2xl luxury-surface-subtle p-4 sm:p-5 space-y-3">
        <div className="font-semibold text-sm text-slate-900 dark:text-white">پخش ویدئو داخل خود رفیقو</div>
        <div className="flex gap-2">
          <input
            value={videoInput}
            onChange={(event) => setVideoInput(event.target.value)}
            placeholder="لینک استریم یا شناسه ویدئوی یوتیوب"
            dir="ltr"
            className="min-w-0 flex-1 min-h-[46px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs sm:text-sm text-slate-900 dark:text-white"
          />
          <button
            type="button"
            onClick={startVideo}
            disabled={!cleanVideoId(videoInput)}
            className="min-h-[46px] px-5 rounded-xl bg-violet-700 hover:bg-violet-800 disabled:opacity-40 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-4 h-4" /> پخش
          </button>
        </div>
        {activeVideoId ? (
          <div className="space-y-2">
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                title="پخش استریم GTA 6 از یوتیوب"
                src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&playsinline=1&rel=0`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${activeVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] rounded-xl border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Youtube className="w-4 h-4" /> اگر یوتیوب ورود یا تأیید ربات خواست، پخش در یوتیوب رسمی
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              بعضی ویدئوها به‌دلیل محدودیت صاحب کانال یا تأیید امنیتی یوتیوب در پخش‌کننده داخلی باز نمی‌شوند؛ این محدودیت از طرف یوتیوب است.
            </p>
          </div>
        ) : (
          <p className="text-[11px] leading-6 text-slate-500 dark:text-slate-400">
            برای پیدا کردن استریم، جستجوی یوتیوب را باز کن؛ بعد از انتخاب ویدئو، لینک آن را کپی و اینجا وارد کن تا داخل رفیقو پخش شود. ورود حساب گوگل فقط در برنامه رسمی یوتیوب یا مرورگر انجام می‌شود.
          </p>
        )}
      </div>
      <div className="text-[11px] leading-6 text-slate-500 dark:text-slate-400 flex items-start gap-2">
        <Globe2 className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          جستجو و ورود حساب در یوتیوب رسمی/مرورگر انجام می‌شود؛ پس از برگشت به رفیقو، لینک ویدئو را اینجا بچسبان. ویدئوهایی که صاحبشان پخش در سایت‌های دیگر را بسته باشد، داخل برنامه قابل پخش نیستند.
        </span>
      </div>
    </section>
  );
};
