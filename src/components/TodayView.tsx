import React, {useEffect, useMemo, useState} from 'react';
import {
  ArrowRightLeft,
  Bell,
  Brain,
  Briefcase,
  CalendarCheck,
  CalendarHeart,
  Car,
  Check,
  FileText,
  Flame,
  GraduationCap,
  Handshake,
  KeyRound,
  Pause,
  Pill,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  formatJalaliFull,
  getDayPart,
  getLastNDaysKeys,
  getTodayKey,
  toPersianDigits,
  VOICE_PERSONAS,
} from '../data/persianLibrary';
import {buildDailyBriefingText, fetchQuickWeatherBrief} from '../services/dailyBriefing';
import {playSoftChime} from '../services/speechEngine';
import type {
  BillReminderItem,
  DeviceOwner,
  ExpenseEntry,
  GoalCategory,
  GoalItem,
  GoalScope,
  HabitItem,
  HomeChoreItem,
  MealPlanEntry,
  MedicationItem,
  MorningMessage,
  OwnerRole,
  PackingItem,
  PackingTemplateId,
  PersonalityFocusId,
  QuickVaultNote,
  ShoppingCategory,
  ShoppingItem,
  SpecialEventItem,
  SpecialEventKind,
  TimeBlock,
  TodaySubSection,
  VoiceName,
} from '../types/app';
import {adaptTextForDevice} from '../utils/deviceIdentity';
import {
  CoupleSettlementPanel,
  HomeMaintenancePanel,
  PackingChecklistPanel,
  SpecialEventsPanel,
} from './ExtendedToolsView';
import {
  DailyEnglishPanel,
  PersonalityGrowthPanel,
  TextSummarizerPanel,
} from './GrowthCoachView';
import {
  BillsAndServicesPanel,
  MealPlannerPanel,
  MedicationTrackerPanel,
  QuickVaultPanel,
} from './LifeToolsView';
import {ExpenseTrackerPanel, ShoppingChecklistPanel} from './PracticalToolsView';

interface TodayViewProps {
  goals: GoalItem[];
  habits: HabitItem[];
  shoppingItems: ShoppingItem[];
  expenses: ExpenseEntry[];
  monthlyBudget: number;
  bills: BillReminderItem[];
  meds: MedicationItem[];
  meals: MealPlanEntry[];
  vaultNotes: QuickVaultNote[];
  packingItems: PackingItem[];
  specialEvents: SpecialEventItem[];
  homeChores: HomeChoreItem[];
  learnedEnglishIds: string[];
  personalityFocus: PersonalityFocusId;
  completedExercisesToday: string[];
  activeSubSection: TodaySubSection;
  onChangeSubSection: (section: TodaySubSection) => void;
  morningMessage: MorningMessage;
  isOnline: boolean;
  isSpeaking: boolean;
  speechSourceLabel: string;
  myName: string;
  partnerName: string;
  deviceOwner: DeviceOwner;
  defaultVoice: VoiceName;
  onChangeDefaultVoice: (voice: VoiceName) => void;
  onAddGoal: (goal: Omit<GoalItem, 'id' | 'createdAt' | 'completed' | 'dateKey'>) => void;
  onToggleGoal: (id: string) => void;
  onDeleteGoal: (id: string) => void;
  onCarryOverPastGoals: () => void;
  onToggleHabitDate: (habitId: string, dateKey: string) => void;
  onAddHabit: (title: string, owner: OwnerRole) => void;
  onDeleteHabit: (id: string) => void;
  onAddShoppingItem: (title: string, category?: ShoppingCategory, note?: string) => void;
  onAddShoppingItems: (titles: string[], category?: ShoppingCategory, note?: string) => void;
  onToggleShoppingItem: (id: string) => void;
  onDeleteShoppingItem: (id: string) => void;
  onClearCheckedShopping: () => void;
  onUpdateBudget: (amount: number) => void;
  onAddExpense: (entry: Omit<ExpenseEntry, 'id' | 'createdAt' | 'dateKey'>) => void;
  onDeleteExpense: (id: string) => void;
  onAddBill: (bill: Omit<BillReminderItem, 'id' | 'createdAt' | 'paid'>) => void;
  onToggleBillPaid: (id: string, logAsExpense: boolean) => void;
  onDeleteBill: (id: string) => void;
  onAddMed: (item: Omit<MedicationItem, 'id' | 'createdAt' | 'takenDates'>) => void;
  onToggleMedTakenToday: (id: string) => void;
  onToggleMedEnabled: (id: string) => void;
  onDeleteMed: (id: string) => void;
  onSaveMealDay: (entry: MealPlanEntry) => void;
  onAddVaultNote: (item: Omit<QuickVaultNote, 'id' | 'createdAt'>) => void;
  onDeleteVaultNote: (id: string) => void;
  onAddPackingItem: (title: string, template: PackingTemplateId, owner: OwnerRole) => void;
  onAddPackingPreset: (template: PackingTemplateId) => void;
  onTogglePackingItem: (id: string) => void;
  onDeletePackingItem: (id: string) => void;
  onSendPackingToShopping: (titles: string[]) => void;
  onAddSpecialEvent: (input: {
    title: string;
    kind: SpecialEventKind;
    jalaliMonth: number;
    jalaliDay: number;
    owner: OwnerRole;
    note?: string;
  }) => void;
  onDeleteSpecialEvent: (id: string) => void;
  onCreateWishMessage: (event: SpecialEventItem) => void;
  onAddChore: (input: {title: string; area: string; intervalDays: number; owner: OwnerRole}) => void;
  onMarkChoreDoneToday: (id: string) => void;
  onDeleteChore: (id: string) => void;
  onToggleEnglishLearned: (id: string) => void;
  onSpeakDailyEnglish: () => void;
  onChangePersonalityFocus: (focus: PersonalityFocusId) => void;
  onToggleExerciseDone: (exerciseId: string) => void;
  onAskRecipe: (dishName: string) => void;
  onOpenDriveMode: () => void;
  onCycleOfflineMessage: () => void;
  onGenerateAiMessage: () => Promise<void>;
  isGeneratingAi: boolean;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy' | 'custom') => void;
  onStopSpeech: () => void;
  onStatusToast?: (msg: string) => void;
}

const CATEGORY_LABELS: Record<GoalCategory, string> = {
  purpose: 'هدفمندی',
  work: 'کار و پروژه',
  health: 'سلامتی',
  relationship: 'رابطه ما',
  growth: 'رشد فردی',
};

const TIME_BLOCK_LABELS: Record<TimeBlock, string> = {
  morning: 'صبح',
  afternoon: 'ظهر و عصر',
  evening: 'شب',
};

export const TodayView: React.FC<TodayViewProps> = ({
  goals,
  habits,
  shoppingItems,
  expenses,
  monthlyBudget,
  bills,
  meds,
  meals,
  vaultNotes,
  packingItems,
  specialEvents,
  homeChores,
  learnedEnglishIds,
  personalityFocus,
  completedExercisesToday,
  activeSubSection,
  onChangeSubSection,
  morningMessage,
  isOnline,
  isSpeaking,
  speechSourceLabel,
  myName,
  partnerName,
  deviceOwner,
  defaultVoice,
  onChangeDefaultVoice,
  onAddGoal,
  onToggleGoal,
  onDeleteGoal,
  onCarryOverPastGoals,
  onToggleHabitDate,
  onAddHabit,
  onDeleteHabit,
  onAddShoppingItem,
  onAddShoppingItems,
  onToggleShoppingItem,
  onDeleteShoppingItem,
  onClearCheckedShopping,
  onUpdateBudget,
  onAddExpense,
  onDeleteExpense,
  onAddBill,
  onToggleBillPaid,
  onDeleteBill,
  onAddMed,
  onToggleMedTakenToday,
  onToggleMedEnabled,
  onDeleteMed,
  onSaveMealDay,
  onAddVaultNote,
  onDeleteVaultNote,
  onAddPackingItem,
  onAddPackingPreset,
  onTogglePackingItem,
  onDeletePackingItem,
  onSendPackingToShopping,
  onAddSpecialEvent,
  onDeleteSpecialEvent,
  onCreateWishMessage,
  onAddChore,
  onMarkChoreDoneToday,
  onDeleteChore,
  onToggleEnglishLearned,
  onSpeakDailyEnglish,
  onChangePersonalityFocus,
  onToggleExerciseDone,
  onAskRecipe,
  onOpenDriveMode,
  onCycleOfflineMessage,
  onGenerateAiMessage,
  isGeneratingAi,
  onSpeakText,
  onStopSpeech,
  onStatusToast,
}) => {
  const selfName = deviceOwner === 'zari' ? partnerName : myName;
  const otherName = deviceOwner === 'zari' ? myName : partnerName;
  const orderedPair = `${selfName} و ${otherName}`;
  const identityCtx = {myName, partnerName};
  const adaptedMorningTitle = adaptTextForDevice(morningMessage.title, identityCtx, deviceOwner);
  const adaptedMorningBody = adaptTextForDevice(morningMessage.message, identityCtx, deviceOwner);
  const adaptedAffirmation = adaptTextForDevice(morningMessage.affirmation, identityCtx, deviceOwner);
  const adaptedEnergyTip = adaptTextForDevice(morningMessage.energyTip, identityCtx, deviceOwner);
  const todayKey = getTodayKey();
  const jalaliToday = useMemo(() => formatJalaliFull(new Date()), []);
  const dayPart = getDayPart();
  const last7Days = useMemo(() => getLastNDaysKeys(7), []);

  const [shoppingMealsTab, setShoppingMealsTab] = useState<'shopping' | 'meals' | 'packing' | 'chores'>('shopping');
  const [financeBillsTab, setFinanceBillsTab] = useState<'expenses' | 'bills' | 'settlement'>('expenses');
  const [healthVaultTab, setHealthVaultTab] = useState<'meds' | 'events' | 'vault'>('meds');
  const [growthLabTab, setGrowthLabTab] = useState<'english' | 'summarizer' | 'personality'>('english');
  const [briefingText, setBriefingText] = useState('');
  const [briefingLoading, setBriefingLoading] = useState(false);

  const [ownerFilter, setOwnerFilter] = useState<'all' | OwnerRole>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | GoalScope>('all');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalOwner, setGoalOwner] = useState<OwnerRole>('both');
  const [goalScope, setGoalScope] = useState<GoalScope>('home');
  const [goalCategory, setGoalCategory] = useState<GoalCategory>('purpose');
  const [goalBlock, setGoalBlock] = useState<TimeBlock>('morning');
  const [goalPriority, setGoalPriority] = useState<'high' | 'normal'>('high');
  const [goalReminderTime, setGoalReminderTime] = useState('');

  const [habitTitle, setHabitTitle] = useState('');
  const [habitOwner, setHabitOwner] = useState<OwnerRole>('both');

  const todayExpenseTotal = useMemo(
    () => expenses.filter((e) => e.dateKey === todayKey).reduce((s, e) => s + e.amount, 0),
    [expenses, todayKey]
  );
  const monthPrefix = todayKey.slice(0, 7);
  const monthExpenseTotal = useMemo(
    () => expenses.filter((e) => e.dateKey.startsWith(monthPrefix)).reduce((s, e) => s + e.amount, 0),
    [expenses, monthPrefix]
  );

  const handlePlaySmartBriefing = async () => {
    setBriefingLoading(true);
    const mode = new Date().getHours() >= 17 ? 'evening' : 'morning';
    const weatherSummary = isOnline && mode === 'morning' ? await fetchQuickWeatherBrief() : '';
    const text = buildDailyBriefingText({
      mode,
      selfName,
      partnerName: otherName,
      goals,
      shoppingItems,
      bills,
      meds,
      meals,
      specialEvents,
      homeChores,
      todayExpenseTotal,
      monthExpenseTotal,
      monthlyBudget,
      weatherSummary,
    });
    setBriefingText(text);
    setBriefingLoading(false);
    onSpeakText(text, mode === 'morning' ? 'گزارش شروع روز' : 'جمع‌بندی ۳۰ ثانیه‌ای شب', 'custom');
  };

  // Focus timer (25 min focus / 5 min break)
  const [timerMode, setTimerMode] = useState<'focus' | 'break'>('focus');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          playSoftChime('chime');
          const finishText =
            timerMode === 'focus'
              ? 'آفرین! زمان تمرکز بیست و پنج دقیقه‌ای به پایان رسید. حالا پنج دقیقه استراحت کنید.'
              : 'استراحت تمام شد. با انرژی تازه به سراغ قدم بعدی برویم.';
          onSpeakText(finishText, 'اعلام پایان تایمر', 'energy');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, timerMode, onSpeakText]);

  const switchTimerMode = (mode: 'focus' | 'break') => {
    setTimerRunning(false);
    setTimerMode(mode);
    setSecondsLeft(mode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const inferScope = (g: GoalItem): GoalScope => g.scope ?? (g.category === 'work' ? 'work' : 'home');

  const todayGoals = useMemo(() => {
    return goals
      .filter((g) => g.dateKey === todayKey)
      .filter((g) => (ownerFilter === 'all' ? true : g.owner === ownerFilter))
      .filter((g) => (scopeFilter === 'all' ? true : inferScope(g) === scopeFilter));
  }, [goals, todayKey, ownerFilter, scopeFilter]);

  const allTodayGoals = useMemo(() => goals.filter((g) => g.dateKey === todayKey), [goals, todayKey]);
  const pastUncompletedGoals = useMemo(
    () => goals.filter((g) => g.dateKey < todayKey && !g.completed),
    [goals, todayKey]
  );
  const completedCount = allTodayGoals.filter((g) => g.completed).length;
  const totalCount = allTodayGoals.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleSpeakTodayGoals = () => {
    const remaining = allTodayGoals.filter((g) => !g.completed);
    if (remaining.length === 0) {
      onSpeakText('آفرین! تمام برنامه‌های ثبت‌شده امروز انجام شده‌اند.', 'وضعیت برنامه‌های امروز', 'custom');
      return;
    }
    const text = `برای امروز ${toPersianDigits(remaining.length)} کار باقی مانده است: ${remaining
      .slice(0, 10)
      .map((g, idx) => `${toPersianDigits(idx + 1)}، ${g.title}`)
      .join('؛ ')}.`;
    onSpeakText(text, 'مرور صوتی برنامه‌های امروز', 'custom');
  };

  const ownerLabel = (owner: OwnerRole) => {
    if (owner === 'man') return myName;
    if (owner === 'zari') return partnerName;
    return orderedPair;
  };

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    onAddGoal({
      title: goalTitle.trim(),
      owner: goalOwner,
      scope: goalScope,
      category: goalCategory,
      timeBlock: goalBlock,
      priority: goalPriority,
      reminderTime: goalReminderTime.trim() || undefined,
      reminderVoice: goalReminderTime.trim() ? defaultVoice : undefined,
    });
    setGoalTitle('');
    setGoalReminderTime('');
  };

  const handleHabitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!habitTitle.trim()) return;
    onAddHabit(habitTitle.trim(), habitOwner);
    setHabitTitle('');
  };

  const greetingTitle =
    dayPart === 'morning'
      ? `صبح بخیر، ${orderedPair}`
      : dayPart === 'midday'
        ? `روز بخیر، ${orderedPair}`
        : `شب بخیر، ${orderedPair}`;

  const fullMorningAudioText = `${adaptedMorningTitle}. ${adaptedMorningBody} جمله تاکیدی امروز: ${adaptedAffirmation}. پیشنهاد انرژی: ${adaptedEnergyTip}`;

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="space-y-6">
      {/* Practical Daily Workspace Switcher (5 clean sections) */}
      <div className="luxury-card p-2 grid grid-cols-2 lg:grid-cols-5 gap-1.5">
        <button
          type="button"
          onClick={() => onChangeSubSection('planner')}
          className={`col-span-2 lg:col-span-1 min-h-[46px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubSection === 'planner'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-[#F0EEE8] dark:hover:bg-emerald-950/40'
          }`}
        >
          <CalendarCheck className={`w-4 h-4 shrink-0 ${activeSubSection === 'planner' ? 'text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`} />
          <span>برنامه و گزارش روز</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeSubSection('shopping_meals')}
          className={`min-h-[46px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubSection === 'shopping_meals'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-[#F0EEE8] dark:hover:bg-emerald-950/40'
          }`}
        >
          <ShoppingBag className={`w-4 h-4 shrink-0 ${activeSubSection === 'shopping_meals' ? 'text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`} />
          <span>خرید، خانه و سفر</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeSubSection('finance_bills')}
          className={`min-h-[46px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubSection === 'finance_bills'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-[#F0EEE8] dark:hover:bg-emerald-950/40'
          }`}
        >
          <Wallet className={`w-4 h-4 shrink-0 ${activeSubSection === 'finance_bills' ? 'text-amber-300' : 'text-amber-600 dark:text-amber-400'}`} />
          <span>مالی و تسویه</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeSubSection('health_vault')}
          className={`min-h-[46px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubSection === 'health_vault'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-[#F0EEE8] dark:hover:bg-emerald-950/40'
          }`}
        >
          <Pill className={`w-4 h-4 shrink-0 ${activeSubSection === 'health_vault' ? 'text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`} />
          <span>دارو، مناسبت و کارت‌دان</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeSubSection('growth_lab')}
          className={`min-h-[46px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubSection === 'growth_lab'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-[#F0EEE8] dark:hover:bg-emerald-950/40'
          }`}
        >
          <GraduationCap className={`w-4 h-4 shrink-0 ${activeSubSection === 'growth_lab' ? 'text-amber-300' : 'text-amber-600 dark:text-amber-400'}`} />
          <span>رشد، زبان و خلاصه‌خوان</span>
        </button>
      </div>

      {activeSubSection === 'shopping_meals' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 p-1.5 luxury-card w-fit">
            <button
              type="button"
              onClick={() => setShoppingMealsTab('shopping')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
                shoppingMealsTab === 'shopping' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              لیست خرید فوری ({toPersianDigits(shoppingItems.filter((i) => !i.checked).length)})
            </button>
            <button
              type="button"
              onClick={() => setShoppingMealsTab('meals')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
                shoppingMealsTab === 'meals' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              برنامه غذای هفته
            </button>
            <button
              type="button"
              onClick={() => setShoppingMealsTab('packing')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer ${
                shoppingMealsTab === 'packing' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>سفر و چمدان ({toPersianDigits(packingItems.filter((p) => !p.checked).length)})</span>
            </button>
            <button
              type="button"
              onClick={() => setShoppingMealsTab('chores')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer ${
                shoppingMealsTab === 'chores' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>نگهداری خانه ({toPersianDigits(homeChores.length)})</span>
            </button>
          </div>
          {shoppingMealsTab === 'shopping' ? (
            <ShoppingChecklistPanel
              items={shoppingItems}
              onAddItem={onAddShoppingItem}
              onToggleItem={onToggleShoppingItem}
              onDeleteItem={onDeleteShoppingItem}
              onClearChecked={onClearCheckedShopping}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          ) : shoppingMealsTab === 'meals' ? (
            <MealPlannerPanel
              meals={meals}
              onSaveMealDay={onSaveMealDay}
              onAddShoppingItems={onAddShoppingItems}
              onAskRecipe={onAskRecipe}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          ) : shoppingMealsTab === 'packing' ? (
            <PackingChecklistPanel
              items={packingItems}
              myName={myName}
              partnerName={partnerName}
              deviceOwner={deviceOwner}
              onAddItem={onAddPackingItem}
              onAddTemplatePreset={onAddPackingPreset}
              onToggleItem={onTogglePackingItem}
              onDeleteItem={onDeletePackingItem}
              onSendUncheckedToShopping={onSendPackingToShopping}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          ) : (
            <HomeMaintenancePanel
              chores={homeChores}
              myName={myName}
              partnerName={partnerName}
              deviceOwner={deviceOwner}
              onAddChore={onAddChore}
              onMarkDoneToday={onMarkChoreDoneToday}
              onDeleteChore={onDeleteChore}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          )}
        </div>
      ) : activeSubSection === 'finance_bills' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 p-1.5 luxury-card w-fit">
            <button
              type="button"
              onClick={() => setFinanceBillsTab('expenses')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
                financeBillsTab === 'expenses' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              دخل و خرج روزانه
            </button>
            <button
              type="button"
              onClick={() => setFinanceBillsTab('settlement')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer ${
                financeBillsTab === 'settlement' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Handshake className="w-3.5 h-3.5" />
              <span>حساب دونفره و تسویه</span>
            </button>
            <button
              type="button"
              onClick={() => setFinanceBillsTab('bills')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
                financeBillsTab === 'bills' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              اقساط، قبوض و خودرو ({toPersianDigits(bills.filter((b) => !b.paid).length)})
            </button>
          </div>
          {financeBillsTab === 'expenses' ? (
            <ExpenseTrackerPanel
              expenses={expenses}
              monthlyBudget={monthlyBudget}
              onUpdateBudget={onUpdateBudget}
              onAddExpense={onAddExpense}
              onDeleteExpense={onDeleteExpense}
              myName={myName}
              partnerName={partnerName}
              deviceOwner={deviceOwner}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          ) : financeBillsTab === 'settlement' ? (
            <CoupleSettlementPanel
              expenses={expenses}
              myName={myName}
              partnerName={partnerName}
              deviceOwner={deviceOwner}
              onAddSettlementExpense={onAddExpense}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          ) : (
            <BillsAndServicesPanel
              bills={bills}
              onAddBill={onAddBill}
              onTogglePaid={onToggleBillPaid}
              onDeleteBill={onDeleteBill}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          )}
        </div>
      ) : activeSubSection === 'health_vault' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 p-1.5 luxury-card w-fit">
            <button
              type="button"
              onClick={() => setHealthVaultTab('meds')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer ${
                healthVaultTab === 'meds' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Pill className="w-4 h-4" />
              <span>داروها و نوبت پزشک</span>
            </button>
            <button
              type="button"
              onClick={() => setHealthVaultTab('events')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer ${
                healthVaultTab === 'events' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <CalendarHeart className="w-4 h-4" />
              <span>مناسبت‌ها و تولدها ({toPersianDigits(specialEvents.length)})</span>
            </button>
            <button
              type="button"
              onClick={() => setHealthVaultTab('vault')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer ${
                healthVaultTab === 'vault' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>کارت‌دان و یادداشت‌ها</span>
            </button>
          </div>
          {healthVaultTab === 'meds' ? (
            <MedicationTrackerPanel
              meds={meds}
              myName={myName}
              partnerName={partnerName}
              deviceOwner={deviceOwner}
              onAddMed={onAddMed}
              onToggleTakenToday={onToggleMedTakenToday}
              onToggleEnabled={onToggleMedEnabled}
              onDeleteMed={onDeleteMed}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          ) : healthVaultTab === 'events' ? (
            <SpecialEventsPanel
              events={specialEvents}
              myName={myName}
              partnerName={partnerName}
              deviceOwner={deviceOwner}
              onAddEvent={onAddSpecialEvent}
              onDeleteEvent={onDeleteSpecialEvent}
              onCreateWishMessage={onCreateWishMessage}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          ) : (
            <QuickVaultPanel
              notes={vaultNotes}
              myName={myName}
              partnerName={partnerName}
              deviceOwner={deviceOwner}
              onAddNote={onAddVaultNote}
              onDeleteNote={onDeleteVaultNote}
              onStatusToast={onStatusToast}
            />
          )}
        </div>
      ) : activeSubSection === 'growth_lab' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 p-1.5 luxury-card w-fit">
            <button
              type="button"
              onClick={() => setGrowthLabTab('english')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer ${
                growthLabTab === 'english' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>۵ عبارت انگلیسی امروز</span>
            </button>
            <button
              type="button"
              onClick={() => setGrowthLabTab('summarizer')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer ${
                growthLabTab === 'summarizer' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>خلاصه‌خوان متن و مقاله</span>
            </button>
            <button
              type="button"
              onClick={() => setGrowthLabTab('personality')}
              className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer ${
                growthLabTab === 'personality' ? 'bg-emerald-800 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Brain className="w-4 h-4" />
              <span>تمرین علمی شخصیت</span>
            </button>
          </div>
          {growthLabTab === 'english' ? (
            <DailyEnglishPanel
              learnedIds={learnedEnglishIds}
              onToggleLearned={onToggleEnglishLearned}
              onSpeakText={onSpeakText}
              onSpeakAllToday={onSpeakDailyEnglish}
            />
          ) : growthLabTab === 'summarizer' ? (
            <TextSummarizerPanel
              isOnline={isOnline}
              onSpeakText={onSpeakText}
              onStatusToast={onStatusToast}
            />
          ) : (
            <PersonalityGrowthPanel
              activeFocus={personalityFocus}
              completedIdsToday={completedExercisesToday}
              onChangeFocus={onChangePersonalityFocus}
              onToggleExerciseDone={onToggleExerciseDone}
              onSpeakText={onSpeakText}
            />
          )}
        </div>
      ) : (
        <div className="space-y-8">
      {/* Editorial Hero & Morning Energy Sanctuary */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 luxury-card p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{jalaliToday}</span>
              <span aria-hidden="true">·</span>
              <span>{isOnline ? 'متصل و آماده هوش مصنوعی' : 'حالت آفلاین کامل'}</span>
              {speechSourceLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-800 dark:text-amber-300 font-semibold">{speechSourceLabel}</span>
                </>
              )}
            </div>

            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight text-balance">
              {greetingTitle}
            </h1>

            <div className="mt-6 pt-6 border-t border-[#E6E2D8] dark:border-emerald-950/60">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                پیام انرژی‌بخش امروز · {adaptedMorningTitle}
              </div>
              <p className="mt-2.5 text-base leading-8 text-slate-700 dark:text-slate-200 max-w-2xl">
                {adaptedMorningBody}
              </p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-emerald-950/50 text-sm">
                <div>
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">جمله تاکیدی امروز</div>
                  <p className="mt-1 text-slate-700 dark:text-slate-300 leading-7">{adaptedAffirmation}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">گام کوچک انرژی</div>
                  <p className="mt-1 text-slate-700 dark:text-slate-300 leading-7">{adaptedEnergyTip}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-emerald-950/60 flex flex-wrap items-center gap-3">
            {isSpeaking ? (
              <button
                type="button"
                onClick={onStopSpeech}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>توقف پخش</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSpeakText(fullMorningAudioText, adaptedMorningTitle, 'morning')}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>شنیدن با صدای روان فارسی</span>
              </button>
            )}

            <select
              value={defaultVoice}
              onChange={(e) => onChangeDefaultVoice(e.target.value as VoiceName)}
              aria-label="انتخاب گوینده"
              className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {VOICE_PERSONAS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onCycleOfflineMessage}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>پیام دیگر (آفلاین)</span>
            </button>

            <button
              type="button"
              onClick={onGenerateAiMessage}
              disabled={!isOnline || isGeneratingAi}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGeneratingAi ? 'در حال نگارش...' : 'پیام تازه هوشمند'}</span>
            </button>

            <button
              type="button"
              onClick={handlePlaySmartBriefing}
              disabled={briefingLoading}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-[#162724] hover:bg-slate-800 text-white border border-amber-400/40 text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Volume2 className="w-4 h-4 text-amber-300" />
              <span>{briefingLoading ? 'در حال جمع‌بندی...' : 'گزارش ۳۰ ثانیه‌ای روز'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenDriveMode}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#DFDBD0] dark:border-emerald-800 bg-[#FAF9F6] dark:bg-[#0B1412] text-slate-800 dark:text-amber-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Car className="w-4 h-4" />
              <span>حالت رانندگی</span>
            </button>
          </div>

          {briefingText && (
            <div className="mt-4 rounded-2xl luxury-surface-subtle p-4 text-xs sm:text-sm leading-7 text-slate-700 dark:text-slate-200">
              <div className="font-bold text-emerald-800 dark:text-amber-300 mb-1">
                خلاصه هوشمند ۳۰ ثانیه‌ای امروز:
              </div>
              <p>{briefingText}</p>
            </div>
          )}
        </div>

        {/* Right Summary & Pomodoro Column */}
        <div className="lg:col-span-4 luxury-card p-6 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">پیشرفت هدفمند امروز</h2>
              <span className="text-2xl font-extrabold text-emerald-800 dark:text-amber-300 tabular-nums">
                {toPersianDigits(progressPct)}٪
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-[#F0EEE8] dark:bg-emerald-950 overflow-hidden">
              <div
                className="h-full bg-gradient-to-l from-emerald-800 to-amber-500 dark:from-emerald-500 dark:to-amber-400 transition-all duration-300"
                style={{width: `${progressPct}%`}}
              />
            </div>
            <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {toPersianDigits(completedCount)} از {toPersianDigits(totalCount)} برنامه امروز تکمیل شده است
            </p>
          </div>

          <div className="pt-5 border-t border-[#E6E2D8] dark:border-emerald-950/60">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">تایمر تمرکز عمیق</h2>
              <div className="flex items-center gap-1 p-1 luxury-surface-subtle rounded-xl">
                <button
                  type="button"
                  onClick={() => switchTimerMode('focus')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    timerMode === 'focus'
                      ? 'bg-emerald-800 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  تمرکز ۲۵د
                </button>
                <button
                  type="button"
                  onClick={() => switchTimerMode('break')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    timerMode === 'break'
                      ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  استراحت ۵د
                </button>
              </div>
            </div>

            <div className="mt-4 text-center py-3">
              <div className="font-mono-num text-4xl font-bold tracking-wider text-slate-900 dark:text-white" dir="ltr">
                {toPersianDigits(mins)}:{toPersianDigits(secs)}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTimerRunning((r) => !r)}
                className="flex-1 min-h-[44px] rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{timerRunning ? 'توقف موقت' : 'شروع تمرکز'}</span>
              </button>
              <button
                type="button"
                onClick={() => switchTimerMode(timerMode)}
                aria-label="بازنشانی تایمر"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-emerald-900 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Split: Purposeful Daily Goals & 7-Day Habits */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Goals */}
        <div className="lg:col-span-7 luxury-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">برنامه‌ها و اهداف امروز</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                تفکیک‌شده برای {selfName}، {otherName} و کارهای مشترک
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {allTodayGoals.length > 0 && (
                <button
                  type="button"
                  onClick={handleSpeakTodayGoals}
                  className="min-h-[38px] px-3 rounded-xl border border-[#DFDBD0] dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-semibold text-emerald-800 dark:text-amber-300 flex items-center gap-1.5 cursor-pointer hover:bg-[#FAF9F6]"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>مرور صوتی</span>
                </button>
              )}

              <div className="flex items-center gap-1 p-1 luxury-surface-subtle rounded-xl">
                {(
                  [
                    {id: 'all', label: 'همه'},
                    {id: 'both', label: 'مشترک'},
                    {id: deviceOwner, label: selfName},
                    {id: deviceOwner === 'zari' ? 'man' : 'zari', label: otherName},
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOwnerFilter(tab.id)}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      ownerFilter === tab.id
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 luxury-surface-subtle rounded-xl">
                {(
                  [
                    {id: 'all', label: 'خانه و کار'},
                    {id: 'home', label: 'خانه'},
                    {id: 'work', label: 'کاری'},
                  ] as const
                ).map((sTab) => (
                  <button
                    key={sTab.id}
                    type="button"
                    onClick={() => setScopeFilter(sTab.id)}
                    className={`min-h-[36px] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      scopeFilter === sTab.id
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {sTab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {pastUncompletedGoals.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-xs font-medium text-amber-950 dark:text-amber-200">
                {toPersianDigits(pastUncompletedGoals.length)} کار انجام‌نشده از روزهای قبل دارید تا فراموش نشوند.
              </div>
              <button
                type="button"
                onClick={onCarryOverPastGoals}
                className="min-h-[36px] px-3.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>انتقال به امروز</span>
              </button>
            </div>
          )}

          <form onSubmit={handleGoalSubmit} className="mt-5 space-y-3 pb-5 border-b border-slate-100 dark:border-emerald-950/60">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder="هدف یا کار خونه / کاری امروز را بنویسید..."
                className="flex-1 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600"
              />
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <select
                value={goalOwner}
                onChange={(e) => setGoalOwner(e.target.value as OwnerRole)}
                aria-label="مسئول انجام"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="both">مشترک (هر دو)</option>
                <option value={deviceOwner}>تکی: {selfName}</option>
                <option value={deviceOwner === 'zari' ? 'man' : 'zari'}>تکی: {otherName}</option>
              </select>

              <select
                value={goalScope}
                onChange={(e) => setGoalScope(e.target.value as GoalScope)}
                aria-label="حوزه کار"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="home">کار خانه</option>
                <option value="work">امور کاری</option>
              </select>

              <select
                value={goalCategory}
                onChange={(e) => setGoalCategory(e.target.value as GoalCategory)}
                aria-label="دسته‌بندی"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>

              <select
                value={goalBlock}
                onChange={(e) => setGoalBlock(e.target.value as TimeBlock)}
                aria-label="زمان روز"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                {Object.entries(TIME_BLOCK_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>

              <select
                value={goalPriority}
                onChange={(e) => setGoalPriority(e.target.value as 'high' | 'normal')}
                aria-label="اولویت"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="high">اولویت بالا</option>
                <option value="normal">عادی</option>
              </select>

              <div className="relative flex items-center" title="ساعت یادآور صوتی این هدف (اختیاری)">
                <Bell className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
                <input
                  type="time"
                  value={goalReminderTime}
                  onChange={(e) => setGoalReminderTime(e.target.value)}
                  aria-label="ساعت یادآور صوتی"
                  className="w-full min-h-[40px] pr-7 pl-2 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-mono-num text-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
          </form>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-emerald-950/60">
            {todayGoals.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                هنوز برنامه‌ای در این بخش ثبت نشده است. اولین هدف امروزتان را اضافه کنید.
              </div>
            ) : (
              todayGoals.map((goal) => (
                <div key={goal.id} className="py-3.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleGoal(goal.id)}
                    className="flex-1 min-h-[44px] flex items-center gap-3 text-right cursor-pointer group"
                  >
                    <span
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        goal.completed
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'border-slate-300 dark:border-emerald-800 group-hover:border-emerald-600'
                      }`}
                    >
                      {goal.completed && <Check className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium transition-colors ${
                          goal.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {goal.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>{ownerLabel(goal.owner)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{inferScope(goal) === 'work' ? 'کاری' : 'خانه'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{CATEGORY_LABELS[goal.category]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{TIME_BLOCK_LABELS[goal.timeBlock]}</span>
                        {goal.reminderTime && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
                              یادآور صوتی {toPersianDigits(goal.reminderTime)}
                            </span>
                          </>
                        )}
                        {goal.priority === 'high' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-700 dark:text-amber-400 font-medium">اولویت بالا</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteGoal(goal.id)}
                    aria-label="حذف هدف"
                    className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 7-Day Habit Streaks */}
        <div className="lg:col-span-5 luxury-card p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">ردیاب عادت‌های روزانه</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تداوم کوچک هر روز، کیفیت زندگی مشترکمان را می‌سازد
          </p>

          <form onSubmit={handleHabitSubmit} className="mt-4 flex flex-col sm:flex-row gap-2 pb-4 border-b border-[#E6E2D8] dark:border-emerald-950/60">
            <input
              type="text"
              value={habitTitle}
              onChange={(e) => setHabitTitle(e.target.value)}
              placeholder="عادت جدید (مثلاً ۲۰ دقیقه پیاده‌روی)"
              className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600"
            />
            <div className="flex gap-2">
              <select
                value={habitOwner}
                onChange={(e) => setHabitOwner(e.target.value as OwnerRole)}
                className="min-h-[44px] px-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="both">مشترک</option>
                <option value={deviceOwner}>{selfName}</option>
                <option value={deviceOwner === 'zari' ? 'man' : 'zari'}>{otherName}</option>
              </select>
              <button
                type="submit"
                aria-label="افزودن عادت"
                className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-4">
            {habits.map((habit) => {
              const streak = habit.completedDates.length;
              return (
                <div key={habit.id} className="pb-4 border-b last:border-b-0 border-slate-100 dark:border-emerald-950/50">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{habit.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>{ownerLabel(habit.owner)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 tabular-nums">
                          <Flame className="w-3.5 h-3.5" />
                          {toPersianDigits(streak)} روز ثبت‌شده
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteHabit(habit.id)}
                      aria-label="حذف عادت"
                      className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-7 gap-1.5">
                    {last7Days.map((day) => {
                      const done = habit.completedDates.includes(day.key);
                      const isToday = day.key === todayKey;
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => onToggleHabitDate(habit.id, day.key)}
                          className={`min-h-[44px] rounded-xl flex flex-col items-center justify-center text-[11px] transition-colors cursor-pointer ${
                            done
                              ? 'bg-emerald-700 text-white font-semibold'
                              : isToday
                                ? 'border border-emerald-600 text-emerald-800 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30'
                                : 'bg-slate-100 dark:bg-emerald-950/40 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <span className="text-[10px] opacity-80">{day.shortDay}</span>
                          <span className="tabular-nums font-medium">{day.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
        </div>
      )}
    </div>
  );
};
