# VIRIFIXO media test matrix — 6.0 review

This checklist distinguishes features available in the current public demo from proposed tests or future work. Do not report a test as passed until it has been run against the live build and its actual output recorded.

## Image tests

| ID | Fixture | Expected result | Status |
|---|---|---|---|
| IMG-01 | JPEG with Make, Model, DateTimeOriginal, DateTimeDigitized, DateTime, Software | Each EXIF field is displayed under its own label | Pending |
| IMG-02 | JPEG with no EXIF | Clear “No EXIF metadata found” message; no date inferred from filesystem | Pending |
| IMG-03 | PNG with no EXIF | Image preview and dimensions work; EXIF absence is reported accurately | Pending |
| IMG-04 | JPEG with GPS test coordinates (synthetic location only) | Latitude/longitude displayed only when embedded | Pending |
| IMG-05 | JPEG with EXIF orientation | Preview orientation and metadata reading are checked independently | Pending |
| IMG-06 | Corrupt or unsupported image | Graceful error; page remains usable | Pending |
| IMG-07 | Large image | No crash; loading and memory behavior observed | Pending |

## Video tests

| ID | Fixture | Expected result | Status |
|---|---|---|---|
| VID-01 | Short MP4 with supported browser codec | Preview, duration, width, and height display | Pending |
| VID-02 | Multi-scene MP4 | Five sample frames are extracted and timestamped | Pending |
| VID-03 | Very short video | Frame extraction handles seek boundaries safely | Pending |
| VID-04 | Video with no useful embedded metadata | No image EXIF claims; basic video metadata remains separate | Pending |
| VID-05 | Unsupported codec/container | Clear browser decode error; no false success | Pending |
| VID-06 | Corrupt video | Graceful failure; controls remain responsive | Pending |

## Audio tests — proposed capability, not currently available in the public demo

The current public file picker is designed for image and video files. Audio support must be treated as a separate product change and must not be advertised as available until implemented and tested.

| ID | Fixture | Proposed expected result | Status |
|---|---|---|---|
| AUD-01 | WAV without metadata | If audio support is approved, show format, duration, sample rate, and channels | Not implemented |
| AUD-02 | MP3 with ID3 metadata | If audio support is approved, show title/artist/album only when present | Not implemented |
| AUD-03 | MP3 without metadata | Show technical properties without inventing descriptive metadata | Not implemented |
| AUD-04 | Corrupt/unsupported audio | Clear error and safe recovery | Not implemented |

## Cross-cutting verification

- [ ] Keep local file processing local unless a clearly disclosed, separately approved server feature is introduced.
- [ ] Keep filesystem last-modified time separate from embedded capture/digitization/image dates.
- [ ] Treat EXIF as editable metadata, not proof of authenticity.
- [ ] Missing metadata must not be treated as proof of manipulation.
- [ ] Do not use real personal GPS coordinates in test fixtures.
- [ ] Record browser, operating system, fixture filename, test date, actual output, and pass/fail evidence.
- [ ] Re-run the YouTube public channel and public video workflows independently; these are separate from local file analysis.

## Release gate

Do not merge or publish changes solely because code has been edited. First run the relevant tests, inspect the real outputs, review the English YouTube compliance screencast, and obtain the project owner's approval.
