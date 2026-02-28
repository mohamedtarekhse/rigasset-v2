-- ═══════════════════════════════════════════════════════════════
--  RigAsset Pro  –  PostgreSQL Schema v2
--  Run in Supabase: Dashboard → SQL Editor → paste & run
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name       TEXT          NOT NULL,
  email           TEXT          UNIQUE NOT NULL,
  password_hash   TEXT          NOT NULL,
  role            TEXT          NOT NULL DEFAULT 'Viewer'
                                CHECK (role IN ('Admin','Asset Manager','Operations Manager','Editor','Viewer')),
  department      TEXT,
  phone           TEXT,
  avatar_color    TEXT          NOT NULL DEFAULT '#0070F2',
  status          TEXT          NOT NULL DEFAULT 'Active'
                                CHECK (status IN ('Active','Inactive','Suspended')),
  alert_maint     BOOLEAN       NOT NULL DEFAULT true,
  alert_certs     BOOLEAN       NOT NULL DEFAULT true,
  alert_contracts BOOLEAN       NOT NULL DEFAULT false,
  alert_assets    BOOLEAN       NOT NULL DEFAULT false,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── COMPANIES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_code    TEXT          UNIQUE NOT NULL,
  name            TEXT          NOT NULL,
  type            TEXT          NOT NULL DEFAULT 'Drilling Contractor'
                                CHECK (type IN ('Drilling Contractor','Operator','Service Company','Other')),
  country         TEXT,
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  address         TEXT,
  website         TEXT,
  status          TEXT          NOT NULL DEFAULT 'Active'
                                CHECK (status IN ('Active','Inactive')),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── RIGS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rigs (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  rig_id            TEXT        UNIQUE NOT NULL,
  rig_number        INTEGER     UNIQUE,
  name              TEXT        UNIQUE NOT NULL,
  type              TEXT        NOT NULL
                                CHECK (type IN ('AC Drive','Mechanical','Electric','SCR','Other')),
  company_id        UUID        REFERENCES companies(id) ON DELETE SET NULL,
  location          TEXT,
  depth_capacity    TEXT,
  depth_capacity_ft INTEGER     CHECK (depth_capacity_ft IS NULL OR depth_capacity_ft > 0),
  horsepower        INTEGER     CHECK (horsepower IS NULL OR horsepower > 0),
  mast_height_ft    INTEGER     CHECK (mast_height_ft IS NULL OR mast_height_ft > 0),
  max_hook_load_ton INTEGER     CHECK (max_hook_load_ton IS NULL OR max_hook_load_ton > 0),
  status            TEXT        NOT NULL DEFAULT 'Active'
                                CHECK (status IN ('Active','Maintenance','Standby','Retired')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CONTRACTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_no     TEXT          UNIQUE NOT NULL,
  company_id      UUID          REFERENCES companies(id) ON DELETE SET NULL,
  rig_id          UUID          REFERENCES rigs(id) ON DELETE SET NULL,
  start_date      DATE          NOT NULL,
  end_date        DATE          NOT NULL,
  value_usd       NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (value_usd >= 0),
  currency        TEXT          NOT NULL DEFAULT 'USD',
  status          TEXT          NOT NULL DEFAULT 'Pending'
                                CHECK (status IN ('Active','Pending','Expired','Terminated')),
  notes           TEXT,
  created_by      UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_contract_dates CHECK (end_date >= start_date)
);

-- ─── ASSETS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id         TEXT         UNIQUE NOT NULL,
  name             TEXT         NOT NULL,
  category         TEXT         NOT NULL
                                CHECK (category IN ('Drilling Equipment','Power Generation','Transportation','Safety Equipment','Communication','Other')),
  company_id       UUID         REFERENCES companies(id) ON DELETE SET NULL,
  rig_id           UUID         REFERENCES rigs(id) ON DELETE SET NULL,
  contract_id      UUID         REFERENCES contracts(id) ON DELETE SET NULL,
  location         TEXT,
  status           TEXT         NOT NULL DEFAULT 'Active'
                                CHECK (status IN ('Active','Maintenance','Inactive','Contracted','Retired','Standby')),
  value_usd        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (value_usd >= 0),
  acquisition_date DATE,
  year_manufactured INTEGER     CHECK (year_manufactured IS NULL OR (year_manufactured >= 1950 AND year_manufactured <= 2100)),
  serial_number    TEXT,
  manufacturer     TEXT,
  model            TEXT,
  weight_kg        NUMERIC(10,2) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  dimensions       TEXT,
  notes            TEXT,
  created_by       UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_history (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id    UUID         NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  action      TEXT         NOT NULL,
  changed_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  old_values  JSONB,
  new_values  JSONB,
  notes       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── BILL OF MATERIALS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bom_items (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id         TEXT          UNIQUE NOT NULL,
  asset_id       UUID          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  parent_id      UUID          REFERENCES bom_items(id) ON DELETE CASCADE,
  name           TEXT          NOT NULL,
  part_number    TEXT,
  item_type      TEXT          NOT NULL DEFAULT 'Serialized'
                               CHECK (item_type IN ('Serialized','Bulk')),
  serial_number  TEXT,
  manufacturer   TEXT,
  quantity       NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  uom            TEXT          NOT NULL DEFAULT 'EA'
                               CHECK (uom IN ('EA','SET','KG','L','M','FT','BOX','PCS','KIT')),
  unit_cost_usd  NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (unit_cost_usd >= 0),
  lead_time_days INTEGER       NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  status         TEXT          NOT NULL DEFAULT 'Active'
                               CHECK (status IN ('Active','Inactive','Obsolete','On Order')),
  notes          TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── CERTIFICATES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  cert_no      TEXT          UNIQUE NOT NULL,
  asset_id     UUID          REFERENCES assets(id) ON DELETE CASCADE,
  rig_id       UUID          REFERENCES rigs(id) ON DELETE CASCADE,
  cert_type    TEXT          NOT NULL,
  issued_by    TEXT,
  issue_date   DATE,
  expiry_date  DATE,
  document_url TEXT,
  status       TEXT          NOT NULL DEFAULT 'Valid'
                             CHECK (status IN ('Valid','Expiring','Expired','Revoked')),
  notes        TEXT,
  created_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cert_owner CHECK (asset_id IS NOT NULL OR rig_id IS NOT NULL),
  CONSTRAINT chk_cert_dates CHECK (issue_date IS NULL OR expiry_date IS NULL OR expiry_date >= issue_date)
);

-- ─── MAINTENANCE SCHEDULES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  pm_id            TEXT          UNIQUE NOT NULL,
  asset_id         UUID          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  task_name        TEXT          NOT NULL,
  task_type        TEXT          NOT NULL
                                 CHECK (task_type IN ('Oil Change','Inspection','Calibration','Overhaul','Filter Replacement','Lubrication','Pressure Test','Electrical Check','Safety Check','General Service')),
  priority         TEXT          NOT NULL DEFAULT 'Normal'
                                 CHECK (priority IN ('Critical','High','Normal','Low')),
  frequency_days   INTEGER       NOT NULL DEFAULT 30 CHECK (frequency_days > 0),
  last_done_date   DATE,
  next_due_date    DATE          NOT NULL,
  alert_days       INTEGER       NOT NULL DEFAULT 14 CHECK (alert_days >= 0),
  technician       TEXT,
  estimated_hours  NUMERIC(6,2)  CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  estimated_cost   NUMERIC(18,2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  work_order_no    TEXT,
  status           TEXT          NOT NULL DEFAULT 'Scheduled'
                                 CHECK (status IN ('Scheduled','In Progress','Completed','Cancelled')),
  notes            TEXT,
  created_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_maint_dates CHECK (last_done_date IS NULL OR next_due_date >= last_done_date)
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id          UUID          NOT NULL REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
  completion_date      DATE          NOT NULL,
  completed_by         TEXT          NOT NULL,
  completed_by_user_id UUID          REFERENCES users(id) ON DELETE SET NULL,
  actual_hours         NUMERIC(6,2)  CHECK (actual_hours IS NULL OR actual_hours >= 0),
  actual_cost          NUMERIC(18,2) CHECK (actual_cost IS NULL OR actual_cost >= 0),
  parts_used           TEXT,
  work_notes           TEXT,
  next_due_date        DATE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── WORK ORDERS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_orders (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  wo_number        TEXT          UNIQUE NOT NULL,
  schedule_id      UUID          REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
  asset_id         UUID          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  title            TEXT          NOT NULL,
  description      TEXT,
  priority         TEXT          NOT NULL DEFAULT 'Normal'
                                 CHECK (priority IN ('Critical','High','Normal','Low')),
  assigned_to      UUID          REFERENCES users(id) ON DELETE SET NULL,
  assigned_team    TEXT,
  planned_start    DATE,
  planned_end      DATE,
  actual_start     TIMESTAMPTZ,
  actual_end       TIMESTAMPTZ,
  estimated_hours  NUMERIC(6,2)  CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  actual_hours     NUMERIC(6,2)  CHECK (actual_hours IS NULL OR actual_hours >= 0),
  estimated_cost   NUMERIC(18,2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  actual_cost      NUMERIC(18,2) CHECK (actual_cost IS NULL OR actual_cost >= 0),
  status           TEXT          NOT NULL DEFAULT 'Open'
                                 CHECK (status IN ('Open','In Progress','On Hold','Completed','Cancelled')),
  completion_notes TEXT,
  created_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── TRANSFERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfers (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id       TEXT          UNIQUE NOT NULL,
  asset_id          UUID          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  current_location  TEXT          NOT NULL,
  destination       TEXT          NOT NULL,
  dest_rig_id       UUID          REFERENCES rigs(id) ON DELETE SET NULL,
  dest_company_id   UUID          REFERENCES companies(id) ON DELETE SET NULL,
  priority          TEXT          NOT NULL DEFAULT 'Normal'
                                  CHECK (priority IN ('Critical','High','Normal','Low')),
  transfer_type     TEXT          NOT NULL DEFAULT 'Field to Field'
                                  CHECK (transfer_type IN ('Field to Field','Field to Warehouse','Warehouse to Field','Rig to Rig','For Maintenance','For Inspection','Return to Owner')),
  reason            TEXT          NOT NULL,
  instructions      TEXT,
  requested_by      UUID          REFERENCES users(id) ON DELETE SET NULL,
  request_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
  required_date     DATE,
  status            TEXT          NOT NULL DEFAULT 'Pending'
                                  CHECK (status IN ('Pending','Ops Approved','Completed','Rejected','On Hold')),
  ops_approved_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
  ops_action        TEXT          CHECK (ops_action IN ('approve','reject','hold')),
  ops_date          DATE,
  ops_comment       TEXT,
  mgr_approved_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
  mgr_action        TEXT          CHECK (mgr_action IN ('approve','reject','hold')),
  mgr_date          DATE,
  mgr_comment       TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transfer_dates CHECK (required_date IS NULL OR required_date >= request_date)
);

-- ─── NOTIFICATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT          NOT NULL DEFAULT 'info'
                            CHECK (type IN ('info','success','warning','error')),
  icon        TEXT          NOT NULL DEFAULT 'bell',
  title       TEXT          NOT NULL,
  description TEXT,
  entity_type TEXT          CHECK (entity_type IN ('asset','maintenance','transfer','contract','certificate','work_order')),
  entity_id   UUID,
  is_read     BOOLEAN       NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── REFRESH TOKENS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT          NOT NULL,
  expires_at  TIMESTAMPTZ   NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
--  INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);
CREATE INDEX IF NOT EXISTS idx_rigs_company         ON rigs(company_id);
CREATE INDEX IF NOT EXISTS idx_rigs_number          ON rigs(rig_number);
CREATE INDEX IF NOT EXISTS idx_contracts_company    ON contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_rig        ON contracts(rig_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status     ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date   ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_assets_rig           ON assets(rig_id);
CREATE INDEX IF NOT EXISTS idx_assets_company       ON assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_status        ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category      ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_serial        ON assets(serial_number);
CREATE INDEX IF NOT EXISTS idx_asset_history        ON asset_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_bom_asset            ON bom_items(asset_id);
CREATE INDEX IF NOT EXISTS idx_bom_parent           ON bom_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_certs_asset          ON certificates(asset_id);
CREATE INDEX IF NOT EXISTS idx_certs_expiry         ON certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_maint_asset          ON maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_maint_next_due       ON maintenance_schedules(next_due_date);
CREATE INDEX IF NOT EXISTS idx_maint_status         ON maintenance_schedules(status);
CREATE INDEX IF NOT EXISTS idx_maint_asset_due      ON maintenance_schedules(asset_id, next_due_date);
CREATE INDEX IF NOT EXISTS idx_maint_logs           ON maintenance_logs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_wo_asset             ON work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_wo_status            ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_transfers_asset      ON transfers(asset_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status     ON transfers(status);
CREATE INDEX IF NOT EXISTS idx_notif_user           ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread         ON notifications(user_id, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_refresh_user         ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires      ON refresh_tokens(expires_at);

-- ═══════════════════════════════════════════════════════════════
--  AUTO updated_at TRIGGER
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DO $body$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','companies','rigs','contracts','assets',
    'bom_items','certificates','maintenance_schedules','transfers','work_orders'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_%I ON %I;
       CREATE TRIGGER trg_updated_%I BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();', t,t,t,t);
  END LOOP;
END; $body$;

-- ═══════════════════════════════════════════════════════════════
--  VIEWS
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_assets AS
SELECT a.*, r.name AS rig_name, r.rig_id AS rig_code, r.rig_number,
       r.location AS rig_location, r.status AS rig_status,
       c.name AS company_name, c.company_code,
       ct.contract_no, ct.status AS contract_status, ct.end_date AS contract_end_date
FROM assets a
LEFT JOIN rigs      r  ON r.id  = a.rig_id
LEFT JOIN companies c  ON c.id  = a.company_id
LEFT JOIN contracts ct ON ct.id = a.contract_id;

CREATE OR REPLACE VIEW v_maintenance AS
SELECT ms.*, a.name AS asset_name, a.asset_id AS asset_code, a.location AS asset_location,
       r.name AS rig_name, r.rig_id AS rig_code, r.rig_number,
       CURRENT_DATE AS today,
       (ms.next_due_date - CURRENT_DATE) AS days_until_due,
       CASE
         WHEN ms.status IN ('Completed','Cancelled','In Progress') THEN ms.status
         WHEN ms.next_due_date < CURRENT_DATE                      THEN 'Overdue'
         WHEN ms.next_due_date <= CURRENT_DATE + ms.alert_days     THEN 'Due Soon'
         ELSE 'Scheduled'
       END AS live_status
FROM maintenance_schedules ms
LEFT JOIN assets a ON a.id = ms.asset_id
LEFT JOIN rigs   r ON r.id = a.rig_id;

CREATE OR REPLACE VIEW v_transfers AS
SELECT t.*, a.name AS asset_name, a.asset_id AS asset_code,
       r.name AS source_rig_name, dr.name AS dest_rig_name, dc.name AS dest_company_name,
       u.full_name AS requested_by_name,
       ou.full_name AS ops_approver_name, mu.full_name AS mgr_approver_name
FROM transfers t
LEFT JOIN assets    a  ON a.id  = t.asset_id
LEFT JOIN rigs      r  ON r.id  = a.rig_id
LEFT JOIN rigs      dr ON dr.id = t.dest_rig_id
LEFT JOIN companies dc ON dc.id = t.dest_company_id
LEFT JOIN users     u  ON u.id  = t.requested_by
LEFT JOIN users     ou ON ou.id = t.ops_approved_by
LEFT JOIN users     mu ON mu.id = t.mgr_approved_by;

CREATE OR REPLACE VIEW v_contracts AS
SELECT ct.*, c.name AS company_name, r.name AS rig_name, r.rig_id AS rig_code,
       (ct.end_date - CURRENT_DATE) AS days_until_expiry,
       CASE
         WHEN ct.status IN ('Expired','Terminated')        THEN ct.status
         WHEN ct.end_date < CURRENT_DATE                   THEN 'Expired'
         WHEN ct.end_date <= CURRENT_DATE + 30             THEN 'Expiring Soon'
         ELSE ct.status
       END AS live_status,
       COUNT(a.id) AS asset_count
FROM contracts ct
LEFT JOIN companies c ON c.id = ct.company_id
LEFT JOIN rigs      r ON r.id = ct.rig_id
LEFT JOIN assets    a ON a.contract_id = ct.id
GROUP BY ct.id, c.name, r.name, r.rig_id;
