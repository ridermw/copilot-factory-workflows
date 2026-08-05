// Fanout-And-Synthesize -- article pattern 2 of 6.
//
//   scan:docs  --+
//   scan:tests --+
//   scan:src   --+--> [synthesize]      barrier: waits for every scan
//   scan:deps  --+
//
// The barrier is not a separate participant. The synthesizing agent *is* the
// barrier, because it cannot be called until every scan has resolved. Drawing
// it with kind "barrier" says that without inventing a node that never runs.

export default {
    id: "fanout-and-synthesize",
    title: "Fanout-And-Synthesize",
    source: {
        section: "Six workflow patterns",
        url: "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code",
    },

    // Args the L3 harness drives `run` with. Kept beside the run body so the
    // two stay in step when either changes.
    harnessArgs: { repo: "acme/widgets" },

    meta: {
        name: "fanout-and-synthesize",
        description:
            "Scan several areas in parallel, then synthesize one answer. args: { repo: string }",
        phases: [{ title: "Scan" }, { title: "Synthesize" }],
        limits: { maxConcurrentSubagents: 4, maxTotalSubagents: 6, maxAiCredits: 400 },
    },

    run: async ({ args, parallel, agent, phase, log }) => {
        const repo = typeof args?.repo === "string" ? args.repo.trim() : "";
        if (!repo) throw new Error("fanout-and-synthesize: args.repo must be a non-empty string");

        const NOTES = {
            type: "object",
            properties: { notes: { type: "array", items: { type: "string" } } },
            required: ["notes"],
        };
        const SUMMARY = {
            type: "object",
            properties: { summary: { type: "string" } },
            required: ["summary"],
        };
        const AREAS = ["docs", "tests", "src", "deps"];

        phase("Scan");
        const scans = await parallel(
            AREAS.map(
                (area) => () =>
                    agent(`Summarize the ${area} of ${repo}. Return JSON {notes:[string]}.`, {
                        label: `scan:${area}`,
                        schema: NOTES,
                    })
            )
        );

        const kept = scans.filter((v) => v !== null);
        if (kept.length < AREAS.length) {
            log(`only ${kept.length} of ${AREAS.length} scans produced notes`);
        }
        if (!kept.length) return { summary: null };

        phase("Synthesize");
        const notes = kept.flatMap((s) => s.notes ?? []);
        const synthesis = await agent(
            `Synthesize one summary of ${repo} from these notes: ${notes.join("; ")}. Return JSON {summary}.`,
            { label: "synthesize", schema: SUMMARY }
        );

        return { summary: synthesis === null ? null : synthesis.summary };
    },

    manifest: {
        factoryName: "fanout-and-synthesize",
        title: "Fanout-And-Synthesize",
        phases: [
            { id: "scan", title: "Scan" },
            { id: "synth", title: "Synthesize" },
        ],
        nodes: [
            { id: "scan-docs", label: "scan:docs", phaseId: "scan", kind: "process" },
            { id: "scan-tests", label: "scan:tests", phaseId: "scan", kind: "process" },
            { id: "scan-src", label: "scan:src", phaseId: "scan", kind: "process" },
            { id: "scan-deps", label: "scan:deps", phaseId: "scan", kind: "process" },
            {
                id: "synthesize",
                label: "synthesize",
                phaseId: "synth",
                kind: "barrier",
                detail: "waits for all four scans",
            },
        ],
        edges: [
            { from: "scan-docs", to: "synthesize" },
            { from: "scan-tests", to: "synthesize" },
            { from: "scan-src", to: "synthesize" },
            { from: "scan-deps", to: "synthesize" },
        ],
    },

    scenarios: [
        {
            name: "fan-out in flight, barrier still waiting",
            detail: {
                status: "running",
                phase: "Scan",
                agents: [
                    { label: "scan:docs", status: "succeeded" },
                    { label: "scan:tests", status: "succeeded" },
                    { label: "scan:src", status: "running" },
                    { label: "scan:deps", status: "queued" },
                ],
            },
            expect: {
                runStatus: "running",
                nodeStates: {
                    "scan-docs": "succeeded",
                    "scan-tests": "succeeded",
                    "scan-src": "running",
                    "scan-deps": "queued",
                    synthesize: "not-started",
                },
                unmapped: 0,
            },
        },
        {
            name: "one scan fails, the barrier still runs on what survived",
            detail: {
                status: "succeeded",
                phase: "Synthesize",
                agents: [
                    { label: "scan:docs", status: "succeeded" },
                    { label: "scan:tests", status: "error" },
                    { label: "scan:src", status: "succeeded" },
                    { label: "scan:deps", status: "succeeded" },
                    { label: "synthesize", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "succeeded",
                nodeStates: {
                    "scan-docs": "succeeded",
                    "scan-tests": "failed",
                    "scan-src": "succeeded",
                    "scan-deps": "succeeded",
                    synthesize: "succeeded",
                },
                unmapped: 0,
            },
        },
    ],
};
