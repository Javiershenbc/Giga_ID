import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '..', 'src', 'public');
const webauthnDir = path.join(publicDir, '@simplewebauthn', 'browser', 'dist', 'bundle');

// Create directories if they don't exist
fs.mkdirSync(webauthnDir, { recursive: true });

// Copy the SimpleWebAuthn browser package
const sourceFile = path.join(__dirname, '..', 'node_modules', '@simplewebauthn', 'browser', 'dist', 'bundle', 'index.umd.min.js');
const targetFile = path.join(webauthnDir, 'index.umd.min.js');

fs.copyFileSync(sourceFile, targetFile);
console.log('SimpleWebAuthn browser package copied to public directory'); 