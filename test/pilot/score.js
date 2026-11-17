// The pilot harness (task 3.6): compares an agent's answers about a CAP app with and without the
// OKF bundle. Maintainer decision 2026-11-17: nothing here calls a model. Ask the questions to any
// agent yourself, once with the bundle and once without, and save its answers as files.
//
//   npm run pilot:score -- test/pilot/<set>          # prints a Markdown report
//
// A set is a folder with questions.yaml and answers/<run>.yaml; see test/pilot/README.md. The
// checks only count which expected facts an answer mentions and which wrong claims it makes; the
// human reviewer judges the answers themselves (gate G4).
//
// Plain CommonJS, so it runs with node alone; it isn't part of the published package.
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

/** An [okf] error for a pilot file: what is wrong and how to fix it. */
function pilotError(file, problem, fix) {
  const error = new Error(`[okf] ${file} — ${problem}.\n  ${fix}.`);
  error.stack = error.message;
  return error;
}

function parseYaml(text, file) {
  try {
    return YAML.parse(text);
  } catch (error) {
    throw pilotError(file, `isn't valid YAML (${error.message.split("\n")[0]})`, "Fix the YAML");
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** The question set in questions.yaml. Throws an [okf] error for anything missing or unclear. */
function parseQuestions(text, file) {
  const data = parseYaml(text, file) ?? {};
  if (!isNonEmptyString(data.domain)) {
    throw pilotError(
      file,
      "has no domain",
      "Add domain: <the app or business area the questions are about>",
    );
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw pilotError(file, "has no questions", "Add questions: a list of { id, question, expect }");
  }
  const seen = new Set();
  const questions = data.questions.map((entry, index) => {
    const question = parseQuestion(entry ?? {}, index, file);
    if (seen.has(question.id)) {
      throw pilotError(
        file,
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
function parseQuestion(entry, index, file) {
  if (!isNonEmptyString(entry.id)) {
    throw pilotError(
      file,
      `question ${index + 1} has no id`,
      "Add id: a short name, e.g. delete-book",
    );
  }
  const id = String(entry.id).trim();
  if (!isNonEmptyString(entry.question)) {
    throw pilotError(
      file,
      `question ${id} has no question text`,
      "Add question: the text to ask the agent",
    );
  }
  if (!Array.isArray(entry.expect) || entry.expect.length === 0) {
    throw pilotError(
      file,
      `question ${id} has no expect list`,
      "Add expect: the facts a good answer mentions; a fact may be a list of alternative wordings",
    );
  }
  // A fact is a word or phrase, or a list of alternative wordings for the same fact.
  const expect = entry.expect.map((fact) => (Array.isArray(fact) ? fact : [fact]).map(String));
  const avoid = Array.isArray(entry.avoid) ? entry.avoid.map(String) : [];
  return { id, question: entry.question.trim(), expect, avoid };
}

/** One run's answers, from answers/<run>.yaml; the run's name is the file name. */
function parseRun(text, file) {
  const data = parseYaml(text, file) ?? {};
  if (typeof data.bundle !== "boolean") {
    throw pilotError(
      file,
      "doesn't say whether the agent had the bundle",
      "Add bundle: true (it could read the bundle) or bundle: false",
    );
  }
  const answers = data.answers ?? {};
  if (typeof answers !== "object" || Array.isArray(answers)) {
    throw pilotError(
      file,
      "has answers that aren't a map",
      "Write answers: as <question id>: <answer text>",
    );
  }
  return {
    name: path.basename(file).replace(/\.ya?ml$/, ""),
    agent: isNonEmptyString(data.agent) ? data.agent.trim() : "unknown agent",
    bundle: data.bundle,
    answers: Object.fromEntries(
      Object.entries(answers).map(([id, answer]) => [id, String(answer)]),
    ),
  };
}

// Lower case and single spaces, so "Admin   Service" matches "admin service".
function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
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
    const match = wordings.find((wording) => text.includes(normalize(wording)));
    if (match === undefined) expectMissing.push(wordings[0]);
    else expectFound.push(match);
  }
  const avoidHit = question.avoid.filter((claim) => text.includes(normalize(claim)));
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
    lines.push("", `## ${question.id}: ${question.question}`, "");
    for (const run of ordered) {
      const check = checkAnswer(question, run.answers[question.id]);
      const missing = check.expectMissing.length === 0 ? "none" : check.expectMissing.join(", ");
      const avoided = check.avoidHit.length === 0 ? "none" : check.avoidHit.join(", ");
      lines.push(
        `**${run.name}** (bundle: ${run.bundle ? "yes" : "no"}): missing ${missing}; avoided claims made: ${avoided}`,
      );
      lines.push("");
      const answer = run.answers[question.id];
      lines.push(
        answer === undefined
          ? "> (no answer)"
          : answer
              .trim()
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n"),
      );
      lines.push("");
    }
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}

/** A set folder: questions.yaml and every answers/*.yaml in it. */
function readSet(folder) {
  const questionsFile = path.join(folder, "questions.yaml");
  if (!fs.existsSync(questionsFile)) {
    throw pilotError(questionsFile, "is missing", "Create it, see test/pilot/README.md");
  }
  const set = parseQuestions(fs.readFileSync(questionsFile, "utf8"), questionsFile);
  const answersFolder = path.join(folder, "answers");
  const runFiles = fs.existsSync(answersFolder)
    ? fs
        .readdirSync(answersFolder)
        .filter((name) => /\.ya?ml$/.test(name))
        .sort()
    : [];
  const runs = runFiles.map((name) => {
    const file = path.join(answersFolder, name);
    return parseRun(fs.readFileSync(file, "utf8"), file);
  });
  return { ...set, runs };
}

module.exports = { parseQuestions, parseRun, checkAnswer, report, readSet };

if (require.main === module) {
  const folder = process.argv[2];
  if (folder === undefined) {
    console.error(
      "[okf] pilot — no question set given.\n  Run: npm run pilot:score -- test/pilot/<set>",
    );
    process.exit(1);
  }
  try {
    const set = readSet(path.resolve(folder));
    process.stdout.write(report(set, set.runs));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
