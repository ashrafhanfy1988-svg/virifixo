# VIRIFIXO 5.4

VIRIFIXO is a browser-based media review demo. The GitHub Pages frontend is published at:

- https://ashrafhanfy1988-svg.github.io/virifixo/

## Frontend features

- Public YouTube channel/video metadata lookup through the separately hosted VIRIFIXO API.
- Local image preview and EXIF metadata inspection in the browser.
- Local video preview and extraction of five representative frames.
- Local files are processed in the browser by this page; they are not uploaded by the frontend.

## Public API service

The frontend currently sends verification requests to:

- Base URL: https://virifixo-1.onrender.com
- Read-only service status: `GET /`
- Read-only health status: `GET /health`
- Verification: `POST /api/verify` with JSON `{"type":"video"|"channel","url":"https://..." }`

The `GET /` and `GET /health` routes return the service name, running status, and API version. These are read-only status endpoints; they do not start a verification or change stored data. The verification endpoint performs an outbound request to publicly accessible YouTube pages and should only be called when a user intentionally submits a URL.

The API allows browser requests from the GitHub Pages origin `https://ashrafhanfy1988-svg.github.io`. The service is hosted separately from GitHub Pages; a successful Pages deployment does not prove that the Render API is running.

## Deployment and troubleshooting

- GitHub Pages project site URL: https://ashrafhanfy1988-svg.github.io/virifixo/
- GitHub Actions deployment history: https://github.com/ashrafhanfy1988-svg/virifixo/actions
- The Pages site is served from the repository's root `index.html`.
- The `public/index.html` file is kept synchronized as a secondary copy.
- If the website is unavailable while its deployment is successful, verify the published Pages URL and GitHub Pages status before changing repository files.
- If the frontend loads but YouTube verification fails, check the documented read-only API status routes above. Render service availability, environment variables, and deploy settings must be checked in the Render service dashboard; they cannot be repaired by a GitHub Pages commit alone.

## Version and limitations

The current interface and API identify as version 5.4. The service reports only public metadata that is available from YouTube pages; missing fields are not proof of manipulation. VIRIFIXO is an assistance tool and does not establish authenticity or detect deepfakes conclusively.
