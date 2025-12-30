import {useMemo, useState} from "react";

const phaseNames = ["Neutral", "Familiar", "Charged", "Intimate"] as const;
const proximityLabels = ["Distant", "Nearby", "Touching", "Intimate"] as const;

const heuristics = [
  {
    title: "Emotion Delta Watcher",
    detail: "Flags abrupt mood shifts and suggests softer transitions.",
  },
  {
    title: "Scene Carryover",
    detail: "Keeps track of location, time, and lingering vibes between turns.",
  },
  {
    title: "Phase Gate",
    detail: "Walks relationships through Neutral → Familiar → Charged → Intimate.",
  },
  {
    title: "Proximity Guard",
    detail: "Warns when jumping from far apart to touching without setup.",
  },
  {
    title: "Memory Scars",
    detail: "Logs confessions, rejections, and conflicts for later callbacks.",
  },
  {
    title: "Subtext Lens",
    detail: "Highlights hesitation, guarded interest, and pauses without blocking.",
  },
];

const sparkIdeas = [
  "Add a pause beat before a reveal.",
  "Let a glance linger instead of a sudden touch.",
  "Shift tone with a softer word choice.",
  "Remember the last conflict—let it color this scene.",
  "Stay Nearby before Touching; build that charge.",
  "Echo a previous line to show they're listening.",
];

export function Playground() {
  const [phase, setPhase] = useState(1);
  const [proximity, setProximity] = useState(1);
  const [intensity, setIntensity] = useState(45);
  const [idea, setIdea] = useState(() => sparkIdeas[0]);

  const phaseLabel = phaseNames[phase];
  const proximityLabel = proximityLabels[proximity];

  const vibe = useMemo(() => {
    if (intensity > 75) return "Tempest";
    if (intensity > 55) return "Electric";
    if (intensity > 35) return "Warm";
    if (intensity > 15) return "Tender";
    return "Calm";
  }, [intensity]);

  function randomizeIdea() {
    const next = sparkIdeas[Math.floor(Math.random() * sparkIdeas.length)];
    setIdea(next);
  }

  return (
    <div className="playground-shell" aria-label="Romance Realism playground">
      <div className="playground-bg" aria-hidden="true">
        <span className="heart h1" />
        <span className="heart h2" />
        <span className="heart h3" />
        <span className="glow g1" />
        <span className="glow g2" />
      </div>

      <header className="playground-hero">
        <div className="eyebrow">Romance Realism</div>
        <h1>Slow-burn, but playful.</h1>
        <p>Explore the guardrails that keep long-form roleplay emotionally coherent—without blocking creativity.</p>
        <div className="hero-actions">
          <button type="button" className="pill" onClick={randomizeIdea}>
            Shuffle cue
          </button>
          <div className="idea-chip" aria-live="polite">{idea}</div>
        </div>
      </header>

      <section className="playground-grid" aria-label="Feature highlights">
        {heuristics.map((h) => (
          <article key={h.title} className="glass-card">
            <div className="card-title">{h.title}</div>
            <p>{h.detail}</p>
          </article>
        ))}
      </section>

      <section className="playground-interact" aria-label="Interactive controls">
        <div className="control">
          <div className="label">Relationship phase</div>
          <div className="slider-row">
            <input
              aria-label="Relationship phase"
              type="range"
              min={0}
              max={phaseNames.length - 1}
              value={phase}
              onChange={(e) => setPhase(Number(e.target.value))}
            />
            <span className="badge">{phaseLabel}</span>
          </div>
          <p className="hint">Advance slowly: stack signals before jumping to the next phase.</p>
        </div>

        <div className="control">
          <div className="label">Proximity gate</div>
          <div className="slider-row">
            <input
              aria-label="Proximity gate"
              type="range"
              min={0}
              max={proximityLabels.length - 1}
              value={proximity}
              onChange={(e) => setProximity(Number(e.target.value))}
            />
            <span className="badge">{proximityLabel}</span>
          </div>
          <p className="hint">Stay one notch at a time; let touch earn its moment.</p>
        </div>

        <div className="control">
          <div className="label">Emotional intensity</div>
          <div className="slider-row">
            <input
              aria-label="Emotional intensity"
              type="range"
              min={0}
              max={100}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
            />
            <span className="badge vibe">{vibe}</span>
          </div>
          <p className="hint">Use this to visualize how abrupt shifts trigger whiplash notes.</p>
        </div>
      </section>

      <section className="playground-footer" aria-label="Footer notes">
        <div className="chip">Background-only guardrails</div>
        <div className="chip">No rewrites, only notes</div>
        <div className="chip">Built for slow-burn roleplay</div>
      </section>
    </div>
  );
}
