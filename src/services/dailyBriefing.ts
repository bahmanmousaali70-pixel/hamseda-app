import {
  formatJalaliFull,
  formatJalaliShort,
  getDaysUntilJalaliEvent,
  getPersianWeekdayId,
  getTodayKey,
  toPersianDigits,
} from '../data/persianLibrary';
import type {
  BillReminderItem,
  GoalItem,
  HomeChoreItem,
  MealPlanEntry,
  MedicationItem,
  ShoppingItem,
  SpecialEventItem,
} from '../types/app';
import {apiUrl, safeReadJsonResponse} from './apiConfig';

export interface DailyBriefingInput {
  mode: 'morning' | 'evening';
  selfName: string;
  partnerName: string;
  goals: GoalItem[];
  shoppingItems: ShoppingItem[];
  bills: BillReminderItem[];
  meds: MedicationItem[];
  meals: MealPlanEntry[];
  specialEvents?: SpecialEventItem[];
  homeChores?: HomeChoreItem[];
  todayExpenseTotal: number;
  monthExpenseTotal: number;
  monthlyBudget: number;
  weatherSummary?: string;
}

function formatTomanWords(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '۰ تومان';
  return `${toPersianDigits(Math.round(amount).toLocaleString('en-US'))} تومان`;
}

export async function fetchQuickWeatherBrief(): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(apiUrl('/api/assistant-command'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: controller.signal,
        body: JSON.stringify({
          utterance: 'آب و هوای امروز چطوره؟',
          assistantName: 'هم‌صدا',
        }),
      });
      if (!res.ok) return '';
      const parsed = await safeReadJsonResponse<{replyText?: string}>(res);
      if (parsed.isHtml || !parsed.data?.replyText) return '';
      return parsed.data.replyText.trim();
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return '';
  }
}

export function buildDailyBriefingText(input: DailyBriefingInput): string {
  const todayKey = getTodayKey();
  const jalaliToday = formatJalaliFull(new Date());
  const todayWeekday = getPersianWeekdayId(new Date());

  const todayGoals = input.goals.filter((g) => g.dateKey === todayKey);
  const doneGoals = todayGoals.filter((g) => g.completed);
  const pendingGoals = todayGoals.filter((g) => !g.completed);

  const remainingShop = input.shoppingItems.filter((s) => !s.checked);

  // Near-due unpaid bills within 5 days or overdue
  const todayMs = new Date(`${todayKey}T12:00:00`).getTime();
  const urgentBills = input.bills.filter((b) => {
    if (b.paid || !b.dueDateKey) return false;
    const dueMs = new Date(`${b.dueDateKey}T12:00:00`).getTime();
    if (Number.isNaN(dueMs)) return false;
    const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
    return diffDays <= 5;
  });

  const activeMeds = input.meds.filter((m) => m.enabled);
  const pendingMeds = activeMeds.filter((m) => !m.takenDates.includes(todayKey));
  const todayMeal = input.meals.find((m) => m.id === todayWeekday);

  const upcomingEvents = (input.specialEvents ?? [])
    .map((ev) => ({ev, daysLeft: getDaysUntilJalaliEvent(ev.jalaliMonth, ev.jalaliDay)}))
    .filter((entry) => entry.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const dueChores = (input.homeChores ?? []).filter((ch) => {
    if (!ch.nextDueDateKey) return false;
    return ch.nextDueDateKey <= todayKey;
  });

  const parts: string[] = [];

  if (input.mode === 'morning') {
    parts.push(`سلام ${input.selfName} عزیز، صبح بخیر! امروز ${jalaliToday} است.`);
    if (input.weatherSummary) {
      parts.push(input.weatherSummary);
    }
    if (upcomingEvents.length > 0) {
      const topEv = upcomingEvents[0];
      if (topEv.daysLeft === 0) {
        parts.push(`مناسبت ویژه امروز: ${topEv.ev.title}! تبریک یادتان نرود.`);
      } else {
        parts.push(
          `نزدیک مناسبت: فقط ${toPersianDigits(topEv.daysLeft)} روز تا «${topEv.ev.title}» باقی مانده است.`
        );
      }
    }
    if (pendingGoals.length > 0) {
      const top = pendingGoals
        .slice(0, 3)
        .map((g) => g.title)
        .join('، ');
      parts.push(
        `برای امروز ${toPersianDigits(pendingGoals.length)} برنامه در انتظار دارید؛ از جمله: ${top}.`
      );
    } else if (todayGoals.length > 0) {
      parts.push('تمام اهداف امروز تا اینجا تکمیل شده‌اند.');
    } else {
      parts.push('هنوز هدفی برای امروز ثبت نشده؛ می‌توانید اولین کار مهم امروز را اضافه کنید.');
    }

    if (todayMeal && (todayMeal.lunch || todayMeal.dinner)) {
      const mealPieces = [
        todayMeal.lunch ? `ناهار: ${todayMeal.lunch}` : '',
        todayMeal.dinner ? `شام: ${todayMeal.dinner}` : '',
      ]
        .filter(Boolean)
        .join(' و ');
      parts.push(`برنامه غذای امروز: ${mealPieces}.`);
    }

    if (pendingMeds.length > 0) {
      parts.push(
        `${toPersianDigits(pendingMeds.length)} یادآور دارو یا نوبت امروز فعال است (${pendingMeds
          .slice(0, 2)
          .map((m) => `${m.name} ساعت ${toPersianDigits(m.time)}`)
          .join(' و ')}).`
      );
    }

    if (dueChores.length > 0) {
      parts.push(
        `نگهداری خانه: ${toPersianDigits(dueChores.length)} کار دوره‌ای موعدش رسیده (${dueChores[0].title}).`
      );
    }

    if (urgentBills.length > 0) {
      parts.push(
        `توجه مالی: ${toPersianDigits(urgentBills.length)} قسط یا قبض نزدیک سررسید دارید (${urgentBills
          .slice(0, 2)
          .map((b) => `${b.title} در ${formatJalaliShort(b.dueDateKey)}`)
          .join(' و ')}).`
      );
    }

    if (remainingShop.length > 0) {
      parts.push(
        `در لیست خرید ${toPersianDigits(remainingShop.length)} مورد باز وجود دارد: ${remainingShop
          .slice(0, 3)
          .map((s) => s.title)
          .join('، ')}.`
      );
    }
  } else {
    parts.push(`خسته نباشید ${input.selfName} و ${input.partnerName} عزیز! جمع‌بندی امشب (${jalaliToday}):`);
    if (upcomingEvents.length > 0) {
      const ev = upcomingEvents[0];
      parts.push(
        ev.daysLeft === 0
          ? `امروز «${ev.ev.title}» است؛ یک پیام تبریک قشنگ بسازید.`
          : `یادتان باشد ${toPersianDigits(ev.daysLeft)} روز تا «${ev.ev.title}» مانده است.`
      );
    }
    if (todayGoals.length > 0) {
      parts.push(
        `از ${toPersianDigits(todayGoals.length)} برنامه امروز، ${toPersianDigits(
          doneGoals.length
        )} مورد انجام شد${pendingGoals.length > 0 ? ` و ${toPersianDigits(pendingGoals.length)} کار باقی مانده که فردا می‌توانید با یک لمس منتقلش کنید` : ' و آفرین به این نظم'}.`
      );
    }
    parts.push(
      `مخارج ثبت‌شده امروز ${formatTomanWords(input.todayExpenseTotal)} و جمع هزینه این ماه ${formatTomanWords(
        input.monthExpenseTotal
      )} بوده است${
        input.monthlyBudget > 0
          ? ` (${toPersianDigits(Math.min(100, Math.round((input.monthExpenseTotal / input.monthlyBudget) * 100)))} درصد از بودجه ماهانه)`
          : ''
      }.`
    );
    if (pendingMeds.length > 0) {
      parts.push(
        `یادآور سلامت: ${pendingMeds.map((m) => m.name).slice(0, 2).join(' و ')} هنوز تیک نخورده‌اند.`
      );
    }
    if (dueChores.length > 0) {
      parts.push(`در فهرست نگهداری خانه، ${toPersianDigits(dueChores.length)} مورد در انتظار انجام است.`);
    }
    if (urgentBills.length > 0) {
      parts.push(
        `یادتان باشد ${toPersianDigits(urgentBills.length)} قسط یا قبض پیش‌رو (${urgentBills[0].title}) در فهرست پرداخت‌نشده‌هاست.`
      );
    }
    parts.push('شب آرام و سرشار از قدردانی در کنار هم داشته باشید.');
  }

  return parts.join(' ');
}

export interface TextSummaryResult {
  title: string;
  bullets: string[];
  spokenSummary: string;
  isOffline?: boolean;
}

const STOP_WORDS = new Set([
  'و', 'در', 'به', 'از', 'که', 'این', 'است', 'را', 'با', 'برای', 'آن', 'یک', 'تا', 'هم', 'شد', 'می', 'های', 'ها', 'یا',
  'بر', 'اما', 'اگر', 'چون', 'خود', 'شما', 'من', 'ما', 'او', 'بود', 'باشد', 'شود', 'دارد', 'کند', 'باید', 'نیز',
  'the', 'a', 'an', 'is', 'are', 'in', 'on', 'of', 'to', 'and', 'for', 'that', 'with',
]);

export function summarizeTextOffline(rawText: string): TextSummaryResult {
  const cleaned = rawText
    .replace(/\r/g, ' ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return {
      title: 'متن خالی',
      bullets: ['متنی برای خلاصه‌سازی وارد نشده است.'],
      spokenSummary: 'لطفاً متنی را در کادر وارد کنید تا خلاصه شود.',
      isOffline: true,
    };
  }

  const rawSentences = cleaned
    .split(/(?<=[.!؟?\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16);

  const sentences =
    rawSentences.length >= 2
      ? rawSentences
      : cleaned
          .split(/[،;]+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 14);

  const fallbackPool = sentences.length > 0 ? sentences : [cleaned.slice(0, 220)];

  // Compute word frequencies to score informative sentences
  const freq = new Map<string, number>();
  const words = cleaned.toLowerCase().split(/[^a-z\u0600-\u06ff0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const scored = fallbackPool.map((sentence, idx) => {
    const tokens = sentence
      .toLowerCase()
      .split(/[^a-z\u0600-\u06ff0-9]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    let score = 0;
    for (const t of tokens) {
      score += freq.get(t) ?? 0;
    }
    // Slight preference for early key sentences & medium length
    const normScore = (score / Math.max(1, Math.sqrt(tokens.length))) + (idx === 0 ? 1.5 : 0);
    return {sentence, idx, normScore};
  });

  scored.sort((a, b) => b.normScore - a.normScore);
  const topThree = scored
    .slice(0, 3)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => {
      const s = x.sentence.trim();
      return s.length > 180 ? `${s.slice(0, 177).trim()}...` : s;
    });

  const firstTitle = topThree[0] ? topThree[0].split(/[،.:؟!]/)[0].trim().slice(0, 65) : 'خلاصه متن';
  const spokenSummary = `خلاصه کوتاه این متن: ${topThree.join(' همچنین ')}`;

  return {
    title: firstTitle || 'خلاصه آفلاین متن',
    bullets: topThree,
    spokenSummary,
    isOffline: true,
  };
}
