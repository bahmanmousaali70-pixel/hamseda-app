# Hamseda Family Life Suite — Design & Technical Review

**Status:** Design only; no feature implementation in this change  
**Base:** `main` at `e95e3a87e6ff8c51c5fe0f200149a60e1cfb94d3`  
**Working branch:** `feature/family-life-suite-design`  
**Scope:** 13 approved capabilities. No existing feature removal, no merge/publish/deploy to `main`.

## 1. Non-negotiable product requirements

- Keep the app free for end users. Do not introduce paid API dependencies as a requirement for core flows.
- Preserve all existing app features and data. Add modules incrementally; do not replace existing storage keys, collections, routes, or components wholesale.
- Keep the existing voice assistant, Persian speech, radio/music/podcast, GTA 6, SMS/call controls, bank/OTP announcement filter, couple sync, planner, expenses, bills, medicine reminders, meals, vault, travel checklist, events, chores, English practice and summarizer intact.
- Do not reintroduce television, cinema, projector casting, movie/series playback or projector remote control as part of this scope.
- Keep `main` untouched. All future implementation work stays on a feature branch until explicitly approved.
- Do not send health, identity, emergency, financial or document data to advertising systems. TapNFC sponsorship can be a clearly labelled, clickable static placement only; no sensitive-data targeting.
- Do not claim clinical diagnosis, guaranteed financial outcomes, live market prices or real-time retailer prices without a verified source.

## 2. Current architecture observed

- React + TypeScript app, with major feature composition in `src/App.tsx`, `TodayView.tsx`, `LifeToolsView.tsx`, `ExtendedToolsView.tsx`, `GrowthCoachView.tsx` and `NightAndMessagesView.tsx`.
- Existing shared types live in `src/types/app.ts`.
- Local persistence currently uses browser `localStorage` keys in `App.tsx`; this is suitable for low-sensitivity offline-first lists but not sufficient protection for health records, identity documents or emergency secrets.
- Couple synchronization uses Firebase Authentication and Firestore in `src/services/coupleSyncService.ts`. Existing space subcollections include goals, habits, gratitudes, callers, schedules, shopping, expenses, bills, meds, meals, vault, packing, events and chores.
- Firestore rules are strict allowlists and validate membership for shared-space data. New collections must receive equally strict validation and tests.
- Firebase sign-in helper currently blocks Google OAuth inside the native Capacitor platform and directs users to browser sign-in / JSON backup. This means native cloud sync cannot be assumed to work on every Android install.
- Current medication/appointment tracking is present, but it is not a complete longitudinal family health record.
- Current bills support an installment kind and reminders, but no amortization/interest calculator was found in the inspected feature code.
- The current night/media view still has a movie-discovery tab. This design does not change it because the approved instruction says not to remove current features. The earlier request to remove all film/TV-related functionality conflicts with that preservation instruction and must be resolved before any media-related edit. No media code is in scope here.

## 3. Proposed navigation and module boundaries

Add one top-level **زندگی و خانواده** hub, or extend the existing Today sub-sections without changing current tab identifiers. Avoid adding 13 permanent bottom-nav buttons. Inside the hub, group modules:

1. **سلامت و ایمنی:** Family Health Record, Emergency Card.
2. **مدارک و خانه:** Document Expiry, Home Consumption.
3. **مالی و خرید:** Loan Calculator, Price Comparison, Smart Shopping Assistant, Goals & Savings.
4. **یادگیری و رشد:** Smart Academy, Brain Training, Career & Skills.
5. **خانواده و زمان:** Shared Family Calendar.

Each module should be a separate component with typed props and a service boundary. Reuse existing design tokens, Persian RTL patterns, voice helper and Jalali date utilities where suitable.

## 4. Feature designs

### 4.1 Family Health Record — پرونده سلامت خانواده
- Per-person profile with optional display name / relationship; do not require national ID or unnecessary sensitive details.
- Sections: conditions/history, allergies, medication list (link to existing medication tracker rather than duplicate), visits, tests, vaccinations and clinician notes.
- Each record: stable ID, person ID, category, event date (Gregorian ISO plus Jalali display), optional title/provider, notes, attachment metadata, created/updated timestamps and author.
- Attachments: first release should allow local file references and user-controlled export; cloud file upload is a later separately reviewed capability. Never put raw medical documents in public URLs.
- Privacy defaults: private to the signed-in user/device. Sharing with partner is opt-in per person and per record, with a clear preview. Do not put health records in the existing broadly shared couple-space collections by default.
- UI must state that this is a personal organizer, not a diagnosis or emergency medical service. Provide export and delete controls.
- Medication schedules remain in the existing medication tracker; health record may link to medication IDs.

### 4.2 Loan, Interest & Installment Calculator — محاسبه‌گر وام
- Inputs: principal, annual nominal interest rate, term (months), payment frequency, first due date, optional fees/insurance and repayment method.
- MVP methods: standard fixed-payment amortizing loan and simple interest comparison. Label assumptions and show formula / breakdown.
- Outputs: estimated installment, total paid, total interest, principal/interest schedule, remaining balance by month, early-settlement what-if.
- Use integer-safe arithmetic (rial/toman unit explicit), decimal-safe rounding and tests against known examples. Store currency unit and avoid mixing IRR and IRT.
- Do not silently assume bank fees, daily interest, penalties or legal terms. User can override assumptions. Existing bill reminders remain separate; offer an explicit action to create reminders from a saved calculation.

### 4.3 Family Emergency Card — کارت اضطراری خانواده
- One card per person, with optional emergency contacts, preferred hospital/doctor, allergies and critical notes; blood type optional and visibly marked “user supplied / unverified”.
- Quick-access screen should work offline and expose only fields the user chose for lock-screen / emergency display.
- No automatic SMS/call to emergency contacts. A tap-to-call action must show the selected number and ask for confirmation.
- Never expose the card to couple sync unless user explicitly shares it.

### 4.4 Document Expiry Manager — مدیریت مدارک و تاریخ انقضا
- Document types: driving licence, passport, insurance, vehicle inspection, warranty, rental contract and custom.
- Metadata only by default: title, issuer, masked reference, issue/expiry date, reminder offsets and optional local attachment.
- Never require storing full card numbers, passwords, bank credentials or one-time codes. Attachments should be local-first and protected; no raw document contents in analytics/logs.
- Reminder schedule: configurable lead times (e.g. 30/7/1 days), Persian calendar display and idempotent notification IDs.

### 4.5 Hamseda Smart Academy — آکادمی هوشمند
- Role/goal-based learning tracks: school learner, university learner, parent, employee, manager, older adult and general lifelong learning.
- Each lesson is short, structured, versioned and authored/reviewed; includes objectives, explanation, examples, quiz and progress.
- Offline starter library bundled with app; optional online content updates. Core use must not require a paid LLM/API.
- AI-generated explanations, if later added, must be optional, labelled and have a non-AI fallback. No unreviewed medical/legal/financial lessons presented as professional advice.

### 4.6 Brain Training — باشگاه تمرین مغز
- Short exercises for memory, attention, logic, mental arithmetic and problem solving, with difficulty adaptation based on the user's own performance.
- Store score, duration, difficulty and streak; avoid claims of treating ADHD, dementia or improving IQ.
- Include accessibility options: large text, audio instructions, reduced time pressure and breaks.
- Ship a small deterministic offline exercise set first; add content packs without paid services.

### 4.7 Shared Family Calendar — تقویم خانوادگی مشترک
- Jalali-first month/week/agenda views, with Gregorian date retained for interoperable storage.
- Event fields: title, start/end, all-day, timezone, participants/visibility, reminder offsets, recurrence rule and author.
- Shared events sync to couple space; private events remain device/user-only. Per-event visibility is required.
- Handle daylight-saving/timezone changes, duplicate reminders and recurrence exceptions. Do not overwrite existing birthdays/anniversaries; provide import/link migration.

### 4.8 Career & Skills Assistant — دستیار شغل و مهارت
- Local profile for skills, experience, projects, certificates and career goals; user controls what is stored.
- Resume builder with editable templates and export; interview practice and skill-roadmap checklists.
- AI help is optional; offline templates and examples remain available. Do not invent credentials or experience in generated resumes.
- Job listings are out of MVP unless a trusted, permitted feed is configured; never scrape sites against terms or claim completeness.

### 4.9 Price Comparison — مقایسه قیمت خرید
- Manual-first product records: product name, brand/model, package size, store, price, currency, timestamp and optional receipt/photo.
- Compare normalized unit price (per kg/litre/item) and show the date and source of each quote.
- Shared household list can link to a product comparison, but purchase history remains user-controlled.
- No fabricated live prices. Automatic retailer integrations are future work only where official APIs/permission exist. Clearly warn that prices and stock may change.

### 4.10 Home Consumption Manager — مدیریت مصرف خانه
- Manual bill and meter readings for electricity, water, gas and internet; meter unit, reading date, amount and optional tariff.
- Charts compare periods and show estimated usage only when two valid readings exist.
- Shared household view is opt-in. Avoid claiming official tariff calculations unless tariff table and effective date are verified.
- Reuse bill reminders where appropriate; do not duplicate bill payments.

### 4.11 Smart Shopping Assistant — دستیار خرید هوشمند
- Turn natural-language requests, meal plans, and household needs into editable shopping suggestions.
- Merge duplicates, preserve quantities/units, group by existing categories and ask before adding multiple items.
- Reuse existing shopping list and couple sync; do not create a parallel list.
- Offline parser for common Persian commands; optional online enrichment with clear disclosure and no mandatory paid API.

### 4.12 Goals & Savings Planner — برنامه‌ریز اهداف و پس‌انداز
- Goal amount, currency, target date, current saved amount, contributions, owner/shared visibility and milestones.
- Scenarios: monthly contribution required, estimated target date at a chosen contribution, and “what if” adjustments.
- No investment advice, guaranteed returns or assumed interest. Default growth/return rate is zero; any optional rate is user-entered and clearly hypothetical.
- Shared goals sync only after explicit creation as a shared goal; individual savings remain private.

## 5. Data ownership, sync and privacy model

Use three scopes, represented explicitly in every record:
- **device-private:** local-only; no cloud sync.
- **user-private:** cloud sync to a user-owned path, only after verified authentication and supported native/web auth is confirmed.
- **shared-space:** sync to the couple space only after explicit sharing.

Do not reuse the existing couple-space collection for private health, emergency or identity records. Proposed Firestore paths, only after rules and tests are ready:
- `/users/{uid}/healthPeople/{personId}`
- `/users/{uid}/healthRecords/{recordId}`
- `/users/{uid}/emergencyCards/{cardId}`
- `/users/{uid}/documents/{documentId}`
- `/users/{uid}/learningProgress/{itemId}`
- `/users/{uid}/brainSessions/{sessionId}`
- `/users/{uid}/careerProfiles/{profileId}`
- `/users/{uid}/priceObservations/{observationId}`
- `/users/{uid}/homeReadings/{readingId}`
- `/users/{uid}/savingsGoals/{goalId}`
- `/spaces/{spaceId}/calendarEvents/{eventId}` and shared goals only when explicitly shared.

Every cloud collection needs strict allowlisted keys, type/range/size checks, verified-user checks, owner UID checks, immutable creator fields, server timestamps and tests for unauthorized cross-user access. Avoid putting sensitive data in shared collections and logs. If authentication is unavailable, keep data local and show a clear sync status; never silently fall back to public or shared storage.

For sensitive local data, evaluate Android Keystore-backed encryption through a native plugin before implementation. Web localStorage is not encrypted and must not be presented as a secure vault. Export must be user initiated and clearly warn before creating an unencrypted JSON file.

## 6. Cross-cutting technical requirements

- Extend types in `src/types/app.ts` with versioned, validated records; never change existing record shapes incompatibly.
- Add dedicated services per domain; keep UI components free of direct Firestore logic.
- Add schema version and migration functions. Migrations must be additive, idempotent and tested against old localStorage/JSON backup data.
- Add new Firestore rules and matching `security_spec.md` / `firebase-blueprint.json` updates before enabling cloud writes.
- Keep offline-first behavior. Queue safe writes only where conflict resolution is deterministic; sensitive records need explicit conflict UI rather than last-write-wins data loss.
- Add assistant intents only after typed actions, confirmation rules and unit tests exist. Do not allow the assistant to infer or transmit health/financial/document details without a user action.
- Preserve SMS bank/OTP filtering as enabled by default; none of these features should inspect bank SMS.
- Use Jalali dates for display and ISO timestamps for storage. Store timezone with calendar events.
- Do not add analytics containing personal, health, financial, document, location or message content.
- Keep TapNFC sponsorship as a labelled clickable website link only; no ad SDK or data sharing in this work.

## 7. Suggested implementation order

**Phase 0 — foundations:** data ownership/scope types, schema versioning, local encryption feasibility spike, auth limitations, Firestore rule tests, migration harness.

**Phase 1 — low-risk utility:** loan calculator (pure tested calculation module), home consumption, price comparison, smart shopping assistant, savings planner.

**Phase 2 — safety and sensitive data:** emergency card, document expiry, family health record. Start local-only; enable private cloud sync only after encryption, auth and rules are validated.

**Phase 3 — family coordination:** shared calendar and opt-in shared savings goals.

**Phase 4 — learning and career:** academy, brain training, career/skills assistant with bundled offline content.

Ship each phase behind a feature flag and verify existing workflows before moving to the next phase.

## 8. Test and acceptance plan

- Unit tests: loan amortization, rounding, currency conversion boundaries (no implicit conversion), Jalali/ISO date conversion, recurrence, reminder idempotency, normalized unit price, consumption deltas, savings scenarios, shopping parser and migration.
- Security tests: unauthenticated access denied; user A cannot read/write user B private records; non-member cannot access couple calendar; health/emergency/document records never readable via shared-space membership alone; unexpected fields and oversized payloads rejected.
- Regression: existing planner, expenses, bills, medication reminders, meal plan, vault, couple settlement, travel checklist, chores, events, English practice, summarizer, voice assistant, music/radio/podcasts/GTA 6 and bank/OTP SMS suppression remain functional.
- Build: run TypeScript check, web production build, unit tests, Android debug build. Device tests on supported Android versions for notifications, encrypted local storage and offline behavior.
- Acceptance: no data loss from an older backup; private records default private; sync scope is visible; user can export/delete; no new paid API required for core flows.

## 9. Explicit out-of-scope items

- No TV, cinema, film/series playback, projector, casting, or projector remote feature.
- No merge, publish, deploy, release or edits to `main`.
- No automatic sharing of health, emergency, document, financial or career profile data.
- No automatic SMS/calls or bank-message reading.
- No claims of diagnosis, guaranteed loan outcome, guaranteed savings return or verified live pricing without evidence.

## 10. Open implementation gates

Before coding the sensitive modules, decide and document:
1. Whether native Android cloud authentication will be implemented (current helper does not support Google OAuth inside Capacitor).
2. Which local encryption implementation will be supported across Android and web, and what happens when device credentials are unavailable.
3. Whether family health records are one-person-per-device or can include multiple family members with explicit consent and access control.
4. Whether attachments remain local-only for the first release.
5. The exact currency unit displayed/stored in each financial screen (Toman vs Rial), with no implicit mixing.

Until these gates are resolved, sensitive modules stay local-only prototypes and no sensitive cloud writes are enabled.
