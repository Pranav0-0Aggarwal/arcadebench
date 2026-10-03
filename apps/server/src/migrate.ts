import { dbFile } from './config.ts';
import { openDb } from './db.ts';

openDb(dbFile()).close();
