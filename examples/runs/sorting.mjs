// Sorting -- article run scenario 2 of 4.
//
//   ROUND 1            ROUND 2          FINAL
//   ------------------------------------------------
//   merge:a --+
//             +--> merge:ab --+
//   merge:b --+               |
//                             +--> merge:final --> order
//   merge:c --+               |
//             +--> merge:cd --+
//   merge:d --+
//
// The article's illustration labels its columns ROUND 1 / ROUND 2 / FINAL,
// which is a direct match for phases-as-columns: the phase titles here are
// those labels verbatim, so the canvas reproduces the picture without any
// layout special-casing.
//
// Note the phase titles are the ones `ctx.phase()` is called with, character
// for character. Correlation is on title, not on the manifest-local phase id,
// so drifting one of these is how every node ends up stacked in one column.

export default {
    id: "sorting",
    title: "Sorting",
    source: {
        section: "Sorting",
        url: "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code",
    },

    // Args the L3 harness drives `run` with. Eight items so all four quarters
    // in ROUND 1 are non-empty and every declared merge node is reached.
    harnessArgs: { items: ["a", "b", "c", "d", "e", "f", "g", "h"] },

    meta: {
        name: "sorting",
        description:
            "Sort items by merging judged pairs round by round. args: { items: string[] }",
        phases: [{ title: "ROUND 1" }, { title: "ROUND 2" }, { title: "FINAL" }],
        limits: { maxConcurrentSubagents: 4, maxTotalSubagents: 8, maxAiCredits: 700 },
    },

    run: async ({ args, parallel, agent, phase, log }) => {
        const items = Array.isArray(args?.items)
            ? args.items.filter((i) => typeof i === "string" && i.trim())
            : [];
        if (items.length < 2) throw new Error("sorting: args.items must have at least two strings");

        const ORDER = {
            type: "object",
            properties: { ordered: { type: "array", items: { type: "string" } } },
            required: ["ordered"],
        };

        const sortChunk = (chunk, label) =>
            agent(`Sort these from best to worst: ${chunk.join("; ")}. Return JSON {ordered:[string]}.`, {
                label,
                schema: ORDER,
            }).then((r) => (r === null ? null : r.ordered ?? []));

        // Round 1: four independent sorts of one quarter each.
        phase("ROUND 1");
        const size = Math.max(1, Math.ceil(items.length / 4));
        const quarters = ["a", "b", "c", "d"].map((key, i) => ({
            key,
            chunk: items.slice(i * size, (i + 1) * size),
        }));
        const sorted = await parallel(
            quarters.map((q) => () => (q.chunk.length ? sortChunk(q.chunk, `merge:${q.key}`) : null))
        );

        const runs = sorted.map((r, i) => (r === null ? quarters[i].chunk : r));

        // Round 2: merge the quarters pairwise.
        phase("ROUND 2");
        const pairs = [
            { key: "ab", chunk: [...runs[0], ...runs[1]] },
            { key: "cd", chunk: [...runs[2], ...runs[3]] },
        ].filter((p) => p.chunk.length);
        const merged = await parallel(pairs.map((p) => () => sortChunk(p.chunk, `merge:${p.key}`)));

        const halves = merged.map((m, i) => (m === null ? pairs[i].chunk : m));
        if (halves.length < 2) {
            log("only one half survived round 2; skipping the final merge");
            return { ordered: halves[0] ?? [] };
        }

        phase("FINAL");
        const final = await sortChunk([...halves[0], ...halves[1]], "merge:final");

        return { ordered: final === null ? [...halves[0], ...halves[1]] : final };
    },

    manifest: {
        factoryName: "sorting",
        title: "Sorting",
        phases: [
            { id: "r1", title: "ROUND 1" },
            { id: "r2", title: "ROUND 2" },
            { id: "final", title: "FINAL" },
        ],
        nodes: [
            { id: "merge-a", label: "merge:a", phaseId: "r1", kind: "process" },
            { id: "merge-b", label: "merge:b", phaseId: "r1", kind: "process" },
            { id: "merge-c", label: "merge:c", phaseId: "r1", kind: "process" },
            { id: "merge-d", label: "merge:d", phaseId: "r1", kind: "process" },
            { id: "merge-ab", label: "merge:ab", phaseId: "r2", kind: "process", detail: "a + b" },
            { id: "merge-cd", label: "merge:cd", phaseId: "r2", kind: "process", detail: "c + d" },
            {
                id: "merge-final",
                label: "merge:final",
                phaseId: "final",
                kind: "barrier",
                detail: "waits for both halves",
            },
            { id: "order", label: "order", phaseId: "final", kind: "terminal", detail: "artifact" },
        ],
        edges: [
            { from: "merge-a", to: "merge-ab" },
            { from: "merge-b", to: "merge-ab" },
            { from: "merge-c", to: "merge-cd" },
            { from: "merge-d", to: "merge-cd" },
            { from: "merge-ab", to: "merge-final" },
            { from: "merge-cd", to: "merge-final" },
            { from: "merge-final", to: "order", label: "sorted" },
        ],
    },

    scenarios: [
        {
            name: "round 1 complete, round 2 under way",
            detail: {
                status: "running",
                phases: [
                    { id: "r1", title: "ROUND 1", ordinal: 0, status: "completed" },
                    { id: "r2", title: "ROUND 2", ordinal: 1, status: "active" },
                    { id: "final", title: "FINAL", ordinal: 2, status: "pending" },
                ],
                currentPhase: "r2",
                agents: [
                    { label: "merge:a", status: "succeeded" },
                    { label: "merge:b", status: "succeeded" },
                    { label: "merge:c", status: "succeeded" },
                    { label: "merge:d", status: "succeeded" },
                    { label: "merge:ab", status: "running" },
                    { label: "merge:cd", status: "running" },
                ],
            },
            expect: {
                runStatus: "running",
                currentPhase: "r2",
                phaseStates: {
                    "r1": "completed",
                    "r2": "active",
                    "final": "pending",
                },
                nodeStates: {
                    "merge-a": "succeeded",
                    "merge-b": "succeeded",
                    "merge-c": "succeeded",
                    "merge-d": "succeeded",
                    "merge-ab": "running",
                    "merge-cd": "running",
                    "merge-final": "not-started",
                    order: "not-started",
                },
                unmapped: 0,
            },
        },
        {
            name: "cancelled during the final merge",
            detail: {
                status: "cancelled",
                phases: [
                    { id: "r1", title: "ROUND 1", ordinal: 0, status: "completed" },
                    { id: "r2", title: "ROUND 2", ordinal: 1, status: "completed" },
                    { id: "final", title: "FINAL", ordinal: 2, status: "active" },
                ],
                currentPhase: "final",
                agents: [
                    { label: "merge:a", status: "succeeded" },
                    { label: "merge:b", status: "succeeded" },
                    { label: "merge:c", status: "succeeded" },
                    { label: "merge:d", status: "succeeded" },
                    { label: "merge:ab", status: "succeeded" },
                    { label: "merge:cd", status: "succeeded" },
                    { label: "merge:final", status: "running" },
                ],
            },
            expect: {
                runStatus: "cancelled",
                currentPhase: "final",
                phaseStates: {
                    "r1": "completed",
                    "r2": "completed",
                    "final": "active",
                },
                nodeStates: {
                    "merge-a": "succeeded",
                    "merge-b": "succeeded",
                    "merge-c": "succeeded",
                    "merge-d": "succeeded",
                    "merge-ab": "succeeded",
                    "merge-cd": "succeeded",
                    "merge-final": "cancelled",
                    order: "not-started",
                },
                unmapped: 0,
            },
        },
    ],
};
