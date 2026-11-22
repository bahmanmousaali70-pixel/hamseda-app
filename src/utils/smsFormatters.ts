export function normalizeBidiAndTrim(input: string): string {
  return (input || '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim();
}

export function normalizeDigitsToAscii(input: string): string {
  return (input || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * Returns true if the sender looks like an unnamed phone number, shortcode,
 * masked code, or "فرستنده ناشناس" (no saved alphabetic/Persian contact name).
 */
export function isNumericOrShortcodeSender(sender: string): boolean {
  const clean = normalizeBidiAndTrim(sender);
  if (!clean || clean === 'فرستنده ناشناس' || clean === 'ناشناس') {
    return true;
  }
  const hasAlphabeticLetter = /[A-Za-z\u0621-\u064A\u067E\u0686\u0698\u06AF\u06A9\u06CC]/.test(clean);
  if (!hasAlphabeticLetter) {
    return true;
  }
  const ascii = normalizeDigitsToAscii(clean).replace(/[\s\-()._+]/g, '');
  return /^\d{3,}$/.test(ascii);
}

const KNOWN_TLDS =
  'ir|com|net|org|io|app|co|me|info|biz|tv|cc|dev|ai|news|shop|online|site|store|xyz|ly|gl|gg|link|uk|de|fr|us|edu|gov|ac';

const URL_IN_SMS_REGEX = new RegExp(
  `(?:https?:\\/\\/(?:www\\.)?((?:[a-z0-9-]+\\.)+[a-z]{2,14})(?::\\d{2,5})?(?:[/?#][^\\s"'<>)}\\]،؛]*)?|(?:www\\.)?((?:[a-z0-9-]+\\.)+(?:${KNOWN_TLDS})(?:\\.[a-z]{2,4})?)(?::\\d{2,5})?(?:[/?#][^\\s"'<>)}\\]،؛]*)?)`,
  'gi'
);

/**
 * Replaces full URLs inside an SMS body with only the clean domain host
 * (stripping http/https, www, query params, tracking codes, and paths).
 */
export function summarizeSmsUrlsOnlyDomain(body: string): string {
  if (!body) return '';
  let result = body.replace(URL_IN_SMS_REGEX, (_match, hostFromProto?: string, hostFromBare?: string) => {
    const host = (hostFromProto || hostFromBare || '').toLowerCase().replace(/^www\./, '');
    return host ? ` سایت ${host} ` : ' لینک سایت ';
  });
  result = result
    .replace(/(?:لینک\s*(?:سایت)?\s*[:：]?\s*)(سایت\s+[a-z0-9.-]+)/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}

export function summarizeSmsBody(body: string, summarize = true): string {
  const urlCleaned = summarizeSmsUrlsOnlyDomain(body);
  if (!urlCleaned) return 'بدون متن';
  if (!summarize || urlCleaned.length <= 150) return urlCleaned;
  const persianDot = urlCleaned.indexOf('。');
  const asciiDot = urlCleaned.indexOf('.');
  // Avoid breaking inside domains like tapnfc.ir when summarizing sentences
  const safeSentenceEnd =
    persianDot > 20 && persianDot <= 150
      ? persianDot
      : asciiDot > 20 && asciiDot <= 150 && urlCleaned[asciiDot + 1] === ' '
        ? asciiDot
        : -1;
  if (safeSentenceEnd > 0) {
    return `${urlCleaned.slice(0, safeSentenceEnd + 1)} ادامه پیام در اعلان موجود است.`;
  }
  return `${urlCleaned.slice(0, 147)}...`;
}

/**
 * Builds the exact Persian spoken script for SMS/notifications:
 * - Numeric/shortcode senders without a saved name are omitted (only body is spoken).
 * - URLs are shortened to domain host only.
 */
export function buildSmsSpokenScript(
  sender: string,
  body: string,
  options?: {summarize?: boolean; prefixLabel?: string}
): string {
  const prefixLabel = options?.prefixLabel || 'پیامک جدید';
  const cleanBody = summarizeSmsBody(body, options?.summarize ?? true);
  if (isNumericOrShortcodeSender(sender)) {
    return `${prefixLabel}: ${cleanBody}`;
  }
  return `${prefixLabel} از طرف ${normalizeBidiAndTrim(sender)}. متن پیام: ${cleanBody}`;
}
