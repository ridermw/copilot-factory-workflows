// Classify-And-Act -- article pattern 1 of 6.
//
// One classifier decides which of several mutually exclusive branches runs.
// Exactly one downstream agent does work; the rest never start.
//
//                     +--> act:bug
//   classify (?) -----+--> act:feature      only one branch is taken
//                     +--> act:question
//
// The unselected branches are the reason this pattern reads so clearly on the
// canvas: they stay `not-started` for the whole run and render greyed out, so
// the picture shows both the decision and the road not travelled.

export default {
    id: "classify-and-act",
    title: "Classify-And-Act",
    source: {
        section: "Six workflow patterns",
        url: "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code",
    },

    // Args the L3 harness drives `run` with. Kept beside the run body so the
    // two stay in step when either changes.
    harnessArgs: { item: "the login page 500s on submit" },

    meta: {
        name: "classify-and-act",
        description:
            "Classify an incoming item, then run only the branch that fits. args: { item: string }",
        phases: [{ title: "Classify" }, { title: "Act" }],
        limits: { maxConcurrentSubagents: 2, maxTotalSubagents: 4, maxAiCredits: 200 },
    },

    run: async ({ args, agent, phase, log }) => {
        const item = typeof args?.item === "string" ? args.item.trim() : "";
        if (!item) throw new Error("classify-and-act: args.item must be a non-empty string");

        const CATEGORY = {
            type: "object",
            properties: { category: { type: "string", enum: ["bug", "feature", "question"] } },
            required: ["category"],
        };
        const ANSWER = {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
        };

        phase("Classify");
        const verdict = await agent(
            `Classify this item as exactly one of bug, feature, or question: ${item}. Return JSON {category}.`,
            { label: "classify", schema: CATEGORY }
        );
        if (verdict === null) {
            log("classify produced nothing; nothing to act on");
            return { category: null, answer: null };
        }

        phase("Act");
        const category = verdict.category;
        const acted = await agent(`Handle this ${category}: ${item}. Return JSON {answer}.`, {
            label: `act:${category}`,
            schema: ANSWER,
        });

        return { category, answer: acted === null ? null : acted.answer };
    },

    manifest: {
        factoryName: "classify-and-act",
        title: "Classify-And-Act",
        phases: [
            { id: "classify", title: "Classify" },
            { id: "act", title: "Act" },
        ],
        nodes: [
            {
                id: "classify",
                label: "classify",
                phaseId: "classify",
                kind: "decision",
                detail: "bug, feature or question",
            },
            { id: "act-bug", label: "act:bug", phaseId: "act", kind: "process" },
            { id: "act-feature", label: "act:feature", phaseId: "act", kind: "process" },
            { id: "act-question", label: "act:question", phaseId: "act", kind: "process" },
        ],
        edges: [
            { from: "classify", to: "act-bug", label: "bug" },
            { from: "classify", to: "act-feature", label: "feature" },
            { from: "classify", to: "act-question", label: "question" },
        ],
    },

    scenarios: [
        {
            name: "one branch taken, the rest stay grey",
            detail: {
                status: "succeeded",
                phase: "Act",
                agents: [
                    { label: "classify", status: "succeeded" },
                    { label: "act:feature", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "succeeded",
                nodeStates: {
                    classify: "succeeded",
                    "act-bug": "not-started",
                    "act-feature": "succeeded",
                    "act-question": "not-started",
                },
                unmapped: 0,
            },
        },
        {
            name: "classifier fails before any branch is chosen",
            detail: {
                status: "failed",
                phase: "Classify",
                agents: [{ label: "classify", status: "error" }],
            },
            expect: {
                runStatus: "failed",
                nodeStates: {
                    classify: "failed",
                    "act-bug": "not-started",
                    "act-feature": "not-started",
                    "act-question": "not-started",
                },
                unmapped: 0,
            },
        },
    ],
};
