-- 최초 스키마. drizzle-kit generate 의 기본 출력 스타일 — 순수 CREATE / ALTER
-- / CREATE INDEX. 신규 DB 전용. 재실행에는 Drizzle 의 `__drizzle_migrations`
-- 추적 테이블이 동일 migration 을 스킵하도록 보장한다.
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"google_id" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pdf_path" text NOT NULL,
	"pdf_hash" text,
	"size_bytes" integer,
	"page_count" integer DEFAULT 1,
	"status" text DEFAULT 'draft' NOT NULL,
	"signing_mode" text DEFAULT 'parallel' NOT NULL,
	"completed_at" timestamp with time zone,
	"signed_pdf_path" text,
	"signed_pdf_hash" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"voided_reason" text,
	"campaign_id" uuid,
	"template_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'signer' NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"signing_order" integer DEFAULT 0 NOT NULL,
	"invite_token" text,
	"invite_status" text DEFAULT 'pending' NOT NULL,
	"signing_status" text DEFAULT 'not_started' NOT NULL,
	"decline_reason" text,
	"invited_at" timestamp with time zone DEFAULT now(),
	"responded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "document_participants_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"participant_id" uuid,
	"field_type" text NOT NULL,
	"label" text,
	"required" boolean DEFAULT true NOT NULL,
	"page_number" integer DEFAULT 1 NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT '기본 서명',
	"method" text NOT NULL,
	"svg_data" text NOT NULL,
	"thumbnail" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "field_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"text_value" text,
	"checked" boolean,
	"svg_data" text,
	"date_value" text,
	"source_sig_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"document_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"user_id" uuid,
	"participant_id" uuid,
	"action" text NOT NULL,
	"meta" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"pdf_path" text NOT NULL,
	"pdf_hash" text,
	"size_bytes" integer,
	"page_count" integer DEFAULT 1,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"recipient_role" text DEFAULT 'self' NOT NULL,
	"field_type" text NOT NULL,
	"label" text,
	"required" boolean DEFAULT true NOT NULL,
	"page_number" integer DEFAULT 1 NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "signing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"message" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"total_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"document_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_participants" ADD CONSTRAINT "document_participants_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_participants" ADD CONSTRAINT "document_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_participant_id_document_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."document_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_signatures" ADD CONSTRAINT "user_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_responses" ADD CONSTRAINT "field_responses_field_id_form_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."form_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_responses" ADD CONSTRAINT "field_responses_participant_id_document_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."document_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_responses" ADD CONSTRAINT "field_responses_source_sig_id_user_signatures_id_fk" FOREIGN KEY ("source_sig_id") REFERENCES "public"."user_signatures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_participant_id_document_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."document_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_fields" ADD CONSTRAINT "template_fields_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signing_campaigns" ADD CONSTRAINT "signing_campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signing_campaigns" ADD CONSTRAINT "signing_campaigns_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_signing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."signing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_documents_owner" ON "documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_documents_status" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_documents_campaign" ON "documents" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_documents_template" ON "documents" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_participants_doc" ON "document_participants" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_participants_user" ON "document_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_participants_email" ON "document_participants" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_participants_token" ON "document_participants" USING btree ("invite_token");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_participants_doc_email" ON "document_participants" USING btree ("document_id","email");--> statement-breakpoint
CREATE INDEX "idx_form_fields_doc" ON "form_fields" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_form_fields_part" ON "form_fields" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "idx_field_responses_field" ON "field_responses" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "idx_field_responses_part" ON "field_responses" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_field_responses_field_part" ON "field_responses" USING btree ("field_id","participant_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_doc" ON "audit_logs" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_templates_owner" ON "document_templates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_templates_status" ON "document_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_template_fields_tpl" ON "template_fields" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_campaigns_owner" ON "signing_campaigns" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_campaigns_status" ON "signing_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_campaigns_template" ON "signing_campaigns" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_recipients_campaign" ON "campaign_recipients" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_recipients_status" ON "campaign_recipients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_recipients_doc" ON "campaign_recipients" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recipients_campaign_email" ON "campaign_recipients" USING btree ("campaign_id","email");
