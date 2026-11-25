# Google Play pre-launch audit — Hamseda

Audit scope: source tree at PR #8 head `dc0bc6881d988d82d62191d3318cf16b7bf371f9`. This is a source review, not a Play Console review or a guarantee of approval.

## Current implementation findings

### Assistant, SMS, and caller ID

- The app declares an `ACTION_ASSIST` entry point and requests Android `ROLE_ASSISTANT` through `RoleManager`.
- `RECEIVE_SMS`, `SEND_SMS`, and `READ_CALL_LOG` are gated behind the active Assistant role in the native permission flow.
- `READ_SMS` is absent from the manifest.
- Incoming SMS uses the SMS broadcast receiver. Notification-content access for SMS/RCS was removed; RCS notification reading is not supported.
- `READ_CALL_LOG` remains a restricted permission. The implementation uses it to obtain the incoming-number extra from `PHONE_STATE` and resolve a caller name; it does not query call history. Play Console declaration and approval are still required.

### AccessibilityService — release blocker

- The manifest declares `HamsedaAccessibilityService`; its metadata allows retrieval of window content and interactive windows.
- The inspected service code checks the active window tree only while the user has explicitly armed the camera-shutter action. It does not appear to collect or upload general screen content.
- Hamseda is not presented in this codebase as a disability-support app. Do not set `isAccessibilityTool=true` unless the app's primary purpose genuinely qualifies.
- Before Play submission, provide a separate, prominent in-app disclosure describing exactly what window/UI data the service can inspect, why the camera-shutter action needs it, and that the service is only active for that user-initiated action. Obtain affirmative consent before sending the user to Android Accessibility Settings.
- Complete the Play Console Accessibility API declaration and provide a demonstration video. Consider replacing this service with a narrower camera API if feasible.

### Privacy policy, account deletion, and Data safety — release blockers

- No privacy-policy page or in-app privacy-policy link was found in the tracked repository at this audit head. A policy may exist elsewhere, but its public URL and in-app entry point must be verified.
- The app uses Google sign-in and Firebase Authentication/Firestore in its web experience. Firestore sync stores profile/account identifiers and user-created shared-space content (for example goals, habits, schedules, contacts/caller settings, expenses, medication reminders, meals, and vault notes).
- No account-deletion flow or complete associated-data deletion path was found in the inspected repository. Because accounts can be created, implement an in-app account deletion request and a working web resource for deletion; remove associated Firebase Auth and Firestore data, including shared-space membership/content as legally and product-appropriately defined.
- Complete Data safety from the actual shipped binary and every included SDK/service. Disclose Firebase Authentication/Firestore, Google sign-in, any Gemini/API processing, speech recognition providers, server-side requests, and any optional email/security-alert service only where actually enabled. Do not claim that all processing is on-device: cloud sync and remote AI/service calls exist in the codebase.

### Firebase and Android application registration

- The current web client imports `firebase-applet-config.json` and uses the Firebase JavaScript SDK.
- No `google-services.json` was found in the Android app directory. The inspected Android module does not apply the Google Services Gradle plugin. Therefore the absence of that file is not, by itself, proof of a broken Firebase configuration for the current web-SDK integration.
- Verify Firebase project ownership, authorized domains, Authentication providers, Firestore rules, and production environment settings before release. If a native Firebase Android SDK is introduced, register package `com.hamseda.app` and add the matching Android configuration securely.

### Release packaging and signing — release blocker

- The current GitHub Actions workflow runs `assembleDebug` and uploads a Debug APK only.
- `android/app/build.gradle` defines a debug signing configuration but no release signing configuration.
- There is no Play-ready signed AAB workflow in the inspected branch. A production release requires a protected upload keystore (prefer Play App Signing), GitHub Actions secrets for signing material, a `bundleRelease` build, and verification of the resulting AAB. Never reuse or publish the debug keystore as the Play upload key.
- The version code is currently derived from `GITHUB_RUN_NUMBER`; confirm that the Play release workflow guarantees a strictly increasing version code.

## Required work before Play submission

1. Implement the AccessibilityService disclosure and affirmative consent, then prepare the Play declaration/video.
2. Publish a complete privacy policy and link it inside the app and in Play Console. The policy must identify the developer and a privacy contact, explain data categories, purposes, recipients/processors, security, retention, and deletion.
3. Implement and test account deletion, including associated Firebase data deletion.
4. Complete accurate Data safety and the SMS/Call Log Permissions Declaration; describe Assistant-dependent SMS/caller announcement as core functionality and submit for review.
5. Audit each manifest permission against a currently shipped user-facing feature; remove permissions that are not essential.
6. Configure protected release signing and build/test a signed AAB. Keep debug and release credentials separate.
7. Verify Firebase production settings and the final Play listing, privacy policy URL, target API, and declarations.

## Policy references

- SMS and Call Log permissions: https://support.google.com/googleplay/android-developer/answer/10208820
- Sensitive permissions and Accessibility API: https://support.google.com/googleplay/android-developer/answer/16558241
- AccessibilityService API use: https://support.google.com/googleplay/android-developer/answer/10964491
- User Data, Privacy Policy, and Data safety: https://support.google.com/googleplay/android-developer/answer/10144311
- Android default-handler guidance: https://developer.android.com/guide/topics/permissions/default-handlers

## Important limitations

This audit is based on the inspected source tree and current policy pages. It does not establish that Google Play will approve the app, that every runtime permission is correctly justified, or that all backend/third-party processing has been exhaustively mapped. Re-audit the final release artifact and Play Console declarations before submission.
