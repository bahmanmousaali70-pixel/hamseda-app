import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Check,
  Download,
  Loader2,
  Mic,
  Play,
  Square,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import {toPersianDigits} from '../data/persianLibrary';
import {
  addOfflineInstallProgressListener,
  deleteOfflineEngineNative,
  getOfflineEngineStatusesNative,
  installOfflineEngineNative,
  isNativeAndroid,
  type NativeOfflineEngineStatus,
  setActiveOfflineEngineNative,
  speakOfflineEngineNative,
  stopNativeAudio,
} from '../services/nativeAndroidBridge';
import {
  getPocketFarsiStatus,
  installPocketFarsi,
  onPocketInstallProgress,
  type PocketFarsiStatus,
  type PocketVoicePreset,
  setPocketCustomVoiceFromBlob,
  speakWithPocketFarsi,
  stopPocketFarsi,
  uninstallPocketFarsi,
} from '../services/pocketFarsiEngine';
import {
  getPocketVoicePreset,
  getPreferredOfflineEngineId,
  type OfflineEngineId,
  setPocketVoicePreset,
  setPreferredOfflineEngineId,
} from '../services/speechEngine';

interface OfflineEngineLabProps {
  speechRate: number;
  onUpdateRate: (rate: number) => void;
  onStopAll: () => void;
  onStatusToast: (msg: string) => void;
}

type Verdict = 'untested' | 'pass' | 'fail';

interface LabNoteRecord {
  verdict: Verdict;
  note: string;
}

interface EngineMetrics {
  synthesisMs: number;
  durationSec: number;
  rtf: number;
  backendLabel?: string;
}

const LAB_NOTES_KEY = 'hamseda_offline_lab_notes_v1';

const SAMPLE_SCRIPTS = [
  {
    id: 'mixed',
    label: 'ترکیبی (عدد + ساعت + انگلیسی)',
    text: 'سلام عزیزم! امروز ساعت ۰۸:۳۰ صبح، دما ۲۴ درجه است. تماس ورودی از طرف Sara Design دارید.',
  },
  {
    id: 'morning',
    label: 'پیام صبحگاهی گفتاری',
    text: 'صبح بخیر! من می‌خواهم امروز با آرامش و انرژی کارهای مهم را انجام بدهم. هوا عالی است و همه چیز خوب پیش می‌رود.',
  },
  {
    id: 'sms',
    label: 'خواندن پیامک بانکی',
    text: 'پیامک جدید از طرف بانک ملت: مبلغ ۲۵۰ هزار تومان در تاریخ ۱۴۰۵/۱۱/۱۸ به حساب شما واریز شد.',
  },
];

function loadSavedNotes(): Record<OfflineEngineId, LabNoteRecord> {
  const empty: Record<OfflineEngineId, LabNoteRecord> = {
    ava_gyro: {verdict: 'untested', note: ''},
    mana_piper: {verdict: 'untested', note: ''},
    amir_piper: {verdict: 'untested', note: ''},
    pocket_farsi: {verdict: 'untested', note: ''},
  };
  try {
    const raw = localStorage.getItem(LAB_NOTES_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Record<OfflineEngineId, LabNoteRecord>>;
    return {...empty, ...parsed};
  } catch {
    return empty;
  }
}

function formatBytesMb(bytes: number): string {
  if (!bytes || bytes <= 0) return '۰ مگابایت';
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

export const OfflineEngineLab: React.FC<OfflineEngineLabProps> = ({
  speechRate,
  onUpdateRate,
  onStopAll,
  onStatusToast,
}) => {
  const inAndroidApk = isNativeAndroid();
  const [testText, setTestText] = useState(SAMPLE_SCRIPTS[0].text);
  const [activeOfflineId, setActiveOfflineId] = useState<OfflineEngineId>(
    getPreferredOfflineEngineId
  );
  const [nativeStatuses, setNativeStatuses] = useState<
    Record<'ava_gyro' | 'mana_piper' | 'amir_piper', NativeOfflineEngineStatus | undefined>
  >({
    ava_gyro: undefined,
    mana_piper: undefined,
    amir_piper: undefined,
  });
  const [pocketStatus, setPocketStatus] = useState<PocketFarsiStatus>({
    installed: false,
    sizeBytes: 0,
    voiceCloneReady: false,
    customVoiceLoaded: false,
    device: 'wasm',
  });
  const [pocketVoice, setPocketVoice] = useState<PocketVoicePreset>(getPocketVoicePreset);
  const [avaGoftari, setAvaGoftari] = useState(true);
  const [installingId, setInstallingId] = useState<OfflineEngineId | null>(null);
  const [installProgress, setInstallProgress] = useState<{pct: number; detail: string}>({
    pct: 0,
    detail: '',
  });
  const [testingId, setTestingId] = useState<OfflineEngineId | null>(null);
  const [metricsByEngine, setMetricsByEngine] = useState<
    Partial<Record<OfflineEngineId, EngineMetrics>>
  >({});
  const [notes, setNotes] = useState<Record<OfflineEngineId, LabNoteRecord>>(loadSavedNotes);
  const [isRecordingClone, setIsRecordingClone] = useState(false);
  const [isEncodingClone, setIsEncodingClone] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshAllStatuses = useCallback(async () => {
    const [pStatus, nStatus] = await Promise.all([
      getPocketFarsiStatus(),
      getOfflineEngineStatusesNative(),
    ]);
    setPocketStatus(pStatus);
    if (nStatus.ok) {
      const map: Record<
        'ava_gyro' | 'mana_piper' | 'amir_piper',
        NativeOfflineEngineStatus | undefined
      > = {
        ava_gyro: undefined,
        mana_piper: undefined,
        amir_piper: undefined,
      };
      for (const item of nStatus.engines) {
        map[item.id] = item;
      }
      setNativeStatuses(map);
    }
  }, []);

  useEffect(() => {
    refreshAllStatuses();

    const unsubPocket = onPocketInstallProgress((p) => {
      setInstallingId('pocket_farsi');
      setInstallProgress({
        pct: p.pct,
        detail: `${formatBytesMb(p.bytesDownloaded)} از ${formatBytesMb(p.totalBytes)}`,
      });
    });

    let unsubNative = () => {};
    addOfflineInstallProgressListener((evt) => {
      const id = evt.engineId as OfflineEngineId;
      const pct =
        evt.totalBytes > 0
          ? Math.min(99, Math.round((evt.bytesDownloaded * 100) / evt.totalBytes))
          : 0;
      setInstallingId(id);
      setInstallProgress({
        pct,
        detail:
          evt.totalBytes > 0
            ? `${formatBytesMb(evt.bytesDownloaded)} از ${formatBytesMb(evt.totalBytes)}`
            : formatBytesMb(evt.bytesDownloaded),
      });
    }).then((fn) => {
      unsubNative = fn;
    });

    return () => {
      unsubPocket();
      unsubNative();
    };
  }, [refreshAllStatuses]);

  const saveNoteUpdate = (id: OfflineEngineId, patch: Partial<LabNoteRecord>) => {
    setNotes((prev) => {
      const next = {...prev, [id]: {...prev[id], ...patch}};
      try {
        localStorage.setItem(LAB_NOTES_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleSelectActiveOffline = async (id: OfflineEngineId) => {
    setActiveOfflineId(id);
    setPreferredOfflineEngineId(id);
    if (id !== 'pocket_farsi' && inAndroidApk) {
      await setActiveOfflineEngineNative(id);
    }
    onStatusToast('موتور پیش‌فرض آفلاین برنامه به‌روزرسانی شد.');
  };

  const handleStopEverything = () => {
    stopPocketFarsi();
    stopNativeAudio().catch(() => {});
    onStopAll();
    setTestingId(null);
  };

  const handleInstallNative = async (id: 'mana_piper' | 'amir_piper') => {
    if (!inAndroidApk) {
      onStatusToast('این موتور مخصوص اندروید است و پس از نصب APK روی گوشی قابل دانلود و تست است.');
      return;
    }
    setInstallingId(id);
    setInstallProgress({pct: 0, detail: 'در حال شروع دانلود...'});
    const res = await installOfflineEngineNative(id);
    setInstallingId(null);
    await refreshAllStatuses();
    if (res.ok) {
      onStatusToast('مدل صوتی با موفقیت در حافظه آفلاین گوشی نصب شد.');
    } else {
      onStatusToast(res.error || 'دانلود مدل ناموفق بود. اتصال اینترنت را بررسی کنید.');
    }
  };

  const handleDeleteNative = async (id: 'mana_piper' | 'amir_piper') => {
    const ok = await deleteOfflineEngineNative(id);
    if (ok) {
      if (activeOfflineId === id) {
        setActiveOfflineId('ava_gyro');
        setPreferredOfflineEngineId('ava_gyro');
      }
      await refreshAllStatuses();
      onStatusToast('فایل‌های این مدل از حافظه گوشی پاک شدند.');
    }
  };

  const handleInstallPocket = async (withVoiceClone: boolean) => {
    setInstallingId('pocket_farsi');
    setInstallProgress({pct: 0, detail: 'شروع دریافت فایل‌های ONNX...'});
    try {
      const st = await installPocketFarsi(withVoiceClone);
      setPocketStatus(st);
      if (st.installed) {
        onStatusToast('موتور Pocket TTS Farsi در حافظه آفلاین آماده شد.');
      }
    } catch (err) {
      onStatusToast(err instanceof Error ? err.message : 'خطا در دانلود Pocket TTS Farsi');
    } finally {
      setInstallingId(null);
    }
  };

  const handleDeletePocket = async () => {
    const st = await uninstallPocketFarsi();
    setPocketStatus(st);
    if (activeOfflineId === 'pocket_farsi') {
      setActiveOfflineId('ava_gyro');
      setPreferredOfflineEngineId('ava_gyro');
    }
    onStatusToast('کش مدل Pocket TTS Farsi به‌طور کامل حذف شد.');
  };

  const handleTestNative = async (id: 'ava_gyro' | 'mana_piper' | 'amir_piper') => {
    if (!testText.trim()) {
      onStatusToast('لطفاً متن تست را وارد کنید.');
      return;
    }
    if (!inAndroidApk) {
      onStatusToast('تست موتورهای بومی Sherpa-ONNX روی گوشی با نسخه APK انجام می‌شود؛ در مرورگر از Pocket TTS Farsi (موتور ۴) استفاده کنید.');
      return;
    }
    handleStopEverything();
    setTestingId(id);
    const res = await speakOfflineEngineNative({
      engineId: id,
      text: testText.trim(),
      rate: speechRate,
      goftari: id === 'ava_gyro' ? avaGoftari : false,
    });
    setTestingId(null);
    if (res.ok) {
      setMetricsByEngine((prev) => ({
        ...prev,
        [id]: {
          synthesisMs: res.synthesisMs ?? 0,
          durationSec: res.durationSec ?? 0,
          rtf: res.rtf ?? 0,
          backendLabel: 'Sherpa-ONNX CPU',
        },
      }));
    } else if (res.error && res.error !== 'پخش متوقف شد.') {
      onStatusToast(res.error);
    }
  };

  const handleTestPocket = async () => {
    if (!testText.trim()) {
      onStatusToast('لطفاً متن تست را وارد کنید.');
      return;
    }
    if (!pocketStatus.installed) {
      onStatusToast('ابتدا مدل Pocket TTS Farsi را روی حافظه آفلاین دانلود کنید.');
      return;
    }
    handleStopEverything();
    setTestingId('pocket_farsi');
    const chosenVoice =
      pocketVoice === 'custom' && !pocketStatus.customVoiceLoaded ? 'female_short' : pocketVoice;
    const res = await speakWithPocketFarsi(testText.trim(), chosenVoice, speechRate);
    setTestingId(null);
    if (res.ok) {
      setMetricsByEngine((prev) => ({
        ...prev,
        pocket_farsi: {
          synthesisMs: res.synthesisMs,
          durationSec: res.durationSec,
          rtf: res.rtf,
          backendLabel: res.device === 'webgpu' ? 'WebGPU + WASM' : 'WASM CPU q4',
        },
      }));
    } else if (res.error && !res.error.includes('لغو')) {
      onStatusToast(res.error);
    }
  };

  const handleUploadCloneAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsEncodingClone(true);
    try {
      await setPocketCustomVoiceFromBlob(file);
      const nextSt = await getPocketFarsiStatus();
      setPocketStatus(nextSt);
      setPocketVoice('custom');
      setPocketVoicePreset('custom');
      onStatusToast('صدای نمونه برای کلون آماده شد؛ حالا «پخش تست آفلاین» را بزنید.');
    } catch (err) {
      onStatusToast(err instanceof Error ? err.message : 'خطا در پردازش فایل صوتی کلون');
    } finally {
      setIsEncodingClone(false);
    }
  };

  const handleToggleMicRecord = async () => {
    if (isRecordingClone && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingClone(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onStatusToast('میکروفون مرورگر در دسترس نیست؛ از دکمه بارگذاری فایل صوتی استفاده کنید.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const chunks: BlobPart[] = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, {type: mr.mimeType || 'audio/webm'});
        setIsEncodingClone(true);
        try {
          await setPocketCustomVoiceFromBlob(blob);
          const nextSt = await getPocketFarsiStatus();
          setPocketStatus(nextSt);
          setPocketVoice('custom');
          setPocketVoicePreset('custom');
          onStatusToast('صدای ضبط‌شده با موفقیت کلون شد.');
        } catch (err) {
          onStatusToast(err instanceof Error ? err.message : 'خطا در ساخت پروفایل صدا');
        } finally {
          setIsEncodingClone(false);
        }
      };
      mr.start();
      setIsRecordingClone(true);
      window.setTimeout(() => {
        if (mr.state === 'recording') {
          mr.stop();
          setIsRecordingClone(false);
        }
      }, 5000);
    } catch {
      onStatusToast('اجازه دسترسی به میکروفون داده نشد.');
    }
  };

  const renderVerdictBar = (id: OfflineEngineId) => {
    const rec = notes[id];
    return (
      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-emerald-950/60 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => saveNoteUpdate(id, {verdict: 'pass'})}
            className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              rec.verdict === 'pass'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-slate-50 dark:bg-[#0B1312] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-emerald-900'
            }`}
          >
            قبول ✓
          </button>
          <button
            type="button"
            onClick={() => saveNoteUpdate(id, {verdict: 'fail'})}
            className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              rec.verdict === 'fail'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-slate-50 dark:bg-[#0B1312] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-emerald-900'
            }`}
          >
            رد ✕
          </button>
        </div>
        <input
          type="text"
          value={rec.note}
          onChange={(e) => saveNoteUpdate(id, {note: e.target.value})}
          placeholder="یادداشت تست آفلاین (مثلاً کیفیت تلفظ، سرعت، لحن روی گوشی)..."
          className="flex-1 min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-xs text-slate-800 dark:text-slate-100"
        />
      </div>
    );
  };

  const renderMetricsLine = (id: OfflineEngineId) => {
    const m = metricsByEngine[id];
    if (!m) return null;
    return (
      <div className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
        آخرین اجرای آفلاین ({m.backendLabel}) · زمان تولید: {toPersianDigits(m.synthesisMs)}{' '}
        میلی‌ثانیه · مدت صدا: {toPersianDigits(m.durationSec.toFixed(1))} ثانیه · نسبت سرعت:{' '}
        {toPersianDigits(m.rtf.toFixed(2))}x
      </div>
    );
  };

  const avaInstalled = nativeStatuses.ava_gyro?.installed ?? false;
  const manaInstalled = nativeStatuses.mana_piper?.installed ?? false;
  const amirInstalled = nativeStatuses.amir_piper?.installed ?? false;

  return (
    <div className="space-y-6">
      {/* Shared Test Console */}
      <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              آزمایشگاه مقایسه ۴ موتور آفلاین مستقل · حالت آنلاین (نگین، نسیم و...) کاملاً دست‌نخورده و فعال باقی می‌ماند
            </div>
            <h2 className="mt-1.5 text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              متن مشترک تست آفلاین (در حالت هواپیما آزمایش کنید)
            </h2>
          </div>

          {testingId && (
            <button
              type="button"
              onClick={handleStopEverything}
              className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Square className="w-4 h-4" />
              <span>توقف فوری پخش</span>
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SAMPLE_SCRIPTS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => setTestText(sample.text)}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                testText === sample.text
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-emerald-900 text-slate-600 dark:text-slate-300'
              }`}
            >
              {sample.label}
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          placeholder="متن تست فارسی یا ترکیبی فارسی و انگلیسی را بنویسید..."
          className="mt-3 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm leading-7 text-slate-900 dark:text-white"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">سرعت تست:</span>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-emerald-950/70 rounded-xl">
              {[0.85, 0.95, 1, 1.1, 1.2].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onUpdateRate(r)}
                  className={`min-h-[34px] px-2.5 text-xs font-medium rounded-lg tabular-nums cursor-pointer ${
                    speechRate === r
                      ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {toPersianDigits(r)}x
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            موتور آفلاین پیش‌فرض فعلی:{' '}
            <strong className="text-slate-900 dark:text-white">
              {activeOfflineId === 'ava_gyro'
                ? '۱. معماری AvaCore (Gyro)'
                : activeOfflineId === 'mana_piper'
                  ? '۲. Mana Persian Piper'
                  : activeOfflineId === 'amir_piper'
                    ? '۳. Amir Persian Piper'
                    : '۴. Pocket TTS Farsi v2'}
            </strong>
          </div>
        </div>
      </section>

      {/* Engine Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engine 1: AvaCore Architecture */}
        <article className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              موتور ۱ · نصب‌شده همراه APK · مجوز مدل MIT · پردازشگر Apache-2.0
            </div>
            <h3 className="mt-1.5 text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              معماری AvaCore (Sherpa-ONNX Gyro + گفتاری)
            </h3>
            <p className="mt-2 text-xs sm:text-sm leading-6 text-slate-600 dark:text-slate-300">
              پیاده‌سازی بومی اندروید با استریم AudioTrack و قطع فوری. پوشه صدا (Gyro + فونتیک eSpeak) هنگام نصب APK به‌صورت خودکار در حافظه داخلی استخراج می‌شود.
            </p>

            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              وضعیت روی دستگاه:{' '}
              {inAndroidApk
                ? avaInstalled
                  ? `آماده (${formatBytesMb(nativeStatuses.ava_gyro?.sizeBytes ?? 0)})`
                  : 'در حال استخراج از بسته APK'
                : 'مخصوص نصب در APK اندروید'}
            </div>

            <label className="mt-3 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={avaGoftari}
                onChange={(e) => setAvaGoftari(e.target.checked)}
                className="w-4 h-4 accent-emerald-700 rounded"
              />
              <span>پیش‌پردازش گفتاری تهرانی (مثلاً می‌خواهم → میخوام، است → ه)</span>
            </label>

            {renderMetricsLine('ava_gyro')}
          </div>

          <div>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleTestNative('ava_gyro')}
                disabled={testingId !== null}
                className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                {testingId === 'ava_gyro' ? (
                  <Volume2 className="w-4 h-4 animate-pulse" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>پخش تست آفلاین</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectActiveOffline('ava_gyro')}
                className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
                  activeOfflineId === 'ava_gyro'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200'
                }`}
              >
                {activeOfflineId === 'ava_gyro' && <Check className="w-4 h-4" />}
                <span>{activeOfflineId === 'ava_gyro' ? 'موتور فعال پیش‌فرض' : 'انتخاب به‌عنوان پیش‌فرض'}</span>
              </button>
            </div>
            {renderVerdictBar('ava_gyro')}
          </div>
        </article>

        {/* Engine 2: Mana Persian Piper */}
        <article className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              موتور ۲ · دانلود جداگانه ~۶۳٫۵ مگابایت · مجوز MIT · سازگار با Sherpa-ONNX
            </div>
            <h3 className="mt-1.5 text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Mana Persian Piper (مدل استاندارد فارسی ONNX)
            </h3>
            <p className="mt-2 text-xs sm:text-sm leading-6 text-slate-600 dark:text-slate-300">
              مدل آموزش‌دیده بر پایه دیتاست ManaTTS برای تلفظ دقیق فارسی کتابی و طبیعی روی CPU گوشی، کاملاً جدا از موتور ۱ تا کیفیت واقعی هر دو مستقل سنجیده شود.
            </p>

            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              وضعیت روی دستگاه:{' '}
              {inAndroidApk
                ? manaInstalled
                  ? `نصب‌شده آفلاین (${formatBytesMb(nativeStatuses.mana_piper?.sizeBytes ?? 0)})`
                  : 'نصب‌نشده (آماده دانلود مستقیم ۶۳٫۵ مگابایت)'
                : 'مخصوص نصب در APK اندروید'}
            </div>

            {installingId === 'mana_piper' && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400 tabular-nums mb-1">
                  <span>در حال دانلود مدل Mana...</span>
                  <span>{installProgress.detail}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-emerald-950 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{width: `${installProgress.pct}%`}}
                  />
                </div>
              </div>
            )}

            {renderMetricsLine('mana_piper')}
          </div>

          <div>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {!manaInstalled ? (
                <button
                  type="button"
                  onClick={() => handleInstallNative('mana_piper')}
                  disabled={installingId !== null}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                >
                  {installingId === 'mana_piper' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>نصب مدل Mana (۶۳٫۵ مگابایت)</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleTestNative('mana_piper')}
                    disabled={testingId !== null}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    {testingId === 'mana_piper' ? (
                      <Volume2 className="w-4 h-4 animate-pulse" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    <span>پخش تست آفلاین</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectActiveOffline('mana_piper')}
                    className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
                      activeOfflineId === 'mana_piper'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {activeOfflineId === 'mana_piper' && <Check className="w-4 h-4" />}
                    <span>{activeOfflineId === 'mana_piper' ? 'فعال پیش‌فرض' : 'انتخاب پیش‌فرض'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteNative('mana_piper')}
                    aria-label="حذف فایل مدل Mana"
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-500 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            {renderVerdictBar('mana_piper')}
          </div>
        </article>

        {/* Engine 3: Amir Piper (verified MIT Android replacement for Nava FA) */}
        <article className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              موتور ۳ · دانلود جداگانه ~۶۰٫۶ مگابایت · مجوز MIT · جایگزین اجرایی Nava FA
            </div>
            <h3 className="mt-1.5 text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Amir Persian Piper (صدای مردانه آفلاین)
            </h3>
            <p className="mt-2 text-xs sm:text-sm leading-6 text-slate-600 dark:text-slate-300">
              چون پروژه Nava FA فقط فایل سنگین PyTorch (~۴۱۸ مگابایت، بدون نسخه ONNX اندرویدی) است و مجوز آن محدود به آمریکا/کانادا/اروپاست، برای تست صدای مردانه واقعی و متین روی موبایل با مدل MIT Amir جایگزین شد.
            </p>

            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              وضعیت روی دستگاه:{' '}
              {inAndroidApk
                ? amirInstalled
                  ? `نصب‌شده آفلاین (${formatBytesMb(nativeStatuses.amir_piper?.sizeBytes ?? 0)})`
                  : 'نصب‌نشده (آماده دانلود مستقیم ۶۰٫۶ مگابایت)'
                : 'مخصوص نصب در APK اندروید'}
            </div>

            {installingId === 'amir_piper' && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400 tabular-nums mb-1">
                  <span>در حال دانلود مدل Amir...</span>
                  <span>{installProgress.detail}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-emerald-950 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{width: `${installProgress.pct}%`}}
                  />
                </div>
              </div>
            )}

            {renderMetricsLine('amir_piper')}
          </div>

          <div>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {!amirInstalled ? (
                <button
                  type="button"
                  onClick={() => handleInstallNative('amir_piper')}
                  disabled={installingId !== null}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                >
                  {installingId === 'amir_piper' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>نصب مدل Amir (۶۰٫۶ مگابایت)</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleTestNative('amir_piper')}
                    disabled={testingId !== null}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    {testingId === 'amir_piper' ? (
                      <Volume2 className="w-4 h-4 animate-pulse" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    <span>پخش تست آفلاین</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectActiveOffline('amir_piper')}
                    className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
                      activeOfflineId === 'amir_piper'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {activeOfflineId === 'amir_piper' && <Check className="w-4 h-4" />}
                    <span>{activeOfflineId === 'amir_piper' ? 'فعال پیش‌فرض' : 'انتخاب پیش‌فرض'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteNative('amir_piper')}
                    aria-label="حذف فایل مدل Amir"
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-500 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            {renderVerdictBar('amir_piper')}
          </div>
        </article>

        {/* Engine 4: Pocket TTS Farsi v2 ONNX */}
        <article className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              موتور ۴ · نسخه کوانتایز q4 (~۱۶۹ مگابایت) · مجوز CC-BY-NC · دارای کلون صدا
            </div>
            <h3 className="mt-1.5 text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Pocket TTS Farsi v2 ONNX (مرورگر و وب‌ویو اندروید)
            </h3>
            <p className="mt-2 text-xs sm:text-sm leading-6 text-slate-600 dark:text-slate-300">
              تبدیل آوایی Homo-GE2PE + FlowLM + Mimi روی سخت‌افزار گوشی (WebGPU یا WASM CPU) بدون سرور، با ۳ صدای آماده و امکان کلون صدای دلخواه با ۳ تا ۵ ثانیه نمونه صوتی.
            </p>

            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              وضعیت کش آفلاین:{' '}
              {pocketStatus.installed
                ? `نصب‌شده (${formatBytesMb(pocketStatus.sizeBytes)}) · موتور اجرا: ${pocketStatus.device === 'webgpu' ? 'WebGPU' : 'WASM CPU'}`
                : 'دانلودنشده · پس از دانلود بدون اینترنت و فیلترشکن کار می‌کند'}
            </div>

            {installingId === 'pocket_farsi' && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400 tabular-nums mb-1">
                  <span>در حال کش کردن فایل‌های ONNX...</span>
                  <span>{installProgress.detail}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-emerald-950 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{width: `${installProgress.pct}%`}}
                  />
                </div>
              </div>
            )}

            {pocketStatus.installed && (
              <div className="mt-4 space-y-3 pt-3 border-t border-slate-100 dark:border-emerald-950/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    شخصیت صوتی:
                  </span>
                  <select
                    value={pocketVoice}
                    onChange={(e) => {
                      const next = e.target.value as PocketVoicePreset;
                      setPocketVoice(next);
                      setPocketVoicePreset(next);
                    }}
                    className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-800 dark:text-slate-100"
                  >
                    <option value="female_short">صدای خانم (طبیعی و گرم)</option>
                    <option value="male_news">صدای آقا (گوینده خبری)</option>
                    <option value="hello">صدای سلام (نرم و صمیمی)</option>
                    {pocketStatus.customVoiceLoaded && (
                      <option value="custom">صدای کلون‌شده من</option>
                    )}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleMicRecord}
                    disabled={isEncodingClone}
                    className={`min-h-[38px] px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 cursor-pointer ${
                      isRecordingClone
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>{isRecordingClone ? 'توقف ضبط (حداکثر ۵ ثانیه)' : 'ضبط صدا برای کلون'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isEncodingClone}
                    className="min-h-[38px] px-3 rounded-lg text-xs font-medium border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isEncodingClone ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>بارگذاری نمونه صوتی کلون</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleUploadCloneAudio}
                    className="hidden"
                  />
                </div>
              </div>
            )}

            {renderMetricsLine('pocket_farsi')}
          </div>

          <div>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {!pocketStatus.installed ? (
                <button
                  type="button"
                  onClick={() => handleInstallPocket(false)}
                  disabled={installingId !== null}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                >
                  {installingId === 'pocket_farsi' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>نصب Pocket TTS (~۱۶۹ مگابایت)</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleTestPocket}
                    disabled={testingId !== null}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    {testingId === 'pocket_farsi' ? (
                      <Volume2 className="w-4 h-4 animate-pulse" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    <span>پخش تست آفلاین</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectActiveOffline('pocket_farsi')}
                    className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
                      activeOfflineId === 'pocket_farsi'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-800 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {activeOfflineId === 'pocket_farsi' && <Check className="w-4 h-4" />}
                    <span>
                      {activeOfflineId === 'pocket_farsi' ? 'فعال پیش‌فرض' : 'انتخاب پیش‌فرض'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeletePocket}
                    aria-label="حذف مدل Pocket TTS Farsi"
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-500 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            {renderVerdictBar('pocket_farsi')}
          </div>
        </article>
      </div>
    </div>
  );
};
