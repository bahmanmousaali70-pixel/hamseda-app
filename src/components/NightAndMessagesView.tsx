import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  BellRing,
  Check,
  Clock,
  Copy,
  Disc3,
  ExternalLink,
  Film,
  Gamepad2,
  Globe,
  LayoutGrid,
  List,
  Loader2,
  MessageSquareHeart,
  Moon,
  Music2,
  Pause,
  Play,
  Podcast,
  Radio,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import {toPersianDigits, VOICE_PERSONAS} from '../data/persianLibrary';
import {apiUrl, safeReadJsonResponse} from '../services/apiConfig';
import type {
  AppSettings,
  DeviceOwner,
  MusicTrack,
  NightDiscoveryResponse,
  SpecialMessageResult,
  VoiceName,
} from '../types/app';
import {getPartnerNameForDevice, getSelfName} from '../utils/deviceIdentity';
import {GTA6StreamsView} from './GTA6StreamsView';
import {PodcastLibraryView} from './PodcastLibraryView';
import {SearchArtworkGrid, type SearchArtworkItem} from './SearchArtworkGrid';

interface NightAndMessagesViewProps {
  settings: AppSettings;
  deviceOwner: DeviceOwner;
  isOnline: boolean;
  isSpeaking: boolean;
  nightMoviesResult: NightDiscoveryResponse | null;
  nightMusicResult: NightDiscoveryResponse | null;
  onSaveNightResult: (result: NightDiscoveryResponse) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onSpeakText: (text: string, title: string, category: 'custom' | 'morning' | 'energy' | 'gratitude') => void;
  onStopSpeech: () => void;
  onStatusToast: (msg: string) => void;
  assistantMediaTrigger?: {tab: 'tracks' | 'radio' | 'podcasts' | 'stop'; query?: string; nonce: number} | null;
  messagePrefill?: {
    occasion?: OccasionId;
    recipient?: string;
    details?: string;
    nonce: number;
  } | null;
}

type OccasionId = 'birthday' | 'anniversary' | 'apology' | 'thanks' | 'encouragement' | 'custom';

const OCCASIONS: {id: OccasionId; label: string; offlineTemplate: (recipient: string, sender: string) => SpecialMessageResult}[] = [
  {
    id: 'birthday',
    label: 'تبریک تولد',
    offlineTemplate: (recipient, sender) => ({
      title: `تبریک تولد صمیمی برای ${recipient}`,
      text: `${recipient} عزیز، تولدت مبارک! آرزو می‌کنم سال جدید عمرت سرشار از سلامتی، دل آرام، موفقیت‌های درخشان و لحظه‌های پر از لبخند باشد. حضور تو در زندگی ما نعمت بزرگی است و همیشه برایت بهترین‌ها را می‌خواهم. با عشق، ${sender}.`,
      shortVersion: `${recipient} جان تولدت مبارک! همیشه سلامت، شاد و درخشان باشی. از طرف ${sender}`,
      occasion: 'تبریک تولد',
    }),
  },
  {
    id: 'anniversary',
    label: 'سالگرد و عشق',
    offlineTemplate: (recipient, sender) => ({
      title: `پیام سالگرد و همراهی برای ${recipient}`,
      text: `${recipient} مهربانم، با هر روزی که در کنار هم می‌گذرانیم بیشتر قدر همدلی، آرامش و عشق میانمان را می‌دانم. ممنونم که شریک لحظه‌های سخت و شیرین زندگی هستی. امیدوارم سال‌های پیش رو برایمان پر از خاطرات زیبا و پیشرفت مشترک باشد. دوستت دارم، ${sender}.`,
      shortVersion: `${recipient} عزیزم، کنار تو هر روز زندگی معنای زیباتری دارد. ممنون که هستی. ${sender}`,
      occasion: 'سالگرد و عشق',
    }),
  },
  {
    id: 'apology',
    label: 'آشتی و دلجویی',
    offlineTemplate: (recipient, sender) => ({
      title: `پیام دلجویی صمیمی برای ${recipient}`,
      text: `${recipient} عزیز، اگر باعث رنجش و دلخوری‌ات شدم صمیمانه عذرخواهی می‌کنم. آرامش و لبخند تو برای من از هر بحث و سوءتفاهمی مهم‌تر است. دلم می‌خواهد دوباره با دل صاف و لبخند کنار هم باشیم. از طرف ${sender}.`,
      shortVersion: `${recipient} جان، بابت کدورت پیش‌آمده معذرت می‌خواهم. حالِ خوب و لبخندت برایم مهم‌ترین چیز است. ${sender}`,
      occasion: 'آشتی و دلجویی',
    }),
  },
  {
    id: 'thanks',
    label: 'تشکر و قدردانی',
    offlineTemplate: (recipient, sender) => ({
      title: `سپاسگزاری از ${recipient}`,
      text: `${recipient} گرامی و مهربان، از صمیم قلب بابت همراهی، محبت و زحمتی که کشیدید سپاسگزارم. بزرگواری شما هیچ‌وقت فراموش نمی‌شود و باعث دلگرمی فراوان بود. همیشه سلامت و سربلند باشید. با احترام، ${sender}.`,
      shortVersion: `${recipient} عزیز، بابت تمام لطف و همراهی‌تان از صمیم قلب ممنونم. ${sender}`,
      occasion: 'تشکر و قدردانی',
    }),
  },
  {
    id: 'encouragement',
    label: 'دلگرمی و موفقیت',
    offlineTemplate: (recipient, sender) => ({
      title: `پیام دلگرمی برای ${recipient}`,
      text: `${recipient} جان، مطمئنم با پشتکار، هوش و اراده‌ای که داری این مسیر را هم با سربلندی پشت سر می‌گذاری. روزهای سخت موقتی هستند و تلاش امروزت فردایی درخشان می‌سازد. روی حمایت و دعای من همیشه حساب کن. ${sender}.`,
      shortVersion: `${recipient} عزیز، من به توانایی تو ایمان دارم و همیشه کنارت هستم. موفق باشی! ${sender}`,
      occasion: 'دلگرمی و موفقیت',
    }),
  },
  {
    id: 'custom',
    label: 'موضوع دلخواه',
    offlineTemplate: (recipient, sender) => ({
      title: `پیام اختصاصی برای ${recipient}`,
      text: `سلام ${recipient} عزیز، امیدوارم امروزتان پر از آرامش، حال خوب و خبرهای خوش باشد. همیشه به یادتان هستم و بهترین‌ها را برایتان آرزو می‌کنم. با احترام و محبت، ${sender}.`,
      shortVersion: `سلام ${recipient} جان، همیشه سلامت و دلشاد باشید. از طرف ${sender}`,
      occasion: 'پیام دلخواه',
    }),
  },
];

const TONES = ['صمیمی و گرم', 'عاشقانه و احساسی', 'محترمانه و ادبی', 'شاد و پرانرژی'];

const MUSIC_MOOD_PRESETS = [
  'سنتی آرام و شجریان',
  'پیانو و باران ملایم',
  'پاپ آرام ایرانی',
  'بی‌کلام رمانتیک',
  'موزیک لایت آرامش‌بخش',
];

type RadioCategory = 'iran' | 'world' | 'chill' | 'persian_music' | 'custom';

const RADIO_CATEGORY_PRESETS: {id: Exclude<RadioCategory, 'custom'>; label: string}[] = [
  {id: 'iran', label: 'رادیوهای ایران و فارسی'},
  {id: 'world', label: 'برترین رادیوهای جهان'},
  {id: 'chill', label: 'آرامش، پیانو و لایت'},
  {id: 'persian_music', label: 'موسیقی ایرانی و سنتی'},
];

const RADIO_STORAGE_KEY = 'rmz_radio_stations_v1';

function formatTrackClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '۰۰:۰۰';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${toPersianDigits(String(mins).padStart(2, '0'))}:${toPersianDigits(String(secs).padStart(2, '0'))}`;
}

function sourceLabel(track: MusicTrack): string {
  if (track.isLiveStream || track.source === 'radio') return 'رادیو زنده';
  if (!track.streamUrl) return 'مشاهده در سایت منبع';
  if (track.source === 'radiojavan') return 'رادیوجوان · پخش مستقیم';
  if (track.source === 'archive') return 'پخش مستقیم از منبع';
  return 'پخش کامل';
}

export const NightAndMessagesView: React.FC<NightAndMessagesViewProps> = ({
  settings,
  deviceOwner,
  isOnline,
  isSpeaking,
  nightMoviesResult,
  nightMusicResult,
  onSaveNightResult,
  onUpdateSettings,
  onSpeakText,
  onStopSpeech,
  onStatusToast,
  assistantMediaTrigger,
  messagePrefill,
}) => {
  const selfName = getSelfName(settings, deviceOwner);
  const partnerOtherName = getPartnerNameForDevice(settings, deviceOwner);
  const defaultRecipient = `${partnerOtherName} جان`;

  // Special Message Builder state
  const [occasion, setOccasion] = useState<OccasionId>('birthday');
  const [customOccasionText, setCustomOccasionText] = useState('');
  const [recipient, setRecipient] = useState(defaultRecipient);
  const recipientEditedRef = useRef(false);
  const [tone, setTone] = useState(TONES[0]);
  const [details, setDetails] = useState('');
  const [msgResult, setMsgResult] = useState<SpecialMessageResult | null>(() =>
    OCCASIONS[0].offlineTemplate(defaultRecipient, selfName)
  );
  const [msgBusy, setMsgBusy] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [msgVoice, setMsgVoice] = useState<VoiceName>(settings.defaultVoice);

  useEffect(() => {
    if (!recipientEditedRef.current) {
      setRecipient(`${partnerOtherName} جان`);
      const tmpl = OCCASIONS.find((o) => o.id === occasion) ?? OCCASIONS[0];
      setMsgResult(tmpl.offlineTemplate(`${partnerOtherName} جان`, selfName));
    }
  }, [deviceOwner, partnerOtherName, selfName, occasion]);

  // Completely Separated Music Playlist, Live Radio, Podcasts, Night Movies, Message Builder & GTA 6 Streams
  const [mediaTab, setMediaTab] = useState<'tracks' | 'radio' | 'podcasts' | 'movies' | 'messages' | 'gta6'>('tracks');

  useEffect(() => {
    if (!messagePrefill?.nonce) return;
    const nextOccasion = messagePrefill.occasion ?? 'birthday';
    const nextRecipient = messagePrefill.recipient?.trim() || `${partnerOtherName} جان`;
    setMediaTab('messages');
    setOccasion(nextOccasion);
    setRecipient(nextRecipient);
    recipientEditedRef.current = true;
    setDetails(messagePrefill.details?.trim() || '');
    const tmpl = OCCASIONS.find((o) => o.id === nextOccasion) ?? OCCASIONS[0];
    setMsgResult(tmpl.offlineTemplate(nextRecipient, selfName));
  }, [messagePrefill, partnerOtherName, selfName]);
  const [mediaViewMode, setMediaViewMode] = useState<'grid' | 'list'>('grid');
  const [musicMood, setMusicMood] = useState('سنتی آرام و شجریان');
  const [musicBusy, setMusicBusy] = useState(false);
  const [radioCategory, setRadioCategory] = useState<RadioCategory>('iran');
  const [radioQuery, setRadioQuery] = useState('');
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

  // Music player refs & state (isolated from Radio)
  const [currentMusicIndex, setCurrentMusicIndex] = useState<number>(-1);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isMusicLoading, setIsMusicLoading] = useState(false);
  const [musicTimeSec, setMusicTimeSec] = useState(0);
  const [musicDurationSec, setMusicDurationSec] = useState(0);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const usedProxyMusicRef = useRef<boolean>(false);

  // Radio player refs & state (isolated from Music)
  const [currentRadioIndex, setCurrentRadioIndex] = useState<number>(-1);
  const [isRadioPlaying, setIsRadioPlaying] = useState(false);
  const [isRadioLoading, setIsRadioLoading] = useState(false);
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);
  const usedProxyRadioRef = useRef<boolean>(false);

  const [sleepMinutes, setSleepMinutes] = useState<number>(30);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const [failedArtIds, setFailedArtIds] = useState<Record<string, boolean>>({});

  // Movies Discovery state
  const [movieMediaType, setMovieMediaType] = useState<'both' | 'movie' | 'series'>('both');
  const [movieGenre, setMovieGenre] = useState('درام، معمایی یا خانوادگی خوش‌ساخت با امتیاز بالای ۷.۵');
  const [movieBusy, setMovieBusy] = useState(false);

  // Pure Music tracks only (never mix any stray radio entries)
  const tracks: MusicTrack[] = useMemo(() => {
    const raw = Array.isArray(nightMusicResult?.tracks) ? nightMusicResult.tracks : [];
    return raw.filter((t) => !t.isLiveStream && t.source !== 'radio');
  }, [nightMusicResult]);

  const activeMusicTrack =
    currentMusicIndex >= 0 && currentMusicIndex < tracks.length ? tracks[currentMusicIndex] : null;
  const activeRadioStation =
    currentRadioIndex >= 0 && currentRadioIndex < radioStations.length ? radioStations[currentRadioIndex] : null;

  const pauseMusicOnly = () => {
    const el = musicAudioRef.current;
    if (el) {
      el.pause();
    }
    setIsMusicPlaying(false);
    setIsMusicLoading(false);
  };

  const pauseRadioOnly = () => {
    const el = radioAudioRef.current;
    if (el) {
      el.pause();
    }
    setIsRadioPlaying(false);
    setIsRadioLoading(false);
  };

  const stopMusicPlayback = () => {
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
  };

  const stopRadioPlayback = () => {
    const el = radioAudioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setIsRadioPlaying(false);
    setIsRadioLoading(false);
    setSleepRemainingSec(null);
  };

  useEffect(() => {
    return () => {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current.removeAttribute('src');
      }
      if (radioAudioRef.current) {
        radioAudioRef.current.pause();
        radioAudioRef.current.removeAttribute('src');
      }
    };
  }, []);

  // Persist radio stations even when empty (after deleting all stations)
  useEffect(() => {
    try {
      localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify(radioStations));
    } catch {
      // ignore quota issues
    }
  }, [radioStations]);

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
  }, [sleepRemainingSec, onStatusToast]);

  const startMusicAtIndex = (index: number, list: MusicTrack[] = tracks) => {
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
  };

  const startRadioAtIndex = (index: number, list: MusicTrack[] = radioStations) => {
    if (index < 0 || index >= list.length) return;
    const station = list[index];
    const el = radioAudioRef.current;
    if (!el) return;

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
  };

  const togglePlayItem = (index: number, group: 'tracks' | 'radio') => {
    if (group === 'radio') {
      const el = radioAudioRef.current;
      if (!el) return;
      if (currentRadioIndex === index) {
        if (isRadioPlaying) {
          el.pause();
          setIsRadioPlaying(false);
        } else {
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
        window.open(selectedTrack.externalUrl, '_blank', 'noopener,noreferrer');
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
        el.pause();
        setIsMusicPlaying(false);
      } else {
        pauseRadioOnly();
        el.play()
          .then(() => setIsMusicPlaying(true))
          .catch(() => startMusicAtIndex(index, tracks));
      }
      return;
    }
    startMusicAtIndex(index, tracks);
  };

  const handlePrevMusic = () => {
    if (tracks.length === 0) return;
    const nextIdx = currentMusicIndex <= 0 ? tracks.length - 1 : currentMusicIndex - 1;
    startMusicAtIndex(nextIdx, tracks);
  };

  const handleNextMusic = () => {
    if (tracks.length === 0) return;
    const nextIdx = currentMusicIndex + 1 >= tracks.length ? 0 : currentMusicIndex + 1;
    startMusicAtIndex(nextIdx, tracks);
  };

  const handlePrevRadio = () => {
    if (radioStations.length === 0) return;
    const nextIdx = currentRadioIndex <= 0 ? radioStations.length - 1 : currentRadioIndex - 1;
    startRadioAtIndex(nextIdx, radioStations);
  };

  const handleNextRadio = () => {
    if (radioStations.length === 0) return;
    const nextIdx = currentRadioIndex + 1 >= radioStations.length ? 0 : currentRadioIndex + 1;
    startRadioAtIndex(nextIdx, radioStations);
  };

  const handleMusicError = () => {
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
          setIsMusicPlaying(true);
          setIsMusicLoading(false);
        })
        .catch(() => {
          setIsMusicPlaying(false);
          setIsMusicLoading(false);
          if (tracks.length > 1) {
            startMusicAtIndex((currentMusicIndex + 1) % tracks.length, tracks);
          } else {
            onStatusToast(`پخش «${track.title}» ممکن نشد؛ با قطعه دیگر امتحان کنید.`);
          }
        });
      return;
    }

    setIsMusicPlaying(false);
    setIsMusicLoading(false);
    if (tracks.length > 1 && currentMusicIndex >= 0) {
      onStatusToast(`«${track.title}» در حال حاضر پاسخگو نبود؛ رفتن به قطعه بعدی...`);
      startMusicAtIndex((currentMusicIndex + 1) % tracks.length, tracks);
    }
  };

  const handleRadioError = () => {
    const station = activeRadioStation;
    const el = radioAudioRef.current;
    if (!station || !el) return;

    const alreadyProxied = station.streamUrl.startsWith('/api/audio-proxy');
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
          setIsRadioPlaying(false);
          setIsRadioLoading(false);
          onStatusToast(`پخش زنده «${station.title}» موقتاً برقرار نشد.`);
        });
      return;
    }

    setIsRadioPlaying(false);
    setIsRadioLoading(false);
    onStatusToast(`پخش زنده «${station.title}» موقتاً برقرار نشد.`);
  };

  const handleDeleteRadioStation = (stationId: string) => {
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
  };

  const handleFetchRadio = async (category: RadioCategory, customQueryText?: string, autoPlayFirst = false) => {
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
          query: customQueryText ?? radioQuery.trim(),
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
      if (autoPlayFirst && list.length > 0) startRadioAtIndex(0, list);
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
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const el = musicAudioRef.current;
    if (el && Number.isFinite(val)) {
      el.currentTime = val;
      setMusicTimeSec(val);
    }
  };

  const handleGenerateSpecialMessage = async () => {
    const chosenOccasion =
      occasion === 'custom'
        ? customOccasionText.trim() || 'پیام محبت‌آمیز و خاص'
        : OCCASIONS.find((o) => o.id === occasion)?.label ?? 'پیام مناسبتی';
    const targetPerson = recipient.trim() || defaultRecipient;
    const sender = selfName;

    if (!isOnline) {
      const tmpl = OCCASIONS.find((o) => o.id === occasion) ?? OCCASIONS[0];
      setMsgResult(tmpl.offlineTemplate(targetPerson, sender));
      onStatusToast('در حالت آفلاین هستید؛ متن آماده اختصاصی ساخته شد.');
      return;
    }

    setMsgBusy(true);
    try {
      const res = await fetch(apiUrl('/api/special-message'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          occasion: chosenOccasion,
          recipient: targetPerson,
          senderName: sender,
          tone,
          details: details.trim(),
        }),
      });
      const parsed = await safeReadJsonResponse<SpecialMessageResult & {error?: string}>(res);
      if (parsed.isHtml || !parsed.data || !res.ok) {
        throw new Error(parsed.data?.error || 'خطا در ساخت پیام');
      }
      setMsgResult(parsed.data);
      onStatusToast('پیام مناسبتی آماده شد؛ می‌توانید کپی یا با صدای گوینده پخش کنید.');
    } catch {
      const tmpl = OCCASIONS.find((o) => o.id === occasion) ?? OCCASIONS[0];
      setMsgResult(tmpl.offlineTemplate(targetPerson, sender));
      onStatusToast('از قالب آماده آفلاین استفاده شد.');
    } finally {
      setMsgBusy(false);
    }
  };

  const handleCopyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(true);
      onStatusToast('متن پیام کپی شد.');
      window.setTimeout(() => setCopiedMsg(false), 2000);
    } catch {
      onStatusToast('کپی خودکار انجام نشد.');
    }
  };

  const handleDiscoverNight = async (mode: 'music' | 'movies', customMoodOverride?: string, autoPlayFirst = false) => {
    if (!isOnline) {
      onStatusToast(
        mode === 'music'
          ? 'جستجوی پلی‌لیست آنلاین موسیقی نیاز به اینترنت دارد.'
          : 'برای جستجوی فیلم و سریال‌های جدید دوبله به اینترنت نیاز است.'
      );
      return;
    }

    const queryText = mode === 'music' ? (customMoodOverride ?? musicMood) : movieGenre;
    if (mode === 'music') setMusicBusy(true);
    else setMovieBusy(true);

    try {
      const res = await fetch(apiUrl('/api/night-discover'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          mode,
          moodOrGenre: queryText,
          mediaType: movieMediaType,
        }),
      });
      const parsed = await safeReadJsonResponse<NightDiscoveryResponse & {error?: string}>(res);
      if (parsed.isHtml || !parsed.data) {
        throw new Error('سرور جستجو موقتاً در دسترس نیست؛ لطفاً دوباره امتحان کنید.');
      }
      const data = parsed.data;
      if (!res.ok) throw new Error(data.error || 'خطا در جستجو');
      onSaveNightResult(data);
      if (mode === 'music') {
        const list = Array.isArray(data.tracks)
          ? data.tracks.filter((t) => !t.isLiveStream && t.source !== 'radio')
          : [];
        if (list.length > 0) {
          onStatusToast(`${toPersianDigits(list.length)} قطعه موسیقی پیدا شد — روی هر کدام بزنید تا پخش شود.`);
          stopMusicPlayback();
          setCurrentMusicIndex(-1);
          if (autoPlayFirst) startMusicAtIndex(0, list);
        } else {
          onStatusToast('قطعه‌ای پیدا نشد؛ عبارت ساده‌تری مثل «پیانو» یا «شجریان» را امتحان کنید.');
        }
      } else {
        onStatusToast('پیشنهادهای فیلم و سریال دوبله با امتیاز بالا آماده شد.');
      }
    } catch (err) {
      onStatusToast(err instanceof Error ? err.message : 'خطا در جستجوی شبانه.');
    } finally {
      if (mode === 'music') setMusicBusy(false);
      else setMovieBusy(false);
    }
  };

  const lastAssistantTriggerRef = useRef<number>(0);
  useEffect(() => {
    if (!assistantMediaTrigger || assistantMediaTrigger.nonce === lastAssistantTriggerRef.current) return;
    if (Date.now() - assistantMediaTrigger.nonce > 10000) return;
    lastAssistantTriggerRef.current = assistantMediaTrigger.nonce;
    if (assistantMediaTrigger.tab !== 'stop') setMediaTab(assistantMediaTrigger.tab);
    if (assistantMediaTrigger.tab === 'stop') {
      stopMusicPlayback();
      stopRadioPlayback();
    }
    if (assistantMediaTrigger.tab === 'radio') {
      const requested = assistantMediaTrigger.query?.trim() || '';
      const cat: RadioCategory =
        requested === 'world' ? 'world' : requested === 'chill' ? 'chill' : requested === 'iran' ? 'iran' : 'custom';
      if (isOnline) {
        handleFetchRadio(cat, cat === 'custom' ? requested : '', true);
      } else if (radioStations.length > 0) {
        startRadioAtIndex(0, radioStations);
      }
    } else if (assistantMediaTrigger.tab === 'tracks') {
      const q = assistantMediaTrigger.query?.trim();
      if (q && isOnline) {
        setMusicMood(q);
        handleDiscoverNight('music', q, true);
      } else if (tracks.length > 0 && currentMusicIndex === -1) {
        startMusicAtIndex(0, tracks);
      }
    }
  }, [assistantMediaTrigger]);

  const sleepClock =
    sleepRemainingSec !== null
      ? `${toPersianDigits(String(Math.floor(sleepRemainingSec / 60)).padStart(2, '0'))}:${toPersianDigits(
          String(sleepRemainingSec % 60).padStart(2, '0')
        )}`
      : null;

  const isAnyAudioPlaying = mediaTab === 'radio' ? isRadioPlaying : isMusicPlaying;
  const currentTabActiveItem = mediaTab === 'radio' ? activeRadioStation : activeMusicTrack;
  const currentTabIsPlaying = mediaTab === 'radio' ? isRadioPlaying : isMusicPlaying;
  const currentTabIsLoading = mediaTab === 'radio' ? isRadioLoading : isMusicLoading;

  // Sync MediaSession metadata & lockscreen/notification transport controls for Music & Live Radio
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const activeItem = isRadioPlaying
      ? activeRadioStation
      : isMusicPlaying
        ? activeMusicTrack
        : currentTabActiveItem;
    if (!activeItem) {
      try {
        ms.playbackState = 'none';
      } catch {
        // ignore
      }
      return;
    }
    const mode = activeItem === activeRadioStation && (isRadioPlaying || mediaTab === 'radio') ? 'radio' : 'tracks';
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
      // MediaSession not supported in this WebView/browser
    }
  });

  return (
    <div className="space-y-8">
      {/* Isolated HTMLAudioElement #1: Music Only */}
      <audio
        ref={musicAudioRef}
        preload="none"
        onTimeUpdate={() => {
          if (musicAudioRef.current) setMusicTimeSec(musicAudioRef.current.currentTime || 0);
        }}
        onLoadedMetadata={() => {
          if (musicAudioRef.current && Number.isFinite(musicAudioRef.current.duration) && musicAudioRef.current.duration > 0) {
            setMusicDurationSec(musicAudioRef.current.duration);
          }
          setIsMusicLoading(false);
        }}
        onCanPlay={() => setIsMusicLoading(false)}
        onEnded={() => {
          if (tracks.length > 1) {
            handleNextMusic();
          } else {
            setIsMusicPlaying(false);
            setMusicTimeSec(0);
          }
        }}
        onError={handleMusicError}
      />

      {/* Isolated HTMLAudioElement #2: Live Radio Only */}
      <audio
        ref={radioAudioRef}
        preload="none"
        onCanPlay={() => setIsRadioLoading(false)}
        onPlaying={() => {
          setIsRadioLoading(false);
          setIsRadioPlaying(true);
        }}
        onEnded={() => {
          setIsRadioPlaying(false);
        }}
        onError={handleRadioError}
      />

      {/* Top-Level Luxury Media Category Header */}
      <section className="luxury-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-amber-300">
              <Music2 className="w-4 h-4" />
              <span>مرکز چندرسانه‌ای و پیام هم‌صدا</span>
            </div>
            <h1 className="mt-1 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
              موسیقی، رادیو زنده، پادکست، پیشنهاد فیلم و پیام‌ساز
            </h1>
          </div>
          {isAnyAudioPlaying && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-800 text-white text-xs font-semibold shrink-0">
              <Disc3 className="w-3.5 h-3.5 animate-spin text-amber-300" />
              <span>در حال پخش: {currentTabActiveItem?.title || 'صدا'}</span>
            </div>
          )}
        </div>

        {/* 6 Clear Professional Categories */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={() => setMediaTab('tracks')}
            className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              mediaTab === 'tracks'
                ? 'bg-emerald-800 border-emerald-800 text-white shadow-sm'
                : 'luxury-surface-subtle text-slate-700 dark:text-slate-200 hover:border-emerald-600/40'
            }`}
          >
            <Music2 className={`w-4 h-4 shrink-0 ${mediaTab === 'tracks' ? 'text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`} />
            <span className="whitespace-nowrap">موسیقی کامل</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMediaTab('radio');
              if (radioStations.length === 0 && !radioBusy && isOnline) {
                handleFetchRadio('iran');
              }
            }}
            className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              mediaTab === 'radio'
                ? 'bg-emerald-800 border-emerald-800 text-white shadow-sm'
                : 'luxury-surface-subtle text-slate-700 dark:text-slate-200 hover:border-emerald-600/40'
            }`}
          >
            <Radio className={`w-4 h-4 shrink-0 ${mediaTab === 'radio' ? 'text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`} />
            <span className="whitespace-nowrap">رادیو زنده</span>
          </button>

          <button
            type="button"
            onClick={() => setMediaTab('podcasts')}
            className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              mediaTab === 'podcasts'
                ? 'bg-emerald-800 border-emerald-800 text-white shadow-sm'
                : 'luxury-surface-subtle text-slate-700 dark:text-slate-200 hover:border-emerald-600/40'
            }`}
          >
            <Podcast className={`w-4 h-4 shrink-0 ${mediaTab === 'podcasts' ? 'text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`} />
            <span className="whitespace-nowrap">پادکست و کتاب</span>
          </button>

          <button
            type="button"
            onClick={() => setMediaTab('movies')}
            className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              mediaTab === 'movies'
                ? 'bg-emerald-800 border-emerald-800 text-white shadow-sm'
                : 'luxury-surface-subtle text-slate-700 dark:text-slate-200 hover:border-emerald-600/40'
            }`}
          >
            <Film className={`w-4 h-4 shrink-0 ${mediaTab === 'movies' ? 'text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`} />
            <span className="whitespace-nowrap">فیلم و سریال امشب</span>
          </button>

          <button
            type="button"
            onClick={() => setMediaTab('messages')}
            className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              mediaTab === 'messages'
                ? 'bg-emerald-800 border-emerald-800 text-white shadow-sm'
                : 'luxury-surface-subtle text-slate-700 dark:text-slate-200 hover:border-emerald-600/40'
            }`}
          >
            <MessageSquareHeart className={`w-4 h-4 shrink-0 ${mediaTab === 'messages' ? 'text-amber-300' : 'text-amber-600 dark:text-amber-400'}`} />
            <span className="whitespace-nowrap">پیام‌ساز</span>
          </button>

          <button
            type="button"
            onClick={() => setMediaTab('gta6')}
            className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
              mediaTab === 'gta6'
                ? 'bg-emerald-800 border-emerald-800 text-white shadow-sm'
                : 'luxury-surface-subtle text-slate-700 dark:text-slate-200 hover:border-emerald-600/40'
            }`}
          >
            <Gamepad2 className={`w-4 h-4 shrink-0 ${mediaTab === 'gta6' ? 'text-amber-300' : 'text-violet-700 dark:text-violet-400'}`} />
            <span className="whitespace-nowrap">استریم GTA 6</span>
          </button>
        </div>
      </section>

      {/* Section: Special Occasion Message Builder (dedicated Messages category) */}
      {mediaTab === 'messages' && (
        <section className="luxury-card p-6 sm:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <MessageSquareHeart className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>ساخت متن و پیام صوتی مناسبتی (آنلاین و آفلاین)</span>
              </div>
              <h2 className="mt-2 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
                پیام‌ساز مناسبتی و متن‌های خاص
              </h2>
              <p className="mt-1.5 text-sm leading-7 text-slate-600 dark:text-slate-300 max-w-3xl">
                برای تبریک تولد، سالگرد، تشکر، دلجویی یا هر مناسبت دلخواه متن صمیمی و زیبا بسازید، کپی کنید یا با صدای گوینده خانم/آقا گوش دهید.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOccasion(item.id)}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  occasion === item.id
                    ? 'bg-emerald-800 text-white'
                    : 'luxury-surface-subtle text-slate-700 dark:text-slate-200 hover:border-emerald-600/40'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-3.5">
              {occasion === 'custom' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    موضوع یا مناسبت دلخواه
                  </label>
                  <input
                    type="text"
                    value={customOccasionText}
                    onChange={(e) => setCustomOccasionText(e.target.value)}
                    placeholder="مثلاً: تبریک خانه نو، عید نوروز، قبولی آزمون..."
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    برای چه کسی؟
                  </label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => {
                      recipientEditedRef.current = true;
                      setRecipient(e.target.value);
                    }}
                    placeholder={`مثلاً: ${defaultRecipient}، مادرم، علی آقا`}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    لحن متن
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs sm:text-sm text-slate-800 dark:text-slate-100"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  نکته یا اشاره خاص (اختیاری)
                </label>
                <textarea
                  rows={2}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="مثلاً: یادآوری سفر شمال یا تشکر بابت صبوری‌های امسال..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateSpecialMessage}
                disabled={msgBusy}
                className="w-full min-h-[46px] rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {msgBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{isOnline ? 'تولید پیام خاص هوشمند' : 'ساخت پیام با قالب آماده آفلاین'}</span>
              </button>
            </div>

            <div className="lg:col-span-7 rounded-xl luxury-surface-subtle p-5 flex flex-col justify-between gap-4">
              {msgResult ? (
                <>
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-emerald-800 dark:text-amber-300">
                      {msgResult.occasion} · {msgResult.title}
                    </div>
                    <p className="text-sm sm:text-base leading-8 text-slate-800 dark:text-slate-100">
                      {msgResult.text}
                    </p>
                    <div className="pt-3 border-t border-[#E6E2D8] dark:border-emerald-950/60">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        نسخه کوتاه برای پیامک:
                      </div>
                      <p className="mt-1 text-xs sm:text-sm leading-7 text-slate-700 dark:text-slate-300">
                        {msgResult.shortVersion}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    {isSpeaking ? (
                      <button
                        type="button"
                        onClick={onStopSpeech}
                        className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                      >
                        <Square className="w-4 h-4" />
                        <span>توقف پخش</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSpeakText(msgResult.text, msgResult.title, 'custom')}
                        className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>شنیدن پیام با صدای گوینده</span>
                      </button>
                    )}

                    <select
                      value={msgVoice}
                      onChange={(e) => {
                        const v = e.target.value as VoiceName;
                        setMsgVoice(v);
                        onUpdateSettings({defaultVoice: v});
                      }}
                      aria-label="گوینده پیام مناسبتی"
                      className="min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-xs text-slate-700 dark:text-slate-200"
                    >
                      {VOICE_PERSONAS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msgResult.text)}
                      className="min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium flex items-center gap-2 cursor-pointer"
                    >
                      {copiedMsg ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      <span>کپی متن کامل</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  مناسبت و نام مخاطب را انتخاب کنید تا متن اختصاصی آماده شود.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Section: Music & Live Radio (full-width balanced luxury player + artwork grid) */}
      {(mediaTab === 'tracks' || mediaTab === 'radio') && (
        <section className="luxury-card p-6 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {mediaTab === 'radio' ? (
                    <Globe className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  ) : (
                    <Music2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  )}
                  <span>
                    {mediaTab === 'radio'
                      ? 'اتصال زنده به رادیوهای ایران، فارسی و برترین ایستگاه‌های جهان'
                      : 'پخش مستقیم آنلاین آهنگ‌های کامل با تایمر خواب'}
                  </span>
                </div>
                <h2 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-white">
                  {mediaTab === 'radio' ? 'رادیوهای ایران و جهان (پخش زنده)' : 'پلی‌لیست موسیقی و آهنگ‌های واقعی'}
                </h2>
              </div>

              <div className="flex items-center gap-1.5 text-xs shrink-0">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sleepMinutes}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSleepMinutes(val);
                    if (isAnyAudioPlaying) {
                      setSleepRemainingSec(val > 0 ? val * 60 : null);
                    }
                  }}
                  aria-label="تایمر خواب"
                  className="min-h-[36px] px-2 py-1 rounded-lg border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-xs"
                >
                  <option value={15}>۱۵ دقیقه</option>
                  <option value={30}>۳۰ دقیقه</option>
                  <option value={45}>۴۵ دقیقه</option>
                  <option value={0}>پیوسته</option>
                </select>
                {sleepClock && (
                  <span className="font-mono-num text-emerald-700 dark:text-emerald-400 font-semibold">
                    {sleepClock}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl luxury-surface-subtle">
              <button
                type="button"
                onClick={() => setMediaTab('tracks')}
                className={`min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  mediaTab === 'tracks'
                    ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Music2 className="w-3.5 h-3.5" />
                <span>آهنگ‌های کامل</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMediaTab('radio');
                  if (radioStations.length === 0 && !radioBusy && isOnline) {
                    handleFetchRadio('iran');
                  }
                }}
                className={`min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  mediaTab === 'radio'
                    ? 'bg-white dark:bg-[#172724] text-emerald-800 dark:text-emerald-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>رادیوهای ایران و جهان</span>
              </button>
            </div>

          {mediaTab === 'tracks' ? (
            <>
              {/* Song Search Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleDiscoverNight('music');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={musicMood}
                  onChange={(e) => setMusicMood(e.target.value)}
                  placeholder="نام خواننده، آهنگ یا حال‌وهوا (مثلاً شجریان، پیانو)..."
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-xs sm:text-sm text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={musicBusy}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
                >
                  {musicBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>ساخت پلی‌لیست</span>
                </button>
              </form>

              {/* Mood Quick Chips */}
              <div className="flex flex-wrap gap-1.5">
                {MUSIC_MOOD_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={musicBusy}
                    onClick={() => {
                      setMusicMood(preset);
                      handleDiscoverNight('music', preset);
                    }}
                    className="min-h-[34px] px-3 rounded-lg bg-slate-100 dark:bg-[#0B1312] hover:bg-emerald-50 dark:hover:bg-emerald-950/60 border border-slate-200/70 dark:border-emerald-900/60 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Live Radio Search Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!radioQuery.trim()) {
                    handleFetchRadio(radioCategory);
                  } else {
                    handleFetchRadio('custom', radioQuery.trim());
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={radioQuery}
                  onChange={(e) => setRadioQuery(e.target.value)}
                  placeholder="نام ایستگاه، کشور یا سبک (مثلاً ایران، تهران، Jazz، ترکیه)..."
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-xs sm:text-sm text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={radioBusy}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
                >
                  {radioBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                  <span>جستجوی رادیو</span>
                </button>
              </form>

              {/* Radio Category Chips */}
              <div className="flex flex-wrap gap-1.5">
                {RADIO_CATEGORY_PRESETS.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={radioBusy}
                    onClick={() => handleFetchRadio(cat.id, '')}
                    className={`min-h-[34px] px-3 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                      radioCategory === cat.id
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : 'bg-slate-100 dark:bg-[#0B1312] hover:bg-emerald-50 dark:hover:bg-emerald-950/60 border-slate-200/70 dark:border-emerald-900/60 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {radioNotice && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                  {radioNotice}
                </div>
              )}
            </>
          )}

          {/* Isolated Active Player Card (Strictly Music in Music tab, Strictly Radio in Radio tab) */}
          {currentTabActiveItem && (
            <div className="rounded-xl bg-emerald-950 text-white p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-900/80 flex items-center justify-center overflow-hidden shrink-0">
                  {currentTabActiveItem.artworkUrl && !failedArtIds[currentTabActiveItem.id] ? (
                    <img
                      src={currentTabActiveItem.artworkUrl}
                      alt={currentTabActiveItem.title}
                      referrerPolicy="no-referrer"
                      onError={() => setFailedArtIds((p) => ({...p, [currentTabActiveItem.id]: true}))}
                      className="w-full h-full object-cover"
                    />
                  ) : mediaTab === 'radio' ? (
                    <Radio className={`w-6 h-6 text-emerald-300 ${currentTabIsPlaying ? 'animate-pulse' : ''}`} />
                  ) : (
                    <Disc3 className={`w-6 h-6 text-emerald-300 ${currentTabIsPlaying ? 'animate-spin' : ''}`} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{currentTabActiveItem.title}</div>
                  <div className="text-xs text-emerald-200/80 truncate">
                    {currentTabActiveItem.artist} · {sourceLabel(currentTabActiveItem)}
                  </div>
                </div>
                {mediaTab === 'radio' && (
                  <span className="px-2 py-1 rounded-md bg-emerald-800 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                    <Radio className="w-3 h-3" />
                    <span>پخش زنده</span>
                  </span>
                )}
              </div>

              {mediaTab === 'tracks' && (
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, Math.floor(musicDurationSec || currentTabActiveItem.durationSec || 180))}
                    value={Math.floor(musicTimeSec)}
                    onChange={handleSeek}
                    aria-label="نوار زمان پخش"
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-mono-num text-emerald-200/80">
                    <span>{formatTrackClock(musicTimeSec)}</span>
                    <span>{formatTrackClock(musicDurationSec || currentTabActiveItem.durationSec || 0)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={mediaTab === 'radio' ? handlePrevRadio : handlePrevMusic}
                  aria-label="مورد قبلی"
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    togglePlayItem(
                      mediaTab === 'radio' ? currentRadioIndex : currentMusicIndex,
                      mediaTab === 'radio' ? 'radio' : 'tracks'
                    )
                  }
                  aria-label={currentTabIsPlaying ? 'توقف موقت' : 'پخش'}
                  className="min-w-[52px] min-h-[44px] px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {currentTabIsLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : currentTabIsPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={mediaTab === 'radio' ? handleNextRadio : handleNextMusic}
                  aria-label="مورد بعدی"
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={mediaTab === 'radio' ? stopRadioPlayback : stopMusicPlayback}
                  aria-label="توقف کامل"
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-rose-600/80 flex items-center justify-center cursor-pointer"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          </div>

          <div className="lg:col-span-7">
          {mediaTab === 'tracks' && (nightMusicResult?.links?.length ?? 0) > 0 && (
            <div className="mb-4 rounded-xl border border-slate-200 dark:border-emerald-900/60 p-3 space-y-2">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">صفحه‌های پیدا شده در سایت‌های موسیقی</div>
              <div className="flex flex-wrap gap-2">
                {nightMusicResult!.links.slice(0, 12).map((link, index) => (
                  <a key={link.url + index} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs rounded-lg px-3 py-2 bg-slate-100 dark:bg-[#0B1312] text-emerald-800 dark:text-emerald-300 hover:underline break-all">
                    {link.title}
                  </a>
                ))}
              </div>
            </div>
          )}
          {/* Playable Tracklist or Radio Stations (Visual Cover Grid or Compact List) */}
          {(mediaTab === 'radio' ? radioStations : tracks).length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {toPersianDigits((mediaTab === 'radio' ? radioStations : tracks).length)}{' '}
                  {mediaTab === 'radio' ? 'ایستگاه آماده پخش' : 'قطعه پیدا شد'}
                </span>
                <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B1312]">
                  <button
                    type="button"
                    onClick={() => setMediaViewMode('grid')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      mediaViewMode === 'grid'
                        ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>شبکه کاور</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaViewMode('list')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      mediaViewMode === 'list'
                        ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>لیست</span>
                  </button>
                </div>
              </div>

              {mediaViewMode === 'grid' ? (
                <div className="max-h-[460px] overflow-y-auto pr-0.5">
                  <SearchArtworkGrid
                    columnsClassName="grid-cols-2 sm:grid-cols-3"
                    items={(mediaTab === 'radio' ? radioStations : tracks).map(
                      (track, idx): SearchArtworkItem => {
                        const isSelected =
                          mediaTab === 'radio' ? currentRadioIndex === idx : currentMusicIndex === idx;
                        const playingNow =
                          isSelected && (mediaTab === 'radio' ? isRadioPlaying : isMusicPlaying);
                        const loadingNow =
                          isSelected && (mediaTab === 'radio' ? isRadioLoading : isMusicLoading);
                        const metaParts = [
                          sourceLabel(track),
                          mediaTab === 'tracks' && track.durationSec
                            ? formatTrackClock(track.durationSec)
                            : '',
                        ].filter(Boolean);
                        return {
                          id: `${mediaTab}-${track.id}-${idx}`,
                          title: track.title,
                          subtitle: track.artist,
                          metaText: metaParts.join(' · '),
                          artworkUrl: track.artworkUrl,
                          externalUrl: track.externalUrl,
                          kind: mediaTab === 'radio' ? 'radio' : 'music',
                          isActive: isSelected,
                          isPlaying: playingNow,
                          isLoading: loadingNow,
                        };
                      }
                    )}
                    onSelect={(item) => {
                      const list = mediaTab === 'radio' ? radioStations : tracks;
                      const idx = list.findIndex(
                        (t, i) => `${mediaTab}-${t.id}-${i}` === item.id
                      );
                      if (idx >= 0) togglePlayItem(idx, mediaTab === 'radio' ? 'radio' : 'tracks');
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-2 max-h-[430px] overflow-y-auto pr-0.5">
                  {(mediaTab === 'radio' ? radioStations : tracks).map((track, idx) => {
                const isSelected =
                  mediaTab === 'radio' ? currentRadioIndex === idx : currentMusicIndex === idx;
                const playingNow = isSelected && (mediaTab === 'radio' ? isRadioPlaying : isMusicPlaying);
                const loadingNow = isSelected && (mediaTab === 'radio' ? isRadioLoading : isMusicLoading);
                return (
                  <div
                    key={track.id}
                    className={`rounded-xl border p-2.5 flex items-center gap-2.5 transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500/70 dark:border-emerald-700'
                        : 'bg-slate-50/70 dark:bg-[#0B1312] border-slate-200/80 dark:border-emerald-900/60 hover:bg-slate-100/80 dark:hover:bg-emerald-950/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => togglePlayItem(idx, mediaTab === 'radio' ? 'radio' : 'tracks')}
                      className="flex-1 min-w-0 flex items-center gap-3 text-right cursor-pointer min-h-[44px]"
                    >
                      <div className="w-11 h-11 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center overflow-hidden shrink-0">
                        {track.artworkUrl && !failedArtIds[track.id] ? (
                          <img
                            src={track.artworkUrl}
                            alt={track.title}
                            referrerPolicy="no-referrer"
                            onError={() => setFailedArtIds((p) => ({...p, [track.id]: true}))}
                            className="w-full h-full object-cover"
                          />
                        ) : mediaTab === 'radio' ? (
                          <Radio className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                        ) : (
                          <Music2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {track.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {track.artist} · {sourceLabel(track)}
                          {mediaTab === 'tracks' && track.durationSec ? ` · ${formatTrackClock(track.durationSec)}` : ''}
                        </div>
                      </div>

                      <span
                        className={`min-w-[38px] min-h-[38px] rounded-lg flex items-center justify-center shrink-0 ${
                          playingNow
                            ? 'bg-emerald-700 text-white'
                            : 'bg-white dark:bg-[#121E1C] border border-slate-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {loadingNow ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : playingNow ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </span>
                    </button>

                    {mediaTab === 'radio' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRadioStation(track.id)}
                        aria-label={`حذف رادیو ${track.title}`}
                        title="حذف این رادیو از لیست (با جستجو دوباره می‌آید)"
                        className="min-w-[40px] min-h-[40px] rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    {track.externalUrl && (
                      <a
                        href={track.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`صفحه ${track.title}`}
                        className="min-w-[36px] min-h-[36px] rounded-lg text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center justify-center shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#DFDBD0] dark:border-emerald-900/70 py-12 px-4 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {mediaTab === 'radio'
                ? 'ایستگاهی در لیست نیست. روی «رادیوهای ایران و فارسی» بزنید یا نام ایستگاه را جستجو کنید تا دوباره اضافه شوند.'
                : 'نام خواننده یا حال‌وهوای دلخواه را بنویسید (یا یکی از دکمه‌های بالا را بزنید) تا پلی‌لیست موسیقی واقعی ساخته شود.'}
            </div>
          )}
          </div>
        </section>
      )}

      {/* High-Rated Dubbed Movies & Series Discovery */}
      {mediaTab === 'movies' && (
        <section className="luxury-card p-6 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Film className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>پیشنهادگر هوشمند فیلم و سریال دوبله فارسی (امتیاز بالای IMDb)</span>
              </div>
              <h2 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-white">
                فیلم و سریال‌های دوبله و باکیفیت امشب
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-emerald-950/70 rounded-xl shrink-0">
              {(
                [
                  {id: 'both', label: 'فیلم و سریال'},
                  {id: 'movie', label: 'سینمایی'},
                  {id: 'series', label: 'سریال'},
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMovieMediaType(m.id)}
                  className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                    movieMediaType === m.id
                      ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50/80 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <BellRing className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  اطلاع‌رسانی خودکار شبانه فیلم و سریال دوبله
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  هر شب در ساعت انتخابی، جدیدترین و باامتیازترین آثار دوبله فارسی را خودکار پیدا کرده و خبر می‌دهد
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                type="time"
                value={settings.nightMovieTime || '22:00'}
                onChange={(e) => onUpdateSettings({nightMovieTime: e.target.value})}
                className="min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-xs font-mono-num text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => onUpdateSettings({nightMovieAutoCheck: !settings.nightMovieAutoCheck})}
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  settings.nightMovieAutoCheck
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-200 dark:bg-emerald-950 text-slate-700 dark:text-slate-300'
                }`}
              >
                {settings.nightMovieAutoCheck ? 'خبر خودکار فعال' : 'خاموش'}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={movieGenre}
              onChange={(e) => setMovieGenre(e.target.value)}
              placeholder="ژانر یا حال‌وهوای امشب (مثلاً معمایی، کمدی خانوادگی، علمی‌تخیلی)..."
              className="flex-1 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
            />
            <button
              type="button"
              disabled={movieBusy}
              onClick={() => handleDiscoverNight('movies')}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-60"
            >
              {movieBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>پیدا کن با دوبله فارسی</span>
            </button>
          </div>

          {nightMoviesResult ? (
            <div className="rounded-xl bg-slate-50/80 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Moon className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>{nightMoviesResult.title}</span>
                </div>
                {isSpeaking ? (
                  <button
                    type="button"
                    onClick={onStopSpeech}
                    className="min-h-[38px] px-3 rounded-xl bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>توقف</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onSpeakText(nightMoviesResult.spokenSummary, nightMoviesResult.title, 'custom')
                    }
                    className="min-h-[38px] px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>خواندن پیشنهادها با گوینده</span>
                  </button>
                )}
              </div>

              <div className="text-xs sm:text-sm leading-7 text-slate-700 dark:text-slate-200 whitespace-pre-line">
                {nightMoviesResult.markdownText}
              </div>

              {nightMoviesResult.links.length > 0 && (
                <div className="pt-3 border-t border-slate-200/70 dark:border-emerald-950/60 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    منابع معتبر معرفی و جزئیات امتیاز:
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {nightMoviesResult.links.map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[260px]">{l.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#DFDBD0] dark:border-emerald-900/70 py-10 px-4 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              روی «پیدا کن با دوبله فارسی» بزنید تا جدیدترین فیلم‌ها و سریال‌های دوبله با امتیاز بالای IMDb جستجو و خلاصه شوند.
            </div>
          )}
        </section>
      )}

      {mediaTab === 'gta6' && <GTA6StreamsView />}
      <div className={mediaTab === 'podcasts' ? '' : 'hidden'}>
        <PodcastLibraryView
          isOnline={isOnline}
          onStatusToast={onStatusToast}
          searchTrigger={
            assistantMediaTrigger?.tab === 'podcasts'
              ? {query: assistantMediaTrigger.query, nonce: assistantMediaTrigger.nonce}
              : null
          }
          stopTrigger={assistantMediaTrigger?.tab === 'stop' ? assistantMediaTrigger.nonce : null}
        />
      </div>
    </div>
  );
};
