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
طريقة التحديث على Render
افتح مستودع GitHub الخاص بك: ashrafhanfy1988-svg/virifixo.

افتح ملف server.js.

اضغط Edit.

استبدل الملف كاملاً بالكود أعلاه.

اضغط Commit changes.

انتظر حتى ينتهي Render من النشر وتظهر حالة Live.

بعد النشر اختبر هذه القناة:

قناة YouTube الرسمية

https://www.youtube.com/@YouTube

المفترض أن يظهر تاريخ الإنشاء إذا نجح استخراج تاريخ Joined من صفحة About.

كيف نعرف أن التعديل نجح؟
في Render Logs ابحث عن:


text
VIRIFIXO: API date invalid. Trying fallback.
VIRIFIXO FALLBACK DATE: 2005-10-05T00:00:00.000Z
هذا مثال على النتيجة المطلوبة، وليس نتيجة اختبار فعلية حتى الآن.

ملاحظة تقنية: استخراج تاريخ About يعتمد على بنية صفحة YouTube، وقد يتعذر إذا منعت YouTube طلب السيرفر أو غيّرت الصفحة. الكود لا يختلق تاريخاً عند فشل المحاولة.

بعد النشر أرسل لي سجل VIRIFIXO DATE CHECK الجديد، وسنتأكد من ظهور التاريخ قبل إجراء أي تعديل آخر على الواجهة.



ما بيستخرج التاريج طالع فاضي

Worked for 13s
فهمت. الآن أصبح واضحاً أن نظام استخراج التاريخ الاحتياطي لم ينجح في قراءة صفحة YouTube.

المشكلة على الأغلب في طريقة تحليل صفحة About؛ لأن YouTube يغيّر بنية البيانات داخل الصفحة، والكود السابق كان يعتمد على أنماط محدودة.

سنصلح server.js مباشرة، ولن نلمس تصميم الموقع.

1. استبدل دالة extractJoinedDate بالكامل
احذف الدالة القديمة وضع هذه مكانها:


javascript

function extractJoinedDate(html) {
    if (typeof html !== "string" || !html) {
        return null;
    }

    function collectStrings(value, output = []) {
        if (typeof value === "string") {
            output.push(value);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                collectStrings(item, output);
            }
        } else if (value && typeof value === "object") {
            for (const item of Object.values(value)) {
                collectStrings(item, output);
            }
        }

        return output;
    }

    function parseJoinedText(value) {
        if (typeof value !== "string") return null;

        const match = value.match(
            /Joined\s+(.+?)(?=$|\s{2,})/i
        );

        if (!match) return null;

        const timestamp = Date.parse(match[1].trim());

        if (!Number.isFinite(timestamp)) return null;

        const date = new Date(timestamp);

        if (
            date.getUTCFullYear() < 2005 ||
            date.getTime() > Date.now()
        ) {
            return null;
        }

        return date.toISOString();
    }

    // Find joinedDateText in YouTube page data
    const marker = '"joinedDateText"';
    let position = 0;

    while (true) {
        const index = html.indexOf(marker, position);

        if (index === -1) break;

        position = index + marker.length;

        const start = html.indexOf("{", position);

        if (start === -1 || start - position > 30) {
            continue;
        }

        // Extract the complete JSON object safely
        let depth = 0;
        let inString = false;
        let escaped = false;
        let end = -1;

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
                    end = i + 1;
                    break;
                }
            }
        }

        if (end === -1) continue;

        try {
            const object = JSON.parse(
                html.slice(start, end)
            );

            const strings = collectStrings(object);

            for (const value of strings) {
                const date = parseJoinedText(value);

                if (date) return date;
            }
        } catch (error) {
            console.log(
                "VIRIFIXO JSON PARSE ERROR:",
                error.message
            );
        }
    }

    return null;
}
2. أضف تشخيصاً داخل getChannelCreationDate
بعد هذا السطر:


javascript
const html = await response.text();
أضف:


javascript
console.log("ABOUT PAGE STATUS:", response.status);
console.log("ABOUT PAGE LENGTH:", html.length);
console.log(
    "JOINED DATE FOUND:",
    html.includes("joinedDateText")
);
3. احفظ التعديلات
افتح GitHub.

ادخل إلى ashrafhanfy1988-svg/virifixo.

افتح server.js.

عدّل الدالة واحفظ.

انتظر Render حتى يظهر Live.

4. أرسل لي هذه النتائج من Render Logs

text
ABOUT PAGE STATUS:
ABOUT PAGE LENGTH:
JOINED DATE FOUND:
VIRIFIXO FALLBACK DATE:
مهم: لا أريد أن نضع تاريخ 2005 يدوياً أو نعرض تاريخاً غير مؤكد. نريد أن يستخرج Virifixo تاريخ كل قناة من بياناتها الفعلية، وإذا رفض YouTube إتاحة التاريخ سنعرف ذلك بدلاً من اختلاقه.


ارسل الكود في السيرفير كاملا

أكيد. هذا ملف server.js كاملاً بعد تحديث نظام استخراج تاريخ إنشاء قناة YouTube، مع الحفاظ على وظائف Virifixo الحالية.

أضفت تحسينات على:

قراءة تاريخ publishedAt من YouTube API.

محاولة استخراج تاريخ Joined من صفحة About عند فشل التاريخ الأساسي.

تحليل بيانات JSON المتداخلة في صفحة YouTube.

تسجيل تفاصيل التشخيص في Render Logs.

عدم عرض تاريخ وهمي إذا تعذر الحصول على التاريخ.

استبدل محتويات server.js بالكامل بالكود التالي.


javascript

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
// VALIDATE DATE
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
// GET YOUTUBE CHANNEL
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
// COLLECT STRINGS FROM JSON
// ==========================================

function collectStrings(value, output = []) {

    if (typeof value === "string") {

        output.push(value);

    } else if (Array.isArray(value)) {

        for (const item of value) {
            collectStrings(item, output);
        }

    } else if (value && typeof value === "object") {

        for (const item of Object.values(value)) {
            collectStrings(item, output);
        }

    }

    return output;
}


// ==========================================
// PARSE JOINED DATE
// ==========================================

function parseJoinedText(value) {

    if (typeof value !== "string") {
        return null;
    }

    const match = value.match(
        /Joined\s+(.+?)\s*$/i
    );

    if (!match) {
        return null;
    }

    const timestamp = Date.parse(
        match[1].trim()
    );

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


// ==========================================
// EXTRACT JOINED DATE
// ==========================================

function extractJoinedDate(html) {

    if (
        typeof html !== "string" ||
        !html
    ) {
        return null;
    }

    const marker = '"joinedDateText"';

    let position = 0;

    while (true) {

        const index = html.indexOf(
            marker,
            position
        );

        if (index === -1) {
            break;
        }

        position = index + marker.length;

        const start = html.indexOf(
            "{",
            position
        );

        if (
            start === -1 ||
            start - position > 30
        ) {
            continue;
        }

        let depth = 0;
        let inString = false;
        let escaped = false;
        let end = -1;

        for (
            let i = start;
            i < html.length;
            i++
        ) {

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

                    end = i + 1;

                    break;

                }
            }
        }

        if (end === -1) {
            continue;
        }

        try {

            const object = JSON.parse(
                html.slice(start, end)
            );

            const strings = collectStrings(object);

            for (const value of strings) {

                const date = parseJoinedText(value);

                if (date) {
                    return date;
                }

            }

        } catch (error) {

            console.log(
                "VIRIFIXO JSON PARSE ERROR:",
                error.message
            );

        }
    }

    // Alternative format: direct joinedDateText strings

    const directPatterns = [

        /"joinedDateText"\s*:\s*"((?:\\.|[^"\\])*)"/g,

        /Joined\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi

    ];

    for (const pattern of directPatterns) {

        let match;

        while ((match = pattern.exec(html)) !== null) {

            let value = match[1];

            if (!value) continue;

            if (pattern.source.includes("joinedDateText")) {

                try {
                    value = JSON.parse(`"${value}"`);
                } catch {
                    continue;
                }

                value = "Joined " + value;

            }

            const date = parseJoinedText(value);

            if (date) {
                return date;
            }
        }
    }

    return null;
}


// ==========================================
// GET CHANNEL CREATION DATE
// ==========================================

async function getChannelCreationDate(channel) {

    const aboutUrl =
        channel.type === "handle"
            ? `https://www.youtube.com/@${encodeURIComponent(channel.value)}/about`
            : `https://www.youtube.com/channel/${channel.value}/about`;

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        12000
    );

    try {

        console.log(
            "VIRIFIXO: Requesting YouTube About page."
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

        console.log(
            "ABOUT PAGE STATUS:",
            response.status
        );

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        console.log(
            "ABOUT PAGE LENGTH:",
            html.length
        );

        console.log(
            "JOINED DATE FOUND:",
            html.includes("joinedDateText")
        );

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


        // Validate channel URL

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


        // Retrieve channel information

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

        let publishedAt = formatDate(rawDate);

        let dateSource = publishedAt
            ? "youtube_api"
            : null;


        // Try fallback if API date is invalid

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
        // RESULT
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

            message:
                `Channel found: ${result.title}`,

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

            message:
                "Unable to retrieve channel information."

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
