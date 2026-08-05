// Memory and rule adherence -- article run scenario 3 of 4.
//
//   rule:0 --+   (clean)
//   rule:1 --+   (flagged)
//   rule:2 --+---> skeptic ---> violations
//   rule:3 --+   (clean)
//   rule:4 --+   (flagged)
//
// One verifier per rule, each independently returning clean or flagged, and a
// skeptic that has to be convinced before anything is reported. The point of
// the pattern is that a flag is a *claim*, not a verdict -- the skeptic exists
// to throw out the ones that do not survive scrutiny.
//
// This is the fixture that puts several nodes in the same phase into different
// terminal states at once, which is what makes the per-node state colouring
// worth having: five identical-looking nodes, five independent outcomes.

export default {
    id: "memory-and-rules",
    title: "Memory and rule adherence",
    source: {
        section: "Memory and rule adherence",
        url: "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code",
    },

    // Args the L3 harness drives `run` with. Kept beside the run body so the
    // two stay in step when either changes.
    harnessArgs: { change: "adds a retry to the payment client" },

    meta: {
        name: "memory-and-rules",
        description:
            "Check a change against each project rule, then confirm the flags with a skeptic. args: { change: string }",
        phases: [{ title: "Verify" }, { title: "Confirm" }],
        limits: { maxConcurrentSubagents: 5, maxTotalSubagents: 7, maxAiCredits: 600 },
    },

    run: async ({ args, parallel, agent, phase, log }) => {
        const change = typeof args?.change === "string" ? args.change.trim() : "";
        if (!change) throw new Error("memory-and-rules: args.change must be a non-empty string");

        const CHECK = {
            type: "object",
            properties: { flagged: { type: "boolean" }, evidence: { type: "string" } },
            required: ["flagged"],
        };
        const CONFIRM = {
            type: "object",
            properties: { confirmed: { type: "array", items: { type: "string" } } },
            required: ["confirmed"],
        };
        const RULES = [
            "no secrets in source",
            "no silent catch blocks",
            "public API changes are documented",
            "tests accompany behaviour changes",
            "no unbounded loops without a ceiling",
        ];

        phase("Verify");
        const checks = await parallel(
            RULES.map(
                (rule, i) => () =>
                    agent(
                        `Does this change violate the rule "${rule}"? Cite evidence or say it is clean: ${change}. Return JSON {flagged, evidence}.`,
                        { label: `rule:${i}`, schema: CHECK }
                    )
            )
        );

        const results = checks.map((c, i) => (c === null ? null : { rule: RULES[i], ...c }));
        const answered = results.filter((v) => v !== null);
        if (answered.length < RULES.length) {
            log(`${RULES.length - answered.length} rule check(s) produced nothing`);
        }

        const flags = answered.filter((r) => r.flagged);
        if (!flags.length) return { confirmed: [], flagged: 0 };

        // Every flag is a claim until the skeptic agrees. Flags that do not
        // survive are dropped rather than reported.
        phase("Confirm");
        const confirmed = await agent(
            `Discard any of these rule violations that the evidence does not actually support: ${JSON.stringify(flags)}. Return JSON {confirmed:[string]}.`,
            { label: "skeptic", schema: CONFIRM }
        );

        return {
            confirmed: confirmed === null ? [] : confirmed.confirmed ?? [],
            flagged: flags.length,
        };
    },

    manifest: {
        factoryName: "memory-and-rules",
        title: "Memory and rule adherence",
        phases: [
            { id: "verify", title: "Verify" },
            { id: "confirm", title: "Confirm" },
        ],
        nodes: [
            { id: "rule-0", label: "rule:0", phaseId: "verify", kind: "process", detail: "no secrets" },
            {
                id: "rule-1",
                label: "rule:1",
                phaseId: "verify",
                kind: "process",
                detail: "no silent catches",
            },
            {
                id: "rule-2",
                label: "rule:2",
                phaseId: "verify",
                kind: "process",
                detail: "API documented",
            },
            {
                id: "rule-3",
                label: "rule:3",
                phaseId: "verify",
                kind: "process",
                detail: "tests accompany changes",
            },
            {
                id: "rule-4",
                label: "rule:4",
                phaseId: "verify",
                kind: "process",
                detail: "loops have ceilings",
            },
            {
                id: "skeptic",
                label: "skeptic",
                phaseId: "confirm",
                kind: "gate",
                detail: "drops unsupported flags",
            },
            {
                id: "violations",
                label: "violations",
                phaseId: "confirm",
                kind: "terminal",
                detail: "artifact",
            },
        ],
        edges: [
            { from: "rule-0", to: "skeptic", label: "clean" },
            { from: "rule-1", to: "skeptic", label: "flagged" },
            { from: "rule-2", to: "skeptic", label: "clean" },
            { from: "rule-3", to: "skeptic", label: "clean" },
            { from: "rule-4", to: "skeptic", label: "flagged" },
            { from: "skeptic", to: "violations", label: "confirmed" },
        ],
    },

    scenarios: [
        {
            name: "five verifiers, five different outcomes at once",
            detail: {
                status: "running",
                phase: "Verify",
                agents: [
                    { label: "rule:0", status: "succeeded" },
                    { label: "rule:1", status: "running" },
                    { label: "rule:2", status: "queued" },
                    { label: "rule:3", status: "error" },
                    { label: "rule:4", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "running",
                nodeStates: {
                    "rule-0": "succeeded",
                    "rule-1": "running",
                    "rule-2": "queued",
                    "rule-3": "failed",
                    "rule-4": "succeeded",
                    skeptic: "not-started",
                    violations: "not-started",
                },
                unmapped: 0,
            },
        },
        {
            name: "nothing flagged, so the skeptic is never consulted",
            detail: {
                status: "succeeded",
                phase: "Verify",
                agents: [
                    { label: "rule:0", status: "succeeded" },
                    { label: "rule:1", status: "succeeded" },
                    { label: "rule:2", status: "succeeded" },
                    { label: "rule:3", status: "succeeded" },
                    { label: "rule:4", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "succeeded",
                nodeStates: {
                    "rule-0": "succeeded",
                    "rule-1": "succeeded",
                    "rule-2": "succeeded",
                    "rule-3": "succeeded",
                    "rule-4": "succeeded",
                    skeptic: "not-started",
                    violations: "not-started",
                },
                unmapped: 0,
            },
        },
        {
            name: "a sixth rule appears at runtime and is surfaced, not dropped",
            detail: {
                status: "running",
                phase: "Verify",
                agents: [
                    { label: "rule:0", status: "succeeded" },
                    { label: "rule:1", status: "succeeded" },
                    { label: "rule:2", status: "succeeded" },
                    { label: "rule:3", status: "succeeded" },
                    { label: "rule:4", status: "succeeded" },
                    { label: "rule:5", status: "running" },
                ],
            },
            // An undeclared agent becomes an explicit `unmapped` node. The
            // canvas would rather show a node the plan did not predict than
            // quietly hide live work.
            expect: {
                runStatus: "running",
                nodeStates: {
                    "rule-0": "succeeded",
                    "rule-1": "succeeded",
                    "rule-2": "succeeded",
                    "rule-3": "succeeded",
                    "rule-4": "succeeded",
                },
                unmapped: 1,
            },
        },
    ],
};
