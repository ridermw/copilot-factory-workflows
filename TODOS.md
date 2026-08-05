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
halts, plus an agent whose label does not appear in the manifest.

**Blocked by:** Nothing; it costs credits, which is the only reason it is
deferred.
