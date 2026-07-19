/* ============================================================
   TRANSFER — mock data layer
   Fixtures shaped like the real sources (Epic FHIR, PeopleSoft GL,
   SNF registry, contracts, MLS). ALL DATA SYNTHETIC.
   ============================================================ */

const DB = {

  hospital: {
    name: 'St. Vincent County Hospital',
    totalBeds: 420,
    occupied: 391,
    acuteBedValuePerNight: 2900 // foregone acute activity per blocked bed
  },

  /* ---- EHR: FHIR-ish ALC census (Patient + Encounter + barriers) ---- */
  // burn = daily direct cost from PeopleSoft GL (see costModel)
  // factors sum exactly to risk score — the transparent risk index both sides see
  patients: [
    { id:'P-1042', name:'Margaret Chen',   age:78, sex:'F', unit:'4E', dx:'Post-stroke, rehab',        admitted:'2026-05-02', days:34, burn:2850, payer:'Medicare',            needs:['rehab'],
      presentation:'Medically ready. L MCA stroke with residual hemiparesis; needs intensive PT/OT in a rehab-capable facility. Cognitively intact, family engaged.',
      barriers:['Rehab-intensive','Mobility'],
      factors:[ {label:'Post-stroke rehab intensity', pts:14}, {label:'Mobility / transfer assist', pts:10}, {label:'Expected LOS 21–35d', pts:8} ] },
    { id:'P-1067', name:'Robert Okafor',   age:71, sex:'M', unit:'5N', dx:'Dementia + behavioral',     admitted:'2026-03-09', days:88, burn:3400, payer:'Medicaid (pending)',  needs:['behavioral','dementia'],
      presentation:'Medically ready. Moderate dementia with exit-seeking and episodic agitation; requires secure unit with behavioral program. Medicaid application in process.',
      barriers:['Behavioral flags','Dementia','Medicaid pending'],
      factors:[ {label:'Behavioral flags (agitation)', pts:24}, {label:'Dementia — secure unit', pts:16}, {label:'Uncertain LOS', pts:20}, {label:'Falls risk', pts:10}, {label:'Medicaid pending', pts:4} ] },
    { id:'P-1090', name:'James Whitfield', age:64, sex:'M', unit:'3W', dx:'Uninsured, wound care',     admitted:'2026-04-12', days:94, burn:2600, payer:'Uninsured',           needs:['wound'],
      presentation:'Medically ready for discharge. Chronic sacral wound (Stage 3) with declining VAC therapy needs. Deconditioned; requires skilled wound care + PT.',
      barriers:['Uninsured','Skilled wound care','No fixed address','Deconditioned'],
      factors:[ {label:'Chronic wound (Stage 3)', pts:18}, {label:'Uninsured / coverage gap', pts:16}, {label:'Expected LOS 40–55d', pts:12}, {label:'Deconditioned / PT needs', pts:8}, {label:'No fixed address', pts:4} ] },
    { id:'P-1101', name:'Elena Vasquez',   age:82, sex:'F', unit:'6E', dx:'Dialysis-dependent',        admitted:'2026-06-06', days:41, burn:3900, payer:'Medicaid',            needs:['dialysis'],
      presentation:'Medically ready. Stable ESRD, hemodialysis MWF; needs facility with reliable dialysis transport. Otherwise independent in ADLs with supervision.',
      barriers:['Dialysis + transport (MWF)'],
      factors:[ {label:'Dialysis + transport', pts:28}, {label:'Expected LOS 45–60d', pts:22}, {label:'Payer — Medicaid', pts:17} ] },
    { id:'P-1123', name:'Darnell Price',   age:55, sex:'M', unit:'3W', dx:'Homeless + IV antibiotics', admitted:'2026-05-03', days:76, burn:2900, payer:'Uninsured',           needs:['iv_abx'],
      presentation:'Medically ready. Osteomyelitis on 6-week IV antibiotic course via PICC; no fixed address and no coverage. Needs monitored setting to complete therapy.',
      barriers:['Uninsured','IV antibiotics (PICC)','No fixed address'],
      factors:[ {label:'IV antibiotics (PICC)', pts:15}, {label:'Uninsured / coverage gap', pts:16}, {label:'No fixed address', pts:12}, {label:'Uncertain LOS', pts:20}, {label:'Substance-use history', pts:8} ] },
    { id:'P-1140', name:'Aiko Tanaka',     age:69, sex:'F', unit:'4E', dx:'Bariatric, mobility',       admitted:'2026-06-18', days:29, burn:3100, payer:'Medicare',            needs:['bariatric','rehab'],
      presentation:'Medically ready. Requires bariatric bed/lift equipment and 2-person transfers; progressing with PT. No skilled nursing needs beyond mobility program.',
      barriers:['Bariatric equipment','2-person transfer'],
      factors:[ {label:'Bariatric equipment needs', pts:12}, {label:'Mobility / 2-person transfer', pts:14}, {label:'Expected LOS 30–45d', pts:10}, {label:'Payer — Medicare', pts:8} ] },
    { id:'P-1156', name:'Frank Delgado',   age:73, sex:'M', unit:'5N', dx:'CHF, deconditioned',        admitted:'2026-05-26', days:52, burn:2850, payer:'Medicare',            needs:['rehab'],
      presentation:'Medically ready. CHF optimized on orals; deconditioned after prolonged stay. Needs reconditioning program with daily-weights cardiac monitoring.',
      barriers:['Deconditioned','Cardiac monitoring'],
      factors:[ {label:'CHF monitoring', pts:8}, {label:'Deconditioned / PT needs', pts:14}, {label:'Expected LOS 30–40d', pts:8}, {label:'Payer — Medicare', pts:8} ] },
    { id:'P-1172', name:'Grace Mbeki',     age:66, sex:'F', unit:'4E', dx:'Post-op, wound VAC',        admitted:'2026-06-01', days:47, burn:2765, payer:'Medicare Advantage',  needs:['wound'],
      presentation:'Medically ready. Post-laparotomy wound on VAC therapy, downgrading to daily dressing within 2 weeks. Prior-auth required by MA plan — package attached.',
      barriers:['Wound VAC','Prior auth (MA plan)'],
      factors:[ {label:'Wound VAC therapy', pts:14}, {label:'Post-op monitoring', pts:9}, {label:'Expected LOS 35–50d', pts:12}, {label:'MA prior-auth friction', pts:14} ] },
    { id:'P-1188', name:'Harold Levine',   age:81, sex:'M', unit:'5N', dx:'Dementia, falls',           admitted:'2026-04-14', days:63, burn:3400, payer:'Medicaid',            needs:['behavioral','dementia'],
      presentation:'Medically ready. Advanced dementia with recurrent falls and wandering; needs secure memory-care bed. Two prior SNF declines on behavioral history.',
      barriers:['Dementia','Falls ×3','Wandering risk'],
      factors:[ {label:'Dementia — secure unit', pts:16}, {label:'Wandering risk', pts:14}, {label:'Falls history', pts:10}, {label:'Uncertain LOS', pts:20}, {label:'Payer — Medicaid', pts:10} ] },
    { id:'P-1203', name:'Sofia Reyes',     age:58, sex:'F', unit:'3W', dx:'Uninsured, IV abx',         admitted:'2026-05-08', days:71, burn:2600, payer:'Uninsured',           needs:['iv_abx'],
      presentation:'Medically ready. Endocarditis on long-course IV antibiotics via PICC; clinically stable. Uninsured — no facility will bill for the remaining course.',
      barriers:['Uninsured','IV antibiotics (PICC)'],
      factors:[ {label:'IV antibiotics (PICC)', pts:15}, {label:'Uninsured / coverage gap', pts:16}, {label:'PICC line care', pts:10}, {label:'Expected LOS 40–55d', pts:12}, {label:'Transport needs', pts:8} ] },
    { id:'P-1219', name:'Walter Kim',      age:77, sex:'M', unit:'6E', dx:'Stroke, dysphagia',         admitted:'2026-06-09', days:38, burn:3900, payer:'Medicare',            needs:['dysphagia','rehab'],
      presentation:'Medically ready. Post-stroke dysphagia on thickened diet with SLP program; aspiration precautions. Needs facility with speech-language pathology capacity.',
      barriers:['Dysphagia / SLP','Aspiration precautions'],
      factors:[ {label:'Dysphagia / thickened diet', pts:9}, {label:'Stroke rehab intensity', pts:14}, {label:'Aspiration precautions', pts:12}, {label:'Expected LOS 40–55d', pts:12}, {label:'Payer — Medicare', pts:8} ] },
    { id:'P-1230', name:'Nadia Farouk',    age:69, sex:'F', unit:'5N', dx:'Behavioral, no address',    admitted:'2026-04-25', days:84, burn:3400, payer:'Uninsured',           needs:['behavioral'],
      presentation:'Medically ready. Schizoaffective disorder, stable on depot antipsychotic; no fixed address and no coverage. Needs supervised setting with psych med management.',
      barriers:['Behavioral flags','Uninsured','No fixed address'],
      factors:[ {label:'Behavioral flags', pts:24}, {label:'Uninsured / coverage gap', pts:16}, {label:'No fixed address', pts:12}, {label:'Uncertain LOS', pts:20}, {label:'Psych med management', pts:6} ] },
    /* --- 5 additional census rows (low-acuity overflow unit, lower per-diems) --- */
    { id:'P-1246', name:'Luis Herrera',    age:62, sex:'M', unit:'2S', dx:'Uninsured, ortho trauma',   admitted:'2026-05-21', days:58, burn:1900, payer:'Uninsured',           needs:['rehab'],
      presentation:'Medically ready. Healing tib-fib fracture, WBAT; needs short rehab course. Uninsured — declined by all network facilities on payer status.',
      barriers:['Uninsured','Mobility'],
      factors:[ {label:'Ortho rehab', pts:12}, {label:'Uninsured / coverage gap', pts:16}, {label:'Expected LOS 30–45d', pts:10}, {label:'Mobility / assist', pts:12}, {label:'Transport needs', pts:13} ] },
    { id:'P-1252', name:'Dorothy Okonkwo', age:71, sex:'F', unit:'2S', dx:'Uninsured, diabetic wound', admitted:'2026-05-13', days:66, burn:1850, payer:'Uninsured',           needs:['wound'],
      presentation:'Medically ready. Diabetic foot ulcer, granulating well on daily dressings; needs supervised wound care and diabetic diet. No coverage.',
      barriers:['Uninsured','Wound care','Diabetic management'],
      factors:[ {label:'Diabetic wound care', pts:14}, {label:'Uninsured / coverage gap', pts:16}, {label:'Diabetes management', pts:9}, {label:'Expected LOS 40–55d', pts:12}, {label:'Transport needs', pts:8} ] },
    { id:'P-1259', name:'Samuel Tran',     age:49, sex:'M', unit:'2S', dx:'No coverage, TBI recovery', admitted:'2026-04-28', days:81, burn:1950, payer:'Uninsured',           needs:['rehab'],
      presentation:'Medically ready. Moderate TBI, now independent with supervision; needs structured transitional setting. No coverage and no family supports.',
      barriers:['Uninsured','Cognitive supervision','No fixed address'],
      factors:[ {label:'TBI — cognitive supervision', pts:17}, {label:'Uninsured / coverage gap', pts:16}, {label:'No fixed address', pts:12}, {label:'Uncertain LOS', pts:20}, {label:'Age <65 — no Medicare', pts:4} ] },
    { id:'P-1263', name:'Marie Bouchard',  age:76, sex:'F', unit:'6E', dx:'Trach weaning, complex resp', admitted:'2026-05-22', days:57, burn:1935, payer:'Medicare',          needs:['trach'],
      presentation:'Medically ready for step-down. Trach in weaning protocol; needs respiratory-therapist coverage no network facility currently offers.',
      barriers:['Trach / resp therapy','Complex airway'],
      factors:[ {label:'Trach — RT coverage', pts:30}, {label:'Complex airway', pts:20}, {label:'Uncertain LOS', pts:20}, {label:'Falls risk', pts:12} ] },
    { id:'P-1270', name:'Ivan Petrov',     age:60, sex:'M', unit:'2S', dx:'Uninsured, IV abx + wound', admitted:'2026-05-30', days:49, burn:1850, payer:'Uninsured',           needs:['iv_abx','wound'],
      presentation:'Medically ready. Cellulitis with abscess, on IV antibiotics and packing changes; stable. Uninsured — no reimbursement path for post-acute care.',
      barriers:['Uninsured','IV antibiotics','Wound care'],
      factors:[ {label:'IV antibiotics', pts:15}, {label:'Wound packing', pts:11}, {label:'Uninsured / coverage gap', pts:16}, {label:'Expected LOS 30–45d', pts:10}, {label:'Transport needs', pts:12} ] }
  ],

  /* ---- PeopleSoft GL: cost-center split of each patient's daily direct cost ---- */
  costModel: {
    centers: [ ['Nursing', .45], ['Hotel & support', .25], ['Pharmacy', .16], ['Allied health', .14] ],
    source: 'peoplesoft.gl.patient_costs'
  },

  /* ---- SNF registry: capability matrix, rates, decline patterns ---- */
  snfs: [
    { id:'maplewood', name:'Maplewood Skilled Nursing', beds:92, occupied:84, openBeds:8,  caps:['rehab','wound','bariatric'],            baseRate:410, contracted:true,
      km:2.1, payers:['Medicare','Medicare Advantage','Medicaid'], declines:'declines uninsured (no reimbursement source)' },
    { id:'riverside', name:'Riverside Care Centre',     beds:64, occupied:55, openBeds:9,  caps:['rehab','dialysis','dysphagia'],         baseRate:455, contracted:true,
      km:3.0, payers:['Medicare','Medicaid'],                     declines:'declines behavioral history' },
    { id:'cedar',     name:'Cedar Grove Post-Acute',    beds:48, occupied:39, openBeds:9,  caps:['standard'],                              baseRate:385, contracted:true,
      km:1.4, payers:['Medicare'],                                declines:'declines wound Stage 3+, uninsured, behavioral' },
    { id:'harbor',    name:'Harbor View Behavioral',    beds:36, occupied:36, openBeds:0,  caps:['behavioral','dementia'],                 baseRate:520, contracted:false,
      km:4.2, payers:['Medicare','Medicaid'],                     declines:'at capacity — 14-patient waitlist' },
    { id:'summit',    name:'Summit Rehab Institute',    beds:70, occupied:66, openBeds:4,  caps:['rehab','dysphagia'],                     baseRate:475, contracted:false,
      km:5.1, payers:['Medicare','Medicare Advantage'],           declines:'declines Medicaid and uninsured' },
    { id:'golden',    name:'Golden Pines Care Home',    beds:52, occupied:47, openBeds:5,  caps:['standard','wound'],                      baseRate:430, contracted:false,
      km:6.3, payers:['Medicare'],                                declines:'declines uninsured, dialysis' },
    { id:'lakeshore', name:'Lakeshore Continuing Care', beds:88, occupied:80, openBeds:8,  caps:['rehab','wound','dysphagia'],             baseRate:445, contracted:false,
      km:7.8, payers:['Medicare','Medicare Advantage'],           declines:'declines uninsured, behavioral' },
    { id:'evergreen', name:'Evergreen Manor',           beds:40, occupied:37, openBeds:3,  caps:['standard','dementia'],                   baseRate:415, contracted:false,
      km:8.5, payers:['Medicare','Medicaid'],                     declines:'declines falls history ×3+, uninsured' }
  ],

  /* ---- Contracts: bed-block agreements + trailing utilization ---- */
  contracts: [
    { snfId:'maplewood', beds:20, rate:410, blockUsed:16, util60d:96, term:'thru Dec 2026', note:'Skilled · wound-capable' },
    { snfId:'riverside', beds:12, rate:455, blockUsed:9,  util60d:78, term:'thru Mar 2027', note:'Skilled · dialysis transport' },
    { snfId:'cedar',     beds:10, rate:385, blockUsed:6,  util60d:61, term:'thru Sep 2026', note:'Standard post-acute' }
  ],

  /* ---- MLS: real-estate comps within 3 km of campus ---- */
  listings: [
    { id:'428-elm',   addr:'428 Elm St',            type:'6-bed residential house',  price:1100000, reno:340000, beds:6,  km:0.8, condition:'good — sprinklered 2019, level entry',   zoning:'residential care eligible' },
    { id:'12-birch',  addr:'12 Birchmount Ave',     type:'former group home',        price:2600000, reno:380000, beds:10, km:2.4, condition:'licensed group-care shell, vacant 8 mo', zoning:'institutional' },
    { id:'77-quarry', addr:'77 Quarry Rd',          type:'small commercial',         price:950000,  reno:610000, beds:8,  km:2.9, condition:'requires full residential conversion',   zoning:'rezoning required' },
    { id:'214-ash',   addr:'214 Ashford Dr',        type:'duplex',                   price:780000,  reno:210000, beds:4,  km:1.6, condition:'fair — two units, stairs',               zoning:'residential care eligible' },
    { id:'9-linden',  addr:'9 Linden Ct',           type:'6-bed residential house',  price:1250000, reno:410000, beds:6,  km:1.1, condition:'dated — full accessibility retrofit',    zoning:'residential care eligible' }
  ],

  /* ---- Supportive-housing operating model (per resident-day) ---- */
  shOpex: {
    items: [ ['24/7 PSW staffing', 168], ['Visiting RN program', 54], ['Program management', 40], ['Food', 28], ['Utilities & maintenance', 22] ],
    total: 312,
    source: 'agent.financial_model.sh_opex'
  },

  finance: { discountRate: 0.06, daysPerMonth: 30.42, renovationDays: 40 }
};

/* Weekly cost-trend history for the VP chart (last 8 weeks, $K/week) */
const TREND = {
  weeks: ['W1','W2','W3','W4','W5','W6','W7','W8'],
  inHouse: [330,336,341,334,347,352,339,333],
  transferred: [58,59,60,58,60,61,59,58]
};
