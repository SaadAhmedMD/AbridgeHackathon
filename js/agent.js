/* ============================================================
   TRANSFER — Bed Arbitrage Agent runtime
   Demo mode: deterministic orchestration, real tool execution.
   Live mode: Anthropic API tool-use loop (bring your own key).
   Both emit the same events into the UI's agent activity feed.
   ============================================================ */

const Agent = {

  running: false,
  hasRun: false,

  ts() { const d = new Date(); return d.toTimeString().slice(0,8); },

  /* ---------------- demo-mode orchestration ----------------
     emit(type, payload):
       think  {text}            — reasoning line
       tool   {name, args, result} — tool call + summary
       patch  {what, data}      — UI state update
       chat   {text}            — agent chat bubble
       done   {}                                              */
  async run(emit) {
    if (Agent.running) return;
    Agent.running = true;
    const wait = ms => new Promise(r => setTimeout(r, ms));

    const census = Tools.get_alc_census();
    emit('think', { text: 'Morning scan — pulling the ALC census from Epic…' });
    await wait(900);
    emit('tool', { name:'get_alc_census', args:'', result:`${census.count} ALC patients · ${census.patientDays.toLocaleString()} cumulative patient-days` });
    await wait(1100);

    const costs = Tools.get_patient_costs();
    emit('tool', { name:'get_patient_costs', args:'', result:`${fmt.moneyK(costs.totalToDate)} direct cost to date · ${fmt.money(costs.nightlyBurn)}/night burn` });
    emit('patch', { what:'priced' });
    await wait(1100);

    emit('think', { text: 'Scoring every patient on the shared risk index — the same number the SNF will see.' });
    await wait(800);
    const seg = Tools.segment_patients();
    emit('tool', { name:'score_patient_risk', args:'×' + census.count, result:`${census.count} scored · median ${Agent.median(seg.patients.map(p=>p.score))}` });
    await wait(900);
    emit('tool', { name:'segment_patients', args:'', result:`${seg.counts[1]} Standard · ${seg.counts[2]} Complex · ${seg.counts[3]} High-complexity` });
    emit('patch', { what:'segmented' });
    await wait(1100);

    const cap = Tools.get_snf_capacity();
    emit('tool', { name:'get_snf_capacity', args:'', result:`${cap.facilities.length} facilities · ${cap.facilities.reduce((s,f)=>s+f.openBeds,0)} open beds · 3 contracted blocks` });
    await wait(1000);

    const match = Tools.match_cache();
    const byS = {};
    match.matches.forEach(m => byS[m.snf] = (byS[m.snf]||0)+1);
    emit('tool', { name:'match_patients_to_beds', args:'', result:`${match.matchedCount} matched (${Object.entries(byS).map(([k,v])=>`${k.split(' ')[0]} ${v}`).join(' · ')}) · ${fmt.moneyK(match.savePerMonth)}/mo saved` });
    // stream the matches into the census one by one
    for (const m of match.matches) {
      emit('patch', { what:'match', data:m });
      await wait(420);
    }
    emit('patch', { what:'matched', data:match });
    await wait(1000);

    emit('think', { text: `${match.unmatchedCount} patients still stranded. Classifying why: ${match.byReason.coverage} have no coverage — no SNF can bill for them; ${match.byReason.noCapacity} need capabilities no network facility has.` });
    emit('patch', { what:'unmatched', data:match });
    await wait(1600);

    emit('think', { text: 'No existing capacity fits the coverage-gap cohort. Checking whether the hospital should CREATE capacity instead…' });
    await wait(1000);
    const re = Tools.get_real_estate_listings(3);
    emit('tool', { name:'get_real_estate_listings', args:'radius: 3 km', result:`${re.listings.length} comps · best $/ready-bed: ${re.best.addr} (${fmt.moneyK(re.best.allIn)} all-in, ${re.best.beds} beds)` });
    emit('patch', { what:'estate', data:re });
    await wait(1300);

    const bc = Tools.draft_business_case();
    const model = Tools.businessCaseModel(0.85);
    emit('tool', { name:'draft_business_case', args:`cohort: ${bc.cohort} · 428 Elm St`, result:`payback ${model.payback.toFixed(1)} mo · 5-yr NPV ${fmt.moneyK(model.npv)} · ${fmt.moneyK(model.monthly)}/mo saved` });
    emit('patch', { what:'bizcase' });
    await wait(1300);

    const am = Tools.draft_contract_amendment('maplewood', 8);
    emit('tool', { name:'draft_contract_amendment', args:'Maplewood · +8 beds', result:`block ${am.util60d}% full 60d · commit ${fmt.moneyK(am.committed)}/mo → avoid ${fmt.moneyK(am.avoided)}/mo acute burn` });
    emit('patch', { what:'amendment', data:am });
    await wait(900);

    emit('chat', { text:`Scan complete. ${census.count} ALC patients are burning ${fmt.money(costs.nightlyBurn)}/night. I matched ${match.matchedCount} to contracted beds (+${fmt.moneyK(match.savePerMonth)}/mo) and drafted referral packages. ${match.unmatchedCount} remain unmatched — for the ${match.byReason.coverage} coverage-gap patients I drafted a supportive-housing business case on 428 Elm St (payback ${model.payback.toFixed(1)} months). Three drafts are waiting for your sign-off.` });
    emit('done', {});
    Agent.running = false;
    Agent.hasRun = true;
  },

  median(a) { const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; },

  /* ---------------- demo-mode chat (canned, data-backed) ---------------- */
  demoAnswer(q) {
    q = q.toLowerCase();
    const m = Tools.match_cache();
    const model = Tools.businessCaseModel(0.85);
    if (/why|unmatched|place|stuck|remain/.test(q))
      return `${m.byReason.noCapacity} of the ${m.unmatchedCount} unmatched need capabilities no network facility offers (behavioral secure unit, trach/RT). The other ${m.byReason.coverage} are coverage-gap — uninsured, so no SNF can bill for them at any rate. That cohort is why I drafted the 428 Elm St case: it converts a ${fmt.money(model.blended)} blended acute day into a ${fmt.money(model.opexDay)} resident-day.`;
    if (/maplewood|block|amendment|contract/.test(q)) {
      const am = Tools.draft_contract_amendment('maplewood', 8);
      return `The Maplewood block has run ${am.util60d}% full for 60 days and Maplewood holds 8 unblocked beds at ${fmt.money(am.rate)}/day. Expanding commits ${fmt.moneyK(am.committed)}/mo and avoids ~${fmt.moneyK(am.avoided)}/mo of acute boarding. The amendment is drafted — it needs your signature.`;
    }
    if (/elm|house|housing|estate|buy|acqui/.test(q))
      return `428 Elm St: 6-bed residential house 0.8 km from campus, ${fmt.moneyK(model.prop.price)} + ${fmt.moneyK(model.prop.reno)} renovation. Operating as supportive housing costs ${fmt.money(model.opexDay)}/resident-day vs the cohort's ${fmt.money(model.blended)} blended acute day — ${fmt.moneyK(model.monthly)}/mo saved at 85% occupancy, payback ${model.payback.toFixed(1)} months. The full memo is in Business Case.`;
    if (/occupancy|sensitiv|70|95/.test(q)) {
      const lo = Tools.businessCaseModel(0.70), hi = Tools.businessCaseModel(0.95);
      return `Sensitivity on 428 Elm St: at 70% occupancy ${fmt.moneyK(lo.monthly)}/mo (payback ${lo.payback.toFixed(1)} mo); base 85% ${fmt.moneyK(model.monthly)}/mo (${model.payback.toFixed(1)} mo); at 95% ${fmt.moneyK(hi.monthly)}/mo (${hi.payback.toFixed(1)} mo). It pays back inside a year in every scenario.`;
    }
    if (/save|saving|match/.test(q))
      return `I matched ${m.matchedCount} patients to contracted beds — net ${fmt.money(m.savePerNight)}/night, ${fmt.moneyK(m.savePerMonth)}/mo once admissions confirm. Each match nets the difference between the acute per-diem and the risk-adjusted SNF rate, itemized per patient in the census.`;
    if (/risk|tier|score/.test(q))
      return `Every patient gets a transparent 0–100 risk index from itemized factors (wounds, dialysis, behavioral flags, payer, expected LOS). Both sides see the identical breakdown, and offers are priced base rate + $3 per point above 40 — so declines become rate negotiations instead of silence.`;
    return `In demo mode I answer questions about the census, matching, the Maplewood amendment, and the 428 Elm St case. Add an Anthropic API key (⚙, top right) to chat with the live agent — it uses the same nine tools over this data.`;
  },

  /* ---------------- live mode: Anthropic API tool-use loop ---------------- */
  toolDefs: [
    { name:'get_alc_census', description:'Patients medically ready for discharge with barriers, payer status, care needs.', input_schema:{ type:'object', properties:{} } },
    { name:'get_patient_costs', description:'PeopleSoft-style ledger: cost-to-date and daily direct cost. Pass patient_id for one patient, omit for totals.', input_schema:{ type:'object', properties:{ patient_id:{ type:'string' } } } },
    { name:'score_patient_risk', description:'Transparent 0–100 risk index with factor breakdown for one patient.', input_schema:{ type:'object', properties:{ patient_id:{ type:'string' } }, required:['patient_id'] } },
    { name:'segment_patients', description:'Assign every ALC patient a complexity tier (1 Standard / 2 Complex / 3 High).', input_schema:{ type:'object', properties:{} } },
    { name:'get_snf_capacity', description:'SNF registry: open beds, capability matrix, per-diem rates, decline patterns.', input_schema:{ type:'object', properties:{} } },
    { name:'match_patients_to_beds', description:'Constrained matching of ALC patients to SNF beds (acuity, payer, open beds). Returns matches, unmatched with reasons, savings.', input_schema:{ type:'object', properties:{} } },
    { name:'get_real_estate_listings', description:'Property listings near the hospital with price, capacity, renovation estimates.', input_schema:{ type:'object', properties:{ radius_km:{ type:'number' } } } },
    { name:'draft_business_case', description:'Financial model for the supportive-housing acquisition (capex, opex, payback, NPV). Pass occupancy 0–1 (default 0.85).', input_schema:{ type:'object', properties:{ occupancy:{ type:'number' } } } },
    { name:'draft_contract_amendment', description:'Draft a bed-block expansion for a contracted SNF.', input_schema:{ type:'object', properties:{ snf_id:{ type:'string' }, beds:{ type:'number' } } } }
  ],

  execTool(name, input) {
    switch (name) {
      case 'get_alc_census':          return Tools.get_alc_census();
      case 'get_patient_costs':       return Tools.get_patient_costs(input.patient_id);
      case 'score_patient_risk':      return Tools.score_patient_risk(input.patient_id);
      case 'segment_patients':        return Tools.segment_patients();
      case 'get_snf_capacity':        return Tools.get_snf_capacity();
      case 'match_patients_to_beds':  return Tools.match_patients_to_beds();
      case 'get_real_estate_listings':return Tools.get_real_estate_listings(input.radius_km || 3);
      case 'draft_business_case':     return input.occupancy ? Tools.businessCaseModel(input.occupancy) : Tools.draft_business_case();
      case 'draft_contract_amendment':return Tools.draft_contract_amendment(input.snf_id || 'maplewood', input.beds || 8);
      default: return { error:'unknown tool ' + name };
    }
  },

  liveHistory: [],

  async liveChat(question, emit) {
    const key = localStorage.getItem('transfer_api_key');
    if (!key) return null;
    const model = localStorage.getItem('transfer_model') || 'claude-sonnet-5';
    Agent.liveHistory.push({ role:'user', content: question });
    const system = `You are the Bed Arbitrage Agent inside TRANSFER, a two-sided platform connecting ${DB.hospital.name} (which is boarding ALC patients at acute cost) with skilled nursing facilities. You continuously scan the ALC census, price the bleed, match patients to real capacity, and when no capacity exists you draft business cases to create it (e.g. supportive-housing acquisitions). You are talking to the VP Finance. Use your tools to answer with real numbers — never invent figures; every claim must come from a tool result. Be concise (2-4 sentences unless asked for detail), specific, and financial in framing. All data is synthetic; you are decision support — drafts require human sign-off.`;
    try {
      for (let turn = 0; turn < 8; turn++) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({ model, max_tokens: 1024, system, tools: Agent.toolDefs, messages: Agent.liveHistory })
        });
        if (!res.ok) { const e = await res.text(); return `API error ${res.status}: ${e.slice(0,200)}`; }
        const msg = await res.json();
        Agent.liveHistory.push({ role:'assistant', content: msg.content });
        if (msg.stop_reason === 'tool_use') {
          const results = [];
          for (const block of msg.content) {
            if (block.type === 'tool_use') {
              const out = Agent.execTool(block.name, block.input || {});
              emit('tool', { name: block.name, args: JSON.stringify(block.input || {}).slice(1,-1).slice(0,60), result: 'returned to live agent', live:true });
              results.push({ type:'tool_result', tool_use_id: block.id, content: JSON.stringify(out).slice(0, 6000) });
            }
          }
          Agent.liveHistory.push({ role:'user', content: results });
          continue;
        }
        const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        return text || '(no text response)';
      }
      return 'Live agent hit the tool-loop limit — try a narrower question.';
    } catch (err) {
      return 'Could not reach the Anthropic API (' + err.message + '). Check the key in ⚙ settings, or use demo mode.';
    }
  }
};
