-- 000002_create_users_table.down.sql
ALTER TABLE workspaces DROP FOREIGN KEY IF EXISTS fk_workspaces_user;
ALTER TABLE workspaces DROP INDEX IF EXISTS idx_workspaces_user;
ALTER TABLE workspaces DROP COLUMN IF EXISTS user_id;
DROP TABLE IF EXISTS users;
