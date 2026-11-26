ALTER TABLE shops ADD COLUMN bw_double_sided_per_page REAL NOT NULL DEFAULT 2;
ALTER TABLE shops ADD COLUMN color_double_sided_per_page REAL NOT NULL DEFAULT 10;

UPDATE shops
SET bw_double_sided_per_page = bw_per_page,
    color_double_sided_per_page = color_per_page;
