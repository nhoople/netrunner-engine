# Second reader (CR audit tool 1.16)

A model other than the one that writes engine fixes reads the Comprehensive Rules, the printed card text and the official rulings, and writes down what should happen in a board position. A test then runs the engine on the same position and compares. A rule that the fixing model and `cr-checker` both read the same wrong way shows up as a difference.

## Blind order

The reader writes a batch's expectations without opening `src/`, the existing tests or the baselines. It uses only the `lookup` skill (CR text, printed text, rulings). The expectations are committed before the comparison for that batch is written or run, so the git history shows which came first. After that commit an expectation changes only through a recorded verdict (see "Differences").

## Files

- `<batch>.json`: the expectations. One file per batch.
- `<batch>.drivers.ts`: for each case, code that builds the position with the engine's public API and returns the observations the case asks for. A driver does not decide an outcome. It sets up, plays the listed steps, and reports.
- `../second-reader.test.ts`: runs each driver and compares its observations with the expectations.
- `differences.json`: every difference found, with `cr-checker`'s verdict.

## Expectation format

```jsonc
{
  "batch": "cr-examples-ch1",
  "reader": { "model": "claude-fable-5-2" },
  "sources": { "cr": "v26.03", "cards": "v1.147.25" },
  "cases": [
    {
      "id": "1.10.3b.ex1",            // the CR example, plus "#a", "#b" when one example gives several positions
      "example": "1.10.3b.ex1",
      "confidence": "stated",          // see below
      "rules": ["1.10.3b"],            // the CR rules the reading relies on
      "cards": ["DNA Tracker"],        // printed text read for this case
      "position": "…",                 // the board, in words, with every number that matters
      "steps": [{ "label": "run", "do": "…" }],
      "expect": [
        { "at": "run", "observe": "runner.credits", "equals": 0, "why": "…" }
      ]
    }
  ]
}
```

A case with `"run": false` has no engine run. Its `skip` says why (for example, the example defines a term and has no board position).

`confidence` says how the reader got the outcome:

- `stated`: the CR example says it in so many words.
- `derived`: it follows from the example plus printed text and arithmetic (a credit total, a card count).
- `inferred`: the reader had to choose a reading. These are the first place to look when a difference is the reader's mistake.

## Observations

`observe` names one fact about the game. `at` is the label of the step after which it is read (the last step when left out). The driver must report the fact from the engine's state, not from what it expects.

| Key | Value |
|---|---|
| `runner.credits`, `corp.credits` | Credits in the credit pool (CR 1.10.2) |
| `runner.clicks`, `corp.clicks` | Clicks left |
| `runner.tags`, `corp.badPublicity` | Counters on the player, not hosted ones (CR 1.13.3) |
| `runner.grip`, `corp.hq`, `corp.archives`, `runner.heap` | Number of cards in the zone |
| `runner.score`, `corp.score` | Agenda points in the score area (CR 1.17.1) |
| `runner.memoryLimit`, `runner.memoryUsed` | CR 1.20 |
| `zone(Card)` | `grip`, `stack`, `heap`, `rig`, `hq`, `rd`, `archives`, `corp-score`, `runner-score`, `removed`, `root:<server>`, `ice:<server>`, `hosted:<Host>`. `<server>` is `HQ`, `R&D`, `Archives` or `remote` |
| `installed(Card)`, `rezzed(Card)`, `faceup(Card)` | true or false |
| `counters(Card,kind)` | `advancement`, `power`, `virus`, `agenda`, `credit`, `badPublicity` |
| `hostedCards(Card)` | Number of cards hosted on the card |
| `strength(Card)` | Current strength |
| `hasSubtype(Card,subtype)` | true or false |
| `legal(label)` | Whether the engine offers or accepts the move the step `label` describes |
| `chooser(label)` | `corp` or `runner`: who makes the choice the step describes |
| `run.active` | A run is in progress |
| `run.outcome` | `successful`, `unsuccessful` or `neither`, read after the run ends |
| `accessed` | Titles of the cards accessed in the breach, in order |

A case may use another key when its `expect` entry explains it in `why`.

## Differences

When the engine and an expectation differ, `cr-checker` reads the case. Its verdict is one of:

- `engine-wrong`: filed under the area that owns the rule, as a skipped test naming the CR rule. This tool does not fix the engine.
- `reader-wrong`: the expectation is corrected in a later commit, and `differences.json` keeps the original reading.
- `cr-open`: the CR does not settle it. It goes on the disagreement list for the maintainer.
