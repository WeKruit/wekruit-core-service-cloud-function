## Design Context

### Users
- Primary users are WeKruit operators reviewing sourced records before those records feed outbound workflows.
- Their core job is not debugging ingestion. It is inspecting provenance, reviewing merge reasoning, and approving only the entities that should survive downstream.
- This UI is an internal operator console and should optimize for review throughput, evidence visibility, and confidence under uncertainty.

### Brand Personality
- High-judgment
- Restrained
- Trustworthy
- Calm
- Human

### Aesthetic Direction
- Follow WeKruit operator-console mode: warm ivory surfaces, dark espresso ink, structured cards, restrained status color, and minimal chrome.
- Prefer Halant for display/headline moments and Geist or a close UI sans for body and controls.
- Raw JSON and transport details belong behind disclosure. The default screen should foreground source runs, records, evidence, review actions, and approved outcomes.

### Design Principles
- Show operational truth first: real source runs, real records, real review state.
- Evidence before internals: provenance, contact fields, paper metadata, and merge reasons come before payload dumps.
- Calm density: dense information is allowed, clutter is not.
- One-screen loop: source run -> inspect -> review -> approved should feel like one continuous workflow.
- Warm, not soft: premium and human, never generic dashboard SaaS or developer-tool terminal aesthetic.
