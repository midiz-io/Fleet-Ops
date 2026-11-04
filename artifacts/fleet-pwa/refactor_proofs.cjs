const fs = require('fs');
const path = require('path');

const files = [
  'manager-dashboard.tsx',
  'repairs-manager.tsx',
  'fuel-log.tsx',
  'driver-repairs.tsx',
  'driver-dashboard.tsx'
];

for (const file of files) {
  const p = path.join(__dirname, 'src', 'pages', file);
  if (!fs.existsSync(p)) continue;
  
  let content = fs.readFileSync(p, 'utf8');

  // 1. Remove import
  content = content.replace(/import { ImageQuickView } from "@\/components\/image-quick-view";\n/g, '');

  // 2. Remove states
  content = content.replace(/.*const \[quickViewUrl, setQuickViewUrl\].*\n/g, '');
  content = content.replace(/.*const \[quickViewTitle, setQuickViewTitle\].*\n/g, '');

  // 3. Remove <ImageQuickView ... /> 
  content = content.replace(/<ImageQuickView[\s\S]*?\/>\n/g, '');

  // 4. Replace setQuickViewUrl(...)
  content = content.replace(/setQuickViewUrl\((.*?)\);?\s*(setQuickViewTitle\((.*?)\);?)?/g, (match, url, hasTitle, title) => {
    // If url is null, we can ignore it since we don't open null
    if (url === 'null') {
      return '';
    }
    const t = title ? title : '\"Proof Viewer\"';
    return `window.open((import.meta.env.BASE_URL || '/') + 'proof-viewer?src=' + encodeURIComponent(${url}) + '&title=' + encodeURIComponent(${t}), '_blank')`;
  });

  // Clean up empty onClick={() => } caused by setQuickViewUrl(null)
  content = content.replace(/onClick=\{\(\) => \}/g, '');

  fs.writeFileSync(p, content, 'utf8');
  console.log('Done', file);
}
