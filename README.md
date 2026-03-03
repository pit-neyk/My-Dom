# My-Dom
DOM is an application for Home Building Managers and people, living in a shared Home Building, built with JS and Supabase.

## Live Demo

- Production URL: [https://my-dom.netlify.app/](https://my-dom.netlify.app/)

## Project documentation

- Full project documentation: [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md)

## Documentation index

- Testing
	- Test scripts: [package.json](package.json)
	- Unit tests: [tests/unit](tests/unit)
	- Integration tests: [tests/integration](tests/integration)
	- E2E tests: [tests/e2e](tests/e2e)
- Build tooling
	- Vite config: [vite.config.js](vite.config.js)
	- Playwright config: [playwright.config.js](playwright.config.js)
- Database migrations
	- SQL migrations: [supabase/migrations](supabase/migrations)
	- Seed data script: [supabase/seeds/seed-sample-data.js](supabase/seeds/seed-sample-data.js)
- Deployment notes
	- Netlify deployment section: [README.md#netlify-deploy-setup](README.md#netlify-deploy-setup)
	- Netlify config: [netlify.toml](netlify.toml)
	- Production URL: [https://my-dom.netlify.app/](https://my-dom.netlify.app/)

## Auth setup

1. Create a `.env` file from `.env.example`.
2. Ensure the frontend vars are configured:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)
3. Run the app with `npm run dev`.

## Netlify deploy setup

Production deployment is hosted on Netlify at:

- [https://my-dom.netlify.app/](https://my-dom.netlify.app/)

For production deploys, Netlify must have the same frontend env vars available at build time:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)

In Netlify:

1. Open your site → **Site configuration** → **Environment variables**.
2. Add the variables above with values from Supabase Project Settings → API.
3. Trigger **Deploys → Trigger deploy → Deploy site** (or clear cache and deploy).

## Auth routes

- `/register` - email/password registration
- `/login` - email/password sign in
- `/discussions` - signals feed (create signals, comment, attach files)

## Admin account and panel

- Admin credentials (seeded): `admin@admin.com` / `pitneykadmin123`
- User credentials (seeded): `stevenak@admin.com` / `pass123`
- Admin route: `/admin`
- Run seed to ensure admin exists: `npm run seed:sample`
- Admin can manage properties, owners/contact details, obligations, documents, mass messages, impersonation mode, and own profile.
