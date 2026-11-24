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
- Build a standalone front-end prototype on this branch only.
- Implement no production changes until tests pass and the user approves promotion.
