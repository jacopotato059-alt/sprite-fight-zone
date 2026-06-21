import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dummySprite from "@/assets/dummy.png";
import davidAsset from "@/assets/david.png.asset.json";
import gunAsset from "@/assets/gun.png.asset.json";
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
};

function playSound(url: string, volume = 0.6): HTMLAudioElement | null {
  try {
    const a = new Audio(url);
    a.volume = volume;
    void a.play();
    return a;
  } catch { return null; }
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

type FighterTypeId = "dummy" | "david";

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
};

interface AfterImage { x: number; y: number; facing: 1 | -1; hue: number; life: number; }
interface Fighter {
  uid: number; type: FighterTypeId;
  x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number;
  facing: 1 | -1;
  state: "idle" | "walk" | "lunge" | "throw" | "shoot" | "hurt" | "dead" | "taunt";
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
  // David
  sandeActive: number; // seconds remaining
  sandeHue: number;
  afterTimer: number;
  afterImages: AfterImage[];
  lastAfterX?: number; lastAfterY?: number;
  sandeAttackCd: number;
  shotsLeft: number; shotTimer: number; shotTarget?: number;
  // Taunt / reactions
  reactionIcon?: { url: string; until: number };
  tauntedBy?: number; // uid that taunted this one (makes them angry/focused)
  tauntCd: number;
  lastDodgedFrom?: number; // uid we just dodged - chance to taunt them
  lastTrickedFrom?: number;
}
interface Projectile {
  uid: number; ownerUid: number; kind: "cotton" | "bullet";
  x: number; y: number; vx: number; vy: number;
  damage: number; ttl: number;
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

function Game() {
  const [showFighters, setShowFighters] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<FighterTypeId>("dummy");
  const [showStats, setShowStats] = useState(false);
  const [, forceTick] = useState(0);
  const fightersRef = useRef<Fighter[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const arenaRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

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
    fightersRef.current.push({
      uid: nextUid(), type,
      x, y: -100, vx: 0, vy: 0,
      hp: def.def, maxHp: def.def,
      facing: Math.random() > 0.5 ? 1 : -1,
      state: "idle", stateTimer: 0,
      abilityCd: def.abilities.map(() => 0.6),
      globalCd: 0.4,
      hitFlash: 0, bounce: 0, walkPhase: 0,
      onGround: false, jumpCd: 0, jumpsLeft: 2,
      decisionCd: 0, intent: "approach", intentTimer: 0,
      reactionDelay: 0.12 + Math.random() * 0.18,
      sandeActive: 0, sandeHue: 0, afterTimer: 0, afterImages: [], sandeAttackCd: 0,
      shotsLeft: 0, shotTimer: 0,
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
    playSound(SOUNDS.click, 0.5);
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const dt = Math.min(0.05, (t - lastTimeRef.current) / 1000);
      lastTimeRef.current = t;
      timeRef.current += dt;
      step(dt);
      forceTick((n) => (n + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
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
    if (withSound === "full") playSound(SOUNDS.sande, 1.0);
    else playSoundFade(SOUNDS.sande, 700, 300, 1.0);
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
      if (f.reactionIcon && f.reactionIcon.until < timeRef.current) f.reactionIcon = undefined;

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
              playSound(SOUNDS.punchHit, 0.7);
              f.lungeHit = true;
              break;
            }
          }
        }
        if (p >= 1) {
          // missed? give target chance to taunt
          if (!f.lungeHit) {
            const tgt = nearestEnemy(f, fighters);
            if (tgt) { tgt.lastDodgedFrom = f.uid; tauntAt(tgt, f); }
          }
          f.state = "idle";
          f.lungeFromX = f.lungeToX = f.lungeProgress = undefined;
          f.lungeHit = false; f.lungeFast = false;
          f.bounce = 0.22;
        }
      } else if (f.state === "shoot") {
        // Firing bullets sequence
        if (f.shotsLeft > 0) {
          f.shotTimer -= dt;
          if (f.shotTimer <= 0) {
            f.shotTimer = 0.12;
            f.shotsLeft -= 1;
            const dir = f.facing;
            projectilesRef.current.push({
              uid: nextUid(), ownerUid: f.uid, kind: "bullet",
              x: f.x + dir * 30, y: f.y - def.height * 0.55,
              vx: dir * BULLET_SPEED, vy: -10 + (Math.random() - 0.5) * 30,
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


          // Battle IQ - intent selection
          if (f.decisionCd <= 0) {
            f.decisionCd = 0.14 + Math.random() * 0.16;
            const r = Math.random();
            const enemyBusy = enemy.state === "lunge" || enemy.state === "throw" || enemy.state === "shoot" || enemy.state === "hurt" || enemy.state === "taunt";
            const canAttackSoon = f.abilityCd.some((cd, i) => cd < 0.4 && def.abilities[i].type !== "status");
            const enemyAirborne = !enemy.onGround && enemy.y < f.y - 60;
            const enemyHpRatio = enemy.hp / enemy.maxHp;
            // Read the situation like a real player would
            if (enemyBusy && canAttackSoon) f.intent = "punish";          // whiff/animation punish
            else if (enemyAirborne && canAttackSoon) f.intent = "punish"; // anti-air read
            else if (hpRatio < 0.28 && r < 0.6) f.intent = "retreat";     // survival, reset neutral
            else if (enemyHpRatio < 0.3 && canAttackSoon && r < 0.7) f.intent = "approach"; // close out the kill
            else if (!canAttackSoon) f.intent = r < 0.5 ? "space" : "bait"; // stall while on cooldown
            else if (r < 0.5) f.intent = "approach";
            else if (r < 0.78) f.intent = "space";
            else f.intent = "bait";
            f.intentTimer = 0.5 + Math.random() * 0.6;
          }


          // ===== Ability decisions (priority order) =====
          const tryUse = (idx: number) => f.abilityCd[idx] <= 0 && f.globalCd <= 0;

          if (isDavid) {
            // While Sandevistan is ACTIVE: free fast normal-style punches (no extra CD on the status itself)
            if (f.sandeActive > 0 && f.sandeAttackCd <= 0 && f.globalCd <= 0 && dist < LUNGE_DISTANCE * 1.1) {
              f.state = "lunge"; f.stateTimer = LUNGE_DURATION / 3;
              f.lungeFromX = f.x;
              f.lungeToX = f.x + f.facing * Math.min(LUNGE_DISTANCE, dist + 40);
              f.lungeProgress = 0; f.lungeHit = false; f.lungeFast = true;
              f.lungeDamage = 25; // normal punch damage during sandevistan
              f.sandeAttackCd = 0.45;
              f.globalCd = 0.25;
              playSound(SOUNDS.punchLunge, 0.55);
              continue;
            }
            // Sandevistan status: pop on aggression, when pressured, or to punish — much more engaging
            if (tryUse(0) && (hpRatio < 0.6 || (enemy.state === "lunge" && dist < 220) || (f.intent === "punish") || (dist < 260 && Math.random() < 0.4))) {
              startSande(f, 3, "full");
              f.abilityCd[0] = 12; f.globalCd = 0.3;
            }
            // Shots Fired ranged
            else if (tryUse(1) && dist > MELEE_RANGE * 1.1 && dist < w * 0.95) {
              f.state = "shoot"; f.stateTimer = 0.55;
              f.shotsLeft = 3; f.shotTimer = 0;
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
          } else {
            // Dummy abilities
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
          const push = (PUSH_RADIUS - Math.abs(ddx)) * 6;
          const sign = ddx === 0 ? (Math.random() > 0.5 ? 1 : -1) : Math.sign(ddx);
          f.vx += sign * push * dt;
        }
      }

      // ===== Physics =====
      f.vy += GRAVITY * dt;
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
        const tdef = FIGHTERS[t.type];
        if (Math.abs(t.x - p.x) < tdef.width * 0.55 && Math.abs((t.y - tdef.height * 0.5) - p.y) < tdef.height * 0.55) {
          applyDamage(t, p.damage, Math.sign(p.vx) as 1 | -1, p.ownerUid);
          playSound(SOUNDS.damage, 0.45);
          return false;
        }
      }
      return true;
    });

    fightersRef.current = fightersRef.current.filter((f) => f.state !== "dead");
  };

  const applyDamage = (target: Fighter, dmg: number, fromFacing: 1 | -1, attackerUid?: number) => {
    target.hp -= dmg;
    target.hitFlash = 0.25;
    target.bounce = 0.3;
    target.vx = fromFacing * 260;
    target.vy = -300;
    target.state = "hurt";
    target.stateTimer = 0.32;
    if (target.hp <= 0) {
      target.hp = 0;
      target.state = "dead";
    } else {
      playSound(SOUNDS.damage, 0.4);
      // Attacker may chuckle on hit (low chance) and target gets angry
      if (attackerUid) {
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
          // Pokemon-style wave bob during walk
          const wave = f.state === "walk" ? Math.sin(f.walkPhase) * 3 : 0;
          // Squash on landing
          const sq = f.bounce > 0 ? f.bounce : 0;
          const scaleY = 1 - sq * 0.35;
          const scaleX = 1 + sq * 0.25;
          const hpPct = f.hp / f.maxHp;
          const showGun = f.type === "david" && (f.state === "shoot" || timeRef.current % 1 < 1);
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
              <div className="absolute left-1/2 -translate-x-1/2 -top-10 text-center" style={{ width: 96 }}>
                <div style={{ fontFamily: "Chakra Petch", fontSize: 9, fontWeight: 700, color: "#f0f0f0", textShadow: "1px 1px 0 #000", letterSpacing: 1 }}>
                  {def.name.toUpperCase()}
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
                src={def.sprite}
                alt={def.name}
                draggable={false}
                style={{
                  width: "100%", height: "100%",
                  imageRendering: "pixelated", objectFit: "contain",
                  transform: `scaleX(${f.facing * scaleX}) scaleY(${scaleY})`,
                  transformOrigin: "bottom center",
                  filter: f.hitFlash > 0
                    ? `brightness(0.4) saturate(2) drop-shadow(0 0 6px #ff5544)`
                    : f.sandeActive > 0
                    ? `drop-shadow(0 0 10px hsl(${hueAt(timeRef.current)} 100% 60%))`
                    : "drop-shadow(0 4px 0 rgba(0,0,0,0.5))",
                  transition: "filter 80ms",
                  pointerEvents: "auto",
                }}
              />

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
          ) : (
            <div key={p.uid} className="absolute pointer-events-none"
              style={{
                left: p.x - 8, top: p.y - 8, width: 16, height: 16,
                background: "radial-gradient(circle, #fff 0%, #c6c6c6 60%, #6b6b6b 100%)",
                border: "2px solid #000", borderRadius: "50%",
              }} />
          )
        ))}
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
                <div className="grid grid-cols-2 gap-4">
                  <SlotCard selected={selectedSlot === "dummy"}
                    onClick={() => { playSound(SOUNDS.click, 0.4); setSelectedSlot("dummy"); }}
                    sprite={FIGHTERS.dummy.sprite} name="Dummy" />
                  <SlotCard selected={selectedSlot === "david"}
                    onClick={() => { playSound(SOUNDS.click, 0.4); setSelectedSlot("david"); }}
                    sprite={FIGHTERS.david.sprite} name="David Martinez" />
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
