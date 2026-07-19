/* ============================================================
   TRANSFER — Bed Arbitrage Agent tool layer
   Every tool executes over the mock data layer (data.js).
   Every number in the UI traces back through these functions.
   ============================================================ */

const fmt = {
  money: n => '$' + Math.round(n).toLocaleString('en-US'),
  moneyK: n => '$' + (n >= 1e6 ? (n/1e6).toFixed(2) + 'M' : Math.round(n/1e3) + 'K'),
  pct: n => Math.round(n) + '%'
};

const Tools = {

  /* -- get_alc_census(): patients medically ready for discharge -- */
  get_alc_census() {
    const ps = DB.patients;
    return {
      count: ps.length,
      patientDays: ps.reduce((s,p) => s + p.days, 0),
      patients: ps.map(p => ({ id:p.id, name:p.name, age:p.age, unit:p.unit, dx:p.dx, days:p.days, payer:p.payer, needs:p.needs, barriers:p.barriers })),
      source: 'epic.fhir.Encounter?dischargeDisposition=alc'
    };
  },

  /* -- get_patient_costs(patient_id?): PeopleSoft-style ledger -- */
  get_patient_costs(patientId) {
    const split = p => DB.costModel.centers.map(([c, w]) => ({ center:c, perDay: Math.round(p.burn * w) }));
    if (patientId) {
      const p = DB.patients.find(x => x.id === patientId);
      if (!p) return { error:'unknown patient ' + patientId };
      return { id:p.id, costToDate: p.days * p.burn, dailyDirect: p.burn, centers: split(p), source: DB.costModel.source };
    }
    const totalToDate = DB.patients.reduce((s,p) => s + p.days * p.burn, 0);
    const nightlyBurn = DB.patients.reduce((s,p) => s + p.burn, 0);
    return {
      patients: DB.patients.map(p => ({ id:p.id, costToDate: p.days * p.burn, dailyDirect: p.burn })),
      totalToDate, nightlyBurn, monthlyBurn: nightlyBurn * DB.finance.daysPerMonth,
      source: DB.costModel.source
    };
  },

  /* -- score_patient_risk(patient_id): transparent 0–100 index -- */
  score_patient_risk(patientId) {
    const p = DB.patients.find(x => x.id === patientId);
    if (!p) return { error:'unknown patient ' + patientId };
    const score = p.factors.reduce((s,f) => s + f.pts, 0);
    return { id:p.id, score, factors:p.factors, source:'agent.risk_index (factor catalog v2, shared with SNF)' };
  },

  riskOf(p) { return p.factors.reduce((s,f) => s + f.pts, 0); },

  tierOf(score) {
    if (score < 40) return { n:1, label:'Standard',        short:'T1' };
    if (score < 70) return { n:2, label:'Complex',         short:'T2' };
    return             { n:3, label:'High-complexity', short:'T3' };
  },

  /* -- segment_patients(): complexity tiers across the census -- */
  segment_patients() {
    const out = DB.patients.map(p => {
      const score = Tools.riskOf(p);
      return { id:p.id, score, tier: Tools.tierOf(score) };
    });
    const counts = { 1:0, 2:0, 3:0 };
    out.forEach(o => counts[o.tier.n]++);
    return { patients: out, counts, source:'agent.segment (risk_index thresholds 40 / 70)' };
  },

  /* risk-adjusted per-diem: base + $3 × (risk − 40), rounded to $5, cap +$150 */
  rateFor(p, snf) {
    const risk = Tools.riskOf(p);
    const adj = Math.min(150, Math.max(0, Math.round((risk - 40) * 3 / 5) * 5));
    return { base: snf.baseRate, adj, rate: snf.baseRate + adj };
  },

  /* -- get_snf_capacity(): registry with capability matrix -- */
  get_snf_capacity() {
    return {
      facilities: DB.snfs.map(s => ({
        id:s.id, name:s.name, openBeds:s.openBeds, caps:s.caps, baseRate:s.baseRate,
        contracted:s.contracted, payers:s.payers, declinePattern:s.declines, km:s.km
      })),
      source: 'transfer.snf_registry + contracts'
    };
  },

  /* -- match_patients_to_beds(): constrained matching -- */
  match_patients_to_beds() {
    const open = {}; DB.snfs.forEach(s => open[s.id] = s.openBeds + (DB.contracts.find(c => c.snfId === s.id) ? DB.contracts.find(c => c.snfId === s.id).beds - DB.contracts.find(c => c.snfId === s.id).blockUsed : 0));
    const matches = [], unmatched = [];
    // contracted facilities first, then by rate
    const facilities = [...DB.snfs].sort((a,b) => (b.contracted - a.contracted) || (a.baseRate - b.baseRate));
    for (const p of DB.patients) {
      if (p.payer === 'Uninsured') { unmatched.push({ id:p.id, reason:'coverage', detail:'no reimbursement source — every facility declines' }); continue; }
      const fit = facilities.find(s =>
        open[s.id] > 0 &&
        p.needs.every(n => s.caps.includes(n) || n === 'rehab' && s.caps.includes('rehab')) &&
        s.payers.some(py => p.payer.startsWith(py))
      );
      if (fit) {
        open[fit.id]--;
        const r = Tools.rateFor(p, fit);
        matches.push({ id:p.id, snfId:fit.id, snf:fit.name, rate:r.rate, base:r.base, adj:r.adj,
                       savePerNight: p.burn - r.rate });
      } else {
        unmatched.push({ id:p.id, reason:'no-capacity', detail:'no capability-matched bed in network (' + p.needs.join(', ') + ')' });
      }
    }
    const savePerNight = matches.reduce((s,m) => s + m.savePerNight, 0);
    return {
      matches, unmatched,
      matchedCount: matches.length, unmatchedCount: unmatched.length,
      savePerNight, savePerMonth: savePerNight * DB.finance.daysPerMonth,
      byReason: {
        coverage: unmatched.filter(u => u.reason === 'coverage').length,
        noCapacity: unmatched.filter(u => u.reason === 'no-capacity').length
      },
      source: 'agent.match (acuity ∩ payer ∩ open beds, contracted first)'
    };
  },

  /* -- get_real_estate_listings(radius_km, type) -- */
  get_real_estate_listings(radiusKm = 3) {
    const ls = DB.listings.filter(l => l.km <= radiusKm)
      .map(l => ({ ...l, allIn: l.price + l.reno, perBedReady: Math.round((l.price + l.reno) / l.beds) }))
      .sort((a,b) => a.perBedReady - b.perBedReady);
    return { listings: ls, best: ls.find(l => l.zoning !== 'rezoning required'), source: 'mls.listings (3 km radius)' };
  },

  /* -- the financial model behind the business case -- */
  businessCaseModel(occupancy = 0.85) {
    const m = Tools.match_cache();
    const unmatchedIds = m.unmatched.map(u => u.id);
    const cohortPs = DB.patients.filter(p => unmatchedIds.includes(p.id));
    const n = cohortPs.length;
    const nightly = cohortPs.reduce((s,p) => s + p.burn, 0);
    const blended = nightly / n;
    const avgOverstay = cohortPs.reduce((s,p) => s + p.days, 0) / n;
    const prop = DB.listings.find(l => l.id === '428-elm');
    const capex = prop.price + prop.reno;
    const opexDay = DB.shOpex.total;
    const saveDay = blended - opexDay;                                   // per occupied resident-day
    const monthly = prop.beds * occupancy * saveDay * DB.finance.daysPerMonth;
    const annual  = prop.beds * occupancy * saveDay * 365;
    const paybackOps = capex / monthly;                                  // months from opening
    const payback = paybackOps + DB.finance.renovationDays / 30.42;      // months from approval (incl. reno)
    const r = DB.finance.discountRate;
    const annuity = (1 - Math.pow(1 + r, -5)) / r;                       // 5-yr annuity factor
    const npv = annual * annuity - capex;
    return { n, nightly, blended, avgOverstay, prop, capex, opexDay, saveDay, occupancy, monthly, annual, payback, paybackOps, npv,
             annualStatusQuo: nightly * 365 };
  },

  _matchCache: null,
  match_cache() { if (!Tools._matchCache) Tools._matchCache = Tools.match_patients_to_beds(); return Tools._matchCache; },

  /* -- draft_business_case(cohort, property) -- */
  draft_business_case() {
    const model = Tools.businessCaseModel(0.85);
    return {
      title: 'Supportive-housing acquisition for the coverage-gap ALC cohort',
      cohort: model.n, property: model.prop.addr,
      payback: model.payback, npv: model.npv, monthly: model.monthly,
      source: 'peoplesoft.gl.patient_costs × mls.listings#428-elm × agent.financial_model'
    };
  },

  /* -- draft_contract_amendment(snf_id, beds) -- */
  draft_contract_amendment(snfId = 'maplewood', beds = 8) {
    const snf = DB.snfs.find(s => s.id === snfId);
    const c = DB.contracts.find(x => x.snfId === snfId);
    const committed = beds * c.rate * DB.finance.daysPerMonth;
    // standard-tier patients currently boarding who would flow into these beds
    const netPerBed = 2440; // blended standard-tier acute burn 2850 − block rate 410
    const avoided = beds * netPerBed * DB.finance.daysPerMonth;
    return { snf: snf.name, beds, rate: c.rate, util60d: c.util60d, committed, avoided,
             source: 'contracts.' + snfId + ' × snf_registry × alc_census' };
  }
};
