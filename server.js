
"use strict";

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const API_TIMEOUT = 15000;

app.disable("x-powered-by");

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Server status
app.get("/api/status", (req, res) => {
  res.set("Cache-Control", "no-store");

  res.json({
    name: "Virifixo",
    status: "online",
    version: "2.1",
    uptime: Math.floor(process.uptime())
  });
});

// Parse YouTube channel URL
function parseChannelUrl(value) {
  try {
    const url = new URL(value);

    const hostname = url.hostname.toLowerCase();

    if (
      ![
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com"
      ].includes(hostname)
    ) {
      return null;
    }

    const handleMatch = url.pathname.match(
      /^\/@([a-zA-Z0-9._-]+)\/?$/
    );

    if (handleMatch) {
      return {
        type: "handle",
        value: handleMatch[1]
      };
    }

    const channelMatch = url.pathname.match(
      /^\/channel\/(UC[a-zA-Z0-9_-]{22})\/?$/
    );

    if (channelMatch) {
      return {
        type: "id",
        value: channelMatch[1]
      };
    }

    return null;
  } catch {
    return null;
  }
}

// Safe number conversion
function safeCount(value) {
  if (value === undefined || value === null) {
    return "0";
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? String(Math.max(0, number))
    : "0";
}

// Format channel creation date
function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime()) ||
    date.getTime() <= 0
  ) {
    return null;
  }

  return date.toISOString();
}

// YouTube API request
async function getChannel(channel, apiKey) {
  const params = new URLSearchParams({
    part: "snippet,statistics",
    [channel.type === "handle" ? "forHandle" : "id"]:
      channel.value
  });

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    API_TIMEOUT
  );

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params}`,
      {
        method: "GET",
        headers: {
          "x-goog-api-key": apiKey
        },
        signal: controller.signal
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(
        data.error?.message || "YouTube API request failed"
      );

      error.status = response.status;
      throw error;
    }

    return data.items?.[0] || null;

  } finally {
    clearTimeout(timeout);
  }
}

// Verify channel
app.post("/api/verify", async (req, res) => {
  try {
    const channelUrl = String(
      req.body?.channel || ""
    ).trim();

    if (!channelUrl) {
      return res.status(400).json({
        success: false,
        message: "Please enter a YouTube channel URL."
      });
    }

    if (channelUrl.length > 300) {
      return res.status(400).json({
        success: false,
        message: "Channel URL is too long."
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

    const item = await getChannel(channel, apiKey);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "YouTube channel not found."
      });
    }

    const snippet = item.snippet || {};
    const stats = item.statistics || {};

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

      publishedAt: formatDate(snippet.publishedAt),

      country: snippet.country || null,

      subscribers: stats.hiddenSubscriberCount
        ? null
        : safeCount(stats.subscriberCount),

      subscriberCountHidden: Boolean(
        stats.hiddenSubscriberCount
      ),

      videoCount: safeCount(stats.videoCount),

      viewCount: safeCount(stats.viewCount),

      channelUrl:
        `https://www.youtube.com/channel/${item.id}`
    };

    res.set("Cache-Control", "no-store");

    return res.json({
      success: true,
      message: `Channel found: ${result.title}`,
      channel: result
    });

  } catch (error) {
    console.error(
      "Verification error:",
      error.message
    );

    if (error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        message: "YouTube request timed out. Please try again."
      });
    }

    if (error.status === 403) {
      return res.status(502).json({
        success: false,
        message: "YouTube API access or quota error."
      });
    }

    return res.status(502).json({
      success: false,
      message: "Unable to retrieve channel information."
    });
  }
});

// Handle invalid JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request."
    });
  }

  console.error("Server middleware error:", err.message);

  res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Virifixo running on port ${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`${signal} received. Closing server...`);

  server.close(() => {
    console.log("Virifixo server stopped.");
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
