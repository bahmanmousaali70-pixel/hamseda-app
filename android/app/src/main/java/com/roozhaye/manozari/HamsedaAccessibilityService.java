package com.roozhaye.manozari;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * User-enabled accessibility bridge for safe, explicit UI actions and
 * optional Anti-Theft Power-Off Menu interception.
 */
public class HamsedaAccessibilityService extends AccessibilityService {
    private static volatile HamsedaAccessibilityService instance;
    private static final AtomicBoolean CAMERA_SHUTTER_ARMED = new AtomicBoolean(false);
    private static volatile long lastPowerGuardTriggeredAtMs = 0L;

    @Override
    public void onServiceConnected() {
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

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        int type = event.getEventType();
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                && type != AccessibilityEvent.TYPE_WINDOWS_CHANGED) {
            return;
        }

        // 1. Optional Anti-Theft Power-Off Menu Guard
        CharSequence pkgCs = event.getPackageName();
        String pkg = pkgCs != null ? pkgCs.toString().toLowerCase(Locale.ROOT) : "";
        if (!getPackageName().equals(pkg)
                && !"com.android.settings".equals(pkg)
                && SecurityAlertHelper.isEnabledAndConfigured(this)
                && !SecurityAlertHelper.isInUnlockGraceWindow(this)) {
            if (isSystemPowerMenuVisible(pkg)) {
                long now = System.currentTimeMillis();
                if (now - lastPowerGuardTriggeredAtMs > 2800L) {
                    lastPowerGuardTriggeredAtMs = now;
                    performGlobalAction(GLOBAL_ACTION_BACK);
                    PowerGuardActivity.launch(this, "power_menu_intercept", false);
                    return;
                }
            }
        }

        // 2. Explicit Camera Shutter Trigger
        if (CAMERA_SHUTTER_ARMED.get()) {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null && clickCameraShutter(root)) {
                CAMERA_SHUTTER_ARMED.set(false);
            }
        }
    }

    private boolean isSystemPowerMenuVisible(String eventPackage) {
        boolean isSystemOverlayPkg = eventPackage.isEmpty()
                || "android".equals(eventPackage)
                || eventPackage.contains("systemui")
                || eventPackage.contains("power")
                || eventPackage.contains("miui")
                || eventPackage.contains("globalactions");
        if (!isSystemOverlayPkg) return false;

        AccessibilityNodeInfo activeRoot = getRootInActiveWindow();
        if (activeRoot != null && containsPowerMenuAction(activeRoot, 0)) {
            return true;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                List<AccessibilityWindowInfo> windows = getWindows();
                if (windows != null) {
                    for (AccessibilityWindowInfo win : windows) {
                        AccessibilityNodeInfo root = win.getRoot();
                        if (root != null) {
                            CharSequence winPkgCs = root.getPackageName();
                            String winPkg = winPkgCs != null ? winPkgCs.toString().toLowerCase(Locale.ROOT) : "";
                            if (!getPackageName().equals(winPkg) && !"com.android.settings".equals(winPkg)) {
                                if (containsPowerMenuAction(root, 0)) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    private boolean containsPowerMenuAction(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 7) return false;
        CharSequence t = node.getText();
        CharSequence d = node.getContentDescription();
        String label = ((t == null ? "" : t.toString()) + " " + (d == null ? "" : d.toString()))
                .toLowerCase(Locale.ROOT)
                .replace('ي', 'ی')
                .replace('ك', 'ک')
                .trim();

        if (!label.isEmpty() && node.isVisibleToUser()) {
            boolean isPowerOff = label.contains("power off")
                    || label.contains("poweroff")
                    || label.contains("turn off")
                    || label.contains("shut down")
                    || label.contains("shutdown")
                    || label.contains("خاموش کردن")
                    || label.equals("خاموش")
                    || label.contains("توقف کار");
            boolean isReboot = label.equals("restart")
                    || label.contains("reboot")
                    || label.contains("راه‌اندازی مجدد")
                    || label.contains("راه اندازی مجدد")
                    || label.contains("شروع مجدد");
            if (isPowerOff || isReboot) {
                return true;
            }
        }

        int childCount = Math.min(20, node.getChildCount());
        for (int i = 0; i < childCount; i++) {
            if (containsPowerMenuAction(node.getChild(i), depth + 1)) {
                return true;
            }
        }
        return false;
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

    public static boolean isConnected() { return instance != null; }
    public static void armCameraShutter() { CAMERA_SHUTTER_ARMED.set(true); }
    public static void disarmCameraShutter() { CAMERA_SHUTTER_ARMED.set(false); }

    public static boolean performGlobalBack() {
        HamsedaAccessibilityService s = instance;
        return s != null && s.performGlobalAction(GLOBAL_ACTION_BACK);
    }

    public static boolean performGlobalHome() {
        HamsedaAccessibilityService s = instance;
        return s != null && s.performGlobalAction(GLOBAL_ACTION_HOME);
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

    public static boolean setTextInFocusedField(String value) {
        HamsedaAccessibilityService s = instance;
        if (s == null || value == null) return false;
        AccessibilityNodeInfo root = s.getRootInActiveWindow();
        return setTextRecursive(root, value);
    }

    private static boolean setTextRecursive(AccessibilityNodeInfo node, String value) {
        if (node == null) return false;
        if (node.isFocused() && node.isEditable() && node.isEnabled()) {
            android.os.Bundle args = new android.os.Bundle();
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value);
            return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            if (setTextRecursive(node.getChild(i), value)) return true;
        }
        return false;
    }

    public static boolean scrollActiveWindow(boolean down) {
        HamsedaAccessibilityService s = instance;
        if (s == null) return false;
        AccessibilityNodeInfo root = s.getRootInActiveWindow();
        if (scrollRecursive(root, down)) return true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            android.util.DisplayMetrics metrics = s.getResources().getDisplayMetrics();
            float x = metrics.widthPixels * 0.5f;
            float startY = down ? metrics.heightPixels * 0.78f : metrics.heightPixels * 0.28f;
            float endY = down ? metrics.heightPixels * 0.28f : metrics.heightPixels * 0.78f;
            android.graphics.Path path = new android.graphics.Path();
            path.moveTo(x, startY);
            path.lineTo(x, endY);
            android.accessibilityservice.GestureDescription gesture =
                    new android.accessibilityservice.GestureDescription.Builder()
                            .addStroke(new android.accessibilityservice.GestureDescription.StrokeDescription(path, 0, 350))
                            .build();
            return s.dispatchGesture(gesture, null, null);
        }
        return false;
    }

    private static boolean scrollRecursive(AccessibilityNodeInfo node, boolean down) {
        if (node == null) return false;
        int action = down ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
        if (node.isScrollable() && node.performAction(action)) return true;
        for (int i = 0; i < node.getChildCount(); i++) {
            if (scrollRecursive(node.getChild(i), down)) return true;
        }
        return false;
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }
}
