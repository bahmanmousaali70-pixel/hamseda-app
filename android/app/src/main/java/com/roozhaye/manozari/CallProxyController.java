package com.roozhaye.manozari;

import android.content.Context;

/**
 * Compatibility shim only.
 * Proxy calls, call overlays and automatic speech on behalf of the user are disabled.
 * These no-op members remain solely for legacy Android receivers/services that still
 * reference the old API. They perform no call, speech, network or UI action.
 */
final class CallProxyController {
    static final String ACTION_SPEAK_NOW = "com.roozhaye.manOZari.action.PROXY_SPEAK_NOW_DISABLED";
    static final String ACTION_DISMISS = "com.roozhaye.manOZari.action.PROXY_DISMISS_DISABLED";

    private CallProxyController() {}

    static boolean isOutgoingProxyCallActive() {
        return false;
    }

    static void onOutgoingOffhook(Context context) {
        // Intentionally disabled.
    }

    static void onCallEnded(Context context) {
        // Intentionally disabled.
    }

    static void speakNow(Context context) {
        // Intentionally disabled.
    }
}
