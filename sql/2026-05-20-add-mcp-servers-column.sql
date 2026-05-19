-- hosted_agents.mcp_servers — JSONB-serialized array of MCP server configs.
-- The application code (src/lib/hosted-agents.ts) has been writing this
-- field since MCP support landed, but the schema migration was missed
-- against several Supabase projects, which caused POST /api/hosted-agent/register
-- to silently fail at the upsert step (the application's catch block
-- swallowed the error and still returned 200). Run this once in the
-- Supabase SQL editor to add the column with the safe default.

ALTER TABLE hosted_agents
  ADD COLUMN IF NOT EXISTS mcp_servers TEXT DEFAULT '[]';
