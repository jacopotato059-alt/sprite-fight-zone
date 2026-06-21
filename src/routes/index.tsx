import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dummySprite from "@/assets/dummy.png";
import sndClick from "@/assets/sounds/ui-click.mp3.asset.json";
import sndPunchLunge from "@/assets/sounds/punch-lunge.mp3.asset.json";
import sndSpawn from "@/assets/sounds/spawn.mp3.asset.json";
import sndDamage from "@/assets/sounds/damage.mp3.asset.json";
import sndPunchHit from "@/assets/sounds/punch-hit.mp3.asset.json";
import sndThrow from "@/assets/sounds/throw-swing.mp3.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ani Fighters" },
      { name: "description", content: "NPC vs NPC pixel fighting sandbox. Spawn fighters, watch them brawl." },
      { property: "og:title", content: "Ani Fighters" },
      { property: "og:description", content: "NPC vs NPC pixel fighting sandbox." },
    ],
  }),
  component: Game,
});

// ---------- Audio ----------
const SOUNDS = {
  click: sndClick.url,
  punchLunge: sndPunchLunge.url,
  spawn: sndSpawn.url,
  damage: sndDamage.url,
  punchHit: sndPunchHit.url,
  throwSwing: sndThrow.url,
};

function playSound(url: string, volume = 0.6) {
  try {
    const a = new Audio(url);
    a.volume = volume;
    void a.play();
  } catch {}
}

// ---------- Types ----------
type FighterTypeId = "dummy";

interface FighterDef {
  id: FighterTypeId;
  name: string;
  sprite: string;
  atk: number;
  def: number;
  speed: number;
  abilities: { name: string; damage: number; type: "melee" | "ranged" }[];
  width: number;
  height: number;
}

const FIGHTERS: Record<FighterTypeId, FighterDef> = {
  dummy: {
    id: "dummy",
    name: "Dummy",
    sprite: dummySprite,
    atk: 50,
    def: 500,
    speed: 1,
    abilities: [
      { name: "Punch", damage: 25, type: "melee" },
      { name: "Cotton Throw", damage: 25, type: "ranged" },
    ],
    width: 70,
    height: 110,
  },
};

interface Fighter {
  uid: number;
  type: FighterTypeId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  facing: 1 | -1;
  state: "idle" | "walk" | "lunge" | "throw" | "hurt" | "dead";
  stateTimer: number;
  attackCd: number;
  walkTimer: number;
  walkDir: -1 | 0 | 1;
  hitFlash: number;
  bounce: number;
  onGround: boolean;
  jumpCd: number;
  lungeFromX?: number;
  lungeToX?: number;
  lungeProgress?: number;
  lungeHit?: boolean;
}

interface Projectile {
  uid: number;
  ownerUid: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  ttl: number;
}

// ---------- Constants ----------
const GRAVITY = 2200;
const GROUND_OFFSET = 20;
const WALK_SPEED_BASE = 90; // px/s at speed=1
const JUMP_VELOCITY = -680;
const MELEE_RANGE = 90;
const LUNGE_DISTANCE = 220; // ~4 meters
const LUNGE_DURATION = 0.25;
const PROJECTILE_SPEED = 520;
const ATTACK_COOLDOWN = 1.6;

let __uid = 1;
const nextUid = () => __uid++;

function Game() {
  const [showFighters, setShowFighters] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<FighterTypeId>("dummy");
  const [showStats, setShowStats] = useState(false);
  const [, forceTick] = useState(0);
  const fightersRef = useRef<Fighter[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const arenaRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  // Resize tracking
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

  // Spawn fighter
  const spawnFighter = useCallback((type: FighterTypeId) => {
    const same = fightersRef.current.filter((f) => f.type === type && f.state !== "dead");
    if (same.length >= 3) return false;
    const def = FIGHTERS[type];
    const w = sizeRef.current.w || window.innerWidth;
    const x = 80 + Math.random() * Math.max(1, w - 160);
    fightersRef.current.push({
      uid: nextUid(),
      type,
      x,
      y: -100,
      vx: 0,
      vy: 0,
      hp: def.def,
      maxHp: def.def,
      facing: Math.random() > 0.5 ? 1 : -1,
      state: "idle",
      stateTimer: 0,
      attackCd: 1,
      walkTimer: 0,
      walkDir: 0,
      hitFlash: 0,
      bounce: 0,
      onGround: false,
      jumpCd: Math.random() * 2,
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

  // Game loop
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const dt = Math.min(0.05, (t - lastTimeRef.current) / 1000);
      lastTimeRef.current = t;
      step(dt);
      forceTick((n) => (n + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const step = (dt: number) => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const groundY = h - GROUND_OFFSET;
    const fighters = fightersRef.current;

    for (const f of fighters) {
      const def = FIGHTERS[f.type];
      if (f.state === "dead") continue;

      // timers
      f.stateTimer = Math.max(0, f.stateTimer - dt);
      f.attackCd = Math.max(0, f.attackCd - dt);
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      f.bounce = Math.max(0, f.bounce - dt);
      f.jumpCd = Math.max(0, f.jumpCd - dt);

      // Lunge animation - override velocity
      if (f.state === "lunge" && f.lungeFromX !== undefined && f.lungeToX !== undefined) {
        f.lungeProgress = (f.lungeProgress ?? 0) + dt / LUNGE_DURATION;
        const p = Math.min(1, f.lungeProgress);
        const ease = 1 - Math.pow(1 - p, 3);
        f.x = f.lungeFromX + (f.lungeToX - f.lungeFromX) * ease;
        // Hit detection mid-lunge
        if (!f.lungeHit && p > 0.4) {
          for (const t2 of fighters) {
            if (t2.uid === f.uid || t2.state === "dead") continue;
            if (Math.abs(t2.x - f.x) < MELEE_RANGE * 0.7 && Math.abs(t2.y - f.y) < def.height) {
              applyDamage(t2, def.abilities[0].damage, f.facing);
              playSound(SOUNDS.punchHit, 0.7);
              f.lungeHit = true;
              break;
            }
          }
        }
        if (p >= 1) {
          f.state = "idle";
          f.lungeFromX = f.lungeToX = f.lungeProgress = undefined;
          f.lungeHit = false;
          f.bounce = 0.25;
        }
      } else if (f.state === "throw") {
        if (f.stateTimer <= 0) f.state = "idle";
      } else if (f.state === "hurt") {
        if (f.stateTimer <= 0) f.state = "idle";
      } else {
        // AI
        const enemy = nearestEnemy(f, fighters);
        if (enemy) {
          const dx = enemy.x - f.x;
          const dist = Math.abs(dx);
          f.facing = dx >= 0 ? 1 : -1;

          // Random small jump to dodge
          if (f.onGround && f.jumpCd <= 0 && Math.random() < 0.005) {
            f.vy = JUMP_VELOCITY * 0.7;
            f.jumpCd = 2 + Math.random() * 2;
          }

          if (f.attackCd <= 0) {
            if (dist < MELEE_RANGE + 60) {
              // Punch lunge
              f.state = "lunge";
              f.stateTimer = LUNGE_DURATION;
              f.lungeFromX = f.x;
              f.lungeToX = f.x + f.facing * LUNGE_DISTANCE;
              f.lungeProgress = 0;
              f.lungeHit = false;
              f.attackCd = ATTACK_COOLDOWN;
              playSound(SOUNDS.punchLunge, 0.55);
            } else {
              // Cotton throw
              f.state = "throw";
              f.stateTimer = 0.3;
              f.attackCd = ATTACK_COOLDOWN;
              projectilesRef.current.push({
                uid: nextUid(),
                ownerUid: f.uid,
                x: f.x + f.facing * 30,
                y: f.y - def.height * 0.55,
                vx: f.facing * PROJECTILE_SPEED,
                vy: -120,
                damage: def.abilities[1].damage,
                ttl: 3,
              });
              playSound(SOUNDS.throwSwing, 0.55);
            }
          } else {
            // Walk towards or strafe
            if (dist > MELEE_RANGE * 0.9) {
              f.vx = f.facing * WALK_SPEED_BASE * def.speed;
              f.state = "walk";
            } else {
              f.vx = 0;
              f.state = "idle";
            }
          }
        } else {
          // Wander
          f.walkTimer -= dt;
          if (f.walkTimer <= 0) {
            f.walkTimer = 1 + Math.random() * 2;
            const r = Math.random();
            f.walkDir = r < 0.33 ? -1 : r < 0.66 ? 1 : 0;
          }
          if (f.walkDir !== 0) {
            f.facing = f.walkDir;
            f.vx = f.walkDir * WALK_SPEED_BASE * def.speed * 0.6;
            f.state = "walk";
          } else {
            f.vx = 0;
            f.state = "idle";
          }
        }
      }

      // Physics
      f.vy += GRAVITY * dt;
      if (f.state !== "lunge") f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Ground
      if (f.y >= groundY) {
        if (f.vy > 200) {
          f.bounce = Math.min(0.4, f.vy / 2000);
          f.vy = -f.vy * 0.25;
          if (Math.abs(f.vy) < 80) f.vy = 0;
        } else {
          f.vy = 0;
          f.y = groundY;
        }
        f.onGround = true;
      } else {
        f.onGround = false;
      }

      // Bounds
      const half = def.width / 2;
      if (f.x < half) { f.x = half; if (f.state === "lunge") f.lungeToX = f.x; }
      if (f.x > w - half) { f.x = w - half; if (f.state === "lunge") f.lungeToX = f.x; }
    }

    // Projectiles
    projectilesRef.current = projectilesRef.current.filter((p) => {
      p.ttl -= dt;
      p.vy += GRAVITY * 0.4 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.ttl <= 0) return false;
      if (p.x < -50 || p.x > w + 50 || p.y > groundY + 50) return false;
      // hit check
      for (const t of fighters) {
        if (t.uid === p.ownerUid || t.state === "dead") continue;
        const def = FIGHTERS[t.type];
        if (Math.abs(t.x - p.x) < def.width * 0.5 && Math.abs((t.y - def.height * 0.5) - p.y) < def.height * 0.55) {
          applyDamage(t, p.damage, Math.sign(p.vx) as 1 | -1);
          playSound(SOUNDS.damage, 0.55);
          return false;
        }
      }
      return true;
    });

    // Cleanup dead
    fightersRef.current = fightersRef.current.filter((f) => f.state !== "dead");
  };

  const applyDamage = (target: Fighter, dmg: number, fromFacing: 1 | -1) => {
    target.hp -= dmg;
    target.hitFlash = 0.25;
    target.bounce = 0.3;
    target.vx = fromFacing * 240;
    target.vy = -260;
    target.state = "hurt";
    target.stateTimer = 0.35;
    if (target.hp <= 0) {
      target.hp = 0;
      target.state = "dead";
    } else {
      playSound(SOUNDS.damage, 0.45);
    }
  };

  const nearestEnemy = (self: Fighter, all: Fighter[]) => {
    let best: Fighter | null = null;
    let bd = Infinity;
    for (const o of all) {
      if (o.uid === self.uid || o.state === "dead") continue;
      const d = Math.abs(o.x - self.x) + Math.abs(o.y - self.y) * 0.3;
      if (d < bd) { bd = d; best = o; }
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
  const onRestart = () => {
    restart();
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden gradient-bg scanlines">
      {/* Top right buttons */}
      <div className="absolute top-4 right-4 z-30 flex gap-3">
        <button className="pixel-btn" onClick={onFightersClick}>FIGHTERS</button>
        <button className="pixel-btn danger" onClick={onRestart}>RESTART</button>
      </div>

      <h1 className="absolute top-4 left-4 z-30 pixel-text text-[10px] text-white/70 tracking-widest">
        ANI FIGHTERS
      </h1>

      {/* Battle arena */}
      <div ref={arenaRef} className="absolute inset-0 z-10">
        {/* Ground line */}
        <div className="absolute left-0 right-0" style={{
          bottom: GROUND_OFFSET - 4,
          height: 4,
          background: "linear-gradient(90deg, transparent, oklch(0.55 0.25 300 / 0.8), transparent)",
        }} />

        {/* Fighters */}
        {fightersRef.current.map((f) => {
          const def = FIGHTERS[f.type];
          const bounceY = Math.sin((1 - f.bounce / 0.4) * Math.PI) * (f.bounce > 0 ? 8 : 0);
          const scaleY = f.bounce > 0 ? 1 - f.bounce * 0.3 : 1;
          const scaleX = f.bounce > 0 ? 1 + f.bounce * 0.3 : 1;
          return (
            <div
              key={f.uid}
              className="absolute select-none cursor-pointer"
              style={{
                left: f.x - def.width / 2,
                top: f.y - def.height,
                width: def.width,
                height: def.height,
                transform: `translateY(${-bounceY}px)`,
              }}
              onClick={(e) => { e.stopPropagation(); removeFighter(f.uid); }}
            >
              {/* Health bar */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-9 text-center" style={{ width: 90 }}>
                <div className="pixel-text text-white" style={{ fontSize: 6, lineHeight: 1.2, textShadow: "1px 1px 0 #000" }}>
                  {def.name}
                </div>
                <div className="pixel-text text-white" style={{ fontSize: 6, lineHeight: 1.4, textShadow: "1px 1px 0 #000" }}>
                  {Math.ceil(f.hp)}/{f.maxHp}
                </div>
                <div className="relative mt-0.5" style={{ width: 90, height: 8, background: "#000", border: "2px solid #000", boxShadow: "0 0 0 1px oklch(0.55 0.25 300)" }}>
                  <div style={{
                    width: `${(f.hp / f.maxHp) * 100}%`,
                    height: "100%",
                    background: f.hp / f.maxHp > 0.5
                      ? "linear-gradient(180deg, oklch(0.85 0.2 145), oklch(0.5 0.22 145))"
                      : f.hp / f.maxHp > 0.25
                      ? "linear-gradient(180deg, oklch(0.85 0.2 80), oklch(0.55 0.22 70))"
                      : "linear-gradient(180deg, oklch(0.75 0.25 25), oklch(0.45 0.22 25))",
                    transition: "width 120ms linear",
                  }} />
                </div>
              </div>

              {/* Sprite */}
              <img
                src={def.sprite}
                alt={def.name}
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  imageRendering: "pixelated",
                  transform: `scaleX(${f.facing * scaleX}) scaleY(${scaleY})`,
                  transformOrigin: "bottom center",
                  filter: f.hitFlash > 0 ? `brightness(0.3) saturate(2) drop-shadow(0 0 6px #ff003c)` : "drop-shadow(0 4px 0 rgba(0,0,0,0.4))",
                  transition: "filter 80ms",
                  pointerEvents: "auto",
                }}
              />
            </div>
          );
        })}

        {/* Projectiles */}
        {projectilesRef.current.map((p) => (
          <div
            key={p.uid}
            className="absolute pointer-events-none"
            style={{
              left: p.x - 8,
              top: p.y - 8,
              width: 16,
              height: 16,
              background: "radial-gradient(circle, #fff 0%, #ddd 50%, #888 100%)",
              border: "2px solid #000",
              borderRadius: "50%",
              boxShadow: "0 0 8px #fff",
            }}
          />
        ))}
      </div>

      {/* Fighters Panel */}
      {showFighters && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" onClick={() => { playSound(SOUNDS.click, 0.4); setShowFighters(false); setShowStats(false); }}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="pixel-panel relative animate-panel-open p-6"
            style={{ width: "min(92vw, 720px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="pixel-text text-white" style={{ fontSize: 14, textShadow: "2px 2px 0 oklch(0.45 0.25 300)" }}>FIGHTERS</h2>
              <button className="pixel-btn small danger" onClick={() => { playSound(SOUNDS.click, 0.4); setShowFighters(false); setShowStats(false); }}>X</button>
            </div>

            {!showStats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {/* Slot 1: Dummy */}
                  <SlotCard
                    selected={selectedSlot === "dummy"}
                    onClick={() => { playSound(SOUNDS.click, 0.4); setSelectedSlot("dummy"); }}
                    sprite={FIGHTERS.dummy.sprite}
                    name="DUMMY"
                  />
                  {/* Slot 2: David Martinez (locked) */}
                  <SlotCard locked name="DAVID MARTINEZ" />
                </div>

                <div className="mt-5 flex flex-col gap-3 items-center">
                  <button
                    className="pixel-btn"
                    onClick={() => {
                      playSound(SOUNDS.click, 0.4);
                      const ok = spawnFighter(selectedSlot);
                      if (ok) setShowFighters(false);
                    }}
                  >
                    SPAWN IN ({fighterCounts[selectedSlot] ?? 0}/3)
                  </button>
                  <button
                    className="pixel-btn small"
                    onClick={() => { playSound(SOUNDS.click, 0.4); setShowStats(true); }}
                  >
                    STATS
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
    <button
      onClick={onClick}
      disabled={locked}
      className="relative p-3 flex flex-col items-center"
      style={{
        background: selected ? "linear-gradient(180deg, oklch(0.3 0.2 300), oklch(0.15 0.12 290))" : "linear-gradient(180deg, oklch(0.15 0.05 290), oklch(0.08 0.03 290))",
        border: "3px solid #000",
        boxShadow: selected
          ? "0 0 0 3px oklch(0.7 0.25 305), 0 0 20px oklch(0.6 0.25 300 / 0.6)"
          : "0 0 0 3px oklch(0.4 0.18 295)",
        cursor: locked ? "not-allowed" : "pointer",
        opacity: locked ? 0.55 : 1,
      }}
    >
      <div className="w-24 h-32 flex items-center justify-center mb-2" style={{ background: "rgba(0,0,0,0.4)", border: "2px solid #000", imageRendering: "pixelated" }}>
        {sprite ? (
          <img src={sprite} alt={name} className="max-h-full max-w-full" style={{ imageRendering: "pixelated" }} />
        ) : (
          <span className="pixel-text text-white/60" style={{ fontSize: 28 }}>?</span>
        )}
      </div>
      <div className="pixel-text text-white" style={{ fontSize: 9, textShadow: "1px 1px 0 #000" }}>{name}</div>
      {locked && <div className="pixel-text text-white/70 mt-1" style={{ fontSize: 7 }}>LOCKED</div>}
    </button>
  );
}

function StatsView({ typeId, onBack }: { typeId: FighterTypeId; onBack: () => void }) {
  const def = FIGHTERS[typeId];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4 items-center">
        <div className="w-24 h-32 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)", border: "3px solid #000", imageRendering: "pixelated" }}>
          <img src={def.sprite} alt={def.name} className="max-h-full max-w-full" style={{ imageRendering: "pixelated" }} />
        </div>
        <div className="flex flex-col gap-2 pixel-text text-white" style={{ fontSize: 10 }}>
          <div style={{ fontSize: 12, color: "oklch(0.85 0.18 305)" }}>{def.name.toUpperCase()}</div>
          <Stat label="ATK" value={def.atk} />
          <Stat label="DEF/HP" value={def.def} />
          <Stat label="SPEED" value={`${def.speed}x`} />
        </div>
      </div>
      <div className="pixel-text text-white mt-2" style={{ fontSize: 9 }}>ABILITIES</div>
      <div className="flex flex-col gap-2">
        {def.abilities.map((a) => (
          <div key={a.name} className="flex justify-between pixel-text text-white px-2 py-2"
            style={{ fontSize: 8, background: "rgba(0,0,0,0.4)", border: "2px solid oklch(0.45 0.2 300)" }}>
            <span>- {a.name.toUpperCase()} -</span>
            <span style={{ color: "oklch(0.8 0.2 25)" }}>{a.damage} DMG</span>
          </div>
        ))}
      </div>
      <button className="pixel-btn small mt-2 self-center" onClick={onBack}>BACK</button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex gap-3">
      <span className="text-white/60" style={{ minWidth: 70 }}>{label}:</span>
      <span style={{ color: "oklch(0.85 0.2 305)" }}>{value}</span>
    </div>
  );
}
