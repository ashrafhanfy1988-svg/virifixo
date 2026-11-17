# VIRIFIXO 5.5

Public site: https://ashrafhanfy1988-svg.github.io/virifixo/
Privacy: https://ashrafhanfy1988-svg.github.io/virifixo/privacy.html
Terms: https://ashrafhanfy1988-svg.github.io/virifixo/terms.html

## Frontend
- Public YouTube metadata lookup through the Render API.
- Local image preview, EXIF inspection, video preview and five-frame extraction.
- Local media files are processed in the browser and are not uploaded by this frontend.

## Render API
- Base URL: https://virifixo-1.onrender.com
- Health: GET /health
- Verify: POST /api/verify with {"type":"video"|"channel","url":"https://..."}
- Uses YouTube Data API v3 only; no YouTube page scraping.
- Required environment variable: YOUTUBE_API_KEY. Set it in Render Dashboard → service → Environment, then redeploy. Never put the key in frontend code or GitHub.
- Supported channel URLs: /@handle, /channel/UC..., /user/username. Custom /c/... URLs are not resolved.
- /health returns HTTP 503 until the API key is configured.

Official policy: https://developers.google.com/youtube/terms/developer-policies
