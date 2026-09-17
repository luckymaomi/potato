import { loadConfig } from '../config/index';
import { closeDb, getDb } from './index';
import { migrate } from './migrate';

const database = getDb(loadConfig().database);
migrate(database);
closeDb();
console.log('Migrations complete.');
