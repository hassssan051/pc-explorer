import React, { useState, useMemo } from "react";
import Papa from "papaparse";
import Plot from "react-plotly.js";

type Level = 1|2|3;

const configByLevel: Record<Level, any> = {
  1: {
    canTransform:false,
    canJoin:false,
    showStats:false,
    showScripting:false,
    chartTemplates:true
  },
  2: {
    canTransform:true,
    canJoin:true,
    showStats:true,
    showScripting:false,
    chartTemplates:true
  },
  3: {
    canTransform:true,
    canJoin:true,
    showStats:true,
    showScripting:true,
    chartTemplates:true
  }
};

function CSVUploader({onData}:{onData:(data:any[], cols:string[])=>void}){
  const [name,setName]=useState<string>("");

  const handleFile = (f:File|null)=>{
    if(!f) return;
    setName(f.name);
    Papa.parse(f, {
      header:true,
      dynamicTyping:true,
      skipEmptyLines:true,
      complete: (results:any) => {
        const data = results.data as any[];
        const cols = results.meta.fields as string[];
        onData(data, cols);
      }
    })
  };

  return (
    <div>
      <div style={{marginBottom:8}} className="small">Upload CSV or choose sample</div>
      <input type="file" accept=".csv,text/csv" onChange={(e)=>handleFile(e.target.files?.[0] ?? null)} />
      <div className="small" style={{marginTop:8}}>Selected: {name || "none"}</div>
    </div>
  )
}

function QuickSamples({onData}:{onData:(data:any[],cols:string[])=>void}){
  const sampleCsv = `country,year,pop,lifeExp,gdpPercap
Afghanistan,2002,234256,45.5,700
Afghanistan,2007,245678,47.0,800
Brazil,2002,100000,70.1,8000
Brazil,2007,102000,72.3,9000
China,2002,1200000,72.0,4500
China,2007,1300000,73.5,6000`.trim();

  const load = ()=>{
    const res = Papa.parse(sampleCsv, {header:true, dynamicTyping:true});
    onData(res.data as any[], res.meta.fields as string[]);
  }

  return <div style={{marginTop:8}}>
    <button onClick={load}>Load sample dataset</button>
  </div>
}

export default function App(){
  const [level,setLevel] = useState<Level>(1);
  const flags = configByLevel[level];
  const [data,setData] = useState<any[]|null>(null);
  const [cols,setCols] = useState<string[]|null>(null);
  const [x,setX] = useState<string|null>(null);
  const [y,setY] = useState<string|null>(null);
  const [chartType,setChartType] = useState<"scatter"|"bar">("scatter");

  const numericCols = useMemo(()=>{
    if(!cols || !data) return [];
    return cols.filter(c=> data.every(r=> typeof r[c] === 'number' || r[c]===null));
  },[cols,data]);

  const plotData = useMemo(()=>{
    if(!data || !x || !y) return null;
    return {
      x: data.map(r=> r[x]),
      y: data.map(r=> r[y]),
      type: chartType
    }
  },[data,x,y,chartType]);

  return (
    <div className="app">
      <div className="left">
        <div className="header">
          <div><strong>Controls</strong></div>
          <div className="badge">PC-Explorer</div>
        </div>

        <div style={{marginTop:8}}>
          <label className="small">Complexity</label>
          <div className="slider">
            <input type="range" min={1} max={3} value={level} onChange={(e)=>setLevel(Number(e.target.value) as Level)} />
            <div className="badge">Level {level}</div>
          </div>
          <div className="small" style={{marginTop:6}}>
            {level===1 && "Explorer — simplified views and templated charts."}
            {level===2 && "Analyst — transforms & group-bys available."}
            {level===3 && "Data Scientist — scripting & reproducibility."}
          </div>
        </div>

        <hr style={{margin:'12px 0', opacity:0.06}} />

        <CSVUploader onData={(d, c)=>{ setData(d); setCols(c); setX(null); setY(null); }} />
        <QuickSamples onData={(d,c)=>{ setData(d); setCols(c); setX(null); setY(null); }} />

        <div style={{marginTop:12}}>
          <div className="small">Flags</div>
          <pre style={{fontSize:12, color:'#cbd5e1'}}>{JSON.stringify(flags,null,2)}</pre>
        </div>
      </div>

      <div className="center">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <strong>Visualization</strong>
            <div className="small">Drag columns to axes (select below)</div>
          </div>
          <div className="controls">
            <select value={chartType} onChange={(e)=> setChartType(e.target.value as any)}>
              <option value="scatter">Scatter</option>
              <option value="bar">Bar</option>
            </select>
            {flags.showScripting && <button>Open Script Console</button>}
          </div>
        </div>

        <div style={{display:'flex', gap:12, marginTop:12}}>
          <div style={{minWidth:180}}>
            <div className="small">X axis</div>
            <select value={x||""} onChange={(e)=> setX(e.target.value || null)}>
              <option value="">-- choose --</option>
              {cols?.map(c=> <option key={c} value={c}>{c}</option>)}
            </select>

            <div className="small" style={{marginTop:8}}>Y axis</div>
            <select value={y||""} onChange={(e)=> setY(e.target.value || null)}>
              <option value="">-- choose --</option>
              {cols?.map(c=> <option key={c} value={c}>{c}</option>)}
            </select>

            {level>=2 && (
              <div style={{marginTop:12}}>
                <div className="small">Transform</div>
                <div className="small" style={{marginTop:6}}>Filter rows: (e.g. country=="China")</div>
                <input style={{width:'100%'}} placeholder='e.g. country=="China"' onBlur={(e)=>{
                  const expr = e.target.value;
                  if(!expr || !data) return;
                  try{
                    // very small sandboxed evaluator using Function (warning: in real apps, sandbox properly)
                    const filtered = data.filter((row:any)=>{
                      // create safe locals
                      const safe = {...row};
                      // eslint-disable-next-line no-new-func
                      return Function(...Object.keys(safe), `return ${expr}`).apply(null, Object.values(safe));
                    });
                    setData(filtered);
                  }catch(err){
                    alert("Filter error: " + err);
                  }
                }} />
              </div>
            )}
          </div>

          <div style={{flex:1, minHeight:320}}>
            {plotData ? (
              <Plot
                data={[plotData]}
                layout={{autosize:true, title: `${chartType} of ${y} vs ${x}`, paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)'}}
                style={{width:'100%', height:360}}
                config={{displayModeBar:true}}
              />
            ) : (
              <div style={{height:360, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8'}}>Select X and Y to render chart</div>
            )}
          </div>
        </div>

        {flags.showStats && cols && data && (
          <div style={{marginTop:12, display:'flex', gap:12}}>
            <div style={{flex:1}}>
              <div className="small">Column stats</div>
              <pre style={{fontSize:12, color:'#cbd5e1'}}>
{JSON.stringify(cols.map(c=>{
  const vals = data.map((r:any)=> r[c]).filter(v=> typeof v === 'number');
  const sum = vals.reduce((a,b)=>a+b,0);
  const avg = vals.length? sum/vals.length : null;
  return {col:c, avg, count: vals.length};
}), null, 2)}
              </pre>
            </div>
            <div style={{width:260}}>
              <div className="small">Export</div>
              <button onClick={()=>{
                if(!data) return;
                const csv = Papa.unparse(data);
                const blob = new Blob([csv], {type:'text/csv'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'export.csv'; a.click();
                URL.revokeObjectURL(url);
              }}>Export CSV</button>
            </div>
          </div>
        )}

        <div className="footer">
          <div className="small">Tip: Use the complexity slider to change available features. Filters are applied inline for demonstration; scripting console is mocked.</div>
        </div>
      </div>

      <div className="right">
        <div><strong>Pipeline & Help</strong></div>
        <div style={{marginTop:8}} className="small">Pipeline (recent actions)</div>
        <div style={{marginTop:8, fontSize:13, color:'#cbd5e1'}}>
          {data ? `Rows: ${data.length}` : "No data loaded"}
        </div>

        <div style={{marginTop:12}}>
          <div className="small">Quick actions</div>
          <div style={{display:'flex', gap:8, marginTop:8}}>
            <button onClick={()=>{
              // reset demo
              setData(null); setCols(null); setX(null); setY(null);
            }}>Reset</button>
            <button onClick={()=>{
              if(!data) return;
              const filtered = data.slice(0, Math.min(10, data.length));
              setData(filtered);
            }}>Sample 10 rows</button>
          </div>
        </div>

      </div>
    </div>
  )
}
