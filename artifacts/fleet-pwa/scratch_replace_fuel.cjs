const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'hooks', 'use-fuel.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Ensure import is there
if (!content.includes('handleSupabaseError')) {
  content = 'import { handleSupabaseError } from "@/lib/error-handler";\n' + content;
}

// Replace standard throw error
content = content.replace(/if\s*\(\s*error\s*\)\s*throw\s+error;/g, `if (error) handleSupabaseError(error);`);

// Replace isolated throw error;
content = content.replace(/\bthrow\s+error;/g, `handleSupabaseError(error);`);

// Replace throw retry.error;
content = content.replace(/if\s*\(\s*retry\.error\s*\)\s*throw\s+retry\.error;/g, `if (retry.error) handleSupabaseError(retry.error);`);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Updated use-fuel.ts correctly!");
