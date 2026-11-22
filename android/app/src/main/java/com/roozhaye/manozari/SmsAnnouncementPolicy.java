package com.roozhaye.manozari;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Local, offline policy shared by the SMS broadcast and notification paths. */
public final class SmsAnnouncementPolicy {
    private static final Pattern URL_PATTERN = Pattern.compile(
            "(?i)(?:https?://(?:www\\.)?((?:[a-z0-9-]+\\.)+[a-z]{2,14})(?::\\d{2,5})?(?:[/?#][^\\s\"'<>)}\\]،؛]*)?|(?:www\\.)?((?:[a-z0-9-]+\\.)+(?:ir|com|net|org|io|app|co|me|info|biz|tv|cc|dev|ai|news|shop|online|site|store|xyz|ly|gl|gg|link|uk|de|fr|us|edu|gov|ac)(?:\\.[a-z]{2,4})?)(?::\\d{2,5})?(?:[/?#][^\\s\"'<>)}\\]،؛]*)?)"
    );

    private static final Pattern HAS_LETTER_PATTERN = Pattern.compile(
            ".*[A-Za-z\\u0621-\\u064A\\u067E\\u0686\\u0698\\u06AF\\u06A9\\u06CC].*",
            Pattern.DOTALL
    );

    private SmsAnnouncementPolicy() {}

    public static boolean shouldAnnounce(Context context, String sender, String alternateSender, String body) {
        SharedPreferences p = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (!p.getBoolean("announce_sms_enabled", true)) return false;
        long quietUntil = p.getLong("sms_quiet_until", 0L);
        if (quietUntil > System.currentTimeMillis()) return false;

        String s = normalize(sender);
        String a = normalize(alternateSender);
        String b = normalize(body);
        String blocked = p.getString("sms_blocked_senders", "");
        if (containsEntry(blocked, s) || containsEntry(blocked, a)) return false;
        if (containsAny(b, p.getString("sms_blocked_keywords", ""))) return false;
        if (p.getBoolean("sms_skip_bank_and_otp", true) && isBankOrFinancialSms(s + " " + a, b)) return false;
        String important = p.getString("sms_important_senders", "");
        if (containsEntry(important, s) || containsEntry(important, a)) return true;
        if (p.getBoolean("sms_filter_operator_promotions", true) && isOperatorPromotion(s + " " + a, b)) return false;
        return true;
    }

    /**
     * Returns true when sender only contains phone digits, shortcode digits, symbols,
     * or an unnamed placeholder rather than a saved contact or brand name.
     */
    public static boolean isNumericOrShortcodeSender(String sender) {
        if (sender == null) return true;
        String clean = sender
                .replaceAll("[\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]", "")
                .trim();
        if (clean.isEmpty() || "فرستنده ناشناس".equals(clean) || "ناشناس".equals(clean)) {
            return true;
        }
        if (!HAS_LETTER_PATTERN.matcher(clean).matches()) {
            return true;
        }
        String asciiDigits = toAsciiDigits(clean).replaceAll("[\\s\\-()._+]", "");
        return asciiDigits.matches("^\\d{3,}$");
    }

    /**
     * Keeps only the clean website host for URLs in SMS text, omitting https://,
     * tracking parameters, query strings, paths, and extra link tokens.
     */
    public static String formatBodyUrlsOnlyDomain(String body) {
        if (body == null || body.trim().isEmpty()) return "";
        Matcher m = URL_PATTERN.matcher(body);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String host = m.group(1) != null ? m.group(1) : m.group(2);
            String cleanHost = host != null ? host.toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "") : "";
            String replacement = cleanHost.isEmpty() ? " لینک سایت " : (" سایت " + cleanHost + " ");
            m.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(sb);
        return sb.toString()
                .replaceAll("(?i)(?:لینک\\s*(?:سایت)?\\s*[:：]?\\s*)(سایت\\s+[a-z0-9.-]+)", "$1")
                .replaceAll("\\s+", " ")
                .trim();
    }

    public static String spokenBody(Context context, String body) {
        SharedPreferences p = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        String clean = formatBodyUrlsOnlyDomain(body);
        if (clean.isEmpty()) return "";
        if (!p.getBoolean("sms_summarize", true)) return clean;
        if (clean.length() <= 150) return clean;
        int persianDot = clean.indexOf('。');
        int asciiDot = clean.indexOf('.');
        int end = -1;
        if (persianDot > 20 && persianDot <= 150) {
            end = persianDot;
        } else if (asciiDot > 20 && asciiDot <= 150 && asciiDot + 1 < clean.length() && clean.charAt(asciiDot + 1) == ' ') {
            end = asciiDot;
        }
        if (end > 20) return clean.substring(0, end + 1) + " ادامه پیام در اعلان موجود است.";
        return clean.substring(0, 147) + "...";
    }

    public static String buildSpokenAnnouncement(
            Context context,
            String resolvedSender,
            String body,
            String prefixLabel
    ) {
        String label = (prefixLabel != null && !prefixLabel.trim().isEmpty()) ? prefixLabel.trim() : "پیامک جدید";
        String finalBody = spokenBody(context, body);
        if (finalBody.isEmpty()) finalBody = "بدون متن";
        if (isNumericOrShortcodeSender(resolvedSender)) {
            return label + ": " + finalBody;
        }
        String spokenSender = FinglishPhoneticHelper.resolveSenderDisplayName(context, resolvedSender.trim());
        return label + " از طرف " + spokenSender + ". متن پیام: " + finalBody;
    }

    private static boolean isBankOrFinancialSms(String sender, String body) {
        String senderText = normalize(sender);
        String bodyText = normalize(body);
        if (senderText.isEmpty() && bodyText.isEmpty()) return false;

        boolean knownBankSender = containsAny(senderText,
                "بانک\nbank\nملت\nmellat\nملی\nmelli\nbmi\nصادرات\nsaderat\nتجارت\ntejarat\nسپه\nsepah\nرفاه\nrefah\nکشاورزی\nbki\nمسکن\nmaskan\nسامان\nsaman\nپارسیان\nparsian\nپاسارگاد\npasargad\nاقتصاد نوین\nenbank\nآینده\nayandeh\nسینا\nsina\nشهر\nshahr\nدی\nday\nکارآفرین\nkarafarin\nسرمایه\nsarmayeh\nمهر ایران\nqmb\nرسالت\nresalat\nبلو\nblu\nblubank\nویپاد\nwepod\nشاپرک\nshaparak\nهمراه کارت\nآپ\n724");

        boolean strongFinancialContent = containsAny(bodyText,
                "واریز\nبرداشت\nمانده\nموجودی\nگردش حساب\nتراکنش\nکسر از حساب\nواریز به حساب\nبرداشت از حساب\nسقف تراکنش\nمرز تراکنش\nسقف کارت\nسقف روزانه\nکارت به کارت\nرمز پویا\nرمز دوم\nرمز یکبار مصرف\nرمز یک بار مصرف\ncvv2\ncvv\notp\nشبا\nساتنا\nپایا\nحساب شماره\nشماره حساب\nمانده کارت\nباقی مانده");

        if (knownBankSender) {
            return true;
        }
        // Even if the bank sends from a generic short code (e.g. 98..., 3000..., +98200...), protect balances/OTPs/limits.
        if (strongFinancialContent && containsAny(bodyText, "تومان\nریال\nحساب\nکارت\nرمز\nبانک\nمانده\nموجودی\nتراکنش")) {
            return true;
        }
        return containsAny(bodyText, "رمز پویا\nرمز دوم\nرمز یکبار مصرف\nرمز یک بار مصرف\ncvv2\nمانده حساب\nموجودی حساب");
    }

    private static boolean isOperatorPromotion(String sender, String body) {
        String senderText = normalize(sender);
        String bodyText = normalize(body);
        boolean knownOperator = containsAny(senderText,
                "ایرانسل\nirancell\nmtn\nmtn irancell\nهمراه اول\nhamrah aval\nmci\nرایتل\nrightel");
        if (!knownOperator || bodyText.isEmpty()) return false;

        // Preserve service/account notifications from telecom operators when bank filter didn't exclude them.
        if (containsAny(bodyText,
                "صورتحساب\nبدهی\nتمدید خودکار بسته\nاتمام اعتبار بسته\nشارژ اضطراری")) {
            return false;
        }
        return containsAny(bodyText,
                "پیشنهاد ویژه\nجشنواره\nتخفیف\nهدیه رایگان\nهدیه ویژه\nبرنده شدید\nقرعه کشی\nخرید بسته\nبسته ارزان\nهمین حالا بخر\nفرصت محدود\nمشترک گرامی\nپیشنهاد می کنیم\nپیشنهاد می‌کنیم\nفعال سازی هدیه\nاینترنت رایگان");
    }

    private static boolean containsEntry(String list, String value) {
        if (value.isEmpty() || list == null) return false;
        for (String item : list.split("[\\n,;]+")) {
            String token = normalize(item);
            if (!token.isEmpty() && (value.equals(token) || value.contains(token))) return true;
        }
        return false;
    }

    private static boolean containsAny(String text, String list) {
        if (text.isEmpty() || list == null) return false;
        for (String item : list.split("[\\n,;]+")) {
            String token = normalize(item);
            if (!token.isEmpty() && text.contains(token)) return true;
        }
        return false;
    }

    private static String toAsciiDigits(String value) {
        if (value == null) return "";
        StringBuilder sb = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c >= '۰' && c <= '۹') sb.append((char) ('0' + (c - '۰')));
            else if (c >= '٠' && c <= '٩') sb.append((char) ('0' + (c - '٠')));
            else sb.append(c);
        }
        return sb.toString();
    }

    private static String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).trim()
                .replace('ي', 'ی').replace('ك', 'ک').replaceAll("\\s+", " ");
    }
}
