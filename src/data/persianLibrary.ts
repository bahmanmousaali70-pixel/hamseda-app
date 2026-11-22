import type {
  CallerContact,
  GoalItem,
  GratitudeEntry,
  HabitItem,
  MealPlanEntry,
  MorningMessage,
  PackingTemplateId,
  PersonalityFocusId,
  ScheduledAnnouncement,
  VoiceName,
  WeekdayId,
} from '../types/app';

export function toPersianDigits(input: string | number): string {
  const map = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(input).replace(/\d/g, (d) => map[Number(d)] ?? d);
}

export function getTodayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatJalaliShort(dateKey: string): string {
  try {
    const dt = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(dt.getTime())) return toPersianDigits(dateKey);
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      day: 'numeric',
      month: 'long',
    }).format(dt);
  } catch {
    return toPersianDigits(dateKey);
  }
}

export function getPersianWeekdayId(date: Date = new Date()): WeekdayId {
  const map: WeekdayId[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[date.getDay()] ?? 'sat';
}

export const DEFAULT_MEAL_PLAN: MealPlanEntry[] = [
  {id: 'sat', dayLabel: 'شنبه', lunch: '', dinner: '', ingredients: ''},
  {id: 'sun', dayLabel: 'یک‌شنبه', lunch: '', dinner: '', ingredients: ''},
  {id: 'mon', dayLabel: 'دوشنبه', lunch: '', dinner: '', ingredients: ''},
  {id: 'tue', dayLabel: 'سه‌شنبه', lunch: '', dinner: '', ingredients: ''},
  {id: 'wed', dayLabel: 'چهارشنبه', lunch: '', dinner: '', ingredients: ''},
  {id: 'thu', dayLabel: 'پنج‌شنبه', lunch: '', dinner: '', ingredients: ''},
  {id: 'fri', dayLabel: 'جمعه', lunch: '', dinner: '', ingredients: ''},
];

export function getLastNDaysKeys(days: number): {key: string; label: string; shortDay: string}[] {
  const result: {key: string; label: string; shortDay: string}[] = [];
  const weekdayFmt = new Intl.DateTimeFormat('fa-IR', {weekday: 'short'});
  const dayFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {day: 'numeric'});
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    result.push({
      key: getTodayKey(dt),
      label: dayFmt.format(dt),
      shortDay: weekdayFmt.format(dt),
    });
  }
  return result;
}

export function formatJalaliFull(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
}

export function getDayPart(date: Date = new Date()): 'morning' | 'midday' | 'evening' {
  const hour = date.getHours();
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'midday';
  return 'evening';
}

export const VOICE_PERSONAS: {id: VoiceName; label: string; gender: 'female' | 'male'; tone: string}[] = [
  {id: 'Kore', label: 'نگین · خانم (گرم و صمیمی)', gender: 'female', tone: 'Adult female speaker. Warm, natural, affectionate Tehran Persian female voice'},
  {id: 'Zephyr', label: 'نسیم · خانم (آرام و دلنشین)', gender: 'female', tone: 'Adult female speaker. Calm, gentle, soothing Persian female voice for meditation and gratitude'},
  {id: 'Charon', label: 'رادین · آقا (بم و متین)', gender: 'male', tone: 'Adult male speaker. Deep baritone, steady, articulate bilingual Persian and English male voice'},
  {id: 'Fenrir', label: 'آرش · آقا (رسا و پرقدرت)', gender: 'male', tone: 'Adult male speaker. Strong, resonant, confident male voice ideal for caller announcements'},
  {id: 'Puck', label: 'پویا · جوان و شاداب', gender: 'male', tone: 'Youthful energetic speaker. Bright, motivating Persian voice for morning starts'},
];

export const OFFLINE_MORNING_MESSAGES: MorningMessage[] = [
  {
    id: 'msg-m1',
    dayPart: 'morning',
    title: 'طلوع یک روز هدفمند برای ما',
    message:
      'سلام به صبح روشن امروز! هر قدم کوچکی که با عشق و آگاهی برمی‌داریم، فردای زیباتری برای هردویمان می‌سازد. امروز را با لبخند، آرامش و تمرکز روی مهم‌ترین کارها شروع می‌کنیم.',
    affirmation: 'ما با آرامش، امید و پشتکار، بهترین نسخه امروزمان را می‌سازیم.',
    energyTip: 'یک لیوان آب بنوشید، پنج نفس عمیق بکشید و یک پیام کوتاه محبت‌آمیز برای همراه بفرستید.',
  },
  {
    id: 'msg-m2',
    dayPart: 'morning',
    title: 'انرژی تازه، ذهن شفاف',
    message:
      'امروز یک بوم سفید و تازه است. نیازی نیست همه کارهای جهان را یک‌جا تمام کنیم؛ کافی است سه هدف اصلی امروز را با تمام حضور قلب پیش ببریم و از کنار هم بودن لذت ببریم.',
    affirmation: 'زمان ما ارزشمند است و امروز تنها روی چیزهایی تمرکز می‌کنم که رشد و شادی می‌آورند.',
    energyTip: 'پیش از چک کردن شبکه‌های اجتماعی، ۱۰ دقیقه پیاده‌روی یا حرکات کششی انجام دهید.',
  },
  {
    id: 'msg-m3',
    dayPart: 'morning',
    title: 'قدرت شکرگذاری صبحگاهی',
    message:
      'داشتن یک همراه همدل مثل همراه و فرصت دوباره برای تلاش، بزرگ‌ترین سرمایه زندگی است. با قلبی سپاسگزار وارد امروز شوید تا درهای تازه با آرامش برایتان باز شوند.',
    affirmation: 'من قدردان لحظه‌های کوچک و بزرگ زندگی‌ام هستم و انرژی مثبت را به خانه‌مان می‌آورم.',
    energyTip: 'همین الان سه نعمت امروزتان را در دفتر شکرگذاری بنویسید.',
  },
  {
    id: 'msg-m4',
    dayPart: 'morning',
    title: 'جریان آرام و پیوسته',
    message:
      'موفقیت نتیجه شتاب‌زدگی نیست؛ نتیجه قدم‌های منظم و عاشقانه‌ای است که هر روز برمی‌داریم. امروز با حوصله، مهربانی و نظم پیش بروید.',
    affirmation: 'هر روز ما به رویاهای مشترکمان یک قدم واقعی نزدیک‌تر می‌شویم.',
    energyTip: 'اولین کار مهم امروز را به یک تایمر تمرکز ۲۵ دقیقه‌ای بسپارید.',
  },
  {
    id: 'msg-mid1',
    dayPart: 'midday',
    title: 'تجدید نفس در میانه روز',
    message:
      'نصف روز گذشته و وقت یک مکث کوتاه و مهربانانه با خودتان است. شانه‌ها را رها کنید، به دستاوردهای کوچک تا همین لحظه لبخند بزنید و با انرژی تازه ادامه بدهید.',
    affirmation: 'من در لحظه حال آرامش دارم و باقی روز را با ذهن روشن ادامه می‌دهم.',
    energyTip: 'دو دقیقه از صفحه نمایش فاصله بگیرید و یک لیوان چای یا آب تازه بنوشید.',
  },
  {
    id: 'msg-mid2',
    dayPart: 'midday',
    title: 'همراهی و انگیزه نیمروز',
    message:
      'اگر کارها سنگین به نظر می‌رسند، فقط قدم بعدی را ببینید. یادتان باشد شما تنها نیستید و لبخند همراه بهترین پاداش پایان یک روز پربار است.',
    affirmation: 'توانایی من از تردیدهایم بزرگ‌تر است و امروز را با سربلندی پیش می‌برم.',
    energyTip: 'یک پیام صوتی یا متنی کوتاه برای حال‌پرسی و انرژی دادن به همراه ارسال کنید.',
  },
  {
    id: 'msg-eve1',
    dayPart: 'evening',
    title: 'جمع‌بندی آرام و قدردانی شبانه',
    message:
      'خسته نباشید بابت تمام تلاش‌های امروز! هر آنچه انجام شد ارزشمند بود و آنچه باقی ماند را با آرامش به فردا بسپارید. امشب وقت گفت‌وگوی صمیمی و استراحت عمیق است.',
    affirmation: 'من کارهای امروز را با رضایت رها می‌کنم و شب را با آرامش در کنار همراه می‌گذرانم.',
    energyTip: 'یک یادداشت قدردانی کوچک درباره زحمات امروز همراه در دفتر شکرگذاری بنویسید.',
  },
  {
    id: 'msg-eve2',
    dayPart: 'evening',
    title: 'شامگاه سپاس و آرامش',
    message:
      'در پایان روز، بهترین عادت این است که به جای کمبودها، داشته‌ها و لحظات خوب امروز را مرور کنیم. قلب آرام، بهترین خواب و پرانرژی‌ترین فردا را می‌سازد.',
    affirmation: 'شب بخیر آرامش؛ فردا با ذهنی روشن‌تر و قلبی شادتر بیدار می‌شویم.',
    energyTip: 'فقط یک هدف طلایی برای فردا صبح یادداشت کنید تا ذهنتان سبک بخوابد.',
  },
];

export const INSTANT_ENERGY_BOOSTERS: {
  id: string;
  category: string;
  title: string;
  text: string;
}[] = [
  {
    id: 'boost-1',
    category: 'صبحگاهی',
    title: 'شروع طلایی روز',
    text: 'امروز بهترین روز برای شروع یک تغییر کوچک است. ما با آرامش و لبخند، امروز را می‌درخشیم.',
  },
  {
    id: 'boost-2',
    category: 'انرژی و انگیزه',
    title: 'رفع خستگی فوری',
    text: 'یک نفس عمیق بکش! هر تلاشی که امروز می‌کنی، بذر آرامش و موفقیت ماه‌های آینده است. ادامه بده قهرمان.',
  },
  {
    id: 'boost-3',
    category: 'عشق و همراهی',
    title: 'یادآور قدردانی از همراه',
    text: 'همراه عزیز، وجودت در روزهای من مثل نور صبح است. ممنون که با مهربانی و صبوری، خانه‌مان را پر از امید می‌کنی.',
  },
  {
    id: 'boost-4',
    category: 'تمرکز و اراده',
    title: 'فقط ۲۵ دقیقه تمرکز',
    text: 'نیازی به کامل بودن نیست؛ فقط ۲۵ دقیقه با تمام تمرکز شروع کن. حرکت، خودش انگیزه می‌سازد.',
  },
  {
    id: 'boost-5',
    category: 'شکرگذاری',
    title: 'آرامش قلب سپاسگزار',
    text: 'خدایا شکرت برای سلامتی، برای سقف امن خانه‌مان، برای لبخند همراه و برای فرصت ساختن فردایی بهتر.',
  },
  {
    id: 'boost-6',
    category: 'شبانه',
    title: 'پایان آرام روز',
    text: 'هرچه امروز گذشت کافی بود. ذهن را رها کن، لبخند بزن و با آرامش به استقبال فردای روشن برو.',
  },
];

export const PERSIAN_VOICE_PACK_ITEMS: {
  id: string;
  pack: 'morning' | 'gratitude' | 'energy' | 'caller';
  title: string;
  text: string;
  voiceName: VoiceName;
  style: string;
}[] = [
  {
    id: 'pack-m-1',
    pack: 'morning',
    title: 'سلام صبحگاهی به ما',
    text: 'صبح بخیر عزیزان ما! امروز یک روز تازه و پر از برکت است. با لبخند بیدار شوید، نفس عمیق بکشید و امروز را هدفمند و شاد شروع کنید.',
    voiceName: 'Kore',
    style: 'Warm, cheerful, fluent Tehran Persian morning greeting',
  },
  {
    id: 'pack-m-2',
    pack: 'morning',
    title: 'نیت هدفمند شروع روز (صدای آقا)',
    text: 'امروز روی کارهای مهم تمرکز می‌کنیم، با هم مهربان‌تر هستیم و برای هر قدم کوچک سپاسگزاریم. روزهای خوب را خودمان می‌سازیم.',
    voiceName: 'Charon',
    style: 'Adult male speaker. Deep baritone, encouraging, natural Persian voice',
  },
  {
    id: 'pack-g-1',
    pack: 'gratitude',
    title: 'شکرگذاری صبح و سلامتی (صدای خانم)',
    text: 'خداوندا شکرت برای نفس تازه امروز، برای سلامتی تن و آرامش جان، و برای حضور گرم همراه در زندگی من.',
    voiceName: 'Zephyr',
    style: 'Adult female speaker. Soft, peaceful, heartfelt Persian gratitude meditation',
  },
  {
    id: 'pack-g-2',
    pack: 'gratitude',
    title: 'قدردانی عاشقانه از همراه (صدای خانم)',
    text: 'همراه عزیز، ممنونم بابت تمام لحظه‌های قشنگ و لبخندهایی که به زندگی ما می‌بخشی. کنار تو هر روز معنا و آرامش بیشتری دارد.',
    voiceName: 'Kore',
    style: 'Adult female speaker. Affectionate, gentle, warm Persian voice',
  },
  {
    id: 'pack-e-1',
    pack: 'energy',
    title: 'پایان زمان تمرکز (پومودورو)',
    text: 'آفرین! بیست و پنج دقیقه تمرکز عالی به پایان رسید. الان پنج دقیقه استراحت کنید، یک لیوان آب بنوشید و لبخند بزنید.',
    voiceName: 'Fenrir',
    style: 'Adult male speaker. Bright, encouraging Persian coach',
  },
  {
    id: 'pack-e-2',
    pack: 'energy',
    title: 'بمب انرژی نیمروز (صدای آقا)',
    text: 'خستگی را کنار بگذارید! شما تا همین الان هم کارهای بزرگی انجام داده‌اید. با یک نفس عمیق، نیمه دوم روز را با قدرت تمام کنید.',
    voiceName: 'Charon',
    style: 'Adult male speaker. Motivating, deep, steady Persian voice',
  },
  {
    id: 'pack-c-1',
    pack: 'caller',
    title: 'نمونه اعلام تماس فارسی: همراه عزیز',
    text: 'تماس ورودی از طرف همراه عزیز. لطفاً گوشی را بردارید.',
    voiceName: 'Fenrir',
    style: 'Clear, pleasant Persian caller ID announcement',
  },
  {
    id: 'pack-c-2',
    pack: 'caller',
    title: 'نمونه اعلام تماس دوزبانه: Sara Design',
    text: 'تماس ورودی از طرف Sara Design. Incoming call from Sara Design.',
    voiceName: 'Charon',
    style: 'Clear bilingual Persian and English caller ID announcer',
  },
];

export const DEFAULT_GOALS: GoalItem[] = [
  {
    id: 'g-1',
    title: 'نوشتن ۳ مورد شکرگذاری صبحگاهی و نوشیدن آب',
    owner: 'both',
    category: 'purpose',
    timeBlock: 'morning',
    priority: 'high',
    completed: false,
    dateKey: getTodayKey(),
    createdAt: Date.now() - 300000,
  },
  {
    id: 'g-2',
    title: '۲۵ دقیقه تمرکز عمیق روی مهم‌ترین کار امروز',
    owner: 'man',
    category: 'work',
    timeBlock: 'morning',
    priority: 'high',
    completed: false,
    dateKey: getTodayKey(),
    createdAt: Date.now() - 200000,
  },
  {
    id: 'g-3',
    title: 'پیاده‌روی ۲۰ دقیقه‌ای یا گفتگوی عصرانه بدون موبایل',
    owner: 'zari',
    category: 'relationship',
    timeBlock: 'evening',
    priority: 'normal',
    completed: false,
    dateKey: getTodayKey(),
    createdAt: Date.now() - 100000,
  },
];

export const DEFAULT_HABITS: HabitItem[] = [
  {id: 'h-1', title: 'شکرگذاری صبحگاهی', owner: 'both', completedDates: []},
  {id: 'h-2', title: 'نوشیدن ۸ لیوان آب', owner: 'man', completedDates: []},
  {id: 'h-3', title: 'پیام انرژی‌بخش به هم', owner: 'both', completedDates: []},
  {id: 'h-4', title: '۱۵ دقیقه مطالعه هدفمند', owner: 'zari', completedDates: []},
];

export const DEFAULT_GRATITUDES: GratitudeEntry[] = [
  {
    id: 'grat-1',
    dateKey: getTodayKey(),
    jalaliDate: formatJalaliFull(new Date()),
    author: 'both',
    mood: 'grateful',
    items: [
      'بیدار شدن با سلامت و آرامش در شروع یک روز جدید',
      'همراهی، همدلی و دلگرمی بین ما',
      'فرصت یادگیری و ساختن برنامه‌های منظم‌تر برای آینده',
    ],
    loveNote: 'همراه عزیز، بودن تو کنارم بزرگ‌ترین انگیزه هر صبح من است.',
    createdAt: Date.now() - 3600000,
  },
];

export const DEFAULT_CALLERS: CallerContact[] = [
  {
    id: 'c-1',
    name: 'همراه عزیز',
    latinAlias: 'Zari',
    persianPhonetic: 'زَری جان',
    relation: 'همراه زندگی',
    template: 'تماس عاشقانه از طرف {name}. گوشی را بردارید!',
    repeatCount: 2,
    chimeStyle: 'chime',
    voiceName: 'Kore',
    favorite: true,
  },
  {
    id: 'c-2',
    name: 'مادر',
    latinAlias: 'Mom',
    persianPhonetic: 'مادَر',
    relation: 'خانواده',
    template: 'تماس ورودی از طرف {name}',
    repeatCount: 2,
    chimeStyle: 'gentle',
    voiceName: 'Zephyr',
    favorite: true,
  },
  {
    id: 'c-3',
    name: 'Sara Design',
    latinAlias: 'Sara Design',
    persianPhonetic: 'سارا دیزاین',
    relation: 'همکار پروژه',
    template: 'تماس از طرف {name}',
    repeatCount: 1,
    chimeStyle: 'classic',
    voiceName: 'Charon',
    favorite: false,
  },
  {
    id: 'c-4',
    name: 'دکتر محمدی',
    latinAlias: 'Dr. Mohammadi',
    persianPhonetic: 'دُکتر مُحَمّدی',
    relation: 'پزشک / مشاور',
    template: 'توجه: تماس از طرف {name}',
    repeatCount: 1,
    chimeStyle: 'classic',
    voiceName: 'Fenrir',
    favorite: false,
  },
  {
    id: 'c-5',
    name: 'Ali Tech Support',
    latinAlias: 'Ali Tech Support',
    persianPhonetic: 'علی تِک ساپورت',
    relation: 'فنی / کاری',
    template: 'تماس کاری از طرف {name}',
    repeatCount: 1,
    chimeStyle: 'gentle',
    voiceName: 'Charon',
    favorite: false,
  },
];

export const DEFAULT_SCHEDULES: ScheduledAnnouncement[] = [
  {
    id: 'sch-morning',
    title: 'پیام صبحگاهی و انرژی شروع روز',
    topic: 'morning',
    time: '07:30',
    enabled: true,
    voiceName: 'Kore',
    days: 'daily',
  },
  {
    id: 'sch-goals',
    title: 'مرور صوتی اهداف مهم امروز',
    topic: 'goals',
    time: '09:00',
    enabled: true,
    voiceName: 'Charon',
    days: 'daily',
  },
  {
    id: 'sch-energy',
    title: 'تجدید انرژی و نوشیدن آب نیمروز',
    topic: 'energy',
    time: '13:30',
    enabled: true,
    voiceName: 'Fenrir',
    days: 'daily',
  },
  {
    id: 'sch-gratitude',
    title: 'یادآور شکرگذاری و آرامش شبانه',
    topic: 'gratitude',
    time: '21:30',
    enabled: true,
    voiceName: 'Zephyr',
    days: 'daily',
  },
];

export const JALALI_MONTHS: {month: number; name: string}[] = [
  {month: 1, name: 'فروردین'},
  {month: 2, name: 'اردیبهشت'},
  {month: 3, name: 'خرداد'},
  {month: 4, name: 'تیر'},
  {month: 5, name: 'مرداد'},
  {month: 6, name: 'شهریور'},
  {month: 7, name: 'مهر'},
  {month: 8, name: 'آبان'},
  {month: 9, name: 'آذر'},
  {month: 10, name: 'دی'},
  {month: 11, name: 'بهمن'},
  {month: 12, name: 'اسفند'},
];

export function jalaliToGregorian(jy: number, jm: number, jd: number): {gy: number; gm: number; gd: number} {
  let y = jy + 1595;
  let days =
    -355668 +
    365 * y +
    Math.floor(y / 33) * 8 +
    Math.floor(((y % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const salA = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 13 && gd > salA[gm]; gm++) {
    gd -= salA[gm];
  }
  return {gy, gm, gd};
}

function parseAsciiDigits(raw: string): number {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const normalized = raw.replace(/[۰-۹]/g, (c) => String(persian.indexOf(c))).replace(/[٠-٩]/g, (c) => String(arabic.indexOf(c)));
  return Number.parseInt(normalized, 10);
}

export function getCurrentJalaliYearMonthDay(date: Date = new Date()): {jy: number; jm: number; jd: number} {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(date);
    const jy = parseAsciiDigits(parts.find((p) => p.type === 'year')?.value ?? '1405');
    const jm = parseAsciiDigits(parts.find((p) => p.type === 'month')?.value ?? '1');
    const jd = parseAsciiDigits(parts.find((p) => p.type === 'day')?.value ?? '1');
    if (Number.isFinite(jy) && Number.isFinite(jm) && Number.isFinite(jd)) {
      return {jy, jm, jd};
    }
  } catch {
    // fallback below
  }
  return {jy: 1405, jm: 1, jd: 1};
}

export function getDaysUntilJalaliEvent(month: number, day: number, fromDate: Date = new Date()): number {
  const {jy} = getCurrentJalaliYearMonthDay(fromDate);
  const todayMidnight = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 12, 0, 0).getTime();

  const tryYear = (year: number): number => {
    const clampedDay = month === 12 ? Math.min(day, 29) : month >= 7 ? Math.min(day, 30) : Math.min(day, 31);
    const g = jalaliToGregorian(year, month, clampedDay);
    return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0).getTime();
  };

  let targetMs = tryYear(jy);
  if (targetMs < todayMidnight - 1000 * 60 * 60 * 12) {
    targetMs = tryYear(jy + 1);
  }
  return Math.max(0, Math.round((targetMs - todayMidnight) / (1000 * 60 * 60 * 24)));
}

export function addDaysKey(dateKey: string, intervalDays: number): string {
  const dt = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(dt.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + intervalDays);
    return getTodayKey(fallback);
  }
  dt.setDate(dt.getDate() + Math.max(1, intervalDays));
  return getTodayKey(dt);
}

export const PACKING_TEMPLATES: Record<PackingTemplateId, {label: string; items: string[]}> = {
  road: {
    label: 'سفر جاده‌ای',
    items: [
      'کارت ملی، گواهینامه و مدارک خودرو',
      'پاوربانک و شارژر فندکی',
      'داروهای ضروری و جعبه کمک‌های اولیه',
      'قمقمه آب، فلاسک چای و تنقلات راه',
      'لباس اضافه و دستمال کاغذی',
      'عینک آفتابی و کرم ضدآفتاب',
    ],
  },
  flight: {
    label: 'سفر هوایی',
    items: [
      'گذرنامه / کارت ملی و بلیت',
      'شارژر موبایل، ایرپاد و آداپتور',
      'کیف دستی وسایل ضروری داخل کابین',
      'قرص سردرد و ضدتهوع',
      'مسواک، خمیردندان و عطر جیبی',
    ],
  },
  camp: {
    label: 'طبیعت‌گردی و کمپ',
    items: [
      'زیرانداز ضدآب و پتوی مسافرتی',
      'چراغ قوه و هدلایت با باتری پر',
      'کبریت یا فندک و وسایل دم‌آوری چای',
      'کیسه زباله، دستمال مرطوب و اسپری حشرات',
      'کفش مناسب پیاده‌روی و بادگیر',
    ],
  },
  custom: {
    label: 'اسباب‌کشی / چک‌لیست آزاد',
    items: [
      'چسب پهن و ماژیک علامت‌گذاری کارتن‌ها',
      'کیف مدارک و کلیدهای مهم (جدا از کارتن‌ها)',
      'جعبه ابزار ضروری',
    ],
  },
};

export const DEFAULT_CHORE_SUGGESTIONS: {title: string; area: string; intervalDays: number}[] = [
  {title: 'تعویض یا شستشوی فیلتر تصفیه آب', area: 'آشپزخانه', intervalDays: 90},
  {title: 'تعویض روتختی و روبالشی‌ها', area: 'اتاق خواب', intervalDays: 14},
  {title: 'جرم‌گیری چای‌ساز / قهوه‌ساز و سینک', area: 'آشپزخانه', intervalDays: 30},
  {title: 'سرویس فیلتر کولر / اسپیلت', area: 'تأسیسات', intervalDays: 60},
  {title: 'بررسی فشار باد لاستیک و روغن خودرو', area: 'خودرو', intervalDays: 30},
  {title: 'گردگیری و آبیاری کود گلدان‌ها', area: 'پذیرایی', intervalDays: 15},
];

export interface EnglishPhraseItem {
  id: string;
  topic: 'daily' | 'travel' | 'couple' | 'work';
  topicLabel: string;
  english: string;
  phonetic: string;
  persian: string;
}

export const DAILY_ENGLISH_PHRASES: EnglishPhraseItem[] = [
  {
    id: 'en-1',
    topic: 'daily',
    topicLabel: 'روزمره',
    english: 'Take your time, no rush at all.',
    phonetic: 'تیک یور تایم، نو راش ات آل',
    persian: 'عجله نکن، هر چقدر زمان می‌خوای بردار.',
  },
  {
    id: 'en-2',
    topic: 'couple',
    topicLabel: 'همراهی',
    english: 'Thank you for always having my back.',
    phonetic: 'ثنک یو فور آلوِیز هَویینگ مای بَک',
    persian: 'ممنونم که همیشه پشتم هستی و حمایتم می‌کنی.',
  },
  {
    id: 'en-3',
    topic: 'travel',
    topicLabel: 'سفر',
    english: 'Could you tell me the way to the station?',
    phonetic: 'کود یو تِل می دِ وِی تو دِ استیشن؟',
    persian: 'ممکنه مسیر ایستگاه رو به من نشون بدید؟',
  },
  {
    id: 'en-4',
    topic: 'work',
    topicLabel: 'کار و پیگیری',
    english: 'Let me double-check and get back to you.',
    phonetic: 'لت می دابل‌چک اند گت بک تو یو',
    persian: 'اجازه بده دوباره بررسی کنم و بهت خبر بدم.',
  },
  {
    id: 'en-5',
    topic: 'daily',
    topicLabel: 'روزمره',
    english: 'That makes a lot of sense.',
    phonetic: 'دَت میکس اِ لات آو سنس',
    persian: 'کاملاً منطقی به نظر می‌رسه.',
  },
  {
    id: 'en-6',
    topic: 'couple',
    topicLabel: 'همراهی',
    english: 'How did your day go so far?',
    phonetic: 'هاو دید یور دی گو سو فار؟',
    persian: 'امروزت تا الان چطور گذشته؟',
  },
  {
    id: 'en-7',
    topic: 'travel',
    topicLabel: 'سفر',
    english: 'Where can we grab a good coffee nearby?',
    phonetic: 'وِر کن وی گرب اِ گود کافی نیربای؟',
    persian: 'نزدیک اینجا کجا می‌تونیم یه قهوه خوب بخوریم؟',
  },
  {
    id: 'en-8',
    topic: 'work',
    topicLabel: 'کار و پیگیری',
    english: 'I appreciate your patience with this.',
    phonetic: 'آی اپریشیت یور پیشنس ویذ دیس',
    persian: 'از صبوری شما در این مورد قدردانی می‌کنم.',
  },
  {
    id: 'en-9',
    topic: 'daily',
    topicLabel: 'روزمره',
    english: 'Just to be on the safe side...',
    phonetic: 'جاست تو بی آن دِ سیف ساید...',
    persian: 'فقط برای محکم‌کاری و اطمینان بیشتر...',
  },
  {
    id: 'en-10',
    topic: 'couple',
    topicLabel: 'همراهی',
    english: 'Let us take a short walk this evening.',
    phonetic: 'لت آس تیک اِ شورت واک دیس ایونینگ',
    persian: 'بیا امروز عصر یک پیاده‌روی کوتاه بریم.',
  },
  {
    id: 'en-11',
    topic: 'travel',
    topicLabel: 'سفر',
    english: 'Is this seat already taken?',
    phonetic: 'ایز دیس سیت آلردی تیکن؟',
    persian: 'این صندلی از قبل گرفته شده؟',
  },
  {
    id: 'en-12',
    topic: 'work',
    topicLabel: 'کار و پیگیری',
    english: 'We are right on schedule today.',
    phonetic: 'وی آر رایت آن اسکجول تودی',
    persian: 'امروز دقیقاً طبق زمان‌بندی پیش می‌ریم.',
  },
  {
    id: 'en-13',
    topic: 'daily',
    topicLabel: 'روزمره',
    english: 'Better late than never!',
    phonetic: 'بِتِر لیت ذَن نِوِر!',
    persian: 'دیر رسیدن بهتر از هرگز نرسیدنه!',
  },
  {
    id: 'en-14',
    topic: 'couple',
    topicLabel: 'همراهی',
    english: 'You really brightened up my morning.',
    phonetic: 'یو ریلی برایتند آپ مای مورنینگ',
    persian: 'واقعاً صبح من رو روشن و قشنگ کردی.',
  },
  {
    id: 'en-15',
    topic: 'travel',
    topicLabel: 'سفر',
    english: 'Can we have the bill, please?',
    phonetic: 'کن وی هَو دِ بیل، پلیز؟',
    persian: 'ممکنه صورت‌حساب رو بیارید، لطفاً؟',
  },
  {
    id: 'en-16',
    topic: 'work',
    topicLabel: 'کار و پیگیری',
    english: 'Could we reschedule to tomorrow afternoon?',
    phonetic: 'کود وی ری‌اسکجول تو تومارو افترنون؟',
    persian: 'می‌تونیم زمانش رو بذاریم برای فردا عصر؟',
  },
  {
    id: 'en-17',
    topic: 'daily',
    topicLabel: 'روزمره',
    english: 'Let us keep things simple and calm.',
    phonetic: 'لت آس کیپ ثینگز سیمپل اند کام',
    persian: 'بیا همه‌چیز رو ساده و آرام نگه داریم.',
  },
  {
    id: 'en-18',
    topic: 'couple',
    topicLabel: 'همراهی',
    english: 'Whenever you are ready, I am with you.',
    phonetic: 'ون‌اِور یو آر رِدی، آی ام ویذ یو',
    persian: 'هر وقت آماده بودی، من کنارت هستم.',
  },
  {
    id: 'en-19',
    topic: 'travel',
    topicLabel: 'سفر',
    english: 'How long does it take by taxi?',
    phonetic: 'هاو لانگ داز ایت تیک بای تکسی؟',
    persian: 'با تاکسی چقدر زمان می‌بره؟',
  },
  {
    id: 'en-20',
    topic: 'work',
    topicLabel: 'کار و پیگیری',
    english: 'Please keep me posted on any updates.',
    phonetic: 'پلیز کیپ می پوستد آن انی آپدیتس',
    persian: 'لطفاً من رو از هر تغییر جدیدی باخبر بذار.',
  },
];

export function getTodayEnglishPhrases(count: number = 5, date: Date = new Date()): EnglishPhraseItem[] {
  const dayIndex = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
  const total = DAILY_ENGLISH_PHRASES.length;
  const start = (dayIndex * 3) % total;
  const out: EnglishPhraseItem[] = [];
  for (let i = 0; i < Math.min(count, total); i++) {
    out.push(DAILY_ENGLISH_PHRASES[(start + i) % total]);
  }
  return out;
}

export interface PersonalityExercise {
  id: string;
  title: string;
  durationMin: number;
  steps: string;
  spokenGuide: string;
}

export interface PersonalityProfile {
  id: PersonalityFocusId;
  title: string;
  tagline: string;
  scientificBasis: string;
  exercises: PersonalityExercise[];
}

export const PERSONALITY_PROFILES: PersonalityProfile[] = [
  {
    id: 'analytical',
    title: 'تحلیلی و کمال‌گرا',
    tagline: 'ذهن دقیق و ساختارمند که گاهی در نشخوار فکری یا وسواس تصمیم‌گیری گیر می‌کند.',
    scientificBasis: 'مبتنی بر ACT (پذیرش و تعهد) و قانون ۲ دقیقه برای شکستن تعلل تحلیلی.',
    exercises: [
      {
        id: 'ana-1',
        title: 'قاعده ۸۰ درصد کافی است',
        durationMin: 3,
        steps: 'یک کار معوقه امروز را انتخاب کن و عمداً به جای نسخه ایده‌آل، نسخه «۸۰٪ خوب و آماده» را در ۱۵ دقیقه تحویل بده.',
        spokenGuide: 'الان وقت شکستن کمال‌گرایی است. یک کار کوچک امروز را انتخاب کن و بگو نسخه هشتاد درصدش برای الان کافی است؛ شروع ناقص همیشه از صبرِ کامل بهتر است.',
      },
      {
        id: 'ana-2',
        title: 'تخلیه ذهن روی کاغذ (Brain Dump)',
        durationMin: 4,
        steps: '۵ نگرانی یا سناریوی چرخان در ذهن را بنویس؛ جلوی هر کدام فقط بنویس «در کنترل من است» یا «فعلاً رها».',
        spokenGuide: 'پنج دقیقه وقت بگذار و تمام نگرانی‌های تکراری ذهن را بیرون بریز. هر چیزی را که الان کنترل مستقیم رویش نداری با یک خط تیره کنار بگذار تا قشر پیش‌پیشانی آرام شود.',
      },
      {
        id: 'ana-3',
        title: 'گفت‌وگوی بدون راه‌حل فوری',
        durationMin: 5,
        steps: 'امروز در صحبت با همراه، به جای ارائه راه‌حل منطقی، ۳ دقیقه فقط بشنو و بگو «درک می‌کنم چقدر حس مهمیه».',
        spokenGuide: 'در گفت‌وگوی امروز با همسرت، حالت تحلیلگر را خاموش کن. فقط گوش بده، تایید عاطفی کن و قبل از هر پیشنهادی از احساسش بپرس.',
      },
    ],
  },
  {
    id: 'creative',
    title: 'خلاق و چندعلاقه‌مند',
    tagline: 'پر از ایده و اشتیاق، اما مستعد پراکندگی توجه و ناتمام گذاشتن کارها.',
    scientificBasis: 'مبتنی بر تکنیک جعبه زمان (Timeboxing) و محدودیت دوپامینی برای تمرکز پیوسته.',
    exercises: [
      {
        id: 'cre-1',
        title: 'اسپرینت ۱۸ دقیقه‌ای تک‌تکلیف',
        durationMin: 3,
        steps: 'همه زبانه‌های اضافی و ایده‌های فرعی را در یادداشت بنویس و فقط ۱۸ دقیقه روی یک خروجی کوچک بمان.',
        spokenGuide: 'مغز خلاق تو عاشق ایده‌های تازه است، اما الان فقط هجده دقیقه روی یک کار بمان. ایده‌های جدید را فقط روی کاغذ یادداشت کن و بعد سراغشان برو.',
      },
      {
        id: 'cre-2',
        title: 'تعریف «خط پایان روشن»',
        durationMin: 2,
        steps: 'قبل از شروع کار بعدیت بنویس: «وقتی دقیقاً این ۱ چیز آماده شد، کار امروز تمام حساب می‌شود».',
        spokenGuide: 'قبل از اینکه شاخه‌به‌شاخه بشوی، خط پایان کارت را در یک جمله کوتاه بنویس. وضوح خط پایان، دوپامین اتمام کار را فعال می‌کند.',
      },
      {
        id: 'cre-3',
        title: 'تبدیل ایده به اقدام ۵ دقیقه‌ای با همراه',
        durationMin: 5,
        steps: 'یک ایده مشترک برای خانه یا آخر هفته را با یک قدم ۵ دقیقه‌ای (رزرو یا نوشتن لیست) واقعی کن.',
        spokenGuide: 'امروز یکی از ایده‌های قشنگی که برای خودتان داشتید را از خیال بیرون بیاور و در پنج دقیقه اولین قدم عملی‌اش را بردار.',
      },
    ],
  },
  {
    id: 'sensitive',
    title: 'حساس، همدل و عاطفی',
    tagline: 'دریافت عمیق احساسات دیگران و احتمال بالا در خستگی هیجانی و دلخوری درونی.',
    scientificBasis: 'مبتنی بر تنظیم عصب واگ (آهی فیزیولوژیک) و مرزبندی مهربانانه در CBT.',
    exercises: [
      {
        id: 'sen-1',
        title: 'تنظیم واگ با آه فیزیولوژیک (۲ دقیقه)',
        durationMin: 2,
        steps: 'دو دم عمیق پشت سر هم از بینی (دم اول کامل + دم دوم کوتاه) و یک بازدم طولانی آهسته از دهان؛ ۵ بار تکرار.',
        spokenGuide: 'بیا سیستم عصبی‌ات را آرام کنیم. دو نفس عمیق پشت سر هم از بینی بکش و یک بازدم خیلی طولانی از دهان رها کن. این تمرین ضربان استرس را سریع پایین می‌آورد.',
      },
      {
        id: 'sen-2',
        title: 'بیان نیاز با جمله «من»',
        durationMin: 3,
        steps: 'به جای حدس زدن ذهن دیگران، یک نیاز ساده‌ات را با الگوی «من الان به ... نیاز دارم» بیان کن.',
        spokenGuide: 'قلب مهربان تو نباید همه فشار را تنها نگه دارد. امروز یک نیاز ساده‌ات را بدون سرزنش و با جمله «من الان به این کمک نیاز دارم» بگو.',
      },
      {
        id: 'sen-3',
        title: 'پاک‌سازی انرژی در پایان روز',
        durationMin: 4,
        steps: 'سه اتفاقی را که امروز به تو ربط نداشتند نام ببر و آگاهانه از دوش خودت بردار.',
        spokenGuide: 'همدلی عالی است اما مسئولیت حال همه دنیا با تو نیست. سه استرس امروز دیگران را آگاهانه زمین بگذار و نفس عمیق بکش.',
      },
    ],
  },
  {
    id: 'active',
    title: 'پرانرژی، برون‌گرا و عمل‌گرا',
    tagline: 'سرعت عمل بالا و انگیزه جمعی، ولی گاهی عجول در تصمیم‌ها یا فرسودگی از شلوغی.',
    scientificBasis: 'مبتنی بر مکث ۹۰ ثانیه‌ای واکنش عاطفی و تمرین کندسازی آگاهانه (Mindful Pacing).',
    exercises: [
      {
        id: 'act-1',
        title: 'مکث ۹۰ ثانیه‌ای پیش از واکنش',
        durationMin: 2,
        steps: 'وقتی موضوعی کلافه‌ات کرد، قبل از ارسال پیام یا حرف زدن ۹۰ ثانیه صبر کن تا موج هورمون آدرنالین فروکش کند.',
        spokenGuide: 'انرژی و سرعتت فوق‌العاده است، اما در عصبانیت یا عجله نود ثانیه مکث کن. موج اول هورمون استرس در نود ثانیه رد می‌شود و تصمیم درست‌تری می‌گیری.',
      },
      {
        id: 'act-2',
        title: '۱۰ دقیقه سکوت بدون صفحه نمایش',
        durationMin: 5,
        steps: 'موبایل را در اتاق دیگر بگذار و فقط ۵ تا ۱۰ دقیقه بدون محرک بنشین یا چای بخور.',
        spokenGuide: 'یک قهرمان هم به شارژ بی‌صدا نیاز دارد. پنج دقیقه موبایل را کنار بگذار و اجازه بده ذهن پرتحرک تو یک نفس تازه بکشد.',
      },
      {
        id: 'act-3',
        title: 'همگام‌سازی سرعت با همراه',
        durationMin: 3,
        steps: 'امروز در کار مشترک بپرس «دوست داری الان با چه سرعتی پیش بریم؟» و یک کار را هم‌قدم انجام بده.',
        spokenGuide: 'امروز کمی سرعتت را با ریتم همسرت تنظیم کن تا کنار هم بودن به اندازه رسیدن به نتیجه لذت‌بخش باشد.',
      },
    ],
  },
  {
    id: 'calm_leader',
    title: 'درون‌گرا، آرام و تکیه‌گاه',
    tagline: 'ثبات قدم، مسئولیت‌پذیری بالا و تحمل فشار، با خطر ریختن غم و خستگی در خود.',
    scientificBasis: 'مبتنی بر ارتباط بدون خشونت (NVC) و تخلیه ایمن هیجان پیش از انباشتگی.',
    exercises: [
      {
        id: 'cal-1',
        title: 'نام‌گذاری شفاف خستگی قبل از سرریز',
        durationMin: 3,
        steps: 'امتیاز انرژی ۱ تا ۱۰ خودت را الان بگو و یک کار غیرضروری امشب را لغو یا موکول کن.',
        spokenGuide: 'تکیه‌گاه بودن به معنی خسته نشدن نیست. الان با خودت صادق باش و یک کار اضافی امشب را به فردا بسپار.',
      },
      {
        id: 'cal-2',
        title: 'درخواست حمایت کوچک (تمرین اعتماد)',
        durationMin: 3,
        steps: 'یک کار کوچک روزمره که همیشه خودت انجام می‌دهی را محترمانه به همراه بسپار و تشکر کن.',
        spokenGuide: 'اجازه بده همسرت هم در مراقبت از تو شریک شود. امروز یک کار کوچک را بسپار و با لبخند بپذیر.',
      },
      {
        id: 'cal-3',
        title: 'جمله قدردانی صوتی به جای سکوت',
        durationMin: 2,
        steps: 'حس مثبتی که در ذهن داری را بلند و شنیداری بیان کن تا در فضای خانه جاری شود.',
        spokenGuide: 'احساسات قشنگی که در دلت نگه داشته‌ای را امروز به زبان بیاور؛ شنیدن قدردانی تو قلب خانه را گرم‌تر می‌کند.',
      },
    ],
  },
];

