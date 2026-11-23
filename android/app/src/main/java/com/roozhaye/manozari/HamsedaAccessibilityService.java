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
 * explicit camera shutter interaction.
 */
public class HamsedaAccessibilityService extends AccessibilityService {
    private static volatile HamsedaAccessibilityService instance;
    private static final AtomicBoolean CAMERA_SHUTTER_ARMED = new AtomicBoolean(false);

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

        // 2. Explicit Camera Shutter Trigger
        if (CAMERA_SHUTTER_ARMED.get()) {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null && clickCameraShutter(root)) {
                CAMERA_SHUTTER_ARMED.set(false);
            }
        }
    }

    private static final class PowerMenuScanResult {
        boolean hasGlobalActionsId = false;
        boolean hasPowerOffAction = false;
        boolean hasCompanionAction = false;
        boolean looksLikeQuickSettingsOrApp = false;
        int visitedNodes = 0;
    }

    private boolean isAllowedSystemPowerPackage(String pkg, String myPkg) {
        if (pkg == null || pkg.isEmpty()) return false;
        if (pkg.equals(myPkg) || pkg.equals("com.android.settings") || pkg.contains("securitycenter") || pkg.contains("launcher")) {
            return false;
        }
        return "android".equals(pkg)
                || "com.android.systemui".equals(pkg)
                || pkg.contains("globalactions")
                || pkg.contains("powermenu")
                || pkg.contains("poweroff")
                || pkg.contains("miui.power");
    }

    private boolean isSystemPowerMenuVisible(String eventPackage, String myPkg) {
        if (!isAllowedSystemPowerPackage(eventPackage, myPkg)) {
            return false;
        }

        AccessibilityNodeInfo activeRoot = getRootInActiveWindow();
        if (activeRoot != null) {
            CharSequence rootPkgCs = activeRoot.getPackageName();
            String rootPkg = rootPkgCs != null ? rootPkgCs.toString().toLowerCase(Locale.ROOT) : "";
            if (isAllowedSystemPowerPackage(rootPkg, myPkg) && matchesStrictPowerMenu(activeRoot)) {
                return true;
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                List<AccessibilityWindowInfo> windows = getWindows();
                if (windows != null) {
                    for (AccessibilityWindowInfo win : windows) {
                        if (win == null) continue;
                        int wType = win.getType();
                        if (wType != AccessibilityWindowInfo.TYPE_SYSTEM
                                && wType != AccessibilityWindowInfo.TYPE_APPLICATION) {
                            continue;
                        }
                        AccessibilityNodeInfo root = win.getRoot();
                        if (root != null) {
                            CharSequence winPkgCs = root.getPackageName();
                            String winPkg = winPkgCs != null ? winPkgCs.toString().toLowerCase(Locale.ROOT) : "";
                            if (isAllowedSystemPowerPackage(winPkg, myPkg) && matchesStrictPowerMenu(root)) {
                                return true;
                            }
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    private boolean matchesStrictPowerMenu(AccessibilityNodeInfo root) {
        PowerMenuScanResult scan = new PowerMenuScanResult();
        scanPowerMenuTree(root, 0, scan);
        if (scan.looksLikeQuickSettingsOrApp) {
            return false;
        }
        return scan.hasGlobalActionsId || (scan.hasPowerOffAction && scan.hasCompanionAction);
    }

    private void scanPowerMenuTree(AccessibilityNodeInfo node, int depth, PowerMenuScanResult scan) {
        if (node == null || depth > 7 || scan.visitedNodes > 80 || scan.looksLikeQuickSettingsOrApp) {
            return;
        }
        scan.visitedNodes++;

        String viewId = node.getViewIdResourceName() != null
                ? node.getViewIdResourceName().toLowerCase(Locale.ROOT)
                : "";
        if (!viewId.isEmpty()) {
            if (viewId.contains("notification_panel")
                    || viewId.contains("quick_settings")
                    || viewId.contains("qs_panel")
                    || viewId.contains("qs_tile")
                    || viewId.contains("control_center")
                    || viewId.contains("miui_control")
                    || viewId.contains("volume_dialog")
                    || viewId.contains("notification_stack")) {
                scan.looksLikeQuickSettingsOrApp = true;
                return;
            }
            if (viewId.contains("global_actions")
                    || viewId.contains("globalactions")
                    || viewId.contains("power_off")
                    || viewId.contains("shutdown_slider")) {
                scan.hasGlobalActionsId = true;
            }
        }

        CharSequence t = node.getText();
        CharSequence d = node.getContentDescription();
        String label = ((t == null ? "" : t.toString()) + " " + (d == null ? "" : d.toString()))
                .toLowerCase(Locale.ROOT)
                .replace('ي', 'ی')
                .replace('ك', 'ک')
                .trim();

        if (!label.isEmpty() && node.isVisibleToUser()) {
            if (label.contains("وای‌فای")
                    || label.contains("وای فای")
                    || label.contains("بلوتوث")
                    || label.contains("داده همراه")
                    || label.contains("نقطه اتصال")
                    || label.contains("چراغ قوه")
                    || label.contains("چراغ‌قوه")
                    || label.contains("قفل خاموش کردن گوشی")
                    || label.contains("تنظیمات دسترس‌پذیری")) {
                scan.looksLikeQuickSettingsOrApp = true;
                return;
            }
            if (label.contains("power off")
                    || label.contains("poweroff")
                    || label.contains("shut down")
                    || label.contains("shutdown")
                    || label.contains("tap to power off")
                    || label.contains("خاموش کردن")
                    || label.contains("برای خاموش شدن")) {
                scan.hasPowerOffAction = true;
            }
            if (label.equals("restart")
                    || label.contains("reboot")
                    || label.contains("راه‌اندازی مجدد")
                    || label.contains("راه اندازی مجدد")
                    || label.contains("شروع مجدد")
                    || label.contains("emergency")
                    || label.contains("اضطراری")
                    || label.contains("airplane")
                    || label.contains("حالت هواپیما")
                    || label.contains("lockdown")) {
                scan.hasCompanionAction = true;
            }
        }

        int childCount = Math.min(20, node.getChildCount());
        for (int i = 0; i < childCount; i++) {
            scanPowerMenuTree(node.getChild(i), depth + 1, scan);
        }
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
