import { normalizeManifest } from "../extensions/workflow-factory-canvas/manifest.mjs";
import { projectRun } from "../extensions/workflow-factory-canvas/projection.mjs";
import { renderHtml, CLIENT_JS } from "../extensions/workflow-factory-canvas/renderer.mjs";
import { runClient } from "./dom-shim.mjs";

let failures = 0;
function check(name, cond, extra) {
    if (cond) {
        console.log(`  ok   ${name}`);
    } else {
        failures++;
        console.log(`  FAIL ${name}${extra ? ` -- ${JSON.stringify(extra)}` : ""}`);
    }
}

// ---------------------------------------------------------------- manifest
console.log("\n== manifest: happy path");
const good = normalizeManifest({
    factoryName: "demo-factory",
    title: "Demo workflow",
    phases: [
        { id: "research", title: "Research" },
        { id: "build", title: "Build" },
    ],
    nodes: [
        { id: "n1", label: "Scan repo", phaseId: "research" },
        { id: "n2", label: "Read docs", phaseId: "research" },
        { id: "n3", label: "Write code", phaseId: "build" },
    ],
    edges: [
        { from: "n1", to: "n3" },
        { from: "n2", to: "n3" },
    ],
});
check("no errors", good.errors.length === 0, good.errors);
check("2 phases", good.manifest.phases.length === 2);
check("3 nodes", good.manifest.nodes.length === 3);
check("2 edges", good.manifest.edges.length === 2);

console.log("\n== manifest: semantic problems are reported, not thrown");
const bad = normalizeManifest({
    factoryName: "bad",
    phases: [{ id: "p1", title: "One" }],
    nodes: [
        { id: "a", label: "Same", phaseId: "p1" },
        { id: "b", label: "Same", phaseId: "p1" },
        { id: "c", label: "Elsewhere", phaseId: "nope" },
    ],
    edges: [
        { from: "a", to: "ghost" },
        { from: "a", to: "a" },
    ],
});
check("duplicate label flagged", bad.errors.some((e) => /duplicate/i.test(e)), bad.errors);
check("unknown phase flagged", bad.errors.some((e) => /phase/i.test(e)), bad.errors);
check("dangling edge flagged", bad.errors.some((e) => /ghost|unknown node/i.test(e)), bad.errors);
check("self loop warned", bad.warnings.some((w) => /self/i.test(w)), bad.warnings);
check("orphan node still rendered", bad.manifest.nodes.length === 3);
check("bad edges dropped", bad.manifest.edges.length === 0, bad.manifest.edges);

console.log("\n== manifest: empty phases gets implicit default");
const noPhase = normalizeManifest({ factoryName: "f", nodes: [{ id: "x", label: "X" }] });
check("implicit phase created", noPhase.manifest.phases.length === 1, noPhase.manifest.phases);
check("node attached to it", noPhase.manifest.nodes[0].phaseId === noPhase.manifest.phases[0].id);

// -------------------------------------------------------------- projection
console.log("\n== projection: no run attached");
const cold = projectRun(good.manifest, null);
check("not attached", cold.attached === false);
check("all nodes not-started", cold.nodes.every((n) => n.state === "not-started"), cold.nodes.map((n) => n.state));
check("edges present", cold.edges.length === 2);
check("title from manifest", cold.title === "Demo workflow");

console.log("\n== projection: live run, epoch timestamps, error status");
const now = Date.now();
const detail = {
    runId: "run_abc",
    factoryName: "demo-factory",
    status: "running",
    revision: 7,
    createdAt: now - 60000,
    startedAt: now - 59000,
    updatedAt: now,
    completedAt: null,
    currentPhase: { id: "build", ordinal: 1 },
    declaredPhaseCount: 2,
    liveAgentCount: 1,
    totalSpawnedAgentCount: 3,
    consumed: { activeMs: 12345, subagents: 3, nanoAiu: 42 },
    declaredLimits: {},
    approved: null,
    observedAt: now,
    activeSegmentStartedAt: now - 59000,
    terminal: null,
    phases: [
        { id: "research", ordinal: 0, title: "Research", status: "completed", lastEnteredRunAttempt: 1, entryCount: 1, accumulatedActiveMs: 500, currentActiveMs: 0, totalAgentCount: 2, liveAgentCount: 0 },
        { id: "build", ordinal: 1, title: "Build", status: "active", lastEnteredRunAttempt: 1, entryCount: 1, accumulatedActiveMs: 0, currentActiveMs: 900, totalAgentCount: 1, liveAgentCount: 1 },
    ],
    agents: [
        { agentId: "a1", toolCallId: "t1", runId: "run_abc", phaseId: "research", label: "Scan repo", agentType: "explore", status: "completed", activeMs: 300, startedAt: now - 58000, completedAt: now - 40000, resolvedModel: "claude-sonnet-5" },
        { agentId: "a2", toolCallId: "t2", runId: "run_abc", phaseId: "research", label: "Read docs", agentType: "explore", status: "error", activeMs: 200, startedAt: now - 58000, completedAt: now - 42000 },
        { agentId: "a3", toolCallId: "t3", runId: "run_abc", phaseId: "build", label: "Write code", agentType: "general-purpose", status: "idle", activeMs: 900, startedAt: now - 30000, activity: "Reading files" },
        { agentId: "a4", toolCallId: "t4", runId: "run_abc", phaseId: "build", label: "Surprise agent", agentType: "task", status: "running", activeMs: 100, startedAt: now - 5000 },
    ],
    progress: {
        records: [
            { seq: 1, attempt: 1, phaseId: "research", recordedAt: now - 58000, kind: "phase", text: "Research" },
            { seq: 2, attempt: 1, phaseId: "research", recordedAt: now - 50000, kind: "log", text: "scanned 40 files" },
            { seq: 3, attempt: 1, phaseId: "build", recordedAt: now - 30000, kind: "phase", text: "Build" },
        ],
        oldestSeq: 1,
        newestSeq: 3,
        hasMoreOlder: false,
        hasMoreNewer: false,
        revision: 7,
    },
};
const live = projectRun(good.manifest, detail);
const byId = Object.fromEntries(live.nodes.map((n) => [n.id, n]));
check("attached", live.attached === true);
check("runStatus running", live.runStatus === "running");
check("n1 succeeded", byId.n1?.state === "succeeded", byId.n1);
check("n2 FAILED (wire says 'error')", byId.n2?.state === "failed", byId.n2);
check("n3 running (wire says 'idle')", byId.n3?.state === "running", byId.n3);
check("n3 shows activity", byId.n3?.activity === "Reading files");
check("unmapped agent surfaced", live.nodes.some((n) => n.kind === "unmapped" && /Surprise/.test(n.label)), live.nodes.map((n) => n.label));
check("unmappedCount is 1", live.unmappedCount === 1, live.unmappedCount);
check("startedAt is ISO", typeof live.startedAt === "string" && live.startedAt.includes("T"), live.startedAt);
check("progress recordedAt is ISO", typeof live.progress[0].recordedAt === "string" && live.progress[0].recordedAt.includes("T"), live.progress[0]);
check("an edge is active", live.edges.some((e) => e.active), live.edges);
check("no resultPreview leak", !JSON.stringify(live).includes("resultPreview"));

console.log("\n== projection: terminal failure union renders as text");
const failed = projectRun(good.manifest, {
    ...detail,
    status: "error",
    terminal: {
        failure: { type: "factory_limit_reached", kind: "maxTotalSubagents", value: 12, runId: "run_abc" },
        resultPreview: "SECRET AGENT OUTPUT SHOULD NOT APPEAR",
    },
});
check("failure is a readable string", typeof failed.terminal.failure === "string" && /maxTotalSubagents/.test(failed.terminal.failure), failed.terminal);
check("no [object Object]", !JSON.stringify(failed).includes("[object Object]"));
check("resultPreview NOT surfaced", !JSON.stringify(failed).includes("SECRET AGENT OUTPUT"));

console.log("\n== projection: unknown agent status degrades safely");
const weird = projectRun(good.manifest, { ...detail, agents: [{ agentId: "z", label: "Scan repo", phaseId: "research", status: "quantum-superposition", activeMs: 0 }] });
const zn = weird.nodes.find((n) => n.id === "n1");
check("falls back to queued", zn?.state === "queued", zn);
check("raw status preserved", JSON.stringify(weird).includes("quantum-superposition"));

console.log("\n== projection: node cap");
const bigNodes = [];
for (let i = 0; i < 40; i++) bigNodes.push({ id: `b${i}`, label: `Node ${i}`, phaseId: "research" });
const bigM = normalizeManifest({ factoryName: "big", phases: [{ id: "research", title: "R" }], nodes: bigNodes, edges: [] });
const bigAgents = [];
for (let i = 0; i < 400; i++) bigAgents.push({ agentId: `g${i}`, label: `Ghost ${i}`, phaseId: "research", status: "running", activeMs: 1 });
const big = projectRun(bigM.manifest, { ...detail, agents: bigAgents });
check("node count capped", big.nodes.length <= 250, big.nodes.length);
check("truncated flag set", big.truncated === true);
check("all declared nodes kept", bigNodes.every((n) => big.nodes.some((x) => x.id === n.id)));

console.log("\n== projection: node cap across many phases");
const mp = [];
for (let p = 0; p < 8; p++) mp.push({ id: `ph${p}`, title: `Phase ${p}` });
const mpM = normalizeManifest({ factoryName: "mp", phases: mp, nodes: [{ id: "d0", label: "Declared", phaseId: "ph0" }], edges: [] });
const mpAgents = [];
for (let i = 0; i < 900; i++) mpAgents.push({ agentId: `m${i}`, label: `Ghost ${i}`, phaseId: `ph${i % 8}`, status: "running", activeMs: 1 });
const mpRun = projectRun(mpM.manifest, { ...detail, phases: mp.map((p, i) => ({ ...p, ordinal: i, status: "active", lastEnteredRunAttempt: 1, entryCount: 1, accumulatedActiveMs: 0, currentActiveMs: 0, totalAgentCount: 0, liveAgentCount: 0 })), agents: mpAgents }, { maxNodes: 50 });
check("respects custom maxNodes", mpRun.nodes.length <= 50, mpRun.nodes.length);
check("declared survives", mpRun.nodes.some((n) => n.id === "d0"));
check("aggregate chips present", mpRun.nodes.some((n) => n.kind === "aggregate"));
check("no ghost lost silently", mpRun.truncated === true);
const chipTotal = mpRun.nodes.filter((n) => n.kind === "aggregate").reduce((s, n) => s + n.agentCount, 0);
const shownTotal = mpRun.nodes.filter((n) => n.kind !== "aggregate").reduce((s, n) => s + n.agentCount, 0);
check("every agent accounted for", chipTotal + shownTotal === 900, { chipTotal, shownTotal });

// ---------------------------------------------------------------- renderer
console.log("\n== renderer");
const html = renderHtml();
check("returns a string", typeof html === "string" && html.length > 500);
check("has doctype", /^<!DOCTYPE html>/i.test(html.trim()));
check("no unresolved template holes", !html.includes("${"));
check("uses theme tokens", html.includes("--background-color-default"));
check("warning banner styled separately", html.includes(".banner.warn") && html.includes("Manifest warnings"));
const warnView = projectRun(good.manifest, null, { errors: ["E1"], warnings: ["W1"] });
check("errors and warnings stay separate", warnView.errors.length === 1 && warnView.warnings.length === 1, warnView);
check("connects to /events", html.includes("/events"));
check("no innerHTML", !html.includes("innerHTML"));

// ------------------------------------------------------- client DOM execution
console.log("\n== client render (DOM shim)");
const client = runClient(CLIENT_JS);
check("client script evaluates", typeof client.render === "function");
check("subscribes to EventSource", client.EventSource.instances.length === 1);
check("fetches initial state", client.fetches.includes("/state"));

// dCold render.
const dCold = projectRun(good.manifest, null, {});
client.render(dCold);
const graph = client.doc.getElementById("graph");
check("dCold: one node box per manifest node", graph.countByClass("node") === dCold.nodes.length, graph.countByClass("node"));
check("dCold: phase headers rendered", graph.countByClass("phase-head") >= 1);
check("dCold: title set", client.doc.title === (dCold.title || "Workflow"), client.doc.title);
check("dCold: log shows no progress", client.doc.getElementById("logcount").textContent === "no progress yet");

// dLive render with a run attached.
const liveDetail = {
    runId: "r-dom",
    factoryName: "demo-review",
    status: "running",
    createdAt: Date.now() - 5000,
    updatedAt: Date.now(),
    // FactoryCurrentPhase is { id, ordinal }, never a bare string.
    currentPhase: { id: "review", ordinal: 1 },
    liveAgentCount: 2,
    terminal: null,
    phases: [
        { id: "survey", title: "Survey", status: "completed", totalAgentCount: 1, liveAgentCount: 0, accumulatedActiveMs: 1200, currentActiveMs: 0 },
        { id: "review", title: "Review", status: "active", totalAgentCount: 3, liveAgentCount: 2, accumulatedActiveMs: 800, currentActiveMs: 400 },
    ],
    agents: [
        { agentId: "a1", label: "Map changed files", phaseId: "survey", status: "completed", activeMs: 1200 },
        { agentId: "a2", label: "Security review", phaseId: "review", status: "running", activeMs: 400, activity: "Reading files" },
        { agentId: "a3", label: "Performance review", phaseId: "review", status: "error", activeMs: 300 },
        { agentId: "a4", label: "Ghost agent", phaseId: "review", status: "idle", activeMs: 100 },
    ],
    progress: {
        records: [
            { seq: 1, phaseId: "survey", recordedAt: Date.now() - 4000, kind: "phase", text: "Entered survey" },
            { seq: 2, phaseId: "review", recordedAt: Date.now() - 1000, kind: "log", text: "Reviewing" },
        ],
    },
};
const dLive = projectRun(good.manifest, liveDetail, {});
client.render(dLive);
check("dLive: renders unmapped agent node", dLive.nodes.some((n) => n.unmapped), dLive.nodes.filter((n) => n.unmapped));
check("dLive: node count matches view model", graph.countByClass("node") === dLive.nodes.length, {
    dom: graph.countByClass("node"),
    view: dLive.nodes.length,
});
check("dLive: edges drawn", graph.countByClass("edge") >= 1);
check("dLive: title includes run status", client.doc.title.includes("running"), client.doc.title);
check("dLive: progress lines rendered", client.doc.getElementById("log").children.length === 2);
check("dLive: progress count label", client.doc.getElementById("logcount").textContent.includes("2"));

// Re-render must fully replace, not append.
client.render(dLive);
check("re-render is idempotent (no duplicate nodes)", graph.countByClass("node") === dLive.nodes.length, graph.countByClass("node"));
check("re-render is idempotent (log)", client.doc.getElementById("log").children.length === 2);

// Broken manifest still paints banners rather than blanking.
const dBad = normalizeManifest({
    factoryName: "broken-demo",
    nodes: [{ id: "x", label: "X", phaseId: "nope" }, { id: "x2", label: "X" }],
    edges: [{ from: "x", to: "ghost" }, { from: "x", to: "x" }],
});
const dBadView = projectRun(dBad.manifest, null, { errors: dBad.errors, warnings: dBad.warnings });
client.render(dBadView);
const hdr = client.doc.getElementById("hdr");
check("broken: error banner painted", hdr.countByClass("banner") >= 1);
check("broken: graph is not blank", graph.countByClass("node") >= 1, graph.countByClass("node"));

// Log toggle interaction.
const logEl = client.doc.getElementById("log");
client.doc.getElementById("logtoggle").dispatch("click", {});
check("log toggle opens", logEl.classList.contains("open"));
client.doc.getElementById("logtoggle").dispatch("click", {});
check("log toggle closes", !logEl.classList.contains("open"));

// Malformed SSE frame must not throw.
let threw = false;
try {
    for (const l of client.listeners) if (l.t === "state") l.fn({ data: "not json" });
} catch {
    threw = true;
}
check("malformed SSE frame is swallowed", !threw);

// ------------------------------------------------- run-level terminal states
// A run that halts or is cancelled overrides in-flight node states: agents
// stop where they are, and leaving them painted "running" would be a lie.
for (const [status, expected] of [["halted", "halted"], ["cancelled", "cancelled"]]) {
    console.log(`\n== projection: run ${status} overrides in-flight nodes`);
    const v = projectRun(good.manifest, {
        status,
        phases: [{ id: "p0", title: "Research", ordinal: 0, status: "active" }],
        agents: [
            { agentId: "a1", label: "Scan repo", status: "running", phaseId: "p0" },
            { agentId: "a2", label: "Read docs", status: "completed", phaseId: "p0" },
        ],
    });
    const byId = Object.fromEntries(v.nodes.map((n) => [n.id, n]));
    check(`runStatus is ${status}`, v.runStatus === status);
    check(`in-flight node becomes ${expected}`, byId.n1.state === expected, byId.n1.state);
    check("finished work stays succeeded", byId.n2.state === "succeeded", byId.n2.state);
    check("untouched node stays not-started", byId.n3.state === "not-started", byId.n3.state);
    check("no agents counted live", v.liveAgentCount === 0, v.liveAgentCount);
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
