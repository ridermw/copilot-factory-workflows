// Generate-And-Filter -- article pattern 4 of 6.
//
//   gen:0 --+
//   gen:1 --+--> [filter] --+--> best        (kept)
//   gen:2 --+               +--> discarded   (dropped)
//
// `best` and `discarded` are artifacts, not agents. Nothing runs them, so they
// stay `not-started` for the entire run and render greyed. That is deliberate:
// the article draws the outputs, and a terminal node is how the canvas says
// "this is where the work lands", not "this step never happened".

export default {
    id: "generate-and-filter",
    title: "Generate-And-Filter",
    source: {
        section: "Six workflow patterns",
        url: "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code",
    },

    // Args the L3 harness drives `run` with. Kept beside the run body so the
    // two stay in step when either changes.
    harnessArgs: { brief: "name a CLI tool for log triage" },

    meta: {
        name: "generate-and-filter",
        description:
            "Generate many candidates in parallel, then keep only those that clear a rubric. args: { brief: string }",
        phases: [{ title: "Generate" }, { title: "Filter" }],
        limits: { maxConcurrentSubagents: 3, maxTotalSubagents: 5, maxAiCredits: 400 },
    },

    run: async ({ args, parallel, agent, phase, log }) => {
        const brief = typeof args?.brief === "string" ? args.brief.trim() : "";
        if (!brief) throw new Error("generate-and-filter: args.brief must be a non-empty string");

        const IDEAS = {
            type: "object",
            properties: { ideas: { type: "array", items: { type: "string" } } },
            required: ["ideas"],
        };
        const KEPT = {
            type: "object",
            properties: { kept: { type: "array", items: { type: "string" } } },
            required: ["kept"],
        };

        phase("Generate");
        const batches = await parallel(
            [0, 1, 2].map(
                (i) => () =>
                    agent(`Propose two distinct ideas for: ${brief}. Return JSON {ideas:[string]}.`, {
                        label: `gen:${i}`,
                        schema: IDEAS,
                    })
            )
        );

        const ideas = batches.filter((v) => v !== null).flatMap((b) => b.ideas ?? []);
        if (!ideas.length) {
            log("no generator produced an idea; nothing to filter");
            return { best: [], discarded: [] };
        }

        phase("Filter");
        const filtered = await agent(
            `Deduplicate these ideas and keep only those that clear the brief "${brief}": ${ideas.join("; ")}. Return JSON {kept:[string]}.`,
            { label: "filter", schema: KEPT }
        );
        if (filtered === null) {
            log("filter produced nothing; treating every idea as discarded");
            return { best: [], discarded: ideas };
        }

        const best = filtered.kept ?? [];
        return { best, discarded: ideas.filter((i) => !best.includes(i)) };
    },

    manifest: {
        factoryName: "generate-and-filter",
        title: "Generate-And-Filter",
        phases: [
            { id: "generate", title: "Generate" },
            { id: "filter", title: "Filter" },
        ],
        nodes: [
            { id: "gen-0", label: "gen:0", phaseId: "generate", kind: "process" },
            { id: "gen-1", label: "gen:1", phaseId: "generate", kind: "process" },
            { id: "gen-2", label: "gen:2", phaseId: "generate", kind: "process" },
            {
                id: "filter",
                label: "filter",
                phaseId: "filter",
                kind: "gate",
                detail: "rubric + dedupe",
            },
            { id: "best", label: "best", phaseId: "filter", kind: "terminal", detail: "artifact" },
            {
                id: "discarded",
                label: "discarded",
                phaseId: "filter",
                kind: "terminal",
                detail: "artifact",
            },
        ],
        edges: [
            { from: "gen-0", to: "filter" },
            { from: "gen-1", to: "filter" },
            { from: "gen-2", to: "filter" },
            { from: "filter", to: "best", label: "clears rubric" },
            { from: "filter", to: "discarded", label: "dropped" },
        ],
    },

    scenarios: [
        {
            name: "filter running, artifacts still unwritten",
            detail: {
                status: "running",
                phases: [
                    { id: "generate", title: "Generate", ordinal: 0, status: "completed" },
                    { id: "filter", title: "Filter", ordinal: 1, status: "active" },
                ],
                currentPhase: "filter",
                agents: [
                    { label: "gen:0", status: "succeeded" },
                    { label: "gen:1", status: "succeeded" },
                    { label: "gen:2", status: "succeeded" },
                    { label: "filter", status: "running" },
                ],
            },
            expect: {
                runStatus: "running",
                currentPhase: "filter",
                phaseStates: {
                    "generate": "completed",
                    "filter": "active",
                },
                nodeStates: {
                    "gen-0": "succeeded",
                    "gen-1": "succeeded",
                    "gen-2": "succeeded",
                    filter: "running",
                    best: "not-started",
                    discarded: "not-started",
                },
                unmapped: 0,
            },
        },
        {
            name: "run completes; artifact nodes are still never-run by design",
            detail: {
                status: "succeeded",
                phases: [
                    { id: "generate", title: "Generate", ordinal: 0, status: "completed" },
                    { id: "filter", title: "Filter", ordinal: 1, status: "completed" },
                ],
                currentPhase: "filter",
                agents: [
                    { label: "gen:0", status: "succeeded" },
                    { label: "gen:1", status: "succeeded" },
                    { label: "gen:2", status: "succeeded" },
                    { label: "filter", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "succeeded",
                currentPhase: "filter",
                phaseStates: {
                    "generate": "completed",
                    "filter": "completed",
                },
                nodeStates: {
                    "gen-0": "succeeded",
                    "gen-1": "succeeded",
                    "gen-2": "succeeded",
                    filter: "succeeded",
                    best: "not-started",
                    discarded: "not-started",
                },
                unmapped: 0,
            },
        },
    ],
};
