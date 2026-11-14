"use strict";

const express = require("express");

const app = express();
const PORT = Number(process.env.PORT) || 10000;

const allowedOrigins = new Set([
  "https://ashrafhanfy1988-svg.github.io"
]);

app.disable("x-powered-by");

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    if (!origin || !allowedOrigins.has(origin)) return res.sendStatus(403);
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "10kb", strict: true }));

app.get("/", (req, res) => {
  res.status(200).json({ service: "VIRIFIXO API", status: "running", version: "4.3" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, service: "VIRIFIXO API", status: "running", version: "4.3" });
});

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function getTagAttribute(tag, attribute) {
  const match = tag.match(new RegExp("\\b" + attribute + "\\s*=\\s*(['\"])(.*?)\\1", "i"));
  return match ? decodeHtml(match[2]) : "";
}

function extractMeta(html, wanted) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = getTagAttribute(tag, "property") || getTagAttribute(tag, "name") ||
                getTagAttribute(tag, "itemprop");
    if (key.toLowerCase() === wanted.toLowerCase()) {
      return getTagAttribute(tag, "content");
    }
  }
  return "";
}

function validateYoutubeUrl(type, value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("رابط YouTube مطلوب ويجب ألا يتجاوز 2048 حرفاً.");
  }
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new Error("الرابط غير صالح."); }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const hosts = new Set(["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"]);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !hosts.has(host)) {
    throw new Error("يرجى إدخال رابط YouTube آمن وصحيح.");
  }

  const path = parsed.pathname;
  if (type === "video") {
    const valid = (host === "youtu.be" && path.length > 1) ||
      (["/watch", "/shorts/", "/embed/", "/live/"].some(prefix =>
        prefix.endsWith("/") ? path.startsWith(prefix) && path.length > prefix.length : path === prefix
      ) && (path !== "/watch" || Boolean(parsed.searchParams.get("v"))));
    if (!valid) throw new Error("أدخل رابط فيديو YouTube صالحاً.");
    return parsed;
  }

  const validChannel = host !== "youtu.be" &&
    (/^\/@[^/]+/.test(path) || /^\/channel\/[^/]+/.test(path) ||
     /^\/user\/[^/]+/.test(path) || /^\/c\/[^/]+/.test(path));
  if (!validChannel) throw new Error("أدخل رابط قناة YouTube صالحاً مثل youtube.com/@اسم_القناة.");
  return parsed;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; VIRIFIXO/4.3; +https://github.com/ashrafhanfy1988-svg/virifixo)",
      "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(15000),
    redirect: "follow"
  });
  if (!response.ok) throw new Error("تعذر جلب بيانات YouTube (HTTP " + response.status + ").");
  return response;
}

async function verifyVideo(url) {
  const parsed = new URL(url);
  let videoId = "";
  if (parsed.hostname.replace(/^www\./, "") === "youtu.be") videoId = parsed.pathname.slice(1).split("/")[0];
  else if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
  else videoId = parsed.pathname.split("/").filter(Boolean).pop() || "";

  const endpoint = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url);
  const response = await fetchText(endpoint);
  const data = await response.json();

  return {
    ok: true,
    type: "video",
    videoId,
    title: data.title || "",
    channelTitle: data.author_name || "",
    channelUrl: data.author_url || "",
    thumbnailUrl: data.thumbnail_url || "",
    source: "YouTube oEmbed public metadata",
    note: "هذه بيانات تعريفية عامة للفيديو وليست حكماً على أصالته أو عدم التلاعب به."
  };
}

async function verifyChannel(url) {
  const response = await fetchText(url);
  const html = await response.text();

  const title = extractMeta(html, "og:title") ||
                extractMeta(html, "title") ||
                extractMeta(html, "twitter:title");
  const description = extractMeta(html, "og:description") ||
                      extractMeta(html, "description");
  const image = extractMeta(html, "og:image");
  const canonicalMatch = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i);
  const canonical = canonicalMatch ? getTagAttribute(canonicalMatch[0], "href") : url;
  const idMatch = html.match(/"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]+)"/) ||
                  html.match(/"externalId"\s*:\s*"(UC[a-zA-Z0-9_-]+)"/);

  if (!title && !description) {
    throw new Error("لم نتمكن من قراءة بيانات القناة العامة. قد تكون الصفحة محجوبة مؤقتاً أو تغيّر تنسيق YouTube.");
  }

  return {
    ok: true,
    type: "channel",
    title,
    channelTitle: title,
    channelId: idMatch ? idMatch[1] : "",
    description,
    thumbnailUrl: image,
    channelUrl: canonical,
    source: "YouTube public channel page metadata",
    note: "تم جلب البيانات العامة الظاهرة فقط؛ لا تمثل هذه البيانات توثيقاً لهوية القناة أو حكماً على محتواها."
  };
}

app.post("/api/verify", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: "يجب إرسال بيانات طلب صحيحة بصيغة JSON." });
  }
  const { type, url } = body;
  if (!["video", "channel"].includes(type)) {
    return res.status(400).json({ ok: false, error: 'نوع الفحص يجب أن يكون "video" أو "channel".' });
  }

  try {
    const parsed = validateYoutubeUrl(type, url);
    const result = type === "video"
      ? await verifyVideo(parsed.toString())
      : await verifyChannel(parsed.toString());
    return res.status(200).json(result);
  } catch (error) {
    console.error("VIRIFIXO verification error:", error.message);
    const upstream = /HTTP 404/.test(error.message) ? 404 :
                     /timeout|aborted/i.test(error.message) ? 504 : 502;
    return res.status(upstream).json({ ok: false, error: error.message || "تعذر إتمام الفحص." });
  }
});

app.use((req, res) => res.status(404).json({ ok: false, error: "المسار المطلوب غير موجود." }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ ok: false, error: "صيغة JSON غير صحيحة." });
  }
  console.error("VIRIFIXO API error:", err.message);
  return res.status(500).json({ ok: false, error: "حدث خطأ داخلي في الخادم." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("VIRIFIXO API 4.3 listening on port " + PORT);
});
