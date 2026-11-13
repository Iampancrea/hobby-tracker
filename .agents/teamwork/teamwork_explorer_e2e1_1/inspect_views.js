const fs = require('fs');

['app.js', 'auth.js', 'sync.js'].forEach(file => {
  const content = fs.readFileSync('js/' + file, 'utf8');
  const r1 = /getElementById\((['"])(.*?)\1\)/g;
  const ids = new Set();
  let m;
  while ((m = r1.exec(content)) !== null) ids.add(m[2]);

  const r2 = /querySelector(?:All)?\((['"])(.*?)\1\)/g;
  const sels = new Set();
  while ((m = r2.exec(content)) !== null) sels.add(m[2]);

  console.log('=== ' + file + ' IDs (' + ids.size + ') ===');
  console.log(Array.from(ids).sort());
  console.log('=== ' + file + ' Selectors (' + sels.size + ') ===');
  console.log(Array.from(sels).sort());
});
