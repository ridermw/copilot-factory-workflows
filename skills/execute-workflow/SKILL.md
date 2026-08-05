---
name: execute-workflow
description: Start or resume the Agent Factory authored by plan-workflow, attach the run to the workflow canvas, and report the outcome. Use when a factory workflow plan has been approved and it is time to actually run it, or when an earlier run stopped short — on a limit, a decline, or a failure — and needs resuming. Prefers resuming the existing run over starting a second one.
---

# Execute a factory workflow

Run the factory that `plan-workflow` authored, attach it to the canvas so the
graph lights up, and report what happened. The factory does the work — this
skill orchestrates and observes, it does not duplicate the work in the
foreground.

## Flow

### 1. Find the factory

```
factories_manage({ operation: "list" })
```

Match against the factory named in the plan. If nothing matches, the plan was
never authored — say so and stop. Do not improvise a replacement factory here;
authoring belongs to `plan-workflow`.

Use `factories_manage({ operation: "inspect", name })` to confirm the argument
shape before invoking, since factory args are untyped at the call boundary.

### 2. Check for prior runs — always, before starting anything

```
factories_manage({ operation: "runs" })
```

This is not optional. A run that hit a limit keeps its ID, arguments, journal,
and accounting, so resuming is normally much cheaper than restarting.

Two things about resume that are easy to get wrong, both verified against real
runs:

- **Resume only replays work the factory wrapped in `ctx.step`.** The journal is
  keyed by `step` key and nothing else. A factory that fans out with a bare
  `agent()`/`parallel()` has an empty journal, so a resume re-runs every agent
  and re-pays for all of it. Check the run's `snapshot.journal` — if it is `[]`,
  a resume is a restart with extra steps, and the fix belongs in the factory
  (`plan-workflow`), not here.
- **Consumed resources carry across attempts.** A raised limit is measured
  against *cumulative* spend, not the next attempt alone. Bumping
  `maxAiCredits` from 2 to 12 does not buy 12 more credits — it buys whatever
  is left under 12. Raise it past total expected spend, or the next attempt
  breaches immediately and you have paid for a third of nothing.

Read each candidate's status:

| Status | Action |
| --- | --- |
| `error` with `failure.type: "factory_limit_reached"` | **Resume**, with a raised limit |
| `halted` | **Resume** — it stopped, it did not finish |
| `pending` / `running` | Already live. Attach and observe; do not start another |
| `cancelled` | Ask before resuming — someone stopped it deliberately |
| `completed` | Done. Report the result; only re-run if the inputs changed |

Use `factories_manage({ operation: "inspect-run", runId })` to read a run's
durable result without waiting for it.

### 3. Resume if you can

```
run_factory({ resumeFromRunId: "<runId>", limits: { maxAiCredits: 6 } })
```

Resume takes no name and no args — they come from the run row. Raise only the
limit that was actually breached, and only by what the work needs.

Pre-execution resume failures throw `FactoryResumeError` with a `code`:

| Code | Meaning |
| --- | --- |
| `not_found` | Wrong run ID |
| `non_resumable` | Terminal in a way that cannot continue — start fresh |
| `already_active` | A run is live in this session; attach to that one instead |
| `reapproval_declined` | The user said no. Stop; do not restart to route around it |
| `no_approval_provider` | Environment cannot prompt for approval |

### 4. Otherwise start exactly one run

```
run_factory({ name: "<factoryName>", args: { ... }, limits: { ... } })
```

**Exactly once.** A session runs one factory at a time — a second concurrent
invocation rejects with an already-active error. If the call appears to hang,
it is running; go to step 5 rather than retrying.

A *declined* fresh run is not an error: the run row already exists by the time
the prompt is answered, so it resolves as `cancelled` carrying a run ID. Report
that as declined, not as a failure.

### 5. Attach the run to the canvas

```
invoke_canvas_action({
  instanceId: "<the instanceId plan-workflow used>",
  actionName: "attach_run",
  input: { runId: "<runId>" }
})
```

`plan-workflow` uses the factory name as the `instanceId`. If the canvas is not
open, open it first with the plan's manifest and the `runId` in the same input:

```
open_canvas({
  canvasId: "workflow-factory-canvas",
  instanceId: "<factoryName>",
  input: { manifest: <manifest>, runId: "<runId>" }
})
```

**If the canvas is unavailable, execution continues.** Report progress and the
outcome as text. The canvas is a view, not a dependency — never block or abort a
run because the graph could not be shown.

### 6. Observe through the factory APIs

```
factories_manage({ operation: "inspect-run", runId })
```

Factory-owned subagents are deliberately hidden from `read_agent` and
`write_agent`. Do not go looking for them — the factory observability APIs and
the canvas are the whole surface.

While the run is live the canvas refreshes itself; you do not need to poll on
its behalf. Poll only when you need to report progress in chat.

### 7. Report the outcome precisely

Four terminal statuses, four different meanings. Do not flatten them into
"failed":

| Status | Meaning | Report as |
| --- | --- | --- |
| `completed` | Finished. `result` is valid. | The result |
| `error` | Ended on a limit or a durable failure. Check `failure.type`. | What broke, and whether resuming clears it |
| `halted` | Stopped short of finishing. | Stopped, and resumable |
| `cancelled` | Someone stopped it, or declined it. | Cancelled — not a bug |

For `error`, read `failure.type`:

- `factory_limit_reached` — hit a declared ceiling. **Resumable** with a raised
  limit. Say which limit and what it would cost to continue.
- `factory_resume_declined` — a resume was refused. Stop.
- `factory_durable_failure` — the run body itself failed. Resuming replays the
  journal but will hit the same bug; fix the factory via `plan-workflow`.

Read `result` **only** when the status is `completed`.

### 8. Do not do the factory's work yourself

The point of the factory is that the fan-out happens inside it. Do not
re-review, re-search, or re-verify in the foreground "to be sure". If the
factory's output is inadequate, that is a finding about the factory — take it
back to `plan-workflow`.

The one thing worth doing in the foreground is *synthesis the user asked for*:
turning the run's result into the answer, edit, or file they actually wanted.

## Failure modes

| Symptom | Cause |
| --- | --- |
| Run costs double | Skipped step 2 and restarted instead of resuming |
| Resume re-ran everything anyway | Factory never used `ctx.step`, so the journal was empty |
| Resume breaches the limit instantly | Raised the ceiling by too little; prior attempts' spend still counts |
| `already_active` rejection | A second run started while one was live |
| Graph never lights up | Attached the wrong `instanceId`, or labels don't match the manifest |
| Nodes appear as `unmapped` | The factory spawned labels the manifest didn't declare — expected for runtime-sized fan-outs |
| Agents invisible to `read_agent` | By design; use `inspect-run` |
| A `cancelled` run reported as broken | Declined ≠ failed |
