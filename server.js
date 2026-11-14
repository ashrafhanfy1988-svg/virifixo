"use strict";

const express = require("express");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Only the official GitHub Pages frontend may read API responses in browsers.
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
    if (!origin || !allowedOrigins.has(origin)) {
      return res.sendStatus(403);
    }
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "10kb", strict: true }));

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "VIRIFIXO API",
    status: "running"
  });
});

app.post("/api/verify", (req, res) => {
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
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

  if (typeof url !== "string" || url.length > 2048) {
    return res.status(400).json({
      ok: false,
      error: "رابط YouTube مطلوب ويجب ألا يتجاوز 2048 حرفاً."
    });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({
      ok: false,
      error: "الرابط غير صالح."
    });
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const allowedHosts = new Set([
    "youtube.com",
    "m.youtube.com",
    "youtu.be",
    "youtube-nocookie.com"
  ]);

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !allowedHosts.has(hostname)
  ) {
    return res.status(400).json({
      ok: false,
      error: "يرجى إدخال رابط YouTube آمن وصحيح."
    });
  }

  // Deliberately do not fabricate verification results.
  // A trusted YouTube data/verification integration must be configured first.
  return res.status(501).json({
    ok: false,
    code: "YOUTUBE_INTEGRATION_NOT_CONFIGURED",
    error: "خدمة تحليل YouTube لم تُفعّل بعد. الخادم يعمل، لكن يلزم ربط مصدر بيانات رسمي قبل عرض نتائج الفحص."
  });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "المسار المطلوب غير موجود."
  });
});

// Return JSON for malformed JSON bodies and unexpected server errors.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`VIRIFIXO API listening on port ${PORT}`);
});
