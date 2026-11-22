import React, {useState} from 'react';
import {
  AudioLines,
  Car,
  Download,
  HeartHandshake,
  LayoutGrid,
  Mic,
  Moon,
  Music2,
  PhoneCall,
  RefreshCw,
  Settings,
  Sun,
  Volume2,
  VolumeX,
  Users,
  X,
} from 'lucide-react';
import type {AppTab, DeviceOwner} from '../types/app';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface TopBarProps {
  activeTab: AppTab;
  deviceOwner: DeviceOwner;
  selfName: string;
  assistantName: string;
  theme: 'light' | 'dark';
  masterSpeakerEnabled: boolean;
  onToggleTheme: () => void;
  onToggleMasterSpeaker: () => void;
  onRefreshApp: () => void;
  onSelectTab: (tab: AppTab) => void;
  onQuickPlayMorning: () => void;
  onOpenDriveMode: () => void;
}

const DESKTOP_NAV_ITEMS: {id: AppTab; label: string; subtitle: string; icon: React.FC<{className?: string}>}[] = [
  {id: 'today', label: 'امروزِ ما', subtitle: 'اهداف، لیست خرید، مخارج و عادت‌ها', icon: Sun},
  {id: 'family', label: 'زندگی و خانواده', subtitle: '۱۲ ابزار کاربردی خانواده', icon: Users},
  {id: 'assistant', label: 'دستیار صوتی', subtitle: 'گفت‌وگو و فرمان‌های صوتی', icon: Mic},
  {id: 'night', label: 'رسانه و پخش', subtitle: 'موسیقی، رادیو، پادکست، فیلم و پیام‌ساز', icon: Music2},
  {id: 'gratitude', label: 'شکرگذاری', subtitle: 'دفتر قدردانی و یادداشت مهر', icon: HeartHandshake},
  {id: 'voice', label: 'کتابخانه صوتی', subtitle: 'صداهای آفلاین، کلون صدا و دانلود', icon: AudioLines},
  {id: 'caller', label: 'تماس و پیامک', subtitle: 'اعلام نام تماس‌گیرنده و پیامک', icon: PhoneCall},
  {id: 'sync', label: 'تنظیمات', subtitle: 'همگام‌سازی ابری، زمان‌بندی و نصب', icon: Settings},
];

const MOBILE_PRIMARY_TABS: {id: Exclude<AppTab, 'gratitude' | 'voice' | 'sync'>; label: string; icon: React.FC<{className?: string}>}[] = [
  {id: 'today', label: 'امروز', icon: Sun},
  {id: 'assistant', label: 'دستیار', icon: Mic},
  {id: 'night', label: 'رسانه', icon: Music2},
  {id: 'caller', label: 'تماس', icon: PhoneCall},
];

const MORE_DRAWER_TABS: {id: AppTab; label: string; subtitle: string; icon: React.FC<{className?: string}>}[] = [
  {id: 'family', label: 'زندگی و خانواده', subtitle: '۱۲ ابزار سلامت، مالی، خرید و رشد', icon: Users},
  {id: 'gratitude', label: 'شکرگذاری و انرژی', subtitle: 'ثبت شکرگذاری روزانه و پیام انرژی‌بخش', icon: HeartHandshake},
  {id: 'voice', label: 'کتابخانه صوتی', subtitle: 'صداهای ذخیره‌شده، حذف نویز و کلون صدا', icon: AudioLines},
  {id: 'sync', label: 'تنظیمات و نصب', subtitle: 'همگام‌سازی ابری، زمان‌بند و انتقال نسخه', icon: Settings},
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  deviceOwner: _deviceOwner,
  selfName,
  assistantName,
  theme,
  masterSpeakerEnabled,
  onToggleTheme,
  onToggleMasterSpeaker,
  onRefreshApp,
  onSelectTab,
  onQuickPlayMorning,
  onOpenDriveMode,
}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const isDrawerTabActive = activeTab === 'gratitude' || activeTab === 'voice' || activeTab === 'sync' || activeTab === 'family';
  const drawerActiveShortLabel =
    activeTab === 'gratitude' ? 'شکر' : activeTab === 'voice' ? 'صوت' : activeTab === 'sync' ? 'تنظیم' : activeTab === 'family' ? 'خانواده' : 'بخش‌ها';

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[#E6E2D8] dark:border-emerald-950/80 bg-[#FAF9F6]/92 dark:bg-[#0B1412]/92 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => onSelectTab('today')}
              className="flex items-center gap-2 text-base md:text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-lg px-1"
            >
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-800 to-emerald-950 dark:from-emerald-600 dark:to-emerald-900 border border-amber-400/40 flex items-center justify-center shrink-0">
                <AudioLines className="w-4 h-4 text-amber-300" />
              </span>
              <span>هم‌صدا</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('sync')}
              title="تغییر هویت گوشی"
              className="text-[11px] font-semibold text-emerald-800 dark:text-amber-300 hover:underline whitespace-nowrap cursor-pointer"
            >
              · گوشی {selfName}
            </button>
          </div>

          <nav className="hidden lg:flex items-center gap-5" aria-label="ناوبری اصلی">
            {DESKTOP_NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                    active
                      ? 'text-emerald-900 dark:text-amber-300 font-bold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-[1px] h-[2.5px] bg-gradient-to-r from-emerald-700 via-amber-500 to-emerald-700 dark:from-emerald-400 dark:via-amber-300 dark:to-emerald-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'تغییر به حالت روشن' : 'تغییر به حالت شب'}
              title={theme === 'dark' ? 'حالت روز لوکس' : 'حالت شب سینمایی'}
              className="min-h-[40px] w-[40px] rounded-xl border border-[#DFDBD0] dark:border-emerald-900/70 bg-white/80 dark:bg-[#111E1B] text-slate-700 dark:text-amber-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

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
                  ? 'border-emerald-700/25 dark:border-emerald-700/60 bg-emerald-50/90 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300'
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
              className="min-h-[40px] px-2.5 py-2 rounded-xl border border-[#DFDBD0] dark:border-emerald-900/70 bg-white/80 dark:bg-[#111E1B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span className="hidden xl:inline">بروزرسانی</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('assistant')}
              title={`گفت‌وگو با دستیار ${assistantName}`}
              className={`hidden sm:flex min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'assistant'
                  ? 'bg-slate-900 border-slate-900 text-white dark:bg-emerald-700 dark:border-emerald-700'
                  : 'border-[#DFDBD0] dark:border-emerald-900/70 bg-white/80 dark:bg-[#111E1B] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40'
              }`}
            >
              <Mic className="w-4 h-4 shrink-0" />
              <span>صدا زدن {assistantName}</span>
            </button>

            {!isInstalled && isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>نصب برنامه</span>
              </button>
            ) : !isInstalled && isIOS ? (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>نصب آیفون</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onQuickPlayMorning}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-gradient-to-l from-emerald-800 to-emerald-900 hover:from-emerald-900 hover:to-emerald-950 dark:from-emerald-600 dark:to-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              >
                <Volume2 className="w-4 h-4 shrink-0 text-amber-200" />
                <span className="hidden sm:inline">پخش پیام امروز</span>
                <span className="sm:hidden">پیام روز</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Clear 5-Slot Thumb Dock */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAF9F6]/95 dark:bg-[#0B1412]/95 backdrop-blur-xl border-t border-[#DFDBD0] dark:border-emerald-950/90 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] pb-safe"
        aria-label="ناوبری پایین"
      >
        <div className="grid grid-cols-5 items-center h-[68px] px-1.5">
          {MOBILE_PRIMARY_TABS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id && !showMoreSheet;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setShowMoreSheet(false);
                  onSelectTab(item.id);
                }}
                className={`relative min-h-[54px] flex flex-col items-center justify-center gap-1 rounded-2xl transition-all cursor-pointer active:scale-[0.96] ${
                  active
                    ? 'text-emerald-900 dark:text-amber-300 font-bold'
                    : 'text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {active && (
                  <span className="absolute top-0.5 w-8 h-[3px] rounded-full bg-gradient-to-r from-emerald-700 via-amber-500 to-emerald-700 dark:from-emerald-400 dark:via-amber-300 dark:to-emerald-400" />
                )}
                <span
                  className={`w-11 h-7 rounded-xl flex items-center justify-center transition-colors ${
                    active ? 'bg-emerald-800/12 dark:bg-amber-400/15' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-[11px] leading-none whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowMoreSheet((prev) => !prev)}
            className={`relative min-h-[54px] flex flex-col items-center justify-center gap-1 rounded-2xl transition-all cursor-pointer active:scale-[0.96] ${
              showMoreSheet || isDrawerTabActive
                ? 'text-emerald-900 dark:text-amber-300 font-bold'
                : 'text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {(showMoreSheet || isDrawerTabActive) && (
              <span className="absolute top-0.5 w-8 h-[3px] rounded-full bg-gradient-to-r from-emerald-700 via-amber-500 to-emerald-700 dark:from-emerald-400 dark:via-amber-300 dark:to-emerald-400" />
            )}
            <span
              className={`w-11 h-7 rounded-xl flex items-center justify-center transition-colors ${
                showMoreSheet || isDrawerTabActive ? 'bg-emerald-800/12 dark:bg-amber-400/15' : ''
              }`}
            >
              <LayoutGrid className="w-5 h-5" />
            </span>
            <span className="text-[11px] leading-none whitespace-nowrap">
              {isDrawerTabActive ? drawerActiveShortLabel : 'بخش‌ها'}
            </span>
          </button>
        </div>
      </nav>

      {/* Luxury Category Drawer for Mobile Bottom "بخش‌ها" Button */}
      {showMoreSheet && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-xs"
          onClick={() => setShowMoreSheet(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-[#FAF9F6] dark:bg-[#0E1816] border-t border-[#E6E2D8] dark:border-emerald-900/80 p-5 pb-8 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-emerald-900 mx-auto" />
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">همه بخش‌ها و ابزارها</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  دسترسی سریع به دسته‌بندی‌های هم‌صدا
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreSheet(false)}
                aria-label="بستن فهرست"
                className="min-h-[40px] min-w-[40px] rounded-xl border border-[#E6E2D8] dark:border-emerald-900/70 flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {MORE_DRAWER_TABS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      setShowMoreSheet(false);
                    }}
                    className={`w-full min-h-[60px] px-4 py-3 rounded-2xl border flex items-center gap-3.5 text-right transition-all cursor-pointer ${
                      active
                        ? 'border-emerald-700 bg-emerald-800/10 dark:border-amber-400/50 dark:bg-emerald-950/80'
                        : 'border-[#E6E2D8] dark:border-emerald-900/60 bg-white dark:bg-[#12201D]'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        active
                          ? 'bg-emerald-800 text-amber-200 dark:bg-emerald-700'
                          : 'bg-[#F0EEE8] dark:bg-[#0B1312] text-emerald-800 dark:text-emerald-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{item.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onOpenDriveMode();
                  setShowMoreSheet(false);
                }}
                className="min-h-[48px] px-2.5 rounded-xl bg-slate-900 dark:bg-[#162724] text-amber-300 border border-amber-400/35 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Car className="w-4 h-4 shrink-0" />
                <span>رانندگی</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  setShowMoreSheet(false);
                }}
                className="min-h-[48px] px-2.5 rounded-xl border border-[#E6E2D8] dark:border-emerald-900/70 bg-white dark:bg-[#12201D] text-xs font-bold text-slate-800 dark:text-amber-300 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{theme === 'dark' ? 'حالت روز' : 'حالت شب'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onQuickPlayMorning();
                  setShowMoreSheet(false);
                }}
                className="min-h-[48px] px-2.5 rounded-xl bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Volume2 className="w-4 h-4 text-amber-200 shrink-0" />
                <span>پیام امروز</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#121E1C] p-6 border border-[#E6E2D8] dark:border-emerald-950/80 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">نصب روی آیفون و آیپد</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
              ۱. دکمه <strong>اشتراک‌گذاری (Share)</strong> را در نوار پایین مرورگر Safari بزنید.
              <br />
              ۲. گزینه <strong>Add to Home Screen</strong> را انتخاب کنید.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-emerald-800 text-white text-sm font-semibold cursor-pointer"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
};
