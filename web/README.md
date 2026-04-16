# Sourcing Review Web

Static Firebase Hosting console for the sourcing service review loop.

It covers the minimum operator flow:

1. Create a `sourcing-source-runs` document through the sourcing API.
2. Upload JSONL source records or CSV rows to the sourcing ingest API.
3. Read pending `sourcing-dedup-candidates`.
4. Submit `sourcing-review-labels`.
5. Read `sourcing-approved-entities`.

## Firebase Prefix Contract

This web client assumes the sourcing backend uses these resource names:

- Firestore collections: `sourcing-*`
- API routes: `/api/sourcing/...`
- Source run endpoint: `/source-runs`
- Source record batch endpoint: `/source-records:batchUpsert`
- Review queue endpoint: `/dedup-candidates?status=pending_review&include=details`
- Review label endpoint: `/review-labels`
- Approved entity endpoint: `/approved-entities`

## Local Use

Start Hosting only:

```bash
npm run serve:web
```

Start Hosting plus local Functions and Firestore:

```bash
npm run serve:web:full
```

Open the Hosting emulator URL. The default API base URL is `/api/sourcing`,
which uses the Hosting rewrite when Hosting and Functions run together. The
configured Hosting emulator port is `5100`.

For a local callable HTTP API, the base usually looks like:

```text
http://127.0.0.1:5101/<firebase-project-id>/us-central1/<function-name>/api/sourcing
```

## Deploy

Deploy only the static review web:

```bash
npm run deploy:web:staging
npm run deploy:web:production
```

Do not use `npm run deploy:web:production` until the backend sourcing API exists
and the operator API base URL is confirmed.

## Hosting Rewrite

`firebase.json` rewrites `/api/sourcing/**` to the nested Firebase Function
export `sourcing.api`, whose deployed function ID is `sourcing-api`.

Use a full local Function URL only when you serve the static folder without
Hosting rewrites. The value is saved to `localStorage`.

## Upload Payload Shape

Create a source run first:

```json
{
  "sourceName": "openalex",
  "sourceDomain": "researcher",
  "pipelineName": "local-jsonl-replay",
  "trigger": "manual",
  "metadata": {}
}
```

Then upload JSONL records with the returned source run ID:

```json
{
  "runId": "<source-run-id>",
  "records": [
    {
      "sourceNativeId": "A123",
      "entityType": "person",
      "displayName": "Ada Lovelace",
      "institution": "Analytical Engine Lab",
      "rawSummary": {
        "email": "ada@example.edu",
        "orcid": "0000-0000-0000-000X"
      },
      "display": {
        "homepage": "https://example.edu/ada"
      },
      "raw": {}
    }
  ]
}
```

If the API is unavailable, the page generates an equivalent `curl` command for
manual replay.

## CSV Upload

The browser can convert CSV files into generic source records before upload. It
does not write Firestore directly.

Useful CSV headers:

- `email`, `emails`, `member_email`
- `github_url`, `member_github`, `html_url`
- `linkedin_url`, `member_linkedin`
- `member_devpost`, `project_url`
- `name`, `member_name`, `username`, `project_name`
- `institution`, `company`, `affiliation`

Rows are uploaded under the source run configured on the page, so Devpost,
GitHub, researcher, or manual CSV imports still land in the same
`sourcing-*` storage and review loop.
