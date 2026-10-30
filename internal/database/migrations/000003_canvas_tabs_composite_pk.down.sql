-- 000003_canvas_tabs_composite_pk.down.sql
-- Restoring the old primary key fails if two workspaces now share a tab id.
ALTER TABLE canvas_tabs DROP PRIMARY KEY, ADD PRIMARY KEY (id);
