import path from "node:path";

// Task 3.6: the pilot harness (test/pilot/). Maintainer decision 2026-11-17: answers are
// collected into files (from any agent, with and without the bundle) and the script compares
// them; nothing calls a model. The human supplies the domain and questions, and judges.

interface Check {
  expectFound: string[];
  expectMissing: string[];
  avoidHit: string[];
}

interface PilotModule {
  parseQuestions(text: string, file: string): { domain: string; questions: Question[] };
  parseRun(text: string, file: string): Run;
  checkAnswer(question: Question, answer: string | undefined): Check & { answered: boolean };
  report(set: { domain: string; questions: Question[] }, runs: Run[]): string;
  readSet(folder: string): { domain: string; questions: Question[]; runs: Run[] };
}

interface Question {
  id: string;
  question: string;
  expect: string[][];
  avoid: string[];
}

interface Run {
  name: string;
  agent: string;
  bundle: boolean;
  answers: Record<string, string>;
}

const pilot = jest.requireActual<PilotModule>("../pilot/score.js");

const QUESTIONS = `
domain: Bookshop
questions:
  - id: delete-book
    question: Who may delete a book?
    expect:
      - catalog-manager
      - [AdminService, admin service]
    avoid: [anyone]
  - id: genres
    question: Can genres be nested?
    expect: [parent]
`;

describe("parseQuestions", () => {
  test("reads the domain and questions; one expected fact may have alternatives", () => {
    const set = pilot.parseQuestions(QUESTIONS, "questions.yaml");
    expect(set.domain).toBe("Bookshop");
    expect(set.questions).toEqual([
      {
        id: "delete-book",
        question: "Who may delete a book?",
        expect: [["catalog-manager"], ["AdminService", "admin service"]],
        avoid: ["anyone"],
      },
      { id: "genres", question: "Can genres be nested?", expect: [["parent"]], avoid: [] },
    ]);
  });

  test.each([
    ["questions: []", /^\[okf\] questions\.yaml — has no domain/],
    ["domain: X\nquestions: []", /^\[okf\] questions\.yaml — has no questions/],
    [
      "domain: X\nquestions:\n  - id: a\n    question: Q?\n",
      /^\[okf\] questions\.yaml — question a has no expect list/,
    ],
    [
      "domain: X\nquestions:\n  - { id: a, question: Q?, expect: [x] }\n  - { id: a, question: R?, expect: [y] }\n",
      /^\[okf\] questions\.yaml — the id a is used twice/,
    ],
    [
      "domain: X\nquestions:\n  - { question: Q?, expect: [x] }\n",
      /^\[okf\] questions\.yaml — question 1 has no id/,
    ],
    ["domain: [", /^\[okf\] questions\.yaml — isn't valid YAML/],
  ])("refuses %j with an [okf] message and a fix", (text, message) => {
    expect(() => pilot.parseQuestions(text, "questions.yaml")).toThrow(message);
  });
});

describe("parseRun", () => {
  test("reads the agent, whether it had the bundle, and the answers by question id", () => {
    const run = pilot.parseRun(
      "agent: some agent\nbundle: true\nanswers:\n  delete-book: Only a catalog-manager.\n",
      "answers/with-bundle.yaml",
    );
    expect(run).toEqual({
      name: "with-bundle",
      agent: "some agent",
      bundle: true,
      answers: { "delete-book": "Only a catalog-manager." },
    });
  });

  test("refuses a run that doesn't say whether it had the bundle", () => {
    expect(() => pilot.parseRun("agent: a\nanswers: {}\n", "answers/x.yaml")).toThrow(
      /^\[okf\] answers\/x\.yaml — doesn't say whether the agent had the bundle/,
    );
  });
});

describe("checkAnswer", () => {
  const [deleteBook] = pilot.parseQuestions(QUESTIONS, "q.yaml").questions;

  test("finds expected facts and avoided claims, ignoring case and spacing", () => {
    expect(
      pilot.checkAnswer(
        deleteBook!,
        "Users with the CATALOG-MANAGER role, through the Admin   Service.",
      ),
    ).toEqual({
      answered: true,
      expectFound: ["catalog-manager", "admin service"],
      expectMissing: [],
      avoidHit: [],
    });
  });

  test("reports what is missing and what should have been avoided", () => {
    expect(pilot.checkAnswer(deleteBook!, "Anyone can.")).toEqual({
      answered: true,
      expectFound: [],
      expectMissing: ["catalog-manager", "AdminService"],
      avoidHit: ["anyone"],
    });
  });

  test("a missing answer counts as not answered", () => {
    expect(pilot.checkAnswer(deleteBook!, undefined)).toMatchObject({
      answered: false,
      expectFound: [],
    });
  });
});

describe("report", () => {
  test("a Markdown table per question and a summary per run, without and with the bundle", () => {
    const set = pilot.parseQuestions(QUESTIONS, "q.yaml");
    const runs: Run[] = [
      {
        name: "with",
        agent: "A",
        bundle: true,
        answers: {
          "delete-book": "catalog-manager via AdminService",
          genres: "Yes, through parent.",
        },
      },
      { name: "without", agent: "A", bundle: false, answers: { "delete-book": "Anyone." } },
    ];
    const text = pilot.report(set, runs);
    expect(text).toContain("# Pilot: Bookshop");
    expect(text).toContain(
      "| Run | Agent | Bundle | Expected facts found | Avoided claims made | Not answered |",
    );
    expect(text).toContain("| without | A | no | 0 of 3 | 1 | 1 |");
    expect(text).toContain("| with | A | yes | 3 of 3 | 0 | 0 |");
    expect(text).toContain("## delete-book: Who may delete a book?");
    expect(text).toContain("The human reviewer judges");
    // Runs without the bundle come first, so the comparison reads left to right.
    expect(text.indexOf("| without |")).toBeLessThan(text.indexOf("| with |"));
  });
});

describe("the example set in test/pilot/example", () => {
  test("is valid and every run answers every question", () => {
    const set = pilot.readSet(path.join(__dirname, "..", "pilot", "example"));
    expect(set.runs.length).toBeGreaterThanOrEqual(2);
    for (const run of set.runs) {
      expect(Object.keys(run.answers).sort()).toEqual(set.questions.map((q) => q.id).sort());
    }
  });
});
