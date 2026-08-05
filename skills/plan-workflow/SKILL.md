---
name: plan-workflow
description: Design a multi-agent Agent Factory workflow, author it as a session factory, and visualize it as a workflow graph before any of it runs. Use when planning work that fans out across several independent agents — multi-dimension reviews, broad searches, generate-and-judge loops — and you want the shape agreed before execution. Authors the factory and opens the canvas; never starts the run.
---

# Plan a factory workflow

Turn a request into (a) one self-contained Agent Factory, (b) a display manifest
that mirrors it, and (c) an open workflow canvas showing the graph — then stop.

**This skill never starts a run.** Execution is `execute-workflow`'s job. Authoring
and running are separated so the user can see and approve the shape first.

## When this applies

Use a factory when the work genuinely fans out: several independent agents, or
staged work where each stage feeds the next. Signals: "review this from every
angle", "find all the X", "compare these approaches", "be thorough".

Do **not** use a factory when a single agent, or a couple of ordinary `task`
subagents, would do. A factory adds orchestration, durable state, and a
credit budget. Say so plainly and stop rather than wrapping trivial work.

## Flow

### 1. Confirm the shape is worth it

State in one line what fans out and why. If nothing does, stop here.

### 2. Design the graph before writing code

Decide, and write down:

- **Phases** — the run-global stages, in order. Keep them coarse: 2–4 is typical.
- **Agent labels** — one per independent subagent. These are the node identities.
- **Structure** — which labels run in parallel, which flow through a pipeline,
  where a barrier is genuinely required.
- **Limits** — always declare `maxConcurrentSubagents`; add `maxTotalSubagents`
  and `maxAiCredits` for anything unbounded.
- **Result** — the shape the run returns.

Scale the design to the ask. A quick check gets a few agents and single-vote
verification; "thorough" earns a larger finder pool, multi-vote adversarial
verification, and a synthesis stage.

### 3. Read the factory guide

Call `factories_manage({ operation: "guide" })` before authoring. Always. The
run-body constraints are easy to get wrong from memory.

### 4. Author one self-contained factory

Call `factories_manage({ operation: "author", meta, run })`.

Hard constraints on the `run` body — each of these fails silently or at runtime:

- **It closes over nothing.** Define every schema, constant, and helper *inside*
  the function. No static `import`, no `require`. Use `await import()` if needed.
- **Every independent subagent needs a unique `label`.** `ctx.agent()` memoizes
  on canonical prompt *plus options including `label`* — identical calls collapse
  into one shared subagent. Unique labels are a correctness requirement, and
  they are also what the canvas joins nodes on.
- **Guard every `agent()` result.** An ordinary failure resolves to `null`.
  Filter with `v => v !== null`, never `Boolean` — `Boolean` also drops a valid
  `false`, `0`, or `""`.
- **`ctx.phase()` is run-global and races inside concurrent stages.** Call it at
  run-level transitions only; distinguish concurrent work by `label`.
- **Validate `ctx.args` inside the body.** Factory arguments are model-facing and
  untyped — they arrive exactly as some future caller wrote them. Coerce and
  check at the top, and fail loudly:

```js
const files = Array.isArray(args?.files) ? args.files.filter((f) => typeof f === "string") : [];
if (!files.length) throw new Error("plan-workflow: args.files must be a non-empty string[]");
```

- **`log()` every self-imposed cap.** Top-N, sampling, or no-retry rules must be
  visible in progress, not silent.
- **Wrap expensive stages in `ctx.step` or the run is not really resumable.**
  Resume replays the journal, and the journal contains *only* `step` results.
  A fan-out written as a bare `parallel(...)` of `agent()` calls journals
  nothing, so a run that breaches a limit re-runs and re-pays for every agent on
  resume. Journal at the coarsest stable boundary — one `step` per stage, or per
  item if items are independent:

```js
const findings = await step("inspect-v1", async () =>
    (await parallel(files.map((f) => () => agent("...", { label: "inspect:" + f })))).filter((v) => v !== null)
);
```

  The key is the *sole* identity — not the body, not the inputs. Version it
  (`"inspect-v2"`) whenever the meaning changes, or a resume will happily replay
  a stale result for new inputs. Journalled producers are at-least-once, so keep
  side effects idempotent.
- **Declare limits as a real ceiling, not a token one.** A single subagent turn
  costs well into double-digit AI credits, so `maxAiCredits: 5` does not buy one
  agent — it buys an immediate `factory_limit_reached`. Size the budget against
  the expected number of agent turns, and remember that on resume the ceiling is
  measured against *cumulative* spend across all attempts. Always declare
  `maxConcurrentSubagents`: with neither it nor `maxTotalSubagents` set there is
  no concurrency cap at all.

### 5. Generate the display manifest from the same design

Build the manifest from the *same* phase titles and agent labels you just wrote
into the factory. Do not invent a parallel naming scheme.

```json
{
  "factoryName": "review-change",
  "title": "Review and verify a change",
  "phases": [
    { "id": "inspect", "title": "Inspect" },
    { "id": "verify",  "title": "Verify"  }
  ],
  "nodes": [
    { "id": "inspector", "label": "inspect:bugs", "phaseId": "inspect" },
    { "id": "verifier",  "label": "verify:bugs",  "phaseId": "verify"  }
  ],
  "edges": [{ "from": "inspector", "to": "verifier" }]
}
```

Matching rules — get these wrong and the graph shows the right boxes with the
wrong lights:

| Manifest field | Must match |
| --- | --- |
| `factoryName` | `meta.name` exactly |
| `phases[].title` | `meta.phases[].title` (case-insensitive, whitespace-trimmed) |
| `nodes[].label` | the `label` passed to `ctx.agent()` (case-insensitive, whitespace-trimmed) |

Declared phases have **no id** — only a title. `phases[].id` is a manifest-local
handle for `nodes[].phaseId`; correlation to the running factory happens on
**title**. Call `ctx.phase("Inspect")` with the same string you declared.

For a fan-out of N agents with generated labels (`find:0`, `find:1`, …), emit one
node per label. If N is only known at runtime, emit the nodes you can predict;
the rest surface as `unmapped` nodes rather than being lost.

Constraints the canvas enforces:

- **Node labels must be unique.** Duplicates are an error, because duplicate
  labels would have collapsed into one subagent anyway.
- Edges referencing unknown nodes are dropped and reported.
- Self-loops are dropped with a warning.
- A node with an unknown `phaseId` is reassigned to the first phase, not hidden.

The manifest is inert. It never executes anything.

### 6. Open the canvas

```
open_canvas({
  canvasId: "workflow-factory-canvas",
  instanceId: "<factoryName>",       // stable, so re-planning refreshes in place
  input: { manifest: <the manifest> }
})
```

The `manifest` wrapper is required. If the canvas is unavailable, say so once
and continue — the plan is still valid without it.

### 7. Write the plan, then exit

Write the normal implementation plan. Name the factory explicitly so
`execute-workflow` can find it. Then request plan exit.

### 8. Do not run the factory

No `run_factory`. Not "just to check". The user approves the shape first.

## Worked example

`meta`:

```json
{
  "name": "review-change",
  "description": "Review a change across dimensions and verify each finding. args: { files: string[] }",
  "phases": [{ "title": "Inspect" }, { "title": "Verify" }],
  "limits": { "maxConcurrentSubagents": 4, "maxTotalSubagents": 40, "maxAiCredits": 600 }
}
```

`run` — pass this function expression as the parameter's string value:

```js
async ({ args, pipeline, parallel, agent, phase, log }) => {
    const files = Array.isArray(args?.files) ? args.files.filter((f) => typeof f === "string") : [];
    if (!files.length) throw new Error("review-change: args.files must be a non-empty string[]");

    const FINDINGS = {
        type: "object",
        properties: {
            findings: {
                type: "array",
                items: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
            },
        },
        required: ["findings"],
    };
    const VERDICT = {
        type: "object",
        properties: { isReal: { type: "boolean" } },
        required: ["isReal"],
    };
    const DIMENSIONS = [
        { key: "bugs", ask: "correctness bugs" },
        { key: "perf", ask: "performance problems" },
        { key: "sec", ask: "security weaknesses" },
    ];

    phase("Inspect");
    const perDimension = await pipeline(
        DIMENSIONS,
        (d) =>
            agent(`Review these files for ${d.ask}: ${files.join(", ")}. Return JSON {findings:[{title}]}.`, {
                label: `inspect:${d.key}`,
                schema: FINDINGS,
            }),
        (review, d) => {
            if (!review) {
                log(`inspect:${d.key} produced nothing`);
                return [];
            }
            const found = review.findings ?? [];
            if (found.length > 10) log(`inspect:${d.key} capped at 10 of ${found.length} findings`);
            return parallel(
                found.slice(0, 10).map((f, i) => () =>
                    agent(
                        `Adversarially refute this finding; default to refuted if unsure: ${f.title}. Return JSON {isReal}.`,
                        { label: `verify:${d.key}:${i}`, schema: VERDICT }
                    ).then((v) => (v && v.isReal ? f : null))
                )
            );
        }
    );

    phase("Verify");
    return { confirmed: perDimension.flat().filter((v) => v !== null) };
};
```

Its manifest declares phases `Inspect` and `Verify`, three nodes labelled
`inspect:bugs` / `inspect:perf` / `inspect:sec`, and edges into the `verify:*`
nodes that are predictable at plan time.

Note where `phase()` sits: `"Inspect"` is set *before* the fan-out and `"Verify"`
*after* it, because `phase()` is run-global and would race if called from inside
the concurrent pipeline stages. Concurrency is expressed by `label`, not by phase.

## Failure modes

| Symptom | Cause |
| --- | --- |
| N parallel agents behave as one | Missing or duplicated `label` |
| Nodes stay `not-started` all run | `nodes[].label` ≠ the `ctx.agent()` label |
| Everything lands in one phase column | `phases[].title` ≠ `meta.phases[].title` |
| Valid results vanish | Filtered with `Boolean` instead of `v !== null` |
| `ReferenceError` at run time | Run body closed over an authoring-time binding |
| Run dies on a limit | Expected — resume with a raised limit, don't re-author |
