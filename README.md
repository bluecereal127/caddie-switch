# Caddie·Switch

Solver + tracker for Nintendo Switch Sports golf. See CLAUDE.md for full context.

## Run locally
npm install
npm run dev

## Deploy (Netlify, GitHub integration)
1. Push this folder to a new GitHub repo.
2. Netlify → Add new site → Import an existing project → pick the repo.
3. Build command `npm run build`, publish directory `dist` (netlify.toml already sets both).
4. Deploy. Optional: Domain settings → add golf.pogolist.com as a custom domain.

## Move your data from the claude.ai artifact
In the artifact: Log tab → Import/Export → copy the JSON box.
On the website: Log tab → Import/Export → paste → Import.
(Shots carry over; hole setup lives in the same storage blob and imports with them
when you paste the full export.)
