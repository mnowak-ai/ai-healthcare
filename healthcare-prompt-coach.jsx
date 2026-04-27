import { useState, useRef } from "react";

const SCENARIOS = [
  {
    id: 1,
    level: "Foundational",
    tag: "LEVEL 1",
    title: "Understanding Patient Symptoms",
    description: "A 52-year-old patient comes in reporting fatigue and elevated liver enzymes on a recent blood panel. Write a prompt to help an AI guide your initial symptom assessment.",
    hints: ["Include patient age and relevant vitals", "Mention specific symptoms and duration", "Ask for clarifying diagnostic questions"],
    systemContext: "You are a clinical decision-support AI helping a healthcare student assess patient symptoms. Respond as if helping a medical professional think through a case.",
  },
  {
    id: 2,
    level: "Intermediate",
    tag: "LEVEL 2",
    title: "Catching Drug Interactions",
    description: "A patient is on warfarin and their new cardiologist wants to add amiodarone. Write a prompt to help an AI surface potential drug interaction risks and monitoring needs.",
    hints: ["Name the specific drugs involved", "Mention the patient's condition", "Ask for monitoring protocols and risk severity"],
    systemContext: "You are a clinical pharmacology AI helping a healthcare student identify drug interactions. Be thorough about risks and monitoring requirements.",
  },
  {
    id: 3,
    level: "Advanced",
    tag: "LEVEL 3",
    title: "Designing a Care Plan",
    description: "A 68-year-old diabetic patient with CKD stage 3 needs a care plan. Write a prompt that helps an AI build a comprehensive plan while flagging over-testing risks.",
    hints: ["Include all relevant comorbidities", "Ask AI to flag contraindications", "Request prioritization of interventions"],
    systemContext: "You are a care coordination AI helping a healthcare student build a patient care plan. Balance thoroughness with clinical appropriateness and cost-effectiveness.",
  },
];

const RUBRIC = [
  { key: "context", label: "Clinical Context", desc: "Patient details, history, relevant vitals" },
  { key: "specificity", label: "Specificity", desc: "Precise medical terms, named conditions or drugs" },
  { key: "safety", label: "Safety Awareness", desc: "Flags risks, contraindications, monitoring needs" },
  { key: "clarity", label: "Clarity", desc: "Clear, unambiguous question structure" },
  { key: "bias", label: "Bias Awareness", desc: "Avoids leading assumptions, stays open-ended" },
];

function ScoreRing({ score, size = 56 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 55 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s cubic-bezier(.4,0,.2,1)" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: "rotate(90deg)", transformOrigin: `${size/2}px ${size/2}px`, fill: color, fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>
        {score}
      </text>
    </svg>
  );
}

function BarScore({ label, score }) {
  const color = score >= 80 ? "#10b981" : score >= 55 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 700, fontFamily: "monospace" }}>{score}%</span>
      </div>
      <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
      </div>
    </div>
  );
}

export default function App() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | response | analysis | improved
  const [clinicalResponse, setClinicalResponse] = useState("");
  const [analysisData, setAnalysisData] = useState(null);
  const [improvedPrompt, setImprovedPrompt] = useState("");
  const [improvedResponse, setImprovedResponse] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [showImproved, setShowImproved] = useState(false);
  const [earnedBadge, setEarnedBadge] = useState(false);
  const scenario = SCENARIOS[scenarioIdx];

  async function callClaude(messages, system) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages,
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || "";
  }

  async function handleSubmit() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setPhase("idle");
    setClinicalResponse("");
    setAnalysisData(null);
    setImprovedPrompt("");
    setImprovedResponse("");
    setShowImproved(false);
    setEarnedBadge(false);

    try {
      // Step 1: Clinical response
      const clinical = await callClaude(
        [{ role: "user", content: prompt }],
        scenario.systemContext
      );
      setClinicalResponse(clinical);
      setPhase("response");

      // Step 2: Prompt analysis
      const analysisRaw = await callClaude(
        [{
          role: "user",
          content: `You are an expert medical education coach evaluating a healthcare student's AI prompt quality.

SCENARIO: "${scenario.description}"
STUDENT'S PROMPT: "${prompt}"

Score each dimension 0-100 and give 1-2 sentence feedback. Also generate an improved version of the prompt.

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "scores": {
    "context": <0-100>,
    "specificity": <0-100>,
    "safety": <0-100>,
    "clarity": <0-100>,
    "bias": <0-100>
  },
  "overall": <0-100>,
  "feedback": {
    "context": "<feedback>",
    "specificity": "<feedback>",
    "safety": "<feedback>",
    "clarity": "<feedback>",
    "bias": "<feedback>"
  },
  "topStrength": "<one sentence>",
  "topGrowth": "<one sentence>",
  "improvedPrompt": "<rewritten prompt>"
}`
        }],
        "You are a medical education AI coach. Return only valid JSON."
      );

      let parsed;
      try {
        parsed = JSON.parse(analysisRaw.replace(/```json|```/g, "").trim());
      } catch {
        parsed = { scores: { context: 60, specificity: 60, safety: 60, clarity: 60, bias: 60 }, overall: 60, feedback: {}, topStrength: "Good attempt.", topGrowth: "Add more clinical detail.", improvedPrompt: prompt };
      }
      setAnalysisData(parsed);
      setImprovedPrompt(parsed.improvedPrompt || "");
      setPhase("analysis");
      if (parsed.overall >= 80) setEarnedBadge(true);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleShowImproved() {
    if (showImproved || !improvedPrompt) return;
    setShowImproved(true);
    const imp = await callClaude(
      [{ role: "user", content: improvedPrompt }],
      scenario.systemContext
    );
    setImprovedResponse(imp);
    setPhase("improved");
  }

  function resetScenario() {
    setPrompt(""); setPhase("idle"); setClinicalResponse("");
    setAnalysisData(null); setImprovedPrompt(""); setImprovedResponse("");
    setShowImproved(false); setEarnedBadge(false); setShowHints(false);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070d1a",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: "#e2e8f0",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #0c1a30 100%)",
        borderBottom: "1px solid #1e3a5f",
        padding: "20px 32px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "linear-gradient(135deg, #0ea5e9, #06b6d4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20,
        }}>⚕️</div>
        <div>
          <div style={{ fontSize: 11, color: "#0ea5e9", letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600 }}>AI Essentials · Healthcare Certification</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginTop: 2 }}>Clinical Prompt Lab</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {SCENARIOS.map((s, i) => (
            <button key={s.id} onClick={() => { setScenarioIdx(i); resetScenario(); }}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid",
                borderColor: i === scenarioIdx ? "#0ea5e9" : "#1e3a5f",
                background: i === scenarioIdx ? "rgba(14,165,233,0.15)" : "transparent",
                color: i === scenarioIdx ? "#0ea5e9" : "#64748b",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}>
              {s.tag}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        {/* Scenario Card */}
        <div style={{
          background: "linear-gradient(135deg, #0f2744 0%, #0c1f38 100%)",
          border: "1px solid #1e3a5f",
          borderRadius: 14, padding: "22px 28px", marginBottom: 24,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200, background: "radial-gradient(circle, rgba(14,165,233,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{
              background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.25)",
              borderRadius: 8, padding: "4px 10px",
              fontSize: 10, color: "#0ea5e9", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", whiteSpace: "nowrap", marginTop: 2,
            }}>{scenario.level}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>{scenario.title}</div>
              <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>{scenario.description}</div>
            </div>
          </div>
          <button onClick={() => setShowHints(!showHints)} style={{
            marginTop: 14, background: "none", border: "1px solid #1e3a5f",
            borderRadius: 6, padding: "5px 12px", color: "#64748b", fontSize: 11,
            cursor: "pointer", letterSpacing: "0.05em",
          }}>
            {showHints ? "▲ Hide Hints" : "▼ Show Hints"}
          </button>
          {showHints && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {scenario.hints.map((h, i) => (
                <div key={i} style={{
                  background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)",
                  borderRadius: 6, padding: "5px 12px", fontSize: 12, color: "#7dd3fc",
                }}>💡 {h}</div>
              ))}
            </div>
          )}
        </div>

        {/* Main 2-col layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* LEFT: Input + Clinical Response */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Prompt Input */}
            <div style={{
              background: "#0d1829", border: "1px solid #1e3a5f",
              borderRadius: 14, padding: 20,
            }}>
              <div style={{ fontSize: 11, color: "#0ea5e9", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Your Prompt</div>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Write your clinical AI prompt here..."
                style={{
                  width: "100%", minHeight: 140, background: "#070d1a",
                  border: "1px solid #1e3a5f", borderRadius: 8, padding: 14,
                  color: "#e2e8f0", fontSize: 13, lineHeight: 1.7,
                  resize: "vertical", fontFamily: "inherit", outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ fontSize: 11, color: "#334155" }}>{prompt.length} characters</span>
                <button onClick={handleSubmit} disabled={!prompt.trim() || loading}
                  style={{
                    padding: "10px 24px", borderRadius: 8,
                    background: prompt.trim() && !loading ? "linear-gradient(135deg, #0ea5e9, #06b6d4)" : "#1e3a5f",
                    border: "none", color: prompt.trim() && !loading ? "#fff" : "#334155",
                    fontSize: 13, fontWeight: 700, cursor: prompt.trim() && !loading ? "pointer" : "not-allowed",
                    letterSpacing: "0.03em", transition: "all 0.2s",
                  }}>
                  {loading ? "Analyzing..." : "Submit Prompt →"}
                </button>
              </div>
            </div>

            {/* Clinical Response */}
            {clinicalResponse && (
              <div style={{
                background: "#0d1829", border: "1px solid #1e3a5f",
                borderRadius: 14, padding: 20,
                animation: "fadeIn 0.5s ease",
              }}>
                <div style={{ fontSize: 11, color: "#10b981", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
                  🩺 Clinical AI Response
                </div>
                <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>{clinicalResponse}</div>
              </div>
            )}

            {/* Improved Side-by-Side */}
            {showImproved && improvedPrompt && (
              <div style={{
                background: "#0d1829", border: "1px solid rgba(16,185,129,0.3)",
                borderRadius: 14, padding: 20,
              }}>
                <div style={{ fontSize: 11, color: "#10b981", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>✨ Improved Prompt</div>
                <div style={{
                  background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
                  borderRadius: 8, padding: 12, fontSize: 13, color: "#6ee7b7", lineHeight: 1.7, marginBottom: 14,
                  fontStyle: "italic",
                }}>{improvedPrompt}</div>
                {improvedResponse && (
                  <>
                    <div style={{ fontSize: 11, color: "#10b981", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>↳ Improved AI Response</div>
                    <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>{improvedResponse}</div>
                  </>
                )}
                {!improvedResponse && <div style={{ fontSize: 12, color: "#64748b" }}>Loading improved response...</div>}
              </div>
            )}
          </div>

          {/* RIGHT: Analysis Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!analysisData && !loading && (
              <div style={{
                background: "#0d1829", border: "1px dashed #1e3a5f",
                borderRadius: 14, padding: 40, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 12, minHeight: 300,
              }}>
                <div style={{ fontSize: 40 }}>🔬</div>
                <div style={{ fontSize: 13, color: "#334155", textAlign: "center" }}>Submit your prompt to see<br />your analysis scorecard</div>
              </div>
            )}

            {loading && (
              <div style={{
                background: "#0d1829", border: "1px solid #1e3a5f",
                borderRadius: 14, padding: 40, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 16, minHeight: 300,
              }}>
                <div style={{ fontSize: 32, animation: "spin 1s linear infinite" }}>⚕️</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>Running clinical analysis...</div>
              </div>
            )}

            {analysisData && (
              <div style={{
                background: "#0d1829", border: "1px solid #1e3a5f",
                borderRadius: 14, padding: 22,
                animation: "fadeIn 0.5s ease",
              }}>
                <div style={{ fontSize: 11, color: "#0ea5e9", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 16 }}>Prompt Quality Analysis</div>

                {/* Overall Score */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, padding: "14px 16px", background: "#070d1a", borderRadius: 10 }}>
                  <ScoreRing score={analysisData.overall} size={64} />
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Overall Score</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", fontFamily: "monospace" }}>{analysisData.overall}<span style={{ fontSize: 13, color: "#64748b" }}>/100</span></div>
                    {earnedBadge && <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>🏅 Master Diagnostician Unlocked!</div>}
                  </div>
                </div>

                {/* Dimension Scores */}
                <div style={{ marginBottom: 18 }}>
                  {RUBRIC.map(r => (
                    <BarScore key={r.key} label={r.label} score={analysisData.scores?.[r.key] || 0} />
                  ))}
                </div>

                {/* Feedback */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, color: "#10b981", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>✓ Strength</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{analysisData.topStrength}</div>
                  </div>
                  <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>↑ Growth Area</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{analysisData.topGrowth}</div>
                  </div>
                </div>

                {/* Dimension feedback */}
                <div style={{ marginBottom: 18 }}>
                  {RUBRIC.map(r => analysisData.feedback?.[r.key] ? (
                    <div key={r.key} style={{ marginBottom: 8, padding: "8px 12px", background: "#070d1a", borderRadius: 8, borderLeft: "2px solid #1e3a5f" }}>
                      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{r.label}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{analysisData.feedback[r.key]}</div>
                    </div>
                  ) : null)}
                </div>

                {/* Show Improved Button */}
                {!showImproved && (
                  <button onClick={handleShowImproved}
                    style={{
                      width: "100%", padding: "11px", borderRadius: 8,
                      background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(6,182,212,0.15))",
                      border: "1px solid rgba(16,185,129,0.4)",
                      color: "#10b981", fontSize: 13, fontWeight: 700,
                      cursor: "pointer", letterSpacing: "0.03em",
                    }}>
                    ✨ Show Me an Improved Version
                  </button>
                )}
              </div>
            )}

            {/* Next scenario */}
            {analysisData && scenarioIdx < SCENARIOS.length - 1 && (
              <button onClick={() => { setScenarioIdx(s => s + 1); resetScenario(); }}
                style={{
                  padding: "11px", borderRadius: 8,
                  background: "transparent", border: "1px solid #1e3a5f",
                  color: "#64748b", fontSize: 12, cursor: "pointer",
                }}>
                Next Scenario → {SCENARIOS[scenarioIdx + 1].title}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        textarea:focus { border-color: #0ea5e9 !important; }
      `}</style>
    </div>
  );
}
