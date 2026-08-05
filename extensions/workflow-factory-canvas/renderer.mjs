// Iframe renderer for the workflow canvas.
//
// Plain HTML/CSS/JS, no build step and no dependencies. The document is served
// from the per-instance loopback server; live updates arrive over SSE on
// /events. This file only produces strings -- all state lives in the extension.
//
// NOTE: the client script below deliberately avoids template literals so this
// module can hold it inside one without escaping gymnastics.

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--background-color-default, #ffffff);
  color: var(--text-color-default, #1f2328);
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--text-body-medium, 14px);
  line-height: var(--leading-body-medium, 20px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

header {
  flex: 0 0 auto;
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--border-color-default, #d1d9e0);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.title-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
h1 {
  margin: 0;
  font-size: var(--text-title-medium, 18px);
  font-weight: var(--font-weight-semibold, 600);
  line-height: var(--leading-title-medium, 24px);
}
.sub { color: var(--text-color-muted, #59636e); font-size: var(--text-body-small, 12px); }
code, .mono { font-family: var(--font-mono, "SFMono-Regular", Consolas, monospace); font-size: var(--text-code-inline, 12px); }

.chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border-radius: 999px;
  border: 1px solid var(--border-color-default, #d1d9e0);
  font-size: var(--text-body-small, 12px);
  white-space: nowrap;
}
.chip .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
.chip.zero { opacity: .45; }

.banner {
  padding: 8px 12px; border-radius: 6px; font-size: var(--text-body-small, 12px);
  border: 1px solid var(--true-color-red, #cf222e);
  background: var(--true-color-red-muted, rgba(207,34,46,.10));
}
.banner.warn {
  border-color: var(--true-color-yellow, #9a6700);
  background: var(--true-color-yellow-muted, rgba(154,103,0,.10));
}
.banner ul { margin: 4px 0 0; padding-left: 18px; }
.banner li { margin: 2px 0; }

main { flex: 1 1 auto; overflow: auto; position: relative; padding: 16px; }
#graph { position: relative; }
#edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }

.phase-head {
  position: absolute;
  font-size: var(--text-body-small, 12px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-color-muted, #59636e);
  display: flex; align-items: center; gap: 6px;
  white-space: nowrap;
}
.phase-band {
  position: absolute;
  border: 1px dashed var(--border-color-default, #d1d9e0);
  border-radius: 10px;
  opacity: .55;
  pointer-events: none;
}

.node {
  position: absolute;
  border: 1px solid var(--border-color-default, #d1d9e0);
  border-radius: 8px;
  background: var(--background-color-default, #fff);
  padding: 8px 10px;
  display: flex; flex-direction: column; gap: 3px;
  overflow: hidden;
  cursor: default;
}
.node .label {
  font-weight: var(--font-weight-semibold, 600);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.node .meta {
  font-size: var(--text-body-small, 12px);
  color: var(--text-color-muted, #59636e);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.node .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
.node.unmapped { border-style: dashed; }
.node.state-not-started { opacity: .58; }
.node.state-running { border-color: var(--true-color-blue, #0969da); }
.node.state-running .bar { animation: pulse 1.4s ease-in-out infinite; }
.node.state-succeeded { border-color: var(--true-color-green, #1a7f37); }
.node.state-failed { border-color: var(--true-color-red, #cf222e); }
.node.state-halted { border-color: var(--true-color-yellow, #9a6700); }
.node.state-cancelled { opacity: .62; }
.node .detail {
  font-size: var(--text-body-small, 12px);
  color: var(--text-color-muted, #59636e);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: .85;
}

/* Node shapes.
   node.kind is free-form in the manifest (any string up to 60 chars), so it is
   never interpolated into a class name directly. Only an allow-listed kind
   produces a class, and every such class is "shape-" prefixed -- an author
   writing kind: "state-succeeded" therefore yields shape-state-succeeded,
   which matches nothing, instead of painting the node green. Unknown kinds
   fall through to the default rectangle. */
.node.shape-decision, .node.shape-gate { border-radius: 16px; }
.node.shape-decision .label::before,
.node.shape-gate .label::before { content: "\\25C6\\00A0"; opacity: .5; }
.node.shape-terminal { border-radius: 999px; }
.node.shape-terminal .label::before { content: "\\25CF\\00A0"; opacity: .5; }
.node.shape-barrier { border-radius: 2px; border-top-width: 3px; border-bottom-width: 3px; }
.node.shape-barrier .label::before { content: "\\2016\\00A0"; opacity: .5; }
.node.shape-input .label::before { content: "\\25B6\\00A0"; opacity: .5; }
.node.shape-output .label::before { content: "\\25A0\\00A0"; opacity: .5; }

/* Container groups: a labelled box drawn behind its members. Groups may span
   phase columns, so they cannot rely on DOM append order to sit behind nodes
   the way .phase-band does -- stacking is pinned with z-index instead. */
.group-box {
  position: absolute; z-index: 0;
  border: 1px solid var(--border-color-default, #d1d9e0);
  border-radius: 12px;
  background: var(--background-color-muted, rgba(101,109,118,.06));
  /* The box carries the group's detail as its title, so it has to be
     hoverable. Member nodes sit at z-index 1 and still receive their own
     events; only the bare backdrop between them resolves to the group. */
  pointer-events: auto;
}
.group-label {
  position: absolute; z-index: 0;
  font-size: var(--text-body-small, 12px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-color-muted, #59636e);
  white-space: nowrap; pointer-events: none;
}
.phase-band { z-index: 0; }
.node { z-index: 1; }

/* Edge labels sit on the curve, so they are painted with a background-coloured
   stroke underneath the glyphs (paint-order: stroke) to punch a halo through
   the path and through any label they overlap. */
text.edge-label {
  font-size: 11px;
  fill: var(--text-color-muted, #59636e);
  paint-order: stroke;
  stroke: var(--background-color-default, #fff);
  stroke-width: 3px;
  stroke-linejoin: round;
  /* #edges disables pointer events wholesale so the SVG never blocks the
     nodes beneath it. Re-enable them just for the label, otherwise its
     <title> -- the only place the untruncated branch text survives -- can
     never be surfaced. */
  pointer-events: auto;
}
text.edge-label.active { fill: var(--true-color-blue, #0969da); }

@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes flow { to { stroke-dashoffset: -16; } }
path.edge { fill: none; stroke: var(--border-color-default, #d1d9e0); stroke-width: 1.5; }
path.edge.active {
  stroke: var(--true-color-blue, #0969da);
  stroke-width: 2;
  stroke-dasharray: 5 3;
  animation: flow .6s linear infinite;
}

footer {
  flex: 0 0 auto;
  border-top: 1px solid var(--border-color-default, #d1d9e0);
  max-height: 34%;
  display: flex; flex-direction: column;
}
footer .bar-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 16px; cursor: pointer; user-select: none;
  font-size: var(--text-body-small, 12px);
  color: var(--text-color-muted, #59636e);
}
footer .bar-row:hover { color: var(--text-color-default, #1f2328); }
#log { overflow: auto; padding: 0 16px 12px; display: none; }
#log.open { display: block; }
#log .line { display: flex; gap: 8px; padding: 1px 0; font-family: var(--font-mono, monospace); font-size: var(--text-code-inline, 12px); }
#log .line .seq { color: var(--text-color-muted, #59636e); min-width: 3.5em; text-align: right; flex: 0 0 auto; }
#log .line.phase .txt { font-weight: var(--font-weight-semibold, 600); }
#log .txt { white-space: pre-wrap; word-break: break-word; }

.empty {
  padding: 32px; text-align: center; color: var(--text-color-muted, #59636e);
}
`;

// Client script. Intentionally free of backticks and ${} so it can live inside
// a template literal below.
/** Client script, exported so tests can execute it against a DOM shim. */
export const CLIENT_JS = `
"use strict";
var NODE_W = 210, NODE_H = 58, V_GAP = 14, COL_GAP = 72, PAD = 8, HEAD_H = 30;

// Node kinds that map to a distinct shape. Anything outside this list renders
// as the default rectangle. See the "shape-" CSS block for why this is an
// allow-list rather than a passthrough.
var SHAPE_KINDS = { decision: 1, gate: 1, barrier: 1, terminal: 1, input: 1, output: 1 };
function shapeClass(kind) {
  return SHAPE_KINDS[kind] ? " shape-" + kind : "";
}

// A node carrying a "detail" subtitle needs a third text line, so it is taller.
// Heights are per-node rather than a single constant because column stacking,
// the phase band, and edge anchor points all read the real box height.
var DETAIL_H = 18;
function nodeHeight(n) {
  return n && n.detail ? NODE_H + DETAIL_H : NODE_H;
}

// Edge labels are capped at 120 chars by the schema, which is far wider than a
// column at 11px. Truncate for display so a long label cannot smear across the
// whole graph; the full text is attached to the label element as a <title> and
// an aria-label, so truncation never destroys information.
var MAX_EDGE_LABEL = 28;
function edgeLabelText(s) {
  s = String(s);
  return s.length > MAX_EDGE_LABEL ? s.slice(0, MAX_EDGE_LABEL - 1) + "\\u2026" : s;
}

var STATE_COLOR = {
  "not-started": "var(--text-color-muted, #59636e)",
  "queued": "var(--true-color-blue-muted, #79c0ff)",
  "running": "var(--true-color-blue, #0969da)",
  "succeeded": "var(--true-color-green, #1a7f37)",
  "failed": "var(--true-color-red, #cf222e)",
  "halted": "var(--true-color-yellow, #9a6700)",
  "cancelled": "var(--text-color-muted, #59636e)",
  "unmapped": "var(--text-color-muted, #59636e)"
};
var STATE_ORDER = ["running","queued","succeeded","failed","halted","cancelled","not-started"];

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}
function esc(s) { return String(s === null || s === undefined ? "" : s); }
function fmtMs(ms) {
  var v = Number(ms) || 0;
  if (v < 1000) return v + "ms";
  var s = Math.round(v / 1000);
  if (s < 60) return s + "s";
  var m = Math.floor(s / 60);
  var r = s % 60;
  if (m < 60) return m + "m " + r + "s";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}

function renderHeader(v) {
  var host = document.getElementById("hdr");
  host.replaceChildren();

  var row = el("div", "title-row");
  row.appendChild(el("h1", null, v.title || "Workflow"));
  var sub = el("span", "sub");
  var bits = [];
  if (v.factoryName) bits.push(v.factoryName);
  if (v.runId) bits.push("run " + v.runId);
  sub.textContent = bits.join("  \\u00b7  ");
  row.appendChild(sub);
  host.appendChild(row);

  var chips = el("div", "chips");

  var status = el("span", "chip");
  var d = el("span", "dot");
  d.style.background = v.attached
    ? (v.runStatus === "running" ? STATE_COLOR.running
      : v.runStatus === "completed" ? STATE_COLOR.succeeded
      : v.runStatus === "error" ? STATE_COLOR.failed
      : v.runStatus === "halted" ? STATE_COLOR.halted
      : v.runStatus === "cancelled" ? STATE_COLOR.cancelled
      : STATE_COLOR["not-started"])
    : STATE_COLOR["not-started"];
  status.appendChild(d);
  status.appendChild(document.createTextNode(v.attached ? (v.runStatus || "unknown") : "no run attached"));
  chips.appendChild(status);

  for (var i = 0; i < STATE_ORDER.length; i++) {
    var s = STATE_ORDER[i];
    var n = (v.counts && v.counts[s]) || 0;
    var c = el("span", "chip" + (n === 0 ? " zero" : ""));
    var dot = el("span", "dot");
    dot.style.background = STATE_COLOR[s];
    c.appendChild(dot);
    c.appendChild(document.createTextNode(n + " " + s));
    chips.appendChild(c);
  }

  if (v.unmappedCount > 0) {
    chips.appendChild(el("span", "chip", v.unmappedCount + " unmapped"));
  }
  if (v.consumed && v.consumed.activeMs) {
    chips.appendChild(el("span", "chip", "active " + fmtMs(v.consumed.activeMs)));
  }
  if (v.currentPhase && v.phases && v.phases.length) {
    chips.appendChild(el("span", "chip", "phase " + ((v.currentPhase.ordinal || 0) + 1) + "/" + v.phases.length));
  }
  host.appendChild(chips);

  if (v.errors && v.errors.length) {
    var b = el("div", "banner");
    b.appendChild(el("strong", null, "Manifest problems"));
    var ul = el("ul");
    for (var j = 0; j < v.errors.length; j++) ul.appendChild(el("li", null, v.errors[j]));
    b.appendChild(ul);
    host.appendChild(b);
  }
  if (v.warnings && v.warnings.length) {
    var wb = el("div", "banner warn");
    wb.appendChild(el("strong", null, "Manifest warnings"));
    var wul = el("ul");
    for (var w = 0; w < v.warnings.length; w++) wul.appendChild(el("li", null, v.warnings[w]));
    wb.appendChild(wul);
    host.appendChild(wb);
  }
  if (v.runError) {
    var rb = el("div", "banner");
    rb.appendChild(el("strong", null, "Run unavailable"));
    rb.appendChild(el("div", null, v.runError));
    host.appendChild(rb);
  }
  if (v.terminal && (v.terminal.error || v.terminal.failure)) {
    var tb = el("div", "banner");
    tb.appendChild(el("strong", null, "Run ended: " + esc(v.terminal.reason || "error")));
    tb.appendChild(el("div", null, esc(v.terminal.error || v.terminal.failure)));
    host.appendChild(tb);
  }
  if (v.truncated) {
    var wb = el("div", "banner warn");
    wb.textContent = "Graph truncated: surplus unmapped agents are collapsed into per-phase aggregates.";
    host.appendChild(wb);
  }
}

function renderGraph(v) {
  var graph = document.getElementById("graph");
  graph.replaceChildren();

  if (!v.nodes || v.nodes.length === 0) {
    var e = el("div", "empty", "No nodes to display. Provide a manifest with at least one node.");
    graph.appendChild(e);
    return;
  }

  var svgNS = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("id", "edges");
  graph.appendChild(svg);

  var byPhase = {};
  for (var i = 0; i < v.phases.length; i++) byPhase[v.phases[i].id] = [];
  for (var k = 0; k < v.nodes.length; k++) {
    var n = v.nodes[k];
    if (!byPhase[n.phaseId]) byPhase[n.phaseId] = [];
    byPhase[n.phaseId].push(n);
  }

  var pos = {};
  var x = 0, maxY = 0;
  for (var p = 0; p < v.phases.length; p++) {
    var phase = v.phases[p];
    var list = byPhase[phase.id] || [];

    var head = el("div", "phase-head");
    var hd = el("span", "dot");
    hd.style.width = "7px"; hd.style.height = "7px"; hd.style.borderRadius = "50%";
    hd.style.background = phase.status === "active" ? STATE_COLOR.running
      : phase.status === "completed" ? STATE_COLOR.succeeded
      : phase.status === "skipped" ? STATE_COLOR.cancelled
      : STATE_COLOR["not-started"];
    head.appendChild(hd);
    head.appendChild(document.createTextNode(
      (phase.title || phase.id) + (list.length ? "  (" + list.length + ")" : "")
    ));
    head.style.left = x + "px";
    head.style.top = "0px";
    head.style.width = NODE_W + "px";
    graph.appendChild(head);

    var bandH = 0;
    for (var bq = 0; bq < list.length; bq++) bandH += nodeHeight(list[bq]);
    bandH += Math.max(0, list.length - 1) * V_GAP;
    bandH = Math.max(NODE_H, bandH);
    var band = el("div", "phase-band");
    band.style.left = (x - PAD) + "px";
    band.style.top = (HEAD_H - PAD) + "px";
    band.style.width = (NODE_W + PAD * 2) + "px";
    band.style.height = (bandH + PAD * 2) + "px";
    graph.appendChild(band);

    var y = HEAD_H;
    for (var q = 0; q < list.length; q++) {
      var node = list[q];
      var nh = nodeHeight(node);
      pos[node.id] = { x: x, y: y, w: NODE_W, h: nh };

      var box = el("div", "node state-" + node.state + shapeClass(node.kind) + (node.unmapped ? " unmapped" : ""));
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = NODE_W + "px";
      box.style.height = nh + "px";

      var bar = el("div", "bar");
      bar.style.background = STATE_COLOR[node.state] || STATE_COLOR["not-started"];
      box.appendChild(bar);

      box.appendChild(el("div", "label", node.label));

      var meta = [];
      meta.push(node.state);
      if (node.agentCount > 1) meta.push(node.agentCount + " agents");
      if (node.activeMs) meta.push(fmtMs(node.activeMs));
      if (node.activity) meta.push(node.activity);
      box.appendChild(el("div", "meta", meta.join("  \\u00b7  ")));
      if (node.detail) box.appendChild(el("div", "detail", node.detail));

      var tip = [node.label, "state: " + node.state, "kind: " + node.kind];
      if (node.rawStatuses && node.rawStatuses.length) tip.push("runtime status: " + node.rawStatuses.join(", "));
      if (node.unknownStatus) tip.push("(unrecognised runtime status -- shown as queued)");
      if (node.models && node.models.length) tip.push("model: " + node.models.join(", "));
      if (node.startedAt) tip.push("started: " + node.startedAt);
      if (node.completedAt) tip.push("completed: " + node.completedAt);
      if (node.unmapped) tip.push("Not declared in the manifest -- the factory produced this label at runtime.");
      if (node.declared && node.agentCount === 0) tip.push("No runtime agent has claimed this label yet.");
      box.title = tip.join("\\n");

      graph.appendChild(box);
      y += nh + V_GAP;
    }
    maxY = Math.max(maxY, y);
    x += NODE_W + COL_GAP;
  }

  // Container groups are drawn from the laid-out node rectangles, so a group may
  // span any number of phase columns. They are appended after the nodes but
  // paint behind them via z-index, and they run BEFORE the canvas is sized so a
  // box hanging past the last node still extends the scrollable area.
  //
  //      phase A          phase B          phase C
  //   +----------------------------+
  //   |  [n1]            [n2]      |   <- group "quarantine" spans A..B
  //   +----------------------------+
  //                      +-------------------------+
  //                      |  [n3]         [n4]      |   <- group "trusted"
  //                      +-------------------------+
  var groups = v.groups || [];
  var maxX = x - COL_GAP;
  for (var gi = 0; gi < groups.length; gi++) {
    var g = groups[gi];
    var ids = g.nodeIds || [];
    var gx1 = Infinity, gy1 = Infinity, gx2 = -Infinity, gy2 = -Infinity, seen = 0;
    for (var mi = 0; mi < ids.length; mi++) {
      var mp = pos[ids[mi]];
      // A member with no laid-out rectangle contributes nothing to the bounds.
      // Without this guard the bounds stay at +/-Infinity and every geometry
      // value below becomes NaN, which renders as an invisible box rather than
      // an error -- a silent failure.
      if (!mp) continue;
      seen++;
      if (mp.x < gx1) gx1 = mp.x;
      if (mp.y < gy1) gy1 = mp.y;
      if (mp.x + mp.w > gx2) gx2 = mp.x + mp.w;
      if (mp.y + mp.h > gy2) gy2 = mp.y + mp.h;
    }
    if (!seen) continue;

    // The label sits inside the top padding, so gpTop must clear a line of text.
    var gpx = 12, gpTop = 22, gpBot = 12;
    var gLeft = Math.max(0, gx1 - gpx);
    var gTop = Math.max(0, gy1 - gpTop);
    var gW = gx2 + gpx - gLeft;
    var gH = gy2 + gpBot - gTop;

    var gbox = el("div", "group-box");
    gbox.style.left = gLeft + "px";
    gbox.style.top = gTop + "px";
    gbox.style.width = gW + "px";
    gbox.style.height = gH + "px";
    gbox.title = g.detail ? g.title + " -- " + g.detail : g.title;
    graph.appendChild(gbox);

    var glab = el("div", "group-label", g.title);
    glab.style.left = (gLeft + 8) + "px";
    glab.style.top = (gTop + 3) + "px";
    graph.appendChild(glab);

    maxX = Math.max(maxX, gLeft + gW);
    maxY = Math.max(maxY, gTop + gH);
  }

  var width = Math.max(maxX, NODE_W);

  var height = Math.max(maxY, HEAD_H + NODE_H) + PAD * 2;
  graph.style.width = width + "px";
  graph.style.height = height + "px";
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  for (var ei = 0; ei < v.edges.length; ei++) {
    var edge = v.edges[ei];
    var a = pos[edge.from], b = pos[edge.to];
    if (!a || !b) continue;
    var x1 = a.x + a.w, y1 = a.y + a.h / 2;
    var x2 = b.x, y2 = b.y + b.h / 2;
    var dx = Math.max(28, Math.abs(x2 - x1) * 0.5);
    var d, mx, my;
    if (x2 >= x1) {
      d = "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2;
      // Cubic midpoint at t=0.5 is (P0 + 3*P1 + 3*P2 + P3) / 8. On this branch
      // the +dx and -dx control offsets cancel exactly, so it collapses to the
      // plain average of the endpoints -- the label lands between the boxes.
      mx = (x1 + x2) / 2;
      my = (y1 + y2) / 2;
    } else {
      // Backward or same-column edge: bow out to the right of both boxes.
      var bow = Math.max(a.x + a.w, b.x + b.w) + 34;
      var bx2 = b.x + b.w;
      d = "M " + x1 + " " + y1 + " C " + bow + " " + y1 + ", " + bow + " " + y2 + ", " + bx2 + " " + y2;
      // Same t=0.5 formula, but BOTH control points sit out at "bow", which
      // drags the curve far to the right. Reusing the forward branch's average
      // here would drop the label back on top of the nodes instead of on the
      // visible part of the curve.
      mx = (x1 + 6 * bow + bx2) / 8;
      my = (y1 + y2) / 2;
    }
    var path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "edge" + (edge.active ? " active" : ""));
    svg.appendChild(path);

    if (edge.label) {
      var lab = document.createElementNS(svgNS, "text");
      lab.setAttribute("x", String(mx));
      lab.setAttribute("y", String(my - 5));
      lab.setAttribute("text-anchor", "middle");
      lab.setAttribute("class", "edge-label" + (edge.active ? " active" : ""));
      lab.textContent = edgeLabelText(edge.label);
      // Display text may be truncated, so carry the full branch condition as
      // the element's accessible name. Without this the omitted characters are
      // unrecoverable for everyone, not just screen-reader users.
      lab.setAttribute("aria-label", String(edge.label));
      var lt = document.createElementNS(svgNS, "title");
      lt.textContent = String(edge.label);
      lab.appendChild(lt);
      svg.appendChild(lab);
    }
  }
}

function renderLog(v) {
  var log = document.getElementById("log");
  var count = document.getElementById("logcount");
  var lines = v.progress || [];
  count.textContent = lines.length ? lines.length + " progress lines" : "no progress yet";
  var stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 24;
  log.replaceChildren();
  for (var i = 0; i < lines.length; i++) {
    var r = lines[i];
    var row = el("div", "line" + (r.kind === "phase" ? " phase" : ""));
    row.appendChild(el("span", "seq", "#" + r.seq));
    row.appendChild(el("span", "txt", r.text));
    log.appendChild(row);
  }
  if (stick) log.scrollTop = log.scrollHeight;
}

function render(v) {
  document.title = (v.title || "Workflow") + (v.runStatus ? " - " + v.runStatus : "");
  renderHeader(v);
  renderGraph(v);
  renderLog(v);
}

document.getElementById("logtoggle").addEventListener("click", function () {
  var log = document.getElementById("log");
  log.classList.toggle("open");
  document.getElementById("logcaret").textContent = log.classList.contains("open") ? "\\u25be" : "\\u25b8";
});

var es = new EventSource("/events");
es.addEventListener("state", function (ev) {
  try { render(JSON.parse(ev.data)); } catch (err) { /* ignore malformed frame */ }
});
es.addEventListener("error", function () { /* EventSource retries automatically */ });

fetch("/state").then(function (r) { return r.json(); }).then(render).catch(function () {});
`;

/** Full HTML document for one canvas instance. */
export function renderHtml() {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Workflow</title>
<style>${CSS}</style>
</head>
<body>
<header id="hdr"></header>
<main><div id="graph"></div></main>
<footer>
  <div class="bar-row" id="logtoggle">
    <span><span id="logcaret">&#9656;</span> Progress</span>
    <span id="logcount"></span>
  </div>
  <div id="log"></div>
</footer>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}
