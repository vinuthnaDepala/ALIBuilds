# Focus Reader

A web-based focused speed-reading tool for students. It chunks pasted text into phrase-sized cards, adds focus bolding, and shows lightweight emoji cues.

## Run

This workspace currently has Python available, so the primary launcher is:

```sh
python3 server.py
```

Then open:

```txt
http://localhost:3000
```

To enable live Open Emoji API lookup, set an API key before starting the server:

```sh
EMOJI_API_KEY=your_key_here python3 server.py
```

The app still works without the key by using a curated fallback emoji dictionary.

## Optional Node Launcher

If Node.js is installed later, this also works:

```sh
npm start
```

## Features

- Paste text input
- Scan a physical document with the camera or upload a document photo
- Phrase-by-phrase focus reader
- Adjustable WPM and chunk size
- Grade-level comparison against K-12 reading speed, vocabulary, and Lexile benchmarks
- Focus bolding inspired by speed-reading tools
- Emoji cues with API proxy plus expanded fallback dictionary for most phrase chunks
- Dark mode, high contrast, font sizing, and dyslexia-friendly font toggle
- Read aloud up to 190 WPM
- Pause, resume, previous, next, keyboard controls, and completion summary

Document scanning uses client-side OCR in the browser. It needs camera permission for live scanning and an internet connection the first time the OCR library loads.

The optional grade comparison uses the selected WPM and an estimated text-complexity score from the pasted or scanned passage. It compares those values to the K-12 statistical benchmark data with standard deviations, then gives encouragement and age-appropriate reading suggestions.
