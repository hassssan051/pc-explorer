# PC-Explorer (Expanded Prototype)

Expanded PC-Explorer with provenance, scripting DSL, nudges, tooltips, and instrumentation.

## Features
- CSV upload & sample data
- Complexity slider (Levels 1-3)
- Charting with Plotly
- Safe filter DSL (Level >=2)
- Scripting DSL for derived columns (Level 3)
- Pipeline & provenance with revert
- Instrumentation export (JSON + CSV)
- Tooltips and nudges for discoverability

## Run locally
1. Node.js >=18 & npm
2. `npm install`
3. `npm run dev`
4. Open http://localhost:5173

## Notes
This prototype is for demo and pilot testing. The scripting uses a limited evaluator; do not accept untrusted code in production.
