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

## Latest work session focus: offline voice quality, noise, and speech engines (2026-11-19)

The last active development/testing topic with the owner was improving offline speech output and reducing audible noise. Continue from this area first; do not restart the project or discard existing voice work.

### What has been requested and explored
- The owner asked for four offline TTS engines to be integrated and compared in-app: AvaCore/Gyro, Mana, Pocket TTS Farsi v2, and Nava FA.
- Keep the existing online voices (including Negin and Nasim) intact. Negin should remain the default voice throughout the app.
- Improve offline audio noise, robotic tone, Persian pronunciation, number reading, speed/latency, and complete text rendering.
- Preserve the user's own voice-clone data across app changes and audio format changes (including 4-bit/16-bit selections); do not accidentally erase the clone.
- Earlier code work specifically addressed Pocket TTS clone persistence and removed an incorrect request for `custom.f32.bin` (commit previously recorded as `cd2d930eae9277eeb2f5cac75f7782150e2493ac`). Re-check whether this commit is present in the current branch before relying on it.

### Exact test evidence and unresolved status
- A later offline WASM fp16 synthesis run was reported with generation time about 17,970 ms, audio duration 8.4 seconds, and speed ratio 2.14x; the user described it as a clone of their own voice. This shows that one offline synthesis path produced audio in that test, but it does not prove all four engines work or that the whole assistant works offline.
- The owner also reported that the offline always-listening assistant did not connect, and model preparation failed with a message asking to check the internet.
- Earlier phone/PWA testing reported audible noise in all three Pocket TTS v2 voices; the clone voice had not yet been tested at that earlier point.
- Therefore, do NOT state that noise has been fully fixed, that offline mode is fully fixed, or that all four engines are complete unless you reproduce and verify those results on the current code and a real device. The latest evidence is mixed: offline synthesis ran in one test, while offline assistant/model initialization still failed.
- No audio sample or physical-device test result in the current handoff proves a final noise-free result. Request/inspect a current WAV sample and device logs if needed.

### Immediate continuation plan (do these in order)
1. Inspect the current branch history and source to establish which of the four offline engines are actually integrated, which are selectable, and which model assets are bundled versus downloaded.
2. Trace the offline model initialization path and fix the false/overly generic “check your internet” failure when a model is missing, corrupt, or cannot initialize. Make offline startup work without a network after required assets are present.
3. Reproduce the reported WASM fp16 voice-clone synthesis and verify that the clone persists after changing formats/settings and restarting the app.
4. Run the same Persian test text through each available offline engine. Compare noise floor, clipping, hiss/artifacts, pronunciation, number reading, naturalness, latency, and duration. Use recorded WAV outputs, not assumptions.
5. Implement or tune noise reduction/post-processing only after identifying the actual source of noise (model quantization, injected noise, audio pipeline, resampling, or output gain). Avoid adding artificial noise. Keep the original output available for A/B comparison.
6. Preserve all online voices and Negin as the global default; offline engine selection must not silently replace or damage online voice configuration.
7. Verify offline wake/listening separately from offline TTS generation. A successful TTS demo is not proof that wake-word detection, speech recognition, conversation, or phone actions work offline.
8. After fixes, run a clean Android build and test on the owner's phone. Record exact engine, model version/precision, settings, WAV sample, device/Android version, and pass/fail results.

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