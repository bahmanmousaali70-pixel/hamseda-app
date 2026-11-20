import React, {useEffect, useRef, useState} from 'react';
import {Capacitor, registerPlugin} from '@capacitor/core';
import {ExternalLink, Film, Maximize, Play, Search, Tv} from 'lucide-react';

type RecentItem = {url: string; title: string; playedAt: number};
const STORAGE_KEY = 'hamseda_cinema_recent_v1';

type CinemaCastDevice = {id: string; name: string; address: string; isTV: boolean};
type CinemaCastPlugin = {
  discoverDevices: (options?: {timeoutMs?: number}) => Promise<{ok: boolean; devices: CinemaCastDevice[]; error?: string}>;
  castToDevice: (options: {deviceId: string; url: string; title?: string}) => Promise<{ok: boolean; error?: string; deviceName?: string}>;
  controlPlayback: (options: {action: 'play' | 'pause' | 'stop'; value?: number}) => Promise<{ok: boolean; error?: string}>;
  getPlaybackState: () => Promise<{ok: boolean; connected?: boolean; deviceName?: string; playbackState?: string; isPlaying?: boolean; isPaused?: boolean; error?: string}>;
  openSystemCastSettings: () => Promise<{ok: boolean; error?: string}>;
};
const CinemaCast = registerPlugin<CinemaCastPlugin>('CinemaCast');

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
  const [castDevices, setCastDevices] = useState<CinemaCastDevice[]>([]);
  const [selectedCastDevice, setSelectedCastDevice] = useState('');
  const [isDiscoveringCast, setIsDiscoveringCast] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [castStatus, setCastStatus] = useState('');
  const [projectorHost, setProjectorHost] = useState('');
  const [projectorPin, setProjectorPin] = useState('');
  const [projectorToken, setProjectorToken] = useState('');
  const [projectorRemoteStatus, setProjectorRemoteStatus] = useState('');
  const [projectorResults, setProjectorResults] = useState<Array<{id:string;title:string;year?:string}>>([]);
  const remotePointerLast = useRef(0);
  const [castPlaybackState, setCastPlaybackState] = useState('');
  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const playerShellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);


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
    if (!isWebVideoUrl(clean)) {
      setPlayerError('برای پخش مستقیم، لینک معتبر http یا https وارد کن. لینک صفحه سایت‌ها لزوماً لینک ویدئو نیست.');
      return;
    }
    setPlayerError('');
    setSourceUrl(clean);
    setActiveUrl(clean);
    setRecent((items) => [
      {url: clean, title: new URL(clean).hostname, playedAt: Date.now()},
      ...items.filter((item) => item.url !== clean),
    ].slice(0, 12));
  };

  const cinemaSources = [
    {name:'آپارات', domain:'aparat.com', kind:'ویدئوهای عمومی و رایگان', mode:'free'},
    {name:'نماشا', domain:'namasha.com', kind:'ویدئوهای عمومی و رایگان', mode:'free'},
    {name:'تلوبیون', domain:'telewebion.com', kind:'پخش زنده و آرشیو برنامه‌ها', mode:'free'},
    {name:'تماشاخونه', domain:'tmk.ir', kind:'گزینه‌های رایگان و اشتراکی؛ بررسی عنوان', mode:'mixed'},
    {name:'گپ‌فیلم', domain:'gapfilm.ir', kind:'فیلم و سریال؛ وضعیت دسترسی متغیر', mode:'mixed'},
    {name:'فیلیمو', domain:'filimo.com', kind:'فیلم و سریال با اشتراک رسمی', mode:'paid'},
    {name:'نماوا', domain:'namava.ir', kind:'فیلم و سریال دوبله و زیرنویس؛ اشتراک', mode:'paid'},
    {name:'فیلم‌نت', domain:'filmnet.ir', kind:'فیلم و سریال؛ اشتراک', mode:'paid'},
    {name:'شیدا', domain:'sheyda.com', kind:'فیلم و سریال؛ بررسی دسترسی عنوان', mode:'mixed'},
    {name:'لنز', domain:'lenz.ir', kind:'تلویزیون اینترنتی و محتوای ویدئویی', mode:'mixed'},
    {name:'دیجیتون', domain:'digitoon.tv', kind:'انیمیشن و محتوای کودک', mode:'mixed'},
    {name:'آفرینک', domain:'afarinak.com', kind:'محتوای کودک و انیمیشن', mode:'mixed'},
  ];
  const searchAllSources = () => {
    const term = query.trim();
    if (!term) { setPlayerError('اول نام فیلم یا سریال را بنوی.'); return; }
    setPlayerError('');
    const domains = cinemaSources.map((source) => `site:${source.domain}`).join(' OR ');
    const search = `"${term}" (رایگان OR رایگان قانونی OR انتشار رسمی OR دوبله فارسی OR دوبله OR فارسی OR فیلم کامل OR تماشای آنلاین) (${domains})`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(search)}`, '_blank', 'noopener,noreferrer');
  };
  const searchOneSource = (domain: string) => {
    const term = query.trim();
    if (!term) { setPlayerError('اول نام فیلم یا سریال را بنوی.'); return; }
    const search = `"${term}" (رایگان OR رایگان قانونی OR انتشار رسمی OR دوبله فارسی OR دوبله OR تماشای آنلاین OR فیلم کامل) site:${domain}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(search)}`, '_blank', 'noopener,noreferrer');
  };

  const discoverCastDevices = async () => {
    if (!isNativeAndroid) {
      setCastStatus('جستجوی DLNA فقط در نسخه نصب‌شده اندروید فعال است.');
      return;
    }
    setIsDiscoveringCast(true);
    setCastStatus('در حال جستجوی پروژکتورها و تلویزیون‌های سازگار در همین شبکه Wi-Fi…');
    try {
      const result = await CinemaCast.discoverDevices({timeoutMs: 6500});
      const devices = result.devices || [];
      setCastDevices(devices);
      setSelectedCastDevice((current) => devices.some((device) => device.id === current)
        ? current
        : (devices.find((device) => device.isTV) || devices[0])?.id || '');
      setCastStatus(result.ok
        ? (devices.length ? `${devices.length} دستگاه پیدا شد. دستگاه موردنظر را انتخاب کن.` : 'دستگاهی پیدا نشد؛ پروژکتور و گوشی باید به یک Wi-Fi وصل باشند و DLNA روشن باشد.')
        : (result.error || 'جستجوی دستگاه ناموفق بود.'));
    } catch {
      setCastStatus('ارتباط با سرویس DLNA برقرار نشد.');
    } finally {
      setIsDiscoveringCast(false);
    }
  };

  const castCurrentVideo = async () => {
    if (!isNativeAndroid || !selectedCastDevice || !activeUrl) return;
    setIsCasting(true);
    setCastStatus('در حال ارسال ویدئو به پروژکتور…');
    try {
      const result = await CinemaCast.castToDevice({
        deviceId: selectedCastDevice,
        url: activeUrl,
        title: 'سینمای هم‌صدا',
      });
      setCastStatus(result.ok
        ? `ویدئو به ${result.deviceName || 'دستگاه انتخاب‌شده'} ارسال شد.`
        : (result.error || 'پروژکتور ویدئو را نپذیرفت.'));
      if (result.ok) await refreshCastState();
    } catch {
      setCastStatus('ارسال ویدئو ناموفق بود؛ لینک و سازگاری فرمت را بررسی کن.');
    } finally {
      setIsCasting(false);
    }
  };

  const controlCastPlayback = async (action: 'play' | 'pause' | 'stop') => {
    try {
      const result = await CinemaCast.controlPlayback({action});
      setCastStatus(result.ok ? 'فرمان به پروژکتور ارسال شد.' : (result.error || 'فرمان اجرا نشد.'));
      await refreshCastState();
    } catch {
      setCastStatus('ارتباط کنترل با پروژکتور قطع است.');
    }
  };

  const refreshCastState = async () => {
    if (!isNativeAndroid) return;
    try {
      const state = await CinemaCast.getPlaybackState();
      if (state.ok && state.connected) {
        setCastPlaybackState(state.playbackState || 'connected');
      } else {
        setCastPlaybackState('');
      }
    } catch {
      setCastPlaybackState('');
    }
  };

  const openSystemCast = async () => {
    if (!isNativeAndroid) {
      setCastStatus('تنظیمات نمایش بی‌سیم از نسخه اندرویدی برنامه قابل بازشدن است.');
      return;
    }
    const result = await CinemaCast.openSystemCastSettings();
    if (!result.ok) setCastStatus(result.error || 'تنظیمات نمایش بی‌سیم باز نشد.');
  };

  const projectorApi = async (path: string, body?: Record<string, unknown>) => {
    const host = projectorHost.trim().replace(/^https?:\\/\\//, '').replace(/\\/$/, '');
    const response = await fetch(`http://${host}:8765${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {'Content-Type':'application/json', ...(projectorToken ? {Authorization:`Bearer ${projectorToken}`} : {})},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'ارتباط با پروژکتور برقرار نشد.');
    return data;
  };

  const connectProjectorRemote = async () => {
    const host = projectorHost.trim().replace(/^https?:\\/\\//, '').replace(/\\/$/, '');
    if (!/^([0-9]{1,3}\\.){3}[0-9]{1,3}$/.test(host)) {
      setProjectorRemoteStatus('آدرس IP پروژکتور را مثل 192.168.1.50 وارد کن.');
      return;
    }
    try {
      const response = await fetch(`http://${host}:8765/api/pair`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({pin:projectorPin.trim()}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'کد اتصال اشتباه است.');
      setProjectorToken(data.token);
      setProjectorRemoteStatus('گوشی با پروژکتور جفت شد؛ حالا جست‌وجو کن.');
    } catch (error) {
      setProjectorRemoteStatus(error instanceof Error ? error.message : 'اتصال ناموفق بود. هر دو دستگاه باید روی یک Wi‑Fi باشند.');
    }
  };

  const searchOnProjector = async () => {
    if (!projectorToken) { setProjectorRemoteStatus('اول گوشی را به پروژکتور وصل کن.'); return; }
    if (!query.trim()) { setProjectorRemoteStatus('نام فیلم یا سریال را وارد کن.'); return; }
    try {
      setProjectorResults([]);
      await projectorApi('/api/search', {query:query.trim()});
      setProjectorRemoteStatus('جست‌وجو روی پروژکتور انجام می‌شود؛ فقط نتیجه‌های قابل پخش نمایش داده می‌شوند.');
    } catch (error) {
      setProjectorRemoteStatus(error instanceof Error ? error.message : 'جست‌وجو ارسال نشد.');
    }
  };

  const sendProjectorInput = async (payload: Record<string, unknown>) => {
    if (!projectorToken) return;
    try { await projectorApi('/api/input', payload); }
    catch (error) { setProjectorRemoteStatus(error instanceof Error ? error.message : 'ارتباط کنترل قطع شد.'); }
  };

  useEffect(() => {
    if (!projectorToken || !projectorHost) return;
    let active = true;
    const refreshResults = async () => {
      try {
        const items = await projectorApi('/api/results');
        if (active && Array.isArray(items)) setProjectorResults(items);
      } catch {
        if (active) setProjectorRemoteStatus('ارتباط با پروژکتور قطع شده؛ اتصال را دوباره برقرار کن.');
      }
    };
    refreshResults();
    const timer = window.setInterval(refreshResults, 1800);
    return () => { active = false; window.clearInterval(timer); };
  }, [projectorToken, projectorHost]);

  const sendProjectorPointer = (event: React.PointerEvent<HTMLDivElement>, click = false) => {
    const now = Date.now();
    if (!click && now - remotePointerLast.current < 75) return;
    remotePointerLast.current = now;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    void sendProjectorInput({action:click ? 'click' : 'move', x, y});
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
        نام فیلم یا سریال را جستجو کن تا منابع ویدئویی شناخته‌شده را یکجا بررسی کنی. نتیجه جستجو لینک همان منبع است؛ فقط عنوان‌هایی که پخش عمومی یا مجاز دارند داخل پخش‌کننده هم‌صدا اجرا می‌شوند.
      </div>

      <form onSubmit={(event) => {event.preventDefault(); searchAllSources();}} className="flex gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام فیلم یا سریال، دوبله فارسی، زیرنویس..." className="min-w-0 flex-1 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white" />
        <button type="submit" className="min-h-[44px] px-3 rounded-xl bg-red-600 text-white flex items-center gap-1.5"><Search className="w-4 h-4" /><span className="text-xs">جستجو</span></button>
      </form>
      <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/20 p-3 space-y-3">
        <div className="flex items-center gap-2"><Tv className="w-5 h-5 text-sky-700 dark:text-sky-300" /><h3 className="text-sm font-bold text-slate-900 dark:text-white">کنترل پروژکتور با همین گوشی</h3></div>
        <p className="text-[11px] leading-5 text-slate-600 dark:text-slate-300">روی پروژکتور هم‌صدا سینما را باز کن. آدرس IP و کد اتصال روی صفحه پروژکتور نمایش داده می‌شود. هر دو دستگاه باید به یک Wi‑Fi وصل باشند.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={projectorHost} onChange={e=>setProjectorHost(e.target.value)} dir="ltr" placeholder="IP پروژکتور، مثل 192.168.1.50" className="min-w-0 min-h-[42px] px-3 rounded-lg border border-slate-200 dark:border-sky-900 bg-white dark:bg-[#0B1312] text-sm" />
          <input value={projectorPin} onChange={e=>setProjectorPin(e.target.value.replace(/[^0-9]/g,'').slice(0,6))} inputMode="numeric" maxLength={6} placeholder="کد ۶ رقمی روی پروژکتور" className="min-w-0 min-h-[42px] px-3 rounded-lg border border-slate-200 dark:border-sky-900 bg-white dark:bg-[#0B1312] text-sm" />
        </div>
        <button type="button" onClick={connectProjectorRemote} className="min-h-[42px] px-4 rounded-lg bg-sky-700 text-white text-xs font-semibold">{projectorToken ? 'اتصال برقرار است' : 'اتصال به پروژکتور'}</button>
        {projectorToken && <form onSubmit={e=>{e.preventDefault();searchOnProjector();}} className="flex gap-2">
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="نام فیلم یا سریال برای جست‌وجو روی پروژکتور" className="min-w-0 flex-1 min-h-[42px] px-3 rounded-lg border border-slate-200 dark:border-sky-900 bg-white dark:bg-[#0B1312] text-sm" />
          <button type="submit" className="min-h-[42px] px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold">جست‌وجو</button>
        </form>}
        {projectorRemoteStatus && <p className="text-[11px] leading-5 text-sky-800 dark:text-sky-200">{projectorRemoteStatus}</p>}
        {projectorToken && <div className="space-y-2">
          <div className="text-xs font-bold text-slate-800 dark:text-white">نتیجه‌های قابل پخش روی پروژکتور ({projectorResults.length})</div>
          {projectorResults.map(item=><div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 dark:border-sky-900 p-2">
            <div className="min-w-0"><div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{item.title}</div><div className="text-[10px] text-emerald-700 dark:text-emerald-300">قابل پخش · {item.year || 'سال نامشخص'}</div></div>
            <button type="button" onClick={()=>projectorApi('/api/play',{id:item.id}).then(()=>setProjectorRemoteStatus('درخواست پخش به پروژکتور ارسال شد.')).catch(err=>setProjectorRemoteStatus(err.message))} className="shrink-0 min-h-[36px] px-3 rounded-lg bg-emerald-700 text-white text-[11px]">پخش</button>
          </div>)}
        </div>}
        {projectorToken && <div className="space-y-2">
          <div className="text-xs font-bold text-slate-800 dark:text-white">تاچ‌پد موس</div>
          <div onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);sendProjectorPointer(e);}} onPointerMove={e=>{if(e.buttons)sendProjectorPointer(e);}} onPointerUp={e=>sendProjectorPointer(e,true)} style={{touchAction:'none'}} className="h-28 rounded-xl border-2 border-dashed border-sky-400 bg-slate-900/10 flex items-center justify-center text-xs text-slate-600 dark:text-slate-300">برای حرکت نشانگر لمس و بکش؛ برای کلیک رها کن</div>
          <div className="grid grid-cols-4 gap-2">
            {(['ArrowUp','ArrowLeft','Enter','ArrowRight','Escape','ArrowDown','Backspace','Tab'] as const).map(key=><button key={key} type="button" onClick={()=>sendProjectorInput({action:'key',key})} className="min-h-[38px] rounded-lg border border-sky-300 dark:border-sky-800 text-[11px]">{({ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Enter:'انتخاب',Escape:'بازگشت',Backspace:'⌫',Tab:'Tab'} as Record<string,string>)[key]}</button>)}
          </div>
          <div className="flex gap-2"><button type="button" onClick={()=>sendProjectorInput({action:'scroll',delta:-450})} className="flex-1 min-h-[38px] rounded-lg border border-sky-300 dark:border-sky-800 text-xs">اسکرول بالا</button><button type="button" onClick={()=>sendProjectorInput({action:'scroll',delta:450})} className="flex-1 min-h-[38px] rounded-lg border border-sky-300 dark:border-sky-800 text-xs">اسکرول پایین</button></div>
        </div>}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-emerald-900 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900 dark:text-white">منابع جستجوی سینما</h3><span className="text-[10px] text-slate-500">۱۲ منبع</span></div>
        <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">جستجوی یکپارچه، عنوان را در دامنه منابع زیر پیدا می‌کند. برای نتیجه دقیق‌تر، نام فارسی یا اصلی اثر را وارد کن.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {cinemaSources.map((source) => (
            <button key={source.domain} type="button" onClick={() => searchOneSource(source.domain)} className="text-right rounded-lg border border-slate-200 dark:border-emerald-900 p-2.5 hover:border-emerald-500">
              <span className="block text-xs font-bold text-slate-900 dark:text-white">{source.name}</span>
              <span className="block mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{source.kind}</span>
              <span className={`inline-block mt-1.5 text-[9px] rounded px-1.5 py-0.5 ${source.mode === 'paid' ? 'bg-amber-100 text-amber-800' : source.mode === 'free' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{source.mode === 'paid' ? 'اشتراکی' : source.mode === 'free' ? 'عمومی/رایگان' : 'ترکیبی'}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] leading-5 text-slate-500">رایگان‌بودن برای هر عنوان جداگانه بررسی می‌شود؛ اشتراک یا محدودیت پخش سرویس‌ها قابل دورزدن نیست.</p>
      </div>

      <form onSubmit={(event) => {event.preventDefault(); playUrl(sourceUrl);}} className="space-y-2">
        <label className="block text-sm font-semibold text-slate-900 dark:text-white">پخش لینک مستقیم یا ویدئوی قابل‌جاسازی</label>
        <div className="flex gap-2">
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} dir="ltr" placeholder="https://… (لینک مستقیم MP4 / WebM / HLS)" className="min-w-0 flex-1 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white" />
          <button type="submit" className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"><Play className="w-4 h-4" /> پخش</button>
        </div>
      </form>

      {playerError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{playerError}</p>}

      {activeUrl && (
        <div className="space-y-2">
          <div ref={playerShellRef} className="relative aspect-video overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} key={activeUrl} src={activeUrl} controls playsInline preload="metadata" className="w-full h-full" onError={() => setPlayerError('این لینک در پخش‌کننده داخلی باز نشد؛ ممکن است لینک مستقیم نباشد یا سرور اجازه پخش از برنامه‌های دیگر را ندهد.')} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openFullscreen} className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-emerald-900 text-xs flex items-center gap-2"><Maximize className="w-4 h-4" /> تمام‌صفحه</button>
            <button type="button" onClick={() => window.open(activeUrl, '_blank', 'noopener,noreferrer')} className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-emerald-900 text-xs flex items-center gap-2"><ExternalLink className="w-4 h-4" /> بازکردن در پخش‌کننده دیگر</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/20 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Tv className="w-5 h-5 text-sky-700 dark:text-sky-300" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">اتصال گوشی به پروژکتور بدون نصب VPN روی پروژکتور</h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">راه‌های انتقال محتوا بسته به پشتیبانی پروژکتور: پخش مستقیم روی خود پروژکتور، DLNA برای لینک عمومی مستقیم، یا نمایش بی‌سیم صفحه</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={discoverCastDevices} disabled={!isNativeAndroid || isDiscoveringCast} className="min-h-[42px] px-3 rounded-lg bg-sky-700 text-white text-xs font-semibold disabled:opacity-50">
            {isDiscoveringCast ? 'در حال جستجو…' : 'جستجوی پروژکتورها'}
          </button>
          <button type="button" onClick={openSystemCast} disabled={!isNativeAndroid} className="min-h-[42px] px-3 rounded-lg border border-sky-300 dark:border-sky-800 text-xs disabled:opacity-50">
            بازکردن تنظیمات اتصال بی‌سیم گوشی
          </button>
        </div>
        <div className="rounded-lg bg-white/70 dark:bg-slate-900/40 border border-sky-100 dark:border-sky-900 p-3 text-[11px] leading-6 text-slate-700 dark:text-slate-200 space-y-1">
          <p><strong>مراحل اتصال:</strong> دکمه Cast را بزن، در فهرست گوشی نام پروژکتور Owlenz را انتخاب کن و اتصال را تأیید کن. سپس فیلم را روی گوشی پخش کن.</p>
          <p>اگر نمایش بی‌سیم قبلاً با گوشی تو کار کرده، می‌توانی از تنظیمات اندروید دوباره امتحان کنی؛ اما این روش با بعضی VPNها یا سرویس‌های دارای DRM ممکن است قطع شود یا تصویر سیاه بدهد.</p>
          <p>برخی سرویس‌های اشتراکی به‌دلیل DRM ممکن است هنگام آینه‌کردن تصویر سیاه نشان دهند؛ این محدودیت را نمی‌توان با هم‌صدا دور زد.</p>
        </div>
        {castDevices.length > 0 && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100">دستگاه پیدا‌شده</label>
            <select value={selectedCastDevice} onChange={(event) => setSelectedCastDevice(event.target.value)} className="w-full min-h-[42px] px-3 rounded-lg border border-slate-200 dark:border-sky-900 bg-white dark:bg-[#0B1312] text-sm">
              {castDevices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.address}</option>)}
            </select>
            <button type="button" onClick={castCurrentVideo} disabled={!activeUrl || !selectedCastDevice || isCasting} className="w-full min-h-[42px] rounded-lg bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50">
              {isCasting ? 'در حال ارسال…' : 'ارسال ویدئوی فعلی به پروژکتور'}
            </button>
            {castPlaybackState && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => controlCastPlayback('play')} className="min-h-[38px] px-3 rounded-lg border border-sky-300 dark:border-sky-800 text-xs">پخش</button>
                <button type="button" onClick={() => controlCastPlayback('pause')} className="min-h-[38px] px-3 rounded-lg border border-sky-300 dark:border-sky-800 text-xs">مکث</button>
                <button type="button" onClick={() => controlCastPlayback('stop')} className="min-h-[38px] px-3 rounded-lg border border-sky-300 dark:border-sky-800 text-xs">توقف</button>
                <button type="button" onClick={refreshCastState} className="min-h-[38px] px-3 rounded-lg border border-sky-300 dark:border-sky-800 text-xs">به‌روزرسانی وضعیت</button>
              </div>
            )}
          </div>
        )}
        {castStatus && <p role="status" className="text-xs leading-6 text-sky-900 dark:text-sky-100">{castStatus}</p>}
        {!isNativeAndroid && <p className="text-[11px] leading-5 text-slate-500">برای کشف و کنترل DLNA باید همین نسخه روی گوشی اندرویدی نصب باشد.</p>}
        <p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">DLNA با آینه‌کردن صفحه فرق دارد: در DLNA خود پروژکتور لینک رسانه را از اینترنت دریافت می‌کند؛ بنابراین تنظیمات شبکه گوشی به پروژکتور منتقل نمی‌شود. بازشدن تنظیمات Cast به‌تنهایی تضمین نمی‌کند که هر مدل Miracast را پشتیبانی کند.</p>
      </div>

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

      <p className="text-[11px] leading-6 text-slate-500 dark:text-slate-400">فیلیمو و سرویس‌های اشتراکی فقط از مسیر رسمی و با اشتراک معتبر قابل تماشا هستند. هم‌صدا دسترسی پولی، DRM یا محدودیت پخش را دور نمی‌زند. در این نسخه، DLNA برای لینک مستقیم و کنترل پایه پخش در دسترس است و دکمه Cast تنظیمات بی‌سیم اندروید را باز می‌کند. سازگاری نهایی با Owlenz SD500 باید روی دستگاه واقعی آزمایش شود. Miracast، Google Cast و DLNA سه روش متفاوت‌اند؛ موفقیت یکی، پشتیبانی از دو روش دیگر را ثابت نمی‌کند.</p>
    </section>
  );
};
