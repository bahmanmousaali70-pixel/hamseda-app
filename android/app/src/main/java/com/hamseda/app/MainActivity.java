package com.refigho.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.Locale;
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
        registerPlugin(NativeAuthDiagnosticsPlugin.class);
        registerPlugin(RefighoPushPlugin.class);
        super.onCreate(savedInstanceState);
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 7103);
        }
        installSafeExternalUrlInterceptor();
        PeriodicWorkRequest updateCheck = new PeriodicWorkRequest.Builder(GithubUpdateWorker.class, 12, TimeUnit.HOURS).build();
        WorkManager.getInstance(getApplicationContext()).enqueueUniquePeriodicWork(
                "hamseda-github-update-check", ExistingPeriodicWorkPolicy.KEEP, updateCheck);
        WorkManager.getInstance(getApplicationContext()).enqueue(new androidx.work.OneTimeWorkRequest.Builder(GithubUpdateWorker.class).build());
    }

    private void installSafeExternalUrlInterceptor() {
        try {
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return;
            if (getBridge() == null || getBridge().getWebView() == null) return;
            final WebView webView = getBridge().getWebView();
            final WebViewClient delegate = webView.getWebViewClient();
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    String url = request != null && request.getUrl() != null ? request.getUrl().toString() : "";
                    if (tryHandleExternalUrl(url)) {
                        return true;
                    }
                    return delegate != null && delegate.shouldOverrideUrlLoading(view, request);
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    if (tryHandleExternalUrl(url)) {
                        return true;
                    }
                    return delegate != null && delegate.shouldOverrideUrlLoading(view, url);
                }

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return delegate != null ? delegate.shouldInterceptRequest(view, request) : super.shouldInterceptRequest(view, request);
                }

                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    if (delegate != null) delegate.onPageStarted(view, url, favicon);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (delegate != null) delegate.onPageFinished(view, url);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (delegate != null) delegate.onReceivedError(view, request, error);
                }

                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    return delegate != null ? delegate.onRenderProcessGone(view, detail) : super.onRenderProcessGone(view, detail);
                }
            });
        } catch (Exception ignored) {
        }
    }

    public boolean tryHandleExternalUrl(String url) {
        if (url == null || url.trim().isEmpty()) return false;
        String lower = url.trim().toLowerCase(Locale.ROOT);
        try {
            if (lower.startsWith("intent://")) {
                Intent parsed = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                if (parsed != null) {
                    parsed.addCategory(Intent.CATEGORY_BROWSABLE);
                    parsed.setComponent(null);
                    parsed.setSelector(null);
                    parsed.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (parsed.resolveActivity(getPackageManager()) != null) {
                        startActivity(parsed);
                        return true;
                    }
                    String fallbackUrl = parsed.getStringExtra("browser_fallback_url");
                    if (fallbackUrl != null && !fallbackUrl.trim().isEmpty()) {
                        Intent fb = new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl));
                        fb.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(fb);
                        return true;
                    }
                }
                return true;
            }
            if (lower.startsWith("geo:")
                    || lower.startsWith("tel:")
                    || lower.startsWith("mailto:")
                    || lower.startsWith("smsto:")
                    || lower.startsWith("sms:")
                    || lower.contains("maps.google.com")
                    || lower.contains("google.com/maps")
                    || lower.contains("maps.app.goo.gl")
                    || lower.contains("tapnfc.ir")) {
                Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(viewIntent);
                return true;
            }
            if (lower.startsWith("http://") || lower.startsWith("https://")) {
                Uri uri = Uri.parse(url);
                String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";
                String bridgeHost = getBridge() != null && getBridge().getLocalUrl() != null
                        ? Uri.parse(getBridge().getLocalUrl()).getHost()
                        : "localhost";
                if (!host.isEmpty() && !host.equals(bridgeHost) && !"localhost".equals(host) && !"127.0.0.1".equals(host)) {
                    Intent extIntent = new Intent(Intent.ACTION_VIEW, uri);
                    extIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(extIntent);
                    return true;
                }
            }
        } catch (Exception ignored) {
            return lower.startsWith("intent://");
        }
        return false;
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
