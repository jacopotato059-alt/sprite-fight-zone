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
      { name: "description", content: "NPC vs NPC pixel fighting sandbox." },
    ],
  }),
  component: Game,
});

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
    width: 60,
    height: 100,
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
  hitFlash: number;
  bounce: number;
  onGround: boolean;
  jumpCd: number;
  decisionCd: number;
  intent: "approach" | "retreat" | "space" | "punish";
  intentTimer: number;
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

const GRAVITY = 2200;
const GROUND_OFFSET = 30;
const WALK_SPEED_BASE = 110;
const JUMP_VELOCITY = -700;
const MELEE_RANGE = 90;
const LUNGE_DISTANCE = 220;
const LUNGE_DURATION = 0.22;
const PROJECTILE_SPEED = 540;
const ATTACK_COOLDOWN = 1.4;

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
      attackCd: 0.8,
      hitFlash: 0,
      bounce: 0,
      onGround: false,
      jumpCd: Math.random() * 1.5,
      decisionCd: 0,
      intent: "approach",
      intentTimer: 0,
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
      step(dt);
      forceTick((n) => (n + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const incomingProjectile = (f: Fighter) => {
    for (const p of projectilesRef.current) {
      if (p.ownerUid === f.uid) continue;
      const dx = f.x - p.x;
      // moving toward us within 250px
      if (Math.sign(p.vx) === Math.sign(dx) && Math.abs(dx) < 280 && Math.abs(p.y - (f.y - 50)) < 80) {
        return p;
      }
    }
    return null;
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
      f.attackCd = Math.max(0, f.attackCd - dt);
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      f.bounce = Math.max(0, f.bounce - dt);
      f.jumpCd = Math.max(0, f.jumpCd - dt);
      f.decisionCd = Math.max(0, f.decisionCd - dt);
      f.intentTimer = Math.max(0, f.intentTimer - dt);

      if (f.state === "lunge" && f.lungeFromX !== undefined && f.lungeToX !== undefined) {
        f.lungeProgress = (f.lungeProgress ?? 0) + dt / LUNGE_DURATION;
        const p = Math.min(1, f.lungeProgress);
        const ease = 1 - Math.pow(1 - p, 3);
        f.x = f.lungeFromX + (f.lungeToX - f.lungeFromX) * ease;
        if (!f.lungeHit && p > 0.35) {
          for (const t2 of fighters) {
            if (t2.uid === f.uid || t2.state === "dead") continue;
            if (Math.abs(t2.x - f.x) < MELEE_RANGE * 0.75 && Math.abs(t2.y - f.y) < def.height) {
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
          f.bounce = 0.22;
          f.attackCd = ATTACK_COOLDOWN;
        }
      } else if (f.state === "throw" || f.state === "hurt") {
        if (f.stateTimer <= 0) f.state = "idle";
      } else {
        // ===== SMART AI =====
        const enemy = nearestEnemy(f, fighters);
        if (enemy) {
          const dx = enemy.x - f.x;
          const dist = Math.abs(dx);
          f.facing = dx >= 0 ? 1 : -1;
          const enemyDef = FIGHTERS[enemy.type];
          const incoming = incomingProjectile(f);
          const enemyAttacking = enemy.state === "lunge" || enemy.state === "throw";
          const hpRatio = f.hp / f.maxHp;

          // Dodge incoming projectile - jump
          if (incoming && f.onGround && f.jumpCd <= 0) {
            f.vy = JUMP_VELOCITY;
            f.jumpCd = 0.6;
          }
          // Dodge incoming lunge - jump back
          if (enemy.state === "lunge" && dist < LUNGE_DISTANCE + 60 && f.onGround && f.jumpCd <= 0) {
            f.vy = JUMP_VELOCITY * 0.85;
            f.vx = -f.facing * WALK_SPEED_BASE * 1.6;
            f.jumpCd = 0.7;
          }

          // Reassess intent periodically
          if (f.decisionCd <= 0) {
            f.decisionCd = 0.25 + Math.random() * 0.25;
            const r = Math.random();
            if (f.attackCd > 0.5) {
              // can't attack soon - create space (Smash-style)
              f.intent = r < 0.7 ? "space" : "retreat";
            } else if (hpRatio < 0.3 && r < 0.45) {
              f.intent = "retreat";
            } else if (enemy.attackCd > 0.6 && r < 0.7) {
              // enemy can't punish - punish them
              f.intent = "punish";
            } else {
              f.intent = r < 0.6 ? "approach" : "space";
            }
            f.intentTimer = 0.6 + Math.random() * 0.6;
          }

          let desiredDist: number;
          let aggressive = false;
          switch (f.intent) {
            case "approach": desiredDist = MELEE_RANGE * 0.9; aggressive = true; break;
            case "punish":   desiredDist = MELEE_RANGE * 0.85; aggressive = true; break;
            case "space":    desiredDist = LUNGE_DISTANCE * 1.1; break;
            case "retreat":  desiredDist = LUNGE_DISTANCE * 1.6; break;
          }

          // Attack decisions
          if (f.attackCd <= 0 && !enemyAttacking) {
            if (aggressive && dist < LUNGE_DISTANCE * 1.05 && dist > MELEE_RANGE * 0.4) {
              // Punch lunge - closes distance
              f.state = "lunge";
              f.stateTimer = LUNGE_DURATION;
              f.lungeFromX = f.x;
              const reach = Math.min(LUNGE_DISTANCE, dist + 30);
              f.lungeToX = f.x + f.facing * reach;
              f.lungeProgress = 0;
              f.lungeHit = false;
              playSound(SOUNDS.punchLunge, 0.55);
              continue;
            } else if (dist > MELEE_RANGE * 1.5 && dist < w * 0.9) {
              // Cotton throw at range
              f.state = "throw";
              f.stateTimer = 0.28;
              f.attackCd = ATTACK_COOLDOWN;
              // Lead the target a bit
              const lead = Math.sign(enemy.vx) * Math.min(60, Math.abs(enemy.vx) * 0.15);
              const targetX = enemy.x + lead;
              const dir = Math.sign(targetX - f.x) || f.facing;
              f.facing = dir as 1 | -1;
              projectilesRef.current.push({
                uid: nextUid(),
                ownerUid: f.uid,
                x: f.x + dir * 28,
                y: f.y - def.height * 0.55,
                vx: dir * PROJECTILE_SPEED,
                vy: -140,
                damage: def.abilities[1].damage,
                ttl: 3,
              });
              playSound(SOUNDS.throwSwing, 0.55);
              continue;
            }
          }

          // Movement: navigate toward desiredDist with some randomness
          const diff = dist - desiredDist;
          let move: 1 | -1 | 0 = 0;
          if (Math.abs(diff) > 18) {
            move = (diff > 0 ? f.facing : (-f.facing as 1 | -1));
          }
          // Occasional wavedash-style hop in/out
          if (f.onGround && f.jumpCd <= 0 && Math.random() < 0.004) {
            f.vy = JUMP_VELOCITY * 0.55;
            f.jumpCd = 1.5 + Math.random();
          }
          if (move !== 0) {
            f.vx = move * WALK_SPEED_BASE * def.speed * (f.intent === "retreat" ? 1.25 : 1);
            f.state = "walk";
          } else {
            f.vx *= 0.7;
            f.state = "idle";
          }
        } else {
          f.vx *= 0.85;
          f.state = "idle";
        }
      }

      // Physics
      f.vy += GRAVITY * dt;
      if (f.state !== "lunge") f.x += f.vx * dt;
      f.y += f.vy * dt;

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

      const half = def.width / 2;
      if (f.x < half) { f.x = half; if (f.state === "lunge") f.lungeToX = f.x; }
      if (f.x > w - half) { f.x = w - half; if (f.state === "lunge") f.lungeToX = f.x; }
    }

    projectilesRef.current = projectilesRef.current.filter((p) => {
      p.ttl -= dt;
      p.vy += GRAVITY * 0.4 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.ttl <= 0) return false;
      if (p.x < -50 || p.x > w + 50 || p.y > groundY + 50) return false;
      for (const t of fighters) {
        if (t.uid === p.ownerUid || t.state === "dead") continue;
        const def = FIGHTERS[t.type];
        if (Math.abs(t.x - p.x) < def.width * 0.55 && Math.abs((t.y - def.height * 0.5) - p.y) < def.height * 0.55) {
          applyDamage(t, p.damage, Math.sign(p.vx) as 1 | -1);
          playSound(SOUNDS.damage, 0.55);
          return false;
        }
      }
      return true;
    });

    fightersRef.current = fightersRef.current.filter((f) => f.state !== "dead");
  };

  const applyDamage = (target: Fighter, dmg: number, fromFacing: 1 | -1) => {
    target.hp -= dmg;
    target.hitFlash = 0.25;
    target.bounce = 0.3;
    target.vx = fromFacing * 260;
    target.vy = -280;
    target.state = "hurt";
    target.stateTimer = 0.32;
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
        {/* Ground */}
        <div className="absolute left-0 right-0 bottom-0" style={{
          height: GROUND_OFFSET,
          background: "linear-gradient(180deg, #2b2b2b 0%, #1a1a1a 100%)",
          borderTop: "2px solid #000",
          boxShadow: "inset 0 2px 0 0 #4a4a4a",
        }} />

        {fightersRef.current.map((f) => {
          const def = FIGHTERS[f.type];
          const bounceY = Math.sin((1 - f.bounce / 0.4) * Math.PI) * (f.bounce > 0 ? 8 : 0);
          const scaleY = f.bounce > 0 ? 1 - f.bounce * 0.3 : 1;
          const scaleX = f.bounce > 0 ? 1 + f.bounce * 0.3 : 1;
          const hpPct = f.hp / f.maxHp;
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
              <div className="absolute left-1/2 -translate-x-1/2 -top-10 text-center" style={{ width: 86 }}>
                <div style={{ fontFamily: "Chakra Petch", fontSize: 9, fontWeight: 700, color: "#f0f0f0", textShadow: "1px 1px 0 #000", letterSpacing: 1 }}>
                  {def.name.toUpperCase()}
                </div>
                <div style={{ fontFamily: "Chakra Petch", fontSize: 8, color: "#c6c6c6", textShadow: "1px 1px 0 #000" }}>
                  {Math.ceil(f.hp)}/{f.maxHp}
                </div>
                <div className="mc-bar mt-0.5 relative" style={{ width: 86, height: 7 }}>
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

              <img
                src={def.sprite}
                alt={def.name}
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  imageRendering: "pixelated",
                  objectFit: "contain",
                  transform: `scaleX(${f.facing * scaleX}) scaleY(${scaleY})`,
                  transformOrigin: "bottom center",
                  filter: f.hitFlash > 0 ? `brightness(0.4) saturate(2) drop-shadow(0 0 6px #ff5544)` : "drop-shadow(0 4px 0 rgba(0,0,0,0.5))",
                  transition: "filter 80ms",
                  pointerEvents: "auto",
                }}
              />
            </div>
          );
        })}

        {projectilesRef.current.map((p) => (
          <div
            key={p.uid}
            className="absolute pointer-events-none"
            style={{
              left: p.x - 8,
              top: p.y - 8,
              width: 16,
              height: 16,
              background: "radial-gradient(circle, #fff 0%, #c6c6c6 60%, #6b6b6b 100%)",
              border: "2px solid #000",
              borderRadius: "50%",
            }}
          />
        ))}
      </div>

      {showFighters && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" onClick={() => { playSound(SOUNDS.click, 0.4); setShowFighters(false); setShowStats(false); }}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="mc-panel relative animate-panel-open p-6"
            style={{ width: "min(92vw, 560px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="title-text" style={{ fontSize: 18, color: "#f0f0f0" }}>Fighters</h2>
              <button className="mc-btn small danger" onClick={() => { playSound(SOUNDS.click, 0.4); setShowFighters(false); setShowStats(false); }}>X</button>
            </div>

            {!showStats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <SlotCard
                    selected={selectedSlot === "dummy"}
                    onClick={() => { playSound(SOUNDS.click, 0.4); setSelectedSlot("dummy"); }}
                    sprite={FIGHTERS.dummy.sprite}
                    name="Dummy"
                  />
                  <SlotCard locked name="David Martinez" />
                </div>

                <div className="mt-6 flex flex-col gap-3 items-center">
                  <button
                    className="mc-btn"
                    onClick={() => {
                      playSound(SOUNDS.click, 0.4);
                      const ok = spawnFighter(selectedSlot);
                      if (ok) setShowFighters(false);
                    }}
                  >
                    Spawn In ({fighterCounts[selectedSlot] ?? 0}/3)
                  </button>
                  <button
                    className="mc-btn small"
                    onClick={() => { playSound(SOUNDS.click, 0.4); setShowStats(true); }}
                  >
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
    <button
      onClick={onClick}
      disabled={locked}
      className={`mc-slot relative p-3 flex flex-col items-center ${selected ? "selected" : ""} ${locked ? "locked" : ""}`}
    >
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
        background: "#0e0e0e",
        border: "2px solid #000",
        boxShadow: "inset 1px 1px 0 0 #2b2b2b",
        imageRendering: "pixelated",
      }}>
        {sprite ? (
          <img src={sprite} alt={name} className="max-h-full max-w-full" style={{ imageRendering: "pixelated" }} />
        ) : (
          <span style={{ fontFamily: "Chakra Petch", fontWeight: 700, fontSize: 32, color: "#6b6b6b" }}>?</span>
        )}
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
            <span>{a.name}</span>
            <span style={{ color: "#c6c6c6" }}>{a.damage} DMG</span>
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
