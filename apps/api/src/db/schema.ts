/**
 * Drizzle ORM 스키마 정의 — 단일 진실 소스
 * JS 프로퍼티명을 PostgreSQL 컬럼명과 동일하게 snake_case로 정의해
 * db.select() / .returning() 과 db.execute(sql`...`) 반환값 형식을 일치시킨다.
 *
 * pnpm --filter api db:generate  → SQL 마이그레이션 파일 생성
 * pnpm --filter api db:push      → DB에 직접 반영 (개발용)
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── users ──────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  google_id: text('google_id'),
  avatar_url: text('avatar_url'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── documents ──────────────────────────────────────────────────────────────
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    owner_id: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    pdf_path: text('pdf_path').notNull(),
    pdf_hash: text('pdf_hash'),
    size_bytes: integer('size_bytes'),
    page_count: integer('page_count').default(1),
    status: text('status').notNull().default('draft'),
    signing_mode: text('signing_mode').notNull().default('parallel'),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    signed_pdf_path: text('signed_pdf_path'),
    signed_pdf_hash: text('signed_pdf_hash'),
    voided_at: timestamp('voided_at', { withTimezone: true }),
    voided_by: uuid('voided_by').references(() => users.id, { onDelete: 'set null' }),
    voided_reason: text('voided_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    ownerIdx: index('idx_documents_owner').on(t.owner_id),
    statusIdx: index('idx_documents_status').on(t.status),
  })
);

// ─── document_participants ──────────────────────────────────────────────────
export const documentParticipants = pgTable(
  'document_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    document_id: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    name: text('name'),
    role: text('role').notNull().default('signer'),
    is_owner: boolean('is_owner').notNull().default(false),
    signing_order: integer('signing_order').notNull().default(0),
    invite_token: text('invite_token').unique(),
    invite_status: text('invite_status').notNull().default('pending'),
    signing_status: text('signing_status').notNull().default('not_started'),
    decline_reason: text('decline_reason'),
    invited_at: timestamp('invited_at', { withTimezone: true }).defaultNow(),
    responded_at: timestamp('responded_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    docIdx: index('idx_participants_doc').on(t.document_id),
    userIdx: index('idx_participants_user').on(t.user_id),
    emailIdx: index('idx_participants_email').on(t.email),
    tokenIdx: index('idx_participants_token').on(t.invite_token),
    docEmailUnique: uniqueIndex('uq_participants_doc_email').on(t.document_id, t.email),
  })
);

// ─── form_fields ────────────────────────────────────────────────────────────
export const formFields = pgTable(
  'form_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    document_id: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    participant_id: uuid('participant_id').references(() => documentParticipants.id, {
      onDelete: 'set null',
    }),
    field_type: text('field_type').notNull(),
    label: text('label'),
    required: boolean('required').notNull().default(true),
    page_number: integer('page_number').notNull().default(1),
    x: doublePrecision('x').notNull(),
    y: doublePrecision('y').notNull(),
    width: doublePrecision('width').notNull(),
    height: doublePrecision('height').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    docIdx: index('idx_form_fields_doc').on(t.document_id),
    partIdx: index('idx_form_fields_part').on(t.participant_id),
  })
);

// ─── user_signatures ────────────────────────────────────────────────────────
export const userSignatures = pgTable('user_signatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').default('기본 서명'),
  method: text('method').notNull(),
  svg_data: text('svg_data').notNull(),
  thumbnail: text('thumbnail'),
  is_default: boolean('is_default').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── field_responses ────────────────────────────────────────────────────────
export const fieldResponses = pgTable(
  'field_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    field_id: uuid('field_id')
      .notNull()
      .references(() => formFields.id, { onDelete: 'cascade' }),
    participant_id: uuid('participant_id')
      .notNull()
      .references(() => documentParticipants.id, { onDelete: 'cascade' }),
    text_value: text('text_value'),
    checked: boolean('checked'),
    svg_data: text('svg_data'),
    date_value: text('date_value'), // DATE stored as text for simplicity
    source_sig_id: uuid('source_sig_id').references(() => userSignatures.id, {
      onDelete: 'set null',
    }),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    fieldIdx: index('idx_field_responses_field').on(t.field_id),
    partIdx: index('idx_field_responses_part').on(t.participant_id),
    fieldPartUnique: uniqueIndex('uq_field_responses_field_part').on(t.field_id, t.participant_id),
  })
);

// ─── notifications ──────────────────────────────────────────────────────────
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    document_id: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    read_at: timestamp('read_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index('idx_notifications_user').on(t.user_id, t.created_at),
  })
);

// ─── audit_logs ─────────────────────────────────────────────────────────────
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    document_id: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    participant_id: uuid('participant_id').references(() => documentParticipants.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    meta: jsonb('meta'),
    ip: text('ip'),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    docIdx: index('idx_audit_logs_doc').on(t.document_id, t.created_at),
    userIdx: index('idx_audit_logs_user').on(t.user_id, t.created_at),
  })
);

// ─── Relations (for relational queries) ─────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  participants: many(documentParticipants),
  signatures: many(userSignatures),
  notifications: many(notifications),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  owner: one(users, { fields: [documents.owner_id], references: [users.id] }),
  participants: many(documentParticipants),
  fields: many(formFields),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

export const documentParticipantsRelations = relations(documentParticipants, ({ one, many }) => ({
  document: one(documents, {
    fields: [documentParticipants.document_id],
    references: [documents.id],
  }),
  user: one(users, { fields: [documentParticipants.user_id], references: [users.id] }),
  fields: many(formFields),
  responses: many(fieldResponses),
}));

export const formFieldsRelations = relations(formFields, ({ one, many }) => ({
  document: one(documents, { fields: [formFields.document_id], references: [documents.id] }),
  participant: one(documentParticipants, {
    fields: [formFields.participant_id],
    references: [documentParticipants.id],
  }),
  responses: many(fieldResponses),
}));

export const fieldResponsesRelations = relations(fieldResponses, ({ one }) => ({
  field: one(formFields, { fields: [fieldResponses.field_id], references: [formFields.id] }),
  participant: one(documentParticipants, {
    fields: [fieldResponses.participant_id],
    references: [documentParticipants.id],
  }),
  sourceSig: one(userSignatures, {
    fields: [fieldResponses.source_sig_id],
    references: [userSignatures.id],
  }),
}));

// ─── Inferred types ─────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentParticipant = typeof documentParticipants.$inferSelect;
export type NewParticipant = typeof documentParticipants.$inferInsert;
export type FormField = typeof formFields.$inferSelect;
export type NewFormField = typeof formFields.$inferInsert;
export type UserSignature = typeof userSignatures.$inferSelect;
export type NewUserSignature = typeof userSignatures.$inferInsert;
export type FieldResponse = typeof fieldResponses.$inferSelect;
export type NewFieldResponse = typeof fieldResponses.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
