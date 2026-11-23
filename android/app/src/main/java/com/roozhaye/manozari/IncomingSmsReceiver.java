package com.roozhaye.manozari;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import androidx.core.content.ContextCompat;

public class IncomingSmsReceiver extends BroadcastReceiver {
    private static long lastSmsAtMs = 0L;
    private static String lastSmsFingerprint = "";

    public static synchronized boolean shouldSkipDuplicateSms(String sender, String body) {
        long now = System.currentTimeMillis();
        String normSender = sender != null ? sender.trim().toLowerCase() : "";
        String normBody = body != null ? body.trim().replaceAll("\\s+", " ") : "";
        String fp = normSender + "::" + normBody;
        if (now - lastSmsAtMs < 6000L && fp.equals(lastSmsFingerprint)) {
            return true;
        }
        lastSmsAtMs = now;
        lastSmsFingerprint = fp;
        return false;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("announce_sms_enabled", true)) {
            return;
        }

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) {
            return;
        }

        String originatingAddress = messages[0].getDisplayOriginatingAddress();
        StringBuilder fullBody = new StringBuilder();
        for (SmsMessage msg : messages) {
            if (msg != null && msg.getMessageBody() != null) {
                fullBody.append(msg.getMessageBody());
            }
        }

        String body = fullBody.toString().trim();
        if (body.length() > 450) {
            body = body.substring(0, 450);
        }

        String senderName = lookupContactName(context, originatingAddress);
        if (senderName == null || senderName.trim().isEmpty()) {
            senderName = (originatingAddress != null && !originatingAddress.trim().isEmpty())
                    ? originatingAddress.trim()
                    : "فرستنده ناشناس";
        }

        if (shouldSkipDuplicateSms(senderName, body)) {
            return;
        }
        if (!SmsAnnouncementPolicy.shouldAnnounce(context, originatingAddress, senderName, body)) {
            return;
        }

        boolean isMale = "male".equals(prefs.getString("default_voice_gender", "female"));
        String voiceName = prefs.getString("default_voice_name", isMale ? "Charon" : "Kore");
        String spoken = SmsAnnouncementPolicy.buildSpokenAnnouncement(context, senderName, body, "پیامک جدید");
        String riskWarning = detectSmsRisk(body);
        if (!riskWarning.isEmpty()) {
            spoken = riskWarning + ". " + spoken;
        }
        String notifLabel = !riskWarning.isEmpty()
                ? "⚠️ هشدار امنیتی پیامک"
                : (SmsAnnouncementPolicy.isNumericOrShortcodeSender(senderName)
                    ? "پیامک جدید"
                    : ("پیامک جدید: " + senderName));

        CallAnnouncerService.announce(
                context.getApplicationContext(),
                notifLabel,
                spoken,
                voiceName,
                isMale,
                1,
                false
        );
    }


    // On-device checks only: message text and links are never uploaded to a third party.
    private String detectSmsRisk(String body) {
        if (body == null || body.trim().isEmpty()) return "";
        String text = body.toLowerCase();
        boolean hasLink = text.matches("(?s).*(https?://|www\\\\.).*");
        if (!hasLink) return "";
        boolean shortLink = text.matches("(?s).*(bit\\\\.ly|tinyurl\\\\.com|t\\\\.co|is\\\\.gd|cutt\\\\.ly|rb\\\\.gy|ow\\\\.ly|goo\\\\.gl)/.*");
        boolean punycode = text.contains("xn--");
        boolean rawIp = text.matches("(?s).*https?://(?:[0-9]{1,3}\\\\.){3}[0-9]{1,3}.*");
        boolean urgent = text.matches("(?s).*(مسدود|قطع می\\\\شود|جایزه|برنده شدید|فوری|تایید حساب|تأیید حساب|کد فعال\\\\سازی|پرداخت ناموفق|حساب شما).*");
        if (punycode || rawIp || (shortLink && urgent)) {
            return "هشدار امنیتی: این پیامک دارای لینک مشکوک است؛ روی لینک آن نزنید";
        }
        if (shortLink) {
            return "احتیاط امنیتی: لینک کوتاه‌شده در پیامک دریافت شده؛ پیش از باز کردن، فرستنده را بررسی کنید";
        }
        if (urgent) {
            return "احتیاط امنیتی: پیامک دارای لینک و متن فوری یا مالی است؛ پیش از باز کردن لینک، صحت آن را بررسی کنید";
        }
        return "احتیاط امنیتی: این پیامک دارای لینک است؛ اعتبار لینک تأیید نشده و پیش از باز کردن آن، فرستنده و نشانی را بررسی کنید";
    }


    private String lookupContactName(Context context, String phoneNumber) {
        if (phoneNumber == null || phoneNumber.trim().isEmpty()) return null;
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
            Uri uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(phoneNumber));
            try (Cursor cursor = context.getContentResolver().query(
                    uri,
                    new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME},
                    null,
                    null,
                    null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    String found = cursor.getString(0);
                    if (found != null && !found.trim().isEmpty()) {
                        return found;
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return FinglishPhoneticHelper.resolvePhoneToSyncedName(context, phoneNumber);
    }
}
