
app.disable("x-powered-by");

// Allow the official Virifixo GitHub Pages frontend
const allowedOrigins = [
    "https://ashrafhanfy1988-svg.github.io"
];

app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        );
        res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type"
        );
    }

    if (req.method === "OPTIONS") {
        if (!origin || !allowedOrigins.includes(origin)) {
            return res.sendStatus(403);
        }

        return res.sendStatus(204);
    }

    next();
});

app.use(express.json({
    limit: "10kb"
}));
