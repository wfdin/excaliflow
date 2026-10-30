-- 000004_workspace_share.down.sql
ALTER TABLE workspaces DROP INDEX uniq_workspaces_share_token;
ALTER TABLE workspaces DROP COLUMN shared_at;
ALTER TABLE workspaces DROP COLUMN share_enabled;
ALTER TABLE workspaces DROP COLUMN share_token;
