-- 000001_create_workspaces_tables.up.sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version BIGINT NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL DEFAULT 'Default Workspace',
    active_tab_id VARCHAR(64) NULL,
    app_state JSON NULL,
    data LONGTEXT NOT NULL COMMENT 'Full serialized workspace JSON',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canvas_tabs (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    scroll_x DOUBLE NOT NULL DEFAULT 0,
    scroll_y DOUBLE NOT NULL DEFAULT 0,
    zoom DOUBLE NOT NULL DEFAULT 1,
    canvas_bg VARCHAR(16) NOT NULL DEFAULT '#ffffff',
    flow_enabled TINYINT(1) NOT NULL DEFAULT 1,
    flow_mode VARCHAR(32) NOT NULL DEFAULT 'comets',
    flow_speed DECIMAL(4, 2) NOT NULL DEFAULT 1.00,
    elements LONGTEXT NOT NULL COMMENT 'JSON array of element objects',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_canvas_tabs_workspace (workspace_id, sort_order),
    CONSTRAINT fk_canvas_tabs_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
