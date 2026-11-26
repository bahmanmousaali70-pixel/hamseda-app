import type {HamsedaThemeId} from '../types/app';

export interface ThemeMeta {
  id: HamsedaThemeId;
  label: string;
  hint: string;
  isDark: boolean;
  accentColor: string;
  secondaryColor: string;
  bgPreview: string;
}

export const APP_THEMES: ThemeMeta[] = [
  {
    id: 'emerald-pearl',
    label: 'مروارید زمردی',
    hint: 'روشن و اشرافی · زمردی و برنجی',
    isDark: false,
    accentColor: '#0B6B53',
    secondaryColor: '#B48A3E',
    bgPreview: '#F6F7F4',
  },
  {
    id: 'nordic-linen',
    label: 'کتان اسکاندیناوی',
    hint: 'روشن و شفاف · آبی کبالت و کتان',
    isDark: false,
    accentColor: '#1D4ED8',
    secondaryColor: '#0F766E',
    bgPreview: '#F1F5F8',
  },
  {
    id: 'espresso-sand',
    label: 'شنی و اسپرسو',
    hint: 'روشن و گرم · قهوه‌ای و کهربایی',
    isDark: false,
    accentColor: '#7C4A2D',
    secondaryColor: '#B45309',
    bgPreview: '#F6F1EA',
  },
  {
    id: 'velvet-night',
    label: 'شب مخملی',
    hint: 'تیره و آرام · سورمه‌ای عمیق و فیروزه‌ای',
    isDark: true,
    accentColor: '#2DD4BF',
    secondaryColor: '#FBBF24',
    bgPreview: '#0B1117',
  },
  {
    id: 'plum-noir',
    label: 'آلوبخارا شبانه',
    hint: 'تیره و مدرن · یاقوتی تیره و طلایی',
    isDark: true,
    accentColor: '#F472B6',
    secondaryColor: '#FBBF24',
    bgPreview: '#110D16',
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
