CREATE TABLE IF NOT EXISTS parts (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL CHECK (category IN ('sensor','actuator','display','driver','passive','power')),
  interface      TEXT NOT NULL CHECK (interface IN ('digital','analog','i2c','spi','pwm','uart')),
  voltage        REAL,
  currentDraw_mA REAL,
  requiresAdc    INTEGER NOT NULL DEFAULT 0,
  library        TEXT,
  notes          TEXT,
  ownedQty       INTEGER NOT NULL DEFAULT 0,
  sourceUrl      TEXT,
  estPrice       REAL,
  inKit          TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  boardModel  TEXT,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','wiring','coded','deployed')),
  createdAt   TEXT NOT NULL,
  updatedAt   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_parts (
  id           TEXT PRIMARY KEY,
  projectId    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  partId       TEXT NOT NULL REFERENCES parts(id),
  gpioPin      TEXT,
  wiringNotes  TEXT,
  status       TEXT NOT NULL DEFAULT 'owned' CHECK (status IN ('owned','needs_purchase'))
);

-- Duplicate-pin uniqueness is enforced at the app layer only (lib/compat.js),
-- not here: the rule is conditional on the parts' interface (i2c/spi/uart
-- devices legitimately share bus pins), which a plain index on this table
-- can't express since interface lives on the joined `parts` row. Fine for a
-- single-user app with no meaningful concurrent-write race.
CREATE INDEX IF NOT EXISTS idx_project_parts_project ON project_parts(projectId);
CREATE INDEX IF NOT EXISTS idx_project_parts_part ON project_parts(partId);

CREATE TABLE IF NOT EXISTS code_snippets (
  id        TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code      TEXT NOT NULL,
  summary   TEXT,
  verified  INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_code_snippets_project ON code_snippets(projectId);
