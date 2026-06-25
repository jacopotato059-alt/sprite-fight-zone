import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import sndClick from "@/assets/sounds/ui-click.mp3.asset.json";
import sndPunchLunge from "@/assets/sounds/punch-lunge.mp3.asset.json";
import sndPunchHit from "@/assets/sounds/punch-hit.mp3.asset.json";
import sndThrow from "@/assets/sounds/throw-swing.mp3.asset.json";
import sndPistol from "@/assets/sounds/pistol.mp3.asset.json";
import sndKnife from "@/assets/sounds/knife-slash.mp3.asset.json";
import sndBlackFlash from "@/assets/sounds/black-flash.mp3.asset.json";
import sndDivergent from "@/assets/sounds/divergent-hit.mp3.asset.json";
import sndFinishingHit from "@/assets/sounds/finishing-hit.mp3.asset.json";
import sndDetroitSmash from "@/assets/sounds/detroit-smash.mp3.asset.json";
import sndElectric from "@/assets/sounds/electricity.mp3.asset.json";
import sndSande from "@/assets/sounds/sandevistan.mp3.asset.json";
import sndDismantle1 from "@/assets/sounds/dismantle-1.mp3.asset.json";
import sndDismantle2 from "@/assets/sounds/dismantle-2.mp3.asset.json";
import sndCrackWhip from "@/assets/sounds/crack-the-whip.mp3.asset.json";
import sndSpawn from "@/assets/sounds/spawn.mp3.asset.json";
import sndDamage from "@/assets/sounds/damage.mp3.asset.json";
import sndTaunt from "@/assets/sounds/taunt.mp3.asset.json";
import sndAngry from "@/assets/sounds/angry.mp3.asset.json";
import sndChuckle from "@/assets/sounds/chuckle.mp3.asset.json";

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
  | "blackflash" | "crimson" | "petals" | "vortex" | "stars" | "ice"
  | "nova" | "blackhole" | "chains" | "geyser" | "runes" | "feathers";

type Keyframe = {
  t: number;
  kind: "startup" | "active" | "recovery" | "spawn-fx" | "spawn-projectile" | "damage" | "sound" | "screenshake" | "hitstop";
  payload?: string;
  intensity?: number;
};

type Skill = {
  id: string; name: string; anim: AnimType;
  damage: number; cooldown: number; range: number;
  projSpeed: number; duration: number;
  effect: EffectPreset; color: string; sound: string;
  passive: string; timeline: Keyframe[];
  // ---- v2 mechanics ----
  fxSpeed?: number;     // 0.3..3 — animation playback speed multiplier
  hits?: number;        // multi-hit count
  knockback?: number;   // 0..2000 horizontal launch
  lifesteal?: number;   // 0..1 portion of damage healed
  stun?: number;        // seconds of stun on hit
};

type Fighter = {
  id: string; name: string; spriteDataUrl: string | null;
  hp: number; speed: number; defense: number; skills: Skill[];
};

type Mod = {
  version: 1; savedAt: number; fighters: Fighter[];
  customSounds?: Record<string, string>; // name -> dataURL
};

const STORAGE_KEY = "anif.mods.v1";
const ACTIVE_KEY = "anif.mods.active.v1";
const INSTALLED_KEY = "anif.installed.v1";

const EFFECT_PRESETS: EffectPreset[] = [
  "slash", "ring", "spark", "flame", "lightning",
  "shock", "smoke", "burst", "trail", "shockwave",
  "blackflash", "crimson", "petals", "vortex", "stars", "ice",
  "nova", "blackhole", "chains", "geyser", "runes", "feathers",
];

const BUILTIN_SOUNDS: Record<string, string> = {
  "punch-hit": sndPunchHit.url, "punch-lunge": sndPunchLunge.url,
  "knife-slash": sndKnife.url, "pistol": sndPistol.url, "throw-swing": sndThrow.url,
  "black-flash": sndBlackFlash.url, "divergent-hit": sndDivergent.url,
  "finishing-hit": sndFinishingHit.url, "detroit-smash": sndDetroitSmash.url,
  "electricity": sndElectric.url, "sandevistan": sndSande.url,
  "dismantle-1": sndDismantle1.url, "dismantle-2": sndDismantle2.url,
  "crack-the-whip": sndCrackWhip.url, "spawn": sndSpawn.url, "damage": sndDamage.url,
  "taunt": sndTaunt.url, "angry": sndAngry.url, "chuckle": sndChuckle.url,
};

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

const uid = () => Math.random().toString(36).slice(2, 10);

function newSkill(name = "New Skill"): Skill {
  return {
    id: uid(), name, anim: "melee",
    damage: 20, cooldown: 3, range: 80, projSpeed: 600, duration: 0.6,
    effect: "slash", color: "#ff4d4d", sound: "punch-hit", passive: "none",
    fxSpeed: 1, hits: 1, knockback: 200, lifesteal: 0, stun: 0,
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
    id: uid(), name, spriteDataUrl: null, hp: 120, speed: 220, defense: 0,
    skills: [newSkill("Basic Punch"), newSkill("Special")],
  };
}

function loadMod(): Mod {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, savedAt: Date.now(), fighters: [newFighter()], customSounds: {} };
    const parsed = JSON.parse(raw) as Mod;
    if (parsed.version !== 1 || !Array.isArray(parsed.fighters)) throw new Error("bad");
    parsed.customSounds = parsed.customSounds ?? {};
    return parsed;
  } catch {
    return { version: 1, savedAt: Date.now(), fighters: [newFighter()], customSounds: {} };
  }
}

function loadInstalled(): Fighter[] {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ---------------- Component ----------------
function Builder() {
  const navigate = useNavigate();
  const [mod, _setMod] = useState<Mod>(() =>
    typeof window === "undefined"
      ? { version: 1, savedAt: Date.now(), fighters: [newFighter()], customSounds: {} }
      : loadMod()
  );
  // ---- Undo / Redo history ----
  const historyRef = useRef<Mod[]>([]);
  const redoRef = useRef<Mod[]>([]);
  const setMod = useCallback((updater: Mod | ((m: Mod) => Mod)) => {
    _setMod((prev) => {
      const next = typeof updater === "function" ? (updater as (m: Mod) => Mod)(prev) : updater;
      if (next !== prev) {
        historyRef.current.push(prev);
        if (historyRef.current.length > 40) historyRef.current.shift();
        redoRef.current = [];
      }
      return next;
    });
  }, []);
  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    _setMod((cur) => { redoRef.current.push(cur); return prev; });
  }, []);
  const redo = useCallback(() => {
    const nxt = redoRef.current.pop();
    if (!nxt) return;
    _setMod((cur) => { historyRef.current.push(cur); return nxt; });
  }, []);
  const [installed, setInstalled] = useState<Fighter[]>(() =>
    typeof window === "undefined" ? [] : loadInstalled()
  );
  const [activeFighterId, setActiveFighterId] = useState<string>("");
  const [activeSkillId, setActiveSkillId] = useState<string>("");
  const [toast, setToast] = useState<string>("");
  const [autosaveTick, setAutosaveTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const spriteRef = useRef<HTMLInputElement>(null);
  const soundFileRef = useRef<HTMLInputElement>(null);
  const [previewT, setPreviewT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lastSoundTRef = useRef<number>(-1);

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

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); };

  const allSoundsMap = useMemo(
    () => ({ ...BUILTIN_SOUNDS, ...(mod.customSounds ?? {}) }),
    [mod.customSounds]
  );
  const soundNames = useMemo(() => Object.keys(allSoundsMap), [allSoundsMap]);

  const playSoundPreview = useCallback((name: string) => {
    const url = allSoundsMap[name];
    if (!url) return;
    try { const a = new Audio(url); a.volume = 0.7; a.play().catch(() => {}); } catch {}
  }, [allSoundsMap]);

  // ---- Persistence ----
  const save = useCallback(() => {
    const payload = { ...mod, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(payload));
    flash("Saved to browser storage");
  }, [mod]);

  // ---- Autosave (debounced) ----
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...mod, savedAt: Date.now() }));
        setAutosaveTick((n) => n + 1);
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [mod]);

  // ---- Keyboard shortcuts: Ctrl/Cmd+Z undo, +Shift redo ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault(); redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(mod, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `anifighters-mod-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [mod]);

  const importJson = useCallback((file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result)) as Mod;
        if (parsed.version !== 1 || !Array.isArray(parsed.fighters)) throw new Error();
        parsed.customSounds = parsed.customSounds ?? {};
        setMod(parsed); flash("Mod loaded");
      } catch { flash("Invalid mod file"); }
    };
    r.readAsText(file);
  }, [setMod]);

  const installToRoster = useCallback(() => {
    if (!activeFighter) return;
    if (!activeFighter.spriteDataUrl) { flash("Upload a sprite first"); return; }
    const next = [...installed.filter((f) => f.id !== activeFighter.id), activeFighter];
    setInstalled(next);
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(next));
    flash(`${activeFighter.name} installed in Fighters menu`);
  }, [activeFighter, installed]);

  // ---- Instant Test in Arena: install + jump to duel ----
  const testInArena = useCallback(() => {
    if (!activeFighter) return;
    if (!activeFighter.spriteDataUrl) { flash("Upload a sprite first"); return; }
    const next = [...installed.filter((f) => f.id !== activeFighter.id), activeFighter];
    setInstalled(next);
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(next));
    try { localStorage.setItem("anif.test.duel", `custom_${activeFighter.id}`); } catch {}
    flash("Launching duel test…");
    setTimeout(() => navigate({ to: "/", search: { duel: `custom_${activeFighter.id}` } as never }), 250);
  }, [activeFighter, installed, navigate]);


  const uninstall = useCallback((id: string) => {
    const next = installed.filter((f) => f.id !== id);
    setInstalled(next);
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(next));
    flash("Removed from roster");
  }, [installed]);

  const isInstalled = activeFighter && installed.some((f) => f.id === activeFighter.id);

  // ---- Mutations ----
  const updateFighter = (fn: (f: Fighter) => Fighter) => {
    if (!activeFighter) return;
    setMod((m) => ({ ...m, fighters: m.fighters.map((f) => (f.id === activeFighter.id ? fn(f) : f)) }));
  };
  const updateSkill = (fn: (s: Skill) => Skill) => {
    if (!activeFighter || !activeSkill) return;
    updateFighter((f) => ({ ...f, skills: f.skills.map((s) => (s.id === activeSkill.id ? fn(s) : s)) }));
  };
  const addFighter = () => {
    const f = newFighter(`Fighter ${mod.fighters.length + 1}`);
    setMod((m) => ({ ...m, fighters: [...m.fighters, f] }));
    setActiveFighterId(f.id);
  };
  const removeFighter = () => {
    if (!activeFighter) return;
    if (mod.fighters.length <= 1) { flash("Need at least one fighter"); return; }
    setMod((m) => ({ ...m, fighters: m.fighters.filter((f) => f.id !== activeFighter.id) }));
  };
  const addSkill = () => {
    const s = newSkill(`Skill ${(activeFighter?.skills.length ?? 0) + 1}`);
    updateFighter((f) => ({ ...f, skills: [...f.skills, s] }));
    setActiveSkillId(s.id);
  };
  const removeSkill = () => {
    if (!activeFighter || !activeSkill) return;
    if (activeFighter.skills.length <= 1) { flash("Need at least one skill"); return; }
    updateFighter((f) => ({ ...f, skills: f.skills.filter((s) => s.id !== activeSkill.id) }));
  };

  const onSpriteFile = (file: File) => {
    if (file.size > 1024 * 512) { flash("Sprite too large (max 512KB)"); return; }
    const r = new FileReader();
    r.onload = () => updateFighter((f) => ({ ...f, spriteDataUrl: String(r.result) }));
    r.readAsDataURL(file);
  };

  const onSoundFile = (file: File) => {
    if (file.size > 1024 * 800) { flash("Sound too large (max 800KB)"); return; }
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result);
      const name = `custom-${file.name.replace(/\.[^.]+$/, "").slice(0, 20)}`;
      setMod((m) => ({ ...m, customSounds: { ...(m.customSounds ?? {}), [name]: dataUrl } }));
      flash(`Sound "${name}" added`);
    };
    r.readAsDataURL(file);
  };

  // ---- Preview playback ----
  useEffect(() => {
    let raf = 0; let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      if (playing && activeSkill) {
        setPreviewT((t) => {
          const dur = Math.max(0.1, activeSkill.duration);
          const nt = t + dt / dur;
          // Trigger sound keyframes as we cross them
          for (const k of activeSkill.timeline) {
            if (k.kind === "sound" && lastSoundTRef.current < k.t && nt >= k.t) {
              playSoundPreview(k.payload ?? activeSkill.sound);
            }
          }
          lastSoundTRef.current = nt >= 1 ? -1 : nt;
          return nt >= 1 ? 0 : nt;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, activeSkill, playSoundPreview]);

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
      <FxKeyframes />
      <header className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-5 py-3 sm:py-4 border-b sticky top-0 z-30 backdrop-blur"
        style={{ borderColor: "#1d1d2a", background: "rgba(10,10,18,0.85)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="px-3 py-1.5 rounded text-xs tracking-widest shrink-0"
            style={{ background: "#1b1b28", border: "1px solid #2c2c40" }}>← ARENA</Link>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.35em] opacity-60">Workshop</div>
            <div className="text-base sm:text-xl font-bold tracking-wider truncate">Fighter & Skill Builder</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end items-center">
          <span className="text-[10px] opacity-50 hidden sm:inline">autosave ✓ {autosaveTick}</span>
          <button title="Undo (Ctrl+Z)" className="px-2 py-2 text-xs rounded" style={btnStyle("#222232")} onClick={undo}>↶</button>
          <button title="Redo (Ctrl+Shift+Z)" className="px-2 py-2 text-xs rounded" style={btnStyle("#222232")} onClick={redo}>↷</button>
          <button className="px-3 py-2 text-xs rounded" style={btnStyle("#6a1f3a")} onClick={testInArena}>⚡ TEST IN ARENA</button>
          <button className="px-3 py-2 text-xs rounded" style={btnStyle("#3b2469")} onClick={installToRoster}>
            {isInstalled ? "↻ UPDATE ROSTER" : "+ INSTALL TO ROSTER"}
          </button>
          <button className="px-3 py-2 text-xs rounded" style={btnStyle("#16213e")} onClick={save}>SAVE</button>
          <button className="px-3 py-2 text-xs rounded" style={btnStyle("#1c3a2a")} onClick={exportJson}>EXPORT</button>
          <button className="px-3 py-2 text-xs rounded" style={btnStyle("#3a2a1c")}
            onClick={() => fileRef.current?.click()}>IMPORT</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
      </header>

      <div className="grid gap-4 p-3 sm:p-4 grid-cols-1 lg:[grid-template-columns:240px_1fr_300px]">
        {/* Fighters list */}
        <aside className="rounded-lg p-3" style={panelStyle()}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs tracking-widest opacity-70">FIGHTERS</div>
            <button className="text-xs px-2 py-1 rounded" style={btnStyle("#1f2937")} onClick={addFighter}>+ NEW</button>
          </div>
          <div className="flex flex-col gap-2 max-h-[40vh] lg:max-h-[60vh] overflow-y-auto pr-1">
            {mod.fighters.map((f) => {
              const inRoster = installed.some((x) => x.id === f.id);
              return (
                <button key={f.id} onClick={() => setActiveFighterId(f.id)}
                  className="flex items-center gap-3 p-2 rounded text-left"
                  style={{
                    background: f.id === activeFighterId ? "#241f3a" : "#11111a",
                    border: `1px solid ${f.id === activeFighterId ? "#5b3fa3" : "#22222c"}`,
                  }}>
                  <div className="w-9 h-9 rounded grid place-items-center overflow-hidden shrink-0"
                    style={{ background: "#1a1a26", border: "1px solid #2a2a3a" }}>
                    {f.spriteDataUrl ? <img src={f.spriteDataUrl} alt="" className="w-full h-full object-contain" />
                      : <span className="text-[10px] opacity-50">NO</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-1">
                      {f.name}
                      {inRoster && <span title="Installed" className="text-[9px] px-1 rounded" style={{ background: "#3b2469" }}>★</span>}
                    </div>
                    <div className="text-[10px] opacity-60">{f.skills.length} skills • {f.hp} HP</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="flex-1 text-xs py-1.5 rounded" style={btnStyle("#3a1f1f")} onClick={removeFighter}>DELETE FIGHTER</button>
          </div>

          {installed.length > 0 && (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: "#1f1f2c" }}>
              <div className="text-[10px] tracking-widest opacity-70 mb-2">INSTALLED IN ROSTER</div>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {installed.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-[11px] p-1 rounded" style={{ background: "#11111a" }}>
                    <span className="flex-1 truncate">{f.name}</span>
                    <button onClick={() => uninstall(f.id)} className="opacity-60 hover:opacity-100">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Center: Editor */}
        <main className="rounded-lg p-3 sm:p-4 min-w-0" style={panelStyle()}>
          {activeFighter ? (
            <>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="w-20 h-20 rounded grid place-items-center overflow-hidden cursor-pointer shrink-0"
                  style={{ background: "#15151f", border: "1px dashed #3a3a52" }}
                  onClick={() => spriteRef.current?.click()} title="Click to upload sprite">
                  {activeFighter.spriteDataUrl ? <img src={activeFighter.spriteDataUrl} alt="" className="w-full h-full object-contain" />
                    : <span className="text-[10px] opacity-60 px-2 text-center">UPLOAD<br />SPRITE</span>}
                </div>
                <input ref={spriteRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onSpriteFile(e.target.files[0])} />
                <div className="flex-1 min-w-[200px]">
                  <input value={activeFighter.name}
                    onChange={(e) => updateFighter((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-transparent text-xl sm:text-2xl font-bold tracking-wide outline-none border-b"
                    style={{ borderColor: "#2a2a3c" }} />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
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
                  <button key={s.id} onClick={() => setActiveSkillId(s.id)}
                    className="px-3 py-1.5 text-xs rounded"
                    style={{
                      background: s.id === activeSkill?.id ? "#3b2469" : "#15151f",
                      border: `1px solid ${s.id === activeSkill?.id ? "#7a55d6" : "#2a2a3a"}`,
                    }}>{s.name}</button>
                ))}
                <button className="px-3 py-1.5 text-xs rounded" style={btnStyle("#1f3a2a")} onClick={addSkill}>+ SKILL</button>
                <button className="px-3 py-1.5 text-xs rounded" style={btnStyle("#3a1f1f")} onClick={removeSkill}>−</button>
              </div>

              {activeSkill && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <Label>Name</Label>
                      <input value={activeSkill.name}
                        onChange={(e) => updateSkill((s) => ({ ...s, name: e.target.value }))}
                        className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <Label>Animation Type</Label>
                      <select value={activeSkill.anim}
                        onChange={(e) => updateSkill((s) => ({ ...s, anim: e.target.value as AnimType }))}
                        className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-2 py-1.5 text-sm">
                        {ANIM_TYPES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </div>
                    <Stat label="Damage" value={activeSkill.damage} min={0} max={200} step={1}
                      onChange={(v) => updateSkill((s) => ({ ...s, damage: v }))} />
                    <Stat label="Cooldown (s)" value={activeSkill.cooldown} min={0.1} max={30} step={0.1}
                      onChange={(v) => updateSkill((s) => ({ ...s, cooldown: v }))} />
                    <Stat label="Range (px)" value={activeSkill.range} min={20} max={800} step={5}
                      onChange={(v) => updateSkill((s) => ({ ...s, range: v }))} />
                    <Stat label="Projectile Speed" value={activeSkill.projSpeed} min={0} max={2400} step={20}
                      disabled={activeSkill.anim !== "projectile"}
                      onChange={(v) => updateSkill((s) => ({ ...s, projSpeed: v }))} />
                    <Stat label="Duration (s)" value={activeSkill.duration} min={0.1} max={5} step={0.1}
                      onChange={(v) => updateSkill((s) => ({ ...s, duration: v }))} />
                    <Stat label="FX Speed" value={activeSkill.fxSpeed ?? 1} min={0.3} max={3} step={0.1}
                      onChange={(v) => updateSkill((s) => ({ ...s, fxSpeed: v }))} />
                    <Stat label="Multi-Hits" value={activeSkill.hits ?? 1} min={1} max={8} step={1}
                      onChange={(v) => updateSkill((s) => ({ ...s, hits: v }))} />
                    <Stat label="Knockback" value={activeSkill.knockback ?? 200} min={0} max={2000} step={20}
                      onChange={(v) => updateSkill((s) => ({ ...s, knockback: v }))} />
                    <Stat label="Lifesteal %" value={Math.round((activeSkill.lifesteal ?? 0) * 100)} min={0} max={100} step={1}
                      onChange={(v) => updateSkill((s) => ({ ...s, lifesteal: v / 100 }))} />
                    <Stat label="Stun (s)" value={activeSkill.stun ?? 0} min={0} max={3} step={0.05}
                      onChange={(v) => updateSkill((s) => ({ ...s, stun: v }))} />
                    <div>
                      <Label>Passive (fighter)</Label>
                      <select value={activeSkill.passive}
                        onChange={(e) => updateSkill((s) => ({ ...s, passive: e.target.value }))}
                        className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-2 py-1.5 text-sm">
                        {PASSIVES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Effect picker as a visual grid */}
                  <div className="mb-4">
                    <Label>Effect Preset (live previews — click to choose)</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {EFFECT_PRESETS.map((e) => (
                        <button key={e}
                          onClick={() => updateSkill((s) => ({ ...s, effect: e }))}
                          className="relative h-20 rounded overflow-hidden"
                          style={{
                            background: "#0d0d14",
                            border: `1px solid ${activeSkill.effect === e ? activeSkill.color : "#2a2a3a"}`,
                            boxShadow: activeSkill.effect === e ? `0 0 12px ${activeSkill.color}66` : "none",
                          }}>
                          <FxBlob preset={e} color={activeSkill.color} intensity={1} playing />
                          <div className="absolute bottom-0 inset-x-0 text-[9px] uppercase tracking-wider text-center py-0.5"
                            style={{ background: "rgba(0,0,0,0.6)" }}>{e}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <Label>Effect Color</Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={activeSkill.color}
                          onChange={(e) => updateSkill((s) => ({ ...s, color: e.target.value }))}
                          className="h-10 w-16 bg-[#15151f] rounded border border-[#2a2a3a]" />
                        <input type="text" value={activeSkill.color}
                          onChange={(e) => updateSkill((s) => ({ ...s, color: e.target.value }))}
                          className="flex-1 bg-[#15151f] border border-[#2a2a3a] rounded px-2 py-1.5 text-xs font-mono" />
                      </div>
                    </div>
                    <div>
                      <Label>Sound</Label>
                      <div className="flex items-center gap-2">
                        <select value={activeSkill.sound}
                          onChange={(e) => updateSkill((s) => ({ ...s, sound: e.target.value }))}
                          className="flex-1 bg-[#15151f] border border-[#2a2a3a] rounded px-2 py-1.5 text-sm min-w-0">
                          {soundNames.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button title="Preview" className="px-2 py-1.5 text-xs rounded shrink-0"
                          style={btnStyle("#1c3a2a")}
                          onClick={() => playSoundPreview(activeSkill.sound)}>▶</button>
                        <button title="Upload sound" className="px-2 py-1.5 text-xs rounded shrink-0"
                          style={btnStyle("#3a2a1c")}
                          onClick={() => soundFileRef.current?.click()}>+</button>
                        <input ref={soundFileRef} type="file" accept="audio/*" className="hidden"
                          onChange={(e) => e.target.files?.[0] && onSoundFile(e.target.files[0])} />
                      </div>
                    </div>
                  </div>

                  <TimelineEditor
                    skill={activeSkill}
                    previewT={previewT}
                    playing={playing}
                    soundNames={soundNames}
                    onPlaySound={playSoundPreview}
                    onPlayToggle={() => setPlaying((p) => !p)}
                    onScrub={(t) => { setPlaying(false); setPreviewT(t); lastSoundTRef.current = t; }}
                    onChange={(timeline) => updateSkill((s) => ({ ...s, timeline }))}
                  />

                  <PreviewPane skill={activeSkill} t={previewT} />
                </>
              )}
            </>
          ) : <div className="opacity-60">No fighter selected.</div>}
        </main>

        {/* Right: Inspector */}
        <aside className="rounded-lg p-3 flex flex-col gap-3" style={panelStyle()}>
          <div className="text-xs tracking-widest opacity-70">MOD INSPECTOR</div>
          <textarea readOnly value={JSON.stringify(mod, null, 2)}
            className="bg-[#0d0d14] text-[10px] font-mono p-2 rounded border h-48 lg:h-[400px]"
            style={{ borderColor: "#1f1f2c" }} />
          <div className="text-[11px] opacity-70 leading-relaxed">
            <div className="font-bold opacity-90 mb-1">Tips</div>
            • <b>Install to Roster</b> adds the current fighter to the Fighters menu in the Arena.<br />
            • <b>Save</b> stores to browser; <b>Export</b> downloads JSON.<br />
            • Drag keyframes on the timeline to retime FX, damage, and sound.<br />
            • Press <b>▶</b> next to a sound to preview; <b>+</b> uploads your own.
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded text-sm z-50"
          style={{ background: "#1b1b28", border: "1px solid #3a3a52" }}>{toast}</div>
      )}
    </div>
  );
}

// ---------------- Sub components ----------------
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">{children}</div>;
}

function Stat({ label, value, min, max, step, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div style={{ opacity: disabled ? 0.4 : 1 }}>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))} className="flex-1 min-w-0 accent-purple-400" />
        <input type="number" min={min} max={max} step={step} value={value} disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 bg-[#15151f] border border-[#2a2a3a] rounded px-1.5 py-1 text-xs text-right" />
      </div>
    </div>
  );
}

const KIND_COLORS: Record<Keyframe["kind"], string> = {
  startup: "#6b7280", active: "#fbbf24", recovery: "#475569",
  "spawn-fx": "#a855f7", "spawn-projectile": "#06b6d4",
  damage: "#ef4444", sound: "#10b981",
  screenshake: "#f97316", hitstop: "#e11d48",
};

function TimelineEditor({
  skill, previewT, playing, soundNames, onPlayToggle, onScrub, onChange, onPlaySound,
}: {
  skill: Skill; previewT: number; playing: boolean;
  soundNames: string[];
  onPlayToggle: () => void;
  onScrub: (t: number) => void;
  onChange: (timeline: Keyframe[]) => void;
  onPlaySound: (name: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addKeyframe = (kind: Keyframe["kind"]) => {
    const kf: Keyframe = {
      t: 0.5, kind,
      payload: kind === "spawn-fx" ? skill.effect : kind === "sound" ? skill.sound : undefined,
      intensity: 1,
    };
    onChange([...skill.timeline, kf].sort((a, b) => a.t - b.t));
  };
  const removeKeyframe = (idx: number) => onChange(skill.timeline.filter((_, i) => i !== idx));
  const updateKf = (idx: number, patch: Partial<Keyframe>) =>
    onChange(skill.timeline.map((k, i) => (i === idx ? { ...k, ...patch } : k)));

  // Robust drag using window listeners so the pointer never escapes the handle
  useEffect(() => {
    if (dragIdx === null) return;
    const onMove = (e: PointerEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      updateKf(dragIdx, { t });
    };
    const onUp = () => setDragIdx(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIdx, skill.timeline]);

  const onTrackClick = (e: React.PointerEvent) => {
    if (dragIdx !== null) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onScrub(t);
  };

  return (
    <div className="mt-2 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <Label>Skill Timeline ({skill.duration.toFixed(1)}s)</Label>
        <div className="flex gap-1 flex-wrap">
          <button className="text-[10px] px-2 py-1 rounded" style={btnStyle("#16213e")} onClick={onPlayToggle}>
            {playing ? "❚❚ PAUSE" : "▶ PLAY"}
          </button>
          {(["startup", "active", "recovery", "spawn-fx", "spawn-projectile", "damage", "sound"] as Keyframe["kind"][]).map((k) => (
            <button key={k} className="text-[10px] px-2 py-1 rounded"
              style={{ background: KIND_COLORS[k], color: "#000", border: "none" }}
              onClick={() => addKeyframe(k)}>+ {k}</button>
          ))}
        </div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onTrackClick}
        className="relative h-16 rounded select-none touch-none"
        style={{
          background: "repeating-linear-gradient(90deg, #11111a 0, #11111a 9.5%, #1a1a26 10%)",
          border: "1px solid #2a2a3a",
        }}
      >
        <div className="absolute top-0 bottom-0 w-px bg-white pointer-events-none"
          style={{ left: `${previewT * 100}%`, boxShadow: "0 0 4px #fff" }} />
        {skill.timeline.map((k, i) => (
          <div key={i}
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragIdx(i); }}
            onDoubleClick={(e) => { e.stopPropagation(); removeKeyframe(i); }}
            title={`${k.kind} @ ${(k.t * skill.duration).toFixed(2)}s — drag to retime, double-click to remove`}
            className="absolute top-1 w-4 h-14 rounded-sm cursor-grab touch-none"
            style={{
              left: `calc(${k.t * 100}% - 8px)`,
              background: KIND_COLORS[k.kind],
              boxShadow: dragIdx === i ? `0 0 10px ${KIND_COLORS[k.kind]}` : "0 0 6px rgba(0,0,0,0.6)",
              border: dragIdx === i ? "1px solid #fff" : "none",
            }} />
        ))}
      </div>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
        {skill.timeline.map((k, i) => (
          <div key={i} className="p-2 rounded text-xs" style={{ background: "#11111a", border: "1px solid #22222c" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: KIND_COLORS[k.kind], color: "#000" }}>
                {k.kind}
              </span>
              <button className="text-[10px] opacity-60 hover:opacity-100" onClick={() => removeKeyframe(i)}>✕</button>
            </div>
            <div className="text-[10px] mb-1">t = {(k.t * skill.duration).toFixed(2)}s</div>
            <input type="range" min={0} max={1} step={0.01} value={k.t}
              onChange={(e) => updateKf(i, { t: Number(e.target.value) })}
              className="w-full accent-purple-400" />
            {(k.kind === "spawn-fx" || k.kind === "spawn-projectile") && (
              <select value={k.payload ?? ""} onChange={(e) => updateKf(i, { payload: e.target.value })}
                className="w-full mt-1 bg-[#0d0d14] border border-[#2a2a3a] rounded px-1 py-0.5 text-[10px]">
                {EFFECT_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {k.kind === "sound" && (
              <div className="flex items-center gap-1 mt-1">
                <select value={k.payload ?? ""} onChange={(e) => updateKf(i, { payload: e.target.value })}
                  className="flex-1 min-w-0 bg-[#0d0d14] border border-[#2a2a3a] rounded px-1 py-0.5 text-[10px]">
                  {soundNames.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button onClick={() => onPlaySound(k.payload ?? "")}
                  className="text-[10px] px-1.5 py-0.5 rounded" style={btnStyle("#1c3a2a")}>▶</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewPane({ skill, t }: { skill: Skill; t: number }) {
  const active = skill.timeline.filter((k) => Math.abs(k.t - t) < 0.08 && (k.kind === "spawn-fx" || k.kind === "active" || k.kind === "damage"));
  return (
    <div className="mt-3 rounded relative overflow-hidden"
      style={{ height: 180, background: "linear-gradient(180deg,#0c0c14,#15101f)", border: "1px solid #1f1f2c" }}>
      <div className="absolute inset-0 grid place-items-center">
        <div className="w-14 h-14 rounded-full" style={{ background: "#2a2a3a", border: "2px solid #44445a", boxShadow: "inset 0 0 12px rgba(0,0,0,0.6)" }} />
      </div>
      {(active.length === 0
        ? [<FxBlob key="idle" preset={skill.effect} color={skill.color} intensity={0.6} playing />]
        : active.map((k, i) => (
            <FxBlob key={i} preset={(k.payload as EffectPreset) ?? skill.effect} color={skill.color} intensity={k.intensity ?? 1} playing />
          ))
      )}
      <div className="absolute bottom-1 left-2 text-[10px] opacity-60">
        {skill.anim.toUpperCase()} • t={(t * skill.duration).toFixed(2)}s
      </div>
    </div>
  );
}

// ============ FX Library — creative animated effects ============
function FxKeyframes() {
  return (
    <style>{`
      @keyframes fx-ring-pulse { 0%{transform:translate(-50%,-50%) scale(0.3);opacity:1} 100%{transform:translate(-50%,-50%) scale(1.6);opacity:0} }
      @keyframes fx-rotate { from{transform:translate(-50%,-50%) rotate(0)} to{transform:translate(-50%,-50%) rotate(360deg)} }
      @keyframes fx-rotate-slow { from{transform:translate(-50%,-50%) rotate(0)} to{transform:translate(-50%,-50%) rotate(-360deg)} }
      @keyframes fx-flame { 0%,100%{transform:translate(-50%,-60%) scale(1,1.05)} 50%{transform:translate(-50%,-55%) scale(0.95,1.15)} }
      @keyframes fx-shake { 0%,100%{transform:translate(-50%,-50%)} 25%{transform:translate(-48%,-52%)} 75%{transform:translate(-52%,-48%)} }
      @keyframes fx-flicker { 0%,100%{opacity:1} 50%{opacity:0.3} }
      @keyframes fx-burst-out { 0%{transform:translate(-50%,-50%) rotate(var(--a)) translateY(0);opacity:1} 100%{transform:translate(-50%,-50%) rotate(var(--a)) translateY(-70px);opacity:0} }
      @keyframes fx-slash-sweep { 0%{transform:translate(-50%,-50%) rotate(-60deg) scaleX(0);opacity:1} 60%{transform:translate(-50%,-50%) rotate(-15deg) scaleX(1);opacity:1} 100%{transform:translate(-50%,-50%) rotate(20deg) scaleX(1);opacity:0} }
      @keyframes fx-petal-fall { 0%{transform:translate(-50%,-50%) rotate(var(--a)) translateY(-40px) scale(0.6);opacity:0} 30%{opacity:1} 100%{transform:translate(-50%,-50%) rotate(var(--a)) translateY(40px) scale(1);opacity:0} }
      @keyframes fx-smoke-rise { 0%{transform:translate(-50%,-30%) scale(0.6);opacity:0.6} 100%{transform:translate(-50%,-90%) scale(1.4);opacity:0} }
      @keyframes fx-trail { 0%{transform:translate(-150%,-50%) scaleX(0.3);opacity:0} 50%{opacity:1} 100%{transform:translate(50%,-50%) scaleX(1);opacity:0} }
      @keyframes fx-blackflash-pulse { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.25)} }
      @keyframes fx-star-twinkle { 0%,100%{opacity:0.2;transform:translate(-50%,-50%) rotate(var(--a)) translate(var(--r),0) scale(0.5)} 50%{opacity:1;transform:translate(-50%,-50%) rotate(var(--a)) translate(var(--r),0) scale(1)} }
      @keyframes fx-lightning-flash { 0%,100%{opacity:0.3;filter:drop-shadow(0 0 0 currentColor)} 50%{opacity:1;filter:drop-shadow(0 0 12px currentColor)} }
      @keyframes fx-ice-grow { 0%{transform:translate(-50%,-50%) scale(0.3) rotate(var(--a));opacity:0} 60%{opacity:1} 100%{transform:translate(-50%,-50%) scale(1.1) rotate(var(--a));opacity:0.6} }
    `}</style>
  );
}

function FxBlob({ preset, color, intensity, playing }: { preset: EffectPreset; color: string; intensity: number; playing?: boolean }) {
  const size = 40 + 60 * intensity;
  const anim = playing ? "" : " paused";
  const common: React.CSSProperties = {
    position: "absolute", left: "50%", top: "50%",
    transform: "translate(-50%,-50%)", pointerEvents: "none",
  };

  if (preset === "ring") {
    return (
      <>
        {[0, 0.4, 0.8].map((d, i) => (
          <div key={i} style={{
            ...common, width: size * 1.6, height: size * 1.6, borderRadius: "50%",
            border: `2px solid ${color}`, boxShadow: `0 0 20px ${color}`,
            animation: `fx-ring-pulse 1.2s ${d}s infinite ease-out${anim}`,
          }} />
        ))}
      </>
    );
  }

  if (preset === "shockwave") {
    return (
      <>
        <div style={{ ...common, width: size * 2, height: size * 0.3, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, filter: "blur(2px)", animation: `fx-ring-pulse 0.8s infinite ease-out${anim}` }} />
        <div style={{ ...common, width: size * 1.4, height: size * 1.4, borderRadius: "50%", border: `3px solid ${color}`, opacity: 0.7, animation: `fx-ring-pulse 1s 0.2s infinite ease-out${anim}` }} />
      </>
    );
  }

  if (preset === "burst" || preset === "spark") {
    return (
      <>
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * 360;
          const len = 6 + (i % 3) * 4;
          return (
            <div key={i} style={{
              ...common, width: 3, height: len + size * 0.3, background: color,
              borderRadius: 2, boxShadow: `0 0 6px ${color}`,
              ["--a" as never]: `${a}deg`,
              animation: `fx-burst-out ${0.6 + (i % 3) * 0.1}s ${(i % 4) * 0.05}s infinite ease-out${anim}`,
            } as React.CSSProperties} />
          );
        })}
        <div style={{ ...common, width: size * 0.5, height: size * 0.5, borderRadius: "50%", background: color, filter: "blur(6px)", opacity: 0.8 }} />
      </>
    );
  }

  if (preset === "shock") {
    return (
      <>
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * 360;
          return (
            <svg key={i} style={{ ...common, width: size * 1.4, height: 4, ["--a" as never]: `${a}deg`, animation: `fx-burst-out 0.5s ${i * 0.04}s infinite ease-out${anim}` } as React.CSSProperties}>
              <polyline points="0,2 10,0 20,4 30,1 40,3 50,0 60,2" stroke={color} strokeWidth="2" fill="none" />
            </svg>
          );
        })}
      </>
    );
  }

  if (preset === "slash" || preset === "crimson") {
    const tint = preset === "crimson" ? "#ff1f3a" : color;
    return (
      <>
        <div style={{
          ...common, width: size * 2.4, height: 5, borderRadius: 4,
          background: `linear-gradient(90deg, transparent, ${tint} 50%, transparent)`,
          boxShadow: `0 0 14px ${tint}`, transformOrigin: "center",
          animation: `fx-slash-sweep 0.6s infinite ease-out${anim}`,
        }} />
        <div style={{
          ...common, width: size * 2, height: 2,
          background: `linear-gradient(90deg, transparent, #fff 50%, transparent)`,
          opacity: 0.7, animation: `fx-slash-sweep 0.6s 0.05s infinite ease-out${anim}`,
        }} />
      </>
    );
  }

  if (preset === "lightning") {
    return (
      <svg viewBox="0 0 100 100" style={{ ...common, width: size * 1.6, height: size * 1.6, color, animation: `fx-lightning-flash 0.25s infinite${anim}` }}>
        <polyline points="45,5 60,38 38,46 65,55 30,95" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points="20,20 35,40 22,52 40,70" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.6" />
        <polyline points="70,15 80,35 68,48 82,68" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      </svg>
    );
  }

  if (preset === "flame") {
    return (
      <>
        <div style={{
          ...common, width: size, height: size * 1.3,
          background: `radial-gradient(ellipse at 50% 80%, #fff 0%, ${color} 30%, transparent 70%)`,
          borderRadius: "50% 50% 30% 30% / 60% 60% 40% 40%",
          filter: "blur(1px)", animation: `fx-flame 0.4s infinite ease-in-out${anim}`,
        }} />
        <div style={{
          ...common, width: size * 0.6, height: size * 0.9, top: "60%",
          background: `radial-gradient(circle, #fff7c2 0%, transparent 60%)`,
          filter: "blur(2px)", animation: `fx-flicker 0.2s infinite${anim}`,
        }} />
      </>
    );
  }

  if (preset === "smoke") {
    return (
      <>
        {[0, 0.3, 0.6].map((d, i) => (
          <div key={i} style={{
            ...common, width: size * 1.2, height: size * 1.2, borderRadius: "50%",
            background: color, opacity: 0.25, filter: "blur(10px)",
            animation: `fx-smoke-rise 1.4s ${d}s infinite ease-out${anim}`,
          }} />
        ))}
      </>
    );
  }

  if (preset === "trail") {
    return (
      <>
        <div style={{
          ...common, width: size * 2.2, height: 10, borderRadius: 6,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 12px ${color}`, animation: `fx-trail 0.7s infinite ease-out${anim}`,
        }} />
        <div style={{
          ...common, width: size * 2, height: 4, top: "55%",
          background: `linear-gradient(90deg, transparent, #fff, transparent)`,
          opacity: 0.8, animation: `fx-trail 0.7s 0.05s infinite ease-out${anim}`,
        }} />
      </>
    );
  }

  if (preset === "blackflash") {
    return (
      <>
        <div style={{
          ...common, width: size * 2, height: size * 2, borderRadius: "50%",
          background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
          filter: "blur(8px)", mixBlendMode: "screen",
          animation: `fx-blackflash-pulse 0.4s infinite${anim}`,
        }} />
        <div style={{
          ...common, width: size * 1.4, height: size * 1.4, borderRadius: "50%",
          background: "#000", boxShadow: `0 0 30px ${color}, inset 0 0 20px ${color}`,
          animation: `fx-blackflash-pulse 0.4s infinite${anim}`,
        }} />
        <div style={{
          ...common, width: size * 0.6, height: size * 0.6, borderRadius: "50%",
          background: "#fff", filter: "blur(4px)", animation: `fx-flicker 0.15s infinite${anim}`,
        }} />
      </>
    );
  }

  if (preset === "petals") {
    return (
      <>
        {Array.from({ length: 10 }).map((_, i) => {
          const a = (i / 10) * 360;
          return (
            <div key={i} style={{
              ...common, width: 8, height: 14,
              background: color, borderRadius: "60% 60% 40% 40% / 80% 80% 20% 20%",
              boxShadow: `0 0 6px ${color}`,
              ["--a" as never]: `${a}deg`,
              animation: `fx-petal-fall 1.6s ${(i * 0.12)}s infinite ease-in-out${anim}`,
            } as React.CSSProperties} />
          );
        })}
      </>
    );
  }

  if (preset === "vortex") {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            ...common, width: size * (1.8 - i * 0.4), height: size * (1.8 - i * 0.4),
            borderRadius: "50%",
            border: `2px dashed ${color}`,
            opacity: 0.7 - i * 0.2,
            animation: `${i % 2 === 0 ? "fx-rotate" : "fx-rotate-slow"} ${1.5 + i * 0.6}s linear infinite${anim}`,
          }} />
        ))}
        <div style={{ ...common, width: size * 0.5, height: size * 0.5, borderRadius: "50%", background: color, filter: "blur(8px)" }} />
      </>
    );
  }

  if (preset === "stars") {
    return (
      <>
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * 360;
          const r = 20 + (i % 3) * 12;
          return (
            <div key={i} style={{
              ...common, width: 6, height: 6, background: color, borderRadius: "50%",
              boxShadow: `0 0 8px ${color}, 0 0 14px ${color}`,
              ["--a" as never]: `${a}deg`, ["--r" as never]: `${r}px`,
              animation: `fx-star-twinkle ${0.8 + (i % 3) * 0.2}s ${(i * 0.08)}s infinite ease-in-out${anim}`,
            } as React.CSSProperties} />
          );
        })}
      </>
    );
  }

  if (preset === "ice") {
    return (
      <>
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * 360;
          return (
            <div key={i} style={{
              ...common, width: 4, height: size,
              background: `linear-gradient(180deg, transparent, ${color}, transparent)`,
              boxShadow: `0 0 8px ${color}`,
              ["--a" as never]: `${a}deg`,
              animation: `fx-ice-grow 1.4s ${(i * 0.1)}s infinite ease-out${anim}`,
              transformOrigin: "center",
            } as React.CSSProperties} />
          );
        })}
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
