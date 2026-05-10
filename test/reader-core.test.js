const test = require("node:test");
const assert = require("node:assert/strict");
const {
  chunkSentence,
  emphasizeText,
  estimateTextComplexity,
  findCuratedEmoji,
  processText,
  splitIntoSentences
} = require("../public/reader-core");

test("splits paragraphs into sentences", () => {
  assert.deepEqual(splitIntoSentences("Plants make sugar. They release oxygen!"), [
    "Plants make sugar.",
    "They release oxygen!"
  ]);
});

test("chunks a sentence into readable phrases", () => {
  const chunks = chunkSentence(
    "The plant captures energy from the sun and changes it into sugar.",
    "medium"
  );

  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(" "), "The plant captures energy from the sun and changes it into sugar.");
});

test("adds focus bolding without bolding tiny words", () => {
  const html = emphasizeText("A student reads difficult chapters.");
  assert.match(html, /A/);
  assert.match(html, /<strong>stu<\/strong>dent/);
  assert.match(html, /<strong>diff<\/strong>icult/);
});

test("finds curated emojis for student concepts", () => {
  const result = findCuratedEmoji("The student reads a science book.");
  assert.ok(result);
  assert.ok(result.emoji);
});

test("maps broader phrase concepts to emoji cues", () => {
  assert.equal(findCuratedEmoji("The chart compares average rainfall by region.").label, "data");
  assert.equal(findCuratedEmoji("The character explains the problem in the story.").label, "warning");
  assert.equal(findCuratedEmoji("Finally, the team chooses a better plan.").label, "group");
});

test("falls back to a key idea cue for unmatched phrases", () => {
  const result = findCuratedEmoji("Curious learners examine unusual vocabulary.");
  assert.equal(result.label, "key idea");
  assert.equal(result.emoji, "📌");
});

test("processText returns PRD-shaped chunks", () => {
  const chunks = processText({
    rawText: "History helps people understand government and law.",
    chunkSize: "small",
    wpm: 250
  });

  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].paragraphIndex, 0);
  assert.equal(chunks[0].sentenceIndex, 0);
  assert.ok(chunks[0].emphasizedHtml.includes("<strong>"));
  assert.ok(chunks[0].estimatedMs >= 700);
});

test("estimates text complexity for grade comparisons", () => {
  const stats = estimateTextComplexity(
    "Photosynthesis transforms sunlight into chemical energy. Chlorophyll captures light inside plant cells."
  );

  assert.equal(stats.wordCount, 12);
  assert.ok(stats.uniqueWordCount >= 10);
  assert.ok(stats.estimatedLexile > 0);
  assert.ok(stats.estimatedVocabularySize > 0);
});
