package com.refigho.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "RefighoPush")
public class RefighoPushPlugin extends Plugin {
    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(token -> {
                if (token == null || token.trim().isEmpty()) {
                    call.reject("Firebase returned an empty push token");
                    return;
                }
                com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
                result.put("token", token);
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject("Unable to obtain FCM token", error));
    }
}