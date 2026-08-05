# TODOS

Deferred work, with the reasoning that put it here rather than in the first
version. Each entry states what it is, why it would help, and what has to be
true before it is worth starting.

## Revisit visualization libraries

**What:** Evaluate React Flow plus ELK, Cytoscape.js, Flint, and Vega-Lite once
the plain-HTML canvas hits a demonstrated rendering, layout, scale, or charting
limitation.

**Why:** A workflow-native library may improve large-graph layout and
interaction, and Flint or Vega-Lite may improve timing, usage, and success-rate
charts. Adding one before there is evidence would grow bundle size and
maintenance cost without proving user value.

**Context:** The first version is a read-only visualizer built from plain HTML
with no dependencies. Measure graph size, layout quality, animation smoothness,
implementation complexity, and actual demand for analytical charts before
picking anything. React Flow/ELK fits workflow topology; Flint and Vega-Lite fit
metrics rather than primary DAG rendering.

**Blocked by:** Shipping and observing the plain-HTML canvas.

## Add visual workflow editing

**What:** Let users add, remove, reconnect, and configure nodes directly in the
canvas, then regenerate the session factory before approval.

**Why:** Direct editing would cut chat round-trips and make the canvas a shared
planning artifact instead of a picture of one.

**Context:** Editing opens a synchronization boundary between the visible graph
and the executable factory. An implementation has to regenerate the factory,
validate labels and phases, freeze an approved revision, and refuse edits
against an active run.

**Blocked by:** Stable read-only manifest, factory authoring flow, and approval
semantics.

## Import ultracodex workflows

**What:** Convert supported ultracodex JavaScript workflows into native session
factories and display manifests.

**Why:** Existing workflows could migrate without keeping the ultracodex runtime
as a production dependency.

**Context:** Import statically with Acorn and never execute source during
conversion. Unsupported loops, dynamic calls, or side effects must produce
blocking diagnostics rather than silently drifting in meaning.

**Blocked by:** Stable native factory and canvas manifest contracts.

## Persist a manifest replaced via `set_manifest`

**What:** Decide whether a manifest swapped in through `set_manifest` should
survive a reload.

**Why:** After `extensions_reload` the runtime re-invokes `open()` with the
input recorded on file, so a replaced manifest is lost while the attached run
is correctly restored. That split is surprising.

**Context:** Attachment state already persists per factory name in the
extension's artifacts directory, so the mechanism exists. The open question is
whether a replaced manifest is a durable fact about the canvas or a transient
override that should reset.

**Blocked by:** Nothing technical; needs a product decision.

## Observe the remaining node states against a live run

**What:** Exercise `failed`, `halted`, and `unmapped` node states in a real
factory run.

**Why:** These are covered by unit tests with synthetic wire data, and the other
states behaved exactly as projected once seen live. But `not-started`,
`running`, `succeeded`, and `cancelled` were all confirmed against real runs,
and the two bugs found during that exercise were both in assumptions that
looked correct on paper.

**Context:** Needs a factory that deliberately fails an agent and one that
halts, plus an agent whose label does not appear in the manifest. The fixtures in
`examples/runs/` now cover all three on paper — `memory-and-rules` scenario 3
carries an undeclared `rule:5`, and several scenarios fail a node mid-run — so
this is now specifically about confirming the synthetic wire data was right, not
about discovering what the states look like. Do it as part of the capture work
below rather than as a separate exercise.

**Blocked by:** Nothing; it costs credits, which is the only reason it is
deferred.

## Freeze real run detail as fixture captures

**What:** Run the ten `examples/` fixtures as real factories, capture the
`FactoryRunDetail` each one emits into `examples/captures/`, and derive an
`assertWireShape(detail)` helper from those captures that every fixture scenario
is then checked against.

**Why:** Every scenario in `examples/` is currently a hand-written approximation
of the wire format. `projection.mjs` coerces silently in at least four places —
`Number(a?.startedAt)` expects epoch milliseconds, so an ISO string becomes `NaN`,
gets filtered out, and surfaces as `null` with no error; `Number(a?.activeMs) || 0`
turns any junk into `0`. A fixture can therefore be wrong about the format the
runtime actually sends and still pass all four suites. Captured data is the only
thing that closes that gap, and once frozen it replays forever at zero cost.

**Context:** The fixtures currently omit timestamps entirely, which sidesteps the
coercion rather than testing it — that was deliberate, because guessing at a
format and asserting the guess is worse than not asserting. Ten runs is roughly
49 agents. Limits are cumulative across attempts, so budget the ceiling generously
up front rather than raising it mid-run, and keep every prompt to a one-word
answer. A run that trips `factory_limit_reached` still yields a useful partial
capture; write it and mark it partial. Capture immediately on completion — run
detail is not retrievable later.

**Depends on:** Nothing technical. It costs real credits, which is why it is not
in the first version.

## Compare canvas renders against the article diagrams

**What:** Screenshot each fixture's rendered canvas and lay it out side by side
with the corresponding illustration from the source article for human judgement.

**Why:** The fixtures exist partly as a fidelity target — the canvas is supposed
to be able to draw the shapes in that article. Nothing currently checks that
claim visually.

**Context:** Deliberately *not* urgent, because `tests/dom-shim.mjs` already
executes the real client script in Node, and the canvas suite asserts node
geometry, group boxes, detail lines, and edge-label midpoints against
hand-derived values. Screenshots would add pixels for a human to eyeball and
almost nothing else. Doing it needs a headless browser, which would be this
repo's first dependency of any kind, so it should sit behind an env flag and stay
out of `npm test`. If it is built: a missing golden must **fail**, never
silently bootstrap itself — a self-creating golden asserts nothing on the run
that matters.

**Blocked by:** A decision to accept a browser dependency, even an optional one.
