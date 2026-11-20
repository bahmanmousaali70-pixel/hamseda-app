import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ChevronDown, ChevronUp, ExternalLink, Headphones, Loader2, Play, Podcast, Search} from 'lucide-react';
import {apiUrl, safeReadJsonResponse} from '../services/apiConfig';

interface PodcastEpisode {
  title: string;
  audioUrl: string;
  publishedAt?: string;
  description?: string;
}
interface PodcastItem {
  id: string;
  title: string;
  author: string;
  artworkUrl: string;
  feedUrl: string;
  externalUrl: string;
  category: string;
  episodes: PodcastEpisode[];
  otherEpisodes?: PodcastEpisode[];
  totalFeedEpisodes?: number;
}
interface PodcastSearchResponse { podcasts?: PodcastItem[]; error?: string; }

const CATEGORY_ORDER = [
  'همه', 'کتاب و کتاب صوتی', 'داستان و رمان', 'تاریخ',
  'هنر و ادبیات', 'فناوری', 'آموزش', 'طنز و سرگرمی', 'عمومی',
];

export const PodcastLibraryView: React.FC<{
  isOnline: boolean;
  onStatusToast: (message: string) => void;
  searchTrigger?: {query?: string; nonce: number} | null;
  stopTrigger?: number | null;
}> = ({isOnline, onStatusToast, searchTrigger, stopTrigger}) => {
  const [query, setQuery] = useState('پادکست فارسی');
  const [busy, setBusy] = useState(false);
  const [podcasts, setPodcasts] = useState<PodcastItem[]>([]);
  const [selected, setSelected] = useState<{podcast: PodcastItem; episode: PodcastEpisode} | null>(null);
  const [activeCategory, setActiveCategory] = useState('همه');
  const [quickFilter, setQuickFilter] = useState('');
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [showOther, setShowOther] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTriggerRef = useRef(0);

  const search = async (value = query) => {
    const term = value.trim();
    if (!term) { onStatusToast('نام یا موضوع پادکست را وارد کن.'); return; }
    if (!isOnline) { onStatusToast('برای جستجوی پادکست‌های تازه اتصال اینترنت لازم است.'); return; }
    setBusy(true);
    try {
      const response = await fetch(apiUrl('/api/podcast-search'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({query: term}),
      });
      const parsed = await safeReadJsonResponse<PodcastSearchResponse>(response);
      if (!response.ok || parsed.isHtml || !parsed.data) {
        throw new Error(parsed.data?.error || 'پاسخ نامعتبر از سرویس پادکست دریافت شد.');
      }
      const found = Array.isArray(parsed.data.podcasts) ? parsed.data.podcasts : [];
      setPodcasts(found);
      setActiveCategory('همه');
      setQuickFilter('');
      setOpenIds(found.slice(0, 1).map((item) => item.id));
      setShowOther([]);
      onStatusToast(found.length
        ? found.length + ' مجموعه پیدا شد؛ نتایج بر اساس موضوع دسته‌بندی شدند.'
        : 'مجموعه یا قسمت مرتبطی با این عبارت پیدا نشد.');
    } catch (error) {
      onStatusToast(error instanceof Error ? error.message : 'جستجوی پادکست انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

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

  const categories = useMemo(() => {
    const available = new Set(podcasts.map((item) => item.category || 'عمومی'));
    return CATEGORY_ORDER.filter((item) => item === 'همه' || available.has(item));
  }, [podcasts]);

  const visiblePodcasts = useMemo(() => {
    const filter = quickFilter.trim().toLocaleLowerCase('fa');
    return podcasts.filter((podcast) => {
      if (activeCategory !== 'همه' && (podcast.category || 'عمومی') !== activeCategory) return false;
      if (!filter) return true;
      const text = [podcast.title, podcast.author, podcast.category,
        ...podcast.episodes.map((episode) => episode.title)].join(' ').toLocaleLowerCase('fa');
      return text.includes(filter);
    });
  }, [podcasts, activeCategory, quickFilter]);

  const playEpisode = (podcast: PodcastItem, episode: PodcastEpisode) => {
    const audio = audioRef.current;
    if (!audio) return;
    setSelected({podcast, episode});
    audio.src = episode.audioUrl;
    audio.load();
    void audio.play().catch(() => onStatusToast('این قسمت از منبع اصلی پخش نشد؛ قسمت دیگری را امتحان کن.'));
  };

  const toggleOpen = (id: string) => {
    setOpenIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const toggleOther = (id: string) => {
    setShowOther((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const allOpen = visiblePodcasts.length > 0 && visiblePodcasts.every((item) => openIds.includes(item.id));

  return (
    <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-5 sm:p-8 space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Podcast className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
        <span>جستجوی مجموعه‌ها و قسمت‌های صوتی از فید ناشر</span>
      </div>
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">کتابخانه پادکست و کتاب صوتی</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
          نتایج مرتبط را در مجموعه‌های جدا ببین؛ قسمت‌های موضوعات دیگر هر کانال هم جداگانه قابل مشاهده‌اند.
        </p>
      </div>

      <form onSubmit={(event) => {event.preventDefault(); void search();}} className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="مثلاً کتاب فارسی بامداد خمار، تاریخ ایران، داستان..."
          className="min-w-0 flex-1 min-h-[46px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <button type="submit" disabled={busy} className="min-h-[46px] px-4 rounded-xl bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}جستجو
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {['پادکست فارسی', 'کتاب صوتی فارسی', 'تاریخ ایران', 'طنز فارسی', 'فناوری'].map((item) => (
          <button key={item} type="button" disabled={busy} onClick={() => {setQuery(item); void search(item);}}
            className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#0B1312] border border-slate-200 dark:border-emerald-900 text-xs text-slate-700 dark:text-slate-200">
            {item}
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-xl bg-emerald-950 text-white p-4 space-y-1">
          <div className="text-xs text-emerald-200">در حال پخش</div>
          <div className="font-bold text-sm">{selected.episode.title}</div>
          <div className="text-xs text-emerald-100/80">{selected.podcast.title}</div>
        </div>
      )}
      <audio ref={audioRef} controls className="w-full" preload="none" />

      {podcasts.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">دسته‌بندی نتایج</div>
            <button type="button" onClick={() => setOpenIds(allOpen ? [] : visiblePodcasts.map((item) => item.id))}
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {allOpen ? 'بستن همه مجموعه‌ها' : 'باز کردن همه مجموعه‌ها'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button key={category} type="button" onClick={() => setActiveCategory(category)}
                className={'px-3 py-2 rounded-full text-xs font-semibold border transition-colors ' +
                  (activeCategory === category
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-slate-50 dark:bg-[#0B1312] border-slate-200 dark:border-emerald-900 text-slate-600 dark:text-slate-300')}>
                {category}{category === 'همه' ? ' (' + podcasts.length + ')' : ' (' + podcasts.filter((item) => (item.category || 'عمومی') === category).length + ')'}
              </button>
            ))}
          </div>
          <input value={quickFilter} onChange={(event) => setQuickFilter(event.target.value)}
            placeholder="فیلتر سریع بین نام مجموعه‌ها و قسمت‌های مرتبط..."
            className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white" />
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {visiblePodcasts.length} مجموعه در این دسته · {visiblePodcasts.reduce((sum, item) => sum + item.episodes.length, 0)} قسمت مرتبط
          </div>
        </div>
      )}

      {podcasts.length > 0 ? (
        visiblePodcasts.length > 0 ? (
          <div className="space-y-3">
            {visiblePodcasts.map((podcast) => {
              const isOpen = openIds.includes(podcast.id);
              const otherOpen = showOther.includes(podcast.id);
              return (
                <article key={podcast.id} className="rounded-xl border border-slate-200 dark:border-emerald-900/70 overflow-hidden">
                  <button type="button" onClick={() => toggleOpen(podcast.id)}
                    className="w-full p-4 flex items-center gap-3 text-right">
                    {podcast.artworkUrl
                      ? <img src={podcast.artworkUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                      : <div className="w-14 h-14 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0"><Headphones className="w-6 h-6 text-emerald-700" /></div>}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">{podcast.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{podcast.author}{podcast.category ? ' · ' + podcast.category : ''}</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                        {podcast.episodes.length} قسمت مرتبط{podcast.totalFeedEpisodes ? ' از ' + podcast.totalFeedEpisodes + ' قسمت فید' : ''}
                      </p>
                    </div>
                    <span className="text-emerald-700 dark:text-emerald-400">{isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="flex justify-end">
                        <a href={podcast.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          صفحه ناشر <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      {podcast.episodes.length > 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-emerald-950">
                          {podcast.episodes.map((episode, index) => (
                            <div key={podcast.id + '-' + episode.audioUrl + '-' + index} className="py-2.5 flex items-center gap-3">
                              <button type="button" onClick={() => playEpisode(podcast, episode)} aria-label="پخش قسمت"
                                className="w-9 h-9 shrink-0 rounded-full bg-emerald-700 text-white flex items-center justify-center">
                                <Play className="w-4 h-4" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{episode.title}</div>
                                {episode.publishedAt && <div className="text-[11px] text-slate-500">{episode.publishedAt}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-slate-500">قسمت مرتبطی در این فید پیدا نشد.</p>}

                      {(podcast.otherEpisodes?.length ?? 0) > 0 && (
                        <div className="border-t border-slate-100 dark:border-emerald-950 pt-3">
                          <button type="button" onClick={() => toggleOther(podcast.id)}
                            className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                            {otherOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            نمایش سایر قسمت‌های این کانال (موضوعات دیگر) · {podcast.otherEpisodes?.length}
                          </button>
                          {otherOpen && (
                            <div className="mt-2 divide-y divide-slate-100 dark:divide-emerald-950">
                              {podcast.otherEpisodes?.map((episode, index) => (
                                <div key={podcast.id + '-other-' + index} className="py-2.5 flex items-center gap-3">
                                  <button type="button" onClick={() => playEpisode(podcast, episode)} aria-label="پخش قسمت دیگر"
                                    className="w-8 h-8 shrink-0 rounded-full bg-slate-200 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 flex items-center justify-center">
                                    <Play className="w-3.5 h-3.5" />
                                  </button>
                                  <div className="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300">{episode.title}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : <div className="py-8 text-center text-sm text-slate-500">در این دسته یا با این فیلتر نتیجه‌ای پیدا نشد.</div>
      ) : (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">برای شروع، یک موضوع یا نام پادکست را جستجو کن.</div>
      )}
    </section>
  );
};
