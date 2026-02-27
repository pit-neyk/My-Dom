# My-Dom
DOM is an application for Home Building Managers and people, living in a shared Home Building, built with JS and Supabase.

## Auth setup

1. Create a `.env` file from `.env.example`.
2. Ensure the frontend vars are configured:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)
3. Run the app with `npm run dev`.

## Auth routes

- `/register` - email/password registration
- `/login` - email/password sign in

## Admin account and panel

- Admin credentials (seeded): `admin@admin.com` / `admin123`
- Admin route: `/admin`
- Run seed to ensure admin exists: `npm run seed:sample`
- Admin can manage properties, owners/contact details, obligations, events, documents, mass messages, impersonation mode, and own profile.
