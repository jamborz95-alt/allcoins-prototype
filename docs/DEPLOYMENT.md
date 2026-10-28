# Deployment checklist

1. Create a dedicated RP PostgreSQL database or isolated branch. Do not apply RP migrations to the production ALLCOINS database without review.
2. Deploy `api/` as a separate Render web service using `render.yaml`.
3. Configure secrets only in the service environment; never commit actual secrets.
4. Apply `api/migrations/001_initial.sql` to the RP database.
5. Test `GET /health` and protected routes with invalid credentials before connecting the game server.
6. Implement and test the required internal wallet routes in the main ALLCOINS backend before enabling real AC transactions.
7. Host the open.mp dedicated server separately on a provider that supports persistent UDP port 7777; a normal Render web service is not a substitute for the game server's UDP listener.
8. Test the exact Android client and PC client together before announcing cross-play.
