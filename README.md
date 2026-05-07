# LaxBoard

Sixes lacrosse play designer. Draw player movements on a half-field canvas, record paths one player at a time, animate all players simultaneously, and save plays to a local SQLite database.

## Quick start

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # with nodemon (auto-restart)
npm test           # Jest unit tests
```

API docs: `http://localhost:3000/api-docs`

## Usage

1. **Create a set** — click "+ New Set" in the sidebar and give it a name.
2. **Select a player** — click one of the six numbered circles in the sidebar or on the canvas.
3. **Record** — click "Record Player", drag the player across the field, release to stop.
4. **Repeat** for each player you want to move.
5. **Play** — click "Play" to watch all players animate simultaneously at recorded speed.
6. **Save** — click "Save" to persist paths to the database.

## Stack

- **Backend**: Node.js, Express, `node-sqlite3-wasm` (pure-JS SQLite, no native build needed), Swagger UI
- **Frontend**: Vanilla JS ES modules, HTML5 Canvas
- **Tests**: Jest + in-memory SQLite
