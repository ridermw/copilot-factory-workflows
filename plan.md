# Native Copilot Factory Workflow Plugin Plan

> Planning artifact only. Implement this in a new standalone repository on the target device. Do not modify `ultracodex`.

## Goal

Create a standalone GitHub Copilot plugin containing:

1. A plan-mode skill that authors a session-scoped Agent Factory and opens a read-only workflow canvas.
2. An execution skill that starts or resumes that factory and attaches its run to the existing canvas.
3. A plain-HTML canvas extension that visualizes the planned workflow and live factory progress.

## Scope decision

**SCOPE REDUCTION selected.** The earlier plan rebuilt graph validation, persistence, interpretation, approval, and execution already supplied by Copilot CLI Agent Factories.

No ultracodex code or runtime is required.

## What already exists

| Need | Existing Copilot capability | Reuse decision |
|---|---|---|
| Dynamic workflow execution | Agent Factories | Reuse directly |
| Agent calls | `ctx.agent()` | Reuse directly |
| Parallel work | `ctx.parallel()` | Reuse directly |
| Pipelines | `ctx.pipeline()` | Reuse directly |
| Phases and progress | `ctx.phase()`, `ctx.log()` | Reuse directly |
| Durable steps | `ctx.step()` | Reuse directly |
| Limits | Factory limits | Reuse directly |
| Resume and cancellation | Factory run APIs | Reuse directly |
| Dynamic authoring | `factories_manage author` | Reuse directly |
| Execution | `run_factory` | Reuse directly |
| UI host | Copilot canvas extension | Reuse directly |
| Approval | Normal Copilot plan-exit flow | Reuse directly |

## Architecture

```text
User asks for dynamic workflow in plan mode
                     |
                     v
             plan-workflow skill
                     |
          +----------+-----------+
          |                      |
          v                      v
factories_manage author    open workflow canvas
          |                with display manifest
          v                      |
   session Agent Factory        |
          |                      |
          +----------+-----------+
                     |
              plan exit approval
                     |
                     v
             execute-workflow skill
                     |
          run_factory / resume run
                     |
                     v
           factory progress APIs
                     |
                     v
         read-only animated canvas
```

The Agent Factory is the executable workflow. The canvas manifest is presentation metadata only.

## Package structure

Use the layout supported by installed Copilot plugins:

```text
copilot-factory-workflows/
├── .claude-plugin/
│   └── plugin.json
├── extensions/
│   └── workflow-factory-canvas/
│       ├── extension.mjs
│       └── canvas-core.mjs
├── skills/
│   ├── plan-workflow/
│   │   └── SKILL.md
│   └── execute-workflow/
│       └── SKILL.md
├── tests/
│   ├── skills.test.mjs
│   └── canvas.test.mjs
├── package.json
├── README.md
└── TODOS.md
```

Before writing the canvas manually, run `/create-canvas` with the desired workflow visualization prompt. Keep the generated structure where it is cleaner than this proposed split.

## Quick runbook: new repository and GitHub Copilot app

### 1. Create the repository

```bash
gh repo create copilot-factory-workflows \
  --private \
  --clone \
  --description "Native Copilot Agent Factory planning and progress canvas"
cd copilot-factory-workflows
git switch -c feature/native-factory-workflows
```

Open this repository as a project in the GitHub Copilot app.

### 2. Generate and test the canvas first

Start a Copilot app session in the new repository and run:

```text
/create-canvas Create a project canvas named workflow-factory-canvas.
It accepts a read-only workflow manifest containing phases, nodes, and edges.
Render the workflow as a directed graph grouped by phase. Show queued,
running, succeeded, failed, halted, cancelled, and unmapped states.
Animate active edges. Add an agent-callable action attach_run that accepts
a Copilot Agent Factory run ID and updates the graph from factory progress.
Use plain HTML, CSS, and JavaScript unless that cannot meet the requirements.
```

The generated canvas should appear under:

```text
.github/extensions/workflow-factory-canvas/
```

Verify in the Copilot app:

1. The canvas opens in the right panel.
2. A fixed sample manifest renders correctly.
3. Reloading the session reopens or recreates the canvas without losing its input.
4. Malformed input produces a visible error instead of a blank panel.

Commit the generated baseline before customization:

```bash
git add .github/extensions/workflow-factory-canvas
git commit -m "feat: scaffold workflow factory canvas"
```

### 3. Add the two skills

Create:

```text
skills/plan-workflow/SKILL.md
skills/execute-workflow/SKILL.md
```

Use the planning skill in a fresh plan-mode session. Confirm it:

1. Authors a session factory with `factories_manage author`.
2. Opens the generated canvas with matching phase and agent labels.
3. Produces the normal plan.
4. Does not call `run_factory`.

Exit plan mode, then invoke the execution skill. Confirm it:

1. Runs exactly one factory.
2. Attaches the returned run ID to the existing canvas.
3. Shows live node transitions until the run reaches a terminal state.

### 4. Package it as a standalone plugin

After the project-scoped canvas works:

1. Add `.claude-plugin/plugin.json`.
2. Move or copy the validated extension into the plugin's supported `extensions/` location.
3. Keep the two skills under `skills/`.
4. Install the local plugin:

```bash
copilot plugin install .
copilot plugin list
```

5. Open a fresh Copilot app session outside the plugin repository and verify that the installed plugin contributes both skills and the canvas extension.

Do not delete the project-scoped generated canvas until the installed-plugin smoke test passes. Avoid maintaining both copies afterward: choose the plugin-owned extension as the single source of truth.

### 5. Run tests and publish

```bash
npm test
copilot plugin install .
```

Run the host smoke test from Task 5, then:

```bash
git add .
git commit -m "feat: add native factory workflow plugin"
git push -u origin feature/native-factory-workflows
gh pr create --fill
```

## Canvas input contract

The planning skill generates a small display manifest alongside the factory:

```json
{
  "factoryName": "review-change",
  "title": "Review and verify a change",
  "phases": [
    { "id": "inspect", "title": "Inspect" },
    { "id": "verify", "title": "Verify" }
  ],
  "nodes": [
    {
      "id": "inspector",
      "label": "Inspector",
      "phaseId": "inspect",
      "kind": "agent"
    },
    {
      "id": "verifier",
      "label": "Verifier",
      "phaseId": "verify",
      "kind": "agent"
    }
  ],
  "edges": [
    { "from": "inspector", "to": "verifier" }
  ]
}
```

Rules:

- Node labels must match factory agent labels.
- Phase titles must match factory phases.
- The manifest never executes anything.
- Runtime labels absent from the manifest appear as explicit `unmapped` nodes.
- Manifest nodes that never appear in runtime progress remain visibly `not started`.

## Task 1: Scaffold the standalone plugin and canvas

1. Create a new standalone repository.
2. Run `/create-canvas` in the Copilot app with this brief:

```text
Create a project canvas extension named workflow-factory-canvas.
It displays a read-only directed workflow graph supplied as canvas input.
Nodes show not-started, queued, running, succeeded, failed, halted,
cancelled, and unmapped states. Active edges animate. Group nodes by phase.
Expose an agent-callable action to attach a factory run ID.
Use plain HTML, CSS, and JavaScript unless the generated implementation
cannot meet these requirements cleanly.
```

3. Move or adapt the generated extension into `extensions/workflow-factory-canvas/`.
4. Add `.claude-plugin/plugin.json` declaring the plugin metadata, skills, and extension.
5. Add `package.json` with only test and formatting scripts required by the generated scaffold.
6. Verify the plugin installs locally and the canvas appears in the Copilot app.

## Task 2: Create the planning skill

Create `skills/plan-workflow/SKILL.md`.

Required flow:

```text
1. Confirm the task benefits from a multi-step factory.
2. Design phases, agent labels, parallel branches, pipelines, limits, and result.
3. Call factories_manage guide before authoring.
4. Author one self-contained session factory with factories_manage author.
5. Generate the display manifest from the same phases and labels.
6. Open workflow-factory-canvas with the manifest.
7. Write the normal implementation plan.
8. Request plan exit.
9. Do not run the factory.
```

The skill must ensure independent parallel agents have unique labels.

The skill must validate its own factory arguments inside the generated run function because model-facing factory arguments are untyped.

## Task 3: Create the execution skill

Create `skills/execute-workflow/SKILL.md`.

Required flow:

```text
1. Inspect registered factories and identify the factory named in the plan.
2. Inspect prior runs before starting another run.
3. If a resumable run exists, resume it instead of restarting.
4. Otherwise call run_factory exactly once.
5. Attach the returned run ID to the existing workflow canvas.
6. Observe progress through factory APIs.
7. Distinguish completed, error, halted, and cancelled outcomes.
8. Never duplicate factory node work in the foreground agent.
```

If the canvas is unavailable, execution continues and the skill reports the run through text.

## Task 4: Implement read-only factory progress projection

The canvas extension:

1. Accepts the display manifest through `canvas.open`.
2. Exposes `attach_run({ runId })`.
3. Reads run details and paged progress through the session factory APIs.
4. Subscribes to `factory.run_updated`.
5. Treats updates as invalidations, not direct render commands.
6. Coalesces revisions for 100 ms.
7. Allows one detail request in flight.
8. Patches only changed node state.
9. Performs a low-frequency full refresh to recover dropped events.
10. Shows at most 250 individual nodes and aggregates overflow by phase.

State projection:

```text
factory phase/agent progress
          |
          v
match by exact phase title and agent label
          |
     +----+----+
     |         |
   matched   unmatched
     |         |
update node   create visible
state         "unmapped" node
```

The canvas must not display hidden chain-of-thought or raw internal prompts. Show only prompt-safe labels, activity summaries, status, timing, usage, and results exposed by factory observability APIs.

## Task 5: Tests and evaluations

### Test diagram

```text
plan request
  |
  +--> skill authors factory ------ invalid source -> clear failure
  |
  +--> skill opens canvas --------- unavailable -> textual fallback
  |
  `--> plan exit

execution request
  |
  +--> new run -------------------- completed/error/halted/cancelled
  |
  +--> existing resumable run ----- resume same run ID
  |
  `--> attach canvas -------------- failure does not stop run

progress
  |
  +--> known label ---------------- update planned node
  +--> unknown label -------------- show unmapped node
  `--> dropped event -------------- periodic full refresh repairs state
```

### Automated tests

- Planning-skill fixtures:
  - Sequential workflow.
  - Parallel workflow with unique labels.
  - Pipeline workflow.
  - Factory with structured output.
  - Factory with explicit limits.
  - Planning never invokes `run_factory`.
- Execution-skill fixtures:
  - Starts exactly one new run.
  - Resumes an existing resumable run.
  - Does not restart completed work.
  - Continues when canvas attachment fails.
- Canvas tests:
  - Planned graph rendering.
  - Running edge animation.
  - Completed, failed, halted, cancelled, and limit states.
  - Unmapped runtime agent.
  - Duplicate manifest node IDs.
  - Unknown run ID.
  - Event burst coalescing.
  - Recovery after a dropped update.
  - Reopen after session resume.

### Host smoke test

Run one real Copilot app flow:

```text
plan-workflow skill
  -> canvas visible
  -> approve plan
  -> execute-workflow skill
  -> one factory run
  -> canvas reaches completed state
```

## Failure modes

| Failure | Test | Handling | User visibility |
|---|---|---|---|
| Factory authoring fails | Yes | Planning skill stops | Clear error |
| Canvas cannot open | Yes | Plan remains usable | Clear fallback |
| Manifest and runtime labels differ | Yes | Add unmapped node | Visible |
| Run attachment fails | Yes | Factory continues | Canvas warning |
| Progress event is dropped | Yes | Periodic refresh | Brief delay only |
| Factory reaches a limit | Yes | Show typed failure and run ID | Clear, resumable |
| Extension reloads | Yes | Reopen from recorded canvas input and run ID | Recoverable |

**Critical silent gaps:** none, provided every unmatched runtime label is surfaced and attachment failures are reported.

## Performance requirements

- Coalesce factory revisions for 100 ms.
- Keep one detail request in flight.
- Patch changed nodes rather than replacing the whole graph.
- Refresh full detail at low frequency for recovery.
- Render at most 250 individual nodes.
- Aggregate overflow by phase.
- Do not retain an unbounded progress history in the browser.

## NOT in scope

- Editing or reconnecting workflow nodes in the canvas.
- Generating a second executable graph runtime.
- Detached or scheduled execution outside the Copilot session.
- Cross-provider routing outside Copilot.
- Importing ultracodex workflows in the first version.
- Choosing a visualization library before plain HTML demonstrates a concrete limitation.

## Deferred `TODOS.md` entries

### Revisit visualization libraries

**What:** Evaluate React Flow plus ELK, Cytoscape.js, Flint, and Vega-Lite after the plain-HTML canvas reaches a demonstrated rendering, layout, scale, or charting limitation.

**Why:** A workflow-native library may improve large-graph layout and interaction, while Flint or Vega-Lite may improve timing, usage, and success-rate charts. Adding one before evidence would increase bundle and maintenance cost without proving user value.

**Context:** The first version is a read-only factory visualizer generated through `/create-canvas`. Measure graph size, layout quality, animation smoothness, implementation complexity, and demand for analytical charts before selecting a library. React Flow/ELK fits workflow topology; Flint/Vega-Lite fits metrics rather than primary DAG rendering.

**Depends on / blocked by:** Ship and observe the plain-HTML canvas first.

### Add visual workflow editing

**What:** Let users add, remove, reconnect, and configure workflow nodes directly in the canvas and regenerate the session Agent Factory before approval.

**Why:** Direct editing would reduce chat round-trips and make the canvas a true shared planning artifact.

**Context:** Editing introduces a synchronization boundary between the visible graph and executable factory. The implementation must compile or regenerate the factory, validate labels and phases, freeze an approved revision, and prevent edits from mutating an active run.

**Depends on / blocked by:** Stable read-only manifest, factory authoring flow, and approval semantics.

### Import ultracodex workflows

**What:** Convert supported ultracodex JavaScript workflows into native session Agent Factories and display manifests.

**Why:** Existing workflows could migrate without keeping the ultracodex runtime as a production dependency.

**Context:** Import statically with Acorn and never execute source during conversion. Unsupported loops, dynamic calls, or side effects must produce blocking diagnostics rather than semantic drift.

**Depends on / blocked by:** Stable native factory and canvas manifest contracts.

## Reference index

### GitHub Copilot app and canvases

- **Working with canvas extensions in the GitHub Copilot app**  
  https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions  
  Primary product guidance. Covers `/create-canvas`, project scope under `.github/extensions`, user scope under `~/.copilot/extensions`, `extension.mjs`, optional `package.json`, persisted artifacts, app side-panel rendering, bidirectional canvas state, and agent-callable capabilities.

- **Customizing the GitHub Copilot app**  
  https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app  
  Reference for app-level customization and extension discovery.

- **How to build interactive experiences with canvases**  
  https://github.blog/ai-and-ml/github-copilot/how-to-build-interactive-experiences-with-canvases/  
  Product examples including interactive codebase diagrams, session/worktree views, kanban boards, and shared human-agent surfaces.

- **GitHub Copilot app**  
  https://github.com/features/ai/github-app  
  Product entry point for testing the generated canvas in the right side panel.

### GitHub Copilot CLI

- **Using GitHub Copilot CLI**  
  https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli  
  Plan mode, sessions, custom agents, skills, scheduling, permissions, and interactive CLI operation.

- **About extensions for GitHub Copilot CLI**  
  https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-extensions  
  Extension concepts, lifecycle, and trust considerations.

- **Creating a plugin for GitHub Copilot CLI**  
  https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating  
  Plugin structure, local installation, agents, skills, hooks, MCP configuration, and marketplace distribution.

- **Copilot CLI plugin reference**  
  https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference  
  Authoritative `plugin.json` fields and plugin packaging rules.

- **Official Copilot plugins repository**  
  https://github.com/github/copilot-plugins  
  Use as prior art for plugin packaging and distribution.

### GitHub Copilot SDK

- **GitHub Copilot SDK repository**  
  https://github.com/github/copilot-sdk  
  SDK source, documentation, compatibility notes, and language implementations.

- **Copilot SDK README and architecture**  
  https://github.com/github/copilot-sdk/blob/main/README.md  
  Confirms that SDK clients communicate with the Copilot CLI server over JSON-RPC and that Node.js SDK distributions can manage the CLI process lifecycle.

- **Getting started**  
  https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md

- **Node.js/TypeScript SDK**  
  https://github.com/github/copilot-sdk/tree/main/nodejs

- **SDK documentation index**  
  https://github.com/github/copilot-sdk/blob/main/docs/README.md

- **SDK feature documentation**  
  https://github.com/github/copilot-sdk/tree/main/docs/features  
  Check current custom-agent, skill, hook, MCP, session, and persistence guidance before implementation.

### Copilot extension and Agent Factory APIs

The following APIs were available in Copilot CLI **1.0.79-2** during planning:

```text
@github/copilot-sdk/extension
  joinSession()
  createCanvas()
  defineFactory()

Factory context
  ctx.agent()
  ctx.parallel()
  ctx.pipeline()
  ctx.phase()
  ctx.log()
  ctx.step()
  ctx.signal

Session factory API
  session.factory.run()
  session.factory.resume()
  session.factory.cancel()
  session.factory.listRuns()
  session.factory.getRunDetail()
  session.factory.getRunProgress()
  session.factory.waitForRun()

Events
  factory.run_updated
  session.canvas.opened
  session.canvas.closed
```

Agent-facing tools used by the skills:

```text
factories_manage guide
factories_manage list
factories_manage inspect
factories_manage author
factories_manage runs
factories_manage inspect-run
run_factory
list_canvas_capabilities
open_canvas
invoke_canvas_action
```

These surfaces are experimental. Re-run the extension guide on the implementation device before coding:

```text
extensions_manage({ operation: "guide" })
```

The guide prints the exact local documentation paths for that installed Copilot version. Read:

```text
<copilot-install>/copilot-sdk/docs/extensions.md
<copilot-install>/copilot-sdk/docs/agent-author.md
<copilot-install>/copilot-sdk/docs/examples.md
<copilot-install>/copilot-sdk/docs/factories.md
<copilot-install>/copilot-sdk/canvas.d.ts
<copilot-install>/copilot-sdk/extension.d.ts
<copilot-install>/copilot-sdk/types.d.ts
<copilot-install>/copilot-sdk/generated/session-events.d.ts
```

On the planning machine these resolved under:

```text
~/Library/Caches/copilot/pkg/darwin-arm64/1.0.79-2/copilot-sdk/
```

Do not copy that absolute cache path to another device. Use `extensions_manage guide` there.

### Canvas scaffolding and diagnostics

- Generate the initial extension:

```text
/create-canvas <canvas brief>
```

- Reload extension processes after editing:

```text
extensions_reload()
```

- Inspect extension status and logs:

```text
extensions_manage({ operation: "list" })
extensions_manage({ operation: "inspect", name: "workflow-factory-canvas" })
```

- Expected discovery paths:

```text
Project: .github/extensions/<name>/extension.mjs
User:    ~/.copilot/extensions/<name>/extension.mjs
Plugin:  extensions/<name>/extension.mjs inside an installed plugin
```

### Visualization candidates for the deferred evaluation

- **React Flow**  
  https://reactflow.dev/  
  Workflow-native React renderer with custom nodes, viewport controls, and animated edges.

- **Eclipse Layout Kernel / elkjs**  
  https://www.eclipse.dev/elk/  
  Directed and layered automatic layout engine. It is a layout engine, not a renderer.

- **Cytoscape.js**  
  https://js.cytoscape.org/  
  Framework-independent graph renderer suited to large relationship-heavy networks.

- **Flint**  
  https://github.com/microsoft/flint-chart  
  https://microsoft.github.io/flint-chart/  
  https://www.microsoft.com/en-us/research/blog/flint-a-visualization-language-for-the-ai-era/  
  Declarative, agent-friendly chart grammar. Evaluate for timing, usage, success-rate, and analytical views rather than assuming it fits primary workflow topology.

- **Vega-Lite**  
  https://vega.github.io/vega-lite/docs/  
  Declarative interactive chart grammar. Strong candidate for factory metrics, not necessarily the node-and-edge execution canvas.

### Deferred ultracodex migration references

- **ultracodex repository**  
  https://github.com/YuanpingSong/ultracodex

- **Workflow script semantics**  
  https://github.com/YuanpingSong/ultracodex/blob/main/docs/agent-script-spec.md

- **Executor contract**  
  https://github.com/YuanpingSong/ultracodex/blob/main/docs/executor-contract.md

- **Architecture**  
  https://github.com/YuanpingSong/ultracodex/blob/main/docs/architecture.md

Use these only for the deferred importer. The native plugin must not depend on the ultracodex package or runtime.

## Completion summary

- Step 0: Scope Challenge (user chose: SCOPE REDUCTION with canvas)
- Architecture Review: 2 issues found and resolved
- Code Quality Review: 1 issue found and resolved
- Test Review: diagram produced, 0 unresolved gaps
- Performance Review: 1 issue found and resolved
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 3 items approved
- Failure modes: 0 critical gaps flagged
