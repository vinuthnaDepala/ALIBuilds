from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse
import json
import os
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
PORT = int(os.environ.get("PORT", "3000"))
EMOJI_CACHE = {}


class FocusReaderHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/emoji":
            self.handle_emoji(parsed)
            return

        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_emoji(self, parsed):
        api_key = os.environ.get("EMOJI_API_KEY", "").strip()
        if not api_key:
            self.send_json(503, {"error": "Emoji API key is not configured."})
            return

        query = parse_qs(parsed.query)
        search = query.get("search", [""])[0].strip().lower()
        if len(search) < 2 or len(search) > 40 or not all(c.isalnum() or c in " -" for c in search):
            self.send_json(400, {"error": "Search must be 2-40 letters, numbers, spaces, or hyphens."})
            return

        if search in EMOJI_CACHE:
            self.send_json(200, {"source": "cache", "results": EMOJI_CACHE[search]})
            return

        params = urlencode({"search": search, "access_key": api_key})
        url = f"https://emoji-api.com/emojis?{params}"

        try:
            request = urllib.request.Request(url, headers={"User-Agent": "FocusReader/1.0"})
            with urllib.request.urlopen(request, timeout=8) as response:
                data = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            self.send_json(502, {"error": "Emoji API is unavailable."})
            return

        results = [
            {
                "character": item.get("character"),
                "unicodeName": item.get("unicodeName"),
                "slug": item.get("slug"),
                "group": item.get("group"),
                "subGroup": item.get("subGroup"),
            }
            for item in data[:8]
            if isinstance(item, dict) and item.get("character")
        ]
        EMOJI_CACHE[search] = results
        self.send_json(200, {"source": "api", "results": results})


# if __name__ == "__main__":
#     server = ThreadingHTTPServer(("127.0.0.1", PORT), FocusReaderHandler)
#     print(f"Focused Speed Reader running at http://localhost:{PORT}")
#     print("Set EMOJI_API_KEY to enable the Emoji API proxy.")
#     server.serve_forever()
if __name__ == "__main__":
    # "0.0.0.0" allows the iPhone to see the server through the hotspot
    server = ThreadingHTTPServer(("0.0.0.0", PORT), FocusReaderHandler)
    print(f"Focused Speed Reader running at http://0.0.0.0:{PORT}")
    print("Set EMOJI_API_KEY to enable the Emoji API proxy.")
    server.serve_forever()
