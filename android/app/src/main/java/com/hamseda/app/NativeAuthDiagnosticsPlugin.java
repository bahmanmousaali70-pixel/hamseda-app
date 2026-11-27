package com.hamseda.app;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeAuthDiagnostics")
public class NativeAuthDiagnosticsPlugin extends Plugin {
    @PluginMethod
    public void probeAuthEndpoints(PluginCall call) {
        String apiKey = call.getString("apiKey", "");
        if (apiKey == null || apiKey.trim().isEmpty()) {
            call.reject("Missing Firebase API key");
            return;
        }
        getBridge().execute(() -> {
            JSObject result = new JSObject();
            result.put("identityToolkit", probe(
                "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + apiKey,
                "application/json",
                "{\"email\":\"diagnostic-invalid-email\",\"password\":\"diagnostic-only\",\"returnSecureToken\":true}"
            ));
            result.put("secureToken", probe(
                "https://securetoken.googleapis.com/v1/token?key=" + apiKey,
                "application/x-www-form-urlencoded",
                "grant_type=refresh_token&refresh_token=diagnostic-invalid-token"
            ));
            call.resolve(result);
        });
    }

    private String probe(String endpoint, String contentType, String body) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(7000);
            connection.setReadTimeout(7000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", contentType);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String message = "";
            if (stream != null) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    StringBuilder response = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null && response.length() < 4096) response.append(line);
                    try {
                        JSONObject json = new JSONObject(response.toString());
                        JSONObject error = json.optJSONObject("error");
                        if (error != null) message = error.optString("message", "");
                    } catch (Exception ignored) { }
                }
            }
            return ("HTTP_" + status + (message.isEmpty() ? "" : " " + message)).substring(0,
                Math.min(110, ("HTTP_" + status + (message.isEmpty() ? "" : " " + message)).length()));
        } catch (javax.net.ssl.SSLException e) {
            return "NATIVE_SSL_ERROR " + e.getClass().getSimpleName();
        } catch (java.net.UnknownHostException e) {
            return "NATIVE_DNS_ERROR";
        } catch (java.net.SocketTimeoutException e) {
            return "NATIVE_TIMEOUT";
        } catch (Exception e) {
            Log.w("RefighoAuthDiag", "Native Firebase probe failed", e);
            return "NATIVE_IO_ERROR " + e.getClass().getSimpleName();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
