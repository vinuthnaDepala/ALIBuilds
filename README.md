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
- Phrase-by-phrase focus reader
- Adjustable WPM and chunk size
- Focus bolding inspired by speed-reading tools
- Emoji cues with API proxy plus fallback dictionary
- Dark mode, high contrast, font sizing, and dyslexia-friendly font toggle
- Pause, resume, previous, next, keyboard controls, and completion summary
