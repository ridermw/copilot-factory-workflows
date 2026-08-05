// Manifest contract for the workflow canvas.
//
// The manifest is pure data. It is never executed, never eval'd, and never
// turned into factory code by this extension -- it only describes the graph to
// draw. Authoring the actual factory is the job of the plan-workflow skill.

/**
 * JSON Schema for the canvas `open` input. The runtime validates this before
 * `open` runs and returns `canvas_input_invalid` on failure, so this catches
 * gross shape errors. Semantic problems (dangling edges, duplicate ids) are
 * reported by `normalizeManifest` and rendered in the panel instead of
 * failing the open, so the user sees a diagnosable error rather than a blank
 * or missing canvas.
 */
export const MANIFEST_INPUT_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["manifest"],
    properties: {
        manifest: {
            type: "object",
            additionalProperties: false,
            required: ["factoryName", "phases", "nodes"],
            properties: {
                factoryName: { type: "string", minLength: 1, maxLength: 200 },
                title: { type: "string", maxLength: 200 },
                phases: {
                    type: "array",
                    maxItems: 100,
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["id", "title"],
                        properties: {
                            id: { type: "string", minLength: 1, maxLength: 200 },
                            title: { type: "string", minLength: 1, maxLength: 200 },
                            detail: { type: "string", maxLength: 500 },
                        },
                    },
                },
                nodes: {
                    type: "array",
                    maxItems: 1000,
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["id", "label"],
                        properties: {
                            id: { type: "string", minLength: 1, maxLength: 200 },
                            label: { type: "string", minLength: 1, maxLength: 200 },
                            phaseId: { type: "string", minLength: 1, maxLength: 200 },
                            groupId: { type: "string", minLength: 1, maxLength: 200 },
                            kind: { type: "string", maxLength: 60 },
                            detail: { type: "string", maxLength: 500 },
                        },
                    },
                },
                edges: {
                    type: "array",
                    maxItems: 4000,
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["from", "to"],
                        properties: {
                            from: { type: "string", minLength: 1, maxLength: 200 },
                            to: { type: "string", minLength: 1, maxLength: 200 },
                            label: { type: "string", maxLength: 120 },
                        },
                    },
                },
                // Container groups draw a labelled box around a set of nodes.
                // Purely visual, and free to span phases -- the article's
                // "quarantine" / "trusted" boundaries cut across stages rather
                // than lining up with them.
                groups: {
                    type: "array",
                    maxItems: 50,
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["id", "title"],
                        properties: {
                            id: { type: "string", minLength: 1, maxLength: 200 },
                            title: { type: "string", minLength: 1, maxLength: 200 },
                            detail: { type: "string", maxLength: 500 },
                        },
                    },
                },
            },
        },
        runId: { type: "string", minLength: 1, maxLength: 200 },
    },
});

export const EMPTY_MANIFEST = Object.freeze({
    factoryName: null,
    title: "Workflow",
    phases: [],
    nodes: [],
    edges: [],
    groups: [],
});

/**
 * Normalize and semantically validate a manifest.
 * Always returns a renderable manifest; problems are reported in `errors`
 * and `warnings` rather than thrown.
 *
 * @returns {{ manifest: object, errors: string[], warnings: string[] }}
 */
export function normalizeManifest(raw) {
    const errors = [];
    const warnings = [];

    if (!raw || typeof raw !== "object") {
        return { manifest: { ...EMPTY_MANIFEST }, errors: ["Manifest is missing or not an object."], warnings };
    }

    const factoryName = typeof raw.factoryName === "string" ? raw.factoryName.trim() : "";
    if (!factoryName) errors.push("Manifest is missing `factoryName`.");

    const phases = [];
    const seenPhase = new Set();
    for (const [i, p] of (Array.isArray(raw.phases) ? raw.phases : []).entries()) {
        const id = typeof p?.id === "string" ? p.id.trim() : "";
        const title = typeof p?.title === "string" ? p.title.trim() : "";
        if (!id) {
            errors.push(`Phase at index ${i} has no \`id\`.`);
            continue;
        }
        if (seenPhase.has(id)) {
            errors.push(`Duplicate phase id \`${id}\`.`);
            continue;
        }
        seenPhase.add(id);
        phases.push({ id, title: title || id, detail: p?.detail ?? null });
    }
    if (phases.length === 0) {
        // A single implicit phase keeps the graph renderable when the author
        // declared nodes but no phases.
        phases.push({ id: "__default__", title: "Workflow", detail: null });
        if (Array.isArray(raw.phases) && raw.phases.length > 0) {
            warnings.push("No usable phases were found; nodes were placed in a single default phase.");
        }
    }

    const nodes = [];
    const seenNode = new Set();
    const seenLabel = new Map();
    for (const [i, n] of (Array.isArray(raw.nodes) ? raw.nodes : []).entries()) {
        const id = typeof n?.id === "string" ? n.id.trim() : "";
        const label = typeof n?.label === "string" ? n.label.trim() : "";
        if (!id) {
            errors.push(`Node at index ${i} has no \`id\`.`);
            continue;
        }
        if (!label) {
            errors.push(`Node \`${id}\` has no \`label\`. Labels are the join key to factory agent labels.`);
            continue;
        }
        if (seenNode.has(id)) {
            errors.push(`Duplicate node id \`${id}\`.`);
            continue;
        }
        seenNode.add(id);

        // Duplicate labels break correlation: two nodes would claim the same
        // runtime agent. ctx.agent() also memoizes on label, so duplicates are
        // a factory-authoring bug too.
        const lower = label.toLowerCase();
        if (seenLabel.has(lower)) {
            errors.push(
                `Nodes \`${seenLabel.get(lower)}\` and \`${id}\` share the label "${label}". ` +
                    "Agent labels must be unique -- ctx.agent() memoizes on label, so duplicates collapse into one subagent.",
            );
        } else {
            seenLabel.set(lower, id);
        }

        let phaseId = typeof n?.phaseId === "string" ? n.phaseId.trim() : "";
        if (!phaseId) {
            phaseId = phases[0].id;
        } else if (!seenPhase.has(phaseId) && phaseId !== "__default__") {
            errors.push(`Node \`${id}\` references unknown phase \`${phaseId}\`.`);
            phaseId = phases[0].id;
        }

        nodes.push({
            id,
            label,
            phaseId,
            groupId: typeof n?.groupId === "string" && n.groupId.trim() ? n.groupId.trim() : null,
            kind: typeof n?.kind === "string" && n.kind.trim() ? n.kind.trim() : "agent",
            detail: n?.detail ?? null,
        });
    }
    if (nodes.length === 0) errors.push("Manifest declares no nodes.");

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = [];
    const seenEdge = new Set();
    for (const [i, e] of (Array.isArray(raw.edges) ? raw.edges : []).entries()) {
        const from = typeof e?.from === "string" ? e.from.trim() : "";
        const to = typeof e?.to === "string" ? e.to.trim() : "";
        if (!from || !to) {
            errors.push(`Edge at index ${i} is missing \`from\` or \`to\`.`);
            continue;
        }
        if (!nodeIds.has(from)) {
            errors.push(`Edge at index ${i} references unknown node \`${from}\`.`);
            continue;
        }
        if (!nodeIds.has(to)) {
            errors.push(`Edge at index ${i} references unknown node \`${to}\`.`);
            continue;
        }
        if (from === to) {
            warnings.push(`Edge at index ${i} is a self-loop on \`${from}\` and was dropped.`);
            continue;
        }
        const dedupe = `${from}\u0000${to}`;
        if (seenEdge.has(dedupe)) continue;
        seenEdge.add(dedupe);
        edges.push({ from, to, label: e?.label ?? null });
    }

    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : factoryName || "Workflow";

    // Container groups are validated last, because membership is expressed on
    // the nodes and a group is only meaningful once its members are known.
    //
    //   groups[] declared ──┐
    //                       ├─► id missing/dup ──► error, drop group
    //   nodes[].groupId ────┘
    //                       ├─► points at unknown group ──► error, clear the
    //                       │   pointer but KEEP the node (a bad box must not
    //                       │   silently delete work from the graph)
    //                       └─► group ends with 0 members ──► warn, drop group
    //                           (an empty box renders as a stray rectangle)
    const groups = [];
    const seenGroup = new Set();
    for (const [i, g] of (Array.isArray(raw.groups) ? raw.groups : []).entries()) {
        const id = typeof g?.id === "string" ? g.id.trim() : "";
        const gTitle = typeof g?.title === "string" ? g.title.trim() : "";
        if (!id) {
            errors.push(`Group at index ${i} has no \`id\`.`);
            continue;
        }
        if (seenGroup.has(id)) {
            errors.push(`Duplicate group id \`${id}\`.`);
            continue;
        }
        seenGroup.add(id);
        groups.push({ id, title: gTitle || id, detail: g?.detail ?? null });
    }

    const memberCount = new Map();
    for (const n of nodes) {
        if (!n.groupId) continue;
        if (!seenGroup.has(n.groupId)) {
            errors.push(`Node \`${n.id}\` references unknown group \`${n.groupId}\`.`);
            n.groupId = null;
            continue;
        }
        memberCount.set(n.groupId, (memberCount.get(n.groupId) ?? 0) + 1);
    }

    const liveGroups = groups.filter((g) => {
        if (memberCount.get(g.id)) return true;
        warnings.push(`Group \`${g.id}\` has no member nodes and was dropped.`);
        return false;
    });

    return {
        manifest: { factoryName: factoryName || null, title, phases, nodes, edges, groups: liveGroups },
        errors,
        warnings,
    };
}
