# Ani Fighters — Modernization Roadmap

Your full wishlist covers ~12 priorities across 5000 lines of game code — realistically 4-6 shipping passes. Here's the plan; I'll do one pass per turn and pause for feedback.

## Pass A — Main Menu Hub (SHIPPED)
- New animated Main Menu overlay (`src/components/MainMenu.tsx`) as the front door.
- Category tiles: Battle, Fighters, Skill Builder (ready) + Summon, Missions, Shop, Collection, Rankings, Settings (stubs with "coming next" toast).
- Featured fighter carousel (auto-rotates 4 characters).
- Daily login streak (localStorage), daily quest progress bars, patch notes panel.
- Animated title, drifting orbs, starfield, scanlines, sheen — modern anime-arena look.
- `Menu` button in the top bar so you can reopen it any time.

## Pass B — Combat Feel (next)
- Screen shake scaled by damage; longer hitstop on heavy hits.
- Idle bob per fighter archetype; unique summon burst rings.
- Attack combo animation blending (windup → active → recovery, not static poses).
- KO defeat pose (fall + fade + slow-mo hitstop when last enemy dies).
- Crit indicator, combo counter HUD per fighter, floating damage numbers with rarity colors.
- Charge-up glow on ultimates, aura transformations, air combat lift/dive polish.

## Pass C — Skill Builder v3 (tabs + polish)
- Tabbed workspace: Basic / Movement / Active / Ultimate / Passive / Transform / VFX / SFX / AI / Style.
- DPS calculator, skill rarity, ability templates gallery, save/load presets, share codes (base64 JSON).
- Ability preview window (test arena inline).

## Pass D — Modes & Progression
- Survival, Boss Rush, Tower Climb, 1v1 / 2v2 quick-play modes (arena reuse, wave scripts).
- Player level + XP from battles (localStorage), fighter mastery per type, achievements, daily/weekly quests wired to real events.
- Leaderboard scaffold (local best times/streaks).

## Pass E — Retention
- Battle pass track (localStorage), login rewards screen, rotating weekly boss, seasonal cosmetic tint slots.

## Pass F — Missing UX
- Damage testing room, replay recorder (state snapshots), loadouts, favorites, sort/search on roster.

Reply with which pass to run next, or "go B" / "go C" etc.
