// Minimal DOM shim, just enough to execute the canvas client script in Node.
// Not a browser: it only implements what renderer.mjs's CLIENT_JS touches, so
// that layout math and DOM construction get real execution coverage.

class ClassList {
    constructor(node) {
        this.node = node;
    }
    _list() {
        return (this.node.className || "").split(/\s+/).filter(Boolean);
    }
    add(c) {
        const l = this._list();
        if (!l.includes(c)) l.push(c);
        this.node.className = l.join(" ");
    }
    remove(c) {
        this.node.className = this._list().filter((x) => x !== c).join(" ");
    }
    toggle(c) {
        if (this._list().includes(c)) this.remove(c);
        else this.add(c);
        return this._list().includes(c);
    }
    contains(c) {
        return this._list().includes(c);
    }
}

class Node {
    constructor(tag, ns) {
        this.tagName = String(tag).toUpperCase();
        this.namespaceURI = ns || null;
        this.children = [];
        this.attributes = {};
        this.style = {};
        this.className = "";
        this._text = "";
        this._listeners = {};
        this.classList = new ClassList(this);
        this.scrollTop = 0;
        this.scrollHeight = 0;
        this.clientHeight = 0;
    }
    appendChild(c) {
        this.children.push(c);
        c.parentNode = this;
        return c;
    }
    replaceChildren(...c) {
        this.children = [];
        for (const x of c) this.appendChild(x);
    }
    setAttribute(k, v) {
        this.attributes[k] = String(v);
        if (k === "class") this.className = String(v);
    }
    getAttribute(k) {
        return this.attributes[k] ?? null;
    }
    addEventListener(t, fn) {
        (this._listeners[t] ||= []).push(fn);
    }
    dispatch(t, ev) {
        for (const fn of this._listeners[t] ?? []) fn(ev);
    }
    get textContent() {
        if (this.children.length) return this.children.map((c) => c.textContent).join("");
        return this._text;
    }
    set textContent(v) {
        this.children = [];
        this._text = v == null ? "" : String(v);
    }
    // Depth-first walk, used by assertions.
    walk(fn) {
        fn(this);
        for (const c of this.children) if (c.walk) c.walk(fn);
    }
    countByClass(c) {
        let n = 0;
        this.walk((x) => {
            if (x.classList && x.classList.contains(c)) n++;
        });
        return n;
    }
}

class TextNode {
    constructor(t) {
        this._text = String(t ?? "");
        this.children = [];
    }
    get textContent() {
        return this._text;
    }
    walk(fn) {
        fn(this);
    }
}

export function makeDom() {
    const byId = new Map();
    const doc = {
        title: "",
        createElement: (t) => new Node(t),
        createElementNS: (ns, t) => new Node(t, ns),
        createTextNode: (t) => new TextNode(t),
        getElementById: (id) => {
            if (!byId.has(id)) {
                const n = new Node("div");
                n.id = id;
                byId.set(id, n);
            }
            return byId.get(id);
        },
    };
    const listeners = [];
    class EventSource {
        constructor(url) {
            this.url = url;
            EventSource.instances.push(this);
        }
        addEventListener(t, fn) {
            listeners.push({ t, fn });
        }
    }
    EventSource.instances = [];
    const fetches = [];
    const fetchImpl = (url) => {
        fetches.push(url);
        // Never resolves: the client's initial fetch must not be required for
        // render() itself to be exercised.
        return new Promise(() => {});
    };
    return { doc, EventSource, listeners, fetches, fetchImpl, byId, Node };
}

/**
 * Execute the canvas client script against the shim and return a `render`
 * function plus the shim handles.
 *
 * The compiled function is cached per source string, because compiling the
 * whole client script is the one cost here that scales with the size of the
 * fixture corpus. Only the *function* is shared -- every call still gets a
 * fresh DOM, and the DOM is what carries per-test state, so isolation between
 * callers is unaffected.
 */
const compiledClients = new Map();

export function runClient(clientJs) {
    const dom = makeDom();
    let fn = compiledClients.get(clientJs);
    if (!fn) {
        fn = new Function("document", "EventSource", "fetch", "window", clientJs + "\n;return { render: render, layout: typeof renderGraph === 'function' ? renderGraph : null };");
        compiledClients.set(clientJs, fn);
    }
    const api = fn(dom.doc, dom.EventSource, dom.fetchImpl, {});
    return { ...dom, ...api };
}
