import React, {useMemo, useState} from 'react';
import {
  BellRing,
  Check,
  Copy,
  ListChecks,
  Plus,
  Search,
  ShoppingBag,
  Smartphone,
  Trash2,
  Volume2,
  Wallet,
} from 'lucide-react';
import {getTodayKey, toPersianDigits} from '../data/persianLibrary';
import type {
  DeviceOwner,
  ExpenseCategory,
  ExpenseEntry,
  ExpenseSplitMode,
  OwnerRole,
  PartnerAlertMode,
  ShoppingCategory,
  ShoppingItem,
} from '../types/app';

export type {ShoppingCategory, ShoppingItem, ExpenseCategory, ExpenseEntry};

const SHOPPING_CATEGORIES: {id: ShoppingCategory; label: string}[] = [
  {id: 'grocery', label: 'سوپرمارکت و میوه'},
  {id: 'home', label: 'خانه و قبوض'},
  {id: 'health', label: 'دارو و سلامت'},
  {id: 'note', label: 'یادداشت فوری'},
];

const EXPENSE_CATEGORIES: {id: ExpenseCategory; label: string}[] = [
  {id: 'food', label: 'خوراک و خرید'},
  {id: 'bills', label: 'خانه و قبوض'},
  {id: 'transport', label: 'رفت‌وآمد و خودرو'},
  {id: 'health', label: 'سلامت و درمان'},
  {id: 'family', label: 'خانواده و هدیه'},
  {id: 'other', label: 'متفرقه'},
];

function formatToman(value: number): string {
  if (!Number.isFinite(value)) return '۰';
  return toPersianDigits(Math.round(value).toLocaleString('en-US'));
}

function getMonthPrefix(dateKey: string): string {
  return dateKey.slice(0, 7);
}

interface ShoppingChecklistPanelProps {
  items: ShoppingItem[];
  onAddItem: (title: string, category: ShoppingCategory, note?: string) => void;
  onToggleItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onClearChecked: () => void;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
  isSpacePaired?: boolean;
  partnerName?: string;
  autoAlertOnAdd?: boolean;
  onToggleAutoAlertOnAdd?: (enabled: boolean) => void;
  onSendPartnerAlert?: (mode: PartnerAlertMode) => void;
  onTestLocalAlert?: (mode: PartnerAlertMode) => void;
  notifPermission?: NotificationPermission;
  onRequestNotificationPermission?: () => void;
}

export const ShoppingChecklistPanel: React.FC<ShoppingChecklistPanelProps> = ({
  items,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onClearChecked,
  onSpeakText,
  onStatusToast,
  isSpacePaired = false,
  partnerName = 'همراه',
  autoAlertOnAdd = false,
  onToggleAutoAlertOnAdd,
  onSendPartnerAlert,
  onTestLocalAlert,
  notifPermission,
  onRequestNotificationPermission,
}) => {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<ShoppingCategory>('grocery');
  const [filterCat, setFilterCat] = useState<'all' | ShoppingCategory>('all');
  const [copied, setCopied] = useState(false);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = title.trim();
    if (!cleaned) return;
    onAddItem(cleaned, category, note.trim() || undefined);
    setTitle('');
    setNote('');
  };

  const toggleItem = (id: string) => {
    onToggleItem(id);
  };

  const deleteItem = (id: string) => {
    onDeleteItem(id);
  };

  const clearChecked = () => {
    onClearChecked();
    onStatusToast?.('موارد خریداری‌شده از لیست پاک شدند.');
  };

  const visibleItems = useMemo(() => {
    const filtered = filterCat === 'all' ? items : items.filter((it) => it.category === filterCat);
    return [...filtered].sort((a, b) => Number(a.checked) - Number(b.checked) || b.createdAt - a.createdAt);
  }, [items, filterCat]);

  const remainingItems = useMemo(() => items.filter((it) => !it.checked), [items]);
  const completedCount = items.length - remainingItems.length;

  const handleCopyList = async () => {
    const target = remainingItems.length > 0 ? remainingItems : items;
    if (target.length === 0) return;
    const lines = target.map((it, idx) => `${toPersianDigits(idx + 1)}. ${it.title}${it.note ? ` (${it.note})` : ''}`);
    const payload = `لیست خرید و کارهای فوری:\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      onStatusToast?.('لیست خرید در حافظه کپی شد.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onStatusToast?.('کپی خودکار انجام نشد.');
    }
  };

  const handleSpeakList = () => {
    if (remainingItems.length === 0) {
      onStatusToast?.('مورد خریداری‌نشده‌ای در لیست نیست.');
      return;
    }
    const text = `لیست خرید و کارهای باقی‌مانده شامل ${toPersianDigits(remainingItems.length)} مورد است: ${remainingItems
      .slice(0, 12)
      .map((it) => `${it.title}${it.note ? `، ${it.note}` : ''}`)
      .join('؛ ')}.`;
    onSpeakText(text, 'لیست خرید و کارهای فوری', 'custom');
  };

  const categoryLabel = (id: ShoppingCategory) =>
    SHOPPING_CATEGORIES.find((c) => c.id === id)?.label ?? 'یادداشت';

  return (
    <section className="luxury-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShoppingBag className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
            <span>چک‌لیست روزمره خانه · باقی‌مانده: {toPersianDigits(remainingItems.length)} مورد</span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            لیست خرید و یادداشت‌های فوری
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            اقلام خرید سوپرمارکت، دارو، قبوض و کارهای فوری خانه را سریع بنویسید، کپی کنید یا با صدای رفیقو بشنوید.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSpeakList}
            disabled={remainingItems.length === 0}
            className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-45 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Volume2 className="w-4 h-4" />
            <span>خواندن لیست</span>
          </button>
          <button
            type="button"
            onClick={handleCopyList}
            disabled={items.length === 0}
            className="min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1412] text-slate-700 dark:text-slate-200 disabled:opacity-45 text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
            <span>کپی لیست</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-5 border-b border-[#E6E2D8] dark:border-emerald-950/60">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="نام کالا یا یادداشت فوری (مثلاً نان، شیر، پرداخت قبض برق)..."
          className="sm:col-span-5 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مقدار / توضیح کوتاه (مثلاً ۲ عدد)"
          className="sm:col-span-3 min-h-[44px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ShoppingCategory)}
          aria-label="دسته‌بندی لیست خرید"
          className="sm:col-span-2 min-h-[44px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          {SHOPPING_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="sm:col-span-2 min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 dark:hover:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن</span>
        </button>
      </form>

      {onSendPartnerAlert && (
        <div className="rounded-2xl luxury-surface-subtle p-4 sm:p-5 space-y-4 border border-[#DFDBD0] dark:border-emerald-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BellRing className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />
                <span>هشدار فوری به گوشی {partnerName} (آلارم صوتی و ویبره)</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-6">
                {isSpacePaired
                  ? `دو گوشی به هم متصل هستند. با زدن دکمه‌های زیر، گوشی ${partnerName} ویبره متوالی می‌رود و لیست خرید با صدای فارسی اعلام می‌شود (در APK اندروید اگر صدا زیر ۵۰٪ باشد خودکار تا ۵۰٪ بالا می‌آید).`
                  : 'برای ارسال به گوشی دوم، ابتدا در تب «همگام‌سازی و ابزارها» دو گوشی را با یک کد مچ کنید.'}
              </p>
            </div>
            {notifPermission === 'default' && onRequestNotificationPermission && (
              <button
                type="button"
                onClick={onRequestNotificationPermission}
                className="min-h-[40px] px-3.5 rounded-xl border border-amber-400/70 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
              >
                فعال‌سازی مجوز اعلان
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => onSendPartnerAlert('alarm')}
              disabled={!isSpacePaired}
              className="min-h-[46px] px-4 rounded-xl bg-white dark:bg-[#0B1412] border border-[#DFDBD0] dark:border-emerald-800 text-slate-900 dark:text-slate-100 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 disabled:opacity-45 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>آلارم صوتی</span>
            </button>

            <button
              type="button"
              onClick={() => onSendPartnerAlert('vibrate')}
              disabled={!isSpacePaired}
              className="min-h-[46px] px-4 rounded-xl bg-white dark:bg-[#0B1412] border border-[#DFDBD0] dark:border-emerald-800 text-slate-900 dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-emerald-950/50 disabled:opacity-45 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />
              <span>فقط ویبره</span>
            </button>

            <button
              type="button"
              onClick={() => onSendPartnerAlert('both')}
              disabled={!isSpacePaired}
              className="min-h-[46px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-45 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <BellRing className="w-4 h-4 text-amber-300 shrink-0" />
              <span>آلارم و ویبره باهم</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#DFDBD0]/80 dark:border-emerald-950/60">
            {onToggleAutoAlertOnAdd && (
              <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none min-h-[36px]">
                <input
                  type="checkbox"
                  checked={autoAlertOnAdd}
                  onChange={(e) => onToggleAutoAlertOnAdd(e.target.checked)}
                  className="w-4 h-4 accent-emerald-700 rounded cursor-pointer"
                />
                <span>ارسال خودکار آلارم و ویبره هنگام افزودن کالای جدید</span>
              </label>
            )}
            {onTestLocalAlert && (
              <button
                type="button"
                onClick={() => onTestLocalAlert('both')}
                className="min-h-[38px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white/80 dark:bg-[#0B1412] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs font-semibold cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                تست آلارم و ویبره روی همین گوشی
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 luxury-surface-subtle rounded-xl">
          <button
            type="button"
            onClick={() => setFilterCat('all')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              filterCat === 'all'
                ? 'bg-emerald-800 text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            همه ({toPersianDigits(items.length)})
          </button>
          {SHOPPING_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilterCat(c.id)}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                filterCat === c.id
                  ? 'bg-emerald-800 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {completedCount > 0 && (
          <button
            type="button"
            onClick={clearChecked}
            className="min-h-[38px] px-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>پاک کردن تیک‌خورده‌ها ({toPersianDigits(completedCount)})</span>
          </button>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DFDBD0] dark:border-emerald-900/70 py-12 px-4 text-center space-y-2">
          <ListChecks className="w-8 h-8 text-emerald-700/60 dark:text-emerald-400/60 mx-auto" />
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            هنوز موردی در این دسته‌بندی ثبت نشده است
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            هر چیزی که لازم است بخرید یا انجام دهید را بالا اضافه کنید تا همیشه دم دستتان باشد.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#E6E2D8] dark:divide-emerald-950/60">
          {visibleItems.map((item) => (
            <div key={item.id} className="py-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
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
                      item.checked
                        ? 'line-through text-slate-400 dark:text-slate-500'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                    <span>{categoryLabel(item.category)}</span>
                    {item.note && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-800 dark:text-amber-300 font-medium">{item.note}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => deleteItem(item.id)}
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

interface ExpenseTrackerPanelProps {
  expenses: ExpenseEntry[];
  monthlyBudget: number;
  onUpdateBudget: (amount: number) => void;
  onAddExpense: (entry: Omit<ExpenseEntry, 'id' | 'createdAt' | 'dateKey'>) => void;
  onDeleteExpense: (id: string) => void;
  myName: string;
  partnerName: string;
  deviceOwner: DeviceOwner;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStatusToast?: (msg: string) => void;
}

export const ExpenseTrackerPanel: React.FC<ExpenseTrackerPanelProps> = ({
  expenses,
  monthlyBudget,
  onUpdateBudget,
  onAddExpense,
  onDeleteExpense,
  myName,
  partnerName,
  deviceOwner,
  onSpeakText,
  onStatusToast,
}) => {
  const selfName = deviceOwner === 'zari' ? partnerName : myName;
  const otherName = deviceOwner === 'zari' ? myName : partnerName;
  const todayKey = getTodayKey();
  const currentMonthPrefix = getMonthPrefix(todayKey);

  const [budgetDraft, setBudgetDraft] = useState(() => (monthlyBudget > 0 ? String(monthlyBudget) : ''));
  const [title, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [payer, setPayer] = useState<OwnerRole>('both');
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('shared');
  const [filterCat, setFilterCat] = useState<'all' | ExpenseCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = Number(budgetDraft.replace(/[^0-9]/g, ''));
    const nextBudget = Number.isFinite(cleaned) && cleaned > 0 ? cleaned : 0;
    onUpdateBudget(nextBudget);
    onStatusToast?.(
      nextBudget > 0
        ? `سقف بودجه ماهانه روی ${formatToman(nextBudget)} تومان تنظیم شد.`
        : 'سقف بودجه ماهانه حذف شد.'
    );
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amountInput.replace(/[^0-9]/g, ''));
    if (!title.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      onStatusToast?.('عنوان هزینه و مبلغ معتبر به تومان وارد کنید.');
      return;
    }
    const cleanedTitle = title.trim();
    onAddExpense({
      title: cleanedTitle,
      amount: numericAmount,
      category,
      payer,
      splitMode: payer === 'both' ? 'personal' : splitMode,
    });
    setTitle('');
    setAmountInput('');
    onStatusToast?.(`هزینه «${cleanedTitle}» ثبت شد.`);
  };

  const deleteExpense = (id: string) => {
    onDeleteExpense(id);
  };

  const todayTotal = useMemo(
    () => expenses.filter((e) => e.dateKey === todayKey).reduce((sum, e) => sum + e.amount, 0),
    [expenses, todayKey]
  );
  const monthExpenses = useMemo(
    () => expenses.filter((e) => getMonthPrefix(e.dateKey) === currentMonthPrefix),
    [expenses, currentMonthPrefix]
  );
  const monthTotal = useMemo(
    () => monthExpenses.reduce((sum, e) => sum + e.amount, 0),
    [monthExpenses]
  );

  const budgetPct = monthlyBudget > 0 ? Math.min(100, Math.round((monthTotal / monthlyBudget) * 100)) : 0;

  const categoryTotals = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const entry of monthExpenses) {
      map.set(entry.category, (map.get(entry.category) ?? 0) + entry.amount);
    }
    return EXPENSE_CATEGORIES.map((c) => ({
      ...c,
      total: map.get(c.id) ?? 0,
    }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [monthExpenses]);

  const visibleExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filterCat !== 'all' && e.category !== filterCat) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, filterCat, searchQuery]);

  const payerLabel = (p: OwnerRole) => {
    if (p === 'man') return myName;
    if (p === 'zari') return partnerName;
    return 'مشترک';
  };

  const splitModeLabel = (entry: ExpenseEntry) => {
    if (entry.splitMode === 'settlement') return 'تسویه';
    if (entry.payer === 'both') return 'صندوق مشترک';
    if (entry.splitMode === 'for_partner') return 'برای همراه';
    if (entry.splitMode === 'personal') return 'شخصی';
    return 'مشترک ۵۰/۵۰';
  };

  const categoryLabel = (c: ExpenseCategory) =>
    EXPENSE_CATEGORIES.find((x) => x.id === c)?.label ?? 'متفرقه';

  const handleCopySummary = async () => {
    const lines = [
      `گزارش مخارج روزانه رفیقو`,
      `جمع هزینه امروز: ${formatToman(todayTotal)} تومان`,
      `جمع هزینه این ماه: ${formatToman(monthTotal)} تومان`,
      ...(monthlyBudget > 0 ? [`سقف بودجه ماهانه: ${formatToman(monthlyBudget)} تومان (${toPersianDigits(budgetPct)}٪ مصرف)`] : []),
      ...categoryTotals.map((c) => `- ${c.label}: ${formatToman(c.total)} تومان`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      onStatusToast?.('خلاصه گزارش مالی کپی شد.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onStatusToast?.('کپی خودکار انجام نشد.');
    }
  };

  const handleSpeakSummary = () => {
    const topCategory = categoryTotals[0];
    const spoken = `خلاصه مخارج شما: هزینه امروز ${formatToman(todayTotal)} تومان و مجموع هزینه‌های این ماه ${formatToman(
      monthTotal
    )} تومان است.${
      monthlyBudget > 0
        ? ` تا الان ${toPersianDigits(budgetPct)} درصد از بودجه ماهانه استفاده شده.`
        : ''
    }${topCategory ? ` بیشترین هزینه این ماه مربوط به بخش ${topCategory.label} بوده است.` : ''}`;
    onSpeakText(spoken, 'گزارش مخارج روزانه', 'custom');
  };

  return (
    <div className="space-y-6">
      {/* Monthly KPI Strip */}
      <section className="luxury-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Wallet className="w-4 h-4 text-emerald-800 dark:text-amber-300" />
              <span>مدیریت مخارج روزمره و ماهانه به تومان</span>
            </div>
            <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
              دفترچه دخل و خرج روزانه
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSpeakSummary}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Volume2 className="w-4 h-4" />
              <span>شنیدن گزارش مالی</span>
            </button>
            <button
              type="button"
              onClick={handleCopySummary}
              className="min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1412] text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
              <span>کپی خلاصه</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl luxury-surface-subtle p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">هزینه امروز</div>
            <div className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {formatToman(todayTotal)} <span className="text-xs font-medium text-slate-500">تومان</span>
            </div>
          </div>

          <div className="rounded-2xl luxury-surface-subtle p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">جمع مخارج این ماه</div>
            <div className="mt-1.5 text-2xl font-extrabold text-emerald-800 dark:text-amber-300 tabular-nums">
              {formatToman(monthTotal)} <span className="text-xs font-medium text-slate-500">تومان</span>
            </div>
          </div>

          <form onSubmit={handleSaveBudget} className="rounded-2xl luxury-surface-subtle p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>سقف بودجه ماهانه (تومان)</span>
              {monthlyBudget > 0 && (
                <span className="font-bold text-emerald-800 dark:text-amber-300 tabular-nums">
                  {toPersianDigits(budgetPct)}٪ مصرف
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                placeholder="مثلاً 30000000"
                dir="ltr"
                className="min-w-0 flex-1 min-h-[38px] px-3 rounded-lg border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-mono-num text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="min-h-[38px] px-3 rounded-lg bg-slate-900 dark:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                ثبت
              </button>
            </div>
            {monthlyBudget > 0 && (
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-emerald-950 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    budgetPct >= 90 ? 'bg-rose-600' : 'bg-emerald-700 dark:bg-amber-400'
                  }`}
                  style={{width: `${budgetPct}%`}}
                />
              </div>
            )}
          </form>
        </div>

        {/* Add Expense Form */}
        <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-[#E6E2D8] dark:border-emerald-950/60">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="شرح هزینه (مثلاً خرید میوه، بنزین، قبض اینترنت)..."
            className="sm:col-span-3 min-h-[44px] px-4 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
          />
          <input
            type="text"
            inputMode="numeric"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="مبلغ به تومان"
            dir="ltr"
            className="sm:col-span-2 min-h-[44px] px-3.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-sm font-mono-num text-slate-900 dark:text-white"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            aria-label="دسته هزینه"
            className="sm:col-span-2 min-h-[44px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={payer}
            onChange={(e) => setPayer(e.target.value as OwnerRole)}
            aria-label="پرداخت‌کننده"
            className="sm:col-span-2 min-h-[44px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="both">مشترک</option>
            <option value={deviceOwner}>{selfName}</option>
            <option value={deviceOwner === 'zari' ? 'man' : 'zari'}>{otherName}</option>
          </select>
          <select
            value={payer === 'both' ? 'shared' : splitMode}
            onChange={(e) => setSplitMode(e.target.value as ExpenseSplitMode)}
            disabled={payer === 'both'}
            aria-label="نوع محاسبه دونفره"
            className="sm:col-span-2 min-h-[44px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-800 dark:text-slate-200 disabled:opacity-50"
          >
            <option value="shared">مشترک ۵۰/۵۰</option>
            <option value="personal">شخصی</option>
            <option value="for_partner">برای همراه</option>
          </select>
          <button
            type="submit"
            className="sm:col-span-1 min-h-[44px] px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>ثبت</span>
          </button>
        </form>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Category Breakdown */}
        <section className="lg:col-span-5 luxury-card p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">تفکیک مخارج این ماه</h3>
          {categoryTotals.length === 0 ? (
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              هنوز هزینه‌ای برای این ماه ثبت نشده است.
            </p>
          ) : (
            <div className="space-y-3.5">
              {categoryTotals.map((cat) => {
                const share = monthTotal > 0 ? Math.round((cat.total / monthTotal) * 100) : 0;
                return (
                  <div key={cat.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{cat.label}</span>
                      <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                        {formatToman(cat.total)} تومان · {toPersianDigits(share)}٪
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#F0EEE8] dark:bg-emerald-950 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-l from-emerald-800 to-amber-500 dark:from-emerald-500 dark:to-amber-400"
                        style={{width: `${share}%`}}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Expense Log */}
        <section className="lg:col-span-7 luxury-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">فهرست هزینه‌های ثبت‌شده</h3>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجو در مخارج..."
                  className="w-full min-h-[38px] pr-8 pl-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-[#FAF9F6] dark:bg-[#0B1312] text-xs text-slate-900 dark:text-white"
                />
              </div>
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value as 'all' | ExpenseCategory)}
                aria-label="فیلتر دسته هزینه"
                className="min-h-[38px] px-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="all">همه دسته‌ها</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {visibleExpenses.length === 0 ? (
            <div className="py-10 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              موردی برای نمایش پیدا نشد.
            </div>
          ) : (
            <div className="divide-y divide-[#E6E2D8] dark:divide-emerald-950/60 max-h-[420px] overflow-y-auto">
              {visibleExpenses.map((entry) => (
                <div key={entry.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {entry.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span>{categoryLabel(entry.category)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{payerLabel(entry.payer)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 dark:text-amber-300 font-medium">{splitModeLabel(entry)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num">{toPersianDigits(entry.dateKey)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-sm font-bold text-emerald-800 dark:text-amber-300 tabular-nums">
                      {formatToman(entry.amount)} <span className="text-[11px] font-normal text-slate-500">تومان</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteExpense(entry.id)}
                      aria-label={`حذف هزینه ${entry.title}`}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
