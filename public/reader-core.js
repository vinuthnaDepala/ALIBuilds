(function (global) {
  const SIZE_LIMITS = {
    small: { min: 2, max: 4 },
    medium: { min: 4, max: 7 },
    large: { min: 7, max: 11 }
  };

  const BREAK_WORDS = new Set([
    "and",
    "but",
    "or",
    "because",
    "although",
    "while",
    "when",
    "where",
    "which",
    "that",
    "who",
    "after",
    "before",
    "during",
    "with",
    "without",
    "through",
    "into",
    "from",
    "about",
    "under",
    "over"
  ]);

  const STOP_WORDS = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "of",
    "to",
    "in",
    "on",
    "for",
    "is",
    "are",
    "was",
    "were",
    "it",
    "this",
    "that",
    "then",
    "by",
    "as",
    "at",
    "be",
    "with",
    "not",
    "their",
    "they",
    "his",
    "her"
  ]);

  const CURATED_EMOJIS = [
    { emoji: "🏫", label: "school", terms: ["school", "student", "students", "class", "classroom", "teacher", "homework", "lesson"] },
    { emoji: "📚", label: "book", terms: ["book", "books", "read", "reading", "text", "chapter", "novel", "library"] },
    { emoji: "💡", label: "idea", terms: ["idea", "think", "thought", "understand", "learn", "concept", "meaning", "solution"] },
    { emoji: "⚠️", label: "warning", terms: ["warning", "danger", "risk", "problem", "threat", "caution", "harm"] },
    { emoji: "💵", label: "money", terms: ["money", "price", "cost", "pay", "paid", "dollar", "trade", "economy"] },
    { emoji: "🌎", label: "earth", terms: ["earth", "world", "planet", "global", "country", "nation", "environment"] },
    { emoji: "👤", label: "person", terms: ["person", "people", "human", "child", "adult", "friend", "family", "community"] },
    { emoji: "⏰", label: "time", terms: ["time", "hour", "minute", "day", "year", "past", "future", "history"] },
    { emoji: "❓", label: "question", terms: ["question", "ask", "why", "how", "what", "wonder", "unknown"] },
    { emoji: "⚖️", label: "law", terms: ["law", "legal", "court", "judge", "rule", "rights", "justice", "government"] },
    { emoji: "🍎", label: "food", terms: ["food", "eat", "meal", "fruit", "nutrition", "hungry"] },
    { emoji: "🔬", label: "science", terms: ["science", "experiment", "research", "data", "cell", "energy", "chemical"] },
    { emoji: "🏛️", label: "history", terms: ["history", "ancient", "empire", "war", "civilization", "century"] },
    { emoji: "❤️", label: "emotion", terms: ["love", "feel", "emotion", "happy", "sad", "angry", "fear", "hope"] },
    { emoji: "🏃", label: "action", terms: ["run", "move", "go", "act", "build", "create", "make", "work"] },
    { emoji: "🌱", label: "growth", terms: ["grow", "growth", "plant", "change", "develop", "improve"] },
    { emoji: "🔥", label: "energy", terms: ["fire", "heat", "energy", "power", "strong", "intense"] },
    { emoji: "🧠", label: "mind", terms: ["brain", "mind", "memory", "focus", "attention", "comprehend"] }
  ];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function splitIntoSentences(paragraph) {
    return paragraph
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) || [];
  }

  function tokenizeSentence(sentence) {
    return sentence.match(/[\w'-]+|[^\w\s]/g) || [];
  }

  function isWord(token) {
    return /^[A-Za-z0-9][A-Za-z0-9'-]*$/.test(token);
  }

  function countWords(tokens) {
    return tokens.filter(isWord).length;
  }

  function formatChunk(tokens) {
    return tokens
      .join(" ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([(])\s+/g, "$1")
      .replace(/\s+([)])/g, "$1");
  }

  function shouldBreak(token, wordCount, size) {
    const normalized = token.toLowerCase();
    return wordCount >= size.min && (BREAK_WORDS.has(normalized) || /[,;:]/.test(token));
  }

  function chunkSentence(sentence, chunkSize = "medium") {
    const size = SIZE_LIMITS[chunkSize] || SIZE_LIMITS.medium;
    const tokens = tokenizeSentence(sentence);
    const chunks = [];
    let current = [];

    for (const token of tokens) {
      current.push(token);
      const words = countWords(current);
      if (words >= size.max || shouldBreak(token, words, size)) {
        chunks.push(formatChunk(current));
        current = [];
      }
    }

    if (current.length) {
      const currentText = formatChunk(current);
      const previous = chunks[chunks.length - 1];
      if (previous && countWords(current) < size.min) {
        chunks[chunks.length - 1] = `${previous} ${currentText}`.replace(/\s+([,.;:!?])/g, "$1");
      } else {
        chunks.push(currentText);
      }
    }

    return chunks.filter((chunk) => countWords(tokenizeSentence(chunk)) > 0);
  }

  function emphasisLength(word) {
    const length = word.length;
    if (length <= 2) return 0;
    if (length <= 4) return Math.min(2, Math.ceil(length * 0.45));
    if (length <= 7) return Math.ceil(length * 0.45);
    return Math.ceil(length * 0.4);
  }

  function emphasizeWord(word) {
    const match = word.match(/^([A-Za-z0-9]+)(.*)$/);
    if (!match) return escapeHtml(word);

    const base = match[1];
    const rest = match[2] || "";
    const boldLength = emphasisLength(base);
    if (!boldLength) return escapeHtml(word);

    return `<strong>${escapeHtml(base.slice(0, boldLength))}</strong>${escapeHtml(base.slice(boldLength) + rest)}`;
  }

  function emphasizeText(text) {
    return escapeHtml(text).replace(/[A-Za-z0-9][A-Za-z0-9'-]*/g, (word) => emphasizeWord(word));
  }

  function getEstimatedMs(text, wpm = 300) {
    const words = Math.max(1, text.match(/\b[\w'-]+\b/g)?.length || 1);
    return Math.max(700, Math.round((words / Math.max(80, wpm)) * 60000));
  }

  function getWords(text) {
    return String(text || "").toLowerCase().match(/[a-z][a-z'-]*/g) || [];
  }

  function countSyllables(word) {
    const normalized = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!normalized) return 0;
    const trimmed = normalized.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
    const groups = trimmed.match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups?.length || 1);
  }

  function estimateTextComplexity(text) {
    const sentences = splitIntoSentences(String(text || ""));
    const words = getWords(text);
    const uniqueWords = new Set(words);
    const wordCount = words.length;
    const sentenceCount = Math.max(1, sentences.length);
    const totalCharacters = words.reduce((sum, word) => sum + word.length, 0);
    const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
    const complexWords = words.filter((word) => word.length >= 8 || countSyllables(word) >= 3);
    const avgSentenceWords = wordCount / sentenceCount;
    const avgWordLength = wordCount ? totalCharacters / wordCount : 0;
    const complexWordPercent = wordCount ? (complexWords.length / wordCount) * 100 : 0;
    const typeTokenRatio = wordCount ? uniqueWords.size / wordCount : 0;
    const fleschKincaidGrade = wordCount
      ? Math.max(0, (0.39 * avgSentenceWords) + (11.8 * (totalSyllables / wordCount)) - 15.59)
      : 0;
    const estimatedLexile = Math.round(Math.max(0, (fleschKincaidGrade * 115) + 180 + (complexWordPercent * 3)));
    const estimatedVocabularySize = Math.round(uniqueWords.size * (1 + typeTokenRatio) * 85);

    return {
      wordCount,
      sentenceCount,
      uniqueWordCount: uniqueWords.size,
      avgSentenceWords,
      avgWordLength,
      complexWordPercent,
      fleschKincaidGrade,
      estimatedLexile,
      estimatedVocabularySize
    };
  }

  function extractKeywords(text) {
    return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [])
      .filter((word) => !STOP_WORDS.has(word))
      .slice(0, 8);
  }

  function findCuratedEmoji(text) {
    const keywords = extractKeywords(text);
    for (const entry of CURATED_EMOJIS) {
      if (entry.terms.some((term) => keywords.includes(term))) {
        return { emoji: entry.emoji, label: entry.label, keyword: entry.terms.find((term) => keywords.includes(term)) };
      }
    }
    return null;
  }

  function processText(input) {
    const rawText = String(input.rawText || "").trim();
    const chunkSize = input.chunkSize || "medium";
    const wpm = input.wpm || 300;
    const paragraphs = rawText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
    const chunks = [];

    paragraphs.forEach((paragraph, paragraphIndex) => {
      splitIntoSentences(paragraph).forEach((sentence, sentenceIndex) => {
        const sentenceEmoji = findCuratedEmoji(sentence);
        chunkSentence(sentence, chunkSize).forEach((chunkText, chunkIndex) => {
          const chunkEmoji = findCuratedEmoji(chunkText) || sentenceEmoji;
          chunks.push({
            id: `${paragraphIndex}-${sentenceIndex}-${chunkIndex}`,
            paragraphIndex,
            sentenceIndex,
            text: chunkText,
            emphasizedHtml: emphasizeText(chunkText),
            emoji: chunkEmoji?.emoji,
            emojiLabel: chunkEmoji?.label,
            emojiKeyword: chunkEmoji?.keyword,
            estimatedMs: getEstimatedMs(chunkText, wpm)
          });
        });
      });
    });

    return chunks;
  }

  const api = {
    CURATED_EMOJIS,
    chunkSentence,
    emphasizeText,
    estimateTextComplexity,
    extractKeywords,
    findCuratedEmoji,
    getEstimatedMs,
    processText,
    splitIntoSentences
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.ReaderCore = api;
})(typeof window !== "undefined" ? window : globalThis);
