/* ============================================================
   TRANSFER — UI runtime
   Ports the Claude Design screens 1:1 into a live, stateful app.
   ============================================================ */

const S = {
  view: 'vp',
  selectedPatient: 'P-1090',
  selectedReferral: 0,
  showAll: false,
  agentLog: [],           // {t, kind, name, args, result, text, live}
  chat: [{ role:'agent', text:'Good morning. The census is loaded — press “Run agent” (or ask me anything) and I\'ll price the bleed, match who I can, and draft what you need to sign.' }],
  typing: false,
  ran: false, running: false,
  segmented: false,
  matches: {},            // pid -> match
  unmatchedInfo: {},      // pid -> {reason, detail}
  referrals: [],          // {pid, snfId, snfName, rate, base, adj, status, from, savePerNight}
  bizcase: false, bizcaseSeen: false, memoRevealed: false,
  amendment: null, amendmentSigned: false,
  confirmedPerNight: 0,
  occupancy: 0.85,
  packageState: {},       // pid -> 'generating'|'ready' ; pkgTicks: count of done items
  pkgTicks: {},
  contractModal: null,
  agentTab: 'activity',
  settingsOpen: false,
  savingsShown: 0         // animated KPI value
};

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const riskOf = p => Tools.riskOf(p);
const tierMeta = r => r < 40 ? { t:'Standard', s:'T1', c:'var(--teal)', bg:'var(--tealsoft)' }
                : r < 70 ? { t:'Complex', s:'T2', c:'var(--amber)', bg:'var(--ambersoft)' }
                : { t:'High', s:'T3', c:'var(--burn)', bg:'var(--burnsoft)' };
const riskColor = r => r < 40 ? 'var(--teal)' : r < 70 ? 'var(--amber)' : 'var(--burn)';
const money = n => '$' + Math.round(n).toLocaleString('en-US');

function patientStatus(p) {
  const ref = S.referrals.find(r => r.pid === p.id);
  if (ref && ref.status === 'accepted') return { label:'Accepted · ' + ref.snfName.split(' ')[0], color:'var(--money)' };
  if (ref && ref.status === 'countered') return { label:'Countered · ' + money(ref.rate) + '/d', color:'var(--amber)' };
  if (ref && ref.status === 'declined') return { label:'Declined — renegotiate', color:'var(--burn)' };
  if (ref && ref.from === 'cm') return { label:'Referral sent · ' + ref.snfName.split(' ')[0], color:'var(--amber)' };
  if (S.matches[p.id]) return { label:'Matched · ' + S.matches[p.id].snf.split(' ')[0], color:'var(--money)' };
  if (S.unmatchedInfo[p.id]) {
    const u = S.unmatchedInfo[p.id];
    return { label: u.reason === 'coverage' ? 'Unmatched · coverage' : 'Unmatched · no capacity', color:'var(--burn)' };
  }
  return { label: S.running ? 'Agent scanning…' : 'Awaiting agent', color:'var(--muted)' };
}

/* ---------------- shared shell ---------------- */

function render() {
  const roleMap = { vp:'vp', cm:'cm', snf:'snf', case:'vp', contracts:'vp' };
  const activeRole = roleMap[S.view];
  const roles = [ ['vp','VP Finance'], ['cm','Hospital CM'], ['snf','SNF Coord.'] ];
  const newRefs = S.referrals.filter(r => r.snfId === 'maplewood' && (r.status === 'new')).length;
  const drafts = (S.bizcase?1:0) + (S.amendment?1:0) + (S.referrals.filter(r=>r.from==='agent'&&r.status==='new').length?1:0);
  const nav = [
    { key:'vp', icon:'◧', label:'Arbitrage Dashboard' },
    { key:'cm', icon:'▤', label:'Discharge Workbench' },
    { key:'snf', icon:'▦', label:'Referral Inbox', badge: newRefs || null },
    { key:'contracts', icon:'§', label:'Contracts' },
    { key:'case', icon:'✦', label:'Business Case', badge: (S.bizcase && !S.bizcaseSeen) ? 'NEW' : null }
  ];

  $('app').innerHTML = `
  <div style="display:flex;flex-direction:column;height:100vh;overflow:hidden">
    <div style="flex:none;height:54px;display:flex;align-items:center;gap:0;background:var(--agentbg);color:#eaf4f1;padding:0 18px;border-bottom:1px solid #000">
      <div style="display:flex;align-items:center;gap:11px">
        <div style="width:26px;height:26px;border-radius:6px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#06201c;font-weight:700;font-size:15px;font-family:var(--mono)">⇄</div>
        <div style="display:flex;flex-direction:column;line-height:1">
          <span style="font-weight:700;font-size:15px;letter-spacing:.14em">TRANSFER</span>
          <span style="font-size:9.5px;color:#7fa39c;letter-spacing:.05em;margin-top:2px">bed arbitrage platform</span>
        </div>
      </div>
      <div style="margin:0 auto;display:flex;align-items:center;gap:8px;font-size:11px;color:#c7ded8;background:rgba(255,255,255,.05);border:1px solid var(--agentline);padding:5px 12px;border-radius:20px">
        <span style="width:7px;height:7px;border-radius:50%;background:var(--accent);animation:pulse 1.6s infinite"></span>
        Demo — synthetic data only · decision support · all actions require human sign-off
      </div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:14px">
        <div style="display:flex;background:rgba(255,255,255,.06);border:1px solid var(--agentline);border-radius:8px;padding:3px">
          ${roles.map(([k,l]) => `<button onclick="go('${k}')" style="font:600 11.5px var(--sans);padding:6px 12px;border:0;border-radius:6px;cursor:pointer;${activeRole===k?'background:var(--accent);color:#06201c':'background:transparent;color:#9dc0b8'}">${l}</button>`).join('')}
        </div>
        <button onclick="toggleSettings()" title="Settings — API key / reset" style="width:29px;height:29px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid var(--agentline);color:#bfe0d8;font-size:13px;cursor:pointer">⚙</button>
        <div style="width:29px;height:29px;border-radius:50%;background:#1f3a35;border:1px solid var(--agentline);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#bfe0d8">DK</div>
      </div>
    </div>
    <div style="flex:1;display:flex;min-height:0">
      <div style="flex:none;width:212px;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:14px 10px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.1em;color:var(--faint);padding:4px 10px 8px">WORKSPACE</div>
        ${nav.map(n => `
          <button onclick="go('${n.key}')" style="display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;margin-bottom:2px;border:0;border-radius:8px;cursor:pointer;font:500 12.5px var(--sans);text-align:left;${S.view===n.key?'background:var(--tealsoft);color:var(--tealink);font-weight:600':'background:transparent;color:var(--ink2)'}">
            <span style="font-family:var(--mono);font-size:13px;width:16px;text-align:center;opacity:.8">${n.icon}</span>
            <span style="flex:1;text-align:left">${n.label}</span>
            ${n.badge ? `<span style="${n.badge==='NEW' ? 'font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:var(--accent);color:#06201c' : 'font-size:10px;font-weight:600;padding:1px 7px;border-radius:20px;background:var(--teal);color:#fff'}">${n.badge}</span>` : ''}
          </button>`).join('')}
        <div style="margin-top:auto;border-top:1px solid var(--line2);padding:12px 10px 4px;display:flex;flex-direction:column;gap:8px">
          <div style="font-size:10px;font-weight:600;letter-spacing:.1em;color:var(--faint)">AGENT</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--ink2)">
            <span style="width:8px;height:8px;border-radius:50%;background:${S.running?'var(--amber)':'var(--money)'};box-shadow:0 0 0 3px ${S.running?'var(--ambersoft)':'var(--moneysoft)'}"></span>
            <span>Bed Arbitrage Agent</span>
          </div>
          <div style="font-size:10.5px;color:var(--muted);font-family:var(--mono)">${S.running ? 'running…' : drafts ? drafts + ' draft' + (drafts>1?'s':'') + ' awaiting sign-off' : 'idle · census loaded'}</div>
        </div>
      </div>
      <div id="main" style="flex:1;min-width:0;overflow:auto;background:var(--bg)"></div>
    </div>
  </div>
  ${S.contractModal !== null ? contractModalHTML() : ''}
  ${S.settingsOpen ? settingsHTML() : ''}`;

  const main = $('main');
  if (S.view === 'vp') main.innerHTML = vpHTML();
  else if (S.view === 'cm') main.innerHTML = cmHTML();
  else if (S.view === 'snf') main.innerHTML = snfHTML();
  else if (S.view === 'contracts') main.innerHTML = contractsHTML();
  else if (S.view === 'case') main.innerHTML = caseHTML();
  afterRender();
}

function go(v) {
  S.view = v;
  if (v === 'case' && S.bizcase) S.bizcaseSeen = true;
  render();
}

/* ---------------- VP dashboard ---------------- */

function vpHTML() {
  const costs = Tools.get_patient_costs();
  const seg = Tools.segment_patients();
  const nMatched = Object.keys(S.matches).length;
  const nUn = Object.keys(S.unmatchedInfo).length;
  const savePerNight = Object.values(S.matches).reduce((s,m) => s + m.savePerNight, 0);
  const savePerMonth = savePerNight * DB.finance.daysPerMonth;
  const confirmedMonth = S.confirmedPerNight * DB.finance.daysPerMonth;
  const shown = S.showAll ? DB.patients : DB.patients.slice(0, 12);
  const model = S.bizcase ? Tools.businessCaseModel(0.85) : null;
  const matchedBurn = Object.keys(S.matches).reduce((s,id) => s + DB.patients.find(p=>p.id===id).burn, 0);

  const oppRows = [];
  if (nMatched) {
    const byS = {}; Object.values(S.matches).forEach(m => byS[m.snf.split(' ')[0]] = (byS[m.snf.split(' ')[0]]||0)+1);
    const tiers = Object.keys(S.matches).map(id => tierMeta(riskOf(DB.patients.find(p=>p.id===id))).t);
    const tCount = t => tiers.filter(x=>x===t).length;
    oppRows.push(`
      <div class="rise" style="display:flex;align-items:center;gap:14px;padding:13px 15px;border-bottom:1px solid var(--line2)">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--money);flex:none"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">Decant ${nMatched} patients → ${Object.entries(byS).map(([k,v])=>`${k} (${v})`).join(' + ')}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${tCount('Standard')} Standard · ${tCount('Complex')} Complex · acuity &amp; payer verified · beds open now</div>
        </div>
        <div style="text-align:right;flex:none"><div style="font:600 15px var(--mono);color:var(--money)">+${fmt.moneyK(savePerMonth)}/mo</div><div style="font-size:10px;color:var(--muted)">net savings<sup data-tip="Σ (acute per-diem − risk-adjusted SNF rate) × ${DB.finance.daysPerMonth} days|peoplesoft.gl × agent.match">?</sup></div></div>
        <button onclick="go('snf')" style="font:600 11.5px var(--sans);padding:7px 12px;border:0;background:var(--teal);color:#fff;border-radius:7px;cursor:pointer;flex:none">Review</button>
      </div>`);
  }
  if (S.bizcase) {
    oppRows.push(`
      <div class="rise" style="display:flex;align-items:center;gap:14px;padding:13px 15px;border-bottom:1px solid var(--line2);background:var(--panel2)">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--burn);flex:none"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">No skilled beds exist for ${model.n} patients</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Coverage-gap / no-capability cohort · business case drafted → acquire 428 Elm St</div>
        </div>
        <div style="text-align:right;flex:none"><div style="font:600 15px var(--mono);color:var(--ink)">${model.payback.toFixed(1)}-mo</div><div style="font-size:10px;color:var(--muted)">payback</div></div>
        <button onclick="go('case')" style="font:600 11.5px var(--sans);padding:7px 12px;border:1px solid var(--teal);background:var(--tealsoft);color:var(--tealink);border-radius:7px;cursor:pointer;flex:none">Open memo</button>
      </div>`);
  }
  if (S.amendment) {
    oppRows.push(`
      <div class="rise" style="display:flex;align-items:center;gap:14px;padding:13px 15px">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--amber);flex:none"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">Maplewood block ${S.amendment.util60d}% full for 60 days</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">8 unblocked beds available · contract amendment drafted</div>
        </div>
        <div style="text-align:right;flex:none"><div style="font:600 15px var(--mono);color:var(--ink)">+8 beds</div><div style="font-size:10px;color:var(--muted)">${money(S.amendment.rate)}/day</div></div>
        <button onclick="go('contracts')" style="font:600 11.5px var(--sans);padding:7px 12px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);border-radius:7px;cursor:pointer;flex:none">View</button>
      </div>`);
  }
  if (!oppRows.length) oppRows.push(`
    <div style="display:flex;align-items:center;gap:12px;padding:22px 15px;color:var(--muted);font-size:12px;justify-content:center">
      <span style="width:8px;height:8px;border-radius:50%;background:var(--faint)"></span>
      ${S.running ? 'Agent is scanning the census — opportunities will appear here as it works…' : 'Agent idle. Run the agent to scan the census, price the bleed, and surface opportunities.'}
    </div>`);

  return `
  <div style="padding:20px 22px 40px;min-width:980px">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px">
      <div>
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--teal)">VP FINANCE · ARBITRAGE DASHBOARD</div>
        <h1 style="margin:5px 0 3px;font-size:23px;font-weight:700;letter-spacing:-.01em">${DB.hospital.name}</h1>
        <div style="font-size:12px;color:var(--muted);font-family:var(--mono)">Live ALC census · updated <span id="clock">${new Date().toTimeString().slice(0,8)}</span> · source: Epic FHIR + PeopleSoft GL</div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="window.print()" style="font:600 12px var(--sans);padding:8px 13px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);border-radius:8px;cursor:pointer">Export</button>
        <button id="runbtn" onclick="runAgent()" ${S.running?'disabled':''} style="position:relative;overflow:hidden;font:600 12px var(--sans);padding:8px 14px;border:0;background:${S.running?'var(--ink2)':'var(--teal)'};color:#fff;border-radius:8px;cursor:pointer">
          ${S.running ? 'Agent running…' : S.ran ? 'Re-run agent' : 'Run agent'}
          ${S.running ? '<span style="position:absolute;inset:0;background:linear-gradient(100deg,transparent,rgba(255,255,255,.25),transparent);animation:sweep 1.4s infinite"></span>' : ''}
        </button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 15px">
        <div style="font-size:11px;color:var(--muted);font-weight:500">ALC patients today</div>
        <div style="font:600 30px var(--mono);color:var(--ink);margin-top:6px;letter-spacing:-.02em">${DB.patients.length}</div>
        <div style="font-size:11px;color:var(--ink2);margin-top:3px">${Tools.get_alc_census().patientDays.toLocaleString()} cumulative patient-days</div>
      </div>
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 15px">
        <div style="font-size:11px;color:var(--muted);font-weight:500">Direct cost to date <sup data-tip="Σ ALC days × daily direct cost across ${DB.patients.length} patients|peoplesoft.gl.patient_costs">?</sup></div>
        <div style="font:600 30px var(--mono);color:var(--ink);margin-top:6px;letter-spacing:-.02em">${fmt.moneyK(costs.totalToDate)}</div>
        <div style="font-size:11px;color:var(--ink2);margin-top:3px">acute per-diem $1.9K–$4.5K</div>
      </div>
      <div style="background:var(--burnsoft);border:1px solid #ecc9c0;border-radius:12px;padding:14px 15px">
        <div style="font-size:11px;color:var(--burn);font-weight:600">Nightly burn</div>
        <div style="font:600 30px var(--mono);color:var(--burn);margin-top:6px;letter-spacing:-.02em">$<span id="burnlive">${(costs.nightlyBurn/1000).toFixed(1)}</span>K</div>
        <div style="font-size:11px;color:#8f3324;margin-top:3px">${fmt.moneyK(costs.monthlyBurn)} / month at current census</div>
      </div>
      <div style="background:var(--moneysoft);border:1px solid #bfe0cd;border-radius:12px;padding:14px 15px">
        <div style="font-size:11px;color:var(--money);font-weight:600">Savings if matched</div>
        <div style="font:600 30px var(--mono);color:var(--money);margin-top:6px;letter-spacing:-.02em">+$<span id="kpi-savings">${Math.round(S.savingsShown/1000)}</span>K</div>
        <div style="font-size:11px;color:#155f3b;margin-top:3px">${nMatched ? nMatched + ' patients → contracted beds /mo' + (confirmedMonth ? ' · ' + fmt.moneyK(confirmedMonth) + ' confirmed ✓' : '') : 'run the agent to match'}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:12px;margin-bottom:14px">
      ${trendChartHTML()}
      ${savingsChartHTML(savePerMonth)}
    </div>

    <div style="display:grid;grid-template-columns:1fr 372px;gap:14px;align-items:start">
      <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
        <div class="bp" style="background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden">
          <div style="display:flex;align-items:center;gap:8px;padding:11px 15px;border-bottom:1px solid var(--line2)">
            <span style="width:16px;height:16px;border-radius:5px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#06201c;font-size:10px;font-weight:700;font-family:var(--mono)">✦</span>
            <span style="font-weight:600;font-size:13px">Agent opportunities</span>
            <span style="font-size:11px;color:var(--muted)">${oppRows.length && (nMatched||S.bizcase||S.amendment) ? [nMatched?1:0,S.bizcase?1:0,S.amendment?1:0].reduce((a,b)=>a+b) + ' open' : ''}</span>
          </div>
          <div style="display:flex;flex-direction:column">${oppRows.join('')}</div>
        </div>

        <div class="bp" style="background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden">
          <div style="display:flex;align-items:center;gap:10px;padding:11px 15px;border-bottom:1px solid var(--line2)">
            <span style="font-weight:600;font-size:13px">ALC census</span>
            <span style="font-size:11px;color:var(--muted)">${S.segmented ? 'priced & risk-scored · ' : ''}${shown.length} of ${DB.patients.length} shown</span>
            <div style="margin-left:auto;display:flex;gap:6px">
              ${nMatched||nUn ? `
                <span style="font-size:10.5px;color:var(--money);background:var(--moneysoft);padding:3px 8px;border-radius:20px;font-weight:600">${nMatched} matched</span>
                <span style="font-size:10.5px;color:var(--burn);background:var(--burnsoft);padding:3px 8px;border-radius:20px;font-weight:600">${nUn} unmatched</span>`
              : `<span style="font-size:10.5px;color:var(--muted);background:var(--panel3);padding:3px 8px;border-radius:20px;font-weight:600">${DB.patients.length} awaiting agent</span>`}
            </div>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="color:var(--muted);text-align:left;font-size:10.5px;letter-spacing:.04em">
                <th style="padding:8px 15px;font-weight:600">PATIENT</th><th style="padding:8px 8px;font-weight:600">PRESENTATION</th>
                <th style="padding:8px 8px;font-weight:600;text-align:right">ALC d</th><th style="padding:8px 8px;font-weight:600;text-align:right">COST TO DATE</th>
                <th style="padding:8px 8px;font-weight:600;text-align:right">NIGHTLY</th><th style="padding:8px 10px;font-weight:600">RISK</th>
                <th style="padding:8px 8px;font-weight:600">TIER</th><th style="padding:8px 15px;font-weight:600">STATUS</th>
              </tr></thead>
              <tbody>
                ${shown.map(p => {
                  const r = riskOf(p), tm = tierMeta(r), st = patientStatus(p);
                  const justMatched = S.matches[p.id] && S.matches[p.id]._fresh;
                  return `<tr ${justMatched?'class="flash"':''} style="border-top:1px solid var(--line2)">
                    <td style="padding:9px 15px"><div style="font-weight:600;font-size:12.5px">${p.name}</div><div style="font-family:var(--mono);font-size:10px;color:var(--faint)">${p.id} · ${p.age}y · ${p.unit}</div></td>
                    <td style="padding:9px 8px;color:var(--ink2);max-width:160px">${p.dx}</td>
                    <td style="padding:9px 8px;text-align:right;font-family:var(--mono);color:${p.days>70?'var(--burn)':p.days>45?'var(--amber)':'var(--ink2)'};font-weight:500">${p.days}</td>
                    <td style="padding:9px 8px;text-align:right;font-family:var(--mono)">${money(p.days*p.burn)}</td>
                    <td style="padding:9px 8px;text-align:right;font-family:var(--mono);color:var(--burn)">${money(p.burn)}</td>
                    <td style="padding:9px 10px">${S.segmented ? `
                      <div style="display:flex;align-items:center;gap:7px">
                        <div style="width:52px;height:5px;border-radius:4px;background:var(--line);overflow:hidden"><div style="height:100%;width:${r}%;background:${riskColor(r)}"></div></div>
                        <span style="font-family:var(--mono);font-size:11px;font-weight:600;color:${riskColor(r)}">${r}</span>
                      </div>` : '<span style="color:var(--faint);font-family:var(--mono);font-size:11px">—</span>'}</td>
                    <td style="padding:9px 8px">${S.segmented ? `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:5px;color:${tm.c};background:${tm.bg}">${tm.t}</span>` : '<span style="color:var(--faint)">—</span>'}</td>
                    <td style="padding:9px 15px"><span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:${st.color}"><span style="width:6px;height:6px;border-radius:50%;background:${st.color}"></span>${st.label}</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div onclick="S.showAll=!S.showAll;render()" style="padding:9px 15px;border-top:1px solid var(--line2);font-size:11px;color:var(--muted);text-align:center;cursor:pointer">${S.showAll ? 'Show fewer ▴' : 'Show ' + (DB.patients.length-12) + ' more patients ▾'}</div>
        </div>
      </div>

      <div style="position:sticky;top:0;display:flex;flex-direction:column;gap:14px">
        ${agentPanelHTML()}
        <div class="bp" style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 15px">
          <div style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted);margin-bottom:11px">BED UTILIZATION</div>
          <div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:var(--ink2)">Before decant</span><span style="font-family:var(--mono);color:var(--muted)">${DB.hospital.occupied}/${DB.hospital.totalBeds} · ${Math.round(100*DB.hospital.occupied/DB.hospital.totalBeds)}%</span></div><div style="height:9px;border-radius:5px;background:var(--line);overflow:hidden"><div style="height:100%;width:${Math.round(100*DB.hospital.occupied/DB.hospital.totalBeds)}%;background:var(--burn)"></div></div></div>
          <div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:var(--ink2)">After ${nMatched||'—'} matched</span><span style="font-family:var(--mono);color:var(--money)">${DB.hospital.occupied-nMatched}/${DB.hospital.totalBeds} · ${Math.round(100*(DB.hospital.occupied-nMatched)/DB.hospital.totalBeds)}%</span></div><div style="height:9px;border-radius:5px;background:var(--line);overflow:hidden"><div style="height:100%;width:${Math.round(100*(DB.hospital.occupied-nMatched)/DB.hospital.totalBeds)}%;background:var(--money)"></div></div></div>
          <div style="margin-top:11px;font-size:11px;color:var(--muted)">${nMatched ? nMatched + ' acute beds freed · worth <b style="color:var(--ink)">' + fmt.moneyK(matchedBurn) + '/night</b> in direct cost alone' : 'run the agent to free acute beds'}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function agentPanelHTML() {
  const log = S.agentLog.map(e => {
    if (e.kind === 'think') return `<div class="rise" style="font-size:11px;color:#7fa39c;font-style:italic;line-height:1.5;padding:1px 2px">${esc(e.text)}</div>`;
    return `<div class="rise" style="font-family:var(--mono);font-size:10.5px;line-height:1.55;color:#c7ded8;padding:1px 2px">
      <span style="color:#5b7a73">${e.t}</span> <span style="color:${e.live?'#ffd65c':'var(--accent)'};font-weight:600">▸ ${esc(e.name)}(${esc(e.args||'')})</span><br>
      <span style="color:#9dc0b8;padding-left:14px">→ ${esc(e.result)}</span></div>`;
  }).join('');
  const chat = S.chat.map(m => `
    <div style="${m.role==='agent'?'align-self:flex-start;max-width:92%':'align-self:flex-end;max-width:86%'}">
      <div style="${m.role==='agent'
        ? 'background:var(--agentbg2);border:1px solid var(--agentline);color:#dbeeea;padding:9px 12px;border-radius:12px 12px 12px 3px;font-size:11.5px;line-height:1.5'
        : 'background:var(--accent);color:#06201c;padding:9px 12px;border-radius:12px 12px 3px 12px;font-size:11.5px;line-height:1.5;font-weight:500'}">${esc(m.text)}</div>
    </div>`).join('');
  const liveMode = !!localStorage.getItem('transfer_api_key');
  return `
  <div style="background:var(--agentbg);border:1px solid #06110f;border-radius:12px;overflow:hidden;box-shadow:0 8px 26px rgba(6,17,15,.2);display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid var(--agentline)">
      <span style="width:24px;height:24px;border-radius:7px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#06201c;font-size:12px;font-weight:700;font-family:var(--mono)">✦</span>
      <div style="line-height:1.25"><div style="font-weight:600;font-size:12.5px;color:#eaf4f1">Bed Arbitrage Agent</div>
      <div style="font-size:9.5px;color:var(--accent);font-family:var(--mono)">● ${liveMode ? 'live · Anthropic API + 9 tools' : 'online'} · every claim traced to source</div></div>
      <div style="margin-left:auto;display:flex;background:var(--agentbg2);border:1px solid var(--agentline);border-radius:7px;padding:2px">
        <button onclick="S.agentTab='activity';render()" style="font:600 10px var(--sans);padding:4px 8px;border:0;border-radius:5px;cursor:pointer;${S.agentTab==='activity'?'background:var(--accent);color:#06201c':'background:transparent;color:#9dc0b8'}">Activity</button>
        <button onclick="S.agentTab='chat';render()" style="font:600 10px var(--sans);padding:4px 8px;border:0;border-radius:5px;cursor:pointer;${S.agentTab==='chat'?'background:var(--accent);color:#06201c':'background:transparent;color:#9dc0b8'}">Chat</button>
      </div>
    </div>
    <div id="agentfeed" style="padding:12px 12px 8px;display:flex;flex-direction:column;gap:${S.agentTab==='activity'?'7':'9'}px;height:300px;overflow:auto">
      ${S.agentTab === 'activity'
        ? (log || '<div style="font-size:11px;color:#5b7a73;font-style:italic">No activity yet — run the agent and watch it think: scan → price → score → match → draft.</div>')
        : chat + (S.typing ? `<div style="align-self:flex-start;display:flex;gap:4px;padding:10px 12px;background:var(--agentbg2);border:1px solid var(--agentline);border-radius:12px 12px 12px 3px">
            <span style="width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 1s infinite"></span>
            <span style="width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 1s infinite .2s"></span>
            <span style="width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 1s infinite .4s"></span></div>` : '')}
    </div>
    <div style="padding:7px 10px;display:flex;gap:6px;flex-wrap:wrap;border-top:1px solid var(--agentline)">
      <span onclick="runAgent()" style="font-size:10.5px;color:#bfe0d8;background:var(--agentbg2);border:1px solid var(--agentline);padding:4px 9px;border-radius:20px;cursor:pointer">Run matching</span>
      <span onclick="askAgent('Why can\\'t we place the unmatched patients?')" style="font-size:10.5px;color:#bfe0d8;background:var(--agentbg2);border:1px solid var(--agentline);padding:4px 9px;border-radius:20px;cursor:pointer">Why unmatched?</span>
      ${S.bizcase ? `<span onclick="go('case')" style="font-size:10.5px;color:#06201c;background:var(--accent);padding:4px 9px;border-radius:20px;cursor:pointer;font-weight:600">Open business case</span>` : ''}
    </div>
    <div style="padding:8px 10px 10px;display:flex;gap:7px;align-items:center">
      <input id="agentinput" placeholder="Ask the agent…" onkeydown="if(event.key==='Enter')submitAgentInput()" style="flex:1;background:var(--agentbg2);border:1px solid var(--agentline);border-radius:8px;padding:8px 11px;font:400 12px var(--sans);color:#eaf4f1;outline:none">
      <button onclick="submitAgentInput()" style="width:32px;height:32px;border:0;border-radius:8px;background:var(--accent);color:#06201c;font-size:15px;cursor:pointer">→</button>
    </div>
  </div>`;
}

function trendChartHTML() {
  const inK = TREND.inHouse, outK = TREND.transferred, WK = TREND.weeks;
  const cW=640,pL=44,pR=8,pT=12,pB=24,cH=210, maxV=Math.max(...inK)*1.12;
  const xs=(cW-pL-pR)/(WK.length-1), yOf=v=>cH-pB-(v/maxV)*(cH-pT-pB);
  const ptsIn=inK.map((v,i)=>({x:pL+i*xs,y:yOf(v)})), ptsOut=outK.map((v,i)=>({x:pL+i*xs,y:yOf(v)}));
  const path=pts=>'M'+pts.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' L');
  const yGrid=[0,1,2,3].map(i=>{const v=(maxV/3)*i;return {y:yOf(v),label:'$'+Math.round(v)+'k'};});
  return `
  <div class="bp" style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px">
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px"><span style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted)">WEEKLY COST TREND</span><span style="font-size:11px;color:var(--ink2)">acute in-house vs. transferred to SNF</span></div>
    <svg viewBox="0 0 640 210" style="width:100%;height:196px">
      ${yGrid.map(g=>`<line x1="44" x2="632" y1="${g.y}" y2="${g.y}" stroke="var(--line)" stroke-width="1"></line><text x="18" y="${g.y-3}" font-size="9" fill="var(--muted)">${g.label}</text>`).join('')}
      <text x="9" y="105" font-size="9.5" fill="var(--muted)" text-anchor="middle" transform="rotate(-90 9 105)">Cost ($)</text>
      <line x1="44" y1="12" x2="44" y2="186" stroke="var(--ink2)" stroke-width="1.2" opacity=".55"></line>
      <line x1="44" y1="186" x2="632" y2="186" stroke="var(--ink2)" stroke-width="1.2" opacity=".55"></line>
      <path d="${path(ptsIn)}" fill="none" stroke="var(--burn)" stroke-width="2.2"></path>
      <path d="${path(ptsOut)}" fill="none" stroke="var(--teal)" stroke-width="2.2"></path>
      ${ptsIn.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="2.6" fill="var(--burn)"></circle>`).join('')}
      ${ptsOut.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="2.6" fill="var(--teal)"></circle>`).join('')}
      ${WK.map((l,i)=>`<text x="${pL+i*xs}" y="205" font-size="9" fill="var(--muted)" text-anchor="middle">${l}</text>`).join('')}
    </svg>
    <div style="display:flex;gap:16px;font-size:11px;color:var(--ink2);margin-top:2px">
      <span style="display:flex;align-items:center;gap:6px"><i style="width:11px;height:3px;background:var(--burn);display:inline-block"></i>In-house (acute)</span>
      <span style="display:flex;align-items:center;gap:6px"><i style="width:11px;height:3px;background:var(--teal);display:inline-block"></i>Transferred (SNF)</span>
    </div>
  </div>`;
}

function savingsChartHTML(savePerMonth) {
  const annual = (savePerMonth || Tools.match_cache().savePerMonth) * 12 / 1e6;
  const vals = [1,2,3,4,5].map(y => +(annual*y).toFixed(1));
  const bW=300,bPB=26,bPT=22,bH=196,gap=14,bx0=24,maxR=Math.max(...vals)*1.18;
  const bw=(bW-bx0-gap*(vals.length+1))/vals.length;
  const bars=vals.map((v,i)=>{const h=(v/maxR)*(bH-bPT-bPB);const x=bx0+gap+i*(bw+gap);const y=bH-bPB-h;return {x,y,w:bw,h,cx:x+bw/2,vy:y-6,val:'$'+v+'M',label:'Y'+(i+1)};});
  return `
  <div class="bp" style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px">
    <div style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted);margin-bottom:2px">CUMULATIVE SAVINGS</div>
    <div style="font-size:11px;color:var(--ink2);margin-bottom:6px">if matched cohort holds ($M)<sup data-tip="matched net savings × 12 months × years|agent.match × peoplesoft.gl">?</sup></div>
    <svg viewBox="0 0 300 210" style="width:100%;height:186px">
      <text x="10" y="90" font-size="9.5" fill="var(--muted)" text-anchor="middle" transform="rotate(-90 10 90)">Savings ($M)</text>
      <line x1="24" y1="8" x2="24" y2="170" stroke="var(--ink2)" stroke-width="1.2" opacity=".55"></line>
      <line x1="24" y1="170" x2="294" y2="170" stroke="var(--ink2)" stroke-width="1.2" opacity=".55"></line>
      ${bars.map(b=>`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" fill="var(--teal)"></rect>
        <text x="${b.cx}" y="${b.vy}" font-size="9.5" fill="var(--tealink)" text-anchor="middle" font-weight="600">${b.val}</text>
        <text x="${b.cx}" y="184" font-size="9" fill="var(--muted)" text-anchor="middle">${b.label}</text>`).join('')}
      <text x="159" y="205" font-size="9.5" fill="var(--muted)" text-anchor="middle">Years</text>
    </svg>
  </div>`;
}

/* ---------------- Case Manager workbench ---------------- */

function cmHTML() {
  const p = DB.patients.find(x => x.id === S.selectedPatient) || DB.patients[2];
  const r = riskOf(p), tm = tierMeta(r);
  const initials = p.name.split(' ').map(x=>x[0]).join('');
  const centers = DB.costModel.centers.map(([c,w]) => `${c.split(' ')[0]} ${money(p.burn*w)}`).join(' · ');
  const eligible = DB.snfs.filter(s => p.needs.every(n => s.caps.includes(n)) && s.openBeds > 0);
  const offerSnf = eligible.find(s=>s.contracted) || eligible[0] || DB.snfs[0];
  const rate = Tools.rateFor(p, offerSnf);
  const los = p.factors.find(f=>/LOS/.test(f.label));
  const losTxt = los ? los.label.replace('Expected LOS ','').replace('Uncertain LOS','45–75d') : '30–55d';
  const [lo,hi] = (losTxt.match(/\d+/g)||[30,55]).map(Number);
  const uninsured = p.payer === 'Uninsured';
  const pkg = S.packageState[p.id];
  const ticks = S.pkgTicks[p.id] || 0;
  const pkgItems = ['History & physical','Current medications','Rehab notes','Assessment & plan','Nursing notes','Psych evaluation (if needed)','Risk index','Wound care plan'];
  const needsPsych = p.needs.includes('behavioral');
  const ref = S.referrals.find(x => x.pid === p.id);

  return `
  <div style="padding:20px 22px 40px;min-width:980px">
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--teal)">HOSPITAL CASE MANAGER · DISCHARGE WORKBENCH</div>
      <h1 style="margin:5px 0 3px;font-size:23px;font-weight:700;letter-spacing:-.01em">Discharge Workbench</h1>
      <div style="font-size:12px;color:var(--muted);font-family:var(--mono)">ALC list from Epic FHIR · face sheet + risk index + networked referral · no eFax</div>
    </div>
    <div style="display:grid;grid-template-columns:300px 1fr;gap:14px;align-items:start">
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;max-height:78vh;overflow-y:auto">
        <div style="padding:11px 14px;border-bottom:1px solid var(--line2);display:flex;align-items:center;gap:8px;position:sticky;top:0;background:var(--panel)"><span style="font-weight:600;font-size:13px">My ALC patients</span><span style="margin-left:auto;font-size:11px;color:var(--muted)">${DB.patients.length}</span></div>
        ${DB.patients.map(x => {
          const xr = riskOf(x), xtm = tierMeta(xr), active = x.id === p.id;
          const m = S.matches[x.id];
          const chip = m ? 'Bed held · ' + m.snf.split(' ')[0] : null;
          return `<div onclick="S.selectedPatient='${x.id}';render()" style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-top:1px solid var(--line2);cursor:pointer;${active?'background:var(--tealsoft);border-left:3px solid var(--teal)':'border-left:3px solid transparent'}">
            <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:12.5px">${x.name}</div><div style="font-size:10.5px;color:var(--muted)">${x.dx}</div><div style="font-family:var(--mono);font-size:10px;color:var(--burn);margin-top:1px">${money(x.burn)}/night acute</div>
            ${chip?`<div style="display:inline-flex;align-items:center;gap:5px;margin-top:4px;font-size:9.5px;font-weight:600;color:var(--tealink);background:var(--tealsoft);border:1px solid #bfdcd5;padding:2px 8px;border-radius:20px"><svg width="12" height="9" viewBox="0 0 12 9" style="flex:none"><circle cx="2.6" cy="4" r="1.5" fill="currentColor"></circle><rect x="4.6" y="2.6" width="7" height="3" rx="1.2" fill="currentColor"></rect><rect x="0.3" y="6.3" width="11.4" height="1.4" rx="0.7" fill="currentColor"></rect></svg>${chip}</div>`:''}</div>
            <div style="text-align:right;flex:none"><span style="font-family:var(--mono);font-size:11px;font-weight:600;color:${riskColor(xr)}">${xr}</span><div style="font-size:9.5px;color:${xtm.c};font-weight:600">${xtm.t}</div></div>
          </div>`;
        }).join('')}
      </div>

      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden">
        <div style="padding:16px 18px;border-bottom:1px solid var(--line2);display:flex;align-items:flex-start;gap:14px">
          <div style="width:46px;height:46px;border-radius:10px;background:var(--panel3);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--teal);font-size:16px">${initials}</div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:10px"><h2 style="margin:0;font-size:18px;font-weight:700">${p.name}</h2><span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:5px;color:${tm.c};background:${tm.bg}">TIER ${tm.s.slice(1)} · ${tm.t.toUpperCase()}</span></div>
            <div style="font-size:11.5px;color:var(--muted);font-family:var(--mono);margin-top:3px">${p.id} · ${p.age}y · ${p.sex} · Unit ${p.unit} · admitted ${new Date(p.admitted+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} · ALC ${p.days} days</div>
          </div>
          <button onclick="generatePackage('${p.id}')" ${pkg?'disabled':''} style="font:600 12px var(--sans);padding:8px 13px;border:0;background:${pkg==='ready'?'var(--money)':'var(--teal)'};color:#fff;border-radius:8px;cursor:pointer">${pkg==='ready'?'✓ Package ready':pkg==='generating'?'Assembling…':'Generate package'}</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
          <div style="padding:16px 18px;border-right:1px solid var(--line2);display:flex;flex-direction:column;gap:15px">
            <div>
              <div style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted);margin-bottom:7px">PRESENTATION</div>
              <div style="font-size:13px;color:var(--ink);line-height:1.5">${p.presentation}</div>
            </div>
            <div>
              <div style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted);margin-bottom:7px">DISCHARGE BARRIERS</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${p.barriers.map(b => {
                  const hot = /uninsured|behavioral/i.test(b), warm = /wound|dialysis|IV|trach|dementia/i.test(b);
                  return `<span style="font-size:11px;padding:4px 9px;border-radius:6px;background:${hot?'var(--burnsoft)':warm?'var(--ambersoft)':'var(--panel3)'};color:${hot?'var(--burn)':warm?'var(--amber)':'var(--ink2)'};font-weight:500">${b}</span>`;
                }).join('')}
              </div>
            </div>
            <div>
              <div style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted);margin-bottom:7px">COST TO DATE <span style="color:var(--faint);font-weight:400">· PeopleSoft GL</span></div>
              <div style="display:flex;align-items:baseline;gap:10px"><span style="font:600 26px var(--mono)">${money(p.days*p.burn)}</span><span style="font-size:12px;color:var(--burn);font-family:var(--mono)">${money(p.burn)}/night</span></div>
              <div style="font-size:10.5px;color:var(--muted);margin-top:3px">${centers}</div>
            </div>
          </div>
          <div style="padding:16px 18px;background:var(--panel2)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted)">RISK INDEX <span style="color:var(--faint);font-weight:400">· shared with SNF</span></div>
              <div style="display:flex;align-items:baseline;gap:4px"><span style="font:600 26px var(--mono);color:${riskColor(r)}">${r}</span><span style="font-size:11px;color:var(--muted)">/100</span></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:9px">
              ${p.factors.map(f => `<div>
                <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px"><span style="color:var(--ink2)">${f.label}</span><span style="font-family:var(--mono);color:var(--muted)">+${f.pts}</span></div>
                <div style="height:6px;border-radius:4px;background:var(--line);overflow:hidden"><div style="height:100%;width:${Math.min(100,f.pts*4)}%;background:${f.pts>=16?'var(--burn)':f.pts>=10?'var(--amber)':'var(--teal)'}"></div></div>
              </div>`).join('')}
            </div>
            <div style="margin-top:14px;padding:11px;background:var(--tealsoft);border:1px solid #bfdcd5;border-radius:9px;font-size:11.5px;color:var(--tealink);line-height:1.5">The SNF sees this exact breakdown. Declines become <b>risk-adjusted rate negotiations</b>, not silence.</div>
          </div>
        </div>
        <div style="border-top:1px solid var(--line2);padding:14px 18px;background:var(--panel2)">
          <div style="display:flex;align-items:baseline;gap:9px;margin-bottom:11px">
            <span style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted)">CONTRACT OFFER — THIS PATIENT</span>
            <span style="font-size:10.5px;color:var(--faint)">per-diem priced from PeopleSoft cost + risk index · formula: base + $3 × (risk − 40)</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 13px">
              <div style="font-size:9.5px;font-weight:600;color:var(--muted)">${offerSnf.contracted?'STANDARD BLOCK RATE':'FACILITY RATE'}</div>
              <div style="font:600 16px var(--mono);margin-top:2px">${money(rate.base)}<span style="font-size:10.5px;color:var(--muted);font-weight:400">/day</span></div>
            </div>
            <span style="font:600 15px var(--mono);color:var(--muted)">+</span>
            <div style="background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 13px">
              <div style="font-size:9.5px;font-weight:600;color:var(--amber)">RISK ADJUSTMENT · ${tm.s}</div>
              <div style="font:600 16px var(--mono);color:var(--amber);margin-top:2px">+${money(rate.adj)}<span style="font-size:10.5px;font-weight:400">/day</span></div>
            </div>
            <span style="font:600 15px var(--mono);color:var(--muted)">=</span>
            <div style="background:var(--ambersoft);border:1.5px solid var(--amber);border-radius:9px;padding:9px 13px">
              <div style="font-size:9.5px;font-weight:700;color:var(--amber)">OFFER RATE</div>
              <div style="font:700 16px var(--mono);color:var(--amber);margin-top:2px">${money(rate.rate)}<span style="font-size:10.5px;font-weight:400">/day</span></div>
            </div>
            <div style="background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 13px">
              <div style="font-size:9.5px;font-weight:600;color:var(--muted)">EST. VALUE · LOS ${losTxt}</div>
              <div style="font:600 16px var(--mono);margin-top:2px">$${(lo*rate.rate/1000).toFixed(1)}–${(hi*rate.rate/1000).toFixed(1)}K</div>
            </div>
            <div style="margin-left:auto;display:flex;align-items:center;gap:12px">
              <div style="text-align:right">
                <div style="font-size:10px;color:var(--muted)">vs ${money(p.burn)}/night acute</div>
                <div style="font:600 13px var(--mono);color:var(--money)">saves ${money(p.burn-rate.rate)}/night</div>
              </div>
            </div>
          </div>
          ${uninsured ? `<div style="margin-top:10px;font-size:11px;color:var(--burn);background:var(--burnsoft);border:1px solid #ecc9c0;border-radius:8px;padding:8px 11px">Uninsured — offer carries a <b>hospital-backed rate guarantee</b>; if no facility accepts, this patient routes to the supportive-housing pathway (see Business Case).</div>` : ''}
        </div>
        <div style="padding:14px 18px;border-top:1px solid var(--line2)">
          <div style="display:flex;align-items:baseline;gap:9px;margin-bottom:10px">
            <span style="font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted)">DISCHARGE PACKAGE</span>
            <span style="font-size:10.5px;color:var(--money);font-family:var(--mono)">${pkg==='ready' ? (needsPsych?8:7)+' of 8 ready' : pkg==='generating' ? ticks+' of 8…' : 'not generated'}</span>
            <span style="font-size:10.5px;color:var(--faint)">· auto-assembled from chart, editable before send</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px">
            ${pkgItems.map((label,i) => {
              const na = label.startsWith('Psych') && !needsPsych;
              const done = pkg==='ready' ? !na : pkg==='generating' ? i < ticks && !na : false;
              return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;font-size:11.5px;${done?'border:1px solid var(--line2);background:var(--panel2);color:var(--ink)':'border:1px dashed var(--line);color:var(--muted)'}">
                <span style="width:15px;height:15px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex:none;${done?'background:var(--money);color:#fff':'border:1px solid var(--line);color:var(--muted)'}">${done?'✓':na?'—':''}</span>
                <span style="flex:1">${label}</span></div>`;
            }).join('')}
          </div>
        </div>
        <div style="padding:14px 18px;border-top:1px solid var(--line2);display:flex;align-items:center;gap:12px;background:var(--panel)">
          <div style="font-size:11px;color:var(--muted)">${ref ? `Referral ${ref.status === 'new' ? 'sent to' : ref.status} · <b>${ref.snfName}</b> at <b style="color:var(--amber)">${money(ref.rate)}/day</b>` : pkg==='ready' ? `Package ready · ${needsPsych?'psych evaluation attached':'psych evaluation not required'} · <b style="color:var(--amber)">Offer rate ${money(rate.rate)}/day</b>` : 'Generate the package to enable referral'}</div>
          <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
            <select id="refdest" style="font:500 12px var(--sans);padding:8px 12px;border:1px solid var(--line);border-radius:8px;color:var(--ink2);background:var(--panel)">
              ${(eligible.length?eligible:DB.snfs.filter(s=>s.contracted)).map(s => `<option value="${s.id}">${s.name} — ${s.caps.join('/')} · ${money(Tools.rateFor(p,s).rate)}/day</option>`).join('')}
            </select>
            <button onclick="sendReferral('${p.id}')" ${pkg!=='ready'||ref?'disabled':''} style="font:600 12px var(--sans);padding:9px 16px;border:0;background:${pkg==='ready'&&!ref?'var(--teal)':'var(--faint)'};color:#fff;border-radius:8px;cursor:${pkg==='ready'&&!ref?'pointer':'default'}">${ref?'Referral sent ✓':'Send referral →'}</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------------- SNF inbox ---------------- */

function snfHTML() {
  const mw = DB.snfs.find(s => s.id === 'maplewood');
  const c = DB.contracts.find(x => x.snfId === 'maplewood');
  const refs = S.referrals.filter(r => r.snfId === 'maplewood');
  const sel = refs[S.selectedReferral] || refs[0];
  const selP = sel ? DB.patients.find(p => p.id === sel.pid) : null;
  const newCount = refs.filter(r=>r.status==='new').length;
  const accepted = refs.filter(r=>r.status==='accepted').length;
  const tiers = refs.map(r => tierMeta(riskOf(DB.patients.find(p=>p.id===r.pid))).t);

  return `
  <div style="padding:20px 22px 40px;min-width:980px">
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--teal)">SNF ADMISSIONS · MAPLEWOOD SKILLED NURSING</div>
      <h1 style="margin:5px 0 3px;font-size:23px;font-weight:700;letter-spacing:-.01em">Referral Inbox</h1>
      <div style="font-size:12px;color:var(--muted);font-family:var(--mono)">Same risk index the hospital sees · you never admit a patient you couldn't price</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 15px">
        <div style="font-size:11px;color:var(--muted)">Occupancy</div>
        <div style="font:600 26px var(--mono);margin-top:5px">${mw.occupied+accepted}<span style="font-size:15px;color:var(--muted)">/${mw.beds}</span></div>
        <div style="height:6px;border-radius:4px;background:var(--line);margin-top:8px;overflow:hidden"><div style="height:100%;width:${Math.round(100*(mw.occupied+accepted)/mw.beds)}%;background:var(--amber)"></div></div>
      </div>
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 15px"><div style="font-size:11px;color:var(--muted)">Open beds</div><div style="font:600 26px var(--mono);margin-top:5px;color:var(--money)">${mw.openBeds + (c.beds-c.blockUsed) - accepted}</div><div style="font-size:10.5px;color:var(--muted);margin-top:6px">${c.beds-c.blockUsed-accepted<0?0:c.beds-c.blockUsed-accepted} block · ${mw.openBeds} unblocked</div></div>
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 15px"><div style="font-size:11px;color:var(--muted)">Contracted block</div><div style="font:600 26px var(--mono);margin-top:5px">${c.beds} <span style="font-size:13px;color:var(--money)">${c.util60d}%</span></div><div style="font-size:10.5px;color:var(--muted);margin-top:6px">St. Vincent · ${money(c.rate)}/day</div></div>
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 15px"><div style="font-size:11px;color:var(--muted)">New referrals</div><div style="font:600 26px var(--mono);margin-top:5px;color:var(--teal)">${newCount}</div><div style="font-size:10.5px;color:var(--muted);margin-top:6px">${tiers.filter(t=>t==='Standard').length} Standard · ${tiers.filter(t=>t==='Complex').length} Complex${tiers.filter(t=>t==='High').length?' · '+tiers.filter(t=>t==='High').length+' High':''}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 340px;gap:14px;align-items:start">
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden">
        <div style="padding:11px 15px;border-bottom:1px solid var(--line2);font-weight:600;font-size:13px">Incoming packages</div>
        ${refs.length ? refs.map((r,i) => {
          const p = DB.patients.find(x=>x.id===r.pid), rr = riskOf(p), tm = tierMeta(rr);
          const pill = { new:['New','var(--teal)','var(--tealsoft)'], open:['Open','var(--amber)','var(--ambersoft)'],
                         accepted:['Accepted','var(--money)','var(--moneysoft)'], countered:['Countered','var(--amber)','var(--ambersoft)'],
                         declined:['Declined','var(--burn)','var(--burnsoft)'] }[r.status] || ['New','var(--teal)','var(--tealsoft)'];
          return `<div onclick="S.selectedReferral=${i};render()" style="display:flex;align-items:center;gap:12px;padding:12px 15px;border-top:1px solid var(--line2);cursor:pointer;${sel===r?'background:var(--panel2)':''}">
            <div style="width:34px;height:34px;border-radius:8px;background:var(--panel3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:var(--teal);flex:none">${p.name.split(' ').map(x=>x[0]).join('')}</div>
            <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">${p.name} <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:5px;color:${tm.c};background:${tm.bg}">${tm.s}</span></div><div style="font-size:11px;color:var(--muted)">${p.dx} · from St. Vincent ${r.from==='agent'?'· agent-drafted':'CM'}</div></div>
            <div style="text-align:center;flex:none"><span style="font:600 15px var(--mono);color:${riskColor(rr)}">${rr}</span><div style="font-size:9px;color:var(--muted)">risk</div></div>
            <div style="text-align:right;flex:none;width:78px"><div style="font:600 13px var(--mono)">${money(r.rate)}</div><div style="font-size:9px;color:var(--muted)">${r.adj?'risk-adj':'standard'}</div></div>
            <span style="font-size:10px;font-weight:600;padding:3px 9px;border-radius:20px;color:${pill[1]};background:${pill[2]};flex:none">${pill[0]}</span>
          </div>`;
        }).join('') : `<div style="padding:26px 15px;font-size:12px;color:var(--muted);text-align:center">No referrals yet — the hospital's agent hasn't sent any. (Run the agent from the VP dashboard.)</div>`}
      </div>
      ${sel ? (() => {
        const rr = riskOf(selP), tm = tierMeta(rr);
        return `<div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden">
        <div style="padding:13px 15px;border-bottom:1px solid var(--line2);display:flex;align-items:center;gap:8px"><span style="font-weight:600;font-size:13px">${selP.name}</span><span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:5px;color:${tm.c};background:${tm.bg}">TIER ${tm.s.slice(1)}</span><span style="margin-left:auto;font:600 16px var(--mono);color:${riskColor(rr)}">${rr}</span></div>
        <div style="padding:14px 15px;display:flex;flex-direction:column;gap:12px">
          <div style="font-size:12px;color:var(--ink2);line-height:1.5">${selP.presentation.split('. ').slice(1).join('. ') || selP.presentation} Barriers itemized by the hospital — no surprises on admission.</div>
          <div>
            <div style="font-size:10.5px;font-weight:600;color:var(--muted);margin-bottom:7px">RISK DRIVERS (same as hospital)</div>
            <div style="display:flex;flex-direction:column;gap:7px">
              ${selP.factors.map(f => `<div style="display:flex;justify-content:space-between;font-size:11.5px"><span>${f.label}</span><span style="font-family:var(--mono);color:${f.pts>=16?'var(--burn)':f.pts>=10?'var(--amber)':'var(--muted)'}">+${f.pts}</span></div>`).join('')}
            </div>
          </div>
          <div style="background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:11px">
            <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px"><span style="color:var(--muted)">Standard per-diem</span><span style="font-family:var(--mono)">${money(sel.base)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:11.5px"><span style="color:var(--ink)">Risk-adjusted offer</span><span style="font-family:var(--mono);font-weight:600;color:var(--money)">${money(sel.rate)}</span></div>
          </div>
          ${sel.status==='accepted' ? `<div style="font-size:11.5px;color:var(--money);background:var(--moneysoft);border:1px solid #bfe0cd;border-radius:8px;padding:9px 11px;text-align:center;font-weight:600">✓ Accepted &amp; signed — bed held, hospital notified</div>`
          : sel.status==='declined' ? `<div style="font-size:11.5px;color:var(--burn);background:var(--burnsoft);border-radius:8px;padding:9px 11px;text-align:center;font-weight:600">Declined — reason sent to hospital for renegotiation</div>`
          : `<div style="display:flex;flex-direction:column;gap:6px">
              <button onclick="S.contractModal=${S.referrals.indexOf(sel)};render()" style="width:100%;font:600 12.5px var(--sans);padding:10px;border:0;background:var(--teal);color:#fff;border-radius:8px;cursor:pointer">Review contract →</button>
              <div style="font-size:10.5px;color:var(--muted);text-align:center">terms only · accept, counter, or decline via DocuSign</div>
            </div>`}
        </div>
      </div>`; })() : '<div></div>'}
    </div>
  </div>`;
}

function contractModalHTML() {
  const r = S.referrals[S.contractModal];
  if (!r) return '';
  const p = DB.patients.find(x => x.id === r.pid);
  const los = p.factors.find(f=>/LOS/.test(f.label));
  const losTxt = los ? los.label.replace('Expected LOS ','') .replace('Uncertain LOS','45–75 days (uncertain)') : '30–55d';
  return `
  <div onclick="if(event.target===this){S.contractModal=null;render()}" style="position:fixed;inset:0;background:rgba(10,25,22,.48);display:flex;align-items:center;justify-content:center;z-index:60;padding:24px">
    <div class="bp rise" style="width:660px;max-width:94vw;max-height:88vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 60px rgba(6,17,15,.35)">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:20px 24px 16px;border-bottom:2px solid var(--ink)">
        <div style="flex:1">
          <div style="font-size:10.5px;font-weight:600;letter-spacing:.08em;color:var(--teal)">CONTRACT REVIEW · OFFER TERMS ONLY</div>
          <h2 style="margin:6px 0 3px;font-size:19px;font-weight:700;letter-spacing:-.01em">Per-Diem Placement Agreement</h2>
          <div style="font-size:11.5px;color:var(--muted);font-family:var(--mono)">Patient ref ${p.id} · St. Vincent County Hospital → Maplewood Skilled Nursing · via TRANSFER</div>
        </div>
        <button onclick="S.contractModal=null;render()" style="font:600 14px var(--sans);width:28px;height:28px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);border-radius:7px;cursor:pointer">×</button>
      </div>
      <div style="padding:18px 24px 6px">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px"><tbody>
          <tr style="border-bottom:1px solid var(--line2)"><td style="padding:9px 4px;color:var(--muted);width:170px;vertical-align:top">Per-diem rate</td><td style="padding:9px 4px"><b style="font-family:var(--mono);font-size:14px">${money(r.rate)}/day</b> · ${r.adj ? 'risk-adjusted (' + money(r.base) + ' + ' + money(r.adj) + '), Tier ' + tierMeta(riskOf(p)).s.slice(1) : 'standard block rate'} — drivers itemized in the referral package</td></tr>
          <tr style="border-bottom:1px solid var(--line2)"><td style="padding:9px 4px;color:var(--muted);vertical-align:top">Effective</td><td style="padding:9px 4px">On admission · estimated LOS ${losTxt}</td></tr>
          <tr style="border-bottom:1px solid var(--line2)"><td style="padding:9px 4px;color:var(--muted);vertical-align:top">Payer</td><td style="padding:9px 4px">${p.payer}${p.payer==='Uninsured'?' · <b>hospital-backed rate guarantee for all days</b>':' · hospital-backed rate guarantee for any uncovered days'}</td></tr>
          <tr style="border-bottom:1px solid var(--line2)"><td style="padding:9px 4px;color:var(--muted);vertical-align:top">Services included</td><td style="padding:9px 4px">Skilled nursing · ${p.needs.map(n=>({rehab:'PT/OT program',wound:'wound care',dialysis:'dialysis transport (MWF)',iv_abx:'IV antibiotic administration',behavioral:'behavioral supports',dementia:'secure unit',dysphagia:'SLP program',bariatric:'bariatric equipment',trach:'respiratory therapy'}[n]||n)).join(' · ')} · medication administration</td></tr>
          <tr style="border-bottom:1px solid var(--line2)"><td style="padding:9px 4px;color:var(--muted);vertical-align:top">Rate review</td><td style="padding:9px 4px">Automatic renegotiation if LOS exceeds estimate</td></tr>
          <tr style="border-bottom:1px solid var(--line2)"><td style="padding:9px 4px;color:var(--muted);vertical-align:top">Readmission</td><td style="padding:9px 4px">Hospital accepts return within 72 hours if acute needs recur</td></tr>
          <tr><td style="padding:9px 4px;color:var(--muted);vertical-align:top">Billing</td><td style="padding:9px 4px">Weekly invoicing · net 30 · settled through TRANSFER</td></tr>
        </tbody></table>
        <div style="margin-top:12px;padding:10px 13px;background:var(--panel2);border:1px solid var(--line);border-radius:9px;font-size:11.5px;color:var(--ink2)">You see the offer terms only — the hospital's internal cost data is never shared through TRANSFER.</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:16px 24px 20px">
        <div style="display:flex;align-items:center;gap:7px;font-size:11px;color:var(--ink2)">
          <span style="width:20px;height:20px;border-radius:5px;background:var(--ink);color:#ffd65c;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px">D</span>
          <span><b>DocuSign</b> · envelope prepared</span>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button onclick="referralAction(${S.contractModal},'declined')" style="font:600 12px var(--sans);padding:10px 14px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);border-radius:8px;cursor:pointer">Decline</button>
          <button onclick="referralAction(${S.contractModal},'countered')" style="font:600 12px var(--sans);padding:10px 14px;border:1px solid var(--amber);background:var(--ambersoft);color:var(--amber);border-radius:8px;cursor:pointer">Counter +$25/day</button>
          <button onclick="referralAction(${S.contractModal},'accepted')" style="font:600 12px var(--sans);padding:10px 16px;border:0;background:var(--money);color:#fff;border-radius:8px;cursor:pointer">Accept &amp; sign via DocuSign →</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------------- Contracts ---------------- */

function contractsHTML() {
  return `
  <div style="padding:20px 22px 40px;min-width:980px">
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--teal)">SHARED · CONTRACTS &amp; BROKERAGE</div>
      <h1 style="margin:5px 0 3px;font-size:23px;font-weight:700;letter-spacing:-.01em">Contracted bed blocks</h1>
      <div style="font-size:12px;color:var(--muted);font-family:var(--mono)">Utilization across the network · agent-proposed expansions</div>
    </div>
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:14px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="color:var(--muted);text-align:left;font-size:10.5px;letter-spacing:.04em">
          <th style="padding:10px 15px;font-weight:600">FACILITY</th><th style="padding:10px 8px;font-weight:600;text-align:right">BEDS</th><th style="padding:10px 8px;font-weight:600;text-align:right">PER-DIEM</th><th style="padding:10px 12px;font-weight:600;width:200px">UTILIZATION (60d)</th><th style="padding:10px 8px;font-weight:600;text-align:right">MONTHLY</th><th style="padding:10px 15px;font-weight:600">TERM</th>
        </tr></thead>
        <tbody>
          ${DB.contracts.map(c => {
            const s = DB.snfs.find(x => x.id === c.snfId);
            const col = c.util60d >= 90 ? 'var(--amber)' : 'var(--money)';
            return `<tr style="border-top:1px solid var(--line2)">
              <td style="padding:12px 15px"><b>${s.name}</b><div style="font-size:10.5px;color:var(--muted)">${c.note}</div></td>
              <td style="padding:12px 8px;text-align:right;font-family:var(--mono)">${c.beds}</td>
              <td style="padding:12px 8px;text-align:right;font-family:var(--mono)">${money(c.rate)}</td>
              <td style="padding:12px 12px"><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:7px;border-radius:4px;background:var(--line);overflow:hidden"><div style="height:100%;width:${c.util60d}%;background:${col}"></div></div><span style="font-family:var(--mono);font-size:11px;color:${col};font-weight:600">${c.util60d}%</span></div></td>
              <td style="padding:12px 8px;text-align:right;font-family:var(--mono)">${fmt.moneyK(c.beds*c.rate*30.42)}</td>
              <td style="padding:12px 15px;color:var(--ink2)">${c.term}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${S.amendment ? `
    <div class="rise" style="background:var(--panel);border:1px solid var(--teal);border-radius:12px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:9px;padding:12px 16px;border-bottom:1px solid var(--line2);background:var(--tealsoft)">
        <span style="width:16px;height:16px;border-radius:5px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#06201c;font-size:10px;font-weight:700;font-family:var(--mono)">✦</span>
        <span style="font-weight:600;font-size:13px;color:var(--tealink)">Agent-drafted amendment</span>
        <span style="margin-left:auto;font-size:10.5px;color:var(--tealink);font-family:var(--mono)">${S.amendmentSigned ? 'SIGNED ✓' : 'DRAFT · sign-off required'}</span>
      </div>
      <div style="padding:16px 18px;display:grid;grid-template-columns:1fr 260px;gap:20px;align-items:center">
        <div>
          <div style="font-size:14px;font-weight:600;margin-bottom:6px">Maplewood — expand block by ${S.amendment.beds} beds</div>
          <div style="font-size:12.5px;color:var(--ink2);line-height:1.6">Your ${DB.contracts[0].beds}-bed block has run <b>${S.amendment.util60d}% full for 60 days</b>; Maplewood has <b>8 unblocked beds</b> at ${money(S.amendment.rate)}/day. Proposed amendment secures guaranteed volume for Maplewood and eliminates the current spill of Standard-tier patients to acute boarding.</div>
          <div style="margin-top:10px;font-size:11px;color:var(--muted);font-family:var(--mono)">source: ${S.amendment.source}</div>
        </div>
        <div style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:14px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px"><span style="color:var(--muted)">New beds</span><span style="font-family:var(--mono);font-weight:600">+${S.amendment.beds}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px"><span style="color:var(--muted)">Committed cost</span><span style="font-family:var(--mono)">${fmt.moneyK(S.amendment.committed)}/mo</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:10px"><span style="color:var(--muted)">Avoided acute burn <sup data-tip="${S.amendment.beds} beds × (blended Standard-tier acute per-diem $2,850 − block rate $410) × 30.42 days|contracts.maplewood × peoplesoft.gl">?</sup></span><span style="font-family:var(--mono);color:var(--money);font-weight:600">${fmt.moneyK(S.amendment.avoided)}/mo</span></div>
          <button onclick="signAmendment()" ${S.amendmentSigned?'disabled':''} style="width:100%;font:600 12px var(--sans);padding:9px;border:0;background:${S.amendmentSigned?'var(--money)':'var(--teal)'};color:#fff;border-radius:8px;cursor:pointer">${S.amendmentSigned?'✓ Signed — sent to Maplewood':'Review & sign'}</button>
        </div>
      </div>
    </div>` : `
    <div style="background:var(--panel);border:1px dashed var(--line);border-radius:12px;padding:22px;text-align:center;font-size:12px;color:var(--muted)">No agent proposals yet — run the agent from the VP dashboard. It watches block utilization and drafts expansions when blocks run hot.</div>`}
  </div>`;
}

/* ---------------- Business case ---------------- */

function caseHTML() {
  if (!S.bizcase) return `
  <div style="padding:24px 22px;display:flex;justify-content:center">
    <div style="max-width:560px;margin-top:60px;text-align:center">
      <div style="width:52px;height:52px;border-radius:14px;background:var(--panel3);display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--faint);margin:0 auto 14px">✦</div>
      <h2 style="margin:0 0 8px;font-size:18px">No business case drafted yet</h2>
      <div style="font-size:12.5px;color:var(--muted);line-height:1.6">When the agent finds ALC patients that no existing capacity can serve, it pulls real-estate comps and drafts a VP-ready acquisition memo here. <b>Run the agent from the Arbitrage Dashboard.</b></div>
    </div>
  </div>`;

  const occ = S.occupancy;
  const model = Tools.businessCaseModel(occ);
  const lo = Tools.businessCaseModel(0.70), base = Tools.businessCaseModel(0.85), hi = Tools.businessCaseModel(0.95);
  const today = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  const reveal = !S.memoRevealed;
  S.memoRevealed = true;
  const d = i => reveal ? `animation-delay:${(i*0.22).toFixed(2)}s` : 'animation:none';
  const cohortUninsured = DB.patients.filter(p => S.unmatchedInfo[p.id] && S.unmatchedInfo[p.id].reason==='coverage').length;

  return `
  <div style="padding:24px 22px 48px;display:flex;justify-content:center">
    <div style="width:100%;max-width:820px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <button onclick="go('vp')" style="font:600 12px var(--sans);padding:7px 12px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);border-radius:8px;cursor:pointer">← Dashboard</button>
        <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);font-family:var(--mono)"><span style="width:14px;height:14px;border-radius:4px;background:var(--accent);display:inline-flex;align-items:center;justify-content:center;color:#06201c;font-size:9px;font-weight:700">✦</span>drafted by Bed Arbitrage Agent · 3.1s · 4 source tables</span>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button onclick="S.agentTab='activity';go('vp')" style="font:600 12px var(--sans);padding:8px 13px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);border-radius:8px;cursor:pointer">Show reasoning</button>
          <button onclick="window.print()" style="font:600 12px var(--sans);padding:8px 13px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);border-radius:8px;cursor:pointer">Export PDF</button>
          <button onclick="toast('Memo sent to VP Finance inbox — flagged for Monday close')" style="font:600 12px var(--sans);padding:8px 14px;border:0;background:var(--teal);color:#fff;border-radius:8px;cursor:pointer">Send to VP Finance</button>
        </div>
      </div>
      <div id="memo-print" style="background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 4px 24px rgba(14,33,30,.06);overflow:hidden">
        <div style="padding:26px 34px 22px;border-bottom:2px solid var(--ink)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:11px;font-weight:600;letter-spacing:.1em;color:var(--teal)">CAPITAL BUSINESS CASE · DECISION SUPPORT DRAFT</div>
              <h1 style="margin:8px 0 4px;font-size:25px;font-weight:700;letter-spacing:-.015em;line-height:1.15">Supportive-housing acquisition for the coverage-gap ALC cohort</h1>
              <div style="font-size:12.5px;color:var(--muted)">To: VP Finance · From: Bed Arbitrage Agent · ${DB.hospital.name} · ${today}</div>
            </div>
            <span style="font-size:10px;font-weight:600;padding:4px 9px;border-radius:6px;color:var(--amber);background:var(--ambersoft);white-space:nowrap">DRAFT · SIGN-OFF REQ</span>
          </div>
        </div>
        <div style="padding:24px 34px 30px;font-family:var(--serif);font-size:14px;line-height:1.68;color:var(--ink)">
          <div class="memo-sec" style="${d(0)};margin-bottom:22px;padding:15px 17px;background:var(--panel2);border:1px solid var(--line);border-radius:10px">
            <div style="font-family:var(--sans);font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--teal);margin-bottom:7px">EXECUTIVE SUMMARY</div>
            <p style="margin:0;font-size:13.5px">I analyzed the ${model.n} ALC patients currently unmatched against every placement option in the network. Contract expansion fails for this cohort: all eight facilities decline the ${cohortUninsured} uninsured patients on payer status, and the remainder need capabilities (secure behavioral, trach/RT) no facility offers. Acquiring 428 Elm St and operating it as hospital-funded supportive housing is the only option that both places the cohort and reduces cost — it converts a ${money(model.blended)} blended acute day into a ${money(model.opexDay)} resident-day and repays the ${fmt.moneyK(model.capex)} capital outlay in ${model.payback.toFixed(1)} months. I recommend proceeding to LOI. Every figure below traces to a source table.</p>
          </div>

          <div class="memo-sec" style="${d(1)};display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;font-family:var(--sans)">
            <div style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:13px 14px"><div style="font-size:10.5px;color:var(--muted);font-weight:600">COHORT</div><div style="font:600 24px var(--mono);margin-top:4px">${model.n}</div><div style="font-size:11px;color:var(--ink2)">${cohortUninsured} coverage-gap + ${model.n-cohortUninsured} no-capability ALC patients</div></div>
            <div style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:13px 14px"><div style="font-size:10.5px;color:var(--muted);font-weight:600">AVG OVER-STAY</div><div style="font:600 24px var(--mono);margin-top:4px">${Math.round(model.avgOverstay)} d</div><div style="font-size:11px;color:var(--ink2)">beyond medical readiness</div></div>
            <div style="background:var(--burnsoft);border:1px solid #ecc9c0;border-radius:10px;padding:13px 14px"><div style="font-size:10.5px;color:var(--burn);font-weight:600">COMBINED BURN</div><div style="font:600 24px var(--mono);margin-top:4px;color:var(--burn)">${money(model.nightly)}</div><div style="font-size:11px;color:#8f3324">/ night at acute rates<sup data-tip="Σ daily direct cost of the ${model.n} unmatched patients|peoplesoft.gl.patient_costs">1</sup></div></div>
          </div>

          <div class="memo-sec" style="${d(2)}">
          <h3 style="margin:0 0 8px;font-size:15px;font-weight:700;font-family:var(--sans)">1 · Status quo cost</h3>
          <p style="margin:0 0 8px">Annualized direct cost for this cohort is <b>${fmt.moneyK(model.annualStatusQuo)}</b><sup data-tip="${money(model.nightly)}/night × 365 · blended per-diem = ${money(model.nightly)} ÷ ${model.n} = ${money(model.blended)}|peoplesoft.gl.patient_costs">1</sup>, drawn from the PeopleSoft general ledger at a blended acute per-diem of ${money(model.blended)}. This excludes the larger <i>indirect</i> cost — blocked acute beds, ED boarding, and surgical cancellations — estimated at a further <b>$6–9M/yr</b> in foregone activity (secondary line; not claimed in the payback below).</p>
          </div>

          <div class="memo-sec" style="${d(3)}">
          <h3 style="margin:20px 0 8px;font-size:15px;font-weight:700;font-family:var(--sans)">2 · Options considered</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:4px 0 6px;font-family:var(--sans)">
            <div style="border:1px solid var(--line);border-radius:10px;padding:14px">
              <div style="font-size:12px;font-weight:700;color:var(--ink2)">Option A — Contract expansion</div>
              <p style="margin:7px 0 0;font-size:12.5px;line-height:1.55;color:var(--ink2)">Network SNFs have feasible beds, but <b>every facility declines this cohort</b> on payer status or missing capability. Even risk-adjusted per-diems do not clear because there is no reimbursement source. <b style="color:var(--burn)">Not viable at scale.</b></p>
            </div>
            <div style="border:1.5px solid var(--teal);border-radius:10px;padding:14px;background:var(--tealsoft)">
              <div style="font-size:12px;font-weight:700;color:var(--tealink)">Option B — Supportive-housing acquisition ✓</div>
              <p style="margin:7px 0 0;font-size:12.5px;line-height:1.55;color:var(--tealink)">Acquire <b>428 Elm St</b> (${model.prop.type}, ${model.prop.km} km from campus) and operate as a hospital-funded supportive-housing unit with 24/7 PSW staffing and visiting nursing. Creates dedicated capacity the cohort actually qualifies for.</p>
            </div>
          </div>
          </div>

          <div class="memo-sec" style="${d(4)}">
          <h3 style="margin:20px 0 10px;font-size:15px;font-weight:700;font-family:var(--sans)">3 · Financials — Option B</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:6px;font-family:var(--sans)"><tbody>
            <tr style="border-top:1px solid var(--line2)"><td style="padding:8px 4px;color:var(--ink2)">Capex — purchase 428 Elm St<sup data-tip="List price, MLS listing #428-elm|mls.listings">2</sup></td><td style="padding:8px 4px;text-align:right;font-family:var(--mono)">${money(model.prop.price)}</td></tr>
            <tr style="border-top:1px solid var(--line2)"><td style="padding:8px 4px;color:var(--ink2)">Capex — renovation &amp; licensing<sup data-tip="Accessibility retrofit + care-home licensing, per comp assumptions|mls.listings#428-elm">2</sup></td><td style="padding:8px 4px;text-align:right;font-family:var(--mono)">${money(model.prop.reno)}</td></tr>
            <tr style="border-top:1px solid var(--line2)"><td style="padding:8px 4px;color:var(--ink2)">Opex — ${DB.shOpex.items.map(i=>i[0]).join(', ')}<sup data-tip="${DB.shOpex.items.map(i=>i[0]+' $'+i[1]).join(' · ')} = $${DB.shOpex.total}/resident-day|agent.financial_model.sh_opex">3</sup></td><td style="padding:8px 4px;text-align:right;font-family:var(--mono)">${money(model.opexDay)}/resident-day</td></tr>
            <tr style="border-top:1px solid var(--line2)"><td style="padding:8px 4px;color:var(--ink2)">Current blended acute cost, same cohort</td><td style="padding:8px 4px;text-align:right;font-family:var(--mono);color:var(--burn)">${money(model.blended)}/day</td></tr>
            <tr style="border-top:1px solid var(--line2)"><td style="padding:8px 4px;font-weight:700">Net saving per resident-day</td><td style="padding:8px 4px;text-align:right;font-family:var(--mono);font-weight:700;color:var(--money)">${money(model.saveDay)}</td></tr>
            <tr style="border-top:1px solid var(--line2)"><td style="padding:8px 4px;font-weight:700">Monthly run-rate saving (${model.prop.beds} beds @ ${Math.round(occ*100)}%)</td><td style="padding:8px 4px;text-align:right;font-family:var(--mono);font-weight:700;color:var(--money)">${fmt.moneyK(model.monthly)}</td></tr>
            <tr style="border-top:1px solid var(--line2)"><td style="padding:8px 4px;font-weight:700">Payback period (from approval, incl. ${DB.finance.renovationDays}-day renovation)</td><td style="padding:8px 4px;text-align:right;font-family:var(--mono);font-weight:700">${model.payback.toFixed(1)} months</td></tr>
            <tr style="border-top:1px solid var(--line2)"><td style="padding:8px 4px;font-weight:700">5-year NPV @ ${Math.round(DB.finance.discountRate*100)}% discount, net of capex</td><td style="padding:8px 4px;text-align:right;font-family:var(--mono);font-weight:700;color:var(--money)">${fmt.moneyK(model.npv)}</td></tr>
          </tbody></table>

          <div style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:10px 0 4px;font-family:var(--sans)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
              <div style="font-size:10.5px;font-weight:600;color:var(--muted)">SENSITIVITY — OCCUPANCY</div>
              <input type="range" min="60" max="100" value="${Math.round(occ*100)}" oninput="S.occupancy=this.value/100;render()" style="flex:1;max-width:220px">
              <span style="font-family:var(--mono);font-size:11px;color:var(--teal);font-weight:600">${Math.round(occ*100)}% → ${fmt.moneyK(model.monthly)}/mo · payback ${model.payback.toFixed(1)}mo</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
              <div style="text-align:center"><div style="font-size:11px;color:var(--muted)">70%</div><div style="font:600 16px var(--mono)">${fmt.moneyK(lo.monthly)}/mo</div><div style="font-size:10px;color:var(--muted)">payback ${lo.payback.toFixed(1)}mo</div></div>
              <div style="text-align:center;border-left:1px solid var(--line);border-right:1px solid var(--line)"><div style="font-size:11px;color:var(--money);font-weight:600">85% · base</div><div style="font:600 16px var(--mono);color:var(--money)">${fmt.moneyK(base.monthly)}/mo</div><div style="font-size:10px;color:var(--muted)">payback ${base.payback.toFixed(1)}mo</div></div>
              <div style="text-align:center"><div style="font-size:11px;color:var(--muted)">95%</div><div style="font:600 16px var(--mono)">${fmt.moneyK(hi.monthly)}/mo</div><div style="font-size:10px;color:var(--muted)">payback ${hi.payback.toFixed(1)}mo</div></div>
            </div>
          </div>
          </div>

          <div class="memo-sec" style="${d(5)}">
          <h3 style="margin:20px 0 8px;font-size:15px;font-weight:700;font-family:var(--sans)">4 · Non-financial benefits</h3>
          <p style="margin:0 0 8px;color:var(--ink2)">Housing stability addresses the root discharge barrier, reduces 30-day readmission, and places patients in an appropriate care setting rather than an acute ward. Framed here as a secondary benefit — the quarterly cost story above is what carries this to approval.</p>
          </div>

          <div class="memo-sec" style="${d(6)}">
          <h3 style="margin:20px 0 8px;font-size:15px;font-weight:700;font-family:var(--sans)">5 · Recommendation</h3>
          <div style="background:var(--tealsoft);border:1px solid #bfdcd5;border-radius:10px;padding:14px 16px;color:var(--tealink)">
            <b>Proceed to LOI on 428 Elm St.</b> Payback under a year against current burn in every occupancy scenario. Next steps: (1) VP Finance sign-off on this draft, (2) legal to draft LOI, (3) agent to prepare licensing checklist and staffing plan. <i>Decision support only — no action executes without your signature.</i><span style="animation:blink 1.1s infinite;color:var(--teal);font-weight:700">▌</span>
          </div>

          <div style="margin-top:22px;padding-top:14px;border-top:1px solid var(--line2);font-size:11px;color:var(--muted);line-height:1.6;font-family:var(--sans)">
            <div style="font-weight:600;color:var(--ink2);margin-bottom:5px">Sources — hover any <sup style="color:var(--teal)">n</sup> above</div>
            <div><sup style="color:var(--teal)">1</sup> <span style="font-family:var(--mono)">peoplesoft.gl.patient_costs</span> — daily direct cost × cohort, ${model.n} patients. <sup style="color:var(--teal)">2</sup> <span style="font-family:var(--mono)">mls.listings#428-elm</span> — list price + reno assumptions. <sup style="color:var(--teal)">3</sup> <span style="font-family:var(--mono)">agent.financial_model</span> — opex build-up, occupancy &amp; NPV.</div>
          </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------------- settings / misc ---------------- */

function settingsHTML() {
  const key = localStorage.getItem('transfer_api_key') || '';
  return `
  <div onclick="if(event.target===this)toggleSettings()" style="position:fixed;inset:0;background:rgba(10,25,22,.48);display:flex;align-items:center;justify-content:center;z-index:70;padding:24px">
    <div class="rise" style="width:480px;max-width:94vw;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px 24px;box-shadow:0 24px 60px rgba(6,17,15,.35)">
      <h3 style="margin:0 0 4px;font-size:16px">Agent settings</h3>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:14px">Demo mode is fully scripted and stage-safe. Add an Anthropic API key to make the chat a <b>live Claude agent</b> running the same 9 tools over this data.</div>
      <label style="font-size:11px;font-weight:600;color:var(--ink2)">Anthropic API key (stored in this browser only)</label>
      <input id="apikey" type="password" value="${esc(key)}" placeholder="sk-ant-…" style="width:100%;margin:6px 0 12px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font:400 12px var(--mono)">
      <label style="font-size:11px;font-weight:600;color:var(--ink2)">Model</label>
      <select id="apimodel" style="width:100%;margin:6px 0 16px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font:400 12px var(--sans)">
        ${['claude-sonnet-5','claude-opus-4-8','claude-haiku-4-5-20251001'].map(m => `<option ${((localStorage.getItem('transfer_model')||'claude-sonnet-5')===m)?'selected':''}>${m}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px">
        <button onclick="saveSettings()" style="font:600 12px var(--sans);padding:9px 16px;border:0;background:var(--teal);color:#fff;border-radius:8px;cursor:pointer">Save</button>
        <button onclick="localStorage.removeItem('transfer_api_key');toggleSettings();toast('Key removed — demo mode')" style="font:600 12px var(--sans);padding:9px 14px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);border-radius:8px;cursor:pointer">Remove key</button>
        <button onclick="location.reload()" style="margin-left:auto;font:600 12px var(--sans);padding:9px 14px;border:1px solid #ecc9c0;background:var(--burnsoft);color:var(--burn);border-radius:8px;cursor:pointer">Reset demo</button>
      </div>
    </div>
  </div>`;
}

function toggleSettings() { S.settingsOpen = !S.settingsOpen; render(); }
function saveSettings() {
  const k = $('apikey').value.trim();
  if (k) localStorage.setItem('transfer_api_key', k); else localStorage.removeItem('transfer_api_key');
  localStorage.setItem('transfer_model', $('apimodel').value);
  S.settingsOpen = false; render();
  toast(k ? 'Live mode on — chat now runs a real Claude agent with tools' : 'Demo mode');
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:var(--accent)"></span>${esc(msg)}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

/* ---------------- actions ---------------- */

async function runAgent() {
  if (S.running) return;
  if (S.ran) { // reset for re-run
    S.matches = {}; S.unmatchedInfo = {}; S.referrals = S.referrals.filter(r=>r.from==='cm');
    S.bizcase = false; S.amendment = null; S.segmented = false; S.confirmedPerNight = 0; S.savingsShown = 0;
    Tools._matchCache = null;
  }
  S.running = true; S.agentTab = 'activity'; S.view = 'vp';
  render();
  await Agent.run(handleAgentEvent);
  S.running = false; S.ran = true;
  render();
}

function handleAgentEvent(type, payload) {
  if (type === 'think') S.agentLog.push({ kind:'think', text:payload.text });
  if (type === 'tool') S.agentLog.push({ kind:'tool', t:Agent.ts(), name:payload.name, args:payload.args, result:payload.result, live:payload.live });
  if (type === 'chat') { S.chat.push({ role:'agent', text:payload.text }); }
  if (type === 'patch') {
    const p = payload;
    if (p.what === 'segmented') S.segmented = true;
    if (p.what === 'match') { S.matches[p.data.id] = { ...p.data, _fresh:true }; setTimeout(()=>{ if(S.matches[p.data.id]) S.matches[p.data.id]._fresh=false; }, 1700); animateSavings(); }
    if (p.what === 'matched') {
      // agent drafts referral packages for its matches
      p.data.matches.forEach(m => {
        if (!S.referrals.some(r => r.pid === m.id)) {
          S.referrals.push({ pid:m.id, snfId:m.snfId, snfName:m.snf, rate:m.rate, base:m.base, adj:m.adj, status:'new', from:'agent', savePerNight:m.savePerNight });
        }
      });
    }
    if (p.what === 'unmatched') p.data.unmatched.forEach(u => S.unmatchedInfo[u.id] = u);
    if (p.what === 'bizcase') S.bizcase = true;
    if (p.what === 'amendment') S.amendment = p.data;
  }
  if (S.view === 'vp') { render(); }
  else if (type === 'done') render();
}

function animateSavings() {
  const target = Object.values(S.matches).reduce((s,m) => s + m.savePerNight, 0) * DB.finance.daysPerMonth;
  const from = S.savingsShown, t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 700);
    S.savingsShown = from + (target - from) * (1 - Math.pow(1-k, 3));
    const el = $('kpi-savings');
    if (el) el.textContent = Math.round(S.savingsShown/1000);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function generatePackage(pid) {
  S.packageState[pid] = 'generating'; S.pkgTicks[pid] = 0;
  render();
  const iv = setInterval(() => {
    S.pkgTicks[pid]++;
    if (S.pkgTicks[pid] >= 8) {
      clearInterval(iv);
      S.packageState[pid] = 'ready';
      toast('Package assembled from chart — 40 minutes of chart review, done in 4 seconds');
    }
    if (S.view === 'cm') render();
  }, 380);
}

function sendReferral(pid) {
  const p = DB.patients.find(x => x.id === pid);
  const destId = $('refdest').value;
  const s = DB.snfs.find(x => x.id === destId);
  const r = Tools.rateFor(p, s);
  S.referrals.push({ pid, snfId:s.id, snfName:s.name, rate:r.rate, base:r.base, adj:r.adj, status:'new', from:'cm', savePerNight:p.burn - r.rate });
  toast('Referral sent to ' + s.name + ' — in-platform, no eFax. Status tracked live.');
  render();
}

function referralAction(idx, action) {
  const r = S.referrals[idx];
  r.status = action;
  S.contractModal = null;
  if (action === 'accepted') {
    S.confirmedPerNight += r.savePerNight;
    toast('Signed via DocuSign — bed held. VP dashboard savings confirmed +' + fmt.moneyK(r.savePerNight * DB.finance.daysPerMonth) + '/mo');
  } else if (action === 'countered') {
    r.rate += 25;
    toast('Counter sent to hospital: ' + money(r.rate) + '/day — a negotiation, not a silent decline');
  } else {
    toast('Declined with reason — hospital sees why, and can renegotiate the rate');
  }
  render();
}

function signAmendment() {
  S.amendmentSigned = true;
  toast('Amendment signed — 8 beds added to the Maplewood block, effective Monday');
  render();
}

async function askAgent(q) {
  S.agentTab = 'chat';
  S.chat.push({ role:'user', text:q });
  S.typing = true;
  render();
  const live = !!localStorage.getItem('transfer_api_key');
  if (live) {
    const ans = await Agent.liveChat(q, handleAgentEvent);
    S.typing = false;
    S.chat.push({ role:'agent', text: ans });
  } else {
    await new Promise(r => setTimeout(r, 900 + Math.random()*600));
    S.typing = false;
    S.chat.push({ role:'agent', text: Agent.demoAnswer(q) });
  }
  render();
}

function submitAgentInput() {
  const el = $('agentinput');
  if (!el || !el.value.trim()) return;
  const q = el.value.trim(); el.value = '';
  askAgent(q);
}

/* ---------------- post-render hooks ---------------- */

function afterRender() {
  const feed = $('agentfeed');
  if (feed) feed.scrollTop = feed.scrollHeight;
  // tooltips
  document.querySelectorAll('sup[data-tip]').forEach(el => {
    el.onmouseenter = e => {
      const [text, src] = el.dataset.tip.split('|');
      const tip = $('tooltip');
      tip.innerHTML = esc(text) + (src ? `<div class="src">source: ${esc(src)}</div>` : '');
      tip.style.display = 'block';
      const r = el.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - 340, r.left) + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
    };
    el.onmouseleave = () => { $('tooltip').style.display = 'none'; };
  });
}

/* burn ticker + clock (targeted DOM updates, no re-render) */
setInterval(() => {
  const el = $('burnlive');
  if (el) {
    const base = Tools.get_patient_costs().nightlyBurn + Math.floor(Math.random() * 260);
    el.textContent = (base / 1000).toFixed(1);
  }
  const ck = $('clock');
  if (ck) ck.textContent = new Date().toTimeString().slice(0,8);
}, 1400);

/* keyboard: 1–5 to switch views */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  const map = { '1':'vp', '2':'cm', '3':'snf', '4':'contracts', '5':'case' };
  if (map[e.key]) go(map[e.key]);
});

render();
