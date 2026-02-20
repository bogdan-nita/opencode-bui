export const REQUIRED_TABLE_STATEMENTS = [
  `
    create table if not exists conversation_sessions (
      conversation_key text primary key,
      bridge_id text not null,
      channel_id text not null,
      thread_id text,
      session_id text not null,
      cwd text,
      updated_at text not null
    )
  `,
  `
    create table if not exists session_workdirs (
      session_id text primary key,
      cwd text not null,
      updated_at text not null
    )
  `,
  `
    create table if not exists agent_templates (
      name text primary key,
      template text not null,
      created_at text not null,
      updated_at text not null
    )
  `,
  `
    create table if not exists permission_requests (
      permission_id text primary key,
      conversation_key text not null,
      requester_user_id text not null,
      status text not null,
      response text,
      expires_at_unix_seconds text not null,
      created_at text not null,
      updated_at text not null
    )
  `,
] as const;
