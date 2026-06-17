# Hathouse — Kontoret

A top-down, Gather-Town-style office you can walk around. Explore the Hathouse
floor, hang out by the sofas, peek into the meeting room and chat with
colleagues. A single HTML5 canvas game — no build step, no dependencies.

## Play

Open `index.html` in a browser (or via GitHub Pages).

### Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Move   | Arrow keys / WASD | D-pad |
| Interact / talk (A) | Z / Enter / Space | A |
| Back (B) | X / Esc | B |

## What's in it

- **Real tilemap engine**: scrolling camera that follows you over a floor larger
  than the screen, grid-based collisions, depth-sorting (walk *behind* plants).
- **Sprite characters**: a walkable avatar + colleagues in 4 directions with a
  3-frame walk cycle.
- **A furnished office**: reception, desk pods, a meeting room, a lounge with
  sofas, a kitchen and plants — each with something to say when you press A.

## Art

All graphics come from the **Kenney "RPG Urban Pack"** (`assets/tiles/urban.png`),
released under **CC0** (public domain — free for commercial use). The engine
slices tiles straight from that one sheet by `(col, row)`.

## Roadmap

- [ ] Trace the real Hathouse floor plan into the map grid
- [ ] More interactions / light office-sim tasks
- [ ] Optional: custom HATHOUSE-branded props (AI art) layered on top

## Tech

`game.js` is one self-contained file: tile map + camera + collision + sprite
animation + dialog. Internal resolution is 480×320, integer-scaled for crisp
pixels.
