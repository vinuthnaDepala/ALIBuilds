# Focus Reader

A web-based focused speed-reading tool for students. It chunks pasted text into phrase-sized cards, adds focus bolding, and shows lightweight emoji cues.

## Run

This workspace currently has Python available, so the primary launcher is:

```sh
python3 server.py
```

On Windows or machines where `python3` is unavailable, use:

```sh
python server.py
```

Then open:

```txt
http://localhost:3000
```

The terminal also prints a LAN URL, such as:

```txt
http://192.168.1.25:3000
```

Use that URL from another device on the same Wi-Fi.

If the server picks the wrong network interface, override it:

```sh
LAN_HOST=192.168.1.25 python server.py
```

To enable live Open Emoji API lookup, set an API key before starting the server:

```sh
EMOJI_API_KEY=your_key_here python3 server.py
```

The app still works without the key by using a curated fallback emoji dictionary.

To enable image-to-text extraction from phone captures, install the local OCR Python packages:

```sh
python -m pip install pytesseract pillow
```

Confirm the Tesseract binary is available:

```sh
tesseract --version
```

If Python cannot find the Homebrew binary, start the server with:

```sh
TESSERACT_CMD=/opt/homebrew/bin/tesseract python server.py
```

Use `python3 -m pip install pytesseract pillow` and `python3 server.py` on machines where `python3` is the working command.
```

## Features

- Paste text input
- Phrase-by-phrase focus reader
- Adjustable WPM and chunk size
- Focus bolding inspired by speed-reading tools
- Emoji cues with API proxy plus fallback dictionary
- Dark mode, high contrast, font sizing, and dyslexia-friendly font toggle
- Pause, resume, previous, next, keyboard controls, and completion summary
- LAN phone camera demo with a phone link and latest capture preview

## Phone Camera Demo

1. Start the server with `python server.py` or `python3 server.py`.
2. Open `http://localhost:3000` on the computer.
3. Open the displayed Phone Camera link on a phone connected to the same Wi-Fi.
4. Take or choose a photo from the phone page.
5. Tap **Send to Portal**.
6. The desktop portal shows the latest phone capture.

This demo uses snapshot upload, not live video. Images are stored only in server memory and disappear when the server restarts.

After a phone image appears on the desktop portal, click **Extract & Read** to extract visible text with local pytesseract OCR and start the speed reader automatically.
