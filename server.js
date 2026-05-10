const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const emojiCache = new Map();
let latestCapture = null;
const MAX_CAPTURE_BYTES = 6 * 1024 * 1024;
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;

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

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

function readJsonBody(req, callback) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > MAX_CAPTURE_BYTES) {
      req.destroy();
    }
  });
  req.on("end", () => {
    try {
      callback(null, JSON.parse(body || "{}"));
    } catch (error) {
      callback(error);
    }
  });
  req.on("error", (error) => callback(error));
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
  if (url.pathname === "/api/lan-info" && req.method === "GET") {
    const host = getLanIp();
    sendJson(res, 200, {
      host,
      port: PORT,
      localUrl: `http://localhost:${PORT}`,
      lanUrl: `http://${host}:${PORT}`,
      phoneUrl: `http://${host}:${PORT}/phone.html`
    });
    return;
  }
  if (url.pathname === "/api/capture/latest" && req.method === "GET") {
    sendJson(res, 200, { capture: latestCapture });
    return;
  }
  if (url.pathname === "/api/capture/latest" && req.method === "DELETE") {
    latestCapture = null;
    sendJson(res, 200, { ok: true });
    return;
  }
  if (url.pathname === "/api/capture" && req.method === "POST") {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (!contentLength) {
      sendJson(res, 400, { error: "Missing request body." });
      return;
    }
    if (contentLength > MAX_CAPTURE_BYTES) {
      sendJson(res, 413, { error: "Capture is too large. Keep it under 6 MB." });
      return;
    }

    readJsonBody(req, (error, payload) => {
      if (error) {
        sendJson(res, 400, { error: "Expected JSON body." });
        return;
      }

      const image = String(payload.image || "").trim();
      if (!IMAGE_DATA_URL_RE.test(image)) {
        sendJson(res, 400, { error: "Expected a base64 image data URL." });
        return;
      }
      if (Buffer.byteLength(image, "utf8") > MAX_CAPTURE_BYTES) {
        sendJson(res, 413, { error: "Capture is too large. Keep it under 6 MB." });
        return;
      }

      latestCapture = {
        id: crypto.randomUUID(),
        image,
        name: String(payload.name || "phone-capture.jpg").slice(0, 120),
        size: Number(payload.size || 0),
        receivedAt: Date.now(),
        client: req.socket.remoteAddress
      };
      sendJson(res, 201, { ok: true, capture: latestCapture });
    });
    return;
  }
  if (url.pathname === "/api/emoji") {
    handleEmojiSearch(req, res);
    return;
  }

  sendStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  const lanIp = getLanIp();
  console.log(`Focused Speed Reader running at http://localhost:${PORT}`);
  console.log(`LAN portal URL: http://${lanIp}:${PORT}`);
  console.log(`Phone camera URL: http://${lanIp}:${PORT}/phone.html`);
});
