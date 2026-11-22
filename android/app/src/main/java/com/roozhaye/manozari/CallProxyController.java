package com.roozhaye.manozari;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Coordinates outgoing proxy call scripts:
 * - Shows a floating control bar above the Android Phone Dialer (or high-priority Notification fallback)
 * - Runs an interactive 9s auto-speak countdown (cancellable / pauseable / instant trigger)
 * - Enables Speakerphone and speaks the script clearly via offline neural TTS / fallback TTS
 * - Cleans up automatically when the phone call returns to IDLE.
 */
public final class CallProxyController {
    public static final String CHANNEL_ID = "rmz_proxy_call_channel";
    public static final int NOTIF_ID = 7019;
    public static final String ACTION_SPEAK_NOW = "com.roozhaye.manozari.ACTION_PROXY_SPEAK_NOW";
    public static final String ACTION_DISMISS = "com.roozhaye.manozari.ACTION_PROXY_DISMISS";

    private static final Object LOCK = new Object();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static volatile String activeScript = "";
    private static volatile String activeTargetName = "";
    private static volatile String activePhone = "";
    private static volatile long armedUntilMs = 0L;
    private static volatile boolean speakingNow = false;
    private static volatile boolean countdownPaused = false;
    private static volatile int countdownRemainingSec = 0;
    private static volatile boolean speakerWasOn = false;
    private static volatile boolean savedSpeakerState = false;

    private static View overlayView = null;
    private static TextView statusLineView = null;
    private static Button primaryActionBtn = null;
    private static Button pauseBtn = null;
    private static Runnable countdownRunnable = null;
    private static Runnable autoCleanupRunnable = null;

    private CallProxyController() {}

    public static boolean isOutgoingProxyCallActive() {
        return !activeScript.isEmpty() && System.currentTimeMillis() < armedUntilMs;
    }

    public static void armAndShow(Context ctx, String targetName, String phone, String script) {
        final String cleanScript = script != null ? script.trim() : "";
        if (cleanScript.isEmpty()) return;

        final Context appCtx = ctx.getApplicationContext();
        synchronized (LOCK) {
            cancelTimersLocked();
            removeOverlayLocked(appCtx);
            activeScript = cleanScript;
            activeTargetName = (targetName != null && !targetName.trim().isEmpty()) ? targetName.trim() : (phone != null ? phone : "مخاطب");
            activePhone = phone != null ? phone.trim() : "";
            armedUntilMs = System.currentTimeMillis() + 180_000L;
            speakingNow = false;
            countdownPaused = false;
            countdownRemainingSec = 9;
        }

        MAIN.post(() -> {
            showNotification(appCtx);
            tryShowOverlay(appCtx);
            startCountdown(appCtx);
        });
    }

    public static void onOutgoingOffhook(Context ctx) {
        if (!isOutgoingProxyCallActive()) return;
        // Refresh window while call is active
        armedUntilMs = System.currentTimeMillis() + 180_000L;
    }

    public static void speakNow(Context ctx) {
        final Context appCtx = ctx.getApplicationContext();
        final String scriptToSpeak;
        synchronized (LOCK) {
            scriptToSpeak = activeScript;
            if (scriptToSpeak == null || scriptToSpeak.trim().isEmpty()) {
                return;
            }
            if (countdownRunnable != null) {
                MAIN.removeCallbacks(countdownRunnable);
                countdownRunnable = null;
            }
            countdownPaused = true;
            countdownRemainingSec = 0;
            speakingNow = true;
            armedUntilMs = System.currentTimeMillis() + 180_000L;
        }

        MAIN.post(() -> {
            updateOverlayUi("در حال فعال‌سازی بلندگو و خواندن پیام...");
            showNotification(appCtx);
        });

        new Thread(() -> {
            try {
                enableCallSpeakerphone(appCtx);
                Thread.sleep(220L);
                if (!isOutgoingProxyCallActive()) return;

                SharedPreferences prefs = appCtx.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
                float rate = prefs.getFloat("speech_rate", 1.0f);
                String offlineEngine = prefs.getString("preferred_offline_engine", "ava_gyro");
                String voiceName = prefs.getString("default_voice_name", "Kore");
                boolean isMale = "male".equals(prefs.getString("default_voice_gender", "female"));

                // Prefer local neural Persian TTS first for minimal lag over cellular voice channel
                String targetEngine = "pocket_farsi".equals(offlineEngine) ? null : offlineEngine;
                OfflinePersianTts.SpeakResult res = OfflinePersianTts.speakWithEngine(
                        appCtx,
                        targetEngine,
                        scriptToSpeak,
                        rate,
                        null
                );

                boolean spokenOk = res.getOk();
                if (!spokenOk) {
                    // Fall back to CallAnnouncerService pipeline (cached WAV / system bilingual TTS)
                    final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
                    final java.util.concurrent.atomic.AtomicBoolean okRef = new java.util.concurrent.atomic.AtomicBoolean(false);
                    MAIN.post(() -> BilingualSpeechHelper.speak(appCtx, scriptToSpeak, isMale, rate, true, success -> {
                        okRef.set(success);
                        latch.countDown();
                    }));
                    latch.await(15, java.util.concurrent.TimeUnit.SECONDS);
                    spokenOk = okRef.get();
                }

                if (!spokenOk) {
                    CallAnnouncerService.announce(
                            appCtx,
                            "پیام تماس: " + activeTargetName,
                            scriptToSpeak,
                            voiceName,
                            isMale,
                            1,
                            false
                    );
                }
            } catch (Exception ignored) {
            } finally {
                speakingNow = false;
                MAIN.post(() -> {
                    if (isOutgoingProxyCallActive()) {
                        updateOverlayUi("پیام خوانده شد. می‌توانید «تکرار پیام» یا «بستن» را بزنید.");
                        showNotification(appCtx);
                    }
                });
            }
        }, "HamsedaCallProxySpeak").start();
    }

    public static void onCallEnded(Context ctx) {
        final Context appCtx = ctx.getApplicationContext();
        synchronized (LOCK) {
            if (activeScript.isEmpty() && overlayView == null) {
                return;
            }
            activeScript = "";
            activeTargetName = "";
            activePhone = "";
            armedUntilMs = 0L;
            speakingNow = false;
            countdownPaused = false;
            cancelTimersLocked();
        }

        MAIN.post(() -> {
            removeOverlayLocked(appCtx);
            cancelNotification(appCtx);
            restoreSpeakerphone(appCtx);
        });
        try {
            OfflinePersianTts.stop();
            BilingualSpeechHelper.stopActiveTts();
        } catch (Exception ignored) {
        }
    }

    private static void startCountdown(Context appCtx) {
        synchronized (LOCK) {
            if (countdownRunnable != null) {
                MAIN.removeCallbacks(countdownRunnable);
            }
            countdownRunnable = new Runnable() {
                @Override
                public void run() {
                    if (!isOutgoingProxyCallActive()) {
                        onCallEnded(appCtx);
                        return;
                    }
                    if (countdownPaused || speakingNow) {
                        return;
                    }
                    if (countdownRemainingSec <= 0) {
                        speakNow(appCtx);
                        return;
                    }
                    updateOverlayUi("تا خواندن خودکار روی بلندگو: " + countdownRemainingSec + " ثانیه (وقتی طرف برداشت «الان بگو» را هم می‌توانید بزنید)");
                    countdownRemainingSec--;
                    MAIN.postDelayed(this, 1000L);
                }
            };
            MAIN.post(countdownRunnable);

            if (autoCleanupRunnable != null) {
                MAIN.removeCallbacks(autoCleanupRunnable);
            }
            autoCleanupRunnable = () -> onCallEnded(appCtx);
            MAIN.postDelayed(autoCleanupRunnable, 180_000L);
        }
    }

    private static void tryShowOverlay(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
            return;
        }
        WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return;

        synchronized (LOCK) {
            removeOverlayLocked(ctx);

            LinearLayout card = new LinearLayout(ctx);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
            card.setPadding(dp(ctx, 14), dp(ctx, 12), dp(ctx, 14), dp(ctx, 12));
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(Color.parseColor("#EE0B1714"));
            bg.setCornerRadius(dp(ctx, 16));
            bg.setStroke(dp(ctx, 1), Color.parseColor("#10B981"));
            card.setBackground(bg);

            TextView title = new TextView(ctx);
            title.setText("هم‌صدا · پیام تماس با " + activeTargetName);
            title.setTextColor(Color.parseColor("#6EE7B7"));
            title.setTypeface(Typeface.DEFAULT_BOLD);
            title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            card.addView(title);

            TextView scriptPreview = new TextView(ctx);
            scriptPreview.setText(activeScript);
            scriptPreview.setTextColor(Color.WHITE);
            scriptPreview.setMaxLines(3);
            scriptPreview.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            LinearLayout.LayoutParams sLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            sLp.topMargin = dp(ctx, 4);
            card.addView(scriptPreview, sLp);

            statusLineView = new TextView(ctx);
            statusLineView.setText("آماده خواندن روی بلندگو...");
            statusLineView.setTextColor(Color.parseColor("#FDE68A"));
            statusLineView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
            LinearLayout.LayoutParams stLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            stLp.topMargin = dp(ctx, 5);
            stLp.bottomMargin = dp(ctx, 8);
            card.addView(statusLineView, stLp);

            LinearLayout btnRow = new LinearLayout(ctx);
            btnRow.setOrientation(LinearLayout.HORIZONTAL);
            btnRow.setGravity(Gravity.CENTER_VERTICAL);

            primaryActionBtn = new Button(ctx);
            primaryActionBtn.setText("الان بگو روی اسپیکر");
            primaryActionBtn.setAllCaps(false);
            primaryActionBtn.setTextColor(Color.WHITE);
            primaryActionBtn.setTypeface(Typeface.DEFAULT_BOLD);
            primaryActionBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            GradientDrawable pBg = new GradientDrawable();
            pBg.setColor(Color.parseColor("#047857"));
            pBg.setCornerRadius(dp(ctx, 10));
            primaryActionBtn.setBackground(pBg);
            primaryActionBtn.setPadding(dp(ctx, 10), dp(ctx, 6), dp(ctx, 10), dp(ctx, 6));
            primaryActionBtn.setOnClickListener(v -> {
                if (speakingNow) {
                    OfflinePersianTts.stop();
                    BilingualSpeechHelper.stopActiveTts();
                    speakingNow = false;
                    updateOverlayUi("خواندن متوقف شد. برای پخش دوباره بزنید.");
                } else {
                    speakNow(ctx);
                }
            });
            LinearLayout.LayoutParams pLp = new LinearLayout.LayoutParams(0, dp(ctx, 38), 1.4f);
            pLp.setMarginEnd(dp(ctx, 6));
            btnRow.addView(primaryActionBtn, pLp);

            pauseBtn = new Button(ctx);
            pauseBtn.setText("مکث تایمر");
            pauseBtn.setAllCaps(false);
            pauseBtn.setTextColor(Color.parseColor("#E2E8F0"));
            pauseBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
            GradientDrawable mBg = new GradientDrawable();
            mBg.setColor(Color.parseColor("#1E293B"));
            mBg.setCornerRadius(dp(ctx, 10));
            pauseBtn.setBackground(mBg);
            pauseBtn.setPadding(dp(ctx, 8), dp(ctx, 6), dp(ctx, 8), dp(ctx, 6));
            pauseBtn.setOnClickListener(v -> {
                countdownPaused = !countdownPaused;
                if (!countdownPaused) {
                    if (countdownRemainingSec <= 0) countdownRemainingSec = 5;
                    startCountdown(ctx);
                } else {
                    updateOverlayUi("تایمر متوقف شد — هر وقت طرف گوشی را برداشت «الان بگو روی اسپیکر» را بزنید.");
                }
            });
            LinearLayout.LayoutParams mLp = new LinearLayout.LayoutParams(0, dp(ctx, 38), 1f);
            mLp.setMarginEnd(dp(ctx, 6));
            btnRow.addView(pauseBtn, mLp);

            Button closeBtn = new Button(ctx);
            closeBtn.setText("بستن");
            closeBtn.setAllCaps(false);
            closeBtn.setTextColor(Color.parseColor("#FCA5A5"));
            closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
            GradientDrawable cBg = new GradientDrawable();
            cBg.setColor(Color.parseColor("#3F1D24"));
            cBg.setCornerRadius(dp(ctx, 10));
            closeBtn.setBackground(cBg);
            closeBtn.setPadding(dp(ctx, 8), dp(ctx, 6), dp(ctx, 8), dp(ctx, 6));
            closeBtn.setOnClickListener(v -> onCallEnded(ctx));
            LinearLayout.LayoutParams cLp = new LinearLayout.LayoutParams(0, dp(ctx, 38), 0.7f);
            btnRow.addView(closeBtn, cLp);

            card.addView(btnRow);

            int typeFlag = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;

            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    wmWidth(ctx),
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    typeFlag,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                            | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
                    PixelFormat.TRANSLUCENT
            );
            lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            lp.y = dp(ctx, 36);

            try {
                wm.addView(card, lp);
                overlayView = card;
            } catch (Exception ignored) {
                overlayView = null;
            }
        }
    }

    private static int wmWidth(Context ctx) {
        int sw = ctx.getResources().getDisplayMetrics().widthPixels;
        return Math.max(dp(ctx, 260), sw - dp(ctx, 24));
    }

    private static void updateOverlayUi(String statusMsg) {
        if (statusLineView != null && statusMsg != null) {
            statusLineView.setText(statusMsg);
        }
        if (primaryActionBtn != null) {
            primaryActionBtn.setText(speakingNow ? "توقف خواندن" : "الان بگو روی اسپیکر");
        }
        if (pauseBtn != null) {
            pauseBtn.setText(countdownPaused ? "ادامه تایمر" : "مکث تایمر");
        }
    }

    private static void removeOverlayLocked(Context ctx) {
        if (overlayView != null) {
            try {
                WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
                if (wm != null) wm.removeViewImmediate(overlayView);
            } catch (Exception ignored) {
            }
            overlayView = null;
            statusLineView = null;
            primaryActionBtn = null;
            pauseBtn = null;
        }
    }

    private static void cancelTimersLocked() {
        if (countdownRunnable != null) {
            MAIN.removeCallbacks(countdownRunnable);
            countdownRunnable = null;
        }
        if (autoCleanupRunnable != null) {
            MAIN.removeCallbacks(autoCleanupRunnable);
            autoCleanupRunnable = null;
        }
    }

    private static void enableCallSpeakerphone(Context ctx) {
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (!savedSpeakerState) {
                speakerWasOn = am.isSpeakerphoneOn();
                savedSpeakerState = true;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    for (AudioDeviceInfo dev : am.getAvailableCommunicationDevices()) {
                        if (dev.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                            am.setCommunicationDevice(dev);
                            break;
                        }
                    }
                } catch (Exception ignored) {
                }
            }
            am.setSpeakerphoneOn(true);
            int maxMusic = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int currMusic = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            if (maxMusic > 0 && currMusic < (maxMusic * 3) / 4) {
                am.setStreamVolume(AudioManager.STREAM_MUSIC, Math.max(1, (maxMusic * 4) / 5), 0);
            }
        } catch (Exception ignored) {
        }
    }

    private static void restoreSpeakerphone(Context ctx) {
        try {
            if (!savedSpeakerState) return;
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        am.clearCommunicationDevice();
                    } catch (Exception ignored) {
                    }
                }
                am.setSpeakerphoneOn(speakerWasOn);
            }
            savedSpeakerState = false;
        } catch (Exception ignored) {
        }
    }

    private static void showNotification(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "دستیار مکالمه تلفنی هم‌صدا",
                    NotificationManager.IMPORTANCE_HIGH
            );
            nm.createNotificationChannel(ch);
        }

        Intent speakIntent = new Intent(ctx, CallAnnouncerService.class);
        speakIntent.setAction(ACTION_SPEAK_NOW);
        PendingIntent speakPi = PendingIntent.getService(
                ctx, 701, speakIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent dismissIntent = new Intent(ctx, CallAnnouncerService.class);
        dismissIntent.setAction(ACTION_DISMISS);
        PendingIntent dismissPi = PendingIntent.getService(
                ctx, 702, dismissIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notif = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_rmz)
                .setContentTitle("تماس فعال با " + activeTargetName)
                .setContentText(activeScript)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(activeScript))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setOngoing(true)
                .addAction(0, speakingNow ? "تکرار روی اسپیکر" : "الان بگو روی اسپیکر", speakPi)
                .addAction(0, "بستن", dismissPi)
                .build();
        nm.notify(NOTIF_ID, notif);
    }

    private static void cancelNotification(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIF_ID);
        } catch (Exception ignored) {
        }
    }

    private static int dp(Context ctx, int v) {
        return Math.round(v * ctx.getResources().getDisplayMetrics().density);
    }
}
