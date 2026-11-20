import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ExternalLink, Film, Maximize, Play, Search, Tv, Youtube} from 'lucide-react';

type RecentItem = {url: string; title: string; playedAt: number};
const STORAGE_KEY = 'hamseda_cinema_recent_v1';

function getYouTubeId(input: string): string | null {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname.endsWith('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || null;
    if (/(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$/.test(url.hostname)) {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'live', 'shorts'].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

function isWebVideoUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export const CinemaProjectorView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [activeUrl, setActiveUrl] = useState('');
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [playerError, setPlayerError] = useState('');
  const playerShellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const youtubeId = useMemo(() => getYouTubeId(activeUrl), [activeUrl]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setRecent(JSON.parse(saved) as RecentItem[]);
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, 12)));
    } catch {
      // Local history is optional; playback must continue if storage is unavailable.
    }
  }, [recent]);

  const playUrl = (value: string) => {
    const clean = value.trim();
    if (!isWebVideoUrl(clean) && !getYouTubeId(clean)) {
      setPlayerError('لینک معتبر http یا https، یا لینک یوتیوب وارد کن.');
      return;
    }
    setPlayerError('');
    setSourceUrl(clean);
    setActiveUrl(clean);
    setRecent((items) => [
      {url: clean, title: getYouTubeId(clean) ? 'ویدئوی یوتیوب' : new URL(clean).hostname, playedAt: Date.now()},
      ...items.filter((item) => item.url !== clean),
    ].slice(0, 12));
  };

  const openYouTubeSearch = () => {
    const term = query.trim() || 'فیلم سینمایی رایگان دوبله فارسی کانال رسمی';
    const search = `${term} فیلم کامل منتشر شده توسط کانال رسمی`;
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(search)}`, '_blank', 'noopener,noreferrer');
  };

  const openFullscreen = async () => {
    try {
      await playerShellRef.current?.requestFullscreen?.();
    } catch {
      setPlayerError('تمام‌صفحه در این مرورگر پشتیبانی نمی‌شود؛ از دکمه تمام‌صفحه خود پخش‌کننده استفاده کن.');
    }
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
          <Film className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><Tv className="w-3.5 h-3.5" /> سینمای خانگی و پروژکتور</div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">سینمای هم‌صدا</h2>
        </div>
      </header>

      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/20 p-3 text-xs leading-6 text-emerald-950 dark:text-emerald-100">
        بهترین روش برای پروژکتور اندرویدی شما نصب APK هم‌صدا روی خود پروژکتور و پخش مستقیم فیلم است؛ در این حالت گوشی لازم نیست روشن بماند. این نسخه اولیه پخش مستقیم لینک‌های عمومی و ویدئوهای مجازِ قابل‌جاسازی را فراهم می‌کند.
      </div>

      <form onSubmit={(event) => {event.preventDefault(); openYouTubeSearch();}} className="flex gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام فیلم یا سریال، دوبله فارسی، زیرنویس..." className="min-w-0 flex-1 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white" />
        <button type="submit" className="min-h-[44px] px-3 rounded-xl bg-red-600 text-white flex items-center gap-1.5"><Search className="w-4 h-4" /><span className="text-xs">جستجو</span></button>
      </form>
      <button type="button" onClick={openYouTubeSearch} className="w-full text-right rounded-xl border border-red-200 dark:border-red-950 bg-red-50 dark:bg-red-950/20 p-3 flex items-center gap-3">
        <Youtube className="w-6 h-6 text-red-600 shrink-0" />
        <span className="flex-1"><span className="block text-sm font-bold text-slate-900 dark:text-white">جستجو در یوتیوب</span><span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">آثار رایگان منتشرشده از کانال‌های رسمی و صاحبان محتوا را انتخاب کن</span></span>
        <ExternalLink className="w-4 h-4 text-slate-500" />
      </button>

      <form onSubmit={(event) => {event.preventDefault(); playUrl(sourceUrl);}} className="space-y-2">
        <label className="block text-sm font-semibold text-slate-900 dark:text-white">پخش لینک مستقیم یا ویدئوی قابل‌جاسازی</label>
        <div className="flex gap-2">
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} dir="ltr" placeholder="https://… (MP4 / WebM / HLS / YouTube)" className="min-w-0 flex-1 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white" />
          <button type="submit" className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"><Play className="w-4 h-4" /> پخش</button>
        </div>
      </form>

      {playerError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{playerError}</p>}

      {activeUrl && (
        <div className="space-y-2">
          <div ref={playerShellRef} className="relative aspect-video overflow-hidden rounded-xl bg-black">
            {youtubeId ? (
              <iframe title="پخش ویدئو در سینمای هم‌صدا" src={`https://www.youtube-nocookie.com/embed/${youtubeId}?playsinline=1&rel=0`} className="w-full h-full" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            ) : (
              <video ref={videoRef} key={activeUrl} src={activeUrl} controls playsInline preload="metadata" className="w-full h-full" onError={() => setPlayerError('این لینک در پخش‌کننده داخلی باز نشد؛ ممکن است لینک مستقیم نباشد یا سرور اجازه پخش از برنامه‌های دیگر را ندهد.')} />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openFullscreen} className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-emerald-900 text-xs flex items-center gap-2"><Maximize className="w-4 h-4" /> تمام‌صفحه</button>
            <button type="button" onClick={() => window.open(activeUrl, '_blank', 'noopener,noreferrer')} className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-emerald-900 text-xs flex items-center gap-2"><ExternalLink className="w-4 h-4" /> بازکردن در پخش‌کننده دیگر</button>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">آخرین ویدئوها</h3>
          <div className="grid gap-2">
            {recent.map((item) => (
              <button key={item.url} type="button" onClick={() => playUrl(item.url)} className="min-h-[42px] px-3 rounded-lg border border-slate-200 dark:border-emerald-900 text-right text-xs flex items-center gap-2">
                <Play className="w-3.5 h-3.5 text-emerald-600 shrink-0" /><span className="flex-1 truncate" dir="auto">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] leading-6 text-slate-500 dark:text-slate-400">فیلیمو و سرویس‌های اشتراکی فقط از مسیر رسمی و با اشتراک معتبر قابل تماشا هستند. هم‌صدا دسترسی پولی، DRM یا محدودیت پخش را دور نمی‌زند. پشتیبانی Miracast / Chromecast / DLNA و کنترل موبایل-پروژکتور نیازمند پیاده‌سازی و آزمایش جداگانه روی مدل پروژکتور است؛ هنوز در این نسخه فعال نیست.</p>
    </section>
  );
};
