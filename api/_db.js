const { neon } = require('@neondatabase/serverless');

let _sql = null;

function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

function isDatabaseConfigured() {
  const url = process.env.DATABASE_URL;
  return url && !url.includes('REPLACE_ME') && url.startsWith('postgresql');
}

module.exports = { sql, isDatabaseConfigured };
