-- construction-projects-for-claude-code: core schema.
-- A New Zealand or Australian commercial head contractor's project record:
-- the companies (clients, subcontractors, consultants), the projects from
-- tender to close, the cost plan by cost code, the subcontracts and orders
-- that commit money against it, the variations, the payment claims going
-- out to the client and coming in from subcontractors with the statutory
-- payment schedule clock, the RFIs, the submittals, the delays and their
-- extension of time notices, the defects list and the site diary.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
--
-- The sharp edges are deliberate:
--   * a subcontractor payment claim carries its payment schedule deadline from
--     the day it lands (NZ Construction Contracts Act 2002, NSW Building and
--     Construction Industry Security of Payment Act 1999, QLD Building Industry
--     Fairness (Security of Payment) Act 2017). Miss it and you owe the full
--     amount claimed, so it is the loudest thing in the building
--   * a payment schedule for less than the claim must say why, and the CLI
--     refuses one without reasons
--   * a progress claim to the client never passes the contract plus APPROVED
--     variations, and on an NSW project it does not go without the supporting
--     statement that the subcontractors have been paid
--   * a subcontractor with expired (or no) public liability insurance does not
--     get a subcontract executed
--   * a project does not close while subcontractor claims sit unanswered,
--     variations sit unsubmitted, or defects stay open.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Companies ------------------------------------------------------------------------
-- Everyone the head contractor deals with: the clients (principals), the
-- subcontractors and suppliers, and the consultants who answer RFIs and review
-- submittals. Insurance lives here because an uninsured subcontractor on site
-- is the head contractor's uncapped risk.

create table if not exists companies (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  kind                  text not null default 'subcontractor',  -- client | subcontractor | consultant | supplier
  trade                 text,                       -- structural steel, electrical, structural engineer ...
  contact_name          text,
  email                 text,
  phone                 text,
  liability_expires_on  date,                       -- public liability insurance expiry
  licence_number        text,                       -- QBCC, LBP, or whatever licence the trade needs
  status                text not null default 'active',  -- active | former
  note                  text,
  external_ref          text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists companies_name_lower_idx on companies (lower(name));

-- Projects ---------------------------------------------------------------------------
-- One contract with one client, from tender to close. The jurisdiction picks
-- the payment schedule clock; the contract value plus APPROVED variations is
-- the ceiling every progress claim is checked against.

create table if not exists projects (
  id                  uuid primary key default gen_random_uuid(),
  ref                 text unique,                 -- PRJ-201
  name                text not null,
  client_id           uuid not null references companies(id) on delete cascade,
  site_address        text,
  jurisdiction        text not null default 'NZ',  -- NZ | NSW | QLD
  contract_form       text,                        -- NZS 3910, AS 4000, bespoke ...
  status              text not null default 'tender',  -- tender | active | defects | closed | lost
  tender_due_on       date,
  contract_value      numeric not null default 0,
  awarded_on          date,
  started_on          date,
  pc_due_on           date,                        -- practical completion, contract date
  pc_on               date,                        -- practical completion, achieved
  defects_ends_on     date,
  sub_retention_pct   numeric not null default 5,  -- what we hold back from subcontractors
  retention_account   text,                        -- where held retentions sit on trust (NZ CCA subpart 2A)
  schedule_days       int,                         -- working days to answer a sub claim under the contract (null: the Act's default)
  payment_days        int not null default 20,     -- working days from sub claim to payment
  eot_notice_days     int not null default 20,     -- working days to notify a delay under the head contract
  note                text,
  external_ref        text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists projects_client_idx on projects (client_id);
create index if not exists projects_status_idx on projects (status);

-- Cost plan ---------------------------------------------------------------------------
-- The tender estimate kept alive as the budget, by cost code. Subcontracts,
-- variations and direct costs all land on a line, so the cost report is a
-- join, not a spreadsheet rebuilt every month.

create table if not exists budget_lines (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  cost_code       text not null,                  -- '01', '04' ... sort order
  name            text not null,                  -- Preliminaries, Structural steel
  budget          numeric not null default 0,
  forecast_final  numeric,                        -- the QS's forecast final cost, when it beats the arithmetic
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, cost_code)
);
create index if not exists budget_lines_project_idx on budget_lines (project_id);

-- Commitments ---------------------------------------------------------------------------
-- Subcontracts and purchase orders: money promised against a cost line. An
-- executed subcontract counts against the line from the day it is signed.

create table if not exists commitments (
  id              uuid primary key default gen_random_uuid(),
  ref             text unique,                    -- SC-301
  project_id      uuid not null references projects(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,
  budget_line_id  uuid not null references budget_lines(id) on delete cascade,
  title           text not null,
  kind            text not null default 'subcontract',  -- subcontract | purchase_order
  value           numeric not null,
  retention_pct   numeric,                        -- null: the project's sub_retention_pct
  status          text not null default 'draft',  -- draft | executed | complete | terminated
  executed_on     date,
  note            text,
  external_ref    text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists commitments_project_idx on commitments (project_id);
create index if not exists commitments_company_idx on commitments (company_id);

-- RFIs ---------------------------------------------------------------------------
-- A question to the design team with a date the answer is needed by. An
-- overdue RFI with a time impact is the start of an extension of time claim.

create table if not exists rfis (
  id              uuid primary key default gen_random_uuid(),
  ref             text unique,                    -- RFI-401
  project_id      uuid not null references projects(id) on delete cascade,
  to_company_id   uuid references companies(id) on delete set null,
  subject         text not null,
  question        text,
  asked_on        date not null default current_date,
  due_on          date not null,
  answered_on     date,
  answer          text,
  cost_impact     boolean not null default false,
  time_impact     boolean not null default false,
  status          text not null default 'open',   -- open | answered | closed
  external_ref    text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists rfis_project_idx on rfis (project_id);

-- Variations ---------------------------------------------------------------------------
-- A change to the contracted work: instructed, priced and submitted to the
-- client, then approved or rejected. Only approved variations raise the
-- claim ceiling. When a subcontractor carries the work, the cost side rides
-- on their commitment.

create table if not exists variations (
  id               uuid primary key default gen_random_uuid(),
  ref              text unique,                   -- VAR-501
  project_id       uuid not null references projects(id) on delete cascade,
  commitment_id    uuid references commitments(id) on delete set null,
  rfi_id           uuid references rfis(id) on delete set null,
  title            text not null,
  origin           text not null default 'client_instruction',  -- client_instruction | rfi | design_change | latent_condition | other
  instruction_ref  text,                          -- SI-014, the site instruction number
  instructed_on    date not null default current_date,
  price            numeric not null default 0,    -- to the client
  cost             numeric not null default 0,    -- to us (the subcontractor's price, or our own)
  status           text not null default 'instructed',  -- instructed | submitted | approved | rejected | void
  submitted_on     date,
  decided_on       date,
  approved_by      text,                          -- who approved it, in writing
  note             text,
  external_ref     text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists variations_project_idx on variations (project_id);

-- Progress claims out ---------------------------------------------------------------------------
-- Our payment claims to the client, with the client's payment schedule and
-- payment on the record. Retention held is what the client keeps back.

create table if not exists head_claims (
  id                    uuid primary key default gen_random_uuid(),
  ref                   text unique,              -- PC-601
  project_id            uuid not null references projects(id) on delete cascade,
  claim_no              int not null,
  served_on             date not null default current_date,
  amount                numeric not null,         -- the amount claimed this period
  supporting_statement  boolean not null default false,  -- NSW SOPA s13(7)
  schedule_due_on       date,
  scheduled_amount      numeric,
  schedule_received_on  date,
  schedule_reasons      text,
  retention_held        numeric not null default 0,
  payment_due_on        date,
  paid_on               date,
  amount_paid           numeric not null default 0,
  status                text not null default 'served',  -- served | scheduled | paid
  external_ref          text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists head_claims_project_idx on head_claims (project_id);

-- Subcontractor claims in ---------------------------------------------------------------------------
-- The payment claims subcontractors serve on us. The schedule deadline is
-- computed in working days the moment the claim is received, because missing
-- it makes the full claimed amount payable.

create table if not exists sub_claims (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text unique,               -- SCL-701
  commitment_id        uuid not null references commitments(id) on delete cascade,
  claim_no             int not null,
  received_on          date not null default current_date,
  claimed_amount       numeric not null,
  schedule_due_on      date not null,
  scheduled_amount     numeric,
  schedule_issued_on   date,
  schedule_reasons     text,
  retention_withheld   numeric not null default 0,
  payment_due_on       date,
  paid_on              date,
  amount_paid          numeric not null default 0,
  status               text not null default 'received',  -- received | scheduled | paid
  external_ref         text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists sub_claims_commitment_idx on sub_claims (commitment_id);

-- Direct costs ---------------------------------------------------------------------------
-- Money spent outside a subcontract: labour, hire, consultants, materials.

create table if not exists costs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  budget_line_id  uuid not null references budget_lines(id) on delete cascade,
  incurred_on     date not null default current_date,
  supplier        text,
  invoice_ref     text,
  amount          numeric not null,
  note            text,
  external_ref    text unique,
  created_at      timestamptz not null default now()
);
create index if not exists costs_project_idx on costs (project_id);

-- Submittals ---------------------------------------------------------------------------
-- Shop drawings, samples and product data going to the design team for
-- review. The date that matters is required_by: after it, procurement lead
-- time starts eating the programme.

create table if not exists submittals (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text unique,               -- SUB-801
  project_id           uuid not null references projects(id) on delete cascade,
  commitment_id        uuid references commitments(id) on delete set null,
  reviewer_id          uuid references companies(id) on delete set null,
  title                text not null,
  spec_section         text,
  submitted_on         date,
  return_due_on        date,
  required_by          date,                      -- approval needed by, for procurement
  returned_on          date,
  status               text not null default 'pending',  -- pending | submitted | approved | approved_as_noted | revise_resubmit | rejected
  external_ref         text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists submittals_project_idx on submittals (project_id);

-- Delays ---------------------------------------------------------------------------
-- A delay event and the extension of time notice the head contract demands
-- inside a time bar. A notice not given in time can lose the time and put
-- liquidated damages on the head contractor.

create table if not exists delays (
  id              uuid primary key default gen_random_uuid(),
  ref             text unique,                    -- EOT-901
  project_id      uuid not null references projects(id) on delete cascade,
  rfi_id          uuid references rfis(id) on delete set null,
  cause           text not null,
  started_on      date not null,
  notice_due_on   date not null,
  notified_on     date,
  days_claimed    int,
  days_granted    int,
  status          text not null default 'open',   -- open | notified | granted | rejected
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists delays_project_idx on delays (project_id);

-- Defects ---------------------------------------------------------------------------
-- The punch list: what is wrong, where, whose it is, and by when.

create table if not exists defects (
  id           uuid primary key default gen_random_uuid(),
  ref          text unique,                       -- DEF-1001
  project_id   uuid not null references projects(id) on delete cascade,
  company_id   uuid references companies(id) on delete set null,
  location     text,
  description  text not null,
  raised_on    date not null default current_date,
  due_on       date,
  closed_on    date,
  status       text not null default 'open',      -- open | closed
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists defects_project_idx on defects (project_id);

-- The site diary ---------------------------------------------------------------------------
-- Weather, labour on site, instructions, visitors, delays. In an extension of
-- time or a delay dispute, the diary is the evidence.

create table if not exists diary (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete set null,
  company_id  uuid references companies(id) on delete set null,
  noted_on    date not null default current_date,
  weather     text,
  workers     int,
  note        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists diary_project_idx on diary (project_id);

-- Public holidays ---------------------------------------------------------------------------
-- Days the working-day clocks skip, on top of weekends and the statutory
-- Christmas periods (which the CLI applies by jurisdiction). Add your region's.

create table if not exists holidays (
  day           date primary key,
  jurisdiction  text not null default 'ALL',     -- ALL | NZ | NSW | QLD
  name          text not null
);

-- updated_at triggers ------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['companies','projects','budget_lines','commitments','rfis','variations','head_claims','sub_claims','submittals','delays','defects']
  loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
end
$$;

-- =====================================================================================
-- Views: the questions a project manager and a commercial manager ask every week.
-- =====================================================================================

-- Cost report per cost line: budget, committed, pending, actual, forecast final.
-- Forecast final never sits below the budget or the money already promised.
create or replace view v_cost as
select
  bl.id as line_id,
  p.id as project_id,
  p.ref as project_ref,
  p.name as project,
  p.status as project_status,
  bl.cost_code,
  bl.name as line,
  bl.budget,
  (select coalesce(sum(c.value), 0) from commitments c where c.budget_line_id = bl.id and c.status in ('executed', 'complete'))
    + (select coalesce(sum(v.cost), 0) from variations v join commitments c on c.id = v.commitment_id
        where c.budget_line_id = bl.id and v.status = 'approved') as committed,
  (select coalesce(sum(v.cost), 0) from variations v join commitments c on c.id = v.commitment_id
    where c.budget_line_id = bl.id and v.status in ('instructed', 'submitted')) as pending,
  (select coalesce(sum(co.amount), 0) from costs co where co.budget_line_id = bl.id) as direct,
  (select coalesce(sum(sc.scheduled_amount), 0) from sub_claims sc join commitments c on c.id = sc.commitment_id
    where c.budget_line_id = bl.id) as certified,
  bl.forecast_final as forecast_override
from budget_lines bl
join projects p on p.id = bl.project_id;

create or replace view v_cost_report as
select
  x.*,
  x.certified + x.direct as actual,
  greatest(coalesce(x.forecast_override, 0), x.budget, x.committed + x.pending + x.direct) as forecast_final,
  x.budget - greatest(coalesce(x.forecast_override, 0), x.budget, x.committed + x.pending + x.direct) as variance,
  case
    when greatest(coalesce(x.forecast_override, 0), x.committed + x.pending + x.direct) > x.budget then 'OVER'
    when x.budget > 0 and (x.committed + x.pending + x.direct) / x.budget > 0.95 then 'near'
    else 'ok'
  end as state
from v_cost x;

-- Projects with the whole commercial story on one line.
create or replace view v_projects as
select
  p.id as project_id,
  p.ref,
  p.name as project,
  cl.name as client,
  cl.id as client_id,
  p.site_address,
  p.jurisdiction,
  p.contract_form,
  p.status,
  p.tender_due_on,
  p.contract_value,
  p.started_on,
  p.pc_due_on,
  p.pc_on,
  p.defects_ends_on,
  p.retention_account,
  p.sub_retention_pct,
  p.eot_notice_days,
  (select coalesce(sum(v.price), 0) from variations v where v.project_id = p.id and v.status = 'approved') as approved_variations,
  (select coalesce(sum(v.price), 0) from variations v where v.project_id = p.id and v.status in ('instructed', 'submitted')) as pending_variations,
  p.contract_value + (select coalesce(sum(v.price), 0) from variations v where v.project_id = p.id and v.status = 'approved') as revised_contract,
  (select coalesce(sum(h.amount), 0) from head_claims h where h.project_id = p.id) as claimed,
  (select coalesce(sum(h.amount_paid), 0) from head_claims h where h.project_id = p.id) as paid,
  (select coalesce(sum(coalesce(h.scheduled_amount, h.amount) - h.retention_held - h.amount_paid), 0) from head_claims h where h.project_id = p.id and h.status <> 'paid') as owed_to_us,
  (select coalesce(sum(h.retention_held), 0) from head_claims h where h.project_id = p.id) as retention_held_by_client,
  (select coalesce(sum(sc.retention_withheld), 0) from sub_claims sc join commitments c on c.id = sc.commitment_id where c.project_id = p.id) as retention_we_hold,
  (select coalesce(sum(r.budget), 0) from v_cost_report r where r.project_id = p.id) as budget_total,
  (select coalesce(sum(r.committed), 0) from v_cost_report r where r.project_id = p.id) as committed,
  (select coalesce(sum(r.actual), 0) from v_cost_report r where r.project_id = p.id) as actual,
  (select coalesce(sum(r.forecast_final), 0) from v_cost_report r where r.project_id = p.id) as forecast_cost,
  p.contract_value + (select coalesce(sum(v.price), 0) from variations v where v.project_id = p.id and v.status = 'approved')
    - (select coalesce(sum(r.forecast_final), 0) from v_cost_report r where r.project_id = p.id) as forecast_margin,
  (select count(*) from rfis r where r.project_id = p.id and r.status = 'open') as open_rfis,
  (select count(*) from defects d where d.project_id = p.id and d.status = 'open') as open_defects,
  (select max(d.noted_on) from diary d where d.project_id = p.id) as last_diary_on,
  (current_date - coalesce((select max(d.noted_on) from diary d where d.project_id = p.id), p.started_on, p.awarded_on)) as days_quiet
from projects p
join companies cl on cl.id = p.client_id;

-- Subcontracts with the money and the insurance on one line.
create or replace view v_commitments as
select
  c.id as commitment_id,
  c.ref,
  p.ref as project_ref,
  p.project,
  p.status as project_status,
  co.id as company_id,
  co.name as company,
  co.trade,
  c.title,
  c.kind,
  bl.cost_code,
  c.value,
  (select coalesce(sum(v.cost), 0) from variations v where v.commitment_id = c.id and v.status = 'approved') as approved_variations,
  c.value + (select coalesce(sum(v.cost), 0) from variations v where v.commitment_id = c.id and v.status = 'approved') as revised_value,
  (select coalesce(sum(sc.claimed_amount), 0) from sub_claims sc where sc.commitment_id = c.id) as claimed,
  (select coalesce(sum(sc.scheduled_amount), 0) from sub_claims sc where sc.commitment_id = c.id) as certified,
  (select coalesce(sum(sc.amount_paid), 0) from sub_claims sc where sc.commitment_id = c.id) as paid,
  (select coalesce(sum(sc.retention_withheld), 0) from sub_claims sc where sc.commitment_id = c.id) as retention_withheld,
  c.status,
  c.executed_on,
  co.liability_expires_on,
  case
    when co.liability_expires_on is null then 'NONE'
    when co.liability_expires_on < current_date then 'EXPIRED'
    when co.liability_expires_on <= current_date + 30 then 'expiring'
    else 'current'
  end as insurance
from commitments c
join v_projects p on p.project_id = c.project_id
join companies co on co.id = c.company_id
join budget_lines bl on bl.id = c.budget_line_id;

-- Subcontractor claims with the schedule clock loud.
create or replace view v_sub_claims as
select
  sc.id as sub_claim_id,
  sc.ref,
  c.ref as commitment_ref,
  c.project_ref,
  c.project,
  c.company,
  c.trade,
  sc.claim_no,
  sc.received_on,
  sc.claimed_amount,
  sc.schedule_due_on,
  (sc.schedule_due_on - current_date) as days_left,
  sc.scheduled_amount,
  sc.schedule_issued_on,
  sc.schedule_reasons,
  sc.retention_withheld,
  sc.payment_due_on,
  sc.paid_on,
  sc.amount_paid,
  sc.status,
  case
    when sc.status = 'paid' then 'paid'
    when sc.schedule_issued_on is not null and sc.schedule_issued_on > sc.schedule_due_on then 'scheduled LATE'
    when sc.schedule_issued_on is not null then 'scheduled'
    when sc.schedule_due_on < current_date then 'MISSED'
    when sc.schedule_due_on <= current_date + 3 then 'DUE NOW'
    else 'awaiting schedule'
  end as state
from sub_claims sc
join v_commitments c on c.commitment_id = sc.commitment_id;

-- Our progress claims with the client's clock and the money owed.
create or replace view v_head_claims as
select
  h.id as claim_id,
  h.ref,
  p.ref as project_ref,
  p.project,
  p.client,
  p.jurisdiction,
  h.claim_no,
  h.served_on,
  h.amount,
  h.supporting_statement,
  h.schedule_due_on,
  h.scheduled_amount,
  h.schedule_received_on,
  h.schedule_reasons,
  h.retention_held,
  h.payment_due_on,
  h.paid_on,
  h.amount_paid,
  coalesce(h.scheduled_amount, h.amount) - h.retention_held - h.amount_paid as outstanding,
  (current_date - h.payment_due_on) as days_overdue,
  h.status,
  case
    when h.status = 'paid' then 'paid'
    when h.payment_due_on < current_date then 'OVERDUE'
    when h.schedule_received_on is null and h.schedule_due_on < current_date then 'no schedule: full amount due'
    when h.schedule_received_on is not null then 'scheduled'
    else 'served'
  end as state
from head_claims h
join v_projects p on p.project_id = h.project_id;

create or replace view v_variations as
select
  v.id as variation_id,
  v.ref,
  p.ref as project_ref,
  p.project,
  p.client,
  v.title,
  v.origin,
  v.instruction_ref,
  v.instructed_on,
  v.price,
  v.cost,
  v.price - v.cost as margin,
  v.status,
  v.submitted_on,
  v.decided_on,
  v.approved_by,
  c.ref as commitment_ref,
  case when v.status = 'instructed' then current_date - v.instructed_on
       when v.status = 'submitted' then current_date - v.submitted_on end as days_waiting
from variations v
join v_projects p on p.project_id = v.project_id
left join commitments c on c.id = v.commitment_id;

create or replace view v_rfis as
select
  r.id as rfi_id,
  r.ref,
  p.ref as project_ref,
  p.project,
  co.name as to_company,
  r.subject,
  r.asked_on,
  r.due_on,
  r.answered_on,
  r.cost_impact,
  r.time_impact,
  r.status,
  (current_date - r.due_on) as days_overdue,
  case
    when r.status <> 'open' then r.status
    when r.due_on < current_date then 'OVERDUE'
    else 'open'
  end as state
from rfis r
join v_projects p on p.project_id = r.project_id
left join companies co on co.id = r.to_company_id;

create or replace view v_submittals as
select
  s.id as submittal_id,
  s.ref,
  p.ref as project_ref,
  p.project,
  c.ref as commitment_ref,
  sub.name as from_company,
  rv.name as reviewer,
  s.title,
  s.spec_section,
  s.submitted_on,
  s.return_due_on,
  s.required_by,
  s.returned_on,
  s.status,
  (current_date - s.required_by) as days_late,
  case
    when s.status in ('approved', 'approved_as_noted') then 'approved'
    when s.required_by < current_date then 'LATE for procurement'
    when s.required_by <= current_date + 7 then 'at risk'
    when s.status = 'revise_resubmit' then 'resubmit'
    else s.status
  end as state
from submittals s
join v_projects p on p.project_id = s.project_id
left join commitments c on c.id = s.commitment_id
left join companies sub on sub.id = c.company_id
left join companies rv on rv.id = s.reviewer_id;

create or replace view v_delays as
select
  d.id as delay_id,
  d.ref,
  p.ref as project_ref,
  p.project,
  d.cause,
  d.started_on,
  d.notice_due_on,
  (d.notice_due_on - current_date) as days_left,
  d.notified_on,
  d.days_claimed,
  d.days_granted,
  d.status,
  r.ref as rfi_ref,
  case
    when d.status <> 'open' then d.status
    when d.notice_due_on < current_date then 'NOTICE LATE'
    when d.notice_due_on <= current_date + 7 then 'NOTICE DUE'
    else 'open'
  end as state
from delays d
join v_projects p on p.project_id = d.project_id
left join rfis r on r.id = d.rfi_id;

create or replace view v_defects as
select
  d.id as defect_id,
  d.ref,
  p.ref as project_ref,
  p.project,
  co.name as company,
  d.location,
  d.description,
  d.raised_on,
  d.due_on,
  d.closed_on,
  d.status,
  (current_date - d.due_on) as days_overdue,
  case
    when d.status = 'closed' then 'closed'
    when d.due_on < current_date then 'OVERDUE'
    else 'open'
  end as state
from defects d
join v_projects p on p.project_id = d.project_id
left join companies co on co.id = d.company_id;

create or replace view v_companies as
select
  c.id as company_id,
  c.name,
  c.kind,
  c.trade,
  c.contact_name,
  c.phone,
  c.email,
  c.liability_expires_on,
  (c.liability_expires_on - current_date) as days_to_expiry,
  case
    when c.kind not in ('subcontractor', 'supplier') then ''
    when c.liability_expires_on is null then 'NONE'
    when c.liability_expires_on < current_date then 'EXPIRED'
    when c.liability_expires_on <= current_date + 30 then 'expiring'
    else 'current'
  end as insurance,
  c.licence_number,
  c.status,
  (select count(*) from commitments m join projects p on p.id = m.project_id
    where m.company_id = c.id and m.status = 'executed' and p.status = 'active') as live_subcontracts
from companies c;

-- Everything that wants a decision, one union, worst first. A missed payment
-- schedule outranks everything: the Act has already made the full claim payable.
create or replace view v_attention as
select 'schedule_missed' as reason, s.ref as label, s.company as who, s.project_ref || ' ' || s.project as place,
       (current_date - s.schedule_due_on) as days,
       to_char(s.claimed_amount, 'FM999,999,990') || ' claimed ' || to_char(s.received_on, 'YYYY-MM-DD') ||
       ', schedule was due ' || to_char(s.schedule_due_on, 'YYYY-MM-DD') || ' and none went out: the full amount is now payable. Call your adviser today' as detail
from v_sub_claims s where s.state = 'MISSED'
union all
select 'schedule_due', s.ref, s.company, s.project_ref || ' ' || s.project,
       s.days_left,
       to_char(s.claimed_amount, 'FM999,999,990') || ' claimed, payment schedule due ' || to_char(s.schedule_due_on, 'YYYY-MM-DD') ||
       ' (' || s.days_left || ' days): assess it and issue the schedule, with reasons for any difference'
from v_sub_claims s where s.state = 'DUE NOW'
union all
select 'delay_notice', d.ref, '', d.project_ref || ' ' || d.project,
       d.days_left,
       d.cause || ': notice ' || case when d.days_left < 0 then 'was due ' || to_char(d.notice_due_on, 'YYYY-MM-DD') || ', ' || abs(d.days_left) || ' days ago'
                                     else 'due ' || to_char(d.notice_due_on, 'YYYY-MM-DD') || ', ' || d.days_left || ' days left' end ||
       '. No notice, no time'
from v_delays d where d.state in ('NOTICE LATE', 'NOTICE DUE')
union all
select 'claim_overdue', h.ref, h.client, h.project_ref || ' ' || h.project,
       h.days_overdue,
       to_char(h.outstanding, 'FM999,999,990') || ' due ' || to_char(h.payment_due_on, 'YYYY-MM-DD') || ', ' || h.days_overdue ||
       ' days overdue. The Act gives you remedies; use them'
from v_head_claims h where h.state = 'OVERDUE'
union all
select 'variation_unsubmitted', v.ref, v.client, v.project_ref || ' ' || v.project,
       v.days_waiting,
       v.title || ', instructed ' || to_char(v.instructed_on, 'YYYY-MM-DD') || ', about ' || to_char(v.price, 'FM999,999,990') ||
       ' and never priced to the client: instructed work you have not submitted is work you may never be paid for'
from v_variations v where v.status = 'instructed' and v.days_waiting > 14
union all
select 'rfi_overdue', r.ref, coalesce(r.to_company, ''), r.project_ref || ' ' || r.project,
       r.days_overdue,
       r.subject || ': answer was due ' || to_char(r.due_on, 'YYYY-MM-DD') ||
       case when r.time_impact then '. It is holding work: log the delay' else '' end
from v_rfis r where r.state = 'OVERDUE'
union all
select 'submittal_late', s.ref, coalesce(s.reviewer, ''), s.project_ref || ' ' || s.project,
       s.days_late,
       s.title || ': approval was needed by ' || to_char(s.required_by, 'YYYY-MM-DD') || ' for procurement and it is still ' || s.status
from v_submittals s where s.state = 'LATE for procurement'
union all
select 'insurance_expired', c.company, c.trade, c.project_ref || ' ' || c.project,
       (current_date - c.liability_expires_on),
       'public liability ' || case when c.liability_expires_on is null then 'NOT ON RECORD' else 'expired ' || to_char(c.liability_expires_on, 'YYYY-MM-DD') end ||
       ' on a live subcontract (' || c.ref || '): an incident today is uninsured'
from v_commitments c where c.status = 'executed' and c.project_status = 'active' and c.insurance in ('EXPIRED', 'NONE')
union all
select 'cost_over', r.project_ref, r.cost_code || ' ' || r.line, r.project,
       null,
       'forecast final ' || to_char(r.forecast_final, 'FM999,999,990') || ' against ' || to_char(r.budget, 'FM999,999,990') ||
       ' budgeted (' || to_char(-r.variance, 'FM999,999,990') || ' over): recover it through a variation or name it in the margin'
from v_cost_report r where r.state = 'OVER' and r.project_status = 'active'
union all
select 'defect_overdue', d.ref, coalesce(d.company, ''), d.project_ref || ' ' || coalesce(d.location, ''),
       d.days_overdue,
       d.description || ': due ' || to_char(d.due_on, 'YYYY-MM-DD') || ', still open. Open defects hold the retention'
from v_defects d where d.state = 'OVERDUE'
union all
select 'retention_release', p.ref, p.client, p.project,
       (p.defects_ends_on - current_date),
       to_char(p.retention_held_by_client, 'FM999,999,990') || ' retention held by the client, defects period ends ' ||
       to_char(p.defects_ends_on, 'YYYY-MM-DD') || ': close the defects and diarise the release claim'
from v_projects p where p.status = 'defects' and p.retention_held_by_client > 0 and p.defects_ends_on <= current_date + 30
union all
select 'diary_quiet', p.ref, p.client, p.project,
       p.days_quiet,
       'no site diary for ' || p.days_quiet || ' days: in an extension of time claim, the diary is the evidence'
from v_projects p where p.status = 'active' and p.days_quiet > 3
union all
select 'tender_due', p.ref, p.client, p.project,
       (p.tender_due_on - current_date),
       'tender closes ' || to_char(p.tender_due_on, 'YYYY-MM-DD') || ' at about ' || to_char(p.contract_value, 'FM999,999,990')
from v_projects p where p.status = 'tender' and p.tender_due_on <= current_date + 7
union all
select 'insurance_expiring', c.company, c.trade, c.project_ref || ' ' || c.project,
       (c.liability_expires_on - current_date),
       'public liability expires ' || to_char(c.liability_expires_on, 'YYYY-MM-DD') || ': get the renewal certificate before it lapses'
from v_commitments c where c.status = 'executed' and c.project_status = 'active' and c.insurance = 'expiring';
