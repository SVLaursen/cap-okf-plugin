// The pilot harness (task 3.6): compares an agent's answers about a CAP app with and without the
// OKF bundle. Maintainer decision 2026-11-17: nothing here calls a model. Ask the questions to any
// agent yourself, once with the bundle and once without, and save its answers as files.
//
//   npm run pilot:score -- test/pilot/<set>          # prints a Markdown report
//
// A set is a folder with questions.yaml and answers/<run>.yaml; see test/pilot/README.md. The
// checks only count which expected facts an answer mentions and which wrong claims it makes, as
// whole words or phrases, without understanding negation ("not anyone can" still contains
// "anyone can"). The human reviewer judges the answers themselves (gate G4).
//
// Plain CommonJS, so it runs with node alone; it isn't part of the published package, and tsc
// doesn't check it (tests do: test/unit/pilot-score.test.ts). Its messages give the file and,
// where the YAML has one, the line, and a fix; as a dev tool it has no rule ids.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

/**
 * @typedef {{ id: string, question: string, expect: string[][], avoid: string[] }} Question
 * @typedef {{ domain: string, questions: Question[] }} QuestionSet
 * @typedef {{ name: string, agent: string, bundle: boolean, answers: Record<string, string> }} Run
 * @typedef {{ answered: boolean, expectFound: string[], expectMissing: string[], avoidHit: string[] }} Check
 */

/** An [okf] error for a pilot file: "[okf] <file>[:<line>] — <what>." and the fix. */
function pilotError(file, line, problem, fix) {
  const where = line === undefined ? file : `${file}:${line}`;
  const error = new Error(`[okf] ${where} — ${problem}.\n  ${fix}.`);
  error.stack = error.message;
  return error;
}

/** The YAML as plain data, and a way to find the line of a value in it. */
function loadYaml(text, file) {
  const lineCounter = new YAML.LineCounter();
  const document = YAML.parseDocument(text, { lineCounter });
  const syntaxError = document.errors[0];
  if (syntaxError !== undefined) {
    const line = syntaxError.linePos?.[0]?.line;
    throw pilotError(file, line, `isn't valid YAML (${syntaxError.code})`, "Fix the YAML");
  }
  const lineOf = (keyPath) => {
    const node = document.getIn(keyPath, true);
    const range = node && typeof node === "object" ? node.range : undefined;
    return range === undefined ? undefined : lineCounter.linePos(range[0]).line;
  };
  return { data: document.toJS() ?? {}, lineOf };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

// Text or a number, as YAML reads "id: 5"; anything else isn't a usable word.
function asText(value) {
  if (typeof value === "number") return String(value);
  return isNonEmptyString(value) ? value.trim() : undefined;
}

/** The question set in questions.yaml. Throws an [okf] error for anything missing or unclear. */
function parseQuestions(text, file) {
  const { data, lineOf } = loadYaml(text, file);
  if (!isNonEmptyString(data.domain)) {
    throw pilotError(
      file,
      undefined,
      "has no domain",
      "Add domain: <the app or business area the questions are about>",
    );
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw pilotError(
      file,
      undefined,
      "has no questions",
      "Add questions: a list of { id, question, expect }",
    );
  }
  const seen = new Set();
  const questions = data.questions.map((entry, index) => {
    const line = lineOf(["questions", index]);
    const question = parseQuestion(entry ?? {}, index, file, line);
    if (seen.has(question.id)) {
      throw pilotError(
        file,
        line,
        `the id ${question.id} is used twice`,
        "Give every question its own id",
      );
    }
    seen.add(question.id);
    return question;
  });
  return { domain: data.domain.trim(), questions };
}

/** @returns {Question} */
function parseQuestion(entry, index, file, line) {
  const id = asText(entry.id);
  if (id === undefined) {
    throw pilotError(
      file,
      line,
      `question ${index + 1} has no id`,
      "Add id: a short name, e.g. delete-book",
    );
  }
  if (!isNonEmptyString(entry.question)) {
    throw pilotError(
      file,
      line,
      `question ${id} has no question text`,
      "Add question: the text to ask the agent",
    );
  }
  if (!Array.isArray(entry.expect) || entry.expect.length === 0) {
    throw pilotError(
      file,
      line,
      `question ${id} has no expect list`,
      "Add expect: the facts a good answer mentions; a fact may be a list of alternative wordings",
    );
  }
  // A fact is a word or phrase, or a list of alternative wordings for the same fact.
  const expect = entry.expect.map((fact) => {
    const wordings = (Array.isArray(fact) ? fact : [fact]).map(asText);
    if (wordings.length === 0 || wordings.includes(undefined)) {
      throw pilotError(
        file,
        line,
        `question ${id} has an empty or non-text expected fact`,
        "Write each fact as a word or phrase, or a list of alternative wordings",
      );
    }
    return wordings;
  });
  return {
    id,
    question: entry.question.trim(),
    expect,
    avoid: avoidList(entry.avoid, id, file, line),
  };
}

// "avoid: anyone can" is one claim; a list holds several.
function avoidList(avoid, id, file, line) {
  if (avoid === undefined || avoid === null) return [];
  const claims = (Array.isArray(avoid) ? avoid : [avoid]).map(asText);
  if (claims.includes(undefined)) {
    throw pilotError(
      file,
      line,
      `question ${id} has an empty or non-text avoided claim`,
      "Write each claim as a word or phrase",
    );
  }
  return claims;
}

/** One run's answers, from answers/<run>.yaml; the run's name is the file name. */
function parseRun(text, file) {
  const { data, lineOf } = loadYaml(text, file);
  if (typeof data.bundle !== "boolean") {
    throw pilotError(
      file,
      undefined,
      "doesn't say whether the agent had the bundle",
      "Add bundle: true (it could read the bundle) or bundle: false",
    );
  }
  const answers = data.answers ?? {};
  if (typeof answers !== "object" || Array.isArray(answers)) {
    throw pilotError(
      file,
      undefined,
      "has answers that aren't a map",
      "Write answers: as <question id>: <answer text>",
    );
  }
  return {
    name: path.basename(file).replace(/\.ya?ml$/, ""),
    agent: isNonEmptyString(data.agent) ? data.agent.trim() : "unknown agent",
    bundle: data.bundle,
    answers: answerTexts(answers, file, lineOf),
  };
}

/** The answers as text by question id. A key left empty (a placeholder) is no answer yet. */
function answerTexts(answers, file, lineOf) {
  const texts = {};
  for (const [id, answer] of Object.entries(answers)) {
    if (answer === null || answer === undefined || String(answer).trim() === "") continue;
    if (typeof answer !== "string" && typeof answer !== "number") {
      throw pilotError(
        file,
        lineOf(["answers", id]),
        `the answer to ${id} isn't text`,
        "Write the answer as text, e.g. with >",
      );
    }
    texts[id] = String(answer);
  }
  return texts;
}

// Lower case and single spaces, so "Admin   Service" matches "admin service".
function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

/**
 * Whether `text` mentions `wording` as a whole word or phrase: "reserve" isn't found in
 * "BookReserved" or "reserved". Where the wording starts or ends with punctuation ("reserve("),
 * that end needs no boundary.
 */
function mentions(text, wording) {
  const target = normalize(wording);
  if (target === "") return false;
  const needsBoundaryBefore = WORD_CHARACTER.test(target[0]);
  const needsBoundaryAfter = WORD_CHARACTER.test(target[target.length - 1]);
  for (let index = text.indexOf(target); index !== -1; index = text.indexOf(target, index + 1)) {
    const before = text[index - 1];
    const after = text[index + target.length];
    const startsWord = !needsBoundaryBefore || before === undefined || !WORD_CHARACTER.test(before);
    const endsWord = !needsBoundaryAfter || after === undefined || !WORD_CHARACTER.test(after);
    if (startsWord && endsWord) return true;
  }
  return false;
}

/** Which expected facts the answer mentions, which it misses, and which avoided claims it makes. */
function checkAnswer(question, answer) {
  if (answer === undefined || answer.trim() === "") {
    return {
      answered: false,
      expectFound: [],
      expectMissing: question.expect.map((fact) => fact[0]),
      avoidHit: [],
    };
  }
  const text = normalize(answer);
  const expectFound = [];
  const expectMissing = [];
  for (const wordings of question.expect) {
    const match = wordings.find((wording) => mentions(text, wording));
    if (match === undefined) expectMissing.push(wordings[0]);
    else expectFound.push(match);
  }
  const avoidHit = question.avoid.filter((claim) => mentions(text, claim));
  return { answered: true, expectFound, expectMissing, avoidHit };
}

// Runs without the bundle first, so each comparison reads from "without" to "with".
function sortedRuns(runs) {
  return [...runs].sort(
    (a, b) => Number(a.bundle) - Number(b.bundle) || (a.name < b.name ? -1 : 1),
  );
}

function cell(text) {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ");
}

/** The Markdown report: a summary per run, then each question with every run's answer. */
function report(set, runs) {
  const ordered = sortedRuns(runs);
  const totalFacts = set.questions.reduce((sum, question) => sum + question.expect.length, 0);
  const lines = [
    `# Pilot: ${set.domain}`,
    "",
    "The counts show which expected facts each answer mentions and which wrong claims it makes.",
    "They are a guide only. The human reviewer judges the answers themselves.",
    "",
    "| Run | Agent | Bundle | Expected facts found | Avoided claims made | Not answered |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const run of ordered) {
    const checks = set.questions.map((question) => checkAnswer(question, run.answers[question.id]));
    const found = checks.reduce((sum, check) => sum + check.expectFound.length, 0);
    const avoided = checks.reduce((sum, check) => sum + check.avoidHit.length, 0);
    const unanswered = checks.filter((check) => !check.answered).length;
    lines.push(
      `| ${cell(run.name)} | ${cell(run.agent)} | ${run.bundle ? "yes" : "no"} | ${found} of ${totalFacts} | ${avoided} | ${unanswered} |`,
    );
  }
  for (const question of set.questions) {
    lines.push("", `## ${question.id}: ${question.question}`);
    for (const run of ordered) {
      const check = checkAnswer(question, run.answers[question.id]);
      const missing = check.expectMissing.length === 0 ? "none" : check.expectMissing.join(", ");
      const avoided = check.avoidHit.length === 0 ? "none" : check.avoidHit.join(", ");
      const answer = run.answers[question.id];
      lines.push(
        "",
        `**${run.name}** (bundle: ${run.bundle ? "yes" : "no"}): missing ${missing}; avoided claims made: ${avoided}`,
        "",
      );
      lines.push(
        answer === undefined
          ? "> (no answer)"
          : answer
              .trim()
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n"),
      );
    }
  }
  return lines.join("\n") + "\n";
}

/** A set folder: questions.yaml and every answers/*.yaml in it; answers must use question ids. */
function readSet(folder) {
  const questionsFile = path.join(folder, "questions.yaml");
  if (!fs.existsSync(questionsFile)) {
    throw pilotError(questionsFile, undefined, "is missing", "Create it, see test/pilot/README.md");
  }
  const set = parseQuestions(fs.readFileSync(questionsFile, "utf8"), questionsFile);
  const ids = new Set(set.questions.map((question) => question.id));
  const answersFolder = path.join(folder, "answers");
  const runFiles = fs.existsSync(answersFolder)
    ? fs
        .readdirSync(answersFolder)
        .filter((name) => /\.ya?ml$/.test(name))
        .sort()
    : [];
  const runs = runFiles.map((name) => {
    const file = path.join(answersFolder, name);
    const run = parseRun(fs.readFileSync(file, "utf8"), file);
    // An answer under an unknown id, e.g. a typo, would otherwise be lost silently.
    for (const id of Object.keys(run.answers)) {
      if (!ids.has(id)) {
        throw pilotError(
          file,
          undefined,
          `answers ${id}, which isn't a question in questions.yaml`,
          "Fix the id, or add the question",
        );
      }
    }
    return run;
  });
  return { ...set, runs };
}

module.exports = { parseQuestions, parseRun, checkAnswer, report, readSet };

if (require.main === module) {
  const folder = process.argv[2];
  if (folder === undefined) {
    console.error(
      "[okf] pilot — no question set given.\n  Run: npm run pilot:score -- test/pilot/<set>.",
    );
    process.exit(1);
  }
  try {
    // The folder as typed, so messages name files the way the developer does.
    const set = readSet(folder);
    process.stdout.write(report(set, set.runs));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
