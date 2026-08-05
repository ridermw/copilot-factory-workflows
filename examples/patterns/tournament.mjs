// Tournament -- article pattern 5 of 6.
//
//   attempt:0 --+
//               +--> judge:semi-a --+
//   attempt:1 --+                   |
//                                   +--> judge:final --> winner
//   attempt:2 --+                   |
//               +--> judge:semi-b --+
//   attempt:3 --+
//
// A tournament is a fan-out whose reduction is itself a tree rather than one
// barrier. It is the pattern that most benefits from phases-as-columns, since
// every round is literally a column.

export default {
    id: "tournament",
    title: "Tournament",
    source: {
        section: "Six workflow patterns",
        url: "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code",
    },

    // Args the L3 harness drives `run` with. Kept beside the run body so the
    // two stay in step when either changes.
    harnessArgs: { task: "write a one-line summary of the changelog" },

    meta: {
        name: "tournament",
        description:
            "Draft four independent attempts and pick a winner by pairwise judging. args: { task: string }",
        phases: [{ title: "Attempt" }, { title: "Semifinal" }, { title: "Final" }],
        limits: { maxConcurrentSubagents: 4, maxTotalSubagents: 8, maxAiCredits: 700 },
    },

    run: async ({ args, parallel, agent, phase, log }) => {
        const task = typeof args?.task === "string" ? args.task.trim() : "";
        if (!task) throw new Error("tournament: args.task must be a non-empty string");

        const DRAFT = {
            type: "object",
            properties: { draft: { type: "string" } },
            required: ["draft"],
        };
        const PICK = {
            type: "object",
            properties: { winner: { type: "string" } },
            required: ["winner"],
        };

        phase("Attempt");
        const drafts = await parallel(
            [0, 1, 2, 3].map(
                (i) => () =>
                    agent(`Attempt this task independently: ${task}. Return JSON {draft}.`, {
                        label: `attempt:${i}`,
                        schema: DRAFT,
                    })
            )
        );

        const entrants = drafts.map((d, i) => (d === null ? null : { seat: i, draft: d.draft }));
        const alive = entrants.filter((v) => v !== null);
        if (alive.length < 2) {
            log(`only ${alive.length} attempt(s) survived; skipping the bracket`);
            return { winner: alive.length ? alive[0].draft : null };
        }

        phase("Semifinal");
        const brackets = [
            { key: "semi-a", pair: [entrants[0], entrants[1]] },
            { key: "semi-b", pair: [entrants[2], entrants[3]] },
        ];
        const semis = await parallel(
            brackets.map(
                (b) => () => {
                    const contenders = b.pair.filter((v) => v !== null);
                    if (contenders.length < 2) return Promise.resolve(contenders[0] ?? null);
                    return agent(
                        `Pick the better attempt for "${task}". A: ${contenders[0].draft} B: ${contenders[1].draft}. Return JSON {winner} as "A" or "B".`,
                        { label: `judge:${b.key}`, schema: PICK }
                    ).then((p) => (p === null ? null : contenders[p.winner === "B" ? 1 : 0]));
                }
            )
        );

        const finalists = semis.filter((v) => v !== null);
        if (finalists.length < 2) {
            return { winner: finalists.length ? finalists[0].draft : null };
        }

        phase("Final");
        const decided = await agent(
            `Pick the better attempt for "${task}". A: ${finalists[0].draft} B: ${finalists[1].draft}. Return JSON {winner} as "A" or "B".`,
            { label: "judge:final", schema: PICK }
        );

        const champion = decided === null ? finalists[0] : finalists[decided.winner === "B" ? 1 : 0];
        return { winner: champion.draft };
    },

    manifest: {
        factoryName: "tournament",
        title: "Tournament",
        phases: [
            { id: "attempt", title: "Attempt" },
            { id: "semi", title: "Semifinal" },
            { id: "final", title: "Final" },
        ],
        nodes: [
            { id: "attempt-0", label: "attempt:0", phaseId: "attempt", kind: "process" },
            { id: "attempt-1", label: "attempt:1", phaseId: "attempt", kind: "process" },
            { id: "attempt-2", label: "attempt:2", phaseId: "attempt", kind: "process" },
            { id: "attempt-3", label: "attempt:3", phaseId: "attempt", kind: "process" },
            {
                id: "judge-semi-a",
                label: "judge:semi-a",
                phaseId: "semi",
                kind: "decision",
                detail: "seats 0 vs 1",
            },
            {
                id: "judge-semi-b",
                label: "judge:semi-b",
                phaseId: "semi",
                kind: "decision",
                detail: "seats 2 vs 3",
            },
            { id: "judge-final", label: "judge:final", phaseId: "final", kind: "decision" },
            { id: "winner", label: "winner", phaseId: "final", kind: "terminal", detail: "artifact" },
        ],
        edges: [
            { from: "attempt-0", to: "judge-semi-a" },
            { from: "attempt-1", to: "judge-semi-a" },
            { from: "attempt-2", to: "judge-semi-b" },
            { from: "attempt-3", to: "judge-semi-b" },
            { from: "judge-semi-a", to: "judge-final", label: "advances" },
            { from: "judge-semi-b", to: "judge-final", label: "advances" },
            { from: "judge-final", to: "winner", label: "wins" },
        ],
    },

    scenarios: [
        {
            name: "semifinals in flight, final not reached",
            detail: {
                status: "running",
                phases: [
                    { id: "attempt", title: "Attempt", ordinal: 0, status: "completed" },
                    { id: "semi", title: "Semifinal", ordinal: 1, status: "active" },
                    { id: "final", title: "Final", ordinal: 2, status: "pending" },
                ],
                currentPhase: "semi",
                agents: [
                    { label: "attempt:0", status: "succeeded" },
                    { label: "attempt:1", status: "succeeded" },
                    { label: "attempt:2", status: "succeeded" },
                    { label: "attempt:3", status: "succeeded" },
                    { label: "judge:semi-a", status: "running" },
                    { label: "judge:semi-b", status: "running" },
                ],
            },
            expect: {
                runStatus: "running",
                currentPhase: "semi",
                phaseStates: {
                    "attempt": "completed",
                    "semi": "active",
                    "final": "pending",
                },
                nodeStates: {
                    "attempt-0": "succeeded",
                    "attempt-1": "succeeded",
                    "attempt-2": "succeeded",
                    "attempt-3": "succeeded",
                    "judge-semi-a": "running",
                    "judge-semi-b": "running",
                    "judge-final": "not-started",
                    winner: "not-started",
                },
                unmapped: 0,
            },
        },
        {
            name: "one entrant never drafts; its bracket still resolves",
            detail: {
                status: "succeeded",
                phases: [
                    { id: "attempt", title: "Attempt", ordinal: 0, status: "completed" },
                    { id: "semi", title: "Semifinal", ordinal: 1, status: "completed" },
                    { id: "final", title: "Final", ordinal: 2, status: "completed" },
                ],
                currentPhase: "final",
                agents: [
                    { label: "attempt:0", status: "succeeded" },
                    { label: "attempt:1", status: "succeeded" },
                    { label: "attempt:2", status: "error" },
                    { label: "attempt:3", status: "succeeded" },
                    { label: "judge:semi-a", status: "succeeded" },
                    { label: "judge:final", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "succeeded",
                currentPhase: "final",
                phaseStates: {
                    "attempt": "completed",
                    "semi": "completed",
                    "final": "completed",
                },
                nodeStates: {
                    "attempt-0": "succeeded",
                    "attempt-1": "succeeded",
                    "attempt-2": "failed",
                    "attempt-3": "succeeded",
                    "judge-semi-a": "succeeded",
                    "judge-semi-b": "not-started",
                    "judge-final": "succeeded",
                    winner: "not-started",
                },
                unmapped: 0,
            },
        },
    ],
};
