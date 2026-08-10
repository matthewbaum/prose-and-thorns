import db from '../db/index.js';
import { log } from './util.js';

// better-sqlite3 defaults to WAL mode: writes land in prose-and-thorns.sqlite-wal
// first and are only merged into the committed .sqlite file on checkpoint.
// .gitignore excludes the -wal file (correctly — it's a transient journal,
// not data), which means recent writes can silently be absent from what git
// actually commits if a session commits without checkpointing first. Verified
// case: a full session's worth of catalog changes never left the WAL file,
// so the pushed .sqlite was missing everything after the very first edit,
// even though every local read that session (via the app's own live
// connection) looked correct. Run this before every git add/commit that
// touches the database.

db.pragma('wal_checkpoint(TRUNCATE)');
log('WAL checkpointed into prose-and-thorns.sqlite.');
