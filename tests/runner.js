#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// State for suites and tests
const registry = {
  currentSuite: null,
  suites: [],
  tierMapping: {
    'tier1_features': { tier: 1, label: 'TIER 1: FEATURE COVERAGE' },
    'tier2_boundaries': { tier: 2, label: 'TIER 2: BOUNDARY & CORNER CASES' },
    'tier3_pairwise': { tier: 3, label: 'TIER 3: CROSS-FEATURE PAIRWISE COMBINATIONS' },
    'tier4_scenarios': { tier: 4, label: 'TIER 4: REAL-WORLD APPLICATION SCENARIOS' }
  }
};

function describe(name, fn) {
  const suite = {
    name,
    tests: [],
    beforeHooks: [],
    afterHooks: [],
    beforeEachHooks: [],
    afterEachHooks: [],
    file: registry.currentFile || 'unknown',
    tier: registry.currentTier || 1,
    tierLabel: registry.currentTierLabel || 'TIER 1'
  };

  const prevSuite = registry.currentSuite;
  registry.currentSuite = suite;
  registry.suites.push(suite);

  try {
    fn();
  } finally {
    registry.currentSuite = prevSuite;
  }
}

function test(name, fn, timeoutMs = 5000) {
  if (!registry.currentSuite) {
    describe('Default Suite', () => {
      test(name, fn, timeoutMs);
    });
    return;
  }
  registry.currentSuite.tests.push({
    name,
    fn,
    timeoutMs,
    status: 'pending',
    duration: 0,
    error: null
  });
}

const it = test;

function before(fn) {
  if (registry.currentSuite) registry.currentSuite.beforeHooks.push(fn);
}

function after(fn) {
  if (registry.currentSuite) registry.currentSuite.afterHooks.push(fn);
}

function beforeEach(fn) {
  if (registry.currentSuite) registry.currentSuite.beforeEachHooks.push(fn);
}

function afterEach(fn) {
  if (registry.currentSuite) registry.currentSuite.afterEachHooks.push(fn);
}

// Export DSL methods early so required test suites have access immediately
module.exports = {
  describe,
  test,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  registry
};

// CLI argument parser
function parseArgs(args) {
  const options = {
    tier: 'all',
    filter: '',
    verbose: false,
    tap: false,
    bail: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--tier=')) {
      options.tier = arg.split('=')[1].toLowerCase();
    } else if (arg === '--tier' || arg === '-t') {
      options.tier = (args[++i] || 'all').toLowerCase();
    } else if (arg.startsWith('--filter=')) {
      options.filter = arg.split('=')[1].toLowerCase();
    } else if (arg === '--filter' || arg === '-f') {
      options.filter = (args[++i] || '').toLowerCase();
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--tap') {
      options.tap = true;
    } else if (arg === '--bail') {
      options.bail = true;
    }
  }

  return options;
}

// Test discovery
function discoverTestFiles(rootDir, options) {
  const discovered = [];
  const testsDir = path.join(rootDir, 'tests');

  for (const [dirName, meta] of Object.entries(registry.tierMapping)) {
    if (options.tier !== 'all' && String(meta.tier) !== String(options.tier)) {
      continue;
    }

    const tierDirPath = path.join(testsDir, dirName);
    if (!fs.existsSync(tierDirPath)) continue;

    const files = fs.readdirSync(tierDirPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      if (options.filter && !file.toLowerCase().includes(options.filter)) {
        continue;
      }
      discovered.push({
        filePath: path.join(tierDirPath, file),
        fileName: file,
        tier: meta.tier,
        tierLabel: meta.label
      });
    }
  }

  return discovered;
}

// Suite execution runner
async function runSuites(suites, options) {
  const startTime = Date.now();
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  const tierStats = {
    1: { name: 'Tier 1 (Feature Coverage)', passed: 0, total: 0 },
    2: { name: 'Tier 2 (Boundary & Corner Cases)', passed: 0, total: 0 },
    3: { name: 'Tier 3 (Cross-Feature Pairwise)', passed: 0, total: 0 },
    4: { name: 'Tier 4 (Real-World Scenarios)', passed: 0, total: 0 }
  };

  if (options.tap) {
    let tapIndex = 0;
    // Count total tests
    for (const s of suites) totalTests += s.tests.length;
    console.log('TAP version 13');
    console.log(`1..${totalTests}`);

    for (const suite of suites) {
      for (const hook of suite.beforeHooks) await hook();

      for (const t of suite.tests) {
        tapIndex++;
        const testStart = Date.now();
        let err = null;
        try {
          for (const hook of suite.beforeEachHooks) await hook();
          await runWithTimeout(t.fn, t.timeoutMs);
          for (const hook of suite.afterEachHooks) await hook();
          t.status = 'passed';
          totalPassed++;
          if (tierStats[suite.tier]) {
            tierStats[suite.tier].passed++;
            tierStats[suite.tier].total++;
          }
          console.log(`ok ${tapIndex} - ${suite.name} > ${t.name} # time=${Date.now() - testStart}ms`);
        } catch (e) {
          t.status = 'failed';
          t.error = e;
          totalFailed++;
          if (tierStats[suite.tier]) {
            tierStats[suite.tier].total++;
          }
          console.log(`not ok ${tapIndex} - ${suite.name} > ${t.name}`);
          console.log('  ---');
          console.log(`  message: ${JSON.stringify(e.message)}`);
          console.log(`  severity: fail`);
          console.log('  ...');
          if (options.bail) break;
        }
      }

      for (const hook of suite.afterHooks) await hook();
      if (options.bail && totalFailed > 0) break;
    }

    return { totalTests, totalPassed, totalFailed, duration: (Date.now() - startTime) / 1000 };
  }

  // Console / TTY Reporting
  console.log('======================================================================');
  console.log('  HOBBY TRACKER PWA — AUTOMATED E2E TEST SUITE');
  console.log('======================================================================\n');

  let currentTierLabel = null;

  for (const suite of suites) {
    if (suite.tierLabel !== currentTierLabel) {
      currentTierLabel = suite.tierLabel;
      console.log(`\x1b[1m\x1b[36m[${currentTierLabel}]\x1b[0m`);
    }

    console.log(`  \x1b[1m▶ ${suite.file} (${suite.tests.length} tests)\x1b[0m`);

    for (const hook of suite.beforeHooks) await hook();

    for (const t of suite.tests) {
      totalTests++;
      if (tierStats[suite.tier]) tierStats[suite.tier].total++;
      const testStart = Date.now();

      try {
        for (const hook of suite.beforeEachHooks) await hook();
        await runWithTimeout(t.fn, t.timeoutMs);
        for (const hook of suite.afterEachHooks) await hook();

        t.duration = Date.now() - testStart;
        t.status = 'passed';
        totalPassed++;
        if (tierStats[suite.tier]) tierStats[suite.tier].passed++;
        console.log(`    \x1b[32m✓\x1b[0m ${t.name} \x1b[90m(${t.duration}ms)\x1b[0m`);
      } catch (err) {
        t.duration = Date.now() - testStart;
        t.status = 'failed';
        t.error = err;
        totalFailed++;
        console.log(`    \x1b[31m✗\x1b[0m ${t.name} \x1b[90m(${t.duration}ms)\x1b[0m`);
        console.log(`      \x1b[31mError: ${err.message}\x1b[0m`);
        if (options.verbose && err.stack) {
          const indentedStack = err.stack.split('\n').slice(1).map(l => '        ' + l.trim()).join('\n');
          console.log(`\x1b[90m${indentedStack}\x1b[0m`);
        }
        if (options.bail) break;
      }
    }

    for (const hook of suite.afterHooks) await hook();
    console.log('');
    if (options.bail && totalFailed > 0) break;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  // Summary Table
  console.log('----------------------------------------------------------------------');
  console.log('EXECUTION SUMMARY');
  console.log('----------------------------------------------------------------------');

  for (const [tierNum, stat] of Object.entries(tierStats)) {
    if (stat.total > 0) {
      const pct = Math.round((stat.passed / stat.total) * 100);
      const passedStr = String(stat.passed).padStart(2, ' ');
      const totalStr = String(stat.total).padStart(2, ' ');
      console.log(`  ${stat.name.padEnd(35, ' ')}: ${passedStr} / ${totalStr} PASS (${pct}%)`);
    }
  }

  console.log('----------------------------------------------------------------------');
  console.log(`  TOTAL TESTS:   ${totalTests}`);
  console.log(`  PASSED:        \x1b[32m${totalPassed}\x1b[0m`);
  console.log(`  FAILED:        ${totalFailed > 0 ? `\x1b[31m${totalFailed}\x1b[0m` : '0'}`);
  console.log(`  DURATION:      ${durationSec}s`);
  console.log('======================================================================\n');

  return { totalTests, totalPassed, totalFailed, duration: durationSec };
}

function runWithTimeout(fn, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Test timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    if (timer && typeof timer.unref === 'function') timer.unref();

    Promise.resolve()
      .then(() => fn())
      .then(res => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(res);
        }
      })
      .catch(err => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

// Main CLI Entrypoint
async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  const testFiles = discoverTestFiles(rootDir, options);

  if (testFiles.length === 0) {
    console.log(`No test suites found matching filter (tier=${options.tier}, filter="${options.filter}")`);
    process.exitCode = 0;
    return;
  }

  for (const fileInfo of testFiles) {
    registry.currentFile = fileInfo.fileName;
    registry.currentTier = fileInfo.tier;
    registry.currentTierLabel = fileInfo.tierLabel;
    require(fileInfo.filePath);
  }

  const result = await runSuites(registry.suites, options);
  process.exitCode = result.totalFailed === 0 ? 0 : 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = {
  describe,
  test,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  registry
};
