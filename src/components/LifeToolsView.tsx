import React, {useMemo, useState} from 'react';
import {
  CalendarClock,
  Check,
  ChefHat,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Pill,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  Volume2,
} from 'lucide-react';
import {
  formatJalaliShort,
  getPersianWeekdayId,
  getTodayKey,
  toPersianDigits,
} from '../data/persianLibrary';
import type {
  BillCycle,
  BillKind,
  BillReminderItem,
  DeviceOwner,
  ExpenseCategory,
  MealPlanEntry,
  MedicationItem,
  MedicationKind,
  OwnerRole,
  QuickVaultNote,
  ShoppingCategory,
  VaultCategory,
  WeekdayId,
} from '../types/app';

function formatToman(value: number): string {
  if (!Number.isFinite(value)) return '۰';
  return toPersianDigits(Math.round(value).toLocaleString('en-US'));
}

function daysBetweenDateKeys(fromKey: string, toKey: string): number | null {
  const fromMs = new Date(`${fromKey}T12:00:00`).getTime();
  const toMs = new Date(`${toKey}T12:00:00`).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

function advanceDateKey(dateKey: string, cycle: BillCycle): string {
  const dt = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return dateKey;
  if (cycle === 'monthly') dt.setMonth(dt.getMonth() + 1);
  else if (cycle === 'yearly') dt.setFullYear(dt.getFullYear() + 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ============================================================================
 * 1. Bills, Installments & Periodic Car / Home Services Panel
 * ========================================================================== */

const BILL_KINDS: {id: BillKind; label: string}[] = [
  {id: 'installment', label: 'قسط / وام'},
  {id: 'bill', label: 'قبض / شارژ'},
  {id: 'vehicle', label: 'سرویس خودرو و بیمه'},
  {id: 'subscription', label: 'اشتراک و قرارداد'},
];

const BILL_CYCLES: {id: BillCycle; label: string}[] = [
  {id: 'monthly', label: 'ماهانه'},
  {id: 'yearly', label: 'سالانه'},
  {id: 'once', label: 'یک‌بار'},
];

interface BillsAndServicesPanelProps {
  bills: BillReminderItem[];
  onAddBill: (bill: Omit<BillReminderItem, 'id' | 'createdAt' | 'paid'>) => void;
  onTogglePaid: (id: string, logAsExpense: boolean) => void;
  onDeleteBill: (id: string) => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
}

export const BillsAndServicesPanel: React.FC<BillsAndServicesPanelProps> = ({
  bills,
  onAddBill,
  onTogglePaid,
  onDeleteBill,
  onSpeakText,
  onStatusToast,
}) => {
  const todayKey = getTodayKey();
  const [title, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [kind, setKind] = useState<BillKind>('installment');
  const [cycle, setCycle] = useState<BillCycle>('monthly');
  const [dueDateKey, setDueDateKey] = useState(todayKey);
  const [note, setNote] = useState('');
  const [autoLogExpense, setAutoLogExpense] = useState(true);
  const [filterKind, setFilterKind] = useState<'all' | BillKind>('all');

  const unpaidBills = useMemo(() => bills.filter((b) => !b.paid), [bills]);
  const unpaidTotal = useMemo(
    () => unpaidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0),
    [unpaidBills]
  );
  const urgentCount = useMemo(
    () =>
      unpaidBills.filter((b) => {
        const diff = daysBetweenDateKeys(todayKey, b.dueDateKey);
        return diff !== null && diff <= 5;
      }).length,
    [todayKey, unpaidBills]
  );

  const visibleBills = useMemo(() => {
    const filtered = filterKind === 'all' ? bills : bills.filter((b) => b.kind === filterKind);
    return [...filtered].sort(
      (a, b) => Number(a.paid) - Number(b.paid) || a.dueDateKey.localeCompare(b.dueDateKey)
    );
  }, [bills, filterKind]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = title.trim();
    if (!cleaned) return;
    const numericAmount = Number(amountInput.replace(/[^0-9]/g, '')) || 0;
    onAddBill({
      title: cleaned,
      amount: Math.max(0, numericAmount),
      kind,
      cycle,
      dueDateKey: dueDateKey || todayKey,
      note: note.trim() || undefined,
    });
    setTitle('');
    setAmountInput('');
    setNote('');
    onStatusToast?.(`«${cleaned}» به یادآور اقساط و قبوض اضافه شد.`);
  };

  const handleSpeakBills = () => {
    if (unpaidBills.length === 0) {
      onSpeakText('آفرین! قسط یا قبض پرداخت‌نشده‌ای باقی نمانده است.', 'وضعیت اقساط و قبوض', 'custom');
      return;
    }
    const listText = unpaidBills
      .slice(0, 6)
      .map(
        (b) =>
          `${b.title}${b.amount > 0 ? ` به مبلغ ${formatToman(b.amount)} تومان` : ''}، سررسید ${formatJalaliShort(
            b.dueDateKey
          )}`
      )
      .join('؛ ');
    onSpeakText(
      `مجموع ${toPersianDigits(unpaidBills.length)} مورد قسط و قبض در انتظار به ارزش ${formatToman(
        unpaidTotal
      )} تومان دارید: ${listText}.`,
      'گزارش اقساط و قبوض',
      'custom'
    );
  };

  const kindLabel = (k: BillKind) => BILL_KINDS.find((x) => x.id === k)?.label ?? 'مورد';
  const cycleLabel = (c: BillCycle) => BILL_CYCLES.find((x) => x.id === c)?.label ?? 'ماهانه';

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <CalendarClock className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>سررسیدهای مالی و سرویس‌های دوره‌ای</span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            مدیریت اقساط، قبوض و سرویس خودرو
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            زمان پرداخت قسط، شارژ ساختمان، تعویض روغن یا تمدید بیمه را پیگیری کنید و با یک لمس در هزینه‌ها ثبت نمایید.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSpeakBills}
          className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Volume2 className="w-4 h-4" />
          <span>شنیدن سررسیدها</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl luxury-surface-subtle p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">مجموع در انتظار پرداخت</div>
          <div className="mt-1.5 text-2xl font-extrabold text-emerald-800 dark:text-amber-300 tabular-nums">
            {formatToman(unpaidTotal)} <span className="text-xs font-medium text-slate-500">تومان</span>
          </div>
        </div>
        <div className="rounded-2xl luxury-surface-subtle p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">تعداد اقساط / قبوض باز</div>
          <div className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {toPersianDigits(unpaidBills.length)} <span className="text-xs font-medium text-slate-500">مورد</span>
          </div>
        </div>
        <div className="rounded-2xl luxury-surface-subtle p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">نزدیک سررسید (۵ روز آینده)</div>
          <div className={`mt-1.5 text-2xl font-extrabold tabular-nums ${urgentCount > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>
            {toPersianDigits(urgentCount)} <span className="text-xs font-medium text-slate-500">مورد</span>
          </div>
        </div>
      </div>

      {/* Add Form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-5 border-b border-[#E6E2D8] dark:border-emerald-950/60">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان (مثلاً قسط وام، قبض برق، تعویض روغن خودرو)..."
          className="sm:col-span-4 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <input
          type="text"
          inputMode="numeric"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          placeholder="مبلغ (تومان)"
          dir="ltr"
          className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm font-mono-num text-slate-900 dark:text-white"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as BillKind)}
          aria-label="نوع یادآور"
          className="sm:col-span-2 min-h-[44px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          {BILL_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDateKey}
          onChange={(e) => setDueDateKey(e.target.value)}
          aria-label="تاریخ سررسید"
          dir="ltr"
          className="sm:col-span-2 min-h-[44px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-mono-num text-slate-900 dark:text-white"
        />
        <select
          value={cycle}
          onChange={(e) => setCycle(e.target.value as BillCycle)}
          aria-label="دوره تکرار"
          className="sm:col-span-2 min-h-[44px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          {BILL_CYCLES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="شماره شناسه یا توضیح کوتاه (اختیاری)"
          className="sm:col-span-9 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white"
        />
        <button
          type="submit"
          className="sm:col-span-3 min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 dark:hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت یادآور</span>
        </button>
      </form>

      {/* Filter & Auto-log Option */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 luxury-surface-subtle rounded-xl">
          <button
            type="button"
            onClick={() => setFilterKind('all')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
              filterKind === 'all' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            همه ({toPersianDigits(bills.length)})
          </button>
          {BILL_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setFilterKind(k.id)}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                filterKind === k.id ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={autoLogExpense}
            onChange={(e) => setAutoLogExpense(e.target.checked)}
            className="accent-emerald-700 w-4 h-4"
          />
          <span>با تیک زدن «پرداخت شد»، مبلغ خودکار در دخل و خرج ثبت شود</span>
        </label>
      </div>

      {/* Bills List */}
      {visibleBills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DFDBD0] dark:border-emerald-900/70 py-10 px-4 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          موردی ثبت نشده است. اقساط ماهانه، قبوض یا موعد سرویس دوره‌ای خودرو را بالا ثبت کنید.
        </div>
      ) : (
        <div className="divide-y divide-[#E6E2D8] dark:divide-emerald-950/60">
          {visibleBills.map((b) => {
            const diffDays = daysBetweenDateKeys(todayKey, b.dueDateKey);
            const isOverdue = !b.paid && diffDays !== null && diffDays < 0;
            const isSoon = !b.paid && diffDays !== null && diffDays >= 0 && diffDays <= 5;
            return (
              <div key={b.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onTogglePaid(b.id, autoLogExpense)}
                  className="flex-1 min-h-[44px] flex items-center gap-3 text-right cursor-pointer group"
                >
                  <span
                    className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                      b.paid
                        ? 'bg-emerald-800 border-emerald-800 text-white'
                        : 'border-slate-300 dark:border-emerald-800 group-hover:border-emerald-600'
                    }`}
                  >
                    {b.paid && <Check className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-bold ${
                        b.paid ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {b.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span>{kindLabel(b.kind)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{cycleLabel(b.cycle)}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          isOverdue
                            ? 'text-rose-600 dark:text-rose-400 font-bold'
                            : isSoon
                              ? 'text-amber-700 dark:text-amber-300 font-bold'
                              : ''
                        }
                      >
                        سررسید: {formatJalaliShort(b.dueDateKey)}
                        {isOverdue && diffDays !== null ? ` (${toPersianDigits(Math.abs(diffDays))} روز گذشته)` : ''}
                        {isSoon && diffDays !== null
                          ? diffDays === 0
                            ? ' (امروز)'
                            : ` (${toPersianDigits(diffDays)} روز دیگر)`
                          : ''}
                      </span>
                      {b.note && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{b.note}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                  {b.amount > 0 && (
                    <span className="text-sm font-extrabold text-emerald-800 dark:text-amber-300 tabular-nums">
                      {formatToman(b.amount)} <span className="text-[11px] font-normal text-slate-500">تومان</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteBill(b.id)}
                    aria-label={`حذف ${b.title}`}
                    className="min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export {advanceDateKey};

/* ============================================================================
 * 2. Medication, Vitamin & Doctor Appointment Tracker Panel
 * ========================================================================== */

interface MedicationTrackerPanelProps {
  meds: MedicationItem[];
  myName: string;
  partnerName: string;
  deviceOwner: DeviceOwner;
  onAddMed: (item: Omit<MedicationItem, 'id' | 'createdAt' | 'takenDates'>) => void;
  onToggleTakenToday: (id: string) => void;
  onToggleEnabled: (id: string) => void;
  onDeleteMed: (id: string) => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
}

export const MedicationTrackerPanel: React.FC<MedicationTrackerPanelProps> = ({
  meds,
  myName,
  partnerName,
  deviceOwner,
  onAddMed,
  onToggleTakenToday,
  onToggleEnabled,
  onDeleteMed,
  onSpeakText,
  onStatusToast,
}) => {
  const selfName = deviceOwner === 'zari' ? partnerName : myName;
  const otherName = deviceOwner === 'zari' ? myName : partnerName;
  const todayKey = getTodayKey();

  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [time, setTime] = useState('09:00');
  const [owner, setOwner] = useState<OwnerRole>(deviceOwner === 'zari' ? 'zari' : 'man');
  const [kind, setKind] = useState<MedicationKind>('med');
  const [voiceRemind, setVoiceRemind] = useState(true);

  const activeMeds = useMemo(() => meds.filter((m) => m.enabled), [meds]);
  const takenTodayCount = useMemo(
    () => activeMeds.filter((m) => m.takenDates.includes(todayKey)).length,
    [activeMeds, todayKey]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) return;
    onAddMed({
      name: cleaned,
      dosage: dosage.trim() || 'طبق دستور',
      time: /^\d{2}:\d{2}$/.test(time) ? time : '09:00',
      owner,
      kind,
      voiceRemind,
      enabled: true,
    });
    setName('');
    setDosage('');
    onStatusToast?.(`یادآور سلامت «${cleaned}» ثبت و با آلارم صوتی همگام شد.`);
  };

  const ownerWord = (o: OwnerRole) =>
    o === 'man' ? myName : o === 'zari' ? partnerName : `${myName} و ${partnerName}`;

  const handleSpeakMeds = () => {
    const pending = activeMeds.filter((m) => !m.takenDates.includes(todayKey));
    if (pending.length === 0) {
      onSpeakText('تمام داروها و برنامه‌های سلامت امروز انجام و تیک خورده‌اند.', 'وضعیت سلامت امروز', 'custom');
      return;
    }
    const text = `برنامه سلامت و داروی باقی‌مانده امروز: ${pending
      .map((m) => `${m.name} (${m.dosage}) برای ${ownerWord(m.owner)} ساعت ${toPersianDigits(m.time)}`)
      .join('؛ ')}.`;
    onSpeakText(text, 'یادآور دارو و سلامت', 'custom');
  };

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Pill className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>
              تکمیل‌شده امروز: {toPersianDigits(takenTodayCount)} از {toPersianDigits(activeMeds.length)}
            </span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            یادآور دارو، مکمل و نوبت پزشک
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            موارد دارای یادآور صوتی در ساعت مقرر به‌صورت خودکار روی گوشی اعلام می‌شوند.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSpeakMeds}
          className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Volume2 className="w-4 h-4" />
          <span>خواندن برنامه سلامت</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-5 border-b border-[#E6E2D8] dark:border-emerald-950/60">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام دارو، ویتامین یا نوبت پزشک..."
          className="sm:col-span-4 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <input
          type="text"
          value={dosage}
          onChange={(e) => setDosage(e.target.value)}
          placeholder="مقدار / توضیح (مثلاً ۱ قرص بعد شام)"
          className="sm:col-span-3 min-h-[44px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="ساعت یادآوری"
          className="sm:col-span-2 min-h-[44px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-mono-num text-slate-900 dark:text-white"
        />
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value as OwnerRole)}
          aria-label="برای چه کسی"
          className="sm:col-span-1 min-h-[44px] px-2 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-800 dark:text-slate-200"
        >
          <option value={deviceOwner}>{selfName}</option>
          <option value={deviceOwner === 'zari' ? 'man' : 'zari'}>{otherName}</option>
          <option value="both">مشترک</option>
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as MedicationKind)}
          aria-label="نوع مورد"
          className="sm:col-span-2 min-h-[44px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-800 dark:text-slate-200"
        >
          <option value="med">دارو / ویتامین</option>
          <option value="appointment">نوبت پزشک</option>
        </select>

        <label className="sm:col-span-9 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={voiceRemind}
            onChange={(e) => setVoiceRemind(e.target.checked)}
            className="accent-emerald-700 w-4 h-4"
          />
          <span>اعلام خودکار با صدای هم‌صدا در ساعت تنظیم‌شده</span>
        </label>

        <button
          type="submit"
          className="sm:col-span-3 min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 dark:hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت یادآور سلامت</span>
        </button>
      </form>

      {meds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DFDBD0] dark:border-emerald-900/70 py-10 px-4 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          هنوز دارو، مکمل یا نوبت پزشکی ثبت نشده است.
        </div>
      ) : (
        <div className="divide-y divide-[#E6E2D8] dark:divide-emerald-950/60">
          {meds.map((m) => {
            const taken = m.takenDates.includes(todayKey);
            return (
              <div key={m.id} className="py-3.5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onToggleTakenToday(m.id)}
                  className="flex-1 min-h-[44px] flex items-center gap-3 text-right cursor-pointer group"
                >
                  <span
                    className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                      taken
                        ? 'bg-emerald-800 border-emerald-800 text-white'
                        : 'border-slate-300 dark:border-emerald-800 group-hover:border-emerald-600'
                    }`}
                  >
                    {taken && <Check className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-bold ${
                        taken ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {m.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span>{m.kind === 'appointment' ? 'نوبت پزشک' : 'دارو و مکمل'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ownerWord(m.owner)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num text-emerald-800 dark:text-amber-300 font-semibold">
                        ساعت {toPersianDigits(m.time)}
                      </span>
                      {m.dosage && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{m.dosage}</span>
                        </>
                      )}
                      {m.voiceRemind && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>یادآور صوتی</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleEnabled(m.id)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                      m.enabled
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 dark:bg-[#0B1312] text-slate-500 border border-slate-200 dark:border-emerald-900'
                    }`}
                  >
                    {m.enabled ? 'فعال' : 'مکث'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteMed(m.id)}
                    aria-label={`حذف ${m.name}`}
                    className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

/* ============================================================================
 * 3. Weekly Meal Planner Connected to Shopping List & Recipe Lookup
 * ========================================================================== */

interface MealPlannerPanelProps {
  meals: MealPlanEntry[];
  onSaveMealDay: (entry: MealPlanEntry) => void;
  onAddShoppingItems: (titles: string[], category?: ShoppingCategory, note?: string) => void;
  onAskRecipe: (dishName: string) => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
}

export const MealPlannerPanel: React.FC<MealPlannerPanelProps> = ({
  meals,
  onSaveMealDay,
  onAddShoppingItems,
  onAskRecipe,
  onSpeakText,
  onStatusToast,
}) => {
  const todayWeekday = getPersianWeekdayId(new Date());
  const [selectedDay, setSelectedDay] = useState<WeekdayId>(todayWeekday);

  const currentEntry = meals.find((m) => m.id === selectedDay) ?? meals[0];
  const [lunchDraft, setLunchDraft] = useState(currentEntry?.lunch ?? '');
  const [dinnerDraft, setDinnerDraft] = useState(currentEntry?.dinner ?? '');
  const [ingredientsDraft, setIngredientsDraft] = useState(currentEntry?.ingredients ?? '');

  const handleSelectDay = (dayId: WeekdayId) => {
    setSelectedDay(dayId);
    const found = meals.find((m) => m.id === dayId);
    setLunchDraft(found?.lunch ?? '');
    setDinnerDraft(found?.dinner ?? '');
    setIngredientsDraft(found?.ingredients ?? '');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEntry) return;
    onSaveMealDay({
      id: currentEntry.id,
      dayLabel: currentEntry.dayLabel,
      lunch: lunchDraft.trim(),
      dinner: dinnerDraft.trim(),
      ingredients: ingredientsDraft.trim(),
    });
    onStatusToast?.(`برنامه غذای روز ${currentEntry.dayLabel} ذخیره و همگام شد.`);
  };

  const handleSendIngredientsToShopping = () => {
    const raw = ingredientsDraft.trim() || currentEntry?.ingredients.trim() || '';
    if (!raw) {
      onStatusToast?.('ابتدا مواد لازم این روز را بنویسید (با کاما یا خط جدید جدا کنید).');
      return;
    }
    const items = raw
      .split(/[،,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    onAddShoppingItems(items, 'grocery', `برنامه غذای ${currentEntry?.dayLabel ?? ''}`);
    onStatusToast?.(`${toPersianDigits(items.length)} ماده لازم به لیست خرید اضافه شد.`);
  };

  const handleSpeakWeek = () => {
    const filled = meals.filter((m) => m.lunch.trim() || m.dinner.trim());
    if (filled.length === 0) {
      onSpeakText('هنوز برنامه غذایی برای روزهای هفته ثبت نشده است.', 'برنامه غذای هفته', 'custom');
      return;
    }
    const summary = filled
      .map(
        (m) =>
          `${m.dayLabel}: ${m.lunch ? `ناهار ${m.lunch}` : ''}${m.lunch && m.dinner ? '، ' : ''}${
            m.dinner ? `شام ${m.dinner}` : ''
          }`
      )
      .join('؛ ');
    onSpeakText(`برنامه غذای هفته شما: ${summary}.`, 'برنامه غذای هفته', 'custom');
  };

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <UtensilsCrossed className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>هماهنگی غذای هفته با لیست خرید</span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            برنامه‌ریز غذای هفتگی و مواد لازم
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            ناهار و شام روزهای هفته را مشخص کنید و مواد لازمشان را مستقیم به لیست خرید بفرستید یا دستور پخت بگیرید.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSpeakWeek}
          className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Volume2 className="w-4 h-4" />
          <span>شنیدن برنامه هفته</span>
        </button>
      </div>

      {/* 7-Day Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {meals.map((m) => {
          const isSelected = m.id === selectedDay;
          const isToday = m.id === todayWeekday;
          const hasDish = Boolean(m.lunch.trim() || m.dinner.trim());
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSelectDay(m.id)}
              className={`min-h-[68px] p-2.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-emerald-800 border-emerald-800 text-white shadow-xs'
                  : 'bg-[#FAF9F6] dark:bg-[#0B1312] border-[#DFDBD0] dark:border-emerald-900 text-slate-800 dark:text-slate-200 hover:border-emerald-600'
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-xs font-bold">
                <span>{m.dayLabel}</span>
                {isToday && (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                      isSelected ? 'bg-amber-400/25 text-amber-200' : 'bg-emerald-800/12 text-emerald-800 dark:text-amber-300'
                    }`}
                  >
                    امروز
                  </span>
                )}
              </div>
              <div className={`text-[11px] truncate mt-1 ${isSelected ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                {hasDish ? m.lunch || m.dinner : 'تنظیم نشده'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Editor for Selected Day */}
      {currentEntry && (
        <form onSubmit={handleSave} className="rounded-2xl luxury-surface-subtle p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              منوی روز {currentEntry.dayLabel}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">با ذخیره، بین هر دو گوشی همگام می‌شود</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">ناهار</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={lunchDraft}
                  onChange={(e) => setLunchDraft(e.target.value)}
                  placeholder="مثلاً قورمه‌سبزی، زرشک‌پلو با مرغ..."
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                />
                {lunchDraft.trim() && (
                  <button
                    type="button"
                    onClick={() => onAskRecipe(lunchDraft.trim())}
                    title="دریافت دستور پخت با دستیار"
                    className="min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-emerald-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <ChefHat className="w-4 h-4" />
                    <span className="hidden sm:inline">دستور پخت</span>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">شام</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dinnerDraft}
                  onChange={(e) => setDinnerDraft(e.target.value)}
                  placeholder="مثلاً سوپ جو، کوکو سبزی، ساندویچ..."
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                />
                {dinnerDraft.trim() && (
                  <button
                    type="button"
                    onClick={() => onAskRecipe(dinnerDraft.trim())}
                    title="دریافت دستور پخت با دستیار"
                    className="min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-emerald-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <ChefHat className="w-4 h-4" />
                    <span className="hidden sm:inline">دستور پخت</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              مواد لازم برای خرید (با کاما «،» یا خط جدید جدا کنید)
            </label>
            <textarea
              rows={2}
              value={ingredientsDraft}
              onChange={(e) => setIngredientsDraft(e.target.value)}
              placeholder="مثلاً: سبزی قورمه، گوشت خورشتی، لوبیا قرمز، لیمو عمانی"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>ذخیره منوی {currentEntry.dayLabel}</span>
            </button>

            <button
              type="button"
              onClick={handleSendIngredientsToShopping}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-amber-200" />
              <span>افزودن مواد لازم به لیست خرید</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

/* ============================================================================
 * 4. Shared Quick Vault Cards & Reference Notes Panel
 * ========================================================================== */

const VAULT_CATEGORIES: {id: VaultCategory; label: string}[] = [
  {id: 'bank', label: 'کارت بانکی و شبا'},
  {id: 'home', label: 'منزل، وای‌فای و قبض'},
  {id: 'ids', label: 'کد پستی و شناسه‌ها'},
  {id: 'note', label: 'یادداشت‌های مشترک'},
];

interface QuickVaultPanelProps {
  notes: QuickVaultNote[];
  myName: string;
  partnerName: string;
  deviceOwner: DeviceOwner;
  onAddNote: (item: Omit<QuickVaultNote, 'id' | 'createdAt'>) => void;
  onDeleteNote: (id: string) => void;
  onStatusToast?: (msg: string) => void;
}

export const QuickVaultPanel: React.FC<QuickVaultPanelProps> = ({
  notes,
  myName,
  partnerName,
  deviceOwner,
  onAddNote,
  onDeleteNote,
  onStatusToast,
}) => {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState<VaultCategory>('bank');
  const [owner, setOwner] = useState<OwnerRole>('both');
  const [filterCat, setFilterCat] = useState<'all' | VaultCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visibleNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((n) => {
      if (filterCat !== 'all' && n.category !== filterCat) return false;
      if (q && !n.title.toLowerCase().includes(q) && !n.value.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [notes, filterCat, searchQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !value.trim()) {
      onStatusToast?.('عنوان و مقدار/شماره را وارد کنید.');
      return;
    }
    onAddNote({
      title: title.trim(),
      value: value.trim(),
      category,
      owner,
    });
    setTitle('');
    setValue('');
    onStatusToast?.('اطلاعات در کارت‌دان هم‌صدا ذخیره شد.');
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maskValue = (raw: string): string => {
    if (raw.length <= 6) return '••••••';
    return `${raw.slice(0, 4)} •••• ${raw.slice(-4)}`;
  };

  const handleCopy = async (n: QuickVaultNote) => {
    try {
      await navigator.clipboard.writeText(n.value);
      setCopiedId(n.id);
      onStatusToast?.(`«${n.title}» کپی شد.`);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      onStatusToast?.('کپی خودکار انجام نشد.');
    }
  };

  const catLabel = (c: VaultCategory) => VAULT_CATEGORIES.find((x) => x.id === c)?.label ?? 'یادداشت';
  const ownerWord = (o: OwnerRole) => (o === 'man' ? myName : o === 'zari' ? partnerName : 'مشترک');

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <KeyRound className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>کپی سریع و اشتراک بین هر دو گوشی</span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            کارت‌دان و یادداشت‌های ضروری خانه
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            شماره کارت، شبا، کد پستی، شناسه قبوض، پلاک و رمز وای‌فای را یک‌جا نگه دارید و با یک لمس کپی کنید (از ذخیره رمز عبور بانکی یا پین کارت خودداری کنید).
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-5 border-b border-[#E6E2D8] dark:border-emerald-950/60">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان (مثلاً کارت بانک ملت، کد پستی خانه، رمز وای‌فای)"
          className="sm:col-span-4 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="شماره کارت / شبا / کد یا متن"
          dir="ltr"
          className="sm:col-span-4 min-h-[44px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm font-mono-num text-slate-900 dark:text-white"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as VaultCategory)}
          aria-label="دسته یادداشت"
          className="sm:col-span-2 min-h-[44px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          {VAULT_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value as OwnerRole)}
          aria-label="متعلق به"
          className="sm:col-span-1 min-h-[44px] px-2 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          <option value="both">مشترک</option>
          <option value={deviceOwner}>{deviceOwner === 'zari' ? partnerName : myName}</option>
          <option value={deviceOwner === 'zari' ? 'man' : 'zari'}>
            {deviceOwner === 'zari' ? myName : partnerName}
          </option>
        </select>
        <button
          type="submit"
          className="sm:col-span-1 min-h-[44px] px-3 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center cursor-pointer"
          aria-label="ذخیره در کارت‌دان"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 luxury-surface-subtle rounded-xl">
          <button
            type="button"
            onClick={() => setFilterCat('all')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
              filterCat === 'all' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            همه ({toPersianDigits(notes.length)})
          </button>
          {VAULT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilterCat(c.id)}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                filterCat === c.id ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در کارت‌دان..."
            className="w-full min-h-[38px] pr-8 pl-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {visibleNotes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DFDBD0] dark:border-emerald-900/70 py-10 px-4 text-center space-y-1.5">
          <CreditCard className="w-8 h-8 text-emerald-700/60 dark:text-emerald-400/60 mx-auto" />
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            موردی در این بخش ثبت نشده است
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            شماره کارت، شبا، کد پستی یا رمز وای‌فای را بالا اضافه کنید تا همیشه با یک لمس کپی شوند.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {visibleNotes.map((n) => {
            const revealed = revealedIds.has(n.id) || n.category === 'ids';
            return (
              <div key={n.id} className="rounded-2xl luxury-surface-subtle p-4 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{n.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {catLabel(n.category)} · {ownerWord(n.owner)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(n.id)}
                    aria-label={`حذف ${n.title}`}
                    className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div
                  className="rounded-xl bg-white dark:bg-[#0B1312] border border-[#DFDBD0] dark:border-emerald-900/70 px-3 py-2.5 text-sm font-mono-num text-slate-800 dark:text-amber-200 break-all"
                  dir="ltr"
                >
                  {revealed ? n.value : maskValue(n.value)}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(n)}
                    className="flex-1 min-h-[40px] px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === n.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === n.id ? 'کپی شد' : 'کپی'}</span>
                  </button>

                  {n.category !== 'ids' && (
                    <button
                      type="button"
                      onClick={() => toggleReveal(n.id)}
                      className="min-h-[40px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{revealed ? 'مخفی' : 'نمایش'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
