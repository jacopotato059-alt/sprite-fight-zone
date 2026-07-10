import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dummySprite from "@/assets/dummy.png";


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
  | "nova" | "blackhole" | "chains" | "geyser" | "runes" | "feathers"
  | "neon" | "laser" | "portal" | "meteor" | "bloom" | "glyph" | "afterimage" | "pixel";

type Keyframe = {
  t: number;
  kind: "startup" | "active" | "recovery" | "spawn-fx" | "spawn-projectile" | "damage" | "sound" | "screenshake" | "hitstop";
  payload?: string;
  intensity?: number;
  layer?: string;
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
  "neon", "laser", "portal", "meteor", "bloom", "glyph", "afterimage", "pixel",
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

const ANIM_TYPES: { id: AnimType; label: string; desc: string }[] = [
  { id: "melee", label: "Melee Strike", desc: "Step in, strike at close range, then recover. Best for combo hits and knockback." },
  { id: "dash", label: "Dash Attack", desc: "Launches the fighter forward before impact. Best as a combo starter or gap-closer." },
  { id: "projectile", label: "Projectile", desc: "Spawns a traveling attack using your projectile speed, range, color, effect, and sound." },
  { id: "aoe", label: "AOE Burst", desc: "Creates a radius hit around the fighter or target zone. Good for crowd control and stun." },
  { id: "buff", label: "Self Buff", desc: "Plays effects on the fighter and temporarily powers them up in the arena." },
  { id: "heal", label: "Heal", desc: "Restores HP and plays a recovery effect around the fighter." },
];

const ATTACK_TEMPLATES: (Omit<Skill, "id"> & { blurb: string; preview: EffectPreset[] })[] = [
  {
    name: "Rush Breaker", anim: "dash", damage: 34, cooldown: 3.2, range: 170,
    projSpeed: 0, duration: 0.62, effect: "slash", color: "#ff4d6d", sound: "punch-lunge",
    passive: "none", fxSpeed: 1.3, hits: 2, knockback: 520, lifesteal: 0, stun: 0.15,
    blurb: "Fast forward burst. Great as a combo starter because it closes distance and pops a second hit.",
    preview: ["trail", "slash", "spark"],
    timeline: [
      { t: 0.08, kind: "startup", intensity: 0.6 },
      { t: 0.2, kind: "sound", payload: "punch-lunge", intensity: 1 },
      { t: 0.28, kind: "spawn-fx", payload: "trail", intensity: 1.2 },
      { t: 0.42, kind: "damage", intensity: 1 },
      { t: 0.45, kind: "spawn-fx", payload: "slash", intensity: 1.1 },
      { t: 0.72, kind: "recovery", intensity: 0.5 },
    ],
  },
  {
    name: "Arc Projectile", anim: "projectile", damage: 26, cooldown: 2.6, range: 520,
    projSpeed: 780, duration: 0.74, effect: "vortex", color: "#62e7ff", sound: "throw-swing",
    passive: "none", fxSpeed: 1, hits: 1, knockback: 340, lifesteal: 0, stun: 0,
    blurb: "Throws a custom projectile. In game it travels with your authored speed, effect, sound, and damage.",
    preview: ["vortex", "ring", "stars"],
    timeline: [
      { t: 0.12, kind: "startup", intensity: 0.7 },
      { t: 0.28, kind: "sound", payload: "throw-swing", intensity: 1 },
      { t: 0.34, kind: "spawn-projectile", payload: "vortex", intensity: 1.1 },
      { t: 0.38, kind: "spawn-fx", payload: "ring", intensity: 0.7 },
      { t: 0.72, kind: "recovery", intensity: 0.5 },
    ],
  },
  {
    name: "Ground Eruption", anim: "aoe", damage: 42, cooldown: 7.5, range: 180,
    projSpeed: 0, duration: 1, effect: "geyser", color: "#ffb13b", sound: "detroit-smash",
    passive: "none", fxSpeed: 0.85, hits: 3, knockback: 720, lifesteal: 0, stun: 0.35,
    blurb: "Short-range area burst. Best when enemies crowd you; launches and stuns on impact.",
    preview: ["shockwave", "geyser", "nova"],
    timeline: [
      { t: 0.1, kind: "startup", intensity: 1 },
      { t: 0.22, kind: "screenshake", intensity: 1.4 },
      { t: 0.32, kind: "spawn-fx", payload: "shockwave", intensity: 1.1 },
      { t: 0.43, kind: "damage", intensity: 1.3 },
      { t: 0.45, kind: "spawn-fx", payload: "geyser", intensity: 1.5 },
      { t: 0.48, kind: "sound", payload: "detroit-smash", intensity: 1 },
      { t: 0.82, kind: "recovery", intensity: 0.6 },
    ],
  },
  {
    name: "Black Flash Chain", anim: "melee", damage: 56, cooldown: 8.5, range: 95,
    projSpeed: 0, duration: 0.86, effect: "blackflash", color: "#e11d48", sound: "black-flash",
    passive: "reservoir", fxSpeed: 1.45, hits: 4, knockback: 980, lifesteal: 0.08, stun: 0.45,
    blurb: "Heavy multi-hit finisher. Uses layered black/red burst effects, hitstop, lifesteal, and big knockback.",
    preview: ["blackflash", "crimson", "nova"],
    timeline: [
      { t: 0.08, kind: "startup", intensity: 0.8 },
      { t: 0.22, kind: "sound", payload: "black-flash", intensity: 1 },
      { t: 0.28, kind: "hitstop", intensity: 1.5 },
      { t: 0.34, kind: "damage", intensity: 1.2 },
      { t: 0.36, kind: "spawn-fx", payload: "blackflash", intensity: 1.6 },
      { t: 0.42, kind: "spawn-fx", payload: "crimson", intensity: 1.1 },
      { t: 0.6, kind: "screenshake", intensity: 1.4 },
      { t: 0.78, kind: "recovery", intensity: 0.7 },
    ],
  },
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
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const [loopPreview, setLoopPreview] = useState(true);
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
    localStorage.setItem("anif.installed.sounds.v1", JSON.stringify(mod.customSounds ?? {}));
    flash(`${activeFighter.name} installed in Fighters menu`);
  }, [activeFighter, installed, mod.customSounds]);

  // ---- Instant Test in Arena: install + jump to duel ----
  const testInArena = useCallback(() => {
    if (!activeFighter) return;
    if (!activeFighter.spriteDataUrl) { flash("Upload a sprite first"); return; }
    const next = [...installed.filter((f) => f.id !== activeFighter.id), activeFighter];
    setInstalled(next);
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(next));
    localStorage.setItem("anif.installed.sounds.v1", JSON.stringify(mod.customSounds ?? {}));
    try { localStorage.setItem("anif.test.duel", `custom_${activeFighter.id}`); } catch {}
    flash("Launching duel test…");
    setTimeout(() => navigate({ to: "/", search: { duel: `custom_${activeFighter.id}` } as never }), 250);
  }, [activeFighter, installed, navigate, mod.customSounds]);


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
  const applyTemplate = (tpl: (typeof ATTACK_TEMPLATES)[number]) => {
    if (!activeSkill) return;
    updateSkill((s) => ({ ...s, ...tpl, id: s.id }));
    setPreviewT(0);
    setPlaying(true);
    flash(`${tpl.name} template applied`);
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
          if (nt >= 1) {
            lastSoundTRef.current = -1;
            if (!loopPreview) setPlaying(false);
            return loopPreview ? 0 : 1;
          }
          lastSoundTRef.current = nt;
          return nt;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, activeSkill, playSoundPreview, loopPreview]);

  // ---- Render ----
  return (
    <div
      ref={scrollRef}
      className="h-screen w-full overflow-y-auto overflow-x-hidden text-white builder-shell"
      style={{ fontFamily: "Chakra Petch, system-ui, sans-serif" }}
    >
      <FxKeyframes />
      <header className="builder-header grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-3 sm:px-5 py-3 sm:py-4 border-b sticky top-0 z-30 backdrop-blur"
        style={{ borderColor: "#1d1d2a", background: "rgba(10,10,18,0.85)" }}>

        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="px-3 py-1.5 rounded text-xs tracking-widest shrink-0"
            style={{ background: "#1b1b28", border: "1px solid #2c2c40" }}>← ARENA</Link>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.35em] opacity-60">Workshop</div>
            <div className="text-base sm:text-xl font-bold tracking-wider truncate">Fighter & Skill Builder</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-start md:justify-end items-center max-w-full">
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

      <div className="grid gap-4 p-3 sm:p-4 grid-cols-1 lg:[grid-template-columns:260px_minmax(0,1fr)] xl:[grid-template-columns:260px_minmax(0,1fr)_320px]">
        {/* Fighters list */}
        <aside className="rounded-lg p-3" style={panelStyle()}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs tracking-widest opacity-70">FIGHTERS</div>
            <button className="text-xs px-2 py-1 rounded" style={btnStyle("#1f2937")} onClick={addFighter}>+ NEW</button>
          </div>
          <div className="flex flex-col gap-2 max-h-[34vh] lg:max-h-[62vh] overflow-y-auto pr-1">
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
                  <section className="mb-4 rounded-lg p-3" style={subPanelStyle()}>
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] gap-3 items-start">
                      <div>
                        <Label>Move Name</Label>
                        <input value={activeSkill.name}
                          onChange={(e) => updateSkill((s) => ({ ...s, name: e.target.value }))}
                          className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-3 py-2 text-base font-bold" />
                      </div>
                      <div>
                        <Label>Attack Type</Label>
                        <select value={activeSkill.anim}
                          onChange={(e) => updateSkill((s) => ({ ...s, anim: e.target.value as AnimType }))}
                          className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-3 py-2 text-sm">
                          {ANIM_TYPES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </select>
                        <p className="mt-1 text-[10px] leading-snug opacity-60">{ANIM_TYPES.find((a) => a.id === activeSkill.anim)?.desc}</p>
                      </div>
                    </div>
                    <AttackTypePreview skill={activeSkill} t={previewT} />
                  </section>

                  <section className="mb-4 rounded-lg p-3" style={subPanelStyle()}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Label>Attack Templates — hover for how it works</Label>
                      <span className="text-[10px] opacity-50">Click one to replace this move</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                      {ATTACK_TEMPLATES.map((tpl) => (
                        <button key={tpl.name} type="button" title={tpl.blurb}
                          onClick={() => applyTemplate(tpl)}
                          className="group relative h-28 overflow-hidden rounded text-left p-2"
                          style={{ background: "#0d0d14", border: "1px solid #2a2a3a" }}>
                          <div className="absolute inset-0 opacity-80">
                            {tpl.preview.map((p, i) => <FxBlob key={p + i} preset={p} color={tpl.color} intensity={0.65 + i * 0.18} playing fxSpeed={tpl.fxSpeed ?? 1} />)}
                          </div>
                          <div className="relative z-10 font-bold text-xs tracking-wider">{tpl.name}</div>
                          <div className="relative z-10 mt-1 text-[10px] opacity-70">{tpl.anim.toUpperCase()} • {tpl.damage} DMG • {tpl.cooldown}s</div>
                          <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform p-2 text-[10px] leading-snug"
                            style={{ background: "rgba(0,0,0,0.86)" }}>{tpl.blurb}</div>
                        </button>
                      ))}
                    </div>
                  </section>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 rounded-lg p-3" style={subPanelStyle()}>
                    <div className="hidden">
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
                  <div className="mb-4 rounded-lg p-3" style={subPanelStyle()}>
                    <Label>Effect Preset (live previews — click to choose)</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2">
                      {EFFECT_PRESETS.map((e) => (
                        <button key={e}
                          onClick={() => updateSkill((s) => ({ ...s, effect: e }))}
                          className="relative h-20 rounded overflow-hidden"
                          style={{
                            background: "#0d0d14",
                            border: `1px solid ${activeSkill.effect === e ? activeSkill.color : "#2a2a3a"}`,
                            boxShadow: activeSkill.effect === e ? `0 0 12px ${activeSkill.color}66` : "none",
                          }}>
                          <FxBlob preset={e} color={activeSkill.color} intensity={1} playing fxSpeed={activeSkill.fxSpeed ?? 1} />
                          <div className="absolute bottom-0 inset-x-0 text-[9px] uppercase tracking-wider text-center py-0.5"
                            style={{ background: "rgba(0,0,0,0.6)" }}>{e}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 rounded-lg p-3" style={subPanelStyle()}>
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

                  <section className="rounded-lg p-3" style={subPanelStyle()}>
                  <TimelineEditor
                    skill={activeSkill}
                    previewT={previewT}
                    playing={playing}
                    loopPreview={loopPreview}
                    soundNames={soundNames}
                    onPlaySound={playSoundPreview}
                    onPlayToggle={() => setPlaying((p) => !p)}
                    onLoopToggle={() => setLoopPreview((p) => !p)}
                    onRestart={() => { setPreviewT(0); lastSoundTRef.current = -1; setPlaying(true); }}
                    onScrub={(t) => { setPlaying(false); setPreviewT(t); lastSoundTRef.current = t; }}
                    onChange={(timeline) => updateSkill((s) => ({ ...s, timeline }))}
                  />
                  </section>

                  <PreviewPane skill={activeSkill} t={previewT} />
                </>
              )}
            </>
          ) : <div className="opacity-60">No fighter selected.</div>}
        </main>

        {/* Right: Inspector */}
        <aside className="rounded-lg p-3 flex flex-col gap-3 lg:col-span-2 xl:col-span-1" style={panelStyle()}>
          <div className="text-xs tracking-widest opacity-70">MOD INSPECTOR</div>
          <textarea readOnly value={JSON.stringify(mod, null, 2)}
            className="bg-[#0d0d14] text-[10px] font-mono p-2 rounded border h-40 xl:h-[400px]"
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

      {/* Floating scroll buttons */}
      <div className="fixed right-3 bottom-16 z-40 flex flex-col gap-2">
        <button title="Scroll to top" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
          className="w-10 h-10 rounded-full text-base" style={{ ...btnStyle("#1b1b28"), boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>↑</button>
        <button title="Scroll to bottom" onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
          className="w-10 h-10 rounded-full text-base" style={{ ...btnStyle("#1b1b28"), boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>↓</button>
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

const KEYFRAME_DESCRIPTIONS: Record<Keyframe["kind"], string> = {
  startup: "Anticipation frames before the attack becomes dangerous.",
  active: "The move is visually active; use this to hold a pose or beam window.",
  recovery: "End lag after the move; longer recovery makes whiffs easier to punish.",
  "spawn-fx": "Adds a visual effect layer at this exact moment.",
  "spawn-projectile": "Launches the authored projectile effect in projectile skills.",
  damage: "Main hit timing. In the arena this controls when melee damage checks feel active.",
  sound: "Plays a built-in or uploaded custom sound at this timestamp.",
  screenshake: "Adds camera shake in-game and a punchier preview beat.",
  hitstop: "Adds a freeze-frame impact feel for heavy attacks.",
};

function AttackTypePreview({ skill, t }: { skill: Skill; t: number }) {
  const ease = 1 - Math.pow(1 - Math.min(1, t), 3);
  const attackerX =
    skill.anim === "projectile" ? 26 :
    skill.anim === "aoe" ? 34 :
    skill.anim === "buff" || skill.anim === "heal" ? 32 :
    26 + ease * (skill.anim === "dash" ? 44 : 22);
  const projX = 38 + ease * 46;
  // Predict "impact" moment: when damage keyframe crosses OR when melee reaches target
  const impactT = skill.timeline.find((k) => k.kind === "damage")?.t
    ?? (skill.anim === "melee" || skill.anim === "dash" ? 0.55 : skill.anim === "projectile" ? 0.85 : 0.5);
  const isHit = Math.abs(t - impactT) < 0.08 && t > 0.05;
  const targetLean = isHit ? (skill.anim === "buff" || skill.anim === "heal" ? 0 : -14) : 0;
  const attackerLean = (skill.anim === "melee" || skill.anim === "dash") ? (ease * 12 - (isHit ? 0 : 0)) : 0;
  const activeFx = skill.timeline.filter((k) => Math.abs(k.t - t) < 0.09 && (k.kind === "spawn-fx" || k.kind === "spawn-projectile" || k.kind === "damage"));
  return (
    <div className="mt-3 rounded overflow-hidden relative" style={{ height: 170, background: "linear-gradient(180deg,#090914 0%,#14101e 70%,#1c1230 100%)", border: "1px solid #24243a" }}>
      <div className="absolute inset-0 opacity-30" style={{ background: "repeating-linear-gradient(90deg, rgba(122,85,214,0.08) 0 1px, transparent 1px 40px)" }} />
      <div className="absolute inset-x-0 bottom-5 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }} />
      <div className="absolute inset-x-0 bottom-0 h-5" style={{ background: "linear-gradient(180deg, transparent, rgba(122,85,214,0.18))" }} />
      <div className="absolute top-2 left-3 text-[10px] uppercase tracking-widest opacity-55">Attack Type Preview</div>
      <DummyFigure x={attackerX} y={110} label="dummy" scale={0.9} lean={attackerLean}
        glow={skill.anim === "buff" || skill.anim === "heal" ? skill.color : (skill.anim === "melee" || skill.anim === "dash") ? skill.color : undefined} />
      <DummyFigure x={78} y={110} label="target" red flip scale={0.9} lean={targetLean} hit={isHit} />
      {(skill.anim === "projectile" || activeFx.some((k) => k.kind === "spawn-projectile")) && (
        <div className="absolute" style={{ left: `${projX}%`, top: 70, width: 58, height: 58, transform: "translate(-50%,-50%)" }}>
          <FxBlob preset={skill.effect} color={skill.color} intensity={1} playing fxSpeed={skill.fxSpeed ?? 1} />
        </div>
      )}
      {(skill.anim === "aoe" || activeFx.length > 0) && activeFx.slice(0, 5).map((k, i) => (
        <div key={i} className="absolute" style={{ left: `${skill.anim === "aoe" ? 50 + i * 5 : 68}%`, top: 74, width: 78, height: 78, transform: "translate(-50%,-50%)" }}>
          <FxBlob preset={(k.payload as EffectPreset) || skill.effect} color={skill.color} intensity={k.intensity ?? 1} playing fxSpeed={skill.fxSpeed ?? 1} />
        </div>
      ))}
      {(skill.anim === "melee" || skill.anim === "dash") && (
        <div className="absolute" style={{ left: `${54 + ease * 18}%`, top: 74, width: 78, height: 78, transform: "translate(-50%,-50%)" }}>
          <FxBlob preset={skill.effect} color={skill.color} intensity={0.9} playing fxSpeed={skill.fxSpeed ?? 1} />
        </div>
      )}
      {isHit && (
        <div className="absolute pointer-events-none" style={{ left: "72%", top: 60, transform: "translate(-50%,-50%)", fontFamily: "Chakra Petch", fontWeight: 900, fontSize: 20, color: "#fff", textShadow: "0 0 8px #ff3a3a, 2px 2px 0 #000", animation: "layer-in 0.35s ease-out" }}>
          -{Math.max(1, Math.round((skill.damage ?? 10) / (skill.hits ?? 1)))}
        </div>
      )}
      <div className="absolute bottom-2 left-3 right-3 grid grid-cols-3 gap-2 text-[10px] opacity-70">
        <span>{ANIM_TYPES.find((a) => a.id === skill.anim)?.label}</span>
        <span>{skill.damage} dmg · {skill.hits ?? 1} hit</span>
        <span className="text-right">{skill.cooldown}s cd</span>
      </div>
    </div>
  );
}


function DummyFigure({ x, y, color, label, glow, hit, lean = 0, flip = false, scale = 1, red = false }: {
  x: number; y: number; color?: string; label: string; glow?: string;
  hit?: boolean; lean?: number; flip?: boolean; scale?: number; red?: boolean;
}) {
  const w = 44 * scale;
  const h = 80 * scale;
  return (
    <div className={`absolute ${hit ? "dummy-hit-flash" : ""}`}
      style={{
        left: `${x}%`, top: y,
        transform: `translate(-50%,-100%) rotate(${lean}deg) ${flip ? "scaleX(-1)" : ""}`,
        transformOrigin: "50% 100%",
        width: w, height: h,
        filter: glow ? `drop-shadow(0 0 12px ${glow})` : undefined,
        transition: "transform 220ms cubic-bezier(0.34,1.56,0.64,1)",
      }}>
      <img src={dummySprite} alt="" draggable={false}
        style={{
          width: "100%", height: "100%", objectFit: "contain",
          imageRendering: "pixelated",
          filter: red
            ? "brightness(0.9) sepia(1) hue-rotate(-40deg) saturate(4) drop-shadow(0 0 6px #ff3a3a)"
            : color ? `drop-shadow(0 0 6px ${color})` : undefined,
        }} />
      <div className="absolute left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-wider opacity-55 whitespace-nowrap"
        style={{ top: h + 2, transform: `translateX(-50%) ${flip ? "scaleX(-1)" : ""}` }}>{label}</div>
    </div>
  );
}


function TimelineEditor({
  skill, previewT, playing, loopPreview, soundNames, onPlayToggle, onLoopToggle, onRestart, onScrub, onChange, onPlaySound,
}: {
  skill: Skill; previewT: number; playing: boolean; loopPreview: boolean;
  soundNames: string[];
  onPlayToggle: () => void;
  onLoopToggle: () => void;
  onRestart: () => void;
  onScrub: (t: number) => void;
  onChange: (timeline: Keyframe[]) => void;
  onPlaySound: (name: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [activeLayer, setActiveLayer] = useState<string>("all");
  const dragStartRef = useRef<{ x: number; t: number; moved: boolean } | null>(null);
  const layers = useMemo(() => {
    const names = Array.from(new Set(skill.timeline.map((k) => k.layer ?? "base")));
    return ["all", ...names];
  }, [skill.timeline]);
  const visibleTimeline = skill.timeline
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => activeLayer === "all" || (k.layer ?? "base") === activeLayer);

  const addKeyframe = (kind: Keyframe["kind"]) => {
    const kf: Keyframe = {
      t: 0.5, kind,
      payload: kind === "spawn-fx" ? skill.effect : kind === "sound" ? skill.sound : undefined,
      intensity: 1,
      layer: activeLayer === "all" ? "base" : activeLayer,
    };
    onChange([...skill.timeline, kf].sort((a, b) => a.t - b.t));
  };
  const addLayer = () => {
    // Add 3 staggered spawn-fx layers around mid-skill to make compound effects easy
    const layerName = `layer ${layers.filter((l) => l !== "all").length + 1}`;
    const newLayer: Keyframe[] = [
      { t: 0.32, kind: "spawn-fx", payload: skill.effect, intensity: 1, layer: layerName },
      { t: 0.4, kind: "spawn-fx", payload: "ring", intensity: 0.8, layer: layerName },
      { t: 0.48, kind: "spawn-fx", payload: "spark", intensity: 0.9, layer: layerName },
    ];
    setActiveLayer(layerName);
    onChange([...skill.timeline, ...newLayer].sort((a, b) => a.t - b.t));
  };
  const removeKeyframe = (idx: number) => {
    onChange(skill.timeline.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };
  const updateKf = (idx: number, patch: Partial<Keyframe>) =>
    onChange(skill.timeline.map((k, i) => (i === idx ? { ...k, ...patch } : k)));

  // Drag with movement threshold; if pointer barely moved, treat as click → open popover
  useEffect(() => {
    if (dragIdx === null) return;
    const onMove = (e: PointerEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const start = dragStartRef.current;
      if (start && Math.abs(e.clientX - start.x) > 4) start.moved = true;
      if (start?.moved) {
        const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        updateKf(dragIdx, { t });
      }
    };
    const onUp = () => {
      const start = dragStartRef.current;
      if (start && !start.moved) {
        setSelectedIdx(dragIdx);
      }
      setDragIdx(null);
      dragStartRef.current = null;
    };
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

  const selectedKf = selectedIdx !== null ? skill.timeline[selectedIdx] : null;
  const selectedDesc = selectedKf ? KEYFRAME_DESCRIPTIONS[selectedKf.kind] : "Select a marker or layer row to edit timing, payload, and intensity.";

  return (
    <div className="mt-2 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <Label>Dynamic Skill Timeline ({skill.duration.toFixed(1)}s)</Label>
          <p className="text-[10px] opacity-60 leading-snug">Layers work like art layers: switch rows to isolate FX, then select a marker to edit it in the inspector.</p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          <button className="text-[10px] px-2 py-1 rounded" style={btnStyle("#1f2937")} onClick={onRestart}>↺ REPLAY</button>
          <button className="text-[10px] px-2 py-1 rounded" style={btnStyle("#16213e")} onClick={onPlayToggle}>
            {playing ? "❚❚ PAUSE" : "▶ PLAY"}
          </button>
          <button className="text-[10px] px-2 py-1 rounded" style={btnStyle(loopPreview ? "#1c3a2a" : "#3a2a1c")} onClick={onLoopToggle}>
            {loopPreview ? "LOOP ON" : "ONE PLAY"}
          </button>
          <button className="text-[10px] px-2 py-1 rounded" style={btnStyle("#3b2469")} onClick={addLayer} title="Add a compound 3-layer FX burst">
            + LAYER
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[180px_minmax(0,1fr)_280px] gap-3">
        <div className="rounded p-2" style={{ background: "#0d0d14", border: "1px solid #22222c" }}>
          <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2">Layers</div>
          <div className="flex xl:flex-col gap-1 overflow-x-auto xl:overflow-visible pb-1 xl:pb-0">
            {layers.map((layer) => {
              const count = layer === "all" ? skill.timeline.length : skill.timeline.filter((k) => (k.layer ?? "base") === layer).length;
              return (
                <button key={layer} type="button" onClick={() => setActiveLayer(layer)}
                  className="shrink-0 xl:w-full text-left px-2 py-1.5 rounded text-[11px]"
                  style={{ background: activeLayer === layer ? "#2b1f4a" : "#15151f", border: `1px solid ${activeLayer === layer ? "#7a55d6" : "#2a2a3a"}` }}>
                  <span className="font-bold">{layer === "all" ? "All layers" : layer}</span>
                  <span className="opacity-55"> · {count}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 xl:grid-cols-1 gap-1">
            {(["startup", "active", "recovery", "spawn-fx", "spawn-projectile", "damage", "sound", "screenshake", "hitstop"] as Keyframe["kind"][]).map((k) => (
              <button key={k} className="text-[10px] px-2 py-1 rounded text-left"
                title={KEYFRAME_DESCRIPTIONS[k]}
                style={{ background: KIND_COLORS[k], color: "#000", border: "none" }}
                onClick={() => addKeyframe(k)}>+ {k}</button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div
            ref={trackRef}
            onPointerDown={onTrackClick}
            className="relative h-28 rounded select-none touch-none overflow-hidden"
            style={{
              background: "repeating-linear-gradient(90deg, #11111a 0, #11111a 9.5%, #1a1a26 10%)",
              border: "1px solid #2a2a3a",
              boxShadow: "inset 0 0 28px rgba(122,85,214,0.08)",
            }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <div key={tick} className="absolute top-0 bottom-0 border-l border-white/10" style={{ left: `${tick * 100}%` }}>
                <span className="absolute top-1 left-1 text-[9px] opacity-45">{(tick * skill.duration).toFixed(1)}s</span>
              </div>
            ))}
            <div className="absolute top-0 bottom-0 w-px bg-white pointer-events-none z-10"
              style={{ left: `${previewT * 100}%`, boxShadow: "0 0 8px #fff" }} />
            {visibleTimeline.map(({ k, i }, row) => (
              <div key={i}
                onPointerDown={(e) => {
                  e.stopPropagation(); e.preventDefault();
                  dragStartRef.current = { x: e.clientX, t: k.t, moved: false };
                  setDragIdx(i);
                }}
                onDoubleClick={(e) => { e.stopPropagation(); removeKeyframe(i); }}
                title={`${k.kind} — ${KEYFRAME_DESCRIPTIONS[k.kind]}`}
                className="absolute w-5 rounded-sm cursor-grab touch-none"
                style={{
                  left: `calc(${k.t * 100}% - 10px)`,
                  top: 22 + (row % 3) * 25,
                  height: 20,
                  background: KIND_COLORS[k.kind],
                  boxShadow: dragIdx === i || selectedIdx === i ? `0 0 14px ${KIND_COLORS[k.kind]}` : "0 0 6px rgba(0,0,0,0.6)",
                  border: selectedIdx === i || dragIdx === i ? "1px solid #fff" : "none",
                }}>
                <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 text-[8px] text-white/60 whitespace-nowrap">{k.kind.replace("spawn-", "")}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
            {visibleTimeline.map(({ k, i }) => (
              <button key={i} type="button" className="p-2 rounded text-xs cursor-pointer text-left" style={{ background: selectedIdx === i ? "#1d1530" : "#11111a", border: `1px solid ${selectedIdx === i ? "#5b3fa3" : "#22222c"}` }}
                onClick={() => setSelectedIdx(i)}>
                <div className="flex items-center justify-between mb-1">
                  <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: KIND_COLORS[k.kind], color: "#000" }}>
                    {k.kind}
                  </span>
                  <span className="text-[10px] opacity-50">{k.layer ?? "base"}</span>
                </div>
                <div className="text-[10px] mb-1">{(k.t * skill.duration).toFixed(2)}s · {(k.intensity ?? 1).toFixed(1)}x</div>
                <div className="h-1 rounded" style={{ background: "#0a0a10" }}>
                  <div className="h-full rounded" style={{ width: `${k.t * 100}%`, background: KIND_COLORS[k.kind] }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded p-3 min-h-[280px]" style={{ background: "#0d0d14", border: "1px solid #22222c" }}>
          <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2">Keyframe Inspector</div>
          <p className="text-[10px] opacity-60 leading-snug mb-3">{selectedDesc}</p>
          {selectedKf && selectedIdx !== null ? (
            <div>
            <div className="flex items-center justify-between mb-2">
              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: KIND_COLORS[selectedKf.kind], color: "#000" }}>
                {selectedKf.kind}
              </span>
              <button className="text-xs opacity-70 hover:opacity-100" onClick={() => setSelectedIdx(null)}>✕</button>
            </div>
            <Label>Kind</Label>
            <select value={selectedKf.kind}
              onChange={(e) => updateKf(selectedIdx, { kind: e.target.value as Keyframe["kind"] })}
              className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-1.5 py-1 text-xs mb-2">
              {(Object.keys(KIND_COLORS) as Keyframe["kind"][]).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <Label>Layer</Label>
            <input value={selectedKf.layer ?? "base"}
              onChange={(e) => updateKf(selectedIdx, { layer: e.target.value || "base" })}
              className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-1.5 py-1 text-xs mb-2" />
            <Label>Time ({(selectedKf.t * skill.duration).toFixed(2)}s)</Label>
            <input type="range" min={0} max={1} step={0.01} value={selectedKf.t}
              onChange={(e) => updateKf(selectedIdx, { t: Number(e.target.value) })}
              className="w-full accent-purple-400 mb-2" />
            <Label>Intensity ({(selectedKf.intensity ?? 1).toFixed(2)})</Label>
            <input type="range" min={0.1} max={3} step={0.05} value={selectedKf.intensity ?? 1}
              onChange={(e) => updateKf(selectedIdx, { intensity: Number(e.target.value) })}
              className="w-full accent-purple-400 mb-2" />
            {(selectedKf.kind === "spawn-fx" || selectedKf.kind === "spawn-projectile") && (
              <>
                <Label>Effect Preset</Label>
                <select value={selectedKf.payload ?? ""}
                  onChange={(e) => updateKf(selectedIdx, { payload: e.target.value })}
                  className="w-full bg-[#15151f] border border-[#2a2a3a] rounded px-1.5 py-1 text-xs mb-2">
                  {EFFECT_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <div className="relative h-16 rounded overflow-hidden" style={{ background: "#08080c", border: "1px solid #22222c" }}>
                  <FxBlob preset={(selectedKf.payload as EffectPreset) ?? skill.effect} color={skill.color} intensity={selectedKf.intensity ?? 1} playing fxSpeed={skill.fxSpeed ?? 1} />
                </div>
              </>
            )}
            {selectedKf.kind === "sound" && (
              <>
                <Label>Sound</Label>
                <div className="flex items-center gap-1">
                  <select value={selectedKf.payload ?? ""}
                    onChange={(e) => updateKf(selectedIdx, { payload: e.target.value })}
                    className="flex-1 min-w-0 bg-[#15151f] border border-[#2a2a3a] rounded px-1.5 py-1 text-xs">
                    {soundNames.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button onClick={() => onPlaySound(selectedKf.payload ?? "")}
                    className="text-[10px] px-1.5 py-1 rounded" style={btnStyle("#1c3a2a")}>▶</button>
                </div>
              </>
            )}
            <div className="flex justify-between mt-3">
              <button className="text-[10px] px-2 py-1 rounded" style={btnStyle("#3a1f1f")} onClick={() => removeKeyframe(selectedIdx)}>DELETE</button>
              <button className="text-[10px] px-2 py-1 rounded" style={btnStyle("#1f2937")} onClick={() => setSelectedIdx(null)}>DONE</button>
            </div>
            </div>
          ) : <div className="text-xs opacity-50">No marker selected.</div>}
        </div>
      </div>
    </div>
  );
}

function PreviewPane({ skill, t }: { skill: Skill; t: number }) {
  const active = skill.timeline.filter((k) => Math.abs(k.t - t) < 0.08 && (k.kind === "spawn-fx" || k.kind === "active" || k.kind === "damage"));
  const attackerX = 22 + (skill.anim === "dash" ? 36 * t : skill.anim === "melee" ? 18 * t : 0);
  const projectileX = 38 + 44 * t;
  return (
    <div className="mt-3 rounded relative overflow-hidden"
      style={{ height: 220, background: "radial-gradient(500px 140px at 50% 45%, rgba(122,85,214,0.18), transparent 60%), linear-gradient(180deg,#0c0c14,#15101f)", border: "1px solid #1f1f2c" }}>
      <div className="absolute inset-x-0 bottom-8 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }} />
      <DummyFigure x={attackerX + 22} y={190} label="caster" scale={1.1} glow={skill.color} />
      <DummyFigure x={78} y={190} label="enemy" red flip scale={1.1} hit={active.some((k) => k.kind === "damage")} lean={active.some((k) => k.kind === "damage") ? -14 : 0} />
      {skill.anim === "projectile" && (
        <div className="absolute" style={{ left: `${projectileX}%`, top: 92, width: 70, height: 70, transform: "translate(-50%,-50%)" }}>
          <FxBlob preset={skill.effect} color={skill.color} intensity={1} playing fxSpeed={skill.fxSpeed ?? 1} />
        </div>
      )}
      {(active.length === 0
        ? [<div key="idle" className="absolute" style={{ left: "58%", top: 92, width: 80, height: 80 }}><FxBlob preset={skill.effect} color={skill.color} intensity={0.55} playing fxSpeed={skill.fxSpeed ?? 1} /></div>]
        : active.map((k, i) => (
            <div key={i} className="absolute" style={{ left: `${58 + i * 6}%`, top: 92, width: 90, height: 90 }}>
              <FxBlob preset={(k.payload as EffectPreset) ?? skill.effect} color={skill.color} intensity={k.intensity ?? 1} playing fxSpeed={skill.fxSpeed ?? 1} />
            </div>
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
      @keyframes fx-neon-scan { 0%{transform:translate(-140%,-50%) skewX(-18deg);opacity:0} 40%{opacity:1} 100%{transform:translate(70%,-50%) skewX(-18deg);opacity:0} }
      @keyframes fx-portal-open { 0%{transform:translate(-50%,-50%) rotate(0deg) scale(0.2);opacity:0} 35%{opacity:1} 100%{transform:translate(-50%,-50%) rotate(360deg) scale(1.35);opacity:0.25} }
      @keyframes fx-meteor-drop { 0%{transform:translate(-120%,-180%) rotate(-35deg);opacity:0} 30%{opacity:1} 100%{transform:translate(40%,40%) rotate(-35deg);opacity:0} }
      @keyframes fx-pixel-pop { 0%{transform:translate(-50%,-50%) scale(0.2);opacity:0} 25%{opacity:1} 100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(1);opacity:0} }
    `}</style>
  );
}

function FxBlob({ preset, color, intensity, playing, fxSpeed = 1 }: { preset: EffectPreset; color: string; intensity: number; playing?: boolean; fxSpeed?: number }) {
  const size = 40 + 60 * intensity;
  const anim = playing ? "" : " paused";
  const common: React.CSSProperties = {
    position: "absolute", left: "50%", top: "50%",
    transform: "translate(-50%,-50%)", pointerEvents: "none",
    animationDuration: fxSpeed !== 1 ? `calc(1s / ${fxSpeed})` : undefined,
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

  if (preset === "nova") {
    return (
      <>
        <div style={{ ...common, width: size * 2.4, height: size * 2.4, borderRadius: "50%",
          background: `radial-gradient(circle, ${color} 0%, transparent 60%)`, filter: "blur(4px)",
          animation: `fx-ring-pulse 0.9s infinite ease-out${anim}` }} />
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (i / 16) * 360;
          return <div key={i} style={{
            ...common, width: 2, height: size * 1.1, background: color,
            boxShadow: `0 0 10px ${color}`, ["--a" as never]: `${a}deg`,
            animation: `fx-burst-out 0.7s ${(i % 3) * 0.05}s infinite ease-out${anim}`,
          } as React.CSSProperties} />;
        })}
        <div style={{ ...common, width: size * 0.8, height: size * 0.8, borderRadius: "50%",
          background: "#fff", filter: "blur(6px)", animation: `fx-flicker 0.18s infinite${anim}` }} />
      </>
    );
  }

  if (preset === "blackhole") {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            ...common, width: size * (2 - i * 0.3), height: size * (2 - i * 0.3),
            borderRadius: "50%", border: `1px solid ${color}`, opacity: 0.5 - i * 0.08,
            animation: `${i % 2 ? "fx-rotate" : "fx-rotate-slow"} ${1 + i * 0.5}s linear infinite${anim}`,
          }} />
        ))}
        <div style={{ ...common, width: size * 0.9, height: size * 0.9, borderRadius: "50%",
          background: "#000", boxShadow: `0 0 24px ${color}, inset 0 0 18px ${color}` }} />
        <div style={{ ...common, width: size * 0.3, height: size * 0.3, borderRadius: "50%",
          background: color, filter: "blur(3px)", animation: `fx-flicker 0.25s infinite${anim}` }} />
      </>
    );
  }

  if (preset === "chains") {
    return (
      <>
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * 360;
          return (
            <div key={i} style={{
              ...common, width: size * 1.4, height: 6,
              background: `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 12px)`,
              boxShadow: `0 0 6px ${color}`,
              ["--a" as never]: `${a}deg`,
              animation: `fx-burst-out 1s ${i * 0.06}s infinite ease-out${anim}`,
            } as React.CSSProperties} />
          );
        })}
      </>
    );
  }

  if (preset === "geyser") {
    return (
      <>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{
            ...common, width: 4 + (i % 3) * 2, height: size * (1.2 + (i % 4) * 0.2),
            top: "70%", left: `${50 + (i - 5) * 6}%`,
            background: `linear-gradient(180deg, transparent, ${color})`,
            filter: "blur(1px)", boxShadow: `0 0 10px ${color}`,
            animation: `fx-smoke-rise 0.9s ${(i * 0.07)}s infinite ease-out${anim}`,
          }} />
        ))}
        <div style={{ ...common, width: size * 1.8, height: 8, top: "78%", borderRadius: 6,
          background: `radial-gradient(ellipse, ${color}, transparent)`, filter: "blur(2px)" }} />
      </>
    );
  }

  if (preset === "runes") {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            ...common, width: size * (1.4 - i * 0.3), height: size * (1.4 - i * 0.3),
            border: `1.5px solid ${color}`, borderRadius: i === 1 ? 4 : "50%",
            boxShadow: `0 0 10px ${color}`, opacity: 0.8,
            animation: `${i % 2 ? "fx-rotate" : "fx-rotate-slow"} ${2.5 + i * 0.4}s linear infinite${anim}`,
          }} />
        ))}
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * 360;
          return <div key={`r${i}`} style={{
            ...common, width: 8, height: 8, background: color, borderRadius: 1,
            ["--a" as never]: `${a}deg`, ["--r" as never]: `${size * 0.55}px`,
            animation: `fx-star-twinkle 1.6s ${i * 0.1}s infinite ease-in-out${anim}`,
          } as React.CSSProperties} />;
        })}
      </>
    );
  }

  if (preset === "feathers") {
    return (
      <>
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * 360;
          return (
            <div key={i} style={{
              ...common, width: 4, height: 18,
              background: `linear-gradient(180deg, ${color}, transparent)`,
              borderRadius: "50% 50% 20% 20%", boxShadow: `0 0 6px ${color}`,
              ["--a" as never]: `${a}deg`,
              animation: `fx-petal-fall 2s ${i * 0.18}s infinite ease-in-out${anim}`,
            } as React.CSSProperties} />
          );
        })}
      </>
    );
  }

  if (preset === "neon" || preset === "laser") {
    const beams = preset === "laser" ? 5 : 3;
    return (
      <>
        {Array.from({ length: beams }).map((_, i) => (
          <div key={i} style={{
            ...common, width: size * (2.2 + i * 0.25), height: preset === "laser" ? 4 : 9,
            top: `${42 + i * 7}%`, borderRadius: 8,
            background: `linear-gradient(90deg, transparent, #fff, ${color}, transparent)`,
            boxShadow: `0 0 12px ${color}, 0 0 24px ${color}`,
            animation: `fx-neon-scan ${0.55 + i * 0.08}s ${i * 0.06}s infinite ease-out${anim}`,
          }} />
        ))}
        <div style={{ ...common, width: size * 1.2, height: size * 1.2, borderRadius: "50%", border: `1px solid ${color}`, boxShadow: `0 0 18px ${color}, inset 0 0 14px ${color}`, opacity: 0.55 }} />
      </>
    );
  }

  if (preset === "portal" || preset === "glyph") {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            ...common, width: size * (1.1 + i * 0.38), height: size * (1.1 + i * 0.38),
            borderRadius: preset === "glyph" && i === 1 ? 8 : "50%",
            border: `${2 - i * 0.3}px ${i === 2 ? "dashed" : "solid"} ${color}`,
            boxShadow: `0 0 14px ${color}`, opacity: 0.85 - i * 0.18,
            animation: `fx-portal-open ${1 + i * 0.25}s ${i * 0.08}s infinite ease-out${anim}`,
          }} />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={`g${i}`} style={{
            ...common, width: 8, height: 8, borderRadius: 2, background: color,
            ["--a" as never]: `${(i / 7) * 360}deg`, ["--r" as never]: `${size * 0.62}px`,
            animation: `fx-star-twinkle 1.25s ${i * 0.07}s infinite ease-in-out${anim}`,
          } as React.CSSProperties} />
        ))}
      </>
    );
  }

  if (preset === "meteor" || preset === "afterimage") {
    return (
      <>
        {Array.from({ length: preset === "meteor" ? 6 : 9 }).map((_, i) => (
          <div key={i} style={{
            ...common, width: size * (preset === "meteor" ? 1.1 : 1.6), height: preset === "meteor" ? 9 : 5,
            top: `${35 + i * 5}%`, opacity: 0.8 - i * 0.05,
            background: `linear-gradient(90deg, transparent, ${color}, #fff)`,
            boxShadow: `0 0 14px ${color}`,
            animation: `fx-meteor-drop ${0.55 + i * 0.06}s ${i * 0.06}s infinite ease-in${anim}`,
          }} />
        ))}
      </>
    );
  }

  if (preset === "bloom" || preset === "pixel") {
    const count = preset === "pixel" ? 18 : 12;
    return (
      <>
        {Array.from({ length: count }).map((_, i) => {
          const ang = (i / count) * Math.PI * 2;
          const dist = 22 + (i % 4) * 9;
          return <div key={i} style={{
            ...common, width: preset === "pixel" ? 7 : 10, height: preset === "pixel" ? 7 : 10,
            borderRadius: preset === "pixel" ? 0 : "50%",
            background: i % 3 === 0 ? "#fff" : color,
            boxShadow: `0 0 10px ${color}`,
            ["--dx" as never]: `${Math.cos(ang) * dist}px`, ["--dy" as never]: `${Math.sin(ang) * dist}px`,
            animation: `fx-pixel-pop ${0.75 + (i % 3) * 0.1}s ${i * 0.035}s infinite ease-out${anim}`,
          } as React.CSSProperties} />;
        })}
        <div style={{ ...common, width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle, ${color}, transparent 70%)`, filter: "blur(8px)", opacity: 0.7 }} />
      </>
    );
  }

  return <div style={{ ...common, width: size, height: size, background: color, borderRadius: 6 }} />;
}

// ---------------- styles ----------------
function panelStyle(): React.CSSProperties {
  return { background: "rgba(15,15,22,0.85)", border: "1px solid #1f1f2c", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" };
}
function subPanelStyle(): React.CSSProperties {
  return { background: "rgba(9,9,14,0.58)", border: "1px solid #222235", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" };
}
function btnStyle(bg: string): React.CSSProperties {
  return { background: bg, border: "1px solid #2a2a3a", color: "#fff", cursor: "pointer" };
}
