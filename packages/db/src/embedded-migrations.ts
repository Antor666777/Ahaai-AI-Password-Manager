// GENERATED FILE - do not edit by hand.
// Regenerate with: npm run db:embed --workspace @ahaai/db
// The test suite fails if this drifts from the drizzle/ folder.

export interface EmbeddedMigration {
  tag: string;
  when: number;
  sql: string;
}

export const EMBEDDED_JOURNAL = {
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {
      "idx": 0,
      "version": "7",
      "when": 1789311046955,
      "tag": "0000_redundant_virginia_dare",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "7",
      "when": 1789769691605,
      "tag": "0001_tough_pet_avengers",
      "breakpoints": true
    },
    {
      "idx": 2,
      "version": "7",
      "when": 1789770347622,
      "tag": "0002_fine_multiple_man",
      "breakpoints": true
    },
    {
      "idx": 3,
      "version": "7",
      "when": 1789772496664,
      "tag": "0003_tranquil_magik",
      "breakpoints": true
    }
  ]
} as const;

export const EMBEDDED_MIGRATIONS: EmbeddedMigration[] = [
  {
    "tag": "0000_redundant_virginia_dare",
    "when": 1789311046955,
    "sql": "CREATE TYPE \"public\".\"ai_mode\" AS ENUM('local', 'cloud');--> statement-breakpoint\nCREATE TYPE \"public\".\"item_type\" AS ENUM('login', 'card', 'identity', 'secure_note');--> statement-breakpoint\nCREATE TABLE \"ai_providers\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"user_id\" uuid NOT NULL,\n\t\"preset_id\" text NOT NULL,\n\t\"label\" text NOT NULL,\n\t\"base_url\" text,\n\t\"api_key_enc\" text,\n\t\"default_model\" text,\n\t\"is_local\" boolean DEFAULT false NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"folders\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"user_id\" uuid NOT NULL,\n\t\"name_enc\" text NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"items\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"user_id\" uuid NOT NULL,\n\t\"type\" \"item_type\" NOT NULL,\n\t\"name_enc\" text NOT NULL,\n\t\"notes_enc\" text,\n\t\"data_enc\" text NOT NULL,\n\t\"folder_id\" uuid,\n\t\"favorite\" boolean DEFAULT false NOT NULL,\n\t\"reprompt\" boolean DEFAULT false NOT NULL,\n\t\"revision\" integer DEFAULT 1 NOT NULL,\n\t\"deleted_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"security_events\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"user_id\" uuid,\n\t\"type\" text NOT NULL,\n\t\"severity\" text DEFAULT 'info' NOT NULL,\n\t\"ip_address\" text,\n\t\"user_agent\" text,\n\t\"metadata\" jsonb,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"sessions\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"user_id\" uuid NOT NULL,\n\t\"token_hash\" text NOT NULL,\n\t\"previous_token_hash\" text,\n\t\"device_name\" text,\n\t\"device_type\" text,\n\t\"ip_address\" text,\n\t\"user_agent\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"last_used_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"expires_at\" timestamp with time zone NOT NULL,\n\t\"rotated_at\" timestamp with time zone,\n\t\"revoked_at\" timestamp with time zone\n);\n--> statement-breakpoint\nCREATE TABLE \"user_settings\" (\n\t\"user_id\" uuid PRIMARY KEY NOT NULL,\n\t\"ai_mode\" \"ai_mode\" DEFAULT 'cloud' NOT NULL,\n\t\"default_provider_id\" uuid,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE \"users\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"email\" text NOT NULL,\n\t\"email_normalized\" text NOT NULL,\n\t\"auth_hash\" text NOT NULL,\n\t\"auth_salt\" text NOT NULL,\n\t\"auth_params\" jsonb NOT NULL,\n\t\"kdf_params\" jsonb NOT NULL,\n\t\"kdf_version\" integer DEFAULT 1 NOT NULL,\n\t\"protected_vault_key\" text NOT NULL,\n\t\"recovery_protected_vault_key\" text,\n\t\"security_stamp\" text NOT NULL,\n\t\"email_verified\" boolean DEFAULT false NOT NULL,\n\t\"disabled_at\" timestamp with time zone,\n\t\"last_login_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nALTER TABLE \"ai_providers\" ADD CONSTRAINT \"ai_providers_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"folders\" ADD CONSTRAINT \"folders_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"items\" ADD CONSTRAINT \"items_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"items\" ADD CONSTRAINT \"items_folder_id_folders_id_fk\" FOREIGN KEY (\"folder_id\") REFERENCES \"public\".\"folders\"(\"id\") ON DELETE set null ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"security_events\" ADD CONSTRAINT \"security_events_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE set null ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"sessions\" ADD CONSTRAINT \"sessions_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"user_settings\" ADD CONSTRAINT \"user_settings_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"user_settings\" ADD CONSTRAINT \"user_settings_default_provider_id_ai_providers_id_fk\" FOREIGN KEY (\"default_provider_id\") REFERENCES \"public\".\"ai_providers\"(\"id\") ON DELETE set null ON UPDATE no action;--> statement-breakpoint\nCREATE UNIQUE INDEX \"ai_providers_user_preset_label_key\" ON \"ai_providers\" USING btree (\"user_id\",\"preset_id\",\"label\");--> statement-breakpoint\nCREATE INDEX \"ai_providers_user_id_idx\" ON \"ai_providers\" USING btree (\"user_id\");--> statement-breakpoint\nCREATE INDEX \"folders_user_id_idx\" ON \"folders\" USING btree (\"user_id\");--> statement-breakpoint\nCREATE INDEX \"items_user_deleted_idx\" ON \"items\" USING btree (\"user_id\",\"deleted_at\");--> statement-breakpoint\nCREATE INDEX \"items_folder_id_idx\" ON \"items\" USING btree (\"folder_id\");--> statement-breakpoint\nCREATE INDEX \"security_events_user_created_idx\" ON \"security_events\" USING btree (\"user_id\",\"created_at\");--> statement-breakpoint\nCREATE UNIQUE INDEX \"sessions_token_hash_key\" ON \"sessions\" USING btree (\"token_hash\");--> statement-breakpoint\nCREATE INDEX \"sessions_user_id_idx\" ON \"sessions\" USING btree (\"user_id\");--> statement-breakpoint\nCREATE INDEX \"sessions_expires_at_idx\" ON \"sessions\" USING btree (\"expires_at\");--> statement-breakpoint\nCREATE UNIQUE INDEX \"users_email_normalized_key\" ON \"users\" USING btree (\"email_normalized\");"
  },
  {
    "tag": "0001_tough_pet_avengers",
    "when": 1789769691605,
    "sql": "CREATE TABLE \"item_revisions\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"item_id\" uuid NOT NULL,\n\t\"user_id\" uuid NOT NULL,\n\t\"revision\" integer NOT NULL,\n\t\"name_enc\" text NOT NULL,\n\t\"notes_enc\" text,\n\t\"data_enc\" text NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nALTER TABLE \"item_revisions\" ADD CONSTRAINT \"item_revisions_item_id_items_id_fk\" FOREIGN KEY (\"item_id\") REFERENCES \"public\".\"items\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"item_revisions\" ADD CONSTRAINT \"item_revisions_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nCREATE UNIQUE INDEX \"item_revisions_item_revision_key\" ON \"item_revisions\" USING btree (\"item_id\",\"revision\");--> statement-breakpoint\nCREATE INDEX \"item_revisions_user_id_idx\" ON \"item_revisions\" USING btree (\"user_id\");"
  },
  {
    "tag": "0002_fine_multiple_man",
    "when": 1789770347622,
    "sql": "CREATE TABLE \"item_tags\" (\n\t\"item_id\" uuid NOT NULL,\n\t\"tag_id\" uuid NOT NULL,\n\tCONSTRAINT \"item_tags_item_id_tag_id_pk\" PRIMARY KEY(\"item_id\",\"tag_id\")\n);\n--> statement-breakpoint\nCREATE TABLE \"tags\" (\n\t\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n\t\"user_id\" uuid NOT NULL,\n\t\"name_enc\" text NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);\n--> statement-breakpoint\nALTER TABLE \"item_tags\" ADD CONSTRAINT \"item_tags_item_id_items_id_fk\" FOREIGN KEY (\"item_id\") REFERENCES \"public\".\"items\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"item_tags\" ADD CONSTRAINT \"item_tags_tag_id_tags_id_fk\" FOREIGN KEY (\"tag_id\") REFERENCES \"public\".\"tags\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nALTER TABLE \"tags\" ADD CONSTRAINT \"tags_user_id_users_id_fk\" FOREIGN KEY (\"user_id\") REFERENCES \"public\".\"users\"(\"id\") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint\nCREATE INDEX \"item_tags_tag_id_idx\" ON \"item_tags\" USING btree (\"tag_id\");--> statement-breakpoint\nCREATE INDEX \"tags_user_id_idx\" ON \"tags\" USING btree (\"user_id\");"
  },
  {
    "tag": "0003_tranquil_magik",
    "when": 1789772496664,
    "sql": "ALTER TABLE \"ai_providers\" ADD COLUMN \"zero_data_retention\" boolean DEFAULT true NOT NULL;"
  }
];
