CREATE SCHEMA "qa";
--> statement-breakpoint
CREATE TABLE "qa"."cases" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"file_path" text NOT NULL,
	"owner_team" text NOT NULL,
	"tags" text[],
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "qa"."runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"retry" integer DEFAULT 0 NOT NULL,
	"project" text NOT NULL,
	"env" text NOT NULL,
	"branch" text,
	"commit_sha" text,
	"ci_run_url" text,
	"worker_index" integer,
	"framework_ver" text
);
--> statement-breakpoint
CREATE TABLE "qa"."steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"error_message" text,
	"error_stack" text,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "qa"."teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slack_channel" text,
	"oncall" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qa"."cases" ADD CONSTRAINT "cases_owner_team_teams_id_fk" FOREIGN KEY ("owner_team") REFERENCES "qa"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa"."runs" ADD CONSTRAINT "runs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "qa"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa"."steps" ADD CONSTRAINT "steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "qa"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_owner_team_idx" ON "qa"."cases" USING btree ("owner_team");--> statement-breakpoint
CREATE INDEX "cases_last_seen_at_idx" ON "qa"."cases" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "runs_case_id_started_at_idx" ON "qa"."runs" USING btree ("case_id","started_at");--> statement-breakpoint
CREATE INDEX "runs_started_at_idx" ON "qa"."runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "steps_run_id_idx" ON "qa"."steps" USING btree ("run_id");