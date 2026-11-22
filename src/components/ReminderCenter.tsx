import React, {useState} from 'react';
import {Bell, BellOff, Clock, FileAudio, Plus, Play, Radio, Trash2} from 'lucide-react';
import {toPersianDigits, VOICE_PERSONAS} from '../data/persianLibrary';
import type {AppSettings, ScheduleTopic, ScheduledAnnouncement, VoiceName} from '../types/app';

const TOPIC_LABELS: Record<ScheduleTopic, string> = {
  morning: 'پیام صبحگاهی',
  goals: 'اهداف امروز',
  energy: 'انرژی و انگیزه',
  gratitude: 'شکرگذاری',
  night_movies: 'پیشنهاد شبانه',
  custom: 'متن دلخواه',
};
const DAYS_LABELS: Record<ScheduledAnnouncement['days'], string> = {
  daily: 'هر روز',
  weekdays: 'روزهای کاری',
  weekends: 'آخر هفته',
};

interface ReminderCenterProps {
  settings: AppSettings;
  schedules: ScheduledAnnouncement[];
  notifPermission: NotificationPermission;
  keepAliveActive: boolean;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onRequestNotificationPermission: () => void;
  onToggleKeepAlive: (enabled: boolean) => void;
  onAddSchedule: (schedule: Omit<ScheduledAnnouncement, 'id'>) => void;
  onToggleSchedule: (id: string) => void;
  onUpdateSchedule: (id: string, patch: Partial<ScheduledAnnouncement>) => void;
  onDeleteSchedule: (id: string) => void;
  onTestSchedule: (schedule: ScheduledAnnouncement) => void;
  onDownloadScheduleAlarm: (schedule: ScheduledAnnouncement) => Promise<void>;
  onStatusToast: (message: string) => void;
}

export const ReminderCenter: React.FC<ReminderCenterProps> = ({
  settings, schedules, notifPermission, keepAliveActive, onUpdateSettings,
  onRequestNotificationPermission, onToggleKeepAlive, onAddSchedule,
  onToggleSchedule, onUpdateSchedule, onDeleteSchedule, onTestSchedule,
  onDownloadScheduleAlarm, onStatusToast,
}) => {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState<ScheduleTopic>('morning');
  const [time, setTime] = useState('08:00');
  const [days, setDays] = useState<ScheduledAnnouncement['days']>('daily');
  const [voice, setVoice] = useState<VoiceName>(settings.defaultVoice);
  const [customText, setCustomText] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim() || TOPIC_LABELS[topic];
    if (topic === 'custom' && !customText.trim()) {
      onStatusToast('برای یادآور دلخواه، متن اعلام را وارد کن.');
      return;
    }
    onAddSchedule({
      title: cleanTitle, topic, time, enabled: true, voiceName: voice, days,
      customText: topic === 'custom' ? customText.trim() : undefined,
    });
    setTitle('');
    setCustomText('');
    onStatusToast(`یادآور «${cleanTitle}» برای ساعت ${toPersianDigits(time)} ثبت شد.`);
  };

  const downloadAlarm = async (item: ScheduledAnnouncement) => {
    setDownloadingId(item.id);
    try { await onDownloadScheduleAlarm(item); }
    finally { setDownloadingId(null); }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            یادآورهای هم‌صدا
          </h2>
          <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
            یادآورهای روزانه را اینجا بساز و زمان، گوینده و فعال بودنشان را مدیریت کن.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRequestNotificationPermission}
            className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${notifPermission === 'granted' ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'}`}>
            {notifPermission === 'granted' ? <Bell className="w-4 h-4"/> : <BellOff className="w-4 h-4"/>}
            {notifPermission === 'granted' ? 'اعلان گوشی فعال است' : 'فعال‌سازی اعلان گوشی'}
          </button>
          <button type="button" onClick={() => onToggleKeepAlive(!settings.backgroundKeepAlive)}
            className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${settings.backgroundKeepAlive ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-slate-100 dark:bg-[#0B1312] border-slate-200 dark:border-emerald-900 text-slate-800 dark:text-slate-200'}`}>
            <Radio className="w-4 h-4"/>
            {settings.backgroundKeepAlive ? (keepAliveActive ? 'سرویس پس‌زمینه روشن' : 'سرویس پس‌زمینه فعال‌سازی‌شده') : 'روشن کردن اجرای پس‌زمینه'}
          </button>
          <button type="button" onClick={() => onUpdateSettings({autoOpenMorning: !settings.autoOpenMorning})}
            className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {settings.autoOpenMorning ? 'باز شدن خودکار صبح: فعال' : 'باز شدن خودکار صبح: خاموش'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {schedules.map((item) => (
          <article key={item.id} className={`rounded-2xl border p-4 space-y-3 ${item.enabled ? 'bg-white dark:bg-[#121E1C] border-slate-200 dark:border-emerald-900/80' : 'bg-slate-50 dark:bg-[#0B1312] border-slate-200 dark:border-emerald-950 opacity-75'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">{TOPIC_LABELS[item.topic]}</span>
                  <span className="text-slate-500 dark:text-slate-400">{DAYS_LABELS[item.days]}</span>
                </div>
                <h3 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
                {item.customText && <p className="mt-1 text-xs text-slate-500 dark:text-slate-300 line-clamp-2">{item.customText}</p>}
              </div>
              <button type="button" onClick={() => onToggleSchedule(item.id)}
                className={`min-h-[40px] min-w-[64px] px-3 rounded-xl text-xs font-semibold ${item.enabled ? 'bg-emerald-700 text-white' : 'bg-slate-200 dark:bg-emerald-950 text-slate-700 dark:text-slate-300'}`}>
                {item.enabled ? 'فعال' : 'خاموش'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400">ساعت اعلام
                <span className="relative block mt-1"><Clock className="w-3.5 h-3.5 absolute right-3 top-3 text-slate-400"/>
                  <input type="time" value={item.time} onChange={(e) => onUpdateSchedule(item.id, {time: e.target.value})}
                    className="w-full min-h-[42px] pr-8 pl-2 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-mono-num text-slate-900 dark:text-white"/>
                </span>
              </label>
              <label className="text-[11px] text-slate-500 dark:text-slate-400">گوینده
                <select value={item.voiceName} onChange={(e) => onUpdateSchedule(item.id, {voiceName: e.target.value as VoiceName})}
                  className="w-full min-h-[42px] mt-1 px-2 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white">
                  {VOICE_PERSONAS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onTestSchedule(item)} className="min-h-[40px] flex-1 px-3 rounded-xl bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                <Play className="w-3.5 h-3.5"/> تست اعلام
              </button>
              <button type="button" disabled={downloadingId === item.id} onClick={() => void downloadAlarm(item)}
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-50 inline-flex items-center gap-1.5">
                <FileAudio className="w-3.5 h-3.5"/> {downloadingId === item.id ? 'در حال ساخت...' : 'دانلود زنگ'}
              </button>
              <button type="button" onClick={() => onDeleteSchedule(item.id)} aria-label="حذف یادآور"
                className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-emerald-900 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-4 h-4"/>
              </button>
            </div>
          </article>
        ))}
        {schedules.length === 0 && <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 dark:border-emerald-900 p-6 text-center text-sm text-slate-500">هنوز یادآوری ثبت نشده است؛ از فرم زیر اولین یادآورت را بساز.</div>}
      </div>

      <form onSubmit={submit} className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-4 sm:p-6 space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-700"/> افزودن یادآور جدید</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان یادآور" className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"/>
          <select value={topic} onChange={(e) => setTopic(e.target.value as ScheduleTopic)} className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white">
            <option value="morning">پیام صبحگاهی</option><option value="goals">اهداف امروز</option><option value="energy">انرژی و انگیزه</option><option value="gratitude">شکرگذاری</option><option value="night_movies">پیشنهاد شبانه</option><option value="custom">متن دلخواه</option>
          </select>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-mono-num text-slate-900 dark:text-white"/>
          <select value={days} onChange={(e) => setDays(e.target.value as ScheduledAnnouncement['days'])} className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white">
            <option value="daily">هر روز</option><option value="weekdays">روزهای کاری</option><option value="weekends">آخر هفته</option>
          </select>
          <select value={voice} onChange={(e) => setVoice(e.target.value as VoiceName)} className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white">
            {VOICE_PERSONAS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          {topic === 'custom' && <textarea rows={2} value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="متنی که در زمان مقرر خوانده شود" className="sm:col-span-2 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white"/>}
        </div>
        <button type="submit" className="min-h-[44px] px-5 rounded-xl bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-2"><Plus className="w-4 h-4"/> ثبت یادآور</button>
      </form>
    </section>
  );
};
