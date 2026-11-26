# VIRIFIXO — YouTube API compliance screencast (English)

## Purpose

Record a complete, truthful, step-by-step demonstration of how a user submits one public YouTube channel URL or one public YouTube video URL to VIRIFIXO and reviews the structured information returned by the VIRIFIXO server through YouTube Data API v3.

The YouTube API Services team requested this screencast in its email dated 26 November 2026 and asked for an English version/English translation within seven business days.

## Recording rules

- Record the live public site: https://ashrafhanfy1988-svg.github.io/virifixo/public/
- Use a clean browser window at 1920×1080 or 1280×720; keep browser zoom at 100%.
- Record the entire workflow from opening the site through the final report.
- Capture the real site and real returned results only. Do not fabricate, edit, or overlay API results.
- Use English on-screen narration or accurate English subtitles. Arabic can be spoken if a complete English subtitle track is supplied.
- Do not expose API keys, access tokens, private configuration, email inboxes, or developer secrets.
- Do not imply that YouTube endorses, partners with, or is affiliated with VIRIFIXO.
- Do not claim that unavailable public fields were returned. Explain that results depend on public availability and the API response.
- Keep the video continuous where practical; if editing is necessary, disclose cuts and do not alter results.

## Suggested recording sequence and narration

### 1. Open the product

Show the public VIRIFIXO page and its name/version.

Narration:
"VIRIFIXO is an independently developed media-verification support platform. This demonstration shows how a user submits a public YouTube channel or video URL and reviews the information returned through YouTube Data API services."

### 2. Show the YouTube input and disclosures

Scroll to the YouTube verification section. Show:
- The instruction to enter one channel URL or one video URL only.
- The notice that public data is requested through YouTube Data API v3 by the VIRIFIXO server.
- The privacy policy and terms links.
- The user acknowledgement checkbox.

Narration:
"The user enters one public channel URL or one public video URL. The API request is handled by the VIRIFIXO server; the page does not ask the user to enter an API key. The user can review the privacy policy and terms before continuing."

### 3. Demonstrate a public channel URL

Use a public test channel URL that is accessible at recording time. Enter only that URL, select the acknowledgement checkbox, and click Start Verification.

Narration:
"I am submitting a single public YouTube channel URL. I confirm that I have reviewed the applicable policies and then start the verification request."

Wait for the actual response. Keep the loading and result states visible. Do not substitute sample values if the API returns an error or a field is unavailable.

### 4. Review the structured channel report

Scroll through the full result. Show every field that is actually returned, such as channel identity, description, thumbnail, publication details, and public statistics where available.

Narration:
"VIRIFIXO displays the information returned by the server in a structured report. The fields shown depend on what YouTube makes publicly available and what the API response contains."

If a field is unavailable, state:
"This information was not returned in this response and is not inferred or fabricated."

### 5. Demonstrate a public video URL

Start a new check and enter one public YouTube video URL only. Click Start Verification and wait for the actual result.

Narration:
"I will now repeat the process with one public video URL. VIRIFIXO requests the available public video information through its server-side YouTube Data API integration."

Show the actual video report and any returned fields. Do not claim to have analyzed video pixels, audio, or authenticity unless the interface actually performed that separate analysis.

### 6. Show the report and limitations

Show the report end, timestamp, and any available print/report controls.

Narration:
"VIRIFIXO organizes available information to support human review. The report is an aid to review, not an automated final judgment about authenticity or credibility. VIRIFIXO is independent and is not affiliated with or endorsed by YouTube or Google."

## Pre-recording checklist

- [ ] Confirm the live site loads and the displayed version is accurate.
- [ ] Confirm the backend is healthy before recording.
- [ ] Confirm the chosen channel URL is public and returns a real report.
- [ ] Confirm the chosen video URL is public and returns a real report.
- [ ] Capture the consent and policy links clearly.
- [ ] Capture the complete channel result and complete video result.
- [ ] Add English captions if narration is not in English.
- [ ] Review the final video for API keys, tokens, private data, and misleading claims.
- [ ] Export a high-quality MP4 and retain the unedited original recording.

## Submission package

Provide the YouTube API Services team with:
1. The screencast MP4 or a stable view-only link.
2. A concise note identifying the public demo URL.
3. A statement that API requests are made server-side and users are not asked to provide API keys.
4. A statement that VIRIFIXO is independent and not affiliated with YouTube or Google.

Do not send the recording until the owner has reviewed and approved it.
