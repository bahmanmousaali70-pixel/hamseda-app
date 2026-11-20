# Hamseda — Google AI Studio Merge Handoff

**Purpose:** Safely reconcile the currently deployed Google AI Studio / Cloud Run project with the GitHub source without losing either side's working features.

## Repository and source context

- Repository: https://github.com/bahmanmousaali70-pixel/hamseda-app
- AI Studio is connected to the `main` branch.
- The development branch used for the recent app work was `release/assistant-final-upgrade`.
- The previous integration PR was #1: https://github.com/bahmanmousaali70-pixel/hamseda-app/pull/1
- The user reports that the current AI Studio project has additional podcast/audiobook improvements (described below). Those improvements must be preserved and, after reconciliation, committed back to GitHub. Do NOT assume they are already present in GitHub.

## Non-negotiable merge rule

Do not use “Keep all GitHub”, “Keep all AI Studio”, “Accept all”, or wholesale file replacement. Resolve each conflict semantically, preserving the union of working behavior from both sides. Inspect the complete file and its imports/callers before editing. Keep a backup/copy of the pre-merge AI Studio version of every conflicted file.

If a change cannot be reconciled confidently, stop and report the exact conflict rather than deleting functionality.

## Required existing Hamseda functionality to preserve

1. Persian voice assistant with Negin as the default assistant/persona and existing voice/TTS/STT behavior.
2. Existing online and offline voice engines, offline model support, noise reduction, and voice-cloning functionality.
3. Android Native Bridge and native plugin behavior.
4. Device actions, with explicit confirmation before sensitive actions such as sending SMS or placing calls; cancellation must prevent accidental execution.
5. Persian date/time handling and existing user settings.
6. Persian radio directory and station data, including Radio Javan, Radio Khorshid, and other existing Persian-language stations.
7. Existing podcast, audiobook, music, and GTA 6 streams features.
8. Operator promotional SMS filtering and all existing SMS announcement policies.

## Podcast / audiobook changes reported as working in the current AI Studio project

The user reports these changes have been applied and tested in AI Studio. Preserve them and ensure the final merged version contains equivalent behavior:

- Server endpoint: `POST /api/podcast-search`.
- Topic/category separation.
- Inspection of iTunes results and RSS feeds; discard invalid feeds.
- Separate relevant episodes from unrelated episodes in multi-book channels.
- Correct ascending ordering of Persian episode ordinals, including written forms such as اول، دوم، سیزدهم، چهاردهم، بیست‌ویکم، سی‌ویکم.
- PodcastLibraryView topic tabs/categories.
- Accordion groups; only the first relevant group open by default.
- Controls to expand/collapse all groups.
- Separate control for unrelated episodes from the same channel.
- Quick filtering between episodes.
- Reported live test: search “کتاب فارسی بامداد خمار”, 5 relevant collections and 33 ordered episodes, starting with “بامداد خمار اپیزود اول”.

These are user-reported test results, not an instruction to claim a new test unless you run it again.

## Internet search reliability requirements

- When the user asks for current facts, statistics, prices, or web research, perform an actual web search through the configured server-side search provider.
- Return a Persian summary with source titles and clickable source URLs, and include dates/units for statistics when available.
- Never leave the assistant stuck on “در حال جست‌وجو” or “دارم جست‌وجو می‌کنم”.
- Add a finite timeout, clear error handling, and a user-visible Persian fallback if search fails.
- Do not fabricate search results or statistics.
- Verify which search provider and credentials are actually configured. Do not introduce paid API dependencies without explicit approval.
- Check CORS, request URL/base URL, HTTP status handling, and the production server route.

## Server and deployment requirements

- Inspect the complete `server.ts`, all API routes, environment-variable names, and the actual Cloud Run deployment configuration.
- Do not overwrite the live service or publish/deploy automatically.
- Do not expose API keys or secrets in source, logs, APK, or this handoff file.
- Distinguish frontend build success from server deployment success.
- Confirm that the final server endpoint is deployed to the existing Hamseda service only after the user explicitly approves deployment.
- Verify `/api/health`, `/api/podcast-search`, and the actual internet-search route against the production base URL after deployment.

## Required workflow

1. Inventory all conflicted files and identify which side introduced each change.
2. Back up the AI Studio version before resolving each conflict.
3. Resolve the 9 reported conflicts one by one, preserving all behavior described above and all unrelated existing functionality.
4. Inspect changed files and their dependent components/native files.
5. Run the project's actual lint/typecheck and production build commands. Report exact command output; do not claim success unless commands completed successfully.
6. Run endpoint tests against a local/staging instance first. Re-run the reported podcast query and verify the actual response ordering.
7. Add/commit the final reconciled source to GitHub `main`, including the AI Studio-only improvements that were preserved.
8. Provide the final commit SHA, changed-file list, test evidence, and source ZIP.
9. STOP before Publish/Republish or Cloud Run deployment. Wait for the user's explicit approval.

## Final response format

Report:
- all 9 conflicts: resolved / unresolved, with file names;
- which AI Studio-only behavior was preserved;
- which GitHub changes were integrated;
- lint/typecheck result;
- production build result;
- endpoint test results with URLs/status codes;
- final GitHub commit SHA and source ZIP link;
- explicit statement that deployment was NOT performed unless it truly was.
