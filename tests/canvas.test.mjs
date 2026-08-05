import { normalizeManifest } from "../extensions/workflow-factory-canvas/manifest.mjs";
import { projectRun } from "../extensions/workflow-factory-canvas/projection.mjs";
import { renderHtml, CLIENT_JS } from "../extensions/workflow-factory-canvas/renderer.mjs";
import { runClient } from "./dom-shim.mjs";
import { check, summary } from "./_check.mjs";

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

// ------------------------------------------------ shapes, groups, edge labels
// These are the article-fidelity features: node shapes, container groups, node
// subtitles, and labelled branch edges. All four are additive -- a manifest
// that uses none of them must render exactly as before.
console.log("\n== renderer: shapes, groups, detail lines, edge labels");

// Mirrors renderer.mjs's NODE_W. Kept local so the assertions read as geometry
// rather than magic numbers; if the renderer constant moves, these fail loudly.
const NODE_W_TEST = 210;

const rich = normalizeManifest({
    factoryName: "rich-demo",
    phases: [
        { id: "intake", title: "Intake" },
        { id: "decide", title: "Decide" },
        { id: "act", title: "Act" },
    ],
    nodes: [
        { id: "read", label: "Read inbox", phaseId: "intake", kind: "input", detail: "streams raw messages", groupId: "quarantine" },
        { id: "gate", label: "New findings?", phaseId: "decide", kind: "gate", groupId: "quarantine" },
        // kind is free-form, so an author can write a string that collides with
        // a state class name. It must not paint the node as succeeded.
        { id: "spoof", label: "Spoofed kind", phaseId: "decide", kind: "state-succeeded" },
        { id: "fix", label: "Apply fix", phaseId: "act", kind: "terminal", groupId: "trusted" },
    ],
    edges: [
        { from: "read", to: "gate", label: "raw batch" },
        { from: "gate", to: "fix", label: "no -- done" },
        // Backward edge: the Loop-Until-Done shape.
        { from: "gate", to: "read", label: "yes -- spawn another" },
        // No label: must not emit a text element at all.
        { from: "read", to: "fix" },
        { from: "spoof", to: "fix", label: "this label is far too long to fit inside one column" },
    ],
    groups: [
        { id: "quarantine", title: "Quarantine", detail: "untrusted input" },
        { id: "trusted", title: "Trusted" },
    ],
});
check("rich manifest normalizes clean", rich.errors.length === 0, rich.errors);
check("both groups survive", rich.manifest.groups.length === 2, rich.manifest.groups);

const richView = projectRun(rich.manifest, null, {});
check("view carries groups with resolved members", richView.groups.length === 2, richView.groups);
check("group membership resolved from node.groupId",
    richView.groups.find((g) => g.id === "quarantine")?.nodeIds.join(",") === "read,gate",
    richView.groups);
check("view carries node detail", richView.nodes.find((n) => n.id === "read").detail === "streams raw messages");
check("view carries edge labels", richView.edges.filter((e) => e.label).length === 4, richView.edges);

const rc = runClient(CLIENT_JS);
rc.render(richView);
const rg = rc.doc.getElementById("graph");

function collect(root, pred) {
    const out = [];
    root.walk((n) => { if (pred(n)) out.push(n); });
    return out;
}
const px = (v) => parseFloat(String(v).replace("px", ""));

// -- node shapes
check("shape: input applied", rg.countByClass("shape-input") === 1, rg.countByClass("shape-input"));
check("shape: gate applied", rg.countByClass("shape-gate") === 1);
check("shape: terminal applied", rg.countByClass("shape-terminal") === 1);
check("shape: unknown kind gets no shape class",
    collect(rg, (n) => n.className && n.className.includes("shape-")).length === 3,
    collect(rg, (n) => n.className && n.className.includes("shape-")).map((n) => n.className));
// The spoof guard: kind "state-succeeded" must not leak into state styling.
check("shape: kind cannot spoof a state class", rg.countByClass("state-succeeded") === 0);
check("shape: kind cannot spoof via prefixed class", rg.countByClass("shape-state-succeeded") === 0);

// -- detail line and variable height
const boxes = collect(rg, (n) => n.classList && n.classList.contains("node"));
const boxOf = (label) => boxes.find((b) => b.textContent.includes(label));
check("detail: rendered for the node that has one", rg.countByClass("detail") === 1, rg.countByClass("detail"));
check("detail: node with a subtitle is taller", px(boxOf("Read inbox").style.height) === 76, boxOf("Read inbox").style.height);
check("detail: node without one keeps base height", px(boxOf("New findings?").style.height) === 58, boxOf("New findings?").style.height);
// A taller node must push its column-mates down, or they overlap.
check("detail: stacking accounts for the taller box",
    px(boxOf("Spoofed kind").style.top) === 102, boxOf("Spoofed kind").style.top);

// -- edge labels
const labels = collect(rg, (n) => n.classList && n.classList.contains("edge-label"));
check("edge label: one per labelled edge, none for the bare edge", labels.length === 4, labels.length);
const labelAt = (text) => labels.find((l) => l.textContent.startsWith(text));
// Forward edge: the control-point offsets cancel, so the midpoint is the plain
// average of the endpoints -- read right edge 210, gate left edge 282.
check("edge label: forward sits between the columns", px(labelAt("raw batch").getAttribute("x")) === 246,
    labelAt("raw batch").getAttribute("x"));
// Backward edge: both control points sit out at the bow, dragging the midpoint
// far right. Using the forward formula here would put it at 246 -- on top of
// the nodes -- so this value is the whole point of the per-branch math.
const backX = px(labelAt("yes").getAttribute("x"));
check("edge label: backward uses the bowed midpoint", backX === 482.25, backX);
check("edge label: backward clears the target node", backX > 210, backX);
check("edge label: backward is not the endpoint average", backX !== 246, backX);
// Truncation: the schema allows 120 chars, far wider than a 210px column.
// Assert on ownText, not textContent -- the label now carries an SVG <title>
// child holding the untruncated value, which contributes to textContent but is
// never painted.
const longLabel = labels.find((l) => l.ownText.startsWith("this label"));
check("edge label: long label truncated", longLabel.ownText.length === 28, longLabel.ownText);
check(
    "edge label: truncation is marked with an ellipsis",
    longLabel.ownText.endsWith("\u2026"),
    longLabel.ownText
);
// Truncation must not destroy information: the full branch condition has to
// remain recoverable via the accessible name and the hover tooltip.
const longTitle = longLabel.children.find((c) => c.tagName === "TITLE");
check(
    "edge label: full text preserved in a <title>",
    longTitle?.textContent === "this label is far too long to fit inside one column",
    longTitle?.textContent
);
check(
    "edge label: full text preserved as an accessible name",
    longLabel.getAttribute("aria-label") === "this label is far too long to fit inside one column",
    longLabel.getAttribute("aria-label")
);

// -- container groups
check("group: one box per group", rg.countByClass("group-box") === 2, rg.countByClass("group-box"));
check("group: one label per group", rg.countByClass("group-label") === 2);
const gboxes = collect(rg, (n) => n.classList && n.classList.contains("group-box"));
const spanning = gboxes.find((b) => px(b.style.width) > NODE_W_TEST * 2);
check("group: spans multiple phase columns", !!spanning, gboxes.map((b) => b.style.width));
check("group: box never starts off-canvas", gboxes.every((b) => px(b.style.left) >= 0), gboxes.map((b) => b.style.left));
check("group: box never starts above the canvas", gboxes.every((b) => px(b.style.top) >= 0), gboxes.map((b) => b.style.top));
// A group box hanging past the last node must extend the canvas, not get clipped.
const gWidth = px(rg.style.width), gHeight = px(rg.style.height);
check("group: canvas widened to contain the boxes",
    gboxes.every((b) => px(b.style.left) + px(b.style.width) <= gWidth), { gWidth, gboxes: gboxes.map((b) => b.style.width) });
check("group: canvas tall enough to contain the boxes",
    gboxes.every((b) => px(b.style.top) + px(b.style.height) <= gHeight), gHeight);

// A group whose members all vanish must not render a stray rectangle.
const emptyGroup = normalizeManifest({
    factoryName: "empty-group",
    nodes: [{ id: "a", label: "A" }],
    groups: [{ id: "ghost", title: "Ghost" }],
});
check("group: zero-member group dropped with a warning",
    emptyGroup.manifest.groups.length === 0 && emptyGroup.warnings.some((w) => w.includes("ghost")),
    emptyGroup.warnings);

// A node pointing at a group that does not exist is an error, but the node
// itself must survive -- a bad box must not delete work from the graph.
const badGroupRef = normalizeManifest({
    factoryName: "bad-group-ref",
    nodes: [{ id: "a", label: "A", groupId: "nope" }],
});
check("group: dangling groupId errors but keeps the node",
    badGroupRef.errors.length === 1 && badGroupRef.manifest.nodes.length === 1,
    { errors: badGroupRef.errors, nodes: badGroupRef.manifest.nodes });
check("group: dangling groupId is cleared", badGroupRef.manifest.nodes[0].groupId === null);

// Regression guard: a manifest using none of the new features must render
// exactly as it did before they existed.
const plainView = projectRun(good.manifest, null, {});
const pc = runClient(CLIENT_JS);
pc.render(plainView);
const pg = pc.doc.getElementById("graph");
check("additive: no shapes without kinds", collect(pg, (n) => n.className && n.className.includes("shape-")).length === 0);
check("additive: no group boxes without groups", pg.countByClass("group-box") === 0);
check("additive: no detail lines without details", pg.countByClass("detail") === 0);
check("additive: no edge labels without labels", pg.countByClass("edge-label") === 0);

summary();
