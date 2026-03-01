import journal from './meta/_journal.json';
import m0000 from './0000_late_sleeper.sql';
import m0001 from './0001_add_created_date.sql';

  export default {
    journal,
    migrations: {
      m0000,
      m0001
    }
  }
