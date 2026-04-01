import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  client_encoding: 'UTF8',
});

pool.on('error', (err) => {
  console.error('Unexpected DB error:', err.message);
});

export const query = (text, params) => pool.query(text, params);
