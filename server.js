
Go to file
t
T
public
index.html
README.md
package.json
server.js
virifixo
/server.js
ashrafhanfy1988-svg
ashrafhanfy1988-svg
Create server.js
bb212a7
 · 
2 minutes ago

Code

Blame
21 lines (16 loc) · 443 Bytes
Older
Newer
ashrafhanfy1988-svg
2 minutes ago

Create server.js

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
