# ALLCOINS RP open.mp server scaffold

This folder is the dedicated GTA San Andreas multiplayer server side, separate from the web API. Compile `gamemodes/allcoins_rp.pwn` with a compatible open.mp Pawn compiler and place the resulting AMX in the server's `gamemodes` directory. Use `server.cfg.example` as a starting point.

Do not expose the RP API server key to players or clients. The AC wallet is intentionally not enabled in this starter gamemode. Android client compatibility must be tested against the specific client build before advertising cross-play.
