import { useState, useMemo, useRef, useCallback, useEffect } from "react";

// ─── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = ["#5DCAA5","#AFA9EC","#F0997B","#378ADD","#F4C0D1","#EF9F27","#97C459","#D4537E","#85B7EB","#FAC775","#7F77DD","#D85A30","#639922","#993556","#5F5E5A"];
const TEXT_ON = ["#085041","#3C3489","#712B13","#0C447C","#72243E","#633806","#27500A","#72243E","#0C447C","#633806","#26215C","#4A1B0C","#173404","#4B1528","#2C2C2A"];
const RAG_BG   = { G:"#5DCAA5", A:"#EF9F27", R:"#E24B4A" };
const RAG_TEXT = { G:"#085041", A:"#633806", R:"#791F1F" };

const DEFAULT_OWNERS = ["MFG","BIVP","SYSO","CLIN"];
const NAV_W = 240;
const PAD_LEFT = 120;
const AXIS_H   = 56;
const SUB_H    = 38;
const LANE_PAD = 14;
const RESIZE_HIT = 10;
const DRAG_THRESHOLD = 4; // px before we consider it a drag not a click

const NAV_ITEMS = [
  { id:"project",   icon:"📋", label:"Project"    },
  { id:"view",      icon:"🎨", label:"View"        },
  { id:"tasks",     icon:"➕", label:"Add / Paste" },
  { id:"teams",     icon:"👥", label:"Teams"       },
  { id:"templates", icon:"📂", label:"Templates"   },
  { id:"export",    icon:"📤", label:"Export"      },
];

// ─── Templates ───────────────────────────────────────────────────────────────
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

// ─── Storage ─────────────────────────────────────────────────────────────────
const LS = { tpl:"tl_tpl_v4", owners:"tl_owners_v4" };
const loadLS = (k,fb) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } };
const saveLS = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

// ─── Date utils ───────────────────────────────────────────────────────────────
const addDays    = (ds,n) => { const d=new Date(ds); d.setDate(d.getDate()+n); return d; };
const todayISO   = () => new Date().toISOString().slice(0,10);
const daysBetween= (a,b) => Math.round((new Date(b)-new Date(a))/86400000);
const fmtShort   = d => { if(!(d instanceof Date))d=new Date(d); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}); };
const fmtLong    = d => { if(!(d instanceof Date))d=new Date(d); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); };
const fmtWeekBand= (s,e) => `${fmtShort(s)} – ${fmtShort(e)}`;

// ─── URL state ────────────────────────────────────────────────────────────────
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
    return { id:obj.id||`t${Date.now()}${i}`, lane:obj.lane||"General", label:obj.label||obj.name||"Task",
      start:parseInt(obj.start)||0, dur:parseInt(obj.dur||obj.duration)||3,
      owner:obj.owner||"", tag:obj.tag||"", pct:parseInt(obj.pct)||0, rag:obj.rag||"G" };
  });
}

// ─── Layout ───────────────────────────────────────────────────────────────────
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

// ─── Undo/redo history ────────────────────────────────────────────────────────
function useHistory(initial) {
  const [idx,  setIdx]  = useState(0);
  const [hist, setHist] = useState([initial]);
  const current = hist[idx];
  const push = useCallback(newState => {
    setHist(h => [...h.slice(0,idx+1), newState]);
    setIdx(i => i+1);
  }, [idx]);
  const undo = useCallback(() => { setIdx(i => Math.max(0,i-1)); }, []);
  const redo = useCallback(() => { setIdx(i => Math.min(hist.length-1,i+1)); }, [hist.length]);
  const canUndo = idx>0;
  const canRedo = idx<hist.length-1;
  return { current, push, undo, redo, canUndo, canRedo };
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const urlState = useMemo(()=>{ const p=new URLSearchParams(window.location.search).get("s"); return p?decodeState(p):null; },[]);
  const init = urlState||BUILTIN_TEMPLATES[0];

  // Core timeline state — wrapped in history for undo/redo
  const taskHist = useHistory(init.tasks);
  const tasks = taskHist.current;
  const setTasks = useCallback(fn => {
    taskHist.push(typeof fn==="function" ? fn(taskHist.current) : fn);
  }, [taskHist]);

  const [milestones,  setMilestones]  = useState(init.milestones);
  const [deps,        setDeps]        = useState(init.deps);
  const [totalDays,   setTotalDays]   = useState(init.totalDays||28);
  const [projectName, setProjectName] = useState(init.name||"Q2 Device Validation");
  const [startDate,   setStartDate]   = useState(init.startDate||todayISO());

  // UI state
  const [colourMode,   setColourMode]   = useState("owner");
  const [selected,     setSelected]     = useState(null);
  const [presentMode,  setPresentMode]  = useState(false);
  const [navPanel,     setNavPanel]     = useState("project");
  const [navOpen,      setNavOpen]      = useState(true);
  const [dayW,         setDayW]         = useState(22);
  const [gridInterval, setGridInterval] = useState(7);
  const [showWeekBands,setShowWeekBands]= useState(true);
  const [showDayNums,  setShowDayNums]  = useState(true);

  // Interaction state
  const [inlineEdit,   setInlineEdit]   = useState(null); // {id, value}
  const [contextMenu,  setContextMenu]  = useState(null); // {x,y,taskId}
  const [dragSnap,     setDragSnap]     = useState(null); // day number being hovered during drag
  const [tooltip,      setTooltip]      = useState(null);
  const [copyMsg,      setCopyMsg]      = useState("");
  const [pasteText,    setPasteText]    = useState("");
  const [pasteError,   setPasteError]   = useState("");

  // Owner / template state
  const [owners,          setOwners]         = useState(()=>loadLS(LS.owners,DEFAULT_OWNERS));
  const [newOwner,        setNewOwner]        = useState("");
  const [savedTemplates,  setSavedTemplates]  = useState(()=>loadLS(LS.tpl,[]));
  const [tplName,         setTplName]         = useState("");

  // Drag tracking — refs so no re-renders during drag
  const dragRef    = useRef(null); // {id|"milestone", type, startX, origVal, hasMoved}
  const scrollRef  = useRef(null); // the scrollable container
  const svgRef     = useRef();
  const inlineRef  = useRef();

  useEffect(()=>{ saveLS(LS.owners,owners); },[owners]);
  useEffect(()=>{ saveLS(LS.tpl,savedTemplates); },[savedTemplates]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const subRows  = useMemo(()=>assignSubRows(tasks),[tasks]);
  const colorMap = useMemo(()=>buildColorMap(tasks,colourMode==="rag"?"owner":colourMode),[tasks,colourMode]);
  const laneH    = useMemo(()=>laneHeights(tasks,subRows),[tasks,subRows]);
  const lanes    = useMemo(()=>[...new Set(tasks.map(t=>t.lane))],[tasks]);
  const SVG_W    = PAD_LEFT + totalDays*dayW + 16;

  const laneOffsets = useMemo(()=>{
    const o={}; let yy=AXIS_H;
    lanes.forEach(l=>{ o[l]=yy; yy+=LANE_PAD+(laneH[l]??1)*SUB_H+LANE_PAD; });
    return o;
  },[lanes,laneH]);

  const SVG_H = useMemo(()=>{
    let h=AXIS_H; lanes.forEach(l=>{ h+=LANE_PAD+(laneH[l]??1)*SUB_H+LANE_PAD; }); return h+36;
  },[lanes,laneH]);

  const xOf      = useCallback(d => PAD_LEFT + d*dayW, [dayW]);
  const yOfTask  = useCallback(t => (laneOffsets[t.lane]??AXIS_H)+LANE_PAD+(subRows[t.id]??0)*SUB_H+4, [laneOffsets,subRows]);
  const dateOfDay= useCallback(n => addDays(startDate,n),[startDate]);
  const todayOff = useMemo(()=>daysBetween(startDate,todayISO()),[startDate]);

  const getColor = useCallback(t => {
    if (colourMode==="rag") return {bg:RAG_BG[t.rag||"G"],text:RAG_TEXT[t.rag||"G"]};
    const key=t[colourMode]||t.lane;
    return colorMap[key]||{bg:PALETTE[0],text:TEXT_ON[0]};
  },[colourMode,colorMap]);

  // ── Week bands + grid lines ───────────────────────────────────────────────
  const weekBands = useMemo(()=>{
    const bands=[];
    for (let d=0;d<totalDays;d+=7) {
      const end=Math.min(d+6,totalDays-1);
      bands.push({startDay:d,endDay:end,label:fmtWeekBand(dateOfDay(d),dateOfDay(end))});
    }
    return bands;
  },[totalDays,startDate,dateOfDay]);

  const gridLines = useMemo(()=>{
    const ls=[]; for(let d=0;d<=totalDays;d+=gridInterval) ls.push(d); return ls;
  },[totalDays,gridInterval]);

  // ── Drag: unified handler for tasks AND milestones ────────────────────────
  // Key fix: distinguish click vs drag via DRAG_THRESHOLD
  const startDrag = useCallback((e,id,type,origVal)=>{
    e.stopPropagation(); e.preventDefault();
    setTooltip(null); setContextMenu(null);
    dragRef.current = { id, type, startX:e.clientX, origVal, hasMoved:false,
      scrollLeft: scrollRef.current?.scrollLeft||0 };
  },[]);

  useEffect(()=>{
    const onMove = e => {
      const d=dragRef.current; if(!d) return;
      const scrollDelta = (scrollRef.current?.scrollLeft||0) - d.scrollLeft;
      const rawDx = e.clientX - d.startX + scrollDelta;
      if (!d.hasMoved && Math.abs(rawDx)<DRAG_THRESHOLD) return;
      d.hasMoved=true;
      const dayDelta = Math.round(rawDx/dayW);
      if (d.type==="move") {
        const newStart = Math.max(0,d.origVal+dayDelta);
        setDragSnap(newStart);
        setTasks(ts=>ts.map(t=>t.id!==d.id?t:{...t,start:newStart}));
        // Auto-extend timeline
        setTasks(ts=>{ const t=ts.find(x=>x.id===d.id); if(t&&t.start+t.dur>totalDays) setTotalDays(t.start+t.dur+2); return ts; });
      } else if (d.type==="resize") {
        const newDur = Math.max(1,d.origVal+dayDelta);
        setDragSnap(newDur);
        setTasks(ts=>ts.map(t=>t.id!==d.id?t:{...t,dur:newDur}));
        setTasks(ts=>{ const t=ts.find(x=>x.id===d.id); if(t&&t.start+t.dur>totalDays) setTotalDays(t.start+t.dur+2); return ts; });
      } else if (d.type==="milestone") {
        const newDay = Math.max(0,Math.min(totalDays,d.origVal+dayDelta));
        setDragSnap(newDay);
        setMilestones(ms=>ms.map(m=>m.id!==d.id?m:{...m,day:newDay}));
      }
    };
    const onUp = e => {
      const d=dragRef.current;
      if (d && !d.hasMoved) {
        // It was a click, not a drag — select the task
        if (d.type==="move"||d.type==="resize") {
          setSelected(sel=>sel===d.id?null:d.id);
        }
      }
      dragRef.current=null;
      setDragSnap(null);
    };
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    return()=>{ window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
  },[dayW,totalDays,setTasks]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(()=>{
    const onKey=e=>{
      if (inlineEdit) return; // don't intercept while editing
      if ((e.metaKey||e.ctrlKey)&&e.key==="z"&&!e.shiftKey) { e.preventDefault(); taskHist.undo(); }
      if ((e.metaKey||e.ctrlKey)&&(e.key==="y"||(e.key==="z"&&e.shiftKey))) { e.preventDefault(); taskHist.redo(); }
      if (!selected) return;
      if (e.key==="Escape") { setSelected(null); setContextMenu(null); }
      if (e.key==="Delete"||e.key==="Backspace") { deleteTask(selected); }
      if (e.key==="ArrowLeft"&&!e.metaKey&&!e.ctrlKey) {
        e.preventDefault();
        setTasks(ts=>ts.map(t=>t.id!==selected?t:{...t,start:Math.max(0,t.start-1)}));
      }
      if (e.key==="ArrowRight"&&!e.metaKey&&!e.ctrlKey) {
        e.preventDefault();
        setTasks(ts=>ts.map(t=>t.id!==selected?t:{...t,start:t.start+1}));
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[selected,inlineEdit,taskHist,setTasks]);

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  const updateTask = useCallback((id,field,val)=>{
    setTasks(ts=>ts.map(t=>t.id!==id?t:{...t,[field]:(field==="start"||field==="dur"||field==="pct")?Math.max(0,parseInt(val)||0):val}));
  },[setTasks]);

  const deleteTask = useCallback(id=>{
    setTasks(ts=>ts.filter(t=>t.id!==id));
    setDeps(ds=>ds.filter(d=>d.from!==id&&d.to!==id));
    setSelected(s=>s===id?null:s);
  },[setTasks]);

  const duplicateTask = useCallback(id=>{
    const t=tasks.find(x=>x.id===id); if(!t) return;
    const newT={...t,id:`t${Date.now()}`,start:t.start+t.dur,label:t.label+" (copy)"};
    setTasks(ts=>[...ts,newT]);
    setSelected(newT.id);
  },[tasks,setTasks]);

  const addTask = useCallback((lane,startDay)=>{
    const id=`t${Date.now()}`;
    const newT={id,lane:lane||lanes[0]||"General",label:"New task",
      start:startDay||0,dur:3,owner:owners[0]||"",tag:"",pct:0,rag:"G"};
    setTasks(ts=>[...ts,newT]);
    setSelected(id);
    // Start inline edit immediately
    setTimeout(()=>setInlineEdit({id,value:"New task"}),50);
  },[lanes,owners,setTasks]);

  // ── Inline label edit ─────────────────────────────────────────────────────
  const commitInlineEdit = useCallback(()=>{
    if (!inlineEdit) return;
    if (inlineEdit.value.trim()) updateTask(inlineEdit.id,"label",inlineEdit.value.trim());
    setInlineEdit(null);
  },[inlineEdit,updateTask]);

  useEffect(()=>{
    if (inlineEdit && inlineRef.current) {
      inlineRef.current.focus();
      inlineRef.current.select();
    }
  },[inlineEdit]);

  // ── Click on empty lane area → add task ──────────────────────────────────
  const onSVGClick = useCallback(e=>{
    if (e.target!==e.currentTarget&&e.target.tagName!=="svg"&&e.target.tagName!=="rect") return;
    setSelected(null);
    setContextMenu(null);
  },[]);

  const onLaneAreaClick = useCallback((e,lane)=>{
    if (dragRef.current?.hasMoved) return;
    const svg=svgRef.current;
    const pt=svg.createSVGPoint();
    pt.x=e.clientX; pt.y=e.clientY;
    const svgPt=pt.matrixTransform(svg.getScreenCTM().inverse());
    const day=Math.max(0,Math.floor((svgPt.x-PAD_LEFT)/dayW));
    addTask(lane,day);
  },[dayW,addTask]);

  // ── Context menu ──────────────────────────────────────────────────────────
  const openContextMenu = useCallback((e,taskId)=>{
    e.preventDefault(); e.stopPropagation();
    setContextMenu({x:e.clientX,y:e.clientY,taskId});
    setSelected(taskId);
  },[]);

  // ── Data ops ─────────────────────────────────────────────────────────────
  const handlePaste=()=>{
    const parsed=parsePaste(pasteText);
    if(!parsed){setPasteError("Couldn't parse");return;}
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
    const o=newOwner.trim().toUpperCase(); if(!o||owners.includes(o)) return;
    setOwners(os=>[...os,o]); setNewOwner("");
  };
  const shareURL=()=>{
    const encoded=encodeState({tasks,milestones,deps,totalDays,name:projectName,startDate});
    const url=`${window.location.origin}${window.location.pathname}?s=${encoded}`;
    navigator.clipboard.writeText(url).then(()=>{ setCopyMsg("Copied!"); setTimeout(()=>setCopyMsg(""),2500); });
  };
  const exportSVG=()=>{
    const blob=new Blob([svgRef.current.outerHTML],{type:"image/svg+xml"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=`${projectName.replace(/\s+/g,"-")}.svg`; a.click();
  };
  const exportPNG=()=>{
    const svg=svgRef.current;
    const xml=new XMLSerializer().serializeToString(svg);
    const url=URL.createObjectURL(new Blob([xml],{type:"image/svg+xml"}));
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement("canvas"); c.width=SVG_W; c.height=SVG_H;
      const ctx=c.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,SVG_W,SVG_H); ctx.drawImage(img,0,0);
      URL.revokeObjectURL(url);
      const a=document.createElement("a"); a.download=`${projectName.replace(/\s+/g,"-")}.png`; a.href=c.toDataURL("image/png"); a.click();
    }; img.src=url;
  };
  const exportPDF=()=>{
    const xml=new XMLSerializer().serializeToString(svgRef.current);
    const w=window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>${projectName}</title>
      <style>body{margin:20px;background:#fff;font-family:system-ui}h1{font-size:15px;color:#333;margin:0 0 4px}
      p{font-size:11px;color:#999;margin:0 0 16px}svg{max-width:100%;height:auto}</style></head>
      <body><h1>${projectName}</h1><p>Start: ${fmtLong(new Date(startDate))} · ${fmtLong(new Date())}</p>${xml}</body></html>`);
    w.document.close(); setTimeout(()=>w.print(),400);
  };

  // ── Nav panel renderer ────────────────────────────────────────────────────
  const renderPanel=()=>{
    switch(navPanel) {
      case "project": return (<div>
        <PanelTitle>Project</PanelTitle>
        <Field label="Name"><input value={projectName} onChange={e=>setProjectName(e.target.value)} style={inputStyle}/></Field>
        <Field label="Start date"><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={inputStyle}/></Field>
        <Field label="Duration (days)">
          <input type="number" value={totalDays} min={7} max={365}
            onChange={e=>setTotalDays(Math.max(7,parseInt(e.target.value)||28))} style={inputStyle}/>
          <div style={{fontSize:11,color:"#666",marginTop:4}}>Ends: {fmtLong(addDays(startDate,totalDays))}</div>
        </Field>
        <div style={{borderTop:"0.5px solid rgba(255,255,255,0.08)",paddingTop:12,marginTop:4,display:"flex",flexDirection:"column",gap:6}}>
          <Btn onClick={()=>addTask()} accent>+ Add task</Btn>
          <Btn onClick={shareURL}>{copyMsg||"Share link"}</Btn>
          <Btn onClick={()=>setPresentMode(p=>!p)}>{presentMode?"Exit present":"Present mode"}</Btn>
          <div style={{display:"flex",gap:6,marginTop:4}}>
            <Btn onClick={taskHist.undo} disabled={!taskHist.canUndo} small>↩ Undo</Btn>
            <Btn onClick={taskHist.redo} disabled={!taskHist.canRedo} small>↪ Redo</Btn>
          </div>
        </div>
      </div>);

      case "view": return (<div>
        <PanelTitle>View & scale</PanelTitle>
        <Field label="Colour by">
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {["lane","owner","tag","rag"].map(m=>(
              <label key={m} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",
                color:colourMode===m?"#fff":"#888"}}>
                <input type="radio" checked={colourMode===m} onChange={()=>setColourMode(m)} style={{accentColor:"#5DCAA5"}}/>
                {m==="rag"?"RAG status":m.charAt(0).toUpperCase()+m.slice(1)}
              </label>
            ))}
          </div>
        </Field>
        <Field label={`Day width: ${dayW}px`}>
          <input type="range" min={10} max={50} value={dayW} onChange={e=>setDayW(parseInt(e.target.value))}
            style={{width:"100%",accentColor:"#5DCAA5"}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#555",marginTop:2}}>
            <span>Compact</span><span>Spacious</span>
          </div>
        </Field>
        <Field label="Gridlines every">
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
            {[1,3,5,7,14].map(n=>(
              <button key={n} onClick={()=>setGridInterval(n)} style={{
                fontSize:11,padding:"3px 9px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",
                border:`0.5px solid ${gridInterval===n?"#5DCAA5":"rgba(255,255,255,0.15)"}`,
                background:gridInterval===n?"#5DCAA5":"rgba(255,255,255,0.07)",
                color:gridInterval===n?"#085041":"#aaa"}}>
                {n}d
              </button>
            ))}
          </div>
          <input type="number" value={gridInterval} min={1} max={30}
            onChange={e=>setGridInterval(Math.max(1,parseInt(e.target.value)||7))}
            style={{...inputStyle,width:70}}/>
        </Field>
        <Field label="Axis rows">
          {[["showWeekBands","Week bands (27 Apr – 1 May)",setShowWeekBands,showWeekBands],
            ["showDayNums","Day offsets (d0, d7…)",setShowDayNums,showDayNums]].map(([k,label,setter,val])=>(
            <label key={k} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,cursor:"pointer",color:"#aaa",marginBottom:6}}>
              <input type="checkbox" checked={val} onChange={e=>setter(e.target.checked)} style={{accentColor:"#5DCAA5"}}/>
              {label}
            </label>
          ))}
        </Field>
        <div style={{fontSize:11,color:"#555",background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 10px",lineHeight:1.7}}>
          <div>💡 Click empty lane to add task</div>
          <div>↔ Drag bar to move</div>
          <div>⇔ Drag right edge to resize</div>
          <div>⌨ Arrow keys nudge 1 day</div>
          <div>⌦ Delete key removes task</div>
          <div>✏ Double-click to rename</div>
          <div>⌘Z / Ctrl+Z to undo</div>
        </div>
      </div>);

      case "tasks": return (<div>
        <PanelTitle>Add / Paste</PanelTitle>
        <Btn onClick={()=>addTask()} accent>+ New task</Btn>
        <div style={{marginTop:14,borderTop:"0.5px solid rgba(255,255,255,0.08)",paddingTop:14}}>
          <SectionLabel>Paste CSV or JSON</SectionLabel>
          <div style={{fontSize:11,color:"#555",marginBottom:8,lineHeight:1.6}}>
            Columns: <code style={codeStyle}>lane, label, start, dur, owner, tag, pct, rag</code>
          </div>
          <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
            placeholder={"lane,label,start,dur,owner,tag,pct,rag\nEngineering,Design freeze,0,5,SYSO,Design,100,G"}
            style={{width:"100%",height:120,fontFamily:"monospace",fontSize:11,padding:8,boxSizing:"border-box",
              border:"0.5px solid rgba(255,255,255,0.1)",borderRadius:7,resize:"vertical",outline:"none",
              background:"rgba(255,255,255,0.05)",color:"#ddd",lineHeight:1.5}}/>
          {pasteError&&<p style={{color:"#ff8888",fontSize:11,margin:"4px 0"}}>{pasteError}</p>}
          <div style={{display:"flex",gap:6,marginTop:8}}>
            <Btn onClick={handlePaste} accent small>Import</Btn>
            <Btn onClick={()=>{setPasteText("");setPasteError("");}} small>Clear</Btn>
          </div>
        </div>
      </div>);

      case "teams": return (<div>
        <PanelTitle>Teams</PanelTitle>
        <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:14}}>
          {owners.map(o=>(
            <div key={o} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.1)",
              borderRadius:20,padding:"3px 10px 3px 12px",fontSize:12,fontWeight:500}}>
              <span style={{color:"#ddd"}}>{o}</span>
              {owners.length>1&&<button onClick={()=>setOwners(os=>os.filter(x=>x!==o))}
                style={{border:"none",background:"none",cursor:"pointer",color:"#666",fontSize:13,lineHeight:1,padding:0}}>×</button>}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:6}}>
          <input value={newOwner} onChange={e=>setNewOwner(e.target.value.toUpperCase())}
            placeholder="New code…" maxLength={8} onKeyDown={e=>e.key==="Enter"&&addOwner()}
            style={{...inputStyle,flex:1,textTransform:"uppercase",fontWeight:500,letterSpacing:"0.05em"}}/>
          <Btn onClick={addOwner} accent small>Add</Btn>
        </div>
      </div>);

      case "templates": return (<div>
        <PanelTitle>Templates</PanelTitle>
        <SectionLabel>Built-in</SectionLabel>
        {BUILTIN_TEMPLATES.map(tpl=><TemplateRow key={tpl.id} name={tpl.name} onLoad={()=>loadTemplate(tpl)}/>)}
        {savedTemplates.length>0&&(<>
          <SectionLabel style={{marginTop:14,borderTop:"0.5px solid rgba(255,255,255,0.07)",paddingTop:14}}>Saved</SectionLabel>
          {savedTemplates.map(tpl=>(
            <TemplateRow key={tpl.id} name={tpl.name} onLoad={()=>loadTemplate(tpl)}
              onDelete={()=>setSavedTemplates(ts=>ts.filter(t=>t.id!==tpl.id))}/>
          ))}
        </>)}
        <div style={{borderTop:"0.5px solid rgba(255,255,255,0.07)",paddingTop:12,marginTop:12}}>
          <SectionLabel>Save current</SectionLabel>
          <input value={tplName} onChange={e=>setTplName(e.target.value)} placeholder="Template name…"
            onKeyDown={e=>e.key==="Enter"&&saveTemplate()} style={{...inputStyle,marginBottom:8}}/>
          <Btn onClick={saveTemplate} accent small>Save template</Btn>
        </div>
      </div>);

      case "export": return (<div>
        <PanelTitle>Export</PanelTitle>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          <ExportOption icon="🖼" title="PNG" desc="For PowerPoint, email" onClick={exportPNG}/>
          <ExportOption icon="📐" title="SVG" desc="Scalable, for Figma" onClick={exportSVG}/>
          <ExportOption icon="📄" title="PDF / Print" desc="Browser print dialog" onClick={exportPDF}/>
        </div>
      </div>);

      default: return null;
    }
  };

  const selectedTask = tasks.find(t=>t.id===selected);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",fontFamily:"'DM Sans',system-ui,sans-serif",background:"#f4f4f1"}}>

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      {!presentMode&&(
        <div style={{width:navOpen?NAV_W:52,background:"#141414",display:"flex",flexDirection:"column",
          flexShrink:0,transition:"width 0.18s ease",overflow:"hidden",zIndex:20,position:"relative"}}>

          {/* Header */}
          <div style={{height:50,display:"flex",alignItems:"center",
            justifyContent:navOpen?"space-between":"center",padding:navOpen?"0 12px 0 16px":"0",
            borderBottom:"0.5px solid rgba(255,255,255,0.07)",flexShrink:0}}>
            {navOpen&&<span style={{fontSize:13,fontWeight:600,color:"#fff",whiteSpace:"nowrap",
              overflow:"hidden",textOverflow:"ellipsis",maxWidth:160,letterSpacing:"-0.01em"}}>{projectName}</span>}
            <button onClick={()=>setNavOpen(o=>!o)}
              style={{background:"rgba(255,255,255,0.06)",border:"none",cursor:"pointer",
                color:"#777",fontSize:14,lineHeight:1,padding:"6px 8px",borderRadius:6,flexShrink:0}}>
              {navOpen?"‹":"›"}
            </button>
          </div>

          {/* Nav icons */}
          <div style={{padding:"6px 0",borderBottom:"0.5px solid rgba(255,255,255,0.07)",flexShrink:0}}>
            {NAV_ITEMS.map(item=>(
              <button key={item.id} onClick={()=>{ setNavPanel(item.id); if(!navOpen)setNavOpen(true); }}
                style={{width:"100%",display:"flex",alignItems:"center",gap:10,
                  padding:navOpen?"8px 16px":"8px 0",justifyContent:navOpen?"flex-start":"center",
                  background:navPanel===item.id?"rgba(93,202,165,0.12)":"transparent",
                  border:"none",borderLeft:navPanel===item.id?"2px solid #5DCAA5":"2px solid transparent",
                  cursor:"pointer",fontFamily:"inherit",color:navPanel===item.id?"#5DCAA5":"#666",
                  transition:"all 0.12s"}}>
                <span style={{fontSize:15,flexShrink:0}}>{item.icon}</span>
                {navOpen&&<span style={{fontSize:12,fontWeight:navPanel===item.id?500:400,whiteSpace:"nowrap"}}>{item.label}</span>}
              </button>
            ))}
          </div>

          {/* Panel */}
          {navOpen&&(
            <div style={{flex:1,overflowY:"auto",padding:"14px 16px",
              scrollbarWidth:"thin",scrollbarColor:"#333 transparent"}}>
              {renderPanel()}
            </div>
          )}

          {/* Undo/redo always visible at bottom */}
          {navOpen&&(
            <div style={{padding:"10px 16px",borderTop:"0.5px solid rgba(255,255,255,0.07)",
              display:"flex",gap:6,flexShrink:0}}>
              <button onClick={taskHist.undo} disabled={!taskHist.canUndo}
                title="Undo (Ctrl+Z)" style={undoBtnStyle(!taskHist.canUndo)}>↩ Undo</button>
              <button onClick={taskHist.redo} disabled={!taskHist.canRedo}
                title="Redo (Ctrl+Y)" style={undoBtnStyle(!taskHist.canRedo)}>↪ Redo</button>
            </div>
          )}
        </div>
      )}

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {presentMode&&(
          <div style={{background:"#141414",padding:"10px 20px",display:"flex",alignItems:"center",
            justifyContent:"space-between",flexShrink:0}}>
            <span style={{color:"#fff",fontSize:14,fontWeight:500}}>{projectName}</span>
            <div style={{display:"flex",gap:14,alignItems:"center"}}>
              <span style={{color:"#555",fontSize:12}}>Start: {fmtLong(new Date(startDate))}</span>
              <button onClick={()=>setPresentMode(false)}
                style={{fontSize:12,padding:"4px 12px",border:"0.5px solid #444",borderRadius:6,
                  background:"transparent",color:"#aaa",cursor:"pointer",fontFamily:"inherit"}}>Exit</button>
            </div>
          </div>
        )}

        {/* ── Timeline scroll area ─────────────────────────────────────── */}
        <div ref={scrollRef} style={{flex:1,overflow:"auto",padding:16,position:"relative"}}
          onClick={()=>{ if(!dragRef.current?.hasMoved){setSelected(null);setContextMenu(null);} }}>

          {/* Sticky axis header */}
          <div style={{position:"sticky",top:0,zIndex:10,background:"#f4f4f1",paddingBottom:2,marginBottom:0,width:SVG_W}}>
            <svg width={SVG_W} height={AXIS_H} style={{display:"block"}} xmlns="http://www.w3.org/2000/svg">
              <rect width={SVG_W} height={AXIS_H} fill="#fff" rx={0}/>
              <rect x={0} y={0} width={PAD_LEFT-1} height={AXIS_H} fill="#fff"/>
              {/* Week bands */}
              {showWeekBands&&weekBands.map((band,i)=>{
                const x1=xOf(band.startDay);
                const x2=xOf(Math.min(band.endDay+1,totalDays));
                const bw=x2-x1;
                return (
                  <g key={i}>
                    <rect x={x1} y={0} width={bw} height={28}
                      fill={i%2===0?"#f6f6f3":"#eeeee9"} stroke="rgba(0,0,0,0.05)" strokeWidth={0.5}/>
                    {bw>44&&<text x={x1+bw/2} y={17} textAnchor="middle" fontSize={10}
                      fill="#555" fontFamily="system-ui" fontWeight="500">{band.label}</text>}
                  </g>
                );
              })}
              {/* Day offsets */}
              {showDayNums&&gridLines.map(d=>(
                d<=totalDays&&<text key={d} x={xOf(d)+3} y={showWeekBands?44:16}
                  fontSize={9} fill="#bbb" fontFamily="system-ui">d{d}</text>
              ))}
              {/* Gridlines in header */}
              {gridLines.map(d=>(
                d>0&&d<=totalDays&&<line key={d} x1={xOf(d)} y1={0} x2={xOf(d)} y2={AXIS_H}
                  stroke="rgba(0,0,0,0.06)" strokeWidth={0.5}/>
              ))}
              {/* Today in header */}
              {todayOff>=0&&todayOff<=totalDays&&<>
                <line x1={xOf(todayOff)} y1={0} x2={xOf(todayOff)} y2={AXIS_H}
                  stroke="#E24B4A" strokeWidth={1.5} opacity={0.7}/>
                <rect x={xOf(todayOff)-18} y={2} width={36} height={13} rx={3} fill="#E24B4A"/>
                <text x={xOf(todayOff)} y={11.5} textAnchor="middle" fontSize={8}
                  fill="#fff" fontFamily="system-ui" fontWeight="700">TODAY</text>
              </>}
              {/* Drag snap indicator in header */}
              {dragSnap!=null&&<>
                <line x1={xOf(dragSnap)} y1={0} x2={xOf(dragSnap)} y2={AXIS_H}
                  stroke="#5DCAA5" strokeWidth={1.5} opacity={0.8}/>
                <rect x={xOf(dragSnap)-22} y={30} width={44} height={15} rx={3} fill="#5DCAA5"/>
                <text x={xOf(dragSnap)} y={41} textAnchor="middle" fontSize={9}
                  fill="#085041" fontFamily="system-ui" fontWeight="600">{fmtShort(dateOfDay(dragSnap))}</text>
              </>}
              {/* Bottom border */}
              <line x1={0} y1={AXIS_H-0.5} x2={SVG_W} y2={AXIS_H-0.5} stroke="rgba(0,0,0,0.1)" strokeWidth={1}/>
            </svg>
          </div>

          {/* Main SVG body */}
          <div style={{background:"#fff",borderRadius:"0 0 12px 12px",border:"0.5px solid rgba(0,0,0,0.08)",
            borderTop:"none",display:"inline-block",minWidth:"100%"}}>
            <svg ref={svgRef} width={SVG_W} height={SVG_H} style={{display:"block",userSelect:"none"}}
              xmlns="http://www.w3.org/2000/svg" onClick={onSVGClick}>
              <defs>
                <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L0,7 L7,3.5 z" fill="#D4537E"/>
                </marker>
              </defs>
              <rect width={SVG_W} height={SVG_H} fill="#fff"/>

              {/* Grid lines in body */}
              {gridLines.map(d=>(
                d>0&&d<totalDays&&<line key={d} x1={xOf(d)} y1={0} x2={xOf(d)} y2={SVG_H-28}
                  stroke="rgba(0,0,0,0.055)" strokeWidth={0.5} strokeDasharray="3,3"/>
              ))}

              {/* Lanes */}
              {lanes.map((lane,li)=>{
                const ly=laneOffsets[lane];
                const lh=LANE_PAD+(laneH[lane]??1)*SUB_H+LANE_PAD;
                return (
                  <g key={lane}>
                    <rect x={0} y={ly} width={SVG_W} height={lh}
                      fill={li%2===0?"rgba(0,0,0,0.01)":"rgba(0,0,0,0.022)"}
                      style={{cursor:"cell"}}
                      onClick={e=>{ e.stopPropagation(); onLaneAreaClick(e,lane); }}/>
                    <rect x={0} y={ly} width={PAD_LEFT-10} height={lh} fill="#fff" style={{cursor:"default"}}/>
                    <text x={PAD_LEFT-14} y={ly+lh/2+4} textAnchor="end" fontSize={11}
                      fill="#999" fontFamily="system-ui" fontWeight="500">{lane}</text>
                    <line x1={0} y1={ly+lh} x2={SVG_W} y2={ly+lh} stroke="rgba(0,0,0,0.06)" strokeWidth={0.5}/>
                  </g>
                );
              })}

              {/* Dependencies */}
              {deps.map((dep,i)=>{
                const ft=tasks.find(t=>t.id===dep.from);
                const tt=tasks.find(t=>t.id===dep.to);
                if(!ft||!tt) return null;
                const x1=xOf(ft.start+ft.dur), y1=yOfTask(ft)+(SUB_H-8)/2;
                const x2=xOf(tt.start),         y2=yOfTask(tt)+(SUB_H-8)/2;
                return <path key={i} d={`M${x1},${y1} C${(x1+x2)/2},${y1} ${(x1+x2)/2},${y2} ${x2},${y2}`}
                  stroke="#D4537E" strokeWidth={1.5} fill="none" opacity={0.45} markerEnd="url(#arr)"/>;
              })}

              {/* Tasks */}
              {tasks.map(t=>{
                const{bg,text:tc}=getColor(t);
                const tx=xOf(t.start), tw=Math.max(t.dur*dayW-3,4);
                const ty=yOfTask(t),   th=SUB_H-8;
                const isSel=selected===t.id;
                const pctW=Math.round(tw*(t.pct||0)/100);
                const isEditing=inlineEdit?.id===t.id;
                return (
                  <g key={t.id}
                    onMouseEnter={e=>{ if(!dragRef.current) setTooltip({x:e.clientX,y:e.clientY,task:t}); }}
                    onMouseLeave={()=>setTooltip(null)}
                    onContextMenu={e=>openContextMenu(e,t.id)}>

                    {/* Main bar — mouseDown starts drag; click vs drag resolved on mouseUp */}
                    <rect x={tx} y={ty} width={tw-RESIZE_HIT} height={th} rx={5}
                      fill={bg} opacity={isSel?1:0.86}
                      stroke={isSel?"#1a1a1a":"transparent"} strokeWidth={isSel?1.5:0}
                      style={{cursor:isSel?"grab":"pointer"}}
                      onMouseDown={e=>{ e.stopPropagation(); startDrag(e,t.id,"move",t.start); }}/>

                    {/* Right portion — resize handle, always on top */}
                    <rect x={tx+tw-RESIZE_HIT} y={ty} width={RESIZE_HIT} height={th} rx={0}
                      fill={bg} opacity={isSel?1:0.86}
                      stroke={isSel?"#1a1a1a":"transparent"} strokeWidth={isSel?1.5:0}
                      style={{cursor:"ew-resize"}}
                      onMouseDown={e=>{ e.stopPropagation(); startDrag(e,t.id,"resize",t.dur); }}/>

                    {/* Grip lines on resize zone */}
                    {isSel&&tw>20&&[0,2,4].map(off=>(
                      <line key={off} x1={tx+tw-RESIZE_HIT+2+off} y1={ty+5}
                        x2={tx+tw-RESIZE_HIT+2+off} y2={ty+th-5}
                        stroke={tc} strokeWidth={1} opacity={0.5} style={{pointerEvents:"none"}}/>
                    ))}

                    {/* Completion bar */}
                    {pctW>0&&<rect x={tx} y={ty+th-4} width={pctW} height={4} rx={2}
                      fill={tc} opacity={0.4} style={{pointerEvents:"none"}}/>}

                    {/* Label — inline editable on double-click */}
                    {!isEditing&&tw>20&&(
                      <text x={tx+7} y={ty+th/2+4} fontSize={10.5} fill={tc}
                        fontFamily="system-ui" fontWeight="500"
                        style={{pointerEvents:"none",userSelect:"none"}}>
                        {t.label.length>Math.floor(tw/7)?t.label.slice(0,Math.max(3,Math.floor(tw/7)-1))+"…":t.label}
                      </text>
                    )}

                    {/* Invisible wide hit area for double-click to edit */}
                    <rect x={tx} y={ty} width={tw} height={th} rx={5} fill="transparent"
                      style={{pointerEvents:"none"}}
                      onDoubleClick={e=>{ e.stopPropagation(); setSelected(t.id); setInlineEdit({id:t.id,value:t.label}); }}/>
                  </g>
                );
              })}

              {/* Milestones — draggable */}
              {milestones.map(m=>{
                const mx=xOf(m.day);
                const lane=m.lane||lanes[0];
                const ly=laneOffsets[lane]??0;
                const lh=LANE_PAD+(laneH[lane]??1)*SUB_H+LANE_PAD;
                const my=ly+lh/2; const sz=9;
                return (
                  <g key={m.id} style={{cursor:"ew-resize"}}
                    onMouseDown={e=>{ e.stopPropagation(); startDrag(e,m.id,"milestone",m.day); }}>
                    <line x1={mx} y1={0} x2={mx} y2={SVG_H-28}
                      stroke="#185FA5" strokeWidth={1} strokeDasharray="4,3" opacity={0.25}/>
                    <polygon points={`${mx},${my-sz} ${mx+sz},${my} ${mx},${my+sz} ${mx-sz},${my}`}
                      fill="#185FA5" opacity={0.9}/>
                    <text x={mx} y={my-sz-4} textAnchor="middle" fontSize={9.5}
                      fill="#185FA5" fontFamily="system-ui" fontWeight="500"
                      style={{pointerEvents:"none"}}>{m.label}</text>
                    <text x={mx} y={my+sz+11} textAnchor="middle" fontSize={9}
                      fill="#185FA5" fontFamily="system-ui" opacity={0.65}
                      style={{pointerEvents:"none"}}>{fmtShort(dateOfDay(m.day))}</text>
                  </g>
                );
              })}

              {/* Today line in body */}
              {todayOff>=0&&todayOff<=totalDays&&(
                <line x1={xOf(todayOff)} y1={0} x2={xOf(todayOff)} y2={SVG_H-28}
                  stroke="#E24B4A" strokeWidth={1.5} opacity={0.5}/>
              )}

              {/* Legend */}
              {colourMode!=="rag"&&Object.entries(colorMap).map(([key,{bg}],i)=>(
                <g key={key}>
                  <rect x={PAD_LEFT+i*88} y={SVG_H-20} width={10} height={10} rx={2} fill={bg}/>
                  <text x={PAD_LEFT+i*88+13} y={SVG_H-11} fontSize={9.5} fill="#999" fontFamily="system-ui">{key}</text>
                </g>
              ))}
              {colourMode==="rag"&&[["G","On track"],["A","At risk"],["R","Behind"]].map(([k,label],i)=>(
                <g key={k}>
                  <rect x={PAD_LEFT+i*78} y={SVG_H-20} width={10} height={10} rx={2} fill={RAG_BG[k]}/>
                  <text x={PAD_LEFT+i*78+13} y={SVG_H-11} fontSize={9.5} fill="#999" fontFamily="system-ui">{label}</text>
                </g>
              ))}
              <text x={SVG_W-8} y={SVG_H-11} textAnchor="end" fontSize={8} fill="#ddd" fontFamily="system-ui">
                {projectName} · {fmtLong(new Date(startDate))}
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Task edit panel (right side, floating) ────────────────────────── */}
      {selectedTask&&!presentMode&&(
        <div style={{width:244,background:"#fff",borderLeft:"0.5px solid rgba(0,0,0,0.08)",
          padding:16,overflowY:"auto",flexShrink:0,fontSize:13,boxShadow:"-4px 0 20px rgba(0,0,0,0.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <span style={{fontWeight:600,fontSize:13}}>Edit task</span>
            <button onClick={()=>setSelected(null)}
              style={{border:"none",background:"none",cursor:"pointer",fontSize:18,color:"#ccc",lineHeight:1}}>×</button>
          </div>

          {/* Inline edit / label */}
          {inlineEdit?.id===selectedTask.id ? (
            <div style={{marginBottom:12}}>
              <label style={fieldLabelStyle}>Label</label>
              <input ref={inlineRef} value={inlineEdit.value}
                onChange={e=>setInlineEdit(ie=>({...ie,value:e.target.value}))}
                onBlur={commitInlineEdit}
                onKeyDown={e=>{ if(e.key==="Enter")commitInlineEdit(); if(e.key==="Escape"){setInlineEdit(null);} }}
                style={{...rightInputStyle,fontWeight:500}}/>
            </div>
          ) : (
            <div style={{marginBottom:12}}>
              <label style={fieldLabelStyle}>Label</label>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <input value={selectedTask.label} onChange={e=>updateTask(selectedTask.id,"label",e.target.value)}
                  style={rightInputStyle}/>
                <button onClick={()=>setInlineEdit({id:selectedTask.id,value:selectedTask.label})}
                  title="Edit on timeline" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#ccc",padding:2}}>✏</button>
              </div>
            </div>
          )}

          <div style={{marginBottom:12}}>
            <label style={fieldLabelStyle}>Lane</label>
            <input value={selectedTask.lane} onChange={e=>updateTask(selectedTask.id,"lane",e.target.value)} style={rightInputStyle}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            <div>
              <label style={fieldLabelStyle}>Start</label>
              <input type="number" value={selectedTask.start} onChange={e=>updateTask(selectedTask.id,"start",e.target.value)} style={rightInputStyle}/>
            </div>
            <div>
              <label style={fieldLabelStyle}>Duration</label>
              <input type="number" value={selectedTask.dur} min={1} onChange={e=>updateTask(selectedTask.id,"dur",e.target.value)} style={rightInputStyle}/>
            </div>
          </div>

          {/* Date range display */}
          <div style={{background:"#f6f6f3",borderRadius:8,padding:"8px 10px",marginBottom:12,fontSize:12,lineHeight:1.7}}>
            <span style={{color:"#333",fontWeight:500}}>{fmtShort(dateOfDay(selectedTask.start))}</span>
            <span style={{color:"#aaa"}}> → </span>
            <span style={{color:"#333",fontWeight:500}}>{fmtShort(dateOfDay(selectedTask.start+selectedTask.dur))}</span>
            <span style={{color:"#bbb"}}> ({selectedTask.dur}d)</span>
          </div>

          <div style={{marginBottom:12}}>
            <label style={fieldLabelStyle}>Owner</label>
            <select value={selectedTask.owner} onChange={e=>updateTask(selectedTask.id,"owner",e.target.value)} style={rightInputStyle}>
              <option value="">— none —</option>
              {owners.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{marginBottom:12}}>
            <label style={fieldLabelStyle}>Tag</label>
            <input value={selectedTask.tag} onChange={e=>updateTask(selectedTask.id,"tag",e.target.value)} style={rightInputStyle}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            <div>
              <label style={fieldLabelStyle}>Complete %</label>
              <input type="number" value={selectedTask.pct} min={0} max={100}
                onChange={e=>updateTask(selectedTask.id,"pct",Math.min(100,parseInt(e.target.value)||0))} style={rightInputStyle}/>
            </div>
            <div>
              <label style={fieldLabelStyle}>RAG</label>
              <select value={selectedTask.rag||"G"} onChange={e=>updateTask(selectedTask.id,"rag",e.target.value)} style={rightInputStyle}>
                <option value="G">🟢 Green</option>
                <option value="A">🟡 Amber</option>
                <option value="R">🔴 Red</option>
              </select>
            </div>
          </div>

          <div style={{display:"flex",gap:6,marginBottom:14}}>
            <button onClick={()=>duplicateTask(selectedTask.id)}
              style={{flex:1,fontSize:11,padding:"5px 0",border:"0.5px solid rgba(0,0,0,0.12)",
                borderRadius:6,background:"#fafaf9",cursor:"pointer",fontFamily:"inherit",color:"#555"}}>
              Duplicate
            </button>
            <button onClick={()=>deleteTask(selectedTask.id)}
              style={{flex:1,fontSize:11,padding:"5px 0",border:"0.5px solid rgba(220,50,50,0.25)",
                borderRadius:6,color:"#A32D2D",background:"#fff8f8",cursor:"pointer",fontFamily:"inherit"}}>
              Delete
            </button>
          </div>

          {/* Dependencies */}
          <div style={{borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:12}}>
            <label style={fieldLabelStyle}>Depends on</label>
            {deps.filter(d=>d.to===selectedTask.id).map((d,i)=>{
              const ft=tasks.find(t=>t.id===d.from);
              return ft?(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4,alignItems:"center"}}>
                  <span style={{color:"#444"}}>{ft.label}</span>
                  <button onClick={()=>setDeps(ds=>ds.filter(x=>!(x.from===d.from&&x.to===d.to)))}
                    style={{border:"none",background:"none",cursor:"pointer",color:"#ccc",fontSize:14,lineHeight:1}}>×</button>
                </div>
              ):null;
            })}
            <select onChange={e=>{ if(!e.target.value)return; setDeps(ds=>[...ds,{from:e.target.value,to:selectedTask.id}]); e.target.value=""; }}
              style={{...rightInputStyle,marginTop:4}}>
              <option value="">+ add predecessor…</option>
              {tasks.filter(t=>t.id!==selectedTask.id).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {/* Milestones */}
          <div style={{marginTop:12,borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:12}}>
            <label style={fieldLabelStyle}>Milestones</label>
            {milestones.map(m=>(
              <div key={m.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4,alignItems:"center"}}>
                <span style={{color:"#185FA5"}}>◆ {m.label} <span style={{color:"#bbb",fontSize:10}}>{fmtShort(dateOfDay(m.day))}</span></span>
                <button onClick={()=>setMilestones(ms=>ms.filter(x=>x.id!==m.id))}
                  style={{border:"none",background:"none",cursor:"pointer",color:"#ccc",fontSize:14,lineHeight:1}}>×</button>
              </div>
            ))}
            <button onClick={()=>{
              const label=prompt("Milestone label:"); if(!label) return;
              setMilestones(ms=>[...ms,{id:`m${Date.now()}`,day:selectedTask.start+selectedTask.dur,label,lane:selectedTask.lane}]);
            }} style={{fontSize:11,padding:"4px 10px",border:"0.5px solid rgba(0,0,0,0.1)",borderRadius:6,
              background:"transparent",cursor:"pointer",fontFamily:"inherit",color:"#666",marginTop:2}}>
              + at task end
            </button>
          </div>

          <div style={{marginTop:12,fontSize:11,color:"#ccc",textAlign:"center"}}>
            ← → nudge · Del remove · ⌘Z undo
          </div>
        </div>
      )}

      {/* ── Inline edit overlay (absolute over SVG) ───────────────────────── */}
      {inlineEdit&&(()=>{
        const t=tasks.find(x=>x.id===inlineEdit.id);
        if(!t||!svgRef.current) return null;
        const rect=svgRef.current.getBoundingClientRect();
        const tx=xOf(t.start)+rect.left-(scrollRef.current?.scrollLeft||0);
        const tw=Math.max(t.dur*dayW-3,60);
        const ty=yOfTask(t)+rect.top+4;
        return (
          <input ref={inlineRef}
            value={inlineEdit.value}
            onChange={e=>setInlineEdit(ie=>({...ie,value:e.target.value}))}
            onBlur={commitInlineEdit}
            onKeyDown={e=>{ if(e.key==="Enter")commitInlineEdit(); if(e.key==="Escape")setInlineEdit(null); }}
            style={{position:"fixed",left:tx+6,top:ty+2,width:Math.min(tw-12,200),
              fontSize:11,fontWeight:500,fontFamily:"system-ui",
              background:"rgba(255,255,255,0.95)",border:"1.5px solid #5DCAA5",
              borderRadius:4,padding:"2px 6px",outline:"none",zIndex:500,
              boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}/>
        );
      })()}

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {contextMenu&&(
        <div style={{position:"fixed",left:contextMenu.x,top:contextMenu.y,zIndex:400,
          background:"#fff",borderRadius:9,boxShadow:"0 4px 24px rgba(0,0,0,0.15)",
          border:"0.5px solid rgba(0,0,0,0.1)",minWidth:160,padding:"4px 0",fontSize:13}}
          onClick={e=>e.stopPropagation()}
          onMouseLeave={()=>setContextMenu(null)}>
          {[
            ["✏ Rename",   ()=>{ setInlineEdit({id:contextMenu.taskId,value:tasks.find(t=>t.id===contextMenu.taskId)?.label||""}); setContextMenu(null); }],
            ["📋 Duplicate",()=>{ duplicateTask(contextMenu.taskId); setContextMenu(null); }],
            ["🟢 Green",   ()=>{ updateTask(contextMenu.taskId,"rag","G"); setContextMenu(null); }],
            ["🟡 Amber",   ()=>{ updateTask(contextMenu.taskId,"rag","A"); setContextMenu(null); }],
            ["🔴 Red",     ()=>{ updateTask(contextMenu.taskId,"rag","R"); setContextMenu(null); }],
            ["🗑 Delete",   ()=>{ deleteTask(contextMenu.taskId); setContextMenu(null); }, true],
          ].map(([label,action,danger])=>(
            <button key={label} onClick={action}
              style={{display:"block",width:"100%",textAlign:"left",padding:"7px 14px",
                border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,
                color:danger?"#A32D2D":"#333"}}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Tooltip ──────────────────────────────────────────────────────── */}
      {tooltip&&!contextMenu&&!inlineEdit&&(
        <div style={{position:"fixed",left:tooltip.x+14,top:tooltip.y-10,pointerEvents:"none",zIndex:300,
          background:"#1a1a1a",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#fff",lineHeight:1.8,
          boxShadow:"0 4px 20px rgba(0,0,0,0.2)"}}>
          <div style={{fontWeight:500}}>{tooltip.task.label}</div>
          <div style={{color:"#aaa"}}>{fmtShort(dateOfDay(tooltip.task.start))} → {fmtShort(dateOfDay(tooltip.task.start+tooltip.task.dur))}</div>
          <div style={{color:"#aaa"}}>{tooltip.task.dur} days{tooltip.task.owner?` · ${tooltip.task.owner}`:""}</div>
          {tooltip.task.pct>0&&<div style={{color:"#5DCAA5"}}>{tooltip.task.pct}% complete</div>}
          {tooltip.task.rag&&<div style={{color:RAG_BG[tooltip.task.rag]}}>{tooltip.task.rag==="G"?"On track":tooltip.task.rag==="A"?"At risk":"Behind"}</div>}
          <div style={{color:"#555",fontSize:10,marginTop:2}}>Right-click for options</div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PanelTitle({children}){return <div style={{fontSize:13,fontWeight:600,color:"#fff",marginBottom:14,letterSpacing:"-0.01em"}}>{children}</div>;}
function SectionLabel({children,style:s}){return <div style={{fontSize:10,color:"#555",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,...s}}>{children}</div>;}
function Field({label,children}){
  return <div style={{marginBottom:12}}>
    <label style={{fontSize:10,color:"#555",display:"block",marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</label>
    {children}
  </div>;
}
function TemplateRow({name,onLoad,onDelete}){
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,
    padding:"7px 10px",border:"0.5px solid rgba(255,255,255,0.07)",borderRadius:7,background:"rgba(255,255,255,0.04)"}}>
    <span style={{fontSize:12,color:"#bbb",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{name}</span>
    <div style={{display:"flex",gap:5,flexShrink:0}}>
      <Btn onClick={onLoad} small>Load</Btn>
      {onDelete&&<Btn onClick={onDelete} small danger>Del</Btn>}
    </div>
  </div>;
}
function ExportOption({icon,title,desc,onClick}){
  return <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
    border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:8,background:"rgba(255,255,255,0.04)",
    cursor:"pointer",textAlign:"left",fontFamily:"inherit",width:"100%",color:"#bbb",marginBottom:0}}>
    <span style={{fontSize:17}}>{icon}</span>
    <div>
      <div style={{fontSize:12,fontWeight:500,color:"#ddd",marginBottom:1}}>{title}</div>
      <div style={{fontSize:10,color:"#666"}}>{desc}</div>
    </div>
  </button>;
}
function Btn({children,onClick,accent,danger,small,disabled}){
  return <button onClick={onClick} disabled={disabled} style={{
    fontSize:small?11:12,padding:small?"4px 10px":"7px 14px",fontFamily:"inherit",cursor:disabled?"default":"pointer",
    borderRadius:6,border:danger?"0.5px solid rgba(220,50,50,0.35)":`0.5px solid ${accent?"#5DCAA5":"rgba(255,255,255,0.12)"}`,
    background:accent?"#5DCAA5":danger?"rgba(220,50,50,0.12)":"rgba(255,255,255,0.07)",
    color:accent?"#085041":danger?"#ff9999":disabled?"#444":"#bbb",
    width:(!small&&!danger)?"100%":"auto",display:"block",marginBottom:small?0:5,opacity:disabled?0.5:1,
  }}>{children}</button>;
}
const undoBtnStyle = disabled => ({
  flex:1,fontSize:11,padding:"5px 0",fontFamily:"inherit",cursor:disabled?"default":"pointer",
  border:"0.5px solid rgba(255,255,255,0.1)",borderRadius:6,
  background:"rgba(255,255,255,0.05)",color:disabled?"#333":"#aaa",opacity:disabled?0.4:1,
});
const inputStyle={
  width:"100%",fontSize:12,padding:"5px 8px",boxSizing:"border-box",
  border:"0.5px solid rgba(255,255,255,0.12)",borderRadius:6,fontFamily:"inherit",
  outline:"none",background:"rgba(255,255,255,0.07)",color:"#eee",
};
const rightInputStyle={
  width:"100%",fontSize:12,padding:"5px 8px",boxSizing:"border-box",
  border:"0.5px solid rgba(0,0,0,0.1)",borderRadius:6,fontFamily:"inherit",
  outline:"none",background:"#fafaf9",color:"#1a1a1a",
};
const fieldLabelStyle={fontSize:10,color:"#aaa",display:"block",marginBottom:3,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"};
const codeStyle={background:"rgba(255,255,255,0.08)",padding:"1px 4px",borderRadius:3,fontSize:10,fontFamily:"monospace",color:"#888"};