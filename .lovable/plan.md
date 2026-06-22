## Goal
Big overhaul of the fighting sandbox: perf, AI difficulty, duel mode, pause/play, HP customization, more abilities (Dummy, Yuji, Sukuna, David), Sukuna slash 0.9 CD + passive, Yuji passive, and a full **Fighter/Skill Builder** workspace with sprite upload, animations, melee/projectile/effect picker, recolorable presets, and sound library.

Given the scope, I'll ship this in **two passes**. Pass 1 below is what I'll build now. Pass 2 (the full custom-builder UI + persistence) I'll outline so you can confirm before I spend the time.

---

## Pass 1 — Ship now (single edit to `src/routes/index.tsx`)

### Performance
- Cap effects array (drop oldest when >120). Cap projectiles. Skip per-frame Math.hypot where cheap squared-distance works.
- Throttle React re-renders for HUD to ~15fps; sim loop stays 60fps via refs.
- Reuse arrays for sparks instead of `.map` allocations. Remove redundant DOM nodes for dead effects.
- Lower `electric` spark density on long whips (cap to 8).

### Watch / camera smoothing
- Lerp screen-shake decay (exponential) instead of step.
- Lerp hitstop ramp in/out so it doesn't pop.

### AI Difficulty (Easy / Normal / Hard / Insane)
- Per-difficulty tunables: reaction delay, retreat threshold, dodge chance, punish window, ability priority weights, aim error.
- Easy: slow reactions, rare ability use. Insane: instant punish, perfect spacing, frame-perfect combo chains.

### Duel Test Mode
- New mode toggle in lobby: **Duel** = 1v1, fixed roster pick for both sides, infinite rematch counter, no team logic.
- Win screen with "Rematch" / "Back to Lobby".

### Pause / Play
- Top-bar button. Pauses sim loop (dt=0) and audio. Resume restores.
- Spacebar shortcut.

### Customizable HP
- Lobby slider per fighter: HP multiplier 0.5×–3×. Applied at spawn.

### Sukuna
- `slashCd = 0.9` (was higher).
- New ability **Cleave Step**: short dash + arcing slash, 3 CD, 28 dmg, applies bleed.
- New ability **Domain Pulse**: ground shockwave, 18 CD, 40 dmg + brief stun in radius.
- **Passive — Malevolent Shrine**: every 3rd slash within 4s leaves a lingering cut zone (5 dmg/0.5s for 2s).

### Yuji
- **Passive — Cursed Reservoir**: builds 1 stack per hit landed/taken (max 5). At 5 stacks next punch is **Black Flash** auto-empowered (+50% dmg, hitstop, shake).
- New combo starter **Divergent Fist Feint**: short-hop overhead, launches enemy upward (combo opener), 6 CD.
- New **Manji Kick**: spinning aerial kick, only airborne, 5 CD, knocks sideways.
- New **Cursed Strike Chain**: 3-hit dash combo, 8 CD, finishes with Black Flash if passive stacks ≥3.

### Dummy
- New **Iron Guard**: 50% damage reduction for 2.5s, 12 CD.
- New **Pummel**: heavy stomp AoE, 14 CD, 35 dmg + brief stun.
- New **Counter Stance**: 1.5s parry window; if hit, auto-counter for 40 dmg, 16 CD.

### David Martinez
- New **Reflex Boost**: short Sandevistan mini-burst (0.8s), 8 CD.
- New **Mantis Slash**: close-range slash combo (2 hits, 22+30), 7 CD.
- New **Overclock**: temporary +30% speed & atk for 4s, 22 CD; locks the existing Sandevistan during overclock.

### Misc polish
- Hit numbers float upward and fade (already exists — tune lifetime).
- Combo counter HUD per fighter.
- New SFX variants reuse existing assets (no new uploads in Pass 1).

---

## Pass 2 — Fighter/Skill Builder (confirm before I build)

This is a real feature — wants its own route, persistence (Lovable Cloud), and a moderate UI. Outline:

- New route `/builder` with a workspace:
  - **Sprite**: upload image (Lovable Cloud storage) or pick from library.
  - **Stats**: HP, Atk, Speed, Defense sliders.
  - **Skills (up to 6)**: each skill has
    - Animation: lunge / dash / hop / spin / windup-hold / teleport
    - Type: Melee / Projectile / AoE / Buff / Heal / Dash
    - Effect preset (recolorable): shockwave, spark, electric, ring, slash arc, beam — color picker + intensity
    - Sound: pick from in-game library or upload
    - Damage / CD / range / projectile speed
  - **Passive**: pick from list (lifesteal, second wind, rage, stacks→empower, etc.)
  - **Save / Load**: stored in Cloud table `custom_fighters`, listed in lobby with the built-ins.

I'll need Lovable Cloud enabled for persistence + sprite/sound uploads. Confirm and I'll do Pass 2 right after Pass 1 lands.

---

Shipping Pass 1 now. Reply "go pass 2" (or with tweaks) after you try it.