# CapQuest

A tiny **cap-catching RPG** in the style of classic Game Boy Advance Pokémon games —
but instead of monsters you catch, train and duel with **caps**. Built as a single
HTML5 canvas game with no dependencies.

> Theme inspiration: [hatstore.se](https://www.hatstore.se)

## Play

Open `index.html` in a browser (or host it on GitHub Pages). Everything runs
client-side, no build step.

### Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Move   | Arrow keys / WASD | D-pad |
| Confirm (A) | Z / Enter / Space | A |
| Back (B) | X / Esc | B |

## What's in the demo

- **Overworld** — a small single-screen map with grass, tall grass and trees.
- **Wild encounters** — walking in tall grass can trigger a wild cap.
- **Turn-based battles** — choose moves, with a light type system
  (Street ▸ Outdoor ▸ Classic ▸ Street).
- **Catching** — throw a **Capsule** to catch wild caps; lower their HP first to
  improve your odds.
- **Trainer duel** — beat *Keps-Kent* and his cap.
- **CAPDEX** — collect all three starter caps.

### The three starter caps

| Cap | Type | Vibe |
|-----|------|------|
| **Snapback** (New Era 9FIFTY flat brim) | Street | fast, hits hard |
| **5-Panel** (camp cap) | Outdoor | balanced |
| **Bucket** (bucket hat) | Classic | tanky |

## Graphics

Sprites are AI-generated pixel art (via Magnific) that drop into `assets/`. The game
ships with hand-drawn canvas **fallback sprites**, so it is fully playable even before
the PNGs are present. See [`assets/README.md`](assets/README.md) for the expected files.

## Roadmap

- [ ] Drop in the AI-generated sprites (needs the image-CDN host allowlisted)
- [ ] More caps + a real region map with multiple screens
- [ ] Battle animations, sound and music
- [ ] Tie caps to real Hatstore products (Shopify integration is available)
