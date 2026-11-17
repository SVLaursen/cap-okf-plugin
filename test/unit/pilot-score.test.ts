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
      /^\[okf\] questions\.yaml:\d+ — question a has no expect list/,
    ],
    [
      "domain: X\nquestions:\n  - { id: a, question: Q?, expect: [x] }\n  - { id: a, question: R?, expect: [y] }\n",
      /^\[okf\] questions\.yaml:\d+ — the id a is used twice/,
    ],
    [
      "domain: X\nquestions:\n  - { question: Q?, expect: [x] }\n",
      /^\[okf\] questions\.yaml:\d+ — question 1 has no id/,
    ],
    ["domain: [", /^\[okf\] questions\.yaml:\d+ — isn't valid YAML/],
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
  test("a summary table per run, then every question with each run's answer", () => {
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

// Review of 3.6: matching whole words, empty answers, unknown ids, and stricter question files.
describe("checkAnswer matches whole words and phrases only", () => {
  const question = {
    id: "q",
    question: "Q?",
    expect: [["reserve"], ["parent"], ["reserve("]],
    avoid: ["anyone can"],
  };

  test("a word inside a longer word doesn't count", () => {
    expect(
      pilot.checkAnswer(question, "The event BookReserved fires. Apparently, reserved."),
    ).toMatchObject({
      expectFound: [],
      expectMissing: ["reserve", "parent", "reserve("],
    });
  });

  test("a word next to punctuation counts, and so does a wording with punctuation", () => {
    expect(pilot.checkAnswer(question, "Call reserve(copies); the parent, too.")).toMatchObject({
      expectFound: ["reserve", "parent", "reserve("],
    });
  });
});

describe("answers: placeholders, wrong types and unknown ids", () => {
  test("an empty placeholder counts as not answered", () => {
    const run = pilot.parseRun("bundle: false\nanswers:\n  q:\n", "answers/x.yaml");
    expect(run.answers).toEqual({});
  });

  test("an answer that isn't text is refused", () => {
    expect(() =>
      pilot.parseRun("bundle: false\nanswers:\n  q: [a, b]\n", "answers/x.yaml"),
    ).toThrow(/^\[okf\] answers\/x\.yaml:3 — the answer to q isn't text/);
  });

  test("answers that aren't a map are refused", () => {
    expect(() => pilot.parseRun("bundle: true\nanswers: [a]\n", "answers/x.yaml")).toThrow(
      /^\[okf\] answers\/x\.yaml — has answers that aren't a map/,
    );
  });
});

describe("parseQuestions: stricter entries, with line numbers", () => {
  test("a single avoid claim may be written without a list; a number is a valid id", () => {
    const set = pilot.parseQuestions(
      "domain: X\nquestions:\n  - { id: 5, question: Q?, expect: [x], avoid: anyone can }\n",
      "q.yaml",
    );
    expect(set.questions[0]).toMatchObject({ id: "5", avoid: ["anyone can"] });
  });

  test.each([
    ['[""]', /^\[okf\] q\.yaml:3 — question a has an empty or non-text expected fact/],
    ["[[]]", /^\[okf\] q\.yaml:3 — question a has an empty or non-text expected fact/],
    ["[{ a: 1 }]", /^\[okf\] q\.yaml:3 — question a has an empty or non-text expected fact/],
  ])("expect: %s is refused", (expectList, message) => {
    const text = `domain: X\nquestions:\n  - { id: a, question: Q?, expect: ${expectList} }\n`;
    expect(() => pilot.parseQuestions(text, "q.yaml")).toThrow(message);
  });

  test("a question without question text is refused at its line", () => {
    const text = "domain: X\nquestions:\n  - id: a\n    expect: [x]\n";
    expect(() => pilot.parseQuestions(text, "q.yaml")).toThrow(
      /^\[okf\] q\.yaml:3 — question a has no question text/,
    );
  });

  test("a YAML syntax error names the line where the parser found it", () => {
    expect(() => pilot.parseQuestions('domain: X\nquestions:\n  - "open\n', "q.yaml")).toThrow(
      /^\[okf\] q\.yaml:\d+ — isn't valid YAML \(MISSING_CHAR\)/,
    );
  });
});

describe("readSet", () => {
  const fs = jest.requireActual<typeof import("node:fs")>("node:fs");
  const os = jest.requireActual<typeof import("node:os")>("node:os");
  let folder: string;
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-pilot-"));
    fs.writeFileSync(
      path.join(folder, "questions.yaml"),
      "domain: X\nquestions:\n  - { id: a, question: Q?, expect: [x] }\n",
    );
  });
  afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

  test("a set without answers has no runs", () => {
    expect(pilot.readSet(folder).runs).toEqual([]);
  });

  test("an answer to an id that isn't a question is refused, e.g. a typo", () => {
    fs.mkdirSync(path.join(folder, "answers"));
    fs.writeFileSync(path.join(folder, "answers", "r.yml"), "bundle: true\nanswers:\n  b: text\n");
    expect(() => pilot.readSet(folder)).toThrow(
      / — answers b, which isn't a question in questions\.yaml\./,
    );
  });
});

describe("report: escaping and quoting", () => {
  test("a pipe in a run name is escaped, and each line of an answer is quoted", () => {
    const set = pilot.parseQuestions(
      "domain: X\nquestions:\n  - { id: a, question: Q?, expect: [x] }\n",
      "q.yaml",
    );
    const text = pilot.report(set, [
      { name: "a|b", agent: "A", bundle: true, answers: { a: "line 1\nline 2" } },
    ]);
    expect(text).toContain("| a\\|b | A | yes |");
    expect(text).toContain("> line 1\n> line 2");
  });
});
