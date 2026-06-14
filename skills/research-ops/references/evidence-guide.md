# Evidence Guide — Research Ops

Read this file during steps 3–7 of the research workflow for detail on query construction, confidence calibration, and handling uncertain or conflicting evidence.

---

## Step 3 — Query Construction

**For `exa-search`**, favor specific, scoped queries:
- Good: `"Vercel bandwidth pricing 2025 alternatives Next.js"`
- Weak: `"website hosting"`

Include as many disambiguating terms as you know: product name, version, year, platform, use case. Vague queries surface noisy results and waste a search slot.

When searching for a person or company:
- Include role, company name, and a time range where possible
- Add context terms that distinguish them (city, industry, recent event)

**Escalate to `deep-research`** when:
- `exa-search` returns conflicting results across sources
- The question requires synthesis across 4+ sources
- The deliverable needs inline citations

**Use `market-research`** only when the final deliverable is a ranked recommendation or decision memo — not a raw summary.

---

## Step 4 — Confidence Calibration

Label every claim before writing the answer:

| Level | When it applies | How to report |
|-------|----------------|---------------|
| **High** | 2+ independent sources agree, dated within 6 months | Report as fact |
| **Medium** | 1 source, or data older than 6 months | Report with source and date |
| **Low / Inferred** | No direct source; logical conclusion from nearby facts | Label explicitly as inference |
| **Insufficient** | Cannot establish even medium confidence | Say so; recommend a deeper pass or manual check |

Never silently upgrade a low-confidence claim. If you find yourself hedging with "probably" or "likely" without labeling it as inference, that is a signal the confidence level is wrong.

---

## Step 5 — Conflicting Sources

When two credible sources disagree:

1. Name both sources and their positions explicitly
2. Note which is more recent
3. Offer a "most likely current" reading, labeled as inference
4. Recommend a primary source check if the answer materially affects a decision

Do not average conflicting claims or silently pick one. The conflict itself is useful information.

---

## Step 7 — Recurrence Assessment

Ask: will the user need this answer again in 2–4 weeks?

Signals that point to yes:
- The user said "I keep having to look this up" or "every month"
- The answer is pricing, availability, or status data — things that drift over time
- The research is tied to a recurring decision or reporting cycle

If yes, say so explicitly and recommend a concrete next step:
> "This looks like a recurring need. Options: (1) use `/schedule` to set up a monthly cloud agent that checks and diffs the source; (2) use `knowledge-ops` to store the result and set a freshness TTL; (3) bookmark a purpose-built tracker if one exists for this data type."

Only flag recurrence when the pattern is genuine — not for every query.
