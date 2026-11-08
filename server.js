
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

app.listen(PORT, () => {
  console.log(`Virifixo running on port ${PORT}`);
});
