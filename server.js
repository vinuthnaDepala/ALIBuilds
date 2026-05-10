const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const emojiCache = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(content);
  });
}

async function handleEmojiSearch(req, res) {
  const apiKey = process.env.EMOJI_API_KEY;
  if (!apiKey) {
    sendJson(res, 503, { error: "Emoji API key is not configured." });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
  if (!/^[a-z0-9 -]{2,40}$/.test(search)) {
    sendJson(res, 400, { error: "Search must be 2-40 letters, numbers, spaces, or hyphens." });
    return;
  }

  if (emojiCache.has(search)) {
    sendJson(res, 200, { source: "cache", results: emojiCache.get(search) });
    return;
  }

  try {
    const apiUrl = new URL("https://emoji-api.com/emojis");
    apiUrl.searchParams.set("search", search);
    apiUrl.searchParams.set("access_key", apiKey);

    const response = await fetch(apiUrl);
    if (!response.ok) {
      sendJson(res, response.status, { error: "Emoji API request failed." });
      return;
    }

    const data = await response.json();
    const results = Array.isArray(data)
      ? data.slice(0, 8).map((item) => ({
          character: item.character,
          unicodeName: item.unicodeName,
          slug: item.slug,
          group: item.group,
          subGroup: item.subGroup
        }))
      : [];

    emojiCache.set(search, results);
    sendJson(res, 200, { source: "api", results });
  } catch (error) {
    sendJson(res, 502, { error: "Emoji API is unavailable." });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/emoji") {
    handleEmojiSearch(req, res);
    return;
  }

  sendStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Focused Speed Reader running at http://localhost:${PORT}`);
});
