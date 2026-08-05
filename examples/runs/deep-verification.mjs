// Deep verification -- article run scenario 1 of 4.
//
//   extract --> check:0 --+
//               check:1 --+--> audit (conditional) --> report
//               check:2 --+
//
// What this fixture exists to exercise is the *conditional* stage. The source
// auditor only runs when a checker comes back uncertain, so in the common case
// it stays `not-started` while the run still succeeds. A greyed node in a
// green run is correct here, and the scenarios below pin that down.

export default {
    id: "deep-verification",
    title: "Deep verification",
    source: {
        section: "Deep verification",
        url: "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code",
    },

    // Args the L3 harness drives `run` with. Kept beside the run body so the
    // two stay in step when either changes.
    harnessArgs: { document: "the draft blog post" },

    meta: {
        name: "deep-verification",
        description:
            "Extract the claims in a document and verify each one, auditing sources only where needed. args: { document: string }",
        phases: [{ title: "Extract" }, { title: "Check" }, { title: "Report" }],
        limits: { maxConcurrentSubagents: 3, maxTotalSubagents: 6, maxAiCredits: 500 },
    },

    run: async ({ args, parallel, agent, phase, log }) => {
        const document = typeof args?.document === "string" ? args.document.trim() : "";
        if (!document) throw new Error("deep-verification: args.document must be a non-empty string");

        const CLAIMS = {
            type: "object",
            properties: { claims: { type: "array", items: { type: "string" } } },
            required: ["claims"],
        };
        const CHECK = {
            type: "object",
            properties: {
                verdict: { type: "string", enum: ["supported", "contradicted", "uncertain"] },
            },
            required: ["verdict"],
        };
        const AUDIT = {
            type: "object",
            properties: { resolved: { type: "array", items: { type: "string" } } },
            required: ["resolved"],
        };
        const REPORT = {
            type: "object",
            properties: { report: { type: "string" } },
            required: ["report"],
        };

        phase("Extract");
        const extracted = await agent(
            `List the checkable factual claims in this document: ${document}. Return JSON {claims:[string]}.`,
            { label: "extract", schema: CLAIMS }
        );
        if (extracted === null) {
            log("extract produced nothing; there is nothing to verify");
            return { report: null, uncertain: 0 };
        }

        const claims = (extracted.claims ?? []).slice(0, 3);
        if (!claims.length) return { report: null, uncertain: 0 };

        phase("Check");
        const checks = await parallel(
            claims.map(
                (claim, i) => () =>
                    agent(
                        `Verify this claim against the document and say supported, contradicted, or uncertain: ${claim}. Return JSON {verdict}.`,
                        { label: `check:${i}`, schema: CHECK }
                    )
            )
        );

        const verdicts = checks.map((c, i) => (c === null ? null : { claim: claims[i], ...c }));
        const uncertain = verdicts.filter((v) => v !== null && v.verdict === "uncertain");

        // The conditional stage. No uncertainty, no auditor -- and the `audit`
        // node stays grey in an otherwise fully green run.
        let resolved = [];
        if (uncertain.length) {
            const audited = await agent(
                `Find sources that settle these uncertain claims: ${uncertain.map((u) => u.claim).join("; ")}. Return JSON {resolved:[string]}.`,
                { label: "audit", schema: AUDIT }
            );
            if (audited === null) log("audit produced nothing; uncertainties stay unresolved");
            else resolved = audited.resolved ?? [];
        }

        phase("Report");
        const written = await agent(
            `Write a verification report over these verdicts: ${JSON.stringify(verdicts.filter((v) => v !== null))}. Return JSON {report}.`,
            { label: "report", schema: REPORT }
        );

        return {
            report: written === null ? null : written.report,
            uncertain: uncertain.length,
            resolved,
        };
    },

    manifest: {
        factoryName: "deep-verification",
        title: "Deep verification",
        phases: [
            { id: "extract", title: "Extract" },
            { id: "check", title: "Check" },
            { id: "report", title: "Report" },
        ],
        nodes: [
            {
                id: "extract",
                label: "extract",
                phaseId: "extract",
                kind: "process",
                detail: "pulls checkable claims",
            },
            { id: "check-0", label: "check:0", phaseId: "check", kind: "process" },
            { id: "check-1", label: "check:1", phaseId: "check", kind: "process" },
            { id: "check-2", label: "check:2", phaseId: "check", kind: "process" },
            {
                id: "audit",
                label: "audit",
                phaseId: "check",
                kind: "gate",
                detail: "only if a claim is uncertain",
            },
            { id: "report", label: "report", phaseId: "report", kind: "process" },
        ],
        edges: [
            { from: "extract", to: "check-0" },
            { from: "extract", to: "check-1" },
            { from: "extract", to: "check-2" },
            { from: "check-0", to: "audit", label: "uncertain" },
            { from: "check-1", to: "audit", label: "uncertain" },
            { from: "check-2", to: "audit", label: "uncertain" },
            { from: "audit", to: "report" },
            { from: "check-0", to: "report", label: "settled" },
        ],
    },

    scenarios: [
        {
            name: "checkers fanned out, auditor not yet needed",
            detail: {
                status: "running",
                phase: "Check",
                agents: [
                    { label: "extract", status: "succeeded" },
                    { label: "check:0", status: "succeeded" },
                    { label: "check:1", status: "running" },
                    { label: "check:2", status: "queued" },
                ],
            },
            expect: {
                runStatus: "running",
                nodeStates: {
                    extract: "succeeded",
                    "check-0": "succeeded",
                    "check-1": "running",
                    "check-2": "queued",
                    audit: "not-started",
                    report: "not-started",
                },
                unmapped: 0,
            },
        },
        {
            name: "everything settled, so the conditional auditor never runs",
            detail: {
                status: "succeeded",
                phase: "Report",
                agents: [
                    { label: "extract", status: "succeeded" },
                    { label: "check:0", status: "succeeded" },
                    { label: "check:1", status: "succeeded" },
                    { label: "check:2", status: "succeeded" },
                    { label: "report", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "succeeded",
                nodeStates: {
                    extract: "succeeded",
                    "check-0": "succeeded",
                    "check-1": "succeeded",
                    "check-2": "succeeded",
                    audit: "not-started",
                    report: "succeeded",
                },
                unmapped: 0,
            },
        },
        {
            name: "an uncertain claim pulls the auditor in",
            detail: {
                status: "succeeded",
                phase: "Report",
                agents: [
                    { label: "extract", status: "succeeded" },
                    { label: "check:0", status: "succeeded" },
                    { label: "check:1", status: "succeeded" },
                    { label: "check:2", status: "succeeded" },
                    { label: "audit", status: "succeeded" },
                    { label: "report", status: "succeeded" },
                ],
            },
            expect: {
                runStatus: "succeeded",
                nodeStates: {
                    extract: "succeeded",
                    "check-0": "succeeded",
                    "check-1": "succeeded",
                    "check-2": "succeeded",
                    audit: "succeeded",
                    report: "succeeded",
                },
                unmapped: 0,
            },
        },
    ],
};
