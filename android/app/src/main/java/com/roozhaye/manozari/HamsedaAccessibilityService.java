package com.roozhaye.manozari;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.os.Build;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * User-enabled accessibility bridge for safe, explicit UI actions.
 * It only clicks a camera shutter after the user issued a take-photo command.
 */
public class HamsedaAccessibilityService extends AccessibilityService {
    private static volatile HamsedaAccessibilityService instance;
    private static final AtomicBoolean CAMERA_SHUTTER_ARMED = new AtomicBoolean(false);

    @Override public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        AccessibilityServiceInfo info = getServiceInfo();
        if (info != null) {
            info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                    | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                    | AccessibilityEvent.TYPE_WINDOWS_CHANGED;
            info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
            info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                    | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            info.notificationTimeout = 80;
            setServiceInfo(info);
        }
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || !CAMERA_SHUTTER_ARMED.get()) return;
        int type = event.getEventType();
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                && type != AccessibilityEvent.TYPE_WINDOWS_CHANGED) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        if (clickCameraShutter(root)) CAMERA_SHUTTER_ARMED.set(false);
    }

    private boolean clickCameraShutter(AccessibilityNodeInfo node) {
        if (node == null) return false;
        CharSequence text = node.getText();
        CharSequence desc = node.getContentDescription();
        String label = ((text == null ? "" : text.toString()) + " "
                + (desc == null ? "" : desc.toString())).toLowerCase(Locale.ROOT);
        boolean shutter = label.matches(".*(shutter|take photo|take picture|capture photo|camera shutter|عکس بگیر|گرفتن عکس|ثبت عکس|عکاسی|شاتر).*");
        if (shutter && node.isVisibleToUser() && node.isEnabled()) {
            if (node.isClickable() && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
            AccessibilityNodeInfo parent = node.getParent();
            while (parent != null) {
                if (parent.isClickable() && parent.isEnabled()
                        && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                parent = parent.getParent();
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            if (clickCameraShutter(node.getChild(i))) return true;
        }
        return false;
    }

    public static void armCameraShutter() { CAMERA_SHUTTER_ARMED.set(true); }
    public static void disarmCameraShutter() { CAMERA_SHUTTER_ARMED.set(false); }

    public static boolean performGlobalBack() {
        HamsedaAccessibilityService s = instance;
        return s != null && s.performGlobalAction(GLOBAL_ACTION_BACK);
    }

    public static boolean clickNodeByLabel(String wanted) {
        HamsedaAccessibilityService s = instance;
        if (s == null || wanted == null || wanted.trim().isEmpty()) return false;
        AccessibilityNodeInfo root = s.getRootInActiveWindow();
        return root != null && clickLabelRecursive(root, wanted.trim().toLowerCase(Locale.ROOT));
    }

    private static boolean clickLabelRecursive(AccessibilityNodeInfo node, String wanted) {
        if (node == null) return false;
        CharSequence t = node.getText();
        CharSequence d = node.getContentDescription();
        String label = ((t == null ? "" : t.toString()) + " "
                + (d == null ? "" : d.toString())).toLowerCase(Locale.ROOT);
        if (node.isVisibleToUser() && node.isEnabled() && !label.trim().isEmpty()
                && (label.contains(wanted) || wanted.contains(label.trim()))) {
            if (node.isClickable() && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
            AccessibilityNodeInfo p = node.getParent();
            while (p != null) {
                if (p.isClickable() && p.isEnabled()
                        && p.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                p = p.getParent();
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            if (clickLabelRecursive(node.getChild(i), wanted)) return true;
        }
        return false;
    }

    @Override public void onInterrupt() { }
    @Override public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }
}
