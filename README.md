# Reasoner

Drop in a scientific paper and get help learning it. An OpenAI model reads the whole PDF and returns the concepts
a newcomer needs, ranked from essential to peripheral, a plain-language summary, a reading plan and self-check questions. You can also chat
with the paper. Add more papers and Reasoner draws a mind map that links concepts across them: the same idea under
different names, ideas that build on each other, prerequisites, and contrasting approaches.

```
frontend/   React + TypeScript + Vite   → Vercel
backend/    Node + Express + TypeScript → Railway (with Railway Postgres)
```

## How it works

- **Model and mode:** the **Model** menu offers a fixed list of current OpenAI models suited to research, set in
  `RESEARCH_MODELS` in `backend/src/llm.ts`, minus any your key can't use. The backend rejects models outside that
  list. The **Mode** menu sets the reasoning effort: Model default, None, Minimal, Low,
  Medium, High (the starting choice), Extra high or Max. Higher modes think longer, so they are slower and cost
  more. Not every model supports every level; if a model rejects one, the error says so and you can pick another.
  Both choices are saved in your browser and apply to new analyses, maps and chat messages. Each paper and map
  records the model and mode that produced it, and you can re-run a paper with different ones.
- **Concepts:** the model decides how many concepts a paper needs, so a short paper may get a handful and a dense
  one many more. Each concept has a relevance tier (essential, important, helpful or peripheral) and a reason for
  its rank. The list is sorted from most to least relevant, and the backend enforces the tier order.
- **Upload:** the PDF is stored in AWS S3 (or in Postgres when `S3_BUCKET` is unset, which suits local dev). It
  is also uploaded once to the OpenAI Files API (`purpose: user_data`), and requests then refer to it by
  `file_id`, so the PDF is not re-sent each time. The viewer loads the PDF through `/api/papers/:id/pdf`, which
  streams it from S3, so the bucket can stay fully private and needs no CORS rules. "Open PDF ↗" opens the
  original file in a new tab.
- **Links:** the address bar tracks what's open (`#/paper/<id>`, `#/compare/<id>`), so a link opens that paper
  or map directly.
- **Analysis:** OpenAI Responses API with structured outputs (a strict JSON schema from the Zod schema in
  `backend/src/schemas.ts`), run at the model and mode you chose. It runs as a background job, and the UI polls until it finishes.
- **Chat:** answers are streamed over server-sent events. The PDF always leads the conversation, so OpenAI's
  automatic prompt caching can reuse it on follow-up questions.
- **Compare (2–4 papers):** the model gets every full paper plus each paper's concept list, labelled `A.c1`, `A.c2`, … `B.c1`, and so on.
  It returns typed links (`same`, `similar`, `extends`, `prerequisite`, `applies`, `part_of`, `contrasts`). The
  backend checks each link and drops any that don't point at a real concept.

- **Password:** starting or re-running an analysis asks for a password, which the backend checks against
  `ANALYZE_PASSWORD`. A wrong password is rejected before the PDF is stored or sent to OpenAI. If
  `ANALYZE_PASSWORD` is not set, no analysis can start.

## Run locally

You need Node 22+ and an OpenAI API key. You don't need to install Postgres; `npm run db:local` runs one.

```bash
# backend: terminal 1, the database (data is kept in backend/.pgdata)
cd backend
npm install
npm run db:local

# backend: terminal 2, the API
cp .env.example .env        # fill in OPENAI_API_KEY and ANALYZE_PASSWORD
npm run dev                 # http://localhost:8080 (tables are created on startup)

# frontend
cd frontend
cp .env.example .env.local  # VITE_API_URL=http://localhost:8080
npm install
npm run dev                 # http://localhost:5173
```

## Deploy

Push this repo to GitHub first. Both Vercel and Railway deploy from a GitHub repo.

### Backend → Railway

1. Create a Railway project and add a **PostgreSQL** database.
2. Add a service from the GitHub repo and set its **Root Directory** to `backend`. `backend/railway.json` sets the
   build and start commands and the `/health` health check.
3. Set these service variables:
   - `OPENAI_API_KEY`: your key
   - `ANALYZE_PASSWORD`: the password users must enter to analyze a paper
   - `OPENAI_MODEL` (optional): the default model, `gpt-5.5-2026-04-23` if unset
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}` (a reference to the database; it uses the private network, so no SSL is needed)
   - `CORS_ORIGINS`: your Vercel URL, e.g. `https://reasoner.vercel.app` (comma-separate several)
4. Generate a public domain for the service under Settings → Networking.

### PDF storage → AWS S3

1. Create a private S3 bucket and leave "Block all public access" on.
2. Create an IAM user (or role) with access to just that bucket's prefix:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
       "Resource": "arn:aws:s3:::YOUR_BUCKET/papers/*"
     }]
   }
   ```
3. Add these variables to the Railway backend service: `S3_BUCKET`, `AWS_REGION` (the bucket's region, e.g.
   `eu-central-1`), `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

When the backend starts, its log says where PDFs are stored, e.g. `PDFs stored in S3 bucket "…"`. Papers uploaded
before S3 was configured stay in Postgres and still open normally.

### Frontend → Vercel

1. Import the repo into Vercel and set the **Root Directory** to `frontend`. Vercel detects Vite automatically.
2. Set the environment variable `VITE_API_URL` to the Railway domain, e.g. `https://reasoner-api.up.railway.app`.
3. Deploy. `frontend/vercel.json` adds the SPA rewrite.

## Configuration

| Variable (backend) | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | none (required) | OpenAI API key |
| `ANALYZE_PASSWORD` | none (required) | Password needed to start an analysis |
| `DATABASE_URL` | none (required) | Postgres connection string |
| `PGSSL` | `false` | Set to `true` for Postgres URLs that require SSL (e.g. Railway's public URL) |
| `S3_BUCKET` | none | S3 bucket for PDFs. Unset means PDFs are stored in Postgres |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | none | S3 credentials (standard AWS variables) |
| `S3_PREFIX` | `papers/` | Key prefix inside the bucket |
| `S3_ENDPOINT` | none | Only for S3-compatible stores (R2, MinIO) |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed frontend origins |
| `OPENAI_MODEL` | `gpt-5.5-2026-04-23` | Default model. Users choose from `RESEARCH_MODELS` in the app |

## Known limitations

- **Only analysis is password-protected.** Anyone who has the URL can still create mind maps, chat with papers
  (both call OpenAI) and delete papers.
- Background jobs run inside the API process. If it restarts during an analysis, that paper is marked failed and
  you can retry it from the UI. For heavy use, move the jobs to a queue.
- The model must accept PDF input (current GPT and o-series models do). OpenAI limits how large a PDF a request
  can include, so very long papers may be rejected.

## Cost

Cost depends on the model you pick. Each analysis reads the full paper (text and page images) and writes a long
structured answer, so a large reasoning model costs much more than a mini model. A comparison re-reads every
selected paper. Check the OpenAI usage dashboard after your first few papers to see what each one costs.
