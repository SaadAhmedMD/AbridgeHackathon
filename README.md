# TRANSFER — Bed Arbitrage Platform (Hackathon Demo)

**An agentic two-sided marketplace connecting hospitals boarding ALC patients with SNF capacity — and when no capacity exists, the agent drafts the business case to create it.**

Abridge/Anthropic Hackathon · All data synthetic · Decision support only — every agent action is a draft requiring human sign-off.

## Run it

```bash
cd ~/transfer-demo
python3 -m http.server 4173
# open http://localhost:4173
```

No build, no dependencies. One page, three roles (toggle top-right), five screens.

## The two agent modes

| Mode | What it is | When to use |
|---|---|---|
| **Demo mode** (default) | The Bed Arbitrage Agent executes its 9 real tools (`get_alc_census`, `match_patients_to_beds`, `draft_business_case`, …) over the mock data layer with deterministic orchestration. Every number is computed live from the fixtures — nothing is hardcoded in the UI. | On stage. Cannot break, no network needed. |
| **Live mode** (⚙ top-right → paste an Anthropic API key) | The chat panel becomes a real Claude agent (tool-use loop, browser → Anthropic API) with the same 9 tools over the same data. Its tool calls stream into the Activity feed. | Judge Q&A — let them ask anything ("which patients are dialysis-dependent?", "model 60% occupancy"). |

The key is stored in localStorage only. Reset the whole demo any time: ⚙ → **Reset demo** (or reload the page).

## Five-minute demo script

1. **Open on the bleed** (VP Finance view). "St. Vincent has **17 ALC patients**, **$2.8M** spent, burning **$47K every night** — that's **$1.4M a month** for patients who don't need to be here. This is PeopleSoft + Epic FHIR data; today nobody joins these two systems."
2. **Run the agent** (button, top right). Watch the Activity feed think: scan → price → risk-score → segment → match. Matches stream into the census; the savings counter climbs to **+$507K/mo (6 patients)**; three opportunity cards appear. "Nine tools, every claim traced to a source table."
3. **Case Manager view.** Click James Whitfield. Face sheet, transparent risk index (58 = itemized factors), offer priced by formula: **$410 block rate + $55 risk adjustment = $465/day** vs $2,600/night acute. Click **Generate package** (watch the chart assemble itself — "40 minutes of chart review, done in 4 seconds") → **Send referral**. No eFax.
4. **SNF view.** Maplewood sees the **same risk breakdown** the hospital sees. Open **Review contract** → risk-adjusted terms, hospital-backed guarantee → **Accept & sign via DocuSign**. Toast: VP savings confirmed. "SNFs stop going bankrupt on surprises; hospitals stop getting ghosted. No SNF on this platform ever admits a patient they couldn't price."
5. **The kicker** (back to VP → Business Case, NEW badge). "**11 patients no SNF will ever take** — 8 uninsured, 3 needing capabilities nobody has. The agent didn't stop at 'no match': it pulled real-estate comps and drafted this memo. **428 Elm St, $1.44M all-in, converts a $2,526 acute day into a $312 resident-day, payback 5.5 months, $15.9M five-year NPV.** Drag the occupancy slider — the model recomputes live. Hover any superscript — every figure traces to its source table."
6. **Close.** "The agent found the hospital a real-estate strategy. On Monday this points at real FHIR endpoints."

Keyboard: **1–5** jump between the five screens.

## Judge-proofing

- **"Why would SNFs join?"** Symmetric risk pricing (they price every admission), guaranteed contracted volume, and the platform brokers rate *negotiations* instead of silent declines — see the Counter flow.
- **"Is buying houses realistic?"** Canadian health authorities and US county systems already run transitional-care units and hospital-funded supportive housing. The agent just makes the math visible at quarterly-close speed.
- **"Do the numbers hold up?"** Everything is computed at runtime from `js/data.js` through `js/tools.js` (matching constraints, risk factor sums, NPV annuity math). Hover the ? / superscript citations anywhere.

## Architecture

```
index.html          shell + design system (IBM Plex, teal/burn palette — from the Claude Design screens)
js/data.js          mock data layer shaped like the real sources:
                      Epic FHIR ALC census (17 patients w/ barriers, factors)
                      PeopleSoft GL cost model · SNF registry (8 facilities,
                      capability matrix, decline patterns) · contracts · MLS comps
js/tools.js         the agent's 9 tools — real implementations over the data
js/agent.js         demo orchestration + live Anthropic tool-use loop
js/app.js           UI runtime: 5 screens, state, animations, tooltips
```
# AbridgeHackathon
