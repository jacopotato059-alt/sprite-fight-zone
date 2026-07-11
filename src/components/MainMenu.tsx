import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import dekuSprite from "@/assets/deku.png";
import yujiSprite from "@/assets/yuji.png";
import sukunaSprite from "@/assets/sukuna.png";
import davidSprite from "@/assets/david.png";

type TileKey =
  | "battle" | "fighters" | "summon" | "builder"
  | "missions" | "shop" | "collection" | "rankings" | "settings";

const TILES: {
  key: TileKey;
  label: string;
  hint: string;
  icon: string;
  accent: string;
  ready: boolean;
}[] = [
  { key: "battle",     label: "Battle",       hint: "Enter the arena",             icon: "⚔",  accent: "#b04a3a", ready: true  },
  { key: "fighters",   label: "Fighters",     hint: "Browse the roster",           icon: "◈",  accent: "#7a55d6", ready: true  },
  { key: "builder",    label: "Skill Builder",hint: "Craft custom fighters",       icon: "✦",  accent: "#7a55d6", ready: true  },
  { key: "summon",     label: "Summon",       hint: "Roll for new fighters",       icon: "☆",  accent: "#d6a94a", ready: false },
  { key: "missions",   label: "Missions",     hint: "Daily & weekly goals",        icon: "❖",  accent: "#4ac6d6", ready: false },
  { key: "shop",       label: "Shop",         hint: "Skins & cosmetics",           icon: "▲",  accent: "#4ad67a", ready: false },
  { key: "collection", label: "Collection",   hint: "Achievements & titles",       icon: "◆",  accent: "#c6c6c6", ready: false },
  { key: "rankings",   label: "Rankings",     hint: "Leaderboards",                icon: "▮",  accent: "#d64a94", ready: false },
  { key: "settings",   label: "Settings",     hint: "Audio, controls, quality",    icon: "⚙",  accent: "#8a8a8a", ready: false },
];

const FEATURED = [
  { sprite: dekuSprite,   name: "Deku",                  tag: "One For All" },
  { sprite: yujiSprite,   name: "Yuji Itadori",          tag: "Divergent Fist" },
  { sprite: sukunaSprite, name: "Sukuna",                tag: "Malevolent Shrine" },
  { sprite: davidSprite,  name: "David Martinez",        tag: "Sandevistan" },
];

const PATCH_NOTES = [
  "Main Menu hub — organized categories, featured fighter carousel",
  "Custom fighters from Skill Builder now sync into the arena roster",
  "5 arena maps: Void, Neon City, Temple, Storm, Cyber Grid",
  "Coming next: Missions, Boss Rush, Tower, progression & battle pass",
];

function useDailyStreak() {
  const [streak, setStreak] = useState(1);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("anif.streak.v1");
      const today = new Date().toDateString();
      if (!raw) {
        localStorage.setItem("anif.streak.v1", JSON.stringify({ day: today, streak: 1 }));
        setStreak(1); return;
      }
      const s = JSON.parse(raw) as { day: string; streak: number };
      if (s.day === today) { setStreak(s.streak); return; }
      const y = new Date(); y.setDate(y.getDate() - 1);
      const next = s.day === y.toDateString() ? s.streak + 1 : 1;
      localStorage.setItem("anif.streak.v1", JSON.stringify({ day: today, streak: next }));
      setStreak(next);
    } catch { /* ignore */ }
  }, []);
  return streak;
}

export function MainMenu({
  onEnterBattle, onFighters,
}: {
  onEnterBattle: () => void;
  onFighters: () => void;
}) {
  const streak = useDailyStreak();
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const featured = FEATURED[featuredIdx];

  useEffect(() => {
    const t = setInterval(() => setFeaturedIdx((i) => (i + 1) % FEATURED.length), 4200);
    return () => clearInterval(t);
  }, []);

  const stars = useMemo(
    () => Array.from({ length: 60 }, () => ({
      x: Math.random() * 100, y: Math.random() * 100,
      s: 0.5 + Math.random() * 1.6, d: Math.random() * 6,
    })),
    []
  );

  const handleTile = (t: (typeof TILES)[number]) => {
    if (!t.ready) { setToast(`${t.label} — coming in the next pass`); setTimeout(() => setToast(null), 1800); return; }
    if (t.key === "battle") onEnterBattle();
    else if (t.key === "fighters") onFighters();
  };

  return (
    <div className="fixed inset-0 z-[60] menu-shell overflow-hidden">
      {/* animated starfield */}
      <div className="absolute inset-0 pointer-events-none">
        {stars.map((s, i) => (
          <span key={i} className="menu-star" style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: `${s.s}px`, height: `${s.s}px`, animationDelay: `${s.d}s`,
          }} />
        ))}
      </div>

      {/* Ambient sweeping glows */}
      <div className="menu-orb menu-orb-a" />
      <div className="menu-orb menu-orb-b" />
      <div className="menu-scanlines pointer-events-none" />

      <div className="relative z-10 h-full w-full grid grid-rows-[auto_1fr_auto] gap-3 p-4 md:p-8">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div className="menu-title">
            <span className="menu-title-sub">ANI</span>
            <span className="menu-title-main">FIGHTERS</span>
            <span className="menu-title-tag">arena · builder · beyond</span>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <div className="menu-chip">
              <span className="opacity-60">STREAK</span>
              <span className="text-white font-black text-lg leading-none">{streak}</span>
              <span className="opacity-60">DAY{streak === 1 ? "" : "S"}</span>
            </div>
            <div className="menu-chip">
              <span className="opacity-60">v</span>
              <span className="text-white font-black">0.9</span>
              <span className="opacity-60">BETA</span>
            </div>
          </div>
        </header>

        {/* Body */}
        <main className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px] min-h-0">
          {/* Tile grid */}
          <section className="min-h-0 overflow-auto pr-1">
            <div className="menu-section-label">MODES & TOOLS</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
              {TILES.map((t, i) => {
                const inner = (
                  <div
                    className={`menu-tile ${t.ready ? "" : "menu-tile-locked"}`}
                    style={{ animationDelay: `${i * 40}ms`, ["--tile-accent" as any]: t.accent }}
                  >
                    <div className="menu-tile-icon">{t.icon}</div>
                    <div className="menu-tile-body">
                      <div className="menu-tile-label">{t.label}</div>
                      <div className="menu-tile-hint">{t.hint}</div>
                    </div>
                    {!t.ready && <div className="menu-tile-badge">SOON</div>}
                  </div>
                );
                if (t.key === "builder" && t.ready) {
                  return <Link key={t.key} to="/builder" className="contents">{inner}</Link>;
                }
                return (
                  <button key={t.key} type="button" onClick={() => handleTile(t)} className="text-left">
                    {inner}
                  </button>
                );
              })}
            </div>

            <div className="menu-section-label mt-6">PATCH NOTES</div>
            <ul className="menu-notes mt-2">
              {PATCH_NOTES.map((n, i) => (
                <li key={i} style={{ animationDelay: `${200 + i * 60}ms` }}>
                  <span className="menu-notes-dot" />{n}
                </li>
              ))}
            </ul>
          </section>

          {/* Featured */}
          <aside className="menu-featured overflow-hidden">
            <div className="menu-section-label">FEATURED FIGHTER</div>
            <div className="relative flex-1 min-h-[240px] mt-2 rounded overflow-hidden menu-featured-stage">
              {FEATURED.map((f, i) => (
                <div key={f.name} className={`absolute inset-0 flex items-end justify-center transition-opacity duration-700 ${i === featuredIdx ? "opacity-100" : "opacity-0"}`}>
                  <img src={f.sprite} alt={f.name} draggable={false}
                    className="menu-featured-sprite"
                    style={{ imageRendering: "pixelated" }} />
                </div>
              ))}
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 to-transparent">
                <div className="text-white font-black text-xl leading-tight tracking-wide">{featured.name}</div>
                <div className="text-white/70 text-xs uppercase tracking-[3px]">{featured.tag}</div>
              </div>
              <div className="absolute top-2 right-2 flex gap-1">
                {FEATURED.map((_, i) => (
                  <span key={i} className={`h-1.5 w-4 rounded-full ${i === featuredIdx ? "bg-white" : "bg-white/30"}`} />
                ))}
              </div>
            </div>

            <div className="menu-section-label mt-4">TODAY</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="menu-quest">
                <div className="menu-quest-label">Daily · Win 3 battles</div>
                <div className="menu-quest-bar"><span style={{ width: "33%" }} /></div>
                <div className="menu-quest-reward">+50 XP</div>
              </div>
              <div className="menu-quest">
                <div className="menu-quest-label">Daily · Land 25 hits</div>
                <div className="menu-quest-bar"><span style={{ width: "66%" }} /></div>
                <div className="menu-quest-reward">+30 XP</div>
              </div>
            </div>
          </aside>
        </main>

        {/* Footer CTA */}
        <footer className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-white/40 text-xs uppercase tracking-[3px]">Tip · Press <span className="text-white">Space</span> to pause · Click a fighter in Beta to control</div>
          <div className="flex gap-2">
            <button className="mc-btn" onClick={onFighters}>Roster</button>
            <Link to="/builder" className="mc-btn" style={{ background: "#3b2469", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Builder</Link>
            <button className="mc-btn menu-cta" onClick={onEnterBattle}>▶ Enter Battle</button>
          </div>
        </footer>
      </div>

      {toast && (
        <div className="menu-toast">{toast}</div>
      )}
    </div>
  );
}
