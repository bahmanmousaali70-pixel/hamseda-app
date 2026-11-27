package com.refigho.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class RefighoFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "refigho_couple_updates";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        // MainActivity re-reads the current token and securely associates it with the signed-in Firebase UID.
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        Map<String, String> data = message.getData();
        String title = data.get("title");
        String body = data.get("body");
        if (title == null || title.trim().isEmpty()) title = "رفیقو";
        if (body == null || body.trim().isEmpty()) body = "یک تغییر تازه در فضای مشترک شما ثبت شد.";
        showNotification(title, body);
    }

    private void showNotification(String title, String body) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "اعلان‌های فضای مشترک رفیقو", NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("اعلان تغییرات فضای مشترک");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 120, 250});
            manager.createNotificationChannel(channel);
        }

        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = launch == null ? null : PendingIntent.getActivity(
            this, 7102, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        boolean inCall = audio != null && (
            audio.getMode() == AudioManager.MODE_IN_CALL ||
            audio.getMode() == AudioManager.MODE_IN_COMMUNICATION
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setAutoCancel(true)
            .setVibrate(new long[]{0, 250, 120, 250})
            .setOnlyAlertOnce(true);
        if (pendingIntent != null) builder.setContentIntent(pendingIntent);
        if (inCall) builder.setSilent(true);
        NotificationManagerCompat.from(this).notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }
}