// Pure projection: (manifest, FactoryRunDetail) -> renderable view model.
//
// This module has no I/O and no SDK imports so it can be unit tested directly.
// Everything the iframe renders is derived here.

/** Node states the canvas can render. Ordered by display precedence. */
export const NODE_STATES = Object.freeze([
    "not-started",
    "queued",
    "running",
    "succeeded",
    "failed",
    "halted",
    "cancelled",
    "unmapped",
]);

// Lower rank wins when several runtime agents collapse onto one manifest node.
// "running" beats everything because work is still in flight; "failed" beats
// "succeeded" so a partial failure is never hidden by a sibling success.
const STATE_RANK = Object.freeze({
    running: 0,
    queued: 1,
    failed: 2,
    halted: 3,
    cancelled: 4,
    succeeded: 5,
    "not-started": 6,
    unmapped: 7,
});

/**
 * Map a raw `FactoryAgentSummary.status` onto a node state.
 *
 * The SDK types this field as an open `string`, so unknown values must not
 * throw or silently vanish. Known vocabulary observed in the runtime:
 * pending | running | idle | completed | error | cancelled | halted.
 * Note the runtime says "error", not "failed", and treats "idle" as live
 * (it filters `status === "running" || status === "idle"` for liveAgentCount).
 */
export function normalizeAgentStatus(raw) {
    const s = String(raw ?? "")
        .trim()
        .toLowerCase();
    switch (s) {
        case "running":
        case "idle":
        case "active":
            return "running";
        case "pending":
        case "queued":
        case "waiting":
            return "queued";
        case "completed":
        case "succeeded":
        case "success":
        case "done":
            return "succeeded";
        case "error":
        case "failed":
        case "failure":
            return "failed";
        case "cancelled":
        case "canceled":
            return "cancelled";
        case "halted":
            return "halted";
        case "skipped":
            return "not-started";
        default:
            // An agent exists but its state is not understood. "queued" is the
            // most conservative claim we can make (it was created, we cannot
            // assert it is running or finished). The raw value is preserved on
            // the node so nothing is hidden from the user.
            return "queued";
    }
}

function isKnownAgentStatus(raw) {
    const s = String(raw ?? "")
        .trim()
        .toLowerCase();
    return [
        "running",
        "idle",
        "active",
        "pending",
        "queued",
        "waiting",
        "completed",
        "succeeded",
        "success",
        "done",
        "error",
        "failed",
        "failure",
        "cancelled",
        "canceled",
        "halted",
        "skipped",
    ].includes(s);
}

function combineStates(states) {
    let best = null;
    for (const s of states) {
        if (best === null || STATE_RANK[s] < STATE_RANK[best]) best = s;
    }
    return best;
}

function key(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}

/**
 * `terminal.failure` is a discriminated union object, not a string.
 * Render it as one prompt-safe line.
 */
function describeFailure(failure) {
    if (!failure || typeof failure !== "object") return failure ? String(failure) : null;
    switch (failure.type) {
        case "factory_limit_reached":
            return `Resource ceiling reached: ${failure.kind} (limit ${failure.value}).`;
        case "factory_resume_declined":
            return `Resume declined: ${failure.reason ?? "no reason given"}.`;
        case "factory_durable_failure":
            return `Durable ${failure.operation ?? "operation"} failed: ${failure.code ?? "unknown code"}.`;
        default:
            return `Run failed (${failure.type ?? "unknown failure"}).`;
    }
}

/** Timestamps on the wire are epoch milliseconds. */
function toIso(ms) {
    const n = Number(ms);
    return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}

/**
 * Correlate manifest phases with runtime phase observations.
 * Manifest phase id is tried first, then title (plan contract: phase titles
 * must match the titles the factory declares).
 */
function buildPhaseIndex(manifest, detail) {
    const runtimePhases = Array.isArray(detail?.phases) ? detail.phases : [];
    const byId = new Map();
    const byTitle = new Map();
    for (const rp of runtimePhases) {
        if (rp?.id != null) byId.set(key(rp.id), rp);
        if (rp?.title != null && !byTitle.has(key(rp.title))) byTitle.set(key(rp.title), rp);
    }

    const phases = [];
    // runtime phase id -> manifest phase id, so unmapped agents land in the
    // right column.
    const runtimeToManifest = new Map();
    const claimed = new Set();

    for (const [i, mp] of (manifest.phases ?? []).entries()) {
        const match = byId.get(key(mp.id)) ?? byTitle.get(key(mp.title));
        if (match) {
            claimed.add(key(match.id));
            runtimeToManifest.set(key(match.id), mp.id);
        }
        phases.push({
            id: mp.id,
            title: mp.title,
            ordinal: match?.ordinal ?? i,
            status: match?.status ?? "pending",
            matched: Boolean(match),
            liveAgentCount: match?.liveAgentCount ?? 0,
            totalAgentCount: match?.totalAgentCount ?? 0,
            accumulatedActiveMs: match?.accumulatedActiveMs ?? 0,
            currentActiveMs: match?.currentActiveMs ?? 0,
            startedAt: match?.startedAt ?? null,
            completedAt: match?.completedAt ?? null,
            nodeIds: [],
            synthetic: false,
        });
    }

    // Runtime phases the manifest never declared still need somewhere to put
    // their agents, otherwise those agents would be invisible.
    for (const rp of runtimePhases) {
        if (claimed.has(key(rp.id))) continue;
        const id = `__runtime__:${rp.id}`;
        runtimeToManifest.set(key(rp.id), id);
        phases.push({
            id,
            title: rp.title ?? String(rp.id),
            ordinal: rp.ordinal ?? phases.length,
            status: rp.status ?? "pending",
            matched: true,
            liveAgentCount: rp.liveAgentCount ?? 0,
            totalAgentCount: rp.totalAgentCount ?? 0,
            accumulatedActiveMs: rp.accumulatedActiveMs ?? 0,
            currentActiveMs: rp.currentActiveMs ?? 0,
            startedAt: rp.startedAt ?? null,
            completedAt: rp.completedAt ?? null,
            nodeIds: [],
            synthetic: true,
        });
    }

    phases.sort((a, b) => a.ordinal - b.ordinal);
    return { phases, runtimeToManifest };
}

/** Group runtime agents by the manifest node they belong to. */
function indexAgents(manifest, detail) {
    const agents = Array.isArray(detail?.agents) ? detail.agents : [];
    // Manifest nodes are addressable by label (the documented join key) and,
    // defensively, by id.
    const nodeByKey = new Map();
    for (const n of manifest.nodes ?? []) {
        if (n?.label != null) nodeByKey.set(key(n.label), n.id);
        if (n?.id != null && !nodeByKey.has(key(n.id))) nodeByKey.set(key(n.id), n.id);
    }

    const byNode = new Map(); // manifest node id -> agents[]
    const orphans = []; // agents whose label matches no manifest node
    for (const a of agents) {
        const nodeId = nodeByKey.get(key(a?.label)) ?? nodeByKey.get(key(a?.agentId));
        if (nodeId === undefined) orphans.push(a);
        else {
            if (!byNode.has(nodeId)) byNode.set(nodeId, []);
            byNode.get(nodeId).push(a);
        }
    }
    return { byNode, orphans };
}

function summarizeAgents(agents, runStatus) {
    const states = agents.map((a) => normalizeAgentStatus(a?.status));
    let state = combineStates(states) ?? "not-started";

    // A run that stops while an agent is still in flight leaves that agent's
    // last-known status stale. Reflect the run-level outcome so the node does
    // not appear to be working forever.
    if (runStatus === "halted" && state === "running") state = "halted";
    if (runStatus === "cancelled" && (state === "running" || state === "queued")) state = "cancelled";

    const live = agents.filter((a) => normalizeAgentStatus(a?.status) === "running").length;
    const activeMs = agents.reduce((sum, a) => sum + (Number(a?.activeMs) || 0), 0);
    // Epoch milliseconds, so sort numerically -- not lexicographically.
    const startedAts = agents
        .map((a) => Number(a?.startedAt))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((x, y) => x - y);
    const completedAts = agents
        .map((a) => Number(a?.completedAt))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((x, y) => x - y);
    const activity = agents.find((a) => normalizeAgentStatus(a?.status) === "running" && a?.activity)?.activity ?? null;
    const rawStatuses = [...new Set(agents.map((a) => String(a?.status ?? "")).filter(Boolean))];
    const unknownStatus = rawStatuses.some((s) => !isKnownAgentStatus(s));

    return {
        state,
        agentCount: agents.length,
        liveCount: live,
        activeMs,
        startedAt: toIso(startedAts[0]),
        completedAt:
            state === "running" || state === "queued" ? null : toIso(completedAts[completedAts.length - 1]),
        activity,
        rawStatuses,
        unknownStatus,
        models: [...new Set(agents.map((a) => a?.resolvedModel ?? a?.requestedModel).filter(Boolean))],
    };
}

/**
 * Build the full view model the iframe renders.
 *
 * @param manifest normalized manifest ({ factoryName, title, phases, nodes, edges })
 * @param detail   FactoryRunDetail, or null/undefined when no run is attached
 * @param options  { maxNodes?: number, progressLimit?: number, errors?: string[], warnings?: string[], runError?: string|null }
 */
export function projectRun(manifest, detail, options = {}) {
    const maxNodes = Number.isFinite(options.maxNodes) ? options.maxNodes : 250;
    const progressLimit = Number.isFinite(options.progressLimit) ? options.progressLimit : 120;
    const runStatus = detail?.status ?? null;

    const { phases, runtimeToManifest } = buildPhaseIndex(manifest, detail);
    const phaseById = new Map(phases.map((p) => [p.id, p]));
    const { byNode, orphans } = indexAgents(manifest, detail);

    const nodes = [];

    for (const mn of manifest.nodes ?? []) {
        const agents = byNode.get(mn.id) ?? [];
        const summary = agents.length
            ? summarizeAgents(agents, runStatus)
            : {
                  state: "not-started",
                  agentCount: 0,
                  liveCount: 0,
                  activeMs: 0,
                  startedAt: null,
                  completedAt: null,
                  activity: null,
                  rawStatuses: [],
                  unknownStatus: false,
                  models: [],
              };
        const phaseId = phaseById.has(mn.phaseId) ? mn.phaseId : (phases[0]?.id ?? null);
        nodes.push({
            id: mn.id,
            label: mn.label,
            kind: mn.kind ?? "agent",
            detail: mn.detail ?? null,
            phaseId,
            groupId: mn.groupId ?? null,
            declared: true,
            unmapped: false,
            ...summary,
        });
    }

    // Runtime agents whose label is absent from the manifest become explicit
    // `unmapped` nodes. The plan requires these be visible rather than dropped.
    const orphanGroups = new Map(); // manifest phase id -> agents[]
    for (const a of orphans) {
        const phaseId = runtimeToManifest.get(key(a?.phaseId)) ?? phases[0]?.id ?? null;
        if (!orphanGroups.has(phaseId)) orphanGroups.set(phaseId, []);
        orphanGroups.get(phaseId).push(a);
    }

    let unmappedCount = 0;
    for (const [phaseId, agents] of orphanGroups) {
        for (const a of agents) {
            unmappedCount += 1;
            const summary = summarizeAgents([a], runStatus);
            nodes.push({
                id: `__unmapped__:${a.agentId}`,
                label: a.label || a.agentId || "(unlabelled agent)",
                kind: "unmapped",
                phaseId,
                declared: false,
                unmapped: true,
                ...summary,
            });
        }
    }

    // Keep the DOM bounded. Declared nodes are always kept; surplus unmapped
    // nodes collapse into one aggregate chip per phase.
    let truncated = false;
    let renderNodes = nodes;
    if (nodes.length > maxNodes) {
        truncated = true;
        const declared = nodes.filter((n) => n.declared);
        const undeclared = nodes.filter((n) => !n.declared);
        const budget = Math.max(0, maxNodes - declared.length);

        // Aggregate chips occupy render slots too, so they have to be charged
        // against the same budget -- otherwise the cap is overshot by one chip
        // per collapsed phase. How many chips we need depends on which nodes we
        // collapse, so settle it with a short fixed-point loop (it converges
        // because the chip count is bounded by the phase count and `keepCount`
        // only ever decreases).
        let keepCount = budget;
        for (let guard = 0; guard < 16; guard++) {
            const wouldCollapse = undeclared.slice(keepCount);
            const chipCount = new Set(wouldCollapse.map((n) => n.phaseId)).size;
            if (keepCount === 0 || keepCount + chipCount <= budget) break;
            keepCount = Math.max(0, budget - chipCount);
        }

        const kept = undeclared.slice(0, keepCount);
        const collapsed = undeclared.slice(keepCount);
        const byPhase = new Map();
        for (const n of collapsed) {
            if (!byPhase.has(n.phaseId)) byPhase.set(n.phaseId, []);
            byPhase.get(n.phaseId).push(n);
        }
        const aggregates = [...byPhase].map(([phaseId, group]) => ({
            id: `__aggregate__:${phaseId}`,
            label: `+${group.length} more agents`,
            kind: "aggregate",
            phaseId,
            declared: false,
            unmapped: true,
            aggregate: true,
            state: combineStates(group.map((n) => n.state)) ?? "queued",
            agentCount: group.reduce((s, n) => s + n.agentCount, 0),
            liveCount: group.reduce((s, n) => s + n.liveCount, 0),
            activeMs: group.reduce((s, n) => s + n.activeMs, 0),
            startedAt: null,
            completedAt: null,
            activity: null,
            rawStatuses: [],
            unknownStatus: group.some((n) => n.unknownStatus),
            models: [],
        }));
        renderNodes = [...declared, ...kept, ...aggregates];
    }

    for (const n of renderNodes) {
        const p = phaseById.get(n.phaseId);
        if (p) p.nodeIds.push(n.id);
    }

    const nodeStateById = new Map(renderNodes.map((n) => [n.id, n.state]));
    const edges = (manifest.edges ?? [])
        .filter((e) => nodeStateById.has(e.from) && nodeStateById.has(e.to))
        .map((e) => {
            const from = nodeStateById.get(e.from);
            const to = nodeStateById.get(e.to);
            // An edge animates when work is flowing across it: the target is
            // running, or the source is running and the target is waiting.
            const active = to === "running" || (from === "running" && to === "queued");
            return { from: e.from, to: e.to, label: e.label ?? null, active };
        });

    const counts = {};
    for (const s of NODE_STATES) counts[s] = 0;
    for (const n of renderNodes) counts[n.state] = (counts[n.state] ?? 0) + 1;

    const records = Array.isArray(detail?.progress?.records) ? detail.progress.records : [];
    const progress = records.slice(-progressLimit).map((r) => ({
        seq: r.seq,
        phaseId: runtimeToManifest.get(key(r.phaseId)) ?? r.phaseId ?? null,
        kind: r.kind ?? "log",
        text: r.text ?? "",
        recordedAt: toIso(r.recordedAt),
    }));

    // Container groups resolve to the set of members that actually made it into
    // the render set. A group is drawn as a bounding box around its members, so
    // a group with nothing left to bound has no box and is dropped.
    //
    // Declared manifest nodes currently always survive the node cap above (it
    // only trims undeclared runtime agents), so in practice no group loses
    // members here. That is an invariant of the trimming logic rather than a
    // guarantee of the schema, so resolve membership from `renderNodes` instead
    // of assuming it -- a group box computed from a missing node would produce
    // NaN geometry and fail silently.
    const groups = (manifest.groups ?? [])
        .map((g) => ({
            id: g.id,
            title: g.title,
            detail: g.detail ?? null,
            nodeIds: renderNodes.filter((n) => n.groupId === g.id).map((n) => n.id),
        }))
        .filter((g) => g.nodeIds.length > 0);

    return {
        schema: 1,
        title: manifest.title ?? manifest.factoryName ?? "Workflow",
        factoryName: manifest.factoryName ?? null,
        runId: detail?.runId ?? null,
        runStatus,
        revision: detail?.revision ?? null,
        attached: Boolean(detail),
        createdAt: toIso(detail?.createdAt),
        startedAt: toIso(detail?.startedAt),
        updatedAt: toIso(detail?.updatedAt),
        completedAt: toIso(detail?.completedAt),
        currentPhase: detail?.currentPhase ?? null,
        liveAgentCount: detail?.liveAgentCount ?? 0,
        totalSpawnedAgentCount: detail?.totalSpawnedAgentCount ?? 0,
        consumed: detail?.consumed ?? null,
        terminal: detail?.terminal
            ? {
                  reason: detail.terminal.reason ?? null,
                  // `resultPreview` is deliberately not surfaced: this canvas
                  // shows progress only, never agent output.
                  error: detail.terminal.error ? String(detail.terminal.error) : null,
                  failure: describeFailure(detail.terminal.failure),
              }
            : null,
        phases,
        nodes: renderNodes,
        edges,
        groups,
        counts,
        unmappedCount,
        truncated,
        progress,
        errors: options.errors ?? [],
        warnings: options.warnings ?? [],
        runError: options.runError ?? null,
        generatedAt: new Date().toISOString(),
    };
}
