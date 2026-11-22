export type AppTab = 'today' | 'assistant' | 'gratitude' | 'night' | 'voice' | 'caller' | 'sync' | 'family';

export type OwnerRole = 'man' | 'zari' | 'both';

export type DeviceOwner = 'man' | 'zari';

export type GoalCategory = 'purpose' | 'health' | 'relationship' | 'work' | 'growth';

export type GoalScope = 'home' | 'work';

export type TimeBlock = 'morning' | 'afternoon' | 'evening';

export interface GoalItem {
  id: string;
  title: string;
  owner: OwnerRole;
  scope?: GoalScope;
  category: GoalCategory;
  timeBlock: TimeBlock;
  priority: 'high' | 'normal';
  completed: boolean;
  dateKey: string;
  createdAt: number;
  reminderTime?: string;
  reminderVoice?: VoiceName;
}

export interface HabitItem {
  id: string;
  title: string;
  owner: OwnerRole;
  completedDates: string[];
}

export type MoodType = 'energetic' | 'grateful' | 'calm' | 'focused' | 'needs_boost';

export interface GratitudeEntry {
  id: string;
  dateKey: string;
  jalaliDate: string;
  author: OwnerRole;
  mood: MoodType;
  items: [string, string, string];
  loveNote: string;
  createdAt: number;
}

export interface MorningMessage {
  id: string;
  title: string;
  message: string;
  affirmation: string;
  energyTip: string;
  dayPart: 'morning' | 'midday' | 'evening';
  isAiGenerated?: boolean;
}

export type VoiceName = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';

export interface AudioLibraryEntry {
  id: string;
  title: string;
  text: string;
  category: 'morning' | 'gratitude' | 'energy' | 'caller' | 'custom';
  voiceName: VoiceName;
  style: string;
  cachedAt: number;
  byteSize: number;
  source: 'gemini' | 'fallback' | 'offline';
  studioVersion?: number;
}

export interface CallerContact {
  id: string;
  name: string;
  latinAlias?: string;
  persianPhonetic?: string;
  relation: string;
  template: string;
  repeatCount: 1 | 2;
  chimeStyle: 'gentle' | 'classic' | 'chime';
  voiceName: VoiceName;
  favorite: boolean;
}

export type ScheduleTopic = 'morning' | 'goals' | 'gratitude' | 'energy' | 'night_movies' | 'custom';

export interface ScheduledAnnouncement {
  id: string;
  title: string;
  topic: ScheduleTopic;
  time: string; // HH:MM 24h
  enabled: boolean;
  voiceName: VoiceName;
  customText?: string;
  days: 'daily' | 'weekdays' | 'weekends';
  lastTriggeredDate?: string;
}

export type ShoppingCategory = 'grocery' | 'home' | 'health' | 'note';

export interface ShoppingItem {
  id: string;
  title: string;
  note?: string;
  category: ShoppingCategory;
  checked: boolean;
  createdAt: number;
}

export type ExpenseCategory = 'food' | 'bills' | 'transport' | 'health' | 'family' | 'other';
export type ExpenseSplitMode = 'shared' | 'personal' | 'for_partner' | 'settlement';

export interface ExpenseEntry {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  payer: OwnerRole;
  splitMode?: ExpenseSplitMode;
  dateKey: string;
  createdAt: number;
}

export type BillKind = 'installment' | 'bill' | 'vehicle' | 'subscription';
export type BillCycle = 'once' | 'monthly' | 'yearly';

export interface BillReminderItem {
  id: string;
  title: string;
  amount: number;
  kind: BillKind;
  dueDateKey: string;
  cycle: BillCycle;
  paid: boolean;
  note?: string;
  createdAt: number;
}

export type MedicationKind = 'med' | 'appointment';

export interface MedicationItem {
  id: string;
  name: string;
  dosage: string;
  time: string;
  owner: OwnerRole;
  kind: MedicationKind;
  takenDates: string[];
  voiceRemind: boolean;
  enabled: boolean;
  createdAt: number;
}

export type WeekdayId = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export interface MealPlanEntry {
  id: WeekdayId;
  dayLabel: string;
  lunch: string;
  dinner: string;
  ingredients: string;
}

export type VaultCategory = 'bank' | 'home' | 'ids' | 'note';

export interface QuickVaultNote {
  id: string;
  title: string;
  value: string;
  category: VaultCategory;
  owner: OwnerRole;
  createdAt: number;
}

export type PackingTemplateId = 'road' | 'flight' | 'camp' | 'custom';

export interface PackingItem {
  id: string;
  title: string;
  template: PackingTemplateId;
  checked: boolean;
  owner: OwnerRole;
  createdAt: number;
}

export type SpecialEventKind = 'birthday' | 'anniversary' | 'occasion';

export interface SpecialEventItem {
  id: string;
  title: string;
  kind: SpecialEventKind;
  jalaliMonth: number;
  jalaliDay: number;
  jalaliYear?: number;
  owner: OwnerRole;
  note?: string;
  createdAt: number;
}

export interface HomeChoreItem {
  id: string;
  title: string;
  area: string;
  intervalDays: number;
  lastDoneDateKey: string;
  nextDueDateKey: string;
  owner: OwnerRole;
  createdAt: number;
}

export type PersonalityFocusId = 'analytical' | 'creative' | 'sensitive' | 'active' | 'calm_leader';

export type TodaySubSection = 'planner' | 'shopping_meals' | 'finance_bills' | 'health_vault' | 'growth_lab';

export interface AppSettings {
  theme: 'light' | 'dark';
  defaultVoice: VoiceName;
  speechRate: number;
  myName: string;
  partnerName: string;
  assistantName: string;
  assistantWakeWordEnabled: boolean;
  backgroundKeepAlive: boolean;
  announceCalls: boolean;
  announceSms: boolean;
  autoOpenMorning: boolean;
  nightMovieAutoCheck: boolean;
  nightMovieTime: string;
}

export interface LocalVoiceControls {
  /** Master switch for this phone: true = سخنگو خودکار روشن (پیش‌فرض), false = سخنگو خاموش (حالت دستی) */
  masterSpeakerEnabled: boolean;
  autoCallAnnounce: boolean;
  autoSmsAnnounce: boolean;
  autoScheduleAnnounce: boolean;
  autoAssistantSpeak: boolean;
}

export interface SpecialMessageResult {
  title: string;
  text: string;
  shortVersion: string;
  occasion: string;
}

export interface GroundingLink {
  title: string;
  url: string;
}

export interface SyncedPhoneContact {
  name: string;
  phone: string;
  persianPhonetic: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  streamUrl: string;
  durationSec?: number;
  isLiveStream?: boolean;
  country?: string;
  tags?: string;
  source: 'audius' | 'archive' | 'radio';
  externalUrl?: string;
}

export interface NightDiscoveryResponse {
  mode: 'music' | 'movies';
  title: string;
  markdownText: string;
  spokenSummary: string;
  links: GroundingLink[];
  tracks?: MusicTrack[];
  fetchedAt: number;
}

export type AssistantActionType =
  | 'answer'
  | 'web_search'
  | 'download_url'
  | 'open_url'
  | 'open_app'
  | 'close_app'
  | 'accessibility_click'
  | 'accessibility_type'
  | 'accessibility_scroll'
  | 'open_navigation'
  | 'flashlight_on'
  | 'flashlight_off'
  | 'open_wifi_settings'
  | 'open_bluetooth_settings'
  | 'open_mobile_data_settings'
  | 'open_location_settings'
  | 'set_alarm'
  | 'set_timer'
  | 'brightness_up'
  | 'brightness_down'
  | 'brightness_max'
  | 'brightness_min'
  | 'tell_time'
  | 'ask_sms_body'
  | 'send_sms'
  | 'make_call'
  | 'end_call'
  | 'volume_up'
  | 'volume_down'
  | 'volume_max'
  | 'volume_min'
  | 'volume_mute'
  | 'ringer_silent'
  | 'ringer_vibrate'
  | 'ringer_normal'
  | 'take_photo'
  | 'record_video'
  | 'record_audio_start'
  | 'record_audio_stop'
  | 'open_tab'
  | 'play_radio'
  | 'play_music'
  | 'play_podcast'
  | 'stop_audio'
  | 'add_goal'
  | 'add_gratitude'
  | 'add_shopping_item'
  | 'add_expense'
  | 'daily_briefing'
  | 'open_drive_mode'
  | 'daily_english';

export interface AssistantCommandResult {
  action: AssistantActionType;
  replyText: string;
  targetName?: string;
  targetPhone?: string;
  smsBody?: string;
  tab?: AppTab;
  todaySection?: TodaySubSection;
  query?: string;
  goalTitle?: string;
  shoppingItems?: string[];
  expenseTitle?: string;
  expenseAmount?: number;
  expenseCategory?: ExpenseCategory;
  briefingMode?: 'morning' | 'evening';
  downloadUrl?: string;
  downloadTitle?: string;
  alarmHour?: number;
  alarmMinute?: number;
  timerMinutes?: number;
  links?: GroundingLink[];
}
