'use strict';

/**
 * Empirical Challenge & Stress Harness for Milestone 2
 * Challenger 2: Alert Spam, Bizarre Colors, Note Categorization Stress & Dual Directory Parity
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert');
const { bootApp } = require('./helpers/env');

async function runChallenger2Suite() {
  console.log('======================================================================');
  console.log('  MILESTONE 2: CHALLENGER 2 EMPIRICAL STRESS & ADVERSARIAL HARNESS');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;
  const failureDetails = [];

  function recordPass(testName) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  }

  function recordFail(testName, err) {
    failed++;
    console.error(`  [FAIL] ${testName}`);
    console.error(`         ${err.stack || err.message || err}`);
    failureDetails.push({ testName, error: err });
  }

  // -------------------------------------------------------------------------
  // 1. ALERT SPAM STRESS TEST
  // -------------------------------------------------------------------------
  console.log('--- 1. Alert Spam: 10+ Lock/Unlock Cycles & Invalid Save ---');
  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');

    // Simulate 12 successive lock/unlock cycles in memory
    for (let cycle = 1; cycle <= 12; cycle++) {
      env.click('#lock-btn');
      await new Promise(r => setTimeout(r, 10));
      await env.unlockVault('TestPassword123!');
    }

    env.switchView('habits');
    env.Views.openHabitModal();

    // Trigger invalid habit save (empty name)
    const nameInput = env.document.getElementById('habit-name');
    nameInput.value = '';

    env.spies.alerts = [];
    env.click('#save-habit-btn');
    await new Promise(r => setTimeout(r, 15));

    assert.strictEqual(
      env.spies.alerts.length,
      1,
      `Alert must fire exactly once after 12 lock/unlock cycles, but fired ${env.spies.alerts.length} times: [${env.spies.alerts.join(', ')}]`
    );
    assert.ok(
      env.spies.alerts[0].includes('habit name'),
      `Alert message must prompt for habit name, got: "${env.spies.alerts[0]}"`
    );

    // Also test rapid repeated clicks on save with empty name
    env.spies.alerts = [];
    for (let c = 0; c < 5; c++) {
      env.click('#save-habit-btn');
    }
    assert.strictEqual(
      env.spies.alerts.length,
      5,
      `5 consecutive clicks on save button must yield 5 distinct alerts, got ${env.spies.alerts.length}`
    );

    // Ensure state remains clean with 0 blank habits
    const state = await env.Storage.getRawState();
    const blanks = (state.habits || []).filter(h => !h.name || !h.name.trim());
    assert.strictEqual(blanks.length, 0, 'No blank habits must be saved in state');

    env.teardown();
    recordPass('1. Alert Spam: 12 lock/unlock cycles yielded exactly 1 alert on invalid save, 0 blank habits');
  } catch (err) {
    recordFail('1. Alert Spam Stress Test', err);
  }

  // -------------------------------------------------------------------------
  // 2. HABIT COLOR PICKER: BIZARRE VALUES, CLEAN FALLBACK & INLINE STYLING
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Habit Color Picker: Bizarre Values & Inline Styling ---');
  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const bizarreInputs = [
      // [input, expectedColor, description]
      ['rgb(255, 0, 0)', '#3fa34d', 'RGB string fallback'],
      ['rgba(0, 128, 255, 0.5)', '#3fa34d', 'RGBA string fallback'],
      ['red', '#3fa34d', 'Named color "red" fallback'],
      ['cornflowerblue', '#3fa34d', 'Named color "cornflowerblue" fallback'],
      ['transparent', '#3fa34d', 'CSS keyword "transparent" fallback'],
      ['#ff0000; background: url(x);', '#3fa34d', 'CSS injection attempt fallback'],
      ['#123456"><script>alert(1)</script>', '#3fa34d', 'XSS payload fallback'],
      ['javascript:alert(1)', '#3fa34d', 'JavaScript pseudo-protocol fallback'],
      ['#12', '#3fa34d', '2-digit hex fallback'],
      ['#1234', '#3fa34d', '4-digit hex fallback'],
      ['#1234567', '#3fa34d', '7-digit hex fallback'],
      ['ff0000', '#3fa34d', 'Missing # prefix fallback'],
      [null, '#3fa34d', 'null fallback'],
      [undefined, '#3fa34d', 'undefined fallback'],
      [123456, '#3fa34d', 'integer fallback'],
      [true, '#3fa34d', 'boolean fallback'],
      [{}, '#3fa34d', 'object fallback'],
      ['#f06', '#ff0066', '3-digit hex #f06 expansion to 6-digit #ff0066'],
      ['#ABC', '#AABBCC', '3-digit hex uppercase expansion to #AABBCC'],
      ['#123', '#112233', '3-digit hex numeric expansion to #112233'],
      ['  #ff5722  ', '#ff5722', 'Trim whitespace from valid 6-digit hex'],
      ['#2196f3', '#2196f3', 'Standard valid 6-digit hex #2196f3']
    ];

    for (const [input, expected, desc] of bizarreInputs) {
      const sanitized = env.Storage._sanitizeColor(input);
      assert.strictEqual(
        sanitized,
        expected,
        `_sanitizeColor failed on [${desc}]: input ${JSON.stringify(input)} produced ${sanitized}, expected ${expected}`
      );
    }

    // Verify inline styling on icon and completed cell for custom color #ff5722
    const habitCustom = await env.Storage.createHabit({
      name: 'Custom Styling Habit',
      icon: '🎨',
      color: '#ff5722'
    });
    const todayStr = '2026-11-13';

    // Mark today as done
    await env.Storage.updateCell(habitCustom.id, todayStr, { status: 'done' });
    await env.Views.renderHabits();

    const row = env.document.querySelector(`tr[data-habit-row="${habitCustom.id}"]`);
    assert.ok(row, 'Habit row must exist in DOM');

    const iconEl = row.querySelector('.habit-icon');
    assert.ok(iconEl, 'Habit icon element must exist');
    const iconStyle = iconEl.getAttribute('style') || '';
    assert.ok(
      iconStyle.toLowerCase().includes('color: #ff5722'),
      `Habit icon must have inline style "color: #ff5722", got: "${iconStyle}"`
    );

    const cellEl = row.querySelector(`.day-cell[data-date="${todayStr}"]`);
    assert.ok(cellEl, 'Today cell must exist');
    const doneStatus = cellEl.querySelector('.cell-status.done');
    assert.ok(doneStatus, '.cell-status.done element must exist');
    const cellStyle = doneStatus.getAttribute('style') || '';
    assert.ok(
      cellStyle.toLowerCase().includes('background-color: #ff5722') && cellStyle.toLowerCase().includes('border-color: #ff5722'),
      `Done cell must have inline background and border color #ff5722, got: "${cellStyle}"`
    );

    // Verify fallback inline styling when habit has bizarre color (e.g. 'invalid-color')
    const habitFallback = await env.Storage.createHabit({
      name: 'Fallback Styling Habit',
      icon: '🌿',
      color: 'invalid-color'
    });
    assert.strictEqual(habitFallback.color, '#3fa34d', 'Invalid color must fall back to default #3fa34d');
    await env.Storage.updateCell(habitFallback.id, todayStr, { status: 'done' });
    await env.Views.renderHabits();

    const fallbackRow = env.document.querySelector(`tr[data-habit-row="${habitFallback.id}"]`);
    const fallbackIcon = fallbackRow.querySelector('.habit-icon');
    const fallbackDone = fallbackRow.querySelector(`.day-cell[data-date="${todayStr}"] .cell-status.done`);

    assert.ok(
      (fallbackIcon.getAttribute('style') || '').toLowerCase().includes('color: #3fa34d'),
      'Fallback icon must receive style color #3fa34d'
    );
    assert.ok(
      (fallbackDone.getAttribute('style') || '').toLowerCase().includes('background-color: #3fa34d'),
      'Fallback completed cell must receive style background-color #3fa34d'
    );

    env.teardown();
    recordPass(`2. Habit Color Picker: Tested ${bizarreInputs.length} bizarre inputs, verified fallback & inline styling`);
  } catch (err) {
    recordFail('2. Habit Color Picker & Inline Styling', err);
  }

  // -------------------------------------------------------------------------
  // 3. CATEGORIZED CELL NOTES: HUNDREDS OF NOTES, LINKAGE & RAPID SWITCHING
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Categorized Cell Notes: Hundreds of Notes, Linkage & Lifecycle ---');
  try {
    const env = await bootApp({ systemDate: '2026-11-13' });
    await env.unlockVault('TestPassword123!');
    env.switchView('habits');

    const dates = env.Views.getDatesAround(0, 28, 1);
    assert.strictEqual(dates.length, 30, 'Date window must return 30 dates');

    // Create 10 habits
    const habits = [];
    for (let h = 0; h < 10; h++) {
      habits.push(await env.Storage.createHabit({
        name: `Stress Habit ${h}`,
        icon: '⭐',
        color: '#9c27b0'
      }));
    }

    const categories = ['default', 'love', 'discipline'];
    const createdNotes = [];

    // Create 300 notes across 10 habits x 30 dates
    for (let h = 0; h < 10; h++) {
      for (let d = 0; d < 30; d++) {
        const cat = categories[(h + d) % 3];
        const note = await env.Storage.createNote({
          habitId: habits[h].id,
          date: dates[d],
          type: cat,
          text: `Note for habit ${h} on ${dates[d]} in category ${cat}`
        });
        createdNotes.push({ note, habitId: habits[h].id, date: dates[d], type: cat });
      }
    }
    assert.strictEqual(createdNotes.length, 300, '300 notes must be created');

    // Verify cell.noteId linkage for all 300 notes in state.cells
    const rawState = await env.Storage.getRawState();
    assert.strictEqual(rawState.notes.length, 300, 'state.notes must hold 300 notes');

    for (const item of createdNotes) {
      const cellKey = `${item.habitId}|${item.date}`;
      const cell = rawState.cells[cellKey];
      assert.ok(cell, `state.cells must contain key "${cellKey}"`);
      assert.strictEqual(
        cell.noteId,
        item.note.id,
        `state.cells["${cellKey}"].noteId must link to note.id "${item.note.id}"`
      );
    }

    // Verify UI rendering of all 300 badges across the 3 categories
    await env.Views.renderHabits();
    const badges = env.document.querySelectorAll('.cell-note-badge');
    assert.strictEqual(badges.length, 300, `Grid must render exactly 300 badges, found ${badges.length}`);

    const defaultBadges = env.document.querySelectorAll('.cell-note-badge.badge-default');
    const loveBadges = env.document.querySelectorAll('.cell-note-badge.badge-love');
    const disciplineBadges = env.document.querySelectorAll('.cell-note-badge.badge-discipline');
    assert.strictEqual(defaultBadges.length, 100, `Expected 100 default badges, found ${defaultBadges.length}`);
    assert.strictEqual(loveBadges.length, 100, `Expected 100 love badges, found ${loveBadges.length}`);
    assert.strictEqual(disciplineBadges.length, 100, `Expected 100 discipline badges, found ${disciplineBadges.length}`);

    // Rapid Category Switching in Note Modal (100 rapid clicks)
    const testHabit = habits[0];
    const testDate = dates[0];
    env.Views.openNoteModal(testHabit.id, testDate);

    const modal = env.document.getElementById('note-modal');
    const modalContent = modal.querySelector('.note-modal-content');
    const btnDefault = modal.querySelector('.note-type-btn[data-type="default"]');
    const btnLove = modal.querySelector('.note-type-btn[data-type="love"]');
    const btnDiscipline = modal.querySelector('.note-type-btn[data-type="discipline"]');

    assert.ok(btnDefault && btnLove && btnDiscipline, 'All 3 category buttons must exist');

    for (let i = 0; i < 33; i++) {
      env.click(btnLove);
      assert.ok(btnLove.classList.contains('active') && !btnDefault.classList.contains('active') && !btnDiscipline.classList.contains('active'));
      assert.ok(modalContent.classList.contains('note-type-love'));

      env.click(btnDiscipline);
      assert.ok(btnDiscipline.classList.contains('active') && !btnLove.classList.contains('active') && !btnDefault.classList.contains('active'));
      assert.ok(modalContent.classList.contains('note-type-discipline'));

      env.click(btnDefault);
      assert.ok(btnDefault.classList.contains('active') && !btnLove.classList.contains('active') && !btnDiscipline.classList.contains('active'));
      assert.ok(!modalContent.classList.contains('note-type-love') && !modalContent.classList.contains('note-type-discipline'));
    }

    // Save final choice as discipline
    env.click(btnDiscipline);
    env.document.getElementById('note-text').value = 'Updated note text after 100 switches';
    env.click('#save-note-btn');
    await new Promise(r => setTimeout(r, 20));

    const updatedCellKey = `${testHabit.id}|${testDate}`;
    const updatedState = await env.Storage.getRawState();
    const updatedNote = updatedState.notes.find(n => n.id === updatedState.cells[updatedCellKey].noteId);
    assert.strictEqual(updatedNote.type, 'discipline', 'Saved note type must be discipline');
    assert.strictEqual(updatedNote.text, 'Updated note text after 100 switches');

    // Note Unlinking upon Note Deletion
    const noteToDelete = createdNotes[5].note;
    const deleteCellKey = `${createdNotes[5].habitId}|${createdNotes[5].date}`;
    await env.Storage.deleteNote(noteToDelete.id);

    const stateAfterNoteDelete = await env.Storage.getRawState();
    assert.ok(!stateAfterNoteDelete.notes.some(n => n.id === noteToDelete.id), 'Deleted note must not be in state.notes');
    assert.strictEqual(stateAfterNoteDelete.cells[deleteCellKey].noteId, undefined, 'Cell noteId must be unlinked');
    assert.ok(stateAfterNoteDelete.tombstones.notes[noteToDelete.id], 'Note tombstone must be created');

    // Note Unlinking and Cleanup upon Habit Deletion
    const habitToDelete = habits[1];
    const habitNotes = createdNotes.filter(item => item.habitId === habitToDelete.id);
    assert.strictEqual(habitNotes.length, 30, 'Habit must have 30 associated notes');

    await env.Storage.deleteHabit(habitToDelete.id);
    const stateAfterHabitDelete = await env.Storage.getRawState();

    assert.ok(!stateAfterHabitDelete.habits.some(h => h.id === habitToDelete.id), 'Deleted habit must not be in state.habits');
    assert.ok(stateAfterHabitDelete.tombstones.habits[habitToDelete.id], 'Habit tombstone must be created');

    // All 30 notes must be removed and tombstoned
    for (const hn of habitNotes) {
      assert.ok(!stateAfterHabitDelete.notes.some(n => n.id === hn.note.id), `Habit note ${hn.note.id} must be removed`);
      assert.ok(stateAfterHabitDelete.tombstones.notes[hn.note.id], `Habit note ${hn.note.id} must be tombstoned`);
      assert.strictEqual(stateAfterHabitDelete.cells[`${habitToDelete.id}|${hn.date}`], undefined, 'Habit cells must be removed');
    }

    env.teardown();
    recordPass('3. Categorized Cell Notes: 300 notes, 100% cell.noteId linkage, rapid category switching & cascading cleanup PASS');
  } catch (err) {
    recordFail('3. Categorized Cell Notes Stress Test', err);
  }

  // -------------------------------------------------------------------------
  // 4. DUAL DIRECTORY BYTE-FOR-BYTE INTEGRITY VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Dual Directory Byte-for-Byte Integrity ---');
  try {
    function sha256(filePath) {
      const buf = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(buf).digest('hex');
    }

    // A. Explicit check of all web application assets loaded by index.html / served in public/
    const coreFiles = [
      'index.html',
      'manifest.json',
      'manifest.webmanifest',
      'sw.js',
      'css/style.css',
      'js/api.js',
      'js/app.js',
      'js/auth.js',
      'js/crypto.js',
      'js/storage.js',
      'js/sync.js',
      'js/views.js',
      'icons/icon.svg',
      'icons/icon-192.png',
      'icons/icon-512.png'
    ];

    for (const rel of coreFiles) {
      const rootPath = path.resolve(rel);
      const pubPath = path.resolve('public', rel);
      assert.ok(fs.existsSync(rootPath), `Root file ${rel} must exist`);
      assert.ok(fs.existsSync(pubPath), `Public mirror file public/${rel} must exist`);

      const rootHash = sha256(rootPath);
      const pubHash = sha256(pubPath);
      assert.strictEqual(
        pubHash,
        rootHash,
        `Byte-for-byte mismatch in ${rel}: root SHA ${rootHash} !== public SHA ${pubHash}`
      );
    }

    // B. Recursive check across ALL files present in public/
    function checkDir(dir) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPub = path.join(dir, item.name);
        const rel = path.relative('public', fullPub);
        const fullRoot = path.join('.', rel);

        if (item.isDirectory()) {
          checkDir(fullPub);
        } else {
          assert.ok(fs.existsSync(fullRoot), `Root file ${rel} must exist to match public/${rel}`);
          const pHash = sha256(fullPub);
          const rHash = sha256(fullRoot);
          assert.strictEqual(
            pHash,
            rHash,
            `Recursive parity mismatch in ${rel}: public ${pHash} !== root ${rHash}`
          );
        }
      }
    }
    checkDir(path.resolve('public'));

    recordPass(`4. Dual Directory Integrity: 100% byte-for-byte parity verified across ${coreFiles.length} core files and entire public/ tree`);
  } catch (err) {
    recordFail('4. Dual Directory Integrity', err);
  }

  // -------------------------------------------------------------------------
  // SUMMARY & VERDICT
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log('  CHALLENGER 2 SUMMARY');
  console.log('======================================================================');
  console.log(`  PASSED:   ${passed}`);
  console.log(`  FAILED:   ${failed}`);
  console.log('======================================================================');

  if (failed > 0) {
    console.error('\nFAILURES RECORDED:');
    failureDetails.forEach(f => console.error(`- ${f.testName}: ${f.error.message}`));
    console.log('\nVERDICT: REJECT');
    process.exit(1);
  } else {
    console.log('\nVERDICT: APPROVE');
    process.exit(0);
  }
}

runChallenger2Suite().catch(err => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
