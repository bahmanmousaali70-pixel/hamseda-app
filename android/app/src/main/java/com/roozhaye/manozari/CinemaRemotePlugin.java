package com.roozhaye.manozari;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "CinemaRemote")
public class CinemaRemotePlugin extends Plugin {
    private static final ExecutorService IO = Executors.newCachedThreadPool();

    @PluginMethod
    public void pair(PluginCall call) {
        String host = normalizeHost(call.getString("host", ""));
        String pin = call.getString("pin", "");
        IO.execute(() -> {
            try {
                JSONObject body = new JSONObject().put("pin", pin);
                JSObject result = request(host, "/api/pair", null, body);
                call.resolve(result);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "اتصال به پروژکتور ناموفق بود." : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void request(PluginCall call) {
        String host = normalizeHost(call.getString("host", ""));
        String path = call.getString("path", "");
        String token = call.getString("token", "");
        JSObject payload = call.getObject("body");
        IO.execute(() -> {
            try {
                JSONObject body = payload == null ? null : new JSONObject(payload.toString());
                JSObject result = request(host, path, token, body);
                call.resolve(result);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "ارتباط با پروژکتور برقرار نشد." : e.getMessage());
            }
        });
    }

    private JSObject request(String host, String path, String token, JSONObject body) throws Exception {
        if (host.isEmpty() || !(path.startsWith("/api/"))) throw new IllegalArgumentException("آدرس پروژکتور معتبر نیست.");
        HttpURLConnection connection = openWifiConnection(new URL("http://" + host + ":8765" + path));
        try {
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(15000);
            connection.setRequestProperty("Accept", "application/json");
            if (token != null && !token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.toString().getBytes("UTF-8"));
                }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            if (stream != null) {
                try (InputStream in = stream) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = in.read(buffer)) > 0) bytes.write(buffer, 0, count);
                }
            }
            String response = bytes.toString("UTF-8");
            if (status < 200 || status >= 300) {
                try { throw new IllegalStateException(new JSONObject(response).optString("error", "خطای ارتباط با پروژکتور")); }
                catch (org.json.JSONException ignored) { throw new IllegalStateException("خطای ارتباط با پروژکتور: " + status); }
            }
            if (response.trim().startsWith("[")) {
                JSObject wrapper = new JSObject();
                wrapper.put("items", new org.json.JSONArray(response));
                return wrapper;
            }
            return new JSObject(response.isEmpty() ? "{}" : response);
        } finally {
            connection.disconnect();
        }
    }

    private HttpURLConnection openWifiConnection(URL url) throws Exception {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager != null) {
            for (Network network : manager.getAllNetworks()) {
                NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
                if (capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    return (HttpURLConnection) network.openConnection(url);
                }
            }
        }
        return (HttpURLConnection) url.openConnection();
    }

    private String normalizeHost(String value) {
        String host = value == null ? "" : value.trim().replaceFirst("^https?://", "").replaceAll("/+$", "");
        if (!host.matches("([0-9]{1,3}\\.){3}[0-9]{1,3}")) throw new IllegalArgumentException("IP پروژکتور را مثل 192.168.1.50 وارد کن.");
        String[] parts = host.split("\\.");
        int a = Integer.parseInt(parts[0]), b = Integer.parseInt(parts[1]);
        boolean privateIp = a == 10 || a == 192 && b == 168 || a == 172 && b >= 16 && b <= 31;
        if (!privateIp) throw new IllegalArgumentException("برای امنیت، فقط IP داخلی شبکه Wi‑Fi مجاز است.");
        for (String part : parts) if (Integer.parseInt(part) > 255) throw new IllegalArgumentException("IP واردشده معتبر نیست.");
        return host;
    }
}
