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
  "mistakeReviewPanel",
  "mistakeReviewList",
  "retryMistakesButton",
  "themeToggleButton",
  "difficultyFilterControls",
  "dueStateFilterControls",
  "dueReminderBadge",
  "activeDueStateStatus",
  "nextReviewAt",
  "reviewInterval",
  "currentWordTags",
  "addTagButton",
  "tagInput",
  "practiceSourceSelect",
  "customListNameInput",
  "customListTagFiltersInput",
  "saveCustomListButton",
  "applyPracticeSourceButton",
  "vocabQuizTheme",
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
    style: {},
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
const storage = new Map();
const now = Date.now();

storage.set(
  "vocabPracticeProgress",
  JSON.stringify({
    learnedWords: [],
    wordStats: {
      resilient: { attempts: 1, correct: 0, incorrect: 1, lastResult: false }
    },
    reviewMetadata: {
      resilient: { nextReviewAt: now - 60_000, reviewInterval: 1, reviewCount: 1 }
    }
  })
);

const localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  }
};
const document = {
  getElementById(id) {
    if (!elements.has(id)) {
      elements.set(id, makeElement(id));
    }
    return elements.get(id);
  },
  createElement(tagName) {
    return makeElement(tagName);
  },
  body: makeElement("body")
};

vm.runInNewContext(scriptMatch[1], { document, Set, localStorage });

const quizOptions = elements.get("quizOptions");
const feedbackText = elements.get("feedbackText");
const scoreProgress = elements.get("scoreProgress");
const finalScore = elements.get("finalScore");
const mistakeReviewPanel = elements.get("mistakeReviewPanel");
const mistakeReviewList = elements.get("mistakeReviewList");
const retryMistakesButton = elements.get("retryMistakesButton");
const themeToggleButton = elements.get("themeToggleButton");
const difficultyText = elements.get("difficultyText");
const difficultyFilterControls = elements.get("difficultyFilterControls");
const dueStateFilterControls = elements.get("dueStateFilterControls");
const dueReminderBadge = elements.get("dueReminderBadge");
const wordProgress = elements.get("wordProgress");
const streakProgress = elements.get("streakProgress");
const dueCount = elements.get("dueCount");
const overdueCount = elements.get("overdueCount");
const wordText = elements.get("wordText");
const tagInput = elements.get("tagInput");
const addTagButton = elements.get("addTagButton");
const currentWordTags = elements.get("currentWordTags");
const customListNameInput = elements.get("customListNameInput");
const customListTagFiltersInput = elements.get("customListTagFiltersInput");
const saveCustomListButton = elements.get("saveCustomListButton");
const customListSelect = elements.get("customListSelect");
const practiceSourceSelect = elements.get("practiceSourceSelect");
const applyPracticeSourceButton = elements.get("applyPracticeSourceButton");
const practiceSourceStatus = elements.get("practiceSourceStatus");

assert(quizOptions.children.length >= 4, "quiz mode should render multiple answer choices");
assert(difficultyFilterControls.children.length === 4, "difficulty filter should render all filter options");
assert(dueStateFilterControls.children.length === 4, "due-state filter should render all filter options");
assert(
  (Number.parseInt(dueCount.textContent || "0", 10) || 0) + (Number.parseInt(overdueCount.textContent || "0", 10) || 0) === 1,
  "review summary should count due or overdue words from stored metadata"
);
assert(dueReminderBadge.textContent.includes("1"), "due reminder badge should show current due count");
assert(scoreProgress.textContent === "Score 0 / 0", "initial score should show zero answered questions");
assert(wordProgress.textContent === "Question 1 of 12", "progress should start from question 1 of 12");
assert(streakProgress.textContent.includes("Streak"), "streak progress should be visible");
assert(finalScore.textContent.includes("Complete all 12 questions"), "final score should show remaining session work");
assert(themeToggleButton, "theme toggle button should exist for quiz interface");
assert(themeToggleButton.textContent.toLowerCase().includes("dark"), "theme toggle should advertise dark mode action");
assert(localStorage.getItem("vocabQuizTheme") === "light", "default theme should persist as light");

assert(addTagButton && tagInput && currentWordTags, "tag controls should exist");
assert(saveCustomListButton && customListSelect, "custom list controls should exist");
assert(practiceSourceSelect && applyPracticeSourceButton, "practice source controls should exist");

tagInput.value = "travel";
addTagButton.click();

assert(currentWordTags.children.length > 0, "adding a tag should render at least one tag chip");
assert(currentWordTags.children[0].textContent.toLowerCase().includes("travel"), "rendered tag chip should include the entered tag text");

const removeFirstTagButton = currentWordTags.children[0].children[0];
assert(removeFirstTagButton, "tag chip should include remove action");
removeFirstTagButton.click();
assert(currentWordTags.children.length === 0, "removing a tag should clear it from current word tag chips");

tagInput.value = "travel";
addTagButton.click();

customListNameInput.value = "Travel Words";
customListTagFiltersInput.value = "travel";
saveCustomListButton.click();

assert(customListSelect.children.length > 0, "saving a custom list should render it in the custom list selector");
assert(customListSelect.children[0].textContent.includes("Travel Words"), "custom list selector should show saved list name");

practiceSourceSelect.value = customListSelect.children[0].value;
applyPracticeSourceButton.click();

assert(practiceSourceStatus.textContent.includes("Travel Words"), "practice source status should show selected custom list");
assert(wordText.textContent === "resilient", "custom list practice source should load matching tagged word");

practiceSourceSelect.value = "default";
applyPracticeSourceButton.click();
assert(practiceSourceStatus.textContent.toLowerCase().includes("default"), "default practice source should remain selectable");

themeToggleButton.click();

assert(themeToggleButton.textContent.toLowerCase().includes("light"), "theme toggle should switch to light mode action after enabling dark mode");
assert(localStorage.getItem("vocabQuizTheme") === "dark", "dark mode selection should persist in localStorage");

const easyFilterButton = difficultyFilterControls.children.find((button) => button.textContent === "Easy");
assert(easyFilterButton, "easy filter button should exist");

easyFilterButton.click();

assert(difficultyText.textContent === "Easy", "difficulty filter should update visible card to easy words");
elements.get("nextButton").click();
assert(difficultyText.textContent === "Easy", "navigating after filtering should keep only filtered difficulty words");

const allFilterButton = difficultyFilterControls.children.find((button) => button.textContent === "All");
assert(allFilterButton, "all filter button should exist");

allFilterButton.click();
assert(difficultyText.textContent === "Medium", "all filter should restore unfiltered card list behavior");

const dueFilterButton = dueStateFilterControls.children.find((button) => button.textContent === "Due");
assert(dueFilterButton, "due-state due filter button should exist");
dueFilterButton.click();
assert(difficultyText.textContent === "Medium", "due-state filter should keep due words visible");

const overdueFilterButton = dueStateFilterControls.children.find((button) => button.textContent === "Overdue");
assert(overdueFilterButton, "due-state overdue filter button should exist");
overdueFilterButton.click();
assert(difficultyText.textContent === "Medium", "overdue filter should show past-due reviewed words");
dueFilterButton.click();

const correctButton = quizOptions.children.find((button) => button.textContent.includes("recover quickly"));
assert(correctButton, "first quiz should include the correct definition for resilient");

correctButton.click();

assert(feedbackText.textContent.includes("Correct"), "clicking the correct answer should show immediate positive feedback");
assert(scoreProgress.textContent === "Score 1 / 1", "score should update after a correct quiz answer");
assert(dueCount.textContent === "0", "due count should update after a review action");
assert(
  dueReminderBadge.hidden === true || dueReminderBadge.textContent.includes("0"),
  "due reminder badge should hide or show zero when there are no due words"
);

overdueFilterButton.click();
assert(wordProgress.textContent.includes("Question"), "overdue filter should still render a question view");

const allDueStateButton = dueStateFilterControls.children.find((button) => button.textContent === "All");
assert(allDueStateButton, "due-state all filter button should exist");
allDueStateButton.click();

const refreshedCorrectButton = quizOptions.children.find((button) => button.textContent.includes("recover quickly"));
assert(refreshedCorrectButton, "after resetting due-state filter, first quiz should still include resilient definition");
refreshedCorrectButton.click();
assert(scoreProgress.textContent === "Score 1 / 1", "score should restart and increment after re-answering first question");

const savedProgressRaw = localStorage.getItem("vocabPracticeProgress");
assert(savedProgressRaw, "progress should be persisted after review action");
const savedProgress = JSON.parse(savedProgressRaw);
assert(savedProgress.reviewMetadata, "saved progress should include review metadata");
assert(savedProgress.reviewMetadata.resilient, "review metadata should include reviewed word state");
assert(typeof savedProgress.reviewMetadata.resilient.nextReviewAt === "number", "saved review metadata should include nextReviewAt timestamp");
assert(typeof savedProgress.reviewMetadata.resilient.reviewInterval === "number", "saved review metadata should include reviewInterval days");

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
assert(mistakeReviewPanel.hidden === false, "mistake review panel should be visible after session ends when mistakes exist");
assert(mistakeReviewList.children.length > 0, "mistake review list should render missed words");
assert(mistakeReviewList.children[0].textContent.includes("Chosen:"), "mistake review should include chosen answer text");
assert(mistakeReviewList.children[0].textContent.includes("Correct:"), "mistake review should include correct answer text");
assert(retryMistakesButton.disabled === false, "retry button should be enabled when mistakes exist");

retryMistakesButton.click();

assert(scoreProgress.textContent === "Score 0 / 0", "retry round should reset score tracking");
assert(wordProgress.textContent.includes("Question 1 of"), "retry round should restart question progress");
assert(finalScore.textContent.includes("Complete all"), "retry round should reset final score prompt");
assert(mistakeReviewPanel.hidden === true, "mistake review panel should hide during focused retry round");

console.log("Smoke test passed: vocabulary practice UI and quiz interactions are exposed.");
