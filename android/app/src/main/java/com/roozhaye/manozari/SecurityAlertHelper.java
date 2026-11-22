package com.roozhaye.manozari;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.Image;
import android.media.ImageReader;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Handles Power-Off PIN verification, stealth front/back camera snapshots,
 * fast dual-provider (Network + GPS) coordinate capture, local offline evidence queue,
 * and dispatching alerts to /api/security-alert (+ direct HTTPS webhook fallback).
 */
public final class SecurityAlertHelper {
    private static final String PREFS = "rmz_native_prefs";
    private static final String DEFAULT_API_BASE = "https://hamseda-app.ai.studio";
    private static final AtomicBoolean CAPTURE_IN_PROGRESS = new AtomicBoolean(false);
    private static final AtomicBoolean FLUSH_IN_PROGRESS = new AtomicBoolean(false);

    public interface CaptureCallback {
        void onCaptureFinished(@Nullable JSONObject record);
    }

    private SecurityAlertHelper() {}

    public static String hashPin(String rawPin) {
        if (rawPin == null || rawPin.trim().isEmpty()) return "";
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(("hamseda-power-guard-v1:" + rawPin.trim()).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format(Locale.US, "%02x", b));
            }
            return sb.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    public static void saveConfig(
            Context ctx,
            boolean enabled,
            @Nullable String newPin,
            boolean clearPin,
            @Nullable String backupEmail,
            @Nullable String webhookUrl,
            @Nullable String serverBaseUrl,
            boolean allowInAppBypass
    ) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = prefs.edit();
        ed.putBoolean("power_guard_enabled", enabled);
        ed.putBoolean("power_guard_allow_in_app_bypass", allowInAppBypass);
        if (clearPin) {
            ed.remove("power_guard_pin_hash");
        } else if (newPin != null && !newPin.trim().isEmpty()) {
            ed.putString("power_guard_pin_hash", hashPin(newPin));
        }
        if (backupEmail != null) {
            ed.putString("security_backup_email", backupEmail.trim());
        }
        if (webhookUrl != null) {
            ed.putString("security_webhook_url", webhookUrl.trim());
        }
        if (serverBaseUrl != null && !serverBaseUrl.trim().isEmpty()) {
            ed.putString("server_base_url", serverBaseUrl.trim().replaceAll("/+$", ""));
        }
        ed.apply();
    }

    public static boolean isOwnerInAppBypassEnabled(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getBoolean("power_guard_allow_in_app_bypass", true);
    }

    public static boolean isEnabledAndConfigured(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean("power_guard_enabled", false);
        String hash = prefs.getString("power_guard_pin_hash", "");
        return enabled && hash != null && !hash.isEmpty();
    }

    public static boolean hasPinConfigured(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String hash = prefs.getString("power_guard_pin_hash", "");
        return hash != null && !hash.isEmpty();
    }

    public static boolean verifyPin(Context ctx, String candidatePin) {
        if (candidatePin == null || candidatePin.trim().isEmpty()) return false;
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String savedHash = prefs.getString("power_guard_pin_hash", "");
        if (savedHash == null || savedHash.isEmpty()) return false;
        return savedHash.equals(hashPin(candidatePin));
    }

    public static boolean isInUnlockGraceWindow(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return System.currentTimeMillis() < prefs.getLong("power_guard_unlocked_until", 0L);
    }

    public static void grantUnlockGraceWindow(Context ctx, long durationMs) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putLong("power_guard_unlocked_until", System.currentTimeMillis() + Math.max(5000L, durationMs)).apply();
    }

    public static JSONObject getNetworkSnapshot(Context ctx) {
        JSONObject info = new JSONObject();
        boolean connected = false;
        boolean vpnActive = false;
        boolean wifiActive = false;
        boolean cellularActive = false;
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Network active = cm.getActiveNetwork();
                    if (active != null) {
                        NetworkCapabilities caps = cm.getNetworkCapabilities(active);
                        if (caps != null) {
                            wifiActive = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
                            cellularActive = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR);
                            vpnActive = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
                            connected = wifiActive || cellularActive || vpnActive
                                    || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET);
                        }
                    }
                    for (Network net : cm.getAllNetworks()) {
                        NetworkCapabilities c = cm.getNetworkCapabilities(net);
                        if (c == null) continue;
                        if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                            wifiActive = true;
                            connected = true;
                        }
                        if (c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                            cellularActive = true;
                            connected = true;
                        }
                        if (c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
                            connected = true;
                        }
                        if (c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                            vpnActive = true;
                            connected = true;
                        }
                    }
                } else {
                    NetworkInfo ni = cm.getActiveNetworkInfo();
                    connected = ni != null && ni.isConnected();
                }
            }
            String typeLabel = !connected ? "offline"
                    : (wifiActive ? (vpnActive ? "wifi+vpn" : "wifi")
                    : (cellularActive ? (vpnActive ? "cellular+vpn" : "cellular")
                    : (vpnActive ? "vpn" : "other")));
            info.put("connected", connected);
            info.put("vpnActive", vpnActive);
            info.put("wifiActive", wifiActive);
            info.put("cellularActive", cellularActive);
            info.put("networkType", typeLabel);
        } catch (Exception ignored) {
        }
        return info;
    }

    public static void captureEvidenceAndQueueAlertAsync(Context ctx, String reason, int attemptCount) {
        captureEvidenceAndQueueAlertAsync(ctx, reason, attemptCount, null);
    }

    public static void captureEvidenceAndQueueAlertAsync(
            Context ctx,
            String reason,
            int attemptCount,
            @Nullable CaptureCallback callback
    ) {
        if (!CAPTURE_IN_PROGRESS.compareAndSet(false, true)) {
            if (callback != null) {
                new Handler(Looper.getMainLooper()).post(() -> callback.onCaptureFinished(null));
            }
            return;
        }
        final Context appCtx = ctx.getApplicationContext();
        final Handler main = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            JSONObject savedRecord = null;
            try {
                SharedPreferences prefs = appCtx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                final AtomicReference<Location> locRef = new AtomicReference<>(null);
                Thread locThread = new Thread(() -> {
                    try {
                        locRef.set(acquireBestLocation(appCtx));
                    } catch (Exception ignored) {
                    }
                }, "HamsedaSecLoc");
                locThread.start();

                JSONObject net = getNetworkSnapshot(appCtx);

                // Capture cameras immediately while PowerGuardActivity is in foreground
                byte[] frontJpeg = captureSinglePhotoJpeg(appCtx, CameraCharacteristics.LENS_FACING_FRONT, 2200L);
                byte[] backJpeg = captureSinglePhotoJpeg(appCtx, CameraCharacteristics.LENS_FACING_BACK, 2200L);
                try {
                    locThread.join(900L);
                } catch (InterruptedException ignored) {
                }
                Location loc = locRef.get();

                long now = System.currentTimeMillis();
                SimpleDateFormat isoFmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
                isoFmt.setTimeZone(TimeZone.getTimeZone("UTC"));
                String tsIso = isoFmt.format(new Date(now));

                File alertDir = getAlertsDir(appCtx);
                String frontPath = "";
                String backPath = "";
                String frontB64 = "";
                String backB64 = "";
                String frontThumbB64 = "";
                String backThumbB64 = "";

                if (frontJpeg != null && frontJpeg.length > 0) {
                    File fFile = new File(alertDir, "selfie_" + now + ".jpg");
                    writeBytes(fFile, frontJpeg);
                    frontPath = fFile.getAbsolutePath();
                    frontB64 = Base64.encodeToString(frontJpeg, Base64.NO_WRAP);
                    byte[] fThumb = shrinkJpegForEmail(frontJpeg, 220, 62);
                    if (fThumb != null && fThumb.length > 0) {
                        frontThumbB64 = Base64.encodeToString(fThumb, Base64.NO_WRAP);
                    }
                }
                if (backJpeg != null && backJpeg.length > 0) {
                    File bFile = new File(alertDir, "rear_" + now + ".jpg");
                    writeBytes(bFile, backJpeg);
                    backPath = bFile.getAbsolutePath();
                    backB64 = Base64.encodeToString(backJpeg, Base64.NO_WRAP);
                    byte[] bThumb = shrinkJpegForEmail(backJpeg, 220, 62);
                    if (bThumb != null && bThumb.length > 0) {
                        backThumbB64 = Base64.encodeToString(bThumb, Base64.NO_WRAP);
                    }
                }

                JSONObject record = new JSONObject();
                record.put("id", "sec_" + now);
                record.put("createdAt", now);
                record.put("timestampIso", tsIso);
                record.put("reason", reason != null ? reason : "power_guard_alert");
                record.put("attemptCount", Math.max(1, attemptCount));
                record.put("ownerName", prefs.getString("self_name", "کاربر هم‌صدا"));
                record.put("backupEmail", prefs.getString("security_backup_email", ""));
                record.put("webhookUrl", prefs.getString("security_webhook_url", ""));
                record.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
                record.put("networkType", net.optString("networkType", "unknown"));
                record.put("vpnActive", net.optBoolean("vpnActive", false));
                record.put("frontPhotoPath", frontPath);
                record.put("backPhotoPath", backPath);
                record.put("frontPhotoBase64", frontB64);
                record.put("backPhotoBase64", backB64);
                record.put("frontThumbBase64", frontThumbB64);
                record.put("backThumbBase64", backThumbB64);
                record.put("sent", false);
                record.put("emailSent", false);
                record.put("webhookSent", false);
                record.put("dispatchStatus", net.optBoolean("connected", false) ? "در حال ارسال..." : "ذخیره آفلاین (بدون اینترنت)");

                if (loc != null) {
                    double lat = loc.getLatitude();
                    double lng = loc.getLongitude();
                    record.put("lat", lat);
                    record.put("lng", lng);
                    record.put("accuracyMeters", Math.round(loc.getAccuracy()));
                    record.put("mapsUrl", String.format(Locale.US, "https://maps.google.com/?q=%.6f,%.6f", lat, lng));
                } else {
                    record.put("mapsUrl", "");
                }

                File recordFile = new File(alertDir, "alert_" + now + ".json");
                writeBytes(recordFile, record.toString().getBytes(StandardCharsets.UTF_8));
                pruneOldAlerts(alertDir);
                savedRecord = record;

                // Notify Activity so it can safely finish after camera hardware is closed
                if (callback != null) {
                    final JSONObject snapshotForUi = new JSONObject(record.toString());
                    main.post(() -> callback.onCaptureFinished(snapshotForUi));
                }

                trySendAlertFile(appCtx, recordFile, record);
            } catch (Exception ignored) {
                if (callback != null) {
                    final JSONObject fallbackSnap = savedRecord;
                    main.post(() -> callback.onCaptureFinished(fallbackSnap));
                }
            } finally {
                CAPTURE_IN_PROGRESS.set(false);
            }
        }, "HamsedaSecCapture").start();
    }

    public static void flushPendingAlertsAsync(Context ctx) {
        if (!FLUSH_IN_PROGRESS.compareAndSet(false, true)) return;
        final Context appCtx = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                File alertDir = getAlertsDir(appCtx);
                File[] files = alertDir.listFiles((d, name) -> name.startsWith("alert_") && name.endsWith(".json"));
                if (files == null || files.length == 0) return;
                Arrays.sort(files, Comparator.comparingLong(File::lastModified));
                for (File f : files) {
                    try {
                        JSONObject rec = new JSONObject(readFileUtf8(f));
                        if (!rec.optBoolean("sent", false)) {
                            trySendAlertFile(appCtx, f, rec);
                        }
                    } catch (Exception ignored) {
                    }
                }
            } finally {
                FLUSH_IN_PROGRESS.set(false);
            }
        }, "HamsedaSecFlush").start();
    }

    private static void trySendAlertFile(Context ctx, File recordFile, JSONObject record) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String backupEmail = record.optString("backupEmail", "").trim();
        if (backupEmail.isEmpty()) backupEmail = prefs.getString("security_backup_email", "").trim();
        String webhookUrl = record.optString("webhookUrl", "").trim();
        if (webhookUrl.isEmpty()) webhookUrl = prefs.getString("security_webhook_url", "").trim();

        String baseUrl = prefs.getString("server_base_url", DEFAULT_API_BASE);
        String normalizedBase = baseUrl != null ? baseUrl.trim().replaceAll("/+$", "") : "";
        if (normalizedBase.isEmpty()
                || "https://roozhaye-manozari-7.ai.studio".equals(normalizedBase)
                || "https://hamseda-voice-suite.ai.studio".equals(normalizedBase)
                || "https://ais-pre-5dqrp6vmbjkluesjlbth6l-737153117526.europe-west2.run.app".equals(normalizedBase)
                || "https://ais-dev-5dqrp6vmbjkluesjlbth6l-737153117526.europe-west2.run.app".equals(normalizedBase)) {
            baseUrl = DEFAULT_API_BASE;
        } else {
            baseUrl = normalizedBase;
        }
        String endpoint = baseUrl.replaceAll("/+$", "") + "/api/security-alert";

        boolean serverOk = false;
        boolean emailSent = false;
        boolean webhookSent = false;
        String serverMsg = "";
        String serverErr = "";

        HttpURLConnection conn = null;
        try {
            JSONObject payload = new JSONObject(record.toString());
            payload.put("backupEmail", backupEmail);
            payload.put("webhookUrl", webhookUrl);

            URL url = new URL(endpoint);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(9000);
            conn.setReadTimeout(16000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");

            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
                os.flush();
            }

            int code = conn.getResponseCode();
            BufferedReader reader = new BufferedReader(new InputStreamReader(
                    code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream(),
                    StandardCharsets.UTF_8
            ));
            StringBuilder respSb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                respSb.append(line);
            }
            reader.close();

            if (code >= 200 && code < 300) {
                String rawResp = respSb.toString().trim();
                if (rawResp.startsWith("{")) {
                    JSONObject respJson = new JSONObject(rawResp);
                    serverOk = Boolean.TRUE.equals(respJson.optBoolean("ok", true));
                    emailSent = respJson.optBoolean("emailSent", false);
                    webhookSent = respJson.optBoolean("webhookSent", false);
                    serverMsg = respJson.optString("message", "در سرور ثبت شد");
                } else {
                    serverErr = "سرور صفحه وب غیرمعتبر برگرداند (نشانی سرور در تنظیمات بررسی شود)";
                }
            } else {
                serverErr = "خطای سرور (کد " + code + ")";
            }
        } catch (Exception e) {
            String em = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            serverErr = "عدم دسترسی به سرور (" + em + ")";
        } finally {
            if (conn != null) conn.disconnect();
        }

        // Direct HTTPS webhook fallback from Android device itself (works on Wi-Fi even if server is unreachable)
        if (!webhookSent && webhookUrl.startsWith("https://")) {
            webhookSent = tryDirectWebhookPost(webhookUrl, record, backupEmail);
        }

        try {
            if (serverOk || webhookSent) {
                record.put("sent", true);
                record.put("emailSent", emailSent);
                record.put("webhookSent", webhookSent);
                record.put("sentAt", System.currentTimeMillis());
                if (emailSent) {
                    record.put("dispatchStatus", "ایمیل با عکس و لوکیشن ارسال شد");
                } else if (webhookSent && !serverOk) {
                    record.put("dispatchStatus", "مستقیماً به وب‌هوک ارسال شد (" + serverErr + ")");
                } else if (webhookSent) {
                    record.put("dispatchStatus", "به وب‌هوک ارسال شد");
                } else {
                    record.put("dispatchStatus", !serverMsg.isEmpty() ? serverMsg : "ثبت در سرور (ایمیل تنظیم نشده)");
                }
            } else {
                record.put("sent", false);
                record.put("dispatchStatus", !serverErr.isEmpty() ? serverErr : "در انتظار ارسال مجدد");
            }
            writeBytes(recordFile, record.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
        }
    }

    private static boolean tryDirectWebhookPost(String webhookUrl, JSONObject record, String backupEmail) {
        HttpURLConnection conn = null;
        try {
            JSONObject hookPayload = new JSONObject();
            hookPayload.put("event", "hamseda_security_alert");
            hookPayload.put("source", "android_direct");
            hookPayload.put("ownerName", record.optString("ownerName", ""));
            hookPayload.put("backupEmail", backupEmail);
            hookPayload.put("reason", record.optString("reason", ""));
            hookPayload.put("attemptCount", record.optInt("attemptCount", 1));
            hookPayload.put("timestampIso", record.optString("timestampIso", ""));
            hookPayload.put("mapsUrl", record.optString("mapsUrl", ""));
            if (record.has("lat")) hookPayload.put("lat", record.optDouble("lat"));
            if (record.has("lng")) hookPayload.put("lng", record.optDouble("lng"));
            hookPayload.put("accuracyMeters", record.optInt("accuracyMeters", 0));
            hookPayload.put("deviceModel", record.optString("deviceModel", Build.MODEL));
            hookPayload.put("networkType", record.optString("networkType", "unknown"));
            hookPayload.put("vpnActive", record.optBoolean("vpnActive", false));
            hookPayload.put("frontPhotoBase64", record.optString("frontPhotoBase64", ""));
            hookPayload.put("backPhotoBase64", record.optString("backPhotoBase64", ""));

            URL url = new URL(webhookUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(9000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            byte[] bytes = hookPayload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
                os.flush();
            }
            int code = conn.getResponseCode();
            return code >= 200 && code < 400;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    public static boolean sendDirectWebhookTest(Context ctx, String webhookUrl, String backupEmail, String ownerName) {
        if (webhookUrl == null || !webhookUrl.trim().startsWith("https://")) {
            return false;
        }
        try {
            SimpleDateFormat isoFmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            isoFmt.setTimeZone(TimeZone.getTimeZone("UTC"));
            JSONObject rec = new JSONObject();
            rec.put("ownerName", ownerName != null ? ownerName : "کاربر هم‌صدا");
            rec.put("reason", "android_webhook_test");
            rec.put("attemptCount", 1);
            rec.put("timestampIso", isoFmt.format(new Date()));
            rec.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            JSONObject net = getNetworkSnapshot(ctx);
            rec.put("networkType", net.optString("networkType", "unknown"));
            rec.put("vpnActive", net.optBoolean("vpnActive", false));
            Location loc = acquireBestLocation(ctx);
            if (loc != null) {
                rec.put("lat", loc.getLatitude());
                rec.put("lng", loc.getLongitude());
                rec.put("accuracyMeters", Math.round(loc.getAccuracy()));
                rec.put("mapsUrl", String.format(Locale.US, "https://maps.google.com/?q=%.6f,%.6f", loc.getLatitude(), loc.getLongitude()));
            }
            return tryDirectWebhookPost(webhookUrl.trim(), rec, backupEmail != null ? backupEmail.trim() : "");
        } catch (Exception ignored) {
            return false;
        }
    }

    public static JSONObject buildStatusSummary(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject net = getNetworkSnapshot(ctx);
        JSONObject out = new JSONObject();
        try {
            out.put("enabled", prefs.getBoolean("power_guard_enabled", false));
            out.put("allowInAppBypass", isOwnerInAppBypassEnabled(ctx));
            out.put("hasPin", hasPinConfigured(ctx));
            out.put("backupEmail", prefs.getString("security_backup_email", ""));
            out.put("webhookUrl", prefs.getString("security_webhook_url", ""));
            out.put("cameraGranted", ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED);
            boolean fineLoc = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean coarseLoc = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            out.put("locationGranted", fineLoc || coarseLoc);
            out.put("accessibilityEnabled", HamsedaAccessibilityService.isConnected());
            out.put("vpnActive", net.optBoolean("vpnActive", false));
            out.put("networkConnected", net.optBoolean("connected", false));
            out.put("networkType", net.optString("networkType", "unknown"));

            File alertDir = getAlertsDir(ctx);
            File[] files = alertDir.listFiles((d, name) -> name.startsWith("alert_") && name.endsWith(".json"));
            int pendingCount = 0;
            JSONArray recentArr = new JSONArray();
            if (files != null && files.length > 0) {
                Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
                for (int i = 0; i < files.length; i++) {
                    try {
                        JSONObject rec = new JSONObject(readFileUtf8(files[i]));
                        if (!rec.optBoolean("sent", false)) pendingCount++;
                        if (recentArr.length() < 6) {
                            JSONObject slim = new JSONObject();
                            slim.put("id", rec.optString("id", ""));
                            slim.put("createdAt", rec.optLong("createdAt", 0L));
                            slim.put("timestampIso", rec.optString("timestampIso", ""));
                            slim.put("reason", rec.optString("reason", ""));
                            slim.put("attemptCount", rec.optInt("attemptCount", 1));
                            slim.put("mapsUrl", rec.optString("mapsUrl", ""));
                            slim.put("sent", rec.optBoolean("sent", false));
                            slim.put("emailSent", rec.optBoolean("emailSent", false));
                            slim.put("webhookSent", rec.optBoolean("webhookSent", false));
                            slim.put("dispatchStatus", rec.optString("dispatchStatus", ""));
                            String frontB64 = rec.optString("frontPhotoBase64", "");
                            String backB64 = rec.optString("backPhotoBase64", "");
                            slim.put("hasFrontPhoto", !frontB64.isEmpty());
                            slim.put("hasBackPhoto", !backB64.isEmpty());
                            if (recentArr.length() < 3) {
                                String fThumb = rec.optString("frontThumbBase64", "");
                                String bThumb = rec.optString("backThumbBase64", "");
                                if (fThumb.isEmpty() && !frontB64.isEmpty()) fThumb = frontB64;
                                if (bThumb.isEmpty() && !backB64.isEmpty()) bThumb = backB64;
                                if (!fThumb.isEmpty()) {
                                    slim.put("frontPreviewDataUrl", "data:image/jpeg;base64," + fThumb);
                                }
                                if (!bThumb.isEmpty()) {
                                    slim.put("backPreviewDataUrl", "data:image/jpeg;base64," + bThumb);
                                }
                            }
                            recentArr.put(slim);
                        }
                    } catch (Exception ignored) {
                    }
                }
            }
            out.put("queuedAlertsCount", pendingCount);
            out.put("recentAlertsJson", recentArr.toString());
        } catch (Exception ignored) {
        }
        return out;
    }

    public static void clearLocalAlerts(Context ctx) {
        File alertDir = getAlertsDir(ctx);
        File[] files = alertDir.listFiles();
        if (files != null) {
            for (File f : files) {
                try { f.delete(); } catch (Exception ignored) {}
            }
        }
    }

    @Nullable
    private static Location acquireBestLocation(Context ctx) {
        boolean hasFine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean hasCoarse = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!hasFine && !hasCoarse) return null;

        LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return null;

        Location best = pickBetterLocation(null, safeLastKnown(lm, LocationManager.GPS_PROVIDER));
        best = pickBetterLocation(best, safeLastKnown(lm, LocationManager.NETWORK_PROVIDER));
        best = pickBetterLocation(best, safeLastKnown(lm, LocationManager.PASSIVE_PROVIDER));

        // If best is missing or older than 20s, query BOTH Network (fast indoors on Wi-Fi) and GPS simultaneously
        if (best == null || (System.currentTimeMillis() - best.getTime()) > 20_000L) {
            final AtomicReference<Location> freshRef = new AtomicReference<>(best);
            final CountDownLatch latch = new CountDownLatch(1);
            Handler main = new Handler(Looper.getMainLooper());
            LocationListener listener = new LocationListener() {
                @Override public void onLocationChanged(@NonNull Location location) {
                    freshRef.set(pickBetterLocation(freshRef.get(), location));
                    if (location.getAccuracy() <= 120f) {
                        latch.countDown();
                    }
                }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
                @Override public void onProviderEnabled(@NonNull String provider) {}
                @Override public void onProviderDisabled(@NonNull String provider) {}
            };
            main.post(() -> {
                boolean requestedAny = false;
                try {
                    if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                        requestedAny = true;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            lm.getCurrentLocation(LocationManager.NETWORK_PROVIDER, null, ContextCompat.getMainExecutor(ctx), loc -> {
                                if (loc != null) {
                                    freshRef.set(pickBetterLocation(freshRef.get(), loc));
                                    latch.countDown();
                                }
                            });
                        } else {
                            lm.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, listener, Looper.getMainLooper());
                        }
                    }
                } catch (Exception ignored) {}
                try {
                    if (hasFine && lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                        requestedAny = true;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            lm.getCurrentLocation(LocationManager.GPS_PROVIDER, null, ContextCompat.getMainExecutor(ctx), loc -> {
                                if (loc != null) {
                                    freshRef.set(pickBetterLocation(freshRef.get(), loc));
                                    latch.countDown();
                                }
                            });
                        } else {
                            lm.requestSingleUpdate(LocationManager.GPS_PROVIDER, listener, Looper.getMainLooper());
                        }
                    }
                } catch (Exception ignored) {}
                if (!requestedAny) {
                    latch.countDown();
                }
            });
            try {
                latch.await(1900L, TimeUnit.MILLISECONDS);
            } catch (InterruptedException ignored) {
            }
            main.post(() -> {
                try { lm.removeUpdates(listener); } catch (Exception ignored) {}
            });
            best = freshRef.get();
        }
        return best;
    }

    @Nullable
    private static Location safeLastKnown(LocationManager lm, String provider) {
        try {
            return lm.getLastKnownLocation(provider);
        } catch (Exception ignored) {
            return null;
        }
    }

    @Nullable
    private static Location pickBetterLocation(@Nullable Location current, @Nullable Location candidate) {
        if (candidate == null) return current;
        if (current == null) return candidate;
        long timeDelta = candidate.getTime() - current.getTime();
        if (timeDelta > 60_000L) return candidate;
        if (timeDelta < -60_000L) return current;
        return candidate.getAccuracy() <= current.getAccuracy() ? candidate : current;
    }

    @Nullable
    private static byte[] captureSinglePhotoJpeg(Context ctx, int wantedLensFacing, long timeoutMs) {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return null;
        }
        CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
        if (cm == null) return null;

        String chosenCameraId = null;
        int sensorOrientation = 0;
        try {
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics chars = cm.getCameraCharacteristics(id);
                Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == wantedLensFacing) {
                    chosenCameraId = id;
                    Integer ori = chars.get(CameraCharacteristics.SENSOR_ORIENTATION);
                    if (ori != null) sensorOrientation = ori;
                    break;
                }
            }
        } catch (Exception ignored) {
        }
        if (chosenCameraId == null) return null;

        final int rotationDeg = sensorOrientation;
        final boolean isFront = (wantedLensFacing == CameraCharacteristics.LENS_FACING_FRONT);

        HandlerThread thread = new HandlerThread("HamsedaCam-" + wantedLensFacing);
        thread.start();
        Handler camHandler = new Handler(thread.getLooper());
        final AtomicReference<byte[]> jpegBytesRef = new AtomicReference<>(null);
        final AtomicReference<CameraDevice> devRef = new AtomicReference<>(null);
        final AtomicReference<CameraCaptureSession> sessionRef = new AtomicReference<>(null);
        final AtomicInteger frameCount = new AtomicInteger(0);
        final CountDownLatch doneLatch = new CountDownLatch(1);
        final ImageReader reader = ImageReader.newInstance(640, 480, ImageFormat.JPEG, 4);
        final long startMs = System.currentTimeMillis();

        reader.setOnImageAvailableListener(r -> {
            Image img = null;
            try {
                img = r.acquireLatestImage();
                if (img == null) return;
                ByteBuffer buf = img.getPlanes()[0].getBuffer();
                byte[] raw = new byte[buf.remaining()];
                buf.get(raw);
                byte[] processed = normalizeAndShrinkJpeg(raw, rotationDeg, isFront, 640, 72);
                jpegBytesRef.set(processed != null ? processed : raw);
                int c = frameCount.incrementAndGet();
                long elapsed = System.currentTimeMillis() - startMs;
                if (c >= 4 || (c >= 2 && elapsed >= 450L)) {
                    doneLatch.countDown();
                }
            } catch (Exception ignored) {
                doneLatch.countDown();
            } finally {
                if (img != null) img.close();
            }
        }, camHandler);

        try {
            cm.openCamera(chosenCameraId, new CameraDevice.StateCallback() {
                @Override public void onOpened(@NonNull CameraDevice camera) {
                    devRef.set(camera);
                    try {
                        camera.createCaptureSession(
                                Collections.singletonList(reader.getSurface()),
                                new CameraCaptureSession.StateCallback() {
                                    @Override public void onConfigured(@NonNull CameraCaptureSession session) {
                                        sessionRef.set(session);
                                        try {
                                            CaptureRequest.Builder req = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                                            req.addTarget(reader.getSurface());
                                            req.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO);
                                            req.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
                                            req.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                                            req.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF);
                                            // Repeating preview ensures AE/AWB settles reliably on HyperOS/MIUI HALs
                                            session.setRepeatingRequest(req.build(), null, camHandler);
                                        } catch (Exception e) {
                                            doneLatch.countDown();
                                        }
                                    }
                                    @Override public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                                        doneLatch.countDown();
                                    }
                                },
                                camHandler
                        );
                    } catch (Exception e) {
                        doneLatch.countDown();
                    }
                }
                @Override public void onDisconnected(@NonNull CameraDevice camera) {
                    try { camera.close(); } catch (Exception ignored) {}
                    doneLatch.countDown();
                }
                @Override public void onError(@NonNull CameraDevice camera, int error) {
                    try { camera.close(); } catch (Exception ignored) {}
                    doneLatch.countDown();
                }
            }, camHandler);
            doneLatch.await(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (SecurityException | CameraAccessException | InterruptedException ignored) {
        } finally {
            try {
                CameraCaptureSession s = sessionRef.get();
                if (s != null) {
                    try { s.stopRepeating(); } catch (Exception ignored) {}
                    s.close();
                }
            } catch (Exception ignored) {}
            try {
                CameraDevice d = devRef.get();
                if (d != null) d.close();
            } catch (Exception ignored) {}
            try { reader.close(); } catch (Exception ignored) {}
            thread.quitSafely();
        }
        return jpegBytesRef.get();
    }

    @Nullable
    private static byte[] normalizeAndShrinkJpeg(byte[] raw, int sensorOrientation, boolean mirrorHorizontal, int maxDim, int quality) {
        try {
            int exifRotateDeg = 0;
            boolean exifPresent = false;
            try (java.io.ByteArrayInputStream bis = new java.io.ByteArrayInputStream(raw)) {
                android.media.ExifInterface exif = new android.media.ExifInterface(bis);
                int ori = exif.getAttributeInt(
                        android.media.ExifInterface.TAG_ORIENTATION,
                        android.media.ExifInterface.ORIENTATION_UNDEFINED
                );
                if (ori == android.media.ExifInterface.ORIENTATION_ROTATE_90) {
                    exifRotateDeg = 90;
                    exifPresent = true;
                } else if (ori == android.media.ExifInterface.ORIENTATION_ROTATE_180) {
                    exifRotateDeg = 180;
                    exifPresent = true;
                } else if (ori == android.media.ExifInterface.ORIENTATION_ROTATE_270) {
                    exifRotateDeg = 270;
                    exifPresent = true;
                }
            } catch (Exception ignored) {
            }

            Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length);
            if (bmp == null) return null;

            int w = bmp.getWidth();
            int h = bmp.getHeight();
            int effectiveRotate = exifPresent ? exifRotateDeg : (w > h ? sensorOrientation : 0);
            Matrix m = new Matrix();
            if (Math.max(w, h) > maxDim) {
                float scale = (float) maxDim / Math.max(w, h);
                m.postScale(scale, scale);
            }
            if (effectiveRotate != 0) {
                m.postRotate(effectiveRotate);
            }
            if (mirrorHorizontal) {
                m.postScale(-1f, 1f);
            }

            Bitmap target = Bitmap.createBitmap(bmp, 0, 0, w, h, m, true);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            target.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            if (target != bmp) target.recycle();
            bmp.recycle();
            return baos.toByteArray();
        } catch (Exception ignored) {
            return shrinkJpegForEmail(raw, maxDim, quality);
        }
    }

    @Nullable
    private static byte[] shrinkJpegForEmail(byte[] raw, int maxDim, int quality) {
        try {
            Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length);
            if (bmp == null) return null;
            int w = bmp.getWidth();
            int h = bmp.getHeight();
            Bitmap target = bmp;
            if (Math.max(w, h) > maxDim) {
                float scale = (float) maxDim / Math.max(w, h);
                target = Bitmap.createScaledBitmap(bmp, Math.round(w * scale), Math.round(h * scale), true);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            target.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            if (target != bmp) target.recycle();
            bmp.recycle();
            return baos.toByteArray();
        } catch (Exception ignored) {
            return null;
        }
    }

    private static File getAlertsDir(Context ctx) {
        File dir = new File(ctx.getFilesDir(), "security_alerts");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private static void pruneOldAlerts(File alertDir) {
        File[] files = alertDir.listFiles();
        if (files == null || files.length <= 45) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (int i = 0; i < files.length - 45; i++) {
            try { files[i].delete(); } catch (Exception ignored) {}
        }
    }

    private static void writeBytes(File file, byte[] bytes) throws Exception {
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(bytes);
            fos.flush();
        }
    }

    private static String readFileUtf8(File file) throws Exception {
        try (FileInputStream fis = new FileInputStream(file)) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = fis.read(buf)) != -1) {
                baos.write(buf, 0, n);
            }
            return new String(baos.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
