'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Void / self-closing HTML tags
const VOID_ELEMENTS = new Set([
  'AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT',
  'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'
]);

class ClassList {
  constructor(el) {
    this._el = el;
    this._set = new Set();
    this._syncFromAttr();
  }

  _syncFromAttr() {
    this._set.clear();
    const cls = this._el.getAttribute('class') || '';
    cls.split(/\s+/).filter(Boolean).forEach(c => this._set.add(c));
  }

  _syncToAttr() {
    this._el.setAttribute('class', Array.from(this._set).join(' '));
  }

  add(...classes) {
    for (const c of classes) {
      if (c) this._set.add(c);
    }
    this._syncToAttr();
  }

  remove(...classes) {
    for (const c of classes) {
      this._set.delete(c);
    }
    this._syncToAttr();
  }

  toggle(cls, force) {
    if (force !== undefined) {
      if (force) this.add(cls);
      else this.remove(cls);
      return force;
    }
    const has = this.contains(cls);
    if (has) this.remove(cls);
    else this.add(cls);
    return !has;
  }

  contains(cls) {
    return this._set.has(cls);
  }

  toString() {
    return Array.from(this._set).join(' ');
  }

  get length() {
    return this._set.size;
  }
}

class StyleBag {
  constructor(el) {
    this._el = el;
    this._styles = new Map();
    this._syncFromAttr();
  }

  _syncFromAttr() {
    this._styles.clear();
    const styleStr = this._el.getAttribute('style') || '';
    if (!styleStr) return;
    const rules = styleStr.split(';');
    for (const rule of rules) {
      const idx = rule.indexOf(':');
      if (idx > -1) {
        const k = rule.slice(0, idx).trim().toLowerCase();
        const v = rule.slice(idx + 1).trim();
        if (k) this._styles.set(k, v);
      }
    }
  }

  _syncToAttr() {
    const parts = [];
    for (const [k, v] of this._styles.entries()) {
      if (v) parts.push(`${k}: ${v}`);
    }
    this._el.setAttribute('style', parts.join('; '));
  }

  getPropertyValue(prop) {
    return this._styles.get(prop.toLowerCase()) || '';
  }

  setProperty(prop, val) {
    if (val === null || val === undefined || val === '') {
      this._styles.delete(prop.toLowerCase());
    } else {
      this._styles.set(prop.toLowerCase(), String(val));
    }
    this._syncToAttr();
  }

  removeProperty(prop) {
    const val = this.getPropertyValue(prop);
    this._styles.delete(prop.toLowerCase());
    this._syncToAttr();
    return val;
  }

  get display() {
    return this.getPropertyValue('display');
  }

  set display(val) {
    this.setProperty('display', val);
  }

  get cssText() {
    return this._el.getAttribute('style') || '';
  }

  set cssText(val) {
    this._el.setAttribute('style', val);
    this._syncFromAttr();
  }
}

class MockNode {
  constructor(nodeType, nodeName, ownerDocument) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    return idx > -1 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    return idx > 0 ? siblings[idx - 1] : null;
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  insertBefore(newChild, refChild) {
    if (!newChild) throw new Error('insertBefore: newChild required');
    if (newChild.nodeType === 11) { // DocumentFragment
      const fragChildren = [...newChild.childNodes];
      for (const c of fragChildren) {
        this.insertBefore(c, refChild);
      }
      return newChild;
    }
    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    newChild.parentNode = this;
    if (!refChild) {
      this.childNodes.push(newChild);
    } else {
      const idx = this.childNodes.indexOf(refChild);
      if (idx === -1) {
        this.childNodes.push(newChild);
      } else {
        this.childNodes.splice(idx, 0, newChild);
      }
    }
    return newChild;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx === -1) throw new Error('removeChild: node not a child');
    this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  replaceChild(newChild, oldChild) {
    this.insertBefore(newChild, oldChild);
    return this.removeChild(oldChild);
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }
}

class MockTextNode extends MockNode {
  constructor(text, ownerDocument) {
    super(3, '#text', ownerDocument);
    this._text = String(text !== undefined ? text : '');
  }

  get textContent() {
    return this._text;
  }

  set textContent(v) {
    this._text = String(v);
  }

  get nodeValue() {
    return this._text;
  }

  set nodeValue(v) {
    this._text = String(v);
  }
}

class MockDocumentFragment extends MockNode {
  constructor(ownerDocument) {
    super(11, '#document-fragment', ownerDocument);
  }

  get children() {
    return this.childNodes.filter(n => n.nodeType === 1);
  }
}

class MockElement extends MockNode {
  constructor(tagName, ownerDocument) {
    super(1, tagName.toUpperCase(), ownerDocument);
    this.tagName = tagName.toUpperCase();
    this._attrs = new Map();
    this._listeners = new Map();
    this.classList = new ClassList(this);
    this.style = new StyleBag(this);
    this._value = '';
    this._checked = false;
    this._disabled = false;
    this._datasetProxy = this._createDatasetProxy();
  }

  _createDatasetProxy() {
    const self = this;
    return new Proxy({}, {
      get(target, prop) {
        if (typeof prop !== 'string') return undefined;
        const attrName = 'data-' + prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        return self.getAttribute(attrName);
      },
      set(target, prop, val) {
        if (typeof prop !== 'string') return false;
        const attrName = 'data-' + prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        self.setAttribute(attrName, String(val));
        return true;
      },
      deleteProperty(target, prop) {
        if (typeof prop !== 'string') return false;
        const attrName = 'data-' + prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        self.removeAttribute(attrName);
        return true;
      }
    });
  }

  get dataset() {
    return this._datasetProxy;
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(v) {
    this.setAttribute('id', v);
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set className(v) {
    this.setAttribute('class', v);
    this.classList._syncFromAttr();
  }

  get children() {
    return this.childNodes.filter(n => n.nodeType === 1);
  }

  getAttribute(name) {
    const lower = name.toLowerCase();
    return this._attrs.has(lower) ? this._attrs.get(lower) : null;
  }

  setAttribute(name, value) {
    const lower = name.toLowerCase();
    const strVal = String(value);
    this._attrs.set(lower, strVal);
    if (lower === 'class' && this.classList) {
      this.classList._syncFromAttr();
    }
    if (lower === 'style' && this.style) {
      this.style._syncFromAttr();
    }
    if (lower === 'value') {
      this._value = strVal;
    }
  }

  removeAttribute(name) {
    const lower = name.toLowerCase();
    this._attrs.delete(lower);
    if (lower === 'class' && this.classList) {
      this.classList._syncFromAttr();
    }
    if (lower === 'style' && this.style) {
      this.style._syncFromAttr();
    }
  }

  hasAttribute(name) {
    return this._attrs.has(name.toLowerCase());
  }

  get value() {
    return this._value !== undefined ? this._value : (this.getAttribute('value') || '');
  }

  set value(v) {
    this._value = String(v);
    this.setAttribute('value', String(v));
  }

  get checked() {
    return this._checked;
  }

  set checked(v) {
    this._checked = !!v;
    if (v) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
  }

  get disabled() {
    return this._disabled || this.hasAttribute('disabled');
  }

  set disabled(v) {
    this._disabled = !!v;
    if (v) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  get textContent() {
    return this.childNodes.map(n => n.textContent).join('');
  }

  set textContent(text) {
    this.childNodes = [];
    if (text !== '' && text !== undefined && text !== null) {
      this.appendChild(new MockTextNode(text, this.ownerDocument));
    }
  }

  get innerHTML() {
    return serializeNodesToHTML(this.childNodes);
  }

  set innerHTML(html) {
    this.childNodes = [];
    if (!html) return;
    const parsedNodes = parseHTMLFragment(html, this.ownerDocument);
    for (const node of parsedNodes) {
      this.appendChild(node);
    }
  }

  get outerHTML() {
    return serializeNodeToHTML(this);
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    if (!this._listeners.has(type)) return;
    const arr = this._listeners.get(type).filter(l => l !== listener);
    this._listeners.set(type, arr);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    event.currentTarget = this;

    const listeners = this._listeners.get(event.type) || [];
    for (const fn of [...listeners]) {
      try {
        fn.call(this, event);
      } catch (e) {
        console.error(`Error in ${event.type} event listener:`, e);
      }
    }

    if (event.bubbles && !event._stopImmediate && this.parentNode && typeof this.parentNode.dispatchEvent === 'function') {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    const event = new MockEvent('click', { bubbles: true, cancelable: true });
    this.dispatchEvent(event);

    // Default action emulation
    if (!event.defaultPrevented) {
      if (this.tagName === 'INPUT' && (this.getAttribute('type') === 'checkbox' || this.type === 'checkbox')) {
        this.checked = !this.checked;
        const changeEvt = new MockEvent('change', { bubbles: true, cancelable: false });
        this.dispatchEvent(changeEvt);
      } else if (this.tagName === 'BUTTON' && (this.getAttribute('type') === 'submit' || !this.getAttribute('type'))) {
        const form = this.closest('form');
        if (form) {
          form.dispatchEvent(new MockEvent('submit', { bubbles: true, cancelable: true }));
        }
      }
    }
  }

  focus() {
    this.dispatchEvent(new MockEvent('focus', { bubbles: false, cancelable: false }));
  }

  blur() {
    this.dispatchEvent(new MockEvent('blur', { bubbles: false, cancelable: false }));
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, width: 100, height: 50, right: 100, bottom: 50 };
  }

  querySelector(selector) {
    return querySelectorInternal(this, selector);
  }

  querySelectorAll(selector) {
    return querySelectorAllInternal(this, selector);
  }

  getElementById(id) {
    return findFirst(this, n => n.nodeType === 1 && n.id === id);
  }

  getElementsByClassName(cls) {
    return findAll(this, n => n.nodeType === 1 && n.classList && n.classList.contains(cls));
  }

  getElementsByTagName(tag) {
    const upper = tag.toUpperCase();
    return findAll(this, n => n.nodeType === 1 && (upper === '*' || n.tagName === upper));
  }

  matches(selector) {
    return matchSingleSelector(this, selector);
  }

  closest(selector) {
    let curr = this;
    while (curr && curr.nodeType === 1) {
      if (curr.matches(selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }
}

class MockDocument extends MockNode {
  constructor() {
    super(9, '#document', null);
    this.ownerDocument = this;
    this.documentElement = new MockElement('html', this);
    this.head = new MockElement('head', this);
    this.body = new MockElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this._title = 'Hobby Tracker';
    this._listeners = new Map();
  }

  get title() {
    return this._title;
  }

  set title(v) {
    this._title = String(v);
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }

  createTextNode(text) {
    return new MockTextNode(text, this);
  }

  createDocumentFragment() {
    return new MockDocumentFragment(this);
  }

  getElementById(id) {
    return findFirst(this.documentElement, n => n.nodeType === 1 && n.id === id);
  }

  querySelector(selector) {
    return querySelectorInternal(this.documentElement, selector);
  }

  querySelectorAll(selector) {
    return querySelectorAllInternal(this.documentElement, selector);
  }

  getElementsByClassName(cls) {
    return findAll(this.documentElement, n => n.nodeType === 1 && n.classList && n.classList.contains(cls));
  }

  getElementsByTagName(tag) {
    const upper = tag.toUpperCase();
    return findAll(this.documentElement, n => n.nodeType === 1 && (upper === '*' || n.tagName === upper));
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    if (!this._listeners.has(type)) return;
    const arr = this._listeners.get(type).filter(l => l !== listener);
    this._listeners.set(type, arr);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    event.currentTarget = this;
    const listeners = this._listeners.get(event.type) || [];
    for (const fn of [...listeners]) {
      try {
        fn.call(this, event);
      } catch (e) {
        console.error(`Error in document ${event.type} event listener:`, e);
      }
    }
    return !event.defaultPrevented;
  }
}

class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this._stopImmediate = false;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation() {
    this._stopImmediate = true;
  }

  stopImmediatePropagation() {
    this._stopImmediate = true;
  }
}

class MockCustomEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.detail = init.detail || null;
  }
}

// Tree Traversal Helpers
function findFirst(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.childNodes) {
    const res = findFirst(child, predicate);
    if (res) return res;
  }
  return null;
}

function findAll(root, predicate, acc = []) {
  if (predicate(root)) acc.push(root);
  for (const child of root.childNodes) {
    findAll(child, predicate, acc);
  }
  return acc;
}

// Selector Matching Engine
function matchSingleSelector(el, sel) {
  if (!el || el.nodeType !== 1) return false;
  sel = sel.trim();
  if (sel === '*' || sel === '') return true;

  // Split comma
  if (sel.includes(',')) {
    const parts = sel.split(',').map(s => s.trim());
    return parts.some(p => matchSingleSelector(el, p));
  }

  // Descendant selector (space separated)
  const tokens = sel.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    // Current element must match the last token
    const lastToken = tokens[tokens.length - 1];
    if (!matchCompound(el, lastToken)) return false;

    // Check ancestors in reverse order
    let curr = el.parentNode;
    let tokenIdx = tokens.length - 2;
    while (curr && curr.nodeType === 1 && tokenIdx >= 0) {
      if (matchCompound(curr, tokens[tokenIdx])) {
        tokenIdx--;
      }
      curr = curr.parentNode;
    }
    return tokenIdx < 0;
  }

  return matchCompound(el, sel);
}

function matchCompound(el, sel) {
  if (!el || el.nodeType !== 1) return false;
  if (sel === '*') return true;

  let remaining = sel;

  // Match tag name
  const tagMatch = remaining.match(/^([a-zA-Z0-9]+)/);
  if (tagMatch) {
    if (el.tagName !== tagMatch[1].toUpperCase()) return false;
    remaining = remaining.slice(tagMatch[0].length);
  }

  // Match #id
  const idMatch = remaining.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1]) return false;
    remaining = remaining.replace(idMatch[0], '');
  }

  // Match :not(...)
  const notMatches = remaining.matchAll(/:not\(([^)]+)\)/g);
  for (const nm of notMatches) {
    const innerSel = nm[1].trim();
    if (matchCompound(el, innerSel)) return false;
  }
  remaining = remaining.replace(/:not\([^)]+\)/g, '');

  // Match .classes
  const classMatches = remaining.matchAll(/\.([a-zA-Z0-9_-]+)/g);
  for (const cm of classMatches) {
    if (!el.classList || !el.classList.contains(cm[1])) return false;
  }
  remaining = remaining.replace(/\.([a-zA-Z0-9_-]+)/g, '');

  // Match [attributes]
  const attrMatches = remaining.matchAll(/\[([a-zA-Z0-9_-]+)(?:([*^$]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g);
  for (const am of attrMatches) {
    const attrName = am[1];
    const op = am[2];
    const val = am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : am[5]);
    const attrVal = el.getAttribute(attrName);
    if (attrVal === null || attrVal === undefined) return false;
    if (op === '=' && attrVal !== val) return false;
    if (op === '*=' && !attrVal.includes(val)) return false;
    if (op === '^=' && !attrVal.startsWith(val)) return false;
    if (op === '$=' && !attrVal.endsWith(val)) return false;
  }

  return true;
}

function querySelectorInternal(root, selector) {
  const parts = selector.split(',').map(s => s.trim());
  for (const part of parts) {
    const res = findFirst(root, n => n.nodeType === 1 && n !== root && matchSingleSelector(n, part));
    if (res) return res;
  }
  return null;
}

function querySelectorAllInternal(root, selector) {
  const parts = selector.split(',').map(s => s.trim());
  const found = new Set();
  for (const part of parts) {
    const matches = findAll(root, n => n.nodeType === 1 && n !== root && matchSingleSelector(n, part));
    for (const m of matches) found.add(m);
  }
  return Array.from(found);
}

// HTML Serializer
function serializeNodesToHTML(nodes) {
  return nodes.map(serializeNodeToHTML).join('');
}

function serializeNodeToHTML(node) {
  if (node.nodeType === 3) {
    return node.textContent;
  }
  if (node.nodeType === 1) {
    const tag = node.tagName.toLowerCase();
    const attrs = [];
    for (const [k, v] of node._attrs.entries()) {
      attrs.push(`${k}="${escapeAttr(v)}"`);
    }
    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    if (VOID_ELEMENTS.has(node.tagName)) {
      return `<${tag}${attrStr}>`;
    }
    return `<${tag}${attrStr}>${serializeNodesToHTML(node.childNodes)}</${tag}>`;
  }
  return '';
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

// Lightweight HTML Parser
function parseHTMLFragment(html, doc) {
  const container = doc.createDocumentFragment();
  const stack = [container];
  let cursor = 0;
  const len = html.length;

  while (cursor < len) {
    const nextLt = html.indexOf('<', cursor);
    if (nextLt === -1) {
      const text = html.slice(cursor);
      if (text) {
        stack[stack.length - 1].appendChild(doc.createTextNode(text));
      }
      break;
    }

    if (nextLt > cursor) {
      const text = html.slice(cursor, nextLt);
      if (text) {
        stack[stack.length - 1].appendChild(doc.createTextNode(text));
      }
      cursor = nextLt;
    }

    // Comment
    if (html.startsWith('<!--', cursor)) {
      const endComment = html.indexOf('-->', cursor + 4);
      cursor = endComment === -1 ? len : endComment + 3;
      continue;
    }

    // Doctype
    if (html.startsWith('<!', cursor)) {
      const endDoctype = html.indexOf('>', cursor + 2);
      cursor = endDoctype === -1 ? len : endDoctype + 1;
      continue;
    }

    // Closing Tag
    if (html.startsWith('</', cursor)) {
      const endTag = html.indexOf('>', cursor + 2);
      if (endTag === -1) break;
      const tagName = html.slice(cursor + 2, endTag).trim().split(/\s+/)[0].toUpperCase();
      cursor = endTag + 1;

      // Pop stack up to matching tag
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === tagName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    // Opening Tag
    const endTag = html.indexOf('>', cursor + 1);
    if (endTag === -1) break;
    const tagContent = html.slice(cursor + 1, endTag);
    cursor = endTag + 1;

    const isSelfClosing = tagContent.endsWith('/');
    const cleanContent = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim();
    const firstSpace = cleanContent.search(/\s/);
    const tagName = (firstSpace === -1 ? cleanContent : cleanContent.slice(0, firstSpace)).toUpperCase();
    const attrString = firstSpace === -1 ? '' : cleanContent.slice(firstSpace).trim();

    if (!tagName) continue;

    const el = doc.createElement(tagName);
    if (attrString) {
      parseAttributes(attrString, el);
    }

    // If textarea, consume until </textarea>
    if (tagName === 'TEXTAREA') {
      const closeIdx = html.toLowerCase().indexOf('</textarea>', cursor);
      if (closeIdx !== -1) {
        const textVal = html.slice(cursor, closeIdx);
        el.value = textVal;
        el.appendChild(doc.createTextNode(textVal));
        cursor = closeIdx + 11;
        stack[stack.length - 1].appendChild(el);
        continue;
      }
    }

    stack[stack.length - 1].appendChild(el);

    if (!isSelfClosing && !VOID_ELEMENTS.has(tagName)) {
      stack.push(el);
    }
  }

  return [...container.childNodes];
}

function parseAttributes(attrStr, el) {
  const attrRegex = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = attrRegex.exec(attrStr)) !== null) {
    const name = m[1];
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    el.setAttribute(name, val);
    if (name.toLowerCase() === 'checked') el.checked = true;
    if (name.toLowerCase() === 'disabled') el.disabled = true;
    if (name.toLowerCase() === 'value') el.value = val;
  }
}

// In-Memory Fake IndexedDB
class FakeIndexedDB {
  constructor() {
    this._databases = new Map();
  }

  open(name, version = 1) {
    const request = {
      result: null,
      error: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null
    };

    queueMicrotask(() => {
      let db = this._databases.get(name);
      const isNew = !db;
      if (isNew) {
        db = new FakeIDBDatabase(name, version);
        this._databases.set(name, db);
      }
      request.result = db;

      if (isNew && typeof request.onupgradeneeded === 'function') {
        try {
          request.onupgradeneeded({ target: request });
        } catch (e) {
          request.error = e;
          if (request.onerror) request.onerror({ target: request });
          return;
        }
      }

      if (typeof request.onsuccess === 'function') {
        request.onsuccess({ target: request });
      }
    });

    return request;
  }
}

class FakeIDBDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this._stores = new Map();
    this.objectStoreNames = {
      contains: (s) => this._stores.has(s)
    };
  }

  createObjectStore(name) {
    if (!this._stores.has(name)) {
      this._stores.set(name, new Map());
    }
    return this._stores.get(name);
  }

  transaction(storeNames, mode = 'readonly') {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new FakeIDBTransaction(this, names, mode);
  }
}

class FakeIDBTransaction {
  constructor(db, storeNames, mode) {
    this.db = db;
    this.storeNames = storeNames;
    this.mode = mode;
  }

  objectStore(name) {
    const storeMap = this.db._stores.get(name) || new Map();
    return new FakeIDBObjectStore(storeMap);
  }
}

class FakeIDBObjectStore {
  constructor(storeMap) {
    this._map = storeMap;
  }

  get(key) {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      const val = this._map.get(key);
      req.result = val !== undefined ? structuredClone(val) : undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  put(val, key) {
    const req = { result: key, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      this._map.set(key, structuredClone(val));
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  delete(key) {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      this._map.delete(key);
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  clear() {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      this._map.clear();
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  getAll() {
    const req = { result: [], error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      req.result = Array.from(this._map.values()).map(v => structuredClone(v));
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  count() {
    const req = { result: 0, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      req.result = this._map.size;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
}

// In-Memory Storage
class MemoryStorage {
  constructor() {
    this._map = new Map();
  }

  getItem(k) {
    return this._map.has(k) ? this._map.get(k) : null;
  }

  setItem(k, v) {
    this._map.set(k, String(v));
  }

  removeItem(k) {
    this._map.delete(k);
  }

  clear() {
    this._map.clear();
  }

  key(index) {
    return Array.from(this._map.keys())[index] || null;
  }

  get length() {
    return this._map.size;
  }
}

// Environment factory
async function bootApp(options = {}) {
  const rootDir = path.resolve(__dirname, '..', '..');
  const htmlPath = path.join(rootDir, 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const doc = new MockDocument();
  // Parse body content of index.html into doc.body
  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const rawBody = bodyMatch ? bodyMatch[1] : htmlContent;
  const nodes = parseHTMLFragment(rawBody, doc);
  for (const n of nodes) {
    doc.body.appendChild(n);
  }

  // Active timers tracking and unref
  const activeTimers = new Set();
  const trackedSetTimeout = (fn, ms = 0, ...args) => {
    const t = setTimeout(fn, ms, ...args);
    if (t && typeof t.unref === 'function') t.unref();
    activeTimers.add(t);
    return t;
  };
  const trackedClearTimeout = (t) => {
    activeTimers.delete(t);
    clearTimeout(t);
  };
  const trackedSetInterval = (fn, ms = 0, ...args) => {
    const t = setInterval(fn, ms, ...args);
    if (t && typeof t.unref === 'function') t.unref();
    activeTimers.add(t);
    return t;
  };
  const trackedClearInterval = (t) => {
    activeTimers.delete(t);
    clearInterval(t);
  };

  // Spies
  const spies = {
    alerts: [],
    confirms: [],
    prompts: [],
    fetches: [],
    confirmResult: true,
    promptResult: ''
  };

  // System frozen time
  let systemFrozenTime = options.systemDate ? new Date(options.systemDate).getTime() : null;
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0 && systemFrozenTime !== null) {
        super(systemFrozenTime);
      } else {
        super(...args);
      }
    }
    static now() {
      return systemFrozenTime !== null ? systemFrozenTime : RealDate.now();
    }
  }

  // Window object
  const win = {
    document: doc,
    navigator: {
      onLine: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HobbyTrackerTest',
      serviceWorker: {
        register: async () => ({ scope: '/' }),
        addEventListener: () => {}
      }
    },
    location: {
      href: 'http://localhost/',
      pathname: '/',
      search: '',
      hash: '',
      reload: () => {}
    },
    sessionStorage: new MemoryStorage(),
    localStorage: new MemoryStorage(),
    indexedDB: new FakeIndexedDB(),
    crypto: globalThis.crypto,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    structuredClone: globalThis.structuredClone,
    EventTarget: globalThis.EventTarget,
    Event: MockEvent,
    CustomEvent: MockCustomEvent,
    MouseEvent: MockEvent,
    KeyboardEvent: MockEvent,
    Date: MockDate,
    setTimeout: trackedSetTimeout,
    clearTimeout: trackedClearTimeout,
    setInterval: trackedSetInterval,
    clearInterval: trackedClearInterval,
    alert: (msg) => spies.alerts.push(String(msg)),
    confirm: (msg) => { spies.confirms.push(String(msg)); return spies.confirmResult; },
    prompt: (msg) => { spies.prompts.push(String(msg)); return spies.promptResult; },
    fetch: async (url, opts = {}) => {
      spies.fetches.push({ url, options: opts });
      if (typeof options.fetchHandler === 'function') {
        return options.fetchHandler(url, opts);
      }
      const isList = String(url).includes('/gists?');
      const gistObj = {
        id: 'mock_gist_id',
        updated_at: new Date().toISOString(),
        files: {
          'hobby_tracker_vault.json.enc': {
            content: JSON.stringify({
              version: 1,
              salt: 'mock_salt',
              iv: 'mock_iv',
              ciphertext: 'mock_cipher',
              encryptedAt: new Date().toISOString()
            })
          }
        }
      };
      return {
        ok: true,
        status: 200,
        json: async () => isList ? [gistObj] : gistObj,
        text: async () => 'OK'
      };
    },
    addEventListener: (type, fn) => doc.addEventListener(type, fn),
    removeEventListener: (type, fn) => doc.removeEventListener(type, fn),
    dispatchEvent: (e) => doc.dispatchEvent(e),
    console: console
  };

  win.window = win;
  win.self = win;
  win.globalThis = win;

  const vmContext = vm.createContext(win);

  // Load client scripts in order
  const scripts = [
    'js/crypto.js',
    'js/storage.js',
    'js/sync.js',
    'js/api.js',
    'js/auth.js',
    'js/views.js',
    'js/app.js'
  ];

  for (const scriptRel of scripts) {
    const fullPath = path.join(rootDir, scriptRel);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, vmContext, { filename: scriptRel });
  }

  // Ensure globals are reachable
  vm.runInContext(`
    window.CryptoUtils = typeof CryptoUtils !== 'undefined' ? CryptoUtils : null;
    window.Storage = typeof Storage !== 'undefined' ? Storage : null;
    window.Sync = typeof Sync !== 'undefined' ? Sync : null;
    window.API = typeof API !== 'undefined' ? API : null;
    window.Auth = typeof Auth !== 'undefined' ? Auth : null;
    window.Views = typeof Views !== 'undefined' ? Views : null;
    window.App = typeof App !== 'undefined' ? App : null;
  `, vmContext);

  // Wait a microtask cycle for initial Storage.init() & Auth.init() to settle
  await new Promise(r => setTimeout(r, 25));

  // High-level UI action helpers
  const env = {
    window: win,
    document: doc,
    spies,
    activeTimers,
    CryptoUtils: win.CryptoUtils,
    Storage: win.Storage,
    Sync: win.Sync,
    API: win.API,
    Auth: win.Auth,
    Views: win.Views,
    App: win.App,

    setSystemDate(dateStr) {
      systemFrozenTime = new Date(dateStr).getTime();
    },

    resetSystemDate() {
      systemFrozenTime = null;
    },

    click(selectorOrEl) {
      const el = typeof selectorOrEl === 'string' ? doc.querySelector(selectorOrEl) : selectorOrEl;
      if (!el) throw new Error(`click: element "${selectorOrEl}" not found`);
      el.click();
    },

    async type(selectorOrEl, text) {
      const el = typeof selectorOrEl === 'string' ? doc.querySelector(selectorOrEl) : selectorOrEl;
      if (!el) throw new Error(`type: element "${selectorOrEl}" not found`);
      el.value = text;
      el.dispatchEvent(new MockEvent('input', { bubbles: true, cancelable: false }));
      el.dispatchEvent(new MockEvent('change', { bubbles: true, cancelable: false }));
    },

    submit(selectorOrEl) {
      const el = typeof selectorOrEl === 'string' ? doc.querySelector(selectorOrEl) : selectorOrEl;
      if (!el) throw new Error(`submit: element "${selectorOrEl}" not found`);
      el.dispatchEvent(new MockEvent('submit', { bubbles: true, cancelable: true }));
    },

    async unlockVault(masterPassword = 'TestPassword123!', pin = null) {
      const auth = await win.Storage.getKV('auth');
      const isConfigured = !!(auth && auth.masterHash);

      if (!isConfigured) {
        // App is unconfigured: perform setup
        const pwdInput = doc.getElementById('password');
        const confirmInput = doc.getElementById('confirm-password');
        const pinInput = doc.getElementById('setup-pin');
        if (pwdInput) pwdInput.value = masterPassword;
        if (confirmInput) confirmInput.value = masterPassword;
        if (pin && pinInput) pinInput.value = pin;
        const form = doc.getElementById('login-form');
        if (form) form.dispatchEvent(new MockEvent('submit', { bubbles: true, cancelable: true }));
      } else {
        // App is configured: login
        const pwdInput = doc.getElementById('password');
        if (pwdInput) pwdInput.value = masterPassword;
        const form = doc.getElementById('login-form');
        if (form) form.dispatchEvent(new MockEvent('submit', { bubbles: true, cancelable: true }));
      }

      for (let i = 0; i < 30; i++) {
        if (win.Storage && win.Storage.isUnlocked()) break;
        await new Promise(r => setTimeout(r, 10));
      }
    },

    switchView(viewName) {
      if (win.App && typeof win.App.switchView === 'function') {
        win.App.switchView(viewName);
      } else {
        const navBtn = doc.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (navBtn) navBtn.click();
      }
    },

    async selectDiaryDate(dateStr) {
      win.Views.currentDiaryDate = dateStr;
      const dateInput = doc.getElementById('diary-date');
      if (dateInput) {
        dateInput.value = dateStr;
      }
      if (win.Views && typeof win.Views.renderDiary === 'function') {
        await win.Views.renderDiary();
      }
    },

    teardown() {
      for (const t of activeTimers) {
        trackedClearTimeout(t);
        trackedClearInterval(t);
      }
      activeTimers.clear();
      if (win.Sync && win.Sync.autoSyncTimer) {
        trackedClearInterval(win.Sync.autoSyncTimer);
      }
    }
  };

  return env;
}

module.exports = {
  bootApp,
  createTestEnv: bootApp,
  MockDocument,
  MockElement,
  MockTextNode,
  MockEvent,
  ClassList,
  StyleBag,
  FakeIndexedDB,
  MemoryStorage
};
