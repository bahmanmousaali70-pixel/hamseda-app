import React, {useEffect, useRef, useState} from 'react';
import {Headphones, Loader2, Play, Podcast, Search, ExternalLink} from 'lucide-react';
import {apiUrl, safeReadJsonResponse} from '../services/apiConfig';

interface PodcastEpisode { title: string; audioUrl: string; publishedAt?: string; description?: string; }
interface PodcastItem {
  id: string; title: string; author: string; artworkUrl: string; feedUrl: string;
  externalUrl: string; category: string; episodes: PodcastEpisode[];
}
interface PodcastSearchResponse { podcasts?: PodcastItem[]; error?: string; }

export const PodcastLibraryView: React.FC<{isOnline: boolean; onStatusToast: (message: string) => void; searchTrigger?: {query?: string; nonce: number} | null; stopTrigger?: number | null}> = ({isOnline, onStatusToast, searchTrigger, stopTrigger}) => {
  const [query, setQuery] = useState('پادکست فارسی');
  const [busy, setBusy] = useState(false);
  const [podcasts, setPodcasts] = useState<PodcastItem[]>([]);
  const [selected, setSelected] = useState<{podcast: PodcastItem; episode: PodcastEpisode} | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const search = async (value = query) => {
    const term = value.trim();
    if (!term) { onStatusToast('نام یا موضوع پادکست را وارد کن.'); return; }
    if (!isOnline) { onStatusToast('برای جستجوی پادکست‌های تازه اتصال اینترنت لازم است.'); return; }
    setBusy(true);
    try {
      const response = await fetch(apiUrl('/api/podcast-search'), {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({query: term}),
      });
      const parsed = await safeReadJsonResponse<PodcastSearchResponse>(response);
      if (!response.ok || parsed.isHtml || !parsed.data) throw new Error(parsed.data?.error || 'پاسخ نامعتبر از سرویس پادکست دریافت شد.');
      const found = Array.isArray(parsed.data.podcasts) ? parsed.data.podcasts : [];
      setPodcasts(found);
      onStatusToast(found.length ? found.length + ' پادکست پیدا شد؛ قسمت‌ها را باز کن و پخش کن.' : 'پادکستی با این عبارت پیدا نشد.');
    } catch (error) {
      onStatusToast(error instanceof Error ? error.message : 'جستجوی پادکست انجام نشد.');
    } finally { setBusy(false); }
  };

  const lastTriggerRef = useRef(0);
  useEffect(() => {
    if (!searchTrigger || searchTrigger.nonce === lastTriggerRef.current) return;
    lastTriggerRef.current = searchTrigger.nonce;
    const requested = searchTrigger.query?.trim() || 'پادکست فارسی';
    setQuery(requested);
    void search(requested);
  }, [searchTrigger]);

  useEffect(() => {
    if (stopTrigger && audioRef.current) audioRef.current.pause();
  }, [stopTrigger]);

  const playEpisode = (podcast: PodcastItem, episode: PodcastEpisode) => {
    const audio = audioRef.current;
    if (!audio) return;
    setSelected({podcast, episode});
    audio.src = episode.audioUrl;
    audio.load();
    void audio.play().catch(() => onStatusToast('این قسمت از منبع اصلی پخش نشد؛ قسمت دیگری را امتحان کن.'));
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8 space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Podcast className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /><span>جستجوی کاتالوگ پادکست و دریافت قسمت‌ها از RSS ناشر</span></div>
      <div><h2 className="text-xl font-extrabold text-slate-900 dark:text-white">کتابخانه پادکست‌ها</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">پادکست فارسی یا موضوع دلخواهت را جستجو کن؛ قسمت‌های دارای فایل صوتی مستقیم برای پخش نمایش داده می‌شوند.</p></div>
      <form onSubmit={(event) => {event.preventDefault(); void search();}} className="flex gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً تاریخ ایران، داستان، فناوری، رادیو راه..." className="min-w-0 flex-1 min-h-[46px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white" />
        <button type="submit" disabled={busy} className="min-h-[46px] px-4 rounded-xl bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}جستجو</button>
      </form>
      <div className="flex flex-wrap gap-2">{['پادکست فارسی','تاریخ ایران','کتاب صوتی فارسی','طنز فارسی','فناوری'].map((item) => <button key={item} type="button" disabled={busy} onClick={() => {setQuery(item); void search(item);}} className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#0B1312] border border-slate-200 dark:border-emerald-900 text-xs text-slate-700 dark:text-slate-200">{item}</button>)}</div>
      {selected && <div className="rounded-xl bg-emerald-950 text-white p-4 space-y-1"><div className="text-xs text-emerald-200">در حال پخش</div><div className="font-bold text-sm">{selected.episode.title}</div><div className="text-xs text-emerald-100/80">{selected.podcast.title}</div></div>}
      <audio ref={audioRef} controls className="w-full" preload="none" />
      {podcasts.length > 0 ? <div className="space-y-4">{podcasts.map((podcast) => (
        <article key={podcast.id} className="rounded-xl border border-slate-200 dark:border-emerald-900/70 p-4 space-y-3">
          <div className="flex items-center gap-3">
            {podcast.artworkUrl ? <img src={podcast.artworkUrl} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center"><Headphones className="w-6 h-6 text-emerald-700" /></div>}
            <div className="min-w-0 flex-1"><h3 className="font-bold text-sm text-slate-900 dark:text-white">{podcast.title}</h3><p className="text-xs text-slate-500 dark:text-slate-400">{podcast.author}{podcast.category ? ' · ' + podcast.category : ''}</p></div>
            <a href={podcast.externalUrl} target="_blank" rel="noopener noreferrer" aria-label="صفحه پادکست" className="p-2 text-emerald-700"><ExternalLink className="w-4 h-4" /></a>
          </div>
          {podcast.episodes.length ? <div className="divide-y divide-slate-100 dark:divide-emerald-950">{podcast.episodes.map((episode, index) => (
            <div key={podcast.id + '-' + index} className="py-2.5 flex items-center gap-3">
              <button type="button" onClick={() => playEpisode(podcast, episode)} aria-label="پخش قسمت" className="w-9 h-9 shrink-0 rounded-full bg-emerald-700 text-white flex items-center justify-center"><Play className="w-4 h-4" /></button>
              <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-800 dark:text-slate-100">{episode.title}</div>{episode.publishedAt && <div className="text-[11px] text-slate-500">{episode.publishedAt}</div>}</div>
            </div>
          ))}</div> : <p className="text-xs text-slate-500">فید پیدا شد، اما قسمت دارای فایل صوتی مستقیم در دسترس نبود.</p>}
        </article>
      ))}</div> : <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">برای شروع، یک موضوع یا نام پادکست را جستجو کن.</div>}
    </section>
  );
};
