import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play, Pause, StepForward, RotateCcw, Copy, Check,
  SlidersHorizontal, Briefcase, Building2, ChevronDown, AlertTriangle,
} from "lucide-react";

// ---- Seeded candidate profile (editable in the UI) ----
const SEED_PROFILE = `Daniel Alabi — Ph.D. in Electrical & Computer Engineering (University of Florida).

Most recent role: Senior Principal Scientist at Normandeau Associates (through Sept 2025), leading R&D across environmental engineering, computational electromagnetics, AI/ML systems, SCADA/OT, and signal processing.

Signature strength: a rare combination of deep OT/SCADA and industrial-systems expertise with hands-on AI/ML engineering — I design the systems and build the intelligence layers on top of them.

Selected highlights:
- Inventor on a U.S. patent (App. No. 18/566,914) in magnetic non-destructive testing.
- Built browser-based, on-device industrial analytics tools (e.g., a SCADA Historian Analyst with anomaly detection, alarm correlation, and multi-file baseline learning).
- Earlier experience at Stanbic IBTC Bank and a research internship at CEA-LIST (France).

Currently targeting senior leadership — Director of R&D, VP of Engineering, and enterprise/AI transformation — connecting industrial domain depth with applied AI.

Based in Alachua, FL. U.S. Permanent Resident.

Answer style: speak in first person, be specific, lead with impact and concrete examples, quantify where possible, show both technical depth and leadership judgment.`;

const STYLES = {
  "Conversational & warm":
    "Keep a warm, encouraging, conversational tone. Put the candidate at ease while still drawing out real substance.",
  "Rigorous technical deep-dive":
    "Probe deeply into technical decisions, architecture, trade-offs and edge cases. Ask precise follow-ups and do not accept vague answers.",
  "Skeptical & high-pressure":
    "Adopt a skeptical, demanding stance. Challenge claims, press on gaps and weaknesses, and apply realistic interview pressure while staying professional.",
  "Behavioral & leadership":
    "Focus on leadership, collaboration, conflict and impact. Use behavioral (STAR-style) questions about how they led teams and handled hard situations.",
  "Mixed panel":
    "Move fluidly across technical depth, behavioral/leadership and strategic questions, the way a well-rounded interview panel would.",
};

const SPEEDS = { Fast: 250, Normal: 750, Slow: 1600 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function InterviewArena() {
  const [role, setRole] = useState("Director of R&D");
  const [company, setCompany] = useState("");
  const [style, setStyle] = useState("Rigorous technical deep-dive");
  const [profile, setProfile] = useState(SEED_PROFILE);

  const [transcript, setTranscript] = useState([]);
  const [mode, setMode] = useState("idle"); // idle | running | paused | done
  const [generating, setGenerating] = useState(null); // null | interviewer | candidate
  const [error, setError] = useState(null);
  const [maxTurns, setMaxTurns] = useState(12);
  const [speed, setSpeed] = useState("Normal");
  const [setupOpen, setSetupOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const runningRef = useRef(false);
  const transcriptRef = useRef([]);
  const stageRef = useRef(null);

  useEffect(() => {
    const el = stageRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, generating]);

  const interviewerSystem = () => {
    const co = company.trim() || "the hiring company";
    return `You are a senior interviewer at ${co}, interviewing a candidate for the "${role}" position.
${STYLES[style]}

Rules:
- Ask ONE focused question per turn (occasionally a one-line reaction plus one question).
- Build on the candidate's previous answers with relevant, specific follow-ups.
- Never answer on the candidate's behalf and never break character.
- Keep each turn concise. Open with a brief greeting + your first question.`;
  };

  const candidateSystem = () => {
    const co = company.trim() || "the company";
    return `You are the job candidate described below, interviewing for the "${role}" role at ${co}. Answer the interviewer's questions in first person as this person.

Guidelines:
- Be specific; use concrete examples and metrics where relevant.
- Keep most answers to 2–5 sentences; go longer only for deep technical questions.
- Stay in character and never break the fourth wall.

CANDIDATE BACKGROUND:
${profile}`;
  };

  const nextSpeaker = (t) =>
    t.length === 0 || t[t.length - 1].role === "candidate" ? "interviewer" : "candidate";

  const callBot = async (speaker, t) => {
    const system = speaker === "interviewer" ? interviewerSystem() : candidateSystem();
    const dialogue = t
      .map((m) => `${m.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${m.text}`)
      .join("\n\n");
    const who = speaker === "interviewer" ? "INTERVIEWER" : "CANDIDATE";
    const userContent =
      t.length === 0
        ? "Begin the interview now. Greet the candidate briefly and ask your first question."
        : `Interview transcript so far:\n\n${dialogue}\n\nIt is now your turn as the ${who}. Reply with only your next message — no name prefix, no stage directions.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const data = await res.json();
    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (!text) throw new Error("Empty response from model");
    return text;
  };

  const doNextTurn = async (base) => {
    const speaker = nextSpeaker(base);
    setGenerating(speaker);
    setError(null);
    try {
      const text = await callBot(speaker, base);
      const updated = [...base, { id: Date.now() + Math.random(), role: speaker, text }];
      transcriptRef.current = updated;
      setTranscript(updated);
      return updated;
    } finally {
      setGenerating(null);
    }
  };

  const autoRun = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setMode("running");
    let t = transcriptRef.current;
    try {
      while (runningRef.current && t.length < maxTurns) {
        t = await doNextTurn(t);
        if (!runningRef.current) break;
        await sleep(SPEEDS[speed]);
      }
    } catch (e) {
      setError(e.message || "Something went wrong");
      runningRef.current = false;
      setMode("paused");
      return;
    }
    const finished = t.length >= maxTurns;
    runningRef.current = false;
    setMode(finished ? "done" : "paused");
  }, [maxTurns, speed, role, company, style, profile]);

  const step = async () => {
    if (runningRef.current || generating) return;
    if (transcriptRef.current.length >= maxTurns) return;
    try {
      await doNextTurn(transcriptRef.current);
      setMode("paused");
    } catch (e) {
      setError(e.message || "Something went wrong");
    }
  };

  const pause = () => {
    runningRef.current = false;
    setMode("paused");
  };

  const reset = () => {
    runningRef.current = false;
    transcriptRef.current = [];
    setTranscript([]);
    setMode("idle");
    setError(null);
  };

  const copyTranscript = async () => {
    const text =
      `Interview — ${role}${company.trim() ? " @ " + company.trim() : ""} (${style})\n\n` +
      transcript
        .map((m) => `${m.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}:\n${m.text}`)
        .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Couldn't access clipboard");
    }
  };

  const busy = !!generating;
  const atCap = transcript.length >= maxTurns;
  const statusMeta = {
    idle: ["Idle", "var(--muted)"],
    running: ["Live", "var(--int)"],
    paused: ["Paused", "var(--cand)"],
    done: ["Complete", "var(--ok)"],
  }[mode];

  return (
    <div className="ia-root">
      <style>{CSS}</style>
      <div className="ia-grain" />
      <div className="ia-wrap">
        {/* Header */}
        <header className="ia-head">
          <div>
            <div className="ia-kicker">AGENT × AGENT</div>
            <h1 className="ia-title">The Interview Arena</h1>
          </div>
          <div className="ia-status">
            <span className="ia-dot" style={{ background: statusMeta[1] }} />
            <span>{statusMeta[0]}</span>
            <span className="ia-count">
              {transcript.length}/{maxTurns}
            </span>
          </div>
        </header>

        {/* Setup */}
        <section className={`ia-panel ${setupOpen ? "open" : ""}`}>
          <button className="ia-panel-head" onClick={() => setSetupOpen((v) => !v)}>
            <SlidersHorizontal size={14} />
            <span>Interview setup</span>
            <ChevronDown size={15} className="ia-chev" />
          </button>
          {setupOpen && (
            <div className="ia-panel-body">
              <div className="ia-grid">
                <label className="ia-field">
                  <span><Briefcase size={12} /> Role</span>
                  <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Director of R&D" />
                </label>
                <label className="ia-field">
                  <span><Building2 size={12} /> Company</span>
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Visa, DNV…" />
                </label>
                <label className="ia-field">
                  <span>Interviewer style</span>
                  <select value={style} onChange={(e) => setStyle(e.target.value)}>
                    {Object.keys(STYLES).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <label className="ia-field">
                <span>Candidate profile <em>— this is what your bot knows about you</em></span>
                <textarea value={profile} onChange={(e) => setProfile(e.target.value)} rows={9} />
              </label>
            </div>
          )}
        </section>

        {/* Stage */}
        <section className="ia-stage" ref={stageRef}>
          {transcript.length === 0 && !busy && (
            <div className="ia-empty">
              <div className="ia-empty-mark">⚇</div>
              <p>Two agents, one conversation.</p>
              <p className="ia-empty-sub">
                The <b style={{ color: "var(--int)" }}>Interviewer</b> screens your{" "}
                <b style={{ color: "var(--cand)" }}>Candidate</b> bot for the role above.
                Hit <b>Run</b> to watch them go, or <b>Step</b> one turn at a time.
              </p>
            </div>
          )}

          {transcript.map((m) => (
            <div key={m.id} className={`ia-row ${m.role}`}>
              <div className="ia-avatar">{m.role === "interviewer" ? "I" : "C"}</div>
              <div className="ia-bubble">
                <div className="ia-name">{m.role === "interviewer" ? "Interviewer" : "Candidate"}</div>
                <div className="ia-text">{m.text}</div>
              </div>
            </div>
          ))}

          {busy && (
            <div className={`ia-row ${generating}`}>
              <div className="ia-avatar">{generating === "interviewer" ? "I" : "C"}</div>
              <div className="ia-bubble">
                <div className="ia-name">{generating === "interviewer" ? "Interviewer" : "Candidate"}</div>
                <div className="ia-typing"><span /><span /><span /></div>
              </div>
            </div>
          )}
        </section>

        {error && (
          <div className="ia-error"><AlertTriangle size={14} /> {error}</div>
        )}

        {/* Controls */}
        <footer className="ia-controls">
          <div className="ia-btns">
            {mode === "running" ? (
              <button className="ia-btn primary" onClick={pause}><Pause size={15} /> Pause</button>
            ) : (
              <button className="ia-btn primary" onClick={autoRun} disabled={busy || atCap}>
                <Play size={15} /> {transcript.length ? "Resume" : "Run"}
              </button>
            )}
            <button className="ia-btn" onClick={step} disabled={busy || mode === "running" || atCap}>
              <StepForward size={15} /> Step
            </button>
            <button className="ia-btn" onClick={reset} disabled={busy && mode === "running"}>
              <RotateCcw size={15} /> Reset
            </button>
            <button className="ia-btn" onClick={copyTranscript} disabled={!transcript.length}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="ia-knobs">
            <label>
              Length
              <select value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))}>
                <option value={6}>Short</option>
                <option value={12}>Medium</option>
                <option value={20}>Long</option>
              </select>
            </label>
            <label>
              Pace
              <select value={speed} onChange={(e) => setSpeed(e.target.value)}>
                {Object.keys(SPEEDS).map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </footer>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap');
.ia-root{
  --bg:#0a0c11; --bg2:#11141d; --bg3:#161a25;
  --line:rgba(255,255,255,.08); --line2:rgba(255,255,255,.14);
  --text:#e8e5db; --muted:#878d9c;
  --int:#56cfe1; --cand:#e7a94e; --ok:#7bd88f; --err:#ef6b6b;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --serif:'Newsreader',Georgia,serif;
  position:relative; min-height:100%; background:
    radial-gradient(900px 500px at 12% -10%, rgba(86,207,225,.10), transparent 60%),
    radial-gradient(900px 500px at 100% 110%, rgba(231,169,78,.10), transparent 60%),
    var(--bg);
  color:var(--text); font-family:var(--mono); padding:22px;
}
.ia-grain{position:absolute; inset:0; pointer-events:none; opacity:.4;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");}
.ia-wrap{position:relative; max-width:820px; margin:0 auto; display:flex; flex-direction:column; gap:16px;}

.ia-head{display:flex; justify-content:space-between; align-items:flex-end; gap:12px;}
.ia-kicker{font-size:10px; letter-spacing:.34em; color:var(--muted); font-weight:700;}
.ia-title{font-family:var(--serif); font-weight:500; font-size:34px; line-height:1; margin:6px 0 0; letter-spacing:-.01em;}
.ia-status{display:flex; align-items:center; gap:8px; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted);}
.ia-dot{width:8px; height:8px; border-radius:50%; box-shadow:0 0 12px currentColor;}
.ia-count{font-variant-numeric:tabular-nums; padding-left:6px; border-left:1px solid var(--line);}

.ia-panel{background:var(--bg2); border:1px solid var(--line); border-radius:12px;}
.ia-panel-head{width:100%; display:flex; align-items:center; gap:9px; padding:12px 15px; background:none; border:0; color:var(--text); font-family:var(--mono); font-size:11px; letter-spacing:.16em; text-transform:uppercase; cursor:pointer;}
.ia-chev{margin-left:auto; transition:transform .25s; color:var(--muted);}
.ia-panel.open .ia-chev{transform:rotate(180deg);}
.ia-panel-body{padding:4px 15px 16px; display:flex; flex-direction:column; gap:13px;}
.ia-grid{display:grid; grid-template-columns:1fr 1fr 1fr; gap:11px;}
@media(max-width:640px){.ia-grid{grid-template-columns:1fr;}}
.ia-field{display:flex; flex-direction:column; gap:6px;}
.ia-field>span{font-size:10px; letter-spacing:.13em; text-transform:uppercase; color:var(--muted); display:flex; align-items:center; gap:5px;}
.ia-field>span em{font-style:italic; text-transform:none; letter-spacing:0; opacity:.8;}
.ia-field input,.ia-field select,.ia-field textarea{
  background:var(--bg3); border:1px solid var(--line); border-radius:8px; color:var(--text);
  font-family:var(--mono); font-size:13px; padding:9px 11px; outline:none; transition:border-color .18s;}
.ia-field textarea{font-family:var(--serif); font-size:14px; line-height:1.55; resize:vertical;}
.ia-field input:focus,.ia-field select:focus,.ia-field textarea:focus{border-color:var(--line2);}

.ia-stage{background:var(--bg2); border:1px solid var(--line); border-radius:14px; padding:18px; min-height:300px; max-height:46vh; overflow-y:auto; display:flex; flex-direction:column; gap:16px;}
.ia-empty{margin:auto; text-align:center; color:var(--muted); max-width:380px; padding:30px 0;}
.ia-empty-mark{font-size:40px; color:var(--text); opacity:.5; margin-bottom:10px;}
.ia-empty p{font-family:var(--serif); font-size:19px; color:var(--text); margin:0 0 8px;}
.ia-empty-sub{font-size:13px !important; line-height:1.6; color:var(--muted) !important; font-family:var(--mono) !important;}

.ia-row{display:flex; gap:11px; max-width:88%; animation:rise .4s ease both;}
.ia-row.candidate{flex-direction:row-reverse; align-self:flex-end;}
@keyframes rise{from{opacity:0; transform:translateY(8px);}to{opacity:1; transform:none;}}
.ia-avatar{flex:none; width:30px; height:30px; border-radius:8px; display:grid; place-items:center; font-size:12px; font-weight:700; margin-top:2px;}
.ia-row.interviewer .ia-avatar{background:rgba(86,207,225,.14); color:var(--int); border:1px solid rgba(86,207,225,.3);}
.ia-row.candidate .ia-avatar{background:rgba(231,169,78,.14); color:var(--cand); border:1px solid rgba(231,169,78,.3);}
.ia-bubble{border-radius:13px; padding:11px 14px; border:1px solid var(--line);}
.ia-row.interviewer .ia-bubble{background:linear-gradient(180deg,rgba(86,207,225,.07),rgba(86,207,225,.02)); border-top-left-radius:4px;}
.ia-row.candidate .ia-bubble{background:linear-gradient(180deg,rgba(231,169,78,.07),rgba(231,169,78,.02)); border-top-right-radius:4px;}
.ia-name{font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); margin-bottom:5px;}
.ia-row.interviewer .ia-name{color:var(--int);}
.ia-row.candidate .ia-name{color:var(--cand);}
.ia-text{font-family:var(--serif); font-size:15px; line-height:1.6; white-space:pre-wrap;}
.ia-typing{display:flex; gap:5px; padding:4px 0;}
.ia-typing span{width:6px; height:6px; border-radius:50%; background:var(--muted); animation:blink 1.2s infinite;}
.ia-typing span:nth-child(2){animation-delay:.2s;} .ia-typing span:nth-child(3){animation-delay:.4s;}
@keyframes blink{0%,60%,100%{opacity:.25;}30%{opacity:1;}}

.ia-error{display:flex; align-items:center; gap:8px; background:rgba(239,107,107,.1); border:1px solid rgba(239,107,107,.3); color:var(--err); padding:10px 13px; border-radius:9px; font-size:12px;}

.ia-controls{display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap;}
.ia-btns{display:flex; gap:8px; flex-wrap:wrap;}
.ia-btn{display:inline-flex; align-items:center; gap:7px; background:var(--bg2); border:1px solid var(--line2); color:var(--text); font-family:var(--mono); font-size:12px; letter-spacing:.04em; padding:10px 14px; border-radius:9px; cursor:pointer; transition:transform .12s, background .18s, opacity .18s;}
.ia-btn:hover:not(:disabled){background:var(--bg3); transform:translateY(-1px);}
.ia-btn:disabled{opacity:.4; cursor:not-allowed;}
.ia-btn.primary{background:var(--text); color:#0a0c11; border-color:var(--text); font-weight:700;}
.ia-btn.primary:hover:not(:disabled){background:#fff;}
.ia-knobs{display:flex; gap:14px;}
.ia-knobs label{display:flex; align-items:center; gap:7px; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted);}
.ia-knobs select{background:var(--bg3); border:1px solid var(--line); color:var(--text); font-family:var(--mono); font-size:12px; padding:7px 9px; border-radius:7px; outline:none;}
`;
