import React, {useEffect, useRef, useState} from 'react';
import {
  Bell,
  BellOff,
  Check,
  Clock,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  FileAudio,
  Link2,
  LogIn,
  LogOut,
  Moon,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {toPersianDigits, VOICE_PERSONAS} from '../data/persianLibrary';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {apiUrl, getCloudApiBaseUrl, safeReadJsonResponse, setCloudApiBaseUrl} from '../services/apiConfig';
import type {CoupleSpaceInfo} from '../services/coupleSyncService';
import {
  checkConnectivityNative,
  isNativeAndroid,
  openAssistantSettingsNative,
  openBatteryAndAutostartSettingsNative,
  openExternalUrlNative,
  pickJsonFileNative,
  requestSmsPermissionsOnlyNative,
  saveBackupJsonNative,
  saveSmsAnnouncementPolicyNative,
  syncServerBaseUrlToNative,
  type NativeCapabilities,
} from '../services/nativeAndroidBridge';
import type {
  AppSettings,
  BillReminderItem,
  CallerContact,
  DeviceOwner,
  ExpenseEntry,
  GoalItem,
  GratitudeEntry,
  HabitItem,
  HomeChoreItem,
  LocalVoiceControls,
  MealPlanEntry,
  MedicationItem,
  PackingItem,
  QuickVaultNote,
  ScheduleTopic,
  ScheduledAnnouncement,
  ShoppingItem,
  SpecialEventItem,
  VoiceName,
} from '../types/app';
import {getPartnerNameForDevice, getSelfName} from '../utils/deviceIdentity';

interface SyncSettingsViewProps {
  settings: AppSettings;
  deviceOwner: DeviceOwner;
  onChangeDeviceOwner: (owner: DeviceOwner) => void;
  localVoiceControls: LocalVoiceControls;
  onUpdateLocalVoiceControls: (patch: Partial<LocalVoiceControls>) => void;
  onRefreshApp: () => void;
  goals: GoalItem[];
  habits: HabitItem[];
  gratitudes: GratitudeEntry[];
  callers: CallerContact[];
  schedules: ScheduledAnnouncement[];
  shoppingItems: ShoppingItem[];
  expenses: ExpenseEntry[];
  bills: BillReminderItem[];
  meds: MedicationItem[];
  meals: MealPlanEntry[];
  vaultNotes: QuickVaultNote[];
  packingItems: PackingItem[];
  specialEvents: SpecialEventItem[];
  homeChores: HomeChoreItem[];
  notifPermission: NotificationPermission;
  keepAliveActive: boolean;
  isOnline: boolean;
  cachedClipsCount: number;
  cloudUserEmail: string | null;
  cloudBusy: boolean;
  spaceInfo: CoupleSpaceInfo | null;
  nativeCaps: NativeCapabilities;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onImportBundle: (payload: {
    goals?: GoalItem[];
    habits?: HabitItem[];
    gratitudes?: GratitudeEntry[];
    callers?: CallerContact[];
    schedules?: ScheduledAnnouncement[];
    shoppingItems?: ShoppingItem[];
    expenses?: ExpenseEntry[];
    bills?: BillReminderItem[];
    meds?: MedicationItem[];
    meals?: MealPlanEntry[];
    vaultNotes?: QuickVaultNote[];
    packingItems?: PackingItem[];
    specialEvents?: SpecialEventItem[];
    homeChores?: HomeChoreItem[];
  }) => void;
  onRequestNotificationPermission: () => void;
  onToggleKeepAlive: (enabled: boolean) => void;
  onAddSchedule: (schedule: Omit<ScheduledAnnouncement, 'id'>) => void;
  onToggleSchedule: (id: string) => void;
  onUpdateSchedule: (id: string, patch: Partial<ScheduledAnnouncement>) => void;
  onDeleteSchedule: (id: string) => void;
  onTestSchedule: (schedule: ScheduledAnnouncement) => void;
  onDownloadScheduleAlarm: (schedule: ScheduledAnnouncement) => Promise<void>;
  onCloudSignIn: () => Promise<void>;
  onCloudSignOut: () => Promise<void>;
  onInvitePartner: (email: string) => Promise<void>;
  onJoinSpaceByCode: (spaceCode: string) => Promise<void>;
  onPushLocalToCloud: () => Promise<void>;
  onRequestNativePermissions: () => Promise<void>;
  onOpenAppInfoSettings: () => Promise<void>;
  onOpenXiaomiOtherPermissions: () => Promise<void>;
  onStatusToast: (msg: string) => void;
}

const TOPIC_LABELS: Record<ScheduleTopic, string> = {
  morning: 'پیام صبحگاهی',
  goals: 'اهداف امروز',
  energy: 'انرژی و انگیزه',
  gratitude: 'شکرگذاری',
  night_movies: 'معرفی فیلم و سریال شبانه',
  custom: 'متن دلخواه',
};

const DAYS_LABELS: Record<ScheduledAnnouncement['days'], string> = {
  daily: 'هر روز',
  weekdays: 'روزهای کاری (شنبه تا چهارشنبه)',
  weekends: 'آخر هفته (پنج‌شنبه و جمعه)',
};

export const SyncSettingsView: React.FC<SyncSettingsViewProps> = ({
  settings,
  deviceOwner,
  onChangeDeviceOwner,
  localVoiceControls,
  onUpdateLocalVoiceControls,
  onRefreshApp,
  goals,
  habits,
  gratitudes,
  callers,
  schedules,
  shoppingItems,
  expenses,
  bills,
  meds,
  meals,
  vaultNotes,
  packingItems,
  specialEvents,
  homeChores,
  notifPermission,
  keepAliveActive,
  isOnline,
  cachedClipsCount,
  cloudUserEmail,
  cloudBusy,
  spaceInfo,
  nativeCaps,
  onUpdateSettings,
  onImportBundle,
  onRequestNotificationPermission,
  onToggleKeepAlive,
  onAddSchedule,
  onToggleSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  onTestSchedule,
  onDownloadScheduleAlarm,
  onCloudSignIn,
  onCloudSignOut,
  onInvitePartner,
  onJoinSpaceByCode,
  onPushLocalToCloud,
  onRequestNativePermissions,
  onOpenAppInfoSettings,
  onOpenXiaomiOtherPermissions,
  onStatusToast,
}) => {
  const selfName = getSelfName(settings, deviceOwner);
  const partnerOtherName = getPartnerNameForDevice(settings, deviceOwner);
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedSpace, setCopiedSpace] = useState(false);
  const [smsBlockedSenders, setSmsBlockedSenders] = useState(() => localStorage.getItem('rmz_sms_blocked_senders') ?? '');
  const [smsBlockedKeywords, setSmsBlockedKeywords] = useState(() => localStorage.getItem('rmz_sms_blocked_keywords') ?? 'تبریک برنده شدید\\nجایزه رایگان\\nخرید شارژ\\nوام فوری');
  const [smsImportantSenders, setSmsImportantSenders] = useState(() => localStorage.getItem('rmz_sms_important_senders') ?? '');
  const [smsQuietHours, setSmsQuietHours] = useState(() => localStorage.getItem('rmz_sms_quiet_hours') ?? '0');
  const [smsSummarize, setSmsSummarize] = useState(() => localStorage.getItem('rmz_sms_summarize') !== 'false');
  const [smsFilterOperatorPromotions, setSmsFilterOperatorPromotions] = useState(
    () => localStorage.getItem('rmz_sms_filter_operator_promotions') !== 'false'
  );
  const [smsSkipBankAndOtp, setSmsSkipBankAndOtp] = useState(
    () => localStorage.getItem('rmz_sms_skip_bank_and_otp') !== 'false'
  );
  const [smsPolicySaving, setSmsPolicySaving] = useState(false);

  const [myNameDraft, setMyNameDraft] = useState(settings.myName);
  const [partnerNameDraft, setPartnerNameDraft] = useState(settings.partnerName);
  const myNameFocusedRef = useRef(false);
  const partnerNameFocusedRef = useRef(false);

  useEffect(() => {
    if (!myNameFocusedRef.current) setMyNameDraft(settings.myName);
  }, [settings.myName]);

  useEffect(() => {
    if (!partnerNameFocusedRef.current) setPartnerNameDraft(settings.partnerName);
  }, [settings.partnerName]);

  const [partnerEmailInput, setPartnerEmailInput] = useState(spaceInfo?.partnerEmail ?? '');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [serverUrlInput, setServerUrlInput] = useState(() => getCloudApiBaseUrl());
  const [serverCheckStatus, setServerCheckStatus] = useState<{ok: boolean; msg: string} | null>(null);
  const [checkingServer, setCheckingServer] = useState(false);

  // New schedule form state
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState<ScheduleTopic>('morning');
  const [newTime, setNewTime] = useState('08:00');
  const [newDays, setNewDays] = useState<ScheduledAnnouncement['days']>('daily');
  const [newVoice, setNewVoice] = useState<VoiceName>(settings.defaultVoice);
  const [newCustomText, setNewCustomText] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const exportPayload = JSON.stringify(
    {
      app: 'roozhaye-man-o-zari',
      exportedAt: new Date().toISOString(),
      goals,
      habits,
      gratitudes,
      callers,
      schedules,
      shoppingItems,
      expenses,
      bills,
      meds,
      meals,
      vaultNotes,
      packingItems,
      specialEvents,
      homeChores,
    },
    null,
    2
  );

  const handleDownloadJson = async (shareAfter = false) => {
    const filename = `man-o-zari-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (isNativeAndroid()) {
      const res = await saveBackupJsonNative(filename, exportPayload, shareAfter);
      if (res.ok) {
        onStatusToast(
          shareAfter
            ? `فایل پشتیبان (${filename}) ذخیره و پنجره اشتراک‌گذاری باز شد.`
            : `فایل پشتیبان با نام ${filename} در پوشه Download/RoozhayeManOZari ذخیره شد.`
        );
      } else {
        onStatusToast(res.error || 'خطا در ذخیره فایل پشتیبان؛ از «کپی کد پشتیبان» نیز می‌توانید استفاده کنید.');
      }
      return;
    }

    const blob = new Blob([exportPayload], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onStatusToast('فایل پشتیبان با موفقیت دانلود شد.');
  };

  const handleNativePickJson = async () => {
    const res = await pickJsonFileNative();
    if (res.cancelled) return;
    if (!res.ok || !res.content) {
      onStatusToast(res.error || 'امکان خواندن فایل انتخاب‌شده نبود.');
      return;
    }
    try {
      const parsed = JSON.parse(res.content);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('فرمت نامعتبر است');
      }
      onImportBundle(parsed);
      onStatusToast(`فایل پشتیبان «${res.name || 'backup.json'}» با موفقیت بارگذاری و ادغام شد.`);
    } catch {
      onStatusToast('فایل انتخاب‌شده JSON معتبر هم‌صدا نیست.');
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(exportPayload);
      setCopied(true);
      onStatusToast('کد همگام‌سازی کپی شد.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onStatusToast('کپی خودکار انجام نشد؛ از دانلود فایل استفاده کنید.');
    }
  };

  const handleCopySpaceId = async () => {
    if (!spaceInfo?.spaceId) return;
    try {
      await navigator.clipboard.writeText(spaceInfo.spaceId);
      setCopiedSpace(true);
      onStatusToast('کد فضای مشترک کپی شد. می‌توانید برای همراهتان بفرستید.');
      setTimeout(() => setCopiedSpace(false), 2500);
    } catch {
      onStatusToast('لطفاً کد فضای مشترک را دستی کپی کنید.');
    }
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(importText.trim());
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('فرمت نامعتبر است');
      }
      onImportBundle(parsed);
      setImportText('');
      onStatusToast('اطلاعات با داده‌های فعلی شما ادغام و همگام‌سازی شد.');
    } catch {
      onStatusToast('متن واردشده معتبر نیست. لطفاً فایل یا کد صحیح همگام‌سازی را وارد کنید.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      onImportBundle(parsed);
      onStatusToast('فایل پشتیبان با موفقیت ادغام شد.');
    } catch {
      onStatusToast('فایل انتخاب‌شده معتبر نیست.');
    }
    e.target.value = '';
  };

  const handleCreateSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim() || TOPIC_LABELS[newTopic];
    if (newTopic === 'custom' && !newCustomText.trim()) {
      onStatusToast('لطفاً متن اعلان دلخواه را بنویسید.');
      return;
    }
    onAddSchedule({
      title,
      topic: newTopic,
      time: newTime || '08:00',
      enabled: true,
      voiceName: newVoice,
      days: newDays,
      customText: newTopic === 'custom' ? newCustomText.trim() : undefined,
    });
    setNewTitle('');
    setNewCustomText('');
    onStatusToast(`زمان‌بندی «${title}» برای ساعت ${toPersianDigits(newTime)} اضافه شد.`);
  };

  const handleAlarmDownload = async (item: ScheduledAnnouncement) => {
    setDownloadingId(item.id);
    try {
      await onDownloadScheduleAlarm(item);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSaveServerUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = setCloudApiBaseUrl(serverUrlInput);
    setServerUrlInput(normalized || getCloudApiBaseUrl());
    const targetBase = normalized || getCloudApiBaseUrl();
    syncServerBaseUrlToNative(targetBase).catch(() => {});
    setCheckingServer(true);
    setServerCheckStatus(null);
    try {
      if (isNativeAndroid()) {
        const probe = await checkConnectivityNative(targetBase);
        if (probe.serverOk && probe.aiReady) {
          const msg = 'آدرس ذخیره شد و اتصال به سرور صدا برقرار است.';
          setServerCheckStatus({ok: true, msg});
          onStatusToast(msg);
          return;
        }
        if (probe.serverOk && !probe.aiReady) {
          const msg = 'سرور در دسترس است اما کلید سرویس هوش مصنوعی روی سرور فعال نیست.';
          setServerCheckStatus({ok: false, msg});
          onStatusToast(msg);
          return;
        }
        if (!probe.deviceOnline) {
          const msg = 'گوشی به وای‌فای یا اینترنت همراه متصل نیست.';
          setServerCheckStatus({ok: false, msg});
          onStatusToast(msg);
          return;
        }
        if (probe.authRedirect) {
          const msg =
            'اینترنت گوشی وصل است، اما این نشانی (ais-dev) مخصوص مرورگر است و در APK باز نمی‌شود. از نشانی عمومی (ais-pre بعد از Deploy در AI Studio) یا سرور مستقل استفاده کنید. جستجوی اینترنت، رادیو و امکانات گوشی بدون سرور هم با اینترنت گوشی کار می‌کنند.';
          setServerCheckStatus({ok: false, msg});
          onStatusToast(msg);
          return;
        }
        if (probe.httpCode === 404) {
          const msg =
            'اینترنت گوشی وصل است، اما سرور عمومی هم‌صدا روی این نشانی هنوز منتشر (Deploy) نشده است (خطای ۴۰۴). در AI Studio دکمه Deploy/Share را بزنید. جستجوی اینترنتی دستیار، رادیو و همگام‌سازی بدون این سرور هم روی APK فعال هستند.';
          setServerCheckStatus({ok: false, msg});
          onStatusToast(msg);
          return;
        }
        const msg =
          'اینترنت گوشی وصل است، اما نشانی سرور پاسخ نداد (وضعیت فیلترشکن یا آدرس سرور را بررسی کنید). جستجوی مستقیم دستیار و رادیو همچنان با اینترنت گوشی فعال هستند.';
        setServerCheckStatus({ok: false, msg});
        onStatusToast(msg);
        return;
      }

      const res = await fetch(`${targetBase}/api/health`);
      const parsed = await safeReadJsonResponse<{ok?: boolean; aiReady?: boolean}>(res);
      if (parsed.isHtml) {
        const msg = 'این نشانی صفحه وب برگرداند و به سرور برنامه وصل نیست. نشانی دقیق یا وضعیت فیلترشکن را بررسی کنید.';
        setServerCheckStatus({ok: false, msg});
        onStatusToast(msg);
        return;
      }
      if (!res.ok) {
        const msg = `سرور پاسخ خطا داد (کد ${res.status}). مطمئن شوید برنامه Publish شده است.`;
        setServerCheckStatus({ok: false, msg});
        onStatusToast(msg);
        return;
      }
      const data = parsed.data;
      if (data?.ok) {
        const msg = data.aiReady
          ? 'آدرس ذخیره شد و اتصال به سرور صدا برقرار است.'
          : 'سرور در دسترس است اما کلید سرویس صدا فعال نیست.';
        setServerCheckStatus({ok: Boolean(data.aiReady), msg});
        onStatusToast(msg);
      } else {
        setServerCheckStatus({ok: false, msg: 'پاسخ نامعتبر از سرور دریافت شد.'});
        onStatusToast('پاسخ نامعتبر از سرور دریافت شد.');
      }
    } catch {
      const msg = 'خطا در اتصال به سرور. فیلترشکن گوشی را برای برنامه باز بگذارید یا آدرس را بررسی کنید.';
      setServerCheckStatus({ok: false, msg});
      onStatusToast(msg);
    } finally {
      setCheckingServer(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Device Owner Identity & Personal Assistant Identity (Stored Locally Per Phone!) */}
      <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-2">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              تشخیص هوشمند کاربر این گوشی (ذخیره اختصاصی روی همین دستگاه)
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              این برنامه الان روی گوشی چه کسی نصب است؟
            </h2>
            <p className="text-xs sm:text-sm leading-6 text-slate-600 dark:text-slate-300">
              این انتخاب فقط روی همین گوشی ذخیره می‌شود و با همگام‌سازی ابری تغییر نمی‌کند؛ اگر انتخاب کنید «گوشی {settings.partnerName.trim() || 'همراه'}»، تمام خطاب‌ها و دستیار صوتی اول {settings.partnerName.trim() || 'همراه'} را صدا می‌زنند.
            </p>
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChangeDeviceOwner('man')}
                className={`min-h-[52px] px-4 py-3 rounded-xl border text-right transition-colors cursor-pointer ${
                  deviceOwner === 'man'
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-slate-50/70 dark:bg-[#0B1312] border-slate-200 dark:border-emerald-900 text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                }`}
              >
                <div className="text-sm font-bold">این گوشی {settings.myName.trim() || 'من'} است</div>
                <div className={`text-[11px] mt-0.5 ${deviceOwner === 'man' ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  خطاب اول با «{settings.myName.trim() || 'من'}» · پیامک پیش‌فرض به {settings.partnerName.trim() || 'همراه'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onChangeDeviceOwner('zari')}
                className={`min-h-[52px] px-4 py-3 rounded-xl border text-right transition-colors cursor-pointer ${
                  deviceOwner === 'zari'
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-slate-50/70 dark:bg-[#0B1312] border-slate-200 dark:border-emerald-900 text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                }`}
              >
                <div className="text-sm font-bold">این گوشی {settings.partnerName.trim() || 'همراه'} است</div>
                <div className={`text-[11px] mt-0.5 ${deviceOwner === 'zari' ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  خطاب اول با «{settings.partnerName.trim() || 'همراه'}» · پیامک پیش‌فرض به {settings.myName.trim() || 'من'}
                </div>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-xl bg-slate-50/80 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-4 space-y-3">
            <label className="block text-xs font-bold text-slate-900 dark:text-white">
              نام اختصاصی دستیار شخصی ({settings.myName.trim() || 'من'} و {settings.partnerName.trim() || 'همراه'})
            </label>
            <input
              type="text"
              value={settings.assistantName ?? ''}
              onChange={(e) => onUpdateSettings({assistantName: e.target.value})}
              onBlur={() =>
                onUpdateSettings({
                  assistantName: (settings.assistantName ?? '').trim() || 'هم‌صدا',
                })
              }
              placeholder="مثلاً: هم‌صدا، نگار، یاس، همدم..."
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-sm font-semibold text-slate-900 dark:text-white"
            />
            <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              در تب <strong>دستیار صوتی</strong> وقتی با همین نام صدایش بزنید (مثلاً «{(settings.assistantName ?? '').trim() || 'هم‌صدا'} ساعت چنده؟») جواب می‌دهد و دستورها را اجرا می‌کند.
            </p>
          </div>
        </div>
      </section>

      {/* Per-Device Master Speaker Mode (Auto vs Manual) & Quick App Refresh */}
      <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {localVoiceControls.masterSpeakerEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              )}
              <span>تنظیم کلی سخنگو (مختص همین گوشی: {selfName})</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              حالت سخنگوی خودکار یا دستی کردن (بی‌صدا) روی گوشی {selfName}
            </h2>
            <p className="text-xs sm:text-sm leading-6 text-slate-600 dark:text-slate-300 max-w-3xl">
              این تنظیم فقط روی <strong>گوشی {selfName}</strong> اعمال می‌شود و گوشی {partnerOtherName} را تغییر نمی‌دهد. در حالت عادی همه‌چیز خودکار با صدا اعلام می‌شود؛ با خاموش کردن این کلید، برنامه کاملاً به <strong>حالت دستی</strong> می‌رود و هیچ تماس، پیامک، یادآور صبحگاهی یا پاسخ دستیاری خودکار بلند خوانده نمی‌شود (فقط وقتی خودتان دکمه پخش را بزنید صدا می‌آید).
            </p>
          </div>

          <div className="shrink-0 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() =>
                onUpdateLocalVoiceControls({
                  masterSpeakerEnabled: !localVoiceControls.masterSpeakerEnabled,
                })
              }
              className={`min-h-[48px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                localVoiceControls.masterSpeakerEnabled
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {localVoiceControls.masterSpeakerEnabled ? (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>سخنگو روشن است (کلیک برای خاموش/دستی کردن)</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4" />
                  <span>سخنگو خاموش / دستی است (کلیک برای روشن کردن)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onRefreshApp}
              className="min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] hover:bg-slate-100 dark:hover:bg-emerald-950/40 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>بروزرسانی برنامه (رفرش)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {[
            {
              key: 'autoCallAnnounce' as const,
              title: 'اعلام خودکار تماس ورودی',
              desc: `اعلام نام تماس‌گیرنده روی گوشی ${selfName}`,
            },
            {
              key: 'autoSmsAnnounce' as const,
              title: 'خواندن خودکار پیامک ورودی',
              desc: `خواندن فرستنده و متن پیامک روی گوشی ${selfName}`,
            },
            {
              key: 'autoScheduleAnnounce' as const,
              title: 'پخش خودکار صبحگاهی و زمان‌بند',
              desc: `پخش صوتی یادآورهای روزانه روی گوشی ${selfName}`,
            },
            {
              key: 'autoAssistantSpeak' as const,
              title: 'خواندن خودکار پاسخ دستیار',
              desc: `پاسخ صوتی خودکار دستیار ${settings.assistantName || 'هم‌صدا'} روی گوشی ${selfName}`,
            },
          ].map((item) => {
            const active = localVoiceControls.masterSpeakerEnabled && localVoiceControls[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  const nextVal = !localVoiceControls[item.key];
                  onUpdateLocalVoiceControls({
                    ...(nextVal && !localVoiceControls.masterSpeakerEnabled
                      ? {masterSpeakerEnabled: true}
                      : {}),
                    [item.key]: nextVal,
                  });
                }}
                className={`min-h-[68px] p-3.5 rounded-xl border text-right transition-colors cursor-pointer flex flex-col justify-between ${
                  active
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100'
                    : 'bg-slate-50/70 dark:bg-[#0B1312] border-slate-200 dark:border-emerald-950 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{item.title}</span>
                  <span
                    className={`text-[11px] font-bold ${
                      active ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {!localVoiceControls.masterSpeakerEnabled
                      ? 'دستی (کل خاموش)'
                      : localVoiceControls[item.key]
                        ? 'روشن'
                        : 'دستی'}
                  </span>
                </div>
                <span className="mt-1 text-[11px] opacity-80">{item.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Real-time Cloud Sync between Bahman & Zari's Phones */}
      <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Cloud className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>همگام‌سازی لحظه‌ای ابری (Firestore) بین گوشی {selfName} و {partnerOtherName}</span>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              همگام‌سازی خودکار دو گوشی، زمان‌بند و نسخه اندروید (APK)
            </h1>
            <p className="mt-1.5 text-sm leading-7 text-slate-600 dark:text-slate-300 max-w-3xl">
              با ورود به حساب گوگل روی گوشی {selfName} و گوشی {partnerOtherName}، تمام اهداف، عادت‌ها، شکرگذاری‌ها، زمان‌بندی‌ها، مخاطبین تماس و تنظیمات به‌صورت خودکار بین هر دو دستگاه مچ می‌شوند.
            </p>
          </div>

          <div className="shrink-0">
            {cloudUserEmail ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span dir="ltr">{cloudUserEmail}</span>
                </div>
                <button
                  type="button"
                  disabled={cloudBusy}
                  onClick={onCloudSignOut}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>خروج</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={cloudBusy || !isOnline}
                onClick={onCloudSignIn}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{cloudBusy ? 'در حال اتصال...' : 'ورود با گوگل برای همگام‌سازی'}</span>
              </button>
            )}
          </div>
        </div>

        {cloudUserEmail && spaceInfo && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-emerald-950/60">
            <div className="rounded-xl bg-slate-50/80 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-4 space-y-3">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                ۱. دعوت گوشی {partnerOtherName} (مچ شدن خودکار با جیمیل)
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-5">
                کافی است ایمیل جیمیل گوشی {partnerOtherName} را اینجا ثبت کنید (یا با همین ایمیل در هر دو گوشی وارد شوید) تا گوشی {partnerOtherName} به‌محض باز کردن برنامه خودکار به همین فضای مشترک وصل شود.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  dir="ltr"
                  value={partnerEmailInput}
                  onChange={(e) => setPartnerEmailInput(e.target.value)}
                  placeholder="partner.gmail@gmail.com"
                  className="flex-1 min-w-[200px] min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-xs font-mono-num text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  disabled={cloudBusy || !partnerEmailInput.trim()}
                  onClick={() => onInvitePartner(partnerEmailInput)}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  ثبت ایمیل همراه
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  کد فضای مشترک:{' '}
                  <code dir="ltr" className="font-mono-num text-slate-800 dark:text-slate-200">
                    {spaceInfo.spaceId}
                  </code>
                </span>
                <button
                  type="button"
                  onClick={handleCopySpaceId}
                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 text-xs text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  {copiedSpace ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>کپی کد فضا</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/80 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-4 space-y-3">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                ۲. اتصال با کد فضا یا ارسال داده‌های فعلی
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  placeholder="کد فضای دریافت‌شده از گوشی دیگر"
                  className="flex-1 min-w-[180px] min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-xs font-mono-num text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  disabled={cloudBusy || !joinCodeInput.trim()}
                  onClick={() => onJoinSpaceByCode(joinCodeInput)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] hover:bg-slate-100 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>اتصال</span>
                </button>
              </div>
              <button
                type="button"
                disabled={cloudBusy}
                onClick={onPushLocalToCloud}
                className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                همگام‌سازی و ارسال داده‌های فعلی این گوشی به ابر
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Native Android APK Capabilities & GitHub Actions APK Build */}
      <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Smartphone className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>
                وضعیت محیط اجرا:{' '}
                {nativeCaps.isNative ? 'اپلیکیشن بومی اندروید (APK)' : 'نسخه وب / PWA'}
                {' · '}فایل‌های صوتی آفلاین: {toPersianDigits(cachedClipsCount)} مورد
              </span>
            </div>
            <h2 className="mt-2 text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              سرویس دائمی پس‌زمینه، اعلام خودکار تماس ورودی و ساخت فایل APK در گیت‌هاب
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm leading-6 text-slate-600 dark:text-slate-300 max-w-3xl">
              پروژه بومی اندروید (Capacitor + سرویس پس‌زمینه کاتلین + گیرنده تماس ورودی + آلارم دقیق بیدارباش) و گردش‌کار گیت‌هاب (<code dir="ltr">.github/workflows/build-apk.yml</code>) داخل کدهای این برنامه آماده شده است.
            </p>
            <p className="mt-2 text-xs leading-6 text-slate-600 dark:text-slate-300 max-w-3xl">
              برای اعلام متن پیامک جدید و نام تماس‌گیرنده، اندروید باید هم‌صدا را با انتخاب صریح شما به‌عنوان دستیار پیش‌فرض ثبت کند. مجوزهای حساس فقط پس از این انتخاب درخواست می‌شوند. مجوز گزارش تماس فقط برای دریافت شماره تماس ورودی از اعلان سیستمی استفاده می‌شود و برنامه تاریخچه تماس‌ها را نمی‌خواند. با لغو نقش دستیار، پردازش پیامک و شماره تماس متوقف می‌شود. انتخاب نقش و مجوزها همیشه در کنترل شماست.
            </p>
          </div>

          <div className="shrink-0 flex flex-wrap gap-2">
            {nativeCaps.isNative ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await openAssistantSettingsNative();
                    onStatusToast(result.ok
                      ? 'تنظیمات دستیار گوشی باز شد؛ در بخش دستیار دیجیتال، هم‌صدا را انتخاب کن.'
                      : (result.message || 'تنظیمات دستیار باز نشد؛ از دکمه درخواست دستیار استفاده کن.'));
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-emerald-700 text-emerald-800 dark:text-emerald-300 dark:border-emerald-700 text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>رفتن مستقیم به تنظیمات دستیار</span>
                </button>
                <button
                  type="button"
                  onClick={onRequestNativePermissions}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>تنظیم دستیار پیش‌فرض و مجوزها</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAppInfoSettings}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  باز کردن تنظیمات محدودشده برنامه
                </button>
                <button
                  type="button"
                  onClick={onOpenXiaomiOtherPermissions}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  مجوزهای دیگر شیائومی (پاپ‌آپ و پس‌زمینه)
                </button>
                <button
                  type="button"
                  onClick={() => openBatteryAndAutostartSettingsNative()}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  باتری بدون محدودیت و Autostart
                </button>
              </>
            ) : isInstalled ? (
              <div className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm font-semibold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>نسخه PWA نصب شده است</span>
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>نصب وب‌اپ (PWA) روی گوشی</span>
              </button>
            ) : (
              <div className="text-xs text-slate-600 dark:text-slate-300 max-w-xs leading-6">
                {isIOS
                  ? 'در Safari دکمه Share و سپس Add to Home Screen را بزنید.'
                  : 'برای ساخت APK: پروژه را به گیت‌هاب خود بفرستید تا در تب Actions فایل app-debug.apk ساخته و آماده دانلود شود.'}
              </div>
            )}
          </div>
        </div>



        {nativeCaps.isNative && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2">
            {[
              {label: 'دستیار پیش‌فرض اندروید', ok: nativeCaps.assistantRoleHeld},
              {label: 'تشخیص تماس ورودی', ok: nativeCaps.phoneState},
              {label: 'شماره تماس‌گیرنده (مجوز حساس)', ok: Boolean(nativeCaps.assistantRoleHeld && nativeCaps.callLog && nativeCaps.phoneState)},
              {label: 'خواندن پیامک (SMS)', ok: nativeCaps.sms},
              {label: 'خواندن نام مخاطبین', ok: nativeCaps.contacts},
              {label: 'اعلان‌های اندروید', ok: nativeCaps.notifications},
              {label: 'معافیت باتری MIUI/HyperOS', ok: nativeCaps.batteryIgnored},
              {label: 'باز شدن خودکار صبح', ok: nativeCaps.overlay},
              {label: 'سرویس دائمی پس‌زمینه', ok: nativeCaps.keepAliveRunning},
              {label: 'آلارم دقیق صبحگاهی', ok: nativeCaps.exactAlarm},
              {label: 'میکروفون دستیار و ضبط', ok: Boolean(nativeCaps.microphone)},
              {label: 'تغییر حالت سایلنت', ok: Boolean(nativeCaps.dndPolicy)},
              {label: 'تماس و پیامک دستیار', ok: Boolean(nativeCaps.callPhone && nativeCaps.sendSms)},
              {label: 'تنظیم نور صفحه سیستم', ok: Boolean(nativeCaps.writeSettings)},
            ].map((perm) => (
              <div
                key={perm.label}
                className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                  perm.ok
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                }`}
              >
                <div>{perm.label}</div>
                <div className="mt-0.5 text-[11px] font-normal">
                  {perm.ok ? 'فعال و آماده' : 'نیاز به تایید'}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSaveServerUrl} className="rounded-xl bg-slate-50/70 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-4 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                نشانی سرور صدای روان فارسی برای استفاده داخل فایل APK
              </label>
              <input
                type="text"
                inputMode="url"
                dir="ltr"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                placeholder="https://hamseda-app.ai.studio"
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-xs font-mono-num text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={checkingServer}
              className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shrink-0 disabled:opacity-60"
            >
              {checkingServer ? 'در حال بررسی...' : 'ذخیره و تست اتصال سرور'}
            </button>
          </div>
          {serverCheckStatus && (
            <div
              className={`text-xs font-medium px-3 py-2 rounded-lg ${
                serverCheckStatus.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
              }`}
            >
              {serverCheckStatus.msg}
            </div>
          )}
        </form>
      </section>

      <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">مدیریت هوشمند خواندن پیامک‌ها</h2>
          <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
            تنظیمات روی گوشی و به‌صورت آفلاین ذخیره می‌شود. پیامک‌ها همچنان دریافت می‌شوند؛ فقط خواندن خودکار آن‌ها کنترل می‌شود.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-200">فرستنده‌هایی که خوانده نشوند (شماره یا نام، هرکدام در یک خط)</label>
            <textarea rows={3} value={smsBlockedSenders} onChange={(e) => setSmsBlockedSenders(e.target.value)} placeholder="مثلاً: 9821\\nشماره یا نام فرستنده" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-200">کلمات کلیدی تبلیغاتی</label>
            <textarea rows={3} value={smsBlockedKeywords} onChange={(e) => setSmsBlockedKeywords(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-200">فرستنده‌های مهم که از فیلتر تبلیغاتی مستثنا هستند</label>
            <textarea rows={2} value={smsImportantSenders} onChange={(e) => setSmsImportantSenders(e.target.value)} placeholder="شماره یا نام مخاطب مهم، هرکدام در یک خط" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-200">سکوت موقت خواندن پیامک</label>
            <select value={smsQuietHours} onChange={(e) => setSmsQuietHours(e.target.value)} className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white">
              <option value="0">خاموش</option>
              <option value="2">۲ ساعت</option>
              <option value="4">۴ ساعت</option>
              <option value="8">۸ ساعت</option>
              <option value="24">تا پایان یک روز (۲۴ ساعت)</option>
            </select>
          </div>
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/25 p-3 text-xs text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={smsSkipBankAndOtp}
            onChange={(e) => setSmsSkipBankAndOtp(e.target.checked)}
            className="mt-0.5 accent-emerald-700"
          />
          <span>
            <strong>محافظت حریم بانکی: پیامک‌های بانک، مانده حساب، سقف/مرز تراکنش و رمز پویا خوانده نشوند (پیشنهادی)</strong>
            <span className="block mt-1 leading-5 text-slate-500 dark:text-slate-400">
              به‌صورت پیش‌فرض روشن است تا موجودی حساب، گردش واریز و برداشت، محدودیت‌ها و رمزهای پویا با صدای بلند پخش نشوند (مگر اینکه خودتان تیک را بردارید).
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/25 p-3 text-xs text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={smsFilterOperatorPromotions}
            onChange={(e) => setSmsFilterOperatorPromotions(e.target.checked)}
            className="mt-0.5 accent-emerald-700"
          />
          <span>
            <strong>پیامک‌های تبلیغاتی اپراتورها خوانده نشوند</strong>
            <span className="block mt-1 leading-5 text-slate-500 dark:text-slate-400">
              تبلیغات قابل‌شناسایی ایرانسل، همراه اول و رایتل را بی‌صدا رد می‌کند؛ پیامک‌های خدماتی و رمز یک‌بارمصرف نباید صرفاً به‌خاطر نام اپراتور حذف شوند.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={smsSummarize} onChange={(e) => setSmsSummarize(e.target.checked)} className="accent-emerald-700" />
          خواندن کوتاه و خلاصه‌وار پیام‌های طولانی
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!nativeCaps.isNative || smsPolicySaving} onClick={async () => {
            setSmsPolicySaving(true);
            localStorage.setItem('rmz_sms_blocked_senders', smsBlockedSenders);
            localStorage.setItem('rmz_sms_blocked_keywords', smsBlockedKeywords);
            localStorage.setItem('rmz_sms_important_senders', smsImportantSenders);
            localStorage.setItem('rmz_sms_quiet_hours', smsQuietHours);
            localStorage.setItem('rmz_sms_summarize', String(smsSummarize));
            localStorage.setItem('rmz_sms_filter_operator_promotions', String(smsFilterOperatorPromotions));
            localStorage.setItem('rmz_sms_skip_bank_and_otp', String(smsSkipBankAndOtp));
            const ok = await saveSmsAnnouncementPolicyNative({
              blockedSenders: smsBlockedSenders,
              blockedKeywords: smsBlockedKeywords,
              importantSenders: smsImportantSenders,
              quietHours: Number(smsQuietHours),
              summarize: smsSummarize,
              filterOperatorPromotions: smsFilterOperatorPromotions,
              skipBankAndOtp: smsSkipBankAndOtp,
            });
            setSmsPolicySaving(false);
            onStatusToast(ok ? 'تنظیمات فیلتر پیامک روی گوشی ذخیره شد.' : 'ذخیره تنظیمات ناموفق بود؛ نسخه APK اندروید لازم است.');
          }} className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer">
            {smsPolicySaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات پیامک'}
          </button>
          {!nativeCaps.isNative && <span className="text-[11px] text-amber-700 dark:text-amber-300">ذخیره و اجرای این فیلترها فقط در APK اندروید فعال است.</span>}
        </div>
        <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          سکوت موقت فقط اعلام خودکار پیامک را متوقف می‌کند؛ دستیار و سایر قابلیت‌ها فعال می‌مانند. تشخیص تبلیغ بر پایه فرستنده و کلمات کلیدی است و ممکن است نیاز به تنظیم دستی داشته باشد.
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Preferences */}
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 space-y-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">شخصی‌سازی و ظاهر</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                نام من
              </label>
              <input
                type="text"
                value={myNameDraft}
                onFocus={() => {
                  myNameFocusedRef.current = true;
                }}
                onChange={(e) => setMyNameDraft(e.target.value)}
                onBlur={() => {
                  myNameFocusedRef.current = false;
                  const finalName = myNameDraft.trim() || 'من';
                  setMyNameDraft(finalName);
                  if (finalName !== settings.myName) {
                    onUpdateSettings({myName: finalName});
                  }
                }}
                placeholder="مثلاً: نام دلخواه شما..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                نام همراه
              </label>
              <input
                type="text"
                value={partnerNameDraft}
                onFocus={() => {
                  partnerNameFocusedRef.current = true;
                }}
                onChange={(e) => setPartnerNameDraft(e.target.value)}
                onBlur={() => {
                  partnerNameFocusedRef.current = false;
                  const finalPartner = partnerNameDraft.trim() || 'همراه';
                  setPartnerNameDraft(finalPartner);
                  if (finalPartner !== settings.partnerName) {
                    onUpdateSettings({partnerName: finalPartner});
                  }
                }}
                placeholder="مثلاً: نام دلخواه همراه..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              گوینده پیش‌فرض صدای روان فارسی
            </label>
            <select
              value={settings.defaultVoice}
              onChange={(e) => onUpdateSettings({defaultVoice: e.target.value as VoiceName})}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-sm text-slate-800 dark:text-slate-100"
            >
              {VOICE_PERSONAS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              حالت نمایش
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-emerald-950/70 rounded-xl">
              <button
                type="button"
                onClick={() => onUpdateSettings({theme: 'light'})}
                className={`min-h-[42px] rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  settings.theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>روز روشن</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({theme: 'dark'})}
                className={`min-h-[42px] rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'bg-[#172724] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>شب آرام</span>
              </button>
            </div>
          </div>
        </section>

        {/* Manual JSON Backup (Secondary offline method) */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              پشتیبان‌گیری دستی و انتقال آفلاین فایل (JSON)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              علاوه بر همگام‌سازی خودکار ابری، همیشه می‌توانید یک نسخه فایل پشتیبان در گوشی ذخیره کنید.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleDownloadJson(false)}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>ذخیره فایل پشتیبان (JSON)</span>
            </button>

            {nativeCaps.isNative && (
              <button
                type="button"
                onClick={() => handleDownloadJson(true)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-800 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>اشتراک‌گذاری مستقیم فایل</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyCode}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs sm:text-sm font-medium flex items-center gap-2 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>کپی کد پشتیبان</span>
            </button>

            {nativeCaps.isNative ? (
              <button
                type="button"
                onClick={handleNativePickJson}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs sm:text-sm font-medium flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>بارگذاری فایل پشتیبان</span>
              </button>
            ) : (
              <label className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs sm:text-sm font-medium flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>بارگذاری فایل پشتیبان</span>
                <input type="file" accept="*/*" onChange={handleFileUpload} className="hidden" />
              </label>
            )}
          </div>

          <form onSubmit={handleImportSubmit} className="pt-4 border-t border-slate-100 dark:border-emerald-950/60 space-y-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              یا کد پشتیبان دریافت‌شده را اینجا جای‌گذاری کنید
            </label>
            <textarea
              rows={2}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              dir="ltr"
              placeholder='{"app":"roozhaye-man-o-zari", ...}'
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-xs font-mono-num text-slate-800 dark:text-slate-200"
            />
            <button
              type="submit"
              disabled={!importText.trim()}
              className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-emerald-600 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              ادغام اطلاعات
            </button>
          </form>
        </section>
      </div>

      {/* Free Public Sponsorship Card */}
      <section className="rounded-2xl luxury-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-amber-300/60 dark:border-emerald-800/70">
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
            نسخه رایگان هم‌صدا برای همه · با حمایت TapNFC.ir
          </h2>
          <p className="mt-1 text-xs sm:text-sm leading-6 text-slate-600 dark:text-slate-300">
            استفاده از امکانات برنامه‌ریزی، دستیار فارسی و همگام‌سازی برای تمامی زوج‌ها و کاربران به‌صورت رایگان با پشتیبانی TapNFC فراهم شده است.
          </p>
        </div>
        <a
          href="https://tapnfc.ir"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
        >
          <span dir="ltr">tapnfc.ir</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </section>
    </div>
  );
};
