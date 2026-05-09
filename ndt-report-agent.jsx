import { useState, useRef } from "react";

const SYSTEM_PROMPT = `You are an expert NDT (Non-Destructive Testing) inspection report engineer. Convert raw inspection notes, field data, and observations into a structured, professional engineering report.

Your output MUST be a single valid JSON object with this exact structure:
{
  "reportTitle": "string",
  "reportNumber": "string (auto-generate like NDT-YYYY-XXXX)",
  "inspectionDate": "string",
  "method": "string (e.g. UT, RT, MT, PT, VT, ET)",
  "standard": "string (e.g. ASME V, AWS D1.1, API 570)",
  "component": "string",
  "location": "string",
  "inspector": "string (if mentioned, else 'Not Specified')",
  "equipment": ["string array of equipment used"],
  "scope": "string (1-2 sentence description of inspection scope)",
  "findings": [
    {
      "id": "F-001",
      "severity": "Critical | Major | Minor | Acceptable",
      "type": "string (defect type)",
      "location": "string",
      "dimensions": "string",
      "description": "string"
    }
  ],
  "overallResult": "ACCEPT | REJECT | CONDITIONAL ACCEPT",
  "recommendations": ["string array"],
  "nextInspectionDue": "string",
  "notes": "string (any additional technical notes)"
}

Rules:
- Extract ALL findings mentioned, even vague ones
- Assign severity based on standard NDT engineering judgment
- If info is missing, use reasonable engineering defaults or "Not Specified"
- Generate a plausible report number if none given
- Return ONLY the JSON object, no markdown, no preamble`;

const SEVERITY_CONFIG = {
  Critical: { color: "#ff3b3b", bg: "#1a0000", icon: "⬛" },
  Major: { color: "#ff8c00", bg: "#1a0800", icon: "🟧" },
  Minor: { color: "#ffd700", bg: "#1a1400", icon: "🟨" },
  Acceptable: { color: "#00e676", bg: "#001a06", icon: "🟩" },
};

const RESULT_CONFIG = {
  ACCEPT: { color: "#00e676", label: "ACCEPT", bg: "#00e67622" },
  REJECT: { color: "#ff3b3b", label: "REJECT", bg: "#ff3b3b22" },
  "CONDITIONAL ACCEPT": { color: "#ffd700", label: "CONDITIONAL", bg: "#ffd70022" },
};

const PLACEHOLDERS = [
  `UT inspection on 12" carbon steel pipe, 6mm wall. Grid scan done at weld HAZ zone 3. Found lamination at 45mm from weld centerline, 8x12mm. Porosity cluster at 120° position. Calibrated with V1 block. Inspector: J. Morales.`,
  `MT check on crane boom section. Dry powder method. Found linear indication 35mm long at weld toe, transverse orientation. Surface prep per NACE SP0178. Base metal thickness 25mm. Station 4B, upper chord.`,
  `PT on stainless vessel nozzle N3. Visible crack indications around 3 o'clock and 9 o'clock positions. Approx 15mm and 22mm lengths. Developer showed immediate bleed-out. Color contrast method used.`,
];

export default function NDTAgent() {
  const [rawInput, setRawInput] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [placeholder] = useState(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  const reportRef = useRef(null);

  const generateReport = async () => {
    if (!rawInput.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: rawInput }],
        }),
      });

      const data = await res.json();
      const text = data.content?.map((c) => c.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setReport(parsed);
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setError("Failed to parse report. Please check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setReport(null);
    setRawInput("");
    setError(null);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c10",
      color: "#c8d8e8",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      padding: "0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 2px; }
        textarea:focus { outline: none; }
        .scan-line {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,100,200,0.015) 2px, rgba(0,100,200,0.015) 4px);
          pointer-events: none; z-index: 0;
        }
        .grid-bg {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background-image: 
            linear-gradient(rgba(30,58,95,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,58,95,0.08) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none; z-index: 0;
        }
        @keyframes pulse-border {
          0%, 100% { border-color: #1e3a5f; }
          50% { border-color: #2a6099; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .report-section { animation: fade-in 0.4s ease forwards; }
        .gen-btn {
          background: linear-gradient(135deg, #0a3d6b, #1a6bb5);
          border: 1px solid #2a6099;
          color: #a8d4ff;
          padding: 14px 32px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: uppercase;
        }
        .gen-btn:hover:not(:disabled) { background: linear-gradient(135deg, #1a6bb5, #2a8de8); box-shadow: 0 0 20px rgba(42,144,232,0.3); }
        .gen-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .reset-btn {
          background: transparent;
          border: 1px solid #1e3a5f;
          color: #5a8ab0;
          padding: 14px 24px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 1px;
        }
        .reset-btn:hover { border-color: #2a6099; color: #8ab8d8; }
        .finding-card {
          border: 1px solid #1e3a5f;
          padding: 16px;
          margin-bottom: 10px;
          background: #0d1117;
          transition: border-color 0.2s;
        }
        .finding-card:hover { border-color: #2a6099; }
        .tag {
          display: inline-block;
          padding: 2px 8px;
          font-size: 10px;
          letter-spacing: 1.5px;
          font-weight: 600;
          text-transform: uppercase;
          border: 1px solid currentColor;
        }
      `}</style>

      <div className="scan-line" />
      <div className="grid-bg" />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 3, height: 32, background: "linear-gradient(180deg, #2a8de8, #0a3d6b)" }} />
            <div>
              <div style={{ fontSize: 10, letterSpacing: 4, color: "#2a6099", marginBottom: 4 }}>
                SYSTEM // NDT-AGENT v2.1
              </div>
              <h1 style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: 26,
                fontWeight: 600,
                color: "#e0f0ff",
                letterSpacing: -0.5,
              }}>
                NDT Inspection Report Generator
              </h1>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#3a6a8a", letterSpacing: 0.5, paddingLeft: 15 }}>
            Convert raw field notes into structured engineering reports
          </p>
        </div>

        {/* Input Panel */}
        {!report && (
          <div style={{ animation: "fade-in 0.5s ease" }}>
            <div style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, letterSpacing: 3, color: "#2a6099", textTransform: "uppercase" }}>
                ▶ Raw Inspection Data Input
              </span>
              <span style={{ fontSize: 10, color: "#1e3a5f" }}>{rawInput.length} chars</span>
            </div>

            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={placeholder}
              style={{
                width: "100%",
                minHeight: 200,
                background: "#0d1117",
                border: "1px solid #1e3a5f",
                color: "#a8c8e0",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 13,
                lineHeight: 1.7,
                padding: "20px",
                resize: "vertical",
                animation: "pulse-border 3s ease-in-out infinite",
              }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                className="gen-btn"
                onClick={generateReport}
                disabled={loading || !rawInput.trim()}
              >
                {loading ? "▶ PROCESSING..." : "▶ GENERATE REPORT"}
              </button>
              {rawInput && (
                <button className="reset-btn" onClick={() => setRawInput("")}>
                  CLEAR
                </button>
              )}
            </div>

            {error && (
              <div style={{
                marginTop: 16, padding: 12,
                border: "1px solid #ff3b3b44",
                background: "#1a000044",
                color: "#ff6b6b",
                fontSize: 12,
              }}>
                ⚠ {error}
              </div>
            )}

            {/* Tips */}
            <div style={{ marginTop: 40, borderTop: "1px solid #0e2030", paddingTop: 24 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#1e3a5f", marginBottom: 16 }}>
                ACCEPTED INPUT FORMATS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  ["Field Notes", "Raw handwritten-style observations from inspectors"],
                  ["Scan Data", "Thickness readings, coordinates, amplitude values"],
                  ["Defect Logs", "Indication type, size, orientation, severity"],
                ].map(([title, desc]) => (
                  <div key={title} style={{ padding: 14, border: "1px solid #0e2030", background: "#0a0e14" }}>
                    <div style={{ fontSize: 10, color: "#2a6099", letterSpacing: 2, marginBottom: 6 }}>{title}</div>
                    <div style={{ fontSize: 11, color: "#3a5a70", lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Report Output */}
        {report && (
          <div ref={reportRef} className="report-section">
            {/* Report Header */}
            <div style={{
              border: "1px solid #1e3a5f",
              background: "#0a0e14",
              padding: "24px 28px",
              marginBottom: 16,
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 3,
                background: "linear-gradient(90deg, #0a3d6b, #2a8de8, #0a3d6b)",
              }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: "#2a6099", marginBottom: 8 }}>
                    INSPECTION REPORT
                  </div>
                  <h2 style={{
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    fontSize: 20, fontWeight: 600, color: "#e0f0ff", marginBottom: 4,
                  }}>
                    {report.reportTitle}
                  </h2>
                  <div style={{ fontSize: 12, color: "#3a6a8a" }}>{report.reportNumber}</div>
                </div>

                {/* Overall Result Badge */}
                {report.overallResult && RESULT_CONFIG[report.overallResult] && (
                  <div style={{
                    padding: "10px 20px",
                    border: `2px solid ${RESULT_CONFIG[report.overallResult].color}`,
                    background: RESULT_CONFIG[report.overallResult].bg,
                    color: RESULT_CONFIG[report.overallResult].color,
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: 3,
                    textAlign: "center",
                  }}>
                    {RESULT_CONFIG[report.overallResult].label}
                  </div>
                )}
              </div>
            </div>

            {/* Meta Grid */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1,
              background: "#0e1520", marginBottom: 16, border: "1px solid #1e3a5f",
            }}>
              {[
                ["Method", report.method],
                ["Standard", report.standard],
                ["Date", report.inspectionDate],
                ["Component", report.component],
                ["Location", report.location],
                ["Inspector", report.inspector],
              ].map(([label, val]) => (
                <div key={label} style={{ padding: "14px 16px", background: "#0a0e14" }}>
                  <div style={{ fontSize: 9, letterSpacing: 2, color: "#1e3a5f", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#8ab8d8" }}>{val || "—"}</div>
                </div>
              ))}
            </div>

            {/* Scope */}
            <div style={{ border: "1px solid #1e3a5f", background: "#0a0e14", padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 9, letterSpacing: 3, color: "#2a6099", marginBottom: 8 }}>INSPECTION SCOPE</div>
              <p style={{ fontSize: 13, color: "#8ab8d8", lineHeight: 1.7 }}>{report.scope}</p>
            </div>

            {/* Equipment */}
            {report.equipment?.length > 0 && (
              <div style={{ border: "1px solid #1e3a5f", background: "#0a0e14", padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: "#2a6099", marginBottom: 12 }}>EQUIPMENT USED</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {report.equipment.map((eq, i) => (
                    <span key={i} className="tag" style={{ color: "#5a8ab0", borderColor: "#1e3a5f", fontSize: 11 }}>
                      {eq}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Findings */}
            {report.findings?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: "#2a6099", marginBottom: 12 }}>
                  FINDINGS — {report.findings.length} INDICATION{report.findings.length !== 1 ? "S" : ""}
                </div>
                {report.findings.map((f, i) => {
                  const sev = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.Acceptable;
                  return (
                    <div key={i} className="finding-card" style={{ borderLeft: `3px solid ${sev.color}`, background: sev.bg }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#3a6a8a", fontWeight: 600 }}>{f.id}</span>
                          <span className="tag" style={{ color: sev.color, borderColor: sev.color, fontSize: 9 }}>
                            {f.severity}
                          </span>
                          <span style={{ fontSize: 11, color: "#8ab8d8" }}>{f.type}</span>
                        </div>
                        <span style={{ fontSize: 11, color: "#3a6a8a" }}>{f.dimensions}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#5a8ab0", marginBottom: 4 }}>
                        📍 {f.location}
                      </div>
                      <div style={{ fontSize: 12, color: "#7a9ab8", lineHeight: 1.6 }}>{f.description}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recommendations */}
            {report.recommendations?.length > 0 && (
              <div style={{ border: "1px solid #1e3a5f", background: "#0a0e14", padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: "#2a6099", marginBottom: 12 }}>RECOMMENDATIONS</div>
                {report.recommendations.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "#2a6099", fontSize: 12, marginTop: 1 }}>▸</span>
                    <span style={{ fontSize: 12, color: "#7a9ab8", lineHeight: 1.6 }}>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Footer Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <div style={{ border: "1px solid #1e3a5f", background: "#0a0e14", padding: "14px 18px" }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: "#1e3a5f", marginBottom: 4 }}>NEXT INSPECTION DUE</div>
                <div style={{ fontSize: 12, color: "#8ab8d8" }}>{report.nextInspectionDue || "—"}</div>
              </div>
              {report.notes && (
                <div style={{ border: "1px solid #1e3a5f", background: "#0a0e14", padding: "14px 18px" }}>
                  <div style={{ fontSize: 9, letterSpacing: 2, color: "#1e3a5f", marginBottom: 4 }}>TECHNICAL NOTES</div>
                  <div style={{ fontSize: 11, color: "#5a7a8a", lineHeight: 1.5 }}>{report.notes}</div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="gen-btn" onClick={reset}>▶ NEW REPORT</button>
              <button className="reset-btn" onClick={() => {
                const json = JSON.stringify(report, null, 2);
                navigator.clipboard.writeText(json);
              }}>
                COPY JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
