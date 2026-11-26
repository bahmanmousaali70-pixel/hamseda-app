import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {toPersianDigits} from '../data/persianLibrary';
import {apiUrl, safeReadJsonResponse} from '../services/apiConfig';
import type {MusicTrack} from '../types/app';

export type RadioCategory = 'iran' | 'world' | 'chill' | 'persian_music' | 'custom';

const RADIO_STORAGE_KEY = 'rmz_radio_stations_v1';

function openExternalSafe(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    const a = document.createElement('a');
    a.href = parsed.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // ignore invalid URLs
  }
}

export interface PersistentMediaPlayer {
  musicAudioRef: React.RefObject<HTMLAudioElement | null>;
  radioAudioRef: React.RefObject<HTMLAudioElement | null>;
  tracks: MusicTrack[];
  radioStations: MusicTrack[];
  radioCategory: RadioCategory;
  radioNotice: string;
  radioBusy: boolean;
  currentMusicIndex: number;
  currentRadioIndex: number;
  isMusicPlaying: boolean;
  isMusicLoading: boolean;
  isRadioPlaying: boolean;
  isRadioLoading: boolean;
  musicTimeSec: number;
  musicDurationSec: number;
  sleepMinutes: number;
  sleepRemainingSec: number | null;
  activeMusicTrack: MusicTrack | null;
  activeRadioStation: MusicTrack | null;
  activePlayerMode: 'radio' | 'tracks' | null;
  setSleepMinutesAndSync: (mins: number) => void;
  setRadioStations: React.Dispatch<React.SetStateAction<MusicTrack[]>>;
  startMusicAtIndex: (index: number, list?: MusicTrack[]) => void;
  startRadioAtIndex: (index: number, list?: MusicTrack[]) => void;
  togglePlayItem: (index: number, group: 'tracks' | 'radio') => void;
  pauseMusicOnly: () => void;
  pauseRadioOnly: () => void;
  stopMusicPlayback: () => void;
  stopRadioPlayback: () => void;
  resetMusicIndex: () => void;
  handlePrevMusic: () => void;
  handleNextMusic: () => void;
  handlePrevRadio: () => void;
  handleNextRadio: () => void;
  handleSeekMusic: (seconds: number) => void;
  handleDeleteRadioStation: (stationId: string) => void;
  handleFetchRadio: (category: RadioCategory, customQueryText?: string) => Promise<void>;
  audioEventHandlers: {
    music: {
      onTimeUpdate: () => void;
      onLoadedMetadata: () => void;
      onCanPlay: () => void;
      onPlaying: () => void;
      onEnded: () => void;
      onError: () => void;
    };
    radio: {
      onCanPlay: () => void;
      onPlaying: () => void;
      onStalled: () => void;
      onEnded: () => void;
      onError: () => void;
    };
  };
}

export function useMediaPlayer(opts: {
  rawMusicTracks: MusicTrack[];
  isOnline: boolean;
  onStatusToast: (msg: string) => void;
}): PersistentMediaPlayer {
  const {rawMusicTracks, isOnline, onStatusToast} = opts;

  const [radioCategory, setRadioCategory] = useState<RadioCategory>('iran');
  const [radioNotice, setRadioNotice] = useState('');
  const [radioBusy, setRadioBusy] = useState(false);
  const [radioStations, setRadioStations] = useState<MusicTrack[]>(() => {
    try {
      const raw = localStorage.getItem(RADIO_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as MusicTrack[]) : [];
    } catch {
      return [];
    }
  });

  // Music player state
  const [currentMusicIndex, setCurrentMusicIndex] = useState<number>(-1);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isMusicLoading, setIsMusicLoading] = useState(false);
  const [musicTimeSec, setMusicTimeSec] = useState(0);
  const [musicDurationSec, setMusicDurationSec] = useState(0);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const usedProxyMusicRef = useRef<boolean>(false);
  const consecutiveMusicErrorRef = useRef<number>(0);

  // Radio player state (live radio defaults to continuous / 0 sleep timer)
  const [currentRadioIndex, setCurrentRadioIndex] = useState<number>(-1);
  const [isRadioPlaying, setIsRadioPlaying] = useState(false);
  const [isRadioLoading, setIsRadioLoading] = useState(false);
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);
  const usedProxyRadioRef = useRef<boolean>(false);
  const radioReconnectAttemptsRef = useRef<number>(0);
  const radioReconnectTimerRef = useRef<number | null>(null);
  const radioStableTimerRef = useRef<number | null>(null);
  const userStoppedRadioRef = useRef<boolean>(false);
  const wakeLockRef = useRef<{release: () => Promise<void>} | null>(null);

  // Default 0 ("پیوسته" continuous) so live radio never auto-stops unless user explicitly chooses a sleep timer
  const [sleepMinutes, setSleepMinutes] = useState<number>(0);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);

  const tracks = useMemo(() => {
    return rawMusicTracks.filter((t) => !t.isLiveStream && t.source !== 'radio' && Boolean(t.streamUrl));
  }, [rawMusicTracks]);

  const activeMusicTrack =
    currentMusicIndex >= 0 && currentMusicIndex < tracks.length ? tracks[currentMusicIndex] : null;
  const activeRadioStation =
    currentRadioIndex >= 0 && currentRadioIndex < radioStations.length ? radioStations[currentRadioIndex] : null;

  const activePlayerMode: 'radio' | 'tracks' | null = isRadioPlaying || isRadioLoading
    ? 'radio'
    : isMusicPlaying || isMusicLoading
      ? 'tracks'
      : activeRadioStation
        ? 'radio'
        : activeMusicTrack
          ? 'tracks'
          : null;

  // Persist radio stations locally
  useEffect(() => {
    try {
      localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify(radioStations));
    } catch {
      // ignore quota issues
    }
  }, [radioStations]);

  // WakeLock while live radio or music is actively playing so mobile screen-lock doesn't drop stream easily
  useEffect(() => {
    const activePlayback = isRadioPlaying || isMusicPlaying;
    if (!activePlayback) {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      return;
    }
    let cancelled = false;
    const nav = navigator as Navigator & {wakeLock?: {request: (t: 'screen') => Promise<{release: () => Promise<void>}>}};
    if (nav?.wakeLock?.request && document.visibilityState === 'visible') {
      nav.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (cancelled) {
            sentinel.release().catch(() => {});
          } else {
            wakeLockRef.current = sentinel;
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [isRadioPlaying, isMusicPlaying]);

  const clearRadioTimers = useCallback(() => {
    if (radioReconnectTimerRef.current !== null) {
      window.clearTimeout(radioReconnectTimerRef.current);
      radioReconnectTimerRef.current = null;
    }
    if (radioStableTimerRef.current !== null) {
      window.clearTimeout(radioStableTimerRef.current);
      radioStableTimerRef.current = null;
    }
  }, []);

  const pauseMusicOnly = useCallback(() => {
    const el = musicAudioRef.current;
    if (el) el.pause();
    setIsMusicPlaying(false);
    setIsMusicLoading(false);
  }, []);

  const pauseRadioOnly = useCallback(() => {
    userStoppedRadioRef.current = true;
    clearRadioTimers();
    const el = radioAudioRef.current;
    if (el) el.pause();
    setIsRadioPlaying(false);
    setIsRadioLoading(false);
  }, [clearRadioTimers]);

  const stopMusicPlayback = useCallback(() => {
    const el = musicAudioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setIsMusicPlaying(false);
    setIsMusicLoading(false);
    setMusicTimeSec(0);
    setMusicDurationSec(0);
    setSleepRemainingSec(null);
  }, []);

  const stopRadioPlayback = useCallback(() => {
    userStoppedRadioRef.current = true;
    clearRadioTimers();
    radioReconnectAttemptsRef.current = 0;
    const el = radioAudioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setIsRadioPlaying(false);
    setIsRadioLoading(false);
    setSleepRemainingSec(null);
  }, [clearRadioTimers]);

  // Sleep countdown tick
  useEffect(() => {
    if (sleepRemainingSec === null) return;
    if (sleepRemainingSec <= 0) {
      stopMusicPlayback();
      stopRadioPlayback();
      onStatusToast('تایمر خواب تمام شد و پخش متوقف گردید.');
      return;
    }
    const t = window.setTimeout(() => {
      setSleepRemainingSec((s) => (s !== null ? s - 1 : null));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [sleepRemainingSec, stopMusicPlayback, stopRadioPlayback, onStatusToast]);

  const setSleepMinutesAndSync = useCallback(
    (mins: number) => {
      setSleepMinutes(mins);
      if (isMusicPlaying || isRadioPlaying) {
        setSleepRemainingSec(mins > 0 ? mins * 60 : null);
      }
    },
    [isMusicPlaying, isRadioPlaying]
  );

  const startMusicAtIndex = useCallback(
    (index: number, list: MusicTrack[] = tracks) => {
      if (index < 0 || index >= list.length) return;
      const track = list[index];
      const el = musicAudioRef.current;
      if (!el) return;

      pauseRadioOnly();
      const alreadyProxied = track.streamUrl.startsWith('/api/audio-proxy');
      const resolvedSrc = track.streamUrl.startsWith('/api/') ? apiUrl(track.streamUrl) : track.streamUrl;

      usedProxyMusicRef.current = alreadyProxied;
      setCurrentMusicIndex(index);
      setMusicTimeSec(0);
      setMusicDurationSec(track.durationSec ?? 0);
      setIsMusicLoading(true);
      setIsMusicPlaying(false);
      if (sleepMinutes > 0 && sleepRemainingSec === null) {
        setSleepRemainingSec(sleepMinutes * 60);
      }

      el.src = resolvedSrc;
      el.load();
      el.play()
        .then(() => {
          consecutiveMusicErrorRef.current = 0;
          setIsMusicPlaying(true);
          setIsMusicLoading(false);
        })
        .catch(() => {
          if (!usedProxyMusicRef.current && !alreadyProxied) {
            usedProxyMusicRef.current = true;
            el.src = apiUrl(`/api/audio-proxy?url=${encodeURIComponent(track.streamUrl)}`);
            el.load();
            el.play()
              .then(() => {
                consecutiveMusicErrorRef.current = 0;
                setIsMusicPlaying(true);
                setIsMusicLoading(false);
              })
              .catch(() => {
                setIsMusicLoading(false);
                setIsMusicPlaying(false);
                onStatusToast(`پخش «${track.title}» از مبدا در دسترس نبود؛ قطعه بعدی را امتحان کنید.`);
              });
          } else {
            setIsMusicLoading(false);
            setIsMusicPlaying(false);
            onStatusToast(`پخش «${track.title}» از مبدا در دسترس نبود؛ قطعه بعدی را امتحان کنید.`);
          }
        });
    },
    [tracks, pauseRadioOnly, sleepMinutes, sleepRemainingSec, onStatusToast]
  );

  const startRadioAtIndex = useCallback(
    (index: number, list: MusicTrack[] = radioStations) => {
      if (index < 0 || index >= list.length) return;
      const station = list[index];
      const el = radioAudioRef.current;
      if (!el) return;

      userStoppedRadioRef.current = false;
      clearRadioTimers();
      radioReconnectAttemptsRef.current = 0;
      pauseMusicOnly();

      const alreadyProxied = station.streamUrl.startsWith('/api/audio-proxy');
      const resolvedSrc = station.streamUrl.startsWith('/api/') ? apiUrl(station.streamUrl) : station.streamUrl;

      usedProxyRadioRef.current = alreadyProxied;
      setCurrentRadioIndex(index);
      setIsRadioLoading(true);
      setIsRadioPlaying(false);
      if (sleepMinutes > 0 && sleepRemainingSec === null) {
        setSleepRemainingSec(sleepMinutes * 60);
      }

      el.src = resolvedSrc;
      el.load();
      el.play()
        .then(() => {
          setIsRadioPlaying(true);
          setIsRadioLoading(false);
        })
        .catch(() => {
          if (!usedProxyRadioRef.current && !alreadyProxied) {
            usedProxyRadioRef.current = true;
            el.src = apiUrl(`/api/audio-proxy?url=${encodeURIComponent(station.streamUrl)}`);
            el.load();
            el.play()
              .then(() => {
                setIsRadioPlaying(true);
                setIsRadioLoading(false);
              })
              .catch(() => {
                setIsRadioLoading(false);
                setIsRadioPlaying(false);
                onStatusToast(`ایستگاه «${station.title}» موقتاً در دسترس نیست؛ ایستگاه دیگری را بزنید.`);
              });
          } else {
            setIsRadioLoading(false);
            setIsRadioPlaying(false);
            onStatusToast(`ایستگاه «${station.title}» موقتاً در دسترس نیست؛ ایستگاه دیگری را بزنید.`);
          }
        });
    },
    [radioStations, clearRadioTimers, pauseMusicOnly, sleepMinutes, sleepRemainingSec, onStatusToast]
  );

  const attemptLiveRadioReconnect = useCallback(
    (reason: 'stalled' | 'ended' | 'error') => {
      if (userStoppedRadioRef.current || !activeRadioStation || currentRadioIndex < 0) return;
      const el = radioAudioRef.current;
      if (!el) return;

      // On first failure, immediately try our audio proxy if not tried yet
      const alreadyProxied = activeRadioStation.streamUrl.startsWith('/api/audio-proxy');
      if (reason === 'error' && !usedProxyRadioRef.current && !alreadyProxied) {
        usedProxyRadioRef.current = true;
        setIsRadioLoading(true);
        el.src = apiUrl(`/api/audio-proxy?url=${encodeURIComponent(activeRadioStation.streamUrl)}`);
        el.load();
        el.play()
          .then(() => {
            setIsRadioPlaying(true);
            setIsRadioLoading(false);
          })
          .catch(() => {
            // Fall through to retry scheduling
            attemptLiveRadioReconnect('stalled');
          });
        return;
      }

      if (radioReconnectAttemptsRef.current >= 3) {
        setIsRadioPlaying(false);
        setIsRadioLoading(false);
        onStatusToast(`اتصال رادیو «${activeRadioStation.title}» قطع شد؛ روی دکمه پخش بزنید تا دوباره وصل شود.`);
        return;
      }

      radioReconnectAttemptsRef.current += 1;
      const attempt = radioReconnectAttemptsRef.current;
      const delayMs = attempt * 1800;
      clearRadioTimers();
      setIsRadioLoading(true);

      radioReconnectTimerRef.current = window.setTimeout(() => {
        if (userStoppedRadioRef.current || !radioAudioRef.current) return;
        const streamSrc = usedProxyRadioRef.current
          ? apiUrl(`/api/audio-proxy?url=${encodeURIComponent(activeRadioStation.streamUrl)}&_r=${Date.now()}`)
          : activeRadioStation.streamUrl.startsWith('/api/')
            ? apiUrl(`${activeRadioStation.streamUrl}&_r=${Date.now()}`)
            : activeRadioStation.streamUrl;
        radioAudioRef.current.src = streamSrc;
        radioAudioRef.current.load();
        radioAudioRef.current
          .play()
          .then(() => {
            setIsRadioPlaying(true);
            setIsRadioLoading(false);
          })
          .catch(() => {
            if (attempt >= 3) {
              setIsRadioPlaying(false);
              setIsRadioLoading(false);
              onStatusToast(`پخش زنده «${activeRadioStation.title}» موقتاً برقرار نشد.`);
            }
          });
      }, delayMs);
    },
    [activeRadioStation, currentRadioIndex, clearRadioTimers, onStatusToast]
  );

  const togglePlayItem = useCallback(
    (index: number, group: 'tracks' | 'radio') => {
      if (group === 'radio') {
        const el = radioAudioRef.current;
        if (!el) return;
        if (currentRadioIndex === index) {
          if (isRadioPlaying) {
            pauseRadioOnly();
          } else {
            userStoppedRadioRef.current = false;
            pauseMusicOnly();
            el.play()
              .then(() => setIsRadioPlaying(true))
              .catch(() => startRadioAtIndex(index, radioStations));
          }
          return;
        }
        startRadioAtIndex(index, radioStations);
        return;
      }

      const selectedTrack = tracks[index];
      if (selectedTrack && !selectedTrack.streamUrl) {
        if (selectedTrack.externalUrl) {
          openExternalSafe(selectedTrack.externalUrl);
          onStatusToast('این سایت پخش مستقیم داخل هم‌صدا ارائه نمی‌کند؛ صفحه اثر در سایت منبع باز شد.');
        } else {
          onStatusToast('برای این نتیجه لینک پخش مستقیم در دسترس نیست.');
        }
        return;
      }
      const el = musicAudioRef.current;
      if (!el) return;
      if (currentMusicIndex === index) {
        if (isMusicPlaying) {
          pauseMusicOnly();
        } else {
          pauseRadioOnly();
          el.play()
            .then(() => setIsMusicPlaying(true))
            .catch(() => startMusicAtIndex(index, tracks));
        }
        return;
      }
      startMusicAtIndex(index, tracks);
    },
    [
      currentRadioIndex,
      isRadioPlaying,
      pauseRadioOnly,
      pauseMusicOnly,
      startRadioAtIndex,
      radioStations,
      tracks,
      currentMusicIndex,
      isMusicPlaying,
      startMusicAtIndex,
      onStatusToast,
    ]
  );

  const handlePrevMusic = useCallback(() => {
    if (tracks.length === 0) return;
    const nextIdx = currentMusicIndex <= 0 ? tracks.length - 1 : currentMusicIndex - 1;
    startMusicAtIndex(nextIdx, tracks);
  }, [tracks, currentMusicIndex, startMusicAtIndex]);

  const handleNextMusic = useCallback(() => {
    if (tracks.length === 0) return;
    const nextIdx = currentMusicIndex + 1 >= tracks.length ? 0 : currentMusicIndex + 1;
    startMusicAtIndex(nextIdx, tracks);
  }, [tracks, currentMusicIndex, startMusicAtIndex]);

  const handlePrevRadio = useCallback(() => {
    if (radioStations.length === 0) return;
    const nextIdx = currentRadioIndex <= 0 ? radioStations.length - 1 : currentRadioIndex - 1;
    startRadioAtIndex(nextIdx, radioStations);
  }, [radioStations, currentRadioIndex, startRadioAtIndex]);

  const handleNextRadio = useCallback(() => {
    if (radioStations.length === 0) return;
    const nextIdx = currentRadioIndex + 1 >= radioStations.length ? 0 : currentRadioIndex + 1;
    startRadioAtIndex(nextIdx, radioStations);
  }, [radioStations, currentRadioIndex, startRadioAtIndex]);

  const handleSeekMusic = useCallback((val: number) => {
    const el = musicAudioRef.current;
    if (el && Number.isFinite(val)) {
      el.currentTime = val;
      setMusicTimeSec(val);
    }
  }, []);

  const handleDeleteRadioStation = useCallback(
    (stationId: string) => {
      const idx = radioStations.findIndex((s) => s.id === stationId);
      if (idx === -1) return;
      const removedTitle = radioStations[idx].title;
      if (currentRadioIndex === idx) {
        stopRadioPlayback();
        setCurrentRadioIndex(-1);
      } else if (currentRadioIndex > idx) {
        setCurrentRadioIndex((prev) => prev - 1);
      }
      setRadioStations((prev) => prev.filter((s) => s.id !== stationId));
      onStatusToast(`رادیو «${removedTitle}» حذف شد (هر زمان با جستجو دوباره برمی‌گردد).`);
    },
    [radioStations, currentRadioIndex, stopRadioPlayback, onStatusToast]
  );

  const handleFetchRadio = useCallback(
    async (category: RadioCategory, customQueryText = '') => {
      if (!isOnline) {
        onStatusToast('اتصال به ایستگاه‌های رادیویی زنده نیازمند اینترنت است.');
        return;
      }
      setRadioCategory(category);
      setRadioBusy(true);
      setRadioNotice('');
      try {
        const res = await fetch(apiUrl('/api/radio-stations'), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            category,
            query: customQueryText,
          }),
        });
        const parsed = await safeReadJsonResponse<{stations?: MusicTrack[]; notice?: string; error?: string}>(res);
        if (parsed.isHtml || !parsed.data) {
          throw new Error('سرور رادیو موقتاً پاسخ نامعتبر داد؛ لطفاً دوباره امتحان کنید.');
        }
        const data = parsed.data;
        if (!res.ok) throw new Error(data.error || 'خطا در دریافت رادیوها');
        const list = Array.isArray(data.stations) ? data.stations : [];
        stopRadioPlayback();
        setCurrentRadioIndex(-1);
        setRadioStations(list);
        setRadioNotice(data.notice || '');
        if (data.notice) {
          onStatusToast(data.notice);
        } else if (list.length > 0) {
          onStatusToast(`${toPersianDigits(list.length)} ایستگاه رادیویی زنده آماده پخش شد.`);
        } else {
          onStatusToast('ایستگاهی با این عبارت پیدا نشد؛ دسته‌بندی دیگری را امتحان کنید.');
        }
      } catch (err) {
        onStatusToast(err instanceof Error ? err.message : 'خطا در دریافت لیست رادیوها.');
      } finally {
        setRadioBusy(false);
      }
    },
    [isOnline, stopRadioPlayback, onStatusToast]
  );

  const handleMusicError = useCallback(() => {
    const track = activeMusicTrack;
    const el = musicAudioRef.current;
    if (!track || !el) return;

    const alreadyProxied = track.streamUrl.startsWith('/api/audio-proxy');
    if (!usedProxyMusicRef.current && !alreadyProxied) {
      usedProxyMusicRef.current = true;
      el.src = apiUrl(`/api/audio-proxy?url=${encodeURIComponent(track.streamUrl)}`);
      el.load();
      el.play()
        .then(() => {
          consecutiveMusicErrorRef.current = 0;
          setIsMusicPlaying(true);
          setIsMusicLoading(false);
        })
        .catch(() => {
          setIsMusicPlaying(false);
          setIsMusicLoading(false);
          consecutiveMusicErrorRef.current += 1;
          if (tracks.length > 1 && consecutiveMusicErrorRef.current < 3) {
            startMusicAtIndex((currentMusicIndex + 1) % tracks.length, tracks);
          } else {
            consecutiveMusicErrorRef.current = 0;
            onStatusToast(`پخش «${track.title}» ممکن نشد؛ قطعه دیگری را انتخاب کنید.`);
          }
        });
      return;
    }

    setIsMusicPlaying(false);
    setIsMusicLoading(false);
    consecutiveMusicErrorRef.current += 1;
    if (tracks.length > 1 && currentMusicIndex >= 0 && consecutiveMusicErrorRef.current < 3) {
      onStatusToast(`«${track.title}» پاسخگو نبود؛ رفتن به قطعه بعدی...`);
      startMusicAtIndex((currentMusicIndex + 1) % tracks.length, tracks);
    } else {
      consecutiveMusicErrorRef.current = 0;
      onStatusToast('چند قطعه متوالی قابل پخش نبودند؛ عبارت جستجوی دیگری را امتحان کنید.');
    }
  }, [activeMusicTrack, tracks, currentMusicIndex, startMusicAtIndex, onStatusToast]);

  // Properly scoped MediaSession effect (NEVER re-runs on every musicTimeSec tick!)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const mode = activePlayerMode;
    const activeItem = mode === 'radio' ? activeRadioStation : mode === 'tracks' ? activeMusicTrack : null;

    if (!activeItem || !mode) {
      try {
        ms.playbackState = 'none';
      } catch {
        // ignore
      }
      return;
    }

    try {
      if (typeof MediaMetadata !== 'undefined') {
        ms.metadata = new MediaMetadata({
          title: activeItem.title,
          artist: activeItem.artist || (mode === 'radio' ? 'رادیو زنده هم‌صدا' : 'موزیک شبانه هم‌صدا'),
          album: mode === 'radio' ? 'رادیوهای ایران و جهان' : 'پلی‌لیست هم‌صدا',
          artwork: activeItem.artworkUrl ? [{src: activeItem.artworkUrl, sizes: '256x256', type: 'image/png'}] : undefined,
        });
      }
      ms.playbackState = (mode === 'radio' ? isRadioPlaying : isMusicPlaying) ? 'playing' : 'paused';
      ms.setActionHandler('play', () => {
        if (mode === 'radio') {
          if (currentRadioIndex >= 0 && !isRadioPlaying) togglePlayItem(currentRadioIndex, 'radio');
        } else if (currentMusicIndex >= 0 && !isMusicPlaying) {
          togglePlayItem(currentMusicIndex, 'tracks');
        }
      });
      ms.setActionHandler('pause', () => {
        if (mode === 'radio') pauseRadioOnly();
        else pauseMusicOnly();
      });
      ms.setActionHandler('stop', () => {
        if (mode === 'radio') stopRadioPlayback();
        else stopMusicPlayback();
      });
      ms.setActionHandler('previoustrack', () => {
        if (mode === 'radio') handlePrevRadio();
        else handlePrevMusic();
      });
      ms.setActionHandler('nexttrack', () => {
        if (mode === 'radio') handleNextRadio();
        else handleNextMusic();
      });
    } catch {
      // MediaSession not supported in this browser/WebView
    }
  }, [
    activePlayerMode,
    activeRadioStation,
    activeMusicTrack,
    isRadioPlaying,
    isMusicPlaying,
    currentRadioIndex,
    currentMusicIndex,
    togglePlayItem,
    pauseRadioOnly,
    pauseMusicOnly,
    stopRadioPlayback,
    stopMusicPlayback,
    handlePrevRadio,
    handlePrevMusic,
    handleNextRadio,
    handleNextMusic,
  ]);

  const audioEventHandlers = useMemo(
    () => ({
      music: {
        onTimeUpdate: () => {
          if (musicAudioRef.current) setMusicTimeSec(musicAudioRef.current.currentTime || 0);
        },
        onLoadedMetadata: () => {
          if (
            musicAudioRef.current &&
            Number.isFinite(musicAudioRef.current.duration) &&
            musicAudioRef.current.duration > 0
          ) {
            setMusicDurationSec(musicAudioRef.current.duration);
          }
          setIsMusicLoading(false);
        },
        onCanPlay: () => setIsMusicLoading(false),
        onPlaying: () => {
          consecutiveMusicErrorRef.current = 0;
          setIsMusicLoading(false);
          setIsMusicPlaying(true);
        },
        onEnded: () => {
          if (tracks.length > 1) {
            handleNextMusic();
          } else {
            setIsMusicPlaying(false);
            setMusicTimeSec(0);
          }
        },
        onError: handleMusicError,
      },
      radio: {
        onCanPlay: () => setIsRadioLoading(false),
        onPlaying: () => {
          setIsRadioLoading(false);
          setIsRadioPlaying(true);
          if (radioStableTimerRef.current !== null) window.clearTimeout(radioStableTimerRef.current);
          radioStableTimerRef.current = window.setTimeout(() => {
            radioReconnectAttemptsRef.current = 0;
          }, 15000);
        },
        onStalled: () => {
          if (!userStoppedRadioRef.current && isRadioPlaying) {
            attemptLiveRadioReconnect('stalled');
          }
        },
        onEnded: () => {
          if (!userStoppedRadioRef.current && activeRadioStation) {
            attemptLiveRadioReconnect('ended');
          } else {
            setIsRadioPlaying(false);
          }
        },
        onError: () => attemptLiveRadioReconnect('error'),
      },
    }),
    [tracks.length, handleNextMusic, handleMusicError, isRadioPlaying, activeRadioStation, attemptLiveRadioReconnect]
  );

  return {
    musicAudioRef,
    radioAudioRef,
    tracks,
    radioStations,
    radioCategory,
    radioNotice,
    radioBusy,
    currentMusicIndex,
    currentRadioIndex,
    isMusicPlaying,
    isMusicLoading,
    isRadioPlaying,
    isRadioLoading,
    musicTimeSec,
    musicDurationSec,
    sleepMinutes,
    sleepRemainingSec,
    activeMusicTrack,
    activeRadioStation,
    activePlayerMode,
    setSleepMinutesAndSync,
    setRadioStations,
    startMusicAtIndex,
    startRadioAtIndex,
    togglePlayItem,
    pauseMusicOnly,
    pauseRadioOnly,
    stopMusicPlayback,
    stopRadioPlayback,
    resetMusicIndex: () => setCurrentMusicIndex(-1),
    handlePrevMusic,
    handleNextMusic,
    handlePrevRadio,
    handleNextRadio,
    handleSeekMusic,
    handleDeleteRadioStation,
    handleFetchRadio,
    audioEventHandlers,
  };
}
