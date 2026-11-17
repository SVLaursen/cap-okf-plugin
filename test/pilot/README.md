# Pilot harness (task 3.6)

Does the OKF bundle help an agent answer questions about a CAP app? Ask the same questions to
an agent twice, once with the bundle and once without, save its answers, and compare.

Nothing here calls a model (maintainer decision, 2026-11-17): you choose the agent, ask the
questions, and paste its answers into files. The script counts which expected facts each answer
mentions and which wrong claims it makes. Those counts are a guide; **you judge the answers**
for gate G4.

How the counting works: case and spacing don't matter, and a fact counts only as a whole word or
phrase, so `reserve` isn't found in `reserved` or `BookReserved`. It doesn't understand
negation: "not anyone can" still contains the avoided claim "anyone can". Choose facts and
claims with that in mind.

## A question set

One folder per set, e.g. `test/pilot/<app>/`:

```text
test/pilot/<app>/
├── questions.yaml
└── answers/
    ├── without-bundle.yaml
    └── with-bundle.yaml
```

`questions.yaml`:

```yaml
domain: Orders app
questions:
  - id: delete-book                 # short, unique; used in the answer files
    question: Who may delete a book?
    expect:                         # facts a good answer mentions (any case, any spacing)
      - catalog-manager
      - [AdminService, admin service]   # one fact, alternative wordings
    avoid: [anyone can]             # optional: claims a good answer doesn't make
```

`answers/<run>.yaml`, one file per run (the file name is the run's name):

```yaml
agent: the agent and model you used
bundle: true                        # true: it could read the bundle; false: it couldn't
answers:
  delete-book: >
    The agent's answer, as it gave it.
```

## Running a pilot

1. Without the bundle first: make sure the agent can't see one. Delete `gen/okf` (and
   `gen/srv/okf-bundle`) or run before any `cds build`, then give the agent your app's code as
   usual and ask each question. Save the answers in `answers/without-bundle.yaml` with
   `bundle: false`.
2. Build the bundle: `cds build` writes `gen/okf`.
3. With the bundle: start a fresh session, give the agent `gen/okf` as well (e.g. "read
   gen/okf/index.md first"), and ask the same questions. Save them with `bundle: true`.
4. Score: `npm run pilot:score -- test/pilot/<app>` prints a Markdown report with a summary per
   run and every answer next to what it misses. An answer left empty counts as not answered; an
   answer under an id that isn't a question is an error, so a typo can't hide an answer.

`test/pilot/example/` shows the format on the bookshop fixture; its answers are written by hand
for illustration, not by an agent.

Don't put customer data, secrets or personal data in question sets or answers (CLAUDE.md).
