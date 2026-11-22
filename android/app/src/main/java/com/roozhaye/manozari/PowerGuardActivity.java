package com.roozhaye.manozari;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Lockscreen-capable Power-Off Guard screen.
 * Keeps foreground Activity exemption alive while capturing front+back Camera2 snapshots
 * and location so Android 11-16 never blocks camera access.
 */
public class PowerGuardActivity extends AppCompatActivity {
    public static final String EXTRA_REASON = "guard_reason";
    public static final String EXTRA_IS_TEST = "is_test";

    private static volatile boolean showing = false;

    private int failedAttempts = 0;
    private boolean unlocked = false;
    private boolean evidenceCapturedOnExit = false;
    private boolean dismissingWithCapture = false;
    private boolean isTestMode = false;
    private EditText pinInput;
    private TextView errorView;
    private Button verifyBtn;
    private Button cancelBtn;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public static boolean isShowing() {
        return showing;
    }

    public static void launch(Context ctx, String reason, boolean isTest) {
        Intent i = new Intent(ctx, PowerGuardActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra(EXTRA_REASON, reason);
        i.putExtra(EXTRA_IS_TEST, isTest);
        ctx.startActivity(i);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        isTestMode = getIntent() != null && getIntent().getBooleanExtra(EXTRA_IS_TEST, false);
        buildUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        showing = true;
    }

    @Override
    protected void onPause() {
        showing = false;
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        showing = false;
        mainHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private void buildUi() {
        int pad = dp(24);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#070D0C"));
        root.setPadding(pad, pad, pad, pad);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(22), dp(24), dp(22), dp(24));
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#111C1A"));
        cardBg.setCornerRadius(dp(22));
        cardBg.setStroke(dp(1), Color.parseColor("#1E3A34"));
        card.setBackground(cardBg);

        TextView title = new TextView(this);
        title.setText("حفاظت ضدسرقت هم‌صدا");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        card.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(isTestMode
                ? "حالت آزمایش قفل خاموش‌شدن گوشی: برای ثبت واقعی عکس سلفی، دوربین پشت و لوکیشن یک رمز اشتباه بزنید (یا انصراف بزنید تا نتیجه در تنظیمات نمایش داده شود)."
                : "برای خاموش یا راه‌اندازی مجدد گوشی، رمز امنیتی خاموش‌شدن را وارد کنید.");
        subtitle.setTextColor(Color.parseColor("#B5C9C3"));
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        subLp.topMargin = dp(8);
        subLp.bottomMargin = dp(18);
        card.addView(subtitle, subLp);

        pinInput = new EditText(this);
        pinInput.setHint("رمز خاموش‌شدن گوشی...");
        pinInput.setHintTextColor(Color.parseColor("#6E8780"));
        pinInput.setTextColor(Color.WHITE);
        pinInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        pinInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        pinInput.setGravity(Gravity.CENTER);
        pinInput.setPadding(dp(16), dp(14), dp(16), dp(14));
        GradientDrawable inputBg = new GradientDrawable();
        inputBg.setColor(Color.parseColor("#0A1210"));
        inputBg.setCornerRadius(dp(14));
        inputBg.setStroke(dp(1), Color.parseColor("#2A4D45"));
        pinInput.setBackground(inputBg);
        card.addView(pinInput);

        errorView = new TextView(this);
        errorView.setTextColor(Color.parseColor("#F87171"));
        errorView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        errorView.setGravity(Gravity.CENTER);
        errorView.setVisibility(View.GONE);
        LinearLayout.LayoutParams errLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        errLp.topMargin = dp(10);
        card.addView(errorView, errLp);

        verifyBtn = new Button(this);
        verifyBtn.setText("تأیید رمز و اجازه خاموش کردن");
        verifyBtn.setAllCaps(false);
        verifyBtn.setTextColor(Color.WHITE);
        verifyBtn.setTypeface(Typeface.DEFAULT_BOLD);
        verifyBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#047857"));
        btnBg.setCornerRadius(dp(14));
        verifyBtn.setBackground(btnBg);
        verifyBtn.setPadding(dp(16), dp(14), dp(16), dp(14));
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        btnLp.topMargin = dp(16);
        verifyBtn.setOnClickListener(v -> handleVerifyAttempt());
        card.addView(verifyBtn, btnLp);

        cancelBtn = new Button(this);
        cancelBtn.setText("انصراف و بازگشت");
        cancelBtn.setAllCaps(false);
        cancelBtn.setTextColor(Color.parseColor("#CBD5E1"));
        cancelBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        GradientDrawable cancelBg = new GradientDrawable();
        cancelBg.setColor(Color.parseColor("#182825"));
        cancelBg.setCornerRadius(dp(14));
        cancelBtn.setBackground(cancelBg);
        cancelBtn.setPadding(dp(16), dp(12), dp(16), dp(12));
        LinearLayout.LayoutParams cancelLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        cancelLp.topMargin = dp(10);
        cancelBtn.setOnClickListener(v -> handleUnauthorizedDismiss());
        card.addView(cancelBtn, cancelLp);

        root.addView(card, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        setContentView(root);
    }

    private void handleVerifyAttempt() {
        if (dismissingWithCapture) return;
        String candidate = pinInput.getText() != null ? pinInput.getText().toString() : "";
        if (SecurityAlertHelper.verifyPin(this, candidate)) {
            unlocked = true;
            SecurityAlertHelper.grantUnlockGraceWindow(this, 20_000L);
            finish();
            return;
        }
        failedAttempts += 1;
        pinInput.setText("");
        errorView.setText(isTestMode
                ? "رمز اشتباه بود — در حال ثبت سلفی، دوربین پشت و موقعیت مکانی..."
                : "رمز اشتباه است. لطفاً رمز امنیتی خاموش‌شدن را درست وارد کنید.");
        errorView.setTextColor(Color.parseColor(isTestMode ? "#FBBF24" : "#F87171"));
        errorView.setVisibility(View.VISIBLE);
        evidenceCapturedOnExit = true;

        SecurityAlertHelper.captureEvidenceAndQueueAlertAsync(
                this,
                isTestMode ? "power_guard_test_wrong_pin" : "power_off_wrong_pin",
                failedAttempts,
                record -> {
                    if (!isTestMode || isFinishing() || isDestroyed()) return;
                    if (record == null) {
                        errorView.setText("درخواست ثبت شد (یا قبلاً در حال ثبت بود). صفحه تنظیمات را ببینید.");
                        errorView.setTextColor(Color.parseColor("#34D399"));
                        return;
                    }
                    boolean hasF = !record.optString("frontPhotoBase64", "").isEmpty();
                    boolean hasB = !record.optString("backPhotoBase64", "").isEmpty();
                    boolean hasLoc = !record.optString("mapsUrl", "").isEmpty();
                    errorView.setText("ثبت شد — سلفی: " + (hasF ? "✓" : "✗")
                            + " | پشت: " + (hasB ? "✓" : "✗")
                            + " | لوکیشن: " + (hasLoc ? "✓" : "✗")
                            + "\nالان «انصراف و بازگشت» را بزنید تا عکس‌ها را در تنظیمات ببینید.");
                    errorView.setTextColor(Color.parseColor("#34D399"));
                }
        );
    }

    private void handleUnauthorizedDismiss() {
        if (unlocked || evidenceCapturedOnExit) {
            finish();
            return;
        }
        if (dismissingWithCapture) return;
        dismissingWithCapture = true;
        if (verifyBtn != null) verifyBtn.setEnabled(false);
        if (cancelBtn != null) cancelBtn.setEnabled(false);
        evidenceCapturedOnExit = true;

        // Keep PowerGuardActivity in foreground until Camera2 snapshots finish (max 4.2s safety cap)
        final Runnable safetyFinish = () -> {
            if (!isFinishing() && !isDestroyed()) finish();
        };
        mainHandler.postDelayed(safetyFinish, 4200L);

        SecurityAlertHelper.captureEvidenceAndQueueAlertAsync(
                this,
                isTestMode ? "power_guard_test_dismiss" : "power_off_dismissed_without_pin",
                Math.max(1, failedAttempts),
                record -> {
                    mainHandler.removeCallbacks(safetyFinish);
                    if (!isFinishing() && !isDestroyed()) {
                        finish();
                    }
                }
        );
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (!unlocked && !evidenceCapturedOnExit && !isTestMode) {
            evidenceCapturedOnExit = true;
            SecurityAlertHelper.captureEvidenceAndQueueAlertAsync(
                    this,
                    "power_off_left_without_pin",
                    Math.max(1, failedAttempts)
            );
        }
    }

    @Override
    public void onBackPressed() {
        handleUnauthorizedDismiss();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
