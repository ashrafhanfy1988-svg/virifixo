
"use strict";

const express = require("express");

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const VERSION = "5.1";

const ALLOWED_ORIGINS = new Set([
  "https://ashrafhanfy1988-svg.github.io"
]);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "www.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com"
]);

app.disable("x-powered-by");

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return res.sendStatus(403);
    }
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({
  limit: "10kb",
  strict: true
}));

// ==================================================
// 1. SERVICE STATUS
// ==================================================

app.get("/", (req, res) => {
  res.json({
    service: "VIRIFIXO API",
    status: "running",
    version: VERSION
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "VIRIFIXO API",
    status: "running",
    version: VERSION
  });
});

// ==================================================
// 2. HTML ENTITY DECODER
// ==================================================

const HTML_ENTITIES = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  yen: "¥",
  middot: "·",
  bull: "•",
  laquo: "«",
  raquo: "»",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“"
};

function decodeHtml(value = "") {
  return String(value).replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (entity, code) => {
      if (code[0] === "#") {
        const hex = code[1].toLowerCase() === "x";
        const number = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);

        if (
          !Number.isInteger(number) ||
          number <= 0 ||
          number > 0x10FFFF ||
          (number >= 0xD800 && number <= 0xDFFF)
        ) {
          return entity;
        }

        try {
          return String.fromCodePoint(number);
        } catch {
          return entity;
        }
      }

      return HTML_ENTITIES[code.toLowerCase()] ?? entity;
    }
  );
}

function cleanText(value) {
  if (typeof value !== "string") return "";

  return decodeHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u200B-\u200F\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ==================================================
// 3. HTML METADATA EXTRACTION
// ==================================================

function getTagAttribute(tag, attribute) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const match = tag.match(
    new RegExp(
      "\\b" + escaped + "\\s*=\\s*(['\"])(.*?)\\1",
      "i"
    )
  );

  return match ? decodeHtml(match[2]) : "";
}

function extractMeta(html, wanted) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const key =
      getTagAttribute(tag, "property") ||
      getTagAttribute(tag, "name") ||
      getTagAttribute(tag, "itemprop");

    if (key.toLowerCase() === wanted.toLowerCase()) {
      return cleanText(getTagAttribute(tag, "content"));
    }
  }

  return "";
}

function extractCanonical(html, fallback) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const rel = getTagAttribute(tag, "rel");

    if (rel.toLowerCase().split(/\s+/).includes("canonical")) {
      return getTagAttribute(tag, "href") || fallback;
    }
  }

  return fallback;
}

// ==================================================
// 4. SAFE YOUTUBE URL VALIDATION
// ==================================================

function validateYoutubeUrl(type, value) {
  if (
    typeof value !== "string" ||
    value.length > 2048
  ) {
    throw new Error(
      "رابط YouTube مطلوب ويجب ألا يتجاوز 2048 حرفاً."
    );
  }

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("الرابط غير صالح.");
  }

  const host = parsed.hostname.toLowerCase();

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !YOUTUBE_HOSTS.has(host)
  ) {
    throw new Error(
      "يرجى إدخال رابط YouTube آمن وصحيح."
    );
  }

  const path = parsed.pathname;

  if (type === "video") {
    let videoId = "";

    if (host === "youtu.be") {
      videoId = path.slice(1).split("/")[0];
    } else if (path === "/watch") {
      videoId = parsed.searchParams.get("v") || "";
    } else {
      const match = path.match(
        /^\/(?:shorts|embed|live)\/([^/]+)/
      );
      videoId = match ? match[1] : "";
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      throw new Error("أدخل رابط فيديو YouTube صالحاً.");
    }

    return { parsed, videoId };
  }

  const validChannel =
    host !== "youtu.be" &&
    (
      /^\/@[^/]+/.test(path) ||
      /^\/channel\/UC[a-zA-Z0-9_-]+/.test(path) ||
      /^\/user\/[^/]+/.test(path) ||
      /^\/c\/[^/]+/.test(path)
    );

  if (!validChannel) {
    throw new Error(
      "أدخل رابط قناة YouTube صالحاً."
    );
  }

  return { parsed };
}

// ==================================================
// 5. SAFE HTTP FETCH
// ==================================================

async function fetchText(inputUrl) {
  let currentUrl = new URL(inputUrl);

  for (let attempt = 0; attempt < 4; attempt++) {
    if (
      currentUrl.protocol !== "https:" ||
      !YOUTUBE_HOSTS.has(currentUrl.hostname.toLowerCase()) ||
      currentUrl.username ||
      currentUrl.password
    ) {
      throw new Error("تم رفض تحويل غير موثوق.");
    }

    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VIRIFIXO/5.0)",
        "Accept":
          "text/html,application/json;q=0.9,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (
      [301, 302, 303, 307, 308].includes(response.status)
    ) {
      const location = response.headers.get("location");

      if (!location || attempt === 3) {
        throw new Error("تعذر إكمال تحويل رابط YouTube.");
      }

      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new Error(
        "تعذر جلب بيانات YouTube (HTTP " +
        response.status + ")."
      );
    }

    return response;
  }

  throw new Error("تجاوز عدد تحويلات الرابط المسموح بها.");
}

// ==================================================
// 6. EXTRACT JSON EMBEDDED IN YOUTUBE PAGE
// ==================================================

function extractEmbeddedJson(html, marker) {
  const position = html.indexOf(marker);

  if (position === -1) return null;

  const start = html.indexOf("{", position + marker.length);

  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;

      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function getRendererText(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return cleanText(value);
  }

  if (typeof value.simpleText === "string") {
    return cleanText(value.simpleText);
  }

  if (Array.isArray(value.runs)) {
    return cleanText(
      value.runs.map(item => item.text || "").join("")
    );
  }

  return "";
}

function findFirstKey(object, keys) {
  const wanted = new Set(keys);
  const visited = new Set();
  const stack = [object];

  while (stack.length) {
    const current = stack.pop();

    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;

    visited.add(current);

    for (const key of wanted) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        const value = current[key];

        if (value !== undefined && value !== null) {
          const text = getRendererText(value);

          if (text) return text;
        }
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return "";
}

function findChannelId(object) {
  const visited = new Set();
  const stack = [object];

  while (stack.length) {
    const current = stack.pop();

    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;

    visited.add(current);

    for (const key of ["channelId", "externalId"]) {
      const value = current[key];

      if (
        typeof value === "string" &&
        /^UC[a-zA-Z0-9_-]{22}$/.test(value)
      ) {
        return value;
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return "";
}

// ==================================================
// 7. DATA AVAILABILITY
// ==================================================

function available(value) {
  return value !== undefined &&
    value !== null &&
    String(value).trim() !== "";
}

function field(value) {
  return {
    value: available(value) ? value : null,
    available: available(value)
  };
}

// ==================================================
// 8. CHANNEL VERIFICATION
// ==================================================

async function verifyChannel(url) {
  const response = await fetchText(url);
  const html = await response.text();

  const initialData = extractEmbeddedJson(
    html,
    "ytInitialData"
  );

  const metadata = extractMeta(html, "og:title") ||
    extractMeta(html, "title") ||
    extractMeta(html, "twitter:title");

  const description = extractMeta(html, "og:description") ||
    extractMeta(html, "description");

  const image = extractMeta(html, "og:image");

  const renderer =
    initialData?.metadata?.channelMetadataRenderer || {};

  const title =
    cleanText(renderer.title || "") ||
    metadata;

  const channelDescription =
    cleanText(renderer.description || "") ||
    description;

  const thumbnail =
    renderer.avatar?.thumbnails?.slice(-1)[0]?.url ||
    image;

  const channelId =
    renderer.externalId ||
    findChannelId(initialData) ||
    "";

  // YouTube places channel statistics in different renderers and,
  // for some channel layouts, exposes total views and join date only
  // on the About tab. Read that public tab as a secondary source.
  let aboutData = null;

  try {
    const aboutUrl = new URL(extractCanonical(html, url));
    aboutUrl.pathname = aboutUrl.pathname.replace(/\\/$/, "") + "/about";
    const aboutResponse = await fetchText(aboutUrl.toString());
    const aboutHtml = await aboutResponse.text();
    aboutData = extractEmbeddedJson(aboutHtml, "ytInitialData");
  } catch (error) {
    console.warn("VIRIFIXO channel About data unavailable:", error.message);
  }

  const subscribers =
    findFirstKey(initialData, [
      "subscriberCountText",
      "subscriberCount",
      "subscriberCountLabel"
    ]);

  const videoCount =
    findFirstKey(initialData, [
      "videosCountText",
      "videoCountText",
      "videoCount",
      "videosCount"
    ]);

  const totalViews =
    findFirstKey(aboutData, [
      "viewCountText",
      "viewCount",
      "totalViews"
    ]) ||
    findFirstKey(initialData, [
      "viewCountText",
      "viewCount",
      "totalViews"
    ]);

  const joinedDate =
    findFirstKey(aboutData, [
      "joinedDateText",
      "joinedDate"
    ]) ||
    findFirstKey(initialData, [
      "joinedDateText",
      "joinedDate"
    ]);

  if (!title && !channelDescription && !channelId) {
    throw new Error(
      "لم نتمكن من قراءة بيانات القناة العامة. " +
      "قد تكون الصفحة محجوبة أو تغير تنسيق YouTube."
    );
  }

  const canonical = extractCanonical(html, url);

  return {
    ok: true,
    type: "channel",
    version: VERSION,

    title,
    channelTitle: title,
    channelId,

    description: channelDescription,
    thumbnailUrl: thumbnail,
    channelUrl: canonical,

    statistics: {
      subscribers: field(subscribers),
      videoCount: field(videoCount),
      totalViews: field(totalViews),
      joinedDate: field(joinedDate)
    },

    source: "YouTube public channel page",

    note:
      "البيانات مستخرجة من الصفحة العامة المتاحة. " +
      "قد تختلف البيانات المتاحة حسب إعدادات القناة وواجهة YouTube. " +
      "هذا الفحص لا يثبت هوية القناة أو أصالة محتواها."
  };
}

// ==================================================
// 9. VIDEO VERIFICATION
// ==================================================

async function verifyVideo(url, videoId) {
  const endpoint =
    "https://www.youtube.com/oembed?format=json&url=" +
    encodeURIComponent(url);

  const oembedResponse = await fetchText(endpoint);
  const oembed = await oembedResponse.json();

  let pageData = {};
  let pageHtml = "";

  try {
    const pageResponse = await fetchText(
      "https://www.youtube.com/watch?v=" + videoId
    );

    pageHtml = await pageResponse.text();

    pageData = extractEmbeddedJson(
      pageHtml,
      "ytInitialPlayerResponse"
    ) || {};
  } catch (error) {
    console.warn(
      "VIRIFIXO video page metadata unavailable:",
      error.message
    );
  }

  const details = pageData.videoDetails || {};
  const microformat =
    pageData.microformat?.playerMicroformatRenderer || {};

  const title =
    cleanText(details.title || "") ||
    cleanText(oembed.title || "");

  const channelTitle =
    cleanText(details.author || "") ||
    cleanText(oembed.author_name || "");

  const channelUrl =
    details.channelId
      ? "https://www.youtube.com/channel/" + details.channelId
      : oembed.author_url || "";

  const thumbnail =
    details.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
    oembed.thumbnail_url ||
    "";

  const publishDate =
    microformat.publishDate ||
    microformat.uploadDate ||
    extractMeta(pageHtml, "datePublished");

  return {
    ok: true,
    type: "video",
    version: VERSION,

    videoId,
    title,
    channelTitle,
    channelUrl,
    thumbnailUrl: thumbnail,

    statistics: {
      views: field(details.viewCount),
      durationSeconds: field(details.lengthSeconds),
      publishDate: field(publishDate),
      likes: field(null),
      comments: field(null)
    },

    source: [
      "YouTube oEmbed",
      pageHtml ? "YouTube public video page" : null
    ].filter(Boolean),

    note:
      "هذه بيانات تعريفية وعامة للفيديو. " +
      "لا يمثل توفر البيانات أو تطابقها دليلاً على أصالة الفيديو " +
      "أو عدم التلاعب به. بعض الإحصائيات قد لا تكون متاحة."
  };
}

// ==================================================
// 10. MAIN VERIFICATION API
// ==================================================

app.post("/api/verify", async (req, res) => {
  const body = req.body;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return res.status(400).json({
      ok: false,
      error: "يجب إرسال بيانات طلب صحيحة بصيغة JSON."
    });
  }

  const { type, url } = body;

  if (!["video", "channel"].includes(type)) {
    return res.status(400).json({
      ok: false,
      error: 'نوع الفحص يجب أن يكون "video" أو "channel".'
    });
  }

  try {
    const validated = validateYoutubeUrl(type, url);

    const result = type === "video"
      ? await verifyVideo(
          validated.parsed.toString(),
          validated.videoId
        )
      : await verifyChannel(
          validated.parsed.toString()
        );

    return res.status(200).json(result);

  } catch (error) {
    console.error(
      "VIRIFIXO verification error:",
      error.message
    );

    const status =
      /HTTP 404/.test(error.message) ? 404 :
      /timeout|aborted/i.test(error.message) ? 504 :
      /رابط|URL|تحويل|رفض/i.test(error.message) ? 400 :
      502;

    return res.status(status).json({
      ok: false,
      error: error.message || "تعذر إتمام الفحص."
    });
  }
});

// ==================================================
// 11. ERROR HANDLING
// ==================================================

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "المسار المطلوب غير موجود."
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    "body" in err
  ) {
    return res.status(400).json({
      ok: false,
      error: "صيغة JSON غير صحيحة."
    });
  }

  console.error("VIRIFIXO API error:", err.message);

  return res.status(500).json({
    ok: false,
    error: "حدث خطأ داخلي في الخادم."
  });
});

// ==================================================
// 12. START SERVER
// ==================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    "VIRIFIXO API " + VERSION +
    " listening on port " + PORT
  );
});
