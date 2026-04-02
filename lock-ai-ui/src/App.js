import { useState, useEffect, useCallback } from "react";

const API = "https://plashiest-mercy-nonspaciously.ngrok-free.app";
const NGROK_HEADERS = { "ngrok-skip-browser-warning": "true" };

const STATE_DISPLAY = {
  "Open Lake to River":                       { headline: "OPEN LAKE TO RIVER",   subtitle: "Lock Empty" },
  "Open Lake to River — Vessels Entering":    { headline: "OPEN LAKE TO RIVER",   subtitle: "Vessels Entering Lock" },
  "Lock Sealed — About to Lock Toward River": { headline: "LOCK SEALED",          subtitle: "Preparing to lock toward river" },
  "Locking Toward River":                     { headline: "LOCKING TOWARD RIVER", subtitle: "Water level equalizing" },
  "Vessels Exiting Toward River":             { headline: "OPEN RIVER TO LAKE",   subtitle: "Vessels Exiting Lock" },
  "Open River to Lake":                       { headline: "OPEN RIVER TO LAKE",   subtitle: "Lock Empty" },
  "Open River to Lake — Vessels Entering":    { headline: "OPEN RIVER TO LAKE",   subtitle: "Vessels Entering Lock" },
  "Lock Sealed — About to Lock Toward Lake":  { headline: "LOCK SEALED",          subtitle: "Preparing to lock toward lake" },
  "Locking Toward Lake":                      { headline: "LOCKING TOWARD LAKE",  subtitle: "Water level equalizing" },
  "Vessels Exiting Toward Lake":              { headline: "OPEN LAKE TO RIVER",   subtitle: "Vessels Exiting Lock" },
  "Lock Closed":                              { headline: "LOCK CLOSED",          subtitle: "" },
  "Error — No Output":                        { headline: "ERROR",                subtitle: "No output from reasoning layer" },
};

const STATE_LOGIC = {
  "Open Lake to River":                          { offset: 25, text: "Locking expected to begin by" },
  "Open Lake to River — Vessels Entering":       { offset: 20, text: "Locking expected to begin by" },
  "Lock Sealed — About to Lock Toward River":    { offset: 5,  text: "Locking expected to begin by" },
  "Locking Toward River":                        { offset: 15, text: "Locking expected to finish by" },
  "Vessels Exiting Toward River":                { offset: 5,  text: "Next locking cycle expected to start by" },
  "Open River to Lake":                          { offset: 25, text: "Locking expected to begin by" },
  "Open River to Lake — Vessels Entering":       { offset: 20, text: "Locking expected to begin by" },
  "Lock Sealed — About to Lock Toward Lake":     { offset: 5,  text: "Locking expected to begin by" },
  "Locking Toward Lake":                         { offset: 15, text: "Locking expected to finish by" },
  "Vessels Exiting Toward Lake":                 { offset: 5,  text: "Next locking cycle expected to start by" },
};

const GATE_COLORS = {
  open:    "#10B981",
  closed:  "#EF4444",
  partial: "#F59E0B",
};

const WEATHER_COLORS = {
  Sunny:         "#F59E0B",
  Hazy:          "#94A3B8",
  Cloudy:        "#64748B",
  "Golden Hour": "#F97316",
  Rain:          "#38BDF8",
};

const WEATHER_ICONS = {
  Sunny:         "☀️",
  Hazy:          "🌫️",
  Cloudy:        "☁️",
  "Golden Hour": "🌅",
  Rain:          "🌧️",
};

const PIPELINE_STEPS = [
  { label: "Gate Classifier",   detail: "YOLOv8s-cls · 99.6% top-1 accuracy", delay: 0    },
  { label: "Boat Detection",    detail: "YOLOv8s-seg · 91.0% mAP50",          delay: 1000 },
  { label: "Orientation Model", detail: "YOLOv8s-cls · 99% top-1 accuracy",   delay: 2200 },
  { label: "Reasoning Layer",   detail: "Physics-based state fusion",          delay: 3500 },
];

const WEATHERS = ["All", "Sunny", "Hazy", "Cloudy", "Golden Hour", "Rain"];
const CARD_COLOR = "#3B82F6";
const START_MINUTES = 12 * 60;
const END_MINUTES   = 18 * 60;
const RANGE = END_MINUTES - START_MINUTES;

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return START_MINUTES;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return START_MINUTES;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function addMinutesToTime(timeStr, offsetMinutes) {
  const base = parseTimeToMinutes(timeStr);
  const total = base + offsetMinutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

function pctFromMinutes(minutes) {
  return Math.max(0, Math.min(100, ((minutes - START_MINUTES) / RANGE) * 100));
}

function confColor(conf) {
  if (conf >= 80) return "#10B981";
  if (conf >= 40) return "#F59E0B";
  return "#EF4444";
}

function getLogLineColor(line) {
  if (line.includes("[override]")) return "#F59E0B";
  if (line.includes("No overrides fired")) return "#10B981";
  if (line.includes("[1]") || line.includes("[2]") || line.includes("[2b]") ||
      line.includes("[2c]") || line.includes("[3]") || line.includes("[4]")) return "#38BDF8";
  if (line.includes("Final →")) return "#E8EAF0";
  if (line.includes("Majority vote:")) return "#A78BFA";
  if (line.includes("Detected:")) return "#34D399";
  if (line.includes("Skipped:")) return "#6B7280";
  if (line.trim().startsWith("─")) return "#1E2330";
  return "#6B7280";
}

function LockCycleDiagram() {
  return (
    <svg width="100%" viewBox="0 0 320 320" style={{ maxWidth: 420 }}>
      <defs>
        <marker id="carr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="#8cadd3" stroke-width="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </marker>
      </defs>
      <path d="M 204 72 Q 242 92 244 134" fill="none" stroke="#8cadd3" strokeWidth="1.5" markerEnd="url(#carr)"/>
      <path d="M 244 186 Q 242 228 204 248" fill="none" stroke="#8cadd3" strokeWidth="1.5" markerEnd="url(#carr)"/>
      <path d="M 116 248 Q 78 228 76 186" fill="none" stroke="#8cadd3" strokeWidth="1.5" markerEnd="url(#carr)"/>
      <path d="M 76 134 Q 78 92 116 72" fill="none" stroke="#8cadd3" strokeWidth="1.5" markerEnd="url(#carr)"/>
      <rect x="100" y="36" width="120" height="44" rx="8" fill="#233454" stroke="#8cadd3" strokeWidth="0.8"/>
      <text x="160" y="54" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">① Vessels Entering Lock</text>
      <text x="160" y="68" textAnchor="middle" fill="#ffffff" fontSize="8" opacity="0.6" fontFamily="Inter, sans-serif">One gate open, other closed</text>
      <rect x="228" y="138" width="82" height="44" rx="8" fill="#233454" stroke="#8cadd3" strokeWidth="0.8"/>
      <text x="269" y="156" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">② Lock Sealed</text>
      <text x="269" y="170" textAnchor="middle" fill="#ffffff" fontSize="8" opacity="0.6" fontFamily="Inter, sans-serif">Both gates closed</text>
      <rect x="84" y="240" width="152" height="44" rx="8" fill="#233454" stroke="#8cadd3" strokeWidth="0.8"/>
      <text x="160" y="258" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">③ Locking Toward River/Lake</text>
      <text x="160" y="272" textAnchor="middle" fill="#ffffff" fontSize="8" opacity="0.6" fontFamily="Inter, sans-serif">Water level equalizing</text>
      <rect x="10" y="138" width="82" height="44" rx="8" fill="#233454" stroke="#8cadd3" strokeWidth="0.8"/>
      <text x="51" y="156" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">④ Vessels Exiting</text>
      <text x="51" y="170" textAnchor="middle" fill="#ffffff" fontSize="8" opacity="0.6" fontFamily="Inter, sans-serif">Gate opens, exit</text>
      <text x="160" y="152" textAnchor="middle" fill="#8cadd3" fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif">Chicago Harbor</text>
      <text x="160" y="168" textAnchor="middle" fill="#8cadd3" fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif">Lock Cycle</text>
    </svg>
  );
}

function LoadingPanel() {
  const [activeSteps, setActiveSteps] = useState([]);
  useEffect(() => {
    const timers = PIPELINE_STEPS.map((step, i) =>
      setTimeout(() => setActiveSteps((prev) => [...prev, i]), step.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 20, padding: "8px 0" }}>
      <div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#38BDF8", letterSpacing: "0.01em" }}>Analyzing Image...</div>
        <div style={{ fontSize: 14, color: "#6B7280", fontWeight: 500, marginTop: 6 }}>Running 4-model pipeline</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
        {PIPELINE_STEPS.map((step, i) => {
          const isActive = activeSteps.includes(i);
          return (
            <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 14, opacity: isActive ? 1 : 0.2, transition: "opacity 0.6s ease" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: isActive ? "#38BDF8" : "#2A3040", boxShadow: isActive ? "0 0 10px #38BDF8AA" : "none", flexShrink: 0, transition: "all 0.6s ease" }} />
              <div>
                <div style={{ fontSize: 15, color: "#E8EAF0", fontWeight: 700 }}>{step.label}</div>
                <div style={{ fontSize: 11, color: "#4B5563", marginTop: 2 }}>{step.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CapacityDot({ label, count }) {
  const filled = Math.min(count, 6);
  const color = count === 0 ? "#1E2330" : count <= 2 ? "#10B981" : count <= 5 ? "#F59E0B" : "#EF4444";
  const textColor = count === 0 ? "#3A4050" : count <= 2 ? "#10B981" : count <= 5 ? "#F59E0B" : "#EF4444";
  const labelText = count === 0 ? "Empty" : `${count} vessel${count !== 1 ? "s" : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: i < filled ? color : "#1A1D24", boxShadow: i < filled ? `0 0 4px ${color}60` : "none", transition: "all 0.3s" }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: textColor, textTransform: "uppercase", fontWeight: 600 }}>
        {labelText}
      </div>
    </div>
  );
}

function DotTimeline({ images, selectedImage, weatherFilter, onSelect }) {
  const [tooltip, setTooltip] = useState(null);
  return (
    <div style={{ padding: "0 4px" }}>
      <div style={{ position: "relative", height: 40, marginBottom: 4 }}>
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#1E2330", transform: "translateY(-50%)" }} />
        {[12, 13, 14, 15, 16, 17, 18].map((h) => (
          <div key={h} style={{ position: "absolute", left: `${pctFromMinutes(h * 60)}%`, top: "50%", transform: "translate(-50%, -50%)", width: 1, height: 8, background: "#1E2330" }} />
        ))}
        {images.map((img) => {
          const t = parseTimeToMinutes(img.time);
          const pct = pctFromMinutes(t);
          const isSelected = selectedImage?.filename === img.filename;
          const isFiltered = weatherFilter !== "All" && img.weather !== weatherFilter;
          const wColor = WEATHER_COLORS[img.weather] || "#6B7280";
          return (
            <div key={img.filename} onClick={() => !isFiltered && onSelect(img)} onMouseEnter={() => setTooltip({ img, pct })} onMouseLeave={() => setTooltip(null)}
              style={{ position: "absolute", left: `${pct}%`, top: "50%", transform: "translate(-50%, -50%)", width: isSelected ? 14 : 8, height: isSelected ? 14 : 8, borderRadius: "50%", background: isFiltered ? "#1A1D24" : isSelected ? "#fff" : wColor, border: isSelected ? `3px solid ${wColor}` : "none", boxShadow: isSelected ? `0 0 10px ${wColor}80` : isFiltered ? "none" : `0 0 4px ${wColor}60`, cursor: isFiltered ? "default" : "pointer", transition: "all 0.2s", zIndex: isSelected ? 10 : 3 }}
            />
          );
        })}
        {tooltip && (
          <div style={{ position: "absolute", left: `${Math.min(Math.max(tooltip.pct, 8), 92)}%`, bottom: "calc(50% + 12px)", transform: "translateX(-50%)", background: "#1A1D24", border: "1px solid #2A3040", borderRadius: 5, padding: "5px 9px", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 50 }}>
            <div style={{ fontSize: 10, color: "#38BDF8" }}>{tooltip.img.time}</div>
            <div style={{ fontSize: 11, color: WEATHER_COLORS[tooltip.img.weather] || "#6B7280", marginTop: 1 }}>{tooltip.img.weather}</div>
          </div>
        )}
      </div>
      <div style={{ position: "relative", height: 14 }}>
        {[12, 15, 18].map((h) => (
          <span key={h} style={{ position: "absolute", left: `${pctFromMinutes(h * 60)}%`, transform: "translateX(-50%)", fontSize: 9, color: "#3A4050" }}>
            {h === 12 ? "12 PM" : h === 15 ? "3 PM" : "6 PM"}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        {Object.entries(WEATHER_COLORS).map(([w, c]) => {
          const count = images.filter((i) => i.weather === w).length;
          if (count === 0) return null;
          return (
            <div key={w} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: c, boxShadow: `0 0 4px ${c}60` }} />
              <span style={{ fontSize: 10, color: "#3A4050" }}>{w}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GateRow({ label, state, rawState, conf, wasOverridden, isLast }) {
  const gateColor = GATE_COLORS[state] || "#6B7280";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: isLast ? "none" : "1px solid #1A1D24" }}>
      <div style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 500 }}>{label}</div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>
        {wasOverridden ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: confColor(conf || 50) }}>{rawState} {conf ? `(${conf}%)` : ""}</span>
            <span style={{ color: "#F59E0B", fontSize: 12 }}>→</span>
            <span style={{ fontSize: 11, color: "#F59E0B" }}>{state}</span>
            <span style={{ fontSize: 10, background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B30", borderRadius: 3, padding: "1px 6px" }}>OVERRIDE</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ background: `${gateColor}20`, color: gateColor, border: `1px solid ${gateColor}50`, borderRadius: 4, padding: "4px 14px", fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>{state}</span>
            {conf && <span style={{ fontSize: 11, color: confColor(conf) }}>{conf}% confidence</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function InferenceLog({ log }) {
  if (!log || log.length === 0) return null;
  const overrideCount = log.filter(l => l.includes("[override]")).length;
  const hasOverrides = overrideCount > 0;

  return (
    <div style={{ background: "#111318", border: "1px solid #1E2330", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#E8EAF0" }}>Inference Log</div>
        {hasOverrides && (
          <span style={{ fontSize: 10, background: "#F59E0B12", color: "#F59E0B", border: "1px solid #F59E0B30", borderRadius: 3, padding: "2px 8px", fontFamily: "monospace" }}>
            {overrideCount} OVERRIDE{overrideCount > 1 ? "S" : ""}
          </span>
        )}
      </div>
      <div style={{ borderTop: "1px solid #1A1D24", background: "#080A0D", padding: "16px 20px" }}>
        <pre style={{ margin: 0, fontFamily: "'Space Mono', monospace", fontSize: 11, lineHeight: 1.8 }}>
          {log.map((line, i) => (
            <div key={i} style={{ color: getLogLineColor(line), whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {line}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

export default function App() {
  const [images, setImages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(null);
  const [weatherFilter, setWeatherFilter] = useState("All");

  useEffect(() => {
    fetch(`${API}/images`, { headers: NGROK_HEADERS })
      .then((r) => r.json())
      .then((d) => {
        const imgs = d.images || [];
        setImages(imgs);
        if (imgs.length > 0) setSelected(imgs[0]);
      })
      .catch(() => setError("Cannot connect to backend. Make sure python3 api.py is running on port 8000."));
  }, []);

  const filteredImages = images
    .filter((img) => weatherFilter === "All" || img.weather === weatherFilter)
    .sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

  const runInference = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const t0 = performance.now();
    try {
      const r = await fetch(`${API}/infer/${encodeURIComponent(selected.filename)}`, { headers: NGROK_HEADERS });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      await new Promise((resolve) => setTimeout(resolve, 5000));
      setResult(data);
      setElapsed(((performance.now() - t0) / 1000).toFixed(1));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [selected]);

  const navigate = (dir) => {
    if (!filteredImages.length) return;
    const idx = filteredImages.findIndex((i) => i.filename === selected?.filename);
    const next = (idx + dir + filteredImages.length) % filteredImages.length;
    setSelected(filteredImages[next]);
    setResult(null);
  };

  const lakeOverridden = result && result.raw_lake_gate !== result.lake_gate;
  const riverOverridden = result && result.raw_river_gate !== result.river_gate;
  const stateLogic = result ? STATE_LOGIC[result.state] : null;
  const logicTime = stateLogic && selected ? addMinutesToTime(selected.time, stateLogic.offset) : null;
  const stateDisplay = result ? (STATE_DISPLAY[result.state] || { headline: result.state.toUpperCase(), subtitle: "" }) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0A0C10", color: "#E8EAF0", fontFamily: "'Inter', sans-serif" }}>

      {/* ── INTRO BLOCK ── */}
      <div style={{ borderBottom: "1px solid #1A1D24", padding: "20px 32px 24px", background: "#0D0F14" }}>
        <div style={{ marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#38BDF8", letterSpacing: "-0.01em", lineHeight: 1 }}>Chicago Harbor Lock AI Project</div>
          <div style={{ fontSize: 13, color: "#4B5563", marginTop: 6, fontWeight: 400 }}>Real-time lock state detection — Proof of Concept</div>
        </div>

        {/* Text + cycle diagram side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "60% 40%", gap: 32, marginTop: 16, marginBottom: -16, alignItems: "flex-start" }}>
          <div>
            <p style={{ fontSize: 14, color: "#C4C9D4", lineHeight: 1.75, marginTop: 30, marginBottom: 14, fontWeight: 400 }}>
              A boat captain planning a trip through the Chicago Harbor Lock has no easy way to know at a glance whether the lock is open, closed, or which direction the current cycle is moving without physically going to the site. This lock connects the Chicago River and Lake Michigan, handling more than 80,000 vessels and 900,000 passengers each year. On busy days, up to 100 vessels pass through, leaving captains with little visibility into lock status, wait times, or when the next cycle will begin. This can lead to hours of unexpected delays for both recreational and commercial vessels.
            </p>
            <p style={{ fontSize: 14, color: "#C4C9D4", lineHeight: 1.75, marginBottom: 14, fontWeight: 400 }}>
              Chicago Lock AI is a proof of concept built to change that. A 4 model multimodal computer vision system analyzes a single aerial image from a fixed camera view to detect the current lock state, including gate position, vessel count, and direction of travel.
            </p>
            <p style={{ fontSize: 14, color: "#C4C9D4", lineHeight: 1.75, marginBottom: 0, fontWeight: 400 }}>
              The system was trained on 1,147 synthetic aerial images with 6,070 annotations across 5 weather conditions. The images shown in this demo were created as a held out evaluation set to test model performance.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", marginTop: -36, transform: "scale(0.9)", transformOrigin: "top center" }}>
            <LockCycleDiagram />
          </div>
        </div>

        <div style={{ borderTop: "1px solid #1A1D24", paddingTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div>
            <div style={{ fontSize: 12, color: "#E8EAF0", fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>How to Use</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                "Select an image from the panel on the left",
                <>Click <strong style={{ color: "#E8EAF0" }}>Run Lock State Detection</strong></>
              ].map((text, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1A1D24", border: "1px solid #2A3040", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "#38BDF8", fontWeight: 700 }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#9CA3AF" }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#E8EAF0", fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>What's Next</div>
            <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.65, margin: 0 }}>
              Phase 2 will focus on working with the Army Corps of Engineers to obtain approval to train on real world data and conditions, collect additional images, and support live deployment with predictive lock duration analytics.
            </p>
          </div>
        </div>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div style={{ display: "grid", gridTemplateColumns: "40% 60%", minHeight: "calc(100vh - 108px)" }}>

        {/* ── LEFT ── */}
        <div style={{ borderRight: "1px solid #1A1D24", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1A1D24", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13, color: "#E8EAF0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Select Image</div>
            <div>
              <div style={{ fontSize: 11, color: "#3A4050", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>Weather</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {WEATHERS.map((w) => {
                  const isActive = weatherFilter === w;
                  const color = w === "All" ? "#6B7280" : WEATHER_COLORS[w];
                  const icon = WEATHER_ICONS[w] || "";
                  return (
                    <button key={w} onClick={() => setWeatherFilter(w)}
                      style={{ padding: "5px 11px", borderRadius: 4, border: `1px solid ${isActive ? color : "#1E2330"}`, background: isActive ? `${color}20` : "transparent", color: isActive ? color : "#4B5563", fontFamily: "'Inter', sans-serif", fontSize: 12, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}
                    >
                      {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
                      {w}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#3A4050", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>Time of Day — click a dot to select</div>
              <DotTimeline images={images} selectedImage={selected} weatherFilter={weatherFilter} onSelect={(img) => { setSelected(img); setResult(null); }} />
            </div>
          </div>

          <div style={{ padding: "8px 16px", borderBottom: "1px solid #1A1D24", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#3A4050" }}>{filteredImages.length} of {images.length} images</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => navigate(-1)} style={{ padding: "5px 12px", background: "#111318", border: "1px solid #1E2330", borderRadius: 4, color: "#6B7280", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 12 }}>← Prev</button>
              <button onClick={() => navigate(1)} style={{ padding: "5px 12px", background: "#111318", border: "1px solid #1E2330", borderRadius: 4, color: "#6B7280", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 12 }}>Next →</button>
            </div>
          </div>

          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1A1D24" }}>
            <button onClick={runInference} disabled={loading || !selected}
              style={{ width: "100%", padding: "13px", background: loading ? "#1A1D24" : "#38BDF8", color: loading ? "#6B7280" : "#0A0C10", border: "none", borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.02em", transition: "all 0.15s" }}
            >
              {loading ? "Running inference..." : "Run Lock State Detection"}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {filteredImages.map((img) => {
                const isSelected = selected?.filename === img.filename;
                const wColor = WEATHER_COLORS[img.weather] || "#6B7280";
                return (
                  <button key={img.filename} onClick={() => { setSelected(img); setResult(null); }}
                    style={{ background: "#0A0C10", border: `2px solid ${isSelected ? "#38BDF8" : "#1A1D24"}`, borderRadius: 7, padding: 0, cursor: "pointer", overflow: "hidden", position: "relative", aspectRatio: "3/2", transition: "border-color 0.15s" }}
                  >
                    <img src={img.thumbnail_url} alt={img.time} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#0A0C10", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.88))", padding: "14px 7px 6px" }}>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: isSelected ? "#38BDF8" : "#E8EAF0", textAlign: "center", fontWeight: isSelected ? 700 : 400 }}>{img.time}</div>
                    </div>
                    <div style={{ position: "absolute", top: 5, left: 5, width: 6, height: 6, borderRadius: "50%", background: wColor, boxShadow: `0 0 4px ${wColor}` }} />
                    {isSelected && <div style={{ position: "absolute", top: 5, right: 5, width: 6, height: 6, borderRadius: "50%", background: "#38BDF8" }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>

          {error && (
            <div style={{ background: "#1A0A0A", border: "1px solid #EF4444", borderRadius: 8, padding: "14px 18px", color: "#F87171", fontSize: 14 }}>⚠ {error}</div>
          )}

          {!result && !loading && !error && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: 0.25, paddingTop: 80 }}>
              <div style={{ fontSize: 14, color: "#6B7280" }}>Select an image and run detection</div>
            </div>
          )}

          {loading && <LoadingPanel />}

          {result && stateDisplay && (
            <>
              {/* ── STATE CARD ── */}
              <div style={{ background: `${CARD_COLOR}0D`, border: `1px solid ${CARD_COLOR}40`, borderRadius: 12, overflow: "hidden" }}>
                {selected?.image_url && (
                  <div style={{ width: "100%", background: "#0A0C10", borderBottom: `1px solid ${CARD_COLOR}25` }}>
                    <img src={selected.image_url} alt="Selected lock view" style={{ width: "100%", height: "auto", maxHeight: 400, objectFit: "contain", display: "block" }} />
                  </div>
                )}
                <div style={{ padding: "22px 24px" }}>
                  <div style={{ fontSize: 11, color: CARD_COLOR, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Predicted Lock State</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 32, fontWeight: 800, color: "#E8EAF0", lineHeight: 1.15, textTransform: "uppercase", letterSpacing: "0.01em" }}>{stateDisplay.headline}</div>
                      {stateDisplay.subtitle && <div style={{ fontSize: 22, fontWeight: 600, color: "#9CA3AF", lineHeight: 1.2, marginTop: 8 }}>{stateDisplay.subtitle}</div>}
                      {selected?.time && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6, fontWeight: 500 }}>{selected.time}</div>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 24 }}>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 36, fontWeight: 700, lineHeight: 1, color: result.confidence >= 90 ? "#34D399" : result.confidence >= 75 ? "#FBBF24" : "#F87171" }}>{result.confidence}%</div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Overall confidence</div>
                      <div style={{ marginTop: 8 }}>
                        {result.is_clean ? (
                          <span style={{ fontSize: 10, background: "#34D39912", color: "#34D399", border: "1px solid #34D39930", borderRadius: 3, padding: "2px 8px", fontFamily: "monospace" }}>CLEAN — NO OVERRIDES</span>
                        ) : (
                          <span style={{ fontSize: 10, background: "#F59E0B12", color: "#F59E0B", border: "1px solid #F59E0B30", borderRadius: 3, padding: "2px 8px", fontFamily: "monospace" }}>
                            {result.override_count} PHYSICS OVERRIDE{result.override_count > 1 ? "S" : ""}
                          </span>
                        )}
                      </div>
                      {elapsed && <div style={{ marginTop: 5, fontSize: 10, color: "#6B7280", fontWeight: 500 }}>{elapsed}s</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", background: "#0E1116", borderRadius: 8, padding: "14px 20px", margin: "16px 0 14px", justifyContent: "space-around" }}>
                    <CapacityDot label="Chamber" count={result.chamber_count} />
                    <div style={{ width: 1, background: "#1A1D24" }} />
                    <CapacityDot label="Lake Side" count={result.lake_side_count} />
                    <div style={{ width: 1, background: "#1A1D24" }} />
                    <CapacityDot label="River Side" count={result.river_side_count} />
                  </div>
                  {stateLogic && logicTime && (
                    <div style={{ background: `${CARD_COLOR}12`, border: `1px solid ${CARD_COLOR}30`, borderRadius: 6, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: CARD_COLOR, flexShrink: 0 }} />
                      <span style={{ fontSize: 15, color: "#C4C9D4", fontWeight: 500 }}>
                        {stateLogic.text}{" "}
                        <strong style={{ color: CARD_COLOR, fontFamily: "'Space Mono', monospace", fontSize: 15 }}>{logicTime}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── GATE CLASSIFIER ── */}
              <div style={{ background: "#111318", border: "1px solid #1E2330", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#E8EAF0", marginBottom: 3 }}>Gate Classifier</div>
                <div style={{ fontSize: 12, color: "#3A4050", marginBottom: 16 }}>Model 1 — YOLOv8s-cls · 99.6% top-1 accuracy</div>
                <GateRow label="Lake Gate" state={result.lake_gate} rawState={result.raw_lake_gate} conf={result.lake_conf} wasOverridden={lakeOverridden} isLast={false} />
                <GateRow label="River Gate" state={result.river_gate} rawState={result.raw_river_gate} conf={result.river_conf} wasOverridden={riverOverridden} isLast={true} />
              </div>

              {/* ── VESSEL COUNT & ORIENTATION ── */}
              <div style={{ background: "#111318", border: "1px solid #1E2330", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#E8EAF0", marginBottom: 3 }}>Vessel Count & Orientation</div>
                <div style={{ fontSize: 12, color: "#3A4050", marginBottom: 16 }}>Models 2 & 3 — YOLOv8s-seg · YOLOv8s-cls · COCO pretrained</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 600 }}>Boat Detection Model</div>
                    {[
                      { label: "Lock Chamber", count: result.chamber_count, note: result.chamber_failsafe ? "COCO failsafe" : null },
                      { label: "Lake Side", count: result.lake_side_count, note: "Waiting + approaching" },
                      { label: "River Side", count: result.river_side_count, note: "Waiting + approaching" },
                    ].map(({ label, count, note }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1A1D24" }}>
                        <div>
                          <div style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 500 }}>{label}</div>
                          {note && <div style={{ fontSize: 10, color: "#F59E0B80", marginTop: 2 }}>{note}</div>}
                        </div>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: count === 0 ? "#1E2330" : "#E8EAF0" }}>{count}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 600 }}>Orientation Model Inference</div>
                    {result.direction ? (
                      <>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: "#E8EAF0", marginBottom: 6 }}>
                          {result.direction === "toward_river" ? "→ Toward River" : "← Toward Lake"}
                        </div>
                        <div style={{ fontSize: 13, color: "#4B5563", marginBottom: 14 }}>
                          {result.toward_river_count + result.toward_lake_count} vessel{result.toward_river_count + result.toward_lake_count !== 1 ? "s" : ""} classified
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <div style={{ flex: 1, background: "#0E1116", borderRadius: 6, padding: "10px", textAlign: "center" }}>
                            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: result.direction === "toward_river" ? "#10B981" : "#2A3040" }}>{result.toward_river_count}</div>
                            <div style={{ fontSize: 11, color: "#3A4050", marginTop: 2 }}>→ River</div>
                          </div>
                          <div style={{ flex: 1, background: "#0E1116", borderRadius: 6, padding: "10px", textAlign: "center" }}>
                            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: result.direction === "toward_lake" ? "#38BDF8" : "#2A3040" }}>{result.toward_lake_count}</div>
                            <div style={{ fontSize: 11, color: "#3A4050", marginTop: 2 }}>← Lake</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: "#2A3040", marginTop: 8 }}>No vessels in lock zones</div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── INFERENCE LOG ── */}
              <InferenceLog log={result.inference_log} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
