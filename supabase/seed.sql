-- Demo data for construction-projects-for-claude-code.
-- Ridgeline Construction Ltd, a fictional Hamilton commercial head contractor:
-- four clients, two consultants, seven subcontractors, four projects (two
-- active, one in its defects period, one at tender), cost plans, subcontracts,
-- variations, claims both ways, RFIs, submittals, delays, defects and a diary.
--
-- Deliberately messy, so the attention list has something to say:
--   an electrical subcontractor's $96,300 claim whose payment schedule was due yesterday, and none went out
--   a steel subcontractor's $214,600 claim with the schedule due in 2 days
--   a delay from an unanswered RFI with the extension of time notice due in 4 days
--   a latent ground condition delay whose notice window closed 12 days ago
--   our $985,000 scheduled progress claim 6 days past its payment date
--   a dock pit relocation instructed 34 days ago and never priced to the client
--   a structural RFI 12 days overdue that is holding the steel
--   sprinkler shop drawings 5 days late for procurement
--   the roofer on site with public liability expired 9 days ago
--   structural steel forecast $62,000 over budget, preliminaries $30,000 over
--   a door closer defect 21 days overdue and $92,500 retention waiting on the defects period
--   the science block's site diary silent for 5 days, and retentions held with no trust account on record
--   a $12.6m retail tender closing in 6 days
--
-- Dates are relative to current_date. Ids are derived from names with
-- seed_uuid, and every insert is ON CONFLICT DO NOTHING, so running it twice
-- changes nothing.
--
-- Companies, projects, people and events are DEMO VALUES for a fictional
-- business. No real person, company, site or contract is depicted.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

-- Companies ------------------------------------------------------------------------

insert into companies (id, name, kind, trade, contact_name, email, phone, liability_expires_on, licence_number) values
  (seed_uuid('co:terapa'),    'Te Rapa Logistics Property Ltd', 'client',        null,                  'Dana Whitaker', 'dana@terapalogistics.example.nz',  '021 555 0201', null, null),
  (seed_uuid('co:hillcrest'), 'Hillcrest College Trust',        'client',        null,                  'Rewi Tane',     'rewi.tane@hillcrest.example.nz',   '027 555 0202', null, null),
  (seed_uuid('co:bayfront'),  'Bayfront Office Holdings Ltd',   'client',        null,                  'Claire Moody',  'claire@bayfront.example.nz',       '021 555 0203', null, null),
  (seed_uuid('co:cambridge'), 'Cambridge Retail Partners',      'client',        null,                  'Sanjay Patel',  'sanjay@cambridgeretail.example.nz','021 555 0204', null, null),
  (seed_uuid('co:structura'), 'Structura Consulting Engineers', 'consultant',    'structural engineer', 'Mei Lin',       'mei@structura.example.nz',         '07 555 0205',  null, null),
  (seed_uuid('co:arcline'),   'Arcline Architects',             'consultant',    'architect',           'Ollie Grant',   'ollie@arcline.example.nz',         '07 555 0206',  null, null),
  (seed_uuid('co:steel'),     'Waikato Steel Erectors',         'subcontractor', 'structural steel',    'Barry Kemp',    'barry@waikatosteel.example.nz',    '027 555 0207', current_date + 200, null),
  (seed_uuid('co:concrete'),  'Firmbase Concrete',              'subcontractor', 'concrete',            'Hemi Walker',   'hemi@firmbase.example.nz',         '027 555 0208', current_date + 150, null),
  (seed_uuid('co:roofing'),   'Kaimai Roofing and Cladding',    'subcontractor', 'roofing and cladding','Stu Rangi',     'stu@kaimairoofing.example.nz',     '027 555 0209', current_date - 9,   null),
  (seed_uuid('co:electric'),  'Voltline Electrical',            'subcontractor', 'electrical',          'Aroha Bell',    'aroha@voltline.example.nz',        '021 555 0210', current_date + 90,  null),
  (seed_uuid('co:fire'),      'Sentinel Fire Protection',       'subcontractor', 'fire protection',     'Greg Fox',      'greg@sentinelfire.example.nz',     '021 555 0211', current_date + 22,  null),
  (seed_uuid('co:hydraulic'), 'Plumbline Hydraulics',           'subcontractor', 'hydraulics',          'Nina Soper',    'nina@plumbline.example.nz',        '027 555 0212', current_date + 300, null),
  (seed_uuid('co:interiors'), 'Totara Interiors',               'subcontractor', 'interiors',           'Lee Parata',    'lee@totarainteriors.example.nz',   '027 555 0213', current_date + 120, null)
on conflict do nothing;

-- Projects ------------------------------------------------------------------------

insert into projects (id, ref, name, client_id, site_address, jurisdiction, contract_form, status, tender_due_on, contract_value,
                      awarded_on, started_on, pc_due_on, pc_on, defects_ends_on, sub_retention_pct, retention_account, eot_notice_days) values
  (seed_uuid('prj:201'), 'PRJ-201', 'Te Rapa Distribution Centre', seed_uuid('co:terapa'),    '120 Te Rapa Road, Hamilton',        'NZ', 'NZS 3910:2013', 'active',  null,               8400000,
   current_date - 160, current_date - 140, current_date + 120, null, null, 5, 'Retentions trust account, BNZ (demo)', 20),
  (seed_uuid('prj:202'), 'PRJ-202', 'Hillcrest College Science Block', seed_uuid('co:hillcrest'), '4 College Road, Hillcrest, Hamilton', 'NZ', 'NZS 3910:2013', 'active', null,           4950000,
   current_date - 105, current_date - 90,  current_date + 150, null, null, 5, null, 20),
  (seed_uuid('prj:203'), 'PRJ-203', 'Bayfront Office Refurbishment', seed_uuid('co:bayfront'),  '18 The Strand, Tauranga',          'NZ', 'NZS 3910:2013', 'defects', null,             1850000,
   current_date - 330, current_date - 300, current_date - 75, current_date - 70, current_date + 20, 5, 'Retentions trust account, BNZ (demo)', 20),
  (seed_uuid('prj:204'), 'PRJ-204', 'Cambridge Retail Centre', seed_uuid('co:cambridge'),       '60 Victoria Street, Cambridge',    'NZ', 'NZS 3910:2013', 'tender',  current_date + 6,  12600000,
   null, null, null, null, null, 5, null, 20)
on conflict do nothing;

-- Cost plans ------------------------------------------------------------------------

insert into budget_lines (id, project_id, cost_code, name, budget, forecast_final) values
  (seed_uuid('bl:201:01'), seed_uuid('prj:201'), '01', 'Preliminaries and site',    1180000, 1210000),
  (seed_uuid('bl:201:02'), seed_uuid('prj:201'), '02', 'Earthworks and civil',       540000, null),
  (seed_uuid('bl:201:03'), seed_uuid('prj:201'), '03', 'Concrete',                  1050000, null),
  (seed_uuid('bl:201:04'), seed_uuid('prj:201'), '04', 'Structural steel',          1560000, null),
  (seed_uuid('bl:201:05'), seed_uuid('prj:201'), '05', 'Roofing and cladding',       820000, null),
  (seed_uuid('bl:201:06'), seed_uuid('prj:201'), '06', 'Electrical',                 690000, null),
  (seed_uuid('bl:201:07'), seed_uuid('prj:201'), '07', 'Fire protection',            330000, null),
  (seed_uuid('bl:201:08'), seed_uuid('prj:201'), '08', 'Hydraulics',                 280000, null),
  (seed_uuid('bl:201:09'), seed_uuid('prj:201'), '09', 'Fit-out and finishes',       410000, null),
  (seed_uuid('bl:201:10'), seed_uuid('prj:201'), '10', 'External works and paving',  600000, null),
  (seed_uuid('bl:201:11'), seed_uuid('prj:201'), '11', 'Design and consultants',     400000, null),
  (seed_uuid('bl:202:01'), seed_uuid('prj:202'), '01', 'Preliminaries and site',     620000, null),
  (seed_uuid('bl:202:02'), seed_uuid('prj:202'), '02', 'Structure',                 1480000, null),
  (seed_uuid('bl:202:03'), seed_uuid('prj:202'), '03', 'Envelope',                   820000, null),
  (seed_uuid('bl:202:04'), seed_uuid('prj:202'), '04', 'Electrical',                 430000, null),
  (seed_uuid('bl:202:05'), seed_uuid('prj:202'), '05', 'Hydraulics',                 280000, null),
  (seed_uuid('bl:202:06'), seed_uuid('prj:202'), '06', 'Interiors',                  560000, null),
  (seed_uuid('bl:202:07'), seed_uuid('prj:202'), '07', 'Laboratory fit-out',         310000, null),
  (seed_uuid('bl:203:01'), seed_uuid('prj:203'), '01', 'Preliminaries and site',     160000, null),
  (seed_uuid('bl:203:02'), seed_uuid('prj:203'), '02', 'Strip-out',                  140000, null),
  (seed_uuid('bl:203:03'), seed_uuid('prj:203'), '03', 'Interiors',                  400000, null),
  (seed_uuid('bl:203:04'), seed_uuid('prj:203'), '04', 'Building services',          520000, null),
  (seed_uuid('bl:203:05'), seed_uuid('prj:203'), '05', 'Finishes',                   450000, null)
on conflict do nothing;

-- Commitments ------------------------------------------------------------------------

insert into commitments (id, ref, project_id, company_id, budget_line_id, title, value, status, executed_on) values
  (seed_uuid('sc:301'), 'SC-301', seed_uuid('prj:201'), seed_uuid('co:steel'),     seed_uuid('bl:201:04'), 'Structural steel supply and erection', 1585000, 'executed', current_date - 130),
  (seed_uuid('sc:302'), 'SC-302', seed_uuid('prj:201'), seed_uuid('co:concrete'),  seed_uuid('bl:201:03'), 'Slabs, footings and dock pits',         985000, 'executed', current_date - 135),
  (seed_uuid('sc:303'), 'SC-303', seed_uuid('prj:201'), seed_uuid('co:roofing'),   seed_uuid('bl:201:05'), 'Roofing and wall cladding',             768000, 'executed', current_date - 100),
  (seed_uuid('sc:304'), 'SC-304', seed_uuid('prj:201'), seed_uuid('co:electric'),  seed_uuid('bl:201:06'), 'Electrical services',                   655000, 'executed', current_date - 110),
  (seed_uuid('sc:305'), 'SC-305', seed_uuid('prj:201'), seed_uuid('co:fire'),      seed_uuid('bl:201:07'), 'Sprinkler and fire alarm systems',      318000, 'executed', current_date - 95),
  (seed_uuid('sc:306'), 'SC-306', seed_uuid('prj:202'), seed_uuid('co:electric'),  seed_uuid('bl:202:04'), 'Electrical services',                   412000, 'executed', current_date - 80),
  (seed_uuid('sc:307'), 'SC-307', seed_uuid('prj:202'), seed_uuid('co:interiors'), seed_uuid('bl:202:06'), 'Partitions, ceilings and joinery',      540000, 'executed', current_date - 75),
  (seed_uuid('sc:308'), 'SC-308', seed_uuid('prj:202'), seed_uuid('co:hydraulic'), seed_uuid('bl:202:05'), 'Hydraulics and lab gases',              265000, 'executed', current_date - 78),
  (seed_uuid('sc:309'), 'SC-309', seed_uuid('prj:203'), seed_uuid('co:interiors'), seed_uuid('bl:203:03'), 'Office interiors',                      380000, 'complete', current_date - 290)
on conflict do nothing;

-- RFIs ------------------------------------------------------------------------

insert into rfis (id, ref, project_id, to_company_id, subject, question, asked_on, due_on, answered_on, answer, cost_impact, time_impact, status) values
  (seed_uuid('rfi:401'), 'RFI-401', seed_uuid('prj:201'), seed_uuid('co:structura'), 'Mezzanine connection detail at gridline F',
   'Drawing S-210 shows a moment connection the fabricator cannot make with the specified plate. Confirm the connection or issue a revised detail.',
   current_date - 21, current_date - 12, null, null, true, true, 'open'),
  (seed_uuid('rfi:402'), 'RFI-402', seed_uuid('prj:201'), seed_uuid('co:structura'), 'Mezzanine bracing at gridlines C to E',
   'Bracing shown on S-205 clashes with the racking layout. Confirm a revised bracing arrangement.',
   current_date - 48, current_date - 41, current_date - 41, 'Revised bracing per SK-12. Additional members as marked.', true, false, 'answered'),
  (seed_uuid('rfi:403'), 'RFI-403', seed_uuid('prj:201'), seed_uuid('co:arcline'),   'Dock canopy flashing detail',
   'Detail A-501/3 does not show the canopy to wall flashing. Confirm the detail.',
   current_date - 6, current_date + 1, null, null, false, false, 'open'),
  (seed_uuid('rfi:404'), 'RFI-404', seed_uuid('prj:202'), seed_uuid('co:arcline'),   'Fume cupboard exhaust route through level 2 slab',
   'The exhaust riser on M-301 passes through a post-tensioned band. Confirm a new route or a coring approval.',
   current_date - 10, current_date - 3, null, null, true, false, 'open')
on conflict do nothing;

-- Variations ------------------------------------------------------------------------

insert into variations (id, ref, project_id, commitment_id, rfi_id, title, origin, instruction_ref, instructed_on, price, cost, status, submitted_on, decided_on, approved_by) values
  (seed_uuid('var:501'), 'VAR-501', seed_uuid('prj:201'), seed_uuid('sc:301'), seed_uuid('rfi:402'), 'Additional mezzanine bracing (RFI-402)', 'rfi', null,
   current_date - 40, 52000, 37000, 'approved', current_date - 35, current_date - 28, 'Dana Whitaker, by email'),
  (seed_uuid('var:502'), 'VAR-502', seed_uuid('prj:201'), seed_uuid('sc:302'), null, 'Relocate dock leveller pits', 'client_instruction', 'SI-014',
   current_date - 34, 48500, 36000, 'instructed', null, null, null),
  (seed_uuid('var:503'), 'VAR-503', seed_uuid('prj:201'), seed_uuid('sc:304'), null, 'Upgrade cable tray in the chiller zone', 'design_change', 'SI-019',
   current_date - 18, 18400, 14200, 'submitted', current_date - 12, null, null),
  (seed_uuid('var:504'), 'VAR-504', seed_uuid('prj:202'), seed_uuid('sc:308'), null, 'Additional laboratory gas outlets', 'client_instruction', 'SI-006',
   current_date - 30, 26800, 19500, 'approved', current_date - 26, current_date - 20, 'Rewi Tane, signed variation'),
  (seed_uuid('var:505'), 'VAR-505', seed_uuid('prj:202'), null, null, 'Acoustic ceiling upgrade to music rooms', 'client_instruction', null,
   current_date - 28, 31000, 24000, 'rejected', current_date - 25, current_date - 15, null)
on conflict do nothing;

-- Progress claims out ------------------------------------------------------------------------

insert into head_claims (id, ref, project_id, claim_no, served_on, amount, schedule_due_on, scheduled_amount, schedule_received_on, schedule_reasons,
                         retention_held, payment_due_on, paid_on, amount_paid, status) values
  (seed_uuid('pc:601'), 'PC-601', seed_uuid('prj:201'), 1, current_date - 125,  640000, current_date - 97,  640000, current_date - 110, null, 32000, current_date - 97,  current_date - 100,  608000, 'paid'),
  (seed_uuid('pc:602'), 'PC-602', seed_uuid('prj:201'), 2, current_date - 95,  1180000, current_date - 67, 1180000, current_date - 80,  null, 59000, current_date - 67,  current_date - 68,  1121000, 'paid'),
  (seed_uuid('pc:603'), 'PC-603', seed_uuid('prj:201'), 3, current_date - 64,  1420000, current_date - 36, 1420000, current_date - 50,  null, 71000, current_date - 36,  current_date - 38,  1349000, 'paid'),
  (seed_uuid('pc:604'), 'PC-604', seed_uuid('prj:201'), 4, current_date - 33,  1120000, current_date - 5,   985000, current_date - 18,
   'Structural steel assessed at 70 per cent complete, not 85 per cent as claimed.', 49250, current_date - 6, null, 0, 'scheduled'),
  (seed_uuid('pc:605'), 'PC-605', seed_uuid('prj:202'), 1, current_date - 60,   820000, current_date - 32,  820000, current_date - 45,  null, 41000, current_date - 32,  current_date - 35,   779000, 'paid'),
  (seed_uuid('pc:606'), 'PC-606', seed_uuid('prj:202'), 2, current_date - 30,   760000, current_date - 2,   760000, current_date - 12,  null, 38000, current_date + 2,  null, 0, 'scheduled'),
  (seed_uuid('pc:607'), 'PC-607', seed_uuid('prj:203'), 1, current_date - 200,  900000, current_date - 172, 900000, current_date - 185, null, 45000, current_date - 172, current_date - 174,  855000, 'paid'),
  (seed_uuid('pc:608'), 'PC-608', seed_uuid('prj:203'), 2, current_date - 110,  950000, current_date - 82,  950000, current_date - 95,  null, 47500, current_date - 82,  current_date - 84,   902500, 'paid')
on conflict do nothing;

-- Subcontractor claims in ------------------------------------------------------------------------

insert into sub_claims (id, ref, commitment_id, claim_no, received_on, claimed_amount, schedule_due_on, scheduled_amount, schedule_issued_on, schedule_reasons,
                        retention_withheld, payment_due_on, paid_on, amount_paid, status) values
  (seed_uuid('scl:701'), 'SCL-701', seed_uuid('sc:301'), 1, current_date - 58, 380000, current_date - 30, 380000, current_date - 45, null,
   19000, current_date - 30, current_date - 30, 361000, 'paid'),
  (seed_uuid('scl:702'), 'SCL-702', seed_uuid('sc:301'), 2, current_date - 26, 214600, current_date + 2, null, null, null,
   0, current_date + 2, null, 0, 'received'),
  (seed_uuid('scl:703'), 'SCL-703', seed_uuid('sc:304'), 1, current_date - 29, 96300, current_date - 1, null, null, null,
   0, current_date - 1, null, 0, 'received'),
  (seed_uuid('scl:704'), 'SCL-704', seed_uuid('sc:302'), 1, current_date - 40, 420000, current_date - 12, 398500, current_date - 25,
   'Slab F2 surface rework withheld pending remediation (defect notice DN-07).', 19925, current_date - 12, current_date - 12, 378575, 'paid'),
  (seed_uuid('scl:705'), 'SCL-705', seed_uuid('sc:303'), 1, current_date - 20, 188000, current_date + 8, null, null, null,
   0, current_date + 8, null, 0, 'received'),
  (seed_uuid('scl:706'), 'SCL-706', seed_uuid('sc:306'), 1, current_date - 35, 142000, current_date - 7, 130000, current_date - 20, null,
   6500, current_date - 7, current_date - 5, 123500, 'paid'),
  (seed_uuid('scl:707'), 'SCL-707', seed_uuid('sc:307'), 1, current_date - 8, 210000, current_date + 20, null, null, null,
   0, current_date + 20, null, 0, 'received')
on conflict do nothing;

-- Direct costs ------------------------------------------------------------------------

insert into costs (id, project_id, budget_line_id, incurred_on, supplier, invoice_ref, amount, note) values
  (seed_uuid('cost:1'), seed_uuid('prj:201'), seed_uuid('bl:201:01'), current_date - 30, 'Site staff and establishment', 'PAY-Q3', 612000, 'Site team, cranes, hoarding, amenities to date'),
  (seed_uuid('cost:2'), seed_uuid('prj:201'), seed_uuid('bl:201:02'), current_date - 90, 'Hautapu Earthmovers',         'HE-2231', 488000, 'Bulk earthworks and stormwater'),
  (seed_uuid('cost:3'), seed_uuid('prj:201'), seed_uuid('bl:201:11'), current_date - 45, 'Structura Consulting Engineers', 'SCE-118', 214000, 'Design and observation to date'),
  (seed_uuid('cost:4'), seed_uuid('prj:202'), seed_uuid('bl:202:01'), current_date - 20, 'Site staff and establishment', 'PAY-Q3', 280000, 'Site team and establishment to date'),
  (seed_uuid('cost:5'), seed_uuid('prj:202'), seed_uuid('bl:202:02'), current_date - 25, 'Waikato Precast',             'WP-7719', 610000, 'Precast panels and in-situ structure to date'),
  (seed_uuid('cost:6'), seed_uuid('prj:203'), seed_uuid('bl:203:01'), current_date - 80, 'Site staff and establishment', 'PAY-FIN', 158000, 'Final'),
  (seed_uuid('cost:7'), seed_uuid('prj:203'), seed_uuid('bl:203:04'), current_date - 90, 'Coastal Building Services',   'CBS-311', 505000, 'Mechanical and electrical, final account')
on conflict do nothing;

-- Submittals ------------------------------------------------------------------------

insert into submittals (id, ref, project_id, commitment_id, reviewer_id, title, spec_section, submitted_on, return_due_on, required_by, returned_on, status) values
  (seed_uuid('sub:801'), 'SUB-801', seed_uuid('prj:201'), seed_uuid('sc:305'), seed_uuid('co:arcline'), 'Sprinkler shop drawings, zones A and B', '15 30 00',
   current_date - 24, current_date - 10, current_date - 5, null, 'submitted'),
  (seed_uuid('sub:802'), 'SUB-802', seed_uuid('prj:201'), seed_uuid('sc:303'), seed_uuid('co:arcline'), 'Roof cladding colour and profile samples', '07 40 00',
   current_date - 45, current_date - 35, current_date - 20, current_date - 30, 'approved'),
  (seed_uuid('sub:803'), 'SUB-803', seed_uuid('prj:202'), seed_uuid('sc:307'), seed_uuid('co:arcline'), 'Lab bench and fume cupboard product data', '12 35 53',
   current_date - 9, current_date + 1, current_date + 6, null, 'submitted'),
  (seed_uuid('sub:804'), 'SUB-804', seed_uuid('prj:201'), seed_uuid('sc:304'), seed_uuid('co:structura'), 'Main switchboard shop drawings', '26 24 13',
   current_date - 14, current_date - 4, current_date + 20, current_date - 4, 'revise_resubmit')
on conflict do nothing;

-- Delays ------------------------------------------------------------------------

insert into delays (id, ref, project_id, rfi_id, cause, started_on, notice_due_on, notified_on, days_claimed, days_granted, status) values
  (seed_uuid('eot:901'), 'EOT-901', seed_uuid('prj:201'), seed_uuid('rfi:401'), 'Steel erection held at gridlines E to G awaiting RFI-401',
   current_date - 24, current_date + 4, null, null, null, 'open'),
  (seed_uuid('eot:902'), 'EOT-902', seed_uuid('prj:201'), null, 'Six days lost to rain during earthworks',
   current_date - 70, current_date - 42, current_date - 60, 6, 4, 'granted'),
  (seed_uuid('eot:903'), 'EOT-903', seed_uuid('prj:202'), null, 'Uncharted stormwater main found under the east footings',
   current_date - 40, current_date - 12, null, null, null, 'open')
on conflict do nothing;

-- Defects ------------------------------------------------------------------------

insert into defects (id, ref, project_id, company_id, location, description, raised_on, due_on, closed_on, status) values
  (seed_uuid('def:1001'), 'DEF-1001', seed_uuid('prj:203'), seed_uuid('co:interiors'), 'Level 2 meeting room', 'Door closer failing, door does not latch', current_date - 40, current_date - 21, null, 'open'),
  (seed_uuid('def:1002'), 'DEF-1002', seed_uuid('prj:203'), seed_uuid('co:interiors'), 'Lift lobby, level 1',  'Carpet tiles lifting at the lift threshold', current_date - 30, current_date + 5, null, 'open'),
  (seed_uuid('def:1003'), 'DEF-1003', seed_uuid('prj:203'), null,                      'Level 3 open plan',    'Ceiling tile stained near AHU-2', current_date - 35, current_date - 25, current_date - 20, 'closed'),
  (seed_uuid('def:1004'), 'DEF-1004', seed_uuid('prj:203'), seed_uuid('co:interiors'), 'Level 2 kitchenette',  'Splashback silicone joint incomplete', current_date - 12, current_date + 10, null, 'open')
on conflict do nothing;

-- Site diary ------------------------------------------------------------------------

insert into diary (id, project_id, company_id, noted_on, weather, workers, note) values
  (seed_uuid('diary:1'), seed_uuid('prj:201'), seed_uuid('co:steel'),    current_date - 1, 'Fine',          34, 'Steel crew stood at gridlines E to G again, still waiting on RFI-401. Worked the south bay instead.'),
  (seed_uuid('diary:2'), seed_uuid('prj:201'), seed_uuid('co:roofing'),  current_date - 2, 'Fine',          31, 'Roofing crew on the north pitch. Asked Stu for the renewed insurance certificate; promised this week.'),
  (seed_uuid('diary:3'), seed_uuid('prj:201'), null,                     current_date - 3, 'Showers',       27, 'Client visit: Dana Whitaker confirmed the dock pits move 1.2 m east (SI-014) and asked for a price.'),
  (seed_uuid('diary:4'), seed_uuid('prj:201'), seed_uuid('co:fire'),     current_date - 6, 'Fine',          29, 'Sentinel chasing the sprinkler shop drawings; pipe order cannot go in until they are back.'),
  (seed_uuid('diary:5'), seed_uuid('prj:202'), null,                     current_date - 5, 'Rain',          18, 'Level 2 pour postponed for rain. Fume cupboard exhaust route still unresolved (RFI-404).'),
  (seed_uuid('diary:6'), seed_uuid('prj:202'), seed_uuid('co:hydraulic'),current_date - 40, 'Fine',         16, 'Excavation for the east footings hit an uncharted stormwater main. Work stopped on that face.')
on conflict do nothing;
