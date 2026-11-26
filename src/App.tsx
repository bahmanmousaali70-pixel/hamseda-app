import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {WifiOff, X} from 'lucide-react';
import {AssistantView} from './components/AssistantView';
import {CallerAnnouncerView} from './components/CallerAnnouncerView';
import {DriveModeModal} from './components/DriveModeModal';
import {GratitudeView} from './components/GratitudeView';
import {FamilyLifeSuite} from './components/FamilyLifeSuite';
import {advanceDateKey} from './components/LifeToolsView';
import {NightAndMessagesView} from './components/NightAndMessagesView';
import {SyncSettingsView} from './components/SyncSettingsView';
import {TodayView} from './components/TodayView';
import {TopBar} from './components/TopBar';
import {VoiceLibraryView} from './components/VoiceLibraryView';
import {
  addDaysKey,
  DEFAULT_CALLERS,
  DEFAULT_GOALS,
  DEFAULT_GRATITUDES,
  DEFAULT_HABITS,
  DEFAULT_MEAL_PLAN,
  DEFAULT_SCHEDULES,
  formatJalaliFull,
  getDayPart,
  getTodayEnglishPhrases,
  getTodayKey,
  INSTANT_ENERGY_BOOSTERS,
  OFFLINE_MORNING_MESSAGES,
  PACKING_TEMPLATES,
  toPersianDigits,
} from './data/persianLibrary';
import {useBackgroundScheduler} from './hooks/useBackgroundScheduler';
import {useOnlineStatus} from './hooks/usePWAInstall';
import {apiUrl, getCloudApiBaseUrl, safeReadJsonResponse} from './services/apiConfig';
import {
  buildCallerRingtoneWav,
  getAudioClipBuffer,
  hashTextKey,
  listAudioClips,
} from './services/audioLibraryDb';
import {
  deleteBillFromCloud,
  deleteCallerFromCloud,
  deleteExpenseFromCloud,
  deleteGoalFromCloud,
  deleteGratitudeFromCloud,
  deleteHabitFromCloud,
  deleteHomeChoreFromCloud,
  deleteMedicationFromCloud,
  deletePackingFromCloud,
  deleteScheduleFromCloud,
  deleteShoppingFromCloud,
  deleteSpecialEventFromCloud,
  deleteVaultNoteFromCloud,
  ensureUserAndDiscoverSpace,
  joinSpaceByCode,
  pushBillToCloud,
  pushCallerToCloud,
  pushExpenseToCloud,
  pushGoalToCloud,
  pushGratitudeToCloud,
  pushHabitToCloud,
  pushHomeChoreToCloud,
  pushMealPlanToCloud,
  pushMedicationToCloud,
  pushPackingToCloud,
  pushScheduleToCloud,
  pushSettingsToCloud,
  pushShoppingToCloud,
  pushSpecialEventToCloud,
  pushVaultNoteToCloud,
  subscribeToCoupleSpace,
  uploadLocalBundleToSpace,
  type CoupleSpaceInfo,
} from './services/coupleSyncService';
import {buildDailyBriefingText, fetchQuickWeatherBrief} from './services/dailyBriefing';
import {
  auth,
  onAuthStateChanged,
  ensureAnonymousDeviceIdentity,
} from './services/firebaseClient';
import {
  setActiveOfflineEngineNative,
  getNativeCapabilities,
  openAppInfoSettings,
  openXiaomiOtherPermissions,
  precacheNativeWav,
  requestAssistantRoleNative,
  requestNativePermissionsAndMiuiSetup,
  saveLearnedPhoneticsNative,
  saveSmsAnnouncementPolicyNative,
  setDeviceIdentityNative,
  setNativeKeepAliveService,
  syncAnnounceTogglesToNative,
  syncCallersToNative,
  syncSchedulesToNative,
  syncServerBaseUrlToNative,
  type NativeCapabilities,
} from './services/nativeAndroidBridge';
import {
  generateAndCacheGeminiWav,
  getPreferOfflineSpeech,
  getPreferredOfflineEngineId,
  type OfflineEngineId,
  playSoftChime,
  precacheWakePromptNative,
  setPreferOfflineSpeech,
  setPreferredOfflineEngineId,
  speakFluentPersian,
  stopAllSpeech,
  unlockAudioPlayback,
} from './services/speechEngine';
import type {
  AppSettings,
  AppTab,
  AudioLibraryEntry,
  BillReminderItem,
  CallerContact,
  DeviceOwner,
  ExpenseCategory,
  ExpenseEntry,
  GoalItem,
  GratitudeEntry,
  HabitItem,
  HomeChoreItem,
  LocalVoiceControls,
  MealPlanEntry,
  MedicationItem,
  MorningMessage,
  NightDiscoveryResponse,
  OwnerRole,
  PackingItem,
  PackingTemplateId,
  PersonalityFocusId,
  QuickVaultNote,
  ScheduledAnnouncement,
  ShoppingCategory,
  ShoppingItem,
  SpecialEventItem,
  SpecialEventKind,
  SyncedPhoneContact,
  TodaySubSection,
  VoiceName,
} from './types/app';
import {
  adaptTextForDevice,
  getOrderedPairNames,
  getPartnerNameForDevice,
  getSelfName,
  readDeviceOwner,
  readLocalVoiceControls,
  refreshAppShell,
  writeDeviceOwner,
  writeLocalVoiceControls,
} from './utils/deviceIdentity';

const STORAGE_KEYS = {
  goals: 'rmz_goals_v1',
  habits: 'rmz_habits_v1',
  gratitudes: 'rmz_gratitudes_v1',
  callers: 'rmz_callers_v1',
  syncedContacts: 'rmz_synced_contacts_v1',
  settings: 'rmz_settings_v1',
  morningMsg: 'rmz_morning_msg_v1',
  schedules: 'rmz_schedules_v1',
  nightMovies: 'rmz_night_movies_v1',
  nightMusic: 'rmz_night_music_v1',
  triggeredAuto: 'rmz_triggered_auto_v1',
  shopping: 'hamseda_shopping_items_v1',
  expenses: 'hamseda_expenses_v1',
  monthlyBudget: 'hamseda_monthly_budget_v1',
  bills: 'hamseda_bills_v1',
  meds: 'hamseda_meds_v1',
  meals: 'hamseda_meals_v1',
  vault: 'hamseda_vault_v1',
  packing: 'hamseda_packing_v1',
  events: 'hamseda_events_v1',
  chores: 'hamseda_chores_v1',
  englishLearned: 'hamseda_learned_english_v1',
  personalityFocus: 'hamseda_personality_focus_v1',
  personalityDone: 'hamseda_personality_done_v1',
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'ivory-champagne',
  defaultVoice: 'Kore',
  speechRate: 1,
  myName: 'من',
  partnerName: 'همراه',
  assistantName: 'هم‌صدا',
  assistantWakeWordEnabled: false,
  backgroundKeepAlive: false,
  announceCalls: true,
  announceSms: true,
  autoOpenMorning: true,
  nightMovieAutoCheck: true,
  nightMovieTime: '22:00',
};

const VALID_VOICES: VoiceName[] = ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'];

function sanitizeVoiceName(raw: unknown, fallback: VoiceName): VoiceName {
  return typeof raw === 'string' && VALID_VOICES.includes(raw as VoiceName)
    ? (raw as VoiceName)
    : fallback;
}

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [todaySubSection, setTodaySubSection] = useState<TodaySubSection>('planner');
  const [driveModeOpen, setDriveModeOpen] = useState(false);
  const [pendingAssistantQuery, setPendingAssistantQuery] = useState<{text: string; nonce: number} | null>(null);

  const [assistantMediaTrigger, setAssistantMediaTrigger] = useState<{
    tab: 'tracks' | 'radio' | 'podcasts' | 'stop';
    query?: string;
    nonce: number;
  } | null>(null);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = readJsonStorage<Partial<AppSettings>>(STORAGE_KEYS.settings, {});
    const normalizedMyName =
      typeof saved.myName === 'string' && saved.myName.trim() && saved.myName.trim() !== 'مهدی' && saved.myName.trim() !== 'بهمن'
        ? saved.myName.trim()
        : 'من';
    const normalizedPartnerName =
      typeof saved.partnerName === 'string' && saved.partnerName.trim() && saved.partnerName.trim() !== 'زری'
        ? saved.partnerName.trim()
        : 'همراه';
    const normalizedAssistantName =
      typeof saved.assistantName === 'string' && saved.assistantName.trim() && !['بهمن', 'زری', 'آوا'].includes(saved.assistantName.trim())
        ? saved.assistantName.trim()
        : 'هم‌صدا';
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      defaultVoice: sanitizeVoiceName(saved.defaultVoice, DEFAULT_SETTINGS.defaultVoice),
      myName: normalizedMyName,
      partnerName: normalizedPartnerName,
      assistantName: normalizedAssistantName,
    };
  });

  const [goals, setGoals] = useState<GoalItem[]>(() =>
    readJsonStorage<GoalItem[]>(STORAGE_KEYS.goals, DEFAULT_GOALS)
  );
  const [habits, setHabits] = useState<HabitItem[]>(() =>
    readJsonStorage<HabitItem[]>(STORAGE_KEYS.habits, DEFAULT_HABITS)
  );
  const [gratitudes, setGratitudes] = useState<GratitudeEntry[]>(() =>
    readJsonStorage<GratitudeEntry[]>(STORAGE_KEYS.gratitudes, DEFAULT_GRATITUDES)
  );
  const [callers, setCallers] = useState<CallerContact[]>(() =>
    readJsonStorage<CallerContact[]>(STORAGE_KEYS.callers, DEFAULT_CALLERS)
  );
  const [syncedContacts, setSyncedContacts] = useState<SyncedPhoneContact[]>(() =>
    readJsonStorage<SyncedPhoneContact[]>(STORAGE_KEYS.syncedContacts, [])
  );
  const [schedules, setSchedules] = useState<ScheduledAnnouncement[]>(() =>
    readJsonStorage<ScheduledAnnouncement[]>(STORAGE_KEYS.schedules, DEFAULT_SCHEDULES)
  );
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>(() =>
    readJsonStorage<ShoppingItem[]>(STORAGE_KEYS.shopping, [])
  );
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(() =>
    readJsonStorage<ExpenseEntry[]>(STORAGE_KEYS.expenses, [])
  );
  const [monthlyBudget, setMonthlyBudget] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.monthlyBudget);
      const num = Number(raw);
      return Number.isFinite(num) && num > 0 ? num : 0;
    } catch {
      return 0;
    }
  });
  const [bills, setBills] = useState<BillReminderItem[]>(() =>
    readJsonStorage<BillReminderItem[]>(STORAGE_KEYS.bills, [])
  );
  const [meds, setMeds] = useState<MedicationItem[]>(() =>
    readJsonStorage<MedicationItem[]>(STORAGE_KEYS.meds, [])
  );
  const [meals, setMeals] = useState<MealPlanEntry[]>(() => {
    const saved = readJsonStorage<MealPlanEntry[]>(STORAGE_KEYS.meals, []);
    if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_MEAL_PLAN;
    return DEFAULT_MEAL_PLAN.map((def) => saved.find((s) => s.id === def.id) ?? def);
  });
  const [vaultNotes, setVaultNotes] = useState<QuickVaultNote[]>(() =>
    readJsonStorage<QuickVaultNote[]>(STORAGE_KEYS.vault, [])
  );
  const [packingItems, setPackingItems] = useState<PackingItem[]>(() =>
    readJsonStorage<PackingItem[]>(STORAGE_KEYS.packing, [])
  );
  const [specialEvents, setSpecialEvents] = useState<SpecialEventItem[]>(() =>
    readJsonStorage<SpecialEventItem[]>(STORAGE_KEYS.events, [])
  );
  const [homeChores, setHomeChores] = useState<HomeChoreItem[]>(() =>
    readJsonStorage<HomeChoreItem[]>(STORAGE_KEYS.chores, [])
  );
  const [learnedEnglishIds, setLearnedEnglishIds] = useState<string[]>(() =>
    readJsonStorage<string[]>(STORAGE_KEYS.englishLearned, [])
  );
  const [personalityFocus, setPersonalityFocus] = useState<PersonalityFocusId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.personalityFocus);
      if (saved === 'analytical' || saved === 'creative' || saved === 'sensitive' || saved === 'active' || saved === 'calm_leader') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'analytical';
  });
  const [completedExercisesState, setCompletedExercisesState] = useState<{dateKey: string; ids: string[]}>(() => {
    const saved = readJsonStorage<{dateKey?: string; ids?: string[]} | null>(STORAGE_KEYS.personalityDone, null);
    const tk = getTodayKey();
    if (saved && saved.dateKey === tk && Array.isArray(saved.ids)) {
      return {dateKey: tk, ids: saved.ids};
    }
    return {dateKey: tk, ids: []};
  });
  const [nightMessagePrefill, setNightMessagePrefill] = useState<{
    occasion?: 'birthday' | 'anniversary' | 'apology' | 'thanks' | 'encouragement' | 'custom';
    recipient?: string;
    details?: string;
    nonce: number;
  } | null>(null);

  const [morningMessage, setMorningMessage] = useState<MorningMessage>(() => {
    const saved = readJsonStorage<MorningMessage | null>(STORAGE_KEYS.morningMsg, null);
    if (saved) return saved;
    const part = getDayPart();
    return OFFLINE_MORNING_MESSAGES.find((m) => m.dayPart === part) ?? OFFLINE_MORNING_MESSAGES[0];
  });

  const [nightMoviesResult, setNightMoviesResult] = useState<NightDiscoveryResponse | null>(() =>
    readJsonStorage<NightDiscoveryResponse | null>(STORAGE_KEYS.nightMovies, null)
  );
  const [nightMusicResult, setNightMusicResult] = useState<NightDiscoveryResponse | null>(() =>
    readJsonStorage<NightDiscoveryResponse | null>(STORAGE_KEYS.nightMusic, null)
  );
  const [triggeredAutoMap, setTriggeredAutoMap] = useState<Record<string, string>>(() =>
    readJsonStorage<Record<string, string>>(STORAGE_KEYS.triggeredAuto, {})
  );

  const [audioClips, setAudioClips] = useState<AudioLibraryEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSourceLabel, setSpeechSourceLabel] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Cloud Sync state
  const [deviceUid, setCloudUserEmail] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [spaceInfo, setSpaceInfo] = useState<CoupleSpaceInfo | null>(null);

  // Native Android state
  const [nativeCaps, setNativeCaps] = useState<NativeCapabilities>({
    isNative: false,
    assistantRoleAvailable: false,
    assistantRoleHeld: false,
    phoneState: false,
    callLog: false,
    contacts: false,
    sms: false,
    notificationListener: false,
    notifications: false,
    batteryIgnored: false,
    overlay: false,
    keepAliveRunning: false,
    exactAlarm: false,
  });

  const [deviceOwner, setDeviceOwner] = useState<DeviceOwner>(() => readDeviceOwner());
  const [localVoiceControls, setLocalVoiceControls] = useState<LocalVoiceControls>(() =>
    readLocalVoiceControls()
  );
  const [preferOfflineSpeech, setPreferOfflineSpeechState] = useState<boolean>(() =>
    getPreferOfflineSpeech()
  );
  const [preferredOfflineEngine, setPreferredOfflineEngineState] = useState<OfflineEngineId>(() =>
    getPreferredOfflineEngineId()
  );
  const [pocketPrecacheNonce, setPocketPrecacheNonce] = useState(0);

  const selfName = useMemo(() => getSelfName(settings, deviceOwner), [settings, deviceOwner]);
  const orderedPairNames = useMemo(
    () => getOrderedPairNames(settings, deviceOwner),
    [settings, deviceOwner]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const handleChangeDeviceOwner = useCallback(
    (owner: DeviceOwner) => {
      setDeviceOwner(owner);
      writeDeviceOwner(owner);
      showToast(
        owner === 'zari'
          ? 'هویت این گوشی برای کاربر دوم ذخیره شد.'
          : 'هویت این گوشی برای کاربر اول ذخیره شد.'
      );
    },
    [showToast]
  );

  const handleUpdateLocalVoiceControls = useCallback(
    (patch: Partial<LocalVoiceControls>) => {
      setLocalVoiceControls((prev) => {
        const next = {...prev, ...patch};
        writeLocalVoiceControls(next);
        if (!next.masterSpeakerEnabled) {
          stopAllSpeech();
          setIsSpeaking(false);
        }
        return next;
      });
    },
    []
  );

  const handleToggleMasterSpeaker = useCallback(() => {
    setLocalVoiceControls((prev) => {
      const nextEnabled = !prev.masterSpeakerEnabled;
      const next = {...prev, masterSpeakerEnabled: nextEnabled};
      writeLocalVoiceControls(next);
      if (!nextEnabled) {
        stopAllSpeech();
        setIsSpeaking(false);
        showToast(
          `سخنگوی خودکار روی گوشی ${getSelfName(settings, deviceOwner)} خاموش شد (حالت دستی فعال است).`
        );
      } else {
        showToast(`سخنگوی خودکار روی گوشی ${getSelfName(settings, deviceOwner)} دوباره روشن شد.`);
      }
      return next;
    });
  }, [deviceOwner, settings, showToast]);

  const handleRefreshApp = useCallback(() => {
    showToast('در حال بروزرسانی برنامه...');
    void refreshAppShell();
  }, [showToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleChangePreferOfflineSpeech = useCallback((enabled: boolean) => {
    setPreferOfflineSpeech(enabled);
    setPreferOfflineSpeechState(enabled);
  }, []);

  const handleChangePreferredOfflineEngine = useCallback((engineId: OfflineEngineId) => {
    setPreferredOfflineEngineId(engineId);
    setPreferredOfflineEngineState(engineId);
    if (engineId !== 'pocket_farsi') {
      void setActiveOfflineEngineNative(engineId);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    const darkThemes = ['dark', 'obsidian-gold', 'royal-navy', 'midnight-purple', 'graphite'];
    root.classList.toggle('dark', darkThemes.includes(settings.theme));
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    syncAnnounceTogglesToNative({
      announceCalls:
        settings.announceCalls &&
        localVoiceControls.masterSpeakerEnabled &&
        localVoiceControls.autoCallAnnounce,
      announceSms:
        settings.announceSms &&
        localVoiceControls.masterSpeakerEnabled &&
        localVoiceControls.autoSmsAnnounce,
      announceSchedules:
        localVoiceControls.masterSpeakerEnabled && localVoiceControls.autoScheduleAnnounce,
      autoOpenMorning: settings.autoOpenMorning,
      defaultVoice: settings.defaultVoice,
      preferOfflineSpeech,
      preferredOfflineEngine,
      speechRate: settings.speechRate,
    });
  }, [settings, localVoiceControls, preferOfflineSpeech, preferredOfflineEngine]);

  useEffect(() => {
    if (!nativeCaps.isNative) return;
    void precacheWakePromptNative({
      defaultVoice: settings.defaultVoice,
      isOnline,
      preferOfflineSpeech,
      preferredOffline: preferredOfflineEngine,
      forcePocketRefresh: pocketPrecacheNonce > 0,
    });
  }, [
    nativeCaps.isNative,
    settings.defaultVoice,
    isOnline,
    preferOfflineSpeech,
    preferredOfflineEngine,
    pocketPrecacheNonce,
  ]);

  useEffect(() => {
    setDeviceIdentityNative({
      deviceOwner,
      selfName: getSelfName(settings, deviceOwner),
      partnerName: getPartnerNameForDevice(settings, deviceOwner),
      assistantName: settings.assistantName?.trim() || 'هم‌صدا',
    });
  }, [deviceOwner, settings.myName, settings.partnerName, settings.assistantName]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.goals, JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.habits, JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.gratitudes, JSON.stringify(gratitudes));
  }, [gratitudes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.callers, JSON.stringify(callers));
    syncCallersToNative(callers);
    callers.forEach((c) => {
      const names = c.persianPhonetic?.trim()
        ? Array.from(new Set([c.name, c.persianPhonetic.trim()]))
        : [c.name];
      names.forEach((n) => {
        const script = c.template.replace('{name}', n);
        const id = hashTextKey(script, c.voiceName);
        getAudioClipBuffer(id)
          .then((buf) => {
            if (buf) precacheNativeWav(script, c.voiceName, buf);
          })
          .catch(() => {});
      });
    });
  }, [callers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.syncedContacts, JSON.stringify(syncedContacts));
    if (syncedContacts.length > 0) {
      const map: Record<string, string> = {};
      for (const c of syncedContacts) {
        if (c.name.trim() && c.persianPhonetic.trim()) {
          map[c.name.trim().toLowerCase()] = c.persianPhonetic.trim();
        }
      }
      saveLearnedPhoneticsNative(map);
    }
  }, [syncedContacts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.morningMsg, JSON.stringify(morningMessage));
  }, [morningMessage]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.schedules, JSON.stringify(schedules));
  }, [schedules]);

  useEffect(() => {
    if (nightMoviesResult) localStorage.setItem(STORAGE_KEYS.nightMovies, JSON.stringify(nightMoviesResult));
  }, [nightMoviesResult]);

  useEffect(() => {
    if (nightMusicResult) localStorage.setItem(STORAGE_KEYS.nightMusic, JSON.stringify(nightMusicResult));
  }, [nightMusicResult]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.triggeredAuto, JSON.stringify(triggeredAutoMap));
  }, [triggeredAutoMap]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.shopping, JSON.stringify(shoppingItems));
  }, [shoppingItems]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.monthlyBudget, String(monthlyBudget));
  }, [monthlyBudget]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.bills, JSON.stringify(bills));
  }, [bills]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.meds, JSON.stringify(meds));
  }, [meds]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.meals, JSON.stringify(meals));
  }, [meals]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.vault, JSON.stringify(vaultNotes));
  }, [vaultNotes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.packing, JSON.stringify(packingItems));
  }, [packingItems]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(specialEvents));
  }, [specialEvents]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.chores, JSON.stringify(homeChores));
  }, [homeChores]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.englishLearned, JSON.stringify(learnedEnglishIds));
  }, [learnedEnglishIds]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.personalityFocus, personalityFocus);
  }, [personalityFocus]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.personalityDone, JSON.stringify(completedExercisesState));
  }, [completedExercisesState]);

  // Check native Android capabilities and sync server URL + default bank SMS privacy policy
  useEffect(() => {
    getNativeCapabilities().then((caps) => {
      setNativeCaps(caps);
      if (caps.isNative && localStorage.getItem('rmz_sms_policy_synced_v2') !== '1') {
        void saveSmsAnnouncementPolicyNative({
          blockedSenders: localStorage.getItem('rmz_sms_blocked_senders') ?? '',
          blockedKeywords: localStorage.getItem('rmz_sms_blocked_keywords') ?? 'تبریک برنده شدید\nجایزه رایگان\nخرید شارژ\nوام فوری',
          importantSenders: localStorage.getItem('rmz_sms_important_senders') ?? '',
          quietHours: Number(localStorage.getItem('rmz_sms_quiet_hours') ?? '0'),
          summarize: localStorage.getItem('rmz_sms_summarize') !== 'false',
          filterOperatorPromotions: localStorage.getItem('rmz_sms_filter_operator_promotions') !== 'false',
          skipBankAndOtp: localStorage.getItem('rmz_sms_skip_bank_and_otp') !== 'false',
        }).then((ok) => {
          if (ok) localStorage.setItem('rmz_sms_policy_synced_v2', '1');
        });
      }
    });
    syncServerBaseUrlToNative(getCloudApiBaseUrl());
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        getNativeCapabilities().then(setNativeCaps);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Firebase Auth listener + automatic space discovery & real-time sync
  useEffect(() => {
    let unsubSpace: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubSpace) {
        unsubSpace();
        unsubSpace = null;
      }

      if (!user) {
        setCloudUserEmail(null);
        setSpaceInfo(null);
        setCloudBusy(true);
        void ensureAnonymousDeviceIdentity().catch((err) => {
          console.warn('Anonymous device identity setup failed:', err);
          showToast('اتصال همگام‌سازی آماده نشد؛ اطلاعات این گوشی محلی باقی می‌ماند.');
          setCloudBusy(false);
        });
        return;
      }

      setCloudUserEmail(user.uid);
      setCloudBusy(true);
      try {
        const discovered = await ensureUserAndDiscoverSpace(user);
        setSpaceInfo(discovered);
        unsubSpace = subscribeToCoupleSpace(discovered.spaceId, {
          onGoals: (cloudGoals) => setGoals(cloudGoals),
          onHabits: (cloudHabits) => setHabits(cloudHabits),
          onGratitudes: (cloudGratitudes) => setGratitudes(cloudGratitudes),
          onCallers: (cloudCallers) => setCallers(cloudCallers),
          onSchedules: (cloudSchedules) => setSchedules(cloudSchedules),
          onShopping: (cloudShopping) => setShoppingItems(cloudShopping),
          onExpenses: (cloudExpenses) => setExpenses(cloudExpenses),
          onBills: (cloudBills) => setBills(cloudBills),
          onMeds: (cloudMeds) => setMeds(cloudMeds),
          onMeals: (cloudMeals) =>
            setMeals(DEFAULT_MEAL_PLAN.map((def) => cloudMeals.find((cm) => cm.id === def.id) ?? def)),
          onVault: (cloudVault) => setVaultNotes(cloudVault),
          onPacking: (cloudPacking) => setPackingItems(cloudPacking),
          onEvents: (cloudEvents) => setSpecialEvents(cloudEvents),
          onChores: (cloudChores) => setHomeChores(cloudChores),
          onSettings: (cloudSettings) =>
            setSettings((prev) => ({
              ...DEFAULT_SETTINGS,
              ...prev,
              ...cloudSettings,
              defaultVoice: sanitizeVoiceName(cloudSettings.defaultVoice, prev.defaultVoice),
              myName: cloudSettings.myName === 'مهدی' || cloudSettings.myName === 'بهمن' ? 'من' : cloudSettings.myName || 'من',
              partnerName: cloudSettings.partnerName === 'زری' ? 'همراه' : cloudSettings.partnerName || prev.partnerName || 'همراه',
              assistantName: cloudSettings.assistantName?.trim() && !['بهمن', 'زری', 'آوا'].includes(cloudSettings.assistantName.trim()) ? cloudSettings.assistantName.trim() : 'هم‌صدا',
            })),
          onError: (msg) => console.warn('Cloud sync listener notice:', msg),
        });
      } catch (err) {
        console.warn('Cloud discovery error:', err);
        showToast('ورود انجام شد، اما بارگذاری فضای مشترک ابری با تاخیر مواجه شد؛ داده‌های گوشی شما فعال هستند.');
      } finally {
        setCloudBusy(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubSpace) unsubSpace();
    };
  }, [showToast]);

  const refreshClips = useCallback(async () => {
    try {
      const items = await listAudioClips();
      setAudioClips(items);
    } catch {
      // IndexedDB unavailable fallback
    }
  }, []);

  useEffect(() => {
    refreshClips();
  }, [refreshClips]);

  const handleSpeakText = useCallback(
    async (text: string, title: string, category: AudioLibraryEntry['category']) => {
      setIsSpeaking(true);
      setSpeechSourceLabel('در حال آماده‌سازی صدای روان فارسی...');
      await speakFluentPersian({
        text,
        title,
        category,
        voiceName: settings.defaultVoice,
        rate: settings.speechRate,
        onLoading: () => setSpeechSourceLabel('در حال اتصال به جریان صدای روان فارسی...'),
        onStart: (src) => {
          if (src === 'cache') setSpeechSourceLabel('پخش فوری از کتابخانه آفلاین');
          else if (src === 'gemini') setSpeechSourceLabel('پخش زنده صدای روان فارسی (ذخیره برای آفلاین)');
          else if (src === 'neural-fallback')
            setSpeechSourceLabel('صدای کمکی موقت (سهمیه استودیویی امروز پر شده)');
          else setSpeechSourceLabel('پخش با موتور گفتار آفلاین');
        },
        onEnd: () => {
          setIsSpeaking(false);
          refreshClips();
        },
        onError: (msg) => {
          setIsSpeaking(false);
          setSpeechSourceLabel('');
          showToast(msg);
        },
      });
    },
    [settings.defaultVoice, settings.speechRate, refreshClips, showToast]
  );

  const handleStopSpeech = useCallback(() => {
    stopAllSpeech();
    setIsSpeaking(false);
  }, []);

  const buildScheduleText = useCallback(
    (schedule: ScheduledAnnouncement): string => {
      if (schedule.topic === 'custom' && schedule.customText?.trim()) {
        return adaptTextForDevice(schedule.customText.trim(), settings, deviceOwner);
      }
      if (schedule.topic === 'night_movies') {
        return `وقت پیشنهاد فیلم و سریال دوبله امشب برای ${orderedPairNames} رسید! در تب شبانه و پیام‌ساز می‌توانید لیست آثار امتیاز بالا را ببینید.`;
      }
      if (schedule.topic === 'morning') {
        const morningPool = OFFLINE_MORNING_MESSAGES.filter((m) => m.dayPart === 'morning');
        const msg = morningMessage.dayPart === 'morning' ? morningMessage : (morningPool[0] ?? morningMessage);
        const rawText = `سلام ${orderedPairNames}! ${msg.title}. ${msg.message} ${msg.affirmation}`;
        return adaptTextForDevice(rawText, settings, deviceOwner);
      }
      if (schedule.topic === 'goals') {
        const pending = goals.filter((g) => g.dateKey === getTodayKey() && !g.completed);
        if (pending.length === 0) {
          return `آفرین ${orderedPairNames}! تمام هدف‌های ثبت‌شده امروز را انجام دادید. وقت استراحت و شکرگذاری است.`;
        }
        const topTitles = pending
          .slice(0, 3)
          .map((g, idx) => `هدف ${idx + 1}: ${g.title}`)
          .join('. ');
        return `مرور هدف‌های امروز برای ${orderedPairNames}. ${topTitles}. با آرامش و تمرکز پیش بروید.`;
      }
      if (schedule.topic === 'gratitude') {
        const latest = gratitudes[0];
        if (latest) {
          return adaptTextForDevice(
            `وقت شکرگذاری و آرامش است. نمونه شکرگذاری امروز: ${latest.items[0]}. ${latest.loveNote || ''}`.trim(),
            settings,
            deviceOwner
          );
        }
        return `وقت شکرگذاری شبانه برای ${orderedPairNames}. امروز بابت چه نعمتی سپاسگزارید؟`;
      }
      const booster = INSTANT_ENERGY_BOOSTERS[new Date().getDate() % INSTANT_ENERGY_BOOSTERS.length];
      return adaptTextForDevice(`${booster.title}. ${booster.text}`, settings, deviceOwner);
    },
    [deviceOwner, goals, gratitudes, morningMessage, orderedPairNames, settings]
  );

  // Merge manual schedules + today's goal-specific reminders + nightly auto movie alert
  const effectiveSchedules = useMemo<ScheduledAnnouncement[]>(() => {
    const today = getTodayKey();
    const goalSchedules: ScheduledAnnouncement[] = goals
      .filter((g) => g.dateKey === today && !g.completed && g.reminderTime && /^\d{2}:\d{2}$/.test(g.reminderTime))
      .map((g) => {
        const id = `goal-rem-${g.id}`;
        const scopeWord = g.scope === 'work' ? 'کاری' : 'خانه';
        const cleanMyName = settings.myName.trim() || 'من';
        const cleanPartnerName = settings.partnerName.trim() || 'همراه';
        const ownerWord =
          g.owner === 'man'
            ? cleanMyName
            : g.owner === 'zari'
              ? cleanPartnerName
              : `${cleanMyName} و ${cleanPartnerName}`;
        return {
          id,
          title: `یادآور برنامه ${scopeWord}: ${g.title}`,
          topic: 'custom',
          time: g.reminderTime!,
          enabled: true,
          voiceName: g.reminderVoice ?? settings.defaultVoice,
          customText: `یادآور برنامه برای ${ownerWord}: ${g.title}`,
          days: 'daily',
          lastTriggeredDate: triggeredAutoMap[id],
        };
      });

    const medSchedules: ScheduledAnnouncement[] = meds
      .filter((m) => m.enabled && m.voiceRemind && /^\d{2}:\d{2}$/.test(m.time))
      .map((m) => {
        const id = `med-rem-${m.id}`;
        const cleanMyName = settings.myName.trim() || 'من';
        const cleanPartnerName = settings.partnerName.trim() || 'همراه';
        const ownerWord =
          m.owner === 'man'
            ? cleanMyName
            : m.owner === 'zari'
              ? cleanPartnerName
              : `${cleanMyName} و ${cleanPartnerName}`;
        return {
          id,
          title: `${m.kind === 'appointment' ? 'نوبت پزشک' : 'یادآور دارو'}: ${m.name}`,
          topic: 'custom',
          time: m.time,
          enabled: true,
          voiceName: settings.defaultVoice,
          customText: `یادآور سلامت برای ${ownerWord}: وقت ${m.name}${m.dosage ? ` (${m.dosage})` : ''} است.`,
          days: 'daily',
          lastTriggeredDate: triggeredAutoMap[id],
        };
      });

    const extras: ScheduledAnnouncement[] = [];
    if (settings.nightMovieAutoCheck && /^\d{2}:\d{2}$/.test(settings.nightMovieTime)) {
      const id = 'auto-night-movies';
      extras.push({
        id,
        title: 'پیشنهاد خودکار فیلم و سریال دوبله امشب',
        topic: 'night_movies',
        time: settings.nightMovieTime,
        enabled: true,
        voiceName: settings.defaultVoice,
        days: 'daily',
        lastTriggeredDate: triggeredAutoMap[id],
      });
    }

    return [...schedules, ...goalSchedules, ...medSchedules, ...extras];
  }, [
    goals,
    meds,
    schedules,
    settings.defaultVoice,
    settings.myName,
    settings.nightMovieAutoCheck,
    settings.nightMovieTime,
    settings.partnerName,
    triggeredAutoMap,
  ]);

  // Sync all schedules (including goal reminders & nightly check) down to native Android AlarmManager
  useEffect(() => {
    syncSchedulesToNative(effectiveSchedules, buildScheduleText, settings.autoOpenMorning);
  }, [effectiveSchedules, buildScheduleText, settings.autoOpenMorning]);

  const showNotifRef = useRef<(title: string, body: string, scheduleId: string) => Promise<void>>(
    async () => {}
  );

  const handleMarkTriggered = useCallback(
    (scheduleId: string, dateKey: string) => {
      if (scheduleId.startsWith('goal-rem-') || scheduleId.startsWith('med-rem-') || scheduleId === 'auto-night-movies') {
        setTriggeredAutoMap((prev) => ({...prev, [scheduleId]: dateKey}));
        return;
      }
      setSchedules((prev) => {
        const updated = prev.map((s) =>
          s.id === scheduleId ? {...s, lastTriggeredDate: dateKey} : s
        );
        const target = updated.find((s) => s.id === scheduleId);
        if (target && spaceInfo) {
          pushScheduleToCloud(spaceInfo.spaceId, target).catch(() => {});
        }
        return updated;
      });
    },
    [spaceInfo]
  );

  const handleTriggerSchedule = useCallback(
    async (schedule: ScheduledAnnouncement, isManualTest = false) => {
      stopAllSpeech();
      if (isManualTest) {
        unlockAudioPlayback();
      }
      let text = buildScheduleText(schedule);

      if (schedule.topic === 'night_movies' && isOnline) {
        try {
          const res = await fetch(apiUrl('/api/night-discover'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              mode: 'movies',
              mediaType: 'both',
              moodOrGenre: 'پیشنهادهای برتر امشب با امتیاز IMDb بالای ۷.۵ و دوبله فارسی',
            }),
          });
          if (res.ok) {
            const parsed = await safeReadJsonResponse<NightDiscoveryResponse>(res);
            if (!parsed.isHtml && parsed.data) {
              setNightMoviesResult(parsed.data);
              if (parsed.data.spokenSummary) {
                text = `پیشنهاد فیلم و سریال دوبله امشب: ${parsed.data.spokenSummary}`;
              }
            }
          }
        } catch {
          // keep fallback text if network fails
        }
      }

      const category: AudioLibraryEntry['category'] =
        schedule.topic === 'morning'
          ? 'morning'
          : schedule.topic === 'gratitude'
            ? 'gratitude'
            : schedule.topic === 'energy'
              ? 'energy'
              : 'custom';

      showToast(`اعلام زمان‌بندی: ${schedule.title}`);
      await showNotifRef.current(schedule.title, text, schedule.id);

      const canAutoSpeakSchedule =
        isManualTest ||
        (localVoiceControls.masterSpeakerEnabled && localVoiceControls.autoScheduleAnnounce);
      if (!canAutoSpeakSchedule) {
        return;
      }

      await playSoftChime('chime');

      setIsSpeaking(true);
      setSpeechSourceLabel(`پخش زمان‌بندی: ${schedule.title}`);
      await speakFluentPersian({
        text,
        title: schedule.title,
        category,
        voiceName: schedule.voiceName,
        rate: settings.speechRate,
        onStart: (src) => {
          if (src === 'cache') setSpeechSourceLabel('پخش زمان‌بندی از کتابخانه آفلاین');
          else if (src === 'gemini') setSpeechSourceLabel('پخش زمان‌بندی با صدای روان فارسی');
          else if (src === 'neural-fallback')
            setSpeechSourceLabel('پخش زمان‌بندی با صدای کمکی (محدودیت سهمیه)');
          else setSpeechSourceLabel('پخش زمان‌بندی با موتور گفتار آفلاین');
        },
        onEnd: () => {
          setIsSpeaking(false);
          refreshClips();
        },
        onError: (msg) => {
          setIsSpeaking(false);
          setSpeechSourceLabel('');
          showToast(msg);
        },
      });
    },
    [
      buildScheduleText,
      isOnline,
      localVoiceControls.autoScheduleAnnounce,
      localVoiceControls.masterSpeakerEnabled,
      refreshClips,
      settings.speechRate,
      showToast,
    ]
  );

  const {
    notifPermission,
    keepAliveActive,
    requestNotificationPermission,
    showSystemNotification,
  } = useBackgroundScheduler({
    schedules: effectiveSchedules,
    keepAliveEnabled: settings.backgroundKeepAlive,
    onTriggerSchedule: handleTriggerSchedule,
    onMarkTriggered: handleMarkTriggered,
    onStatusToast: showToast,
  });

  showNotifRef.current = showSystemNotification;

  const handleUpdateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = {...prev, ...patch};
        if (spaceInfo) {
          pushSettingsToCloud(spaceInfo.spaceId, next).catch(() => {});
        }
        return next;
      });
    },
    [spaceInfo]
  );

  const handleToggleKeepAlive = useCallback(
    async (enabled: boolean) => {
      unlockAudioPlayback();
      handleUpdateSettings({backgroundKeepAlive: enabled});
      if (nativeCaps.isNative) {
        const running = await setNativeKeepAliveService(enabled);
        setNativeCaps((prev) => ({...prev, keepAliveRunning: running}));
      }
      showToast(
        enabled
          ? 'اجرای دائمی پس‌زمینه فعال شد. پیام‌ها و تماس‌ها به‌صورت خودکار اعلام می‌شوند.'
          : 'نگهدارنده پس‌زمینه غیرفعال شد.'
      );
    },
    [handleUpdateSettings, nativeCaps.isNative, showToast]
  );

  const handleAddSchedule = useCallback(
    (item: Omit<ScheduledAnnouncement, 'id'>) => {
      const created: ScheduledAnnouncement = {...item, id: `sch-${Date.now()}`};
      setSchedules((prev) => [created, ...prev]);
      if (spaceInfo) {
        pushScheduleToCloud(spaceInfo.spaceId, created).catch(() => {});
      }
    },
    [spaceInfo]
  );

  const handleToggleSchedule = useCallback(
    (id: string) => {
      setSchedules((prev) => {
        const next = prev.map((s) => (s.id === id ? {...s, enabled: !s.enabled} : s));
        const target = next.find((s) => s.id === id);
        if (target && spaceInfo) {
          pushScheduleToCloud(spaceInfo.spaceId, target).catch(() => {});
        }
        return next;
      });
    },
    [spaceInfo]
  );

  const handleUpdateSchedule = useCallback(
    (id: string, patch: Partial<ScheduledAnnouncement>) => {
      setSchedules((prev) => {
        const next = prev.map((s) => (s.id === id ? {...s, ...patch} : s));
        const target = next.find((s) => s.id === id);
        if (target && spaceInfo) {
          pushScheduleToCloud(spaceInfo.spaceId, target).catch(() => {});
        }
        return next;
      });
    },
    [spaceInfo]
  );

  const handleDeleteSchedule = useCallback(
    (id: string) => {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      if (spaceInfo) {
        deleteScheduleFromCloud(spaceInfo.spaceId, id).catch(() => {});
      }
    },
    [spaceInfo]
  );

  const handleDownloadScheduleAlarm = useCallback(
    async (schedule: ScheduledAnnouncement) => {
      const text = buildScheduleText(schedule);
      const clipId = hashTextKey(text, schedule.voiceName);
      let wavBuffer = await getAudioClipBuffer(clipId);

      if (!wavBuffer && isOnline) {
        try {
          const res = await generateAndCacheGeminiWav({
            text,
            title: schedule.title,
            category: 'morning',
            voiceName: schedule.voiceName,
            clipId,
          });
          if ('buffer' in res) {
            wavBuffer = res.buffer;
            refreshClips();
          }
        } catch {
          // Fall back to chime-only WAV if online generation fails
        }
      }

      const blob = await buildCallerRingtoneWav(wavBuffer, 'chime', 1);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alarm-${schedule.topic}-${schedule.time.replace(':', '-')}.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showToast(
        wavBuffer
          ? 'فایل زنگ صوتی فارسی (.wav) ساخته و دانلود شد؛ می‌توانید آن را در ساعت گوشی شیائومی تنظیم کنید.'
          : 'فایل زنگ ملودی (.wav) دانلود شد (به دلیل محدودیت سهمیه سرور/آفلاین بودن، نسخه ملودی ساخته شد).'
      );
    },
    [buildScheduleText, isOnline, refreshClips, showToast]
  );

  const handleJoinSpaceByCode = async (spaceCode: string) => {
    if (!auth.currentUser) return;
    setCloudBusy(true);
    try {
      const joined = await joinSpaceByCode(spaceCode, auth.currentUser);
      setSpaceInfo(joined);
      showToast('به فضای مشترک متصل شدید! داده‌ها به‌صورت لحظه‌ای همگام می‌شوند.');
      // Reboot the auth listener so it subscribes to the newly selected shared space.
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'امکان اتصال با این کد وجود نداشت.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handlePushLocalToCloud = async () => {
    if (!spaceInfo) return;
    setCloudBusy(true);
    try {
      await uploadLocalBundleToSpace(spaceInfo.spaceId, {
        goals,
        habits,
        gratitudes,
        callers,
        schedules,
        settings,
        shoppingItems,
        expenses,
        bills,
        meds,
        meals,
        vaultNotes,
        packingItems,
        specialEvents,
        homeChores,
      });
      showToast('تمام داده‌ها و تنظیمات این گوشی به فضای مشترک ارسال شد.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ارسال به ابر');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleRequestNativePermissions = async () => {
    // Ask for the system Assistant role first. SMS and Call Log permissions are
    // requested only after the user explicitly accepts this Android role.
    const role = await requestAssistantRoleNative();
    if (role?.available && !role.held) {
      showToast(role.message || 'برای فعال‌سازی پیامک و گزارش تماس، ابتدا هم‌صدا را به‌عنوان دستیار پیش‌فرض انتخاب کنید.');
      return;
    }
    const updated = await requestNativePermissionsAndMiuiSetup();
    if (updated) {
      setNativeCaps(updated);
      if (role && !role.available) {
        showToast('این دستگاه نقش دستیار پیش‌فرض را ارائه نمی‌کند؛ مجوزهای پیامک و گزارش تماس درخواست نشدند.');
      } else {
        showToast('نقش دستیار و درخواست مجوزهای مجاز انجام شد. انتخاب نقش و مجوزها در اختیار شماست.');
      }
    }
  };


  const handleOpenAppInfoSettings = async () => {
    const ok = await openAppInfoSettings();
    if (!ok) {
      showToast('تنظیمات برنامه فقط در نسخه اندروید (APK) در دسترس است.');
    }
  };

  const handleOpenXiaomiOtherPermissions = async () => {
    const ok = await openXiaomiOtherPermissions();
    if (!ok) {
      showToast('بخش مجوزهای دیگر شیائومی فقط در نسخه اندروید (APK) در دسترس است.');
    }
  };

  const handleCycleOfflineMessage = () => {
    const idx = OFFLINE_MORNING_MESSAGES.findIndex((m) => m.id === morningMessage.id);
    const next = OFFLINE_MORNING_MESSAGES[(idx + 1) % OFFLINE_MORNING_MESSAGES.length];
    setMorningMessage(next);
  };

  const handleGenerateAiMessage = async () => {
    if (!isOnline) {
      showToast('برای تولید پیام تازه به اینترنت نیاز است؛ می‌توانید از پیام‌های کتابخانه آفلاین استفاده کنید.');
      return;
    }
    setIsGeneratingAi(true);
    try {
      const todayGoalsText = goals
        .filter((g) => g.dateKey === getTodayKey())
        .slice(0, 3)
        .map((g) => g.title)
        .join('، ');

      const res = await fetch(apiUrl('/api/morning-message'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          dayPart: getDayPart(),
          mood: 'هدفمند، سپاسگزار و پرانرژی',
          goalsSummary: todayGoalsText,
          recipient: orderedPairNames,
        }),
      });
      const parsed = await safeReadJsonResponse<{
        title?: string;
        message?: string;
        affirmation?: string;
        energyTip?: string;
        error?: string;
      }>(res);
      if (parsed.isHtml || !parsed.data || !res.ok) {
        throw new Error(parsed.data?.error || 'خطا در دریافت پیام');
      }
      const data = parsed.data;

      setMorningMessage({
        id: `ai-${Date.now()}`,
        dayPart: getDayPart(),
        title: data.title || `پیام روز ${orderedPairNames}`,
        message: data.message || '',
        affirmation: data.affirmation || '',
        energyTip: data.energyTip || '',
        isAiGenerated: true,
      });
      showToast('پیام تازه و اختصاصی برای امروز آماده شد.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'امکان دریافت پیام هوشمند نبود.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleAddGoal = (input: Omit<GoalItem, 'id' | 'createdAt' | 'completed' | 'dateKey'>) => {
    const newGoal: GoalItem = {
      ...input,
      id: `g-${Date.now()}`,
      completed: false,
      dateKey: getTodayKey(),
      createdAt: Date.now(),
    };
    setGoals((prev) => [newGoal, ...prev]);
    if (spaceInfo) {
      pushGoalToCloud(spaceInfo.spaceId, newGoal).catch(() => {});
    }
  };

  const handleToggleGoal = (id: string) => {
    setGoals((prev) => {
      const next = prev.map((g) => (g.id === id ? {...g, completed: !g.completed} : g));
      const target = next.find((g) => g.id === id);
      if (target && spaceInfo) {
        pushGoalToCloud(spaceInfo.spaceId, target).catch(() => {});
      }
      return next;
    });
  };

  const handleDeleteGoal = (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    if (spaceInfo) {
      deleteGoalFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  const handleCarryOverPastGoals = () => {
    const todayKey = getTodayKey();
    let movedCount = 0;
    const movedGoals: GoalItem[] = [];
    setGoals((prev) =>
      prev.map((g) => {
        if (g.dateKey < todayKey && !g.completed) {
          movedCount += 1;
          const updated = {...g, dateKey: todayKey};
          movedGoals.push(updated);
          return updated;
        }
        return g;
      })
    );
    if (movedCount > 0) {
      if (spaceInfo) {
        movedGoals.forEach((g) => {
          pushGoalToCloud(spaceInfo.spaceId, g).catch(() => {});
        });
      }
      showToast(`${movedCount} کار باقی‌مانده از روزهای قبل به لیست امروز منتقل شد.`);
    }
  };

  const handleToggleHabitDate = (habitId: string, dateKey: string) => {
    setHabits((prev) => {
      const next = prev.map((h) => {
        if (h.id !== habitId) return h;
        const exists = h.completedDates.includes(dateKey);
        return {
          ...h,
          completedDates: exists
            ? h.completedDates.filter((d) => d !== dateKey)
            : [...h.completedDates, dateKey],
        };
      });
      const target = next.find((h) => h.id === habitId);
      if (target && spaceInfo) {
        pushHabitToCloud(spaceInfo.spaceId, target).catch(() => {});
      }
      return next;
    });
  };

  const handleAddHabit = (title: string, owner: OwnerRole) => {
    const item: HabitItem = {
      id: `h-${Date.now()}`,
      title,
      owner,
      completedDates: [],
    };
    setHabits((prev) => [...prev, item]);
    if (spaceInfo) {
      pushHabitToCloud(spaceInfo.spaceId, item).catch(() => {});
    }
  };

  const handleDeleteHabit = (id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    if (spaceInfo) {
      deleteHabitFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  const handleAddGratitude = (
    input: Omit<GratitudeEntry, 'id' | 'createdAt' | 'dateKey' | 'jalaliDate'>
  ) => {
    const entry: GratitudeEntry = {
      ...input,
      id: `grat-${Date.now()}`,
      dateKey: getTodayKey(),
      jalaliDate: formatJalaliFull(new Date()),
      createdAt: Date.now(),
    };
    setGratitudes((prev) => [entry, ...prev]);
    if (spaceInfo) {
      pushGratitudeToCloud(spaceInfo.spaceId, entry).catch(() => {});
    }
    showToast('شکرگذاری امروز با موفقیت ثبت شد.');
  };

  const handleDeleteGratitude = (id: string) => {
    setGratitudes((prev) => prev.filter((g) => g.id !== id));
    if (spaceInfo) {
      deleteGratitudeFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  const handleAddCaller = (input: Omit<CallerContact, 'id'>) => {
    const created: CallerContact = {...input, id: `c-${Date.now()}`};
    setCallers((prev) => [created, ...prev]);
    if (spaceInfo) {
      pushCallerToCloud(spaceInfo.spaceId, created).catch(() => {});
    }
  };

  const handleDeleteCaller = (id: string) => {
    setCallers((prev) => prev.filter((c) => c.id !== id));
    if (spaceInfo) {
      deleteCallerFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  // Shopping CRUD
  const handleAddShoppingItem = (title: string, category: ShoppingCategory = 'grocery', note?: string) => {
    const cleaned = title.trim();
    if (!cleaned) return;
    const item: ShoppingItem = {
      id: `sh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: cleaned,
      note: note?.trim() || undefined,
      category,
      checked: false,
      createdAt: Date.now(),
    };
    setShoppingItems((prev) => [item, ...prev]);
    if (spaceInfo) {
      pushShoppingToCloud(spaceInfo.spaceId, item).catch(() => {});
    }
  };

  const handleAddShoppingItems = (titles: string[], category: ShoppingCategory = 'grocery', note?: string) => {
    const created: ShoppingItem[] = [];
    for (const raw of titles) {
      const cleaned = raw.trim();
      if (!cleaned) continue;
      created.push({
        id: `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: cleaned,
        note: note?.trim() || undefined,
        category,
        checked: false,
        createdAt: Date.now(),
      });
    }
    if (created.length === 0) return;
    setShoppingItems((prev) => [...created, ...prev]);
    if (spaceInfo) {
      created.forEach((it) => {
        pushShoppingToCloud(spaceInfo.spaceId, it).catch(() => {});
      });
    }
  };

  const handleToggleShoppingItem = (id: string) => {
    setShoppingItems((prev) => {
      const next = prev.map((it) => (it.id === id ? {...it, checked: !it.checked} : it));
      const target = next.find((it) => it.id === id);
      if (target && spaceInfo) {
        pushShoppingToCloud(spaceInfo.spaceId, target).catch(() => {});
      }
      return next;
    });
  };

  const handleDeleteShoppingItem = (id: string) => {
    setShoppingItems((prev) => prev.filter((it) => it.id !== id));
    if (spaceInfo) {
      deleteShoppingFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  const handleClearCheckedShopping = () => {
    const removedIds = shoppingItems.filter((it) => it.checked).map((it) => it.id);
    setShoppingItems((prev) => prev.filter((it) => !it.checked));
    if (spaceInfo) {
      removedIds.forEach((id) => {
        deleteShoppingFromCloud(spaceInfo.spaceId, id).catch(() => {});
      });
    }
  };

  // Expense CRUD
  const handleAddExpense = (entry: Omit<ExpenseEntry, 'id' | 'createdAt' | 'dateKey'>) => {
    const created: ExpenseEntry = {
      ...entry,
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dateKey: getTodayKey(),
      createdAt: Date.now(),
    };
    setExpenses((prev) => [created, ...prev]);
    if (spaceInfo) {
      pushExpenseToCloud(spaceInfo.spaceId, created).catch(() => {});
    }
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    if (spaceInfo) {
      deleteExpenseFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  // Bills CRUD
  const handleAddBill = (input: Omit<BillReminderItem, 'id' | 'createdAt' | 'paid'>) => {
    const created: BillReminderItem = {
      ...input,
      id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      paid: false,
      createdAt: Date.now(),
    };
    setBills((prev) => [created, ...prev]);
    if (spaceInfo) {
      pushBillToCloud(spaceInfo.spaceId, created).catch(() => {});
    }
  };

  const handleToggleBillPaid = (id: string, logAsExpense: boolean) => {
    const targetBill = bills.find((b) => b.id === id);
    if (!targetBill) return;
    const becomingPaid = !targetBill.paid;

    if (becomingPaid && logAsExpense && targetBill.amount > 0) {
      handleAddExpense({
        title: `پرداخت ${targetBill.title}`,
        amount: targetBill.amount,
        category: targetBill.kind === 'vehicle' ? 'transport' : 'bills',
        payer: deviceOwner === 'zari' ? 'zari' : 'man',
      });
    }

    if (becomingPaid && (targetBill.cycle === 'monthly' || targetBill.cycle === 'yearly')) {
      const nextDueDateKey = advanceDateKey(targetBill.dueDateKey, targetBill.cycle);
      const updatedBill: BillReminderItem = {
        ...targetBill,
        dueDateKey: nextDueDateKey,
        paid: false,
      };
      setBills((prev) => prev.map((b) => (b.id === id ? updatedBill : b)));
      if (spaceInfo) {
        pushBillToCloud(spaceInfo.spaceId, updatedBill).catch(() => {});
      }
      showToast(`«${targetBill.title}» پرداخت شد و سررسید بعدی (${nextDueDateKey}) تنظیم گردید.`);
      return;
    }

    const updatedBill: BillReminderItem = {...targetBill, paid: becomingPaid};
    setBills((prev) => prev.map((b) => (b.id === id ? updatedBill : b)));
    if (spaceInfo) {
      pushBillToCloud(spaceInfo.spaceId, updatedBill).catch(() => {});
    }
  };

  const handleDeleteBill = (id: string) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
    if (spaceInfo) {
      deleteBillFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  // Medications CRUD
  const handleAddMed = (input: Omit<MedicationItem, 'id' | 'createdAt' | 'takenDates'>) => {
    const created: MedicationItem = {
      ...input,
      id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      takenDates: [],
      createdAt: Date.now(),
    };
    setMeds((prev) => [...prev, created]);
    if (spaceInfo) {
      pushMedicationToCloud(spaceInfo.spaceId, created).catch(() => {});
    }
  };

  const handleToggleMedTakenToday = (id: string) => {
    const todayKey = getTodayKey();
    setMeds((prev) => {
      const next = prev.map((m) => {
        if (m.id !== id) return m;
        const taken = m.takenDates.includes(todayKey);
        return {
          ...m,
          takenDates: taken ? m.takenDates.filter((d) => d !== todayKey) : [...m.takenDates, todayKey],
        };
      });
      const target = next.find((m) => m.id === id);
      if (target && spaceInfo) {
        pushMedicationToCloud(spaceInfo.spaceId, target).catch(() => {});
      }
      return next;
    });
  };

  const handleToggleMedEnabled = (id: string) => {
    setMeds((prev) => {
      const next = prev.map((m) => (m.id === id ? {...m, enabled: !m.enabled} : m));
      const target = next.find((m) => m.id === id);
      if (target && spaceInfo) {
        pushMedicationToCloud(spaceInfo.spaceId, target).catch(() => {});
      }
      return next;
    });
  };

  const handleDeleteMed = (id: string) => {
    setMeds((prev) => prev.filter((m) => m.id !== id));
    if (spaceInfo) {
      deleteMedicationFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  // Meal Planner Save
  const handleSaveMealDay = (entry: MealPlanEntry) => {
    setMeals((prev) => prev.map((m) => (m.id === entry.id ? entry : m)));
    if (spaceInfo) {
      pushMealPlanToCloud(spaceInfo.spaceId, entry).catch(() => {});
    }
  };

  // Vault Notes CRUD
  const handleAddVaultNote = (input: Omit<QuickVaultNote, 'id' | 'createdAt'>) => {
    const created: QuickVaultNote = {
      ...input,
      id: `vault-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    setVaultNotes((prev) => [created, ...prev]);
    if (spaceInfo) {
      pushVaultNoteToCloud(spaceInfo.spaceId, created).catch(() => {});
    }
  };

  const handleDeleteVaultNote = (id: string) => {
    setVaultNotes((prev) => prev.filter((v) => v.id !== id));
    if (spaceInfo) {
      deleteVaultNoteFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  // Packing Checklist CRUD
  const handleAddPackingItem = (title: string, template: PackingTemplateId, owner: OwnerRole) => {
    const created: PackingItem = {
      id: `pack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      template,
      owner,
      checked: false,
      createdAt: Date.now(),
    };
    setPackingItems((prev) => [created, ...prev]);
    if (spaceInfo) {
      pushPackingToCloud(spaceInfo.spaceId, created).catch(() => {});
    }
  };

  const handleAddPackingPreset = (template: PackingTemplateId) => {
    const preset = PACKING_TEMPLATES[template];
    if (!preset) return;
    const existingTitles = new Set(
      packingItems.filter((it) => it.template === template).map((it) => it.title.trim())
    );
    const created: PackingItem[] = [];
    for (const itemTitle of preset.items) {
      if (existingTitles.has(itemTitle.trim())) continue;
      created.push({
        id: `pack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: itemTitle,
        template,
        owner: 'both',
        checked: false,
        createdAt: Date.now(),
      });
    }
    if (created.length === 0) {
      showToast('تمام موارد آماده این الگو قبلاً در فهرست وجود دارند.');
      return;
    }
    setPackingItems((prev) => [...created, ...prev]);
    if (spaceInfo) {
      created.forEach((item) => {
        pushPackingToCloud(spaceInfo.spaceId, item).catch(() => {});
      });
    }
    showToast(`${toPersianDigits(created.length)} مورد به چک‌لیست «${preset.label}» اضافه شد.`);
  };

  const handleTogglePackingItem = (id: string) => {
    setPackingItems((prev) => {
      const next = prev.map((it) => (it.id === id ? {...it, checked: !it.checked} : it));
      const target = next.find((it) => it.id === id);
      if (target && spaceInfo) {
        pushPackingToCloud(spaceInfo.spaceId, target).catch(() => {});
      }
      return next;
    });
  };

  const handleDeletePackingItem = (id: string) => {
    setPackingItems((prev) => prev.filter((it) => it.id !== id));
    if (spaceInfo) {
      deletePackingFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  const handleSendPackingToShopping = (titles: string[]) => {
    handleAddShoppingItems(titles, 'home', 'از چک‌لیست سفر');
    showToast(`${toPersianDigits(titles.length)} مورد باقیمانده سفر به لیست خرید ارسال شد.`);
  };

  // Special Events CRUD
  const handleAddSpecialEvent = (input: {
    title: string;
    kind: SpecialEventKind;
    jalaliMonth: number;
    jalaliDay: number;
    owner: OwnerRole;
    note?: string;
  }) => {
    const created: SpecialEventItem = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: input.title,
      kind: input.kind,
      jalaliMonth: input.jalaliMonth,
      jalaliDay: input.jalaliDay,
      owner: input.owner,
      note: input.note,
      createdAt: Date.now(),
    };
    setSpecialEvents((prev) => [created, ...prev]);
    if (spaceInfo) {
      pushSpecialEventToCloud(spaceInfo.spaceId, created).catch(() => {});
    }
  };

  const handleDeleteSpecialEvent = (id: string) => {
    setSpecialEvents((prev) => prev.filter((ev) => ev.id !== id));
    if (spaceInfo) {
      deleteSpecialEventFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  const handleCreateWishMessage = (ev: SpecialEventItem) => {
    const occasion: 'birthday' | 'anniversary' | 'custom' =
      ev.kind === 'birthday' ? 'birthday' : ev.kind === 'anniversary' ? 'anniversary' : 'custom';
    setNightMessagePrefill({
      occasion,
      recipient: ev.title,
      details: ev.note || '',
      nonce: Date.now(),
    });
    setActiveTab('night');
  };

  // Home Maintenance Chores CRUD
  const handleAddChore = (input: {title: string; area: string; intervalDays: number; owner: OwnerRole}) => {
    const today = getTodayKey();
    const created: HomeChoreItem = {
      id: `chore-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: input.title,
      area: input.area,
      intervalDays: input.intervalDays,
      lastDoneDateKey: '',
      nextDueDateKey: today,
      owner: input.owner,
      createdAt: Date.now(),
    };
    setHomeChores((prev) => [created, ...prev]);
    if (spaceInfo) {
      pushHomeChoreToCloud(spaceInfo.spaceId, created).catch(() => {});
    }
  };

  const handleMarkChoreDoneToday = (id: string) => {
    const today = getTodayKey();
    setHomeChores((prev) => {
      const next = prev.map((ch) =>
        ch.id === id
          ? {
              ...ch,
              lastDoneDateKey: today,
              nextDueDateKey: addDaysKey(today, Math.max(1, ch.intervalDays)),
            }
          : ch
      );
      const target = next.find((ch) => ch.id === id);
      if (target && spaceInfo) {
        pushHomeChoreToCloud(spaceInfo.spaceId, target).catch(() => {});
      }
      return next;
    });
    showToast('انجام شد و موعد بعدی به‌صورت خودکار تنظیم گردید.');
  };

  const handleDeleteChore = (id: string) => {
    setHomeChores((prev) => prev.filter((ch) => ch.id !== id));
    if (spaceInfo) {
      deleteHomeChoreFromCloud(spaceInfo.spaceId, id).catch(() => {});
    }
  };

  // Daily English & Personality Exercises handlers
  const handleToggleEnglishLearned = (id: string) => {
    setLearnedEnglishIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSpeakDailyEnglish = useCallback(() => {
    const phrases = getTodayEnglishPhrases(5);
    const spoken = `مرور پنج عبارت انگلیسی امروز: ${phrases
      .map((p, idx) => `شماره ${toPersianDigits(idx + 1)}: ${p.english}. به فارسی یعنی: ${p.persian}`)
      .join('؛ ')}.`;
    void handleSpeakText(spoken, '۵ عبارت انگلیسی امروز', 'custom');
  }, [handleSpeakText]);

  const handleToggleExerciseDone = (exerciseId: string) => {
    const tk = getTodayKey();
    setCompletedExercisesState((prev) => {
      const baseIds = prev.dateKey === tk ? prev.ids : [];
      const nextIds = baseIds.includes(exerciseId)
        ? baseIds.filter((x) => x !== exerciseId)
        : [...baseIds, exerciseId];
      return {dateKey: tk, ids: nextIds};
    });
  };

  const completedExercisesToday =
    completedExercisesState.dateKey === getTodayKey() ? completedExercisesState.ids : [];

  const todayExpenseTotal = useMemo(() => {
    const tk = getTodayKey();
    return expenses.filter((e) => e.dateKey === tk).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const monthExpenseTotal = useMemo(() => {
    const mp = getTodayKey().slice(0, 7);
    return expenses.filter((e) => e.dateKey.startsWith(mp)).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const handleBuildDailyBriefing = useCallback(
    async (mode: 'morning' | 'evening') => {
      const weatherSummary = isOnline && mode === 'morning' ? await fetchQuickWeatherBrief() : '';
      return buildDailyBriefingText({
        mode,
        selfName: getSelfName(settings, deviceOwner),
        partnerName: getPartnerNameForDevice(settings, deviceOwner),
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
    },
    [
      bills,
      deviceOwner,
      goals,
      homeChores,
      isOnline,
      meals,
      meds,
      monthExpenseTotal,
      monthlyBudget,
      settings,
      shoppingItems,
      specialEvents,
      todayExpenseTotal,
    ]
  );

  const handleAskRecipe = (dishName: string) => {
    setActiveTab('assistant');
    setPendingAssistantQuery({
      text: `طرز تهیه و مواد لازم ${dishName} رو خلاصه بگو`,
      nonce: Date.now(),
    });
  };

  const handleImportBundle = (payload: {
    goals?: GoalItem[];
    habits?: HabitItem[];
    gratitudes?: GratitudeEntry[];
    callers?: CallerContact[];
    schedules?: ScheduledAnnouncement[];
    shoppingItems?: ShoppingItem[];
    expenses?: ExpenseEntry[];
    bills?: BillReminderItem[];
    meds?: MedicationItem[];
    meals?: MealPlanEntry[];
    vaultNotes?: QuickVaultNote[];
    packingItems?: PackingItem[];
    specialEvents?: SpecialEventItem[];
    homeChores?: HomeChoreItem[];
  }) => {
    if (Array.isArray(payload.goals)) {
      setGoals((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...payload.goals!.filter((x) => !ids.has(x.id)), ...prev];
      });
    }
    if (Array.isArray(payload.habits)) {
      setHabits((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...payload.habits!.filter((x) => !ids.has(x.id))];
      });
    }
    if (Array.isArray(payload.gratitudes)) {
      setGratitudes((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...payload.gratitudes!.filter((x) => !ids.has(x.id)), ...prev];
      });
    }
    if (Array.isArray(payload.callers)) {
      setCallers((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...payload.callers!.filter((x) => !ids.has(x.id))];
      });
    }
    if (Array.isArray(payload.schedules)) {
      setSchedules((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...payload.schedules!.filter((x) => !ids.has(x.id))];
      });
    }
    if (Array.isArray(payload.shoppingItems)) {
      setShoppingItems((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...payload.shoppingItems!.filter((x) => !ids.has(x.id)), ...prev];
      });
    }
    if (Array.isArray(payload.expenses)) {
      setExpenses((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...payload.expenses!.filter((x) => !ids.has(x.id)), ...prev];
      });
    }
    if (Array.isArray(payload.bills)) {
      setBills((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...payload.bills!.filter((x) => !ids.has(x.id)), ...prev];
      });
    }
    if (Array.isArray(payload.meds)) {
      setMeds((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...payload.meds!.filter((x) => !ids.has(x.id))];
      });
    }
    if (Array.isArray(payload.meals)) {
      setMeals((prev) =>
        prev.map((m) => {
          const incoming = payload.meals!.find((im) => im.id === m.id);
          return incoming && (incoming.lunch || incoming.dinner || incoming.ingredients) ? incoming : m;
        })
      );
    }
    if (Array.isArray(payload.vaultNotes)) {
      setVaultNotes((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...payload.vaultNotes!.filter((x) => !ids.has(x.id)), ...prev];
      });
    }
    if (Array.isArray(payload.packingItems)) {
      setPackingItems((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...payload.packingItems!.filter((x) => !ids.has(x.id)), ...prev];
      });
    }
    if (Array.isArray(payload.specialEvents)) {
      setSpecialEvents((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...payload.specialEvents!.filter((x) => !ids.has(x.id)), ...prev];
      });
    }
    if (Array.isArray(payload.homeChores)) {
      setHomeChores((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...payload.homeChores!.filter((x) => !ids.has(x.id)), ...prev];
      });
    }
  };

  const quickPlayMorning = () => {
    const raw = `${morningMessage.title}. ${morningMessage.message} ${morningMessage.affirmation}`;
    const fullText = adaptTextForDevice(raw, settings, deviceOwner);
    handleSpeakText(fullText, adaptTextForDevice(morningMessage.title, settings, deviceOwner), 'morning');
  };

  return (
    <div className="app-shell min-h-screen flex flex-col text-slate-900 dark:text-slate-100">
      <TopBar
        activeTab={activeTab}
        deviceOwner={deviceOwner}
        selfName={selfName}
        assistantName={settings.assistantName?.trim() || 'هم‌صدا'}
        theme={settings.theme}
        masterSpeakerEnabled={localVoiceControls.masterSpeakerEnabled}
        onSelectTheme={(theme) => {
          handleUpdateSettings({theme});
          const labels: Record<AppSettings['theme'], string> = {
            light: 'روشن', dark: 'تیره', 'obsidian-gold': 'مشکی و طلایی',
            'royal-navy': 'سرمه‌ای سلطنتی', 'midnight-purple': 'بنفش نیمه‌شب',
            graphite: 'گرافیتی', 'ivory-champagne': 'عاجی شامپاینی', 'arctic-silver': 'نقره‌ای یخی',
          };
          showToast(`پوسته ${labels[theme]} فعال شد.`);
        }}
        onToggleMasterSpeaker={handleToggleMasterSpeaker}
        onRefreshApp={handleRefreshApp}
        onSelectTab={setActiveTab}
        onQuickPlayMorning={quickPlayMorning}
        onOpenDriveMode={() => setDriveModeOpen(true)}
      />

      <main className="relative flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 lg:pb-10">
        {activeTab === 'family' && <FamilyLifeSuite />}

        {activeTab === 'today' && (
          <TodayView
            goals={goals}
            habits={habits}
            shoppingItems={shoppingItems}
            expenses={expenses}
            monthlyBudget={monthlyBudget}
            bills={bills}
            schedules={schedules}
            notifPermission={notifPermission}
            keepAliveActive={keepAliveActive}
            backgroundKeepAlive={settings.backgroundKeepAlive}
            autoOpenMorning={settings.autoOpenMorning}
            defaultVoiceForReminder={settings.defaultVoice}
            meds={meds}
            meals={meals}
            vaultNotes={vaultNotes}
            packingItems={packingItems}
            specialEvents={specialEvents}
            homeChores={homeChores}
            learnedEnglishIds={learnedEnglishIds}
            personalityFocus={personalityFocus}
            completedExercisesToday={completedExercisesToday}
            activeSubSection={todaySubSection}
            onChangeSubSection={setTodaySubSection}
            morningMessage={morningMessage}
            isOnline={isOnline}
            isSpeaking={isSpeaking}
            speechSourceLabel={speechSourceLabel}
            myName={settings.myName}
            partnerName={settings.partnerName}
            deviceOwner={deviceOwner}
            defaultVoice={settings.defaultVoice}
            onChangeDefaultVoice={(voice) => handleUpdateSettings({defaultVoice: voice})}
            onAddGoal={handleAddGoal}
            onToggleGoal={handleToggleGoal}
            onDeleteGoal={handleDeleteGoal}
            onCarryOverPastGoals={handleCarryOverPastGoals}
            onToggleHabitDate={handleToggleHabitDate}
            onAddHabit={handleAddHabit}
            onDeleteHabit={handleDeleteHabit}
            onAddShoppingItem={handleAddShoppingItem}
            onAddShoppingItems={handleAddShoppingItems}
            onToggleShoppingItem={handleToggleShoppingItem}
            onDeleteShoppingItem={handleDeleteShoppingItem}
            onClearCheckedShopping={handleClearCheckedShopping}
            onUpdateBudget={setMonthlyBudget}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
            onAddBill={handleAddBill}
            onToggleBillPaid={handleToggleBillPaid}
            onDeleteBill={handleDeleteBill}
            onUpdateSettings={handleUpdateSettings}
            onRequestNotificationPermission={requestNotificationPermission}
            onToggleKeepAlive={handleToggleKeepAlive}
            onAddSchedule={handleAddSchedule}
            onToggleSchedule={handleToggleSchedule}
            onUpdateSchedule={handleUpdateSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            onTestSchedule={(item) => handleTriggerSchedule(item, true)}
            onDownloadScheduleAlarm={handleDownloadScheduleAlarm}
            onAddMed={handleAddMed}
            onToggleMedTakenToday={handleToggleMedTakenToday}
            onToggleMedEnabled={handleToggleMedEnabled}
            onDeleteMed={handleDeleteMed}
            onSaveMealDay={handleSaveMealDay}
            onAddVaultNote={handleAddVaultNote}
            onDeleteVaultNote={handleDeleteVaultNote}
            onAddPackingItem={handleAddPackingItem}
            onAddPackingPreset={handleAddPackingPreset}
            onTogglePackingItem={handleTogglePackingItem}
            onDeletePackingItem={handleDeletePackingItem}
            onSendPackingToShopping={handleSendPackingToShopping}
            onAddSpecialEvent={handleAddSpecialEvent}
            onDeleteSpecialEvent={handleDeleteSpecialEvent}
            onCreateWishMessage={handleCreateWishMessage}
            onAddChore={handleAddChore}
            onMarkChoreDoneToday={handleMarkChoreDoneToday}
            onDeleteChore={handleDeleteChore}
            onToggleEnglishLearned={handleToggleEnglishLearned}
            onSpeakDailyEnglish={handleSpeakDailyEnglish}
            onChangePersonalityFocus={setPersonalityFocus}
            onToggleExerciseDone={handleToggleExerciseDone}
            onAskRecipe={handleAskRecipe}
            onOpenDriveMode={() => setDriveModeOpen(true)}
            onCycleOfflineMessage={handleCycleOfflineMessage}
            onGenerateAiMessage={handleGenerateAiMessage}
            isGeneratingAi={isGeneratingAi}
            onSpeakText={handleSpeakText}
            onStopSpeech={handleStopSpeech}
            onStatusToast={showToast}
          />
        )}

        {activeTab === 'assistant' && (
          <AssistantView
            settings={settings}
            deviceOwner={deviceOwner}
            isOnline={isOnline}
            isSpeaking={isSpeaking}
            callers={callers}
            syncedContacts={syncedContacts}
            morningMessage={morningMessage}
            nativeCaps={nativeCaps}
            autoSpeakReplies={
              localVoiceControls.masterSpeakerEnabled && localVoiceControls.autoAssistantSpeak
            }
            preferOfflineSpeech={preferOfflineSpeech}
            preferredOfflineEngine={preferredOfflineEngine}
            onChangePreferOfflineSpeech={handleChangePreferOfflineSpeech}
            onChangePreferredOfflineEngine={handleChangePreferredOfflineEngine}
            onUpdateSettings={handleUpdateSettings}
            onSpeakText={handleSpeakText}
            onStopSpeech={handleStopSpeech}
            onOpenTab={setActiveTab}
            onOpenTodaySection={(section) => {
              setTodaySubSection(section);
              setActiveTab('today');
            }}
            onTriggerMedia={(tab, query) =>
              setAssistantMediaTrigger({tab, query, nonce: Date.now()})
            }
            onAddGoalTitle={(title) =>
              handleAddGoal({
                title,
                owner: deviceOwner === 'zari' ? 'zari' : 'man',
                scope: 'home',
                category: 'purpose',
                timeBlock:
                  getDayPart() === 'morning'
                    ? 'morning'
                    : getDayPart() === 'midday'
                      ? 'afternoon'
                      : 'evening',
                priority: 'normal',
              })
            }
            onAddShoppingItems={handleAddShoppingItems}
            onAddExpenseEntry={(title, amount, category: ExpenseCategory) =>
              handleAddExpense({
                title,
                amount,
                category,
                payer: deviceOwner === 'zari' ? 'zari' : 'man',
              })
            }
            onBuildDailyBriefing={handleBuildDailyBriefing}
            onSpeakDailyEnglish={handleSpeakDailyEnglish}
            onOpenDriveMode={() => setDriveModeOpen(true)}
            pendingAssistantQuery={pendingAssistantQuery}
            onStatusToast={showToast}
          />
        )}

        {activeTab === 'gratitude' && (
          <GratitudeView
            entries={gratitudes}
            myName={settings.myName}
            partnerName={settings.partnerName}
            deviceOwner={deviceOwner}
            isSpeaking={isSpeaking}
            onAddEntry={handleAddGratitude}
            onDeleteEntry={handleDeleteGratitude}
            onSpeakText={handleSpeakText}
            onStopSpeech={handleStopSpeech}
          />
        )}

        {activeTab === 'night' && (
          <NightAndMessagesView
            settings={settings}
            deviceOwner={deviceOwner}
            isOnline={isOnline}
            isSpeaking={isSpeaking}
            nightMoviesResult={nightMoviesResult}
            nightMusicResult={nightMusicResult}
            onSaveNightResult={(res) => {
              if (res.mode === 'music') setNightMusicResult(res);
              else setNightMoviesResult(res);
            }}
            onUpdateSettings={handleUpdateSettings}
            onSpeakText={handleSpeakText}
            onStopSpeech={handleStopSpeech}
            onStatusToast={showToast}
            assistantMediaTrigger={assistantMediaTrigger}
            messagePrefill={nightMessagePrefill}
          />
        )}

        {activeTab === 'voice' && (
          <VoiceLibraryView
            clips={audioClips}
            isOnline={isOnline}
            isSpeaking={isSpeaking}
            defaultVoice={settings.defaultVoice}
            speechRate={settings.speechRate}
            preferOfflineSpeech={preferOfflineSpeech}
            preferredOfflineEngine={preferredOfflineEngine}
            onChangePreferOfflineSpeech={handleChangePreferOfflineSpeech}
            onChangePreferredOfflineEngine={handleChangePreferredOfflineEngine}
            onPocketConfigChanged={() => setPocketPrecacheNonce((n) => n + 1)}
            onRefreshClips={refreshClips}
            onStopSpeech={handleStopSpeech}
            onUpdateRate={(rate) => handleUpdateSettings({speechRate: rate})}
            onStatusToast={showToast}
          />
        )}

        {activeTab === 'caller' && (
          <CallerAnnouncerView
            callers={callers}
            syncedContacts={syncedContacts}
            isOnline={isOnline}
            defaultVoice={settings.defaultVoice}
            speechRate={settings.speechRate}
            announceCalls={settings.announceCalls}
            announceSms={settings.announceSms}
            settings={settings}
            deviceOwner={deviceOwner}
            onUpdateSettings={handleUpdateSettings}
            onAddCaller={handleAddCaller}
            onDeleteCaller={handleDeleteCaller}
            onSaveSyncedContacts={setSyncedContacts}
            onRefreshClips={refreshClips}
            onStatusToast={showToast}
          />
        )}

        {activeTab === 'sync' && (
          <SyncSettingsView
            settings={settings}
            deviceOwner={deviceOwner}
            onChangeDeviceOwner={handleChangeDeviceOwner}
            localVoiceControls={localVoiceControls}
            onUpdateLocalVoiceControls={handleUpdateLocalVoiceControls}
            onRefreshApp={handleRefreshApp}
            goals={goals}
            habits={habits}
            gratitudes={gratitudes}
            callers={callers}
            schedules={schedules}
            shoppingItems={shoppingItems}
            expenses={expenses}
            bills={bills}
            meds={meds}
            meals={meals}
            vaultNotes={vaultNotes}
            packingItems={packingItems}
            specialEvents={specialEvents}
            homeChores={homeChores}
            notifPermission={notifPermission}
            keepAliveActive={keepAliveActive}
            isOnline={isOnline}
            cachedClipsCount={audioClips.length}
            deviceUid={deviceUid}
            cloudBusy={cloudBusy}
            spaceInfo={spaceInfo}
            nativeCaps={nativeCaps}
            onUpdateSettings={handleUpdateSettings}
            onImportBundle={handleImportBundle}
            onRequestNotificationPermission={requestNotificationPermission}
            onToggleKeepAlive={handleToggleKeepAlive}
            onAddSchedule={handleAddSchedule}
            onToggleSchedule={handleToggleSchedule}
            onUpdateSchedule={handleUpdateSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            onTestSchedule={(item) => handleTriggerSchedule(item, true)}
            onDownloadScheduleAlarm={handleDownloadScheduleAlarm}
            onJoinSpaceByCode={handleJoinSpaceByCode}
            onPushLocalToCloud={handlePushLocalToCloud}
            onRequestNativePermissions={handleRequestNativePermissions}
            onOpenAppInfoSettings={handleOpenAppInfoSettings}
            onOpenXiaomiOtherPermissions={handleOpenXiaomiOtherPermissions}
            onStatusToast={showToast}
          />
        )}
      </main>

      <DriveModeModal
        open={driveModeOpen}
        onClose={() => setDriveModeOpen(false)}
        settings={settings}
        deviceOwner={deviceOwner}
        isSpeaking={isSpeaking}
        goals={goals}
        shoppingItems={shoppingItems}
        bills={bills}
        meds={meds}
        meals={meals}
        todayExpenseTotal={todayExpenseTotal}
        monthExpenseTotal={monthExpenseTotal}
        monthlyBudget={monthlyBudget}
        syncedContacts={syncedContacts}
        callers={callers}
        onSpeakText={handleSpeakText}
        onStopSpeech={handleStopSpeech}
        onOpenAssistant={() => setActiveTab('assistant')}
        onStatusToast={showToast}
      />

      <footer className="border-t border-[#E6E2D8] dark:border-emerald-950/60 py-4 pb-[calc(68px+env(safe-area-inset-bottom)+8px)] lg:pb-4 px-4 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
        <div>
          هم‌صدا · برنامه‌ریزی روزانه، لیست خرید و غذا، مالی و تسویه، دارو، مناسبت‌ها، سفر، حالت رانندگی و دستیار صوتی فارسی
        </div>
        <div>
          نسخه رایگان هم‌صدا برای همه · با حمایت{' '}
          <a
            href="https://tapnfc.ir"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-emerald-800 dark:text-amber-300 underline underline-offset-4 hover:text-emerald-600"
            dir="ltr"
          >
            tapnfc.ir
          </a>
        </div>
      </footer>

      {!isOnline && (
        <div className="fixed bottom-24 lg:bottom-5 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>حالت آفلاین — تمام داده‌ها و صوت‌های ذخیره‌شده در دسترس هستند</span>
        </div>
      )}

      {toast && (
        <div className="fixed top-16 md:top-20 right-4 left-4 md:left-auto md:max-w-md z-50 flex items-start justify-between gap-2 rounded-xl bg-slate-900 dark:bg-emerald-800 text-white px-4 py-3 text-xs sm:text-sm font-medium shadow-xl">
          <span className="leading-6">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="بستن پیام"
            className="shrink-0 p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
