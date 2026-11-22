# Hamseda app-to-app internet calls

## Scope
Implement audio-only, user-to-user calls between Hamseda installations. This does not place calls to mobile or landline telephone numbers and does not depend on Twilio or another PSTN provider.

## Proposed architecture
- WebRTC audio (RTCPeerConnection) carries the live audio directly between the two devices whenever the network permits.
- A signaling channel exchanges call invitations, SDP offers/answers, and ICE candidates. The existing Firebase/Firestore stack is the first candidate, subject to deployed Firestore security rules and authenticated user identity.
- STUN is used for direct connectivity discovery. TURN is a fallback relay for restrictive NAT/firewall networks; TURN bandwidth/hosting may incur costs.
- Each installation needs a stable, authenticated identity and a safe way to discover/add another Hamseda user. A short invite code/QR is the initial low-friction option; do not expose a public directory of phone numbers.
- Incoming calls require explicit accept/reject. Show caller identity and call state. Include mute, speaker, and hang-up controls.
- Do not record calls by default.

## Existing repository findings
- The app is a React/Vite app packaged with Capacitor for Android.
- Firebase and Firestore are already dependencies and initialized in src/services/firebaseClient.ts.
- signInWithGoogleSmart() currently rejects Google OAuth inside the native Capacitor WebView, so app-to-app calling cannot assume the existing Google sign-in works on Android.
- The existing /api/voip-proxy-call route is a webhook relay for external telephone gateways; it is not an app-to-app media call implementation.
- The current CallProxyController reads a script aloud locally and is not a two-way internet audio channel.

## Delivery sequence
1. Decide and implement a native-compatible user identity / invite flow, and verify deployed Firestore rules permit only participants to access their own call signaling documents.
2. Implement signaling and WebRTC audio session lifecycle.
3. Add incoming-call UI, accept/reject, mute, speaker, and hang-up.
4. Test on two physical Android devices across Wi-Fi/mobile networks, including a restrictive-network TURN fallback.
5. Only then expose the feature as ready. Do not claim universal connectivity or zero infrastructure cost.

## Cost and network caveats
- Direct WebRTC media can avoid per-minute PSTN charges and usually avoids relaying media through our server.
- Signaling still needs a reachable service. TURN relay traffic and hosting are not guaranteed to be free.
- Some networks block or degrade UDP/VoIP traffic. A TURN-over-TLS/TCP fallback may improve reachability but cannot guarantee calls on every Iranian ISP or during disruptions.