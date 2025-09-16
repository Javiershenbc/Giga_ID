#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Starting GigaID PoC on Railway...');

// Check if database exists, if not, the app will create it automatically
const dbPath = join(projectRoot, 'database.sqlite');
if (!fs.existsSync(dbPath)) {
    console.log('📦 Database will be created automatically on first startup');
} else {
    console.log('✅ Database file exists');
}

// Start the application
console.log('🔥 Starting server...');
const startProcess = spawn('node', [
    '--experimental-specifier-resolution=node',
    'dist/server/app.js'
], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'production',
        NODE_OPTIONS: '--experimental-json-modules --experimental-specifier-resolution=node'
    }
});

startProcess.on('error', (error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});

startProcess.on('exit', (code, signal) => {
    if (code !== 0) {
        console.error(`❌ Server exited with code ${code} and signal ${signal}`);
        process.exit(code || 1);
    }
}); 