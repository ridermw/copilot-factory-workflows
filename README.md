# copilot-factory-workflows

Plan a multi-agent workflow before it runs, watch it run, and keep the two
steps separate.

This plugin adds two skills and one canvas to GitHub Copilot CLI:

| Piece | Does |
| --- | --- |
| `plan-workflow` skill | Turns a request into a session Agent Factory plus a display manifest, opens the canvas, and stops. |
| `execute-workflow` skill | Starts or resumes that factory, attaches the run to the canvas, and reports the outcome. |
| `workflow-factory-canvas` | Read-only graph: phases as columns, agents as nodes, live run state painted on top. |

Planning and execution are deliberately different skills. The point is that you
see the shape of the fan-out — and its credit ceiling — before anything spends
money.

## Install

The plugin is not published to a marketplace yet. Mount it from a local clone:

```bash
git clone https://github.com/ridermw/copilot-factory-workflows
copilot --plugin-dir ./copilot-factory-workflows
```

Verify it loaded:

```bash
copilot --plugin-dir ./copilot-factory-workflows plugin list
```

Agent Factories sit behind a feature flag. If `factories_manage` and
`run_factory` are missing from the toolset, enable it and restart:

```bash
setx COPILOT_CLI_ENABLED_FEATURE_FLAGS agent_factories
```

## How it works

```text
request
  │
  ├─ plan-workflow ──► authors a session factory
  │                    builds a display manifest that mirrors it
  │                    opens the canvas
  │                    stops
  │
  └─ execute-workflow ─► resumes an existing run, or starts exactly one
                         attaches the run to the canvas
                         reports completed / error / halted / cancelled
```

The factory is the executable artifact. The manifest is only a picture of it,
passed to the canvas so the graph can be drawn before a single agent spawns.

The two are correlated at runtime by name, not by id:

- **Phases** match on **title**, case-insensitively. A declared phase carries
  only `{title, detail?}` — there is no phase id in factory metadata — so the
  manifest phase title must match the title the factory declares. Get this
  wrong and the columns simply never light up, with no error.
- **Nodes** match on the agent **`label`**. `ctx.agent()` memoizes on label, so
  two independent agents sharing a label silently collapse into one. The
  manifest treats duplicate labels as an error for that reason.

Anything the runtime reports that the manifest never declared still gets drawn,
as an unmapped node in the right column. An agent that runs is always visible,
even when the plan failed to predict it.

## Canvas input

```jsonc
{
  "manifest": {
    "factoryName": "review-pipeline",       // required
    "title": "Review pipeline",
    "phases": [                              // required, max 100
      { "id": "gather", "title": "Gather" }  // title must match the factory's
    ],
    "nodes": [                               // required, max 1000
      { "id": "scan", "label": "Scan repo", "phaseId": "gather" }
    ],
    "edges": [{ "from": "scan", "to": "judge" }]  // max 4000
  },
  "runId": "optional-run-id"
}
```

Actions: `attach_run({runId})`, `detach_run()`, `set_manifest({manifest, runId?})`,
`get_state()`.

`get_state()` is the agent-facing summary — counts per state, the current phase,
terminal reason, and any manifest errors or warnings. The rendered graph gets
the full view model separately, so `get_state` stays small enough to read in
conversation.

Structural problems in a manifest are reported, never thrown: a dangling edge is
dropped and recorded, a self-loop is dropped and warned about, a node pointing
at an unknown phase is reassigned to the first phase. A bad manifest degrades
into a drawable graph rather than an exception.

## Two things that cost real credits to learn

Both of these were found by running actual factories, and both had been
documented the other way round first.

**A resume only replays `ctx.step` results.** The journal is keyed by step key
and nothing else. A bare `parallel()` of `agent()` calls journals nothing, so
resuming re-runs and re-pays for every agent. Wrap producers in `ctx.step` at
the coarsest stable boundary if you want a resume to be worth anything.

**Limits are cumulative across attempts.** Raising `maxAiCredits` from 2 to 12
does not grant 12 fresh credits; it grants whatever is left under a cumulative
ceiling of 12. A raised limit has to exceed *total* expected spend, not the
remaining work. The retry hint in the run-completion notice bumps the limit by
exactly 1, which is almost never enough.

For scale: a single trivial agent turn runs into double-digit credits. A
`maxAiCredits` of 5 is not a small budget, it is an instant
`factory_limit_reached`.

## Development

```bash
npm test
```

Four suites, no dependencies:

- `tests/canvas.test.mjs` — manifest normalization, run projection, static HTML,
  and the client render driven through a DOM shim (`tests/dom-shim.mjs`).
- `tests/skills.test.mjs` — structural guards on the skill documents: that
  `plan-workflow` never instructs a run, that `execute-workflow` handles all
  four terminal statuses, and that neither skill re-acquires the "resume is
  free" claim disproved above.
- `tests/examples.test.mjs` — every fixture in [`examples/`](examples/) normalizes
  with zero errors and projects to the run state it claims.
- `tests/harness.test.mjs` — executes each fixture's real `run` body against a
  mock `ctx` and asserts the agents it spawns and the phases it announces
  set-equal what its manifest declares.

The skill tests exist because a skill is prose, and prose drifts. They caught a
stale claim still sitting in a frontmatter description after the body had been
corrected.

The example suites exist because a manifest is a *claim* about a factory. They
catch the inverse drift: a graph that is internally consistent and still does not
describe the code that runs.

## Examples

[`examples/`](examples/) holds ten worked workflows derived from Anthropic's
["A harness for every task"][harness] — six plan-time shapes and four execution
scenarios, plus a 24-item coverage index. They double as the canvas's fidelity
target. See [examples/README.md](examples/README.md).

[harness]: https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code

## Layout

```text
.claude-plugin/plugin.json
extensions/workflow-factory-canvas/
  extension.mjs     wiring: canvas lifecycle, run attachment, event handling
  manifest.mjs      normalize + validate the display manifest
  projection.mjs    manifest + FactoryRunDetail -> view model
  renderer.mjs      HTML, CSS, and the browser client
skills/plan-workflow/SKILL.md
skills/execute-workflow/SKILL.md
examples/
  corpus.mjs        24 article-derived items, mapped to fixtures or marked out of scope
  patterns/         6 plan-time fixtures
  runs/             4 execution fixtures
tests/
```

`projection.mjs` is the interesting file and is pure: a manifest and a run
detail in, a view model out. Everything about how a run is interpreted — state
precedence, run-level overrides, unmapped agents, node caps — lives there and
is testable without a browser or a live factory.

## Not in scope

Editing the graph in the canvas, a second executable graph runtime, execution
outside a Copilot session, cross-provider routing, and importing ultracodex
workflows. Visualization libraries are deferred until plain HTML demonstrates a
concrete limitation — see [TODOS.md](TODOS.md).
