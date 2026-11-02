# Reasoner

Drop in a scientific paper and get help learning it. An OpenAI model reads the whole PDF and returns the 25 most important
concepts a newcomer needs, a plain-language summary, a reading plan and self-check questions. You can also chat
with the paper. Add more papers and Reasoner draws a mind map that links concepts across them: the same idea under
different names, ideas that build on each other, prerequisites, and contrasting approaches.

```
frontend/   React + TypeScript + Vite   → Vercel
backend/    Node + Express + TypeScript → Railway (with Railway Postgres)
```

## How it works

- **Model choice:** the **Model** menu in the top bar lists the models your OpenAI key can use (from the
  `/v1/models` endpoint, minus audio, image, embedding and dated snapshot models). You can also type any model id
  under "Custom model id…". The choice is saved in your browser and applies to new analyses, maps and chat
  messages. Each paper and map records which model produced it, and you can re-run a paper with a different model.
- **Upload:** the PDF is stored in Postgres and uploaded once to the OpenAI Files API (`purpose: user_data`).
  Requests then refer to it by `file_id`, so the PDF is not re-sent each time.
- **Analysis:** OpenAI Responses API with structured outputs (a strict JSON schema from the Zod schema in
  `backend/src/schemas.ts`). Reasoning models (o-series, GPT-5 and later) run at `high` reasoning effort. It runs
  as a background job, and the UI polls until it finishes.
- **Chat:** answers are streamed over server-sent events. The PDF always leads the conversation, so OpenAI's
  automatic prompt caching can reuse it on follow-up questions.
- **Compare (2–4 papers):** the model gets every full paper plus each paper's concept list, labelled `A.c1` … `D.c25`.
  It returns typed links (`same`, `similar`, `extends`, `prerequisite`, `applies`, `part_of`, `contrasts`). The
  backend checks each link and drops any that don't point at a real concept.

## Run locally

You need Node 22+, a Postgres database and an OpenAI API key.

```bash
# backend
cd backend
cp .env.example .env        # fill in OPENAI_API_KEY and DATABASE_URL
npm install
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
   - `OPENAI_MODEL` (optional): the default model, `gpt-5.5` if unset
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}` (a reference to the database; it uses the private network, so no SSL is needed)
   - `CORS_ORIGINS`: your Vercel URL, e.g. `https://reasoner.vercel.app` (comma-separate several)
4. Generate a public domain for the service under Settings → Networking.

### Frontend → Vercel

1. Import the repo into Vercel and set the **Root Directory** to `frontend`. Vercel detects Vite automatically.
2. Set the environment variable `VITE_API_URL` to the Railway domain, e.g. `https://reasoner-api.up.railway.app`.
3. Deploy. `frontend/vercel.json` adds the SPA rewrite.

## Configuration

| Variable (backend) | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | none (required) | OpenAI API key |
| `DATABASE_URL` | none (required) | Postgres connection string |
| `PGSSL` | `false` | Set to `true` for Postgres URLs that require SSL (e.g. Railway's public URL) |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed frontend origins |
| `OPENAI_MODEL` | `gpt-5.5` | Default model. Users can choose another in the app |
| `CONCEPT_COUNT` | `25` | How many key concepts to extract per paper |

## Known limitations

- **No authentication.** Anyone who has the backend URL can upload papers and spend your API credits. Add auth
  (e.g. Clerk or Supabase Auth, or at least a shared access token) before you share the URL publicly.
- Background jobs run inside the API process. If it restarts during an analysis, that paper is marked failed and
  you can retry it from the UI. For heavy use, move the jobs to a queue.
- PDFs are stored in Postgres (`bytea`). That works for a personal library. For larger volumes, move them to object
  storage such as a Railway bucket or S3.
- The model must accept PDF input (current GPT and o-series models do). OpenAI limits how large a PDF a request
  can include, so very long papers may be rejected.
- Anyone using the app can pick any model your key can access, including expensive ones.

## Cost

Cost depends on the model you pick. Each analysis reads the full paper (text and page images) and writes a long
structured answer, so a large reasoning model costs much more than a mini model. A comparison re-reads every
selected paper. Check the OpenAI usage dashboard after your first few papers to see what each one costs.
