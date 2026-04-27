import { useState, useMemo, useRef, useCallback, useEffect } from "react";

// ─── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = ["#5DCAA5","#AFA9EC","#F0997B","#378ADD","#F4C0D1","#EF9F27","#97C459","#D4537E","#85B7EB","#FAC775","#7F77DD","#D85A30","#639922","#993556","#5F5E5A"];
const TEXT_ON = ["#085041","#3C3489","#712B13","#0C447C","#72243E","#633806","#27500A","#72243E","#0C447C","#633806","#26215C","#4A1B0C","#173404","#4B1528","#2C2C2A"];
const RAG_BG   = { G:"#5DCAA5", A:"#EF9F27", R:"#E24B4A" };
const RAG_TEXT = { G:"#085041", A:"#633806", R:"#791F1F" };

const DEFAULT_OWNERS = ["MFG","BIVP","SYSO","CLIN"];
const NAV_W = 220; // sidebar width px

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id:"project",  icon:"📋", label:"Project"   },
  { id:"view",     icon:"🎨", label:"View"       },
  { id:"tasks",    icon:"➕", label:"Add / Paste"},
  { id:"teams",    icon:"👥", label:"Teams"      },
  { id:"templates",icon:"📂", label:"Templates"  },
  { id:"export",   icon:"📤", label:"Export"     },
];

// ─── Built-in templates ───────────────────────────────────────────────────────
const BUILTIN_TEMPLATES = [
  {
    id:"tpl_validation", name:"Device Validation (4-week)", totalDays:28,
    tasks:[
      {id:"t1",lane:"Engineering",label:"Design freeze",   start:0, dur:5, owner:"SYSO",tag:"Design",  pct:100,rag:"G"},
      {id:"t2",lane:"Engineering",label:"SW integration",  start:5, dur:8, owner:"SYSO",tag:"Dev",     pct:60, rag:"A"},
      {id:"t3",lane:"Engineering",label:"Unit testing",    start:9, dur:7, owner:"BIVP",tag:"QA",      pct:0,  rag:"G"},
      {id:"t4",lane:"Engineering",label:"Code review",     start:5, dur:5, owner:"BIVP",tag:"Dev",     pct:40, rag:"G"},
      {id:"t5",lane:"Regulatory", label:"Risk assessment", start:3, dur:6, owner:"CLIN",tag:"Reg",     pct:80, rag:"G"},
      {id:"t6",lane:"Regulatory", label:"Doc package",     start:14,dur:10,owner:"CLIN",tag:"Reg",     pct:0,  rag:"G"},
      {id:"t7",lane:"Clinical",   label:"Protocol writing",start:0, dur:7, owner:"CLIN",tag:"Clinical",pct:100,rag:"G"},
      {id:"t8",lane:"Clinical",   label:"IQ/OQ execution", start:14,dur:12,owner:"MFG", tag:"Clinical",pct:0,  rag:"R"},
      {id:"t9",lane:"Clinical",   label:"Data analysis",   start:14,dur:8, owner:"BIVP",tag:"QA",      pct:0,  rag:"G"},
    ],
    milestones:[
      {id:"m1",day:5, label:"Design freeze",   lane:"Engineering"},
      {id:"m2",day:14,label:"Validation start",lane:"Regulatory"},
      {id:"m3",day:28,label:"Submission ready",lane:"Regulatory"},
    ],
    deps:[{from:"t1",to:"t2"},{from:"t2",to:"t3"},{from:"t4",to:"t6"},{from:"t7",to:"t8"}],
  },
  {
    id:"tpl_launch", name:"Product Launch (3-week)", totalDays:21,
    tasks:[
      {id:"t1",lane:"MFG", label:"Build & test",      start:0, dur:7,owner:"MFG", tag:"Build",   pct:50,rag:"G"},
      {id:"t2",lane:"MFG", label:"Packaging",          start:7, dur:5,owner:"MFG", tag:"Build",   pct:0, rag:"G"},
      {id:"t3",lane:"BIVP",label:"Safety review",      start:0, dur:6,owner:"BIVP",tag:"Review",  pct:70,rag:"A"},
      {id:"t4",lane:"BIVP",label:"Sign-off",           start:12,dur:3,owner:"BIVP",tag:"Review",  pct:0, rag:"G"},
      {id:"t5",lane:"CLIN",label:"Field training",     start:9, dur:6,owner:"CLIN",tag:"Clinical",pct:0, rag:"G"},
      {id:"t6",lane:"SYSO",label:"System integration", start:0, dur:9,owner:"SYSO",tag:"Dev",     pct:80,rag:"G"},
      {id:"t7",lane:"SYSO",label:"UAT",                start:9, dur:5,owner:"SYSO",tag:"QA",      pct:0, rag:"G"},
    ],
    milestones:[
      {id:"m1",day:7, label:"Build complete",lane:"MFG"},
      {id:"m2",day:15,label:"Sign-off",      lane:"BIVP"},
      {id:"m3",day:21,label:"Launch",        lane:"CLIN"},
    ],
    deps:[{from:"t1",to:"t2"},{from:"t3",to:"t4"},{from:"t6",to:"t7"},{from:"t4",to:"t5"}],
  },
];

// ─── Storage ──────────────────────────────────────────────────────────────────
const LS = { tpl:"tl_tpl_v3", owners:"tl_owners_v3" };
const loadLS = (k,fb) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } };
const saveLS = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

// ─── Date utilities ───────────────────────────────────────────────────────────
const addDays = (dateStr, n) => { const d=new Date(dateStr); d.setDate(d.getDate()+n); return d; };
const todayISO = () => new Date().toISOString().slice(0,10);
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/86400000);

const fmtShort = d => {
  if (!(d instanceof Date)) d=new Date(d);
  return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
};
const fmtLong = d => {
  if (!(d instanceof Date)) d=new Date(d);
  return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
};

// Format a week band label: "27 Apr – 1 May"
const fmtWeekBand = (startD, endD) => {
  const s = startD.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
  const e = endD.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
  return `${s} – ${e}`;
};

// ─── State encode/decode for share URL ───────────────────────────────────────
const encodeState = s => { try { return btoa(encodeURIComponent(JSON.stringify(s))); } catch { return ""; } };
const decodeState = s => { try { return JSON.parse(decodeURIComponent(atob(s))); } catch { return null; } };

// ─── Paste parser ─────────────────────────────────────────────────────────────
function parsePaste(raw) {
  raw=raw.trim();
  if (raw.startsWith("[")||raw.startsWith("{")) { try { const p=JSON.parse(raw); return Array.isArray(p)?p:[p]; } catch { return null; } }
  const lines=raw.split("\n").filter(Boolean);
  if (lines.length<2) return null;
  const headers=lines[0].split(",").map(h=>h.trim().toLowerCase());
  return lines.slice(1).map((line,i)=>{
    const vals=line.split(",").map(v=>v.trim()); const obj={};
    headers.forEach((h,idx)=>{ obj[h]=vals[idx]??""; });
    return {id:obj.id||`t${Date.now()}${i}`,lane:obj.lane||"General",label:obj.label||obj.name||"Task",
      start:parseInt(obj.start)||0,dur:parseInt(obj.dur||obj.duration)||3,
      owner:obj.owner||"",tag:obj.tag||obj.type||"",pct:parseInt(obj.pct)||0,rag:obj.rag||"G"};
  });
}

// ─── Layout helpers ───────────────────────────────────────────────────────────
function assignSubRows(tasks) {
  const groups={};
  tasks.forEach(t=>{ (groups[t.lane]=groups[t.lane]||[]).push(t); });
  const result={};
  Object.values(groups).forEach(ts=>{
    const rows=[];
    ts.forEach(t=>{
      let placed=false;
      for (let r=0;r<rows.length;r++) {
        if (!rows[r].some(rt=>rt.start<t.start+t.dur&&t.start<rt.start+rt.dur)) { rows[r].push(t);result[t.id]=r;placed=true;break; }
      }
      if (!placed) { rows.push([t]);result[t.id]=rows.length-1; }
    });
  });
  return result;
}
function buildColorMap(tasks,mode) {
  const keys=[...new Set(tasks.map(t=>t[mode]))].filter(Boolean); const map={};
  keys.forEach((k,i)=>{ map[k]={bg:PALETTE[i%PALETTE.length],text:TEXT_ON[i%TEXT_ON.length]}; });
  return map;
}
function laneHeights(tasks,subRows) {
  const max={};
  tasks.forEach(t=>{ max[t.lane]=Math.max(max[t.lane]??0,(subRows[t.id]??0)+1); });
  return max;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────
const PAD_LEFT  = 120;
const AXIS_H    = 56;  // two-row axis: week band + day numbers
const SUB_H     = 36;
const LANE_PAD  = 12;
const RESIZE_HIT = 8;

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const urlState = useMemo(()=>{ const p=new URLSearchParams(window.location.search).get("s"); return p?decodeState(p):null; },[]);
  const init = urlState||BUILTIN_TEMPLATES[0];

  const [tasks,        setTasks]        = useState(init.tasks);
  const [milestones,   setMilestones]   = useState(init.milestones);
  const [deps,         setDeps]         = useState(init.deps);
  const [totalDays,    setTotalDays]    = useState(init.totalDays||28);
  const [projectName,  setProjectName]  = useState(init.name||"Q2 Device Validation");
  const [startDate,    setStartDate]    = useState(init.startDate||todayISO());
  const [colourMode,   setColourMode]   = useState("owner");
  const [selected,     setSelected]     = useState(null);
  const [presentMode,  setPresentMode]  = useState(false);
  const [navPanel,     setNavPanel]     = useState("project"); // which panel is open
  const [navOpen,      setNavOpen]      = useState(true);      // sidebar collapsed on mobile

  // View / scale settings
  const [dayW,         setDayW]         = useState(22);   // px per day
  const [gridInterval, setGridInterval] = useState(7);    // gridline every N days
  const [showWeekBands,setShowWeekBands]= useState(true); // top row: week date ranges
  const [showDayNums,  setShowDayNums]  = useState(true); // second row: d0, d7...

  // Panels state
  const [pasteText,  setPasteText]  = useState("");
  const [pasteError, setPasteError] = useState("");
  const [tooltip,    setTooltip]    = useState(null);
  const [copyMsg,    setCopyMsg]    = useState("");
  const [owners,     setOwners]     = useState(()=>loadLS(LS.owners,DEFAULT_OWNERS));
  const [newOwner,   setNewOwner]   = useState("");
  const [savedTemplates,setSavedTemplates] = useState(()=>loadLS(LS.tpl,[]));
  const [tplName,    setTplName]    = useState("");

  const dragRef = useRef(null);
  const svgRef  = useRef();

  useEffect(()=>{ saveLS(LS.owners,owners); },[owners]);
  useEffect(()=>{ saveLS(LS.tpl,savedTemplates); },[savedTemplates]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const subRows  = useMemo(()=>assignSubRows(tasks),[tasks]);
  const colorMap = useMemo(()=>buildColorMap(tasks,colourMode==="rag"?"owner":colourMode),[tasks,colourMode]);
  const laneH    = useMemo(()=>laneHeights(tasks,subRows),[tasks,subRows]);
  const lanes    = useMemo(()=>[...new Set(tasks.map(t=>t.lane))],[tasks]);

  const SVG_W = PAD_LEFT + totalDays*dayW + 16;

  const laneOffsets = useMemo(()=>{
    const o={}; let yy=AXIS_H;
    lanes.forEach(l=>{ o[l]=yy; yy+=LANE_PAD+(laneH[l]??1)*SUB_H+LANE_PAD; });
    return o;
  },[lanes,laneH]);

  const SVG_H = useMemo(()=>{
    let h=AXIS_H; lanes.forEach(l=>{ h+=LANE_PAD+(laneH[l]??1)*SUB_H+LANE_PAD; }); return h+32;
  },[lanes,laneH]);

  const xOf     = d => PAD_LEFT + d*dayW;
  const yOfTask = t => laneOffsets[t.lane]+LANE_PAD+(subRows[t.id]??0)*SUB_H+4;
  const dateOfDay = useCallback(n => addDays(startDate,n),[startDate]);
  const todayOff  = useMemo(()=>daysBetween(startDate,todayISO()),[startDate]);

  const getColor = t => {
    if (colourMode==="rag") return {bg:RAG_BG[t.rag||"G"],text:RAG_TEXT[t.rag||"G"]};
    const key=t[colourMode]||t.lane;
    return colorMap[key]||{bg:PALETTE[0],text:TEXT_ON[0]};
  };

  // ── Week bands for X axis ─────────────────────────────────────────────────
  // Each band covers 7 days, labelled "27 Apr – 1 May"
  const weekBands = useMemo(()=>{
    const bands=[];
    for (let d=0; d<totalDays; d+=7) {
      const bandEnd = Math.min(d+6, totalDays-1);
      bands.push({
        startDay: d,
        endDay:   bandEnd,
        label:    fmtWeekBand(dateOfDay(d), dateOfDay(bandEnd)),
      });
    }
    return bands;
  },[totalDays,startDate,dateOfDay]);

  // Grid lines at configurable interval
  const gridLines = useMemo(()=>{
    const lines=[];
    for (let d=0; d<=totalDays; d+=gridInterval) lines.push(d);
    return lines;
  },[totalDays,gridInterval]);

  // ── Drag ─────────────────────────────────────────────────────────────────────
  const onBarMouseDown = useCallback((e,id,type)=>{
    e.stopPropagation(); e.preventDefault();
    const t=tasks.find(x=>x.id===id);
    dragRef.current={id,type,startX:e.clientX,origStart:t.start,origDur:t.dur};
    setSelected(id); setTooltip(null);
  },[tasks]);

  useEffect(()=>{
    const onMove=e=>{
      const d=dragRef.current; if(!d) return;
      const delta=Math.round((e.clientX-d.startX)/dayW);
      setTasks(ts=>ts.map(t=>{
        if(t.id!==d.id) return t;
        if(d.type==="move")   return {...t,start:Math.max(0,d.origStart+delta)};
        if(d.type==="resize") return {...t,dur:Math.max(1,d.origDur+delta)};
        return t;
      }));
    };
    const onUp=()=>{ dragRef.current=null; };
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    return()=>{ window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
  },[dayW]);

  // ── Task CRUD ────────────────────────────────────────────────────────────────
  const updateTask = useCallback((id,field,val)=>{
    setTasks(ts=>ts.map(t=>t.id!==id?t:{...t,[field]:(field==="start"||field==="dur"||field==="pct")?Math.max(0,parseInt(val)||0):val}));
  },[]);
  const deleteTask = useCallback(id=>{
    setTasks(ts=>ts.filter(t=>t.id!==id));
    setDeps(ds=>ds.filter(d=>d.from!==id&&d.to!==id));
    setSelected(s=>s===id?null:s);
  },[]);
  const addTask = ()=>{
    const id=`t${Date.now()}`;
    setTasks(ts=>[...ts,{id,lane:lanes[0]||"General",label:"New task",start:0,dur:3,owner:owners[0]||"",tag:"",pct:0,rag:"G"}]);
    setSelected(id);
  };

  // ── Data ops ─────────────────────────────────────────────────────────────────
  const handlePaste=()=>{
    const parsed=parsePaste(pasteText);
    if(!parsed){setPasteError("Couldn't parse — check format");return;}
    setTasks(parsed);setDeps([]);setPasteText("");setPasteError("");
  };
  const loadTemplate=tpl=>{
    setTasks(tpl.tasks);setMilestones(tpl.milestones);setDeps(tpl.deps);
    setTotalDays(tpl.totalDays);setProjectName(tpl.name);
    if(tpl.startDate)setStartDate(tpl.startDate);
    setSelected(null);
  };
  const saveTemplate=()=>{
    if(!tplName.trim()) return;
    setSavedTemplates(ts=>[...ts,{id:`tpl_${Date.now()}`,name:tplName.trim(),tasks,milestones,deps,totalDays,startDate}]);
    setTplName("");
  };
  const addOwner=()=>{
    const o=newOwner.trim().toUpperCase();
    if(!o||owners.includes(o)) return;
    setOwners(os=>[...os,o]); setNewOwner("");
  };
  const shareURL=()=>{
    const encoded=encodeState({tasks,milestones,deps,totalDays,name:projectName,startDate});
    const url=`${window.location.origin}${window.location.pathname}?s=${encoded}`;
    navigator.clipboard.writeText(url).then(()=>{setCopyMsg("Copied!");setTimeout(()=>setCopyMsg(""),2500);});
  };
  const exportSVG=()=>{
    const blob=new Blob([svgRef.current.outerHTML],{type:"image/svg+xml"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`${projectName.replace(/\s+/g,"-")}.svg`;a.click();
  };
  const exportPNG=()=>{
    const svg=svgRef.current;
    const xml=new XMLSerializer().serializeToString(svg);
    const url=URL.createObjectURL(new Blob([xml],{type:"image/svg+xml"}));
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement("canvas");c.width=SVG_W;c.height=SVG_H;
      const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,SVG_W,SVG_H);ctx.drawImage(img,0,0);
      URL.revokeObjectURL(url);
      const a=document.createElement("a");a.download=`${projectName.replace(/\s+/g,"-")}.png`;a.href=c.toDataURL("image/png");a.click();
    };img.src=url;
  };
  const exportPDF=()=>{
    const xml=new XMLSerializer().serializeToString(svgRef.current);
    const w=window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>${projectName}</title>
      <style>body{margin:20px;background:#fff;font-family:system-ui}h1{font-size:15px;color:#333;margin:0 0 4px}
      p{font-size:11px;color:#999;margin:0 0 16px}svg{max-width:100%;height:auto}</style></head>
      <body><h1>${projectName}</h1><p>Start: ${fmtLong(new Date(startDate))} · Generated: ${fmtLong(new Date())}</p>${xml}</body></html>`);
    w.document.close(); setTimeout(()=>w.print(),400);
  };

  const selectedTask = tasks.find(t=>t.id===selected);

  // ── Nav panel content ─────────────────────────────────────────────────────────
  const renderPanel = () => {
    switch(navPanel) {
      case "project": return (
        <div>
          <PanelTitle>Project</PanelTitle>
          <Field label="Name">
            <input value={projectName} onChange={e=>setProjectName(e.target.value)} style={inputStyle}/>
          </Field>
          <Field label="Start date">
            <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={inputStyle}/>
          </Field>
          <Field label="Duration (days)">
            <input type="number" value={totalDays} min={7} max={365}
              onChange={e=>setTotalDays(Math.max(7,parseInt(e.target.value)||28))} style={inputStyle}/>
          </Field>
          <div style={{marginTop:4,fontSize:11,color:"#aaa",lineHeight:1.6}}>
            Ends: {fmtLong(addDays(startDate,totalDays))}
          </div>
          <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:8}}>
            <Btn onClick={addTask} accent>+ Add task</Btn>
            <Btn onClick={shareURL}>{copyMsg||"Share link"}</Btn>
            <Btn onClick={()=>setPresentMode(p=>!p)}>{presentMode?"Exit present":"Present mode"}</Btn>
          </div>
        </div>
      );

      case "view": return (
        <div>
          <PanelTitle>View & scale</PanelTitle>
          <Field label="Colour by">
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {["lane","owner","tag","rag"].map(m=>(
                <label key={m} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",color:colourMode===m?"#1a1a1a":"#666"}}>
                  <input type="radio" checked={colourMode===m} onChange={()=>setColourMode(m)} style={{accentColor:"#1a1a1a"}}/>
                  {m==="rag"?"RAG status":m.charAt(0).toUpperCase()+m.slice(1)}
                </label>
              ))}
            </div>
          </Field>
          <Field label={`Day width: ${dayW}px`}>
            <input type="range" min={10} max={50} value={dayW} onChange={e=>setDayW(parseInt(e.target.value))}
              style={{width:"100%",accentColor:"#1a1a1a"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#bbb",marginTop:2}}>
              <span>Compact</span><span>Spacious</span>
            </div>
          </Field>
          <Field label="Gridline every (days)">
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[1,3,5,7,14].map(n=>(
                <button key={n} onClick={()=>setGridInterval(n)}
                  style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:`0.5px solid ${gridInterval===n?"#1a1a1a":"rgba(0,0,0,0.12)"}`,
                    background:gridInterval===n?"#1a1a1a":"#fff",color:gridInterval===n?"#fff":"#555",cursor:"pointer",fontFamily:"inherit"}}>
                  {n}d
                </button>
              ))}
              <input type="number" value={gridInterval} min={1} max={30}
                onChange={e=>setGridInterval(Math.max(1,parseInt(e.target.value)||7))}
                style={{...inputStyle,width:52}}/>
            </div>
          </Field>
          <Field label="X-axis rows">
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",marginBottom:6}}>
              <input type="checkbox" checked={showWeekBands} onChange={e=>setShowWeekBands(e.target.checked)} style={{accentColor:"#1a1a1a"}}/>
              Week date bands (e.g. 27 Apr – 1 May)
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
              <input type="checkbox" checked={showDayNums} onChange={e=>setShowDayNums(e.target.checked)} style={{accentColor:"#1a1a1a"}}/>
              Day offset numbers (d0, d7…)
            </label>
          </Field>
        </div>
      );

      case "tasks": return (
        <div>
          <PanelTitle>Add / Paste tasks</PanelTitle>
          <Btn onClick={addTask} accent style={{marginBottom:12,width:"100%"}}>+ New task</Btn>
          <div style={{marginBottom:12,borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:12}}>
            <div style={{fontSize:11,color:"#aaa",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:6}}>Paste CSV or JSON</div>
            <div style={{fontSize:11,color:"#999",marginBottom:8,lineHeight:1.6}}>
              Columns: <code style={codeStyle}>lane, label, start, dur, owner, tag, pct, rag</code>
            </div>
            <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
              placeholder={"lane,label,start,dur,owner,tag,pct,rag\nEngineering,Design freeze,0,5,SYSO,Design,100,G"}
              style={{width:"100%",height:130,fontFamily:"monospace",fontSize:11,padding:8,boxSizing:"border-box",
                border:"0.5px solid rgba(0,0,0,0.15)",borderRadius:8,resize:"vertical",outline:"none",lineHeight:1.5}}/>
            {pasteError&&<p style={{color:"#A32D2D",fontSize:11,margin:"4px 0"}}>{pasteError}</p>}
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <Btn onClick={handlePaste} accent>Import</Btn>
              <Btn onClick={()=>{setPasteText("");setPasteError("");}}>Clear</Btn>
            </div>
          </div>
        </div>
      );

      case "teams": return (
        <div>
          <PanelTitle>Teams & owners</PanelTitle>
          <p style={{fontSize:12,color:"#999",marginBottom:12,lineHeight:1.6}}>Saved to your browser.</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:16}}>
            {owners.map(o=>(
              <div key={o} style={{display:"flex",alignItems:"center",gap:4,background:"#f1efe8",
                borderRadius:20,padding:"3px 10px 3px 12px",fontSize:12,fontWeight:500}}>
                <span style={{color:"#333"}}>{o}</span>
                {owners.length>1&&(
                  <button onClick={()=>setOwners(os=>os.filter(x=>x!==o))}
                    style={{border:"none",background:"none",cursor:"pointer",color:"#bbb",fontSize:13,lineHeight:1,padding:0}}>×</button>
                )}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input value={newOwner} onChange={e=>setNewOwner(e.target.value.toUpperCase())}
              placeholder="New code…" maxLength={8} onKeyDown={e=>e.key==="Enter"&&addOwner()}
              style={{...inputStyle,flex:1,textTransform:"uppercase",fontWeight:500,letterSpacing:"0.05em"}}/>
            <Btn onClick={addOwner} accent>Add</Btn>
          </div>
        </div>
      );

      case "templates": return (
        <div>
          <PanelTitle>Templates</PanelTitle>
          <div style={{fontSize:11,color:"#aaa",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Built-in</div>
          {BUILTIN_TEMPLATES.map(tpl=>(
            <TemplateRow key={tpl.id} name={tpl.name} onLoad={()=>loadTemplate(tpl)}/>
          ))}
          {savedTemplates.length>0&&(<>
            <div style={{fontSize:11,color:"#aaa",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em",margin:"14px 0 8px",borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:14}}>Saved</div>
            {savedTemplates.map(tpl=>(
              <TemplateRow key={tpl.id} name={tpl.name} onLoad={()=>loadTemplate(tpl)}
                onDelete={()=>setSavedTemplates(ts=>ts.filter(t=>t.id!==tpl.id))}/>
            ))}
          </>)}
          <div style={{borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:14,marginTop:14}}>
            <div style={{fontSize:12,color:"#666",marginBottom:8}}>Save current as template</div>
            <input value={tplName} onChange={e=>setTplName(e.target.value)} placeholder="Template name…"
              onKeyDown={e=>e.key==="Enter"&&saveTemplate()} style={{...inputStyle,marginBottom:8}}/>
            <Btn onClick={saveTemplate} accent>Save template</Btn>
          </div>
        </div>
      );

      case "export": return (
        <div>
          <PanelTitle>Export</PanelTitle>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <ExportOption icon="🖼" title="PNG" desc="For PowerPoint, email, Teams" onClick={exportPNG}/>
            <ExportOption icon="📐" title="SVG" desc="Scalable vector, for Figma" onClick={exportSVG}/>
            <ExportOption icon="📄" title="PDF / Print" desc="Opens browser print dialog" onClick={exportPDF}/>
          </div>
        </div>
      );

      default: return null;
    }
  };

  // ── Task edit panel content ───────────────────────────────────────────────────
  const taskPanel = selectedTask && !presentMode && (
    <div style={{width:236,background:"#fff",borderLeft:"0.5px solid rgba(0,0,0,0.08)",
      padding:16,overflowY:"auto",flexShrink:0,fontSize:13}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontWeight:500}}>Edit task</span>
        <button onClick={()=>setSelected(null)}
          style={{border:"none",background:"none",cursor:"pointer",fontSize:17,color:"#aaa",lineHeight:1}}>×</button>
      </div>
      <Field label="Label"><input value={selectedTask.label} onChange={e=>updateTask(selectedTask.id,"label",e.target.value)} style={inputStyle}/></Field>
      <Field label="Lane"><input value={selectedTask.lane} onChange={e=>updateTask(selectedTask.id,"lane",e.target.value)} style={inputStyle}/></Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <Field label="Start day"><input type="number" value={selectedTask.start} onChange={e=>updateTask(selectedTask.id,"start",e.target.value)} style={inputStyle}/></Field>
        <Field label="Duration"><input type="number" value={selectedTask.dur} min={1} onChange={e=>updateTask(selectedTask.id,"dur",e.target.value)} style={inputStyle}/></Field>
      </div>
      <div style={{background:"#f8f7f4",borderRadius:7,padding:"7px 10px",marginBottom:12,fontSize:12,color:"#555",lineHeight:1.7}}>
        <div style={{fontWeight:500}}>{fmtShort(dateOfDay(selectedTask.start))}</div>
        <div style={{color:"#aaa",fontSize:11}}>→ {fmtShort(dateOfDay(selectedTask.start+selectedTask.dur))} ({selectedTask.dur}d)</div>
      </div>
      <Field label="Owner">
        <select value={selectedTask.owner} onChange={e=>updateTask(selectedTask.id,"owner",e.target.value)} style={inputStyle}>
          <option value="">— none —</option>
          {owners.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Tag"><input value={selectedTask.tag} onChange={e=>updateTask(selectedTask.id,"tag",e.target.value)} style={inputStyle}/></Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <Field label="Complete %">
          <input type="number" value={selectedTask.pct} min={0} max={100}
            onChange={e=>updateTask(selectedTask.id,"pct",Math.min(100,parseInt(e.target.value)||0))} style={inputStyle}/>
        </Field>
        <Field label="RAG">
          <select value={selectedTask.rag||"G"} onChange={e=>updateTask(selectedTask.id,"rag",e.target.value)} style={inputStyle}>
            <option value="G">Green</option><option value="A">Amber</option><option value="R">Red</option>
          </select>
        </Field>
      </div>
      <button onClick={()=>deleteTask(selectedTask.id)}
        style={{width:"100%",fontSize:12,padding:"6px 0",border:"0.5px solid rgba(220,50,50,0.25)",
          borderRadius:6,color:"#A32D2D",background:"#fff8f8",cursor:"pointer",fontFamily:"inherit",marginBottom:14}}>
        Delete task
      </button>
      <div style={{borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:12}}>
        <SectionLabel>Depends on</SectionLabel>
        {deps.filter(d=>d.to===selectedTask.id).map((d,i)=>{
          const ft=tasks.find(t=>t.id===d.from);
          return ft?(
            <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5,alignItems:"center"}}>
              <span style={{color:"#444"}}>{ft.label}</span>
              <button onClick={()=>setDeps(ds=>ds.filter(x=>!(x.from===d.from&&x.to===d.to)))}
                style={{border:"none",background:"none",cursor:"pointer",color:"#ccc",fontSize:14,lineHeight:1}}>×</button>
            </div>
          ):null;
        })}
        <select onChange={e=>{if(!e.target.value)return;setDeps(ds=>[...ds,{from:e.target.value,to:selectedTask.id}]);e.target.value="";}}
          style={{...inputStyle,marginTop:4}}>
          <option value="">+ add predecessor…</option>
          {tasks.filter(t=>t.id!==selectedTask.id).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div style={{marginTop:14,borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:12}}>
        <SectionLabel>Milestones</SectionLabel>
        {milestones.map(m=>(
          <div key={m.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5,alignItems:"center"}}>
            <span style={{color:"#185FA5"}}>◆ {m.label} <span style={{color:"#aaa",fontSize:10}}>{fmtShort(dateOfDay(m.day))}</span></span>
            <button onClick={()=>setMilestones(ms=>ms.filter(x=>x.id!==m.id))}
              style={{border:"none",background:"none",cursor:"pointer",color:"#ccc",fontSize:14,lineHeight:1}}>×</button>
          </div>
        ))}
        <button onClick={()=>{
          const label=prompt("Milestone label:"); if(!label) return;
          setMilestones(ms=>[...ms,{id:`m${Date.now()}`,day:selectedTask.start+selectedTask.dur,label,lane:selectedTask.lane}]);
        }} style={{fontSize:12,padding:"4px 10px",border:"0.5px solid rgba(0,0,0,0.12)",borderRadius:6,
          background:"transparent",cursor:"pointer",fontFamily:"inherit",color:"#555"}}>+ at task end</button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",fontFamily:"'DM Sans',system-ui,sans-serif",background:"#f8f7f4"}}>

      {/* ── Sidebar nav ────────────────────────────────────────────────────── */}
      {!presentMode && (
        <div style={{width:navOpen?NAV_W:52,background:"#1a1a1a",display:"flex",flexDirection:"column",
          flexShrink:0,transition:"width 0.2s",overflow:"hidden",zIndex:10}}>

          {/* Logo / toggle */}
          <div style={{height:52,display:"flex",alignItems:"center",justifyContent:navOpen?"space-between":"center",
            padding:navOpen?"0 14px 0 16px":"0",borderBottom:"0.5px solid rgba(255,255,255,0.08)",flexShrink:0}}>
            {navOpen&&<span style={{fontSize:13,fontWeight:600,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>{projectName}</span>}
            <button onClick={()=>setNavOpen(o=>!o)}
              style={{background:"none",border:"none",cursor:"pointer",color:"#888",fontSize:18,lineHeight:1,padding:4,flexShrink:0}}>
              {navOpen?"←":"→"}
            </button>
          </div>

          {/* Nav items */}
          <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
            {NAV_ITEMS.map(item=>(
              <button key={item.id} onClick={()=>{ setNavPanel(item.id); if(!navOpen) setNavOpen(true); }}
                style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:navOpen?"10px 16px":"10px 0",
                  justifyContent:navOpen?"flex-start":"center",
                  background:navPanel===item.id?"rgba(255,255,255,0.08)":"transparent",
                  border:"none",cursor:"pointer",fontFamily:"inherit",
                  borderLeft:navPanel===item.id?"2.5px solid #5DCAA5":"2.5px solid transparent",
                  color:navPanel===item.id?"#fff":"#888",transition:"all 0.15s"}}>
                <span style={{fontSize:16,flexShrink:0}}>{item.icon}</span>
                {navOpen&&<span style={{fontSize:13,fontWeight:navPanel===item.id?500:400,whiteSpace:"nowrap"}}>{item.label}</span>}
              </button>
            ))}
          </div>

          {/* Panel content */}
          {navOpen&&(
            <div style={{borderTop:"0.5px solid rgba(255,255,255,0.08)",padding:16,overflowY:"auto",maxHeight:"55vh",
              scrollbarWidth:"thin",scrollbarColor:"#444 transparent"}}>
              <div style={{color:"#eee"}}>{renderPanel()}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* Present mode bar */}
        {presentMode&&(
          <div style={{background:"#1a1a1a",padding:"10px 20px",display:"flex",alignItems:"center",
            justifyContent:"space-between",flexShrink:0}}>
            <span style={{color:"#fff",fontSize:14,fontWeight:500}}>{projectName}</span>
            <div style={{display:"flex",gap:14,alignItems:"center"}}>
              <span style={{color:"#666",fontSize:12}}>Start: {fmtLong(new Date(startDate))}</span>
              <button onClick={()=>setPresentMode(false)}
                style={{fontSize:12,padding:"4px 12px",border:"0.5px solid #555",borderRadius:6,
                  background:"transparent",color:"#ccc",cursor:"pointer",fontFamily:"inherit"}}>Exit</button>
            </div>
          </div>
        )}

        {/* Timeline canvas */}
        <div style={{flex:1,overflow:"auto",padding:16}}>
          <div style={{background:"#fff",borderRadius:12,border:"0.5px solid rgba(0,0,0,0.08)",
            display:"inline-block",minWidth:"100%"}}>
            <svg ref={svgRef} width={SVG_W} height={SVG_H} style={{display:"block",userSelect:"none"}}
              xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L0,7 L7,3.5 z" fill="#D4537E"/>
                </marker>
              </defs>
              <rect width={SVG_W} height={SVG_H} fill="#ffffff"/>

              {/* ── X-Axis: week bands (top row) ── */}
              {showWeekBands && weekBands.map((band,i)=>{
                const x1=xOf(band.startDay);
                const x2=xOf(Math.min(band.endDay+1,totalDays));
                const bandW=x2-x1;
                return (
                  <g key={i}>
                    <rect x={x1} y={0} width={bandW} height={28}
                      fill={i%2===0?"#f8f8f6":"#f0f0ec"} stroke="rgba(0,0,0,0.06)" strokeWidth={0.5}/>
                    {bandW>50&&(
                      <text x={x1+bandW/2} y={17} textAnchor="middle" fontSize={10} fill="#555"
                        fontFamily="system-ui" fontWeight="500">{band.label}</text>
                    )}
                  </g>
                );
              })}

              {/* ── X-Axis: day offset row (second row) ── */}
              {showDayNums && gridLines.map(d=>(
                d<=totalDays&&(
                  <text key={d} x={xOf(d)+3} y={showWeekBands?44:16}
                    fontSize={9} fill="#bbb" fontFamily="system-ui">d{d}</text>
                )
              ))}

              {/* ── Grid lines ── */}
              {gridLines.map(d=>(
                d>0&&d<totalDays&&(
                  <line key={d} x1={xOf(d)} y1={AXIS_H} x2={xOf(d)} y2={SVG_H-24}
                    stroke="rgba(0,0,0,0.07)" strokeWidth={0.5} strokeDasharray="3,3"/>
                )
              ))}

              {/* ── Lanes ── */}
              {lanes.map((lane,li)=>{
                const ly=laneOffsets[lane];
                const lh=LANE_PAD+(laneH[lane]??1)*SUB_H+LANE_PAD;
                return (
                  <g key={lane}>
                    <rect x={0} y={ly} width={SVG_W} height={lh} fill={li%2===0?"rgba(0,0,0,0.012)":"rgba(0,0,0,0.024)"}/>
                    <rect x={0} y={ly} width={PAD_LEFT-10} height={lh} fill="#fff"/>
                    <text x={PAD_LEFT-14} y={ly+lh/2+4} textAnchor="end" fontSize={11}
                      fill="#888" fontFamily="system-ui" fontWeight="500">{lane}</text>
                    <line x1={0} y1={ly+lh} x2={SVG_W} y2={ly+lh} stroke="rgba(0,0,0,0.07)" strokeWidth={0.5}/>
                  </g>
                );
              })}

              {/* ── Dependencies ── */}
              {deps.map((dep,i)=>{
                const ft=tasks.find(t=>t.id===dep.from);
                const tt=tasks.find(t=>t.id===dep.to);
                if(!ft||!tt) return null;
                const x1=xOf(ft.start+ft.dur), y1=yOfTask(ft)+(SUB_H-8)/2;
                const x2=xOf(tt.start),         y2=yOfTask(tt)+(SUB_H-8)/2;
                return <path key={i} d={`M${x1},${y1} C${(x1+x2)/2},${y1} ${(x1+x2)/2},${y2} ${x2},${y2}`}
                  stroke="#D4537E" strokeWidth={1.5} fill="none" opacity={0.5} markerEnd="url(#arr)"/>;
              })}

              {/* ── Tasks ── */}
              {tasks.map(t=>{
                const{bg,text:tc}=getColor(t);
                const tx=xOf(t.start), tw=Math.max(t.dur*dayW-3,4);
                const ty=yOfTask(t),   th=SUB_H-8;
                const isSel=selected===t.id;
                const pctW=Math.round(tw*(t.pct||0)/100);
                return (
                  <g key={t.id}
                    onMouseEnter={e=>!dragRef.current&&setTooltip({x:e.clientX,y:e.clientY,task:t})}
                    onMouseLeave={()=>setTooltip(null)}>
                    <rect x={tx} y={ty} width={tw} height={th} rx={5}
                      fill={bg} opacity={isSel?1:0.85}
                      stroke={isSel?"#1a1a1a":"transparent"} strokeWidth={isSel?1.5:0}
                      style={{cursor:"grab"}}
                      onMouseDown={e=>onBarMouseDown(e,t.id,"move")}
                      onClick={()=>!presentMode&&setSelected(t.id===selected?null:t.id)}/>
                    {pctW>0&&<rect x={tx} y={ty+th-4} width={pctW} height={4}
                      fill={tc} opacity={0.35} style={{pointerEvents:"none"}}/>}
                    {tw>28&&(
                      <text x={tx+7} y={ty+th/2+4} fontSize={10.5} fill={tc}
                        fontFamily="system-ui" fontWeight="500" style={{pointerEvents:"none",userSelect:"none"}}>
                        {t.label.length>Math.floor(tw/7)?t.label.slice(0,Math.max(3,Math.floor(tw/7)-1))+"…":t.label}
                      </text>
                    )}
                    {!presentMode&&(
                      <rect x={tx+tw-RESIZE_HIT} y={ty} width={RESIZE_HIT} height={th}
                        fill="transparent" style={{cursor:"ew-resize"}}
                        onMouseDown={e=>onBarMouseDown(e,t.id,"resize")}/>
                    )}
                    {isSel&&tw>20&&[0,2,4].map(off=>(
                      <line key={off} x1={tx+tw-RESIZE_HIT+1+off} y1={ty+6}
                        x2={tx+tw-RESIZE_HIT+1+off} y2={ty+th-6}
                        stroke={tc} strokeWidth={1} opacity={0.4} style={{pointerEvents:"none"}}/>
                    ))}
                  </g>
                );
              })}

              {/* ── Milestones ── */}
              {milestones.map(m=>{
                const mx=xOf(m.day);
                const lane=m.lane||lanes[0];
                const ly=laneOffsets[lane]??AXIS_H;
                const lh=LANE_PAD+(laneH[lane]??1)*SUB_H+LANE_PAD;
                const my=ly+lh/2; const sz=8;
                return (
                  <g key={m.id}>
                    <line x1={mx} y1={AXIS_H} x2={mx} y2={SVG_H-24}
                      stroke="#185FA5" strokeWidth={1} strokeDasharray="4,3" opacity={0.3}/>
                    <polygon points={`${mx},${my-sz} ${mx+sz},${my} ${mx},${my+sz} ${mx-sz},${my}`}
                      fill="#185FA5" opacity={0.9}/>
                    <text x={mx} y={my-sz-4} textAnchor="middle" fontSize={9.5}
                      fill="#185FA5" fontFamily="system-ui" fontWeight="500">{m.label}</text>
                    <text x={mx} y={my+sz+11} textAnchor="middle" fontSize={9}
                      fill="#185FA5" fontFamily="system-ui" opacity={0.7}>{fmtShort(dateOfDay(m.day))}</text>
                  </g>
                );
              })}

              {/* ── Today marker ── */}
              {todayOff>=0&&todayOff<=totalDays&&(
                <g>
                  <line x1={xOf(todayOff)} y1={0} x2={xOf(todayOff)} y2={SVG_H-24}
                    stroke="#E24B4A" strokeWidth={1.5} opacity={0.6}/>
                  <rect x={xOf(todayOff)-20} y={0} width={40} height={14} rx={3} fill="#E24B4A"/>
                  <text x={xOf(todayOff)} y={10} textAnchor="middle" fontSize={8.5}
                    fill="#fff" fontFamily="system-ui" fontWeight="600">TODAY</text>
                </g>
              )}

              {/* ── Legend ── */}
              {colourMode!=="rag"&&Object.entries(colorMap).map(([key,{bg}],i)=>(
                <g key={key}>
                  <rect x={PAD_LEFT+i*90} y={SVG_H-18} width={10} height={10} rx={2} fill={bg}/>
                  <text x={PAD_LEFT+i*90+13} y={SVG_H-9} fontSize={9.5} fill="#888" fontFamily="system-ui">{key}</text>
                </g>
              ))}
              {colourMode==="rag"&&[["G","On track"],["A","At risk"],["R","Behind"]].map(([k,label],i)=>(
                <g key={k}>
                  <rect x={PAD_LEFT+i*80} y={SVG_H-18} width={10} height={10} rx={2} fill={RAG_BG[k]}/>
                  <text x={PAD_LEFT+i*80+13} y={SVG_H-9} fontSize={9.5} fill="#888" fontFamily="system-ui">{label}</text>
                </g>
              ))}

              <text x={SVG_W-10} y={SVG_H-9} textAnchor="end" fontSize={8.5} fill="#ddd" fontFamily="system-ui">
                {projectName} · {fmtLong(new Date(startDate))}
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Task edit panel ───────────────────────────────────────────────── */}
      {taskPanel}

      {/* ── Tooltip ──────────────────────────────────────────────────────── */}
      {tooltip&&(
        <div style={{position:"fixed",left:tooltip.x+14,top:tooltip.y-8,pointerEvents:"none",zIndex:300,
          background:"#1a1a1a",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#fff",lineHeight:1.75,
          boxShadow:"0 4px 20px rgba(0,0,0,0.2)"}}>
          <div style={{fontWeight:500,marginBottom:1}}>{tooltip.task.label}</div>
          <div style={{color:"#aaa"}}>{fmtShort(dateOfDay(tooltip.task.start))} → {fmtShort(dateOfDay(tooltip.task.start+tooltip.task.dur))}</div>
          <div style={{color:"#aaa"}}>{tooltip.task.dur} days{tooltip.task.owner?` · ${tooltip.task.owner}`:""}</div>
          {tooltip.task.pct>0&&<div style={{color:"#5DCAA5"}}>{tooltip.task.pct}% complete</div>}
          {tooltip.task.rag&&<div style={{color:RAG_BG[tooltip.task.rag]}}>{tooltip.task.rag==="G"?"On track":tooltip.task.rag==="A"?"At risk":"Behind"}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PanelTitle({children}) {
  return <div style={{fontSize:13,fontWeight:600,color:"#fff",marginBottom:14,letterSpacing:"-0.01em"}}>{children}</div>;
}
function Field({label,children}) {
  return (
    <div style={{marginBottom:12}}>
      <label style={{fontSize:11,color:"#888",display:"block",marginBottom:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</label>
      {children}
    </div>
  );
}
function SectionLabel({children}) {
  return <div style={{fontSize:11,color:"#aaa",marginBottom:8,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>{children}</div>;
}
function TemplateRow({name,onLoad,onDelete}) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7,
      padding:"8px 10px",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:7,background:"rgba(255,255,255,0.04)"}}>
      <span style={{fontSize:12,color:"#ccc"}}>{name}</span>
      <div style={{display:"flex",gap:5}}>
        <Btn onClick={onLoad} small>Load</Btn>
        {onDelete&&<Btn onClick={onDelete} small danger>Del</Btn>}
      </div>
    </div>
  );
}
function ExportOption({icon,title,desc,onClick}) {
  return (
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 12px",
      border:"0.5px solid rgba(255,255,255,0.1)",borderRadius:9,background:"rgba(255,255,255,0.04)",
      cursor:"pointer",textAlign:"left",fontFamily:"inherit",width:"100%",color:"#ccc"}}>
      <span style={{fontSize:18}}>{icon}</span>
      <div>
        <div style={{fontSize:12,fontWeight:500,color:"#eee",marginBottom:1}}>{title}</div>
        <div style={{fontSize:10,color:"#777"}}>{desc}</div>
      </div>
    </button>
  );
}
function Btn({children,onClick,accent,danger,small}) {
  return (
    <button onClick={onClick} style={{
      fontSize:small?11:12,padding:small?"4px 10px":"7px 14px",fontFamily:"inherit",cursor:"pointer",borderRadius:7,
      border:danger?"0.5px solid rgba(220,50,50,0.4)":`0.5px solid ${accent?"#5DCAA5":"rgba(255,255,255,0.15)"}`,
      background:accent?"#5DCAA5":danger?"rgba(220,50,50,0.15)":"rgba(255,255,255,0.07)",
      color:accent?"#085041":danger?"#ff9999":"#ccc",
      width:(!small&&!danger)?"100%":"auto",display:"block",marginBottom:small?0:6,
    }}>{children}</button>
  );
}
const inputStyle={
  width:"100%",fontSize:12,padding:"5px 8px",boxSizing:"border-box",
  border:"0.5px solid rgba(255,255,255,0.15)",borderRadius:6,
  fontFamily:"inherit",outline:"none",background:"rgba(255,255,255,0.07)",color:"#eee",
};
const codeStyle={background:"rgba(255,255,255,0.1)",padding:"1px 5px",borderRadius:4,fontSize:10,fontFamily:"monospace",color:"#aaa"};