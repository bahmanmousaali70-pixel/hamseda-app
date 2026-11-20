package com.roozhaye.manozari;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Locale;

/** Local, offline policy shared by the SMS broadcast and notification paths. */
public final class SmsAnnouncementPolicy {
    private SmsAnnouncementPolicy() {}

    public static boolean shouldAnnounce(Context context, String sender, String alternateSender, String body) {
        SharedPreferences p = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (!p.getBoolean("announce_sms_enabled", true)) return false;
        long quietUntil = p.getLong("sms_quiet_until", 0L);
        if (quietUntil > System.currentTimeMillis()) return false;

        String s = normalize(sender);
        String a = normalize(alternateSender);
        String b = normalize(body);
        String important = p.getString("sms_important_senders", "");
        if (containsEntry(important, s) || containsEntry(important, a)) return true;
        String blocked = p.getString("sms_blocked_senders", "");
        if (containsEntry(blocked, s) || containsEntry(blocked, a)) return false;
        if (p.getBoolean("sms_filter_operator_promotions", true) && isOperatorPromotion(s + " " + a, b)) return false;
        if (containsAny(b, p.getString("sms_blocked_keywords", ""))) return false;
        return true;
    }


    private static boolean isOperatorPromotion(String sender, String body) {
        String senderText = normalize(sender);
        String bodyText = normalize(body);
        boolean knownOperator = containsAny(senderText,
                "ایرانسل\nirancell\nmtn\nmtn irancell\nهمراه اول\nhamrah aval\nmci\nرایتل\nrightel");
        if (!knownOperator || bodyText.isEmpty()) return false;

        // Preserve OTP, account/security alerts, balance and service notifications.
        if (containsAny(bodyText,
                "رمز یکبار مصرف\nرمز پویا\nکد تایید\nکد تأیید\nکد ورود\nرمز ورود\nتراکنش\nبرداشت\nواریز\nمانده حساب\nصورتحساب\nبدهی\nتمدید خودکار بسته\nاتمام اعتبار بسته\nشارژ اضطراری")) {
            return false;
        }
        return containsAny(bodyText,
                "پیشنهاد ویژه\nجشنواره\nتخفیف\nهدیه رایگان\nهدیه ویژه\nبرنده شدید\nقرعه کشی\nخرید بسته\nبسته ارزان\nهمین حالا بخر\nفرصت محدود\nمشترک گرامی\nپیشنهاد می کنیم\nپیشنهاد می‌کنیم\nفعال سازی هدیه\nاینترنت رایگان");
    }

    public static String spokenBody(Context context, String body) {
        SharedPreferences p = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (!p.getBoolean("sms_summarize", true) || body == null) return body == null ? "" : body;
        String clean = body.trim().replaceAll("\\s+", " ");
        if (clean.length() <= 150) return clean;
        int end = clean.indexOf('。');
        if (end < 0 || end > 150) end = clean.indexOf('.');
        if (end > 20 && end <= 150) return clean.substring(0, end + 1) + " ادامه پیام در اعلان موجود است.";
        return clean.substring(0, 147) + "...";
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

    private static String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).trim()
                .replace('ي', 'ی').replace('ك', 'ک').replaceAll("\\s+", " ");
    }
}
