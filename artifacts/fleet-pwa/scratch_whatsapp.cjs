const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'hooks', 'use-drivers.ts');
let content = fs.readFileSync(filePath, 'utf8');

const targetMsg = 'sendWhatsAppMessage(data.phone, `Welcome ${data.name}! Your login — Phone: ${data.phone}, PIN: ${data.pin}`);';
const replacementMsg = 'const msg = `*Welcome to Vehicle Fleet Maintenance App!* 🚚\\n\\nHello *${data.name}*, you have been successfully registered.\\n\\n*Your Login Credentials:*\\n📱 Phone: ${data.phone}\\n🔑 PIN: ${data.pin}\\n\\nPlease keep this PIN secure.`;\n      sendWhatsAppMessage(data.phone, msg);';

content = content.replace(targetMsg, replacementMsg);
fs.writeFileSync(filePath, content, 'utf8');
console.log("Updated whatsapp msg in use-drivers.ts!");
