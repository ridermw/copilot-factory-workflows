// Loop Until Done -- article pattern 6 of 6.
//
//                    +---------------------------------+
//                    |  yes -- spawn another            |
//                    v                                  |
//   [sweep] ------------> <gate: new findings?> --------+
//                                 |
//                                 +-- no -- done --> done
//
// The back-edge is the entire pattern, and it is the one edge the canvas has
// to draw differently: `gate` sits to the right of `sweep`, so the return arrow
// is bowed out past both nodes instead of being drawn straight through them.
//
// Modelled as `sweep -> gate -> sweep`, never as a self-loop. A true self-loop
// is dropped with a warning during normalization, so a two-node cycle is both
// the honest model -- the decision really is a separate agent -- and the only
// one that survives.
//
// Every iteration reuses the labels `sweep` and `gate`. The prompts differ per
// round, so these are genuinely distinct subagents rather than one memoized
// call, but they all map onto the same pair of nodes. That is what makes the
// loop read as a loop: the node stands for the loop body, not for one visit.

export default {
    id: "loop-until-done",
    title: "Loop Until Done",
    source: {
        section: "Six workflow patterns",
        url: "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code",
    },

    // Args the L3 harness drives `run` with. Kept beside the run body so the
    // two stay in step when either changes. `maxRounds` is pinned low so the
    // harness exercises the ceiling rather than the stop condition alone.
    harnessArgs: { target: "the payments module", maxRounds: 2 },

    meta: {
        name: "loop-until-done",
        description:
            "Sweep for findings and keep sweeping while new ones turn up. args: { target: string, maxRounds?: number }",
        phases: [{ title: "Sweep" }, { title: "Decide" }],
        limits: { maxConcurrentSubagents: 1, maxTotalSubagents: 8, maxAiCredits: 400 },
    },

    run: async ({ args, agent, phase, log }) => {
        const target = typeof args?.target === "string" ? args.target.trim() : "";
        if (!target) throw new Error("loop-until-done: args.target must be a non-empty string");

        // A loop with no ceiling is a loop that can bill forever. Cap it here as
        // well as in `limits`, so the run ends deliberately rather than by
        // tripping factory_limit_reached.
        const requested = Number(args?.maxRounds);
        const maxRounds = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 4) : 3;

        const FINDINGS = {
            type: "object",
            properties: { findings: { type: "array", items: { type: "string" } } },
            required: ["findings"],
        };
        const MORE = {
            type: "object",
            properties: { more: { type: "boolean" } },
            required: ["more"],
        };

        const seen = [];
        let rounds = 0;

        for (let round = 1; round <= maxRounds; round += 1) {
            rounds = round;

            phase("Sweep");
            const swept = await agent(
                `Round ${round}. Sweep ${target} for issues not already listed: ${seen.join("; ") || "none yet"}. Return JSON {findings:[string]}.`,
                { label: "sweep", schema: FINDINGS }
            );
            if (swept === null) {
                log(`sweep round ${round} produced nothing; stopping`);
                break;
            }

            const fresh = (swept.findings ?? []).filter((f) => !seen.includes(f));
            seen.push(...fresh);

            phase("Decide");
            const gate = await agent(
                `Round ${round} found ${fresh.length} new issue(s) in ${target}. Is another sweep likely to find more? Return JSON {more}.`,
                { label: "gate", schema: MORE }
            );
            if (gate === null || !gate.more) break;
        }

        return { findings: seen, rounds };
    },

    manifest: {
        factoryName: "loop-until-done",
        title: "Loop Until Done",
        phases: [
            { id: "sweep", title: "Sweep" },
            { id: "decide", title: "Decide" },
        ],
        nodes: [
            {
                id: "sweep",
                label: "sweep",
                phaseId: "sweep",
                kind: "process",
                detail: "one pass per round",
            },
            {
                id: "gate",
                label: "gate",
                phaseId: "decide",
                kind: "gate",
                detail: "new findings?",
            },
            { id: "done", label: "done", phaseId: "decide", kind: "terminal", detail: "artifact" },
        ],
        edges: [
            { from: "sweep", to: "gate" },
            { from: "gate", to: "done", label: "no -- done" },
            { from: "gate", to: "sweep", label: "yes -- spawn another" },
        ],
    },

    scenarios: [
        {
            name: "mid-loop: an earlier round finished, the next sweep is running",
            detail: {
                status: "running",
                phases: [
                    { id: "sweep", title: "Sweep", ordinal: 0, status: "active" },
                    { id: "decide", title: "Decide", ordinal: 1, status: "pending" },
                ],
                currentPhase: "sweep",
                agents: [
                    { label: "sweep", status: "succeeded" },
                    { label: "gate", status: "succeeded" },
                    { label: "sweep", status: "running" },
                ],
            },
            // Two runtime agents share the label `sweep`. `running` outranks
            // `succeeded`, so the node shows the live round rather than the
            // finished one -- which is what a loop should look like.
            expect: {
                runStatus: "running",
                currentPhase: "sweep",
                phaseStates: {
                    "sweep": "active",
                    "decide": "pending",
                },
                nodeStates: { sweep: "running", gate: "succeeded", done: "not-started" },
                unmapped: 0,
            },
        },
        {
            name: "gate says stop; loop exits cleanly",
            detail: {
                status: "succeeded",
                phases: [
                    { id: "sweep", title: "Sweep", ordinal: 0, status: "completed" },
                    { id: "decide", title: "Decide", ordinal: 1, status: "completed" },
                ],
                currentPhase: "decide",
                agents: [
                    { label: "sweep", status: "succeeded" },
                    { label: "gate", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "succeeded",
                currentPhase: "decide",
                phaseStates: {
                    "sweep": "completed",
                    "decide": "completed",
                },
                nodeStates: { sweep: "succeeded", gate: "succeeded", done: "not-started" },
                unmapped: 0,
            },
        },
        {
            name: "loop runs out of budget mid-sweep",
            detail: {
                status: "halted",
                phases: [
                    { id: "sweep", title: "Sweep", ordinal: 0, status: "active" },
                    { id: "decide", title: "Decide", ordinal: 1, status: "skipped" },
                ],
                currentPhase: "sweep",
                agents: [
                    { label: "sweep", status: "succeeded" },
                    { label: "gate", status: "succeeded" },
                    { label: "sweep", status: "running" },
                ],
            },
            expect: {
                runStatus: "halted",
                currentPhase: "sweep",
                phaseStates: {
                    "sweep": "active",
                    "decide": "skipped",
                },
                nodeStates: { sweep: "halted", gate: "succeeded", done: "not-started" },
                unmapped: 0,
            },
        },
    ],
};
