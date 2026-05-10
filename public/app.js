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
  emojiApiCache: new Map(),
  capturePollTimer: null,
  latestCaptureId: null,
  isExtracting: false
};

const sampleText = "The Magna Carta was signed in 1215 after English nobles challenged the king's power. It mattered because it suggested that even rulers should follow the law. Later, people used its ideas to argue for rights, fair trials, and limits on government authority.";

const elements = {
  setupView: document.querySelector("#setupView"),
  readerView: document.querySelector("#readerView"),
  completionView: document.querySelector("#completionView"),
  sourceText: document.querySelector("#sourceText"),
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
  completionSummary: document.querySelector("#completionSummary"),
  phoneUrl: document.querySelector("#phoneUrl"),
  cameraStatus: document.querySelector("#cameraStatus"),
  capturePreview: document.querySelector("#capturePreview"),
  refreshCaptureButton: document.querySelector("#refreshCaptureButton"),
  clearCaptureButton: document.querySelector("#clearCaptureButton"),
  extractReadButton: document.querySelector("#extractReadButton"),
  ocrStatus: document.querySelector("#ocrStatus")
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
  if (view === "setup") startCapturePolling();
  else stopCapturePolling();
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

function setCameraStatus(message, tone = "neutral") {
  if (!elements.cameraStatus) return;
  elements.cameraStatus.textContent = message;
  elements.cameraStatus.dataset.tone = tone;
}

function setOcrStatus(message, tone = "neutral") {
  if (!elements.ocrStatus) return;
  elements.ocrStatus.textContent = message;
  elements.ocrStatus.dataset.tone = tone;
}

function updateExtractButton(hasCapture) {
  if (!elements.extractReadButton) return;
  elements.extractReadButton.classList.toggle("hidden", !hasCapture);
  elements.extractReadButton.disabled = !hasCapture || state.isExtracting;
}

function renderCapture(capture) {
  if (!elements.capturePreview) return;

  if (!capture) {
    state.latestCaptureId = null;
    elements.capturePreview.innerHTML = "<span>No phone capture yet</span>";
    setCameraStatus("Waiting", "neutral");
    setOcrStatus("Waiting for a phone capture.", "neutral");
    updateExtractButton(false);
    return;
  }

  const isNewCapture = capture.id !== state.latestCaptureId;
  state.latestCaptureId = capture.id;
  const received = new Date(capture.receivedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
  const sizeKb = capture.size ? `${Math.round(capture.size / 1024)} KB` : "image";

  elements.capturePreview.textContent = "";
  const img = document.createElement("img");
  img.src = capture.image;
  img.alt = "Latest phone capture";

  const meta = document.createElement("div");
  meta.className = "capture-meta";
  const title = document.createElement("strong");
  title.textContent = `Received ${received}`;
  const details = document.createElement("span");
  details.textContent = `${sizeKb} from ${capture.client || "phone"}`;
  meta.append(title, details);
  elements.capturePreview.append(img, meta);
  setCameraStatus("Connected", "success");
  if (isNewCapture) setOcrStatus("Ready to extract text.", "ready");
  updateExtractButton(true);
}

async function refreshCapture() {
  if (!elements.capturePreview) return;
  try {
    const response = await fetch("api/capture/latest");
    if (!response.ok) throw new Error("Could not load capture.");
    const data = await response.json();
    if (data.capture?.id !== state.latestCaptureId || !data.capture) {
      renderCapture(data.capture);
    }
  } catch (error) {
    setCameraStatus("Offline", "error");
  }
}

async function clearCapture() {
  try {
    await fetch("api/capture/latest", { method: "DELETE" });
  } catch (error) {
    // The UI can still clear locally if the server is unavailable.
  }
  renderCapture(null);
}

async function extractAndReadCapture() {
  if (!state.latestCaptureId || state.isExtracting) return;
  state.isExtracting = true;
  updateExtractButton(true);
  setOcrStatus("Extracting text from image...", "neutral");

  try {
    const response = await fetch("api/capture/extract", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Could not extract text.");
    }

    const text = String(data.text || "").trim();
    if (!text) {
      throw new Error("No readable text was found in the image.");
    }

    elements.sourceText.value = text;
    setOcrStatus(`Extracted text with ${data.engine || "pytesseract"}. Starting reader...`, "success");
    state.isExtracting = false;
    updateExtractButton(true);
    startSession();
  } catch (error) {
    state.isExtracting = false;
    updateExtractButton(true);
    setOcrStatus(error.message || "Could not extract text.", "error");
  }
}

function startCapturePolling() {
  if (state.capturePollTimer) return;
  refreshCapture();
  state.capturePollTimer = setInterval(refreshCapture, 2000);
}

function stopCapturePolling() {
  if (!state.capturePollTimer) return;
  clearInterval(state.capturePollTimer);
  state.capturePollTimer = null;
}

async function setupPhoneConnection() {
  if (!elements.phoneUrl) return;
  let phoneUrl = new URL("phone.html", window.location.href).href;

  try {
    const response = await fetch("api/lan-info");
    if (response.ok) {
      const data = await response.json();
      phoneUrl = data.phoneUrl || phoneUrl;
    }
  } catch (error) {
    setCameraStatus("Local only", "neutral");
  }

  elements.phoneUrl.href = phoneUrl;
  elements.phoneUrl.textContent = phoneUrl;
}

function bindEvents() {
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
  elements.refreshCaptureButton?.addEventListener("click", refreshCapture);
  elements.clearCaptureButton?.addEventListener("click", clearCapture);
  elements.extractReadButton?.addEventListener("click", extractAndReadCapture);

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
applySettings();
setupPhoneConnection();
startCapturePolling();
