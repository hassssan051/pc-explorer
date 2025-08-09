import React, { useState, useMemo, useRef } from "react";
import Papa from "papaparse";
import Plot from "react-plotly.js";
import CSVUploader from "./components/CSVUploader";
import QuickSamples from "./components/QuickSamples";

type Level = 1 | 2 | 3;

const configByLevel: Record<Level, any> = {
  1: {
    canTransform: false,
    canJoin: false,
    showStats: false,
    showScripting: false,
    chartTemplates: true,
  },
  2: {
    canTransform: true,
    canJoin: true,
    showStats: true,
    showScripting: false,
    chartTemplates: true,
  },
  3: {
    canTransform: true,
    canJoin: true,
    showStats: true,
    showScripting: true,
    chartTemplates: true,
  },
};

function clone(obj: any) {
  return JSON.parse(JSON.stringify(obj));
}

const SAFE_FUNCS: Record<string, string> = {
  abs: "Math.abs",
  sqrt: "Math.sqrt",
  log: "Math.log",
  round: "Math.round",
  min: "Math.min",
  max: "Math.max",
  pow: "Math.pow",
};

function colIdentifier(name: string) {
  return `__row[${JSON.stringify(name)}]`;
}

function buildExpression(expr: string, cols: string[]) {
  Object.keys(SAFE_FUNCS).forEach((fn) => {
    const re = new RegExp("\\b" + fn + "\\b", "g");
    expr = expr.replace(re, SAFE_FUNCS[fn]);
  });
  const sorted = cols.slice().sort((a, b) => b.length - a.length);
  sorted.forEach((c) => {
    const re = new RegExp(
      "\\b" + c.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b",
      "g"
    );
    expr = expr.replace(re, colIdentifier(c));
  });
  return expr;
}

function applyScriptSafe(data: any[], cols: string[], script: string) {
  const parts = script.split("=");
  if (parts.length !== 2)
    throw new Error("Script must be: newcol = expression");
  const target = parts[0].trim();
  const expr = parts[1].trim();
  const jsExpr = buildExpression(expr, cols);
  const fn = new Function(
    "__row",
    `try{ return ${jsExpr}; }catch(e){ return null; }`
  );
  const out = data.map((r) => {
    const __row = { ...r };
    const val = fn(__row);
    return { ...r, [target]: val };
  });
  return { data: out, newCol: target };
}

function applyFilter(data: any[], expr: string) {
  if (!expr) return data;
  const s = expr.trim();
  const eqRe = /^([a-zA-Z0-9_ ]+)\s*==\s*"(.*)"$/;
  const neqRe = /^([a-zA-Z0-9_ ]+)\s*!=\s*"(.*)"$/;
  const gtRe = /^([a-zA-Z0-9_ ]+)\s*>\s*([0-9.+-]+)$/;
  const ltRe = /^([a-zA-Z0-9_ ]+)\s*<\s*([0-9.+-]+)$/;
  const containsRe = /^([a-zA-Z0-9_ ]+)\s*contains\s*"(.*)"$/i;

  const matchTrim = (m: any) => m[1].trim();

  if (eqRe.test(s)) {
    const m = s.match(eqRe)!;
    const col = matchTrim(m);
    const val = m[2];
    return data.filter((r) => String(r[col]) === val);
  } else if (neqRe.test(s)) {
    const m = s.match(neqRe)!;
    const col = matchTrim(m);
    const val = m[2];
    return data.filter((r) => String(r[col]) !== val);
  } else if (gtRe.test(s)) {
    const m = s.match(gtRe)!;
    const col = matchTrim(m);
    const val = Number(m[2]);
    return data.filter((r) => Number(r[col]) > val);
  } else if (ltRe.test(s)) {
    const m = s.match(ltRe)!;
    const col = matchTrim(m);
    const val = Number(m[2]);
    return data.filter((r) => Number(r[col]) < val);
  } else if (containsRe.test(s)) {
    const m = s.match(containsRe)!;
    const col = matchTrim(m);
    const val = m[2].toLowerCase();
    return data.filter((r) => String(r[col]).toLowerCase().includes(val));
  } else {
    throw new Error(
      'Unsupported filter expression. Use: col == "Value", col != "Value", col > 5, col < 10, col contains "str"'
    );
  }
}

function computeDiff(
  oldData: any[] | null,
  newData: any[] | null,
  oldCols: string[] | null,
  newCols: string[] | null
) {
  const oldStr = (oldData || []).map((r) => JSON.stringify(r));
  const newStr = (newData || []).map((r) => JSON.stringify(r));
  const removed = oldStr.filter((s) => !newStr.includes(s)).length;
  const added = newStr.filter((s) => !oldStr.includes(s)).length;
  const colsAdded = (newCols || []).filter((c) => !(oldCols || []).includes(c));
  return { addedRows: added, removedRows: removed, colsAdded };
}

export default function App() {
  const [level, setLevel] = useState<Level>(1);
  const flags = configByLevel[level];
  const [data, setData] = useState<any[] | null>(null);
  const [cols, setCols] = useState<string[] | null>(null);
  const [x, setX] = useState<string | null>(null);
  const [y, setY] = useState<string | null>(null);
  const [chartType, setChartType] = useState<"scatter" | "bar">("scatter");

  const [pipeline, setPipeline] = useState<
    { desc: string; data: any[] | null; cols: string[] | null; ts: number }[]
  >([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [nudge, setNudge] = useState<string | null>(null);

  const [counts, setCounts] = useState({
    clicks: 0,
    levelChanges: 0,
    filters: 0,
    scripts: 0,
  });

  const addPipeline = (
    desc: string,
    snapshotData: any[] | null = null,
    snapshotCols: string[] | null = null
  ) => {
    const entry = {
      desc,
      data: clone(snapshotData),
      cols: snapshotCols ? clone(snapshotCols) : null,
      ts: Date.now(),
    };
    setPipeline((prev) => [entry, ...prev].slice(0, 100));
    setLogs((prev) => [{ ts: Date.now(), action: desc, level }, ...prev]);
  };

  const inc = (k: string) =>
    setCounts((c) => ({ ...c, [k]: (c as any)[k] + 1 }));

  const numericCols = useMemo(() => {
    if (!cols || !data) return [];
    return cols.filter((c) =>
      data.every((r) => typeof r[c] === "number" || r[c] === null)
    );
  }, [cols, data]);

  const plotData = useMemo(() => {
    if (!data || !x || !y) return null;
    return {
      x: data.map((r) => r[x]),
      y: data.map((r) => r[y]),
      type: chartType,
    };
  }, [data, x, y, chartType]);

  const lastSnapshotRef = useRef<{
    data: any[] | null;
    cols: string[] | null;
  } | null>(null);

  const loadData = (d: any[], c: string[], label = "Load dataset") => {
    setData(d);
    setCols(c);
    setX(null);
    setY(null);
    setPipeline([]);
    setLogs([{ ts: Date.now(), action: label, level }]);
    addPipeline(label, d, c);
    inc("clicks");
  };

  const handleLevelChange = (next: number) => {
    setLogs((prev) => [
      { ts: Date.now(), action: `Change level ${level} -> ${next}`, level },
      ...prev,
    ]);
    setLevel(next as Level);
    setCounts((c) => ({ ...c, levelChanges: c.levelChanges + 1 }));
  };

  const applyFilterAction = (expr: string) => {
    if (!data) return;
    if (level === 1) {
      setNudge(
        "Filters require Level 2 — slide to Level 2 to enable transforms."
      );
    }
    try {
      inc("filters");
      lastSnapshotRef.current = { data: clone(data), cols: clone(cols) };
      const filtered = applyFilter(data, expr);
      setData(filtered);
      addPipeline(`Filter: ${expr}`, filtered, cols);
      setLogs((prev) => [
        { ts: Date.now(), action: `Filter applied: ${expr}`, level },
        ...prev,
      ]);
    } catch (err: any) {
      alert("Filter error: " + err.message);
    }
  };

  const undo = () => {
    if (!lastSnapshotRef.current) return;
    const { data: prev, cols: prevCols } = lastSnapshotRef.current;
    const diff = computeDiff(data, prev, cols, prevCols);
    setData(prev);
    setCols(prevCols);
    addPipeline(
      `Undo: revert (${diff.addedRows} added, ${diff.removedRows} removed, colsAdded: ${diff.colsAdded.length})`,
      prev,
      prevCols
    );
    lastSnapshotRef.current = null;
    inc("clicks");
  };

  const applyScriptAction = (script: string) => {
    if (!data || !cols) return;
    if (level <= 2) {
      setNudge(
        "Scripting requires Level 3 — slide to Level 3 to enable scripting."
      );
    }
    try {
      inc("scripts");
      lastSnapshotRef.current = { data: clone(data), cols: clone(cols) };
      const res = applyScriptSafe(data, cols, script);
      const updated = res.data;
      setData(updated);
      const newCols = Array.from(new Set([...(cols || []), res.newCol]));
      setCols(newCols);
      addPipeline(`Script: ${script}`, updated, newCols);
      setLogs((prev) => [
        { ts: Date.now(), action: `Script run: ${script}`, level },
        ...prev,
      ]);
    } catch (err: any) {
      alert("Script error: " + err.message);
    }
  };

  const revertToPipeline = (idx: number) => {
    const entry = pipeline[idx];
    if (!entry) return;
    const diff = computeDiff(data, entry.data, cols, entry.cols);
    setData(entry.data ? clone(entry.data) : null);
    setCols(entry.cols ? clone(entry.cols) : null);
    addPipeline(
      `Revert to: ${entry.desc} (rows+${diff.addedRows}, -${diff.removedRows}, colsAdded:${diff.colsAdded.length})`,
      entry.data,
      entry.cols
    );
    setLogs((prev) => [
      {
        ts: Date.now(),
        action: `Reverted to pipeline[${idx}]: ${entry.desc}`,
        level,
      },
      ...prev,
    ]);
  };

  const exportLogs = () => {
    const jsonBlob = new Blob(
      [JSON.stringify({ logs, counts, pipeline }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pc-instrumentation.json";
    a.click();
    URL.revokeObjectURL(url);
    const flat = logs
      .map((l: any) => `${new Date(l.ts).toISOString()},${l.action},${l.level}`)
      .join("\n");
    const csvBlob = new Blob([`timestamp,action,level\n` + flat], {
      type: "text/csv",
    });
    const url2 = URL.createObjectURL(csvBlob);
    const b = document.createElement("a");
    b.href = url2;
    b.download = "pc-instrumentation.csv";
    b.click();
    URL.revokeObjectURL(url2);
  };

  return (
    <div className="app">
      <div className="left">
        <div className="header">
          <div>
            <strong>Controls</strong>
          </div>
          <div className="badge">PC-Explorer</div>
        </div>

        <div style={{ marginTop: 8 }}>
          <label className="small">
            Complexity{" "}
            <span
              title="Move the slider to change available features and information density"
              style={{ opacity: 0.8 }}
            >
              ⓘ
            </span>
          </label>
          <div className="slider">
            <input
              aria-label="Complexity slider"
              type="range"
              min={1}
              max={3}
              value={level}
              onChange={(e) => handleLevelChange(Number(e.target.value))}
            />
            <div className="badge">Level {level}</div>
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            {level === 1 && "Explorer — simplified views and templated charts."}
            {level === 2 && "Analyst — transforms & group-bys available."}
            {level === 3 && "Data Scientist — scripting & reproducibility."}
          </div>
        </div>

        <hr style={{ margin: "12px 0", opacity: 0.06 }} />

        <div>
          <div className="small" style={{ marginBottom: 6 }}>
            Data
          </div>
          <CSVUploader onData={(d, c) => loadData(d, c, "Load dataset")} />
          <QuickSamples
            onData={(d, c) => loadData(d, c, "Load sample dataset")}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small">Flags</div>
          <pre style={{ fontSize: 12, color: "#cbd5e1" }}>
            {JSON.stringify(flags, null, 2)}
          </pre>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small">Instrumentation</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              title="Export logs and counts for pilot analysis"
              onClick={exportLogs}
            >
              Export logs
            </button>
            <button
              title="Reset instrumentation counts"
              onClick={() => {
                setLogs([]);
                setCounts({
                  clicks: 0,
                  levelChanges: 0,
                  filters: 0,
                  scripts: 0,
                });
                setPipeline([]);
              }}
            >
              Reset
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
            Counts: clicks {counts.clicks}, levelChanges {counts.levelChanges},
            filters {counts.filters}, scripts {counts.scripts}
          </div>
        </div>
      </div>

      <div className="center">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <strong>Visualization</strong>
            <div className="small">Select columns for axes</div>
          </div>
          <div className="controls">
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as any)}
              title="Chart type"
            >
              <option value="scatter">Scatter</option>
              <option value="bar">Bar</option>
            </select>
            {flags.showScripting && (
              <button title="Open scripting console (Level 3)">
                Open Script Console
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <div style={{ minWidth: 240 }}>
            <div className="small">
              X axis <span title="Choose a column for X axis">ⓘ</span>
            </div>
            <select
              value={x || ""}
              onChange={(e) => setX(e.target.value || null)}
            >
              <option value="">-- choose --</option>
              {cols?.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="small" style={{ marginTop: 8 }}>
              Y axis <span title="Choose a numeric column for Y axis">ⓘ</span>
            </div>
            <select
              value={y || ""}
              onChange={(e) => setY(e.target.value || null)}
            >
              <option value="">-- choose --</option>
              {cols?.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {level >= 2 && (
              <div style={{ marginTop: 12 }}>
                <div className="small">
                  Filter (safe syntax){" "}
                  <span title='Syntax: col == "Value" | col != "Value" | col > 5 | col < 10 | col contains "str"'>
                    ⓘ
                  </span>
                </div>
                <FilterBox
                  onApply={(expr) => {
                    applyFilterAction(expr);
                    setCounts((c) => ({ ...c, filters: c.filters + 1 }));
                  }}
                />
              </div>
            )}

            {level >= 2 && (
              <div style={{ marginTop: 12 }}>
                <div className="small">
                  Transforms & Scripting{" "}
                  <span title="Level 3 enables scripting DSL for derived columns">
                    ⓘ
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button onClick={() => undo()} title="Undo last transform">
                    Undo
                  </button>
                  <button
                    onClick={() => {
                      if (!data) return;
                      const sampled = data.slice(0, Math.min(10, data.length));
                      setData(sampled);
                      addPipeline("Sampled 10 rows", sampled, cols);
                      setCounts((c) => ({ ...c, clicks: c.clicks + 1 }));
                    }}
                    title="Sample 10 rows"
                  >
                    Sample
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <ScriptBox
                    enabled={level >= 3}
                    onApply={(s) => {
                      applyScriptAction(s);
                      setCounts((c) => ({ ...c, scripts: c.scripts + 1 }));
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 360 }}>
            {plotData ? (
              <Plot
                data={[plotData]}
                layout={{
                  autosize: true,
                  title: { text: `${chartType} of ${y} vs ${x}` },
                  paper_bgcolor: "rgba(0,0,0,0)",
                  plot_bgcolor: "rgba(0,0,0,0)",
                }}
                style={{ width: "100%", height: 360 }}
                config={{ displayModeBar: true }}
              />
            ) : (
              <div
                style={{
                  height: 360,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#94a3b8",
                }}
              >
                Select X and Y to render chart
              </div>
            )}
          </div>
        </div>

        {flags.showStats && cols && data && (
          <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="small">Column stats</div>
              <pre style={{ fontSize: 12, color: "#cbd5e1" }}>
                {JSON.stringify(
                  cols.map((c) => {
                    const vals = data
                      .map((r: any) => r[c])
                      .filter((v) => typeof v === "number");
                    const sum = vals.reduce((a, b) => a + b, 0);
                    const avg = vals.length ? sum / vals.length : null;
                    return { col: c, avg, count: vals.length };
                  }),
                  null,
                  2
                )}
              </pre>
            </div>
            <div style={{ width: 260 }}>
              <div className="small">Export</div>
              <button
                onClick={() => {
                  if (!data) return;
                  const csv = Papa.unparse(data);
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "export.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </button>
            </div>
          </div>
        )}

        <div className="footer">
          <div className="small">
            Tip: Use the complexity slider to change available features. Nudges
            appear when you attempt unavailable actions. Tooltips (ⓘ) explain
            controls.
          </div>
          {nudge && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                background: "rgba(96,165,250,0.06)",
                border: "1px solid rgba(96,165,250,0.12)",
                borderRadius: 8,
              }}
            >
              <strong>Suggestion:</strong> {nudge}{" "}
              <button style={{ marginLeft: 8 }} onClick={() => setNudge(null)}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="right">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong>Pipeline & Help</strong>{" "}
          <div className="small">Click a step to revert</div>
        </div>
        <div style={{ marginTop: 8 }} className="small">
          Provenance (most recent first)
        </div>
        <div
          style={{
            marginTop: 8,
            maxHeight: 260,
            overflow: "auto",
            paddingRight: 8,
          }}
        >
          {pipeline.length ? (
            pipeline.map((p, idx) => {
              const diff = computeDiff(null, p.data, null, p.cols);
              return (
                <div
                  key={idx}
                  style={{
                    padding: 8,
                    borderBottom: "1px solid rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13 }}>{p.desc}</div>
                      <div className="small">
                        {new Date(p.ts).toLocaleString()} — rows:{" "}
                        {p.data ? p.data.length : 0} cols:{" "}
                        {p.cols ? p.cols.length : 0}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <button
                        title="Revert to this pipeline step"
                        onClick={() => revertToPipeline(idx)}
                      >
                        Revert
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="small">No pipeline actions yet</div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small">Quick actions</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => {
                setData(null);
                setCols(null);
                setX(null);
                setY(null);
                setPipeline([]);
                setLogs([]);
                setNudge(null);
              }}
            >
              Reset
            </button>
            <button
              onClick={() => {
                if (!data) return;
                const filtered = data.slice(0, Math.min(10, data.length));
                setData(filtered);
                addPipeline("Sampled 10 rows", filtered, cols);
              }}
            >
              Sample 10 rows
            </button>
            <button onClick={exportLogs}>Export logs</button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small">Help</div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#cbd5e1" }}>
            Filter syntax examples: <br />
            country == "China" <br />
            pop {">"} 100000
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#cbd5e1" }}>
            Script examples (Level 3): <br />
            newpop = pop * 0.001 <br />
            ratio = pop / 1000 <br />
            scaled = pow(pop, 0.5)
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterBox({ onApply }: { onApply: (expr: string) => void }) {
  const [v, setV] = useState<string>("");
  return (
    <div style={{ marginTop: 6 }}>
      <input
        title='Filter syntax: col == "Value" | col contains "str" | col > 5'
        style={{ width: "100%" }}
        placeholder='e.g. country == "China"'
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button
          onClick={() => {
            onApply(v);
            setV("");
          }}
          title="Apply filter"
        >
          Apply
        </button>
        <button
          onClick={() => {
            setV("");
          }}
          title="Clear filter"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function ScriptBox({
  enabled,
  onApply,
}: {
  enabled: boolean;
  onApply: (s: string) => void;
}) {
  const [v, setV] = useState<string>("");
  return (
    <div style={{ marginTop: 6 }}>
      <textarea
        title="DSL supports + - * / % ** and functions: abs, sqrt, log, round, min, max, pow"
        placeholder="e.g. newcol = pop * 0.001"
        value={v}
        onChange={(e) => setV(e.target.value)}
        style={{ width: "100%", minHeight: 80 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button
          disabled={!enabled}
          onClick={() => {
            onApply(v);
            setV("");
          }}
          title={enabled ? "Run script" : "Enable Level 3 to run scripts"}
        >
          Run
        </button>
        <button onClick={() => setV("")} title="Clear script">
          Clear
        </button>
      </div>
      {!enabled && (
        <div className="small" style={{ marginTop: 6 }}>
          Upgrade slider to Level 3 to enable scripting.
        </div>
      )}
    </div>
  );
}
