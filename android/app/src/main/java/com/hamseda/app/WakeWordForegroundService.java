package com.hamseda.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class WakeWordForegroundService extends Service {
    private static final String CHANNEL_ID = "hamseda_wake_word";
    private static final int NOTIFICATION_ID = 7012;
    private static final String PREFS = "rmz_native_prefs";
    private static final String ACTION_START = "com.hamseda.app.WAKE_START";
    private static final String MODEL_NAME = "vosk-model-small-fa-0.42";
    private static final String MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-fa-0.42.zip";
    private static final long MAX_MODEL_BYTES = 150L * 1024L * 1024L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService modelExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService wakeSpeechExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean stopping = false;
    private volatile boolean awaitingCommand = false;
    private volatile boolean modelLoading = false;
    private Model model;
    private Recognizer recognizer;
    private SpeechService speechService;
    private String assistantName = "هم‌صدا";
    private long lastWakeAt = 0L;
    private String lastHandledHypothesis = "";
    private long lastHandledHypothesisAt = 0L;

    private static final Object MODEL_INSTALL_LOCK = new Object();
    private volatile boolean terminatedByError = false;

    public static File getOfflineModelDir(Context context) {
        return new File(new File(context.getFilesDir(), "vosk-fa-0.42"), MODEL_NAME);
    }

    public static boolean isOfflineModelReady(Context context) {
        File modelRoot = getOfflineModelDir(context);
        return new File(modelRoot, "am").isDirectory() && new File(modelRoot, "conf").isDirectory();
    }

    public static File ensureBundledOrExistingModel(Context context) throws Exception {
        synchronized (MODEL_INSTALL_LOCK) {
            File modelRoot = getOfflineModelDir(context);
            if (isOfflineModelReady(context)) {
                return modelRoot;
            }
            File modelDir = modelRoot.getParentFile();
            if (modelDir == null) throw new IllegalStateException("Invalid model directory");
            File cacheZip = new File(context.getCacheDir(), MODEL_NAME + ".once.zip.part");
            boolean copied = false;
            try (InputStream in = new BufferedInputStream(context.getAssets().open("wake/" + MODEL_NAME + ".zip"));
                 FileOutputStream out = new FileOutputStream(cacheZip)) {
                byte[] buffer = new byte[32768];
                long total = 0L;
                int count;
                while ((count = in.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_MODEL_BYTES) throw new IllegalStateException("Bundled model archive too large");
                    out.write(buffer, 0, count);
                }
                out.getFD().sync();
                copied = total > 0L;
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                cacheZip.delete();
                throw new IllegalStateException("مدل گفتار آفلاین فارسی در این نسخه آماده نیست.", e);
            }
            if (!copied) {
                //noinspection ResultOfMethodCallIgnored
                cacheZip.delete();
                throw new IllegalStateException("فایل مدل آفلاین فارسی خالی است.");
            }
            try {
                extractModelZip(context, cacheZip, modelDir);
            } finally {
                //noinspection ResultOfMethodCallIgnored
                cacheZip.delete();
            }
            return modelRoot;
        }
    }

    private static void extractModelZip(Context context, File zipFile, File modelDir) throws Exception {
        File staging = new File(context.getFilesDir(), "vosk-fa-staging");
        deleteRecursivelyStatic(staging);
        if (!staging.mkdirs() && !staging.isDirectory()) {
            throw new IllegalStateException("امکان ساخت پوشه موقت برای مدل فارسی وجود ندارد.");
        }
        String stagingCanonical = staging.getCanonicalPath() + File.separator;
        try {
            try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new java.io.FileInputStream(zipFile)))) {
                ZipEntry entry;
                byte[] buffer = new byte[32768];
                while ((entry = zis.getNextEntry()) != null) {
                    File target = new File(staging, entry.getName());
                    String canonical = target.getCanonicalPath();
                    if (!canonical.startsWith(stagingCanonical)) {
                        throw new SecurityException("ساختار مسیر داخل فایل مدل نامعتبر است.");
                    }
                    if (entry.isDirectory()) {
                        if (!target.mkdirs() && !target.isDirectory()) {
                            throw new IllegalStateException("امکان ساخت پوشه‌های مدل فارسی نبود.");
                        }
                    } else {
                        File parent = target.getParentFile();
                        if (parent != null && !parent.mkdirs() && !parent.isDirectory()) {
                            throw new IllegalStateException("امکان ساخت زیرپوشه مدل فارسی نبود.");
                        }
                        try (FileOutputStream out = new FileOutputStream(target)) {
                            int n;
                            while ((n = zis.read(buffer)) != -1) out.write(buffer, 0, n);
                        }
                    }
                    zis.closeEntry();
                }
            }

            File extractedNested = new File(staging, MODEL_NAME);
            File sourceRoot;
            if (new File(extractedNested, "am").isDirectory() && new File(extractedNested, "conf").isDirectory()) {
                sourceRoot = extractedNested;
            } else if (new File(staging, "am").isDirectory() && new File(staging, "conf").isDirectory()) {
                sourceRoot = staging;
            } else {
                throw new IllegalStateException("ساختار مدل گفتار فارسی کامل نیست (پوشه‌های am/conf یافت نشدند).");
            }

            deleteRecursivelyStatic(modelDir);
            if (!modelDir.mkdirs() && !modelDir.isDirectory()) {
                throw new IllegalStateException("امکان ساخت پوشه نهایی مدل فارسی وجود ندارد.");
            }
            File finalRoot = new File(modelDir, MODEL_NAME);
            if (!sourceRoot.renameTo(finalRoot)) {
                throw new IllegalStateException("انتقال فایل‌های مدل گفتار فارسی به حافظه نهایی ناموفق بود.");
            }
        } finally {
            deleteRecursivelyStatic(staging);
        }
    }

    private static void deleteRecursivelyStatic(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursivelyStatic(child);
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static void setWakeState(Context context, String state, @Nullable String error) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString("wake_service_state", state);
        if (error != null && !error.trim().isEmpty()) {
            editor.putString("wake_service_error", error.trim());
        } else {
            editor.remove("wake_service_error");
        }
        editor.apply();
    }

    public static boolean start(Context context, String name) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) return false;
        Intent intent = new Intent(context, WakeWordForegroundService.class);
        intent.setAction(ACTION_START);
        intent.putExtra("assistant_name", name == null ? "هم‌صدا" : name);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, WakeWordForegroundService.class));
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putBoolean("wake_word_enabled", false)
                .putString("wake_service_state", "stopped")
                .remove("wake_service_error")
                .remove("pending_wake_command")
                .apply();
    }

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra("assistant_name")) {
            String requestedName = intent.getStringExtra("assistant_name");
            if (requestedName != null && !requestedName.trim().isEmpty()) assistantName = requestedName.trim();
        } else {
            assistantName = getSharedPreferences(PREFS, MODE_PRIVATE)
                    .getString("assistant_name", "هم‌صدا");
        }

        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putBoolean("wake_word_enabled", true)
                .putString("assistant_name", assistantName)
                .putString("wake_service_state", "preparing")
                .remove("wake_service_error")
                .apply();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification("در حال آماده‌سازی موتور شنود فارسی…"),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, buildNotification("در حال آماده‌سازی موتور شنود فارسی…"));
        }

        stopping = false;
        terminatedByError = false;
        if (speechService == null && !modelLoading) prepareModelAndStart();
        return START_STICKY;
    }

    private Notification buildNotification(String message) {
        return buildNotification(message, 0, false);
    }

    private Notification buildNotification(String message, int progress, boolean indeterminate) {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 712, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_rmz)
                .setContentTitle("هم‌صدا · گوش‌به‌زنگ")
                .setContentText(message)
                .setContentIntent(pending)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (indeterminate || progress > 0) {
            builder.setProgress(100, Math.max(0, Math.min(100, progress)), indeterminate);
        }
        return builder.build();
    }

    private void updateNotification(String message) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(message));
    }

    private void updateDownloadProgress(long downloaded, long total) {
        long safeDownloaded = Math.max(0L, downloaded);
        if (total > 0L) {
            int percent = (int) Math.min(100L, (safeDownloaded * 100L) / total);
            String message = "دانلود مدل فارسی: " + toPersianDigits(percent) + "٪  ·  "
                    + formatMegabytes(safeDownloaded) + " از " + formatMegabytes(total) + " مگابایت";
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(message, percent, false));
        } else {
            String message = "در حال دانلود مدل فارسی · دریافت‌شده: " + formatMegabytes(safeDownloaded) + " مگابایت";
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(message, 0, true));
        }
    }

    private String formatMegabytes(long bytes) {
        return String.format(Locale.US, "%.1f", bytes / (1024.0 * 1024.0));
    }

    private String toPersianDigits(int value) {
        return String.valueOf(value).replace('0', '۰').replace('1', '۱').replace('2', '۲')
                .replace('3', '۳').replace('4', '۴').replace('5', '۵')
                .replace('6', '۶').replace('7', '۷').replace('8', '۸').replace('9', '۹');
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                    "گوش‌به‌زنگ هم‌صدا", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("شنود آشکار واژه بیدارباش و دریافت فرمان صوتی");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void prepareModelAndStart() {
        modelLoading = true;
        setWakeState(this, "preparing", null);
        modelExecutor.execute(() -> {
            File modelDir = new File(getFilesDir(), "vosk-fa-0.42");
            File modelRoot = new File(modelDir, MODEL_NAME);
            boolean modelAlreadyInstalled = isOfflineModelReady(this);
            try {
                synchronized (MODEL_INSTALL_LOCK) {
                    if (!isOfflineModelReady(this)) {
                        installModel(modelDir, modelRoot);
                    }
                    modelAlreadyInstalled = isOfflineModelReady(this);
                }
                Model loaded = new Model(modelRoot.getAbsolutePath());
                handler.post(() -> {
                    modelLoading = false;
                    if (stopping) {
                        loaded.close();
                        return;
                    }
                    model = loaded;
                    startContinuousRecognition();
                });
            } catch (Exception e) {
                if (modelAlreadyInstalled) {
                    // Corrupt on-disk model prevented native Model() initialization; clear it cleanly for recovery.
                    deleteRecursively(modelDir);
                }
                final String userError = classifyModelError(e, modelAlreadyInstalled);
                handler.post(() -> {
                    modelLoading = false;
                    if (!stopping) {
                        terminatedByError = true;
                        setWakeState(this, "error", userError);
                        updateNotification(userError);
                    }
                });
            }
        });
    }

    private String classifyModelError(Exception e, boolean wasOnDisk) {
        String msg = e.getMessage() != null ? e.getMessage().trim() : "";
        if (wasOnDisk) {
            return "فایل‌های مدل گفتار فارسی خراب بودند و برای ترمیم پاک شدند؛ دوباره شنود را روشن کنید.";
        }
        if (msg.contains("اینترنت") || msg.contains("ساختار") || msg.contains("فایل‌های مدل") || msg.contains("HTTP")) {
            return msg;
        }
        if (e instanceof java.io.IOException) {
            return "دریافت یا خواندن فایل مدل فارسی انجام نشد؛ در صورت نبود مدل روی گوشی اینترنت را بررسی کنید.";
        }
        return msg.isEmpty()
                ? "آماده‌سازی موتور شنود فارسی انجام نشد؛ لطفاً دوباره شنود را روشن کنید."
                : "خطای موتور شنود فارسی: " + msg;
    }

    private void installModel(File modelDir, File expectedRoot) throws Exception {
        File zipFile = new File(getCacheDir(), MODEL_NAME + ".zip.part");
        boolean loadedBundledModel = false;

        // Prefer the model packaged inside the APK so first-time setup works fully offline.
        try {
            updateNotification("در حال آماده‌سازی مدل فارسی آفلاین…");
            try (InputStream in = new BufferedInputStream(getAssets().open("wake/" + MODEL_NAME + ".zip"));
                 FileOutputStream out = new FileOutputStream(zipFile)) {
                byte[] buffer = new byte[32768];
                long total = 0L;
                int count;
                while ((count = in.read(buffer)) != -1) {
                    if (stopping || Thread.currentThread().isInterrupted()) {
                        throw new InterruptedException("stopped");
                    }
                    total += count;
                    if (total > MAX_MODEL_BYTES) throw new IllegalStateException("حجم فایل مدل داخلی غیرعادی است.");
                    out.write(buffer, 0, count);
                }
                out.getFD().sync();
                loadedBundledModel = total > 0L;
            }
        } catch (InterruptedException interrupted) {
            throw interrupted;
        } catch (Exception missingOrInvalidBundledAsset) {
            // Backward-compatible fallback for builds that do not yet include the bundled model.
            // A model downloaded once is retained in app-private storage for future offline starts.
            //noinspection ResultOfMethodCallIgnored
            zipFile.delete();
        }

        if (!loadedBundledModel) {
            if (!CallAnnouncerService.isNetworkConnected(this)) {
                throw new IllegalStateException("مدل گفتار فارسی روی گوشی نصب نیست و اینترنت هم قطع است؛ برای دریافت اولیه (~۵۳ مگابایت) یک بار به اینترنت وصل شوید.");
            }
            updateNotification("در حال دریافت اولیه مدل گفتار فارسی (حدود ۵۳ مگابایت)…");
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(MODEL_URL).openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(60000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) throw new IllegalStateException("خطای سرور دریافت مدل (HTTP " + status + ")");
                long declared = connection.getContentLengthLong();
                if (declared > MAX_MODEL_BYTES) throw new IllegalStateException("حجم فایل مدل دریافت‌شده غیرمعتبر است.");
                try (InputStream in = new BufferedInputStream(connection.getInputStream());
                     FileOutputStream out = new FileOutputStream(zipFile)) {
                    byte[] buffer = new byte[32768];
                    long total = 0;
                    long lastProgressUpdate = 0L;
                    int count;
                    while ((count = in.read(buffer)) != -1) {
                        if (stopping || Thread.currentThread().isInterrupted()) throw new InterruptedException("stopped");
                        total += count;
                        if (total > MAX_MODEL_BYTES) throw new IllegalStateException("حجم فایل مدل دریافت‌شده غیرمعتبر است.");
                        out.write(buffer, 0, count);
                        long now = System.currentTimeMillis();
                        if (now - lastProgressUpdate >= 300L) {
                            updateDownloadProgress(total, declared);
                            lastProgressUpdate = now;
                        }
                    }
                    out.getFD().sync();
                    updateDownloadProgress(total, declared);
                }
            } finally {
                if (connection != null) connection.disconnect();
            }
        }

        try {
            extractModelZip(this, zipFile, modelDir);
        } finally {
            //noinspection ResultOfMethodCallIgnored
            zipFile.delete();
        }
    }

    private void startContinuousRecognition() {
        if (stopping || model == null) return;
        try {
            recognizer = new Recognizer(model, 16000.0f);
            speechService = new SpeechService(recognizer, 16000.0f);
            boolean started = speechService.startListening(new RecognitionListener() {
                @Override public void onResult(String hypothesis) {
                    handleRecognizedText(readText(hypothesis));
                }
                @Override public void onFinalResult(String hypothesis) {
                    handleRecognizedText(readText(hypothesis));
                }
                @Override public void onPartialResult(String hypothesis) {}
                @Override public void onError(Exception e) {
                    handler.postDelayed(() -> recoverContinuousRecognition(), 1200);
                }
                @Override public void onTimeout() {}
            });
            if (!started) throw new IllegalStateException("میکروفون شنود پیوسته توسط سیستم آزاد نشد.");
            setWakeState(this, "listening", null);
            updateNotification("گوش‌به‌زنگ فعال است؛ با نام «" + assistantName + "» صدا بزن یا فرمان بده.");
        } catch (Exception e) {
            setWakeState(this, "error", "شروع شنود پیوسته ناموفق بود؛ دوباره تلاش می‌کنم.");
            updateNotification("شروع شنود پیوسته ناموفق بود؛ دوباره تلاش می‌کنم.");
            handler.postDelayed(() -> recoverContinuousRecognition(), 2500);
        }
    }

    private String readText(String json) {
        try {
            return new JSONObject(json == null ? "{}" : json).optString("text", "").trim();
        } catch (Exception ignored) {
            return "";
        }
    }

    private void handleRecognizedText(String spoken) {
        if (stopping || spoken == null || spoken.trim().isEmpty()) return;
        // Vosk may emit the same utterance via both onResult and onFinalResult.
        // Drop duplicate callbacks before they can speak the wake acknowledgement twice.
        String normalizedHypothesis = normalize(spoken);
        long now = System.currentTimeMillis();
        if (normalizedHypothesis.equals(lastHandledHypothesis)
                && now - lastHandledHypothesisAt < 2200L) return;
        lastHandledHypothesis = normalizedHypothesis;
        lastHandledHypothesisAt = now;
        if (awaitingCommand) {
            awaitingCommand = false;
            savePendingCommand(spoken);
            return;
        }
        if (containsWakeWord(spoken)) {
            if (!onWakeWordHeard()) return;
            String command = extractCommandAfterWakeWord(spoken);
            if (!command.isEmpty()) {
                savePendingCommand(command);
            } else {
                awaitingCommand = true;
                speakWakePrompt();
            }
            return;
        }

        // Wake-word-free mode: accept only clear device-command phrases, not arbitrary speech.
        if (isLikelyDeviceCommand(spoken) && onWakeWordHeard()) {
            savePendingCommand(spoken.trim());
        }
    }

    private boolean isLikelyDeviceCommand(String spoken) {
        if (spoken == null) return false;
        String text = normalize(spoken);
        if (text.length() < 4 || text.length() > 180) return false;
        return text.matches("(?s).*(باز کن|بازش کن|ببند|ببندش|برگرد|برو|بازگشت|تماس بگیر|زنگ بزن|پیامک بده|پیام بده|ارسال کن|رادیو|پادکست|موزیک|موسیقی|آهنگ|پخش کن|مکث کن|ادامه بده|متوقف کن|عکس بگیر|فیلم بگیر|عکس بنداز|چراغ قوه|نور صفحه|صدا رو|صدا را|ساعت چنده|امروز چندشنبه|جستجو کن|دنبال .* بگرد|اسکرول|پایین برو|بالا برو|وای.?فای|بلوتوث|تایمر|آلارم).*");
    }

    private void speakWakePrompt() {
        SpeechService active = speechService;
        if (active != null) active.setPause(true);

        wakeSpeechExecutor.execute(() -> {
            final Context appCtx = getApplicationContext();
            final String prompt = "جانم، بفرمایید";
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            boolean preferOffline = prefs.getBoolean("prefer_offline_speech", false);
            String offlineEngine = prefs.getString("preferred_offline_engine", "ava_gyro");
            String defaultVoice = prefs.getString("default_voice_name", "Kore");
            boolean isMale = CallAnnouncerService.isMaleVoice(
                    defaultVoice,
                    "male".equals(prefs.getString("default_voice_gender", "female"))
            );
            float rate = prefs.getFloat("speech_rate", 1.0f);

            OfflinePersianTts.stop();
            BilingualSpeechHelper.stopActiveTts();

            boolean spoken = false;
            try {
                if (!preferOffline && !stopping) {
                    File audioFile = CallAnnouncerService.findCachedAudioStatic(appCtx, prompt, defaultVoice);
                    if (audioFile == null && CallAnnouncerService.isNetworkConnected(appCtx)) {
                        audioFile = CallAnnouncerService.fetchOrGetCachedAudioStatic(appCtx, prompt, defaultVoice);
                    }
                    if (audioFile != null && !stopping) {
                        spoken = CallAnnouncerService.playAudioFileBlocking(appCtx, audioFile, rate);
                    }
                }

                if (!spoken && !stopping) {
                    if ("pocket_farsi".equals(offlineEngine)) {
                        File pocketFile = CallAnnouncerService.findCachedAudioStatic(appCtx, prompt, "pocket_farsi");
                        if (pocketFile != null) {
                            spoken = CallAnnouncerService.playAudioFileBlocking(appCtx, pocketFile, rate);
                        }
                    }
                    if (!spoken && !stopping) {
                        String sherpaEngineId = "pocket_farsi".equals(offlineEngine) ? null : offlineEngine;
                        OfflinePersianTts.SpeakResult res = OfflinePersianTts.speakWithEngine(
                                appCtx,
                                sherpaEngineId,
                                prompt,
                                rate,
                                null
                        );
                        spoken = res.getOk();
                    }
                }

                if (!spoken && !stopping) {
                    CountDownLatch latch = new CountDownLatch(1);
                    handler.post(() -> {
                        if (stopping) {
                            latch.countDown();
                            return;
                        }
                        BilingualSpeechHelper.speak(appCtx, prompt, isMale, rate, false, success -> latch.countDown());
                    });
                    latch.await(4, TimeUnit.SECONDS);
                }

                if (!stopping) {
                    Thread.sleep(120L);
                }
            } catch (Exception ignored) {
            } finally {
                handler.post(() -> {
                    if (stopping) return;
                    if (recognizer != null) recognizer.reset();
                    SpeechService current = speechService;
                    if (current != null) current.setPause(false);
                });
            }
        });
    }

    private boolean containsWakeWord(String spoken) {
        String heard = normalize(spoken);
        String expected = normalize(assistantName);
        return !heard.isEmpty() && !expected.isEmpty() && heard.contains(expected);
    }

    private String extractCommandAfterWakeWord(String spoken) {
        String expected = normalize(assistantName);
        if (expected.isEmpty()) return "";
        for (int i = 0; i < spoken.length(); i++) {
            if (normalize(spoken.substring(0, i + 1)).contains(expected)) {
                return spoken.substring(i + 1).replaceFirst("^[\\s،,:;.!؟\\-]+", "").trim();
            }
        }
        return "";
    }

    private String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
                .replace('ي', 'ی').replace('ك', 'ک')
                .replace("‌", "").replaceAll("[\\s\\p{Punct}]+", "")
                .toLowerCase(Locale.ROOT);
    }

    private boolean onWakeWordHeard() {
        long now = System.currentTimeMillis();
        // A slightly wider cooldown also suppresses near-identical Vosk hypotheses
        // that differ by one or two recognized words and used to queue repeated "جانم".
        if (now - lastWakeAt < 3500L) return false;
        lastWakeAt = now;
        updateNotification("نام هم‌صدا شنیده شد؛ منتظر فرمان هستم.");
        return true;
    }

    private void savePendingCommand(String command) {
        if (command == null || command.trim().isEmpty()) return;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString("pending_wake_command", command.trim())
                .putLong("pending_wake_command_at", System.currentTimeMillis())
                .apply();
        updateNotification("هم‌صدا · فرمان دریافت شد؛ برای اجرا وارد دستیار شو.");
    }

    private void recoverContinuousRecognition() {
        if (stopping || model == null) return;
        try {
            if (speechService != null) {
                speechService.cancel();
                speechService.shutdown();
                speechService = null;
            }
            if (recognizer != null) {
                recognizer.close();
                recognizer = null;
            }
        } catch (Exception ignored) {}
        startContinuousRecognition();
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    @Override public void onDestroy() {
        stopping = true;
        modelExecutor.shutdownNow();
        wakeSpeechExecutor.shutdownNow();
        try {
            if (speechService != null) {
                speechService.cancel();
                speechService.shutdown();
                speechService = null;
            }
        } catch (Exception ignored) {}
        try {
            if (recognizer != null) {
                recognizer.close();
                recognizer = null;
            }
            if (model != null) {
                model.close();
                model = null;
            }
        } catch (Exception ignored) {}
        SharedPreferences.Editor destroyEdit = getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putBoolean("wake_word_enabled", false);
        if (!terminatedByError) {
            destroyEdit.putString("wake_service_state", "stopped");
        }
        destroyEdit.apply();
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}