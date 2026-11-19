package com.roozhaye.manozari;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Locale;

/** Local, offline policy shared by the SMS broadcast and notification paths. */
public final class SmsAnnouncementPolicy {
    private SmsAnnouncementPolicy() {}

    public static boolean shouldAnnounce(Context context, String sender, String body) {
        SharedPreferences p = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (!p.getBoolean("announce_sms_enabled", true)) return false;
        long quietUntil = p.getLong("sms_quiet_until", 0L);
        if (quietUntil > System.currentTimeMillis()) return false;

        String s = normalize(sender);
        String b = normalize(body);
        if (containsEntry(p.getString("sms_important_senders", ""), s)) return true;
        if (containsEntry(p.getString("sms_blocked_senders", ""), s)) return false;
        if (containsAny(b, p.getString("sms_blocked_keywords", ""))) return false;
        return true;
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
