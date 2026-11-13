'use strict';

const assert = require('node:assert/strict');

function resolveElement(docOrEl, selector) {
  if (!selector) {
    return docOrEl;
  }
  if (typeof selector === 'string') {
    if (!docOrEl || typeof docOrEl.querySelector !== 'function') {
      throw new Error(`Cannot query selector "${selector}" on non-DOM object`);
    }
    return docOrEl.querySelector(selector);
  }
  return selector;
}

const customAssert = {
  ...assert,

  domExists(doc, selector, msg) {
    const el = resolveElement(doc, selector);
    assert.ok(el, msg || `Expected element matching "${selector}" to exist in DOM`);
    return el;
  },

  domMissing(doc, selector, msg) {
    const el = resolveElement(doc, selector);
    assert.strictEqual(el, null, msg || `Expected element matching "${selector}" to NOT exist in DOM`);
  },

  domVisible(doc, selector, msg) {
    const el = resolveElement(doc, selector);
    assert.ok(el, `Element "${selector}" does not exist`);
    const display = (el.style && el.style.display) || '';
    assert.notStrictEqual(display.toLowerCase(), 'none', msg || `Expected element "${selector}" to be visible`);
    return el;
  },

  domHidden(doc, selector, msg) {
    const el = resolveElement(doc, selector);
    assert.ok(el, `Element "${selector}" does not exist`);
    const display = (el.style && el.style.display) || '';
    assert.strictEqual(display.toLowerCase(), 'none', msg || `Expected element "${selector}" to be hidden (display: none)`);
    return el;
  },

  domText(doc, selector, expected, msg) {
    const el = resolveElement(doc, selector);
    assert.ok(el, `Element "${selector}" not found`);
    const actual = (el.textContent || '').trim();
    assert.strictEqual(actual, String(expected).trim(), msg);
    return el;
  },

  domContains(doc, selector, substr, msg) {
    const el = resolveElement(doc, selector);
    assert.ok(el, `Element "${selector}" not found`);
    const text = el.textContent || '';
    assert.ok(text.includes(substr), msg || `Expected "${selector}" text to contain "${substr}", got "${text}"`);
    return el;
  },

  domHasClass(doc, selector, className, msg) {
    const el = resolveElement(doc, selector);
    assert.ok(el, `Element "${selector}" not found`);
    assert.ok(el.classList && el.classList.contains(className), msg || `Expected element to have class "${className}"`);
    return el;
  },

  domNotHasClass(doc, selector, className, msg) {
    const el = resolveElement(doc, selector);
    assert.ok(el, `Element "${selector}" not found`);
    assert.ok(!el.classList || !el.classList.contains(className), msg || `Expected element to NOT have class "${className}"`);
    return el;
  },

  domValue(doc, selector, expected, msg) {
    const el = resolveElement(doc, selector);
    assert.ok(el, `Element "${selector}" not found`);
    assert.strictEqual(el.value, expected, msg);
    return el;
  },

  domAttr(doc, selector, attr, expected, msg) {
    const el = resolveElement(doc, selector);
    assert.ok(el, `Element "${selector}" not found`);
    const val = typeof el.getAttribute === 'function' ? el.getAttribute(attr) : el[attr];
    assert.strictEqual(val, expected, msg || `Expected attribute "${attr}" to equal "${expected}"`);
    return el;
  },

  singleAlert(spies, expectedText) {
    assert.ok(spies && Array.isArray(spies.alerts), 'Spies object must contain alerts array');
    assert.strictEqual(
      spies.alerts.length,
      1,
      `Expected exactly 1 alert, but got ${spies.alerts.length}: [${spies.alerts.join(', ')}]`
    );
    if (expectedText) {
      assert.ok(
        spies.alerts[0].includes(expectedText),
        `Alert text "${spies.alerts[0]}" does not match expected "${expectedText}"`
      );
    }
  },

  jsonEqual(actual, expected, msg) {
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(actual)),
      JSON.parse(JSON.stringify(expected)),
      msg
    );
  }
};

module.exports = customAssert;
