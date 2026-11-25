package com.hamseda.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.DownloadManager;
import android.app.NotificationManager;
import android.app.role.RoleManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.AlarmClock;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.telecom.TelecomManager;
import android.telephony.SmsManager;
import android.util.Base64;
import android.webkit.URLUtil;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.SpeechService;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "RoozhayeNative")
public class RoozhayeNativePlugin extends Plugin {
    private static final int PERM_REQ_CODE = 8841;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer activeRecognizer = null;
    private volatile SpeechService activeVoskService = null;
    private volatile Recognizer activeVoskRecognizer = null;
    private volatile Model activeVoskModel = null;
    private volatile Runnable pendingVoskTimeout = null;
    private volatile boolean voskCancelRequested = false;
    private MediaRecorder activeRecorder = null;
    private File activeRecorderTempFile = null;

    @Override
    public void load() {
        super.load();
        final Context appCtx = getContext().getApplicationContext();
        new Thread(() -> {
            try {
                OfflinePersianTts.ensureDefaultInstalled(appCtx);
            } catch (Exception ignored) {
            }
        }, "HamsedaOfflineWarmup").start();
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void getNativeCapabilities(PluginCall call) {
        call.resolve(buildCapsObject());
    }

    /**
     * The app must be explicitly selected by the user as the Android Assistant
     * before requesting Play-restricted SMS and Call Log permissions.
     */
    public static boolean isAssistantRoleHeld(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || context == null) return false;
        RoleManager roleManager = (RoleManager) context.getSystemService(Context.ROLE_SERVICE);
        return roleManager != null
                && roleManager.isRoleAvailable(RoleManager.ROLE_ASSISTANT)
                && roleManager.isRoleHeld(RoleManager.ROLE_ASSISTANT);
    }

    /** Opens Android's dedicated default voice-assistant settings page, with safe fallbacks. */
    @PluginMethod
    public void openAssistantSettings(PluginCall call) {
        String[] actions = new String[] {
                "android.settings.VOICE_INPUT_SETTINGS",
                "android.settings.MANAGE_DEFAULT_APPS_SETTINGS",
                Settings.ACTION_SETTINGS
        };
        for (String action : actions) {
            try {
                Intent intent = new Intent(action);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (intent.resolveActivity(getContext().getPackageManager()) != null) {
                    getContext().startActivity(intent);
                    JSObject result = new JSObject();
                    result.put("ok", true);
                    result.put("openedAction", action);
                    call.resolve(result);
                    return;
                }
            } catch (Exception ignored) {
                // Try the next system settings entry point.
            }
        }
        JSObject result = new JSObject();
        result.put("ok", false);
        result.put("message", "باز کردن تنظیمات دستیار این دستگاه ممکن نشد.");
        call.resolve(result);
    }

    @PluginMethod
    public void requestAssistantRole(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            result.put("available", false);
            result.put("held", false);
            result.put("message", "نقش دستیار پیش‌فرض به اندروید ۱۰ یا بالاتر نیاز دارد.");
            call.resolve(result);
            return;
        }
        RoleManager roleManager = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
        if (roleManager == null || !roleManager.isRoleAvailable(RoleManager.ROLE_ASSISTANT)) {
            result.put("available", false);
            result.put("held", false);
            result.put("message", "نقش دستیار در این نسخه اندروید یا دستگاه در دسترس نیست.");
            call.resolve(result);
            return;
        }
        if (roleManager.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
            result.put("available", true);
            result.put("held", true);
            result.put("message", "هم‌صدا دستیار پیش‌فرض دستگاه است.");
            call.resolve(result);
            return;
        }
        try {
            Intent requestIntent = roleManager.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT);
            startActivityForResult(call, requestIntent, "handleAssistantRoleResult");
        } catch (Exception error) {
            result.put("available", true);
            result.put("held", isAssistantRoleHeld(getContext()));
            result.put("requestLaunched", false);
            result.put("errorType", error.getClass().getSimpleName());
            result.put("message", "اندروید نتوانست پنجره انتخاب دستیار پیش‌فرض را باز کند. لطفاً از تنظیمات برنامه‌های پیش‌فرض گوشی اقدام کنید.");
            call.resolve(result);
        }
    }

    @ActivityCallback
    private void handleAssistantRoleResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        boolean held = isAssistantRoleHeld(getContext());
        int resultCode = activityResult != null ? activityResult.getResultCode() : Integer.MIN_VALUE;
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("held", held);
        result.put("requestLaunched", true);
        result.put("activityResultCode", resultCode);
        result.put("accepted", held && resultCode == Activity.RESULT_OK);
        result.put("message", held
                ? "هم‌صدا به‌عنوان دستیار پیش‌فرض انتخاب شد."
                : resultCode == Activity.RESULT_CANCELED
                    ? "پنجره انتخاب دستیار باز شد، اما انتخاب تأیید نشد. برای فعال‌شدن امکانات وابسته، هم‌صدا باید دستیار پیش‌فرض شود."
                    : "درخواست انتخاب دستیار برگشت، اما اندروید انتخاب هم‌صدا را تأیید نکرد. کد نتیجه: " + resultCode);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissionsAndMiuiSetup(PluginCall call) {
        Context ctx = getContext();
        List<String> needed = collectMissingRuntimePermissions(ctx);

        if (!needed.isEmpty() && getActivity() != null) {
            // Request Android runtime permissions first WITHOUT launching Settings on top,
            // otherwise Android auto-dismisses the permission dialog behind Settings!
            ActivityCompat.requestPermissions(getActivity(), needed.toArray(new String[0]), PERM_REQ_CODE);
            call.resolve(buildCapsObject());
            return;
        }

        // All runtime permissions are already granted -> guide battery optimization / overlay / autostart
        openNextBackgroundSetting(ctx);
        call.resolve(buildCapsObject());
    }

    @PluginMethod
    public void requestSmsPermissionsOnly(PluginCall call) {
        Context ctx = getContext();
        if (!isAssistantRoleHeld(ctx)) {
            // Do not prompt for restricted permissions before Assistant role consent.
            call.resolve(buildCapsObject());
            return;
        }
        List<String> smsPerms = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            smsPerms.add(Manifest.permission.READ_CALL_LOG);
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            smsPerms.add(Manifest.permission.RECEIVE_SMS);
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            smsPerms.add(Manifest.permission.SEND_SMS);
        }
        if (!smsPerms.isEmpty() && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), smsPerms.toArray(new String[0]), PERM_REQ_CODE + 1);
        }
        call.resolve(buildCapsObject());
    }

    @PluginMethod
    public void openBatteryAndAutostartSettings(PluginCall call) {
        openNextBackgroundSetting(getContext());
        call.resolve(buildCapsObject());
    }

    private List<String> collectMissingRuntimePermissions(Context ctx) {
        List<String> needed = new ArrayList<>();
        // SMS and Call Log permissions are Play-restricted.
        // Request them only while the user has actively selected Hamseda as Assistant.
        boolean assistantRoleHeld = isAssistantRoleHeld(ctx);
        List<String> basePerms = new ArrayList<>();
        basePerms.add(Manifest.permission.READ_PHONE_STATE);
        basePerms.add(Manifest.permission.READ_CONTACTS);
        basePerms.add(Manifest.permission.CALL_PHONE);
        basePerms.add(Manifest.permission.RECORD_AUDIO);
        if (assistantRoleHeld) {
            basePerms.add(Manifest.permission.RECEIVE_SMS);
            basePerms.add(Manifest.permission.SEND_SMS);
            basePerms.add(Manifest.permission.READ_CALL_LOG);
        }
        for (String perm : basePerms) {
            if (ContextCompat.checkSelfPermission(ctx, perm) != PackageManager.PERMISSION_GRANTED) {
                needed.add(perm);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ANSWER_PHONE_CALLS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ANSWER_PHONE_CALLS);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
        return needed;
    }

    private void openNextBackgroundSetting(Context ctx) {
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm != null && !pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
                Intent batteryIntent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                batteryIntent.setData(Uri.parse("package:" + ctx.getPackageName()));
                batteryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(batteryIntent);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
                Intent overlayIntent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + ctx.getPackageName())
                );
                overlayIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(overlayIntent);
            } else {
                openMiuiAutostartIfAvailable(ctx);
            }
        } catch (Exception ignored) {
            openMiuiAutostartIfAvailable(ctx);
        }
    }

    @PluginMethod
    public void setDeviceIdentity(PluginCall call) {
        String deviceOwner = call.getString("deviceOwner", "man");
        String selfName = call.getString("selfName", "بهمن");
        String partnerName = call.getString("partnerName", "زری");
        String assistantName = call.getString("assistantName", "هم‌صدا");

        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        prefs.edit()
                .putString("device_owner", "zari".equals(deviceOwner) ? "zari" : "man")
                .putString("self_name", selfName)
                .putString("partner_name", partnerName)
                .putString("assistant_name", assistantName)
                .apply();

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void listenOncePersian(PluginCall call) {
        Context ctx = getContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            if (getActivity() != null) {
                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.RECORD_AUDIO}, PERM_REQ_CODE + 2);
            }
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("permissionRequired", true);
            ret.put("error", "دسترسی میکروفون لازم است؛ لطفاً اجازه میکروفون را تایید کنید و دوباره بزنید.");
            call.resolve(ret);
            return;
        }

        final AtomicBoolean settled = new AtomicBoolean(false);
        mainHandler.post(() -> {
            destroyActiveRecognizer();

            boolean hasNetwork = CallAnnouncerService.isNetworkConnected(ctx);
            boolean hasOfflineVosk = WakeWordForegroundService.isOfflineModelReady(ctx);
            boolean speechRecAvailable = SpeechRecognizer.isRecognitionAvailable(ctx);

            // Fast-path: when offline and the Vosk Persian model is ready on disk,
            // use genuine offline Vosk recognition directly instead of failing on Google network ASR.
            if (!hasNetwork && hasOfflineVosk) {
                startVoskOnceRecognition(ctx, call, settled, 0);
                return;
            }

            if (!speechRecAvailable) {
                startVoskOnceRecognition(ctx, call, settled, -1);
                return;
            }

            try {
                SpeechRecognizer recognizer = SpeechRecognizer.createSpeechRecognizer(ctx);
                activeRecognizer = recognizer;

                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) {}
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}
                    @Override public void onPartialResults(Bundle partialResults) {}
                    @Override public void onEvent(int eventType, Bundle params) {}

                    @Override
                    public void onError(int error) {
                        destroyRecognizerIfCurrent(recognizer);
                        boolean shouldTryVoskFallback =
                                error == SpeechRecognizer.ERROR_NETWORK
                                        || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                                        || error == SpeechRecognizer.ERROR_SERVER
                                        || error == SpeechRecognizer.ERROR_CLIENT;
                        if (shouldTryVoskFallback && !settled.get()) {
                            startVoskOnceRecognition(ctx, call, settled, error);
                            return;
                        }
                        if (!settled.compareAndSet(false, true)) return;
                        JSObject ret = new JSObject();
                        ret.put("ok", false);
                        ret.put("errorCode", error);
                        ret.put("error", mapSpeechError(error));
                        call.resolve(ret);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        if (!settled.compareAndSet(false, true)) return;
                        destroyRecognizerIfCurrent(recognizer);
                        ArrayList<String> matches = results != null
                                ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                : null;
                        ArrayList<String> transcripts = new ArrayList<>();
                        if (matches != null) {
                            for (String match : matches) {
                                if (match != null && !match.trim().isEmpty() && !transcripts.contains(match.trim())) {
                                    transcripts.add(match.trim());
                                }
                            }
                        }
                        String transcript = !transcripts.isEmpty() ? transcripts.get(0) : "";
                        JSObject ret = new JSObject();
                        ret.put("ok", !transcript.isEmpty());
                        ret.put("transcript", transcript);
                        ret.put("transcripts", new JSONArray(transcripts));
                        if (transcript.isEmpty()) {
                            ret.put("error", "صدایی شنیده نشد.");
                        }
                        call.resolve(ret);
                    }
                });

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fa-IR");
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "fa-IR");
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 10000L);
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 7000L);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.getPackageName());
                recognizer.startListening(intent);
            } catch (Exception e) {
                destroyActiveRecognizer();
                if (!settled.get()) {
                    startVoskOnceRecognition(ctx, call, settled, -1);
                }
            }
        });
    }

    private void startVoskOnceRecognition(
            Context ctx,
            PluginCall call,
            AtomicBoolean settled,
            int priorSpeechErrorCode
    ) {
        voskCancelRequested = false;
        new Thread(() -> {
            Model voskModel = null;
            Recognizer voskRec = null;
            SpeechService voskService = null;
            try {
                File modelRoot = WakeWordForegroundService.ensureBundledOrExistingModel(ctx);
                if (voskCancelRequested || settled.get()) return;
                voskModel = new Model(modelRoot.getAbsolutePath());
                if (voskCancelRequested || settled.get()) {
                    voskModel.close();
                    return;
                }
                voskRec = new Recognizer(voskModel, 16000.0f);
                voskService = new SpeechService(voskRec, 16000.0f);

                final Model boundModel = voskModel;
                final Recognizer boundRec = voskRec;
                final SpeechService boundService = voskService;
                final String[] lastPartial = new String[]{""};

                Runnable cleanupTimeout = () -> {
                    if (settled.compareAndSet(false, true)) {
                        clearVoskReferencesIfCurrent(boundService, boundRec, boundModel);
                        asyncCleanupVosk(boundService, boundRec, boundModel);
                        String text = lastPartial[0].trim();
                        JSObject ret = new JSObject();
                        ret.put("ok", !text.isEmpty());
                        ret.put("offlineEngine", "vosk");
                        ret.put("transcript", text);
                        ArrayList<String> list = new ArrayList<>();
                        if (!text.isEmpty()) list.add(text);
                        ret.put("transcripts", new JSONArray(list));
                        if (text.isEmpty()) {
                            ret.put("error", "صدایی با تشخیص گفتار آفلاین دریافت نشد.");
                        }
                        mainHandler.post(() -> call.resolve(ret));
                    }
                };

                activeVoskModel = boundModel;
                activeVoskRecognizer = boundRec;
                activeVoskService = boundService;
                pendingVoskTimeout = cleanupTimeout;

                boolean started = boundService.startListening(new org.vosk.android.RecognitionListener() {
                    @Override public void onPartialResult(String hypothesis) {
                        String p = extractVoskField(hypothesis, "partial");
                        if (!p.isEmpty()) lastPartial[0] = p;
                    }

                    @Override public void onResult(String hypothesis) {
                        String text = extractVoskField(hypothesis, "text");
                        if (text.isEmpty()) return;
                        finishWithTranscript(text);
                    }

                    @Override public void onFinalResult(String hypothesis) {
                        String text = extractVoskField(hypothesis, "text");
                        if (text.isEmpty()) text = lastPartial[0].trim();
                        if (!text.isEmpty()) {
                            finishWithTranscript(text);
                        } else if (settled.compareAndSet(false, true)) {
                            mainHandler.removeCallbacks(cleanupTimeout);
                            clearVoskReferencesIfCurrent(boundService, boundRec, boundModel);
                            asyncCleanupVosk(boundService, boundRec, boundModel);
                            JSObject ret = new JSObject();
                            ret.put("ok", false);
                            ret.put("offlineEngine", "vosk");
                            ret.put("error", "صدایی شنیده نشد.");
                            mainHandler.post(() -> call.resolve(ret));
                        }
                    }

                    @Override public void onError(Exception e) {
                        if (settled.compareAndSet(false, true)) {
                            mainHandler.removeCallbacks(cleanupTimeout);
                            clearVoskReferencesIfCurrent(boundService, boundRec, boundModel);
                            asyncCleanupVosk(boundService, boundRec, boundModel);
                            JSObject ret = new JSObject();
                            ret.put("ok", false);
                            ret.put("offlineEngine", "vosk");
                            ret.put("error", "خطای میکروفون در تشخیص گفتار آفلاین فارسی.");
                            mainHandler.post(() -> call.resolve(ret));
                        }
                    }

                    @Override public void onTimeout() {
                        cleanupTimeout.run();
                    }

                    private void finishWithTranscript(String transcript) {
                        if (!settled.compareAndSet(false, true)) return;
                        mainHandler.removeCallbacks(cleanupTimeout);
                        clearVoskReferencesIfCurrent(boundService, boundRec, boundModel);
                        asyncCleanupVosk(boundService, boundRec, boundModel);
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        ret.put("offlineEngine", "vosk");
                        ret.put("transcript", transcript);
                        ArrayList<String> list = new ArrayList<>();
                        list.add(transcript);
                        ret.put("transcripts", new JSONArray(list));
                        mainHandler.post(() -> call.resolve(ret));
                    }
                });

                if (!started) {
                    throw new IllegalStateException("میکروفون در دسترس نیست.");
                }
                mainHandler.postDelayed(cleanupTimeout, 11000L);
            } catch (Exception e) {
                clearVoskReferencesIfCurrent(voskService, voskRec, voskModel);
                asyncCleanupVosk(voskService, voskRec, voskModel);
                if (settled.compareAndSet(false, true)) {
                    JSObject ret = new JSObject();
                    ret.put("ok", false);
                    if (priorSpeechErrorCode > 0) ret.put("errorCode", priorSpeechErrorCode);
                    String msg = priorSpeechErrorCode > 0
                            ? mapSpeechError(priorSpeechErrorCode) + "؛ و مدل آفلاین فارسی نیز آماده نبود."
                            : (e.getMessage() != null && !e.getMessage().isEmpty()
                                    ? e.getMessage()
                                    : "سرویس تشخیص گفتار گوگل و مدل آفلاین هیچ‌کدام آماده نیستند.");
                    ret.put("error", msg);
                    mainHandler.post(() -> call.resolve(ret));
                }
            }
        }, "HamsedaVoskListenOnce").start();
    }

    private String extractVoskField(String json, String key) {
        try {
            return new JSONObject(json == null ? "{}" : json).optString(key, "").trim();
        } catch (Exception ignored) {
            return "";
        }
    }

    private void clearVoskReferencesIfCurrent(SpeechService svc, Recognizer rec, Model mdl) {
        if (pendingVoskTimeout != null) {
            mainHandler.removeCallbacks(pendingVoskTimeout);
            pendingVoskTimeout = null;
        }
        if (activeVoskService == svc) activeVoskService = null;
        if (activeVoskRecognizer == rec) activeVoskRecognizer = null;
        if (activeVoskModel == mdl) activeVoskModel = null;
    }

    private void asyncCleanupVosk(SpeechService svc, Recognizer rec, Model mdl) {
        if (svc == null && rec == null && mdl == null) return;
        new Thread(() -> {
            try {
                if (svc != null) {
                    svc.stop();
                    svc.shutdown();
                }
            } catch (Exception ignored) {}
            try {
                if (rec != null) rec.close();
            } catch (Exception ignored) {}
            try {
                if (mdl != null) mdl.close();
            } catch (Exception ignored) {}
        }, "HamsedaVoskCleanup").start();
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        voskCancelRequested = true;
        mainHandler.post(this::destroyActiveRecognizer);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private void destroyRecognizerIfCurrent(SpeechRecognizer recognizer) {
        if (recognizer == null) return;
        if (activeRecognizer == recognizer) activeRecognizer = null;
        try { recognizer.cancel(); } catch (Exception ignored) {}
        try { recognizer.destroy(); } catch (Exception ignored) {}
    }

    private void destroyActiveRecognizer() {
        voskCancelRequested = true;
        SpeechRecognizer recognizer = activeRecognizer;
        activeRecognizer = null;
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
        }
        SpeechService voskSvc = activeVoskService;
        Recognizer voskRec = activeVoskRecognizer;
        Model voskMdl = activeVoskModel;
        clearVoskReferencesIfCurrent(voskSvc, voskRec, voskMdl);
        asyncCleanupVosk(voskSvc, voskRec, voskMdl);
    }

    private String mapSpeechError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO: return "خطای دریافت صدا از میکروفون";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "اجازه میکروفون داده نشده است";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "سرویس گفتار گوگل به اینترنت دسترسی ندارد";
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "صدایی تشخیص داده نشد";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "میکروفون در حال استفاده است";
            default: return "خطای موقت تشخیص گفتار (" + error + ")";
        }
    }

    private String normalizeDialNumber(String raw) {
        if (raw == null) return "";
        String persianDigits = "۰۱۲۳۴۵۶۷۸۹";
        String arabicDigits = "٠١٢٣٤٥٦٧٨٩";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            int pIdx = persianDigits.indexOf(ch);
            if (pIdx >= 0) {
                sb.append((char) ('0' + pIdx));
                continue;
            }
            int aIdx = arabicDigits.indexOf(ch);
            if (aIdx >= 0) {
                sb.append((char) ('0' + aIdx));
                continue;
            }
            if ((ch >= '0' && ch <= '9') || ch == '+' || ch == '*' || ch == '#') {
                sb.append(ch);
            }
        }
        return sb.toString();
    }

    @PluginMethod
    public void executeDeviceAction(PluginCall call) {
        Context ctx = getContext();
        String action = call.getString("action", "");
        String rawPhone = call.getString("phone", "");
        String smsBody = call.getString("smsBody", "");
        String name = call.getString("name", "");
        String urlArg = call.getString("url", "");
        String queryArg = call.getString("query", "");
        Integer hourArg = call.getInt("hour");
        Integer minuteArg = call.getInt("minute");
        Integer secondsArg = call.getInt("seconds");
        String phone = normalizeDialNumber(rawPhone);

        JSObject ret = new JSObject();
        try {
            switch (action) {
                case "make_call": {
                    if (!call.getBoolean("confirmed", false)) {
                        ret.put("ok", false);
                        ret.put("message", "برقراری تماس بدون تأیید صریح کاربر مسدود شد.");
                        call.resolve(ret);
                        return;
                    }
                    if (phone.isEmpty()) {
                        ret.put("ok", false);
                        ret.put("message", "شماره تلفنی برای " + (name.isEmpty() ? "این مخاطب" : name) + " ثبت نشده است.");
                        call.resolve(ret);
                        return;
                    }
                    boolean hasCallPerm = ContextCompat.checkSelfPermission(ctx, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED;
                    if (!hasCallPerm && getActivity() != null) {
                        ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.CALL_PHONE}, PERM_REQ_CODE + 3);
                    }
                    Intent callIntent = new Intent(hasCallPerm ? Intent.ACTION_CALL : Intent.ACTION_DIAL, Uri.parse("tel:" + phone));
                    callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(callIntent);
                    ret.put("ok", true);
                    if (hasCallPerm) {
                        ret.put("message", "در حال برقراری تماس با " + (name.isEmpty() ? phone : name));
                    } else {
                        ret.put("message", "شماره‌گیر برای " + (name.isEmpty() ? phone : name) + " باز شد (برای تماس مستقیم بدون لمس، اجازه تلفن را تایید کنید).");
                    }
                    call.resolve(ret);
                    return;
                }
                case "end_call": {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        boolean hasAnswerPerm = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ANSWER_PHONE_CALLS) == PackageManager.PERMISSION_GRANTED;
                        if (!hasAnswerPerm) {
                            if (getActivity() != null) {
                                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.ANSWER_PHONE_CALLS}, PERM_REQ_CODE + 4);
                            }
                            ret.put("ok", false);
                            ret.put("message", "برای قطع کردن تماس با دستور صوتی، لطفاً اجازه مدیریت تماس‌ها را تایید کنید.");
                            call.resolve(ret);
                            return;
                        }
                        TelecomManager tm = (TelecomManager) ctx.getSystemService(Context.TELECOM_SERVICE);
                        boolean ended = tm != null && tm.endCall();
                        ret.put("ok", ended);
                        ret.put("message", ended ? "تماس قطع شد." : "در حال حاضر تماس فعالی برای قطع کردن وجود نداشت.");
                        call.resolve(ret);
                        return;
                    }
                    ret.put("ok", false);
                    ret.put("message", "قطع تماس خودکار از اندروید ۹ به بالا پشتیبانی می‌شود.");
                    call.resolve(ret);
                    return;
                }
                case "send_sms": {
                    // Defense in depth: SMS must never be sent by an unconfirmed
                    // command path, even if a UI/parser regression occurs.
                    if (!call.getBoolean("confirmed", false)) {
                        ret.put("ok", false);
                        ret.put("message", "ارسال پیامک بدون تأیید صریح کاربر مسدود شد.");
                        call.resolve(ret);
                        return;
                    }
                    if (phone.isEmpty()) {
                        ret.put("ok", false);
                        ret.put("message", "شماره‌ای برای ارسال پیامک به " + (name.isEmpty() ? "این شخص" : name) + " پیدا نشد.");
                        call.resolve(ret);
                        return;
                    }
                    if (smsBody == null || smsBody.trim().isEmpty()) {
                        ret.put("ok", false);
                        ret.put("message", "متن پیامک خالی است.");
                        call.resolve(ret);
                        return;
                    }
                    boolean hasSmsPerm = isAssistantRoleHeld(ctx)
                            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
                    if (hasSmsPerm) {
                        SmsManager smsManager = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                                ? ctx.getSystemService(SmsManager.class)
                                : SmsManager.getDefault();
                        if (smsManager == null) smsManager = SmsManager.getDefault();
                        ArrayList<String> parts = smsManager.divideMessage(smsBody.trim());
                        smsManager.sendMultipartTextMessage(phone, null, parts, null, null);
                        ret.put("ok", true);
                        ret.put("message", "پیامک به " + (name.isEmpty() ? phone : name) + " ارسال شد.");
                        call.resolve(ret);
                        return;
                    }
                    // Without Assistant role (or without the direct-send permission), hand off
                    // to the user's SMS app. Do not prompt for SEND_SMS from this fallback path.
                    Intent smsIntent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + phone));
                    smsIntent.putExtra("sms_body", smsBody.trim());
                    smsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(smsIntent);
                    ret.put("ok", true);
                    ret.put("message", "صفحه ارسال پیامک آماده شد (برای ارسال کاملاً خودکار، اجازه ارسال SMS را تایید کنید).");
                    call.resolve(ret);
                    return;
                }
                case "volume_up":
                case "volume_down":
                case "volume_max":
                case "volume_min":
                case "volume_mute": {
                    AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                    if (am == null) {
                        ret.put("ok", false);
                        ret.put("message", "مدیریت صدا در دسترس نیست.");
                        call.resolve(ret);
                        return;
                    }
                    if ("volume_up".equals(action)) {
                        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI);
                        am.adjustStreamVolume(AudioManager.STREAM_RING, AudioManager.ADJUST_RAISE, 0);
                        ret.put("message", "صدای گوشی زیاد شد.");
                    } else if ("volume_down".equals(action)) {
                        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
                        am.adjustStreamVolume(AudioManager.STREAM_RING, AudioManager.ADJUST_LOWER, 0);
                        ret.put("message", "صدای گوشی کم شد.");
                    } else if ("volume_min".equals(action)) {
                        am.setStreamVolume(AudioManager.STREAM_MUSIC, 0, AudioManager.FLAG_SHOW_UI);
                        try {
                            am.setStreamVolume(AudioManager.STREAM_RING, 0, 0);
                        } catch (Exception ignored) {}
                        ret.put("message", "صدای رسانه و زنگ گوشی تا حداقل پایین آورده شد.");
                    } else if ("volume_max".equals(action)) {
                        am.setStreamVolume(AudioManager.STREAM_MUSIC, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC), AudioManager.FLAG_SHOW_UI);
                        try {
                            am.setStreamVolume(AudioManager.STREAM_RING, am.getStreamMaxVolume(AudioManager.STREAM_RING), 0);
                        } catch (Exception ignored) {}
                        ret.put("message", "صدای گوشی روی حداکثر تنظیم شد.");
                    } else {
                        am.setStreamVolume(AudioManager.STREAM_MUSIC, 0, AudioManager.FLAG_SHOW_UI);
                        ret.put("message", "صدای رسانه قطع شد.");
                    }
                    ret.put("ok", true);
                    call.resolve(ret);
                    return;
                }
                case "ringer_silent":
                case "ringer_vibrate":
                case "ringer_normal": {
                    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                    AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                    if (am == null) {
                        ret.put("ok", false);
                        ret.put("message", "مدیریت حالت زنگ در دسترس نیست.");
                        call.resolve(ret);
                        return;
                    }
                    boolean needsDndPolicy = "ringer_silent".equals(action) || "ringer_normal".equals(action);
                    if (needsDndPolicy && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && nm != null && !nm.isNotificationPolicyAccessGranted()) {
                        Intent policyIntent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                        policyIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(policyIntent);
                        ret.put("ok", false);
                        ret.put("needsPolicyAccess", true);
                        ret.put("message", "برای تغییر حالت سایلنت و زنگ، لطفاً در صفحه بازشده اجازه «مزاحم نشوید / Do Not Disturb» را برای هم‌صدا روشن کنید.");
                        call.resolve(ret);
                        return;
                    }
                    int mode = "ringer_silent".equals(action)
                            ? AudioManager.RINGER_MODE_SILENT
                            : "ringer_vibrate".equals(action)
                            ? AudioManager.RINGER_MODE_VIBRATE
                            : AudioManager.RINGER_MODE_NORMAL;
                    try {
                        am.setRingerMode(mode);
                        ret.put("ok", true);
                        ret.put("message", mode == AudioManager.RINGER_MODE_SILENT
                                ? "گوشی روی حالت سایلنت (بی‌صدا) قرار گرفت."
                                : mode == AudioManager.RINGER_MODE_VIBRATE
                                ? "گوشی روی حالت ویبره (لرزش) قرار گرفت."
                                : "صدای زنگ گوشی فعال و روی حالت عادی قرار گرفت.");
                    } catch (SecurityException se) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            Intent policyIntent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                            policyIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            ctx.startActivity(policyIntent);
                        }
                        ret.put("ok", false);
                        ret.put("needsPolicyAccess", true);
                        ret.put("message", "لطفاً دسترسی حالت مزاحم نشوید را برای تغییر وضعیت زنگ فعال کنید.");
                    }
                    call.resolve(ret);
                    return;
                }
                case "take_photo": {
                    Intent camIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    if (camIntent.resolveActivity(ctx.getPackageManager()) == null) {
                        ret.put("ok", false);
                        ret.put("message", "برنامه دوربین سازگار روی گوشی پیدا نشد.");
                        call.resolve(ret);
                        return;
                    }
                    File photoDir = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "Hamseda");
                    if (!photoDir.exists() && !photoDir.mkdirs()) throw new Exception("ساخت پوشه عکس ممکن نشد.");
                    File photoFile = new File(photoDir, "Hamseda_" + System.currentTimeMillis() + ".jpg");
                    Uri photoUri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", photoFile);
                    camIntent.putExtra(MediaStore.EXTRA_OUTPUT, photoUri);
                    camIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    camIntent.setClipData(android.content.ClipData.newRawUri("Hamseda photo", photoUri));
                    if (HamsedaAccessibilityService.isConnected()) HamsedaAccessibilityService.armCameraShutter();
                    startActivityForResult(call, camIntent, "handleCameraCaptureResult");
                    return;
                }
                case "record_video": {
                    Intent vidIntent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
                    vidIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(vidIntent);
                    ret.put("ok", true);
                    ret.put("message", "دوربین فیلم‌برداری آماده شد.");
                    call.resolve(ret);
                    return;
                }
                case "record_audio_start": {
                    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        if (getActivity() != null) {
                            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.RECORD_AUDIO}, PERM_REQ_CODE + 6);
                        }
                        ret.put("ok", false);
                        ret.put("permissionRequired", true);
                        ret.put("message", "برای ضبط صدا لطفاً اجازه میکروفون را تایید کنید.");
                        call.resolve(ret);
                        return;
                    }
                    stopRecorderQuietly(false);
                    File recDir = new File(ctx.getCacheDir(), "recordings");
                    if (!recDir.exists()) recDir.mkdirs();
                    activeRecorderTempFile = new File(recDir, "voice_" + System.currentTimeMillis() + ".m4a");
                    MediaRecorder mr = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                            ? new MediaRecorder(ctx)
                            : new MediaRecorder();
                    mr.setAudioSource(MediaRecorder.AudioSource.MIC);
                    mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                    mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                    mr.setAudioEncodingBitRate(128000);
                    mr.setAudioSamplingRate(44100);
                    mr.setOutputFile(activeRecorderTempFile.getAbsolutePath());
                    mr.prepare();
                    mr.start();
                    activeRecorder = mr;
                    ret.put("ok", true);
                    ret.put("recording", true);
                    ret.put("message", "ضبط صدا شروع شد. هر زمان خواستید بگویید «ضبط را متوقف کن».");
                    call.resolve(ret);
                    return;
                }
                case "record_audio_stop": {
                    if (activeRecorder == null) {
                        ret.put("ok", false);
                        ret.put("message", "در حال حاضر ضبط صدایی فعال نیست.");
                        call.resolve(ret);
                        return;
                    }
                    String savedPath = stopRecorderQuietly(true);
                    ret.put("ok", savedPath != null);
                    ret.put("recording", false);
                    ret.put("savedPath", savedPath != null ? savedPath : "");
                    ret.put("message", savedPath != null
                            ? "ضبط صدا متوقف شد و در حافظه ذخیره گردید: " + savedPath
                            : "ضبط صدا متوقف شد.");
                    call.resolve(ret);
                    return;
                }
                case "flashlight_on":
                case "flashlight_off": {
                    boolean turnOn = "flashlight_on".equals(action);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
                        if (cm != null) {
                            String chosenId = null;
                            for (String camId : cm.getCameraIdList()) {
                                CameraCharacteristics chars = cm.getCameraCharacteristics(camId);
                                Boolean hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                                if (Boolean.TRUE.equals(hasFlash)) {
                                    Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                                    if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                                        chosenId = camId;
                                        break;
                                    } else if (chosenId == null) {
                                        chosenId = camId;
                                    }
                                }
                            }
                            if (chosenId != null) {
                                cm.setTorchMode(chosenId, turnOn);
                                ret.put("ok", true);
                                ret.put("message", turnOn ? "چراغ قوه گوشی روشن شد." : "چراغ قوه گوشی خاموش شد.");
                                call.resolve(ret);
                                return;
                            }
                        }
                    }
                    ret.put("ok", false);
                    ret.put("message", "دسترسی به فلاش/چراغ قوه روی این دستگاه در دسترس نبود.");
                    call.resolve(ret);
                    return;
                }
                case "open_app": {
                    String appQuery = !name.trim().isEmpty() ? name.trim() : queryArg.trim();
                    boolean launched = launchInstalledAppByQuery(ctx, appQuery);
                    ret.put("ok", launched);
                    ret.put("message", launched
                            ? "برنامه «" + appQuery + "» باز شد."
                            : "برنامه «" + appQuery + "» روی گوشی پیدا نشد یا نصب نیست.");
                    call.resolve(ret);
                    return;
                }
                case "close_app": {
                    if (HamsedaAccessibilityService.performGlobalHome()) {
                        ret.put("ok", true);
                        ret.put("message", "از برنامه خارج شدم و به صفحه اصلی برگشتم.");
                    } else {
                        Intent settingsIntent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                        settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(settingsIntent);
                        ret.put("ok", false);
                        ret.put("needsAccessibility", true);
                        ret.put("message", "برای کنترل برنامه‌ها، سرویس دسترس‌پذیری هم‌صدا را در این صفحه فعال کن.");
                    }
                    call.resolve(ret);
                    return;
                }
                case "accessibility_click": {
                    String label = queryArg.trim();
                    boolean clicked = HamsedaAccessibilityService.clickNodeByLabel(label);
                    ret.put("ok", clicked);
                    ret.put("message", clicked ? "روی " + label + " زدم." : "این گزینه روی صفحه پیدا نشد؛ صفحه را باز و دسترس‌پذیری را فعال کن.");
                    call.resolve(ret);
                    return;
                }
                case "accessibility_type": {
                    boolean typed = HamsedaAccessibilityService.setTextInFocusedField(queryArg);
                    ret.put("ok", typed);
                    ret.put("message", typed ? "متن در کادر فعال نوشته شد." : "کادر نوشتاری فعالی پیدا نکردم.");
                    call.resolve(ret);
                    return;
                }
                case "accessibility_scroll": {
                    boolean down = !"up".equalsIgnoreCase(queryArg);
                    boolean scrolled = HamsedaAccessibilityService.scrollActiveWindow(down);
                    ret.put("ok", scrolled);
                    ret.put("message", scrolled ? (down ? "صفحه را پایین بردم." : "صفحه را بالا بردم.") : "صفحه قابل پیمایش پیدا نشد.");
                    call.resolve(ret);
                    return;
                }
                case "download_url": {
                    String targetUrl = urlArg.trim();
                    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
                        ret.put("ok", false);
                        ret.put("message", "آدرس معتبری برای دانلود ارسال نشد.");
                        call.resolve(ret);
                        return;
                    }
                    DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm == null) {
                        Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl));
                        viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(viewIntent);
                        ret.put("ok", true);
                        ret.put("message", "لینک در مرورگر باز شد.");
                        call.resolve(ret);
                        return;
                    }
                    String guessedName = URLUtil.guessFileName(targetUrl, null, null);
                    String cleanTitle = !name.trim().isEmpty() ? name.trim().replaceAll("[^A-Za-z0-9\\u0600-\\u06FF._-]", "_") : guessedName;
                    String safeFileName = (guessedName != null && !guessedName.isEmpty() && !guessedName.equals("downloadfile.bin"))
                            ? guessedName.replaceAll("[^A-Za-z0-9._-]", "_")
                            : (cleanTitle.contains(".") ? cleanTitle : "download_" + System.currentTimeMillis() + ".bin");
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(targetUrl));
                    req.setTitle(!name.trim().isEmpty() ? name.trim() : safeFileName);
                    req.setDescription("دانلود با دستیار هم‌صدا");
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "RoozhayeManOZari/" + safeFileName);
                    dm.enqueue(req);
                    ret.put("ok", true);
                    ret.put("message", "دانلود در نوار اعلان گوشی شروع شد و در پوشه Download/RoozhayeManOZari ذخیره می‌شود.");
                    call.resolve(ret);
                    return;
                }
                case "open_url": {
                    String targetUrl = urlArg.trim();
                    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
                        String q = !queryArg.trim().isEmpty() ? queryArg.trim() : targetUrl;
                        targetUrl = "https://www.google.com/search?q=" + Uri.encode(q);
                    }
                    Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl));
                    viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(viewIntent);
                    ret.put("ok", true);
                    ret.put("message", "صفحه وب در مرورگر گوشی باز شد.");
                    call.resolve(ret);
                    return;
                }
                case "open_navigation": {
                    String dest = !queryArg.trim().isEmpty() ? queryArg.trim() : name.trim();
                    Uri geoUri = Uri.parse("geo:0,0?q=" + Uri.encode(dest));
                    Intent mapIntent = new Intent(Intent.ACTION_VIEW, geoUri);
                    mapIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(mapIntent);
                    ret.put("ok", true);
                    ret.put("message", "مسیریاب برای «" + dest + "» باز شد.");
                    call.resolve(ret);
                    return;
                }
                case "open_wifi_settings":
                case "open_mobile_data_settings": {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        try {
                            Intent panel = new Intent("open_wifi_settings".equals(action)
                                    ? Settings.Panel.ACTION_WIFI
                                    : Settings.Panel.ACTION_INTERNET_CONNECTIVITY);
                            panel.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            ctx.startActivity(panel);
                            ret.put("ok", true);
                            ret.put("message", "پنل سریع اینترنت و وای‌فای باز شد.");
                            call.resolve(ret);
                            return;
                        } catch (Exception ignored) {
                        }
                    }
                    Intent wifiIntent = new Intent("open_wifi_settings".equals(action)
                            ? Settings.ACTION_WIFI_SETTINGS
                            : Settings.ACTION_WIRELESS_SETTINGS);
                    wifiIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(wifiIntent);
                    ret.put("ok", true);
                    ret.put("message", "تنظیمات اینترنت و شبکه باز شد.");
                    call.resolve(ret);
                    return;
                }
                case "open_bluetooth_settings": {
                    Intent btIntent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                    btIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(btIntent);
                    ret.put("ok", true);
                    ret.put("message", "تنظیمات بلوتوث گوشی باز شد.");
                    call.resolve(ret);
                    return;
                }
                case "open_location_settings": {
                    Intent locIntent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                    locIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(locIntent);
                    ret.put("ok", true);
                    ret.put("message", "تنظیمات مکان‌یاب (GPS) باز شد.");
                    call.resolve(ret);
                    return;
                }
                case "set_alarm": {
                    int h = hourArg != null ? Math.max(0, Math.min(23, hourArg)) : 7;
                    int m = minuteArg != null ? Math.max(0, Math.min(59, minuteArg)) : 0;
                    Intent alarmIntent = new Intent(AlarmClock.ACTION_SET_ALARM)
                            .putExtra(AlarmClock.EXTRA_HOUR, h)
                            .putExtra(AlarmClock.EXTRA_MINUTES, m)
                            .putExtra(AlarmClock.EXTRA_MESSAGE, !name.trim().isEmpty() ? name.trim() : "یادآور دستیار هم‌صدا")
                            .putExtra(AlarmClock.EXTRA_SKIP_UI, false);
                    alarmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(alarmIntent);
                    ret.put("ok", true);
                    ret.put("message", String.format("ساعت بیدارباش روی %02d:%02d در ساعت گوشی تنظیم شد.", h, m));
                    call.resolve(ret);
                    return;
                }
                case "set_timer": {
                    int totalSec = secondsArg != null && secondsArg > 0 ? secondsArg : 300;
                    Intent timerIntent = new Intent(AlarmClock.ACTION_SET_TIMER)
                            .putExtra(AlarmClock.EXTRA_LENGTH, totalSec)
                            .putExtra(AlarmClock.EXTRA_MESSAGE, !name.trim().isEmpty() ? name.trim() : "تایمر دستیار")
                            .putExtra(AlarmClock.EXTRA_SKIP_UI, false);
                    timerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(timerIntent);
                    ret.put("ok", true);
                    ret.put("message", "تایمر روی " + (totalSec >= 60 ? (totalSec / 60) + " دقیقه" : totalSec + " ثانیه") + " در ساعت گوشی تنظیم شد.");
                    call.resolve(ret);
                    return;
                }
                case "brightness_up":
                case "brightness_down":
                case "brightness_max":
                case "brightness_min": {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.System.canWrite(ctx)) {
                        Intent writeIntent = new Intent(
                                Settings.ACTION_MANAGE_WRITE_SETTINGS,
                                Uri.parse("package:" + ctx.getPackageName())
                        );
                        writeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(writeIntent);
                        ret.put("ok", false);
                        ret.put("needsWriteSettings", true);
                        ret.put("message", "برای تغییر نور صفحه، لطفاً در صفحه بازشده اجازه «تغییر تنظیمات سیستم» را روشن کنید.");
                        call.resolve(ret);
                        return;
                    }
                    ContentResolver cr = ctx.getContentResolver();
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
                    int curr = Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS, 128);
                    int nextVal;
                    if ("brightness_max".equals(action)) nextVal = 255;
                    else if ("brightness_min".equals(action)) nextVal = 20;
                    else if ("brightness_up".equals(action)) nextVal = Math.min(255, curr + 55);
                    else nextVal = Math.max(15, curr - 55);
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS, nextVal);
                    ret.put("ok", true);
                    ret.put("message", "نور صفحه نمایش تنظیم شد.");
                    call.resolve(ret);
                    return;
                }
                default: {
                    ret.put("ok", false);
                    ret.put("message", "عملیات ناشناخته: " + action);
                    call.resolve(ret);
                }
            }
        } catch (Exception e) {
            ret.put("ok", false);
            ret.put("message", "خطا در اجرای دستور روی گوشی: " + e.getMessage());
            call.resolve(ret);
        }
    }

    private boolean launchInstalledAppByQuery(Context ctx, String rawQuery) {
        if (rawQuery == null || rawQuery.trim().isEmpty()) return false;
        String q = rawQuery.trim().toLowerCase()
                .replace("ي", "ی")
                .replace("ك", "ک")
                .replace("‌", " ");
        PackageManager pm = ctx.getPackageManager();

        List<String> keywords = new ArrayList<>();
        keywords.add(q);
        List<String> preferredPackages = new ArrayList<>();

        if (q.contains("تلگرام") || q.contains("telegram")) {
            keywords.add("telegram");
            preferredPackages.add("org.telegram.messenger");
            preferredPackages.add("org.telegram.plus");
            preferredPackages.add("org.thunderdog.challegram");
        } else if (q.contains("واتساپ") || q.contains("واتس") || q.contains("whatsapp")) {
            keywords.add("whatsapp");
            preferredPackages.add("com.whatsapp");
            preferredPackages.add("com.whatsapp.w4b");
        } else if (q.contains("اینستا") || q.contains("instagram")) {
            keywords.add("instagram");
            preferredPackages.add("com.instagram.android");
        } else if (q.contains("ایتا") || q.contains("eitaa")) {
            keywords.add("eitaa");
            preferredPackages.add("ir.eitaa.messenger");
        } else if (q.contains("روبیکا") || q.contains("rubika")) {
            keywords.add("rubika");
            preferredPackages.add("ir.resaneh1.iptv");
        } else if (q.contains("بله") || q.contains("bale")) {
            keywords.add("bale");
            preferredPackages.add("ir.nasim");
        } else if (q.contains("اسنپ") || q.contains("snapp")) {
            keywords.add("snapp");
            preferredPackages.add("cab.snapp.passenger");
        } else if (q.contains("نشان") || q.contains("neshan")) {
            keywords.add("neshan");
            preferredPackages.add("org.rajman.neshan.traffic.navigator");
        } else if (q.contains("بلد") || q.contains("balad")) {
            keywords.add("balad");
            preferredPackages.add("ir.balad");
        } else if (q.contains("گوگل مپ") || q.contains("نقشه") || q.contains("map")) {
            keywords.add("maps");
            preferredPackages.add("com.google.android.apps.maps");
        } else if (q.contains("دیوار") || q.contains("divar")) {
            keywords.add("divar");
            preferredPackages.add("ir.divar");
        } else if (q.contains("دیجی") || q.contains("digikala")) {
            keywords.add("digikala");
            preferredPackages.add("com.digikala");
        } else if (q.contains("یوتیوب") || q.contains("youtube")) {
            keywords.add("youtube");
            preferredPackages.add("com.google.android.youtube");
        } else if (q.contains("کروم") || q.contains("مرورگر") || q.contains("chrome")) {
            keywords.add("chrome");
            preferredPackages.add("com.android.chrome");
        } else if (q.contains("ماشین حساب") || q.contains("حساب") || q.contains("calculator")) {
            keywords.add("calculator");
            keywords.add("calc");
            preferredPackages.add("com.miui.calculator");
            preferredPackages.add("com.google.android.calculator");
        } else if (q.contains("گالری") || q.contains("عکسها") || q.contains("gallery") || q.contains("photos")) {
            keywords.add("gallery");
            keywords.add("photos");
            preferredPackages.add("com.miui.gallery");
            preferredPackages.add("com.google.android.apps.photos");
        } else if (q.contains("تنظیمات") || q.contains("settings")) {
            keywords.add("settings");
            preferredPackages.add("com.android.settings");
        } else if (q.contains("بازار") || q.contains("bazaar")) {
            keywords.add("bazaar");
            preferredPackages.add("com.farsitel.bazaar");
        } else if (q.contains("مایکت") || q.contains("myket")) {
            keywords.add("myket");
            preferredPackages.add("ir.mservices.market");
        } else if (q.contains("ساعت") || q.contains("clock") || q.contains("آلارم")) {
            keywords.add("clock");
            preferredPackages.add("com.android.deskclock");
            preferredPackages.add("com.google.android.deskclock");
        }

        for (String pkg : preferredPackages) {
            Intent launch = pm.getLaunchIntentForPackage(pkg);
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(launch);
                return true;
            }
        }

        Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> apps = pm.queryIntentActivities(mainIntent, 0);
        for (ResolveInfo ri : apps) {
            String pkg = ri.activityInfo != null ? ri.activityInfo.packageName : "";
            CharSequence labelCs = ri.loadLabel(pm);
            String label = labelCs != null ? labelCs.toString().toLowerCase().replace("ي", "ی").replace("ك", "ک") : "";
            for (String kw : keywords) {
                if ((!label.isEmpty() && label.contains(kw)) || (!pkg.isEmpty() && pkg.toLowerCase().contains(kw))) {
                    Intent launch = pm.getLaunchIntentForPackage(pkg);
                    if (launch != null) {
                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(launch);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private String stopRecorderQuietly(boolean saveToPublicMusic) {
        File recordedFile = activeRecorderTempFile;
        if (activeRecorder != null) {
            try {
                activeRecorder.stop();
            } catch (Exception ignored) {
            }
            try {
                activeRecorder.release();
            } catch (Exception ignored) {
            }
            activeRecorder = null;
        }
        activeRecorderTempFile = null;

        if (!saveToPublicMusic || recordedFile == null || !recordedFile.exists() || recordedFile.length() == 0) {
            return null;
        }

        Context ctx = getContext();
        String fileName = recordedFile.getName();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = ctx.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Audio.Media.MIME_TYPE, "audio/mp4");
                values.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/RoozhayeManOZari");
                values.put(MediaStore.Audio.Media.IS_PENDING, 1);
                Uri uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (FileInputStream fis = new FileInputStream(recordedFile);
                         OutputStream os = resolver.openOutputStream(uri)) {
                        if (os != null) {
                            byte[] buf = new byte[4096];
                            int n;
                            while ((n = fis.read(buf)) != -1) {
                                os.write(buf, 0, n);
                            }
                            os.flush();
                        }
                    }
                    values.clear();
                    values.put(MediaStore.Audio.Media.IS_PENDING, 0);
                    resolver.update(uri, values, null, null);
                    return "Music/RoozhayeManOZari/" + fileName;
                }
            } else {
                File outDir = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_MUSIC), "RoozhayeManOZari");
                if (!outDir.exists()) outDir.mkdirs();
                File dest = new File(outDir, fileName);
                try (FileInputStream fis = new FileInputStream(recordedFile);
                     FileOutputStream fos = new FileOutputStream(dest)) {
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = fis.read(buf)) != -1) {
                        fos.write(buf, 0, n);
                    }
                }
                return dest.getAbsolutePath();
            }
        } catch (Exception ignored) {
        }
        return recordedFile.getAbsolutePath();
    }


    @PluginMethod
    public void openAppInfoSettings(PluginCall call) {
        boolean launched = openAppDetailsInternal(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", launched);
        call.resolve(ret);
    }

    @PluginMethod
    public void openXiaomiOtherPermissions(PluginCall call) {
        Context ctx = getContext();
        boolean launched = false;
        try {
            Intent permIntent = new Intent("miui.intent.action.APP_PERM_EDITOR");
            permIntent.setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity");
            permIntent.putExtra("extra_pkgname", ctx.getPackageName());
            permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(permIntent);
            launched = true;
        } catch (Exception ignored) {
            try {
                Intent permIntent2 = new Intent("miui.intent.action.APP_PERM_EDITOR");
                permIntent2.putExtra("extra_pkgname", ctx.getPackageName());
                permIntent2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(permIntent2);
                launched = true;
            } catch (Exception ignored2) {
                launched = openAppDetailsInternal(ctx);
            }
        }
        JSObject ret = new JSObject();
        ret.put("ok", launched);
        call.resolve(ret);
    }

    private boolean openAppDetailsInternal(Context ctx) {
        try {
            Intent detailsIntent = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + ctx.getPackageName())
            );
            detailsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(detailsIntent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    @PluginMethod
    public void setKeepAliveService(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Context ctx = getContext();
        if (enabled) {
            KeepAliveForegroundService.start(ctx);
        } else {
            KeepAliveForegroundService.stop(ctx);
        }
        JSObject ret = new JSObject();
        ret.put("running", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void startWakeWordService(PluginCall call) {
        Context ctx = getContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("permissionRequired", true);
            ret.put("message", "برای گوش‌به‌زنگ بودن، اجازه میکروفون لازم است.");
            call.resolve(ret);
            return;
        }
        String assistantName = call.getString("assistantName", "هم‌صدا");
        boolean started = WakeWordForegroundService.start(ctx, assistantName);
        JSObject ret = new JSObject();
        ret.put("ok", started);
        if (!started) ret.put("message", "شروع سرویس شنود ممکن نشد؛ برنامه را باز نگه دارید و دوباره تلاش کنید.");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopWakeWordService(PluginCall call) {
        WakeWordForegroundService.stop(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getWakeWordStatus(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean("wake_word_enabled", false);
        String state = prefs.getString("wake_service_state", enabled ? "preparing" : "stopped");
        String error = prefs.getString("wake_service_error", "");
        boolean modelReady = WakeWordForegroundService.isOfflineModelReady(ctx);
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        ret.put("state", state != null ? state : "stopped");
        ret.put("error", error != null ? error : "");
        ret.put("modelReady", modelReady);
        call.resolve(ret);
    }

    @PluginMethod
    public void consumePendingWakeCommand(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        String command = prefs.getString("pending_wake_command", "");
        prefs.edit().remove("pending_wake_command").remove("pending_wake_command_at").apply();
        JSObject ret = new JSObject();
        ret.put("command", command == null ? "" : command);
        call.resolve(ret);
    }

    @PluginMethod
    public void setServerBaseUrl(PluginCall call) {
        String url = call.getString("url", "");
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (url != null && !url.trim().isEmpty()) {
            prefs.edit().putString("server_base_url", url.trim().replaceAll("/+$", "")).apply();
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void precacheNativeAudio(PluginCall call) {
        String text = call.getString("text", "");
        String voiceName = call.getString("voiceName", "Kore");
        String audioBase64 = call.getString("audioBase64", "");
        boolean saved = false;
        if (text != null && !text.trim().isEmpty() && audioBase64 != null && !audioBase64.isEmpty()) {
            try {
                byte[] wavBytes = Base64.decode(audioBase64, Base64.DEFAULT);
                saved = CallAnnouncerService.saveWavToCache(getContext(), text, voiceName, wavBytes);
            } catch (Exception ignored) {
            }
        }
        JSObject ret = new JSObject();
        ret.put("ok", saved);
        call.resolve(ret);
    }

    @PluginMethod
    public void setAnnounceToggles(PluginCall call) {
        boolean announceCalls = Boolean.TRUE.equals(call.getBoolean("announceCalls", true));
        boolean announceSms = Boolean.TRUE.equals(call.getBoolean("announceSms", true));
        boolean announceSchedules = Boolean.TRUE.equals(call.getBoolean("announceSchedules", true));
        boolean autoOpenMorning = Boolean.TRUE.equals(call.getBoolean("autoOpenMorning", true));
        String defaultGender = call.getString("defaultGender", "female");
        String defaultVoice = call.getString("defaultVoice", "male".equals(defaultGender) ? "Charon" : "Kore");
        boolean preferOfflineSpeech = Boolean.TRUE.equals(call.getBoolean("preferOfflineSpeech", false));
        String preferredOfflineEngine = call.getString("preferredOfflineEngine", "ava_gyro");
        Double rateDouble = call.getDouble("speechRate", 1.0);
        float speechRate = rateDouble != null ? Math.max(0.65f, Math.min(1.5f, rateDouble.floatValue())) : 1.0f;

        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        prefs.edit()
                .putBoolean("announce_calls_enabled", announceCalls)
                .putBoolean("announce_sms_enabled", announceSms)
                .putBoolean("announce_schedules_enabled", announceSchedules)
                .putBoolean("auto_open_morning_enabled", autoOpenMorning)
                .putString("default_voice_gender", "male".equals(defaultGender) ? "male" : "female")
                .putString("default_voice_name", defaultVoice != null && !defaultVoice.trim().isEmpty() ? defaultVoice.trim() : "Kore")
                .putBoolean("prefer_offline_speech", preferOfflineSpeech)
                .putString("preferred_offline_engine", preferredOfflineEngine != null && !preferredOfflineEngine.trim().isEmpty() ? preferredOfflineEngine.trim() : "ava_gyro")
                .putFloat("speech_rate", speechRate)
                .apply();

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setSmsAnnouncementPolicy(PluginCall call) {
        String blockedSenders = call.getString("blockedSenders", "");
        String blockedKeywords = call.getString("blockedKeywords", "");
        String importantSenders = call.getString("importantSenders", "");
        Integer quietHours = call.getInt("quietHours", 0);
        Boolean summarize = call.getBoolean("summarize", true);
        Boolean filterOperatorPromotions = call.getBoolean("filterOperatorPromotions", true);
        Boolean skipBankAndOtp = call.getBoolean("skipBankAndOtp", true);
        long quietUntil = quietHours != null && quietHours > 0
                ? System.currentTimeMillis() + Math.min(24, quietHours) * 60L * 60L * 1000L : 0L;
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        prefs.edit()
                .putString("sms_blocked_senders", blockedSenders != null ? blockedSenders : "")
                .putString("sms_blocked_keywords", blockedKeywords != null ? blockedKeywords : "")
                .putString("sms_important_senders", importantSenders != null ? importantSenders : "")
                .putBoolean("sms_summarize", summarize == null || summarize)
                .putBoolean("sms_filter_operator_promotions", filterOperatorPromotions == null || filterOperatorPromotions)
                .putBoolean("sms_skip_bank_and_otp", skipBankAndOtp == null || skipBankAndOtp)
                .putLong("sms_quiet_until", quietUntil)
                .apply();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("quietUntil", quietUntil);
        call.resolve(ret);
    }

    @PluginMethod
    public void syncCallers(PluginCall call) {
        String json = call.getString("callersJson", "[]");
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        prefs.edit().putString("callers_json", json).apply();
        JSObject ret = new JSObject();
        ret.put("count", json != null ? json.length() : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void saveLearnedPhonetics(PluginCall call) {
        String phoneticsJson = call.getString("phoneticsJson", "{}");
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        int count = 0;
        try {
            JSONObject incoming = new JSONObject(phoneticsJson != null ? phoneticsJson : "{}");
            JSONObject existing = new JSONObject(prefs.getString("learned_phonetics_json", "{}"));
            JSONArray keys = incoming.names();
            if (keys != null) {
                for (int i = 0; i < keys.length(); i++) {
                    String k = keys.getString(i);
                    String v = incoming.optString(k, "").trim();
                    if (!k.trim().isEmpty() && !v.isEmpty()) {
                        existing.put(k.trim().toLowerCase(), v);
                        count++;
                    }
                }
            }
            prefs.edit().putString("learned_phonetics_json", existing.toString()).apply();
        } catch (Exception ignored) {
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("count", count);
        call.resolve(ret);
    }

    @PluginMethod
    public void readDeviceContacts(PluginCall call) {
        Context ctx = getContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            if (getActivity() != null) {
                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.READ_CONTACTS}, PERM_REQ_CODE);
            }
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("permissionRequired", true);
            ret.put("contactsJson", "[]");
            call.resolve(ret);
            return;
        }

        Map<String, JSONObject> byName = new LinkedHashMap<>();
        JSONObject phoneToNameMap = new JSONObject();
        JSONObject offlinePhoneticMap = new JSONObject();

        String[] projection = new String[]{
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
        };
        try (Cursor c = ctx.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
        )) {
            if (c != null) {
                int nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                while (c.moveToNext() && byName.size() < 1500) {
                    String rawName = nameIdx >= 0 ? c.getString(nameIdx) : "";
                    String rawPhone = numIdx >= 0 ? c.getString(numIdx) : "";
                    String cleanName = rawName != null ? rawName.trim() : "";
                    if (cleanName.isEmpty()) continue;

                    String phoneKey = FinglishPhoneticHelper.normalizePhoneKey(rawPhone);
                    if (phoneKey.length() >= 7) {
                        phoneToNameMap.put(phoneKey, cleanName);
                    }

                    String nameKey = cleanName.toLowerCase();
                    if (!byName.containsKey(nameKey)) {
                        String phonetic = cleanName.matches("(?s).*[A-Za-z].*")
                                ? FinglishPhoneticHelper.transliterateToPersianPhonetic(cleanName)
                                : cleanName;
                        JSONObject item = new JSONObject();
                        item.put("name", cleanName);
                        item.put("phone", rawPhone != null ? rawPhone.trim() : "");
                        item.put("persianPhonetic", phonetic);
                        byName.put(nameKey, item);
                        offlinePhoneticMap.put(nameKey, phonetic);
                    }
                }
            }
        } catch (Exception ignored) {
        }

        SharedPreferences prefs = ctx.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        try {
            JSONObject existingLearned = new JSONObject(prefs.getString("learned_phonetics_json", "{}"));
            JSONArray keys = offlinePhoneticMap.names();
            if (keys != null) {
                for (int i = 0; i < keys.length(); i++) {
                    String k = keys.getString(i);
                    if (!existingLearned.has(k)) {
                        existingLearned.put(k, offlinePhoneticMap.getString(k));
                    } else {
                        String savedVal = existingLearned.optString(k, "").trim();
                        if (!savedVal.isEmpty() && byName.containsKey(k)) {
                            byName.get(k).put("persianPhonetic", savedVal);
                        }
                    }
                }
            }
            prefs.edit()
                    .putString("synced_phone_name_json", phoneToNameMap.toString())
                    .putString("learned_phonetics_json", existingLearned.toString())
                    .apply();
        } catch (Exception ignored) {
        }

        JSONArray arr = new JSONArray(byName.values());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("count", arr.length());
        ret.put("contactsJson", arr.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void syncSchedules(PluginCall call) {
        String json = call.getString("schedulesJson", "[]");
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        prefs.edit().putString("schedules_json", json).apply();
        ScheduleAlarmHelper.rescheduleAll(getContext());
        JSObject ret = new JSObject();
        ret.put("count", json != null ? json.length() : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void wasScheduleFiredNatively(PluginCall call) {
        String scheduleId = call.getString("scheduleId", "");
        String todayKey = call.getString("todayKey", "");
        boolean fired = false;
        if (scheduleId != null && !scheduleId.isEmpty() && todayKey != null && !todayKey.isEmpty()) {
            SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
            String recordedDay = prefs.getString("fired_today_" + scheduleId, "");
            fired = todayKey.equals(recordedDay);
        }
        JSObject ret = new JSObject();
        ret.put("fired", fired);
        call.resolve(ret);
    }

    @PluginMethod
    public void markScheduleFiredNatively(PluginCall call) {
        String scheduleId = call.getString("scheduleId", "");
        String todayKey = call.getString("todayKey", "");
        if (scheduleId != null && !scheduleId.isEmpty() && todayKey != null && !todayKey.isEmpty()) {
            SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
            prefs.edit()
                    .putString("fired_today_" + scheduleId, todayKey)
                    .putLong("fired_ms_" + todayKey + "_" + scheduleId, System.currentTimeMillis())
                    .commit();
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopNativeAudio(PluginCall call) {
        CallAnnouncerService.stopActive(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void saveBackupJson(PluginCall call) {
        String filename = call.getString("filename", "man-o-zari-backup.json");
        String content = call.getString("content", "");
        boolean shareAfter = Boolean.TRUE.equals(call.getBoolean("shareAfter", false));

        if (content == null || content.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", "محتوای فایل خالی است.");
            call.resolve(ret);
            return;
        }

        Context ctx = getContext();
        String safeName = (filename != null && !filename.trim().isEmpty())
                ? filename.replaceAll("[^A-Za-z0-9._-]", "_")
                : "man-o-zari-backup.json";

        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        boolean savedToDownloads = false;
        String displayPath = "Download/RoozhayeManOZari/" + safeName;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = ctx.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/RoozhayeManOZari");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri itemUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (itemUri != null) {
                    try (OutputStream os = resolver.openOutputStream(itemUri)) {
                        if (os != null) {
                            os.write(bytes);
                            os.flush();
                            savedToDownloads = true;
                        }
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    resolver.update(itemUri, values, null, null);
                }
            } else {
                File dir = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "RoozhayeManOZari");
                if (!dir.exists()) dir.mkdirs();
                File outFile = new File(dir, safeName);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(bytes);
                    savedToDownloads = true;
                }
                displayPath = outFile.getAbsolutePath();
            }
        } catch (Exception ignored) {
        }

        boolean shared = false;
        if (shareAfter) {
            try {
                File shareDir = new File(ctx.getCacheDir(), "backups");
                if (!shareDir.exists()) shareDir.mkdirs();
                File cacheFile = new File(shareDir, safeName);
                try (FileOutputStream fos = new FileOutputStream(cacheFile)) {
                    fos.write(bytes);
                }
                Uri contentUri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", cacheFile);
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("*/*");
                shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, safeName);
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(shareIntent, "ذخیره یا ارسال فایل پشتیبان هم‌صدا");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(chooser);
                shared = true;
            } catch (Exception ignored) {
            }
        }

        JSObject ret = new JSObject();
        ret.put("ok", savedToDownloads || shared);
        ret.put("savedPath", displayPath);
        ret.put("shared", shared);
        call.resolve(ret);
    }

    @PluginMethod
    public void pickJsonFileNative(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            startActivityForResult(call, intent, "handlePickJsonResult");
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", "امکان باز کردن انتخابگر فایل وجود نداشت.");
            call.resolve(ret);
        }
    }

    @ActivityCallback
    private void handlePickJsonResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        Uri uri = result.getData().getData();
        String fileName = "backup.json";
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) fileName = c.getString(idx);
            }
        } catch (Exception ignored) {
        }

        try (InputStream is = getContext().getContentResolver().openInputStream(uri)) {
            if (is == null) throw new Exception("Empty input stream");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                baos.write(buf, 0, n);
            }
            String text = new String(baos.toByteArray(), StandardCharsets.UTF_8);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("name", fileName);
            ret.put("content", text);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", "امکان خواندن فایل انتخاب‌شده نبود.");
            call.resolve(ret);
        }
    }

    @ActivityCallback
    private void handleCameraCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK) {
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("message", "عکس گرفته شد و در پوشه تصاویر هم‌صدا ذخیره شد.");
            File photoDir = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_PICTURES), "Hamseda");
            File[] photos = photoDir.listFiles((dir, name) -> name.endsWith(".jpg"));
            if (photos != null && photos.length > 0) {
                File newest = photos[0];
                for (File f : photos) if (f.lastModified() > newest.lastModified()) newest = f;
                ret.put("savedPath", newest.getAbsolutePath());
            }
            call.resolve(ret);
        } else {
            HamsedaAccessibilityService.disarmCameraShutter();
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("cancelled", true);
            ret.put("message", "عکس‌گرفتن لغو شد.");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void speakOfflineNeuralPersian(PluginCall call) {
        String text = call.getString("text", "");
        Double rateValue = call.getDouble("rate", 1.0);
        float rate = rateValue != null ? rateValue.floatValue() : 1.0f;
        if (text == null || text.trim().isEmpty()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("error", "متن خالی است.");
            call.resolve(result);
            return;
        }
        new Thread(() -> {
            boolean ok = OfflinePersianTts.speak(getContext(), text, rate);
            JSObject result = new JSObject();
            result.put("ok", ok);
            if (!ok) result.put("error", "موتور عصبی آفلاین فارسی آماده نیست یا نتوانست صدا تولید کند.");
            mainHandler.post(() -> call.resolve(result));
        }, "HamsedaOfflinePersianTTS").start();
    }

    @PluginMethod
    public void getOfflineEngineStatuses(PluginCall call) {
        final Context appCtx = getContext().getApplicationContext();
        new Thread(() -> {
            try {
                String activeId = OfflinePersianTts.getActiveEngineId(appCtx);
                String enginesJson = OfflinePersianTts.getStatusesJson(appCtx);
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("activeEngineId", activeId);
                result.put("enginesJson", enginesJson);
                mainHandler.post(() -> call.resolve(result));
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("ok", false);
                result.put("error", e.getMessage() != null ? e.getMessage() : "خطا در بررسی وضعیت موتورها");
                mainHandler.post(() -> call.resolve(result));
            }
        }, "HamsedaOfflineStatuses").start();
    }

    @PluginMethod
    public void installOfflineEngine(PluginCall call) {
        final String engineId = call.getString("engineId", "");
        if (engineId == null || engineId.trim().isEmpty()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("error", "شناسه موتور نامعتبر است.");
            call.resolve(result);
            return;
        }
        final Context appCtx = getContext().getApplicationContext();
        new Thread(() -> {
            kotlin.Pair<Boolean, String> outcome = OfflinePersianTts.installEngine(
                    appCtx,
                    engineId.trim(),
                    (id, got, total, stage) -> {
                        JSObject evt = new JSObject();
                        evt.put("engineId", id);
                        evt.put("bytesDownloaded", got);
                        evt.put("totalBytes", total);
                        evt.put("stage", stage);
                        mainHandler.post(() -> notifyListeners("offlineTtsProgress", evt));
                    }
            );
            JSObject result = new JSObject();
            result.put("ok", Boolean.TRUE.equals(outcome.getFirst()));
            if (outcome.getSecond() != null) {
                result.put("error", outcome.getSecond());
            }
            mainHandler.post(() -> call.resolve(result));
        }, "HamsedaInstallOfflineTTS").start();
    }

    @PluginMethod
    public void deleteOfflineEngine(PluginCall call) {
        String engineId = call.getString("engineId", "");
        boolean ok = engineId != null && OfflinePersianTts.deleteEngine(getContext().getApplicationContext(), engineId.trim());
        JSObject result = new JSObject();
        result.put("ok", ok);
        call.resolve(result);
    }

    @PluginMethod
    public void setActiveOfflineEngine(PluginCall call) {
        String engineId = call.getString("engineId", "");
        Context appCtx = getContext().getApplicationContext();
        boolean ok = engineId != null && OfflinePersianTts.setActiveEngineId(appCtx, engineId.trim());
        if (ok) {
            appCtx.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE)
                    .edit()
                    .putString("preferred_offline_engine", engineId.trim())
                    .apply();
        }
        JSObject result = new JSObject();
        result.put("ok", ok);
        call.resolve(result);
    }

    @PluginMethod
    public void speakOfflineEngine(PluginCall call) {
        final String engineId = call.getString("engineId");
        final String text = call.getString("text", "");
        final Double rateValue = call.getDouble("rate", 1.0);
        final float rate = rateValue != null ? rateValue.floatValue() : 1.0f;
        final Boolean goftari = call.hasOption("goftari") ? call.getBoolean("goftari") : null;

        if (text == null || text.trim().isEmpty()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("error", "متن خالی است.");
            call.resolve(result);
            return;
        }

        final Context appCtx = getContext().getApplicationContext();
        new Thread(() -> {
            OfflinePersianTts.SpeakResult res = OfflinePersianTts.speakWithEngine(
                    appCtx,
                    engineId != null && !engineId.trim().isEmpty() ? engineId.trim() : null,
                    text,
                    rate,
                    goftari
            );
            JSObject result = new JSObject();
            result.put("ok", res.getOk());
            result.put("engineId", res.getEngineId());
            result.put("synthesisMs", res.getSynthesisMs());
            result.put("durationSec", res.getDurationSec());
            result.put("rtf", res.getRtf());
            if (res.getError() != null) {
                result.put("error", res.getError());
            }
            mainHandler.post(() -> call.resolve(result));
        }, "HamsedaSpeakOfflineEngine").start();
    }

    @PluginMethod
    public void speakNativeBilingual(PluginCall call) {
        String text = call.getString("text", "");
        String gender = call.getString("gender", "female");
        Double rateDouble = call.getDouble("rate", 1.0);
        float rate = rateDouble != null ? rateDouble.floatValue() : 1.0f;

        if (text == null || text.trim().isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            call.resolve(ret);
            return;
        }

        BilingualSpeechHelper.speak(getContext(), text, "male".equals(gender), rate, false, success -> {
            JSObject ret = new JSObject();
            ret.put("ok", success);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void testNativeCallAnnouncement(PluginCall call) {
        String name = call.getString("name", "زری جان");
        String script = call.getString("script", "تماس ورودی از طرف زری جان");
        String gender = call.getString("gender", "female");
        String voiceName = call.getString("voiceName", "male".equals(gender) ? "Charon" : "Kore");

        CallAnnouncerService.announce(getContext(), "تست تماس: " + name, script, voiceName, "male".equals(gender), 1, true);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void testNativeSmsAnnouncement(PluginCall call) {
        String sender = call.getString("sender", "زری جان");
        String body = call.getString("body", "سلام، یادت نره امروز استراحت کنی");
        String gender = call.getString("gender", "female");
        String voiceName = call.getString("voiceName", "male".equals(gender) ? "Charon" : "Kore");

        Context ctx = getContext();
        String spoken = SmsAnnouncementPolicy.buildSpokenAnnouncement(ctx, sender, body, "پیامک جدید");
        String notifLabel = SmsAnnouncementPolicy.isNumericOrShortcodeSender(sender)
                ? "تست پیامک"
                : ("تست پیامک: " + sender);
        CallAnnouncerService.announce(ctx, notifLabel, spoken, voiceName, "male".equals(gender), 1, false);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String rawUrl = call.getString("url", "");
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", "نشانی خالی است.");
            call.resolve(ret);
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(rawUrl.trim()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "امکان باز کردن لینک در برنامه خارجی نبود.");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void searchWebNative(PluginCall call) {
        final String query = call.getString("query", "");
        final Context appCtx = getContext().getApplicationContext();
        new Thread(() -> {
            JSONObject res = NativeWebSearchHelper.search(appCtx, query);
            JSObject ret;
            try {
                ret = JSObject.fromJSONObject(res);
            } catch (Exception e) {
                ret = new JSObject();
                ret.put("ok", res.optBoolean("ok", false));
                ret.put("offline", res.optBoolean("offline", false));
                ret.put("needsQuery", res.optBoolean("needsQuery", false));
                ret.put("query", res.optString("query", query));
                ret.put("replyText", res.optString("replyText", ""));
                ret.put("linksJson", res.optString("linksJson", "[]"));
                ret.put("error", res.optString("error", ""));
            }
            final JSObject finalRet = ret;
            mainHandler.post(() -> call.resolve(finalRet));
        }, "HamsedaWebSearch").start();
    }

    @PluginMethod
    public void checkConnectivityNative(PluginCall call) {
        final String url = call.getString("url", "");
        final Context appCtx = getContext().getApplicationContext();
        new Thread(() -> {
            JSONObject res = NativeWebSearchHelper.checkConnectivityAndServer(appCtx, url);
            JSObject ret;
            try {
                ret = JSObject.fromJSONObject(res);
            } catch (Exception e) {
                ret = new JSObject();
                ret.put("ok", res.optBoolean("ok", false));
                ret.put("deviceOnline", res.optBoolean("deviceOnline", false));
                ret.put("vpnActive", res.optBoolean("vpnActive", false));
                ret.put("networkType", res.optString("networkType", "unknown"));
                ret.put("serverOk", res.optBoolean("serverOk", false));
                ret.put("aiReady", res.optBoolean("aiReady", false));
                ret.put("httpCode", res.optInt("httpCode", 0));
                ret.put("authRedirect", res.optBoolean("authRedirect", false));
                ret.put("error", res.optString("error", ""));
            }
            final JSObject finalRet = ret;
            mainHandler.post(() -> call.resolve(finalRet));
        }, "HamsedaNetCheck").start();
    }

    private JSObject buildCapsObject() {
        Context ctx = getContext();
        JSObject obj = new JSObject();
        obj.put("isNative", true);
        boolean assistantRoleAvailable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && ctx.getSystemService(Context.ROLE_SERVICE) instanceof RoleManager
                && ((RoleManager) ctx.getSystemService(Context.ROLE_SERVICE)).isRoleAvailable(RoleManager.ROLE_ASSISTANT);
        boolean assistantRoleHeld = isAssistantRoleHeld(ctx);
        obj.put("assistantRoleAvailable", assistantRoleAvailable);
        obj.put("assistantRoleHeld", assistantRoleHeld);
        obj.put("phoneState", ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED);
        // READ_CALL_LOG is used only to receive the incoming caller number in PHONE_STATE broadcasts.
        // No call-history provider query or call-log browsing is implemented.
        obj.put("callLog", assistantRoleHeld
                && ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED);
        obj.put("contacts", ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED);
        obj.put("sms", assistantRoleHeld
                && ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED);
        obj.put("microphone", ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
        obj.put("callPhone", ContextCompat.checkSelfPermission(ctx, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED);
        obj.put("sendSms", assistantRoleHeld
                && ContextCompat.checkSelfPermission(ctx, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED);
        obj.put("camera", ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED);
        obj.put("location", ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED);

        boolean dndOk = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            dndOk = nm != null && nm.isNotificationPolicyAccessGranted();
        }
        obj.put("dndPolicy", dndOk);

        boolean listenerOk = false;
        try {
            listenerOk = NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.getPackageName());
        } catch (Exception ignored) {
        }
        obj.put("notificationListener", listenerOk);

        boolean notifOk = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notifOk = ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        obj.put("notifications", notifOk);

        boolean batteryOk = false;
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm != null) {
            batteryOk = pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        obj.put("batteryIgnored", batteryOk);
        obj.put("overlay", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx));
        obj.put("keepAliveRunning", KeepAliveForegroundService.isRunning);

        boolean exactOk = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            exactOk = am != null && am.canScheduleExactAlarms();
        }
        obj.put("exactAlarm", exactOk);
        obj.put("writeSettings", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.System.canWrite(ctx));
        obj.put("accessibility", HamsedaAccessibilityService.isConnected());
        return obj;
    }

    private void openMiuiAutostartIfAvailable(Context ctx) {
        try {
            Intent miuiIntent = new Intent();
            miuiIntent.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
            miuiIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(miuiIntent);
        } catch (Exception ignored) {
            // Non-MIUI device or activity restricted; ignore gracefully
        }
    }
}
