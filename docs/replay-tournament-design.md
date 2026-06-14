# Replay-Parsed Tournaments — Design Doc

Status: **Draft / for review** · Created 2026-06-14 · Branch `claude/match-replay-stats-parsing`

This document designs **Phase 3** of the R6 stats bot (`PLAN.txt` §11): parsing
Match Replay (`.rec`) files to run **custom tournaments** with advanced,
replay-only stats (KOST, entry, trades, clutches) that no public API exposes.

It supersedes the rough §11 sketch with concrete decisions taken on 2026-06-14:

| Decision | Choice |
|---|---|
| **Acquisition** | **Watcher on a host PC.** The organizer (or an admin friend) runs a script on their gaming PC that continuously ingests new matches from the `MatchReplays` folder. |
| **Scope** | **Full tournament management** — brackets, team rosters, seeding, standings/points — *plus* the parsed stats. |
| **Parser** | `r6-dissect` (redraskal), the same parser R6 Analyst uses. |

---

## 1. Why tournaments are the right fit

The blocking constraint on replay parsing (`PLAN.txt` §11) is that **`.rec`
files only exist on the PC of a player who played the match with Match Replay
enabled — there is no API to download them.** That kills the general "parse any
player on demand" case.

Custom tournaments remove the constraint:

- **You control the lobby**, so a host/observer reliably has the replay files.
- **One recording contains all 10 players.** A single host's `MatchReplays`
  folder per map covers the entire lobby — no need to collect from everyone.
- **Match Replay can be a tournament rule** (host must have it enabled).

This is the one context where replay-derived "pro stats" are actually
achievable end to end.

---

## 2. What r6-dissect gives us

`r6-dissect` parses a `.rec` set into structured JSON. Field names below are the
real ones from the parser's data model (Go structs / JSON tags).

### Directly parsed

**Match header** — `gameVersion`, `timestamp`, `matchType`, `map`, `site`,
`gamemode`, `matchID`, `roundNumber`, `teams[2]` (`name`, `score`, `won`,
`winCondition`, `role` = Attack/Defense), `players[]` (`username`, `profileID`,
`teamIndex`, `operator`, `roleName`).

**Per-round player stats** (`PlayerRoundStats`) — `kills`, `died`, `assists`,
`headshots`, `headshotPercentage`, `score`, `1vX`.

**Per-match player stats** (`PlayerMatchStats`) — `rounds`, `kills`, `deaths`,
`assists`, `headshots`, `headshotPercentage`.

**Event timeline** (`matchFeedback[]`) — ordered events with `type`, `username`,
`target`, `headshot`, `time`, `timeInSeconds`, `operator`. Types:
`Kill`, `Death`, `DefuserPlantStart`, `DefuserPlantComplete`,
`DefuserDisableStart`, `DefuserDisableComplete`, `LocateObjective`,
`OperatorSwap`, `Battleye`, `PlayerLeave`, `Other`.

### Derived by us from the timeline (the high-value part)

| Stat | Definition |
|---|---|
| **Entry kill / death** | First `Kill` event of the round. Killer → entry kill; `target` → entry death (opening duel). |
| **Trade kill** | A `Kill` whose `target` had, within **N seconds** (default 8s, configurable), killed a teammate of the killer. The earlier death is "traded". |
| **KOST%** | Fraction of rounds where the player got at least one of: **K**ill, **O**bjective (planted/defused/disabled per events), **S**urvived (`died == false`), or was **T**raded. All four inputs are present. |
| **Clutch** | Last alive on a team that won the round (1vX). The per-round `1vX` field plus the timeline confirm it. |
| **Opening-duel win%, post-plant win%, plant/defuse rate** | From team roles + plant/defuse events + round outcome. |
| **Per-side / per-site / per-operator splits** | Group round stats by `role`, header `site`, and `operator`. |

### Not available (documented limits)

Bullet/movement data, anything outside the replay, and any "ground-truth" trade
flag — the trade window `N` is **our** tunable definition, so we store it and
display it. Replay format changes most seasons; r6-dissect needs periodic
updates (handled by keeping the binary current — see §6).

---

## 3. Architecture overview

Two processes that share **only the SQLite DB contract**, connected by a thin
authenticated HTTP ingest endpoint:

```
  [Organizer's gaming PC]                         [Bot host / VPS]
  ┌─────────────────────┐                         ┌────────────────────────┐
  │ watcher.js (Bun)     │   parsed JSON (POST)    │ ingest endpoint        │
  │  watch MatchReplays  │ ──────────────────────► │  (token-auth, small)   │
  │  run r6-dissect      │                         │   → normalize          │
  │  emit match JSON     │                         │   → SQLite (Phase-3     │
  └─────────────────────┘                         │      tables)           │
        .rec stays local                           │   → derived stats      │
                                                    │ discord.js commands    │
                                                    │  /tournament /bracket  │
                                                    │  /match /leaderboard   │
                                                    └────────────────────────┘
```

**Why parse on the PC and POST JSON (not upload raw `.rec`):**

- `.rec` sets are tens of MB per map; parsed JSON is small.
- The r6-dissect binary lives on the gaming PC (where replays already are);
  the VPS stays clean.
- Replays (which contain all 10 players' data) never leave the organizer's
  machine — only the derived match JSON does.

The ingest endpoint is **internal and token-authenticated** — it is not a public
upload portal. If the watcher and bot ever run on the same machine, the watcher
can write to the DB directly and the endpoint is skipped; the normalization code
is shared either way.

### File layout (new)

```
src/
  replay/
    ingest.js        normalize r6-dissect JSON → DB rows (shared by endpoint + direct)
    derive.js        timeline → KOST/entry/trade/clutch (sibling of r6/aggregate.js)
    schema.js        zod-ish runtime validation of incoming JSON (defensive)
  tournament/
    bracket.js       seeding + bracket generation (single/double elim, RR, swiss)
    standings.js     points/standings computation
  server/
    ingest-server.js tiny Bun.serve() endpoint, token-auth, calls replay/ingest
  commands/
    tournament.js    /tournament create|list|info|start
    team.js          /team add|roster|seed
    bracket.js       /bracket show|advance
    match.js         /match — per-game advanced scoreboard
    leaderboard.js   /leaderboard — player aggregates across a tournament
    standings.js     /standings — team standings
scripts/
  watcher.js         runs on the organizer PC (watch + parse + POST)
src/db/migrations/
  0002_replays.sql   tournament + replay tables
```

This mirrors the existing flat, one-file-per-command convention and the
`r6/` → `aggregate.js` → `embeds.js` flow already in the repo.

---

## 4. Data model (`0002_replays.sql`)

R6 naming is overloaded, so this doc is explicit:

- **fixture** = a bracket node: a best-of-N series between two teams.
- **game** = one map = one `.rec` parse (a fixture is 1–N games).
- **round** = one round within a game.

```sql
-- Tournament management ------------------------------------------------------
CREATE TABLE tournaments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  name         TEXT NOT NULL,
  format       TEXT NOT NULL,            -- single_elim | double_elim | round_robin | swiss
  best_of      INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'setup', -- setup | active | complete
  trade_window_s INTEGER NOT NULL DEFAULT 8,  -- our KOST/trade definition, frozen per tournament
  created_at   TEXT NOT NULL
);

CREATE TABLE teams (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  seed          INTEGER,
  UNIQUE (tournament_id, name)
);

CREATE TABLE team_members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id      INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id   TEXT,                     -- Ubisoft profileID from the replay (stable join key)
  username     TEXT NOT NULL,            -- fallback join key / display
  discord_user_id TEXT                   -- optional link to linked_accounts
);
CREATE INDEX idx_team_members_profile ON team_members (profile_id);

-- Bracket --------------------------------------------------------------------
CREATE TABLE fixtures (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  bracket       TEXT NOT NULL DEFAULT 'winners', -- winners | losers | rr | swiss
  round_label   TEXT,                    -- 'QF','SF','F','RO16','Round 3'...
  slot          INTEGER,                 -- position within the bracket round
  team_a_id     INTEGER REFERENCES teams(id),
  team_b_id     INTEGER REFERENCES teams(id),
  best_of       INTEGER NOT NULL DEFAULT 1,
  score_a       INTEGER NOT NULL DEFAULT 0,
  score_b       INTEGER NOT NULL DEFAULT 0,
  winner_team_id INTEGER REFERENCES teams(id),
  next_fixture_id INTEGER REFERENCES fixtures(id), -- where the winner advances
  next_loser_fixture_id INTEGER REFERENCES fixtures(id), -- double-elim drop
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | live | complete
  scheduled_at  TEXT
);

-- Parsed replay data ---------------------------------------------------------
CREATE TABLE games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id      INTEGER REFERENCES fixtures(id) ON DELETE SET NULL, -- null = unassigned
  dissect_match_id TEXT NOT NULL,        -- header.matchID; dedupe key
  map             TEXT,
  gamemode        TEXT,
  match_type      TEXT,
  played_at       TEXT,
  team0_name      TEXT,
  team1_name      TEXT,
  team0_score     INTEGER,
  team1_score     INTEGER,
  winning_team    INTEGER,               -- 0 | 1
  ingested_at     TEXT NOT NULL,
  UNIQUE (dissect_match_id)
);

CREATE TABLE rounds (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id       INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number  INTEGER NOT NULL,
  site          TEXT,
  atk_team      INTEGER,                 -- which teamIndex attacked this round
  planted       INTEGER NOT NULL DEFAULT 0,
  defused       INTEGER NOT NULL DEFAULT 0,
  win_condition TEXT,
  winning_team  INTEGER,
  UNIQUE (game_id, round_number)
);

CREATE TABLE round_player_stats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id    INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  profile_id  TEXT,
  username    TEXT NOT NULL,
  team_index  INTEGER,
  operator    TEXT,
  side        TEXT,                      -- ATK | DEF
  -- parsed
  kills       INTEGER NOT NULL DEFAULT 0,
  died        INTEGER NOT NULL DEFAULT 0,
  assists     INTEGER NOT NULL DEFAULT 0,
  headshots   INTEGER NOT NULL DEFAULT 0,
  score       INTEGER NOT NULL DEFAULT 0,
  one_vx      INTEGER NOT NULL DEFAULT 0,
  -- derived (computed at ingest from the timeline, frozen)
  entry_kill   INTEGER NOT NULL DEFAULT 0,
  entry_death  INTEGER NOT NULL DEFAULT 0,
  traded       INTEGER NOT NULL DEFAULT 0,  -- this player's death was traded
  trade_kill   INTEGER NOT NULL DEFAULT 0,  -- this player traded an opponent
  objective    INTEGER NOT NULL DEFAULT 0,  -- planted/defused/disabled
  survived     INTEGER NOT NULL DEFAULT 0,
  kost         INTEGER NOT NULL DEFAULT 0,  -- K||O||S||T this round
  clutch       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_rps_round ON round_player_stats (round_id);
CREATE INDEX idx_rps_profile ON round_player_stats (profile_id);
```

**Design notes**

- Derived per-round flags are **computed once at ingest** and stored, so
  leaderboards are plain `SUM()`s and the trade window can't drift after the
  fact (it's frozen per tournament in `tournaments.trade_window_s`).
- `games.fixture_id` is nullable: a parsed game can land before it's assigned to
  a bracket fixture, then be attached via `/match assign` or auto-matched by the
  two teams' rosters (`profile_id` membership).
- `team_members.profile_id` is the **stable join** between a Ubisoft account in
  the replay and a tournament team. `username` is the fallback (players rename).
- Standings for round-robin/swiss are computed on the fly from `fixtures`; no
  separate standings table needed.

---

## 5. Ingest pipeline

1. **Watch** — `scripts/watcher.js` watches the `MatchReplays` directory. A
   match writes several `.rec` (one per round) into a `Match-<timestamp>` folder.
2. **Debounce / completeness** — wait until the folder is stable (no new/changed
   `.rec` for ~30s) before parsing, so we don't parse mid-match.
3. **Parse** — run r6-dissect over the folder → one match JSON. (Via the Bun
   wrapper `r6-dissect-bun` if its packaged API is stable, else shell out to the
   binary with `Bun.spawn` and read stdout — decided at build time after a spike.)
4. **POST** — send JSON to the ingest endpoint with a shared `INGEST_TOKEN`.
   Retry with backoff on network failure. Mark the folder ingested locally so it
   isn't re-sent.
5. **Normalize** (`replay/ingest.js`) — validate, upsert `games` (dedupe on
   `dissect_match_id`), insert `rounds` and `round_player_stats`. Idempotent: a
   re-POST of the same `matchID` is a no-op.
6. **Derive** (`replay/derive.js`) — walk each round's timeline once to set
   entry/trade/objective/survived/kost/clutch flags, using the tournament's
   `trade_window_s`.
7. **Attach** — link the game to a fixture (auto by roster match, or manual),
   and update `fixtures.score_*` / `winner_team_id` when a series completes.

All of 5–7 also run when the watcher is co-located with the bot (direct DB),
since they live in `replay/` not in the server.

---

## 6. Tournament management (`tournament/`)

- **Seeding & bracket generation** (`bracket.js`): given N teams + format,
  generate `fixtures` rows with `next_fixture_id` wiring. Support
  single-elim, double-elim (winners/losers + drop links), round-robin
  (all pairs), and swiss (pair by standings each round).
- **Advancement**: when a fixture completes (series score reaches
  `ceil(best_of/2)`), set `winner_team_id`, propagate the winner into
  `next_fixture_id`'s open slot (and loser into `next_loser_fixture_id` for
  double-elim).
- **Standings** (`standings.js`): wins/losses, map differential, round
  differential, and head-to-head, computed from `fixtures` + `games`.
- **r6-dissect currency**: the binary needs per-season updates. The watcher
  checks/updates the binary on start (or we pin a known-good version and bump
  it when a season breaks parsing). Document this as routine maintenance.

---

## 7. Commands

| Command | Purpose |
|---|---|
| `/tournament create <name> <format> [best_of]` | Create a tournament (admin). |
| `/tournament list` · `/tournament info <id>` | Browse. |
| `/team add <tournament> <name> [seed]` | Register a team. |
| `/team roster <team> add <username\|profile>` | Build the roster (sets join keys). |
| `/bracket generate <tournament>` | Seed + generate fixtures. |
| `/bracket show <tournament>` | Render the bracket. |
| `/match <game_id>` | **Advanced per-game scoreboard**: K/D/A, HS%, KOST, entry +/−, trades, clutches, per-side. |
| `/match assign <game_id> <fixture_id>` | Attach a parsed game to a fixture. |
| `/leaderboard <tournament> [stat]` | Player aggregates across the whole tournament (sortable by KOST, entry diff, rating…). |
| `/standings <tournament>` | Team standings / bracket progress. |

Embeds reuse the existing `embeds.js` style. A new `embeds/replay.js` builds the
scoreboard and leaderboard cards.

---

## 8. Config additions (`.env`)

```
# Replay ingest endpoint (bot host)
INGEST_TOKEN=            # shared secret; watcher must send it
INGEST_PORT=8787         # Bun.serve() port for the internal ingest endpoint

# Watcher (organizer PC) — see scripts/watcher.js
REPLAY_DIR=              # path to the Match Replays folder
INGEST_URL=              # https://bot-host/ingest
R6_DISSECT_BIN=          # path to r6-dissect binary (if shelling out)
```

---

## 9. Milestones

1. **Spike** — confirm the r6-dissect invocation (Bun wrapper vs binary
   shell-out) and capture one real match JSON into `spike/` to lock field names.
2. **Schema** — `0002_replays.sql` + repo functions + tests.
3. **Ingest core** — `replay/ingest.js` + `replay/derive.js` with unit tests
   over the spike fixture (KOST/entry/trade/clutch math is the test target).
4. **Ingest endpoint + watcher** — `server/ingest-server.js`, `scripts/watcher.js`.
5. **Read commands** — `/match`, `/leaderboard` + replay embeds.
6. **Tournament mgmt** — `tournament/bracket.js`, `standings.js`, and the
   `/tournament`, `/team`, `/bracket`, `/standings` commands.
7. **Auto-attach** games to fixtures by roster; series advancement.

Stats path (1–5) lands value first; tournament structure (6–7) builds on it.

---

## 10. Open questions

- **Game vs fixture auto-matching**: trust roster `profile_id` overlap to attach
  a parsed game to the right fixture, or always require `/match assign`? (Lean:
  auto when both rosters match ≥4/5, else prompt.)
- **Rating metric**: do we want a single composite "rating" (R6 Analyst-style) on
  the leaderboard, or just show the component stats? Composite needs a documented
  formula we pin ourselves.
- **Multi-host de-dup**: if two players in the same match both run watchers, both
  POST the same `matchID` — handled by the `dissect_match_id` UNIQUE constraint,
  but worth confirming the parsed JSON's `matchID` is identical across recorders.
- **Mid-tournament roster changes / subs**: how to attribute stats when a sub
  plays (per-game roster snapshot vs team-level roster).
