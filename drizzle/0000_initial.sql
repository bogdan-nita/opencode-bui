CREATE TABLE IF NOT EXISTS `agent_templates` (
  `name` text PRIMARY KEY NOT NULL,
  `template` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `conversation_sessions` (
  `conversation_key` text PRIMARY KEY NOT NULL,
  `bridge_id` text NOT NULL,
  `channel_id` text NOT NULL,
  `thread_id` text,
  `session_id` text NOT NULL,
  `cwd` text,
  `updated_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `session_workdirs` (
  `session_id` text PRIMARY KEY NOT NULL,
  `cwd` text NOT NULL,
  `updated_at` text NOT NULL
);
