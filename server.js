"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// =====================================
// SERVER STATUS
// =====================================

app.get("/api/status", (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
        name: "Virifixo",
        status: "online",
        version: "3.0",
        uptime: Math.floor(process.uptime())
    });
});

// =====================================
// PARSE YOUTUBE URL
// =====================================

function parseChannelUrl(value) {
    try {
        const url = new URL(value);

        if (![
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com"
        ].includes(url.hostname.toLowerCase())) {
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

// =====================================
// DATE VALIDATION
// =====================================

function formatDate(value) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const timestamp = Date.parse(value);

    if (!Number.isFinite(timestamp)) {
        return null;
    }

    const date = new Date(timestamp);

    if (
        date.getUTCFullYear() < 2005 ||
        date.getTime() > Date.now()
    ) {
        return null;
    }

    return date.toISOString();
}

function formatUnixDate(value) {
    const timestamp = Number(value);

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return null;
    }

    const date = new Date(timestamp * 1000);

    if (
        !Number.isFinite(date.getTime()) ||
        date.getUTCFullYear() < 2005 ||
        date.getTime() > Date.now()
    ) {
        return null;
    }

    return date.toISOString();
}

// =====================================
// SAFE COUNTS
// =====================================

function safeCount(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? String(Math.max(0, number))
        : "0";
}

// =====================================
// FETCH WITH TIMEOUT
// =====================================

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        timeoutMs
    );

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
}

// =====================================
// YOUTUBE API
// =====================================

async function getChannel(channel, apiKey) {
    const params = new URLSearchParams({
        part: "snippet,statistics",
        [channel.type === "handle" ? "forHandle" : "id"]:
            channel.value
    });

    const response = await fetchWithTimeout(
        `https://www.googleapis.com/youtube/v3/channels?${params}`,
        {
            method: "GET",
            headers: {
                "x-goog-api-key": apiKey
            }
        },
        15000
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
}

// =====================================
// INVIDIOUS DATE SOURCE
// =====================================

async function getInvidiousJoinedDate(channelId) {
    const instances = [
        "https://inv.nadeko.net",
        "https://invidious.nerdvpn.de",
        "https://yt.chocolatemoo53.com",
        "https://invidious.tiekoetter.com"
    ];

    const results = await Promise.allSettled(
        instances.map(async (base) => {
            const response = await fetchWithTimeout(
                `${base}/api/v1/channels/${encodeURIComponent(channelId)}`,
                {
                    headers: {
                        "Accept": "application/json",
                        "User-Agent": "Virifixo/3.0"
                    }
                },
                8000
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const date = formatUnixDate(data.joined);

            if (!date) {
                throw new Error("Date unavailable");
            }

            return date;
        })
    );

    for (const result of results) {
        if (result.status === "fulfilled") {
            return result.value;
        }
    }

    return null;
}

// =====================================
// YOUTUBE ABOUT DATE EXTRACTION
// =====================================

function extractJoinedDate(html) {
    if (typeof html !== "string" || !html) {
        return null;
    }

    const patterns = [
        /"content":"Joined ([A-Za-z]+\s+\d{1,2},?\s+\d{4})"/i,
        /"simpleText":"Joined ([A-Za-z]+\s+\d{1,2},?\s+\d{4})"/i,
        /Joined\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);

        if (match) {
            const date = formatDate(match[1]);

            if (date) {
                return date;
            }
        }
    }

    return null;
}

async function getChannelCreationDate(channel) {
    const url = channel.type === "handle"
        ? `https://www.youtube.com/@${encodeURIComponent(channel.value)}/about`
        : `https://www.youtube.com/channel/${channel.value}/about`;

    try {
        const response = await fetchWithTimeout(
            url,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9"
                }
            },
            12000
        );

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        return extractJoinedDate(html);

    } catch (error) {
        console.error("ABOUT ERROR:", error.message);
        return null;
    }
}

// =====================================
// RESOLVE CREATION DATE
// =====================================

async function resolveCreationDate(item, channel) {
    // Source 1: YouTube API
    let date = formatDate(item.snippet?.publishedAt);

    if (date) {
        return {
            publishedAt: date,
            dateSource: "youtube_api"
        };
    }

    console.log("YouTube API date unavailable.");

    // Source 2: Invidious
    try {
        date = await getInvidiousJoinedDate(item.id);

        if (date) {
            return {
                publishedAt: date,
                dateSource: "invidious"
            };
        }
    } catch (error) {
        console.error("INVIDIOUS ERROR:", error.message);
    }

    // Source 3: YouTube About
    try {
        date = await getChannelCreationDate(channel);

        if (date) {
            return {
                publishedAt: date,
                dateSource: "youtube_about"
            };
        }
    } catch (error) {
        console.error("YOUTUBE ABOUT ERROR:", error.message);
    }

    return {
        publishedAt: null,
        dateSource: null
    };
}

// =====================================
// VERIFY CHANNEL
// =====================================

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

        const dateResult = await resolveCreationDate(
            item,
            channel
        );

        console.log("VIRIFIXO DATE CHECK:", {
            channel: snippet.title,
            originalDate: snippet.publishedAt,
            correctedDate: dateResult.publishedAt,
            dateSource: dateResult.dateSource
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

            publishedAt: dateResult.publishedAt,

            createdDate: dateResult.publishedAt,

            dateSource: dateResult.dateSource,

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

// =====================================
// INVALID JSON HANDLING
// =====================================

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

// =====================================
// START SERVER
// =====================================

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Virifixo running on port ${PORT}`);
});

// =====================================
// GRACEFUL SHUTDOWN
// =====================================

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
