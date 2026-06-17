# Assets

The game is a top-down tilemap built on a single CC0 spritesheet.

| File | What it is | License |
|------|-----------|---------|
| `tiles/urban.png` | Kenney "RPG Urban Pack" tilesheet (16px tiles, 27×18) — floors, walls, furniture, plants and 6 walkable characters (4 directions, 3-frame walk). | CC0 1.0 (public domain) |

See `tiles/LICENSE.txt` for source/credit. The engine (`../game.js`) slices tiles
straight from the sheet by `(col,row)`, so no per-asset files are needed.
