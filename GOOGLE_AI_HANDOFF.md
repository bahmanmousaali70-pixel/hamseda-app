# Hamseda — AI Development Handoff

This document is the handoff brief for continuing development with an AI coding assistant.

## Repository
- Public repository: https://github.com/bahmanmousaali70-pixel/hamseda-app
- Development branch: `release/assistant-final-upgrade`
- Default branch: `main`
- Work on the development branch only. Do not modify `main` or overwrite the existing `latest-apk` release unless the owner explicitly requests it.

## Current known build
- Latest inspected development commit: `e1f332e6fa42549430fd476a3945eb2f5971bd01`
- GitHub Actions run: https://github.com/bahmanmousaali70-pixel/hamseda-app/actions/runs/44597128083
- The run completed successfully and produced an Actions artifact named `hamseda-apk`.
- The Actions artifact is a ZIP archive containing an APK; it is not itself an installable APK.
- A successful CI build does not prove that the APK installs or upgrades an existing installation. Installation on a physical Android device has not been verified.
- Do not claim that package ID, signing certificate, or upgrade compatibility has been verified unless you inspect and compare the actual APK and the previously released APK.

## Recent verified code change
The latest commit adds a `stopTrigger` prop to `src/components/PodcastLibraryView.tsx` and pauses the current audio element when that trigger changes. This is a limited podcast playback change, not completion of the full radio/podcast roadmap.

## Owner's product goals
1. A natural Persian voice assistant with Negin as the default voice throughout the app.
2. Reliable Persian speech recognition, conversational understanding, and clear clarification when an instruction is ambiguous.
3. Background/always-listening behavior within Android's foreground-service, microphone permission, and lock-screen security rules. Never bypass Android secure lock-screen authentication.
4. Offline command handling and genuinely usable offline speech/TTS models, while preserving existing online voices/models.
5. Safe phone actions: opening apps, navigation, accessibility-based UI interaction, camera/photo/video controls, notifications, contacts, calls and SMS. Confirm the recipient and message before sending; support cancellation before dispatch.
6. Accurate device-local time and Persian (Solar Hijri) date.
7. Real web search with clear handling of network/API errors.
8. Dynamic discovery and playback of Persian-language radio stations worldwide, including Radio Javan and Radio Khorshid; do not hardcode only a tiny fixed station list.
9. Dynamic podcast search, episode playback, background controls, pause/resume, and remembered playback position.
10. Carefully tested updates that install over the previous app without uninstalling it or losing user data. Keep application ID and signing key stable.

## Known gaps — do not represent these as completed
- No independent radio implementation was found in the inspected source tree at the latest inspected commit.
- Podcast UI/search/playback exists, but endpoint behavior, broad catalog coverage, background playback, and resume behavior still require verification.
- Always-on without a wake word is not verified as implemented.
- Device installation and in-place upgrade are not verified.
- Other features above must be inspected and tested before being marked complete.

## Required engineering workflow
1. Inspect the full repository and current branch before editing.
2. Work only on `release/assistant-final-upgrade`.
3. Preserve existing online voices/models and existing user data.
4. Make small, reviewable commits; do not replace large parts of the app without understanding current architecture.
5. Build the Android APK with the repository's existing workflow.
6. Verify the APK package/application ID, min SDK, signing certificate, and version code. Compare signing certificate with the existing published APK before claiming update compatibility.
7. Test install and upgrade on a real Android device where possible. Never tell the owner to uninstall the current app as a first troubleshooting step.
8. Report exactly what changed, what built, and what was actually tested. Clearly label anything not verified.

## Guidance for the AI assistant
Treat the repository source as the source of truth. Read this handoff and the actual implementation before proposing or making changes. Do not assume a feature is implemented just because it appears in the goals list.