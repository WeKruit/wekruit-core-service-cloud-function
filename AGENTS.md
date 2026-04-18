## Design Context

### Users
- Primary users are WeKruit operators reviewing sourced records before those records feed outbound workflows.
- Their core job is not debugging ingestion and not browsing a dashboard. It is checking what jobs are running, reviewing what needs approval, and scanning the approved survivors in a clean table.
- This UI is an internal operator console and should optimize for fast tabular review, low cognitive load, and confidence under uncertainty.

### Brand Personality
- Simple
- Operational
- Trustworthy
- Calm
- Human

### Aesthetic Direction
- Follow WeKruit operator-console mode: warm ivory surfaces, dark espresso ink, restrained status color, and minimal chrome.
- Default to an operator desk, not a marketing dashboard: dense tables, clear rails, compact controls, and almost no decorative framing.
- Prefer Halant for display/headline moments and Geist or a close UI sans for body and controls.
- Information architecture should feel closer to Linear, Airtable, or a Notion database than a custom dashboard: lists first, tables first, details second.
- Raw JSON and transport details belong behind disclosure. The default screen should foreground running work, review queue, and approved rows.
- Explicit anti-reference: oversized heroes, repeated stat cards, nested cards, decorative summaries, and any layout where cards compete with tables.

### Design Principles
- Show operational truth first: what is running, what needs review, what is approved.
- Tables are the product: primary views should be simple, scannable tables with strong column hierarchy.
- Details are secondary: evidence, payloads, and full record context open only after row selection.
- Keep only one primary action per surface: do not let summary cards, decorative metrics, and tables compete.
- Warm, not soft: restrained and human, but never dashboard-fluffy or overdesigned.
