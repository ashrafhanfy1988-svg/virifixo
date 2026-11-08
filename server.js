
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
  res.json({
    name: "Virifixo",
    status: "online",
    message: "Virifixo server is running"
  });
});

app.post("/api/verify", (req, res) => {
  const channel = String(req.body.channel || "").trim();

  const valid =
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(channel);

  if (!valid) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid YouTube channel URL."
    });
  }

  return res.json({
    success: true,
    message: "YouTube URL format is valid. Official channel verification is not confirmed."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Virifixo running on port ${PORT}`);
});
