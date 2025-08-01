ALTER TABLE "conversations" ADD COLUMN "suggestions" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
DROP SCHEMA "auth";
