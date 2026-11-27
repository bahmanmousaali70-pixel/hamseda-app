# Security Summary

**Reviewed Files**: 9 (`server.ts`, `firestore.rules`, `firebase-blueprint.json`, `security_spec.md`, `src/services/sponsorAdsService.ts`, `src/components/SponsorRewardModal.tsx`, `src/components/SponsorAdminPanel.tsx`, `src/components/NightAndMessagesView.tsx`, `src/App.tsx`)
**Issues Resolved**: 3

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Client-Tamperable Coin Wallet & Unprotected AI Endpoints | `src/services/sponsorAdsService.ts`, `src/App.tsx`, `server.ts` | `server.ts:351`, `server.ts:380`, `src/App.tsx:550` | Coin balances and daily bonus dates were read from and trusted in browser `localStorage`, while `/api/morning-message`, `/api/special-message`, and `/api/night-discover` accepted unauthenticated requests without verifying coin deduction. | High | Fixed | Added server-authoritative wallet endpoints (`/api/wallet/bootstrap`, `/api/wallet/spend`) backed by Firebase ID token verification, rotating-nonce HMAC-SHA256 tokens, server-clock (`Asia/Tehran`) daily bonus checks, and single-use `X-Coin-Receipt` enforcement on AI endpoints. |
| Client-Side Ad Timer & Reward Claim Bypass | `src/components/SponsorRewardModal.tsx`, `server.ts` | `server.ts:434`, `server.ts:488`, `src/components/SponsorRewardModal.tsx:74` | The 10-second ad countdown and `rewardCoins` credit ran only in React client state, letting a modified client claim arbitrary coins immediately without waiting. | High | Fixed | Added server challenge-response endpoints (`/api/ads/session/start`, `/api/ads/session/claim`) that read authoritative `rewardCoins` and `durationSeconds` from Firestore, enforce server timestamps (`minClaimAt`) and per-user cooldowns, and mark each session single-use. |
| Unthrottled Ad Impression & Click Flooding | `firestore.rules`, `src/services/sponsorAdsService.ts` | `firestore.rules:811`, `firestore.rules:834`, `src/services/sponsorAdsService.ts:465` | Any authenticated device could repeatedly send direct Firestore updates to increment `impressions` and `clicks` on `sponsorAds/{adId}` with no server-enforced rate limit. | High | Fixed | Split public metric updates into atomic `writeBatch` transactions paired with a per-user `sponsorAds/{adId}/userMetrics/{metricUid}` document enforcing a strict 10-second `request.time` server cooldown and `getAfter()` receipt verification. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Admin Panel Access Control | `firestore.rules:18`, `src/services/firebaseClient.ts` | `isAdmin()` requires a verified Google sign-in provider (`request.auth.token.firebase.sign_in_provider == 'google.com'`), verified email (`mehdi.secret7@gmail.com`), and server-side rule checks on all `sponsorAds` create, edit, and delete operations. |
| Sponsor Banner & Link Sanitization | `src/services/sponsorAdsService.ts:58`, `firestore.rules:360` | `sanitizeHttpUrl` restricts image and link URLs strictly to `http:` / `https:` with no embedded credentials or control characters, reinforced by Firestore schema regex rules. |
| Token Integrity & Replay Protection | `server.ts:156` | Wallet tokens, spend receipts, and ad sessions use `crypto.createHmac('sha256', ...)` with `crypto.timingSafeEqual`, server-side nonces, and single-use receipt maps. |
| Dependency Security | `package.json`, `bun.lock` | Checked all 803 packages with `bun audit`; 0 known vulnerabilities found. |

---

## PoC Verification

### 1. LocalStorage Wallet Tampering & Unauthenticated AI API Call

#### Summary
| Field | Value |
|---|---|
| Issue Type | Client-Trusted Economy & Missing Server Authorization Check |
| Impact | High |
| Affected File | `server.ts:351`, `server.ts:391`, `server.ts:536` |
| Test Scenario | Editing `hamseda_coin_wallet_v1` in browser `localStorage` to `9999` coins or sending `POST /api/morning-message` directly with `curl` and no `X-Coin-Receipt` header. |

#### How It Was Fixed
Coin balances are tracked per verified Firebase UID on the server via `/api/wallet/bootstrap` and `/api/wallet/spend`, returning signed HMAC-SHA256 wallet tokens with rotating nonces and single-use 5-minute spend receipts (`X-Coin-Receipt`). Protected AI routes invoke `consumeCoinReceipt()` before calling Gemini.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Direct request arrives at `POST /api/morning-message` (or `/api/special-message`, `/api/night-discover`) without a valid Firebase Bearer token or `X-Coin-Receipt` | Request enters `consumeCoinReceipt(req, [...])` at `server.ts:351` |
| 2 | `verifyFirebaseCaller(req)` checks `Authorization: Bearer <idToken>` against Firebase Identity Toolkit (`server.ts:263`); `verifyHmacPayload` checks the HMAC signature, UID match, feature match, and single-use `validSpendReceipts` entry (`server.ts:359-376`) | Missing/forged/replayed token is rejected immediately |
| 3 | Route returns HTTP `401` or `402` JSON error before instantiating Gemini (`server.ts:537-540`), and client `syncWalletWithServer()` overwrites tampered `localStorage` values with server state | **Handled Safely** |

#### Conclusion
**Fix Verified** - Browser `localStorage` edits cannot mint usable server coins, and direct requests without a valid, unconsumed spend receipt are blocked at HTTP `401`/`402`.

---

### 2. Early Sponsor Ad Reward Claim & Session Replay

#### Summary
| Field | Value |
|---|---|
| Issue Type | Client-Side Timer & Reward Integrity Bypass |
| Impact | High |
| Affected File | `server.ts:434`, `server.ts:488`, `src/components/SponsorRewardModal.tsx:74` |
| Test Scenario | Calling `POST /api/ads/session/claim` immediately (e.g., 1 second after `/api/ads/session/start`), forging `rewardCoins: 500`, or replaying the same `sessionToken` twice. |

#### How It Was Fixed
Opening `SponsorRewardModal` calls `/api/ads/session/start`, where the server looks up authoritative `rewardCoins` and `durationSeconds` directly from Firestore (`fetchAuthoritativeAdFromFirestore` at `server.ts:310`) and sets `minClaimAt = now + durationSeconds * 1000`. `/api/ads/session/claim` validates timing, UID ownership, per-user cooldown, and single-use session status.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Client sends `POST /api/ads/session/claim` before `durationSeconds` elapses (`server.ts:488`) | Handler verifies Firebase Bearer token and HMAC `sessionToken` (`server.ts:489-498`) |
| 2 | Server checks `now < session.minClaimAt - 500` at `server.ts:509` (and `session.claimed` at `server.ts:505`, plus `state.lastClaimAt` cooldown at `server.ts:518`) | Early claim returns HTTP `425`; replay returns HTTP `409`; client-supplied `rewardCoins` is ignored because server uses `session.rewardCoins` |
| 3 | Only after elapsed server duration is `session.claimed = true` set and server wallet credited | **Handled Safely** |

#### Conclusion
**Fix Verified** - Sponsor rewards cannot be forged, replayed, or claimed before the server-measured ad duration completes.

---

### 3. Direct Firestore Ad Impression / Click Counter Flooding

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Rate-Limiting / Atomic Counter Guard in Database Rules |
| Impact | High |
| Affected File | `firestore.rules:811`, `firestore.rules:834`, `src/services/sponsorAdsService.ts:465` |
| Test Scenario | Authenticated client executes a tight loop calling `updateDoc(doc(db, 'sponsorAds', adId), { impressions: increment(1) })` without updating a cooldown receipt or within 10 seconds of the previous update. |

#### How It Was Fixed
Deployed updated `firestore.rules` introducing `sponsorAds/{adId}/userMetrics/{metricUid}` with server-timestamp cooldown checks (`duration.value(10, 's')`) and requiring an atomic `getAfter(...)` match on `sponsorAds/{adId}` updates (`impressions + 1` or `clicks + 1` only). Client analytics helpers (`recordSponsorAdImpression`, `recordSponsorAdClick`) were updated to commit atomic `writeBatch` operations.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Direct unbatched `updateDoc` or rapid repeated `writeBatch` arrives at `sponsorAds/{adId}` | Evaluated by `firestore.rules:811-831` |
| 2 | `getAfter(.../userMetrics/$(request.auth.uid)).data.lastImpressionAt == request.time` (`firestore.rules:824`) checks the companion subcollection write, whose update rule requires `request.time >= existing().lastImpressionAt + duration.value(10, 's')` (`firestore.rules:862`) | Unbatched writes or writes within 10 seconds fail rule evaluation |
| 3 | Firestore rejects the write transaction with `PERMISSION_DENIED` | **Handled Safely** |

#### Conclusion
**Fix Verified** - Repeated impression/click inflation within 10 seconds or without an atomic per-user metric receipt is rejected at the Firestore rule layer.
