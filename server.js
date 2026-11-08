
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
