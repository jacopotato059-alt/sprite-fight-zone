# Ani Fighters — Modernization Roadmap

The wishlist ("optimize everything, add modes, settings, rankings, redesign map + UI + skill builder, add mechanics") is ~6–8 shipping passes across ~5.5k lines. Passes queued below; I ship one focused pass per turn.

## Pass A — Main Menu Hub (SHIPPED)
Animated main-menu overlay, category tiles (Battle, Fighters, Builder + stubs for Summon/Missions/Shop/Collection/Rankings/Settings), featured fighter carousel, daily streak, quest bars, patch notes, ☰ Menu button in HUD.

## Pass B — Arena Redesign (SHIPPED THIS TURN)
- 3 new maps: 🏛 Colosseum, 🌅 Sky Fortress, 🌋 Lava Pit (8 total).
- Parallax silhouette layers per map (neon skyline, storm mountains + rain, temple pillars, cyber grid, colosseum arches, sky clouds, lava embers, void nebula).
- New floor variants + weather animations (sky-drift, lava-pulse, rain-fall, ember-rise).
- HUD styling scaffolding for ult meter + mode banner (visuals ready to wire in Pass C).

## Pass C — Combat Mechanics (NEXT)
- Ult meter: fills from damage dealt/taken; ult ability replaced by unique per-fighter ultimate cinematic.
- Parry window: tap block right before hit → stagger enemy + refund a bit of ult.
- Dash cancel: cancel recovery frames of any attack with a directional dash (costs stamina).
- Stamina bar under HP.
- Wire the new `.hud-ult-meter` + `.hud-mode-banner` CSS into every fighter card.
- Screen-shake intensity tied to damage; longer hitstop on ults + KO slow-mo.

## Pass D — Skill Builder Rebuild
Full overhaul of `src/routes/builder.tsx`:
- Tabbed workspace: Basic / Movement / Active / Ultimate / Passive / Transform / VFX / SFX / AI / Style.
- Layer system fix: layers behave like Ibis Paint — reorder, solo, hide, duplicate, and previous-layer nav actually works.
- Live in-arena test button (spawn against dummy in the real engine, not just the preview pane).
- Ability template gallery with hover previews.
- Save / load presets, share codes (base64 JSON), autosave with history/undo stack.
- DPS calculator, skill rarity badge.
- Guarantee: skills built here spawn with their custom keyframes/VFX/SFX in the real battle (fix the current "just default punch" bug).

## Pass E — Modes & Progression
- Modes: Survival waves, Boss Rush, Tower Climb (10 floors + boss), 1v1 duel, 2v2 tag.
- Mode-select on the Battle tile.
- Player XP/level, per-fighter mastery, unlockable titles.
- Daily/weekly quest engine (real events, not fake bars).

## Pass F — Settings & Rankings (real)
- Settings screen: master/SFX/music volume, screen-shake intensity, particle quality (low/med/high), colorblind palette, control remap.
- Rankings: local best times per mode + streak leaderboard (localStorage), export/import save codes.

## Pass G — Retention
Battle pass track, login-reward screen, rotating weekly boss, seasonal cosmetic tints, replay recorder, favorites/loadouts.

Reply "go C" / "go D" / etc. to run the next slice.
