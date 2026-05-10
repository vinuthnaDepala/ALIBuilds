from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse
from uuid import uuid4
import base64
import binascii
import io
import json
import os
import re
import socket
import subprocess
import time
import urllib.error
import urllib.request


try:
    import pytesseract
except ImportError:
    pytesseract = None

try:
    from PIL import Image, UnidentifiedImageError
except ImportError:
    Image = None

    class UnidentifiedImageError(Exception):
        pass


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
PORT = int(os.environ.get("PORT", "3000"))
EMOJI_CACHE = {}
LATEST_CAPTURE = None
MAX_CAPTURE_BYTES = 6 * 1024 * 1024
IMAGE_DATA_URL_RE = re.compile(r"^data:image/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$")
PRIVATE_IPV4_RE = re.compile(
    r"\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b"
)


def private_ip_rank(ip):
    if ip.startswith("192.168."):
        return 0
    if ip.startswith("10."):
        return 1
    if ip.startswith("172."):
        return 2
    return 9


def valid_ipv4(ip):
    try:
        socket.inet_aton(ip)
    except OSError:
        return False
    parts = ip.split(".")
    return len(parts) == 4 and all(part.isdigit() and 0 <= int(part) <= 255 for part in parts)


def valid_lan_host_ip(ip):
    if not valid_ipv4(ip):
        return False
    last_octet = int(ip.split(".")[-1])
    return last_octet not in (0, 255)


def discover_interface_ips():
    ips = set()
    try:
        for result in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = result[4][0]
            if valid_lan_host_ip(ip):
                ips.add(ip)
    except OSError:
        pass

    for command in (["ifconfig"], ["ipconfig"]):
        try:
            output = subprocess.check_output(command, stderr=subprocess.DEVNULL, text=True, timeout=1.5)
        except (OSError, subprocess.SubprocessError):
            continue
        for ip in PRIVATE_IPV4_RE.findall(output):
            if valid_lan_host_ip(ip):
                ips.add(ip)

    return sorted(ips, key=private_ip_rank)


def udp_detect_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return ""


def get_lan_ip():
    override = os.environ.get("LAN_HOST", "").strip()
    if override:
        return override

    private_ips = [ip for ip in discover_interface_ips() if PRIVATE_IPV4_RE.match(ip)]
    if private_ips:
        return private_ips[0]

    detected = udp_detect_ip()
    if detected and detected not in ("127.0.0.1", "0.0.0.0"):
        return detected

    try:
        host_ip = socket.gethostbyname(socket.gethostname())
        if host_ip not in ("127.0.0.1", "0.0.0.0"):
            return host_ip
    except OSError:
        pass

    return "127.0.0.1"


def normalize_ocr_text(text):
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.replace("\r\n", "\n").split("\n")]
    normalized = []
    blank_seen = False

    for line in lines:
        if line:
            normalized.append(line)
            blank_seen = False
        elif normalized and not blank_seen:
            normalized.append("")
            blank_seen = True

    return "\n".join(normalized).strip()


def decode_capture_image(data_url):
    match = IMAGE_DATA_URL_RE.match(data_url)
    if not match:
        raise ValueError("Expected a base64 PNG, JPEG, GIF, or WebP image data URL.")

    try:
        image_bytes = base64.b64decode(match.group(2), validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("Image data is not valid base64.") from error

    if not image_bytes:
        raise ValueError("Image data is empty.")

    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("Could not decode the uploaded image.") from error

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    return image


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
        if parsed.path == "/api/lan-info":
            self.handle_lan_info()
            return
        if parsed.path == "/api/capture/latest":
            self.send_json(200, {"capture": LATEST_CAPTURE})
            return

        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/capture":
            self.handle_capture_post()
            return
        if parsed.path == "/api/capture/extract":
            self.handle_capture_extract()
            return

        self.send_json(404, {"error": "Not found"})

    def do_DELETE(self):
        global LATEST_CAPTURE
        parsed = urlparse(self.path)
        if parsed.path == "/api/capture/latest":
            LATEST_CAPTURE = None
            self.send_json(200, {"ok": True})
            return

        self.send_json(404, {"error": "Not found"})

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_lan_info(self):
        host = get_lan_ip()
        self.send_json(
            200,
            {
                "host": host,
                "port": PORT,
                "localUrl": f"http://localhost:{PORT}",
                "lanUrl": f"http://{host}:{PORT}",
                "phoneUrl": f"http://{host}:{PORT}/phone.html",
            },
        )

    def handle_capture_post(self):
        global LATEST_CAPTURE

        content_length = int(self.headers.get("Content-Length", "0") or "0")
        if content_length <= 0:
            self.send_json(400, {"error": "Missing request body."})
            return
        if content_length > MAX_CAPTURE_BYTES:
            self.send_json(413, {"error": "Capture is too large. Keep it under 6 MB."})
            return

        try:
            body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {"error": "Expected JSON body."})
            return

        image = str(payload.get("image", "")).strip()
        name = str(payload.get("name", "phone-capture.jpg")).strip()[:120]
        size = int(payload.get("size", 0) or 0)

        if not IMAGE_DATA_URL_RE.match(image):
            self.send_json(400, {"error": "Expected a base64 PNG, JPEG, GIF, or WebP image data URL."})
            return
        if len(image.encode("utf-8")) > MAX_CAPTURE_BYTES:
            self.send_json(413, {"error": "Capture is too large. Keep it under 6 MB."})
            return

        LATEST_CAPTURE = {
            "id": uuid4().hex,
            "image": image,
            "name": name,
            "size": size,
            "receivedAt": int(time.time() * 1000),
            "client": self.client_address[0],
        }
        self.send_json(201, {"ok": True, "capture": LATEST_CAPTURE})

    def handle_capture_extract(self):
        if not LATEST_CAPTURE:
            self.send_json(400, {"error": "No phone capture is available yet."})
            return
        if pytesseract is None or Image is None:
            self.send_json(
                500,
                {
                    "error": "Missing OCR Python packages. Run: python -m pip install pytesseract pillow"
                },
            )
            return

        tesseract_path = os.environ.get("TESSERACT_CMD", "").strip()
        if tesseract_path:
            pytesseract.pytesseract.tesseract_cmd = tesseract_path

        try:
            image = decode_capture_image(LATEST_CAPTURE["image"])
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return

        try:
            extracted = pytesseract.image_to_string(image, config="--psm 6")
        except pytesseract.TesseractNotFoundError:
            self.send_json(
                500,
                {
                    "error": "Tesseract was not found. Confirm `tesseract --version` works or set TESSERACT_CMD=/opt/homebrew/bin/tesseract."
                },
            )
            return
        except pytesseract.TesseractError as error:
            self.send_json(500, {"error": f"Tesseract OCR failed: {error}"})
            return

        text = normalize_ocr_text(extracted)
        if not text:
            self.send_json(422, {"error": "No readable text was found in the image."})
            return

        self.send_json(
            200,
            {
                "ok": True,
                "text": text,
                "captureId": LATEST_CAPTURE["id"],
                "engine": "pytesseract",
            },
        )

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


if __name__ == "__main__":
    lan_ip = get_lan_ip()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), FocusReaderHandler)
    print(f"Focused Speed Reader running at http://localhost:{PORT}")
    print(f"LAN portal URL: http://{lan_ip}:{PORT}")
    print(f"Phone camera URL: http://{lan_ip}:{PORT}/phone.html")
    print("Set EMOJI_API_KEY to enable the Emoji API proxy.")
    server.serve_forever()
