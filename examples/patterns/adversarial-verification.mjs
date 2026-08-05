// Adversarial Verification -- article pattern 3 of 6.
//
//              claim
//   produce  ========>  verify:0 / verify:1 / verify:2
//            <========
//            refutation
//
// The distinguishing feature is the return arrow. Verifiers do not merely
// grade the worker's output, they send refutations back, so the graph has
// edges running right-to-left. Those are the edges the canvas bows out to the
// right rather than drawing straight through the intervening nodes.

export default {
    id: "adversarial-verification",
    title: "Adversarial Verification",
    source: {
        section: "Six workflow patterns",
        url: "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code",
    },

    // Args the L3 harness drives `run` with. Kept beside the run body so the
    // two stay in step when either changes.
    harnessArgs: { question: "is the retry loop bounded?" },

    meta: {
        name: "adversarial-verification",
        description:
            "Produce a claim, then try hard to refute it from three angles. args: { question: string }",
        phases: [{ title: "Produce" }, { title: "Verify" }],
        limits: { maxConcurrentSubagents: 3, maxTotalSubagents: 5, maxAiCredits: 400 },
    },

    run: async ({ args, parallel, agent, phase, log }) => {
        const question = typeof args?.question === "string" ? args.question.trim() : "";
        if (!question) {
            throw new Error("adversarial-verification: args.question must be a non-empty string");
        }

        const CLAIM = {
            type: "object",
            properties: { claim: { type: "string" } },
            required: ["claim"],
        };
        const REFUTATION = {
            type: "object",
            properties: { refuted: { type: "boolean" }, reason: { type: "string" } },
            required: ["refuted"],
        };
        const ANGLES = ["evidence", "logic", "counterexample"];

        phase("Produce");
        const produced = await agent(`Answer this with one claim: ${question}. Return JSON {claim}.`, {
            label: "produce",
            schema: CLAIM,
        });
        if (produced === null) {
            log("produce returned nothing; there is no claim to attack");
            return { claim: null, survived: false, refutations: [] };
        }

        phase("Verify");
        const attacks = await parallel(
            ANGLES.map(
                (angle, i) => () =>
                    agent(
                        `Refute this claim on ${angle} grounds; default to refuted if unsure: ${produced.claim}. Return JSON {refuted, reason}.`,
                        { label: `verify:${i}`, schema: REFUTATION }
                    )
            )
        );

        const verdicts = attacks.filter((v) => v !== null);
        const refutations = verdicts.filter((v) => v.refuted).map((v) => v.reason ?? "");

        return { claim: produced.claim, survived: refutations.length === 0, refutations };
    },

    manifest: {
        factoryName: "adversarial-verification",
        title: "Adversarial Verification",
        phases: [
            { id: "produce", title: "Produce" },
            { id: "verify", title: "Verify" },
        ],
        nodes: [
            {
                id: "produce",
                label: "produce",
                phaseId: "produce",
                kind: "process",
                detail: "makes one falsifiable claim",
            },
            { id: "verify-0", label: "verify:0", phaseId: "verify", kind: "process", detail: "evidence" },
            { id: "verify-1", label: "verify:1", phaseId: "verify", kind: "process", detail: "logic" },
            {
                id: "verify-2",
                label: "verify:2",
                phaseId: "verify",
                kind: "process",
                detail: "counterexample",
            },
        ],
        edges: [
            { from: "produce", to: "verify-0", label: "claim" },
            { from: "produce", to: "verify-1", label: "claim" },
            { from: "produce", to: "verify-2", label: "claim" },
            { from: "verify-0", to: "produce", label: "refutation" },
            { from: "verify-1", to: "produce", label: "refutation" },
            { from: "verify-2", to: "produce", label: "refutation" },
        ],
    },

    scenarios: [
        {
            name: "all three verifiers attacking at once",
            detail: {
                status: "running",
                phase: "Verify",
                agents: [
                    { label: "produce", status: "succeeded" },
                    { label: "verify:0", status: "running" },
                    { label: "verify:1", status: "running" },
                    { label: "verify:2", status: "running" },
                ],
            },
            expect: {
                runStatus: "running",
                nodeStates: {
                    produce: "succeeded",
                    "verify-0": "running",
                    "verify-1": "running",
                    "verify-2": "running",
                },
                unmapped: 0,
            },
        },
        {
            name: "claim survives two angles and is refuted by the third",
            detail: {
                status: "succeeded",
                phase: "Verify",
                agents: [
                    { label: "produce", status: "succeeded" },
                    { label: "verify:0", status: "succeeded" },
                    { label: "verify:1", status: "succeeded" },
                    { label: "verify:2", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "succeeded",
                nodeStates: {
                    produce: "succeeded",
                    "verify-0": "succeeded",
                    "verify-1": "succeeded",
                    "verify-2": "succeeded",
                },
                unmapped: 0,
            },
        },
    ],
};
