# Android Assistant role and sensitive permissions

Hamseda declares an Android `ACTION_ASSIST` entry point and offers the system Assistant role request through Android's `RoleManager`. The user must make the choice in the Android system UI.

## Restricted permission gate

The app requests `READ_SMS`, `RECEIVE_SMS`, `SEND_SMS`, and `READ_CALL_LOG` only after Android confirms that Hamseda currently holds `ROLE_ASSISTANT`. If the role is not available or the user declines it, these permissions are not requested.

Message broadcasts, message notification content, and caller-number extraction are stopped or reduced to a generic announcement when the Assistant role is not held.

## User control and transparency

- The Assistant role is requested only after the user activates the permissions setup action.
- Android displays and controls the role-selection UI.
- The app checks role status before processing sensitive message or caller data.
- The app stops this processing when the role is removed.

## Google Play review

This implementation is intended to align the app's technical behavior with Android's default-handler model. It does **not** guarantee Google Play approval. The final app must still satisfy the current SMS and Call Log policy, demonstrate that these capabilities are core functionality, provide an accurate privacy policy and Data Safety declaration, submit the required Play Console declarations, and pass Google Play review.

The Assistant role itself must be available on the target device and the app must meet Android's qualification requirements. Device testing is required before release.
