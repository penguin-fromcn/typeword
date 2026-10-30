import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'src-tauri/resources'), { recursive: true });
copyFileSync(resolve(root, 'docs/使用指南.txt'), resolve(root, 'src-tauri/resources/使用指南.txt'));
console.log('synced docs/使用指南.txt -> src-tauri/resources/使用指南.txt');
