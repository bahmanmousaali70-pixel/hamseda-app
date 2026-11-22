import {formatJalaliFull, toPersianDigits} from '../data/persianLibrary';
import type {
  AppSettings,
  AppTab,
  AssistantCommandResult,
  CallerContact,
  DeviceOwner,
  ExpenseCategory,
  MorningMessage,
  SyncedPhoneContact,
} from '../types/app';
import {
  extractCommandAfterWakeWord,
  getPartnerNameForDevice,
  getSelfName,
  normalizeAssistantText,
} from '../utils/deviceIdentity';
import {apiUrl, safeReadJsonResponse} from './apiConfig';
import {isNativeAndroid, searchWebNative} from './nativeAndroidBridge';
import {loadPersonalCallProfile} from '../utils/personalProfile';

export interface PendingAssistantIntent {
  type:
    | 'awaiting_sms_body'
    | 'awaiting_sms_recipient'
    | 'awaiting_sms_confirmation'
    | 'awaiting_call_confirmation'
    | 'awaiting_search_query';
  targetName?: string;
  targetPhone?: string;
  smsBody?: string;
  callScript?: string;
}

export interface AssistantEngineContext {
  settings: AppSettings;
  conversationHistory?: {role: 'user' | 'assistant'; text: string}[];
  deviceOwner: DeviceOwner;
  isOnline: boolean;
  syncedContacts: SyncedPhoneContact[];
  callers: CallerContact[];
  morningMessage: MorningMessage;
  pendingIntent: PendingAssistantIntent | null;
  homeAddress?: string;
  callbackPhone?: string;
}

function persianDigitsToAscii(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function normalizePhoneDigits(raw: string): string {
  return persianDigitsToAscii(raw).replace(/[^\d+]/g, '');
}

function getPartnerKeywords(): string[] {
  // Relationship words map to the configured partner; ordinary names such as
  // «خانومی» must still be matched against the actual phone-book entries.
  return ['همسر', 'همسرم', 'عشقم', 'عزیزم', 'شوهرم', 'اقامون'];
}

export function findBestContactMatch(
  rawQuery: string,
  syncedContacts: SyncedPhoneContact[],
  callers: CallerContact[],
  settings: Pick<AppSettings, 'myName' | 'partnerName'>,
  deviceOwner: DeviceOwner
): {name: string; phone: string} | null {
  const trimmed = rawQuery.trim();
  if (!trimmed) return null;

  // 1. Direct phone number in query
  const directDigits = normalizePhoneDigits(trimmed);
  if (directDigits.replace(/\D/g, '').length >= 5) {
    return {name: trimmed, phone: directDigits};
  }

  const rawQueryNorm = normalizeAssistantText(trimmed);
  let effectiveQuery = rawQueryNorm;
  const partnerName = getPartnerNameForDevice(settings, deviceOwner);
  const partnerNorm = normalizeAssistantText(partnerName);

  // Keep the spoken alias as a candidate. A saved contact may literally be
  // named «خانومی» even when the configured partner name is «زری».
  const isPartnerShortcut = getPartnerKeywords().includes(effectiveQuery);
  if (isPartnerShortcut) effectiveQuery = partnerNorm;

  const candidateNames = Array.from(new Set([rawQueryNorm, effectiveQuery].filter(Boolean)));
  if (effectiveQuery === 'زری' || effectiveQuery === 'زهرا') {
    candidateNames.push('zari', 'zahra', 'زری', 'زهرا');
  } else if (effectiveQuery === 'بهمن') {
    candidateNames.push('bahman', 'بهمن');
  }

  let bestScore = 0;
  let bestContact: {name: string; phone: string} | null = null;

  for (const contact of syncedContacts) {
    if (!contact.phone?.trim()) continue;
    const fields = [contact.name, contact.persianPhonetic].map((f) => normalizeAssistantText(f || '')).filter(Boolean);
    for (const q of candidateNames) {
      if (!q) continue;
      for (const f of fields) {
        let score = 0;
        if (f === q) score = 100;
        else if (f.startsWith(q) || q.startsWith(f)) score = 85;
        else if (f.includes(q)) score = 75;
        else {
          const qTokens = q.split(' ').filter((t) => t.length >= 2);
          const fTokens = f.split(' ').filter((t) => t.length >= 2);
          const overlap = qTokens.filter((t) => fTokens.some((ft) => ft === t || ft.includes(t)));
          if (overlap.length > 0) {
            score = 50 + overlap.length * 10;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestContact = {name: contact.name, phone: contact.phone};
        }
      }
    }
  }

  // Never turn a weak phonetic resemblance into a real-world action.
  // A contact must be an exact or strong prefix match, and the best result must be unique.
  if (bestContact && bestScore >= 85) {
    const equallyGood = syncedContacts.filter((contact) => {
      if (!contact.phone?.trim()) return false;
      const fields = [contact.name, contact.persianPhonetic]
        .map((f) => normalizeAssistantText(f || ''))
        .filter(Boolean);
      return fields.some((f) =>
        candidateNames.some((q) => q && (f === q ? 100 : f.startsWith(q) || q.startsWith(f) ? 85 : 0) === bestScore)
      );
    });
    const uniquePhones = new Set(equallyGood.map((contact) => normalizePhoneDigits(contact.phone)));
    if (uniquePhones.size === 1) return bestContact;
  }

  // 3. Fallback: check saved CallerContacts and cross-match to syncedContacts if available
  for (const caller of callers) {
    const fields = [caller.name, caller.latinAlias || '', caller.persianPhonetic || '']
      .map((f) => normalizeAssistantText(f))
      .filter(Boolean);
    for (const q of candidateNames) {
      if (!q) continue;
      if (fields.some((f) => f === q || f.includes(q) || q.includes(f))) {
        // See if any syncedContact matches this caller name
        const synced = syncedContacts.find((sc) => {
          const scNorm = normalizeAssistantText(sc.name);
          const phNorm = normalizeAssistantText(sc.persianPhonetic);
          return fields.some((cf) => scNorm.includes(cf) || phNorm.includes(cf));
        });
        if (synced?.phone) {
          return {name: synced.name, phone: synced.phone};
        }
      }
    }
  }

  return null;
}

function getCurrentPersianTimeAndDate(): {timeStr: string; dateStr: string} {
  const now = new Date();
  const clockParts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hh = clockParts.find((part) => part.type === 'hour')?.value ?? '00';
  const mm = clockParts.find((part) => part.type === 'minute')?.value ?? '00';
  const timeStr = `${toPersianDigits(hh)} و ${toPersianDigits(mm)} دقیقه`;
  const dateStr = formatJalaliFull(now);
  return {timeStr, dateStr};
}

function extractRecipientAndSmsBody(command: string): {targetRaw: string; bodyRaw: string} {
  let cleaned = command
    .replace(/^(لطفاً|لطفا|میشه|می‌شه|می شه)\s+/i, '')
    .trim();

  // Check if user specified message body inline (e.g. "به علی پیامک بده بگو سلام")
  let bodyRaw = '';
  const bodyMatch = cleaned.match(/(?:بگو|بنوس|بنویس|متنش|با متن|که)\s+(.+)$/);
  if (bodyMatch && bodyMatch.index !== undefined) {
    bodyRaw = bodyMatch[1].trim();
    cleaned = cleaned.slice(0, bodyMatch.index).trim();
  }

  const targetRaw = cleaned
    .replace(/^(یه |یک )?(پیامک|اس ام اس|اس‌ام‌اس|پیام|مسیج)\s*(بده|بفرست|ارسال کن)\s*(به|برای)?\s*/i, '')
    .replace(/^(به|برای)\s+/i, '')
    .replace(/\s*(پیامک|اس ام اس|اس‌ام‌اس|پیام|مسیج)\s*(بده|بفرست|ارسال کن).*$/i, '')
    .replace(/\s+(بده|بفرست|ارسال کن)$/i, '')
    .trim();

  return {targetRaw, bodyRaw};
}

function extractCallTargetAndMessage(command: string): {
  targetRaw: string;
  messageRaw: string;
  wantsOrderOrAddress: boolean;
} {
  let cleaned = command
    .replace(/^(لطفاً|لطفا|میشه|می‌شه|می شه)\s+/i, '')
    .trim();

  let messageRaw = '';
  const msgMatch = cleaned.match(
    /(?:(?:و\s+)?(?:این پیام(?:\s*(?:رو|را))?\s*(?:بهش|به او)?\s*)?(?:بگو|بهش بگو|پیام بده که|پیام را بگو)|(?:و\s+)?(?:یک |یه )?(?:سفارش بده|سفارش بگیر|بگو بفرسته|بفرستن))\s*(?:که\s+)?(.+)?$/i
  );
  if (msgMatch && msgMatch.index !== undefined) {
    const matchedPhrase = msgMatch[0].trim();
    const afterClause = (msgMatch[1] || '').trim();
    if (/سفارش/.test(matchedPhrase) && !/^بگو/.test(matchedPhrase)) {
      messageRaw = matchedPhrase.replace(/^و\s+/, '').trim();
    } else {
      messageRaw = afterClause;
    }
    cleaned = cleaned.slice(0, msgMatch.index).trim();
  } else {
    const simpleOrderMatch = cleaned.match(/(?:یک|یه)\s+([^،,]+?)\s+سفارش\s+بده.*$/i);
    if (simpleOrderMatch && simpleOrderMatch.index !== undefined) {
      messageRaw = `لطفاً یک ${simpleOrderMatch[1].trim()} ارسال کنید`;
      cleaned = cleaned.slice(0, simpleOrderMatch.index).trim();
    }
  }

  const targetRaw = cleaned
    .replace(/^(با|به)\s+/i, '')
    .replace(/\s*(تماس بگیر|زنگ بزن|شماره بگیر|شماره‌گیری کن|تلفن بزن|تلفن کن).*$/i, '')
    .replace(/^(تماس بگیر|زنگ بزن|شماره بگیر|شماره‌گیری کن|تلفن بزن|تلفن کن)\s*(با|به)?\s*/i, '')
    .replace(/\s*(رو بگیر|را بگیر)$/i, '')
    .trim();

  const wantsOrderOrAddress =
    /(سفارش|پیتزا|غذا|رستوران|فست‌فود|فست فود|ساندویچ|پیک|ارسال کن|بفرست|آدرس|نشانی|تلفن|شماره من|شماره‌ام)/.test(
      command
    );

  return {targetRaw, messageRaw, wantsOrderOrAddress};
}

function buildProxyCallScript(
  messageRaw: string,
  wantsOrderOrAddress: boolean,
  homeAddress: string,
  callbackPhone: string,
  selfName: string
): {script: string; missingAddressWarning: boolean} {
  const cleanMsg = messageRaw.trim();
  if (!cleanMsg && !wantsOrderOrAddress) {
    return {script: '', missingAddressWarning: false};
  }
  const parts: string[] = [];
  parts.push(`سلام، وقت بخیر. از طرف ${selfName} تماس می‌گیرم.`);
  if (cleanMsg) {
    parts.push(cleanMsg.endsWith('.') || cleanMsg.endsWith('؟') ? cleanMsg : `${cleanMsg}.`);
  }
  let missingAddressWarning = false;
  if (wantsOrderOrAddress) {
    if (homeAddress || callbackPhone) {
      if (homeAddress) parts.push(`نشانی ارسال: ${homeAddress}.`);
      if (callbackPhone) parts.push(`شماره تماس هماهنگی: ${callbackPhone}.`);
    } else {
      missingAddressWarning = true;
    }
  }
  return {script: parts.join(' '), missingAddressWarning};
}

export function parseOfflineAssistantCommand(
  rawTranscript: string,
  ctx: AssistantEngineContext
): AssistantCommandResult | null {
  const selfName = getSelfName(ctx.settings, ctx.deviceOwner);
  const assistantName = ctx.settings.assistantName?.trim() || 'هم‌صدا';
  const wake = extractCommandAfterWakeWord(rawTranscript, assistantName);

  if (wake.matched && wake.onlyWakeWord) {
    return {
      action: 'answer',
      replyText: `جانم ${selfName}؟ گوش می‌کنم، بفرمایید.`,
    };
  }

  const commandRaw = wake.matched ? wake.command : rawTranscript.trim();
  const norm = normalizeAssistantText(commandRaw);
  if (!norm) return null;

  // Cancellation always wins while a sensitive operation is pending.
  if (ctx.pendingIntent && /^(لغو(ش)? کن|لغو|کنسل(ش)? کن|کنسل|بی ?خیال|بیخیال|ولش کن|نفرست|زنگ نزن|تماس نگیر|پشیمون شدم|انصراف|نه|خیر)$/.test(norm)) {
    return {action: 'answer', replyText: ctx.pendingIntent.type === 'awaiting_call_confirmation'
      ? 'باشه، تماس لغو شد و شماره‌گیری انجام نمی‌دم.'
      : ctx.pendingIntent.type === 'awaiting_search_query'
        ? 'باشه، جستجو لغو شد.'
        : 'باشه، پیامک لغو شد و هیچ پیامی ارسال نمی‌شه.'};
  }
  if (ctx.pendingIntent?.type === 'awaiting_sms_confirmation') {
    if (/^(تایید|تأیید|بله|آره|اره|درسته|درست است|ارسال کن|بفرست|اوکی|باشه|تایید ارسال پیامک|تأیید ارسال پیامک|تایید و ارسال|تأیید و ارسال)$/.test(norm)) {
      return {action: 'send_sms', targetName: ctx.pendingIntent.targetName, targetPhone: ctx.pendingIntent.targetPhone, smsBody: ctx.pendingIntent.smsBody, replyText: 'تأیید شد؛ پیامک را ارسال می‌کنم.'};
    }
    return {action: 'answer', replyText: 'پیام هنوز ارسال نشده. برای ارسال بگو «تأیید» و برای انصراف بگو «لغو کن».'};
  }
  if (ctx.pendingIntent?.type === 'awaiting_call_confirmation') {
    if (/^(تایید|تأیید|بله|آره|اره|درسته|درست است|تماس بگیر|زنگ بزن|اوکی|باشه|تایید تماس|تأیید تماس|تایید و برقراری تماس|تأیید و برقراری تماس)$/.test(norm)) {
      return {
        action: 'make_call',
        targetName: ctx.pendingIntent.targetName,
        targetPhone: ctx.pendingIntent.targetPhone,
        callScript: ctx.pendingIntent.callScript,
        replyText: ctx.pendingIntent.callScript
          ? 'تأیید شد؛ شماره‌گیر باز می‌شود و متن پیام هم آماده خواندن روی اسپیکر است.'
          : 'تأیید شد؛ شماره‌گیر را باز می‌کنم.',
      };
    }
    return {action: 'answer', replyText: 'تماس هنوز برقرار نشده. برای تماس بگو «تأیید» و برای انصراف بگو «لغو کن».'};
  }

  // Handle pending SMS conversation turn first
  if (ctx.pendingIntent?.type === 'awaiting_sms_body') {
    if (/^(لغو|کنسل|بی خیال|بیخیال|نفرست|ولش کن|پشیمون شدم|انصراف)/.test(norm)) {
      return {
        action: 'answer',
        replyText: 'باشه، ارسال پیامک لغو شد.',
      };
    }
    const smsBody = commandRaw.replace(/^(بگو|بنویس|بنوس|متنش|پیامش)\s+/i, '').trim();
    if (smsBody) {
      return {
        action: 'send_sms',
        targetName: ctx.pendingIntent.targetName,
        targetPhone: ctx.pendingIntent.targetPhone,
        smsBody,
        replyText: `پیامک به ${ctx.pendingIntent.targetName || 'مخاطب'} با متن «${smsBody}» ارسال می‌شود.`,
      };
    }
  }

  if (ctx.pendingIntent?.type === 'awaiting_sms_recipient') {
    if (/^(لغو|کنسل|بی خیال|بیخیال|نفرست|ولش کن|انصراف)/.test(norm)) {
      return {
        action: 'answer',
        replyText: 'باشه، ارسال پیامک لغو شد.',
      };
    }
    const matched = findBestContactMatch(
      commandRaw,
      ctx.syncedContacts,
      ctx.callers,
      ctx.settings,
      ctx.deviceOwner
    );
    if (matched) {
      return {
        action: 'ask_sms_body',
        targetName: matched.name,
        targetPhone: matched.phone,
        replyText: `متن پیامک برای ${matched.name} چی باشه؟`,
      };
    }
    return {
      action: 'ask_sms_body',
      replyText: `مخاطبی با نام «${commandRaw}» در دفترچه همگام‌شده پیدا نشد. لطفاً نام کامل مخاطب را بگویید یا برای انصراف بگویید «لغو کن».`,
    };
  }

  // 1. Time & Date
  if (
    /(ساعت چنده|ساعت چیه|چند ساعته|تایم چنده|الان ساعت|تاریخ امروز|امروز چندمه|امروز چه روزی)/.test(norm) ||
    norm === 'ساعت' ||
    norm === 'تاریخ'
  ) {
    const {timeStr, dateStr} = getCurrentPersianTimeAndDate();
    if (norm.includes('تاریخ') || norm.includes('چندمه') || norm.includes('چه روزی')) {
      return {
        action: 'tell_time',
        replyText: `${selfName} جان، امروز ${dateStr} و ساعت ${timeStr} است.`,
      };
    }
    return {
      action: 'tell_time',
      replyText: `${selfName} جان، الان ساعت ${timeStr} و امروز ${dateStr} است.`,
    };
  }

  // 2. End Call
  if (
    /(قطع کن تماس|تماس رو قطع|تماس را قطع|گوشی رو قطع|گوشی را قطع|تلفن رو قطع|تلفن را قطع|پایان تماس)/.test(norm)
  ) {
    return {
      action: 'end_call',
      replyText: 'باشه، تماس قطع می‌شود.',
    };
  }

  // 3. Audio Recording Stop (check BEFORE start!)
  if (
    /(ضبط رو متوقف|ضبط را متوقف|ضبط صدا رو قطع|ضبط را قطع|توقف ضبط|پایان ضبط|ضبط رو ببند|بسه ضبط)/.test(norm)
  ) {
    return {
      action: 'record_audio_stop',
      replyText: 'ضبط صدا متوقف و ذخیره می‌شود.',
    };
  }

  // 4. Camera Photo & Video & Audio Record Start
  if (/(عکس بگیر|عکس بنداز|عکس بگیرم|یه عکس|یک عکس|ی عکس|عکسی بگیر|عکاسی کن|دوربین عکس|دکمه شاتر|شاتر( رو| را)? بزن|عکس( رو| را)? ثبت کن|تصویر بگیر|یه دونه عکس|ازم عکس بگیر)/.test(norm)) {
    return {
      action: 'take_photo',
      replyText: 'دوربین را برای گرفتن عکس باز می‌کنم.',
    };
  }

  if (/(فیلم بگیر|فیلم برداری|فیلمبرداری|ویدیو بگیر|ویدئو بگیر|ضبط ویدیو|ضبط ویدئو|فیلم رو شروع کن|فیلم را شروع کن|فیلمبرداری رو شروع کن|فیلمبرداری را شروع کن)/.test(norm)) {
    return {
      action: 'record_video',
      replyText: 'دوربین فیلم‌برداری را باز می‌کنم.',
    };
  }

  if (/(ضبط صدا|صدا ضبط کن|صدا را ضبط|صدا رو ضبط|ضبط کن)/.test(norm)) {
    return {
      action: 'record_audio_start',
      replyText: 'در حال شروع ضبط صدا روی گوشی هستم.',
    };
  }

  // 4b. Flashlight On / Off
  if (/(چراغ قوه|فلش|فلاش)/.test(norm)) {
    if (/(خاموش|ببند|قطع)/.test(norm)) {
      return {action: 'flashlight_off', replyText: 'چراغ قوه گوشی خاموش می‌شود.'};
    }
    return {action: 'flashlight_on', replyText: 'چراغ قوه گوشی روشن می‌شود.'};
  }

  // 4c. Screen Brightness
  if (/(نور صفحه|روشنایی صفحه|روشنایی گوشی|نور گوشی)/.test(norm)) {
    if (/(حداکثر|تا اخر|بالاترین|زیادترین)/.test(norm)) {
      return {action: 'brightness_max', replyText: 'نور صفحه نمایش روی حداکثر تنظیم می‌شود.'};
    }
    if (/(حداقل|کمترین|خیلی کم|تاریک)/.test(norm)) {
      return {action: 'brightness_min', replyText: 'نور صفحه نمایش به حداقل می‌رسد.'};
    }
    if (/(زیاد|بیشتر|بالا)/.test(norm)) {
      return {action: 'brightness_up', replyText: 'نور صفحه نمایش افزایش می‌یابد.'};
    }
    if (/(کم|پایین)/.test(norm)) {
      return {action: 'brightness_down', replyText: 'نور صفحه نمایش کاهش می‌یابد.'};
    }
  }

  // 4d. Quick Connectivity Settings (Wi-Fi / Internet / Bluetooth / Location)
  if (/(وای فای|وایفای|wifi)/.test(norm) && /(تنظیم|باز|روشن|خاموش|وصل|قطع|پنل)/.test(norm)) {
    return {action: 'open_wifi_settings', replyText: 'پنل سریع وای‌فای و اینترنت باز می‌شود.'};
  }
  if (/(دیتا|اینترنت همراه|نت گوشی|اینترنت گوشی)/.test(norm) && /(تنظیم|باز|روشن|خاموش|وصل|قطع|پنل)/.test(norm)) {
    return {action: 'open_mobile_data_settings', replyText: 'پنل سریع اینترنت و شبکه باز می‌شود.'};
  }
  if (/(بلوتوث|bluetooth)/.test(norm)) {
    return {action: 'open_bluetooth_settings', replyText: 'تنظیمات بلوتوث گوشی باز می‌شود.'};
  }
  if (/(لوکیشن|مکان یاب|جی پی اس|gps)/.test(norm) && /(تنظیم|باز|روشن|خاموش)/.test(norm)) {
    return {action: 'open_location_settings', replyText: 'تنظیمات مکان‌یاب گوشی باز می‌شود.'};
  }

  // 4e. Alarm & Timer
  if (/(الارم|بیدارباش|ساعت زنگ)/.test(norm)) {
    const asciiCmd = persianDigitsToAscii(commandRaw);
    const timeMatch = asciiCmd.match(/(\d{1,2})(?::| و )?(\d{1,2})?/);
    let hour = timeMatch ? parseInt(timeMatch[1], 10) : 7;
    const minute = timeMatch?.[2] ? parseInt(timeMatch[2], 10) : 0;
    if ((norm.includes('عصر') || norm.includes('شب')) && hour < 12) hour += 12;
    return {
      action: 'set_alarm',
      alarmHour: Math.max(0, Math.min(23, hour)),
      alarmMinute: Math.max(0, Math.min(59, minute)),
      goalTitle: 'یادآور دستیار',
      replyText: `آلارم برای ساعت ${toPersianDigits(String(hour).padStart(2, '0'))}:${toPersianDigits(String(minute).padStart(2, '0'))} تنظیم می‌شود.`,
    };
  }
  if (norm.includes('تایمر')) {
    const asciiCmd = persianDigitsToAscii(commandRaw);
    const numMatch = asciiCmd.match(/(\d{1,3})/);
    const mins = numMatch ? Math.max(1, parseInt(numMatch[1], 10)) : 5;
    return {
      action: 'set_timer',
      timerMinutes: mins,
      goalTitle: 'تایمر دستیار',
      replyText: `تایمر ${toPersianDigits(mins)} دقیقه‌ای تنظیم می‌شود.`,
    };
  }

  // 4f. Direct URL open or explicit File Download URL
  const directUrlMatch = commandRaw.match(/https?:\/\/\S+/i);
  if (directUrlMatch?.[0]) {
    const url = directUrlMatch[0];
    if (norm.includes('دانلود')) {
      return {
        action: 'download_url',
        downloadUrl: url,
        downloadTitle: 'فایل درخواستی',
        replyText: 'دانلود مستقیم فایل در نوار اعلان گوشی شروع می‌شود.',
      };
    }
    return {
      action: 'open_url',
      downloadUrl: url,
      replyText: 'لینک مورد نظر در مرورگر گوشی باز می‌شود.',
    };
  }

  // 4g. Navigation / Maps
  if (/^(?:مسیر|مسیریابی|نقشه)\s+(?:به|تا|سمت)?\s*(.+)$/.test(norm)) {
    const dest = commandRaw.replace(/^(?:مسیر|مسیریابی|نقشه)\s*(?:به|تا|سمت)?\s*/i, '').trim();
    if (dest) {
      return {
        action: 'open_navigation',
        query: dest,
        replyText: `مسیریاب برای «${dest}» باز می‌شود.`,
      };
    }
  }

  // 4h. Open or leave an installed app using everyday speech.
  const knownApps = [
    'دوربین',
    'تلگرام',
    'واتساپ',
    'واتس‌اپ',
    'اینستاگرام',
    'اینستا',
    'روبیکا',
    'ایتا',
    'بله',
    'اسنپ',
    'نشان',
    'بلد',
    'گوگل مپ',
    'دیوار',
    'دیجی کالا',
    'دیجیکالا',
    'یوتیوب',
    'کروم',
    'ماشین حساب',
    'گالری',
    'تنظیمات',
    'کافه بازار',
    'بازار',
    'مایکت',
    'ساعت',
  ];
  const matchedApp = knownApps.find((a) => norm.includes(normalizeAssistantText(a))) || '';
  if (matchedApp && /(ببند|بندش|خارج شو|بیا بیرون|برو بیرون|جمعش کن|ازش بیا بیرون|ازش خارج شو)/.test(norm)) {
    return {action: 'close_app', targetName: matchedApp, query: matchedApp,
      replyText: `از ${matchedApp} خارج می‌شوم و به صفحه اصلی برمی‌گردم.`};
  }
  if (matchedApp && /(باز کن|بازش کن|اجرا کن|بیار بالا|برو تو|برو داخل|بزن تو|برو توی|برو داخلش|بیارش بالا)/.test(norm) && !/(تب |بخش )/.test(norm)) {
    return {action: matchedApp === 'دوربین' ? 'take_photo' : 'open_app',
      targetName: matchedApp, query: matchedApp,
      replyText: matchedApp === 'دوربین' ? 'دوربین را باز می‌کنم.' : `در حال باز کردن «${matchedApp}» هستم.`};
  }


  const typeMatch = commandRaw.match(/^(?:تایپ کن|بنویس توی کادر|تو کادر بنویس)\s+(.+)$/);
  if (typeMatch && typeMatch[1].trim()) {
    return {action: 'accessibility_type', query: typeMatch[1].trim(),
      replyText: 'متن را در کادر فعال می‌نویسم.'};
  }
  if (/^(برو پایین|صفحه رو پایین ببر|اسکرول پایین|پایین تر برو)$/.test(norm)) {
    return {action: 'accessibility_scroll', query: 'down', replyText: 'صفحه را پایین می‌برم.'};
  }
  if (/^(برو بالا|صفحه رو بالا ببر|اسکرول بالا|بالاتر برو)$/.test(norm)) {
    return {action: 'accessibility_scroll', query: 'up', replyText: 'صفحه را بالا می‌برم.'};
  }

  // Natural UI interaction: "روی ارسال بزن", "روی جستجو کلیک کن".
  const tapMatch = commandRaw.match(/(?:روی|روى|رو)\s+(.+?)\s+(?:بزن|کلیک کن|لمس کن|انتخاب کن)$/);
  if (tapMatch && tapMatch[1].trim().length > 1) {
    const label = tapMatch[1].trim();
    return {action: 'accessibility_click', query: label,
      replyText: `روی «${label}» می‌زنم.`};
  }

  // 5. Ringer / Silent / Vibrate / Normal
  if (/(سایلنت|حالت سکوت|گوشی رو بی صدا|گوشی را بی صدا|ساکت کن گوشی)/.test(norm)) {
    return {
      action: 'ringer_silent',
      replyText: 'گوشی را روی حالت سکوت و سایلنت می‌گذارم.',
    };
  }

  if (/(ویبره|حالت لرزش|لرزش بگذار|روی ویبره)/.test(norm)) {
    return {
      action: 'ringer_vibrate',
      replyText: 'گوشی روی حالت ویبره قرار می‌گیرد.',
    };
  }

  if (/(حالت عادی|از سایلنت در بیار|از سکوت در بیار|بزار رو صدا|بذار روی صدا|زنگدار کن)/.test(norm)) {
    return {
      action: 'ringer_normal',
      replyText: 'حالت زنگ گوشی به وضعیت عادی برمی‌گردد.',
    };
  }

  // 6. Media Volume: check explicit minimum/down BEFORE maximum so
  // "صدا رو تا آخر کم کن" can never be mistaken for "تا آخر زیاد کن".
  if (/(صدا|ولوم|حجم صدا).*(تا اخر|تا ته|ته).*(کم|پایین|صفر)/.test(norm) ||
      /(صدا|ولوم|حجم صدا).*(کمترین|حداقل|صفر)/.test(norm)) {
    return {
      action: 'volume_min',
      replyText: 'صدای رسانه و زنگ گوشی تا حداقل پایین آورده شد.',
    };
  }

  if (/(صدا رو ببند|قطع صدا|میوت کن|صدا رو قطع کن|صدای گوشی رو قطع)/.test(norm)) {
    return {
      action: 'volume_mute',
      replyText: 'صدای رسانه گوشی قطع شد.',
    };
  }

  if (/(صدا.*حداکثر|صدا.*تا اخر|بلندترین صدا|ماکزیمم صدا)/.test(norm) &&
      !/(کم|پایین|صفر|قطع)/.test(norm)) {
    return {
      action: 'volume_max',
      replyText: 'صدای گوشی روی حداکثر تنظیم شد.',
    };
  }

  if (/(صدا.*زیاد|بلندتر کن|ببر بالا صدا|ولوم بالا)/.test(norm)) {
    return {
      action: 'volume_up',
      replyText: 'صدای گوشی بیشتر شد.',
    };
  }

  if (/(صدا.*کم|اروم تر کن|آروم تر کن|بیار پایین صدا|ولوم پایین)/.test(norm)) {
    return {
      action: 'volume_down',
      replyText: 'صدای گوشی کمتر شد.',
    };
  }

  // Telegram requests must never be treated as SMS.
  if (/تلگرام/.test(norm) && /(پیام|مسیج|بنویس|بفرست|ارسال)/.test(norm)) return {action: 'open_app', targetName: 'تلگرام', query: 'تلگرام', replyText: 'تلگرام را باز می‌کنم؛ اما ارسال پیام تلگرام را خودکار انجام نمی‌دهم. مخاطب و متن را داخل خود تلگرام بررسی و ارسال کن.'};

  // 7. Send SMS
  if (/(پیامک|اس ام اس|اس‌ام‌اس|پیام بده|پیام بفرست|مسیج)/.test(norm)) {
    const {targetRaw, bodyRaw} = extractRecipientAndSmsBody(commandRaw);
    if (!targetRaw) {
      return {
        action: 'ask_sms_body',
        replyText: 'به چه کسی پیامک بدم؟ لطفاً نام مخاطب را بگویید.',
      };
    }
    const contact = findBestContactMatch(
      targetRaw,
      ctx.syncedContacts,
      ctx.callers,
      ctx.settings,
      ctx.deviceOwner
    );
    if (!contact) {
      return {
        action: 'answer',
        replyText: `مخاطبی با نام «${targetRaw}» در دفترچه تلفن همگام‌شده پیدا نشد. از تب تماس و پیامک دفترچه را همگام کنید یا نام کامل را بگویید.`,
      };
    }
    if (bodyRaw) {
      return {
        action: 'send_sms',
        targetName: contact.name,
        targetPhone: contact.phone,
        smsBody: bodyRaw,
        replyText: `در حال ارسال پیامک به ${contact.name} هستم.`,
      };
    }
    return {
      action: 'ask_sms_body',
      targetName: contact.name,
      targetPhone: contact.phone,
      replyText: `متن پیامک برای ${contact.name} چی باشه؟`,
    };
  }

  // 8. Make Phone Call (with optional proxy message & auto delivery address/phone)
  if (/(تماس بگیر|زنگ بزن|شماره بگیر|شماره‌گیری|تلفن بزن|تلفن کن)/.test(norm)) {
    const {targetRaw, messageRaw, wantsOrderOrAddress} = extractCallTargetAndMessage(commandRaw);
    if (!targetRaw) {
      return {
        action: 'answer',
        replyText: 'نام شخص یا شماره مورد نظر برای تماس را نفرمودید. با چه کسی تماس بگیرم؟',
      };
    }
    const contact = findBestContactMatch(
      targetRaw,
      ctx.syncedContacts,
      ctx.callers,
      ctx.settings,
      ctx.deviceOwner
    );
    if (!contact || !contact.phone) {
      return {
        action: 'answer',
        replyText: `شماره «${targetRaw}» در دفترچه تلفن همگام‌شده پیدا نشد. لطفاً در تب تماس و پیامک دکمه همگام‌سازی دفترچه تلفن را بزنید یا شماره را مستقیم در دستور بنویسید.`,
      };
    }
    const storedProfile = loadPersonalCallProfile();
    const homeAddress = (ctx.homeAddress ?? storedProfile.homeAddress).trim();
    const callbackPhone = (ctx.callbackPhone ?? storedProfile.callbackPhone).trim();
    const {script, missingAddressWarning} = buildProxyCallScript(
      messageRaw,
      wantsOrderOrAddress,
      homeAddress,
      callbackPhone,
      selfName
    );
    return {
      action: 'make_call',
      targetName: contact.name,
      targetPhone: contact.phone,
      callScript: script || undefined,
      includeAddressAndPhone: wantsOrderOrAddress,
      replyText: missingAddressWarning
        ? `شماره ${contact.name} آماده است؛ اما هنوز نشانی و تلفن هماهنگی را در بخش «نشانی و تلفن تماس» ثبت نکرده‌اید تا به متن سفارش اضافه شود.`
        : script
          ? `متن پیام تماس با ${contact.name} آماده شد.`
          : `در حال شماره‌گیری برای ${contact.name} هستم.`,
    };
  }

  if (norm.includes('پادکست') && /(پخش|گوش|پیدا|جستجو|بذار|بگذار)/.test(norm)) {
    const query = commandRaw.replace(/^(لطفا|لطفاً)\s+/, '').replace(/(رو|را)?\s*(پخش کن|بذار|بگذار|پیدا کن|جستجو کن|گوش بده)$/,'').trim();
    return {
      action: 'play_podcast',
      query: query || 'پادکست فارسی',
      replyText: 'پادکست‌ها را جستجو می‌کنم و قسمت‌های قابل پخش را می‌آورم.',
    };
  }

  // 9. Radio / Music / Stop Audio
  if (/(پخش رو قطع|موزیک رو قطع|اهنگ رو قطع|رادیو رو قطع|ساکت شو|پخش متوقف|توقف پخش)/.test(norm)) {
    return {
      action: 'stop_audio',
      replyText: 'پخش صدا متوقف شد.',
    };
  }

  if (norm.includes('رادیو') && /(بذار|بگذار|پخش|باز|گوش)/.test(norm)) {
    let query = commandRaw.replace(/^(لطفا|لطفاً)\s+/,'').replace(/(رو|را)?\s*(پخش کن|بذار|بگذار|باز کن|گوش بده|پخش)$/,'').trim();
    if (!query || /^(رادیو|رادیوها)$/.test(normalizeAssistantText(query))) query = 'iran';
    else if (/(جهان|خارجی|بین المللی)/.test(norm)) query = 'world';
    else if (/(ارام|لایت|پیانو)/.test(norm)) query = 'chill';
    return {
      action: 'play_radio',
      query,
      replyText: 'ایستگاه رادیویی را جستجو و آماده پخش می‌کنم.',
    };
  }

  if ((norm.includes('موزیک') || norm.includes('اهنگ') || norm.includes('موسیقی')) && /(بذار|بگذار|پخش|گوش)/.test(norm)) {
    return {
      action: 'play_music',
      query: commandRaw,
      replyText: 'بخش موزیک شبانه را باز می‌کنم.',
    };
  }

  // 10. Morning Message Readout
  if (/(پیام صبح|پیام امروز|پیام روز رو بخوان|پیام صبحگاهی)/.test(norm)) {
    return {
      action: 'answer',
      replyText: `${ctx.morningMessage.title}. ${ctx.morningMessage.message} ${ctx.morningMessage.affirmation}`,
    };
  }

  // 10b. Daily 30-second Morning / Evening Briefing
  if (/(گزارش روز|گزارش شروع روز|خلاصه روز|خلاصه امروز|جمع‌بندی امشب|جمع بندی امشب|گزارش ۳۰ ثانیه|گزارش 30 ثانیه|وضعیت امروز)/.test(norm)) {
    const isEvening = /(امشب|شب|پایان روز)/.test(norm) || new Date().getHours() >= 17;
    return {
      action: 'daily_briefing',
      briefingMode: isEvening ? 'evening' : 'morning',
      replyText: isEvening ? 'در حال آماده‌سازی جمع‌بندی امشب هستم.' : 'در حال آماده‌سازی گزارش شروع روز هستم.',
    };
  }

  // 10c. Drive / Road Mode
  if (/(حالت رانندگی|حالت جاده|مود ماشین|مود رانندگی|صفحه رانندگی)/.test(norm)) {
    return {
      action: 'open_drive_mode',
      replyText: 'حالت ایمن رانندگی هم‌صدا با دکمه‌های بزرگ باز شد.',
    };
  }

  // 10d. Voice Shopping List Add
  if (/(لیست خرید|سبد خرید|بخرم|بخریم)/.test(norm) && /(اضافه کن|بنویس|ثبت کن|بذار|بگذار)/.test(norm)) {
    const cleanedItemsStr = commandRaw
      .replace(/^(لطفاً|لطفا|میشه|می‌شه)\s+/i, '')
      .replace(/(رو|را)?\s*(توی|تو|به|در)?\s*(لیست خرید|سبد خرید)\s*(اضافه کن|بنویس|ثبت کن|بذار|بگذار).*$/i, '')
      .replace(/^(توی|تو|به|در)?\s*(لیست خرید|سبد خرید)\s*(اضافه کن|بنویس|ثبت کن|بذار|بگذار)[:،]?\s*/i, '')
      .trim();
    const items = cleanedItemsStr
      .split(/\s*(?:،|,|\n|\s+و\s+)\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    if (items.length > 0) {
      return {
        action: 'add_shopping_item',
        shoppingItems: items,
        replyText: `${items.join(' و ')} به لیست خرید اضافه ${items.length > 1 ? 'شدند' : 'شد'}.`,
      };
    }
  }

  // 10e. Voice Expense Log
  if (/(هزینه|خرج|خریدم|پرداخت کردم|واریز کردم)/.test(norm) && /(ثبت کن|بنویس|اضافه کن|تومن|تومان|هزار|میلیون)/.test(norm)) {
    const asciiRaw = persianDigitsToAscii(commandRaw);
    const numMatch = asciiRaw.match(/(\d+(?:[.,/]\d+)?)\s*(میلیون|تومن|تومان|هزار)?/);
    if (numMatch) {
      let baseNum = parseFloat(numMatch[1].replace(/,/g, '').replace('/', '.'));
      const afterNum = norm.slice(Math.max(0, norm.indexOf(numMatch[1]) + numMatch[1].length));
      if (numMatch[2] === 'میلیون' || /^ ?میلیون/.test(afterNum)) {
        baseNum = Math.round(baseNum * 1_000_000);
      } else if (
        numMatch[2] === 'هزار' ||
        /هزار/.test(asciiRaw) ||
        (baseNum < 5000 && /(تومن|تومان)/.test(norm) && /(هزار|هزین|خرج|خرید)/.test(norm) && baseNum >= 1 && !asciiRaw.includes('000'))
      ) {
        if (/هزار/.test(asciiRaw)) {
          baseNum = Math.round(baseNum * 1000);
        }
      }
      const amount = Math.round(baseNum);
      if (amount > 0) {
        let expenseTitle = commandRaw
          .replace(new RegExp(numMatch[1].replace('.', '\\.'), 'g'), '')
          .replace(/(میلیون|هزار|تومان|تومن|هزینه|خرج|خریدم|پرداخت کردم|بابت|برای|ثبت کن|بنویس|اضافه کن|رو|را)/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!expenseTitle) expenseTitle = 'هزینه روزانه';

        let expenseCategory: ExpenseCategory = 'other';
        if (/(میوه|نان|نون|شیر|غذا|رستوران|سوپر|گوشت|مرغ|برنج|خرید)/.test(norm)) expenseCategory = 'food';
        else if (/(قبض|برق|آب|گاز|شارژ|اجاره|قسط|اینترنت)/.test(norm)) expenseCategory = 'bills';
        else if (/(بنزین|اسنپ|تاکسی|خودرو|ماشین|تعمیر|روغن|مترو)/.test(norm)) expenseCategory = 'transport';
        else if (/(دارو|دکتر|پزشک|داروخانه|ویزیت|بیمارستان)/.test(norm)) expenseCategory = 'health';
        else if (/(هدیه|کادو|مهمان|خانواده)/.test(norm)) expenseCategory = 'family';

        return {
          action: 'add_expense',
          expenseTitle,
          expenseAmount: amount,
          expenseCategory,
          replyText: `هزینه «${expenseTitle}» به مبلغ ${toPersianDigits(amount.toLocaleString('en-US'))} تومان ثبت شد.`,
        };
      }
    }
  }

  // 11. Add Goal
  const goalMatch = commandRaw.match(/(?:هدف|کار|یادآور)\s*(?:جدید\s*)?(?:اضافه کن|ثبت کن|بنویس)[:،]?\s*(.+)$/);
  if (goalMatch?.[1]?.trim()) {
    const goalTitle = goalMatch[1].trim();
    return {
      action: 'add_goal',
      goalTitle,
      replyText: `هدف «${goalTitle}» به لیست امروز اضافه شد.`,
    };
  }

  // 11b. Daily English Audio Practice
  if (/(زبان انگلیسی بخوان|پنج عبارت انگلیسی|۵ عبارت انگلیسی|عبارت انگلیسی امروز|تمرین انگلیسی)/.test(norm)) {
    return {
      action: 'daily_english',
      replyText: 'پنج عبارت انگلیسی کاربردی امروز با معنی فارسی پخش می‌شود.',
    };
  }

  // 12. Tab Navigation (including Today SubSections)
  if (/(برو به|باز کن|نشان بده|بخش)/.test(norm)) {
    if (/(لیست خرید|غذای هفته|برنامه غذا|غذا چی|چک لیست سفر|سفر|چمدان|نگهداری خانه|سرویس خانه)/.test(norm)) {
      return {
        action: 'open_tab',
        tab: 'today',
        todaySection: 'shopping_meals',
        replyText: 'بخش خرید، غذای هفته، چک‌لیست سفر و نگهداری خانه باز شد.',
      };
    }
    if (/(دخل و خرج|مالی|هزینه|اقساط|قبوض|قسط|تسویه|حساب دو نفره|حساب دونفره)/.test(norm)) {
      return {
        action: 'open_tab',
        tab: 'today',
        todaySection: 'finance_bills',
        replyText: 'بخش مدیریت مالی، تسویه دونفره، اقساط و قبوض باز شد.',
      };
    }
    if (/(دارو|نوبت پزشک|کارت دان|کارت‌دان|شماره کارت|شبا|تولد|مناسبت|سالگرد)/.test(norm)) {
      return {
        action: 'open_tab',
        tab: 'today',
        todaySection: 'health_vault',
        replyText: 'بخش دارو، مناسبت‌های شمسی و کارت‌دان باز شد.',
      };
    }
    if (/(زبان انگلیسی|خلاصه خوان|خلاصه‌خوان|خلاصه متن|تمرین شخصیت|شخصیت|رشد فردی)/.test(norm)) {
      return {
        action: 'open_tab',
        tab: 'today',
        todaySection: 'growth_lab',
        replyText: 'بخش رشد فردی، ۵ عبارت انگلیسی و خلاصه‌خوان متن باز شد.',
      };
    }

    const tabMap: {keywords: string[]; tab: AppTab; label: string}[] = [
      {keywords: ['امروز', 'هدف', 'برنامه'], tab: 'today', label: 'امروزِ ما'},
      {keywords: ['شکر', 'سپاس', 'انرژی'], tab: 'gratitude', label: 'شکرگذاری'},
      {keywords: ['شبانه', 'فیلم', 'پیام ساز'], tab: 'night', label: 'شبانه و رادیو'},
      {keywords: ['صوت', 'کتابخانه', 'گوینده'], tab: 'voice', label: 'کتابخانه صوتی'},
      {keywords: ['تماس', 'پیامک', 'دفترچه'], tab: 'caller', label: 'تماس و پیامک'},
      {keywords: ['تنظیم', 'نصب', 'همگام'], tab: 'sync', label: 'تنظیم و نصب'},
    ];
    for (const item of tabMap) {
      if (item.keywords.some((kw) => norm.includes(kw))) {
        return {
          action: 'open_tab',
          tab: item.tab,
          replyText: `بخش ${item.label} باز شد.`,
        };
      }
    }
  }

  // 13. Simple Offline Greeting
  if (/^(سلام|خوبی|چطوری|صبحت بخیر|شبت بخیر|عصرت بخیر)/.test(norm)) {
    return {
      action: 'answer',
      replyText: `سلام ${selfName} عزیز! من ${assistantName} هستم و آماده‌ام دستورت رو انجام بدم.`,
    };
  }

  return null;
}


function buildOfflineConversationReply(
  utterance: string,
  ctx: AssistantEngineContext
): string {
  const selfName = getSelfName(ctx.settings, ctx.deviceOwner);
  const assistantName = ctx.settings.assistantName?.trim() || 'هم‌صدا';
  const text = normalizeAssistantText(utterance);
  const previousUser = [...(ctx.conversationHistory || [])].reverse().find((item) => item.role === 'user')?.text;

  if (/^(سلام|درود|صبح بخیر|صبحت بخیر|عصر بخیر|شب بخیر)/.test(text)) {
    return `سلام ${selfName} جان! خوش اومدی. من ${assistantName} هستم؛ بگو ببینم چه خبر؟`;
  }
  if (/(اسم تو چیه|اسمت چیه|تو کی هستی|خودتو معرفی کن)/.test(text)) {
    return `من ${assistantName} هستم؛ دستیار شخصی تو. هم برای گفت‌وگو کنارتم، هم برای انجام کارهایی که روی گوشی در دسترسمه.`;
  }
  if (/(من کیم|اسم من چیه|منو می شناسی|منو میشناسی)/.test(text)) {
    return `تو ${selfName} هستی. چیزهایی رو که در تنظیمات و حافظه همین برنامه ثبت شده می‌تونم به خاطر بیارم.`;
  }
  if (/(چه کار(هایی)? می تونی|چیکار می تونی|چه قابلیت|چه امکاناتی)/.test(text)) {
    return 'می‌تونم بهت جواب بدم و در کارهای گوشی مثل تماس، پیامک با تأیید، باز کردن برنامه‌ها، آلارم و تنظیمات کمکت کنم. وقتی اینترنت وصل باشه، گفت‌وگوی آزاد و پرسش‌های گسترده‌تری هم دارم.';
  }
  if (/(خوبی|حالت چطوره|چه خبر)/.test(text)) {
    return `خوبم، ممنون که پرسیدی ${selfName} جان! تو چطوری؟ امروز اوضاع چطوره؟`;
  }
  if (/(یادت هست|یادته|درباره چی حرف می زدیم|چی گفتم)/.test(text) && previousUser) {
    return `آخرین چیزی که در این گفت‌وگو گفتی این بود: «${previousUser}». منظورت همون موضوعه؟`;
  }
  if (/^(ممنون|مرسی|دمت گرم|تشکر)/.test(text)) {
    return `قربونت ${selfName} جان؛ هر وقت خواستی من اینجام.`;
  }
  return `${selfName} جان، حرفت رو شنیدم. الان موتور گفت‌وگوی آفلاینم هنوز نسخه پایه‌ست و برای جواب دقیق‌تر به اینترنت نیاز دارم. می‌تونی یکم واضح‌تر بگی منظورت چیه؟`;
}

export async function processAssistantUtterance(
  rawTranscript: string,
  ctx: AssistantEngineContext
): Promise<AssistantCommandResult> {
  const selfName = getSelfName(ctx.settings, ctx.deviceOwner);
  const assistantName = ctx.settings.assistantName?.trim() || 'هم‌صدا';
  const wake = extractCommandAfterWakeWord(rawTranscript, assistantName);
  const cleanedUtterance = wake.matched ? wake.command : rawTranscript.trim();

  // A bare search request (such as "در اینترنت جستجو کن" or "تو اینترنت سرچ کن")
  // has no searchable subject yet; prompt for it cleanly instead of failing.
  const normalizedRequest = normalizeAssistantText(cleanedUtterance);
  const isBareSearchPhrase =
    /^(?:(?:برام|لطفاً|لطفا|میشه|یه|یک)\s+)*(?:(?:در|توی|تو)\s+(?:اینترنت|وب|گوگل)\s+(?:جستجو|جست‌وجو|جست و جو|سرچ|پیدا|بگرد)\s*(?:کن|بکن)?|(?:جستجو|جست‌وجو|جست و جو|سرچ)\s*(?:کن|بکن|بزن)?(?:\s+(?:در|توی|تو)\s+(?:اینترنت|وب|گوگل))?|(?:اینترنت|گوگل)\s+(?:سرچ|جستجو|جست‌وجو|جست و جو)\s*(?:کن|بکن)?)$/.test(
      normalizedRequest
    );
  if (ctx.pendingIntent?.type !== 'awaiting_search_query' && isBareSearchPhrase) {
    return {
      action: 'web_search',
      query: '',
      replyText: 'حتماً، درباره چه موضوعی در اینترنت جستجو کنم؟',
    };
  }

  // Try deterministic fast parser first (works both online and offline)
  const localMatch = parseOfflineAssistantCommand(rawTranscript, ctx);
  if (localMatch) {
    // Handle case where user said "پیامک بده" without naming recipient yet
    if (localMatch.action === 'ask_sms_body' && !localMatch.targetPhone && !localMatch.targetName) {
      return localMatch;
    }
    return localMatch;
  }

  // Do not trust the browser's online flag as the sole gate for cloud requests.
  // Android WebView can report offline while the configured API is reachable.
  // Try the real API; the catch below runs direct on-device Android web search
  // (or offline conversation fallback).

  const rawQueryForWeb = cleanedUtterance || rawTranscript.trim();
  const forceLiveSearch = ctx.pendingIntent?.type === 'awaiting_search_query';
  const effectiveUtterance =
    forceLiveSearch && !/(جستجو|سرچ|اینترنت|گوگل)/.test(normalizedRequest)
      ? `در اینترنت جستجو کن درباره ${rawQueryForWeb}`
      : rawQueryForWeb;

  const {timeStr, dateStr} = getCurrentPersianTimeAndDate();
  const storedProfile = loadPersonalCallProfile();
  const homeAddress = (ctx.homeAddress ?? storedProfile.homeAddress).trim();
  const callbackPhone = (ctx.callbackPhone ?? storedProfile.callbackPhone).trim();
  try {
    const commandController = new AbortController();
    const commandTimer = setTimeout(() => commandController.abort(), 35000);
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/assistant-command'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: commandController.signal,
        body: JSON.stringify({
          utterance: effectiveUtterance,
          assistantName,
          deviceOwner: ctx.deviceOwner,
          myName: ctx.settings.myName,
          partnerName: ctx.settings.partnerName,
          localTimeText: timeStr,
          jalaliDate: dateStr,
          homeAddress,
          callbackPhone,
          contacts: ctx.syncedContacts.slice(0, 80),
        }),
      });
    } finally {
      clearTimeout(commandTimer);
    }

    const parsed = await safeReadJsonResponse<AssistantCommandResult & {error?: string}>(res);
    if (parsed.isHtml || !parsed.data || !res.ok) {
      throw new Error(parsed.data?.error || 'پاسخ نامعتبر از دستیار آنلاین');
    }

    const result = parsed.data;
    // Calls and SMS are high-impact: never trust an AI-guessed phone number.
    // Always resolve the recipient locally, even if the server supplied a number.
    if (result.action === 'make_call') {
      const lookupQuery = result.targetName || result.targetPhone || '';
      const match = lookupQuery
        ? findBestContactMatch(lookupQuery, ctx.syncedContacts, ctx.callers, ctx.settings, ctx.deviceOwner)
        : null;
      if (!match?.phone) {
        return {
          action: 'answer',
          replyText: `برای اینکه با شخص اشتباهی تماس نگیرم، مخاطب را دقیق پیدا نکردم. گفتی «${result.targetName || cleanedUtterance}». لطفاً اسم مخاطب یا شماره دقیق را دوباره بگو.`,
        };
      }
      result.targetName = match.name;
      result.targetPhone = match.phone;
      if (result.includeAddressAndPhone && result.callScript && (homeAddress || callbackPhone)) {
        const hasAddr = !homeAddress || result.callScript.includes(homeAddress);
        const hasPhone = !callbackPhone || result.callScript.includes(callbackPhone);
        if (!hasAddr || !hasPhone) {
          result.callScript = [
            result.callScript,
            !hasAddr && homeAddress ? `نشانی: ${homeAddress}` : '',
            !hasPhone && callbackPhone ? `تلفن: ${callbackPhone}` : '',
          ]
            .filter(Boolean)
            .join(' · ');
        }
      }
    } else if (result.action === 'send_sms' || result.action === 'ask_sms_body') {
      const match = result.targetName
        ? findBestContactMatch(result.targetName, ctx.syncedContacts, ctx.callers, ctx.settings, ctx.deviceOwner)
        : null;
      if (!match?.phone) {
        return {
          action: 'answer',
          replyText: `برای اینکه پیامک اشتباهی نره، مخاطب «${result.targetName || cleanedUtterance}» رو با اطمینان در دفترچه پیدا نکردم. اسمش رو دقیق‌تر بگو یا دفترچه رو دوباره همگام کن.`,
        };
      }
      result.targetName = match.name;
      result.targetPhone = match.phone;
    }

    if ((result.action === 'send_sms' || result.action === 'make_call') && !result.targetPhone) {
      return {
        action: 'answer',
        replyText: `مخاطب «${result.targetName || ''}» شماره ذخیره‌شده در دفترچه همگام‌شده ندارد. لطفاً در تب تماس و پیامک دکمه همگام‌سازی دفترچه تلفن را بزنید.`,
      };
    }

    if (result.action === 'answer') {
      const chatController = new AbortController();
      const chatTimer = setTimeout(() => chatController.abort(), 18000);
      try {
        const chatRes = await fetch(apiUrl('/api/assistant-chat'), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          signal: chatController.signal,
          body: JSON.stringify({
            assistantName,
            selfName,
            partnerName: getPartnerNameForDevice(ctx.settings, ctx.deviceOwner),
            userMessage: cleanedUtterance || rawTranscript.trim(),
            history: (ctx.conversationHistory || []).slice(-12),
          }),
        });
        const chatParsed = await safeReadJsonResponse<{replyText?: string; error?: string}>(chatRes);
        const conversationalReply = chatParsed.data?.replyText?.trim();
        if (chatRes.ok && conversationalReply) result.replyText = conversationalReply;
      } catch (chatError) {
        console.warn('Conversation engine unavailable; keeping command-router reply.', chatError);
      } finally {
        clearTimeout(chatTimer);
      }
    }

    return result;
  } catch (err) {
    const fallbackText = (cleanedUtterance || rawTranscript.trim()).trim();
    const isExplicitWebOrInfoQuery =
      forceLiveSearch ||
      /(جستجو|سرچ|تو اینترنت|در اینترنت|توی اینترنت|در گوگل|تو گوگل|تو وب|وب گردی|آب و هوا|اب و هوا|هواشناسی|دمای هوا|قیمت دلار|قیمت طلا|قیمت سکه|قیمت ارز|نرخ ارز|اخبار|خبر امروز|نتیجه بازی|جست و جو|دستور پخت|طرز تهیه|مواد لازم|چیست|کیست|چند است|چقدر است|چطور|کجاست|تاریخچه|معنی|ترجمه)/.test(
        normalizedRequest
      );
    const isSmallTalkOnly =
      /^(سلام|درود|صبح بخیر|صبحت بخیر|عصر بخیر|شب بخیر|خوبی|حالت چطوره|چه خبر|اسم تو چیه|اسمت چیه|تو کی هستی|خودتو معرفی کن|من کیم|اسم من چیه|منو می شناسی|منو میشناسی|ممنون|مرسی|دمت گرم|تشکر|یادت هست|یادته|درباره چی حرف می زدیم|چی گفتم|چه کارهایی می تونی|چیکار می تونی|چه قابلیت|چه امکاناتی)/.test(
        normalizedRequest
      );

    // On Android APK, query the internet directly from Java (Open-Meteo, Wikipedia,
    // DuckDuckGo + clickable Google link) without depending on AI Studio auth cookies.
    if (isNativeAndroid() && (isExplicitWebOrInfoQuery || (!isSmallTalkOnly && fallbackText.length >= 3))) {
      const nativeSearch = await searchWebNative(fallbackText);
      if (nativeSearch.offline) {
        return {
          action: 'answer',
          replyText: 'در این لحظه گوشی به وای‌فای یا اینترنت همراه متصل نیست. لطفاً اینترنت گوشی را روشن کنید و دوباره بپرسید.',
        };
      }
      if (nativeSearch.needsQuery) {
        return {
          action: 'web_search',
          query: '',
          replyText: 'حتماً، درباره چه موضوعی در اینترنت جستجو کنم؟',
        };
      }
      if (nativeSearch.ok && nativeSearch.replyText) {
        return {
          action: 'web_search',
          query: nativeSearch.query || fallbackText,
          replyText: nativeSearch.replyText,
          links: nativeSearch.links && nativeSearch.links.length > 0 ? nativeSearch.links : undefined,
        };
      }
      if (isExplicitWebOrInfoQuery) {
        return {
          action: 'web_search',
          query: fallbackText,
          replyText: `لینک جستجوی مستقیم «${fallbackText}» در گوگل آماده شد؛ برای دیدن نتایج روی لینک زیر بزنید.`,
          links: [
            {
              title: `جستجوی «${fallbackText}» در گوگل`,
              url: `https://www.google.com/search?q=${encodeURIComponent(fallbackText)}`,
            },
          ],
        };
      }
    }

    if (isExplicitWebOrInfoQuery) {
      const reason = err instanceof Error && err.message && !err.message.includes('Failed to fetch')
        ? ` (${err.message})`
        : '';
      return {
        action: 'web_search',
        query: fallbackText,
        replyText: `در حال حاضر امکان دریافت پاسخ هوشمند سرور برقرار نشد${reason}؛ می‌توانید نتایج «${fallbackText}» را مستقیم در لینک گوگل زیر ببینید.`,
        links: [
          {
            title: `جستجوی «${fallbackText}» در گوگل`,
            url: `https://www.google.com/search?q=${encodeURIComponent(fallbackText)}`,
          },
        ],
      };
    }
    return {
      action: 'answer',
      replyText: buildOfflineConversationReply(fallbackText, ctx),
    };
  }
}
