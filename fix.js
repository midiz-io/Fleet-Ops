const fs = require('fs');
const path = require('path');

function replaceCorruptedChars(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceCorruptedChars(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;
      content = content.replace(/â€”/g, '-');
      content = content.replace(/â€¢/g, '•');
      content = content.replace(/âš /g, '⚠️');
      content = content.replace(/âœ“/g, '✓');
      content = content.replace(/â†’/g, '→');
      content = content.replace(/â °/g, '⏰');
      content = content.replace(/Â·/g, '·');
      content = content.replace(/â”€/g, '-');
      content = content.replace(/âœ•/g, '✕');
      content = content.replace(/Â/g, ''); // residual Â
      if (original !== content) {
        fs.writeFileSync(fullPath, content, 'utf8');
      }
    }
  }
}

replaceCorruptedChars(path.join(process.cwd(), 'artifacts/fleet-pwa/src'));
console.log('Fixed characters');
