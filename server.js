
"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
  res.json({
    name: "Virifixo",
    status: "online",
    version: "2.2",
    uptime: Math.floor(process.uptime())
  });
});

function parseChannelUrl(value) {
  try {
    const url = new URL(value);

    if (
      !["youtube.com", "www.youtube.com", "m.youtube.com"]
        .includes(url.hostname.toLowerCase())
    ) {
      return null;
    }

    const handle = url.pathname.match(
      /^\/@([a-zA-Z0-9._-]+)\/?$/
    );

    if (handle) {
      return { type: "handle", value: handle[1] };
    }

    const id = url.pathname.match(
      /^\/channel\/(UC[a-zA-Z0-9_-]{22})\/?$/
    );

    if (id) {
      return { type: "id", value: id[1] };
    }

    return null;
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

app.post("/api/verify", async (req, res) => {
  try {
    const channelUrl = String(req.body?.channel || "").trim();

    if (!channelUrl) {
      return res.status(400).json({
        success: false,
        message: "Please enter a YouTube channel URL."
      });
    }

    const channel = parseChannelUrl(channelUrl);

    if (!channel) {
      return res.status(400).json({
        success: false,
        message: "Invalid YouTube channel URL."
      });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: "YouTube API is not configured."
      });
    }

    const params = new URLSearchParams({
      part: "snippet,statistics",
      [channel.type === "handle" ? "forHandle" : "id"]:
        channel.value
    });

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      15000
    );

    let response;

    try {
      response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?${params}`,
        {
          headers: {
            "x-goog-api-key": apiKey
          },
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("YouTube API:", data.error?.message);

      return res.status(502).json({
        success: false,
        message: "YouTube API request failed."
      });
    }

    const item = data.items?.[0];

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Channel not found."
      });
    }

    const snippet = item.snippet || {};
    const stats = item.statistics || {};

    const publishedAt = formatDate(snippet.publishedAt);

    const result = {
      channelId: item.id,
      title: snippet.title || "Unknown Channel",
      description: snippet.description || "",

      thumbnail:
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.medium?.url ||
        snippet.thumbnails?.default?.url ||
        null,

      customUrl: snippet.customUrl || null,

      publishedAt: publishedAt,
      createdDate: publishedAt,

      country: snippet.country || null,

      subscribers: stats.hiddenSubscriberCount
        ? null
        : stats.subscriberCount || "0",

      subscriberCountHidden: Boolean(
        stats.hiddenSubscriberCount
      ),

      videoCount: stats.videoCount || "0",
      viewCount: stats.viewCount || "0",

      channelUrl:
        `https://www.youtube.com/channel/${item.id}`
    };

    return res.json({
      success: true,
      message: `Channel found: ${result.title}`,
      channel: result
    });

  } catch (error) {
    console.error("Verification error:", error.message);

    return res.status(
      error.name === "AbortError" ? 504 : 500
    ).json({
      success: false,
      message: error.name === "AbortError"
        ? "YouTube request timed out."
        : "Unexpected server error."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Virifixo running on port ${PORT}`);
});
