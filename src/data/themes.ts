import type {HamsedaThemeId} from '../types/app';

export interface ThemeMeta {
  id: HamsedaThemeId;
  label: string;
  hint: string;
  isDark: boolean;
  accentColor: string;
  secondaryColor: string;
  bgPreview: string;
  themeColorMeta: string;
}

export const APP_THEMES: ThemeMeta[] = [
  {
    id: 'emerald-pearl',
    label: 'زمرد سلطنتی',
    hint: 'روشن · دکمه‌های زمردی و طلایی',
    isDark: false,
    accentColor: '#0B6B53',
    secondaryColor: '#B48A3E',
    bgPreview: '#F4F7F5',
    themeColorMeta: '#0B6B53',
  },
  {
    id: 'nordic-linen',
    label: 'اقیانوس آبی',
    hint: 'روشن · آبی کبالت و فیروزه‌ای شفاف',
    isDark: false,
    accentColor: '#1D4ED8',
    secondaryColor: '#0284C7',
    bgPreview: '#EFF5FB',
    themeColorMeta: '#1D4ED8',
  },
  {
    id: 'espresso-sand',
    label: 'کارامل و قهوه',
    hint: 'روشن و گرم · قهوه‌ای، مسی و کهربایی',
    isDark: false,
    accentColor: '#7C4A2D',
    secondaryColor: '#D97706',
    bgPreview: '#F8F2EA',
    themeColorMeta: '#7C4A2D',
  },
  {
    id: 'rose-sakura',
    label: 'یاقوت و رزگلد',
    hint: 'روشن و لطیف · سرخابی یاقوتی و رزگلد',
    isDark: false,
    accentColor: '#9D174D',
    secondaryColor: '#D97706',
    bgPreview: '#FDF4F6',
    themeColorMeta: '#9D174D',
  },
  {
    id: 'velvet-night',
    label: 'شب فیروزه‌ای',
    hint: 'تیره و مدرن · سرمه‌ای، فیروزه‌ای و طلایی',
    isDark: true,
    accentColor: '#14B8A6',
    secondaryColor: '#FBBF24',
    bgPreview: '#081118',
    themeColorMeta: '#0B151D',
  },
  {
    id: 'plum-noir',
    label: 'کهکشان بنفش',
    hint: 'تیره و خاص · ارغوانی، بنفش و سرخابی',
    isDark: true,
    accentColor: '#9333EA',
    secondaryColor: '#F472B6',
    bgPreview: '#100B18',
    themeColorMeta: '#140D1E',
  },
];

export const DARK_THEME_IDS: ReadonlySet<string> = new Set(
  APP_THEMES.filter((t) => t.isDark).map((t) => t.id)
);

const LEGACY_THEME_MAP: Record<string, HamsedaThemeId> = {
  light: 'emerald-pearl',
  'ivory-champagne': 'espresso-sand',
  'arctic-silver': 'nordic-linen',
  dark: 'velvet-night',
  'obsidian-gold': 'velvet-night',
  'royal-navy': 'velvet-night',
  graphite: 'velvet-night',
  'midnight-purple': 'plum-noir',
};

export function normalizeThemeId(raw: unknown): HamsedaThemeId {
  if (typeof raw === 'string') {
    const found = APP_THEMES.find((t) => t.id === raw);
    if (found) return found.id;
    if (LEGACY_THEME_MAP[raw]) return LEGACY_THEME_MAP[raw];
  }
  return 'emerald-pearl';
}

export function getThemeMeta(id: HamsedaThemeId): ThemeMeta {
  return APP_THEMES.find((t) => t.id === id) ?? APP_THEMES[0];
}
