# PC-Explorer (Prototype)

A minimal prototype of the "Progressive Complexity Data Explorer" — a front-end demo that shows how a slider can expose three levels of complexity:

- Level 1: Explorer (simple charts)
- Level 2: Analyst (transforms & stats)
- Level 3: Data Scientist (scripting — mocked)

## Run locally

1. Ensure you have Node.js (>=18) and npm installed.
2. Extract the project folder and open a terminal in the project root.
3. Install dependencies:

```bash
npm install
```

4. Start dev server:

```bash
npm run dev
```

5. Open the shown local URL (usually http://localhost:5173).

## Notes & Limitations

- This is a prototype meant for demoing the PC concept. The scripting console and sandboxing are intentionally minimal; **do not** run untrusted code.
- The filter evaluator uses `Function(...)` for brevity — replace with a proper sandbox before production.
- The UI is intentionally simple; adapt for your evaluation.

