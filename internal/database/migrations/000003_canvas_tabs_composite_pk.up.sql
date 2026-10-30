-- 000003_canvas_tabs_composite_pk.up.sql
-- Canvas tab ids come from the browser and are only unique within a workspace,
-- so the mirror table must be keyed by (workspace_id, id). With a primary key
-- on id alone, reusing a tab id in another workspace failed with
-- "Error 1062: Duplicate entry ... for key 'PRIMARY'".

SET @pk_is_workspace_scoped = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'canvas_tabs'
      AND index_name = 'PRIMARY'
      AND column_name = 'workspace_id'
);

SET @stmt = IF(@pk_is_workspace_scoped = 0,
    'ALTER TABLE canvas_tabs DROP PRIMARY KEY, ADD PRIMARY KEY (workspace_id, id)',
    'SELECT 1');
PREPARE s1 FROM @stmt;
EXECUTE s1;
DEALLOCATE PREPARE s1;
