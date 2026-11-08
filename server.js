
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Server status
app.get("/api/status", (req, res) => {
  res.json({
    name: "Virifixo",
    status: "online",
    version: "2.0"
  });
});

// Extract YouTube channel identifier
function parseChannelUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();

  if (
    !["youtube.com", "www.youtube.com", "m.youtube.com"]
      .includes(hostname)
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
    /^\/channel\/(UC[a-zA-Z0-9_-]+)\/?$/
  );

  if (channelMatch) {
    return {
      type: "id",
      value: channelMatch[1]
    };
  }

  return null;
}

// Verify and retrieve real channel information
app.post("/api/verify", async (req, res) => {
  try {
    const channelUrl = String(req.body.channel || "").trim();

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
        message:
          "Invalid channel URL. Use a YouTube @handle or /channel/UC... URL."
      });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: "YouTube API is not configured on the server."
      });
    }

    const params = new URLSearchParams({
      part: "snippet,statistics",
      [channel.type === "handle" ? "forHandle" : "id"]:
        channel.value
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params}`,
      {
        headers: {
          "x-goog-api-key": apiKey
        },
        signal: AbortSignal.timeout(15000)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason;

      console.error("YouTube API error:", reason || response.status);

      if (response.status === 403) {
        return res.status(502).json({
          success: false,
          message:
            "YouTube API access failed. Check your API key, restrictions and quota."
        });
      }

      return res.status(502).json({
        success: false,
        message: "Unable to retrieve YouTube channel information."
      });
    }

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({
        success: false,
        message: "YouTube channel not found."
      });
    }

    const item = data.items[0];
    const snippet = item.snippet;
    const stats = item.statistics;

    const result = {
      channelId: item.id,
      title: snippet.title,
      description: snippet.description,
      thumbnail:
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.default?.url ||
        null,
      customUrl: snippet.customUrl || null,
      publishedAt: snippet.publishedAt,
      country: snippet.country || null,
      subscribers: stats.hiddenSubscriberCount
        ? null
        : stats.subscriberCount || null,
      subscriberCountHidden: Boolean(stats.hiddenSubscriberCount),
      videoCount: stats.videoCount || "0",
      viewCount: stats.viewCount || "0",
      channelUrl: `https://www.youtube.com/channel/${item.id}`
    };

    return res.json({
      success: true,
      message: `Channel found: ${result.title}`,
      channel: result
    });

  } catch (error) {
    console.error("Verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: "An unexpected server error occurred. Please try again."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Virifixo running on port ${PORT}`);
});
