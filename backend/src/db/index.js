import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCHEMA } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// Two files, one catalog:
//  - SLIM is the committed, deployed database (backend/data/prose-and-thorns.sqlite).
//    It carries everything the live site serves but none of the raw review
//    text, which is most of the full file's size and would eventually exceed
//    GitHub's 100 MB per-file push limit as the catalog grows.
//  - FULL is the working database (backend/data/full/, gitignored). The
//    pipeline writes review text here, and the audit's quote-grounding checks
//    read it. `npm run export-slim` regenerates SLIM from it.
// With no override, whichever exists wins, FULL first -- so locally the full
// copy is used automatically, while on Railway (where only the committed
// SLIM file exists) the server falls back to it with no configuration.
export const SLIM_DB_PATH = path.join(DATA_DIR, 'prose-and-thorns.sqlite');
export const FULL_DB_PATH = path.join(DATA_DIR, 'full', 'prose-and-thorns-full.sqlite');
export const DB_PATH = process.env.PT_DB_PATH || (fs.existsSync(FULL_DB_PATH) ? FULL_DB_PATH : SLIM_DB_PATH);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);

export default db;
