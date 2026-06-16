# Hathouse — Kontorssimulator

A top-down office simulator in a chunky dungeon-tilemap pixel style. You walk
around the Hathouse office, explore rooms and chat with colleagues. Built as a
single HTML5 canvas game with no dependencies.

> The current floor is a **placeholder layout** — it will be replaced with the
> real Hathouse floor plan (traced from blueprints + reference photos).

## Play

Open `index.html` in a browser (or via GitHub Pages). No build step.

### Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Move   | Arrow keys / WASD | D-pad |
| Interact / talk (A) | Z / Enter / Space | A |
| Back (B) | X / Esc | B |

## What's in the demo

- **Scrolling camera** over a floor larger than one screen
- **Dungeon-style tiles** adapted to an office: walls with depth, tiled floor,
  doors, windows
- **Office props**: desks with monitors, chairs, plants, sofa, meeting tables,
  kitchen, bookshelf, water cooler, reception
- **Rooms** with name banners (Meeting rooms, Kitchen, Reception, open plan)
- **Colleagues** you can talk to

## Roadmap

- [ ] Replace placeholder floor with the real Hathouse floor plan (1 tile ≈ 0.5 m)
- [ ] Real furniture placement from reference photos
- [ ] Office-sim gameplay (tasks, interactions)
- [ ] Polished pixel-art sprites (needs the image-CDN host allowlisted)

## Tech

`game.js` is a single self-contained file: tile map + free pixel movement +
scrolling camera + procedural pixel-art tiles/sprites + dialog. Internal
resolution is 480×320, integer-scaled to the screen for crisp pixels.
