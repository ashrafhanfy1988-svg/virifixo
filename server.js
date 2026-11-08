"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Server status
app.get("/api/status", (req, res) => {
  res.set("Cache-Control", "no-store");

  res.json({
    name: "Virifixo",
    status: "online",
    version: "3.0",
    uptime: Math.floor(process.uptime())
  });
});

// Parse YouTube channel URL
function parseChannelUrl(value) {
  try {
    const url = new URL(value);

    if (
      ![
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com"
      ].includes(url.hostname.toLowerCase())
    ) {
      return null;
    }

    const handle = url.pathname.match(
      /^\/@([a-zA-Z0-9._-]+)\/?$/
    );

    if (handle) {
      return {
        type: "handle",
        value: handle[1]
      };
    }

    const id = url.pathname.match(
      /^\/channel\/(UC[a-zA-Z0-9_-]{22})\/?$/
    );

    if (id) {
      return {
        type: "id",
        value: id[1]
      };
    }

    return null;

  } catch {
    return null;
  }
}

// Validate YouTube published date
function formatDate(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const date = new Date(timestamp);

  if (
    date.getTime() <= 0 ||
    date.getUTCFullYear() < 2005
  ) {
    return null;
  }

  return date.toISOString();
}

// Safe statistics
function safeCount(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? String(Math.max(0, number))
    : "0";
}

// Get YouTube channel
async function getChannel(channel, apiKey) {
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
        data.error?.message || "YouTube API error"
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

    if (!channelUrl || channelUrl.length > 300) {
      return res.status(400).json({
        success: false,
        message: "Invalid channel URL."
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
        message: "Channel not found."
      });
    }

    const snippet = item.snippet || {};
    const stats = item.statistics || {};

    // Read original YouTube creation date
    const rawDate = snippet.publishedAt;

    // Validate original date without converting invalid values
    const publishedAt = formatDate(rawDate);

    // Diagnostic logs
    console.log("VIRIFIXO DATE CHECK:", {
      channel: snippet.title,
      originalDate: rawDate,
      correctedDate: publishedAt
    });

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
      "Virifixo verification error:",
      error.message
    );

    if (error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        message: "YouTube request timed out."
      });
    }

    if (error.status === 403) {
      return res.status(502).json({
        success: false,
        message: "YouTube API quota or access error."
      });
    }

    return res.status(502).json({
      success: false,
      message: "Unable to retrieve channel information."
    });
  }
});

// Invalid JSON handling
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON."
    });
  }

  console.error("Server error:", err.message);

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
  console.log(`${signal} received.`);

  server.close(() => {
    console.log("Server stopped.");
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
