# Hamseda Cinema & Projector — implementation plan

## Goal
Add a first-class Cinema area to Hamseda for finding and playing legally available free films/series, plus practical playback on Android projectors. Preserve existing radio, podcast, GTA 6 streams, assistant, and speech features.

## Current repository findings (main at 40c6567)
- Media navigation currently has tracks, radio, podcasts, and GTA 6 tabs in `NightAndMessagesView.tsx`.
- `GTA6StreamsView.tsx` embeds permitted YouTube videos when embedding is allowed, and opens official YouTube/Twitch search externally.
- Movie discovery in `NightAndMessagesView.tsx` calls `/api/night-discover` and presents recommendations/metadata links; it is not a film player or verified free-video catalogue.
- Android app is a Capacitor WebView app. The manifest has network/Wi-Fi permissions but no implemented Cast/Miracast/DLNA receiver/sender integration was found in the inspected source.
- Existing native bridge is the place to add Android-specific projector intents only after checking device/API compatibility.

## Product principles
1. Never bypass Filimo or another paid service's subscription, DRM, login, or access controls.
2. List playable sources only when the source is public, legal, and its playback URL/embed is permitted. Distinguish free-with-ads, public-domain, and subscription content clearly.
3. Prefer installing Hamseda on the Android projector and playing there directly. This avoids phone battery/display mirroring and is the most reliable first milestone.
4. Add phone-to-projector casting as supported transport options, not a promise that every projector supports every protocol.
5. Keep the existing GTA 6 stream view intact; reuse its safe embed/external-fallback pattern where appropriate.

## Delivery phases
### Phase A — in-app cinema player
- Add a dedicated Cinema tab/component without replacing existing media tabs.
- Support direct public MP4/WebM/HLS URLs and allowed YouTube embeds, with an external-player fallback when embedding is blocked.
- Provide search/filter UI for film/series, Persian dub/subtitle metadata, and source type.
- Persist watch progress and recently played items locally.
- Do not scrape, proxy, or expose protected subscription streams.

### Phase B — legal free catalogue
- Add source adapters for official free/public-domain catalogues only.
- Return structured entries with title, artwork, language/audio, source, availability label, and playback mode.
- Verify each source's terms and actual playback behavior before marking it playable. Search-result links alone are not proof of playback availability.

### Phase C — projector compatibility
- Make the UI responsive and remote-control friendly for Android TV/projector screens (large focus targets, D-pad navigation, landscape/full-screen).
- Test direct install/playback on the projector.
- Add Android "Cast / wireless display" settings launch where supported, with honest device compatibility messaging.
- Investigate DLNA/Chromecast/Miracast separately; do not claim support until protocol discovery, pairing, playback, and stop flows are implemented and tested.

### Phase D — phone as remote
- Design an authenticated local pairing flow (QR/PIN) between phone and projector.
- Send play/pause/seek/volume/navigation commands over a local transport or existing authenticated sync service.
- Do not expose an unauthenticated open control endpoint.

## Acceptance checks
- Existing media tabs and playback still work.
- Direct public video playback works on supported Android projector browser/WebView.
- Unsupported/blocked embeds show a useful external-open fallback.
- No paid-service DRM/subscription circumvention.
- Keyboard/D-pad and touch navigation both work.
- Build/typecheck pass; then test on a real phone and projector. A successful build is not a device compatibility test.


## Implementation update — DLNA phone-to-projector casting

Implemented on `feature/cinema-projector-cast`:

- Native Android Capacitor bridge: `CinemaCastPlugin.kt`.
- DLNA/UPnP discovery and remote media playback using the MIT-licensed `yinnho/UPnPCast` library (JitPack `v1.3.0`).
- Device discovery on the same Wi-Fi network, device selection, direct HTTP(S) media URL casting, and remote play/pause/stop/state controls.
- Android system Cast settings shortcut for screen-mirroring/output-picker options where the device firmware exposes them.
- Added the required Wi-Fi multicast permission and registered the native plugin in `MainActivity`.

Important boundaries:

- DLNA casting requires the phone and receiver to share a local network and the receiver to expose a compatible DLNA renderer.
- A remote renderer must be able to fetch the supplied media URL itself. A YouTube page/embed URL is not a direct media URL and is intentionally rejected for DLNA.
- The system Cast settings shortcut only opens Android's system settings; it does not guarantee Miracast support or start screen mirroring programmatically.
- Google Cast SDK sender support is separate from DLNA and is not included in this implementation. Chromecast discovery and playback still need a dedicated integration and a compatible Cast receiver.
- The projector's exact model/firmware is unknown, so compatibility must be verified on the user's actual device.
- No build or physical-device test has been completed for this feature branch yet.


## Owlenz SD500 — phone VPN / wireless display path

The user confirmed that the Owlenz SD500 has previously received a phone screen wirelessly, although the receiver menu label is currently unknown. The preferred path for services that require the phone's VPN is therefore:

1. Keep the VPN active on the Android phone.
2. Open the phone's Android Cast / wireless display settings from Hamseda.
3. Select the projector's screen-mirroring receiver and start playback on the phone.
4. The projector acts as a display; it does not need a VPN app or a VPN subscription.

The native shortcut opens Android's Cast settings only. Android/OEM firmware controls actual pairing and mirroring; Hamseda cannot guarantee or silently initiate Miracast on every phone. The user may need to enable Screen Mirroring / Miracast / WiFi Display in the projector's own menu. Wireless display may use Wi-Fi Direct and may not require both devices to share the same router Wi-Fi; follow the device's pairing prompt.

DLNA remains a separate option for direct public HTTP(S) media URLs. In that mode the projector/renderer fetches the media itself, so the phone's VPN is not automatically shared with it. YouTube page URLs are not direct media URLs and remain unsupported by the DLNA sender. No VPN proxy/relay or DRM circumvention is included. Some subscription apps may block mirrored playback or show a black screen because of DRM.

Validation status: source changes are committed to this feature branch only. No Android build, phone test, or physical Owlenz SD500 pairing test has been completed yet. Do not describe the projector as fully verified until those tests pass.
