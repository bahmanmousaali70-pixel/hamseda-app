# Google Play pre-launch audit — Hamseda

Audit scope: source tree at PR #8 head `dc0bc6881d988d82d62191d3318cf16b7bf371f9`. This is a source review, not a Play Console review or a guarantee of approval.

## Current implementation findings

### Assistant, SMS, and caller ID

- The app declares an `ACTION_ASSIST` entry point and requests Android `ROLE_ASSISTANT` through `RoleManager`.
- `RECEIVE_SMS`, `SEND_SMS`, and `READ_CALL_LOG` are gated behind the active Assistant role in the native permission flow.
- `READ_SMS` is absent from the manifest.
- Incoming SMS uses the SMS broadcast receiver. Notification-content access for SMS/RCS was removed; RCS notification reading is not supported.
- `READ_CALL_LOG` remains a restricted permission. The implementation uses it to obtain the incoming-number extra from `PHONE_STATE` and resolve a caller name; it does not query call history. Play Console declaration and approval are still required.
- Incoming SMS and caller announcements now force the on-device speech path and bypass Hamseda's remote `/api/tts` endpoint. If the local neural engine fails, Android's installed system TTS fallback may apply its own provider processing.

### AccessibilityService — removed from this release branch

- The Android manifest declaration, service implementation, XML service metadata, native bridge methods, and voice actions for cross-app screen clicking, typing, and scrolling have been removed from this branch.
- Camera capture still opens the Android system camera, but the user must press the shutter in that camera app; Hamseda no longer uses AccessibilityService to press it automatically.
- The current branch therefore does not require the Accessibility API declaration or AccessibilityService disclosure for this removed functionality. Do not reintroduce the service without a new policy review.

### Privacy policy, account deletion, and Data safety — release blockers

- Draft public pages now exist at `public/privacy-policy.html` and `public/delete-account.html`, with in-app links in Sync Settings. Both still contain the `[[SUPPORT_EMAIL]]` placeholder; replace it with a monitored privacy/support email before treating either page as final or submitting to Play.
- The app uses Google sign-in and Firebase Authentication/Firestore in its web experience. Firestore sync stores profile/account identifiers and user-created shared-space content (for example goals, habits, schedules, contacts/caller settings, expenses, medication reminders, meals, and vault notes).
- An in-app delete-account flow now reauthenticates Google, removes the Firebase Auth account, deletes the user's Firestore profile and account-linked records, clears the user's localStorage, cached audio library, and locally stored custom-voice embedding, and removes shared-space membership. If the user owns a space, the entire space and shared content are deleted; if the user is a partner, only their authored records and membership are removed. The public deletion page explains the flow. The updated Firestore rules are tracked in this repository but must still be deployed to the configured named database using the manual workflow and a `FIREBASE_TOKEN` secret. Do not claim deletion is live until rules deployment and end-to-end testing with a disposable test account succeed.
- Complete Data safety from the actual shipped binary and every included SDK/service. Disclose Firebase Authentication/Firestore, Google sign-in, any Gemini/API processing, speech recognition providers, server-side requests, and any optional email/security-alert service only where actually enabled. Do not claim that all processing is on-device: cloud sync and remote AI/service calls exist in the codebase.

### Firebase and Android application registration

- The current web client imports `firebase-applet-config.json` and uses the Firebase JavaScript SDK.
- No `google-services.json` was found in the Android app directory. The inspected Android module does not apply the Google Services Gradle plugin. Therefore the absence of that file is not, by itself, proof of a broken Firebase configuration for the current web-SDK integration.
- Verify Firebase project ownership, authorized domains, Authentication providers, Firestore rules, and production environment settings before release. If a native Firebase Android SDK is introduced, register package `com.hamseda.app` and add the matching Android configuration securely.

### Release packaging and signing — release blocker

- The existing workflow continues to build Debug APKs.
- `android/app/build.gradle` now supports a separate environment-based Release signing configuration.
- A manual `.github/workflows/release-aab.yml` workflow now builds and verifies a signed AAB from `main`, but it requires four repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. A long-lived upload keystore must be generated and securely registered; never reuse or publish the debug keystore as the Play upload key. The workflow does not publish to Play.
- The version code is currently derived from `GITHUB_RUN_NUMBER`; confirm that the Play release workflow guarantees a strictly increasing version code.

## Required work before Play submission

1. Replace `[[SUPPORT_EMAIL]]` on both public pages with a monitored contact address; verify the pages load on the deployed public domain.
2. Deploy the updated Firestore rules to the configured named database using the manual workflow and `FIREBASE_TOKEN`; then test owner deletion, partner deletion, invited-but-not-joined deletion, and reauthentication failure with disposable accounts.
3. Generate and securely back up a long-lived upload keystore; add the four release-signing secrets to GitHub Actions; run the signed AAB workflow from `main`.
4. Complete accurate Data safety and the SMS/Call Log Permissions Declaration; describe Assistant-dependent SMS/caller announcement as core functionality and submit for review.
5. Audit each remaining manifest permission against a currently shipped user-facing feature; remove permissions that are not essential.
6. Verify Firebase production settings and the final Play listing, privacy policy URL, target API, and declarations.
7. Re-audit the final release artifact and ensure the privacy policy and deletion page match the actual shipped behavior.

## Policy references

- SMS and Call Log permissions: https://support.google.com/googleplay/android-developer/answer/10208820
- Sensitive permissions and Accessibility API: https://support.google.com/googleplay/android-developer/answer/16558241
- AccessibilityService API use: https://support.google.com/googleplay/android-developer/answer/10964491
- User Data, Privacy Policy, and Data safety: https://support.google.com/googleplay/android-developer/answer/10144311
- Android default-handler guidance: https://developer.android.com/guide/topics/permissions/default-handlers

## Important limitations

This audit is based on the inspected source tree and current policy pages. It does not establish that Google Play will approve the app, that every runtime permission is correctly justified, or that all backend/third-party processing has been exhaustively mapped. Re-audit the final release artifact and Play Console declarations before submission.
