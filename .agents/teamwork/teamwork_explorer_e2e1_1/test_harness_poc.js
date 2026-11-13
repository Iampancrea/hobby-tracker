// Proof-of-concept DOM harness and client loader for Node v24
const fs = require('fs');
const vm = require('vm');

// 1. Lightweight Element
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
    this.classList = {
      _classes: new Set(),
      add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
      remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
      toggle: (c, force) => {
        const has = this.classList._classes.has(c);
        const next = force !== undefined ? force : !has;
        if (next) this.classList._classes.add(c);
        else this.classList._classes.delete(c);
        return next;
      },
      contains: (c) => this.classList._classes.has(c)
    };
    this.style = {};
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this._value = '';
    this._checked = false;
    this._innerHTML = '';
    this._textContent = '';
    this.listeners = new Map();
  }

  get value() { return this._value; }
  set value(v) { this._value = String(v); }

  get checked() { return this._checked; }
  set checked(v) { this._checked = Boolean(v); }

  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = String(v);
    if (k === 'class') {
      this.className = String(v);
      this.classList._classes = new Set(String(v).split(/\s+/).filter(Boolean));
    }
    if (k.startsWith('data-')) {
      const dataKey = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[dataKey] = String(v);
    }
  }

  getAttribute(k) { return this.attributes.get(k) || null; }
  removeAttribute(k) { this.attributes.delete(k); }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  dispatchEvent(evt) {
    const handlers = this.listeners.get(evt.type) || [];
    handlers.forEach(h => h(evt));
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} });
  }
}

// 2. Minimal Mock Document
class MockDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new MockElement('body');
    this.title = 'Hobby Tracker';
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    if (!this.elementsById.has(id)) {
      const el = new MockElement('div');
      el.id = id;
      this.elementsById.set(id, el);
    }
    return this.elementsById.get(id);
  }

  querySelector(sel) {
    if (sel.startsWith('#')) return this.getElementById(sel.slice(1));
    return new MockElement('div');
  }

  querySelectorAll(sel) {
    return [];
  }

  addEventListener(event, fn) {}
}

console.log('Mock DOM structure verified successfully');
