
"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// VERIFIED CHANNEL DATE DATABASE
// ==========================================

const VERIFIED_DATES = {
    "UCBR8-60-B28hp2BmDPdntcQ": "2005-10-05T00:00:00.000Z"
};

// ==========================================
// SERVER STATUS
// ==========================================

app.get("/api/status", (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
        name: "Virifixo",
        status: "online",
        version: "3.2",
        uptime: Math.floor(process.uptime())
    });
});

// ==========================================
// PARSE YOUTUBE CHANNEL URL
// ==========================================

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

// ==========================================
// DATE VALIDATION
// ==========================================

function validateDate(value) {
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
        date.getUTCFullYear() < 2005 ||
        date.getTime() > Date.now()
    ) {
        return null;
    }

    return date.toISOString();
}

function validateUnixDate(value) {
    const timestamp = Number(value);

    if (
        !Number.isFinite(timestamp) ||
        timestamp <= 0
    ) {
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

// ==========================================
// SAFE STATISTICS
// ==========================================

function safeCount(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? String(Math.max(0, number))
        : "0";
}

// ==========================================
// FETCH WITH TIMEOUT
// ==========================================

async function fetchWithTimeout(
    url,
    options = {},
    timeoutMs = 10000
) {
    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        timeoutMs
    );

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

// ==========================================
// YOUTUBE API
// ==========================================

async function getChannel(channel, apiKey) {
    const params = new URLSearchParams({
        part: "snippet,statistics",
        [channel.type === "handle" ? "forHandle" : "id"]:
            channel.value
    });

    const response = await fetchWithTimeout(
        `https://www.googleapis.com/youtube/v3/channels?${params}`,
        {
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

// ==========================================
// INVIDIOUS FALLBACK
// ==========================================

async function getInvidiousDate(channelId) {
    const instances = [
        "https://inv.nadeko.net",
        "https://invidious.nerdvpn.de",
        "https://invidious.tiekoetter.com"
    ];

    for (const base of instances) {
        try {
            const response = await fetchWithTimeout(
                `${base}/api/v1/channels/${encodeURIComponent(channelId)}`,
                {
                    headers: {
                        "Accept": "application/json",
                        "User-Agent": "Virifixo/3.2"
                    }
                },
                7000
            );

            if (!response.ok) {
                continue;
            }

            const data = await response.json();

            const date = validateUnixDate(data.joined);

            if (date) {
                return date;
            }
        } catch (error) {
            console.log(
                "INVIDIOUS ERROR:",
                error.message
            );
        }
    }

    return null;
}

// ==========================================
// YOUTUBE ABOUT FALLBACK
// ==========================================

function extractAboutDate(html) {
    if (!html) {
        return null;
    }

    const patterns = [
        /"content"\s*:\s*"Joined ([A-Za-z]+\s+\d{1,2},?\s+\d{4})"/i,
        /Joined\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);

        if (match) {
            const date = validateDate(match[1]);

            if (date) {
                return date;
            }
        }
    }

    return null;
}

async function getYouTubeAboutDate(channel) {
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

        return extractAboutDate(html);

    } catch (error) {
        console.log(
            "YOUTUBE ABOUT ERROR:",
            error.message
        );

        return null;
    }
}

// ==========================================
// DATE RESOLUTION
// ==========================================

async function resolveCreationDate(item, channel) {
    const channelId = item.id;

    // Source 1: Verified database
    if (VERIFIED_DATES[channelId]) {
        return {
            publishedAt: VERIFIED_DATES[channelId],
            dateSource: "verified_database"
        };
    }

    // Source 2: YouTube API
    const apiDate = validateDate(
        item.snippet?.publishedAt
    );

    if (apiDate) {
        return {
            publishedAt: apiDate,
            dateSource: "youtube_api"
        };
    }

    // Source 3: Invidious
    const invidiousDate =
        await getInvidiousDate(channelId);

    if (invidiousDate) {
        return {
            publishedAt: invidiousDate,
            dateSource: "invidious"
        };
    }

    // Source 4: YouTube About
    const aboutDate =
        await getYouTubeAboutDate(channel);

    if (aboutDate) {
        return {
            publishedAt: aboutDate,
            dateSource: "youtube_about"
        };
    }

    return {
        publishedAt: null,
        dateSource: null
    };
}

// ==========================================
// VERIFY CHANNEL
// ==========================================

app.post("/api/verify", async (req, res) => {
    try {
        const channelUrl = String(
            req.body?.channel || ""
        ).trim();

        if (
            !channelUrl ||
            channelUrl.length > 300
        ) {
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

        const item = await getChannel(
            channel,
            apiKey
        );

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
            channelId: item.id,
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
            "VIRIFIXO ERROR:",
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

// ==========================================
// INVALID JSON
// ==========================================

app.use((err, req, res, next) => {
    if (
        err instanceof SyntaxError &&
        err.status === 400
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid JSON."
        });
    }

    console.error(
        "SERVER ERROR:",
        err.message
    );

    res.status(500).json({
        success: false,
        message: "Internal server error."
    });
});

// ==========================================
// START SERVER
// ==========================================

const server = app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Virifixo running on port ${PORT}`
        );
    }
);

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

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
