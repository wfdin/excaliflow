-- 000002_create_users_table.up.sql
CREATE TABLE IF NOT EXISTS users (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(128) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add user_id column and foreign key to workspaces table if not already present
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.columns 
    WHERE table_schema = DATABASE() AND table_name = 'workspaces' AND column_name = 'user_id'
);

SET @stmt = IF(@col_exists = 0, 'ALTER TABLE workspaces ADD COLUMN user_id BIGINT NULL AFTER id', 'SELECT 1');
PREPARE s1 FROM @stmt;
EXECUTE s1;
DEALLOCATE PREPARE s1;

SET @idx_exists = (
    SELECT COUNT(*) FROM information_schema.statistics 
    WHERE table_schema = DATABASE() AND table_name = 'workspaces' AND index_name = 'idx_workspaces_user'
);

SET @stmt = IF(@idx_exists = 0, 'ALTER TABLE workspaces ADD INDEX idx_workspaces_user (user_id)', 'SELECT 1');
PREPARE s2 FROM @stmt;
EXECUTE s2;
DEALLOCATE PREPARE s2;

SET @fk_exists = (
    SELECT COUNT(*) FROM information_schema.table_constraints 
    WHERE table_schema = DATABASE() AND table_name = 'workspaces' AND constraint_name = 'fk_workspaces_user'
);

SET @stmt = IF(@fk_exists = 0, 'ALTER TABLE workspaces ADD CONSTRAINT fk_workspaces_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE', 'SELECT 1');
PREPARE s3 FROM @stmt;
EXECUTE s3;
DEALLOCATE PREPARE s3;
