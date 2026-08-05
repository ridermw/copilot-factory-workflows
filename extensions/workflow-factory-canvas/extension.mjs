// Extension: workflow-factory-canvas
//
// A read-only canvas that draws a workflow graph (phases as columns, agents as
// nodes) and overlays live Agent Factory run progress on top of it.
//
// This file is wiring only. The interesting logic lives in siblings:
//   manifest.mjs  - input schema + semantic validation of the graph manifest
//   projection.mjs - pure (manifest, runDetail) -> view model
//   renderer.mjs   - the iframe HTML/CSS/JS
//
// Design notes:
//   * `factory.run_updated` is an invalidation signal only -- it carries just
//     { runId, revision } and no run data -- so every notification is followed
//     by a `getRunDetail` read. Those reads are coalesced (100ms) and limited
//     to one in flight at a time so a chatty run cannot flood the RPC channel.
//   * Attach state is persisted under the *factory name*, never the
//     instanceId. instanceId names a panel, not the data; a reopened panel with
//     a fresh id must still find the run it was watching.
//   * Never console.log -- stdout is the JSON-RPC channel. Use session.log.

import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

import { MANIFEST_INPUT_SCHEMA, normalizeManifest, EMPTY_MANIFEST } from "./manifest.mjs";
import { projectRun } from "./projection.mjs";
import { renderHtml } from "./renderer.mjs";

const COALESCE_MS = 100;
const SAFETY_REFRESH_MS = 5000;
/** Consecutive "run not found" reads tolerated before the safety poll gives up. */
const MAX_MISSED_LOOKUPS = 3;
const MAX_NODES = 250;

/** instanceId -> instance record. Panels are ephemeral; this map may be so too. */
const instances = new Map();

let session;

// ---------------------------------------------------------------------------
// Durable attach state (keyed by factory name, not instanceId)
// ---------------------------------------------------------------------------

function stateFile() {
    const home = process.env.COPILOT_HOME || join(homedir(), ".copilot");
    const sid = session?.sessionId || "unknown-session";
    return join(home, "extensions", "workflow-factory-canvas", "artifacts", sid, "runs.json");
}

async function readAttachState() {
    try {
        return JSON.parse(await readFile(stateFile(), "utf8"));
    } catch {
        return {};
    }
}

async function writeAttachState(factoryName, runId) {
    if (!factoryName) return;
    try {
        const path = stateFile();
        await mkdir(dirname(path), { recursive: true });
        const state = await readAttachState();
        if (runId) state[factoryName] = { runId, updatedAt: new Date().toISOString() };
        else delete state[factoryName];
        await writeFile(path, JSON.stringify(state, null, 2), "utf8");
    } catch (err) {
        log("Could not persist attach state: " + describe(err), "warning");
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describe(err) {
    if (!err) return "unknown error";
    if (typeof err === "string") return err;
    return err.message || String(err);
}

function log(message, level = "info") {
    try {
        session?.log(message, { level, ephemeral: true });
    } catch {
        // Logging must never take the extension down.
    }
}

function instanceOrThrow(instanceId) {
    const entry = instances.get(instanceId);
    if (!entry) throw new CanvasError("canvas_instance_unknown", `No open canvas instance ${instanceId}.`);
    return entry;
}

function recompute(entry) {
    entry.view = projectRun(entry.manifest, entry.detail, {
        maxNodes: MAX_NODES,
        errors: entry.errors,
        warnings: entry.warnings,
        runError: entry.runError,
    });
    return entry.view;
}

function broadcast(entry) {
    const frame = "event: state\ndata: " + JSON.stringify(entry.view) + "\n\n";
    for (const res of entry.clients) {
        try {
            res.write(frame);
        } catch {
            entry.clients.delete(res);
        }
    }
}

// ---------------------------------------------------------------------------
// Run refresh: coalesced, single-flight
// ---------------------------------------------------------------------------

async function refreshNow(entry) {
    if (!entry.runId) {
        entry.detail = null;
        entry.runError = null;
        recompute(entry);
        broadcast(entry);
        return;
    }
    if (entry.inFlight) {
        entry.repeat = true;
        return;
    }
    entry.inFlight = true;
    try {
        const detail = await session.factory.getRunDetail(entry.runId);
        entry.detail = detail ?? null;
        entry.runError = detail ? null : `Run ${entry.runId} was not found.`;
        // Count only confirmed misses. A thrown read (the catch below) is a
        // transient failure and stays retryable.
        entry.misses = detail ? 0 : (entry.misses ?? 0) + 1;
    } catch (err) {
        // A failed read must not blank the graph -- keep the last good detail
        // and surface the failure in the panel instead.
        entry.runError = describe(err);
    } finally {
        entry.inFlight = false;
    }
    recompute(entry);
    broadcast(entry);
    scheduleSafety(entry);

    if (entry.repeat) {
        entry.repeat = false;
        schedule(entry);
    }
}

function schedule(entry) {
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
        entry.timer = null;
        void refreshNow(entry);
    }, COALESCE_MS);
    if (typeof entry.timer.unref === "function") entry.timer.unref();
}

/**
 * Safety net: `factory.run_updated` is the primary trigger, but a dropped or
 * missed notification would otherwise freeze the panel mid-run. Poll slowly
 * while the run is live and stop once it reaches a terminal state.
 */
function scheduleSafety(entry) {
    if (entry.safety) {
        clearTimeout(entry.safety);
        entry.safety = null;
    }
    const status = entry.detail?.status;
    // Wire statuses are: pending | running | completed | halted | cancelled | error.
    // A null status means no detail has been read yet. Poll a few rounds for a
    // run that is still materializing, then stop -- otherwise a runId that will
    // never resolve polls every 5s for the life of the panel. If it does show up
    // later, `factory.run_updated` still schedules a refresh.
    const live =
        entry.runId &&
        (status === "running" ||
            status === "pending" ||
            (status == null && (entry.misses ?? 0) < MAX_MISSED_LOOKUPS));
    if (!live) return;
    entry.safety = setTimeout(() => {
        entry.safety = null;
        void refreshNow(entry);
    }, SAFETY_REFRESH_MS);
    if (typeof entry.safety.unref === "function") entry.safety.unref();
}

// ---------------------------------------------------------------------------
// Per-instance loopback server
// ---------------------------------------------------------------------------

async function startServer(entry) {
    const server = createServer((req, res) => {
        const path = (req.url || "/").split("?")[0];

        if (path === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            });
            res.write("retry: 2000\n\n");
            res.write("event: state\ndata: " + JSON.stringify(entry.view) + "\n\n");
            entry.clients.add(res);
            const ping = setInterval(() => {
                try {
                    res.write(": ping\n\n");
                } catch {
                    clearInterval(ping);
                }
            }, 15000);
            if (typeof ping.unref === "function") ping.unref();
            req.on("close", () => {
                clearInterval(ping);
                entry.clients.delete(res);
            });
            return;
        }

        if (path === "/state") {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            res.end(JSON.stringify(entry.view));
            return;
        }

        if (path === "/" || path === "/index.html") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
            res.end(renderHtml());
            return;
        }

        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

async function closeInstance(instanceId) {
    const entry = instances.get(instanceId);
    if (!entry) return;
    instances.delete(instanceId);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.safety) clearTimeout(entry.safety);
    for (const res of entry.clients) {
        try {
            res.end();
        } catch {
            // client already gone
        }
    }
    entry.clients.clear();
    await new Promise((resolve) => entry.server.close(() => resolve()));
}

function statusLine(entry) {
    if (!entry.runId) return entry.errors.length ? "manifest has errors" : "no run attached";
    return entry.detail?.status ? `run ${entry.detail.status}` : "attaching";
}

// ---------------------------------------------------------------------------
// Canvas declaration
// ---------------------------------------------------------------------------

const canvas = createCanvas({
    id: "workflow-factory-canvas",
    displayName: "Workflow",
    description:
        "Read-only workflow graph for an Agent Factory: phases as columns, agents as nodes, with live run progress overlaid.",
    inputSchema: MANIFEST_INPUT_SCHEMA,

    open: async (ctx) => {
        const { manifest, errors, warnings } = normalizeManifest(ctx.input?.manifest);

        let entry = instances.get(ctx.instanceId);
        if (!entry) {
            entry = {
                manifest: EMPTY_MANIFEST,
                errors: [],
                warnings: [],
                runId: null,
                detail: null,
                runError: null,
                view: null,
                clients: new Set(),
                timer: null,
                safety: null,
                inFlight: false,
                repeat: false,
                misses: 0,
            };
            // View must exist before the server can answer /state.
            entry.manifest = manifest;
            entry.errors = errors;
            entry.warnings = warnings;
            recompute(entry);
            const started = await startServer(entry);
            entry.server = started.server;
            entry.url = started.url;
            instances.set(ctx.instanceId, entry);
        } else {
            entry.manifest = manifest;
            entry.errors = errors;
            entry.warnings = warnings;
        }

        // Reattach: an explicit runId in the input wins, otherwise recover the
        // run this factory was last attached to. This is what makes reopening
        // under a new instanceId still show the right run.
        let runId = typeof ctx.input?.runId === "string" ? ctx.input.runId : null;
        if (!runId && manifest.factoryName) {
            const state = await readAttachState();
            runId = state[manifest.factoryName]?.runId ?? null;
        }
        if (runId && runId !== entry.runId) {
            entry.runId = runId;
            entry.detail = null;
            entry.runError = null;
            entry.misses = 0;
        }

        recompute(entry);
        if (entry.runId) schedule(entry);
        broadcast(entry);

        if (errors.length) {
            log(`Workflow canvas manifest has ${errors.length} problem(s); they are shown in the panel.`, "warning");
        }

        return { title: manifest.title || "Workflow", url: entry.url, status: statusLine(entry) };
    },

    actions: [
        {
            name: "attach_run",
            description: "Attach a factory run id to this canvas so live progress is overlaid on the graph.",
            inputSchema: {
                type: "object",
                additionalProperties: false,
                required: ["runId"],
                properties: { runId: { type: "string", minLength: 1, maxLength: 200 } },
            },
            handler: async (ctx) => {
                const entry = instanceOrThrow(ctx.instanceId);
                entry.runId = ctx.input.runId;
                entry.detail = null;
                entry.runError = null;
                entry.misses = 0;
                await writeAttachState(entry.manifest.factoryName, entry.runId);
                await refreshNow(entry);
                return {
                    runId: entry.runId,
                    status: entry.view.runStatus,
                    attached: entry.view.attached,
                    runError: entry.view.runError,
                };
            },
        },
        {
            name: "detach_run",
            description: "Stop overlaying run progress; the graph reverts to its not-started shape.",
            handler: async (ctx) => {
                const entry = instanceOrThrow(ctx.instanceId);
                const previous = entry.runId;
                entry.runId = null;
                entry.detail = null;
                entry.runError = null;
                entry.misses = 0;
                if (entry.safety) {
                    clearTimeout(entry.safety);
                    entry.safety = null;
                }
                await writeAttachState(entry.manifest.factoryName, null);
                recompute(entry);
                broadcast(entry);
                return { detached: previous };
            },
        },
        {
            name: "set_manifest",
            description: "Replace the workflow graph shown in this canvas without closing it.",
            inputSchema: MANIFEST_INPUT_SCHEMA,
            handler: async (ctx) => {
                const entry = instanceOrThrow(ctx.instanceId);
                const { manifest, errors, warnings } = normalizeManifest(ctx.input?.manifest);
                entry.manifest = manifest;
                entry.errors = errors;
                entry.warnings = warnings;
                if (typeof ctx.input?.runId === "string") entry.runId = ctx.input.runId;
                recompute(entry);
                broadcast(entry);
                if (entry.runId) schedule(entry);
                return { nodes: manifest.nodes.length, phases: manifest.phases.length, errors, warnings };
            },
        },
        {
            name: "get_state",
            description: "Return the current view model: node states, counts, run status and any errors.",
            handler: async (ctx) => {
                const entry = instanceOrThrow(ctx.instanceId);
                if (entry.runId) await refreshNow(entry);
                const v = entry.view;
                return {
                    title: v.title,
                    factoryName: v.factoryName,
                    runId: v.runId,
                    runStatus: v.runStatus,
                    attached: v.attached,
                    counts: v.counts,
                    unmappedCount: v.unmappedCount,
                    truncated: v.truncated,
                    liveAgentCount: v.liveAgentCount,
                    currentPhase: v.currentPhase,
                    terminal: v.terminal,
                    errors: v.errors,
                    warnings: v.warnings,
                    runError: v.runError,
                    nodes: v.nodes.map((n) => ({
                        id: n.id,
                        label: n.label,
                        phaseId: n.phaseId,
                        state: n.state,
                        agentCount: n.agentCount,
                        unmapped: n.unmapped,
                    })),
                };
            },
        },
    ],

    onClose: async (ctx) => {
        await closeInstance(ctx.instanceId);
    },
});

session = await joinSession({ canvases: [canvas] });

// Invalidation signal: carries only { runId, revision }. Fan out to any
// instance watching that run and let the coalescer do the read.
session.on("factory.run_updated", (event) => {
    const runId = event?.runId ?? event?.data?.runId;
    if (!runId) return;
    for (const entry of instances.values()) {
        if (entry.runId === runId) schedule(entry);
    }
});
