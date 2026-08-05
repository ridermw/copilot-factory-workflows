// Corpus index for the article-derived examples.
//
// Source: https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code
//
// 24 unique items:
//
//   6 patterns      -- the "Helpful patterns" shape catalog       (all realized)
//   8 prompts       -- the "Example prompts" section              (mapped)
//  10 use cases     -- the "Use cases" section                    (4 realized, 6 mapped)
//   --
//  24
//
// The four run fixtures are realizations of four of the ten use cases, so they
// are not counted again. 6 + 8 + 10 = 24.
//
// Every entry carries EITHER `realizedBy` (fixture ids that build it) OR
// `outOfScope` (a written reason it is not built). Never both, never neither --
// `tests/examples.test.mjs` enforces that, so an item cannot be quietly
// forgotten by simply being left off a list.

/** Fixture ids that exist on disk, by tier. */
export const PATTERN_FIXTURES = [
    "classify-and-act",
    "fanout-and-synthesize",
    "adversarial-verification",
    "generate-and-filter",
    "tournament",
    "loop-until-done",
];

export const RUN_FIXTURES = [
    "deep-verification",
    "sorting",
    "memory-and-rules",
    "triage-at-scale",
];

/** Tier 1 -- the six patterns, each realized by a plan-time fixture. */
export const PATTERNS = [
    {
        id: "classify-and-act",
        title: "Classify-and-act",
        realizedBy: ["classify-and-act"],
    },
    {
        id: "fan-out-and-synthesize",
        title: "Fan-out-and-synthesize",
        realizedBy: ["fanout-and-synthesize"],
    },
    {
        id: "adversarial-verification",
        title: "Adversarial verification",
        realizedBy: ["adversarial-verification"],
    },
    {
        id: "generate-and-filter",
        title: "Generate-and-filter",
        realizedBy: ["generate-and-filter"],
    },
    { id: "tournament", title: "Tournament", realizedBy: ["tournament"] },
    { id: "loop-until-done", title: "Loop until done", realizedBy: ["loop-until-done"] },
];

/**
 * Tier 3a -- the eight example prompts, each mapped to the pattern(s) it
 * instantiates. None are realized as their own fixture: a prompt is an entry
 * point, not a distinct graph shape, and every shape they reach is already
 * covered by a pattern fixture.
 */
export const PROMPTS = [
    {
        id: "prompt-flaky-test",
        quote:
            "This test fails maybe 1 in 50 runs. Set up a workflow to reproduce it. Form competing theories about the race, and don't stop until one theory survives the evidence.",
        patterns: ["loop-until-done", "adversarial-verification"],
        outOfScope:
            "'Don't stop until one survives' is Loop Until Done with an adversarial stop condition; both shapes are realized as pattern fixtures.",
    },
    {
        id: "prompt-mine-sessions",
        quote:
            "Using a workflow, go through my last 50 sessions and mine them for corrections I keep making and turn the recurring ones into CLAUDE.md rules",
        patterns: ["fan-out-and-synthesize", "adversarial-verification"],
        outOfScope:
            "Cluster-then-verify is fan-out plus adversarial verification; adds no graph shape the pattern fixtures do not already cover.",
    },
    {
        id: "prompt-slack-incidents",
        quote:
            "Use a workflow to dig through #incidents in Slack for the past six months and find recurring root causes where nobody has filed a ticket.",
        patterns: ["fan-out-and-synthesize"],
        outOfScope:
            "A fan-out over a time-sliced corpus into one synthesis; identical shape to the fan-out fixture with a different data source.",
    },
    {
        id: "prompt-business-plan",
        quote:
            "Take my business plan and run a workflow where different agents tear it apart from an investor's, a customer's, and a competitor's perspective.",
        patterns: ["fan-out-and-synthesize"],
        outOfScope:
            "Three personas fanning out into one synthesis; the personas differ but the graph does not.",
    },
    {
        id: "prompt-resumes",
        quote:
            "Here's a folder of 80 resumes, use a workflow to rank them for the backend role and double-check the top ten. Interview me using the AskUserQuestion tool for a rubric.",
        patterns: ["tournament", "adversarial-verification"],
        outOfScope:
            "Rank-then-double-check is tournament plus adversarial verification. The interactive rubric interview is a host capability, not a graph shape, and the canvas has nothing to draw for it.",
    },
    {
        id: "prompt-cli-name",
        quote:
            "I need a name for this CLI tool. Use a workflow to brainstorm a bunch of options and run a tournament to pick the top 3.",
        patterns: ["generate-and-filter", "tournament"],
        outOfScope:
            "Brainstorm-then-tournament composes two realized pattern fixtures back to back.",
    },
    {
        id: "prompt-rename-model",
        quote: "Use a workflow to rename our User model to Account everywhere.",
        patterns: ["fan-out-and-synthesize", "adversarial-verification"],
        outOfScope:
            "The migration shape: one subagent per callsite, adversarial review, merge. Worktree isolation and merge order are runtime concerns the manifest does not model.",
    },
    {
        id: "prompt-verify-blog",
        quote:
            "Go through my blog post draft and verify every technical claim against the codebase using a workflow, I don't want to ship anything wrong.",
        patterns: ["fan-out-and-synthesize", "adversarial-verification"],
        realizedBy: ["deep-verification"],
    },
];

/**
 * Tier 3b -- the ten use cases. Four are realized as run fixtures because the
 * article illustrates them with a run-state diagram; the rest are mapped.
 */
export const USE_CASES = [
    {
        id: "migrations-and-refactors",
        title: "Migrations and refactors",
        patterns: ["fan-out-and-synthesize", "adversarial-verification"],
        outOfScope:
            "Fan-out over callsites with adversarial review. The distinctive part is per-agent worktrees and merge, which the manifest has no vocabulary for and the canvas does not draw.",
    },
    {
        id: "deep-research",
        title: "Deep research",
        patterns: ["fan-out-and-synthesize", "adversarial-verification"],
        outOfScope:
            "Structurally the same graph as deep verification with web fetch in front; realizing both would duplicate a shape rather than add one.",
    },
    {
        id: "deep-verification",
        title: "Deep verification",
        patterns: ["fan-out-and-synthesize", "adversarial-verification"],
        realizedBy: ["deep-verification"],
    },
    {
        id: "sorting",
        title: "Sorting",
        patterns: ["tournament"],
        realizedBy: ["sorting"],
    },
    {
        id: "memory-and-rule-adherence",
        title: "Memory and rule adherence",
        patterns: ["fan-out-and-synthesize", "adversarial-verification"],
        realizedBy: ["memory-and-rules"],
    },
    {
        id: "root-cause-investigation",
        title: "Root-cause investigation",
        patterns: ["fan-out-and-synthesize", "adversarial-verification"],
        outOfScope:
            "Hypotheses from disjoint evidence facing a panel of verifiers and refuters -- fan-out into adversarial verification, both already realized.",
    },
    {
        id: "triaging-at-scale",
        title: "Triaging at scale",
        patterns: ["classify-and-act"],
        realizedBy: ["triage-at-scale"],
    },
    {
        id: "exploration-and-taste",
        title: "Exploration and taste",
        patterns: ["generate-and-filter", "tournament"],
        outOfScope:
            "Explore-then-rubric is generate-and-filter, optionally ordered by tournament; both are realized as pattern fixtures.",
    },
    {
        id: "evals",
        title: "Evals",
        patterns: ["adversarial-verification", "tournament"],
        outOfScope:
            "Grade-against-a-rubric is adversarial verification with a comparison step; the worktree isolation it relies on is not modelled.",
    },
    {
        id: "model-and-intelligence-routing",
        title: "Model and intelligence routing",
        patterns: ["classify-and-act"],
        outOfScope:
            "A classifier routing to a model rather than to a branch. The graph is classify-and-act; the model choice is an agent option the manifest does not display.",
    },
];

/** All 24 unique corpus items, tagged by tier. */
export const CORPUS = [
    ...PATTERNS.map((p) => ({ ...p, tier: "pattern" })),
    ...PROMPTS.map((p) => ({ ...p, tier: "prompt" })),
    ...USE_CASES.map((u) => ({ ...u, tier: "use-case" })),
];

export const SOURCE_URL =
    "https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code";

export default { PATTERNS, PROMPTS, USE_CASES, CORPUS, PATTERN_FIXTURES, RUN_FIXTURES, SOURCE_URL };
