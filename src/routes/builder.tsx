import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/builder")({
  head: () => ({
    meta: [
      { title: "Fighter Builder — Ani Fighters" },
      { name: "description", content: "Build custom fighters, design skills with a timeline editor, save and share mods." },
    ],
  }),
  component: Builder,
});

// ---------------- Types ----------------
type AnimType = "melee" | "dash" | "projectile" | "aoe" | "buff" | "heal";
type EffectPreset =
  | "slash" | "ring" | "spark" | "flame" | "lightning"
  | "shock" | "smoke" | "burst" | "trail" | "shockwave"
  | "blackflash" | "crimson";

type Keyframe = {
  t: number;          // 0..1 normalized along skill duration
  kind: "startup" | "active" | "recovery" | "spawn-fx" | "spawn-projectile" | "damage" | "sound";
  payload?: string;   // effect preset / sound name / projectile type
  intensity?: number; // 0..1
};

type Skill = {
  id: string;
  name: string;
  anim: AnimType;
  damage: number;
  cooldown: number;
  range: number;
  projSpeed: number;
  duration: number;     // seconds, used by timeline
  effect: EffectPreset;
  color: string;        // hex
  sound: string;        // sound preset id
  passive: string;      // none|regen|thorns|berserk|lifesteal|reservoir
  timeline: Keyframe[];
};

type Fighter = {
  id: string;
  name: string;
  spriteDataUrl: string | null;
  hp: number;
  speed: number;
  defense: number;
  skills: Skill[];
};

type Mod = {
  version: 1;
  savedAt: number;
  fighters: Fighter[];
};

const STORAGE_KEY = "anif.mods.v1";
const ACTIVE_KEY = "anif.mods.active.v1";

const EFFECT_PRESETS: EffectPreset[] = [
  "slash", "ring", "spark", "flame", "lightning",
  "shock", "smoke", "burst", "trail", "shockwave",
  "blackflash", "crimson",
];

const SOUND_LIB = [
  "punch-hit", "punch-lunge", "knife-slash", "pistol", "throw-swing",
  "black-flash", "divergent-hit", "finishing-hit", "detroit-smash",
  "electricity", "sandevistan", "dismantle-1", "dismantle-2",
  "crack-the-whip", "spawn", "damage", "taunt", "angry", "chuckle",
] as const;

const PASSIVES = [
  { id: "none", label: "None" },
  { id: "regen", label: "Regen (1 HP/s)" },
  { id: "thorns", label: "Thorns (reflect 15%)" },
  { id: "berserk", label: "Berserk (<30% HP → +25% dmg)" },
  { id: "lifesteal", label: "Lifesteal (10%)" },
  { id: "reservoir", label: "Cursed Reservoir (combo empower)" },
];

const ANIM_TYPES: { id: AnimType; label: string }[] = [
  { id: "melee", label: "Melee Strike" },
  { id: "dash", label: "Dash Attack" },
  { id: "projectile", label: "Projectile" },
  { id: "aoe", label: "AOE Burst" },
  { id: "buff", label: "Self Buff" },
  { id: "heal", label: "Heal" },
];

// ---------------- Helpers ----------------
const uid = () => Math.random().toString(36).slice(2, 10);

function newSkill(name = "New Skill"): Skill {
  return {
    id: uid(),
    name,
    anim: "melee",
    damage: 20,
    cooldown: 3,
    range: 80,
    projSpeed: 600,
    duration: 0.6,
    effect: "slash",
    color: "#ff4d4d",
    sound: "punch-hit",
    passive: "none",
    timeline: [
      { t: 0.1, kind: "startup" },
      { t: 0.35, kind: "spawn-fx", payload: "slash", intensity: 0.8 },
      { t: 0.4, kind: "damage", intensity: 1 },
      { t: 0.45, kind: "sound", payload: "punch-hit" },
      { t: 0.8, kind: "recovery" },
    ],
  };
}

function newFighter(name = "Custom Fighter"): Fighter {
  return {
    id: uid(),
    name,
    spriteDataUrl: null,
    hp: 120,
    speed: 220,
    defense: 0,
    skills: [newSkill("Basic Punch"), newSkill("Special")],
  };
}

function loadMod(): Mod {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, savedAt: Date.now(), fighters: [newFighter()] };
    const parsed = JSON.parse(raw) as Mod;
    if (parsed.version !== 1 || !Array.isArray(parsed.fighters)) throw new Error("bad");
    return parsed;
  } catch {
    return { version: 1, savedAt: Date.now(), fighters: [newFighter()] };
  }
}

// ---------------- Component ----------------
function Builder() {
  const [mod, setMod] = useState<Mod>(() =>
    typeof window === "undefined"
      ? { version: 1, savedAt: Date.now(), fighters: [newFighter()] }
      : loadMod()
  );
  const [activeFighterId, setActiveFighterId] = useState<string>("");
  const [activeSkillId, setActiveSkillId] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const spriteRef = useRef<HTMLInputElement>(null);
  const [previewT, setPreviewT] = useState(0);
  const previewPlayingRef = useRef(false);

  useEffect(() => {
    if (!activeFighterId && mod.fighters[0]) setActiveFighterId(mod.fighters[0].id);
  }, [mod.fighters, activeFighterId]);

  const activeFighter = useMemo(
    () => mod.fighters.find((f) => f.id === activeFighterId) ?? null,
    [mod, activeFighterId]
  );
  const activeSkill = useMemo(
    () => activeFighter?.skills.find((s) => s.id === activeSkillId) ?? activeFighter?.skills[0] ?? null,
    [activeFighter, activeSkillId]
  );

  useEffect(() => {
    if (activeFighter && !activeFighter.skills.find((s) => s.id === activeSkillId)) {
      setActiveSkillId(activeFighter.skills[0]?.id ?? "");
    }
  }, [activeFighter, activeSkillId]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 1800);
  };

  // ---- Persistence ----
  const save = useCallback(() => {
    const payload = { ...mod, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(payload));
    flash("Saved to browser storage");
  }, [mod]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(mod, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anifighters-mod-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mod]);

  const importJson = useCallback((file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result)) as Mod;
        if (parsed.version !== 1 || !Array.isArray(parsed.fighters)) throw new Error();
        setMod(parsed);
        flash("Mod loaded");
      } catch {
        flash("Invalid mod file");
      }
    };
    r.readAsText(file);
  }, []);

  // ---- Fighter mutations ----
  const updateFighter = (fn: (f: Fighter) => Fighter) => {
    if (!activeFighter) return;
    setMod((m) => ({
      ...m,
      fighters: m.fighters.map((f) => (f.id === activeFighter.id ? fn(f) : f)),
    }));
  };

  const updateSkill = (fn: (s: Skill) => Skill) => {
    if (!activeFighter || !activeSkill) return;
    updateFighter((f) => ({
      ...f,
      skills: f.skills.map((s) => (s.id === activeSkill.id ? fn(s) : s)),
    }));
  };

  const addFighter = () => {
    const f = newFighter(`Fighter ${mod.fighters.length + 1}`);
    setMod((m) => ({ ...m, fighters: [...m.fighters, f] }));
    setActiveFighterId(f.id);
  };
  const removeFighter = () => {
    if (!activeFighter) return;
    if (mod.fighters.length <= 1) {
      flash("Need at least one fighter");
      return;
    }
    setMod((m) => ({ ...m, fighters: m.fighters.filter((f) => f.id !== activeFighter.id) }));
  };

  const addSkill = () => {
    const s = newSkill(`Skill ${(activeFighter?.skills.length ?? 0) + 1}`);
    updateFighter((f) => ({ ...f, skills: [...f.skills, s] }));
    setActiveSkillId(s.id);
  };
  const removeSkill = () => {
    if (!activeFighter || !activeSkill) return;
    if (activeFighter.skills.length <= 1) {
      flash("Need at least one skill");
      return;
    }
    updateFighter((f) => ({ ...f, skills: f.skills.filter((s) => s.id !== activeSkill.id) }));
  };

  // ---- Sprite upload ----
  const onSpriteFile = (file: File) => {
    if (file.size > 1024 * 512) {
      flash("Sprite too large (max 512KB)");
      return;
    }
    const r = new FileReader();
    r.onload = () => updateFighter((f) => ({ ...f, spriteDataUrl: String(r.result) }));
    r.readAsDataURL(file);
  };

  // ---- Preview playback ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (previewPlayingRef.current && activeSkill) {
        setPreviewT((t) => {
          const nt = t + dt / Math.max(0.1, activeSkill.duration);
          return nt >= 1 ? 0 : nt;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeSkill]);

  // ---- Render ----
  return (
    <div
      className="min-h-screen w-full text-white"
      style={{
        background:
          "radial-gradient(1200px 600px at 20% -10%, #2b1750 0%, transparent 60%), radial-gradient(1000px 500px at 110% 110%, #0c2a3a 0%, transparent 55%), #0a0a12",
        fontFamily: "Chakra Petch, system-ui, sans-serif",
      }}
    >
      <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#1d1d2a" }}>
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="px-3 py-1.5 rounded text-xs tracking-widest"
            style={{ background: "#1b1b28", border: "1px solid #2c2c40" }}
          >
            ← ARENA
          </Link>
          <div>
            <div className="text-xs uppercase tracking-[0.35em] opacity-60">Workshop</div>
            <div className="text-xl font-bold tracking-wider">Fighter & Skill Builder</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button className="px-3 py-2 text-xs rounded" style={btnStyle("#16213e")} onClick={save}>SAVE</button>
          <button className="px-3 py-2 text-xs rounded" style={btnStyle("#1c3a2a")} onClick={exportJson}>EXPORT</button>
          <button
            className="px-3 py-2 text-xs rounded"
            style={btnStyle("#3a2a1c")}
            onClick={() => fileRef.current?.click()}
          >
            IMPORT
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
          />
        </div>
      </header>

      <div className="grid gap-4 p-4" style={{ gridTemplateColumns: "260px 1fr 320px" }}>
        {/* Fighters list */}
        <aside className="rounded-lg p-3" style={panelStyle()}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs tracking-widest opacity-70">FIGHTERS</div>
            <button className="text-xs px-2 py-1 rounded" style={btnStyle("#1f2937")} onClick={addFighter}>+ NEW</button>
          </div>
          <div className="flex flex-col gap-2">
            {mod.fighters.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFighterId(f.id)}
                className="flex items-center gap-3 p-2 rounded text-left"
                style={{
                  background: f.id === activeFighterId ? "#241f3a" : "#11111a",
                  border: `1px solid ${f.id === activeFighterId ? "#5b3fa3" : "#22222c"}`,
                }}
              >
                <div
                  className="w-9 h-9 rounded grid place-items-center overflow-hidden"
                  style={{ background: "#1a1a26", border: "1px solid #2a2a3a" }}
                >
                  {f.spriteDataUrl ? (
                    <img src={f.spriteDataUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] opacity-50">NO</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{f.name}</div>
                  <div className="text-[10px] opacity-60">{f.skills.length} skills • {f.hp} HP</div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="flex-1 text-xs py-1.5 rounded" style={btnStyle("#3a1f1f")} onClick={removeFighter}>
              DELETE
            </button>
          </div>
        </aside>

        {/* Center: Fighter editor + timeline */}
        <main className="rounded-lg p-4" style={panelStyle()}>
          {activeFighter ? (
            <>
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-20 h-20 rounded grid place-items-center overflow-hidden cursor-pointer"
                  style={{ background: "#15151f", border: "1px dashed #3a3a52" }}
                  onClick={() => spriteRef.current?.click()}
                  title="Click to upload sprite"
                >
                  {activeFighter.spriteDataUrl ? (
                    <img src={activeFighter.spriteDataUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] opacity-60 px-2 text-center">UPLOAD<br />SPRITE</span>
                  )}
                </div>
                <input
                  ref={spriteRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onSpriteFile(e.target.files[0])}
                />
                <div className="flex-1">
                  <input
                    value={activeFighter.name}
                    onChange={(e) => updateFighter((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-transparent text-2xl font-bold tracking-wide outline-none border-b"
                    style={{ borderColor: "#2a2a3c" }}
                  />
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <Stat label="HP" value={activeFighter.hp} min={20} max={400} step={5}
                      onChange={(v) => updateFighter((f) => ({ ...f, hp: v }))} />
                    <Stat label="Speed" value={activeFighter.speed} min={60} max={500} step={10}
                      onChange={(v) => updateFighter((f) => ({ ...f, speed: v }))} />
                    <Stat label="Defense %" value={activeFighter.defense} min={0} max={50} step={1}
                      onChange={(v) => updateFighter((f) => ({ ...f, defense: v }))} />
                  </div>
                </div>
              </div>

              {/* Skill tabs */}
              <div className="flex flex-wrap gap-2 mb-3 border-b pb-3" style={{ borderColor: "#1f1f2c" }}>
                {activeFighter.skills.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSkillId(s.id)}
                    className="px-3 py-1.5 text-xs rounded"
                    style={{
                      background: s.id === activeSkill?.id ? "#3b2469" : "#15151f",
                      border: `1px solid ${s.id === activeSkill?.id ? "#7a55d6" : "#2a2a3a"}`,
                    }}
                  >
                    {s.name}
                  </button>
                ))}
                <button className="px-3 py-1.5 text-xs rounded" style={btnStyle("#1f3a2a")} onClick={addSkill}>+ SKILL</button>
                <button className="px-3 py-1.5 text-xs rounded" style={btnStyle("#3a1f1f")} onClick={removeSkill}>−</button>
              </div>

              {activeSkill && (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label>Name</Label>
                      <input
                        value={activeSkill.name}
                        onChange={(e) => updateSkill((s) => ({ ...s, name: e.target.value }))}
                        className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <Label>Animation Type</Label>
                      <select
                        value={activeSkill.anim}
                        onChange={(e) => updateSkill((s) => ({ ...s, anim: e.target.value as AnimType }))}
                        className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-2 py-1.5 text-sm"
                      >
                        {ANIM_TYPES.map((a) => (
                          <option key={a.id} value={a.id}>{a.label}</option>
                        ))}
                      </select>
                    </div>
                    <Stat label="Damage" value={activeSkill.damage} min={0} max={200} step={1}
                      onChange={(v) => updateSkill((s) => ({ ...s, damage: v }))} />
                    <Stat label="Cooldown (s)" value={activeSkill.cooldown} min={0.1} max={30} step={0.1}
                      onChange={(v) => updateSkill((s) => ({ ...s, cooldown: v }))} />
                    <Stat label="Range (px)" value={activeSkill.range} min={20} max={800} step={5}
                      onChange={(v) => updateSkill((s) => ({ ...s, range: v }))} />
                    <Stat
                      label="Projectile Speed"
                      value={activeSkill.projSpeed}
                      min={0}
                      max={2400}
                      step={20}
                      disabled={activeSkill.anim !== "projectile"}
                      onChange={(v) => updateSkill((s) => ({ ...s, projSpeed: v }))}
                    />
                    <Stat label="Duration (s)" value={activeSkill.duration} min={0.1} max={5} step={0.1}
                      onChange={(v) => updateSkill((s) => ({ ...s, duration: v }))} />
                    <div>
                      <Label>Passive (fighter)</Label>
                      <select
                        value={activeSkill.passive}
                        onChange={(e) => updateSkill((s) => ({ ...s, passive: e.target.value }))}
                        className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-2 py-1.5 text-sm"
                      >
                        {PASSIVES.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <Label>Effect Preset</Label>
                      <div className="flex flex-wrap gap-1">
                        {EFFECT_PRESETS.map((e) => (
                          <button
                            key={e}
                            onClick={() => updateSkill((s) => ({ ...s, effect: e }))}
                            className="px-2 py-1 text-[10px] rounded uppercase"
                            style={{
                              background: activeSkill.effect === e ? activeSkill.color : "#15151f",
                              border: `1px solid ${activeSkill.effect === e ? activeSkill.color : "#2a2a3a"}`,
                              color: activeSkill.effect === e ? "#000" : "#aaa",
                            }}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Effect Color</Label>
                      <input
                        type="color"
                        value={activeSkill.color}
                        onChange={(e) => updateSkill((s) => ({ ...s, color: e.target.value }))}
                        className="w-full h-10 bg-[#15151f] rounded border border-[#2a2a3a]"
                      />
                      <div className="text-[10px] mt-1 opacity-60">{activeSkill.color}</div>
                    </div>
                    <div>
                      <Label>Sound</Label>
                      <select
                        value={activeSkill.sound}
                        onChange={(e) => updateSkill((s) => ({ ...s, sound: e.target.value }))}
                        className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-2 py-1.5 text-sm"
                      >
                        {SOUND_LIB.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    </div>
                  </div>

                  {/* Timeline editor */}
                  <TimelineEditor
                    skill={activeSkill}
                    previewT={previewT}
                    onPlayToggle={() => { previewPlayingRef.current = !previewPlayingRef.current; }}
                    onScrub={(t) => { previewPlayingRef.current = false; setPreviewT(t); }}
                    onChange={(timeline) => updateSkill((s) => ({ ...s, timeline }))}
                  />

                  {/* Live preview pane */}
                  <PreviewPane skill={activeSkill} t={previewT} />
                </>
              )}
            </>
          ) : (
            <div className="opacity-60">No fighter selected.</div>
          )}
        </main>

        {/* Right: JSON + tips */}
        <aside className="rounded-lg p-3 flex flex-col gap-3" style={panelStyle()}>
          <div className="text-xs tracking-widest opacity-70">MOD INSPECTOR</div>
          <textarea
            readOnly
            value={JSON.stringify(mod, null, 2)}
            className="flex-1 min-h-[300px] bg-[#0d0d14] text-[10px] font-mono p-2 rounded border"
            style={{ borderColor: "#1f1f2c" }}
          />
          <div className="text-[11px] opacity-70 leading-relaxed">
            <div className="font-bold opacity-90 mb-1">Tips</div>
            • <b>Save</b> stores to your browser (auto-persists).<br />
            • <b>Export</b> downloads JSON you can share or import later.<br />
            • Drag keyframes on the timeline to retime FX, damage, and sound.<br />
            • Color picker recolors effect presets in the preview pane.
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded text-sm"
          style={{ background: "#1b1b28", border: "1px solid #3a3a52" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------- Sub components ----------------
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">{children}</div>;
}

function Stat({
  label, value, min, max, step, onChange, disabled,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div style={{ opacity: disabled ? 0.4 : 1 }}>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="range" min={min} max={max} step={step} value={value} disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-purple-400"
        />
        <input
          type="number" min={min} max={max} step={step} value={value} disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 bg-[#15151f] border border-[#2a2a3a] rounded px-1.5 py-1 text-xs text-right"
        />
      </div>
    </div>
  );
}

const KIND_COLORS: Record<Keyframe["kind"], string> = {
  startup: "#6b7280",
  active: "#fbbf24",
  recovery: "#475569",
  "spawn-fx": "#a855f7",
  "spawn-projectile": "#06b6d4",
  damage: "#ef4444",
  sound: "#10b981",
};

function TimelineEditor({
  skill, previewT, onPlayToggle, onScrub, onChange,
}: {
  skill: Skill; previewT: number;
  onPlayToggle: () => void;
  onScrub: (t: number) => void;
  onChange: (timeline: Keyframe[]) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ idx: number } | null>(null);

  const addKeyframe = (kind: Keyframe["kind"]) => {
    const kf: Keyframe = {
      t: 0.5, kind,
      payload: kind === "spawn-fx" ? skill.effect : kind === "sound" ? skill.sound : undefined,
      intensity: 1,
    };
    onChange([...skill.timeline, kf].sort((a, b) => a.t - b.t));
  };

  const removeKeyframe = (idx: number) => {
    onChange(skill.timeline.filter((_, i) => i !== idx));
  };

  const updateKf = (idx: number, patch: Partial<Keyframe>) => {
    onChange(skill.timeline.map((k, i) => (i === idx ? { ...k, ...patch } : k)));
  };

  const onTrackPointer = (e: React.PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (dragRef.current) {
      updateKf(dragRef.current.idx, { t });
    } else {
      onScrub(t);
    }
  };

  return (
    <div className="mt-2 mb-4">
      <div className="flex items-center justify-between mb-2">
        <Label>Skill Timeline ({skill.duration.toFixed(1)}s)</Label>
        <div className="flex gap-1">
          <button className="text-[10px] px-2 py-1 rounded" style={btnStyle("#16213e")} onClick={onPlayToggle}>▶ PLAY</button>
          {(["startup", "active", "recovery", "spawn-fx", "spawn-projectile", "damage", "sound"] as Keyframe["kind"][]).map((k) => (
            <button key={k} className="text-[10px] px-2 py-1 rounded"
              style={{ background: KIND_COLORS[k], color: "#000", border: "none" }}
              onClick={() => addKeyframe(k)}>
              + {k}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); onTrackPointer(e); }}
        onPointerMove={(e) => { if (e.buttons === 1) onTrackPointer(e); }}
        onPointerUp={() => { dragRef.current = null; }}
        className="relative h-16 rounded cursor-pointer"
        style={{
          background: "repeating-linear-gradient(90deg, #11111a 0, #11111a 9.5%, #1a1a26 10%)",
          border: "1px solid #2a2a3a",
        }}
      >
        <div
          className="absolute top-0 bottom-0 w-px bg-white pointer-events-none"
          style={{ left: `${previewT * 100}%` }}
        />
        {skill.timeline.map((k, i) => (
          <div
            key={i}
            onPointerDown={(e) => { e.stopPropagation(); dragRef.current = { idx: i }; }}
            onDoubleClick={() => removeKeyframe(i)}
            title={`${k.kind} @ ${(k.t * skill.duration).toFixed(2)}s — double-click to remove`}
            className="absolute top-1 w-3 h-14 rounded-sm cursor-grab"
            style={{
              left: `calc(${k.t * 100}% - 6px)`,
              background: KIND_COLORS[k.kind],
              boxShadow: "0 0 6px rgba(0,0,0,0.6)",
            }}
          />
        ))}
      </div>

      {/* Keyframe inspector */}
      <div className="mt-2 grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
        {skill.timeline.map((k, i) => (
          <div key={i} className="p-2 rounded text-xs" style={{ background: "#11111a", border: "1px solid #22222c" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: KIND_COLORS[k.kind], color: "#000" }}>
                {k.kind}
              </span>
              <button className="text-[10px] opacity-60 hover:opacity-100" onClick={() => removeKeyframe(i)}>✕</button>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              t = {(k.t * skill.duration).toFixed(2)}s
            </div>
            {(k.kind === "spawn-fx" || k.kind === "spawn-projectile") && (
              <select
                value={k.payload ?? ""}
                onChange={(e) => updateKf(i, { payload: e.target.value })}
                className="w-full mt-1 bg-[#0d0d14] border border-[#2a2a3a] rounded px-1 py-0.5 text-[10px]"
              >
                {EFFECT_PRESETS.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            )}
            {k.kind === "sound" && (
              <select
                value={k.payload ?? ""}
                onChange={(e) => updateKf(i, { payload: e.target.value })}
                className="w-full mt-1 bg-[#0d0d14] border border-[#2a2a3a] rounded px-1 py-0.5 text-[10px]"
              >
                {SOUND_LIB.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewPane({ skill, t }: { skill: Skill; t: number }) {
  // Find the closest "active" or "spawn-fx" keyframe near t
  const active = skill.timeline.filter((k) => Math.abs(k.t - t) < 0.08 && (k.kind === "spawn-fx" || k.kind === "active" || k.kind === "damage"));
  return (
    <div className="mt-3 rounded relative overflow-hidden" style={{ height: 160, background: "linear-gradient(180deg,#0c0c14,#15101f)", border: "1px solid #1f1f2c" }}>
      <div className="absolute inset-0 grid place-items-center">
        <div className="w-12 h-12 rounded-full" style={{ background: "#2a2a3a", border: "2px solid #44445a" }} />
      </div>
      {active.map((k, i) => (
        <FxBlob key={i} preset={(k.payload as EffectPreset) ?? skill.effect} color={skill.color} intensity={k.intensity ?? 1} />
      ))}
      <div className="absolute bottom-1 left-2 text-[10px] opacity-60">
        {skill.anim.toUpperCase()} • t={(t * skill.duration).toFixed(2)}s
      </div>
    </div>
  );
}

function FxBlob({ preset, color, intensity }: { preset: EffectPreset; color: string; intensity: number }) {
  const size = 40 + 60 * intensity;
  const common: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%,-50%)",
    pointerEvents: "none",
  };
  if (preset === "ring" || preset === "shockwave") {
    return <div style={{ ...common, width: size * 1.5, height: size * 1.5, borderRadius: "50%", border: `3px solid ${color}`, boxShadow: `0 0 24px ${color}` }} />;
  }
  if (preset === "burst" || preset === "spark" || preset === "shock") {
    return (
      <>
        {Array.from({ length: 10 }).map((_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <div key={i} style={{ ...common, width: 4, height: size, background: color, transform: `translate(-50%,-50%) rotate(${a}rad) translateY(-${size / 2}px)`, opacity: 0.85 }} />
          );
        })}
      </>
    );
  }
  if (preset === "slash" || preset === "crimson") {
    return <div style={{ ...common, width: size * 2, height: 6, background: color, boxShadow: `0 0 18px ${color}`, transform: "translate(-50%,-50%) rotate(-25deg)" }} />;
  }
  if (preset === "lightning") {
    return (
      <svg style={{ ...common, width: size * 1.4, height: size * 1.4 }} viewBox="0 0 100 100">
        <polyline points="40,5 55,40 30,50 70,95" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  if (preset === "flame") {
    return <div style={{ ...common, width: size, height: size, borderRadius: "50% 50% 35% 35%", background: `radial-gradient(circle, ${color}, transparent 70%)`, filter: "blur(2px)" }} />;
  }
  if (preset === "smoke") {
    return <div style={{ ...common, width: size * 1.4, height: size * 1.4, borderRadius: "50%", background: color, opacity: 0.25, filter: "blur(8px)" }} />;
  }
  if (preset === "trail") {
    return <div style={{ ...common, width: size * 2, height: 12, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, borderRadius: 4 }} />;
  }
  if (preset === "blackflash") {
    return (
      <>
        <div style={{ ...common, width: size * 1.6, height: size * 1.6, borderRadius: "50%", background: "#000", boxShadow: `0 0 32px ${color}` }} />
        <div style={{ ...common, width: size, height: size, borderRadius: "50%", background: color, mixBlendMode: "screen" }} />
      </>
    );
  }
  return <div style={{ ...common, width: size, height: size, background: color, borderRadius: 6 }} />;
}

// ---------------- styles ----------------
function panelStyle(): React.CSSProperties {
  return { background: "rgba(15,15,22,0.85)", border: "1px solid #1f1f2c", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" };
}
function btnStyle(bg: string): React.CSSProperties {
  return { background: bg, border: "1px solid #2a2a3a", color: "#fff", cursor: "pointer" };
}
