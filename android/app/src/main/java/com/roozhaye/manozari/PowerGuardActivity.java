package com.roozhaye.manozari;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
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
 * Appears when the Power/Restart menu is intercepted by HamsedaAccessibilityService
 * (or during a user test). Requires the separate Power-Off PIN before allowing the
 * power menu for a 20-second grace window. Wrong attempts or dismiss attempts trigger
 * stealth selfie + rear snapshot + GPS location capture & alert queue.
 */
public class PowerGuardActivity extends AppCompatActivity {
    public static final String EXTRA_REASON = "guard_reason";
    public static final String EXTRA_IS_TEST = "is_test";

    private int failedAttempts = 0;
    private boolean unlocked = false;
    private boolean evidenceCapturedOnExit = false;
    private boolean isTestMode = false;
    private EditText pinInput;
    private TextView errorView;

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
                ? "حالت آزمایش قفل خاموش‌شدن گوشی فعال است. وارد کردن رمز اشتباه ثبت هشدار آزمایشی را فعال می‌کند."
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

        Button verifyBtn = new Button(this);
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

        Button cancelBtn = new Button(this);
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
        String candidate = pinInput.getText() != null ? pinInput.getText().toString() : "";
        if (SecurityAlertHelper.verifyPin(this, candidate)) {
            unlocked = true;
            SecurityAlertHelper.grantUnlockGraceWindow(this, 20_000L);
            finish();
            return;
        }
        failedAttempts += 1;
        pinInput.setText("");
        errorView.setText("رمز اشتباه است. لطفاً رمز امنیتی خاموش‌شدن را درست وارد کنید.");
        errorView.setVisibility(View.VISIBLE);
        evidenceCapturedOnExit = true;
        SecurityAlertHelper.captureEvidenceAndQueueAlertAsync(
                this,
                isTestMode ? "power_guard_test_wrong_pin" : "power_off_wrong_pin",
                failedAttempts
        );
    }

    private void handleUnauthorizedDismiss() {
        if (!unlocked && !evidenceCapturedOnExit && !isTestMode) {
            evidenceCapturedOnExit = true;
            SecurityAlertHelper.captureEvidenceAndQueueAlertAsync(
                    this,
                    "power_off_dismissed_without_pin",
                    Math.max(1, failedAttempts)
            );
        }
        finish();
    }

    @Override
    public void onBackPressed() {
        handleUnauthorizedDismiss();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
