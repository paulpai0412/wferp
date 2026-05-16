const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const indexPath = path.join(__dirname, "index.html");

function fail(message) {
  console.error(`Smoke test failed: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

if (!fs.existsSync(indexPath)) {
  fail("index.html does not exist");
}

const html = fs.readFileSync(indexPath, "utf8");

assert(html.trim().length > 0, "index.html is empty");

const requiredSnippets = [
  "vocabularyWords",
  "SESSION_LENGTH",
  "wordStats",
  "streakProgress",
  "definition",
  "example",
  "difficulty",
  "quizOptions",
  "feedbackText",
  "scoreProgress",
  "finalScore",
  "chooseQuizAnswer",
  "Question 1 of 12",
  "Streak 0 days",
  "Score 0 / 0"
];

for (const snippet of requiredSnippets) {
  assert(html.includes(snippet), `missing required snippet: ${snippet}`);
}

const wordMatches = html.match(/word:\s*"[^"]+"/g) || [];
assert(wordMatches.length >= 8, `expected at least 8 vocabulary words, found ${wordMatches.length}`);

const definitionMatches = html.match(/definition:\s*"[^"]+"/g) || [];
const exampleMatches = html.match(/example:\s*"[^"]+"/g) || [];
const difficultyMatches = html.match(/difficulty:\s*"[^"]+"/g) || [];

assert(
  definitionMatches.length >= 8 && exampleMatches.length >= 8 && difficultyMatches.length >= 8,
  "each vocabulary word must include definition, example, and difficulty data"
);

const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
assert(scriptMatch, "index.html must include an inline script");

function makeElement(id) {
  const listeners = {};
  const childNodes = [];
  const element = {
    id,
    textContent: "",
    disabled: false,
    className: "",
    classList: {
      values: new Set(),
      add(value) {
        this.values.add(value);
      },
      remove(value) {
        this.values.delete(value);
      },
      contains(value) {
        return this.values.has(value);
      }
    },
    appendChild(child) {
      childNodes.push(child);
      return child;
    },
    addEventListener(event, callback) {
      listeners[event] = callback;
    },
    click() {
      if (listeners.click) {
        listeners.click({ currentTarget: this });
      }
    }
  };

  Object.defineProperty(element, "innerHTML", {
    get() {
      return "";
    },
    set() {
      childNodes.length = 0;
    }
  });

  Object.defineProperty(element, "children", {
    get() {
      return childNodes;
    }
  });

  return element;
}

const elements = new Map();
const document = {
  getElementById(id) {
    if (!elements.has(id)) {
      elements.set(id, makeElement(id));
    }
    return elements.get(id);
  },
  createElement(tagName) {
    return makeElement(tagName);
  }
};

vm.runInNewContext(scriptMatch[1], { document, Set });

const quizOptions = elements.get("quizOptions");
const feedbackText = elements.get("feedbackText");
const scoreProgress = elements.get("scoreProgress");
const finalScore = elements.get("finalScore");
const wordProgress = elements.get("wordProgress");
const streakProgress = elements.get("streakProgress");

assert(quizOptions.children.length >= 4, "quiz mode should render multiple answer choices");
assert(scoreProgress.textContent === "Score 0 / 0", "initial score should show zero answered questions");
assert(wordProgress.textContent === "Question 1 of 12", "progress should start from question 1 of 12");
assert(streakProgress.textContent.includes("Streak"), "streak progress should be visible");
assert(finalScore.textContent.includes("Complete all 12 questions"), "final score should show remaining session work");

const correctButton = quizOptions.children.find((button) => button.textContent.includes("recover quickly"));
assert(correctButton, "first quiz should include the correct definition for resilient");

correctButton.click();

assert(feedbackText.textContent.includes("Correct"), "clicking the correct answer should show immediate positive feedback");
assert(scoreProgress.textContent === "Score 1 / 1", "score should update after a correct quiz answer");

elements.get("nextButton").click();
const wrongButton = quizOptions.children.find((button) => !button.textContent.includes("attention to detail"));
assert(wrongButton, "second quiz should include an incorrect choice");

wrongButton.click();

assert(feedbackText.textContent.includes("Not quite"), "clicking an incorrect answer should show immediate corrective feedback");
assert(scoreProgress.textContent === "Score 1 / 2", "score should track correct answers against attempts");

for (let index = 0; index < 10; index += 1) {
  elements.get("nextButton").click();
  const options = quizOptions.children;
  options[0].click();
}

assert(finalScore.textContent.includes("Session summary:"), "after 12 attempts the session summary should appear");
assert(finalScore.textContent.includes("Weak words:"), "session summary should include weak words");
assert(finalScore.textContent.includes("Daily streak:"), "session summary should include daily streak");

console.log("Smoke test passed: vocabulary practice UI and quiz interactions are exposed.");
