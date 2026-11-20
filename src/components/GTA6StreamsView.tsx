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

  const openYouTubeSearch = () => {
    // Google sign-in is intentionally handled by the official YouTube app/browser.
    // Actual playback returns to the in-app YouTube player below when embedding is allowed.
    window.open(youtubeUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center">
          <Gamepad2 className="w-6 h-6 text-violet-700 dark:text-violet-300" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><Radio className="w-3.5 h-3.5" /> پخش زنده بازی</div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">استریم‌های GTA 6</h2>
        </div>
        <span className="mr-auto text-[10px] rounded-full px-2.5 py-1 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">LIVE</span>
      </div>

      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-emerald-950/60">
        <button type="button" onClick={() => setLanguage('fa')} className={`min-h-[42px] rounded-lg text-sm font-semibold ${language === 'fa' ? 'bg-white dark:bg-[#172724] text-emerald-800 dark:text-emerald-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>فارسی‌زبان‌ها</button>
        <button type="button" onClick={() => setLanguage('global')} className={`min-h-[42px] rounded-lg text-sm font-semibold ${language === 'global' ? 'bg-white dark:bg-[#172724] text-emerald-800 dark:text-emerald-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>بین‌المللی</button>
      </div>

      <form onSubmit={(event) => {event.preventDefault(); openYouTubeSearch();}} className="flex gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجوی GTA 6، گیم‌پلی، مأموریت و..." className="min-w-0 flex-1 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white" />
        <button type="submit" className="min-h-[44px] px-3 rounded-xl bg-emerald-700 text-white flex items-center gap-1.5"><Search className="w-4 h-4" /><span className="text-xs">جستجو</span></button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button type="button" onClick={openYouTubeSearch} className="text-right rounded-xl border border-red-200 dark:border-red-950 bg-red-50 dark:bg-red-950/20 p-4 flex items-center gap-3 hover:opacity-85">
          <Youtube className="w-7 h-7 text-red-600 shrink-0" />
          <div className="min-w-0 flex-1"><div className="font-bold text-sm text-slate-900 dark:text-white">استریم زنده یوتیوب</div><div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{language === 'fa' ? 'جستجوی استریمرهای فارسی‌زبان' : 'جستجوی استریمرهای سراسر جهان'}</div></div>
          <ExternalLink className="w-4 h-4 text-slate-500" />
        </button>
        <button type="button" onClick={() => window.open(twitchUrl, '_blank', 'noopener,noreferrer')} className="text-right rounded-xl border border-violet-200 dark:border-violet-950 bg-violet-50 dark:bg-violet-950/20 p-4 flex items-center gap-3 hover:opacity-85">
          <Gamepad2 className="w-7 h-7 text-violet-600 shrink-0" />
          <div className="min-w-0 flex-1"><div className="font-bold text-sm text-slate-900 dark:text-white">استریم در توییچ</div><div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{language === 'fa' ? 'کانال‌های فارسی و ایرانی' : 'کانال‌های بین‌المللی'}</div></div>
          <ExternalLink className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-emerald-900/70 p-3 sm:p-4 space-y-3">
        <div className="font-semibold text-sm text-slate-900 dark:text-white">پخش ویدئو داخل خود هم‌صدا</div>
        <div className="flex gap-2">
          <input value={videoInput} onChange={(event) => setVideoInput(event.target.value)} placeholder="لینک استریم یا شناسه ویدئوی یوتیوب" dir="ltr" className="min-w-0 flex-1 min-h-[42px] px-3 rounded-lg border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white" />
          <button type="button" onClick={startVideo} disabled={!cleanVideoId(videoInput)} className="px-4 rounded-lg bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5"><Play className="w-4 h-4" /> پخش</button>
        </div>
        {activeVideoId ? (
          <div className="space-y-2">
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe title="پخش استریم GTA 6 از یوتیوب" src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&playsinline=1&rel=0`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
            </div>
            <button type="button" onClick={() => window.open(`https://www.youtube.com/watch?v=${activeVideoId}`, '_blank', 'noopener,noreferrer')} className="w-full min-h-[42px] rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center justify-center gap-2">
              <Youtube className="w-4 h-4" /> اگر یوتیوب ورود یا تأیید ربات خواست، پخش در یوتیوب رسمی
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">بعضی ویدئوها به‌دلیل محدودیت صاحب کانال یا تأیید امنیتی یوتیوب در پخش‌کننده داخلی باز نمی‌شوند؛ این محدودیت از طرف یوتیوب است.</p>
          </div>
        ) : (
          <p className="text-[11px] leading-6 text-slate-500 dark:text-slate-400">برای پیدا کردن استریم، جستجوی یوتیوب را باز کن؛ بعد از انتخاب ویدئو، لینک آن را کپی و اینجا وارد کن تا داخل هم‌صدا پخش شود. ورود حساب گوگل فقط در برنامه رسمی یوتیوب یا مرورگر انجام می‌شود.</p>
        )}
      </div>
      <div className="text-[11px] leading-6 text-slate-500 dark:text-slate-400 flex items-start gap-2"><Globe2 className="w-4 h-4 shrink-0 mt-0.5" /> جستجو و ورود حساب در یوتیوب رسمی/مرورگر انجام می‌شود؛ پس از برگشت به هم‌صدا، لینک ویدئو را اینجا بچسبان. ویدئوهایی که صاحبشان پخش در سایت‌های دیگر را بسته باشد، داخل برنامه قابل پخش نیستند.</div>
    </section>
  );
};
