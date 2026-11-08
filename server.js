
"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// SERVER STATUS
// ==========================================

app.get("/api/status", (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
        name: "Virifixo",
        status: "online",
        version: "3.0",
        uptime: Math.floor(process.uptime())
    });
});


// ==========================================
// PARSE YOUTUBE CHANNEL URL
// ==========================================

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


// ==========================================
// VALIDATE AND FORMAT DATE
// ==========================================

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
// GET YOUTUBE CHANNEL FROM API
// ==========================================

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


// ==========================================
// EXTRACT JOINED DATE FROM YOUTUBE PAGE
// FALLBACK SYSTEM
// ==========================================

function extractJoinedDate(html) {

    if (
        typeof html !== "string" ||
        !html
    ) {
        return null;
    }

    const patterns = [

        /"joinedDateText"\s*:\s*\{[^}]{0,500}?"simpleText"\s*:\s*"((?:\\.|[^"\\])*)"/s,

        /"joinedDateText"\s*:\s*\{[^}]{0,500}?"content"\s*:\s*"((?:\\.|[^"\\])*)"/s,

        /"joinedDateText"\s*:\s*"((?:\\.|[^"\\])*)"/s

    ];

    for (const pattern of patterns) {

        const match = html.match(pattern);

        if (!match) {
            continue;
        }

        let joinedText;

        try {

            joinedText = JSON.parse(
                `"${match[1]}"`
            );

        } catch {

            joinedText = match[1];

        }

        if (typeof joinedText !== "string") {
            continue;
        }

        // Example: Joined Oct 5, 2005

        const cleanedDate = joinedText
            .replace(/^Joined\s*/i, "")
            .trim();

        const timestamp = Date.parse(cleanedDate);

        if (!Number.isFinite(timestamp)) {
            continue;
        }

        const date = new Date(timestamp);

        if (
            date.getUTCFullYear() >= 2005 &&
            date.getTime() <= Date.now()
        ) {
            return date.toISOString();
        }
    }

    return null;
}


// ==========================================
// GET CHANNEL CREATION DATE FROM ABOUT PAGE
// ==========================================

async function getChannelCreationDate(channel) {

    let aboutUrl;

    if (channel.type === "handle") {

        aboutUrl =
            `https://www.youtube.com/@${encodeURIComponent(channel.value)}/about`;

    } else {

        aboutUrl =
            `https://www.youtube.com/channel/${channel.value}/about`;

    }

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        12000
    );

    try {

        console.log(
            "VIRIFIXO: Trying YouTube About date fallback..."
        );

        const response = await fetch(
            aboutUrl,
            {
                method: "GET",

                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",

                    "Accept":
                        "text/html,application/xhtml+xml",

                    "Accept-Language":
                        "en-US,en;q=0.9"
                },

                signal: controller.signal
            }
        );

        if (!response.ok) {

            console.log(
                "VIRIFIXO: About page unavailable:",
                response.status
            );

            return null;
        }

        const html = await response.text();

        const joinedDate = extractJoinedDate(html);

        console.log(
            "VIRIFIXO FALLBACK DATE:",
            joinedDate
        );

        return joinedDate;

    } catch (error) {

        console.error(
            "VIRIFIXO FALLBACK ERROR:",
            error.message
        );

        return null;

    } finally {

        clearTimeout(timeout);

    }
}


// ==========================================
// VERIFY CHANNEL
// ==========================================

app.post("/api/verify", async (req, res) => {

    try {

        const channelUrl = String(
            req.body?.channel || ""
        ).trim();


        // Validate input

        if (
            !channelUrl ||
            channelUrl.length > 300
        ) {

            return res.status(400).json({
                success: false,
                message: "Invalid channel URL."
            });

        }


        // Parse channel URL

        const channel = parseChannelUrl(channelUrl);

        if (!channel) {

            return res.status(400).json({
                success: false,
                message: "Invalid YouTube channel URL."
            });

        }


        // API key

        const apiKey = process.env.YOUTUBE_API_KEY;

        if (!apiKey) {

            return res.status(503).json({
                success: false,
                message: "YouTube API is not configured."
            });

        }


        // Retrieve channel

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


        // ======================================
        // CHANNEL CREATION DATE
        // ======================================

        const rawDate = snippet.publishedAt;

        // First attempt: YouTube Data API

        let publishedAt = formatDate(rawDate);

        let dateSource = publishedAt
            ? "youtube_api"
            : null;


        // Second attempt: YouTube About page

        if (!publishedAt) {

            console.log(
                "VIRIFIXO: API date invalid. Trying fallback."
            );

            const fallbackDate =
                await getChannelCreationDate(channel);

            publishedAt = formatDate(fallbackDate);

            if (publishedAt) {
                dateSource = "youtube_about";
            }

        }


        // Diagnostic logs

        console.log("VIRIFIXO DATE CHECK:", {

            channel: snippet.title,

            originalDate: rawDate,

            correctedDate: publishedAt,

            dateSource: dateSource

        });


        // ======================================
        // CHANNEL RESULT
        // ======================================

        const result = {

            channelId: item.id,

            title:
                snippet.title || "Unknown Channel",

            description:
                snippet.description || "",


            thumbnail:
                snippet.thumbnails?.high?.url ||
                snippet.thumbnails?.medium?.url ||
                snippet.thumbnails?.default?.url ||
                null,


            customUrl:
                snippet.customUrl || null,


            publishedAt: publishedAt,

            createdDate: publishedAt,

            dateSource: dateSource,


            country:
                snippet.country || null,


            subscribers: stats.hiddenSubscriberCount
                ? null
                : safeCount(stats.subscriberCount),


            subscriberCountHidden: Boolean(
                stats.hiddenSubscriberCount
            ),


            videoCount:
                safeCount(stats.videoCount),


            viewCount:
                safeCount(stats.viewCount),


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


// ==========================================
// INVALID JSON HANDLING
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
        "Server error:",
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
