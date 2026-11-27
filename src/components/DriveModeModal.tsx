import React, {useMemo, useState} from 'react';
import {
  Car,
  Check,
  GraduationCap,
  MessageSquare,
  Mic,
  ShoppingBag,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {getTodayEnglishPhrases, getTodayKey, toPersianDigits} from '../data/persianLibrary';
import {findBestContactMatch} from '../services/assistantEngine';
import {executeDeviceActionNative, isNativeAndroid} from '../services/nativeAndroidBridge';
import type {
  AppSettings,
  BillReminderItem,
  CallerContact,
  DeviceOwner,
  GoalItem,
  MealPlanEntry,
  MedicationItem,
  ShoppingItem,
  SyncedPhoneContact,
} from '../types/app';
import {buildDailyBriefingText} from '../services/dailyBriefing';
import {getPartnerNameForDevice, getSelfName} from '../utils/deviceIdentity';

interface DriveModeModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  deviceOwner: DeviceOwner;
  isSpeaking: boolean;
  goals: GoalItem[];
  shoppingItems: ShoppingItem[];
  bills: BillReminderItem[];
  meds: MedicationItem[];
  meals: MealPlanEntry[];
  todayExpenseTotal: number;
  monthExpenseTotal: number;
  monthlyBudget: number;
  syncedContacts: SyncedPhoneContact[];
  callers: CallerContact[];
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStopSpeech: () => void;
  onOpenAssistant: () => void;
  onStatusToast: (msg: string) => void;
}

export const DriveModeModal: React.FC<DriveModeModalProps> = ({
  open,
  onClose,
  settings,
  deviceOwner,
  isSpeaking,
  goals,
  shoppingItems,
  bills,
  meds,
  meals,
  todayExpenseTotal,
  monthExpenseTotal,
  monthlyBudget,
  syncedContacts,
  callers,
  onSpeakText,
  onStopSpeech,
  onOpenAssistant,
  onStatusToast,
}) => {
  const [sendingSmsIdx, setSendingSmsIdx] = useState<number | null>(null);
  const [sentIdx, setSentIdx] = useState<number | null>(null);

  const selfName = getSelfName(settings, deviceOwner);
  const partnerName = getPartnerNameForDevice(settings, deviceOwner);
  const assistantName = settings.assistantName?.trim() || 'رفیقو';

  const partnerContact = useMemo(
    () => findBestContactMatch(partnerName, syncedContacts, callers, settings, deviceOwner),
    [partnerName, syncedContacts, callers, settings, deviceOwner]
  );

  if (!open) return null;

  const todayKey = getTodayKey();
  const remainingGoals = goals.filter((g) => g.dateKey === todayKey && !g.completed);
  const remainingShopping = shoppingItems.filter((s) => !s.checked);

  const quickSmsOptions = [
    {
      label: `به ${partnerName}: تو راهم، زود می‌رسم`,
      body: 'سلام عزیز، الان تو راهم و زود می‌رسم.',
    },
    {
      label: `به ${partnerName}: پشت فرمونم، بعداً زنگ می‌زنم`,
      body: 'سلام، الان در حال رانندگی هستم؛ به محض رسیدن تماس می‌گیرم.',
    },
    {
      label: `به ${partnerName}: خریدی لازمه؟`,
      body: 'سلام عزیزم، تو راهم؛ چیزی برای خونه لازم داری بخرم؟',
    },
    {
      label: `به ${partnerName}: به سلامت رسیدم`,
      body: 'سلام، به سلامت رسیدم و همه‌چیز مرتبه.',
    },
  ];

  const handleReadBriefing = () => {
    const hour = new Date().getHours();
    const mode = hour >= 17 ? 'evening' : 'morning';
    const text = buildDailyBriefingText({
      mode,
      selfName,
      partnerName,
      goals,
      shoppingItems,
      bills,
      meds,
      meals,
      todayExpenseTotal,
      monthExpenseTotal,
      monthlyBudget,
    });
    onSpeakText(text, 'خلاصه صوتی در جاده', 'custom');
  };

  const handleReadShopping = () => {
    if (remainingShopping.length === 0) {
      onSpeakText('هیچ کالای خریداری‌نشده‌ای در لیست خرید باقی نمانده است.', 'لیست خرید', 'custom');
      return;
    }
    const text = `در لیست خرید ${toPersianDigits(remainingShopping.length)} مورد باقی مانده: ${remainingShopping
      .slice(0, 10)
      .map((s) => `${s.title}${s.note ? ` ${s.note}` : ''}`)
      .join('، ')}.`;
    onSpeakText(text, 'خواندن لیست خرید', 'custom');
  };

  const handleReadGoals = () => {
    if (remainingGoals.length === 0) {
      onSpeakText('آفرین! کار باقی‌مانده‌ای برای امروز ثبت نیست.', 'برنامه امروز', 'custom');
      return;
    }
    const text = `برنامه‌های باقی‌مانده امروز: ${remainingGoals
      .slice(0, 8)
      .map((g, i) => `${toPersianDigits(i + 1)}، ${g.title}`)
      .join('؛ ')}.`;
    onSpeakText(text, 'اهداف امروز', 'custom');
  };

  const handleReadDailyEnglish = () => {
    const phrases = getTodayEnglishPhrases(5);
    const spoken = `مرور پنج عبارت انگلیسی امروز: ${phrases
      .map((p, idx) => `شماره ${toPersianDigits(idx + 1)}: ${p.english}. به فارسی یعنی: ${p.persian}`)
      .join('؛ ')}.`;
    onSpeakText(spoken, 'مرور ۵ عبارت انگلیسی امروز', 'custom');
  };

  const handleQuickSms = async (idx: number, body: string) => {
    if (partnerContact?.phone && isNativeAndroid()) {
      setSendingSmsIdx(idx);
      const res = await executeDeviceActionNative({
        action: 'send_sms',
        phone: partnerContact.phone,
        smsBody: body,
        confirmed: true,
      });
      setSendingSmsIdx(null);
      if (res.ok) {
        setSentIdx(idx);
        onStatusToast(`پیامک آماده برای ${partnerContact.name} ارسال شد.`);
        window.setTimeout(() => setSentIdx(null), 2000);
        return;
      }
      onStatusToast(res.message || 'ارسال پیامک انجام نشد.');
      return;
    }

    if (partnerContact?.phone) {
      window.location.href = `sms:${partnerContact.phone}?body=${encodeURIComponent(body)}`;
      onStatusToast(`برنامه پیامک برای ${partnerContact.name} باز شد.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(body);
      setSentIdx(idx);
      onStatusToast(`شماره «${partnerName}» در مخاطبین همگام‌سازی نشده؛ متن پیام در حافظه کپی شد.`);
      window.setTimeout(() => setSentIdx(null), 2000);
    } catch {
      onStatusToast(`ابتدا شماره ${partnerName} را در بخش تماس و پیامک همگام‌سازی کنید.`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#070E0D]/96 text-white flex flex-col overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="حالت ایمن رانندگی"
    >
      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-8 flex-1 flex flex-col justify-between gap-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-emerald-900/70 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-amber-200 flex items-center justify-center shrink-0">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">حالت رانندگی رفیقو</h2>
              <p className="text-xs sm:text-sm text-emerald-200/80 mt-0.5">
                دکمه‌های بزرگ و بدون حواس‌پرتی · گوشی {selfName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="خروج از حالت رانندگی"
            className="min-h-[52px] px-4 rounded-2xl border border-emerald-800 bg-[#10201D] hover:bg-emerald-950 text-white text-sm font-bold flex items-center gap-2 cursor-pointer"
          >
            <X className="w-5 h-5" />
            <span>خروج</span>
          </button>
        </div>

        {/* Big Hands-Free Audio Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAssistant();
            }}
            className="min-h-[104px] p-5 rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 border border-amber-300/30 text-right flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform"
          >
            <div className="w-14 h-14 rounded-2xl bg-black/25 flex items-center justify-center shrink-0">
              <Mic className="w-7 h-7 text-amber-200" />
            </div>
            <div>
              <div className="text-lg font-extrabold">دستور صوتی به {assistantName}</div>
              <div className="text-xs text-emerald-100/85 mt-1">باز کردن دستیار و اجرای فرمان با صدا</div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleReadBriefing}
            className="min-h-[104px] p-5 rounded-3xl bg-[#11221F] hover:bg-[#162C28] border border-emerald-800/80 text-right flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-900/60 flex items-center justify-center shrink-0">
              <Sparkles className="w-7 h-7 text-amber-300" />
            </div>
            <div>
              <div className="text-lg font-extrabold">گزارش ۳۰ ثانیه‌ای روز</div>
              <div className="text-xs text-slate-300 mt-1">شنیدن برنامه‌ها، اقساط، غذا و وضعیت خرید</div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleReadShopping}
            className="min-h-[92px] p-5 rounded-3xl bg-[#11221F] hover:bg-[#162C28] border border-emerald-800/80 text-right flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-900/60 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <div className="text-base font-extrabold">
                خواندن لیست خرید ({toPersianDigits(remainingShopping.length)} مورد)
              </div>
              <div className="text-xs text-slate-300 mt-1">مرور اقلام خریدنی روی راه خانه</div>
            </div>
          </button>

          <button
            type="button"
            onClick={isSpeaking ? onStopSpeech : handleReadGoals}
            className={`min-h-[92px] p-5 rounded-3xl border text-right flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform ${
              isSpeaking
                ? 'bg-rose-700 hover:bg-rose-800 border-rose-500'
                : 'bg-[#11221F] hover:bg-[#162C28] border-emerald-800/80'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-black/25 flex items-center justify-center shrink-0">
              {isSpeaking ? <Square className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-amber-300" />}
            </div>
            <div>
              <div className="text-base font-extrabold">
                {isSpeaking ? 'توقف فوری صدا' : `خواندن کارهای امروز (${toPersianDigits(remainingGoals.length)})`}
              </div>
              <div className="text-xs text-slate-200/85 mt-1">
                {isSpeaking ? 'قطع صحبت در حال پخش' : 'اعلام اهداف و یادآورهای باقی‌مانده'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleReadDailyEnglish}
            className="sm:col-span-2 min-h-[82px] p-4 sm:p-5 rounded-3xl bg-[#11221F] hover:bg-[#162C28] border border-amber-400/35 text-right flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <GraduationCap className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="text-base font-extrabold">مرور ۵ عبارت انگلیسی امروز</div>
              <div className="text-xs text-slate-300 mt-1">پخش دوزبانه با تلفظ و ترجمه فارسی در مسیر رانندگی</div>
            </div>
          </button>
        </div>

        {/* One-Tap Safe Partner SMS */}
        <section className="rounded-3xl bg-[#0D1A18] border border-emerald-900/70 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-extrabold text-amber-200">
              <MessageSquare className="w-4 h-4" />
              <span>پیامک آماده تک‌لمسی به {partnerName}</span>
            </div>
            <span className="text-xs text-emerald-200/75" dir="ltr">
              {partnerContact?.phone ? partnerContact.phone : 'برای ارسال مستقیم، مخاطب را همگام کنید'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickSmsOptions.map((opt, idx) => (
              <button
                key={opt.label}
                type="button"
                disabled={sendingSmsIdx === idx}
                onClick={() => handleQuickSms(idx, opt.body)}
                className="min-h-[64px] px-4 py-3 rounded-2xl bg-[#132521] hover:bg-[#19302B] border border-emerald-800/70 text-right flex items-center justify-between gap-2 cursor-pointer active:scale-[0.98]"
              >
                <span className="text-sm font-bold text-white leading-6">{opt.label}</span>
                {sentIdx === idx && <Check className="w-5 h-5 text-emerald-300 shrink-0" />}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
