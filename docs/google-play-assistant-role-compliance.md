# Android Assistant role and sensitive permissions

Hamseda declares an Android `ACTION_ASSIST` entry point and offers the system Assistant role request through Android's `RoleManager`. The user must make the choice in the Android system UI.

## Restricted permission gate

The app requests `RECEIVE_SMS`, `SEND_SMS`, and `READ_CALL_LOG` only after Android confirms that Hamseda currently holds `ROLE_ASSISTANT`. It does not request `READ_SMS`, because inbox-wide SMS access is not needed. `READ_CALL_LOG` is used only because Android documents that `ACTION_PHONE_STATE_CHANGED` exposes `EXTRA_INCOMING_NUMBER` only to receivers granted both `READ_CALL_LOG` and `READ_PHONE_STATE`; the app uses this to resolve an incoming caller against the user’s contacts and does not query the call-history provider or display call history. If the role is unavailable or the user declines it, these restricted permissions are not requested. If the Assistant role is removed, SMS and caller-number processing stop.

Incoming SMS broadcast processing and caller-number extraction are disabled when the Assistant role is not held. Hamseda does not read SMS or RCS message bodies from notification content; the notification-listener service previously used for that purpose has been removed. RCS announcement through notification access is therefore not supported.

## User control and transparency

- The Assistant role is requested only after the user activates the permissions setup action.
- Android displays and controls the role-selection UI.
- The app checks role status before processing sensitive message or caller data.
- The app stops this processing when the role is removed.

## Google Play review

This implementation is intended to align the app's technical behavior with Android's default-handler model. It does **not** guarantee Google Play approval. The final app must still satisfy the current SMS and Call Log policy, demonstrate that these capabilities are core functionality, provide an accurate privacy policy and Data Safety declaration, submit the required Play Console declarations, and pass Google Play review.

The Assistant role itself must be available on the target device and the app must meet Android's qualification requirements. Device testing is required before release.

## Owner-reported device smoke test (2026-11-26)

The app owner reports successful manual tests on a Xiaomi device running Android 12 after selecting Hamseda as the system's default voice assistant:

- An incoming SMS test message was read aloud.
- An incoming call was detected and the full saved contact name was announced.

The owner then revoked the Assistant role and repeated the test; the behavior after revocation was reported as expected.

The owner also revoked all app permissions and repeated the test. The owner reports that the app behaved as expected with all permissions denied. These are owner-reported manual device test results, not automated test evidence. The exact permission-by-permission denial matrix and testing on additional supported Android versions remain outstanding.


## Notification-content access removal

The notification-listener service and its setup UI/API were removed. Hamseda does not use notification access to obtain SMS or RCS message content. Incoming SMS announcements use the SMS broadcast receiver and the gated `RECEIVE_SMS` permission only. This reduces alternate access paths but does not itself guarantee Google Play approval; restricted-permission eligibility and declarations still require review.
