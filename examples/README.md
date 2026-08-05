# Example corpus

Worked examples for `plan-workflow` and `execute-workflow`, extracted from
Anthropic's ["A harness for every task: dynamic workflows in Claude Code"][src].

[src]: https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code

The article is useful here because it documents workflows at two different
moments, and those two moments are exactly this plugin's two skills:

```text
  the "Six Workflow Patterns" diagram        the run illustrations
  = shape before anything runs               = the same graph with state on it
              │                                          │
              ▼                                          ▼
        plan-workflow                            execute-workflow + canvas
              │                                          │
     examples/patterns/  (6)                     examples/runs/  (4)
```

So the corpus is the plugin's test data *and* its fidelity target: the canvas is
supposed to be able to draw these.

## What is here

```text
corpus.mjs      24 article items, each mapped to a fixture or marked out of scope
patterns/       6 plan-time fixtures — the shape catalog
runs/           4 execution fixtures — the same graphs with run state
captures/       frozen FactoryRunDetail from live runs (see "Not yet real")
```

Every fixture module exports one shape:

```js
export default {
  id, title, source,      // article section + URL
  harnessArgs,            // args the L3 harness drives `run` with
  meta, run,              // the genuine factory artifacts plan-workflow would author
  manifest,               // display manifest mirroring the factory
  scenarios: [            // synthetic FactoryRunDetail + what it should project to
    { name, detail, expect: { runStatus, nodeStates, unmapped } },
  ],
};
```

`meta` and `run` are real — `String(run)` is exactly the payload `factories_manage`
takes. That is deliberate: the tests exercise the actual authoring contract rather
than a paraphrase of it.

## Coverage

24 items. Each carries **exactly one** of `realizedBy` (fixtures that implement it)
or `outOfScope` (a written reason) — `examples.test.mjs` enforces the exclusivity,
so an item can neither be silently dropped nor silently double-counted.

| Tier | Count | Realized | Mapped only |
| --- | ---: | ---: | ---: |
| Workflow patterns | 6 | 6 | 0 |
| Example prompts | 8 | 1 | 7 |
| Use cases | 10 | 4 | 6 |

### Patterns → fixtures

| Pattern | Fixture | What its shape exercises |
| --- | --- | --- |
| Classify-and-act | `patterns/classify-and-act.mjs` | one branch taken, the other two left grey |
| Fan-out-and-synthesize | `patterns/fanout-and-synthesize.mjs` | N parallel agents converging on a barrier |
| Adversarial verification | `patterns/adversarial-verification.mjs` | bidirectional edges between worker and verifiers |
| Generate-and-filter | `patterns/generate-and-filter.mjs` | many candidates in, two terminal artifacts out |
| Tournament | `patterns/tournament.mjs` | a three-phase bracket that halves each round |
| Loop until done | `patterns/loop-until-done.mjs` | a backward edge, and labels reused across rounds |

### Use cases → run fixtures

| Use case | Fixture | What its run state demonstrates |
| --- | --- | --- |
| Deep verification | `runs/deep-verification.mjs` | a *conditional* node that stays grey in a fully green run |
| Sorting | `runs/sorting.mjs` | phases titled `ROUND 1` / `ROUND 2` / `FINAL`, matching the illustration's columns |
| Memory and rule adherence | `runs/memory-and-rules.mjs` | five states live at once, plus an undeclared agent surfacing as unmapped |
| Triaging at scale | `runs/triage-at-scale.mjs` | container groups, with one group deliberately spanning two phases |

The six remaining use cases and seven remaining prompts are mapped to the pattern
they instantiate but not built. Each says why in `corpus.mjs` — the short version
is that they are re-instantiations of shapes already covered, and a second copy
of a shape tests nothing the first did not.

## How the fixtures are verified

Three layers, all free, all in `npm test`.

```text
             fixture.manifest ──────────────► L1  normalizeManifest + projectRun
                    ▲                             zero errors, expected states
                    │ must agree
                    ▼
             fixture.run ───────────────────► L3  executed against a mock ctx
                                                  emitted labels/phases must
                                                  set-equal the manifest

             fixture.manifest ──────────────► L2  rendered through the DOM shim
                                                  in tests/canvas.test.mjs
```

**L1 — `tests/examples.test.mjs`** (structural). Normalizes every manifest and
asserts zero errors and no lost nodes/edges/phases/groups, then projects every
scenario and asserts the exact per-node state, run status, and unmapped count.

**L3 — `tests/harness.test.mjs`** (behavioural). Executes each fixture's real
`run` against a mock `ctx`, three times, with a branch selector that walks enum
members and flips booleans. It then asserts set-equality both ways:

- every agent the run spawned is declared in the manifest — an undeclared agent
  bills money and draws as an anonymous `__unmapped__` box
- every node the manifest declares is spawned on *some* branch — a node that is
  never spawned stays grey forever and quietly misrepresents the workflow

This is what mechanically catches the failure modes tabulated in
`skills/plan-workflow/SKILL.md`: duplicate labels collapsing into one memoized
agent, phase-title drift, and agents the manifest never predicted.

**L2 — rendering** is covered by the existing canvas suite, which executes the
real client script through `tests/dom-shim.mjs` in Node. Node shapes, group
boxes, detail lines, and edge-label geometry are asserted there against
hand-derived values.

## Reading the fixtures

Two conventions that look like bugs and are not:

**Terminal artifact nodes stay grey forever.** Nodes with `kind: "terminal"` —
`best`, `discarded`, `winner`, `done`, `order`, `violations` — are outputs, not
agents. Nothing spawns them, so they never leave `not-started`. Each fixture says
so in its header, and L3 excludes them from the expected agent set.

**Loop fixtures reuse labels on purpose.** `loop-until-done` emits `sweep` and
`gate` once per round. That is not a duplicate-label bug: it is one node showing
the round it is currently on. State precedence puts `running` above `succeeded`,
so the node tracks the live iteration rather than freezing on round one.

Self-loops are dropped with a warning by `manifest.mjs`, so a loop is always
modelled as `sweep → gate → sweep`, never as an edge from a node to itself.

## Not yet real

`captures/` is empty. Everything above replays *synthetic* `FactoryRunDetail`
objects that were written by hand to match the wire format.

That is a real limitation and worth stating plainly: `projection.mjs` coerces
several fields silently — a timestamp in the wrong format becomes `null` with no
error, and a non-numeric duration becomes `0`. A fixture can therefore be subtly
wrong about the wire format and still pass every test here. Capturing real run
detail and deriving a shape assertion from it is tracked in [TODOS.md](../TODOS.md).

## Attribution

Prompts and use-case names are quoted from the article in short excerpts for
identification. The workflow shapes are descriptions of the published diagrams,
re-expressed as this plugin's manifest format. Source URL is carried on every
fixture and on every corpus entry.
