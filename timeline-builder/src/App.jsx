import { useState, useMemo, useRef, useCallback, useEffect } from "react";

// ─── Palette ─────────────────────────────────────────────────────────────────
const PALETTE  = ["#5DCAA5","#AFA9EC","#F0997B","#378ADD","#F4C0D1","#EF9F27","#97C459","#D4537E","#85B7EB","#FAC775","#7F77DD","#D85A30","#639922","#993556","#5F5E5A"];
const TEXT_ON  = ["#085041","#3C3489","#712B13","#0C447C","#72243E","#633806","#27500A","#72243E","#0C447C","#633806","#26215C","#4A1B0C","#173404","#4B1528","#2C2C2A"];

// ─── Owner library ────────────────────────────────────────────────────────────
const DEFAULT_OWNERS = ["MFG","BIVP","SYSO","CLIN"];

// ─── Template library ─────────────────────────────────────────────────────────
const BUILTIN_TEMPLATES = [
  {
    id: "tpl_validation", name: "Device Validation (4-week)",
    tasks: [
      { id:"t1", lane:"Engineering", label:"Design freeze",    start:0,  dur:5,  owner:"SYSO", tag:"Design"   },
      { id:"t2", lane:"Engineering", label:"SW integration",   start:5,  dur:8,  owner:"SYSO", tag:"Dev"      },
      { id:"t3", lane:"Engineering", label:"Unit testing",     start:9,  dur:7,  owner:"BIVP", tag:"QA"       },
      { id:"t4", lane:"Engineering", label:"Code review",      start:5,  dur:5,  owner:"BIVP", tag:"Dev"      },
      { id:"t5", lane:"Regulatory",  label:"Risk assessment",  start:3,  dur:6,  owner:"CLIN", tag:"Reg"      },
      { id:"t6", lane:"Regulatory",  label:"Doc package",      start:14, dur:10, owner:"CLIN", tag:"Reg"      },
      { id:"t7", lane:"Clinical",    label:"Protocol writing", start:0,  dur:7,  owner:"CLIN", tag:"Clinical" },
      { id:"t8", lane:"Clinical",    label:"IQ/OQ execution",  start:14, dur:12, owner:"MFG",  tag:"Clinical" },
      { id:"t9", lane:"Clinical",    label:"Data analysis",    start:14, dur:8,  owner:"BIVP", tag:"QA"       },
    ],
    milestones: [
      { id:"m1", day:5,  label:"Design freeze",    lane:"Engineering" },
      { id:"m2", day:14, label:"Validation start", lane:"Regulatory"  },
      { id:"m3", day:28, label:"Submission ready", lane:"Regulatory"  },
    ],
    deps: [{ from:"t1",to:"t2"},{ from:"t2",to:"t3"},{ from:"t4",to:"t6"},{ from:"t7",to:"t8"}],
    totalDays: 28,
  },
  {
    id: "tpl_launch", name: "Product Launch (3-week)",
    tasks: [
      { id:"t1", lane:"MFG",  label:"Build & test",      start:0,  dur:7,  owner:"MFG",  tag:"Build"    },
      { id:"t2", lane:"MFG",  label:"Packaging",         start:7,  dur:5,  owner:"MFG",  tag:"Build"    },
      { id:"t3", lane:"BIVP", label:"Safety review",     start:0,  dur:6,  owner:"BIVP", tag:"Review"   },
      { id:"t4", lane:"BIVP", label:"Sign-off",          start:12, dur:3,  owner:"BIVP", tag:"Review"   },
      { id:"t5", lane:"CLIN", label:"Field training",    start:9,  dur:6,  owner:"CLIN", tag:"Clinical" },
      { id:"t6", lane:"SYSO", label:"System integration",start:0,  dur:9,  owner:"SYSO", tag:"Dev"      },
      { id:"t7", lane:"SYSO", label:"UAT",               start:9,  dur:5,  owner:"SYSO", tag:"QA"       },
    ],
    milestones: [
      { id:"m1", day:7,  label:"Build complete", lane:"MFG"  },
      { id:"m2", day:15, label:"Sign-off",        lane:"BIVP" },
      { id:"m3", day:21, label:"Launch",          lane:"CLIN" },
    ],
    deps: [{ from:"t1",to:"t2"},{ from:"t3",to:"t4"},{ from:"t6",to:"t7"},{ from:"t4",to:"t5"}],
    totalDays: 21,
  },
];

// ─── Storage helpers ──────────────────────────────────────────────────────────
const LS_TEMPLATES = "tl_templates_v1";
const LS_OWNERS    = "tl_owners_v1";
const loadLS  = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const saveLS  = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

// ─── Paste parser ─────────────────────────────────────────────────────────────
function parsePaste(raw) {
  raw = raw.trim();
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [p]; } catch { return null; }
  }
  const lines = raw.split("\n").filter(Boolean);
  if (lines.length < 2) return null;
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  return lines.slice(1).map((line, i) => {
    const vals = line.split(",").map(v => v.trim());
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ""; });
    return { id: obj.id || `t${Date.now()}${i}`, lane: obj.lane||"General", label: obj.label||obj.name||"Task",
      start: parseInt(obj.start)||0, dur: parseInt(obj.dur||obj.duration)||3, owner: obj.owner||"", tag: obj.tag||obj.type||"" };
  });
}

// ─── Sub-row packing ──────────────────────────────────────────────────────────
function assignSubRows(tasks) {
  const groups = {};
  tasks.forEach(t => { (groups[t.lane] = groups[t.lane]||[]).push(t); });
  const result = {};
  Object.values(groups).forEach(ts => {
    const rows = [];
    ts.forEach(t => {
      let placed = false;
      for (let r = 0; r < rows.length; r++) {
        if (!rows[r].some(rt => rt.start < t.start + t.dur && t.start < rt.start + rt.dur)) {
          rows[r].push(t); result[t.id] = r; placed = true; break;
        }
      }
      if (!placed) { rows.push([t]); result[t.id] = rows.length - 1; }
    });
  });
  return result;
}

function buildColorMap(tasks, mode) {
  const keys = [...new Set(tasks.map(t => t[mode]))].filter(Boolean);
  const map = {};
  keys.forEach((k, i) => { map[k] = { bg: PALETTE[i % PALETTE.length], text: TEXT_ON[i % TEXT_ON.length] }; });
  return map;
}

function laneHeights(tasks, subRows) {
  const max = {};
  tasks.forEach(t => { max[t.lane] = Math.max(max[t.lane]??0, (subRows[t.id]??0)+1); });
  return max;
}

// ─── Geometry constants ───────────────────────────────────────────────────────
const PAD_LEFT = 120;
const PAD_TOP  = 44;
const SUB_H    = 36;
const LANE_PAD = 12;
const DAY_W    = 22;
const RESIZE_HIT = 8; // px hit zone on right edge for resize handle

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks,        setTasks]        = useState(BUILTIN_TEMPLATES[0].tasks);
  const [milestones,   setMilestones]   = useState(BUILTIN_TEMPLATES[0].milestones);
  const [deps,         setDeps]         = useState(BUILTIN_TEMPLATES[0].deps);
  const [totalDays,    setTotalDays]    = useState(28);
  const [projectName,  setProjectName]  = useState("Q2 Device Validation");
  const [colourMode,   setColourMode]   = useState("owner");
  const [selected,     setSelected]     = useState(null);

  // Panels
  const [modal, setModal] = useState(null); // "paste" | "templates" | "owners"
  const [pasteText,  setPasteText]  = useState("");
  const [pasteError, setPasteError] = useState("");

  // Owner library
  const [owners,    setOwners]    = useState(() => loadLS(LS_OWNERS, DEFAULT_OWNERS));
  const [newOwner,  setNewOwner]  = useState("");

  // Template library (user-saved + builtins)
  const [savedTemplates, setSavedTemplates] = useState(() => loadLS(LS_TEMPLATES, []));
  const [tplName, setTplName] = useState("");

  // Drag state
  const dragRef = useRef(null); // { id, type:"move"|"resize", startX, origStart, origDur }
  const svgRef  = useRef();

  // Persist owners
  useEffect(() => { saveLS(LS_OWNERS, owners); }, [owners]);
  useEffect(() => { saveLS(LS_TEMPLATES, savedTemplates); }, [savedTemplates]);

  // Derived
  const subRows  = useMemo(() => assignSubRows(tasks), [tasks]);
  const colorMap = useMemo(() => buildColorMap(tasks, colourMode), [tasks, colourMode]);
  const laneH    = useMemo(() => laneHeights(tasks, subRows), [tasks, subRows]);
  const lanes    = useMemo(() => [...new Set(tasks.map(t => t.lane))], [tasks]);

  const SVG_W = PAD_LEFT + totalDays * DAY_W + 16;

  const laneOffsets = useMemo(() => {
    const o = {}; let yy = PAD_TOP;
    lanes.forEach(l => { o[l] = yy; yy += LANE_PAD + (laneH[l]??1)*SUB_H + LANE_PAD; });
    return o;
  }, [lanes, laneH]);

  const SVG_H = useMemo(() => {
    let h = PAD_TOP;
    lanes.forEach(l => { h += LANE_PAD + (laneH[l]??1)*SUB_H + LANE_PAD; });
    return h + 28;
  }, [lanes, laneH]);

  const xOf     = d => PAD_LEFT + d * DAY_W;
  const dayOf   = px => Math.round((px - PAD_LEFT) / DAY_W);
  const yOfTask = t => laneOffsets[t.lane] + LANE_PAD + (subRows[t.id]??0)*SUB_H + 4;

  const selectedTask = tasks.find(t => t.id === selected);

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const onBarMouseDown = useCallback((e, taskId, type) => {
    e.stopPropagation();
    e.preventDefault();
    const t = tasks.find(x => x.id === taskId);
    dragRef.current = { id: taskId, type, startX: e.clientX, origStart: t.start, origDur: t.dur };
    setSelected(taskId);
  }, [tasks]);

  useEffect(() => {
    const onMove = e => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dayDelta = Math.round(dx / DAY_W);
      setTasks(ts => ts.map(t => {
        if (t.id !== d.id) return t;
        if (d.type === "move") {
          const newStart = Math.max(0, d.origStart + dayDelta);
          return { ...t, start: newStart };
        } else {
          const newDur = Math.max(1, d.origDur + dayDelta);
          return { ...t, dur: newDur };
        }
      }));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // ── Task CRUD ─────────────────────────────────────────────────────────────────
  const updateTask = useCallback((id, field, val) => {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, [field]: (field==="start"||field==="dur") ? Math.max(0,parseInt(val)||0) : val } : t));
  }, []);

  const deleteTask = useCallback(id => {
    setTasks(ts => ts.filter(t => t.id !== id));
    setDeps(ds => ds.filter(d => d.from !== id && d.to !== id));
    setSelected(s => s === id ? null : s);
  }, []);

  const addTask = () => {
    const id = `t${Date.now()}`;
    setTasks(ts => [...ts, { id, lane: lanes[0]||"General", label:"New task", start:0, dur:3, owner: owners[0]||"", tag:"" }]);
    setSelected(id);
  };

  // ── Paste import ──────────────────────────────────────────────────────────────
  const handlePaste = () => {
    const parsed = parsePaste(pasteText);
    if (!parsed) { setPasteError("Couldn't parse — check format"); return; }
    setTasks(parsed); setDeps([]); setModal(null); setPasteText(""); setPasteError("");
  };

  // ── Template ops ──────────────────────────────────────────────────────────────
  const loadTemplate = tpl => {
    setTasks(tpl.tasks); setMilestones(tpl.milestones); setDeps(tpl.deps);
    setTotalDays(tpl.totalDays); setProjectName(tpl.name); setSelected(null); setModal(null);
  };

  const saveTemplate = () => {
    if (!tplName.trim()) return;
    const tpl = { id:`tpl_${Date.now()}`, name:tplName.trim(), tasks, milestones, deps, totalDays };
    setSavedTemplates(ts => [...ts, tpl]);
    setTplName("");
  };

  const deleteTemplate = id => setSavedTemplates(ts => ts.filter(t => t.id !== id));

  // ── Owner ops ─────────────────────────────────────────────────────────────────
  const addOwner = () => {
    const o = newOwner.trim().toUpperCase();
    if (!o || owners.includes(o)) return;
    setOwners(os => [...os, o]); setNewOwner("");
  };

  // ── Export SVG ────────────────────────────────────────────────────────────────
  const exportSVG = () => {
    const svg = svgRef.current;
    const blob = new Blob([svg.outerHTML], { type:"image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${projectName.replace(/\s+/g,"-")}.svg`; a.click();
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f8f7f4", fontFamily:"'DM Sans',system-ui,sans-serif", display:"flex", flexDirection:"column" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid rgba(0,0,0,0.1)", padding:"0 20px", height:50,
        display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <input value={projectName} onChange={e => setProjectName(e.target.value)}
            style={{ fontSize:14, fontWeight:500, border:"none", outline:"none", background:"transparent", color:"#1a1a1a", minWidth:220 }} />
          <div style={{ display:"flex", alignItems:"center", gap:2, background:"#f1efe8", borderRadius:20, padding:"2px 3px" }}>
            {["lane","owner","tag"].map(m => (
              <button key={m} onClick={() => setColourMode(m)} style={{
                fontSize:11, padding:"3px 10px", borderRadius:16, border:"none", cursor:"pointer", fontFamily:"inherit",
                background: colourMode===m ? "#1a1a1a" : "transparent",
                color: colourMode===m ? "#fff" : "#666",
              }}>By {m}</button>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <label style={{ fontSize:11, color:"#999" }}>Days:</label>
            <input type="number" value={totalDays} min={7} max={365}
              onChange={e => setTotalDays(Math.max(7, parseInt(e.target.value)||28))}
              style={{ width:52, fontSize:12, padding:"3px 6px", border:"0.5px solid rgba(0,0,0,0.12)",
                borderRadius:6, fontFamily:"inherit", outline:"none" }} />
          </div>
        </div>
        <div style={{ display:"flex", gap:7 }}>
          <Btn onClick={() => setModal("owners")}>Teams</Btn>
          <Btn onClick={() => setModal("templates")}>Templates</Btn>
          <Btn onClick={() => setModal("paste")}>Paste data</Btn>
          <Btn onClick={addTask}>+ Task</Btn>
          <Btn onClick={exportSVG} accent>Export SVG</Btn>
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* ── Timeline canvas ──────────────────────────────────────────────── */}
        <div style={{ flex:1, overflow:"auto", padding:20 }}>
          <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid rgba(0,0,0,0.08)", display:"inline-block", minWidth:"100%" }}>
            <svg ref={svgRef} width={SVG_W} height={SVG_H} style={{ display:"block", userSelect:"none" }}>
              <defs>
                <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L0,7 L7,3.5 z" fill="#D4537E" />
                </marker>
              </defs>

              {/* Week lines */}
              {Array.from({ length: Math.ceil(totalDays/7)+1 }, (_,i) => i*7).filter(d => d<=totalDays).map(d => (
                <g key={d}>
                  <line x1={xOf(d)} y1={PAD_TOP-10} x2={xOf(d)} y2={SVG_H-20} stroke="rgba(0,0,0,0.07)" strokeWidth={0.5} strokeDasharray="3,3" />
                  <text x={xOf(d)+3} y={PAD_TOP-2} fontSize={10} fill="#bbb" fontFamily="system-ui">W{d/7+1}</text>
                </g>
              ))}

              {/* Day ticks */}
              {Array.from({ length: totalDays+1 }, (_,i) => i).map(d => (
                <line key={d} x1={xOf(d)} y1={SVG_H-20} x2={xOf(d)} y2={SVG_H-16} stroke="rgba(0,0,0,0.1)" strokeWidth={0.5} />
              ))}

              {/* Lanes */}
              {lanes.map((lane, li) => {
                const ly = laneOffsets[lane];
                const lh = LANE_PAD + (laneH[lane]??1)*SUB_H + LANE_PAD;
                return (
                  <g key={lane}>
                    <rect x={0} y={ly} width={SVG_W} height={lh} fill={li%2===0 ? "rgba(0,0,0,0.012)" : "rgba(0,0,0,0.024)"} />
                    <rect x={0} y={ly} width={PAD_LEFT-10} height={lh} fill="#fff" />
                    <text x={PAD_LEFT-14} y={ly+lh/2+4} textAnchor="end" fontSize={11} fill="#888" fontFamily="system-ui" fontWeight="500">{lane}</text>
                    <line x1={0} y1={ly+lh} x2={SVG_W} y2={ly+lh} stroke="rgba(0,0,0,0.07)" strokeWidth={0.5} />
                  </g>
                );
              })}

              {/* Dependencies */}
              {deps.map((dep, i) => {
                const ft = tasks.find(t => t.id === dep.from);
                const tt = tasks.find(t => t.id === dep.to);
                if (!ft||!tt) return null;
                const x1 = xOf(ft.start + ft.dur);
                const y1 = yOfTask(ft) + (SUB_H-8)/2;
                const x2 = xOf(tt.start);
                const y2 = yOfTask(tt) + (SUB_H-8)/2;
                const cx = (x1+x2)/2;
                return <path key={i} d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                  stroke="#D4537E" strokeWidth={1.5} fill="none" opacity={0.55} markerEnd="url(#arr)" />;
              })}

              {/* Tasks */}
              {tasks.map(t => {
                const colorKey = t[colourMode] || t.lane;
                const { bg, text: tc } = colorMap[colorKey] || { bg: PALETTE[0], text: TEXT_ON[0] };
                const tx = xOf(t.start);
                const tw = Math.max(t.dur * DAY_W - 3, 4);
                const ty = yOfTask(t);
                const th = SUB_H - 8;
                const isSel = selected === t.id;
                return (
                  <g key={t.id}>
                    {/* Main bar — draggable to move */}
                    <rect x={tx} y={ty} width={tw} height={th} rx={5}
                      fill={bg} opacity={isSel ? 1 : 0.82}
                      stroke={isSel ? "#1a1a1a" : "transparent"} strokeWidth={isSel ? 1.5 : 0}
                      style={{ cursor:"grab" }}
                      onMouseDown={e => onBarMouseDown(e, t.id, "move")}
                      onClick={() => setSelected(t.id === selected ? null : t.id)}
                    />
                    {/* Label */}
                    {tw > 28 && (
                      <text x={tx+7} y={ty+th/2+4} fontSize={10.5} fill={tc} fontFamily="system-ui" fontWeight="500"
                        style={{ pointerEvents:"none", userSelect:"none" }}>
                        {t.label.length > Math.floor(tw/7) ? t.label.slice(0, Math.max(3, Math.floor(tw/7)-1))+"…" : t.label}
                      </text>
                    )}
                    {/* Resize handle — right edge */}
                    <rect
                      x={tx + tw - RESIZE_HIT} y={ty} width={RESIZE_HIT} height={th} rx={0}
                      fill="transparent"
                      style={{ cursor:"ew-resize" }}
                      onMouseDown={e => onBarMouseDown(e, t.id, "resize")}
                    />
                    {/* Owner badge — shown when selected */}
                    {isSel && t.owner && tw > 50 && (
                      <text x={tx + tw - 5} y={ty + th - 4} fontSize={9} fill={tc} fontFamily="system-ui"
                        textAnchor="end" style={{ pointerEvents:"none", opacity:0.8 }}>{t.owner}</text>
                    )}
                  </g>
                );
              })}

              {/* Milestones */}
              {milestones.map(m => {
                const mx = xOf(m.day);
                const lane = m.lane || lanes[0];
                const ly = laneOffsets[lane] ?? PAD_TOP;
                const lh = LANE_PAD + (laneH[lane]??1)*SUB_H + LANE_PAD;
                const my = ly + lh/2;
                const sz = 8;
                return (
                  <g key={m.id}>
                    <line x1={mx} y1={PAD_TOP} x2={mx} y2={SVG_H-20} stroke="#185FA5" strokeWidth={1} strokeDasharray="4,3" opacity={0.35} />
                    <polygon points={`${mx},${my-sz} ${mx+sz},${my} ${mx},${my+sz} ${mx-sz},${my}`} fill="#185FA5" opacity={0.9} />
                    <text x={mx} y={my-sz-5} textAnchor="middle" fontSize={9.5} fill="#185FA5" fontFamily="system-ui" fontWeight="500">{m.label}</text>
                  </g>
                );
              })}

              {/* Legend */}
              {Object.entries(colorMap).map(([key, {bg}], i) => (
                <g key={key}>
                  <rect x={PAD_LEFT + i*90} y={SVG_H-14} width={10} height={10} rx={2} fill={bg} />
                  <text x={PAD_LEFT + i*90+13} y={SVG_H-5} fontSize={9.5} fill="#888" fontFamily="system-ui">{key}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* ── Right panel: task editor ─────────────────────────────────────── */}
        {selectedTask && (
          <div style={{ width:256, background:"#fff", borderLeft:"0.5px solid rgba(0,0,0,0.08)", padding:18, overflowY:"auto", flexShrink:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Edit task</span>
              <button onClick={() => setSelected(null)} style={{ border:"none", background:"none", cursor:"pointer", fontSize:17, color:"#aaa", lineHeight:1 }}>×</button>
            </div>

            <Field label="Label">
              <input value={selectedTask.label} onChange={e => updateTask(selectedTask.id,"label",e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Lane">
              <input value={selectedTask.lane} onChange={e => updateTask(selectedTask.id,"lane",e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
              <Field label="Start (day)">
                <input type="number" value={selectedTask.start} onChange={e => updateTask(selectedTask.id,"start",e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Duration">
                <input type="number" value={selectedTask.dur} min={1} onChange={e => updateTask(selectedTask.id,"dur",e.target.value)} style={inputStyle} />
              </Field>
            </div>

            <Field label="Owner">
              <select value={selectedTask.owner} onChange={e => updateTask(selectedTask.id,"owner",e.target.value)} style={inputStyle}>
                <option value="">— none —</option>
                {owners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Tag">
              <input value={selectedTask.tag} onChange={e => updateTask(selectedTask.id,"tag",e.target.value)} style={inputStyle} />
            </Field>

            <button onClick={() => deleteTask(selectedTask.id)}
              style={{ width:"100%", fontSize:12, padding:"6px 0", marginTop:4,
                border:"0.5px solid rgba(220,50,50,0.25)", borderRadius:6,
                color:"#A32D2D", background:"#fff8f8", cursor:"pointer", fontFamily:"inherit" }}>
              Delete task
            </button>

            {/* Deps */}
            <div style={{ marginTop:18, borderTop:"0.5px solid rgba(0,0,0,0.07)", paddingTop:14 }}>
              <div style={{ fontSize:11, color:"#aaa", marginBottom:8, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.04em" }}>Depends on</div>
              {deps.filter(d => d.to === selectedTask.id).map((d,i) => {
                const ft = tasks.find(t => t.id === d.from);
                return ft ? (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5, alignItems:"center" }}>
                    <span style={{ color:"#444" }}>{ft.label}</span>
                    <button onClick={() => setDeps(ds => ds.filter(x => !(x.from===d.from && x.to===d.to)))}
                      style={{ border:"none", background:"none", cursor:"pointer", color:"#ccc", fontSize:14, lineHeight:1 }}>×</button>
                  </div>
                ) : null;
              })}
              <select onChange={e => { if(!e.target.value) return; setDeps(ds => [...ds,{from:e.target.value,to:selectedTask.id}]); e.target.value=""; }}
                style={{ ...inputStyle, marginTop:4 }}>
                <option value="">+ add predecessor…</option>
                {tasks.filter(t => t.id !== selectedTask.id).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            {/* Milestones quick-add */}
            <div style={{ marginTop:18, borderTop:"0.5px solid rgba(0,0,0,0.07)", paddingTop:14 }}>
              <div style={{ fontSize:11, color:"#aaa", marginBottom:8, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.04em" }}>Milestones</div>
              {milestones.map(m => (
                <div key={m.id} style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5, alignItems:"center" }}>
                  <span style={{ color:"#185FA5" }}>◆ {m.label} <span style={{ color:"#aaa" }}>d{m.day}</span></span>
                  <button onClick={() => setMilestones(ms => ms.filter(x => x.id !== m.id))}
                    style={{ border:"none", background:"none", cursor:"pointer", color:"#ccc", fontSize:14, lineHeight:1 }}>×</button>
                </div>
              ))}
              <button onClick={() => {
                const label = prompt("Milestone label:");
                if (!label) return;
                setMilestones(ms => [...ms, { id:`m${Date.now()}`, day: selectedTask.start + selectedTask.dur, label, lane: selectedTask.lane }]);
              }} style={{ fontSize:12, padding:"4px 10px", border:"0.5px solid rgba(0,0,0,0.12)", borderRadius:6,
                background:"transparent", cursor:"pointer", fontFamily:"inherit", color:"#555" }}>
                + milestone at end
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════════════ */}
      {modal && (
        <div onClick={() => setModal(null)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", display:"flex",
            alignItems:"center", justifyContent:"center", zIndex:200 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#fff", borderRadius:14, padding:28, width:540, maxHeight:"82vh", overflowY:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.12)" }}>

            {/* ── PASTE ── */}
            {modal === "paste" && (<>
              <ModalHeader title="Paste task data" onClose={() => setModal(null)} />
              <p style={{ fontSize:12, color:"#999", marginBottom:12, lineHeight:1.7 }}>
                CSV columns: <code style={codeStyle}>lane, label, start, dur, owner, tag</code><br/>
                Or paste a JSON array of task objects.
              </p>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
                placeholder={"lane,label,start,dur,owner,tag\nEngineering,Design freeze,0,5,SYSO,Design\nRegulatory,Risk assessment,3,6,CLIN,Reg"}
                style={{ width:"100%", height:160, fontFamily:"monospace", fontSize:12, padding:10,
                  border:"0.5px solid rgba(0,0,0,0.15)", borderRadius:8, resize:"vertical", outline:"none" }} />
              {pasteError && <p style={{ color:"#A32D2D", fontSize:12, marginTop:6 }}>{pasteError}</p>}
              <div style={{ display:"flex", gap:8, marginTop:12 }}>
                <Btn onClick={handlePaste} accent>Import</Btn>
                <Btn onClick={() => { setPasteText(""); setPasteError(""); }}>Clear</Btn>
              </div>
            </>)}

            {/* ── TEMPLATES ── */}
            {modal === "templates" && (<>
              <ModalHeader title="Template library" onClose={() => setModal(null)} />
              <div style={{ fontSize:12, color:"#999", marginBottom:14 }}>Built-in templates</div>
              {BUILTIN_TEMPLATES.map(tpl => (
                <TemplateRow key={tpl.id} name={tpl.name} onLoad={() => loadTemplate(tpl)} />
              ))}
              {savedTemplates.length > 0 && (
                <>
                  <div style={{ fontSize:12, color:"#999", margin:"16px 0 10px", borderTop:"0.5px solid rgba(0,0,0,0.07)", paddingTop:14 }}>Saved templates</div>
                  {savedTemplates.map(tpl => (
                    <TemplateRow key={tpl.id} name={tpl.name} onLoad={() => loadTemplate(tpl)}
                      onDelete={() => deleteTemplate(tpl.id)} />
                  ))}
                </>
              )}
              <div style={{ borderTop:"0.5px solid rgba(0,0,0,0.07)", paddingTop:16, marginTop:16 }}>
                <div style={{ fontSize:12, color:"#666", marginBottom:8 }}>Save current timeline as template</div>
                <div style={{ display:"flex", gap:8 }}>
                  <input value={tplName} onChange={e => setTplName(e.target.value)}
                    placeholder="Template name…"
                    onKeyDown={e => e.key==="Enter" && saveTemplate()}
                    style={{ ...inputStyle, flex:1 }} />
                  <Btn onClick={saveTemplate} accent>Save</Btn>
                </div>
              </div>
            </>)}

            {/* ── OWNERS ── */}
            {modal === "owners" && (<>
              <ModalHeader title="Team / owner library" onClose={() => setModal(null)} />
              <p style={{ fontSize:12, color:"#999", marginBottom:16, lineHeight:1.6 }}>
                These appear in the owner dropdown when editing tasks. Saved locally to your browser.
              </p>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
                {owners.map(o => (
                  <div key={o} style={{ display:"flex", alignItems:"center", gap:5, background:"#f1efe8",
                    borderRadius:20, padding:"4px 12px 4px 14px", fontSize:13, fontWeight:500 }}>
                    <span style={{ color:"#333" }}>{o}</span>
                    {owners.length > 1 && (
                      <button onClick={() => setOwners(os => os.filter(x => x !== o))}
                        style={{ border:"none", background:"none", cursor:"pointer", color:"#bbb", fontSize:14, lineHeight:1, padding:0 }}>×</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input value={newOwner} onChange={e => setNewOwner(e.target.value.toUpperCase())}
                  placeholder="New team code…"
                  maxLength={8}
                  onKeyDown={e => e.key==="Enter" && addOwner()}
                  style={{ ...inputStyle, flex:1, textTransform:"uppercase", fontWeight:500, letterSpacing:"0.05em" }} />
                <Btn onClick={addOwner} accent>Add</Btn>
              </div>
              <p style={{ fontSize:11, color:"#bbb", marginTop:10 }}>Changes save automatically and persist between sessions.</p>
            </>)}

          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <label style={{ fontSize:11, color:"#aaa", display:"block", marginBottom:3, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
      <span style={{ fontSize:15, fontWeight:500 }}>{title}</span>
      <button onClick={onClose} style={{ border:"none", background:"none", cursor:"pointer", fontSize:18, color:"#bbb", lineHeight:1 }}>×</button>
    </div>
  );
}

function TemplateRow({ name, onLoad, onDelete }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8,
      padding:"10px 14px", border:"0.5px solid rgba(0,0,0,0.08)", borderRadius:8, background:"#fafaf9" }}>
      <span style={{ fontSize:13, color:"#333" }}>{name}</span>
      <div style={{ display:"flex", gap:6 }}>
        <Btn onClick={onLoad}>Load</Btn>
        {onDelete && <Btn onClick={onDelete} danger>Delete</Btn>}
      </div>
    </div>
  );
}

function Btn({ children, onClick, accent, danger }) {
  return (
    <button onClick={onClick} style={{
      fontSize:12, padding:"6px 14px", fontFamily:"inherit", cursor:"pointer",
      borderRadius:7, border: danger ? "0.5px solid rgba(220,50,50,0.25)" : `0.5px solid ${accent?"#1a1a1a":"rgba(0,0,0,0.14)"}`,
      background: accent ? "#1a1a1a" : danger ? "#fff8f8" : "#fff",
      color: accent ? "#fff" : danger ? "#A32D2D" : "#333",
    }}>{children}</button>
  );
}

const inputStyle = {
  width:"100%", fontSize:13, padding:"5px 8px",
  border:"0.5px solid rgba(0,0,0,0.14)", borderRadius:6,
  fontFamily:"inherit", outline:"none", background:"#fafafa", color:"#1a1a1a",
};

const codeStyle = {
  background:"#f5f5f3", padding:"1px 5px", borderRadius:4, fontSize:11, fontFamily:"monospace",
};
