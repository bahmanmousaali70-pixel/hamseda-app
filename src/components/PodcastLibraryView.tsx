import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  Headphones,
  LayoutGrid,
  Loader2,
  Pause,
  Play,
  Podcast,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {toPersianDigits} from '../data/persianLibrary';
import {apiUrl, safeReadJsonResponse} from '../services/apiConfig';
import {SearchArtworkGrid, type SearchArtworkItem} from './SearchArtworkGrid';

interface PodcastEpisode {
  title: string;
  audioUrl: string;
  publishedAt?: string;
  description?: string;
  duration?: string;
}

interface PodcastItem {
  id: string;
  title: string;
  author: string;
  artworkUrl: string;
  feedUrl: string;
  externalUrl: string;
  category: string;
  totalEpisodes?: number;
  totalFeedEpisodes?: number;
  matchedCount?: number;
  episodes: PodcastEpisode[];
  otherEpisodes?: PodcastEpisode[];
}

interface PodcastSearchResponse {
  query?: string;
  coreQuery?: string;
  podcasts?: PodcastItem[];
  error?: string;
}

interface SavedPodcastProgress {
  podcast: PodcastItem;
  episode: PodcastEpisode;
  currentTime: number;
  updatedAt: number;
}

const PODCAST_PROGRESS_KEY = 'rmz_podcast_progress_v1';

const CATEGORY_FA_MAP: Record<string, string> = {
  fiction: 'داستان و رمان',
  literature: 'ادبیات و کتاب',
  books: 'کتاب',
  arts: 'هنر و ادبیات',
  history: 'تاریخ',
  technology: 'فناوری',
  comedy: 'طنز و کمدی',
  education: 'آموزش',
  'society & culture': 'جامعه و فرهنگ',
  'religion & spirituality': 'معنویت و اندیشه',
  business: 'کسب‌وکار',
  science: 'علم و دانش',
  news: 'خبر و تحلیل',
  'kids & family': 'کودک و خانواده',
  'tv & film': 'فیلم و سینما',
  music: 'موسیقی',
  'health & fitness': 'سلامت',
  sports: 'ورزش',
  'true crime': 'پرونده جنایی',
  government: 'سیاست و اجتماع',
  leisure: 'سرگرمی',
};

function translateCategoryLabel(category: string): string {
  const clean = category.trim();
  if (!clean) return 'سایر';
  return CATEGORY_FA_MAP[clean.toLowerCase()] || clean;
}

function normalizeSearchFa(value: string): string {
  return value
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[\u200c\u200f\u064b-\u065f\u0670]/g, ' ')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPlaybackClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '۰۰:۰۰';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${toPersianDigits(String(hrs))}:${toPersianDigits(String(mins).padStart(2, '0'))}:${toPersianDigits(String(secs).padStart(2, '0'))}`;
  }
  return `${toPersianDigits(String(mins).padStart(2, '0'))}:${toPersianDigits(String(secs).padStart(2, '0'))}`;
}

export const PodcastLibraryView: React.FC<{
  isOnline: boolean;
  onStatusToast: (message: string) => void;
  searchTrigger?: {query?: string; nonce: number} | null;
  stopTrigger?: number | null;
}> = ({isOnline, onStatusToast, searchTrigger, stopTrigger}) => {
  const [query, setQuery] = useState('پادکست فارسی');
  const [coreQuery, setCoreQuery] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [podcasts, setPodcasts] = useState<PodcastItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [episodeFilter, setEpisodeFilter] = useState<string>('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [showOtherIds, setShowOtherIds] = useState<Record<string, boolean>>({});
  const [showVisualGrid, setShowVisualGrid] = useState<boolean>(true);
  const [savedProgress, setSavedProgress] = useState<SavedPodcastProgress | null>(() => {
    try {
      const raw = localStorage.getItem(PODCAST_PROGRESS_KEY);
      return raw ? (JSON.parse(raw) as SavedPodcastProgress) : null;
    } catch {
      return null;
    }
  });
  const [selected, setSelected] = useState<{podcast: PodcastItem; episode: PodcastEpisode} | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const usedProxyRef = useRef(false);
  const pendingResumeTimeRef = useRef<number>(0);
  const lastSavedStampRef = useRef<number>(0);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const persistProgress = useCallback(
    (podcast: PodcastItem, episode: PodcastEpisode, currentTime: number) => {
      const entry: SavedPodcastProgress = {
        podcast,
        episode,
        currentTime: Math.max(0, Math.floor(currentTime)),
        updatedAt: Date.now(),
      };
      setSavedProgress(entry);
      try {
        localStorage.setItem(PODCAST_PROGRESS_KEY, JSON.stringify(entry));
      } catch {
        // ignore storage quota errors
      }
    },
    []
  );

  const search = async (value = query) => {
    const term = value.trim();
    if (!term) {
      onStatusToast('نام یا موضوع پادکست را وارد کن.');
      return;
    }
    if (!isOnline) {
      onStatusToast('برای جستجوی پادکست‌های تازه اتصال اینترنت لازم است.');
      return;
    }
    setBusy(true);
    try {
      const endpoints = [
        ...new Set([
          apiUrl('/api/podcast-search'),
          'https://hamseda-app.ai.studio/api/podcast-search',
        ]),
      ];
      let response: Response | null = null;
      let lastNetworkError: unknown = null;
      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        try {
          const candidate = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({query: term}),
            signal: controller.signal,
          });
          response = candidate;
          if (candidate.status === 404) continue;
          break;
        } catch (networkError) {
          lastNetworkError = networkError;
        } finally {
          clearTimeout(timer);
        }
      }
      if (!response || response.status === 404) {
        throw new Error(
          lastNetworkError
            ? 'ارتباط با سرور پادکست برقرار نشد. ممکن است سرویس هنوز منتشر نشده باشد یا اتصال سرور قطع باشد.'
            : 'مسیر جستجوی پادکست روی سرور پیدا نشد؛ سرور هم‌صدا باید به‌روزرسانی شود.'
        );
      }
      const parsed = await safeReadJsonResponse<PodcastSearchResponse>(response);
      if (!response.ok || parsed.isHtml || !parsed.data) {
        throw new Error(parsed.data?.error || 'پاسخ نامعتبر از سرویس پادکست دریافت شد.');
      }
      const found = Array.isArray(parsed.data.podcasts) ? parsed.data.podcasts : [];
      setPodcasts(found);
      setCoreQuery(parsed.data.coreQuery?.trim() || '');
      setSelectedCategory('all');
      setEpisodeFilter('');
      setShowOtherIds({});
      const firstPlayable = found.find((p) => p.episodes.length > 0);
      setExpandedIds(firstPlayable ? {[firstPlayable.id]: true} : {});
      onStatusToast(
        found.length
          ? `${toPersianDigits(found.length)} مجموعه پیدا شد؛ روی هر مجموعه بزن تا قسمت‌های مرتبط باز شود.`
          : 'پادکستی با این عبارت پیدا نشد.'
      );
    } catch (error) {
      onStatusToast(error instanceof Error ? error.message : 'جستجوی پادکست انجام نشد.');
    } finally {
      setBusy(false);
    }
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
    if (stopTrigger && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setIsLoadingAudio(false);
    }
  }, [stopTrigger]);

  const startEpisodePlayback = (
    podcast: PodcastItem,
    episode: PodcastEpisode,
    resumeFromSec = 0
  ) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (selected?.episode.audioUrl === episode.audioUrl && resumeFromSec === 0) {
      if (isPlaying) {
        audio.pause();
        return;
      }
      if (audio.src) {
        setIsLoadingAudio(true);
        void audio.play().catch(() => {
          setIsLoadingAudio(false);
          onStatusToast('امکان ادامه پخش نبود؛ دوباره تلاش کن.');
        });
        return;
      }
    }

    const alreadyProxied = episode.audioUrl.startsWith('/api/audio-proxy');
    const resolvedSrc = episode.audioUrl.startsWith('/api/')
      ? apiUrl(episode.audioUrl)
      : episode.audioUrl;

    usedProxyRef.current = alreadyProxied;
    pendingResumeTimeRef.current = resumeFromSec > 2 ? resumeFromSec : 0;
    setSelected({podcast, episode});
    setIsLoadingAudio(true);
    setIsPlaying(false);

    audio.src = resolvedSrc;
    audio.load();
    void audio.play().catch(() => {
      if (!usedProxyRef.current && !alreadyProxied) {
        usedProxyRef.current = true;
        audio.src = apiUrl(`/api/audio-proxy?url=${encodeURIComponent(episode.audioUrl)}`);
        audio.load();
        void audio.play().catch(() => {
          setIsLoadingAudio(false);
          setIsPlaying(false);
          onStatusToast('این قسمت از منبع اصلی پخش نشد؛ قسمت دیگری را امتحان کن.');
        });
      } else {
        setIsLoadingAudio(false);
        setIsPlaying(false);
        onStatusToast('این قسمت از منبع اصلی پخش نشد؛ قسمت دیگری را امتحان کن.');
      }
    });
  };

  const handleAudioError = () => {
    const audio = audioRef.current;
    if (!selected || !audio) return;
    const rawUrl = selected.episode.audioUrl;
    const alreadyProxied = rawUrl.startsWith('/api/audio-proxy');
    if (!usedProxyRef.current && !alreadyProxied) {
      usedProxyRef.current = true;
      audio.src = apiUrl(`/api/audio-proxy?url=${encodeURIComponent(rawUrl)}`);
      audio.load();
      void audio.play().catch(() => {
        setIsLoadingAudio(false);
        setIsPlaying(false);
        onStatusToast('پخش این قسمت از پادکست با خطا مواجه شد.');
      });
      return;
    }
    setIsLoadingAudio(false);
    setIsPlaying(false);
    onStatusToast('پخش این قسمت از منبع اصلی در دسترس نبود.');
  };

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!selected) return;
    try {
      if (typeof MediaMetadata !== 'undefined') {
        ms.metadata = new MediaMetadata({
          title: selected.episode.title,
          artist: selected.podcast.author || selected.podcast.title,
          album: selected.podcast.title,
          artwork: selected.podcast.artworkUrl
            ? [{src: selected.podcast.artworkUrl, sizes: '512x512', type: 'image/jpeg'}]
            : undefined,
        });
      }
      ms.playbackState = isPlaying ? 'playing' : 'paused';
      ms.setActionHandler('play', () => {
        void audioRef.current?.play();
      });
      ms.setActionHandler('pause', () => {
        audioRef.current?.pause();
      });
      ms.setActionHandler('seekbackward', (details) => {
        const el = audioRef.current;
        if (el) el.currentTime = Math.max(0, el.currentTime - (details.seekOffset || 15));
      });
      ms.setActionHandler('seekforward', (details) => {
        const el = audioRef.current;
        if (el) el.currentTime = Math.min(el.duration || el.currentTime + 30, el.currentTime + (details.seekOffset || 30));
      });
      ms.setActionHandler('stop', () => {
        audioRef.current?.pause();
        setIsPlaying(false);
      });
    } catch {
      // ignore unsupported MediaSession handlers
    }
  }, [selected, isPlaying]);

  const categoryTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of podcasts) {
      const label = translateCategoryLabel(p.category || '');
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, count]) => ({label, count}));
  }, [podcasts]);

  const filteredPodcasts = useMemo(() => {
    const filterNorm = normalizeSearchFa(episodeFilter);
    return podcasts
      .filter((p) => selectedCategory === 'all' || translateCategoryLabel(p.category || '') === selectedCategory)
      .map((podcast) => {
        const otherList = podcast.otherEpisodes ?? [];
        if (!filterNorm) {
          return {
            podcast,
            visibleEpisodes: podcast.episodes,
            visibleOthers: otherList,
          };
        }
        const showMatches =
          normalizeSearchFa(podcast.title).includes(filterNorm) ||
          normalizeSearchFa(podcast.author).includes(filterNorm);
        if (showMatches) {
          return {
            podcast,
            visibleEpisodes: podcast.episodes,
            visibleOthers: otherList,
          };
        }
        const matchingPrimary = podcast.episodes.filter((ep) =>
          normalizeSearchFa(ep.title).includes(filterNorm)
        );
        const matchingOthers = otherList.filter((ep) =>
          normalizeSearchFa(ep.title).includes(filterNorm)
        );
        return {
          podcast,
          visibleEpisodes: matchingPrimary,
          visibleOthers: matchingOthers,
        };
      })
      .filter(({visibleEpisodes, visibleOthers}) =>
        !filterNorm ? true : visibleEpisodes.length > 0 || visibleOthers.length > 0
      );
  }, [podcasts, selectedCategory, episodeFilter]);

  const allExpanded =
    filteredPodcasts.length > 0 && filteredPodcasts.every(({podcast}) => Boolean(expandedIds[podcast.id]));

  const toggleAllExpanded = () => {
    if (allExpanded) {
      setExpandedIds({});
    } else {
      const next: Record<string, boolean> = {};
      for (const {podcast} of filteredPodcasts) next[podcast.id] = true;
      setExpandedIds(next);
    }
  };

  const artworkGridItems: SearchArtworkItem[] = useMemo(
    () =>
      filteredPodcasts.map(({podcast, visibleEpisodes}) => {
        const matchedCount = podcast.matchedCount ?? 0;
        const categoryFa = podcast.category ? translateCategoryLabel(podcast.category) : '';
        const countLabel =
          matchedCount > 0
            ? `${toPersianDigits(visibleEpisodes.length)} قسمت مرتبط`
            : `${toPersianDigits(visibleEpisodes.length)} قسمت`;
        const metaParts = [categoryFa, countLabel].filter(Boolean);
        const isPodcastSelected = selected?.podcast.id === podcast.id;
        return {
          id: podcast.id,
          title: podcast.title,
          subtitle: podcast.author || 'ناشر پادکست',
          metaText: metaParts.join(' · '),
          artworkUrl: podcast.artworkUrl,
          externalUrl: podcast.externalUrl,
          kind: 'podcast',
          isActive: Boolean(expandedIds[podcast.id]) || isPodcastSelected,
          isPlaying: isPodcastSelected && isPlaying,
          isLoading: isPodcastSelected && isLoadingAudio,
        };
      }),
    [filteredPodcasts, selected, expandedIds, isPlaying, isLoadingAudio]
  );

  const focusPodcastFromGrid = (item: SearchArtworkItem) => {
    setExpandedIds((prev) => ({...prev, [item.id]: true}));
    requestAnimationFrame(() => {
      cardRefs.current[item.id]?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    });
  };

  const quickPlayPodcastFromGrid = (item: SearchArtworkItem) => {
    const entry = filteredPodcasts.find((f) => f.podcast.id === item.id);
    if (!entry) return;
    setExpandedIds((prev) => ({...prev, [item.id]: true}));
    if (selected?.podcast.id === entry.podcast.id) {
      startEpisodePlayback(selected.podcast, selected.episode);
      return;
    }
    const firstEp = entry.visibleEpisodes[0] ?? entry.visibleOthers[0];
    if (firstEp) {
      const resumeSaved =
        savedProgress?.episode.audioUrl === firstEp.audioUrl && savedProgress.currentTime > 5
          ? savedProgress.currentTime
          : 0;
      startEpisodePlayback(entry.podcast, firstEp, resumeSaved);
    } else {
      onStatusToast('قسمت صوتی مستقیم در این مجموعه موجود نبود.');
    }
  };

  const renderEpisodeRow = (podcast: PodcastItem, episode: PodcastEpisode, key: string) => {
    const isCurrent = selected?.episode.audioUrl === episode.audioUrl;
    const resumeSaved =
      !isCurrent &&
      savedProgress?.episode.audioUrl === episode.audioUrl &&
      savedProgress.currentTime > 5
        ? savedProgress.currentTime
        : 0;
    return (
      <div key={key} className="py-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => startEpisodePlayback(podcast, episode, resumeSaved)}
          aria-label={isCurrent && isPlaying ? 'توقف قسمت' : 'پخش قسمت'}
          className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer ${
            isCurrent && isPlaying
              ? 'bg-amber-400 text-slate-950'
              : 'bg-emerald-700 hover:bg-emerald-800 text-white'
          }`}
        >
          {isCurrent && isLoadingAudio ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isCurrent && isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{episode.title}</div>
          <div className="text-[11px] text-slate-500 flex flex-wrap gap-2">
            {episode.publishedAt && <span>{episode.publishedAt}</span>}
            {episode.duration && <span>· {episode.duration}</span>}
            {resumeSaved > 0 && (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                · ادامه از {formatPlaybackClock(resumeSaved)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8 space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Podcast className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
        <span>جستجوی دسته‌بندی‌شده پادکست و کتاب صوتی از فید مستقیم ناشر</span>
      </div>
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">کتابخانه پادکست و کتاب صوتی</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          عنوان کتاب صوتی، رمان یا پادکست را جستجو کن تا مجموعه‌ها و قسمت‌های مرتبط به‌صورت مرتب و دسته‌بندی‌شده نمایش داده شوند.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="مثلاً بامداد خمار، تاریخ ایران، داستان، رادیو راه..."
          className="min-w-0 flex-1 min-h-[46px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-[46px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60 cursor-pointer shrink-0"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span>جستجو</span>
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {['پادکست فارسی', 'بامداد خمار', 'تاریخ ایران', 'کتاب صوتی فارسی', 'طنز فارسی', 'فناوری'].map((item) => (
          <button
            key={item}
            type="button"
            disabled={busy}
            onClick={() => {
              setQuery(item);
              void search(item);
            }}
            className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#0B1312] border border-slate-200 dark:border-emerald-900 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {item}
          </button>
        ))}
      </div>

      {!selected && savedProgress && savedProgress.currentTime > 5 && (
        <div className="rounded-xl bg-slate-50 dark:bg-[#0B1312] border border-emerald-200 dark:border-emerald-900/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              ادامه آخرین قسمت ذخیره‌شده ({formatPlaybackClock(savedProgress.currentTime)})
            </div>
            <div className="font-bold text-sm text-slate-900 dark:text-white truncate mt-0.5">
              {savedProgress.episode.title}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {savedProgress.podcast.title}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              startEpisodePlayback(
                savedProgress.podcast,
                savedProgress.episode,
                savedProgress.currentTime
              )
            }
            className="min-h-[42px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
            <span>ادامه پخش</span>
          </button>
        </div>
      )}

      {selected && (
        <div className="rounded-xl bg-emerald-950 text-white p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-xs text-emerald-200">
              {isLoadingAudio ? 'در حال آماده‌سازی...' : isPlaying ? 'در حال پخش' : 'متوقف‌شده'}
            </div>
            <div className="font-bold text-sm truncate">{selected.episode.title}</div>
            <div className="text-xs text-emerald-100/80 truncate">{selected.podcast.title}</div>
          </div>
          <button
            type="button"
            onClick={() => startEpisodePlayback(selected.podcast, selected.episode)}
            aria-label={isPlaying ? 'توقف موقت' : 'ادامه پخش'}
            className="w-11 h-11 shrink-0 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center cursor-pointer"
          >
            {isLoadingAudio ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>
        </div>
      )}

      <audio
        ref={audioRef}
        controls
        className={selected ? 'w-full' : 'hidden'}
        preload="none"
        onLoadStart={() => setIsLoadingAudio(true)}
        onLoadedMetadata={() => {
          setIsLoadingAudio(false);
          const audio = audioRef.current;
          if (audio && pendingResumeTimeRef.current > 0) {
            const targetSec = pendingResumeTimeRef.current;
            pendingResumeTimeRef.current = 0;
            if (!Number.isFinite(audio.duration) || targetSec < audio.duration - 2) {
              audio.currentTime = targetSec;
            }
          }
        }}
        onCanPlay={() => setIsLoadingAudio(false)}
        onPlay={() => {
          setIsPlaying(true);
          setIsLoadingAudio(false);
        }}
        onPause={() => {
          setIsPlaying(false);
          const audio = audioRef.current;
          if (selected && audio && audio.currentTime > 3) {
            persistProgress(selected.podcast, selected.episode, audio.currentTime);
          }
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!selected || !audio || audio.currentTime <= 3) return;
          const now = Date.now();
          if (now - lastSavedStampRef.current >= 2500) {
            lastSavedStampRef.current = now;
            persistProgress(selected.podcast, selected.episode, audio.currentTime);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          if (selected) persistProgress(selected.podcast, selected.episode, 0);
        }}
        onError={handleAudioError}
      />

      {podcasts.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-950/70 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-bold text-slate-900 dark:text-white">
                  {toPersianDigits(filteredPodcasts.length)} مجموعه
                </span>
                {coreQuery && (
                  <span className="mr-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                    · موضوع: {coreQuery}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowVisualGrid((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    showVisualGrid
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white dark:bg-[#121E1C] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-emerald-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>{showVisualGrid ? 'پنهان‌کردن شبکه کاورها' : 'نمایش شبکه کاورها'}</span>
                </button>
                <button
                  type="button"
                  onClick={toggleAllExpanded}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                >
                  {allExpanded ? 'بستن همه مجموعه‌ها' : 'باز کردن همه مجموعه‌ها'}
                </button>
              </div>
            </div>

            {categoryTabs.length >= 2 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                    selectedCategory === 'all'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white dark:bg-[#121E1C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-emerald-900'
                  }`}
                >
                  همه ({toPersianDigits(podcasts.length)})
                </button>
                {categoryTabs.map((tab) => (
                  <button
                    key={tab.label}
                    type="button"
                    onClick={() => setSelectedCategory(tab.label)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                      selectedCategory === tab.label
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white dark:bg-[#121E1C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-emerald-900'
                    }`}
                  >
                    {tab.label} ({toPersianDigits(tab.count)})
                  </button>
                ))}
              </div>
            )}

            <div className="relative flex items-center">
              <Filter className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
              <input
                value={episodeFilter}
                onChange={(event) => setEpisodeFilter(event.target.value)}
                placeholder="فیلتر سریع بین نتایج و نام قسمت‌ها..."
                className="w-full min-h-[38px] pr-9 pl-9 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-xs text-slate-900 dark:text-white"
              />
              {episodeFilter && (
                <button
                  type="button"
                  onClick={() => setEpisodeFilter('')}
                  aria-label="پاک کردن فیلتر"
                  className="p-1 text-slate-400 hover:text-slate-600 absolute left-2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {showVisualGrid && filteredPodcasts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                نمای تصویری مجموعه‌ها (برای مشاهده قسمت‌ها یا پخش مستقیم روی کاور بزن)
              </div>
              <SearchArtworkGrid
                items={artworkGridItems}
                onSelect={focusPodcastFromGrid}
                onQuickPlay={quickPlayPodcastFromGrid}
              />
            </div>
          )}

          {filteredPodcasts.length > 0 ? (
            filteredPodcasts.map(({podcast, visibleEpisodes, visibleOthers}) => {
              const filterActive = Boolean(episodeFilter.trim());
              const isExpanded = filterActive || Boolean(expandedIds[podcast.id]);
              const showOthers = filterActive || Boolean(showOtherIds[podcast.id]);
              const matchedCount = podcast.matchedCount ?? 0;
              const totalEpisodes = podcast.totalEpisodes ?? podcast.totalFeedEpisodes ?? podcast.episodes.length;
              const categoryFa = podcast.category ? translateCategoryLabel(podcast.category) : '';

              return (
                <article
                  key={podcast.id}
                  ref={(el) => {
                    cardRefs.current[podcast.id] = el;
                  }}
                  className="rounded-xl border border-slate-200 dark:border-emerald-900/70 overflow-hidden"
                >
                  <div className="p-4 flex items-center gap-3 bg-white dark:bg-[#121E1C]">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedIds((prev) => ({
                          ...prev,
                          [podcast.id]: !prev[podcast.id],
                        }))
                      }
                      className="min-w-0 flex-1 flex items-center gap-3 text-right cursor-pointer"
                    >
                      {podcast.artworkUrl ? (
                        <img
                          src={podcast.artworkUrl}
                          alt={podcast.title}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                          <Headphones className="w-6 h-6 text-emerald-700" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {podcast.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {podcast.author}
                          {categoryFa ? ` · ${categoryFa}` : ''}
                        </p>
                        <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          {matchedCount > 0
                            ? `${toPersianDigits(visibleEpisodes.length)} قسمت مرتبط`
                            : `${toPersianDigits(visibleEpisodes.length)} قسمت آماده پخش`}
                          {totalEpisodes > visibleEpisodes.length && (
                            <span className="text-slate-500 dark:text-slate-400 font-normal">
                              {` (از ${toPersianDigits(totalEpisodes)} قسمت کل کانال)`}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#0B1312] text-slate-600 dark:text-slate-300 shrink-0">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>
                    <a
                      href={podcast.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="صفحه پادکست"
                      className="p-2 text-emerald-700 dark:text-emerald-400 shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-emerald-950/60 space-y-3">
                      {visibleEpisodes.length > 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-emerald-950">
                          {visibleEpisodes.map((episode, index) =>
                            renderEpisodeRow(podcast, episode, `${podcast.id}-ep-${index}`)
                          )}
                        </div>
                      ) : (
                        <p className="py-2 text-xs text-slate-500">
                          {filterActive
                            ? 'قسمتی در بخش اصلی با این فیلتر پیدا نشد.'
                            : 'فید پیدا شد، اما قسمت دارای فایل صوتی مستقیم در دسترس نبود.'}
                        </p>
                      )}

                      {visibleOthers.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 dark:border-emerald-950/60 space-y-2">
                          {!filterActive && (
                            <button
                              type="button"
                              onClick={() =>
                                setShowOtherIds((prev) => ({
                                  ...prev,
                                  [podcast.id]: !prev[podcast.id],
                                }))
                              }
                              className="w-full py-2 px-3 rounded-lg bg-slate-50 dark:bg-[#0B1312] border border-slate-200 dark:border-emerald-900 text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center justify-between cursor-pointer"
                            >
                              <span>
                                {showOthers
                                  ? 'پنهان‌کردن سایر قسمت‌های غیرمرتبط این کانال'
                                  : `نمایش ${toPersianDigits(visibleOthers.length)} قسمت دیگر این کانال (موضوعات دیگر)`}
                              </span>
                              {showOthers ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {showOthers && (
                            <div className="divide-y divide-slate-100 dark:divide-emerald-950 opacity-90">
                              {visibleOthers.map((episode, index) =>
                                renderEpisodeRow(podcast, episode, `${podcast.id}-other-${index}`)
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              در این دسته‌بندی یا فیلتر نتیجه‌ای یافت نشد.
            </div>
          )}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          برای شروع، یک موضوع، نام کتاب صوتی یا پادکست را جستجو کن.
        </div>
      )}
    </section>
  );
};
