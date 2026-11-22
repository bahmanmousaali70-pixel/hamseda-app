# Hamseda AI Outbound Calling — Implementation Plan

## Goal

Add two real outbound calling routes that share one AI conversation layer and the user's existing Hamseda voice preference:

1. **Internet / VoIP route** — an outbound call placed through a supported SIP/WebRTC telephony provider. The provider must expose bidirectional call audio to a secure server-side media bridge. The server runs the AI conversation and streams generated speech/audio back into the call.
2. **Mobile SIM route** — an outbound call placed through a GSM/LTE modem or cellular gateway holding the user's SIM. The gateway exposes a bidirectional audio interface to the same secure server-side media bridge. This is not achievable by an ordinary Android app merely calling ACTION_CALL: Android does not grant ordinary apps access to cellular call uplink/downlink audio.

Both routes must use the same conversation policy, disclosure, voice selection, and call approval flow.

## Existing repository findings

- The app already stores `AppSettings.assistantName` and `AppSettings.defaultVoice`.
- The existing voice options are Kore, Zephyr, Puck, Charon, and Fenrir.
- The app's current `make_call` native action only launches the Android cellular dialer/call intent. It does not bridge call audio.
- `CallAnnouncerService` synthesizes announcements; it is not a two-way call audio engine.
- The server already has Gemini client setup and TTS infrastructure, but no outbound telephony provider/media bridge is configured.

## Shared call contract

A call request must contain:
- destination number in E.164 format;
- selected route (`internet` or `sim_gateway`);
- the user's approved purpose and conversation brief;
- assistant display name and selected existing voice;
- explicit user confirmation before dialing.

At call start, the assistant must clearly disclose that it is Hamseda, an AI assistant, and state the configured assistant name. It must not impersonate the user. Recording is off by default; if recording is ever enabled, obtain legally valid consent first. Require user confirmation before purchases, payments, contracts, or other binding commitments. Provide a safe transfer-to-user / end-call path.

## Internet route

Target architecture:
- Android/Web UI -> authenticated Hamseda backend -> telephony provider outbound call API.
- Provider media stream (bidirectional WebSocket or equivalent) -> server-side call session.
- Call session -> realtime speech/AI engine using the existing voice preference, with turn-taking, interruption handling, timeouts, and call-state tracking.
- Server-side secrets only. Never ship provider API secrets in the APK or browser bundle.

Required deployment configuration before live calls:
- provider account and verified outbound caller ID / phone number;
- provider API credentials;
- public HTTPS/WSS backend endpoint reachable by the provider;
- configured realtime audio model/provider and usage limits.

No provider has been selected or credentials supplied yet. The app must report this route as **not configured** until a real provider connection and callback verification are complete; do not show a fake connected state.

## SIM route

Target architecture:
- User's SIM in a compatible GSM/LTE voice gateway or modem with supported voice-call control and bidirectional audio.
- Gateway registers with / securely connects to the Hamseda backend.
- Hamseda backend controls the gateway call and routes both directions of audio through the same AI call session used by the internet route.

Important constraints:
- An ordinary Android app cannot capture cellular call uplink/downlink audio with public Android APIs. `ACTION_CALL`, `CALL_PHONE`, `InCallService`, and the existing TTS service do not solve this.
- A GSM gateway must support voice (not just SMS/data), the target carrier bands/VoLTE requirements, audio routing, and secure remote control.
- To originate using the user's own SIM identity, that SIM must be in the gateway or an explicitly supported carrier solution must be used. Do not spoof caller ID.
- Do not request root, privileged system signing, or ROM modification as a default workaround.

Required hardware validation before marking this route ready:
- gateway/modem model and firmware;
- carrier/SIM voice compatibility and VoLTE support;
- audio interface and control protocol;
- secure network connectivity to the backend.

## Status model

Each route must expose truthful states:
- `unavailable`: required implementation/dependency absent;
- `needs_setup`: integration exists but provider/gateway configuration is missing;
- `ready`: credentials/hardware and health checks verified;
- `calling`, `in_call`, `ended`, `failed`.

The UI must never imply that a call was placed or that AI audio is connected until the provider/gateway confirms it.

## Delivery sequence

1. Add a call center UI with separate Internet and SIM route status, destination, purpose, voice/name preview, and explicit confirmation.
2. Implement the shared authenticated call-session API and safe call state machine.
3. Integrate one internet telephony provider and verify a real test call.
4. Implement the GSM/LTE gateway adapter against a selected, physically tested model.
5. Add automated tests for authorization, disclosure, consent, interruption, call termination, and provider/gateway failure handling.
6. Build and test the Android APK; only then report either route as ready.

## Current implementation boundary

This document records the verified architecture and constraints. It does not claim either telephony route is operational. The next code changes should add the UI/API state model without presenting unconfigured routes as working calls. Live calling requires provider credentials for the internet route and compatible GSM gateway hardware for the SIM route.
