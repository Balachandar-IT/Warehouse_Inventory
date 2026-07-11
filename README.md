# Datacom Warehouse Inventory

React/Vite frontend with an Express backend. The backend uses PostgreSQL through `pg`, so Supabase works by setting `DATABASE_URL`.

## Supabase setup

1. Create a Supabase project.
2. Open Supabase SQL Editor and run [backend/schema.sql](backend/schema.sql).
3. Create your first admin user by running the optional insert at the bottom of `backend/schema.sql` after changing the password.
4. Open Supabase Dashboard > Connect and copy the Transaction pooler connection string for Vercel/serverless, or the Direct connection string for a long-running backend.
5. Put that value in `DATABASE_URL`.

## Local development

Backend:

```bash
cd backend
copy .env.example .env
npm install
npm start
```

Frontend:

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

The frontend uses `VITE_API_URL`. Keep it as `http://localhost:5000/api` locally. If the frontend and backend are deployed on the same domain with the backend mounted at `/api`, remove `VITE_API_URL` and the app will use `/api`.

## Vercel deployment

Deploy as two Vercel projects:

Backend project:

- Root Directory: `backend`
- Environment variables:
  - `DATABASE_URL`: Supabase pooler or direct connection string
  - `DATABASE_SSL`: `true`
  - `DB_POOL_MAX`: `5`
  - `CORS_ORIGIN`: your frontend URL, for example `https://your-frontend.vercel.app`

Frontend project:

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variables:
  - `VITE_API_URL`: your backend API URL, for example `https://your-backend.vercel.app/api`

After deployment, visit `https://your-backend.vercel.app/api/health` to confirm Supabase connectivity.
