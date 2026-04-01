import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const schema = `
SET client_encoding = 'UTF8';

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  google_id TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pdf_path TEXT NOT NULL,
  pdf_hash TEXT,
  size_bytes INTEGER,
  page_count INTEGER DEFAULT 1,
  merge_mode TEXT NOT NULL DEFAULT 'individual' CHECK (merge_mode IN ('combined', 'individual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS form_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  page_number INTEGER NOT NULL DEFAULT 1,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'checkbox')),
  field_name TEXT,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS field_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  field_id UUID REFERENCES form_fields(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(field_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT DEFAULT '기본 서명',
  method TEXT NOT NULL CHECK (method IN ('draw', 'image')),
  svg_data TEXT NOT NULL,
  thumbnail TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signature_placements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  signature_id UUID REFERENCES user_signatures(id) ON DELETE SET NULL,
  page_number INTEGER NOT NULL DEFAULT 1,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  rotation FLOAT DEFAULT 0,
  svg_data TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_shares (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  owner_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  invitee_email  TEXT NOT NULL,
  invite_token   TEXT UNIQUE,
  invite_status  TEXT NOT NULL DEFAULT 'pending' CHECK (invite_status IN ('pending', 'accepted', 'declined')),
  signing_status TEXT NOT NULL DEFAULT 'not_started' CHECK (signing_status IN ('not_started', 'in_progress', 'completed')),
  invited_at     TIMESTAMPTZ DEFAULT NOW(),
  responded_at   TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  UNIQUE(document_id, invitee_email)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  meta        JSONB,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_doc ON audit_logs(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_fields_doc ON form_fields(document_id);
CREATE INDEX IF NOT EXISTS idx_field_values_field ON field_values(field_id);
CREATE INDEX IF NOT EXISTS idx_field_values_user ON field_values(user_id);
CREATE INDEX IF NOT EXISTS idx_sig_placements_doc ON signature_placements(document_id, user_id);
CREATE INDEX IF NOT EXISTS idx_doc_shares_doc ON document_shares(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_shares_invitee ON document_shares(invitee_id);
CREATE INDEX IF NOT EXISTS idx_doc_shares_token ON document_shares(invite_token);
CREATE INDEX IF NOT EXISTS idx_doc_shares_email ON document_shares(invitee_email);
`;


async function init() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('✅ Database schema initialized');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

init();
