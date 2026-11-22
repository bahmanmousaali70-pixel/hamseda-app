package com.roozhaye.manozari;

import android.os.Bundle;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foregroundActive = false;

    public static boolean isInForeground() {
        return foregroundActive;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RoozhayeNativePlugin.class);
        super.onCreate(savedInstanceState);
        PeriodicWorkRequest updateCheck = new PeriodicWorkRequest.Builder(GithubUpdateWorker.class, 12, TimeUnit.HOURS).build();
        WorkManager.getInstance(getApplicationContext()).enqueueUniquePeriodicWork(
                "hamseda-github-update-check", ExistingPeriodicWorkPolicy.KEEP, updateCheck);
        WorkManager.getInstance(getApplicationContext()).enqueue(new androidx.work.OneTimeWorkRequest.Builder(GithubUpdateWorker.class).build());
    }

    @Override
    public void onResume() {
        super.onResume();
        foregroundActive = true;
    }

    @Override
    public void onPause() {
        foregroundActive = false;
        super.onPause();
    }
}
