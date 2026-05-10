const state = {
  chunks: [],
  index: 0,
  isPlaying: false,
  timer: null,
  startedAt: null,
  completedAt: null,
  settings: {
    wpm: 300,
    fontSize: 56,
    chunkSize: "medium",
    focusBoldingEnabled: true,
    emojiEnabled: true,
    dyslexiaFriendlyFont: false,
    readAloud: false,
    theme: "light"
  },
  emojiApiCache: new Map()
};

const sampleText = "The Magna Carta was signed in 1215 after English nobles challenged the king's power. It mattered because it suggested that even rulers should follow the law. Later, people used its ideas to argue for rights, fair trials, and limits on government authority.";
const defaultText = "Photosynthesis is the process plants use to make food from sunlight, water, and carbon dioxide. The plant captures energy from the sun and changes it into sugar. This matters because plants provide food and oxygen for many living things on Earth.";

const elements = {
  setupView: document.querySelector("#setupView"),
  readerView: document.querySelector("#readerView"),
  completionView: document.querySelector("#completionView"),
  sourceText: document.querySelector("#sourceText"),
  scanTextButton: document.querySelector("#scanTextButton"),
  photoInput: document.querySelector("#photoInput"),
  scanStatus: document.querySelector("#scanStatus"),
  startButton: document.querySelector("#startButton"),
  sampleButton: document.querySelector("#sampleButton"),
  editButton: document.querySelector("#editButton"),
  restartButton: document.querySelector("#restartButton"),
  newTextButton: document.querySelector("#newTextButton"),
  wpmInput: document.querySelector("#wpmInput"),
  readerWpmInput: document.querySelector("#readerWpmInput"),
  wpmOutput: document.querySelector("#wpmOutput"),
  fontInput: document.querySelector("#fontInput"),
  fontOutput: document.querySelector("#fontOutput"),
  boldingInput: document.querySelector("#boldingInput"),
  readerBoldingInput: document.querySelector("#readerBoldingInput"),
  emojiInput: document.querySelector("#emojiInput"),
  readerEmojiInput: document.querySelector("#readerEmojiInput"),
  dyslexiaInput: document.querySelector("#dyslexiaInput"),
  readAloudInput: document.querySelector("#readAloudInput"),
  phraseText: document.querySelector("#phraseText"),
  emojiCue: document.querySelector("#emojiCue"),
  progressFill: document.querySelector("#progressFill"),
  chunkCounter: document.querySelector("#chunkCounter"),
  timeRemaining: document.querySelector("#timeRemaining"),
  prevButton: document.querySelector("#prevButton"),
  playButton: document.querySelector("#playButton"),
  nextButton: document.querySelector("#nextButton"),
  emojiStatus: document.querySelector("#emojiStatus"),
  focusStage: document.querySelector("#focusStage"),
  completionSummary: document.querySelector("#completionSummary")
};

function selectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function syncSettingsFromControls() {
  state.settings.wpm = Number(elements.wpmInput.value);
  state.settings.fontSize = Number(elements.fontInput.value);
  state.settings.chunkSize = selectedValue("chunkSize") || "medium";
  state.settings.theme = selectedValue("theme") || "light";
  state.settings.focusBoldingEnabled = elements.boldingInput.checked;
  state.settings.emojiEnabled = elements.emojiInput.checked;
  state.settings.dyslexiaFriendlyFont = elements.dyslexiaInput.checked;
  state.settings.readAloud = elements.readAloudInput.checked;
  applySettings();
}

function syncReaderControlsToSettings() {
  elements.readerWpmInput.value = String(state.settings.wpm);
  elements.readerEmojiInput.checked = state.settings.emojiEnabled;
  elements.readerBoldingInput.checked = state.settings.focusBoldingEnabled;
}

function applySettings() {
  elements.wpmOutput.value = `${state.settings.wpm} WPM`;
  elements.fontOutput.value = `${state.settings.fontSize} px`;
  elements.readerWpmInput.value = String(state.settings.wpm);
  document.body.classList.toggle("theme-dark", state.settings.theme === "dark");
  document.body.classList.toggle("theme-highContrast", state.settings.theme === "highContrast");
  document.body.classList.toggle("dyslexia-font", state.settings.dyslexiaFriendlyFont);
  document.documentElement.style.setProperty("--reader-font-size", `${state.settings.fontSize}px`);
}

function showView(view) {
  elements.setupView.classList.toggle("hidden", view !== "setup");
  elements.readerView.classList.toggle("hidden", view !== "reader");
  elements.completionView.classList.toggle("hidden", view !== "completion");
}

function clearTimer() {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

function speak(text) {
  if (!state.settings.readAloud || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Math.min(1.35, Math.max(0.65, state.settings.wpm / 300));
  window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function currentChunk() {
  return state.chunks[state.index];
}

function updateProgress() {
  const total = state.chunks.length;
  const current = total ? state.index + 1 : 0;
  const progress = total ? (current / total) * 100 : 0;
  const remainingMs = state.chunks
    .slice(state.index + 1)
    .reduce((sum, chunk) => sum + ReaderCore.getEstimatedMs(chunk.text, state.settings.wpm), 0);

  elements.progressFill.style.width = `${progress}%`;
  elements.chunkCounter.textContent = `${current} / ${total}`;
  elements.timeRemaining.textContent = `${Math.max(1, Math.ceil(remainingMs / 60000))} min left`;
}

function renderChunk() {
  const chunk = currentChunk();
  if (!chunk) return;

  elements.phraseText.innerHTML = state.settings.focusBoldingEnabled
    ? chunk.emphasizedHtml
    : escapeForDisplay(chunk.text);

  elements.emojiCue.textContent = state.settings.emojiEnabled && chunk.emoji ? chunk.emoji : "";
  elements.emojiCue.setAttribute("aria-label", chunk.emojiLabel ? `Visual cue: ${chunk.emojiLabel}` : "No visual cue");
  elements.prevButton.disabled = state.index === 0;
  elements.nextButton.disabled = state.index >= state.chunks.length - 1;
  elements.playButton.textContent = state.isPlaying ? "Pause" : "Play";
  updateProgress();

  if (state.isPlaying) speak(chunk.text);
}

function escapeForDisplay(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function scheduleNext() {
  clearTimer();
  if (!state.isPlaying) return;

  const chunk = currentChunk();
  const delay = ReaderCore.getEstimatedMs(chunk.text, state.settings.wpm);
  state.timer = setTimeout(() => {
    if (state.index >= state.chunks.length - 1) {
      completeSession();
      return;
    }
    state.index += 1;
    renderChunk();
    scheduleNext();
  }, delay);
}

function play() {
  if (!state.chunks.length) return;
  state.isPlaying = true;
  renderChunk();
  scheduleNext();
}

function pause() {
  state.isPlaying = false;
  clearTimer();
  stopSpeech();
  renderChunk();
}

function goToChunk(nextIndex) {
  state.index = Math.min(Math.max(0, nextIndex), state.chunks.length - 1);
  clearTimer();
  renderChunk();
  scheduleNext();
}

function completeSession() {
  pause();
  state.completedAt = Date.now();
  const seconds = Math.max(1, Math.round((state.completedAt - state.startedAt) / 1000));
  elements.completionSummary.textContent = `You finished ${state.chunks.length} phrase chunks in ${seconds} seconds.`;
  showView("completion");
}

function startSession() {
  syncSettingsFromControls();
  const rawText = elements.sourceText.value.trim();
  if (!rawText) {
    elements.sourceText.focus();
    return;
  }

  state.chunks = ReaderCore.processText({
    rawText,
    chunkSize: state.settings.chunkSize,
    wpm: state.settings.wpm
  });

  if (!state.chunks.length) {
    elements.sourceText.focus();
    return;
  }

  state.index = 0;
  state.startedAt = Date.now();
  hydrateApiEmojis();
  syncReaderControlsToSettings();
  showView("reader");
  play();
}

async function hydrateApiEmojis() {
  if (!state.settings.emojiEnabled) return;
  const candidates = state.chunks
    .filter((chunk) => !chunk.emoji)
    .map((chunk) => ({ chunk, keyword: ReaderCore.extractKeywords(chunk.text)[0] }))
    .filter((item) => item.keyword)
    .slice(0, 12);

  if (!candidates.length) return;

  let hydrated = 0;
  for (const item of candidates) {
    const result = await fetchEmoji(item.keyword);
    if (result) {
      item.chunk.emoji = result.character;
      item.chunk.emojiLabel = result.unicodeName;
      hydrated += 1;
    }
  }

  elements.emojiStatus.textContent = hydrated ? "Emoji API connected" : "Using fallback cues";
  renderChunk();
}

async function fetchEmoji(keyword) {
  if (state.emojiApiCache.has(keyword)) {
    return state.emojiApiCache.get(keyword);
  }

  try {
    const response = await fetch(`api/emoji?search=${encodeURIComponent(keyword)}`);
    if (!response.ok) {
      state.emojiApiCache.set(keyword, null);
      return null;
    }

    const data = await response.json();
    const result = data.results?.[0] || null;
    state.emojiApiCache.set(keyword, result);
    return result;
  } catch (error) {
    state.emojiApiCache.set(keyword, null);
    return null;
  }
}

function prepareForScanText() {
  if (elements.sourceText.value.trim() === defaultText) {
    elements.sourceText.value = "";
  }

  elements.sourceText.focus();
  const cursorPosition = elements.sourceText.value.length;
  elements.sourceText.setSelectionRange(cursorPosition, cursorPosition);
  elements.scanStatus.textContent = "If iOS shows Scan Text, use it here. If not, tap Take Photo.";
}

async function recognizePhoto(file) {
  if (!file) return;

  if (!window.Tesseract) {
    elements.scanStatus.textContent = "OCR could not load. Check the phone internet connection and refresh.";
    return;
  }

  elements.scanStatus.textContent = "Reading photo text...";
  elements.startButton.disabled = true;
  elements.sampleButton.disabled = true;

  try {
    const preparedImage = await prepareImageForOcr(file);
    const result = await Tesseract.recognize(preparedImage, "eng", {
      logger(message) {
        if (message.status === "recognizing text") {
          elements.scanStatus.textContent = `Reading photo text ${Math.round(message.progress * 100)}%`;
        }
      },
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1"
    });

    const text = result.data.text.trim().replace(/\n{3,}/g, "\n\n");
    if (!text) {
      elements.scanStatus.textContent = "No readable text found. Try a flatter, brighter photo.";
      return;
    }

    elements.sourceText.value = text;
    elements.scanStatus.textContent = "Text captured. Starting reader...";
    startSession();
  } catch (error) {
    elements.scanStatus.textContent = "Could not read that photo. Try again with better lighting.";
  } finally {
    elements.startButton.disabled = false;
    elements.sampleButton.disabled = false;
    elements.photoInput.value = "";
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

async function prepareImageForOcr(file) {
  const image = await loadImage(file);
  const maxWidth = 2200;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(image.src);

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
    const value = contrasted > 165 ? 255 : contrasted < 95 ? 0 : contrasted;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function bindEvents() {
  elements.scanTextButton.addEventListener("click", prepareForScanText);
  elements.photoInput.addEventListener("change", () => recognizePhoto(elements.photoInput.files[0]));
  elements.startButton.addEventListener("click", startSession);
  elements.sampleButton.addEventListener("click", () => {
    elements.sourceText.value = sampleText;
    elements.sourceText.focus();
  });
  elements.editButton.addEventListener("click", () => {
    pause();
    showView("setup");
  });
  elements.restartButton.addEventListener("click", () => {
    state.index = 0;
    state.startedAt = Date.now();
    showView("reader");
    play();
  });
  elements.newTextButton.addEventListener("click", () => {
    pause();
    showView("setup");
    elements.sourceText.focus();
  });
  elements.prevButton.addEventListener("click", () => goToChunk(state.index - 1));
  elements.nextButton.addEventListener("click", () => {
    if (state.index >= state.chunks.length - 1) completeSession();
    else goToChunk(state.index + 1);
  });
  elements.playButton.addEventListener("click", () => {
    if (state.isPlaying) pause();
    else play();
  });

  elements.wpmInput.addEventListener("input", () => {
    state.settings.wpm = Number(elements.wpmInput.value);
    applySettings();
  });
  elements.fontInput.addEventListener("input", () => {
    state.settings.fontSize = Number(elements.fontInput.value);
    applySettings();
  });

  document.querySelectorAll("input[name='theme'], input[name='chunkSize']").forEach((input) => {
    input.addEventListener("change", syncSettingsFromControls);
  });

  [elements.boldingInput, elements.emojiInput, elements.dyslexiaInput, elements.readAloudInput].forEach((input) => {
    input.addEventListener("change", syncSettingsFromControls);
  });

  elements.readerWpmInput.addEventListener("input", () => {
    state.settings.wpm = Number(elements.readerWpmInput.value);
    elements.wpmInput.value = elements.readerWpmInput.value;
    applySettings();
    clearTimer();
    scheduleNext();
  });
  elements.readerEmojiInput.addEventListener("change", () => {
    state.settings.emojiEnabled = elements.readerEmojiInput.checked;
    elements.emojiInput.checked = elements.readerEmojiInput.checked;
    renderChunk();
  });
  elements.readerBoldingInput.addEventListener("change", () => {
    state.settings.focusBoldingEnabled = elements.readerBoldingInput.checked;
    elements.boldingInput.checked = elements.readerBoldingInput.checked;
    renderChunk();
  });

  document.addEventListener("keydown", (event) => {
    if (elements.readerView.classList.contains("hidden")) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (state.isPlaying) pause();
      else play();
    }
    if (event.key === "ArrowLeft") goToChunk(state.index - 1);
    if (event.key === "ArrowRight") {
      if (state.index >= state.chunks.length - 1) completeSession();
      else goToChunk(state.index + 1);
    }
  });
}

bindEvents();
elements.sourceText.value = defaultText;
applySettings();
