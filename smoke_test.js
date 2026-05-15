const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "index.html");

function fail(message) {
  console.error(`Smoke test failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  fail("index.html does not exist");
}

const html = fs.readFileSync(indexPath, "utf8");

if (html.trim().length === 0) {
  fail("index.html is empty");
}

const requiredSnippets = [
  "vocabularyWords",
  "definition",
  "example",
  "difficulty",
  "previousButton",
  "nextButton",
  "toggleDefinitionButton",
  "learnedButton",
  "Word 1 of 6",
  "0 learned"
];

for (const snippet of requiredSnippets) {
  if (!html.includes(snippet)) {
    fail(`missing required snippet: ${snippet}`);
  }
}

const wordMatches = html.match(/word:\s*"[^"]+"/g) || [];
if (wordMatches.length < 6) {
  fail(`expected at least 6 vocabulary words, found ${wordMatches.length}`);
}

const definitionMatches = html.match(/definition:\s*"[^"]+"/g) || [];
const exampleMatches = html.match(/example:\s*"[^"]+"/g) || [];
const difficultyMatches = html.match(/difficulty:\s*"[^"]+"/g) || [];

if (definitionMatches.length < 6 || exampleMatches.length < 6 || difficultyMatches.length < 6) {
  fail("each vocabulary word must include definition, example, and difficulty data");
}

console.log("Smoke test passed: vocabulary webapp files are present and contain required content.");
