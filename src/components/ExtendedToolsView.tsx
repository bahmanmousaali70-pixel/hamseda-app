import React, {useMemo, useState} from 'react';
import {
  Briefcase,
  CalendarHeart,
  Check,
  CheckCircle2,
  Handshake,
  MessageSquareHeart,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  Volume2,
  Wrench,
} from 'lucide-react';
import {
  addDaysKey,
  DEFAULT_CHORE_SUGGESTIONS,
  formatJalaliShort,
  getDaysUntilJalaliEvent,
  getTodayKey,
  JALALI_MONTHS,
  PACKING_TEMPLATES,
  toPersianDigits,
} from '../data/persianLibrary';
import type {
  DeviceOwner,
  ExpenseCategory,
  ExpenseEntry,
  HomeChoreItem,
  OwnerRole,
  PackingItem,
  PackingTemplateId,
  SpecialEventItem,
  SpecialEventKind,
} from '../types/app';

function formatToman(value: number): string {
  if (!Number.isFinite(value)) return '۰';
  return toPersianDigits(Math.round(value).toLocaleString('en-US'));
}

/* ============================================================================
 * 1. Couple Cost Split & Settlement Panel
 * ============================================================================ */

interface CoupleSettlementPanelProps {
  expenses: ExpenseEntry[];
  myName: string;
  partnerName: string;
  deviceOwner: DeviceOwner;
  onAddSettlementExpense: (entry: {
    title: string;
    amount: number;
    category: ExpenseCategory;
    payer: OwnerRole;
    splitMode: 'settlement';
  }) => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
}

export const CoupleSettlementPanel: React.FC<CoupleSettlementPanelProps> = ({
  expenses,
  myName,
  partnerName,
  deviceOwner,
  onAddSettlementExpense,
  onSpeakText,
  onStatusToast,
}) => {
  const [rangeMode, setRangeMode] = useState<'month' | 'all'>('month');
  const todayKey = getTodayKey();
  const monthPrefix = todayKey.slice(0, 7);

  const scopedExpenses = useMemo(() => {
    if (rangeMode === 'all') return expenses;
    return expenses.filter((e) => e.dateKey.startsWith(monthPrefix));
  }, [expenses, rangeMode, monthPrefix]);

  const calculation = useMemo(() => {
    // Track net position of "man" vs "zari":
    // Positive netMan => zari owes man; Negative netMan => man owes zari.
    let manPaidShared = 0;
    let zariPaidShared = 0;
    let bothPoolPaid = 0;
    let personalMan = 0;
    let personalZari = 0;
    let netMan = 0;

    for (const e of scopedExpenses) {
      const mode = e.splitMode ?? (e.payer === 'both' ? 'personal' : 'shared');
      const amt = Math.max(0, Number(e.amount || 0));
      if (amt <= 0) continue;

      if (e.payer === 'both') {
        bothPoolPaid += amt;
        continue;
      }

      if (mode === 'personal') {
        if (e.payer === 'man') personalMan += amt;
        else personalZari += amt;
        continue;
      }

      if (mode === 'shared') {
        if (e.payer === 'man') {
          manPaidShared += amt;
          netMan += amt / 2;
        } else {
          zariPaidShared += amt;
          netMan -= amt / 2;
        }
      } else if (mode === 'for_partner' || mode === 'settlement') {
        if (e.payer === 'man') {
          manPaidShared += amt;
          netMan += amt;
        } else {
          zariPaidShared += amt;
          netMan -= amt;
        }
      }
    }

    const absDiff = Math.round(Math.abs(netMan));
    const debtorRole: 'man' | 'zari' | null = absDiff < 100 ? null : netMan > 0 ? 'zari' : 'man';
    const creditorRole: 'man' | 'zari' | null = absDiff < 100 ? null : netMan > 0 ? 'man' : 'zari';
    const debtorName = debtorRole === 'man' ? myName : debtorRole === 'zari' ? partnerName : '';
    const creditorName = creditorRole === 'man' ? myName : creditorRole === 'zari' ? partnerName : '';

    return {
      manPaidShared,
      zariPaidShared,
      bothPoolPaid,
      personalMan,
      personalZari,
      absDiff,
      debtorRole,
      creditorRole,
      debtorName,
      creditorName,
    };
  }, [scopedExpenses, myName, partnerName]);

  const selfName = deviceOwner === 'zari' ? partnerName : myName;
  const otherName = deviceOwner === 'zari' ? myName : partnerName;

  const summarySentence = calculation.debtorName
    ? `${calculation.debtorName} به ${calculation.creditorName} بابت مخارج مشترک ${formatToman(calculation.absDiff)} تومان بدهکار است.`
    : 'حساب‌های مشترک شما کاملاً تراز و تسویه است!';

  const handleSettleNow = () => {
    if (!calculation.debtorRole || !calculation.creditorName || calculation.absDiff <= 0) return;
    onAddSettlementExpense({
      title: `تسویه حساب دو نفره (${calculation.debtorName} ← ${calculation.creditorName})`,
      amount: calculation.absDiff,
      category: 'other',
      payer: calculation.debtorRole,
      splitMode: 'settlement',
    });
    onStatusToast?.('تسویه حساب بین شما ثبت و تراز صفر شد.');
  };

  const handleSpeak = () => {
    const text = `${summarySentence} پرداختی ثبت‌شده ${myName} برابر با ${formatToman(
      calculation.manPaidShared
    )} تومان و پرداختی ثبت‌شده ${partnerName} برابر با ${formatToman(calculation.zariPaidShared)} تومان بوده است.`;
    onSpeakText(text, 'وضعیت تسویه حساب دونفره', 'custom');
  };

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Handshake className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>محاسبه هوشمند دُنگ ۵۰/۵۰ برای {selfName} و {otherName}</span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            تسویه حساب دو نفره (بدهکار / بستانکار)
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            در دفترچه هزینه مشخص کنید کدام خرید «مشترک ۵۰/۵۰»، «برای همراه» یا «شخصی» بوده تا هم‌صدا خودکار سهم هر نفر را حساب کند.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 luxury-surface-subtle rounded-xl">
            <button
              type="button"
              onClick={() => setRangeMode('month')}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                rangeMode === 'month' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              این ماه
            </button>
            <button
              type="button"
              onClick={() => setRangeMode('all')}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                rangeMode === 'all' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              کل تاریخچه
            </button>
          </div>
          <button
            type="button"
            onClick={handleSpeak}
            className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Volume2 className="w-4 h-4" />
            <span>خواندن تراز</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl luxury-surface-subtle p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-emerald-200/70 dark:border-emerald-900/60">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-emerald-800 dark:text-amber-300">نتیجه تراز فعلی</div>
          <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-7">
            {summarySentence}
          </div>
        </div>
        {calculation.debtorRole && (
          <button
            type="button"
            onClick={handleSettleNow}
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <CheckCircle2 className="w-4 h-4 text-amber-300" />
            <span>ثبت تسویه حساب همین الان</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl luxury-surface-subtle p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">پرداخت‌شده برای حساب مشترک توسط {myName}</div>
          <div className="mt-1.5 text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {formatToman(calculation.manPaidShared)} <span className="text-xs font-normal text-slate-500">تومان</span>
          </div>
          {calculation.personalMan > 0 && (
            <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
              هزینه شخصی: {formatToman(calculation.personalMan)} تومان
            </div>
          )}
        </div>

        <div className="rounded-2xl luxury-surface-subtle p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">پرداخت‌شده برای حساب مشترک توسط {partnerName}</div>
          <div className="mt-1.5 text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {formatToman(calculation.zariPaidShared)} <span className="text-xs font-normal text-slate-500">تومان</span>
          </div>
          {calculation.personalZari > 0 && (
            <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
              هزینه شخصی: {formatToman(calculation.personalZari)} تومان
            </div>
          )}
        </div>

        <div className="rounded-2xl luxury-surface-subtle p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">پرداخت از صندوق مشترک هردو</div>
          <div className="mt-1.5 text-xl font-extrabold text-emerald-800 dark:text-amber-300 tabular-nums">
            {formatToman(calculation.bothPoolPaid)} <span className="text-xs font-normal text-slate-500">تومان</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            بدون بدهی متقابل
          </div>
        </div>
      </div>
    </section>
  );
};

/* ============================================================================
 * 2. Travel & Moving Packing Checklist Panel
 * ============================================================================ */

interface PackingChecklistPanelProps {
  items: PackingItem[];
  myName: string;
  partnerName: string;
  deviceOwner: DeviceOwner;
  onAddItem: (title: string, template: PackingTemplateId, owner: OwnerRole) => void;
  onAddTemplatePreset: (template: PackingTemplateId) => void;
  onToggleItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onSendUncheckedToShopping: (titles: string[]) => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
}

export const PackingChecklistPanel: React.FC<PackingChecklistPanelProps> = ({
  items,
  myName,
  partnerName,
  deviceOwner,
  onAddItem,
  onAddTemplatePreset,
  onToggleItem,
  onDeleteItem,
  onSendUncheckedToShopping,
  onSpeakText,
  onStatusToast,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<PackingTemplateId>('road');
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState<OwnerRole>('both');

  const selfName = deviceOwner === 'zari' ? partnerName : myName;
  const otherName = deviceOwner === 'zari' ? myName : partnerName;

  const visibleItems = useMemo(
    () =>
      items
        .filter((it) => it.template === selectedTemplate)
        .sort((a, b) => Number(a.checked) - Number(b.checked) || b.createdAt - a.createdAt),
    [items, selectedTemplate]
  );
  const uncheckedVisible = useMemo(() => visibleItems.filter((it) => !it.checked), [visibleItems]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = title.trim();
    if (!cleaned) return;
    onAddItem(cleaned, selectedTemplate, owner);
    setTitle('');
  };

  const handleSpeakUnchecked = () => {
    if (uncheckedVisible.length === 0) {
      onStatusToast?.('تمام وسایل این چک‌لیست بسته شده‌اند.');
      return;
    }
    const text = `در چک‌لیست ${PACKING_TEMPLATES[selectedTemplate].label} هنوز ${toPersianDigits(
      uncheckedVisible.length
    )} مورد آماده نشده است: ${uncheckedVisible
      .slice(0, 12)
      .map((i) => i.title)
      .join('، ')}.`;
    onSpeakText(text, 'چک‌لیست وسایل سفر', 'custom');
  };

  const ownerText = (role: OwnerRole) => (role === 'man' ? myName : role === 'zari' ? partnerName : 'هر دو');

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Briefcase className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>آمادگی سفر و جابجایی · باقی‌مانده: {toPersianDigits(uncheckedVisible.length)} مورد</span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            چک‌لیست چمدان، سفر و اسباب‌کشی
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            قالب سفر را انتخاب کنید، با یک لمس لیست آماده بچینید و اقلام کم‌وکسر را مستقیم به لیست خرید بفرستید.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSpeakUnchecked}
            disabled={uncheckedVisible.length === 0}
            className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-45 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Volume2 className="w-4 h-4" />
            <span>خواندن موارد مانده</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (uncheckedVisible.length === 0) return;
              onSendUncheckedToShopping(uncheckedVisible.map((u) => u.title));
            }}
            disabled={uncheckedVisible.length === 0}
            className="min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1412] text-slate-700 dark:text-slate-200 disabled:opacity-45 text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>ارسال تیک‌نخورده‌ها به خرید</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 luxury-surface-subtle rounded-xl">
          {(Object.keys(PACKING_TEMPLATES) as PackingTemplateId[]).map((tpl) => {
            const count = items.filter((i) => i.template === tpl && !i.checked).length;
            return (
              <button
                key={tpl}
                type="button"
                onClick={() => setSelectedTemplate(tpl)}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  selectedTemplate === tpl ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {PACKING_TEMPLATES[tpl].label}
                {count > 0 ? ` (${toPersianDigits(count)})` : ''}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onAddTemplatePreset(selectedTemplate)}
          className="min-h-[40px] px-3.5 rounded-xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>افزودن لیست پیشنهادی این سفر</span>
        </button>
      </div>

      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-4 border-b border-[#E6E2D8] dark:border-emerald-950/60">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="نام وسیله یا مدرک مورد نیاز برای بستن..."
          className="sm:col-span-7 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value as OwnerRole)}
          aria-label="مسئول بستن"
          className="sm:col-span-3 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          <option value="both">مشترک</option>
          <option value={deviceOwner}>{selfName}</option>
          <option value={deviceOwner === 'zari' ? 'man' : 'zari'}>{otherName}</option>
        </select>
        <button
          type="submit"
          className="sm:col-span-2 min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن</span>
        </button>
      </form>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DFDBD0] dark:border-emerald-900/70 py-10 px-4 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            هنوز موردی در چک‌لیست «{PACKING_TEMPLATES[selectedTemplate].label}» نیست.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            می‌توانید بالا دکمه «افزودن لیست پیشنهادی این سفر» را بزنید تا فوری پر شود.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#E6E2D8] dark:divide-emerald-950/60">
          {visibleItems.map((item) => (
            <div key={item.id} className="py-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onToggleItem(item.id)}
                className="flex-1 min-h-[44px] flex items-center gap-3 text-right cursor-pointer group"
              >
                <span
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                    item.checked
                      ? 'bg-emerald-800 border-emerald-800 text-white'
                      : 'border-slate-300 dark:border-emerald-800 group-hover:border-emerald-600'
                  }`}
                >
                  {item.checked && <Check className="w-4 h-4" />}
                </span>
                <div className="min-w-0">
                  <div
                    className={`text-sm font-semibold ${
                      item.checked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    مسئول: {ownerText(item.owner)}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDeleteItem(item.id)}
                aria-label={`حذف ${item.title}`}
                className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

/* ============================================================================
 * 3. Jalali Special Events, Birthdays & Anniversaries Panel
 * ============================================================================ */

interface SpecialEventsPanelProps {
  events: SpecialEventItem[];
  myName: string;
  partnerName: string;
  deviceOwner: DeviceOwner;
  onAddEvent: (ev: Omit<SpecialEventItem, 'id' | 'createdAt'>) => void;
  onDeleteEvent: (id: string) => void;
  onCreateWishMessage: (ev: SpecialEventItem) => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
}

const EVENT_KIND_LABELS: Record<SpecialEventKind, string> = {
  birthday: 'تولد',
  anniversary: 'سالگرد',
  occasion: 'مناسبت مهم',
};

export const SpecialEventsPanel: React.FC<SpecialEventsPanelProps> = ({
  events,
  myName,
  partnerName,
  deviceOwner,
  onAddEvent,
  onDeleteEvent,
  onCreateWishMessage,
  onSpeakText,
  onStatusToast,
}) => {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<SpecialEventKind>('birthday');
  const [jalaliMonth, setJalaliMonth] = useState<number>(1);
  const [jalaliDay, setJalaliDay] = useState<number>(1);
  const [owner, setOwner] = useState<OwnerRole>('both');
  const [note, setNote] = useState('');

  const selfName = deviceOwner === 'zari' ? partnerName : myName;
  const otherName = deviceOwner === 'zari' ? myName : partnerName;

  const sortedEvents = useMemo(() => {
    return events
      .map((ev) => ({ev, daysLeft: getDaysUntilJalaliEvent(ev.jalaliMonth, ev.jalaliDay)}))
      .sort((a, b) => a.daysLeft - b.daysLeft || b.ev.createdAt - a.ev.createdAt);
  }, [events]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      onStatusToast?.('عنوان مناسبت یا نام شخص را وارد کنید.');
      return;
    }
    const maxDay = jalaliMonth === 12 ? 29 : jalaliMonth >= 7 ? 30 : 31;
    const clampedDay = Math.max(1, Math.min(maxDay, jalaliDay));
    onAddEvent({
      title: title.trim(),
      kind,
      jalaliMonth,
      jalaliDay: clampedDay,
      owner,
      note: note.trim() || undefined,
    });
    setTitle('');
    setNote('');
  };

  const handleSpeakUpcoming = () => {
    if (sortedEvents.length === 0) {
      onStatusToast?.('هنوز مناسبتی ثبت نشده است.');
      return;
    }
    const top = sortedEvents.slice(0, 3).map(({ev, daysLeft}) => {
      const mName = JALALI_MONTHS.find((m) => m.month === ev.jalaliMonth)?.name ?? '';
      return daysLeft === 0
        ? `امروز ${ev.title} است`
        : `${toPersianDigits(daysLeft)} روز تا ${ev.title} در ${toPersianDigits(ev.jalaliDay)} ${mName}`;
    });
    onSpeakText(`تقویم مناسبت‌های پیش‌رو: ${top.join('؛ ')}.`, 'مناسبت‌ها و تولدهای پیش‌رو', 'custom');
  };

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <CalendarHeart className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>روزشمار دقیق شمسی و هشدار ۳ روز زودتر</span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            تقویم تولدها، سالگردها و مناسبت‌ها
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            تاریخ شمسی مناسبت‌های مهم را ثبت کنید تا هیچ تبریکی جا نماند و با یک لمس متن تبریکش ساخته شود.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSpeakUpcoming}
          disabled={sortedEvents.length === 0}
          className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-45 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Volume2 className="w-4 h-4" />
          <span>خواندن مناسبت‌ها</span>
        </button>
      </div>

      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-5 border-b border-[#E6E2D8] dark:border-emerald-950/60">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان (مثلاً تولد مادر، سالگرد ازدواج، روز معلم)..."
          className="sm:col-span-4 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SpecialEventKind)}
          aria-label="نوع مناسبت"
          className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          <option value="birthday">تولد</option>
          <option value="anniversary">سالگرد</option>
          <option value="occasion">مناسبت</option>
        </select>
        <select
          value={jalaliMonth}
          onChange={(e) => setJalaliMonth(Number(e.target.value))}
          aria-label="ماه شمسی"
          className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          {JALALI_MONTHS.map((m) => (
            <option key={m.month} value={m.month}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={jalaliDay}
          onChange={(e) => setJalaliDay(Number(e.target.value))}
          aria-label="روز شمسی"
          className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200 tabular-nums"
        >
          {Array.from({length: 31}, (_, idx) => idx + 1).map((d) => (
            <option key={d} value={d}>
              روز {toPersianDigits(d)}
            </option>
          ))}
        </select>
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value as OwnerRole)}
          aria-label="مربوط به"
          className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          <option value="both">مشترک</option>
          <option value={deviceOwner}>{selfName}</option>
          <option value={deviceOwner === 'zari' ? 'man' : 'zari'}>{otherName}</option>
        </select>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ایده هدیه یا یادداشت کوتاه (اختیاری)"
          className="sm:col-span-9 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-xs sm:text-sm text-slate-900 dark:text-white"
        />
        <button
          type="submit"
          className="sm:col-span-3 min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت مناسبت</span>
        </button>
      </form>

      {sortedEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DFDBD0] dark:border-emerald-900/70 py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
          هنوز تولد یا سالگردی ثبت نشده است؛ اولین تاریخ عزیزتان را اضافه کنید.
        </div>
      ) : (
        <div className="divide-y divide-[#E6E2D8] dark:divide-emerald-950/60">
          {sortedEvents.map(({ev, daysLeft}) => {
            const monthName = JALALI_MONTHS.find((m) => m.month === ev.jalaliMonth)?.name ?? '';
            const isNear = daysLeft <= 3;
            return (
              <div
                key={ev.id}
                className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isNear ? 'bg-amber-50/50 dark:bg-amber-950/20 px-3 rounded-xl my-1' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{ev.title}</span>
                    <span className={`text-xs font-bold tabular-nums ${isNear ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'}`}>
                      {daysLeft === 0 ? 'امروز!' : `${toPersianDigits(daysLeft)} روز مانده`}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                    <span>{EVENT_KIND_LABELS[ev.kind]}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {toPersianDigits(ev.jalaliDay)} {monthName}
                    </span>
                    {ev.note && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{ev.note}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onCreateWishMessage(ev)}
                    className="min-h-[40px] px-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <MessageSquareHeart className="w-3.5 h-3.5" />
                    <span>ساخت پیام تبریک</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteEvent(ev.id)}
                    aria-label={`حذف ${ev.title}`}
                    className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
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
 * 4. Recurring Home Maintenance Chores Panel
 * ============================================================================ */

interface HomeMaintenancePanelProps {
  chores: HomeChoreItem[];
  myName: string;
  partnerName: string;
  deviceOwner: DeviceOwner;
  onAddChore: (chore: {title: string; area: string; intervalDays: number; owner: OwnerRole}) => void;
  onMarkDoneToday: (id: string) => void;
  onDeleteChore: (id: string) => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
}

export const HomeMaintenancePanel: React.FC<HomeMaintenancePanelProps> = ({
  chores,
  myName,
  partnerName,
  deviceOwner,
  onAddChore,
  onMarkDoneToday,
  onDeleteChore,
  onSpeakText,
  onStatusToast,
}) => {
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('آشپزخانه');
  const [intervalDays, setIntervalDays] = useState<number>(30);
  const [owner, setOwner] = useState<OwnerRole>('both');

  const todayKey = getTodayKey();
  const todayMs = new Date(`${todayKey}T12:00:00`).getTime();
  const selfName = deviceOwner === 'zari' ? partnerName : myName;
  const otherName = deviceOwner === 'zari' ? myName : partnerName;

  const sortedChores = useMemo(() => {
    return chores
      .map((ch) => {
        const dueMs = new Date(`${ch.nextDueDateKey}T12:00:00`).getTime();
        const daysLeft = Number.isNaN(dueMs) ? 0 : Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
        return {ch, daysLeft};
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [chores, todayMs]);

  const dueCount = sortedChores.filter((x) => x.daysLeft <= 0).length;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      onStatusToast?.('عنوان کار دوره‌ای را وارد کنید.');
      return;
    }
    onAddChore({
      title: title.trim(),
      area: area.trim() || 'خانه',
      intervalDays,
      owner,
    });
    setTitle('');
  };

  const handleSpeakDue = () => {
    const due = sortedChores.filter((x) => x.daysLeft <= 2);
    if (due.length === 0) {
      onSpeakText('فعلاً همه کارهای دوره‌ای نگهداری خانه به‌روز هستند و موعدی سر نرسیده است.', 'وضعیت نگهداری خانه', 'custom');
      return;
    }
    const text = `در لیست نگهداری خانه ${toPersianDigits(due.length)} کار در نوبت انجام است: ${due
      .slice(0, 5)
      .map((x) => x.ch.title)
      .join('، ')}.`;
    onSpeakText(text, 'کارهای دوره‌ای نگهداری خانه', 'custom');
  };

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Wrench className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>سررسیدهای دوره‌ای خانه و خودرو · موعدرسیده: {toPersianDigits(dueCount)} مورد</span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            نگهداری دوره‌ای و سرویس‌های خانه
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            برای کارهایی مثل فیلتر آب، شستشوی روتختی، سرویس کولر یا چکاپ خودرو دوره بگذارید؛ با زدن «امروز انجام شد» تاریخ بعدی خودکار محاسبه می‌شود.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSpeakDue}
          className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Volume2 className="w-4 h-4" />
          <span>خواندن وضعیت</span>
        </button>
      </div>

      {/* Quick Suggestions */}
      <div className="flex flex-wrap items-center gap-2">
        {DEFAULT_CHORE_SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onAddChore({...s, owner: 'both'})}
            className="min-h-[36px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1412] text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-600 cursor-pointer"
          >
            + {s.title} ({toPersianDigits(s.intervalDays)} روزه)
          </button>
        ))}
      </div>

      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-5 border-b border-[#E6E2D8] dark:border-emerald-950/60">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان کار دوره‌ای (مثلاً تعویض فیلتر هود)..."
          className="sm:col-span-4 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
        />
        <input
          type="text"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="بخش (مثلاً آشپزخانه)"
          className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-xs sm:text-sm text-slate-900 dark:text-white"
        />
        <select
          value={intervalDays}
          onChange={(e) => setIntervalDays(Number(e.target.value))}
          aria-label="تکرار هر چند روز"
          className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          <option value={7}>هر ۷ روز (هفتگی)</option>
          <option value={14}>هر ۱۴ روز (دوهفتگی)</option>
          <option value={30}>هر ۳۰ روز (ماهانه)</option>
          <option value={60}>هر ۶۰ روز</option>
          <option value={90}>هر ۹۰ روز (فصلی)</option>
          <option value={180}>هر ۶ ماه</option>
          <option value={365}>سالانه</option>
        </select>
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value as OwnerRole)}
          aria-label="مسئول انجام"
          className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          <option value="both">مشترک</option>
          <option value={deviceOwner}>{selfName}</option>
          <option value={deviceOwner === 'zari' ? 'man' : 'zari'}>{otherName}</option>
        </select>
        <button
          type="submit"
          className="sm:col-span-2 min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن</span>
        </button>
      </form>

      {sortedChores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DFDBD0] dark:border-emerald-900/70 py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
          هنوز سرویس یا نظافت دوره‌ای ثبت نشده است؛ از پیشنهادهای آماده بالا هم می‌توانید با یک لمس اضافه کنید.
        </div>
      ) : (
        <div className="divide-y divide-[#E6E2D8] dark:divide-emerald-950/60">
          {sortedChores.map(({ch, daysLeft}) => {
            const isOverdue = daysLeft < 0;
            const isToday = daysLeft === 0;
            const nextFormatted = formatJalaliShort(ch.nextDueDateKey);
            const expectedNextAfterDone = formatJalaliShort(addDaysKey(todayKey, ch.intervalDays));
            return (
              <div key={ch.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{ch.title}</span>
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        isOverdue
                          ? 'text-rose-600 dark:text-rose-400'
                          : isToday
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {isOverdue
                        ? `${toPersianDigits(Math.abs(daysLeft))} روز گذشته از موعد`
                        : isToday
                          ? 'موعدش امروز است'
                          : `${toPersianDigits(daysLeft)} روز مانده`}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                    <span>{ch.area}</span>
                    <span aria-hidden="true">·</span>
                    <span>هر {toPersianDigits(ch.intervalDays)} روز</span>
                    <span aria-hidden="true">·</span>
                    <span>موعد فعلی: {nextFormatted}</span>
                    <span aria-hidden="true">·</span>
                    <span>نوبت بعدی با تیک امروز: {expectedNextAfterDone}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onMarkDoneToday(ch.id)}
                    className="min-h-[40px] px-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>امروز انجام شد</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteChore(ch.id)}
                    aria-label={`حذف ${ch.title}`}
                    className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
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
