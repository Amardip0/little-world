# Nidhi Little World — Full Website CMS

A React + Vite + Express + MongoDB Atlas website with a private owner dashboard. The admin dashboard is a full content editor: it can update website headings, titles, paragraphs, button labels, navigation labels, letter text, quotes, appreciation cards, poll labels, gallery photos/captions/alt text, and keepsake posters/metadata. The public site reads the published content from MongoDB.

## Local development (Windows)

1. Install Node.js 20 or newer.
2. Open this folder in VS Code.
3. Open `.env` and set `MONGODB_URI` to your own MongoDB Atlas connection string. The project already contains a local admin password hash and generated session secret. Do not share or commit `.env`.
4. In MongoDB Atlas → Security → Network Access, allow your current public IP.
5. In PowerShell run:

```powershell
npm install
npm run dev
```

6. Open `http://localhost:5173`.
7. Admin: `http://localhost:5173/owner-dashboard`.

Vite proxies `/api` and `/uploads` to the Express API at port 4000. There is no Vercel CLI, Vercel Serverless Function, or Cloudinary requirement for local use.

## Admin dashboard

- Local starter password: `admin@123` (change before making the site public).
- Website wording: welcome screen, navigation, hero, gallery section, appreciation section, poll, keepsakes, letter popup, feedback, footer, button labels and microcopy.
- Quotes and compliments: add, edit and remove.
- Appreciation cards: edit marker, title and description.
- Poll labels: edit visible options while stable analytics keys are retained.
- Gallery: 15 fixed photo slots with image, title, caption, category and accessibility alt text.
- Keepsakes: 2 poster slots with image, title, description and alt text.
- Draft preview: review current editor text before publishing.
- Save & publish: persists the complete content document in MongoDB; the public website fetches the latest published content without a code change or redeployment.
- Aggregate opt-in analytics and CSV export.

## Database behaviour

On first successful connection, the server seeds the public content document from `server/seed.json`. If a database already has an older content document, the server merges in newly added default CMS fields without overwriting existing saved fields. This allows the CMS schema to grow safely.

## Image upload note

Local admin uploads are stored in `public/uploads`. This works for local development. Before deployment to an ephemeral/serverless host, move uploads to durable object storage (Cloudinary, S3, or compatible storage) and update the upload adapter. Do not rely on a hosting instance's local disk for production uploads.

## Production safety

- `.env` is excluded by `.gitignore`; commit `.env.example` only.
- Passwords are checked with bcrypt; owner session uses a signed HttpOnly SameSite cookie.
- Same-origin checks on mutations, request limits, upload size/type limits, API no-store headers, and baseline security headers are enabled.
- MongoDB uses connection pooling and aggregate analytics indexes.
- Analytics are aggregate-only and opt-in; no visitor identity profiles, IP persistence, camera, or gaze tracking.
- Change `admin@123`, regenerate `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET`, and configure production environment variables before public launch.
- A zero-crash guarantee is not realistic. High-traffic production should add shared Redis rate limiting, durable image storage/CDN, monitoring, backups and load testing.

## Production build check

```powershell
npm run build
```

The project currently uses a regular Express server for both local API and static-file serving. Deployment architecture can be chosen later; it is intentionally not coupled to Vercel Serverless Functions.
