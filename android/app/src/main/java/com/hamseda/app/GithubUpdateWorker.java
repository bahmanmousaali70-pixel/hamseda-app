package com.refigho.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class GithubUpdateWorker extends Worker {
    private static final String CHANNEL_ID = "hamseda_updates";
    private static final String RELEASES_URL = "https://api.github.com/repos/bahmanmousaali70-pixel/hamseda-app/releases?per_page=15";

    public GithubUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(RELEASES_URL).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(18000);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("User-Agent", "Refigho-Android-UpdateChecker");
            if (connection.getResponseCode() != 200) return Result.retry();

            java.io.InputStream input = connection.getInputStream();
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            input.close();

            JSONArray releases = new JSONArray(output.toString("UTF-8"));
            String latestTag = null;
            String downloadUrl = null;
            for (int i = 0; i < releases.length(); i++) {
                JSONObject release = releases.getJSONObject(i);
                String tag = release.optString("tag_name", "");
                if (!release.optBoolean("prerelease", false) || !tag.startsWith("dev-v")) continue;
                JSONArray assets = release.optJSONArray("assets");
                if (assets == null) continue;
                for (int j = 0; j < assets.length(); j++) {
                    JSONObject asset = assets.getJSONObject(j);
                    String name = asset.optString("name", "");
                    String url = asset.optString("browser_download_url", "");
                    if (name.endsWith(".apk") && url.startsWith("https://")) {
                        latestTag = tag;
                        downloadUrl = url;
                        break;
                    }
                }
                if (latestTag != null) break;
            }

            if (latestTag == null || downloadUrl == null) return Result.success();
            String latestVersion = latestTag.substring("dev-v".length());
            String installedVersion = getApplicationContext().getPackageManager()
                    .getPackageInfo(getApplicationContext().getPackageName(), 0).versionName;
            if (!isNewer(latestVersion, installedVersion)) return Result.success();

            Context context = getApplicationContext();
            android.content.SharedPreferences prefs = context.getSharedPreferences("hamseda_update_state", Context.MODE_PRIVATE);
            if (latestTag.equals(prefs.getString("notified_tag", ""))) return Result.success();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID, "به‌روزرسانی رفیقو", NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("اعلان نسخه‌های جدید رفیقو");
                NotificationManager manager = context.getSystemService(NotificationManager.class);
                if (manager != null) manager.createNotificationChannel(channel);
            }

            if (Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                            != PackageManager.PERMISSION_GRANTED) {
                return Result.success();
            }

            Intent openDownload = new Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl));
            openDownload.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pending = PendingIntent.getActivity(
                    context, 7041, openDownload,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("نسخه جدید رفیقو آماده است")
                    .setContentText("نسخه " + latestVersion + " را برای به‌روزرسانی دریافت کنید.")
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(
                            "نسخه " + latestVersion + " آماده است. برای دریافت فایل نصب، این اعلان را لمس کنید."))
                    .setContentIntent(pending)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT);

            NotificationManagerCompat.from(context).notify(7041, notification.build());
            prefs.edit().putString("notified_tag", latestTag).apply();
            return Result.success();
        } catch (Exception error) {
            return Result.retry();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean isNewer(String candidate, String installed) {
        int[] a = parseVersion(candidate);
        int[] b = parseVersion(installed == null ? "0.0.0" : installed);
        for (int i = 0; i < 3; i++) {
            if (a[i] != b[i]) return a[i] > b[i];
        }
        return false;
    }

    private int[] parseVersion(String value) {
        int[] result = new int[]{0, 0, 0};
        Matcher matcher = Pattern.compile("(\\d+)\\.(\\d+)\\.(\\d+)").matcher(value);
        if (matcher.find()) {
            for (int i = 0; i < 3; i++) result[i] = Integer.parseInt(matcher.group(i + 1));
        }
        return result;
    }
}
