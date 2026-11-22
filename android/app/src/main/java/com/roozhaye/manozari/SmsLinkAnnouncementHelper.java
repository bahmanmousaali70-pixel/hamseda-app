package com.roozhaye.manozari;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import androidx.core.content.ContextCompat;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Formats SMS links for concise Persian speech and never speaks an unknown sender's number. */
public final class SmsLinkAnnouncementHelper {
    private static final Pattern LINK_PATTERN = Pattern.compile(
            "(?i)(?:https?://)?(?:www\\.)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})(?::\\d+)?(?:/[^\\s]*)?"
    );

    private SmsLinkAnnouncementHelper() {}

    public static boolean containsLink(String body) {
        return body != null && LINK_PATTERN.matcher(body).find();
    }

    /** Returns only the spoken host name(s), excluding scheme, slashes, path, query and tracking codes. */
    public static String spokenLinks(String body) {
        if (body == null || body.trim().isEmpty()) return "";
        Matcher matcher = LINK_PATTERN.matcher(body);
        Set<String> hosts = new LinkedHashSet<>();
        while (matcher.find()) {
            String host = matcher.group(1);
            if (host == null) continue;
            host = host.toLowerCase(Locale.ROOT);
            if (host.startsWith("www.")) host = host.substring(4);
            String spoken = speakHost(host);
            if (!spoken.isEmpty()) hosts.add(spoken);
            if (hosts.size() >= 3) break;
        }
        StringBuilder joined = new StringBuilder();
        for (String item : hosts) {
            if (joined.length() > 0) joined.append("، ");
            joined.append(item);
        }
        return joined.toString();
    }

    private static String speakHost(String host) {
        String[] parts = host.split("\\.");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            String part = parts[i];
            if (part.isEmpty() || "www".equals(part)) continue;
            if (out.length() > 0) out.append(" دات ");
            out.append(speakDomainPart(part, i == parts.length - 1));
        }
        return out.toString().trim();
    }

    private static String speakDomainPart(String part, boolean isTld) {
        if ("tapnfc".equals(part)) return "تَپ اِن‌اِف‌سی";
        if ("nfc".equals(part)) return "اِن‌اِف‌سی";
        if ("ir".equals(part)) return "آی‌آر";
        if ("com".equals(part)) return "کام";
        if ("net".equals(part)) return "نِت";
        if ("org".equals(part)) return "اُرگ";
        if ("ai".equals(part)) return "اِی‌آی";
        if ("co".equals(part)) return "کو";
        if ("uk".equals(part)) return "یو‌کِی";
        if ("info".equals(part)) return "اینفو";
        if (isTld && part.length() <= 3 && part.matches("[a-z]+")) {
            StringBuilder letters = new StringBuilder();
            for (int i = 0; i < part.length(); i++) {
                if (letters.length() > 0) letters.append(' ');
                switch (part.charAt(i)) {
                    case 'a': letters.append("اِی"); break;
                    case 'b': letters.append("بی"); break;
                    case 'c': letters.append("سی"); break;
                    case 'd': letters.append("دی"); break;
                    case 'e': letters.append("ای"); break;
                    case 'f': letters.append("اِف"); break;
                    case 'g': letters.append("جی"); break;
                    case 'h': letters.append("اِچ"); break;
                    case 'i': letters.append("آی"); break;
                    case 'j': letters.append("جِی"); break;
                    case 'k': letters.append("کِی"); break;
                    case 'l': letters.append("اِل"); break;
                    case 'm': letters.append("اِم"); break;
                    case 'n': letters.append("اِن"); break;
                    case 'o': letters.append("اُو"); break;
                    case 'p': letters.append("پی"); break;
                    case 'q': letters.append("کیو"); break;
                    case 'r': letters.append("آر"); break;
                    case 's': letters.append("اِس"); break;
                    case 't': letters.append("تی"); break;
                    case 'u': letters.append("یو"); break;
                    case 'v': letters.append("وی"); break;
                    case 'w': letters.append("دابلیو"); break;
                    case 'x': letters.append("اِکس"); break;
                    case 'y': letters.append("وای"); break;
                    case 'z': letters.append("زِد"); break;
                    default: letters.append(part.charAt(i));
                }
            }
            return letters.toString();
        }
        return FinglishPhoneticHelper.transliterateToPersianPhonetic(part);
    }

    /** Resolve a real display name; numeric sender IDs are never returned as spoken names. */
    public static String resolveKnownSenderName(Context context, String sender) {
        if (sender == null) return null;
        String value = sender.trim();
        if (value.isEmpty()) return null;
        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.equals("messages") || lower.equals("new message")
                || lower.equals("پیام‌ها") || lower.equals("پیامک")) return null;

        if (!value.matches("[+0-9()\\-\\s.]+")) {
            return value;
        }

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS)
                == PackageManager.PERMISSION_GRANTED) {
            Uri uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(value));
            try (Cursor cursor = context.getContentResolver().query(
                    uri, new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME}, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    String name = cursor.getString(0);
                    if (name != null && !name.trim().isEmpty()) return name.trim();
                }
            } catch (Exception ignored) {
            }
        }

        String synced = FinglishPhoneticHelper.resolvePhoneToSyncedName(context, value);
        if (synced != null && !synced.trim().isEmpty()
                && !synced.matches("[+0-9()\\-\\s.]+")) return synced.trim();
        return null;
    }
}
