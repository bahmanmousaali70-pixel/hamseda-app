import React, {useState} from 'react';
import {
  AudioLines,
  Download,
  HeartHandshake,
  Mic,
  MoonStar,
  PhoneCall,
  RefreshCw,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {AppTab, DeviceOwner} from '../types/app';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface TopBarProps {
  activeTab: AppTab;
  deviceOwner: DeviceOwner;
  selfName: string;
  assistantName: string;
  masterSpeakerEnabled: boolean;
  onToggleMasterSpeaker: () => void;
  onRefreshApp: () => void;
  onSelectTab: (tab: AppTab) => void;
  onQuickPlayMorning: () => void;
}

const NAV_ITEMS: {id: AppTab; label: string; mobileLabel: string; icon: React.FC<{className?: string}>}[] = [
  {id: 'today', label: 'امروزِ ما', mobileLabel: 'امروز', icon: Sun},
  {id: 'assistant', label: 'دستیار صوتی', mobileLabel: 'دستیار', icon: Mic},
  {id: 'gratitude', label: 'شکرگذاری', mobileLabel: 'شکر', icon: HeartHandshake},
  {id: 'night', label: 'شبانه و رادیو', mobileLabel: 'شبانه', icon: MoonStar},
  {id: 'voice', label: 'کتابخانه صوتی', mobileLabel: 'صوت', icon: AudioLines},
  {id: 'caller', label: 'تماس و پیامک', mobileLabel: 'تماس', icon: PhoneCall},
  {id: 'sync', label: 'تنظیم و نصب', mobileLabel: 'تنظیم', icon: RefreshCw},
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  deviceOwner: _deviceOwner,
  selfName,
  assistantName,
  masterSpeakerEnabled,
  onToggleMasterSpeaker,
  onRefreshApp,
  onSelectTab,
  onQuickPlayMorning,
}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-emerald-950/70 bg-white/90 dark:bg-[#0E1816]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => onSelectTab('today')}
              className="text-base md:text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-md px-1"
            >
              هم‌صدا
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('sync')}
              title="تغییر هویت گوشی"
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap cursor-pointer"
            >
              · گوشی {selfName}
            </button>
          </div>

          <nav className="hidden lg:flex items-center gap-5" aria-label="ناوبری اصلی">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                    active
                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-[1px] h-0.5 bg-emerald-700 dark:bg-emerald-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleMasterSpeaker}
              title={
                masterSpeakerEnabled
                  ? `سخنگوی خودکار گوشی ${selfName} روشن است (برای حالت دستی کلیک کنید)`
                  : `سخنگوی خودکار گوشی ${selfName} خاموش است / حالت دستی (برای روشن شدن کلیک کنید)`
              }
              className={`min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                masterSpeakerEnabled
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                  : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200'
              }`}
            >
              {masterSpeakerEnabled ? (
                <Volume2 className="w-4 h-4 shrink-0" />
              ) : (
                <VolumeX className="w-4 h-4 shrink-0" />
              )}
              <span className="hidden md:inline">{masterSpeakerEnabled ? 'سخنگو' : 'دستی'}</span>
            </button>

            <button
              type="button"
              onClick={onRefreshApp}
              title="بروزرسانی برنامه (رفرش و دریافت آخرین تغییرات)"
              className="min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span className="hidden xl:inline">بروزرسانی</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('assistant')}
              title={`گفت‌وگو با دستیار ${assistantName}`}
              className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'assistant'
                  ? 'bg-slate-900 border-slate-900 text-white dark:bg-emerald-700 dark:border-emerald-700'
                  : 'border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40'
              }`}
            >
              <Mic className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">صدا زدن {assistantName}</span>
            </button>

            {!isInstalled && isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>نصب برنامه</span>
              </button>
            ) : !isInstalled && isIOS ? (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>نصب آیفون</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onQuickPlayMorning}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Volume2 className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">پخش پیام امروز</span>
                <span className="sm:hidden">پیام روز</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0E1816]/95 backdrop-blur-md border-t border-slate-200 dark:border-emerald-950/70 pb-safe"
        aria-label="ناوبری موبایل"
      >
        <div className="grid grid-cols-7 items-center h-16">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-[9.5px] leading-none whitespace-nowrap">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#121E1C] p-6 border border-slate-200 dark:border-emerald-950/80 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">نصب روی آیفون و آیپد</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
              ۱. دکمه <strong>اشتراک‌گذاری (Share)</strong> را در نوار پایین مرورگر Safari بزنید.
              <br />
              ۲. گزینه <strong>Add to Home Screen</strong> را انتخاب کنید.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
};
