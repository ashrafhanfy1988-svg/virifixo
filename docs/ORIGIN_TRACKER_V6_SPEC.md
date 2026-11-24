# VIRIFIXO 6.0 — Origin Tracker
## Technical design brief (draft 0.1)
Date: 2026-11-24
Repository branch: `feature/origin-tracker-v6`

## 1. Purpose
Add an independent media-origin investigation workflow that helps a journalist find earlier publicly discoverable appearances of a supplied video or image, compare copies, and document evidence. The feature must never present the earliest result found as proof of the original uploader, filming date, or filming location.

## 2. Product boundaries
- Keep the deployed VIRIFIXO 5.5 site and its existing API untouched.
- Build and test 6.0 work only on this branch.
- Do not change production configuration, secrets, DNS, hosting, or the current YouTube API integration.
- No paid provider, external message, or production deployment without the user's separate approval.
- Results are investigative indicators for human review, not an automated authenticity verdict.

## 3. Proposed user flow
1. User submits one public video URL or uploads a local video/image.
2. Validate the URL and file type/size; explain what is processed locally and what, if anything, is sent to an external provider.
3. For video, extract a small configurable set of representative keyframes locally. For images, use the original image and optionally normalized crops.
4. Compute local fingerprints (cryptographic hash for exact file identity; perceptual hashes for visually similar frames). Keep originals local by default.
5. Search supported public indexes/providers using approved integrations or a clearly labeled manual-search workflow.
6. Normalize candidate matches into source URL, platform, account/channel if publicly available, displayed publication timestamp, retrieval timestamp, match type, and evidence link.
7. Compare candidate media and order results by earliest *verifiable public timestamp*, not by a claim of original publication.
8. Produce a report with evidence, limitations, confidence per claim, and a reproducible search log.

## 4. MVP modules
### A. Intake and keyframe extraction
- Accept public URL only from explicitly supported platforms, plus local uploads.
- Use server-side URL allowlists and redirect/IP protections if remote fetching is implemented; block localhost, private, link-local, and metadata-service addresses.
- Prefer browser/local extraction where technically feasible; do not upload user files without clear disclosure and consent.
- Extract a limited number of frames at distributed timestamps; let the user preview and choose frames.
- Record extraction timestamps and frame hashes.

### B. Reverse-image discovery
- Provider adapter interface so providers can be added or removed without changing the report model.
- Initial study candidates: official/licensed reverse-image APIs where available; manual links to visual search tools where no suitable public API exists.
- Do not scrape search-engine result pages or bypass access controls.
- Label each result with provider, query frame, match URL, observed date, and retrieval date.
- Search results are leads; require opening and checking the underlying page before treating a date/account as evidence.

### C. Timeline and source comparison
- Distinguish: platform publication time, page timestamp, archive capture time, search-index observation, file metadata time, and VIRIFIXO retrieval time.
- Preserve timezone and original timestamp text where available.
- Flag missing, edited, reposted, scheduled, or ambiguous timestamps.
- Use wording such as “earliest public result located in this search” rather than “first upload”.

### D. Geolocation review
- Read embedded GPS metadata only when present and disclose that metadata can be absent, stripped, or altered.
- Provide a human-led checklist for visible landmarks, signs, terrain, weather, shadows, and corroborating public sources.
- Never infer a precise location from weak visual resemblance. Show candidate locations as unverified until corroborated.

### E. Evidence report
Each finding should include:
- Claim and status: supported / plausible / unverified / contradicted.
- Source URL and platform.
- Published/observed/retrieved timestamps, clearly distinguished.
- Matched frame and similarity method/score where applicable.
- Screenshot or archived evidence only when lawful and technically available.
- Analyst notes and limitations.
- Confidence label per individual claim; no single opaque “truth score”.

## 5. Evidence language and safeguards
- “Earliest result found” is not equivalent to “original uploader”.
- An account posting earliest among discovered matches is not necessarily the creator, filmer, or first publisher.
- EXIF timestamps and GPS are editable and may refer to export/edit time or device settings.
- Perceptual similarity can match crops, edits, overlays, and visually similar scenes; it does not prove file lineage.
- Geolocation and event-date claims require independent corroboration.
- Clearly identify inaccessible, deleted, private, unindexed, and region-restricted sources as search limitations.
- Respect provider terms, copyright, privacy, and platform rate limits.

## 6. Proposed architecture
- Frontend: isolated Origin Tracker page/module on this feature branch.
- Analysis service: separate endpoints and configuration namespace; no changes to existing 5.5 routes.
- Workers: bounded frame extraction and fingerprinting jobs with file-size, duration, CPU, and timeout limits.
- Provider adapters: one interface per approved search provider.
- Evidence store: structured result records; avoid retaining uploaded media unless user explicitly chooses to save it.
- Reporting: generate a self-contained evidence report from normalized records.
- Observability: redact submitted URLs/tokens where appropriate; never log API secrets or raw private media.

## 7. Suggested API contract (draft)
- `POST /api/v6/origin/jobs` — create a job from a supported URL or consented upload.
- `GET /api/v6/origin/jobs/{jobId}` — job state and progress.
- `GET /api/v6/origin/jobs/{jobId}/matches` — normalized candidate matches.
- `GET /api/v6/origin/jobs/{jobId}/report` — evidence report.
These are proposals only; do not implement until the current backend structure and hosting constraints are reviewed.

## 8. Validation plan
- Test with public-domain or user-authorized sample media whose prior appearances are independently documented.
- Include altered copies: crop, resize, recompression, subtitles, watermark, mirrored image, and short clips.
- Measure precision of surfaced leads and record missed matches; do not promise exhaustive discovery.
- Test timestamps with timezone differences and pages whose displayed dates differ from archive/index dates.
- Test malicious URLs, oversized files, malformed media, and provider timeouts.
- Verify that the production 5.5 URL, API health check, and existing YouTube workflow remain unchanged.

## 9. Decisions still required
1. Which runtime currently hosts the backend and whether a separate v6 service can be deployed without affecting 5.5.
2. Which reverse-image providers offer permitted APIs, coverage, pricing, and acceptable retention terms.
3. Maximum input video duration and file size for the first MVP.
4. Whether external-provider searches are opt-in per job or enabled by default after disclosure.
5. Report format and retention policy.

## 10. Immediate next tasks
- Inspect the current repository/backend layout and identify deployment boundaries.
- Research provider API availability, terms, coverage, and cost.
- Build a standalone front-end prototype on this branch only. (Initial prototype now exists at `origin-tracker.html`: local image/video preview, up to six keyframes, frame downloads, manual reverse-search handoff, evidence log, and JSON export.)
- Implement no production changes until tests pass and the user approves promotion.


## 11. Initial repository and provider assessment (2026-11-24)
### Existing code boundaries
- The current frontend is a single `index.html`; it already previews local media, reads EXIF, and extracts five video samples in-browser.
- The current backend is a small Node.js/Express service in `server.js`, versioned 5.5, with a single `POST /api/verify` route for YouTube Data API v3.
- `package.json` currently has Express as its only dependency. The public frontend calls the existing Render service at `https://virifixo-1.onrender.com`.
- This supports a low-risk first step: reuse the browser-side media workflow in a standalone prototype, then evaluate a separately deployed v6 service. Do not alter the existing Render service or main branch.

### Provider findings
- **Google Cloud Vision Web Detection** is a documented public API. It can return full/partial matching image URLs, pages containing matching images, visually similar images, and web entities. Published list pricing shows the first 1,000 units per feature per month free, then USD $3.50 per 1,000 Web Detection units (pricing can change and must be rechecked before activation). It is a useful API candidate for frame-to-web discovery, but it does not promise the earliest post or complete coverage.
- **TinEye API** searches TinEye's public index and is a possible second provider; obtain a current quote/bundle and verify permitted commercial use before choosing it. Do not confuse TinEye API with **MatchEngine**, which searches a customer's own image collection. TinEye's published MatchEngine page lists subscription tiers, but those prices are not the price of the public-index TinEye API.
- **Bing Visual Search / Bing Search APIs** were officially retired on August 11, 2025. Do not build a new integration against the retired endpoint. Microsoft's replacement Grounding with Bing Search is not a direct reverse-image-search API.
- **InVID-WeVerify** is a useful journalist workflow and benchmark for keyframe extraction and manual reverse-search handoff. Its project page describes the plugin as free, but it is not evidence that its hosted services are an embeddable/licensable API for VIRIFIXO.
- **Google Lens, TinEye web search, and Yandex image search** can be offered as manual handoff destinations in the prototype; they must not be represented as automated integrations unless an approved API is available.

### MVP provider recommendation
Start with browser-side keyframe extraction plus an optional Google Cloud Vision Web Detection adapter, subject to explicit user consent before sending any frame to Google Cloud. Add TinEye only after receiving and approving current pricing/terms. Keep manual search handoff as a no-provider-key fallback.

### Cost illustration (Google Cloud Vision Web Detection only)
At the published rate, 1,000 billable Web Detection requests beyond the monthly free 1,000 would be approximately USD $3.50, before tax and any other Google Cloud charges. A six-frame search may consume six image requests; therefore the UI must show the estimated request count and require confirmation before a batch is submitted.

### Immediate implementation constraint
The first prototype must remain static and local: preview media, extract frames, download frame images, and open manual search destinations. It must not upload files, call any external API, or change the public 5.5 page.
