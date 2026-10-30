-- 000004_workspace_share.up.sql
-- Public read-only share links for diagram projects. A workspace is shared
-- while share_enabled = 1; the token is unguessable and unique.

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'workspaces' AND column_name = 'share_token'
);

SET @stmt = IF(@col_exists = 0,
    'ALTER TABLE workspaces ADD COLUMN share_token VARCHAR(64) NULL AFTER user_id',
    'SELECT 1');
PREPARE s1 FROM @stmt;
EXECUTE s1;
DEALLOCATE PREPARE s1;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'workspaces' AND column_name = 'share_enabled'
);

SET @stmt = IF(@col_exists = 0,
    'ALTER TABLE workspaces ADD COLUMN share_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER share_token',
    'SELECT 1');
PREPARE s2 FROM @stmt;
EXECUTE s2;
DEALLOCATE PREPARE s2;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'workspaces' AND column_name = 'shared_at'
);

SET @stmt = IF(@col_exists = 0,
    'ALTER TABLE workspaces ADD COLUMN shared_at TIMESTAMP NULL AFTER share_enabled',
    'SELECT 1');
PREPARE s3 FROM @stmt;
EXECUTE s3;
DEALLOCATE PREPARE s3;

SET @idx_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'workspaces' AND index_name = 'uniq_workspaces_share_token'
);

SET @stmt = IF(@idx_exists = 0,
    'ALTER TABLE workspaces ADD UNIQUE INDEX uniq_workspaces_share_token (share_token)',
    'SELECT 1');
PREPARE s4 FROM @stmt;
EXECUTE s4;
DEALLOCATE PREPARE s4;
