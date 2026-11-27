// ロビーの画面（netplay-lobby.js）を Node で試すための、小さな DOM の代わり
// 使うところだけを持つ：innerHTML（タグと属性と文字）、querySelector（[属性]・[属性="値"]・#id と、空白で区切った子孫）、
// closest、append・replaceChildren、textContent、hidden、addEventListener と click

const VOID_TAGS = new Set(['input', 'br', 'img', 'meta', 'link']);

export class FakeElement {
    constructor(tagName, attributes = {}) {
        this.tagName = tagName.toUpperCase();
        this.attributes = { ...attributes };
        this.childNodes = [];
        this.parentNode = null;
        this.listeners = new Map();
        this.hidden = 'hidden' in attributes;
        this.value = attributes.value ?? '';
        this.disabled = 'disabled' in attributes;
        this.type = attributes.type ?? '';
        this.dataset = Object.fromEntries(Object.entries(attributes)
            .filter(([name]) => name.startsWith('data-'))
            .map(([name, value]) => [name.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), value]));
    }

    get id() { return this.attributes.id ?? ''; }
    set id(value) { this.attributes.id = value; }
    get className() { return this.attributes.class ?? ''; }
    set className(value) { this.attributes.class = value; }

    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }

    get textContent() {
        return this.childNodes.map(node => (typeof node === 'string' ? node : node.textContent)).join('');
    }
    set textContent(text) {
        this.replaceChildren(String(text ?? ''));
    }

    set innerHTML(html) {
        this.replaceChildren(...parseHtml(html));
    }

    append(...nodes) {
        nodes.forEach(node => {
            if (node instanceof FakeElement) node.parentNode = this;
            this.childNodes.push(node);
        });
    }

    replaceChildren(...nodes) {
        this.childNodes = [];
        this.append(...nodes);
    }

    get children() {
        return this.childNodes.filter(node => node instanceof FakeElement);
    }

    descendants() {
        return this.children.flatMap(child => [child, ...child.descendants()]);
    }

    matches(selector) {
        return selector.match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|^[a-z]+/gi).every(part => {
            if (part.startsWith('#')) return this.id === part.slice(1);
            if (part.startsWith('.')) return this.className.split(/\s+/).includes(part.slice(1));
            if (part.startsWith('[')) {
                const [, name, value] = part.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
                return value === undefined ? name in this.attributes : this.attributes[name] === value;
            }
            return this.tagName === part.toUpperCase();
        });
    }

    querySelectorAll(selector) {
        const parts = selector.trim().split(/\s+/);
        const last = parts.pop();
        return this.descendants().filter(element => {
            if (!element.matches(last)) return false;
            let ancestor = element.parentNode;
            for (const part of [...parts].reverse()) {
                while (ancestor && ancestor !== this && !ancestor.matches(part)) ancestor = ancestor.parentNode;
                if (!ancestor || ancestor === this) return false;
                ancestor = ancestor.parentNode;
            }
            return true;
        });
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
    }

    closest(selector) {
        for (let element = this; element; element = element.parentNode) {
            if (element instanceof FakeElement && element.matches(selector)) return element;
        }
        return null;
    }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }

    // 押した要素から親へ順に知らせる
    dispatch(type, extra = {}) {
        const event = { type, target: this, ...extra };
        for (let element = this; element; element = element.parentNode) {
            element.listeners?.get(type)?.forEach(listener => listener(event));
        }
    }

    click() {
        this.dispatch('click');
    }

    focus() {
        globalThis.document.activeElement = this;
    }
}

function parseHtml(html) {
    const root = new FakeElement('fragment');
    let current = root;
    const pattern = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
    for (const [, closing, tag, rest, text] of html.matchAll(pattern)) {
        if (text !== undefined) {
            if (text.trim()) current.append(text.replace(/\s+/g, ' '));
            continue;
        }
        if (closing) {
            current = current.parentNode ?? root;
            continue;
        }
        const attributes = {};
        for (const [, name, value] of rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[name] = value ?? '';
        const element = new FakeElement(tag, attributes);
        current.append(element);
        if (!VOID_TAGS.has(tag.toLowerCase())) current = element;
    }
    const nodes = root.childNodes;
    nodes.forEach(node => { if (node instanceof FakeElement) node.parentNode = null; });
    return nodes;
}

// 画面に見えている文字（hidden の要素と、その中は数えない）。入力欄の値も入れる
export function visibleText(element) {
    if (element.hidden) return '';
    const own = element.tagName === 'INPUT' ? ` ${element.value} ` : '';
    return own + element.childNodes.map(node => (typeof node === 'string' ? node : visibleText(node))).join(' ');
}

// document・localStorage・location・history・navigator を差し替える。戻す関数を返す
export function installFakeDom({ href = 'http://localhost:5173/', storage = {} } = {}) {
    const saved = Object.fromEntries(['document', 'localStorage', 'location', 'history', 'navigator']
        .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const values = new Map(Object.entries(storage));
    const document = {
        head: new FakeElement('head'),
        body: new FakeElement('body'),
        activeElement: null,
        visibilityState: 'visible',
        addEventListener() {},
        createElement: (tag) => new FakeElement(tag),
        getElementById(id) {
            return [this.head, this.body].flatMap(element => element.descendants()).find(element => element.id === id) ?? null;
        }
    };
    const shared = [];
    const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    define('document', document);
    define('localStorage', {
        getItem: (key) => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key)
    });
    define('location', new URL(href));
    define('history', { state: null, replaceState: (_state, _title, url) => define('location', new URL(String(url))) });
    define('navigator', { share: async (data) => { shared.push(data); } });
    return {
        document,
        shared,
        restore() {
            Object.entries(saved).forEach(([name, descriptor]) => {
                if (descriptor) Object.defineProperty(globalThis, name, descriptor);
                else delete globalThis[name];
            });
        }
    };
}
