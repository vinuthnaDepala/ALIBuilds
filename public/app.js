const state = {
  chunks: [],
  index: 0,
  isPlaying: false,
  timer: null,
  startedAt: null,
  completedAt: null,
  cameraStream: null,
  ocrLoadPromise: null,
  rawText: "",
  textStats: null,
  actualWpm: 0,
  settings: {
    wpm: 300,
    fontSize: 56,
    chunkSize: "medium",
    focusBoldingEnabled: true,
    emojiEnabled: true,
    comparisonEnabled: true,
    dyslexiaFriendlyFont: false,
    readAloud: false,
    theme: "light",
    grade: "5"
  },
  emojiApiCache: new Map()
};

const sampleText = "The Magna Carta was signed in 1215 after English nobles challenged the king's power. It mattered because it suggested that even rulers should follow the law. Later, people used its ideas to argue for rights, fair trials, and limits on government authority.";
const READ_ALOUD_MAX_WPM = 190;

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
  gradeInput: document.querySelector("#gradeInput"),
  fontInput: document.querySelector("#fontInput"),
  fontOutput: document.querySelector("#fontOutput"),
  boldingInput: document.querySelector("#boldingInput"),
  readerBoldingInput: document.querySelector("#readerBoldingInput"),
  emojiInput: document.querySelector("#emojiInput"),
  comparisonInput: document.querySelector("#comparisonInput"),
  comparisonSettings: document.querySelector("#comparisonSettings"),
  readerEmojiInput: document.querySelector("#readerEmojiInput"),
  dyslexiaInput: document.querySelector("#dyslexiaInput"),
  readAloudInput: document.querySelector("#readAloudInput"),
  cameraButton: document.querySelector("#cameraButton"),
  closeCameraButton: document.querySelector("#closeCameraButton"),
  captureButton: document.querySelector("#captureButton"),
  imageInput: document.querySelector("#imageInput"),
  cameraBox: document.querySelector("#cameraBox"),
  cameraPreview: document.querySelector("#cameraPreview"),
  scanCanvas: document.querySelector("#scanCanvas"),
  scanStatus: document.querySelector("#scanStatus"),
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
  comparisonPanel: document.querySelector("#comparisonPanel")
};

function selectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function syncSettingsFromControls() {
  state.settings.wpm = Number(elements.wpmInput.value);
  state.settings.fontSize = Number(elements.fontInput.value);
  state.settings.grade = elements.gradeInput.value;
  state.settings.chunkSize = selectedValue("chunkSize") || "medium";
  state.settings.theme = selectedValue("theme") || "light";
  state.settings.focusBoldingEnabled = elements.boldingInput.checked;
  state.settings.emojiEnabled = elements.emojiInput.checked;
  state.settings.comparisonEnabled = elements.comparisonInput.checked;
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
  const readAloudAvailable = state.settings.wpm <= READ_ALOUD_MAX_WPM;
  if (!readAloudAvailable) {
    state.settings.readAloud = false;
    elements.readAloudInput.checked = false;
    stopSpeech();
  }

  elements.wpmOutput.value = `${state.settings.wpm} WPM`;
  elements.fontOutput.value = `${state.settings.fontSize} px`;
  elements.readerWpmInput.value = String(state.settings.wpm);
  elements.readAloudInput.disabled = !readAloudAvailable;
  elements.readAloudInput.closest(".toggle").classList.toggle("disabled", !readAloudAvailable);
  elements.readAloudInput.closest(".toggle").title = readAloudAvailable
    ? ""
    : `Read aloud is available up to ${READ_ALOUD_MAX_WPM} WPM.`;
  document.body.classList.toggle("theme-dark", state.settings.theme === "dark");
  document.body.classList.toggle("theme-highContrast", state.settings.theme === "highContrast");
  document.body.classList.toggle("dyslexia-font", state.settings.dyslexiaFriendlyFont);
  elements.comparisonSettings.classList.toggle("hidden", !state.settings.comparisonEnabled);
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
  if (!state.settings.readAloud || state.settings.wpm > READ_ALOUD_MAX_WPM || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Math.min(1, Math.max(0.55, state.settings.wpm / READ_ALOUD_MAX_WPM));
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

function getWordCount(text) {
  return String(text || "").match(/\b[\w'-]+\b/g)?.length || 0;
}

function formatGrade(grade) {
  return grade === "K" ? "Kindergarten" : `Grade ${grade}`;
}

function getBenchmarkForGrade(grade) {
  return GradeBenchmarks.GRADE_BENCHMARKS.find((benchmark) => benchmark.grade === grade);
}

function describeMetric(value, mean, stdDev) {
  const delta = value - mean;
  const zScore = stdDev ? delta / stdDev : 0;
  const absZ = Math.abs(zScore);
  const level = zScore < -1 ? "below" : zScore > 1 ? "above" : "near";
  const distance = absZ < 0.25 ? "within the average band" : `${absZ.toFixed(1)} standard deviations ${delta < 0 ? "below" : "above"} the mean`;

  return { delta, zScore, level, distance };
}

function comparisonClass(level) {
  if (level === "above") return "good";
  if (level === "below") return "needs-work";
  return "steady";
}

function createMetricCard(label, value, mean, stdDev, unit) {
  const result = describeMetric(value, mean, stdDev);
  const article = result.level === "near" ? "Near average" : result.level === "above" ? "Above average" : "Below average";
  return `
    <div class="metric-card ${comparisonClass(result.level)}">
      <span>${label}</span>
      <strong>${Math.round(value).toLocaleString()} ${unit}</strong>
      <small>${article}: ${result.distance}. Grade mean is ${Math.round(mean).toLocaleString()} ${unit}; SD is ${Math.round(stdDev).toLocaleString()}.</small>
    </div>
  `;
}

function renderComparisonReport(seconds) {
  if (!state.settings.comparisonEnabled) {
    elements.comparisonPanel.innerHTML = "";
    elements.completionSummary.textContent = `You finished ${state.chunks.length} phrase chunks in ${seconds} seconds.`;
    return;
  }

  const benchmark = getBenchmarkForGrade(state.settings.grade);
  if (!benchmark || !state.textStats) {
    elements.comparisonPanel.innerHTML = "";
    return;
  }

  const speed = describeMetric(state.settings.wpm, benchmark.readingSpeedMean, benchmark.readingSpeedStdDev);
  const complexity = describeMetric(state.textStats.estimatedLexile, benchmark.lexileMean, benchmark.lexileStdDev);
  const vocabulary = describeMetric(state.textStats.estimatedVocabularySize, benchmark.vocabularyMean, benchmark.vocabularyStdDev);
  const suggestions = GradeBenchmarks.READING_SUGGESTIONS[state.settings.grade] || [];
  const needsSpeed = speed.level === "below";
  const needsComplexity = complexity.level === "below" || vocabulary.level === "below";
  const strengths = [speed, complexity, vocabulary].filter((item) => item.level !== "below").length;
  const headline = strengths === 3
    ? "Great work. This reading was at or above the grade benchmark."
    : "Keep going. This shows exactly what to practice next.";
  const guidance = [
    needsSpeed ? "Build speed with short daily rereads, aiming for smooth phrasing before raising the WPM setting." : "Your pace is in a healthy range for this grade.",
    needsComplexity ? "Grow vocabulary complexity by reading slightly harder passages and pausing to define unfamiliar words." : "The vocabulary and text complexity are matching or stretching the grade benchmark."
  ];

  elements.completionSummary.textContent = `You finished ${state.textStats.wordCount} words in ${seconds} seconds. Your selected reader pace was ${state.settings.wpm} WPM.`;
  elements.comparisonPanel.innerHTML = `
    <h3>${headline}</h3>
    <p>Compared with ${formatGrade(state.settings.grade)} benchmarks from the statistical analysis, using standard deviations to avoid overreacting to small differences.</p>
    <div class="metric-grid">
      ${createMetricCard("Selected reading speed", state.settings.wpm, benchmark.readingSpeedMean, benchmark.readingSpeedStdDev, "WPM")}
      ${createMetricCard("Vocabulary complexity", state.textStats.estimatedVocabularySize, benchmark.vocabularyMean, benchmark.vocabularyStdDev, "est. words")}
      ${createMetricCard("Text complexity", state.textStats.estimatedLexile, benchmark.lexileMean, benchmark.lexileStdDev, "Lexile")}
    </div>
    <div class="advice-box">
      <h4>Advice</h4>
      <p>${guidance.join(" ")}</p>
    </div>
    <div class="advice-box">
      <h4>Age-appropriate reading ideas</h4>
      <ul>${suggestions.map((item) => `<li>${escapeForDisplay(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function setScanStatus(message, isError = false) {
  elements.scanStatus.textContent = message;
  elements.scanStatus.classList.toggle("error", isError);
}

function normalizeScannedText(text) {
  return String(text || "")
    .replace(/-\s*\n\s*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function loadOcrEngine() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (state.ocrLoadPromise) return state.ocrLoadPromise;

  state.ocrLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("OCR library failed to load."));
    document.head.appendChild(script);
  });

  return state.ocrLoadPromise;
}

async function recognizeImage(imageSource) {
  setScanStatus("Loading OCR...");
  const Tesseract = await loadOcrEngine();
  setScanStatus("Reading the document...");
  const result = await Tesseract.recognize(imageSource, "eng", {
    logger: (message) => {
      if (message.status === "recognizing text") {
        const progress = Math.round((message.progress || 0) * 100);
        setScanStatus(`Reading the document... ${progress}%`);
      }
    }
  });
  return normalizeScannedText(result.data?.text);
}

function stopCameraStream() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
  elements.cameraPreview.srcObject = null;
  elements.cameraBox.classList.add("hidden");
}

async function scanImage(imageSource) {
  try {
    const scannedText = await recognizeImage(imageSource);
    if (!scannedText) {
      setScanStatus("No words found. Try brighter light or a straighter photo.", true);
      return;
    }

    elements.sourceText.value = scannedText;
    stopCameraStream();
    setScanStatus("Text scanned. Starting reader...");
    startSession();
  } catch (error) {
    setScanStatus("Could not scan this image. Check your connection and try again.", true);
  }
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setScanStatus("Camera scanning is not supported in this browser.", true);
    return;
  }

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    elements.cameraPreview.srcObject = state.cameraStream;
    elements.cameraBox.classList.remove("hidden");
    setScanStatus("Place the document in view, then scan.");
  } catch (error) {
    setScanStatus("Camera permission was blocked or unavailable.", true);
  }
}

function closeCamera() {
  stopCameraStream();
  setScanStatus("Use a camera or upload a clear photo.");
}

function captureCameraImage() {
  const video = elements.cameraPreview;
  if (!video.videoWidth || !video.videoHeight) {
    setScanStatus("Camera is still loading. Try again in a moment.", true);
    return;
  }

  const canvas = elements.scanCanvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) {
      setScanStatus("Could not capture the camera image.", true);
      return;
    }
    scanImage(blob);
  }, "image/png");
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
  state.actualWpm = Math.round((getWordCount(state.rawText) / seconds) * 60);
  renderComparisonReport(seconds);
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
  state.rawText = rawText;
  state.textStats = ReaderCore.estimateTextComplexity(rawText);

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

function bindEvents() {
  elements.startButton.addEventListener("click", startSession);
  elements.cameraButton.addEventListener("click", openCamera);
  elements.closeCameraButton.addEventListener("click", closeCamera);
  elements.captureButton.addEventListener("click", captureCameraImage);
  elements.imageInput.addEventListener("change", () => {
    const file = elements.imageInput.files?.[0];
    if (!file) return;
    scanImage(file);
    elements.imageInput.value = "";
  });
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

  elements.gradeInput.addEventListener("change", syncSettingsFromControls);

  document.querySelectorAll("input[name='theme'], input[name='chunkSize']").forEach((input) => {
    input.addEventListener("change", syncSettingsFromControls);
  });

  [elements.boldingInput, elements.emojiInput, elements.comparisonInput, elements.dyslexiaInput, elements.readAloudInput].forEach((input) => {
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
