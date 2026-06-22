import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dummySprite from "@/assets/dummy.png";
import davidAsset from "@/assets/david.png.asset.json";
import gunAsset from "@/assets/gun.png.asset.json";
import yujiAsset from "@/assets/yuji.png.asset.json";
import sukunaAsset from "@/assets/sukuna.png.asset.json";
import dismantleAsset from "@/assets/dismantle.png.asset.json";
import tauntIcon from "@/assets/icons/taunt.png.asset.json";
import angryIcon from "@/assets/icons/angry.png.asset.json";
import chuckleIcon from "@/assets/icons/chuckle.png.asset.json";
import sndClick from "@/assets/sounds/ui-click.mp3.asset.json";
import sndPunchLunge from "@/assets/sounds/punch-lunge.mp3.asset.json";
import sndSpawn from "@/assets/sounds/spawn.mp3.asset.json";
import sndDamage from "@/assets/sounds/damage.mp3.asset.json";
import sndPunchHit from "@/assets/sounds/punch-hit.mp3.asset.json";
import sndThrow from "@/assets/sounds/throw-swing.mp3.asset.json";
import sndPistol from "@/assets/sounds/pistol.mp3.asset.json";
import sndSande from "@/assets/sounds/sandevistan.mp3.asset.json";
import sndTaunt from "@/assets/sounds/taunt.mp3.asset.json";
import sndAngry from "@/assets/sounds/angry.mp3.asset.json";
import sndChuckle from "@/assets/sounds/chuckle.mp3.asset.json";
import sndDivergent from "@/assets/sounds/divergent-hit.mp3.asset.json";
import sndBlackFlash from "@/assets/sounds/black-flash.mp3.asset.json";
import sndKnife from "@/assets/sounds/knife-slash.mp3.asset.json";
import sndSukunaTransform from "@/assets/sounds/sukuna-transform.mp3.asset.json";
import sndDismantle1 from "@/assets/sounds/dismantle-1.mp3.asset.json";
import sndDismantle2 from "@/assets/sounds/dismantle-2.mp3.asset.json";
import dekuAsset from "@/assets/deku.png.asset.json";
import sndCrackWhip from "@/assets/sounds/crack-the-whip.mp3.asset.json";
import sndFinishingHit from "@/assets/sounds/finishing-hit.mp3.asset.json";
import sndDetroitSmash from "@/assets/sounds/detroit-smash.mp3.asset.json";
import sndElectric from "@/assets/sounds/electricity.mp3.asset.json";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ani Fighters" },
      { name: "description", content: "NPC vs NPC pixel fighting sandbox." },
    ],
  }),
  component: Game,
});

const SOUNDS = {
  click: sndClick.url, punchLunge: sndPunchLunge.url, spawn: sndSpawn.url,
  damage: sndDamage.url, punchHit: sndPunchHit.url, throwSwing: sndThrow.url,
  pistol: sndPistol.url, sande: sndSande.url,
  taunt: sndTaunt.url, angry: sndAngry.url, chuckle: sndChuckle.url,
  divergent: sndDivergent.url, blackFlash: sndBlackFlash.url, knife: sndKnife.url,
  sukunaTransform: sndSukunaTransform.url, dismantle1: sndDismantle1.url, dismantle2: sndDismantle2.url,
  crackWhip: sndCrackWhip.url, finishingHit: sndFinishingHit.url, detroitSmash: sndDetroitSmash.url,
  electric: sndElectric.url,
};

function playSound(url: string, volume = 0.6): HTMLAudioElement | null {
  try {
    const a = new Audio(url);
    a.volume = volume;
    void a.play();
    return a;
  } catch { return null; }
}
function playPitched(url: string, volume = 0.6, rate = 1): HTMLAudioElement | null {
  try { const a = new Audio(url); a.volume = volume; a.playbackRate = rate; void a.play(); return a; } catch { return null; }
}
function playSoundFade(url: string, holdMs: number, fadeMs: number, volume = 0.6) {
  const a = playSound(url, volume);
  if (!a) return;
  setTimeout(() => {
    const steps = 20;
    const stepMs = fadeMs / steps;
    let i = 0;
    const t = setInterval(() => {
      i++;
      a.volume = Math.max(0, volume * (1 - i / steps));
      if (i >= steps) { clearInterval(t); try { a.pause(); } catch {} }
    }, stepMs);
  }, holdMs);
}

// Web Audio amplified playback so sounds can exceed the 0-1 HTMLAudio cap.
let __audioCtx: AudioContext | null = null;
const __bufCache: Record<string, AudioBuffer> = {};
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!__audioCtx) {
    try { __audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch { return null; }
  }
  return __audioCtx;
}
function playBoosted(url: string, gain = 8, stopAfterMs?: number) {
  const ctx = getCtx();
  if (!ctx) { playSound(url, 1); return; }
  const start = (buf: AudioBuffer) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(ctx.destination);
    src.start();
    if (stopAfterMs) {
      const t0 = ctx.currentTime + stopAfterMs / 1000;
      g.gain.setValueAtTime(gain, Math.max(ctx.currentTime, t0 - 0.25));
      g.gain.linearRampToValueAtTime(0, t0);
      try { src.stop(t0 + 0.05); } catch {}
    }
  };
  const go = () => {
    const cached = __bufCache[url];
    if (cached) { start(cached); return; }
    fetch(url).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a))
      .then((buf) => { __bufCache[url] = buf; start(buf); })
      .catch(() => playSound(url, 1));
  };
  if (ctx.state === "suspended") ctx.resume().then(go).catch(go);
  else go();
}

type FighterTypeId = "dummy" | "david" | "yuji" | "deku";



interface AbilityDef { name: string; damage: number; type: "melee" | "ranged" | "status"; cooldown: number; }
interface FighterDef {
  id: FighterTypeId; name: string; sprite: string;
  atk: number; def: number; speed: number;
  abilities: AbilityDef[]; width: number; height: number;
}

const FIGHTERS: Record<FighterTypeId, FighterDef> = {
  dummy: {
    id: "dummy", name: "Dummy", sprite: dummySprite,
    atk: 50, def: 500, speed: 1,
    abilities: [
      { name: "Punch", damage: 25, type: "melee", cooldown: 1.4 },
      { name: "Cotton Throw", damage: 25, type: "ranged", cooldown: 1.8 },
    ],
    width: 60, height: 100,
  },
  david: {
    id: "david", name: "David Martinez", sprite: davidAsset.url,
    atk: 150, def: 450, speed: 1.1,
    abilities: [
      { name: "Sandevistan", damage: 0, type: "status", cooldown: 12 },
      { name: "Shots Fired", damage: 34, type: "ranged", cooldown: 5 },
      { name: "Sandy Punch", damage: 50, type: "melee", cooldown: 8 },
    ],
    width: 64, height: 104,
  },
  yuji: {
    id: "yuji", name: "Yuji Itadori", sprite: yujiAsset.url,
    atk: 100, def: 250, speed: 1.3,
    abilities: [
      { name: "Divergent Fist", damage: 35, type: "melee", cooldown: 3 },
      { name: "Counter Strike", damage: 8, type: "status", cooldown: 5 },
    ],
    width: 64, height: 104,
  },
  deku: {
    id: "deku", name: "Deku", sprite: dekuAsset.url,
    atk: 150, def: 350, speed: 1.2,
    abilities: [
      { name: "Black Whip", damage: 0, type: "status", cooldown: 6 },
      { name: "Punch", damage: 8, type: "melee", cooldown: 15 },
      { name: "Detroit Smash", damage: 56, type: "melee", cooldown: 45 },
    ],
    width: 64, height: 104,
  },
};

// Sukuna-possessed form (Yuji below 50hp). Not a selectable slot.
const SUKUNA_NAME = "Yuji Itadori (Sukuna Possessed)";
const SUKUNA_MAX_HP = 300;


interface AfterImage { x: number; y: number; facing: 1 | -1; hue: number; life: number; }
interface Fighter {
  uid: number; type: FighterTypeId;
  x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number;
  facing: 1 | -1;
  state: "idle" | "walk" | "lunge" | "throw" | "shoot" | "hurt" | "dead" | "taunt" | "windup";
  stateTimer: number;
  // per-ability cooldowns (index aligned with FIGHTERS[type].abilities)
  abilityCd: number[];
  globalCd: number;
  hitFlash: number;
  bounce: number;
  walkPhase: number; // for wave bobbing
  onGround: boolean;
  jumpCd: number;
  jumpsLeft: number;
  decisionCd: number;
  intent: "approach" | "retreat" | "space" | "punish" | "bait";
  intentTimer: number;
  reactionDelay: number;
  // Lunge
  lungeFromX?: number; lungeToX?: number; lungeProgress?: number; lungeHit?: boolean; lungeDamage?: number; lungeFast?: boolean;
  lungeKind?: "normal" | "sandy" | "divergent" | "divergentBlack" | "deku" | "dekuFinal" | "dekuMega" | "detroit";
  // David
  sandeActive: number; // seconds remaining
  sandeHue: number;
  afterTimer: number;
  afterImages: AfterImage[];
  lastAfterX?: number; lastAfterY?: number;
  sandeAttackCd: number;
  shotsLeft: number; shotTimer: number; shotTarget?: number;
  // Yuji / Sukuna
  possessed: boolean;
  windupKind?: "divergent" | "dismantle" | "detroit";
  windupGrow: number; // 0..1 visual grow/tint progress during windup
  pendingBlack?: boolean;
  dots: { interval: number; timer: number; ticksLeft: number; dmg: number; fromFacing: 1 | -1; ownerUid?: number }[];
  stunned: number;
  counterActive: number;
  bodySlamFrom?: number;
  bodySlamDmg?: number;
  reactionIcon?: { url: string; until: number };
  tauntedBy?: number;
  tauntCd: number;
  lastDodgedFrom?: number;
  lastTrickedFrom?: number;
  punchStacks?: number;
  punchStackTimer?: number;
  punchPitch?: number;
  punchHitStack?: number;
  aerialIntent?: number;
  whip?: { mode: "enemy" | "wall"; targetUid?: number; wallX?: number; wallY?: number; t: number; phase: "extend" | "drag"; sourceY: number; dragStartX?: number; dragStartY?: number; tipX?: number; tipY?: number; selfStartX?: number; selfStartY?: number };
  passiveUsed?: boolean;
  // Yuji passive — Cursed Reservoir
  cursedStacks?: number;
  cursedFlashReady?: boolean;
  // Sukuna passive — Malevolent Shrine
  shrineCount?: number;
  // Dummy — Iron Guard sub-variant
  guardCd?: number;
  guardActive?: number;
  // David — Overclock sub-variant
  overclockCd?: number;
  overclockActive?: number;
  // Yuji — Manji Kick aerial
  manjiCd?: number;
}
interface Projectile {
  uid: number; ownerUid: number; kind: "cotton" | "bullet" | "dismantle" | "clash";
  x: number; y: number; vx: number; vy: number;
  damage: number; ttl: number;
  pierceLeft?: number; hitUids?: number[];
}
interface Effect {
  uid: number; kind: "bluefire" | "blackflash" | "cut" | "counterburst" | "greenfire" | "electric" | "shockwave" | "wallspark" | "megaring";
  x: number; y: number; life: number; maxLife: number; seed: number;
}


const GRAVITY = 2200;
const GROUND_OFFSET = 30;
const WALK_SPEED_BASE = 130;
const JUMP_VELOCITY = -680;
const HIGH_JUMP_VELOCITY = -1080; // launch high into the sky for positioning advantage
const AIR_ACCEL = 900; // mid-air drift control
const MAX_AIR_SPEED = 240;
const FAST_FALL = 900; // extra downward accel when committing to a dive
const MELEE_RANGE = 90;
const LUNGE_DISTANCE = 220;
const LUNGE_DURATION = 0.22;
const PROJECTILE_SPEED = 540;
const BULLET_SPEED = 900;
const DISMANTLE_SPEED = 1050; // fast linear piercing slash
const PUSH_RADIUS = 48; // anti-overlap separation

let __uid = 1;
const nextUid = () => __uid++;

// Rainbow hues skipping brown/grey/white/black
// Stay in saturated bands: teal 170, green 130, blue 220, yellow 55, red 0, purple 280
const HUE_CYCLE = [170, 130, 220, 55, 0, 280, 220];
function hueAt(t: number) {
  const period = 1.4;
  const pos = (t / period) * HUE_CYCLE.length;
  const i = Math.floor(pos) % HUE_CYCLE.length;
  const f = pos - Math.floor(pos);
  const a = HUE_CYCLE[i];
  const b = HUE_CYCLE[(i + 1) % HUE_CYCLE.length];
  // shortest hue interpolation
  let d = b - a;
  if (d > 180) d -= 360; if (d < -180) d += 360;
  return (a + d * f + 360) % 360;
}

type AiDifficulty = "easy" | "normal" | "hard" | "insane";

function Game() {
  const [showFighters, setShowFighters] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<FighterTypeId>("dummy");
  const [showStats, setShowStats] = useState(false);
  const [debugAi, setDebugAi] = useState(false);
  const [paused, setPaused] = useState(false);
  const [difficulty, setDifficulty] = useState<AiDifficulty>("normal");
  const [hpMult, setHpMult] = useState(1);
  const [, forceTick] = useState(0);
  const pausedRef = useRef(false);
  const difficultyRef = useRef<AiDifficulty>("normal");
  const hpMultRef = useRef(1);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { hpMultRef.current = hpMult; }, [hpMult]);
  const fightersRef = useRef<Fighter[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const effectsRef = useRef<Effect[]>([]);
  const damageNumsRef = useRef<{ uid: number; x: number; y: number; vy: number; life: number; maxLife: number; dmg: number; crit: boolean }[]>([]);
  const arenaRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const hitstopRef = useRef(0);
  const shakeRef = useRef(0);

  useEffect(() => {
    const update = () => {
      if (arenaRef.current) {
        const r = arenaRef.current.getBoundingClientRect();
        sizeRef.current = { w: r.width, h: r.height };
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const spawnFighter = useCallback((type: FighterTypeId) => {
    const same = fightersRef.current.filter((f) => f.type === type && f.state !== "dead");
    if (same.length >= 3) return false;
    const def = FIGHTERS[type];
    const w = sizeRef.current.w || window.innerWidth;
    const x = 120 + Math.random() * Math.max(1, w - 240);
    const maxHp = Math.round(def.def * hpMultRef.current);
    // AI difficulty influences reactionDelay at spawn
    const diff = difficultyRef.current;
    const baseReact = diff === "easy" ? 0.45 : diff === "normal" ? 0.22 : diff === "hard" ? 0.10 : 0.04;
    fightersRef.current.push({
      uid: nextUid(), type,
      x, y: -100, vx: 0, vy: 0,
      hp: maxHp, maxHp,
      facing: Math.random() > 0.5 ? 1 : -1,
      state: "idle", stateTimer: 0,
      abilityCd: def.abilities.map(() => 0.6),
      globalCd: 0.4,
      hitFlash: 0, bounce: 0, walkPhase: 0,
      onGround: false, jumpCd: 0, jumpsLeft: 2,
      decisionCd: 0, intent: "approach", intentTimer: 0,
      reactionDelay: baseReact + Math.random() * 0.1,
      sandeActive: 0, sandeHue: 0, afterTimer: 0, afterImages: [], sandeAttackCd: 0,
      shotsLeft: 0, shotTimer: 0,
      possessed: false, windupGrow: 0, dots: [],
      stunned: 0, counterActive: 0,
      tauntCd: 1 + Math.random() * 2,
    });
    playSound(SOUNDS.spawn, 0.5);
    return true;
  }, []);

  const removeFighter = useCallback((uid: number) => {
    fightersRef.current = fightersRef.current.filter((f) => f.uid !== uid);
    playSound(SOUNDS.click, 0.5);
  }, []);

  const restart = useCallback(() => {
    fightersRef.current = [];
    projectilesRef.current = [];
    effectsRef.current = [];
    damageNumsRef.current = [];
    playSound(SOUNDS.click, 0.5);
  }, []);

  const spawnEffect = (kind: Effect["kind"], x: number, y: number, life = 0.5) => {
    effectsRef.current.push({
      uid: nextUid(), kind, x, y,
      life, maxLife: life, seed: Math.random() * 1000,
    });
  };

  // Hitstop = brief slowdown on heavy hits. Shake = arena rumble. Both feel-good polish.
  const bigHit = (dmg: number) => {
    if (dmg >= 60) { hitstopRef.current = Math.max(hitstopRef.current, 0.11); shakeRef.current = Math.max(shakeRef.current, 0.45); }
    else if (dmg >= 45) { hitstopRef.current = Math.max(hitstopRef.current, 0.07); shakeRef.current = Math.max(shakeRef.current, 0.30); }
    else if (dmg >= 28) { shakeRef.current = Math.max(shakeRef.current, 0.18); }
  };



  useEffect(() => {
    let raf = 0;
    // HUD throttle: only force React re-render at ~22fps; sim still runs every frame
    let hudAccum = 0;
    const loop = (t: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const rawDt = Math.min(0.05, (t - lastTimeRef.current) / 1000);
      lastTimeRef.current = t;
      // Pause freezes sim entirely (no dt advance, no shake decay)
      if (pausedRef.current) {
        raf = requestAnimationFrame(loop);
        return;
      }
      // Hitstop: scale simulation dt for that crunchy heavy-hit pause
      let dt = rawDt;
      if (hitstopRef.current > 0) {
        hitstopRef.current = Math.max(0, hitstopRef.current - rawDt);
        dt = rawDt * 0.12;
      }
      timeRef.current += dt;
      step(dt);
      // Screen shake — exponential decay for smoother feel
      if (shakeRef.current > 0.001) {
        shakeRef.current = Math.max(0, shakeRef.current * Math.pow(0.0001, rawDt));
        if (arenaRef.current) {
          const mag = shakeRef.current * 18;
          const ox = (Math.random() - 0.5) * mag;
          const oy = (Math.random() - 0.5) * mag;
          arenaRef.current.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`;
        }
      } else if (arenaRef.current && arenaRef.current.style.transform) {
        arenaRef.current.style.transform = "";
      }
      hudAccum += rawDt;
      if (hudAccum >= 0.045) {
        hudAccum = 0;
        forceTick((n) => (n + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Spacebar = pause/play
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const incomingThreat = (f: Fighter) => {
    // Projectiles: react earlier (wider window) and gauge urgency by distance
    for (const p of projectilesRef.current) {
      if (p.ownerUid === f.uid) continue;
      const dx = f.x - p.x;
      const closing = Math.sign(p.vx) === Math.sign(dx);
      if (closing && Math.abs(dx) < 420 && Math.abs(p.y - (f.y - 50)) < 110) {
        const urgent = Math.abs(dx) < 200;
        return { kind: "proj" as const, p, urgent };
      }
    }
    // Enemy lunges aimed at us
    for (const o of fightersRef.current) {
      if (o.uid === f.uid || o.state === "dead") continue;
      if (o.state === "lunge" && Math.abs(o.x - f.x) < LUNGE_DISTANCE + 70 && Math.sign(o.facing) === Math.sign(f.x - o.x)) {
        return { kind: "lunge" as const, o, urgent: Math.abs(o.x - f.x) < 120 };
      }
      // Enemy winding up a ranged attack at close-ish range = pre-emptive read
      if ((o.state === "shoot" || o.state === "throw") && Math.abs(o.x - f.x) < 360 && Math.sign(o.facing) === Math.sign(f.x - o.x)) {
        return { kind: "windup" as const, o, urgent: false };
      }
    }
    return null;
  };


  const triggerReaction = (f: Fighter, kind: "angry" | "chuckle" | "taunt") => {
    const map = { angry: angryIcon.url, chuckle: chuckleIcon.url, taunt: tauntIcon.url };
    f.reactionIcon = { url: map[kind], until: timeRef.current + 1.1 };
    if (kind === "angry") playSound(SOUNDS.angry, 0.55);
    else if (kind === "chuckle") playSound(SOUNDS.chuckle, 0.55);
    else playSound(SOUNDS.taunt, 0.55);
  };

  const tauntAt = (taunter: Fighter, target: Fighter) => {
    if (taunter.tauntCd > 0) return;
    if (Math.random() > 0.1) return; // 10% chance
    taunter.tauntCd = 3 + Math.random() * 3;
    taunter.state = "taunt";
    taunter.stateTimer = 0.6;
    taunter.vx = 0;
    triggerReaction(taunter, "taunt");
    // target reacts angrily and focuses this taunter
    setTimeout(() => {
      if (target.state === "dead") return;
      triggerReaction(target, "angry");
      target.tauntedBy = taunter.uid;
      // anger boost: enrage -> approach intent
      target.intent = "approach";
      target.intentTimer = 2;
    }, 150);
  };

  const startSande = (f: Fighter, dur: number, withSound: "full" | "short") => {
    f.sandeActive = Math.max(f.sandeActive, dur);
    f.afterImages = [];
    f.afterTimer = 0;
    f.lastAfterX = f.x; f.lastAfterY = f.y;
    if (withSound === "full") playBoosted(SOUNDS.sande, 8);
    else playBoosted(SOUNDS.sande, 8, 1000);
  };

  const step = (dt: number) => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const groundY = h - GROUND_OFFSET;
    const fighters = fightersRef.current;

    for (const f of fighters) {
      const def = FIGHTERS[f.type];
      if (f.state === "dead") continue;

      f.stateTimer = Math.max(0, f.stateTimer - dt);
      f.globalCd = Math.max(0, f.globalCd - dt);
      for (let i = 0; i < f.abilityCd.length; i++) f.abilityCd[i] = Math.max(0, f.abilityCd[i] - dt);
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      f.bounce = Math.max(0, f.bounce - dt);
      f.jumpCd = Math.max(0, f.jumpCd - dt);
      f.decisionCd = Math.max(0, f.decisionCd - dt);
      f.intentTimer = Math.max(0, f.intentTimer - dt);
      f.tauntCd = Math.max(0, f.tauntCd - dt);
      f.sandeActive = Math.max(0, f.sandeActive - dt);
      f.sandeAttackCd = Math.max(0, f.sandeAttackCd - dt);
      f.stunned = Math.max(0, f.stunned - dt);
      f.counterActive = Math.max(0, f.counterActive - dt);
      if (f.guardActive !== undefined) f.guardActive = Math.max(0, f.guardActive - dt);
      if (f.guardCd !== undefined) f.guardCd = Math.max(0, f.guardCd - dt);
      if (f.overclockActive !== undefined) f.overclockActive = Math.max(0, f.overclockActive - dt);
      if (f.overclockCd !== undefined) f.overclockCd = Math.max(0, f.overclockCd - dt);
      if (f.manjiCd !== undefined) f.manjiCd = Math.max(0, f.manjiCd - dt);
      if (f.reactionIcon && f.reactionIcon.until < timeRef.current) f.reactionIcon = undefined;

      // ===== Damage-over-time (Sukuna Dismantle bleed) =====
      if (f.dots.length) {
        for (const d of f.dots) {
          d.timer -= dt;
          // Multiple ticks may fire in a single frame given the 0.1s interval
          let safety = 8;
          while (d.timer <= 0 && d.ticksLeft > 0 && safety-- > 0) {
            d.timer += d.interval;
            d.ticksLeft -= 1;
            applyDamage(f, d.dmg, d.fromFacing, d.ownerUid, true);
            playSound(SOUNDS.knife, 0.35);
            // Bleed stuns the victim while it ticks + spawns a cut/blood puff
            f.stunned = Math.max(f.stunned, d.interval + 0.08);
            const tdef = FIGHTERS[f.type];
            spawnEffect("cut", f.x + (Math.random() - 0.5) * tdef.width * 0.6, f.y - tdef.height * (0.3 + Math.random() * 0.5), 0.35);
          }
        }
        f.dots = f.dots.filter((d) => d.ticksLeft > 0);
      }

      // ===== Deku punch-combo stack window =====
      if ((f.punchStackTimer ?? 0) > 0) {
        f.punchStackTimer = (f.punchStackTimer ?? 0) - dt;
        if ((f.punchStackTimer ?? 0) <= 0 && (f.punchStacks ?? 0) > 0) {
          f.punchStacks = 0;
        }
      }

      // ===== Deku Black Whip update =====
      if (f.whip) {
        f.whip.t += dt;
        const wdef = FIGHTERS[f.type];
        if (f.whip.mode === "wall") {
          // Wall-Whip retreat: rope shoots to a wall anchor, then yanks Deku up/over
          const anchorX = f.whip.wallX ?? f.x;
          const anchorY = f.whip.wallY ?? (f.y - 180);
          if (f.whip.t >= 0.9) {
            f.whip = undefined;
          } else if (f.whip.phase === "extend") {
            const k = Math.min(1, f.whip.t / 0.22);
            f.whip.tipX = f.x + (anchorX - f.x) * k;
            f.whip.tipY = (f.whip.sourceY) + (anchorY - f.whip.sourceY) * k;
            if (k >= 1) {
              f.whip.phase = "drag";
              f.whip.selfStartX = f.x;
              f.whip.selfStartY = f.y;
              spawnEffect("wallspark", anchorX, anchorY, 0.45);
              playSound(SOUNDS.crackWhip, 0.75);
            }
          } else if (f.whip.phase === "drag") {
            const dragT = Math.min(1, (f.whip.t - 0.22) / 0.42);
            const ease = 1 - Math.pow(1 - dragT, 2.4);
            const sx = f.whip.selfStartX ?? f.x;
            const sy = f.whip.selfStartY ?? f.y;
            f.x = sx + (anchorX - sx) * ease;
            f.y = sy + (anchorY - sy) * ease;
            f.vx = 0; f.vy = 0;
            f.onGround = false;
            f.state = "throw"; f.stateTimer = Math.max(f.stateTimer, 0.1);
            f.whip.tipX = f.x; f.whip.tipY = f.y - wdef.height * 0.55;
            if (dragT >= 1) {
              // Release: spring off the wall outward + skyward for an aerial reset
              const outDir: 1 | -1 = (anchorX < w / 2 ? 1 : -1);
              f.vy = HIGH_JUMP_VELOCITY * 0.85;
              f.vx = outDir * MAX_AIR_SPEED * 1.4;
              f.facing = outDir;
              f.jumpsLeft = 1; f.jumpCd = 0.35;
              spawnEffect("electric", f.x, f.y - wdef.height * 0.55, 0.4);
            }
          }
        } else {
          const target = fighters.find((o) => o.uid === f.whip!.targetUid && o.state !== "dead");
          if (!target || f.whip.t >= 0.75) {
            f.whip = undefined;
          } else if (f.whip.phase === "extend") {
            // Tip travels from deku toward target
            const k = Math.min(1, f.whip.t / 0.3);
            f.whip.tipX = f.x + (target.x - f.x) * k;
            const tgtY = target.y - FIGHTERS[target.type].height * 0.55;
            f.whip.tipY = f.whip.sourceY + (tgtY - f.whip.sourceY) * k;
            if (k >= 1) {
              f.whip.phase = "drag";
              f.whip.dragStartX = target.x;
              f.whip.dragStartY = target.y;
              target.stunned = Math.max(target.stunned, 1.0);
              target.state = "hurt";
              target.stateTimer = Math.max(target.stateTimer, 1.0);
              target.vy = -160;
              playSound(SOUNDS.crackWhip, 0.75);
            }
          } else if (f.whip.phase === "drag") {
            const dragT = Math.min(1, (f.whip.t - 0.3) / 0.4);
            const anchorX = f.x + f.facing * (wdef.width * 0.75);
            const startX = f.whip.dragStartX ?? target.x;
            target.x = startX + (anchorX - startX) * dragT;
            // Aerial variant: if Deku is airborne, pull target UP to him for juggle combos
            if (!f.onGround) {
              const startY = f.whip.dragStartY ?? target.y;
              const anchorY = f.y + 10;
              target.y = startY + (anchorY - startY) * dragT;
              target.vy = -80;
              target.onGround = false;
            }
            target.vx = 0;
            f.whip.tipX = target.x;
            f.whip.tipY = target.y - FIGHTERS[target.type].height * 0.55;
          }
        }
      }

      // ===== Stun lockout — skip AI/movement while stunned =====
      if (f.stunned > 0 && f.state !== "lunge" && f.state !== "windup") {
        f.vx *= 0.7;
        if (f.state !== "hurt") { f.state = "hurt"; f.stateTimer = Math.max(f.stateTimer, f.stunned); }
      }


      const sandeMult = f.sandeActive > 0 ? 3 : 1;

      // Sandevistan afterimage trail - emit by distance (~1m = 50px) for true trail feel
      if (f.sandeActive > 0) {
        if (f.lastAfterX === undefined) { f.lastAfterX = f.x; f.lastAfterY = f.y; }
        const dxA = f.x - (f.lastAfterX ?? f.x);
        const dyA = f.y - (f.lastAfterY ?? f.y);
        const distA = Math.hypot(dxA, dyA);
        if (distA > 50) {
          f.afterImages.push({ x: f.x, y: f.y, facing: f.facing, hue: hueAt(timeRef.current), life: 0.4 });
          f.lastAfterX = f.x; f.lastAfterY = f.y;
          if (f.afterImages.length > 16) f.afterImages.shift();
        }
      }
      // Age afterimages (0.4s lifetime each)
      if (f.afterImages.length) {
        for (const a of f.afterImages) a.life -= dt;
        f.afterImages = f.afterImages.filter((a) => a.life > 0);
      }

      // Lunge motion
      if (f.state === "lunge" && f.lungeFromX !== undefined && f.lungeToX !== undefined) {
        const dur = f.lungeFast ? LUNGE_DURATION / 3 : LUNGE_DURATION;
        f.lungeProgress = (f.lungeProgress ?? 0) + dt / dur;
        const p = Math.min(1, f.lungeProgress);
        const ease = 1 - Math.pow(1 - p, 3);
        f.x = f.lungeFromX + (f.lungeToX - f.lungeFromX) * ease;
        if (!f.lungeHit && p > 0.35) {
          for (const t2 of fighters) {
            if (t2.uid === f.uid || t2.state === "dead") continue;
            if (Math.abs(t2.x - f.x) < MELEE_RANGE * 0.75 && Math.abs(t2.y - f.y) < def.height) {
              applyDamage(t2, f.lungeDamage ?? def.abilities[0].damage, f.facing, f.uid);
              const hitX = t2.x; const hitY = t2.y - def.height * 0.5;
              if (f.lungeKind === "divergentBlack") {
                playSound(SOUNDS.blackFlash, 0.95);
                spawnEffect("blackflash", hitX, hitY);
              } else if (f.lungeKind === "divergent") {
                playSound(SOUNDS.divergent, 0.85);
                spawnEffect("bluefire", hitX, hitY);
              } else if (f.lungeKind === "detroit") {
                playSound(SOUNDS.divergent, 1.0);
                spawnEffect("bluefire", hitX, hitY, 0.6);
                spawnEffect("counterburst", hitX, hitY, 0.6);
                spawnEffect("electric", hitX, hitY, 0.6);
                spawnEffect("shockwave", hitX, hitY + 30, 0.55);
                spawnEffect("shockwave", hitX, hitY + 30, 0.75);
                playSound(SOUNDS.electric, 0.7);
                t2.vx = f.facing * 1400; t2.vy = -640;
                t2.stunned = Math.max(t2.stunned, 0.6);
              } else if (f.lungeKind === "deku" || f.lungeKind === "dekuFinal" || f.lungeKind === "dekuMega") {
                playPitched(SOUNDS.punchHit, 0.75, f.punchPitch ?? 1);
                spawnEffect("greenfire", hitX, hitY, 0.45);
                spawnEffect("electric", hitX, hitY, 0.35);
                playSound(SOUNDS.electric, 0.45);
                // 2nd-hit background layer = the 1st (lunge) sound
                if ((f.punchHitStack ?? 0) === 1) {
                  playSound(SOUNDS.punchLunge, 0.7);
                }
                if (f.lungeKind === "dekuFinal") {
                  playSound(SOUNDS.finishingHit, 0.9);
                  spawnEffect("greenfire", hitX + 14, hitY - 10, 0.55);
                  spawnEffect("greenfire", hitX - 12, hitY + 6, 0.55);
                  spawnEffect("electric", hitX, hitY, 0.55);
                  spawnEffect("counterburst", hitX, hitY, 0.5);
                  t2.vx = f.facing * 980; t2.vy = -520;
                }
                if (f.lungeKind === "dekuMega") {
                  // 4th punch — MEGA: bigger sound stack, shockwaves, mega ring, hard launch
                  playSound(SOUNDS.finishingHit, 1.0);
                  playSound(SOUNDS.detroitSmash, 0.55);
                  playSound(SOUNDS.crackWhip, 0.6);
                  spawnEffect("greenfire", hitX, hitY, 0.7);
                  spawnEffect("greenfire", hitX + 22, hitY - 14, 0.65);
                  spawnEffect("greenfire", hitX - 22, hitY + 8, 0.65);
                  spawnEffect("electric", hitX, hitY, 0.7);
                  spawnEffect("counterburst", hitX, hitY, 0.7);
                  spawnEffect("shockwave", hitX, hitY + 24, 0.85);
                  spawnEffect("megaring", hitX, hitY, 0.7);
                  spawnEffect("megaring", hitX, hitY, 0.95);
                  t2.vx = f.facing * 1500; t2.vy = -700;
                  t2.stunned = Math.max(t2.stunned, 0.7);
                }
              } else {
                playSound(SOUNDS.punchHit, 0.7);
              }
              bigHit(f.lungeDamage ?? def.abilities[0].damage);
              f.lungeHit = true;
              // Combo follow-up: landing a hit shortens recovery so the AI can keep pressure
              f.globalCd = Math.min(f.globalCd, 0.12);
              f.intent = "punish"; f.intentTimer = 0.8;
              f.tauntedBy = t2.uid; // stay locked on the fighter we're comboing
              break;
            }
          }
        }

        if (p >= 1) {
          // missed? landing lag + give target chance to taunt (whiff punish window)
          if (!f.lungeHit) {
            f.globalCd = Math.max(f.globalCd, 0.35);
            const tgt = nearestEnemy(f, fighters);
            if (tgt) { tgt.lastDodgedFrom = f.uid; tauntAt(tgt, f); }
          }
          f.state = "idle";
          f.lungeFromX = f.lungeToX = f.lungeProgress = undefined;
          f.lungeHit = false; f.lungeFast = false; f.lungeKind = undefined;
          f.bounce = 0.22;
        }

      } else if (f.state === "windup") {
        // Charging an attack; grow/tint visual progress toward 1
        f.windupGrow = Math.min(1, f.windupGrow + dt / Math.max(0.06, f.stateTimer + dt));
        f.vx *= 0.6;
        if (f.stateTimer <= 0) {
          if (f.windupKind === "divergent") {
            // Revert size/tint and lunge forward with the divergent fist
            f.windupGrow = 0;
            const black = !!f.pendingBlack;
            const tgt = nearestEnemy(f, fighters);
            const dist = tgt ? Math.abs(tgt.x - f.x) : LUNGE_DISTANCE;
            f.state = "lunge"; f.stateTimer = LUNGE_DURATION / 2.2;
            f.lungeFromX = f.x;
            f.lungeToX = f.x + f.facing * Math.min(LUNGE_DISTANCE, dist + 40);
            f.lungeProgress = 0; f.lungeHit = false; f.lungeFast = true;
            f.lungeDamage = black ? 65 : 35;
            f.lungeKind = black ? "divergentBlack" : "divergent";
            f.pendingBlack = false;
          } else if (f.windupKind === "dismantle") {
            // Launch the linear, piercing Dismantle slash. Malevolent Shrine passive:
            // every 3rd slash is empowered (double pierce + bigger dmg + shrine sfx).
            f.shrineCount = (f.shrineCount ?? 0) + 1;
            const shrine = f.shrineCount % 3 === 0;
            const dir = f.facing;
            projectilesRef.current.push({
              uid: nextUid(), ownerUid: f.uid, kind: "dismantle",
              x: f.x + dir * 30, y: f.y - def.height * 0.55,
              vx: dir * DISMANTLE_SPEED, vy: 0,
              damage: shrine ? 45 : 18, ttl: 1.4,
              pierceLeft: shrine ? 5 : 2, hitUids: [],
            });
            playSound(Math.random() < 0.5 ? SOUNDS.dismantle1 : SOUNDS.dismantle2, shrine ? 1.0 : 0.7);
            if (shrine) {
              playSound(SOUNDS.sukunaTransform, 0.45);
              spawnEffect("cut", f.x + dir * 80, f.y - def.height * 0.55, 0.6);
              spawnEffect("shockwave", f.x + dir * 60, f.y - 20, 0.5);
              shakeRef.current = Math.max(shakeRef.current, 0.35);
            }
            f.state = "throw"; f.stateTimer = 0.18;
          } else if (f.windupKind === "detroit") {
            // Air freeze ended — dive at nearest enemy with massive force
            const tgt = nearestEnemy(f, fighters);
            const distT = tgt ? Math.abs(tgt.x - f.x) : LUNGE_DISTANCE;
            const dir = tgt ? ((Math.sign(tgt.x - f.x) || f.facing) as 1 | -1) : f.facing;
            f.facing = dir;
            f.state = "lunge"; f.stateTimer = LUNGE_DURATION / 2.5;
            f.lungeFromX = f.x;
            f.lungeToX = f.x + dir * Math.min(LUNGE_DISTANCE * 1.6, distT + 80);
            f.lungeProgress = 0; f.lungeHit = false; f.lungeFast = true;
            f.lungeDamage = 56;
            f.lungeKind = "detroit";
            f.vy = 1400; // dive bomb downward toward target
          } else {
            f.state = "idle";
          }
          f.windupKind = undefined;
        }


      } else if (f.state === "shoot") {
        // Firing bullets sequence
        if (f.shotsLeft > 0) {
          f.shotTimer -= dt;
          if (f.shotTimer <= 0) {
            f.shotTimer = 0.12;
            f.shotsLeft -= 1;
            const dir = f.facing;
            // Aim at stored target Y with small spread (tightened)
            const muzzleY = f.y - def.height * 0.55;
            const tgtY = f.shotTarget ?? muzzleY;
            const dyAim = tgtY - muzzleY;
            // Time-to-target estimate to leading vy properly
            const enemyForLead = nearestEnemy(f, fightersRef.current);
            const tof = enemyForLead ? Math.abs(enemyForLead.x - f.x) / BULLET_SPEED : 0.3;
            const leadY = enemyForLead ? enemyForLead.vy * tof * 0.8 : 0;
            const aimVy = (dyAim + leadY) / Math.max(0.08, tof);
            const spread = (Math.random() - 0.5) * 12; // much tighter
            projectilesRef.current.push({
              uid: nextUid(), ownerUid: f.uid, kind: "bullet",
              x: f.x + dir * 30, y: muzzleY,
              vx: dir * BULLET_SPEED, vy: aimVy + spread,
              damage: 34, ttl: 1.2,
            });
            playSound(SOUNDS.pistol, 0.5);
          }
        } else if (f.stateTimer <= 0) {
          f.state = "idle";
        }
      } else if (f.state === "throw" || f.state === "hurt" || f.state === "taunt") {
        if (f.stateTimer <= 0) f.state = "idle";
      } else {
        // ===== SMART AI =====
        // pick enemy - prefer the one that taunted us, else nearest
        let enemy: Fighter | null = null;
        if (f.tauntedBy) {
          enemy = fighters.find((o) => o.uid === f.tauntedBy && o.state !== "dead") ?? null;
          if (!enemy) f.tauntedBy = undefined;
        }
        if (!enemy) enemy = nearestEnemy(f, fighters);

        if (enemy) {
          const dx = enemy.x - f.x;
          const dist = Math.abs(dx);
          // accurate facing - always face enemy unless mid-action
          f.facing = dx >= 0 ? 1 : -1;
          const threat = incomingThreat(f);
          const hpRatio = f.hp / f.maxHp;
          const isDavid = f.type === "david";

          // Reaction-time gated dodge — sharper reads, dodges more often
          if (threat) {
            // urgent threats are reacted to almost instantly
            const ready = threat.urgent ? f.reactionDelay <= 0.05 : f.reactionDelay <= 0;
            if (ready) {
              if (threat.kind === "proj" && f.onGround && f.jumpCd <= 0) {
                // High evasive leap to clear projectiles and gain the high ground
                const high = Math.random() < 0.5;
                f.vy = high ? HIGH_JUMP_VELOCITY : JUMP_VELOCITY;
                f.vx = -f.facing * WALK_SPEED_BASE * 1.2;
                f.jumpCd = 0.35; f.jumpsLeft = 1;
                f.lastDodgedFrom = threat.p.ownerUid;
              } else if (threat.kind === "proj" && !f.onGround && f.jumpsLeft > 0 && f.jumpCd <= 0) {
                // Air-dodge: double jump + drift away
                f.vy = JUMP_VELOCITY * 0.9; f.vx = -f.facing * MAX_AIR_SPEED;
                f.jumpCd = 0.25; f.jumpsLeft -= 1;
                f.lastDodgedFrom = threat.p.ownerUid;
              } else if (threat.kind === "lunge" && f.onGround && f.jumpCd <= 0) {
                // Leap over the lunge or roll back depending on read
                if (Math.random() < 0.6) { f.vy = HIGH_JUMP_VELOCITY * 0.8; }
                f.vx = -f.facing * WALK_SPEED_BASE * 2.0;
                f.jumpCd = 0.4; f.jumpsLeft = 1; f.lastDodgedFrom = threat.o.uid;
              } else if (threat.kind === "windup" && f.onGround && f.jumpCd <= 0 && Math.random() < 0.5) {
                // Pre-emptive juke before the shot even fires
                f.vy = JUMP_VELOCITY * 0.75; f.vx = -f.facing * WALK_SPEED_BASE * 1.4;
                f.jumpCd = 0.5; f.jumpsLeft = 1;
              }
              f.reactionDelay = 0.06 + Math.random() * 0.12;
            } else {
              f.reactionDelay -= dt;
            }
          }


          // Battle IQ - intent selection (faster, smarter decisions)
          if (f.decisionCd <= 0) {
            const dscale = difficultyRef.current === "easy" ? 3 : difficultyRef.current === "normal" ? 1.4 : difficultyRef.current === "hard" ? 0.8 : 0.4;
            f.decisionCd = (0.10 + Math.random() * 0.12) * dscale;
            const r = Math.random();
            const enemyBusy = enemy.state === "lunge" || enemy.state === "throw" || enemy.state === "shoot" || enemy.state === "hurt" || enemy.state === "taunt";
            const enemyWindup = enemy.state === "windup";
            const canAttackSoon = f.abilityCd.some((cd, i) => cd < 0.4 && def.abilities[i].type !== "status");
            const enemyAirborne = !enemy.onGround && enemy.y < f.y - 60;
            const enemyHpRatio = enemy.hp / enemy.maxHp;
            // Read the situation like a real player would
            if (enemyWindup && canAttackSoon && dist < LUNGE_DISTANCE * 1.2) f.intent = "punish"; // punish telegraphs
            else if (enemyBusy && canAttackSoon) f.intent = "punish";          // whiff/animation punish
            else if (enemyAirborne && canAttackSoon) f.intent = "punish"; // anti-air read
            else if (hpRatio < 0.22 && r < 0.55) f.intent = "retreat";     // only retreat when truly low
            else if (hpRatio < 0.45 && threat && r < 0.45) f.intent = "space"; // create breathing room
            else if (enemyHpRatio < 0.3 && canAttackSoon && r < 0.78) f.intent = "approach"; // close out the kill
            else if (!canAttackSoon) f.intent = r < 0.5 ? "space" : "bait"; // stall while on cooldown
            else if (r < 0.55) f.intent = "approach";
            else if (r < 0.8) f.intent = "space";
            else f.intent = "bait";
            f.intentTimer = 0.4 + Math.random() * 0.5; // shorter — re-evaluate sooner
          }


          // ===== Ability decisions (priority order) =====
          const tryUse = (idx: number) => f.abilityCd[idx] <= 0 && f.globalCd <= 0;

          if (isDavid) {
            // David — Overclock (22s CD): burst speed + +30% dmg for 4s. Pop when threatened or pushing kill.
            if ((f.overclockCd ?? 0) <= 0 && (f.overclockActive ?? 0) <= 0 && f.globalCd <= 0
                && (hpRatio < 0.5 || (enemy.hp / enemy.maxHp) < 0.4 || (enemy.state === "lunge" && dist < 250))) {
              f.overclockActive = 4;
              f.overclockCd = 22;
              f.globalCd = 0.3;
              startSande(f, 0.4, "short");
              triggerReaction(f, "angry");
              spawnEffect("counterburst", f.x, f.y - def.height * 0.55, 0.4);
            }
            // While Sandevistan is ACTIVE: free fast normal-style punches (no extra CD on the status itself)
            if (f.sandeActive > 0 && f.sandeAttackCd <= 0 && f.globalCd <= 0 && dist < LUNGE_DISTANCE * 1.1) {
              f.state = "lunge"; f.stateTimer = LUNGE_DURATION / 3;
              f.lungeFromX = f.x;
              f.lungeToX = f.x + f.facing * Math.min(LUNGE_DISTANCE, dist + 40);
              f.lungeProgress = 0; f.lungeHit = false; f.lungeFast = true;
              f.lungeDamage = 25; // normal punch damage during sandevistan
              f.sandeAttackCd = (f.overclockActive ?? 0) > 0 ? 0.3 : 0.45;
              f.globalCd = 0.25;
              playSound(SOUNDS.punchLunge, 0.55);
              continue;
            }
            // Sandevistan status: pop on aggression, when pressured, or to punish — much more engaging
            if (tryUse(0) && (hpRatio < 0.6 || (enemy.state === "lunge" && dist < 220) || (f.intent === "punish") || (dist < 260 && Math.random() < 0.4))) {
              startSande(f, 3, "full");
              f.abilityCd[0] = 12; f.globalCd = 0.3;
            }
            // Shots Fired ranged — only at a safe distance, aim at enemy center
            else if (tryUse(1) && dist > MELEE_RANGE * 1.4 && dist < w * 0.95) {
              const edef = FIGHTERS[enemy.type];
              f.state = "shoot"; f.stateTimer = 0.55;
              f.shotsLeft = 3; f.shotTimer = 0;
              f.shotTarget = enemy.y - edef.height * 0.55;
              f.abilityCd[1] = 5; f.globalCd = 0.5;
              continue;
            }
            // Sandy Punch (own micro-sandevistan, also activates the same status visuals)
            else if (tryUse(2) && dist < LUNGE_DISTANCE * 1.05) {
              startSande(f, 0.8, "short");
              f.state = "lunge"; f.stateTimer = LUNGE_DURATION / 3;
              f.lungeFromX = f.x;
              f.lungeToX = f.x + f.facing * Math.min(LUNGE_DISTANCE, dist + 40);
              f.lungeProgress = 0; f.lungeHit = false; f.lungeFast = true;
              f.lungeDamage = 50;
              f.abilityCd[2] = 8; f.globalCd = 0.4;
              playSound(SOUNDS.punchLunge, 0.55);
              continue;
            }
          } else if (f.type === "yuji") {
            if (!f.possessed) {
              // ===== Projectile deflection (battle IQ): swat incoming projectiles back =====
              if (f.globalCd <= 0) {
                for (const proj of projectilesRef.current) {
                  if (proj.ownerUid === f.uid) continue;
                  if (proj.kind === "dismantle") continue; // too fast/large to slap
                  const ddx = f.x - proj.x;
                  const closing = Math.sign(proj.vx) === Math.sign(ddx);
                  if (closing && Math.abs(ddx) < 90 && Math.abs(proj.y - (f.y - def.height * 0.55)) < def.height * 0.6) {
                    // Deflect: reverse, claim ownership, slight upward arc
                    proj.vx = -proj.vx * 1.15;
                    if (proj.kind === "cotton") proj.vy = -180;
                    proj.ownerUid = f.uid;
                    f.facing = (Math.sign(-ddx) || f.facing) as 1 | -1;
                    f.state = "throw"; f.stateTimer = 0.18;
                    f.globalCd = 0.35;
                    playSound(SOUNDS.punchHit, 0.55);
                    triggerReaction(f, "chuckle");
                    break;
                  }
                }
              }
              // ===== Counter Strike: only when about to be hit (smarter, less spammy) =====
              const aboutToBeHit =
                (enemy.state === "lunge" && dist < LUNGE_DISTANCE * 0.85) ||
                (enemy.state === "windup" && dist < LUNGE_DISTANCE) ||
                (enemy.state === "shoot" && dist < 360) ||
                (enemy.state === "throw" && dist < 320);
              if (tryUse(1) && f.counterActive <= 0 && (aboutToBeHit || (f.hp / f.maxHp < 0.35 && dist < MELEE_RANGE * 2 && Math.random() < 0.5))) {
                f.counterActive = 2.2;
                f.abilityCd[1] = 5; f.globalCd = 0.2;
                triggerReaction(f, "angry");
                continue;
              }
              // Yuji — Manji Kick: airborne 5s-CD aerial sub-variant. Fast spinning kick that lunges sideways.
              f.manjiCd = Math.max(0, (f.manjiCd ?? 0) - dt);
              if (!f.onGround && (f.manjiCd ?? 0) <= 0 && f.globalCd <= 0 && dist < LUNGE_DISTANCE * 1.4) {
                const kdir = (Math.sign(enemy.x - f.x) || f.facing) as 1 | -1;
                f.facing = kdir;
                f.state = "lunge"; f.stateTimer = LUNGE_DURATION / 2.4;
                f.lungeFromX = f.x;
                f.lungeToX = f.x + kdir * Math.min(LUNGE_DISTANCE * 1.1, dist + 40);
                f.lungeProgress = 0; f.lungeHit = false; f.lungeFast = true;
                f.lungeDamage = 28;
                f.lungeKind = "divergent";
                f.vy = -80;
                f.manjiCd = 5;
                f.globalCd = 0.3;
                playSound(SOUNDS.punchLunge, 0.55);
                continue;
              }
              // Divergent Fist — fast windup, grows + tints light blue, then lunges.
              // Cursed Reservoir passive: stacks >= 5 auto-empowers to Black Flash.
              if (tryUse(0) && dist < LUNGE_DISTANCE * 1.15 && dist > MELEE_RANGE * 0.3 && (f.intent === "approach" || f.intent === "punish" || dist < MELEE_RANGE * 1.3)) {
                const empowered = f.cursedFlashReady === true;
                f.state = "windup"; f.stateTimer = 0.12;
                f.windupKind = "divergent"; f.windupGrow = 0;
                f.pendingBlack = empowered ? true : Math.random() < 0.25;
                if (empowered) { f.cursedFlashReady = false; f.cursedStacks = 0; triggerReaction(f, "angry"); }
                f.vx = 0;
                f.abilityCd[0] = 3; f.globalCd = 0.3;
                continue;
              }
              // ===== Aerial combat: wall-run + backflip to dive bomb =====
              if (f.aerialIntent === undefined) f.aerialIntent = 0;
              f.aerialIntent = Math.max(0, f.aerialIntent - dt);
              const wantsAerial = f.onGround && f.aerialIntent <= 0 && f.jumpCd <= 0
                && (f.intent === "bait" || f.intent === "space" || hpRatio < 0.45)
                && dist > MELEE_RANGE * 1.2
                && Math.random() < 0.012;
              if (wantsAerial) f.aerialIntent = 2.2;
              if ((f.aerialIntent ?? 0) > 0 && f.onGround) {
                // Sprint to the closer wall, then backflip toward enemy
                const wallDir: 1 | -1 = (f.x < w / 2 ? -1 : 1);
                f.facing = -wallDir as 1 | -1; // keep facing the enemy side
                f.vx = wallDir * WALK_SPEED_BASE * def.speed * 1.5;
                f.state = "walk"; f.walkPhase += dt * 16;
                const atWall = (wallDir === -1 && f.x < 70) || (wallDir === 1 && f.x > w - 70);
                if (atWall) {
                  // Backflip: spring off the wall toward the enemy
                  f.vy = HIGH_JUMP_VELOCITY * 0.95;
                  f.vx = -wallDir * MAX_AIR_SPEED * 1.5;
                  f.jumpCd = 0.7; f.jumpsLeft = 1;
                  f.aerialIntent = 0;
                  f.bounce = 0.35;
                  triggerReaction(f, "chuckle");
                  playSound(SOUNDS.punchLunge, 0.45);
                }
                continue;
              }
              // Air-to-ground Divergent dive when descending near enemy
              if (!f.onGround && tryUse(0) && Math.abs(dx) < LUNGE_DISTANCE * 1.3 && f.vy > -120) {
                f.state = "windup"; f.stateTimer = 0.1;
                f.windupKind = "divergent"; f.windupGrow = 0;
                f.pendingBlack = Math.random() < 0.3;
                f.abilityCd[0] = 3; f.globalCd = 0.3;
                continue;
              }
            } else {
              // Sukuna — kite at mid-range: if enemy is right on top, prefer space
              if (dist < MELEE_RANGE * 0.7) { f.intent = "retreat"; f.intentTimer = 0.6; }
              const enemyBleeding = enemy.dots.some((d) => d.ownerUid === f.uid);
              // Sukuna — Clash: rebalanced basic projectile, 2.5s CD, 18 dmg
              // Sub-variant: "Twin Clash" — when enemy is busy/airborne, fire a high+low pair
              if (tryUse(1) && dist > MELEE_RANGE * 0.9 && dist < w * 0.9) {
                f.state = "throw"; f.stateTimer = 0.18;
                const dir = (Math.sign(enemy.x - f.x) || f.facing) as 1 | -1;
                f.facing = dir; f.vx = 0;
                const lead = enemy.vx * 0.18;
                const twin = (enemy.state === "lunge" || enemy.state === "shoot" || !enemy.onGround) && Math.random() < 0.55;
                const baseY = f.y - def.height * 0.55;
                projectilesRef.current.push({
                  uid: nextUid(), ownerUid: f.uid, kind: "clash",
                  x: f.x + dir * 28, y: twin ? baseY - 22 : baseY,
                  vx: dir * (PROJECTILE_SPEED * 1.25) + lead, vy: twin ? -60 : 0,
                  damage: 18, ttl: 1.4,
                });
                if (twin) {
                  projectilesRef.current.push({
                    uid: nextUid(), ownerUid: f.uid, kind: "clash",
                    x: f.x + dir * 28, y: baseY + 22,
                    vx: dir * (PROJECTILE_SPEED * 1.25) + lead, vy: 60,
                    damage: 14, ttl: 1.4,
                  });
                  f.abilityCd[1] = 3.5; // slightly longer for the twin
                  triggerReaction(f, "chuckle");
                } else {
                  f.abilityCd[1] = 2.5;
                }
                f.globalCd = 0.3;
                playSound(SOUNDS.throwSwing, 0.5);
                continue;
              }
              // Sukuna — Dismantle: 0.9s CD slash. Every 3rd slash empowered (Malevolent Shrine passive).
              if (tryUse(0) && dist > MELEE_RANGE * 0.4 && dist < w * 0.95) {
                f.state = "windup"; f.stateTimer = 0.12;
                f.windupKind = "dismantle"; f.windupGrow = 0;
                const dir = (Math.sign(enemy.x - f.x) || f.facing) as 1 | -1;
                f.facing = dir; f.vx = 0;
                f.abilityCd[0] = 0.9; f.globalCd = 0.25;
                continue;
              }
            }
          } else if (f.type === "deku") {
            const hpLow = hpRatio < 0.45;
            const heavyThreat = !!threat && (threat.urgent || (threat.kind === "windup"));
            const wantsRetreat = f.intent === "retreat" || (hpLow && heavyThreat);

            // === Wall-Whip retreat (sub-variant of Black Whip) ===
            // Ropes to the nearest wall and yanks Deku up into the air for aerial reset.
            if (tryUse(0) && !f.whip && f.onGround && wantsRetreat && dist < w) {
              const wallDir: 1 | -1 = (f.x < w / 2 ? -1 : 1);
              const wallX = wallDir === -1 ? 24 : w - 24;
              const wallY = groundY - 220;
              f.state = "throw"; f.stateTimer = 0.95; f.vx = 0;
              f.whip = { mode: "wall", wallX, wallY, t: 0, phase: "extend", sourceY: f.y - def.height * 0.55 };
              f.facing = wallDir;
              f.abilityCd[0] = 6; f.globalCd = 0.4;
              playSound(SOUNDS.punchLunge, 0.55);
              playSound(SOUNDS.electric, 0.45);
              spawnEffect("electric", f.x, f.y - def.height * 0.6, 0.35);
              triggerReaction(f, "chuckle");
              continue;
            }

            // Detroit Smash (idx 2): air-only finisher — prioritized after a whip pull (combo)
            if (tryUse(2) && !f.onGround && f.y < groundY - 140 && dist < w * 0.95) {
              f.state = "windup"; f.stateTimer = 2.0;
              f.windupKind = "detroit"; f.windupGrow = 0;
              f.vx = 0; f.vy = 0;
              f.abilityCd[2] = 45; f.globalCd = 0.6;
              playSound(SOUNDS.detroitSmash, 0.9);
              spawnEffect("electric", f.x, f.y - def.height * 0.55, 0.6);
              triggerReaction(f, "angry");
              continue;
            }
            // Tactical jump to set up Detroit Smash when ready
            if (tryUse(2) && f.onGround && f.jumpCd <= 0 && dist < LUNGE_DISTANCE * 2.2 && Math.random() < 0.06) {
              f.vy = HIGH_JUMP_VELOCITY; f.jumpCd = 0.8; f.jumpsLeft = 1;
            }

            // === Air-Whip juggle (sub-variant of Black Whip used while airborne) ===
            // Drags target upward to Deku's altitude for aerial combos.
            if (tryUse(0) && !f.whip && !f.onGround && dist < w * 0.7 && f.vy > -200) {
              f.state = "throw"; f.stateTimer = 0.6;
              f.whip = { mode: "enemy", targetUid: enemy.uid, t: 0, phase: "extend", sourceY: f.y - def.height * 0.55 };
              f.abilityCd[0] = 6; f.globalCd = 0.35;
              playSound(SOUNDS.punchLunge, 0.55);
              playSound(SOUNDS.electric, 0.5);
              spawnEffect("electric", f.x, f.y - def.height * 0.55, 0.4);
              continue;
            }

            // Ground Black Whip (idx 0): pull enemy in to set up combo
            if (tryUse(0) && !f.whip && dist > MELEE_RANGE * 1.1 && dist < w * 0.85) {
              f.state = "throw"; f.stateTimer = 0.75; f.vx = 0;
              f.whip = { mode: "enemy", targetUid: enemy.uid, t: 0, phase: "extend", sourceY: f.y - def.height * 0.55 };
              f.abilityCd[0] = 6; f.globalCd = 0.4;
              playSound(SOUNDS.punchLunge, 0.6);
              playSound(SOUNDS.electric, 0.5);
              spawnEffect("electric", f.x, f.y - def.height * 0.6, 0.4);
              continue;
            }
            // Punch combo (idx 1): chains 4 hits. dmgs: 34, 45, 59, 67 (mega).
            if (tryUse(1) && dist < LUNGE_DISTANCE * 1.05 && dist > MELEE_RANGE * 0.25) {
              const stack = f.punchStacks ?? 0; // 0..3
              const DMG = [34, 45, 59, 67];
              const dmg = DMG[Math.min(3, stack)];
              const isMega = stack === 3;
              const isFinalish = stack >= 2;
              const reach = isMega ? LUNGE_DISTANCE * 1.25 : LUNGE_DISTANCE;
              f.state = "lunge"; f.stateTimer = LUNGE_DURATION / (isMega ? 2.2 : 2.5);
              f.lungeFromX = f.x;
              f.lungeToX = f.x + f.facing * Math.min(reach, dist + (isMega ? 50 : 30));
              f.lungeProgress = 0; f.lungeHit = false; f.lungeFast = true;
              f.lungeDamage = dmg;
              f.lungeKind = isMega ? "dekuMega" : isFinalish ? "dekuFinal" : "deku";
              f.punchPitch = Math.max(0.5, 1 - stack * 0.13);
              f.punchHitStack = stack;
              if (stack >= 3) {
                // 4th finisher — full reset, total CD = 4s
                f.punchStacks = 0; f.punchStackTimer = 0;
                f.abilityCd[1] = 4;
              } else {
                f.punchStacks = stack + 1;
                f.punchStackTimer = 2.2;
                f.abilityCd[1] = 0.45;
              }
              f.globalCd = isMega ? 0.28 : 0.18;
              playPitched(SOUNDS.punchLunge, isMega ? 0.75 : 0.55, f.punchPitch);
              if (isMega) {
                // One For All Surge windup spark
                spawnEffect("electric", f.x, f.y - def.height * 0.55, 0.35);
                spawnEffect("greenfire", f.x, f.y - def.height * 0.55, 0.4);
              }
              continue;
            }
          } else {
            // Dummy — Iron Guard (12s CD): pop 50% damage reduction for 2.5s when threatened.
            const aboutToHitDummy = (enemy.state === "lunge" && dist < LUNGE_DISTANCE * 0.9)
              || (enemy.state === "windup" && dist < LUNGE_DISTANCE * 1.1)
              || (threat?.kind === "proj" && threat.urgent);
            if ((f.guardCd ?? 0) <= 0 && (f.guardActive ?? 0) <= 0 && aboutToHitDummy) {
              f.guardActive = 2.5; f.guardCd = 12;
              triggerReaction(f, "angry");
              spawnEffect("counterburst", f.x, f.y - def.height * 0.55, 0.5);
              playSound(SOUNDS.punchHit, 0.45);
            }
            // Dummy abilities — with "Rage" sub-variant when low HP
            const dummyRage = hpRatio < 0.35;
            // Sub-variant: low-HP Rage Lunge — ignores intent gate, longer reach, +dmg
            if (dummyRage && tryUse(0) && dist < LUNGE_DISTANCE * 1.4 && dist > MELEE_RANGE * 0.3) {
              f.state = "lunge"; f.stateTimer = LUNGE_DURATION * 0.85;
              f.lungeFromX = f.x;
              f.lungeToX = f.x + f.facing * Math.min(LUNGE_DISTANCE * 1.3, dist + 50);
              f.lungeProgress = 0; f.lungeHit = false; f.lungeFast = true;
              f.lungeDamage = 36;
              f.abilityCd[0] = 1.1; f.globalCd = 0.35;
              playSound(SOUNDS.punchLunge, 0.65);
              spawnEffect("counterburst", f.x, f.y - def.height * 0.55, 0.4);
              continue;
            }
            if (tryUse(0) && dist < LUNGE_DISTANCE * 1.05 && dist > MELEE_RANGE * 0.35 && (f.intent === "approach" || f.intent === "punish")) {
              f.state = "lunge"; f.stateTimer = LUNGE_DURATION;
              f.lungeFromX = f.x;
              f.lungeToX = f.x + f.facing * Math.min(LUNGE_DISTANCE, dist + 30);
              f.lungeProgress = 0; f.lungeHit = false;
              f.lungeDamage = 25;
              f.abilityCd[0] = 1.4; f.globalCd = 0.4;
              playSound(SOUNDS.punchLunge, 0.55);
              continue;
            } else if (tryUse(1) && dist > MELEE_RANGE * 1.4 && dist < w * 0.9) {
              f.state = "throw"; f.stateTimer = 0.28;
              const lead = Math.sign(enemy.vx) * Math.min(60, Math.abs(enemy.vx) * 0.15);
              const dir = (Math.sign(enemy.x + lead - f.x) || f.facing) as 1 | -1;
              f.facing = dir;
              projectilesRef.current.push({
                uid: nextUid(), ownerUid: f.uid, kind: "cotton",
                x: f.x + dir * 28, y: f.y - def.height * 0.55,
                vx: dir * PROJECTILE_SPEED, vy: -140,
                damage: 25, ttl: 3,
              });
              f.abilityCd[1] = 1.8; f.globalCd = 0.4;
              playSound(SOUNDS.throwSwing, 0.55);
              continue;
            }
          }


          // ===== Movement (Smash-style spacing) =====
          let desired = MELEE_RANGE * 0.9;
          let aggressive = false;
          switch (f.intent) {
            case "approach": desired = MELEE_RANGE * 0.9; aggressive = true; break;
            case "punish":   desired = MELEE_RANGE * 0.8; aggressive = true; break;
            case "space":    desired = LUNGE_DISTANCE * 1.05; break;
            case "retreat":  desired = LUNGE_DISTANCE * 1.7; break;
            case "bait":     desired = LUNGE_DISTANCE * 1.25; break;
          }

          const diff = dist - desired;
          let move: 1 | -1 | 0 = 0;
          if (Math.abs(diff) > 14) move = (diff > 0 ? f.facing : (-f.facing as 1 | -1));

          // Wall avoidance: if cornered, move away from wall
          if (f.x < 90 && move === -1) move = 1;
          if (f.x > w - 90 && move === 1) move = -1;

          // Double jump while aggressing (chase into the air)
          if (aggressive && !f.onGround && f.jumpsLeft > 0 && f.jumpCd <= 0 && Math.random() < 0.03) {
            f.vy = JUMP_VELOCITY * 0.85; f.jumpsLeft -= 1; f.jumpCd = 0.25;
          }
          // Anti-air leap: enemy is above us — sky-high jump to contest the high ground
          if (f.intent === "punish" && f.onGround && f.jumpCd <= 0 && !enemy.onGround && enemy.y < f.y - 80) {
            f.vy = HIGH_JUMP_VELOCITY; f.jumpCd = 0.6; f.jumpsLeft = 1;
          }
          // Tactical high jump for positioning / surprise dive-ins
          if (f.onGround && f.jumpCd <= 0 && aggressive && Math.random() < 0.012) {
            f.vy = HIGH_JUMP_VELOCITY * 0.9; f.jumpCd = 1.1; f.jumpsLeft = 1;
          }
          // Hop jukes when baiting/spacing
          if (f.onGround && f.jumpCd <= 0 && (f.intent === "bait" || f.intent === "space") && Math.random() < 0.01) {
            f.vy = JUMP_VELOCITY * 0.7; f.jumpCd = 1.0; f.jumpsLeft = 1;
          }
          // Fast-fall dive when airborne above the enemy and committing
          if (!f.onGround && f.vy > -120 && aggressive && enemy.y > f.y + 40 && Math.random() < 0.05) {
            f.vy += FAST_FALL * dt * 8;
          }

          if (!f.onGround) {
            // Mid-air drift control toward desired movement
            const target = move * MAX_AIR_SPEED;
            f.vx += Math.sign(target - f.vx) * AIR_ACCEL * dt;
            if (Math.abs(f.vx) > MAX_AIR_SPEED) f.vx = Math.sign(f.vx) * MAX_AIR_SPEED;
            if (f.state !== "lunge") f.state = "walk";
          } else if (move !== 0) {
            const sp = WALK_SPEED_BASE * def.speed * sandeMult * (f.intent === "retreat" ? 1.2 : 1);
            f.vx = move * sp;
            f.state = "walk";
            f.walkPhase += dt * 12 * sandeMult;
          } else {
            f.vx *= 0.6;
            f.state = "idle";
            f.walkPhase *= 0.9;
          }


          // Opportunistic taunt - 70% chance when an opportunity comes up
          if (f.tauntCd <= 0 && (f.lastDodgedFrom === enemy.uid || f.lastTrickedFrom === enemy.uid) && f.onGround) {
            tauntAt(f, enemy);
            f.lastDodgedFrom = undefined; f.lastTrickedFrom = undefined;
          }
        } else {
          f.vx *= 0.85;
          f.state = "idle";
        }
      }

      // ===== Anti-overlap separation =====
      for (const o of fighters) {
        if (o.uid === f.uid || o.state === "dead") continue;
        const ddx = f.x - o.x;
        const ddy = (f.y - o.y);
        if (Math.abs(ddx) < PUSH_RADIUS && Math.abs(ddy) < 60) {
          // Body-slam: a fighter launched by Yuji's Counter Strike crashes into another
          if (f.bodySlamFrom && f.bodySlamFrom !== o.uid && Math.abs(f.vx) > 500) {
            const slamDmg = f.bodySlamDmg ?? 25;
            const dir = Math.sign(f.vx) as 1 | -1;
            applyDamage(o, slamDmg, dir, f.bodySlamFrom);
            applyDamage(f, Math.round(slamDmg * 0.6), -dir as 1 | -1, f.bodySlamFrom);
            o.stunned = Math.max(o.stunned, 1);
            f.stunned = Math.max(f.stunned, 1);
            o.vx = dir * 500; o.vy = -380;
            f.vx = -dir * 200; f.vy = -240;
            spawnEffect("counterburst", (f.x + o.x) / 2, (f.y + o.y) / 2 - 50, 0.5);
            playSound(SOUNDS.punchHit, 0.9);
            f.bodySlamFrom = undefined; f.bodySlamDmg = undefined;
            continue;
          }
          const push = (PUSH_RADIUS - Math.abs(ddx)) * 6;
          const sign = ddx === 0 ? (Math.random() > 0.5 ? 1 : -1) : Math.sign(ddx);
          f.vx += sign * push * dt;
        }
      }

      // Clear body-slam flag when fighter lands/slows
      if (f.bodySlamFrom && (f.onGround || Math.abs(f.vx) < 200)) {
        f.bodySlamFrom = undefined; f.bodySlamDmg = undefined;
      }

      // ===== Physics =====
      if (f.state === "windup" && f.windupKind === "detroit") {
        f.vy = 0; f.vx = 0; // frozen mid-air during Detroit Smash charge
      } else {
        f.vy += GRAVITY * dt;
      }
      if (f.state !== "lunge") f.x += f.vx * dt;
      f.y += f.vy * dt;

      if (f.y >= groundY) {
        if (f.vy > 220) {
          // Pokemon-style wave bounce: small elastic squish
          f.bounce = Math.min(0.45, f.vy / 1800);
          f.vy = -f.vy * 0.28;
          if (Math.abs(f.vy) < 90) f.vy = 0;
        } else {
          f.vy = 0; f.y = groundY;
        }
        f.onGround = true;
        if (f.jumpsLeft < 2) f.jumpsLeft = 2;
      } else {
        f.onGround = false;
      }

      const half = def.width / 2;
      if (f.x < half) { f.x = half; if (f.state === "lunge") f.lungeToX = f.x; }
      if (f.x > w - half) { f.x = w - half; if (f.state === "lunge") f.lungeToX = f.x; }
    }

    // Projectiles
    projectilesRef.current = projectilesRef.current.filter((p) => {
      p.ttl -= dt;
      if (p.kind === "cotton") p.vy += GRAVITY * 0.4 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.ttl <= 0) return false;
      if (p.x < -50 || p.x > w + 50 || p.y > groundY + 50) return false;
      for (const t of fighters) {
        if (t.uid === p.ownerUid || t.state === "dead") continue;
        if (p.kind === "dismantle" && p.hitUids?.includes(t.uid)) continue;
        const tdef = FIGHTERS[t.type];
        if (Math.abs(t.x - p.x) < tdef.width * 0.55 && Math.abs((t.y - tdef.height * 0.5) - p.y) < tdef.height * 0.55) {
          if (p.kind === "dismantle") {
            applyDamage(t, p.damage, Math.sign(p.vx) as 1 | -1, p.ownerUid);
            playSound(SOUNDS.knife, 0.7);
            // Bleed: 2 dmg every 0.15s for 6 cuts (lighter to fit 0.9s slash cadence)
            t.dots.push({ interval: 0.15, timer: 0.15, ticksLeft: 6, dmg: 2, fromFacing: Math.sign(p.vx) as 1 | -1, ownerUid: p.ownerUid });
            t.stunned = Math.max(t.stunned, 0.2);
            spawnEffect("cut", t.x, t.y - tdef.height * 0.55, 0.4);
            p.hitUids?.push(t.uid);
            p.pierceLeft = (p.pierceLeft ?? 1) - 1;
            if ((p.pierceLeft ?? 0) <= 0) return false;
          } else if (p.kind === "clash") {
            applyDamage(t, p.damage, Math.sign(p.vx) as 1 | -1, p.ownerUid);
            playSound(SOUNDS.knife, 0.7);
            spawnEffect("cut", t.x, t.y - tdef.height * 0.55, 0.3);
            return false;
          } else {
            applyDamage(t, p.damage, Math.sign(p.vx) as 1 | -1, p.ownerUid);
            playSound(SOUNDS.damage, 0.45);
            return false;
          }
        }
      }
      return true;
    });

    // ===== Effects aging =====
    if (effectsRef.current.length) {
      for (const e of effectsRef.current) e.life -= dt;
      effectsRef.current = effectsRef.current.filter((e) => e.life > 0);
      if (effectsRef.current.length > 90) effectsRef.current.splice(0, effectsRef.current.length - 90);
    }

    // ===== Damage number floats =====
    if (damageNumsRef.current.length) {
      for (const n of damageNumsRef.current) {
        n.life -= dt;
        n.y += n.vy * dt;
        n.vy += 60 * dt;
      }
      damageNumsRef.current = damageNumsRef.current.filter((n) => n.life > 0);
      if (damageNumsRef.current.length > 40) damageNumsRef.current.splice(0, damageNumsRef.current.length - 40);
    }

    // Perf cap projectiles
    if (projectilesRef.current.length > 40) projectilesRef.current.splice(0, projectilesRef.current.length - 40);

    fightersRef.current = fightersRef.current.filter((f) => f.state !== "dead");
  };


  const applyDamage = (target: Fighter, dmg: number, fromFacing: 1 | -1, attackerUid?: number, isDot = false) => {
    // ===== Sukuna passive — Bloodlust: +25% dmg on victims already bleeding from him
    let inDmg = dmg;
    if (!isDot && attackerUid) {
      const att = fightersRef.current.find((x) => x.uid === attackerUid);
      if (att && att.type === "yuji" && att.possessed) {
        const bleedingFromMe = target.dots.some((d) => d.ownerUid === att.uid);
        if (bleedingFromMe) inDmg = Math.round(inDmg * 1.25);
      }
    }
    // ===== Dummy Iron Guard — 50% damage reduction while active
    if (!isDot && target.type === "dummy" && (target.guardActive ?? 0) > 0) {
      inDmg = Math.round(inDmg * 0.5);
      spawnEffect("counterburst", target.x, target.y - FIGHTERS[target.type].height * 0.55, 0.25);
    }
    // ===== David Overclock — +30% damage dealt while active
    if (!isDot && attackerUid) {
      const att2 = fightersRef.current.find((x) => x.uid === attackerUid);
      if (att2 && att2.type === "david" && (att2.overclockActive ?? 0) > 0) {
        inDmg = Math.round(inDmg * 1.3);
      }
    }
    // Critical hit: 12% chance on non-dot for +50% dmg
    const crit = !isDot && Math.random() < 0.12;
    const finalDmg = crit ? Math.round(inDmg * 1.5) : inDmg;
    target.hp -= finalDmg;
    target.hitFlash = isDot ? 0.15 : 0.25;
    // ===== Yuji Cursed Reservoir — both attacker (yuji) and victim (yuji) gain a stack
    if (!isDot) {
      const att3 = attackerUid ? fightersRef.current.find((x) => x.uid === attackerUid) : null;
      if (att3 && att3.type === "yuji" && !att3.possessed) {
        att3.cursedStacks = Math.min(5, (att3.cursedStacks ?? 0) + 1);
        if ((att3.cursedStacks ?? 0) >= 5) att3.cursedFlashReady = true;
      }
      if (target.type === "yuji" && !target.possessed) {
        target.cursedStacks = Math.min(5, (target.cursedStacks ?? 0) + 1);
        if ((target.cursedStacks ?? 0) >= 5) target.cursedFlashReady = true;
      }
    }
    target.hp -= finalDmg;
    target.hitFlash = isDot ? 0.15 : 0.25;
    if (!isDot) {
      target.bounce = 0.3;
      target.vx = fromFacing * (crit ? 360 : 260);
      target.vy = crit ? -360 : -300;
      target.state = "hurt";
      target.stateTimer = crit ? 0.42 : 0.32;
    }
    // Floating damage number
    const tdef = FIGHTERS[target.type];
    damageNumsRef.current.push({
      uid: nextUid(),
      x: target.x + (Math.random() - 0.5) * 16,
      y: target.y - tdef.height * 0.9,
      vy: isDot ? -28 : -70,
      life: isDot ? 0.55 : 0.85, maxLife: isDot ? 0.55 : 0.85,
      dmg: finalDmg, crit,
    });
    if (!isDot) bigHit(finalDmg);



    // ===== Yuji Counter Strike trigger =====
    if (!isDot && target.type === "yuji" && !target.possessed && target.counterActive > 0 && attackerUid && target.hp > 0) {
      const att = fightersRef.current.find((x) => x.uid === attackerUid && x.state !== "dead");
      if (att) {
        target.counterActive = 0;
        const adef = FIGHTERS[att.type];
        // Teleport behind the attacker
        const behindDir = att.facing as 1 | -1;
        target.x = att.x - behindDir * (adef.width * 0.6 + 8);
        target.y = att.y;
        target.vx = 0; target.vy = 0;
        target.facing = behindDir;
        target.state = "throw"; target.stateTimer = 0.2;
        target.stunned = 0; // free to act
        target.bounce = 0.3;
        // Weak punch damage but MASSIVE knockback
        applyDamage(att, 8, behindDir, target.uid);
        att.vx = behindDir * 1400;       // launched away
        att.vy = -520;
        att.stunned = Math.max(att.stunned, 0.4);
        att.bodySlamFrom = target.uid;
        att.bodySlamDmg = Math.max(20, Math.round(adef.def * 0.08)); // heavier fighters slam harder
        spawnEffect("counterburst", target.x, target.y - 50, 0.45);
        playSound(SOUNDS.punchHit, 0.85);
        playSound(SOUNDS.divergent, 0.6);
        triggerReaction(target, "chuckle");
        return;
      }
    }

    // ===== Passives — one-shot triggers when first crossing 30% HP =====
    if (!isDot && target.hp > 0 && !target.passiveUsed) {
      const ratio = target.hp / target.maxHp;
      if (ratio < 0.30) {
        if (target.type === "david") {
          // Adrenaline: free 1.6s Sandevistan + reset shot CD
          target.passiveUsed = true;
          startSande(target, 1.6, "short");
          target.abilityCd[1] = Math.min(target.abilityCd[1] ?? 0, 0.4);
          triggerReaction(target, "angry");
          shakeRef.current = Math.max(shakeRef.current, 0.25);
        } else if (target.type === "yuji" && !target.possessed) {
          // Second Wind: heal 25 HP
          target.passiveUsed = true;
          target.hp = Math.min(target.maxHp, target.hp + 25);
          triggerReaction(target, "angry");
          spawnEffect("counterburst", target.x, target.y - FIGHTERS[target.type].height * 0.55, 0.5);
        } else if (target.type === "deku") {
          // Plus Ultra: jumpstart the punch combo to stack 2 and refresh CDs
          target.passiveUsed = true;
          target.punchStacks = Math.max(target.punchStacks ?? 0, 2);
          target.punchStackTimer = 3.0;
          target.abilityCd[0] = 0; target.abilityCd[1] = 0;
          spawnEffect("electric", target.x, target.y - FIGHTERS[target.type].height * 0.55, 0.55);
          spawnEffect("greenfire", target.x, target.y - FIGHTERS[target.type].height * 0.55, 0.45);
          triggerReaction(target, "angry");
        } else if (target.type === "dummy") {
          // Rage: brief invuln-style stun-cleanse + reset attack CD for a comeback swing
          target.passiveUsed = true;
          target.stunned = 0;
          target.abilityCd[0] = 0;
          target.bounce = 0.4;
          triggerReaction(target, "angry");
        }
      }
    }


    // ===== Yuji → Sukuna transformation (about to die at 50 or less HP) =====
    if (target.type === "yuji" && !target.possessed && target.hp <= 50) {
      target.possessed = true;
      target.maxHp = SUKUNA_MAX_HP;
      target.hp = SUKUNA_MAX_HP;
      target.state = "idle";
      target.stateTimer = 0;
      target.dots = [];
      target.abilityCd = [0, 0];
      target.globalCd = 0.5;
      target.bounce = 0.4;
      playSound(SOUNDS.sukunaTransform, 1.0);
      triggerReaction(target, "angry");
      return;
    }

    if (target.hp <= 0) {
      target.hp = 0;
      target.state = "dead";
    } else {
      if (!isDot) playSound(SOUNDS.damage, 0.4);
      // Attacker may chuckle on hit (low chance) and target gets angry
      if (attackerUid && !isDot) {
        const att = fightersRef.current.find((x) => x.uid === attackerUid);
        if (att && Math.random() < 0.3 && att.tauntCd <= 0) {
          triggerReaction(att, "chuckle"); att.tauntCd = 2 + Math.random() * 2;
        }
        if (Math.random() < 0.4) triggerReaction(target, "angry");
      }
    }
  };


  const nearestEnemy = (self: Fighter, all: Fighter[]) => {
    let best: Fighter | null = null; let bestScore = Infinity;
    for (const o of all) {
      if (o.uid === self.uid || o.state === "dead") continue;
      const dist = Math.abs(o.x - self.x) + Math.abs(o.y - self.y) * 0.3;
      // Lower score = better target. Smart fighters favor finishable + recovering foes.
      let score = dist;
      const oHp = o.hp / o.maxHp;
      if (oHp < 0.35) score *= 0.55;                 // go for the kill
      if (o.state === "hurt") score *= 0.7;          // press the advantage
      if (o.state === "lunge" || o.state === "throw" || o.state === "shoot" || o.state === "taunt") score *= 0.8; // punishable
      if (!o.onGround) score *= 0.9;                 // catch them landing
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  };


  const fighterCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of fightersRef.current) m[f.type] = (m[f.type] || 0) + 1;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fightersRef.current.length]);

  const onFightersClick = () => {
    playSound(SOUNDS.click, 0.5);
    setShowFighters((v) => !v);
    setShowStats(false);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden gradient-bg">
      <div className="absolute top-4 right-4 z-30 flex gap-3">
        <button className="mc-btn" onClick={onFightersClick}>Fighters</button>
        <button className="mc-btn" onClick={() => { playSound(SOUNDS.click, 0.5); setDebugAi((v) => !v); }} style={{ opacity: debugAi ? 1 : 0.7 }}>
          {debugAi ? "Debug: ON" : "Debug: OFF"}
        </button>
        <button className="mc-btn danger" onClick={restart}>Restart</button>
      </div>

      <h1 className="absolute top-5 left-5 z-30 title-text text-[14px] text-white/70">
        Ani Fighters
      </h1>

      <div ref={arenaRef} className="absolute inset-0 z-10">
        <div className="absolute left-0 right-0 bottom-0" style={{
          height: GROUND_OFFSET,
          background: "linear-gradient(180deg, #2b2b2b 0%, #1a1a1a 100%)",
          borderTop: "2px solid #000",
          boxShadow: "inset 0 2px 0 0 #4a4a4a",
        }} />

        {/* Afterimages layer (under fighters) */}
        {fightersRef.current.flatMap((f) => {
          const def = FIGHTERS[f.type];
          return f.afterImages.map((a, i) => {
            const alpha = Math.max(0, a.life / 0.4) * 0.55;
            return (
              <div key={`${f.uid}-a-${i}`} className="absolute pointer-events-none"
                style={{
                  left: a.x - def.width / 2, top: a.y - def.height,
                  width: def.width, height: def.height,
                  opacity: alpha,
                  filter: `drop-shadow(0 0 8px hsl(${a.hue} 100% 55%)) drop-shadow(0 0 14px hsl(${a.hue} 100% 60%))`,
                }}>
                <img src={def.sprite} alt="" draggable={false}
                  style={{
                    width: "100%", height: "100%", imageRendering: "pixelated",
                    objectFit: "contain",
                    transform: `scaleX(${a.facing})`,
                    transformOrigin: "bottom center",
                    // colorize toward hue
                    filter: `brightness(1.1) saturate(2) hue-rotate(${a.hue - 200}deg)`,
                  }} />
              </div>
            );
          });
        })}

        {fightersRef.current.map((f) => {
          const def = FIGHTERS[f.type];
          const possessed = f.type === "yuji" && f.possessed;
          const sprite = possessed ? sukunaAsset.url : def.sprite;
          const displayName = possessed ? SUKUNA_NAME : def.name;
          // Pokemon-style wave bob during walk
          const wave = f.state === "walk" ? Math.sin(f.walkPhase) * 3 : 0;
          // Squash on landing
          const sq = f.bounce > 0 ? f.bounce : 0;
          const scaleY = 1 - sq * 0.35;
          const scaleX = 1 + sq * 0.25;
          const hpPct = f.hp / f.maxHp;
          const showGun = f.type === "david" && (f.state === "shoot" || timeRef.current % 1 < 1);
          // Divergent Fist windup: grow to 1.2x and tint light blue
          const windupActive = f.state === "windup" && f.windupKind === "divergent";
          const grow = windupActive ? 1 + 0.2 * f.windupGrow : 1;

          return (
            <div
              key={f.uid}
              className="absolute select-none cursor-pointer"
              style={{
                left: f.x - def.width / 2,
                top: f.y - def.height,
                width: def.width,
                height: def.height,
                transform: `translateY(${wave}px)`,
              }}
              onClick={(e) => { e.stopPropagation(); removeFighter(f.uid); }}
            >
              <div className="absolute left-1/2 -translate-x-1/2 -top-10 text-center" style={{ width: 120 }}>
                <div style={{ fontFamily: "Chakra Petch", fontSize: possessed ? 7.5 : 9, fontWeight: 700, color: possessed ? "#ff5a6e" : "#f0f0f0", textShadow: "1px 1px 0 #000", letterSpacing: 1, lineHeight: 1.1 }}>
                  {displayName.toUpperCase()}
                </div>

                <div style={{ fontFamily: "Chakra Petch", fontSize: 8, color: "#c6c6c6", textShadow: "1px 1px 0 #000" }}>
                  {Math.ceil(f.hp)}/{f.maxHp}
                </div>
                <div className="mc-bar mt-0.5 relative" style={{ width: 96, height: 7 }}>
                  <div style={{
                    width: `${hpPct * 100}%`,
                    height: "100%",
                    background: hpPct > 0.5
                      ? "linear-gradient(180deg, #b8b8b8, #6b6b6b)"
                      : hpPct > 0.25
                      ? "linear-gradient(180deg, #c9a86a, #8a6f3a)"
                      : "linear-gradient(180deg, #c45a45, #7a2e22)",
                    transition: "width 120ms linear",
                  }} />
                </div>
                {/* Cooldown pips */}
                {(() => {
                  const slots = possessed
                    ? [{ name: "Dismantle", cd: f.abilityCd[0] ?? 0, max: 15, color: "#ff5a6e" }, { name: "Clash", cd: f.abilityCd[1] ?? 0, max: 2.5, color: "#ffb04a" }]
                    : def.abilities.map((a, i) => ({ name: a.name, cd: f.abilityCd[i] ?? 0, max: a.cooldown, color: ["#4ec1ff", "#ffb04a", "#b884ff"][i] || "#aaa" }));
                  return (
                    <div className="flex gap-1 justify-center mt-1" style={{ width: 96, marginLeft: "auto", marginRight: "auto" }}>
                      {slots.map((s, i) => {
                        const ready = s.cd <= 0.001;
                        const pct = ready ? 1 : 1 - s.cd / s.max;
                        return (
                          <div key={i} title={s.name} className="relative" style={{
                            flex: 1, height: 4,
                            background: "rgba(0,0,0,0.65)",
                            border: "1px solid #000",
                            boxShadow: ready ? `0 0 4px ${s.color}` : "none",
                          }}>
                            <div style={{
                              width: `${pct * 100}%`, height: "100%",
                              background: ready ? s.color : `${s.color}88`,
                              transition: "width 80ms linear",
                            }} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {debugAi && (
                  <div style={{ fontFamily: "Chakra Petch", fontSize: 7, color: "#9be0ff", textShadow: "1px 1px 0 #000", marginTop: 2, lineHeight: 1.1 }}>
                    {f.intent} | {f.state}{f.stunned > 0 ? " | STUN" : ""}{f.counterActive > 0 ? " | CTR" : ""}{f.sandeActive > 0 ? " | SAND" : ""}
                    <div style={{ color: "#ffd16e" }}>
                      gcd {f.globalCd.toFixed(1)} | tgt {f.tauntedBy ?? "-"}
                    </div>
                  </div>
                )}
              </div>


              {/* Reaction icon */}
              {f.reactionIcon && (
                <img src={f.reactionIcon.url} alt="" className="absolute"
                  style={{
                    left: "50%", top: -56, width: 28, height: 28,
                    transform: "translateX(-50%)",
                    imageRendering: "pixelated",
                    filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.6))",
                  }} />
              )}

              <img
                src={sprite}
                alt={displayName}
                draggable={false}
                style={{
                  width: "100%", height: "100%",
                  imageRendering: "pixelated", objectFit: "contain",
                  transform: `scaleX(${f.facing * scaleX * grow}) scaleY(${scaleY * grow})`,
                  transformOrigin: "bottom center",
                  filter: f.hitFlash > 0
                    ? `brightness(0.4) saturate(2) drop-shadow(0 0 6px #ff5544)`
                    : windupActive
                    ? `brightness(1.15) saturate(1.4) drop-shadow(0 0 ${4 + 12 * f.windupGrow}px #5ec8ff) drop-shadow(0 0 ${6 + 16 * f.windupGrow}px #2aa8ff) hue-rotate(${f.windupGrow * 25}deg)`
                    : f.counterActive > 0
                    ? `brightness(1.2) drop-shadow(0 0 10px #ffffff) drop-shadow(0 0 18px #e8f4ff)`
                    : f.sandeActive > 0
                    ? `drop-shadow(0 0 10px hsl(${hueAt(timeRef.current)} 100% 60%))`
                    : "drop-shadow(0 4px 0 rgba(0,0,0,0.5))",
                  transition: "filter 80ms",
                  pointerEvents: "auto",
                }}
              />

              {/* Counter Strike white particles */}
              {f.counterActive > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  {Array.from({ length: 10 }).map((_, i) => {
                    const ang = (i / 10) * Math.PI * 2 + timeRef.current * 3;
                    const r = 28 + Math.sin(timeRef.current * 6 + i) * 6;
                    const px = 50 + Math.cos(ang) * r;
                    const py = 55 + Math.sin(ang) * r * 0.9;
                    return (
                      <div key={i} className="absolute" style={{
                        left: `${px}%`, top: `${py}%`,
                        width: 4, height: 4, borderRadius: "50%",
                        background: "#fff",
                        boxShadow: "0 0 6px #fff, 0 0 12px #e0f0ff",
                        transform: "translate(-50%,-50%)",
                      }} />
                    );
                  })}
                </div>
              )}

              {/* Deku ambient electric sparks — intensifies with combo stacks / windups */}
              {f.type === "deku" && (() => {
                const stacks = f.punchStacks ?? 0;
                const charged = stacks > 0 || !!f.whip || (f.state === "windup" && f.windupKind === "detroit");
                const surge = stacks >= 3; // One For All Surge — about to fire mega
                const count = surge ? 18 : charged ? 8 + stacks * 2 : 4;
                const intensity = surge ? 1.6 : charged ? 1 : 0.5;
                return (
                  <div className="absolute inset-0 pointer-events-none">
                    {Array.from({ length: count }).map((_, i) => {
                      const ang = (i / count) * Math.PI * 2 + timeRef.current * (2 + stacks);
                      const r = 22 + Math.sin(timeRef.current * 9 + i * 1.7) * 8;
                      const px = 50 + Math.cos(ang) * r;
                      const py = 55 + Math.sin(ang) * r * 0.85;
                      const flick = (Math.sin(timeRef.current * 22 + i * 3) + 1) * 0.5;
                      return (
                        <div key={i} className="absolute" style={{
                          left: `${px}%`, top: `${py}%`,
                          width: 3, height: 3, borderRadius: "50%",
                          background: "#bff5ff",
                          boxShadow: `0 0 ${4 + flick * 6}px #6bd9ff, 0 0 ${8 + flick * 10}px rgba(58,255,197,${0.5 * intensity})`,
                          opacity: 0.6 + flick * 0.4 * intensity,
                          transform: "translate(-50%,-50%)",
                        }} />
                      );
                    })}
                  </div>
                );
              })()}




              {/* Gun for David - sits on the side, mirrored opposite */}
              {showGun && (
                <img src={gunAsset.url} alt="" draggable={false}
                  className="absolute pointer-events-none"
                  style={{
                    width: 28, height: 28,
                    left: "50%", top: "55%",
                    // place on the side the character is facing
                    transform: `translate(${f.facing > 0 ? 4 : -32}px, -50%) scaleX(${-f.facing})`,
                    imageRendering: "pixelated",
                    filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.5))",
                  }} />
              )}
            </div>
          );
        })}

        {projectilesRef.current.map((p) => (
          p.kind === "bullet" ? (
            <div key={p.uid} className="absolute pointer-events-none"
              style={{
                left: p.x - 4, top: p.y - 2,
                width: 10, height: 4,
                background: "linear-gradient(90deg, #fff, #ffd24a)",
                border: "1px solid #000",
                boxShadow: "0 0 6px #ffb347",
              }} />
          ) : p.kind === "dismantle" ? (
            <img key={p.uid} src={dismantleAsset.url} alt="" draggable={false}
              className="absolute pointer-events-none"
              style={{
                left: p.x - 26, top: p.y - 40,
                width: 52, height: 80,
                imageRendering: "pixelated", objectFit: "contain",
                transform: `scaleX(${Math.sign(p.vx) || 1})`,
                filter: "drop-shadow(0 0 6px rgba(180,30,40,0.8)) brightness(0.95)",
              }} />
          ) : p.kind === "clash" ? (
            <div key={p.uid} className="absolute pointer-events-none"
              style={{
                left: p.x - 14, top: p.y - 4,
                width: 28, height: 8,
                background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, #fff 35%, #ffb0b0 70%, rgba(180,30,40,0) 100%)",
                transform: `scaleX(${Math.sign(p.vx) || 1}) skewX(-20deg)`,
                filter: "drop-shadow(0 0 6px rgba(220,60,80,0.85))",
                borderRadius: 4,
              }} />
          ) : (
            <div key={p.uid} className="absolute pointer-events-none"
              style={{
                left: p.x - 8, top: p.y - 8, width: 16, height: 16,
                background: "radial-gradient(circle, #fff 0%, #c6c6c6 60%, #6b6b6b 100%)",
                border: "2px solid #000", borderRadius: "50%",
              }} />
          )
        ))}

        {/* Hit effects layer (above fighters) */}
        {effectsRef.current.map((e) => {
          const t = 1 - e.life / e.maxLife; // 0..1 progress
          const fade = e.life / e.maxLife;   // 1..0
          if (e.kind === "bluefire") {
            const size = 40 + t * 60;
            return (
              <div key={e.uid} className="absolute pointer-events-none" style={{
                left: e.x - size / 2, top: e.y - size / 2,
                width: size, height: size, borderRadius: "50%",
                opacity: fade,
                background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(120,200,255,0.9) 35%, rgba(40,140,255,0.6) 60%, rgba(20,80,220,0) 75%)",
                boxShadow: `0 0 ${18 * fade}px rgba(90,200,255,0.9), 0 0 ${30 * fade}px rgba(40,140,255,0.7)`,
                mixBlendMode: "screen",
              }} />
            );
          }
          if (e.kind === "cut") {
            // Slash gash + a few blood droplets flung outward
            const angle = (e.seed % 180) - 90; // deg
            const len = 36 + (e.seed % 18);
            return (
              <div key={e.uid} className="absolute pointer-events-none" style={{
                left: e.x, top: e.y, opacity: fade,
              }}>
                <div className="absolute" style={{
                  left: -len / 2, top: -2,
                  width: len, height: 4,
                  background: "linear-gradient(90deg, rgba(120,0,0,0) 0%, #c01a1a 30%, #ff3333 50%, #c01a1a 70%, rgba(120,0,0,0) 100%)",
                  transform: `rotate(${angle}deg)`,
                  boxShadow: "0 0 6px rgba(200,20,20,0.9)",
                  borderRadius: 2,
                }} />
                {Array.from({ length: 6 }).map((_, i) => {
                  const a = ((e.seed + i * 47) % 360) * Math.PI / 180;
                  const dist = 6 + t * (16 + (i * 3));
                  const sz = 3 + ((e.seed + i) % 3);
                  return (
                    <div key={i} className="absolute" style={{
                      left: Math.cos(a) * dist - sz / 2,
                      top: Math.sin(a) * dist - sz / 2 + t * 6,
                      width: sz, height: sz, borderRadius: "50%",
                      background: i % 2 ? "#a01010" : "#d61f1f",
                      boxShadow: "0 0 3px rgba(160,0,0,0.8)",
                    }} />
                  );
                })}
              </div>
            );
          }
          if (e.kind === "counterburst") {
            const size = 30 + t * 90;
            return (
              <div key={e.uid} className="absolute pointer-events-none" style={{
                left: e.x - size / 2, top: e.y - size / 2,
                width: size, height: size, borderRadius: "50%",
                opacity: fade,
                background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(220,235,255,0.7) 40%, rgba(160,200,255,0) 75%)",
                boxShadow: `0 0 ${20 * fade}px #fff, 0 0 ${40 * fade}px #cfe6ff`,
                mixBlendMode: "screen",
              }} />
            );
          }
          if (e.kind === "greenfire") {
            const size = 36 + t * 64;
            return (
              <div key={e.uid} className="absolute pointer-events-none" style={{
                left: e.x - size / 2, top: e.y - size / 2,
                width: size, height: size, borderRadius: "50%",
                opacity: fade,
                background: "radial-gradient(circle, rgba(220,255,230,0.95) 0%, rgba(80,255,160,0.85) 30%, rgba(20,200,140,0.55) 60%, rgba(0,80,40,0) 78%)",
                boxShadow: `0 0 ${16 * fade}px rgba(80,255,160,0.95), 0 0 ${30 * fade}px rgba(30,200,140,0.75)`,
                mixBlendMode: "screen",
              }} />
            );
          }
          if (e.kind === "electric") {
            const bolts = 7;
            return (
              <div key={e.uid} className="absolute pointer-events-none" style={{
                left: e.x - 50, top: e.y - 50, width: 100, height: 100, opacity: fade,
                mixBlendMode: "screen",
              }}>
                <div className="absolute inset-0" style={{
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(180,240,255,0.55) 0%, rgba(80,180,255,0.25) 45%, rgba(0,0,0,0) 70%)",
                  boxShadow: `0 0 ${18 * fade}px rgba(160,230,255,0.9)`,
                }} />
                <svg viewBox="0 0 100 100" className="absolute inset-0" width="100" height="100">
                  {Array.from({ length: bolts }).map((_, i) => {
                    const ang = (i / bolts) * Math.PI * 2 + e.seed + t * 4;
                    const len = 30 + ((e.seed * (i + 2)) % 18);
                    const jx = 50 + Math.cos(ang) * len * 0.45 + Math.sin(t * 40 + i) * 7;
                    const jy = 50 + Math.sin(ang) * len * 0.45 + Math.cos(t * 40 + i) * 7;
                    const ex = 50 + Math.cos(ang) * len;
                    const ey = 50 + Math.sin(ang) * len;
                    const d = `M50 50 L${jx.toFixed(1)} ${jy.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)}`;
                    return (
                      <g key={i}>
                        <path d={d} stroke="#bff5ff" strokeWidth={3.2} fill="none"
                          strokeLinejoin="round" strokeLinecap="round"
                          style={{ filter: `drop-shadow(0 0 ${4 * fade}px #6bd9ff) drop-shadow(0 0 ${8 * fade}px #2aa7ff)` }} />
                        <path d={d} stroke="#ffffff" strokeWidth={1.2} fill="none"
                          strokeLinejoin="round" strokeLinecap="round" />
                      </g>
                    );
                  })}
                </svg>
              </div>
            );
          }
          if (e.kind === "shockwave") {
            const prog = 1 - fade; // 0..1 expansion
            const size = 40 + prog * 220;
            return (
              <div key={e.uid} className="absolute pointer-events-none" style={{
                left: e.x - size / 2, top: e.y - size / 6, width: size, height: size / 3, opacity: fade * 0.95,
                mixBlendMode: "screen",
              }}>
                <div className="absolute inset-0" style={{
                  borderRadius: "50%",
                  border: `${Math.max(1, 5 * fade)}px solid #bff5ff`,
                  boxShadow: `0 0 ${20 * fade}px #6bd9ff, inset 0 0 ${16 * fade}px rgba(58,255,197,0.6)`,
                }} />
                <div className="absolute inset-2" style={{
                  borderRadius: "50%",
                  border: `${Math.max(1, 2 * fade)}px solid rgba(255,255,255,${0.9 * fade})`,
                }} />
              </div>
            );
          }
          if (e.kind === "wallspark") {
            return (
              <div key={e.uid} className="absolute pointer-events-none" style={{
                left: e.x - 40, top: e.y - 40, width: 80, height: 80, opacity: fade,
                mixBlendMode: "screen",
              }}>
                <div className="absolute inset-0" style={{
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(180,255,220,0.7) 0%, rgba(58,255,197,0.35) 45%, rgba(0,0,0,0) 70%)",
                  boxShadow: `0 0 ${18 * fade}px #3affc5`,
                }} />
                <svg viewBox="0 0 80 80" className="absolute inset-0" width="80" height="80">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const ang = (i / 6) * Math.PI * 2 + e.seed;
                    const len = 14 + ((e.seed * (i + 1)) % 14) + (1 - fade) * 14;
                    const ex = 40 + Math.cos(ang) * len;
                    const ey = 40 + Math.sin(ang) * len;
                    return (
                      <path key={i} d={`M40 40 L${ex.toFixed(1)} ${ey.toFixed(1)}`}
                        stroke="#bff5ff" strokeWidth={2.2} fill="none" strokeLinecap="round"
                        style={{ filter: `drop-shadow(0 0 ${4 * fade}px #3affc5)` }} />
                    );
                  })}
                </svg>
              </div>
            );
          }
          if (e.kind === "megaring") {
            const prog = 1 - fade;
            const size = 80 + prog * 360;
            return (
              <div key={e.uid} className="absolute pointer-events-none" style={{
                left: e.x - size / 2, top: e.y - size / 2, width: size, height: size, opacity: fade,
                mixBlendMode: "screen",
              }}>
                <div className="absolute inset-0" style={{
                  borderRadius: "50%",
                  border: `${Math.max(2, 8 * fade)}px solid #3affc5`,
                  boxShadow: `0 0 ${30 * fade}px #6bd9ff, inset 0 0 ${22 * fade}px rgba(191,245,255,0.9)`,
                }} />
                <div className="absolute" style={{
                  left: "50%", top: "50%",
                  width: size * 0.55, height: size * 0.55,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, rgba(191,245,255,${0.55 * fade}) 0%, rgba(58,255,197,${0.25 * fade}) 50%, rgba(0,0,0,0) 75%)`,
                  transform: "translate(-50%,-50%)",
                }} />
              </div>
            );
          }
          const bolts = 5;
          return (
            <div key={e.uid} className="absolute pointer-events-none" style={{
              left: e.x - 60, top: e.y - 60, width: 120, height: 120, opacity: fade,
            }}>
              <div className="absolute inset-0" style={{
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(255,40,60,0.45) 0%, rgba(120,0,20,0.25) 45%, rgba(0,0,0,0) 70%)",
                boxShadow: `0 0 ${24 * fade}px rgba(255,30,50,0.9)`,
              }} />
              <svg viewBox="0 0 120 120" className="absolute inset-0" width="120" height="120">
                {Array.from({ length: bolts }).map((_, i) => {
                  const ang = (i / bolts) * Math.PI * 2 + e.seed + t * 6;
                  const len = 50 + ((e.seed * (i + 1)) % 18);
                  const mx = 60 + Math.cos(ang) * len * 0.5 + Math.sin(t * 30 + i) * 6;
                  const my = 60 + Math.sin(ang) * len * 0.5 + Math.cos(t * 30 + i) * 6;
                  const ex = 60 + Math.cos(ang) * len;
                  const ey = 60 + Math.sin(ang) * len;
                  const d = `M60 60 L${mx.toFixed(1)} ${my.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)}`;
                  return (
                    <g key={i}>
                      <path d={d} stroke="#ff1f3a" strokeWidth={5} fill="none"
                        strokeLinejoin="round" strokeLinecap="round"
                        style={{ filter: `drop-shadow(0 0 ${5 * fade}px #ff2540) drop-shadow(0 0 ${9 * fade}px #ff0030)` }} />
                      <path d={d} stroke="#0a0a0a" strokeWidth={2.4} fill="none"
                        strokeLinejoin="round" strokeLinecap="round" />
                    </g>
                  );
                })}
              </svg>
            </div>
          );
        })}

        {/* Floating damage numbers */}
        {damageNumsRef.current.map((n) => {
          const fade = Math.min(1, n.life / n.maxLife);
          const size = n.crit ? 18 : 12;
          return (
            <div key={n.uid} className="absolute pointer-events-none" style={{
              left: n.x, top: n.y,
              transform: `translate(-50%,-50%) scale(${n.crit ? 1 + (1 - fade) * 0.3 : 1})`,
              fontFamily: "Chakra Petch", fontWeight: 800,
              fontSize: size,
              color: n.crit ? "#fff35a" : "#fff",
              textShadow: n.crit
                ? "0 0 6px #ff5a3a, 1px 1px 0 #000, -1px -1px 0 #000"
                : "1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000",
              opacity: fade,
              whiteSpace: "nowrap",
            }}>
              {n.crit ? `${n.dmg}!` : n.dmg}
            </div>
          );
        })}

        {/* Deku Black Whip ropes */}
        {fightersRef.current.filter((f) => f.whip).map((f) => {
          const def = FIGHTERS[f.type];
          const w = f.whip!;
          const srcX = f.x;
          const srcY = w.sourceY;
          const tipX = w.tipX ?? srcX;
          let tipY: number;
          if (w.mode === "wall") {
            tipY = w.tipY ?? (w.wallY ?? srcY);
          } else {
            const target = fightersRef.current.find((o) => o.uid === w.targetUid);
            tipY = target ? target.y - FIGHTERS[target.type].height * 0.55 : (w.tipY ?? srcY);
          }
          const dx = tipX - srcX; const dy = tipY - srcY;
          const len = Math.max(1, Math.hypot(dx, dy));
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          const maxLife = w.mode === "wall" ? 0.9 : 0.75;
          const fade = Math.max(0, 1 - w.t / maxLife);
          // Crackle along the rope: small sparks every ~24px
          const sparkCount = Math.min(8, Math.floor(len / 24));
          return (
            <div key={`whip-${f.uid}`} className="absolute pointer-events-none" style={{ left: srcX, top: srcY, opacity: fade }}>
              {/* main rope */}
              <div style={{
                position: "absolute", left: 0, top: -3,
                width: len, height: 6,
                background: "linear-gradient(180deg, #000 0%, #000 35%, #1a1a1a 50%, #000 65%, #000 100%)",
                border: "1px solid #3affc5",
                boxShadow: "0 0 6px #3affc5, 0 0 12px rgba(58,255,197,0.5)",
                transform: `rotate(${angle}deg)`,
                transformOrigin: "0 50%",
                borderRadius: 2,
              }} />
              {/* electric crackle running along the rope */}
              <div style={{
                position: "absolute", left: 0, top: 0,
                width: len, height: 1,
                transform: `rotate(${angle}deg)`,
                transformOrigin: "0 50%",
              }}>
                {Array.from({ length: sparkCount }).map((_, i) => {
                  const k = (i + 0.5) / sparkCount;
                  const jitter = Math.sin(timeRef.current * 30 + i * 1.7) * 3;
                  return (
                    <div key={i} style={{
                      position: "absolute",
                      left: k * len - 2, top: jitter - 2,
                      width: 4, height: 4, borderRadius: "50%",
                      background: "#bff5ff",
                      boxShadow: "0 0 6px #3affc5, 0 0 10px #6bd9ff",
                    }} />
                  );
                })}
              </div>
              {/* side rope wisps during initial pop (first 0.18s) */}
              {w.t < 0.18 && [-1, 1].map((s) => (
                <div key={s} style={{
                  position: "absolute",
                  left: s * (def.width * 0.45),
                  top: -10 - (w.t / 0.18) * 12,
                  width: 4, height: 18 + (w.t / 0.18) * 14,
                  background: "#000",
                  border: "1px solid #3affc5",
                  boxShadow: "0 0 4px #3affc5",
                  borderRadius: 2,
                }} />
              ))}
              {/* anchor flare at the rope tip (wall hook) */}
              {w.mode === "wall" && w.phase === "drag" && (
                <div style={{
                  position: "absolute",
                  left: dx - 8, top: dy - 8,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "radial-gradient(circle, #fff 0%, #3affc5 60%, rgba(0,0,0,0) 100%)",
                  boxShadow: "0 0 12px #3affc5, 0 0 22px #6bd9ff",
                }} />
              )}
            </div>
          );
        })}
      </div>



      {showFighters && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" onClick={() => { playSound(SOUNDS.click, 0.4); setShowFighters(false); setShowStats(false); }}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="mc-panel relative animate-panel-open p-6"
            style={{ width: "min(92vw, 620px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="title-text" style={{ fontSize: 18, color: "#f0f0f0" }}>Fighters</h2>
              <button className="mc-btn small danger" onClick={() => { playSound(SOUNDS.click, 0.4); setShowFighters(false); setShowStats(false); }}>X</button>
            </div>

            {!showStats ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <SlotCard selected={selectedSlot === "dummy"}
                    onClick={() => { playSound(SOUNDS.click, 0.4); setSelectedSlot("dummy"); }}
                    sprite={FIGHTERS.dummy.sprite} name="Dummy" />
                  <SlotCard selected={selectedSlot === "david"}
                    onClick={() => { playSound(SOUNDS.click, 0.4); setSelectedSlot("david"); }}
                    sprite={FIGHTERS.david.sprite} name="David Martinez" />
                  <SlotCard selected={selectedSlot === "yuji"}
                    onClick={() => { playSound(SOUNDS.click, 0.4); setSelectedSlot("yuji"); }}
                    sprite={FIGHTERS.yuji.sprite} name="Yuji Itadori" />
                  <SlotCard selected={selectedSlot === "deku"}
                    onClick={() => { playSound(SOUNDS.click, 0.4); setSelectedSlot("deku"); }}
                    sprite={FIGHTERS.deku.sprite} name="Deku" />
                </div>


                <div className="mt-6 flex flex-col gap-3 items-center">
                  <button className="mc-btn"
                    onClick={() => {
                      playSound(SOUNDS.click, 0.4);
                      const ok = spawnFighter(selectedSlot);
                      if (ok) setShowFighters(false);
                    }}>
                    Spawn In ({fighterCounts[selectedSlot] ?? 0}/3)
                  </button>
                  <button className="mc-btn small"
                    onClick={() => { playSound(SOUNDS.click, 0.4); setShowStats(true); }}>
                    Stats
                  </button>
                </div>
              </>
            ) : (
              <StatsView typeId={selectedSlot} onBack={() => { playSound(SOUNDS.click, 0.4); setShowStats(false); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SlotCard({ selected, locked, sprite, name, onClick }: {
  selected?: boolean; locked?: boolean; sprite?: string; name: string; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} disabled={locked}
      className={`mc-slot relative p-3 flex flex-col items-center ${selected ? "selected" : ""} ${locked ? "locked" : ""}`}>
      {selected && (
        <div className="absolute -top-2 -right-2" style={{
          background: "#f0f0f0", color: "#0e0e0e",
          fontFamily: "Chakra Petch", fontWeight: 700, fontSize: 10,
          padding: "2px 6px", border: "2px solid #000", letterSpacing: 1,
        }}>
          ✓ SELECTED
        </div>
      )}
      <div className="w-24 h-32 flex items-center justify-center mb-2" style={{
        background: "#0e0e0e", border: "2px solid #000",
        boxShadow: "inset 1px 1px 0 0 #2b2b2b", imageRendering: "pixelated",
      }}>
        {sprite ? <img src={sprite} alt={name} className="max-h-full max-w-full" style={{ imageRendering: "pixelated" }} />
          : <span style={{ fontFamily: "Chakra Petch", fontWeight: 700, fontSize: 32, color: "#6b6b6b" }}>?</span>}
      </div>
      <div style={{ fontFamily: "Chakra Petch", fontWeight: 700, fontSize: 12, color: "#f0f0f0", textShadow: "1px 1px 0 #000", letterSpacing: 1 }}>
        {name.toUpperCase()}
      </div>
      {locked && <div style={{ fontFamily: "Chakra Petch", fontSize: 9, color: "#9a9a9a", marginTop: 4 }}>LOCKED</div>}
    </button>
  );
}

function StatsView({ typeId, onBack }: { typeId: FighterTypeId; onBack: () => void }) {
  const def = FIGHTERS[typeId];
  return (
    <div className="flex flex-col gap-3" style={{ fontFamily: "Chakra Petch" }}>
      <div className="flex gap-4 items-center">
        <div className="w-24 h-32 flex items-center justify-center" style={{ background: "#0e0e0e", border: "2px solid #000", boxShadow: "inset 1px 1px 0 0 #2b2b2b" }}>
          <img src={def.sprite} alt={def.name} className="max-h-full max-w-full" style={{ imageRendering: "pixelated" }} />
        </div>
        <div className="flex flex-col gap-2" style={{ fontSize: 13, color: "#f0f0f0" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2 }}>{def.name.toUpperCase()}</div>
          <Stat label="ATK" value={def.atk} />
          <Stat label="DEF/HP" value={def.def} />
          <Stat label="SPEED" value={`${def.speed}x`} />
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#c6c6c6", letterSpacing: 2, marginTop: 6 }}>ABILITIES</div>
      <div className="flex flex-col gap-2">
        {def.abilities.map((a) => (
          <div key={a.name} className="flex justify-between items-center px-3 py-2"
            style={{ fontSize: 12, fontWeight: 600, background: "#0e0e0e", border: "2px solid #000", boxShadow: "inset 1px 1px 0 0 #2b2b2b", color: "#f0f0f0" }}>
            <span>{a.name}{a.type === "status" ? " [STATUS]" : ""}</span>
            <span style={{ color: "#c6c6c6" }}>
              {a.type === "status" ? "—" : `${a.damage} DMG`} · {a.cooldown}s CD
            </span>
          </div>
        ))}
      </div>
      <button className="mc-btn small mt-3 self-center" onClick={onBack}>Back</button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex gap-3" style={{ fontWeight: 600 }}>
      <span style={{ minWidth: 70, color: "#9a9a9a" }}>{label}:</span>
      <span style={{ color: "#f0f0f0" }}>{value}</span>
    </div>
  );
}
