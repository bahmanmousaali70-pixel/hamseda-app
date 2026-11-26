import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  AppSettings,
  BillReminderItem,
  CallerContact,
  ExpenseEntry,
  GoalItem,
  GratitudeEntry,
  HabitItem,
  HomeChoreItem,
  MealPlanEntry,
  MedicationItem,
  PackingItem,
  QuickVaultNote,
  ScheduledAnnouncement,
  ShoppingItem,
  SpecialEventItem,
  WeekdayId,
} from '../types/app';
import {auth, db, handleFirestoreError, OperationType, type User} from './firebaseClient';

export interface CoupleSpaceInfo {
  spaceId: string;
  title: string;
  ownerUid: string;
  role: 'owner' | 'partner';
}

function clampStr(val: string | undefined, max: number, fallback = ''): string {
  const s = (val ?? fallback).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function createPairingSpaceId(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('این دستگاه امکان ساخت کد اتصال امن را ندارد.');
  }
  crypto.getRandomValues(bytes);
  return `space_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

export async function ensureUserAndDiscoverSpace(user: User): Promise<CoupleSpaceInfo> {
  const uid = sanitizeId(user.uid);
  const displayName = clampStr(user.displayName, 100, 'همراه');
  const userPath = `users/${uid}`;

  // 1. Ensure user profile exists
  let activeSpaceId = '';
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      activeSpaceId = typeof data.activeSpaceId === 'string' ? data.activeSpaceId : '';
      await updateDoc(userRef, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  // 2. Check if activeSpaceId is already valid
  if (activeSpaceId) {
    try {
      const spaceSnap = await getDoc(doc(db, 'spaces', activeSpaceId));
      if (spaceSnap.exists()) {
        const sdata = spaceSnap.data();
        const role: 'owner' | 'partner' = sdata.ownerUid === uid ? 'owner' : 'partner';
        await ensureMembership(activeSpaceId, uid, displayName, role);
        return {
          spaceId: activeSpaceId,
          title: sdata.title ?? 'فضای مشترک من و زری',
          ownerUid: sdata.ownerUid,
          role,
        };
      }
    } catch {
      // fall through to discovery
    }
  }

  // 4. Discover own space or create default space
  try {
    const ownerQ = query(collection(db, 'spaces'), where('ownerUid', '==', uid));
    const ownerSnaps = await getDocs(ownerQ);
    if (!ownerSnaps.empty) {
      const docSnap = ownerSnaps.docs[0];
      const sdata = docSnap.data();
      const foundId = docSnap.id;
      await ensureMembership(foundId, uid, displayName, 'owner');
      await updateDoc(doc(db, 'users', uid), {
        activeSpaceId: foundId,
        updatedAt: serverTimestamp(),
      });
      return {
        spaceId: foundId,
        title: sdata.title ?? 'فضای مشترک من و زری',
        ownerUid: sdata.ownerUid,
        role: 'owner',
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'spaces');
  }

  // 5. Create fresh CoupleSpace owned by this user
  const newSpaceId = createPairingSpaceId();
  try {
    await setDoc(doc(db, 'spaces', newSpaceId), {
      ownerUid: uid,
      title: 'فضای مشترک روزهای من و زری',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await ensureMembership(newSpaceId, uid, displayName, 'owner');
    await updateDoc(doc(db, 'users', uid), {
      activeSpaceId: newSpaceId,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `spaces/${newSpaceId}`);
  }

  return {
    spaceId: newSpaceId,
    title: 'فضای مشترک روزهای من و زری',
    ownerUid: uid,
    role: 'owner',
  };
}

async function ensureMembership(
  spaceId: string,
  uid: string,
  displayName: string,
  role: 'owner' | 'partner'
): Promise<void> {
  const memberPath = `spaces/${spaceId}/members/${uid}`;
  try {
    const ref = doc(db, 'spaces', spaceId, 'members', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        displayName,
        role,
        joinedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, memberPath);
  }
}

export async function joinSpaceByCode(spaceIdRaw: string, user: User): Promise<CoupleSpaceInfo> {
  const spaceId = sanitizeId(spaceIdRaw.trim());
  const uid = sanitizeId(user.uid);
  const displayName = clampStr(user.displayName, 100, 'همراه');
  const path = `spaces/${spaceId}`;

  try {
    const snap = await getDoc(doc(db, 'spaces', spaceId));
    if (!snap.exists()) {
      throw new Error('کد فضای مشترک پیدا نشد.');
    }
    const sdata = snap.data();
    const role: 'owner' | 'partner' = sdata.ownerUid === uid ? 'owner' : 'partner';
    await ensureMembership(spaceId, uid, displayName, role);
    await updateDoc(doc(db, 'users', uid), {
      activeSpaceId: spaceId,
      updatedAt: serverTimestamp(),
    });
    return {
      spaceId,
      title: sdata.title ?? 'فضای مشترک من و زری',
      ownerUid: sdata.ownerUid,
      role,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeToCoupleSpace(
  spaceId: string,
  callbacks: {
    onGoals: (items: GoalItem[]) => void;
    onHabits: (items: HabitItem[]) => void;
    onGratitudes: (items: GratitudeEntry[]) => void;
    onCallers: (items: CallerContact[]) => void;
    onSchedules: (items: ScheduledAnnouncement[]) => void;
    onSettings: (settings: AppSettings) => void;
    onShopping?: (items: ShoppingItem[]) => void;
    onExpenses?: (items: ExpenseEntry[]) => void;
    onBills?: (items: BillReminderItem[]) => void;
    onMeds?: (items: MedicationItem[]) => void;
    onMeals?: (items: MealPlanEntry[]) => void;
    onVault?: (items: QuickVaultNote[]) => void;
    onPacking?: (items: PackingItem[]) => void;
    onEvents?: (items: SpecialEventItem[]) => void;
    onChores?: (items: HomeChoreItem[]) => void;
    onError: (msg: string) => void;
  }
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];

  const reportListenerError = (label: string, err: Error) => {
    console.warn(`Firestore ${label} listener error:`, err);
    callbacks.onError(err.message || label);
  };



  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'goals'),
      (snap) => {
        if (snap.empty) return;
        const items: GoalItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data || typeof data.title !== 'string') return null;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              title: data.title,
              owner: data.owner === 'man' || data.owner === 'zari' || data.owner === 'both' ? data.owner : 'both',
              scope: data.scope === 'work' || data.scope === 'home' ? data.scope : undefined,
              category: data.category ?? 'purpose',
              timeBlock: data.timeBlock ?? 'morning',
              priority: data.priority === 'high' ? 'high' : 'normal',
              completed: Boolean(data.completed),
              dateKey: typeof data.dateKey === 'string' ? data.dateKey : '',
              reminderTime: typeof data.reminderTime === 'string' && data.reminderTime ? data.reminderTime : undefined,
              reminderVoice: typeof data.reminderVoice === 'string' ? data.reminderVoice : undefined,
              createdAt: Number(data.clientCreatedAt ?? Date.now()),
            } as GoalItem;
          })
          .filter((item): item is GoalItem => item !== null)
          .sort((a, b) => b.createdAt - a.createdAt);
        if (items.length > 0) callbacks.onGoals(items);
      },
      (err) => reportListenerError('goals', err)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'habits'),
      (snap) => {
        if (snap.empty) return;
        const items: HabitItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data || typeof data.title !== 'string') return null;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              title: data.title,
              owner: data.owner === 'man' || data.owner === 'zari' || data.owner === 'both' ? data.owner : 'both',
              completedDates: Array.isArray(data.completedDates) ? data.completedDates : [],
            } as HabitItem;
          })
          .filter((item): item is HabitItem => item !== null);
        if (items.length > 0) callbacks.onHabits(items);
      },
      (err) => reportListenerError('habits', err)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'gratitudes'),
      (snap) => {
        if (snap.empty) return;
        const items: GratitudeEntry[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data) return null;
            const arr = Array.isArray(data.items) ? data.items : ['', '', ''];
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              dateKey: typeof data.dateKey === 'string' ? data.dateKey : '',
              jalaliDate: typeof data.jalaliDate === 'string' ? data.jalaliDate : 'امروز',
              author: data.author === 'man' || data.author === 'zari' || data.author === 'both' ? data.author : 'both',
              mood: data.mood ?? 'grateful',
              items: [arr[0] ?? '', arr[1] ?? '', arr[2] ?? ''] as [string, string, string],
              loveNote: typeof data.loveNote === 'string' ? data.loveNote : '',
              createdAt: Number(data.clientCreatedAt ?? Date.now()),
            } as GratitudeEntry;
          })
          .filter((item): item is GratitudeEntry => item !== null)
          .sort((a, b) => b.createdAt - a.createdAt);
        if (items.length > 0) callbacks.onGratitudes(items);
      },
      (err) => reportListenerError('gratitudes', err)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'callers'),
      (snap) => {
        if (snap.empty) return;
        const items: CallerContact[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data || typeof data.name !== 'string') return null;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              name: data.name,
              latinAlias: typeof data.latinAlias === 'string' ? data.latinAlias : undefined,
              persianPhonetic: typeof data.persianPhonetic === 'string' ? data.persianPhonetic : undefined,
              relation: typeof data.relation === 'string' ? data.relation : '',
              template: typeof data.template === 'string' ? data.template : 'تماس ورودی از طرف {name}',
              repeatCount: data.repeatCount === 2 ? 2 : 1,
              chimeStyle: data.chimeStyle ?? 'gentle',
              voiceName: data.voiceName ?? 'Kore',
              favorite: Boolean(data.favorite),
            } as CallerContact;
          })
          .filter((item): item is CallerContact => item !== null);
        if (items.length > 0) callbacks.onCallers(items);
      },
      (err) => reportListenerError('callers', err)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'schedules'),
      (snap) => {
        if (snap.empty) return;
        const items: ScheduledAnnouncement[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data || typeof data.title !== 'string') return null;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              title: data.title,
              topic: data.topic ?? 'morning',
              time: typeof data.time === 'string' ? data.time : '08:00',
              enabled: Boolean(data.enabled),
              voiceName: data.voiceName ?? 'Kore',
              customText: typeof data.customText === 'string' ? data.customText : undefined,
              days: data.days ?? 'daily',
              lastTriggeredDate: typeof data.lastTriggeredDate === 'string' ? data.lastTriggeredDate : undefined,
            } as ScheduledAnnouncement;
          })
          .filter((item): item is ScheduledAnnouncement => item !== null);
        if (items.length > 0) callbacks.onSchedules(items);
      },
      (err) => reportListenerError('schedules', err)
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'spaces', spaceId, 'config', 'settings'),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const rawMyName = typeof data.myName === 'string' && data.myName.trim() ? data.myName.trim() : 'بهمن';
        callbacks.onSettings({
          theme: data.theme === 'dark' ? 'dark' : 'light',
          defaultVoice: data.defaultVoice ?? 'Kore',
          speechRate: Number(data.speechRate ?? 1),
          myName: rawMyName === 'مهدی' ? 'بهمن' : rawMyName,
          partnerName: typeof data.partnerName === 'string' && data.partnerName.trim() ? data.partnerName : 'زری',
          assistantName:
            typeof data.assistantName === 'string' && data.assistantName.trim() ? data.assistantName.trim() : 'هم‌صدا',
          assistantWakeWordEnabled: Boolean(data.assistantWakeWordEnabled ?? false),
          backgroundKeepAlive: Boolean(data.backgroundKeepAlive),
          announceCalls: data.announceCalls !== undefined ? Boolean(data.announceCalls) : true,
          announceSms: data.announceSms !== undefined ? Boolean(data.announceSms) : true,
          autoOpenMorning: data.autoOpenMorning !== undefined ? Boolean(data.autoOpenMorning) : true,
          nightMovieAutoCheck: data.nightMovieAutoCheck !== undefined ? Boolean(data.nightMovieAutoCheck) : true,
          nightMovieTime: typeof data.nightMovieTime === 'string' && /^\d{2}:\d{2}$/.test(data.nightMovieTime) ? data.nightMovieTime : '22:00',
        });
      },
      (err) => reportListenerError('settings', err)
    )
  );

  if (callbacks.onShopping) {
    const onShoppingCb = callbacks.onShopping;
    unsubs.push(
      onSnapshot(
        collection(db, 'spaces', spaceId, 'shopping'),
        (snap) => {
          if (snap.empty) return;
          const items: ShoppingItem[] = snap.docs
            .map((d) => {
              const data = d.data();
              if (!data || typeof data.title !== 'string') return null;
              return {
                id: typeof data.id === 'string' ? data.id : d.id,
                title: data.title,
                note: typeof data.note === 'string' && data.note ? data.note : undefined,
                category: data.category ?? 'grocery',
                checked: Boolean(data.checked),
                createdAt: Number(data.clientCreatedAt ?? Date.now()),
              } as ShoppingItem;
            })
            .filter((x): x is ShoppingItem => x !== null)
            .sort((a, b) => b.createdAt - a.createdAt);
          if (items.length > 0) onShoppingCb(items);
        },
        (err) => reportListenerError('shopping', err)
      )
    );
  }

  if (callbacks.onExpenses) {
    const onExpensesCb = callbacks.onExpenses;
    unsubs.push(
      onSnapshot(
        collection(db, 'spaces', spaceId, 'expenses'),
        (snap) => {
          if (snap.empty) return;
          const items: ExpenseEntry[] = snap.docs
            .map((d) => {
              const data = d.data();
              if (!data || typeof data.title !== 'string') return null;
              return {
                id: typeof data.id === 'string' ? data.id : d.id,
                title: data.title,
                amount: Number(data.amount ?? 0),
                category: data.category ?? 'other',
                payer: data.payer === 'man' || data.payer === 'zari' || data.payer === 'both' ? data.payer : 'both',
                splitMode:
                  data.splitMode === 'shared' ||
                  data.splitMode === 'personal' ||
                  data.splitMode === 'for_partner' ||
                  data.splitMode === 'settlement'
                    ? data.splitMode
                    : undefined,
                dateKey: typeof data.dateKey === 'string' ? data.dateKey : '',
                createdAt: Number(data.clientCreatedAt ?? Date.now()),
              } as ExpenseEntry;
            })
            .filter((x): x is ExpenseEntry => x !== null)
            .sort((a, b) => b.createdAt - a.createdAt);
          if (items.length > 0) onExpensesCb(items);
        },
        (err) => reportListenerError('expenses', err)
      )
    );
  }

  if (callbacks.onBills) {
    const onBillsCb = callbacks.onBills;
    unsubs.push(
      onSnapshot(
        collection(db, 'spaces', spaceId, 'bills'),
        (snap) => {
          if (snap.empty) return;
          const items: BillReminderItem[] = snap.docs
            .map((d) => {
              const data = d.data();
              if (!data || typeof data.title !== 'string') return null;
              return {
                id: typeof data.id === 'string' ? data.id : d.id,
                title: data.title,
                amount: Number(data.amount ?? 0),
                kind: data.kind ?? 'bill',
                dueDateKey: typeof data.dueDateKey === 'string' ? data.dueDateKey : '',
                cycle: data.cycle ?? 'monthly',
                paid: Boolean(data.paid),
                note: typeof data.note === 'string' && data.note ? data.note : undefined,
                createdAt: Number(data.clientCreatedAt ?? Date.now()),
              } as BillReminderItem;
            })
            .filter((x): x is BillReminderItem => x !== null)
            .sort((a, b) => a.dueDateKey.localeCompare(b.dueDateKey));
          if (items.length > 0) onBillsCb(items);
        },
        (err) => reportListenerError('bills', err)
      )
    );
  }

  if (callbacks.onMeds) {
    const onMedsCb = callbacks.onMeds;
    unsubs.push(
      onSnapshot(
        collection(db, 'spaces', spaceId, 'meds'),
        (snap) => {
          if (snap.empty) return;
          const items: MedicationItem[] = snap.docs
            .map((d) => {
              const data = d.data();
              if (!data || typeof data.name !== 'string') return null;
              return {
                id: typeof data.id === 'string' ? data.id : d.id,
                name: data.name,
                dosage: typeof data.dosage === 'string' ? data.dosage : '',
                time: typeof data.time === 'string' ? data.time : '08:00',
                owner: data.owner === 'man' || data.owner === 'zari' || data.owner === 'both' ? data.owner : 'both',
                kind: data.kind === 'appointment' ? 'appointment' : 'med',
                takenDates: Array.isArray(data.takenDates) ? data.takenDates : [],
                voiceRemind: Boolean(data.voiceRemind),
                enabled: data.enabled !== undefined ? Boolean(data.enabled) : true,
                createdAt: Number(data.clientCreatedAt ?? Date.now()),
              } as MedicationItem;
            })
            .filter((x): x is MedicationItem => x !== null)
            .sort((a, b) => a.time.localeCompare(b.time));
          if (items.length > 0) onMedsCb(items);
        },
        (err) => reportListenerError('meds', err)
      )
    );
  }

  if (callbacks.onMeals) {
    const onMealsCb = callbacks.onMeals;
    unsubs.push(
      onSnapshot(
        collection(db, 'spaces', spaceId, 'meals'),
        (snap) => {
          if (snap.empty) return;
          const items: MealPlanEntry[] = snap.docs
            .map((d) => {
              const data = d.data();
              if (!data || typeof data.dayLabel !== 'string') return null;
              return {
                id: (typeof data.id === 'string' ? data.id : d.id) as WeekdayId,
                dayLabel: data.dayLabel,
                lunch: typeof data.lunch === 'string' ? data.lunch : '',
                dinner: typeof data.dinner === 'string' ? data.dinner : '',
                ingredients: typeof data.ingredients === 'string' ? data.ingredients : '',
              } as MealPlanEntry;
            })
            .filter((x): x is MealPlanEntry => x !== null);
          if (items.length > 0) onMealsCb(items);
        },
        (err) => reportListenerError('meals', err)
      )
    );
  }

  if (callbacks.onVault) {
    const onVaultCb = callbacks.onVault;
    unsubs.push(
      onSnapshot(
        collection(db, 'spaces', spaceId, 'vault'),
        (snap) => {
          if (snap.empty) return;
          const items: QuickVaultNote[] = snap.docs
            .map((d) => {
              const data = d.data();
              if (!data || typeof data.title !== 'string' || typeof data.value !== 'string') return null;
              return {
                id: typeof data.id === 'string' ? data.id : d.id,
                title: data.title,
                value: data.value,
                category: data.category ?? 'note',
                owner: data.owner === 'man' || data.owner === 'zari' || data.owner === 'both' ? data.owner : 'both',
                createdAt: Number(data.clientCreatedAt ?? Date.now()),
              } as QuickVaultNote;
            })
            .filter((x): x is QuickVaultNote => x !== null)
            .sort((a, b) => b.createdAt - a.createdAt);
          if (items.length > 0) onVaultCb(items);
        },
        (err) => reportListenerError('vault', err)
      )
    );
  }

  if (callbacks.onPacking) {
    const onPackingCb = callbacks.onPacking;
    unsubs.push(
      onSnapshot(
        collection(db, 'spaces', spaceId, 'packing'),
        (snap) => {
          if (snap.empty) return;
          const items: PackingItem[] = snap.docs
            .map((d) => {
              const data = d.data();
              if (!data || typeof data.title !== 'string') return null;
              return {
                id: typeof data.id === 'string' ? data.id : d.id,
                title: data.title,
                template:
                  data.template === 'road' ||
                  data.template === 'flight' ||
                  data.template === 'camp' ||
                  data.template === 'custom'
                    ? data.template
                    : 'road',
                checked: Boolean(data.checked),
                owner: data.owner === 'man' || data.owner === 'zari' || data.owner === 'both' ? data.owner : 'both',
                createdAt: Number(data.clientCreatedAt ?? Date.now()),
              } as PackingItem;
            })
            .filter((x): x is PackingItem => x !== null)
            .sort((a, b) => b.createdAt - a.createdAt);
          if (items.length > 0) onPackingCb(items);
        },
        (err) => reportListenerError('packing', err)
      )
    );
  }

  if (callbacks.onEvents) {
    const onEventsCb = callbacks.onEvents;
    unsubs.push(
      onSnapshot(
        collection(db, 'spaces', spaceId, 'events'),
        (snap) => {
          if (snap.empty) return;
          const items: SpecialEventItem[] = snap.docs
            .map((d) => {
              const data = d.data();
              if (!data || typeof data.title !== 'string') return null;
              return {
                id: typeof data.id === 'string' ? data.id : d.id,
                title: data.title,
                kind:
                  data.kind === 'birthday' || data.kind === 'anniversary' || data.kind === 'occasion'
                    ? data.kind
                    : 'occasion',
                jalaliMonth: Math.max(1, Math.min(12, Number(data.jalaliMonth ?? 1))),
                jalaliDay: Math.max(1, Math.min(31, Number(data.jalaliDay ?? 1))),
                jalaliYear: typeof data.jalaliYear === 'number' ? data.jalaliYear : undefined,
                owner: data.owner === 'man' || data.owner === 'zari' || data.owner === 'both' ? data.owner : 'both',
                note: typeof data.note === 'string' && data.note ? data.note : undefined,
                createdAt: Number(data.clientCreatedAt ?? Date.now()),
              } as SpecialEventItem;
            })
            .filter((x): x is SpecialEventItem => x !== null)
            .sort((a, b) => b.createdAt - a.createdAt);
          if (items.length > 0) onEventsCb(items);
        },
        (err) => reportListenerError('events', err)
      )
    );
  }

  if (callbacks.onChores) {
    const onChoresCb = callbacks.onChores;
    unsubs.push(
      onSnapshot(
        collection(db, 'spaces', spaceId, 'chores'),
        (snap) => {
          if (snap.empty) return;
          const items: HomeChoreItem[] = snap.docs
            .map((d) => {
              const data = d.data();
              if (!data || typeof data.title !== 'string') return null;
              return {
                id: typeof data.id === 'string' ? data.id : d.id,
                title: data.title,
                area: typeof data.area === 'string' ? data.area : 'خانه',
                intervalDays: Math.max(1, Number(data.intervalDays ?? 30)),
                lastDoneDateKey: typeof data.lastDoneDateKey === 'string' ? data.lastDoneDateKey : '2026-01-01',
                nextDueDateKey: typeof data.nextDueDateKey === 'string' ? data.nextDueDateKey : '2026-01-01',
                owner: data.owner === 'man' || data.owner === 'zari' || data.owner === 'both' ? data.owner : 'both',
                createdAt: Number(data.clientCreatedAt ?? Date.now()),
              } as HomeChoreItem;
            })
            .filter((x): x is HomeChoreItem => x !== null)
            .sort((a, b) => a.nextDueDateKey.localeCompare(b.nextDueDateKey));
          if (items.length > 0) onChoresCb(items);
        },
        (err) => reportListenerError('chores', err)
      )
    );
  }

  return () => {
    for (const u of unsubs) u();
  };
}

function getUidOrNull(): string | null {
  return auth.currentUser?.uid ? sanitizeId(auth.currentUser.uid) : null;
}

export async function pushGoalToCloud(spaceId: string, goal: GoalItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(goal.id);
  const path = `spaces/${spaceId}/goals/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'goals', id);
  const fields: Record<string, unknown> = {
    title: clampStr(goal.title, 300, 'هدف'),
    owner: goal.owner,
    category: goal.category,
    timeBlock: goal.timeBlock,
    priority: goal.priority,
    completed: Boolean(goal.completed),
    dateKey: clampStr(goal.dateKey, 20),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (goal.scope === 'home' || goal.scope === 'work') {
    fields.scope = goal.scope;
  }
  if (goal.reminderTime && /^\d{2}:\d{2}$/.test(goal.reminderTime)) {
    fields.reminderTime = goal.reminderTime;
  }
  if (goal.reminderVoice) {
    fields.reminderVoice = goal.reminderVoice;
  }

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(goal.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteGoalFromCloud(spaceId: string, goalId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(goalId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'goals', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/goals/${id}`);
  }
}

export async function pushHabitToCloud(spaceId: string, habit: HabitItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(habit.id);
  const path = `spaces/${spaceId}/habits/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'habits', id);
  const dates = (habit.completedDates ?? []).slice(-365).map((d) => clampStr(d, 20));
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        title: clampStr(habit.title, 200, 'عادت'),
        owner: habit.owner,
        completedDates: dates,
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id,
        title: clampStr(habit.title, 200, 'عادت'),
        owner: habit.owner,
        completedDates: dates,
        authorUid: uid,
        updatedByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteHabitFromCloud(spaceId: string, habitId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(habitId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'habits', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/habits/${id}`);
  }
}

export async function pushGratitudeToCloud(spaceId: string, entry: GratitudeEntry): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(entry.id);
  const path = `spaces/${spaceId}/gratitudes/${id}`;
  try {
    await setDoc(doc(db, 'spaces', spaceId, 'gratitudes', id), {
      id,
      dateKey: clampStr(entry.dateKey, 20),
      jalaliDate: clampStr(entry.jalaliDate, 80, 'امروز'),
      author: entry.author,
      mood: entry.mood,
      items: [
        clampStr(entry.items[0], 300),
        clampStr(entry.items[1], 300),
        clampStr(entry.items[2], 300),
      ],
      loveNote: clampStr(entry.loveNote, 600),
      clientCreatedAt: Number(entry.createdAt || Date.now()),
      authorUid: uid,
      updatedByUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteGratitudeFromCloud(spaceId: string, entryId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(entryId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'gratitudes', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/gratitudes/${id}`);
  }
}

export async function pushCallerToCloud(spaceId: string, caller: CallerContact): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(caller.id);
  const path = `spaces/${spaceId}/callers/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'callers', id);
  const baseFields: Record<string, unknown> = {
    name: clampStr(caller.name, 120, 'مخاطب'),
    relation: clampStr(caller.relation, 80),
    template: clampStr(caller.template, 240, 'تماس از طرف {name}'),
    repeatCount: caller.repeatCount === 2 ? 2 : 1,
    chimeStyle: caller.chimeStyle,
    voiceName: caller.voiceName,
    favorite: Boolean(caller.favorite),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (caller.latinAlias) baseFields.latinAlias = clampStr(caller.latinAlias, 120);
  if (caller.persianPhonetic) baseFields.persianPhonetic = clampStr(caller.persianPhonetic, 120);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, baseFields);
    } else {
      await setDoc(ref, {
        ...baseFields,
        id,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCallerFromCloud(spaceId: string, callerId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(callerId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'callers', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/callers/${id}`);
  }
}

export async function pushScheduleToCloud(
  spaceId: string,
  schedule: ScheduledAnnouncement
): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(schedule.id);
  const path = `spaces/${spaceId}/schedules/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'schedules', id);
  const fields: Record<string, unknown> = {
    title: clampStr(schedule.title, 140, 'یادآور'),
    topic: schedule.topic,
    time: /^\d{2}:\d{2}$/.test(schedule.time) ? schedule.time : '08:00',
    enabled: Boolean(schedule.enabled),
    voiceName: schedule.voiceName,
    days: schedule.days,
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (schedule.customText) fields.customText = clampStr(schedule.customText, 600);
  if (schedule.lastTriggeredDate) {
    fields.lastTriggeredDate = clampStr(schedule.lastTriggeredDate, 20);
  }

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteScheduleFromCloud(spaceId: string, scheduleId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(scheduleId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'schedules', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/schedules/${id}`);
  }
}

export async function pushSettingsToCloud(spaceId: string, settings: AppSettings): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const path = `spaces/${spaceId}/config/settings`;
  const ref = doc(db, 'spaces', spaceId, 'config', 'settings');
  const payload = {
    theme: settings.theme === 'dark' ? 'dark' : 'light',
    defaultVoice: settings.defaultVoice,
    speechRate: Math.max(0.5, Math.min(2, Number(settings.speechRate || 1))),
    myName: clampStr(settings.myName, 60, 'بهمن'),
    partnerName: clampStr(settings.partnerName, 60, 'زری'),
    assistantName: clampStr(settings.assistantName, 40, 'هم‌صدا'),
    assistantWakeWordEnabled: Boolean(settings.assistantWakeWordEnabled ?? false),
    backgroundKeepAlive: Boolean(settings.backgroundKeepAlive),
    announceCalls: Boolean(settings.announceCalls ?? true),
    announceSms: Boolean(settings.announceSms ?? true),
    autoOpenMorning: Boolean(settings.autoOpenMorning ?? true),
    nightMovieAutoCheck: Boolean(settings.nightMovieAutoCheck ?? true),
    nightMovieTime: /^\d{2}:\d{2}$/.test(settings.nightMovieTime || '') ? settings.nightMovieTime : '22:00',
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function pushShoppingToCloud(spaceId: string, item: ShoppingItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(item.id);
  const path = `spaces/${spaceId}/shopping/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'shopping', id);
  const fields: Record<string, unknown> = {
    title: clampStr(item.title, 200, 'کالا'),
    category: item.category,
    checked: Boolean(item.checked),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (item.note?.trim()) fields.note = clampStr(item.note, 200);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(item.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteShoppingFromCloud(spaceId: string, itemId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(itemId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'shopping', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/shopping/${id}`);
  }
}

export async function pushExpenseToCloud(spaceId: string, entry: ExpenseEntry): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(entry.id);
  const path = `spaces/${spaceId}/expenses/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'expenses', id);
  const fields: Record<string, unknown> = {
    title: clampStr(entry.title, 200, 'هزینه'),
    amount: Math.max(0, Math.min(999999999999, Number(entry.amount || 0))),
    category: entry.category,
    payer: entry.payer,
    dateKey: clampStr(entry.dateKey, 20, '2026-01-01'),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (
    entry.splitMode === 'shared' ||
    entry.splitMode === 'personal' ||
    entry.splitMode === 'for_partner' ||
    entry.splitMode === 'settlement'
  ) {
    fields.splitMode = entry.splitMode;
  }
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(entry.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteExpenseFromCloud(spaceId: string, expenseId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(expenseId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'expenses', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/expenses/${id}`);
  }
}

export async function pushBillToCloud(spaceId: string, bill: BillReminderItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(bill.id);
  const path = `spaces/${spaceId}/bills/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'bills', id);
  const fields: Record<string, unknown> = {
    title: clampStr(bill.title, 200, 'قسط / قبض'),
    amount: Math.max(0, Math.min(999999999999, Number(bill.amount || 0))),
    kind: bill.kind,
    dueDateKey: clampStr(bill.dueDateKey, 20, '2026-01-01'),
    cycle: bill.cycle,
    paid: Boolean(bill.paid),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (bill.note?.trim()) fields.note = clampStr(bill.note, 240);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(bill.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteBillFromCloud(spaceId: string, billId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(billId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'bills', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/bills/${id}`);
  }
}

export async function pushMedicationToCloud(spaceId: string, med: MedicationItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(med.id);
  const path = `spaces/${spaceId}/meds/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'meds', id);
  const takenDates = (med.takenDates ?? []).slice(-365).map((d) => clampStr(d, 20));
  const fields = {
    name: clampStr(med.name, 200, 'دارو'),
    dosage: clampStr(med.dosage, 160),
    time: /^\d{2}:\d{2}$/.test(med.time) ? med.time : '08:00',
    owner: med.owner,
    kind: med.kind,
    takenDates,
    voiceRemind: Boolean(med.voiceRemind),
    enabled: Boolean(med.enabled),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(med.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteMedicationFromCloud(spaceId: string, medId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(medId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'meds', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/meds/${id}`);
  }
}

export async function pushMealPlanToCloud(spaceId: string, meal: MealPlanEntry): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(meal.id);
  const path = `spaces/${spaceId}/meals/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'meals', id);
  const fields = {
    dayLabel: clampStr(meal.dayLabel, 40, 'روز'),
    lunch: clampStr(meal.lunch, 200),
    dinner: clampStr(meal.dinner, 200),
    ingredients: clampStr(meal.ingredients, 400),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function pushVaultNoteToCloud(spaceId: string, note: QuickVaultNote): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(note.id);
  const path = `spaces/${spaceId}/vault/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'vault', id);
  const fields = {
    title: clampStr(note.title, 160, 'یادداشت'),
    value: clampStr(note.value, 500, '-'),
    category: note.category,
    owner: note.owner,
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(note.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteVaultNoteFromCloud(spaceId: string, noteId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(noteId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'vault', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/vault/${id}`);
  }
}

export async function pushPackingToCloud(spaceId: string, item: PackingItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(item.id);
  const path = `spaces/${spaceId}/packing/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'packing', id);
  const fields = {
    title: clampStr(item.title, 200, 'وسیله'),
    template: item.template,
    checked: Boolean(item.checked),
    owner: item.owner,
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(item.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deletePackingFromCloud(spaceId: string, itemId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(itemId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'packing', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/packing/${id}`);
  }
}

export async function pushSpecialEventToCloud(spaceId: string, event: SpecialEventItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(event.id);
  const path = `spaces/${spaceId}/events/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'events', id);
  const fields: Record<string, unknown> = {
    title: clampStr(event.title, 180, 'مناسبت'),
    kind: event.kind,
    jalaliMonth: Math.max(1, Math.min(12, Math.round(Number(event.jalaliMonth || 1)))),
    jalaliDay: Math.max(1, Math.min(31, Math.round(Number(event.jalaliDay || 1)))),
    owner: event.owner,
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (typeof event.jalaliYear === 'number' && event.jalaliYear >= 1300 && event.jalaliYear <= 1500) {
    fields.jalaliYear = Math.round(event.jalaliYear);
  }
  if (event.note?.trim()) {
    fields.note = clampStr(event.note, 240);
  }
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(event.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteSpecialEventFromCloud(spaceId: string, eventId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(eventId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'events', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/events/${id}`);
  }
}

export async function pushHomeChoreToCloud(spaceId: string, chore: HomeChoreItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(chore.id);
  const path = `spaces/${spaceId}/chores/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'chores', id);
  const fields = {
    title: clampStr(chore.title, 200, 'کار خانه'),
    area: clampStr(chore.area, 80, 'خانه'),
    intervalDays: Math.max(1, Math.min(3650, Math.round(Number(chore.intervalDays || 30)))),
    lastDoneDateKey: clampStr(chore.lastDoneDateKey, 20, '2026-01-01'),
    nextDueDateKey: clampStr(chore.nextDueDateKey, 20, '2026-01-01'),
    owner: chore.owner,
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(chore.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteHomeChoreFromCloud(spaceId: string, choreId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(choreId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'chores', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/chores/${id}`);
  }
}


export async function uploadLocalBundleToSpace(
  spaceId: string,
  bundle: {
    goals: GoalItem[];
    habits: HabitItem[];
    gratitudes: GratitudeEntry[];
    callers: CallerContact[];
    schedules: ScheduledAnnouncement[];
    settings: AppSettings;
    shoppingItems?: ShoppingItem[];
    expenses?: ExpenseEntry[];
    bills?: BillReminderItem[];
    meds?: MedicationItem[];
    meals?: MealPlanEntry[];
    vaultNotes?: QuickVaultNote[];
    packingItems?: PackingItem[];
    specialEvents?: SpecialEventItem[];
    homeChores?: HomeChoreItem[];
  }
): Promise<void> {
  await pushSettingsToCloud(spaceId, bundle.settings);
  await Promise.all([
    ...bundle.goals.map((g) => pushGoalToCloud(spaceId, g)),
    ...bundle.habits.map((h) => pushHabitToCloud(spaceId, h)),
    ...bundle.gratitudes.map((gr) => pushGratitudeToCloud(spaceId, gr)),
    ...bundle.callers.map((c) => pushCallerToCloud(spaceId, c)),
    ...bundle.schedules.map((s) => pushScheduleToCloud(spaceId, s)),
    ...(bundle.shoppingItems ?? []).map((sh) => pushShoppingToCloud(spaceId, sh)),
    ...(bundle.expenses ?? []).map((ex) => pushExpenseToCloud(spaceId, ex)),
    ...(bundle.bills ?? []).map((bl) => pushBillToCloud(spaceId, bl)),
    ...(bundle.meds ?? []).map((md) => pushMedicationToCloud(spaceId, md)),
    ...(bundle.meals ?? []).filter((ml) => ml.lunch || ml.dinner || ml.ingredients).map((ml) => pushMealPlanToCloud(spaceId, ml)),
    ...(bundle.vaultNotes ?? []).map((vn) => pushVaultNoteToCloud(spaceId, vn)),
    ...(bundle.packingItems ?? []).map((pk) => pushPackingToCloud(spaceId, pk)),
    ...(bundle.specialEvents ?? []).map((ev) => pushSpecialEventToCloud(spaceId, ev)),
    ...(bundle.homeChores ?? []).map((ch) => pushHomeChoreToCloud(spaceId, ch)),
  ]);
}
