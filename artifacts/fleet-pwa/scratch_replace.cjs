const fs = require('fs');
const path = require('path');

const hooksDir = path.join(__dirname, 'src', 'hooks');
const files = fs.readdirSync(hooksDir).filter(f => f.startsWith('use-') && f.endsWith('.ts'));

for (const file of files) {
  if (file === 'use-mobile.tsx' || file === 'use-toast.ts') continue;
  
  const filePath = path.join(hooksDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already imported
  if (content.includes('handleSupabaseError')) continue;

  // Add import
  const importLines = content.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < importLines.length; i++) {
    if (importLines[i].startsWith('import ')) {
      lastImportIdx = i;
    } else if (importLines[i].trim() !== '' && !importLines[i].startsWith('import ')) {
      break;
    }
  }
  
  if (lastImportIdx >= 0) {
    importLines.splice(lastImportIdx + 1, 0, 'import { handleSupabaseError } from "@/lib/error-handler";');
  } else {
    importLines.unshift('import { handleSupabaseError } from "@/lib/error-handler";');
  }
  
  content = importLines.join('\n');

  // Replace throw error
  content = content.replace(/if\s*\(\s*error\s*\)\s*throw\s+error;/g, (match, p1, offset) => {
    // try to guess the context based on surrounding lines or just use generic
    return `if (error) handleSupabaseError(error);`;
  });

  // some files might have `{ throw error; }` instead of one-liners
  content = content.replace(/if\s*\(\s*error\s*\)\s*\{\s*throw\s+error;\s*\}/g, `if (error) { handleSupabaseError(error); }`);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
}
