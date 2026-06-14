---
name: research-ops
description: Evidence-first current-state research workflow for ECC. Use when the user wants fresh facts, comparisons, enrichment, or a recommendation built from current public evidence and any supplied local context. Trigger proactively whenever the user says "research", "look up", "compare", "what's the latest", "find out", "who should I talk to", or asks any question whose answer depends on current public data rather than the codebase.
origin: ECC
---

# Research Ops

Operator layer over the repo's research stack. Tells you when and how to use `exa-search`, `deep-research`, `market-research`, `lead-intelligence`, and `knowledge-ops` together.

## Skill Stack

| Skill | When to reach for it |
|-------|---------------------|
| `exa-search` | Fast current-web discovery — start here |
| `deep-research` | Multi-source synthesis, citations, competing claims |
| `market-research` | Ranked recommendation or decision memo as the end product |
| `lead-intelligence` | People/company targeting instead of generic research |
| `knowledge-ops` | Store durable research results for future sessions |

## Lane Selection

Pick the lightest lane that can answer the question:

| Question shape | Lane | Skills |
|---------------|------|--------|
| Single fact with a date | quick-factual | `exa-search` |
| "Which is better / which should I choose" | comparison | `exa-search` → `market-research` |
| "Tell me about person X / company Y" | enrichment | `lead-intelligence` |
| Synthesizing multiple competing sources | synthesis | `deep-research` |
| Same question will recur next week | monitoring | answer + set up recurring workflow |

If local docs or code already answer the question, do not spin up a web research pass.

## Workflow

**→ For query construction, confidence calibration, conflicting-source handling, and recurrence assessment, read `references/evidence-guide.md`.**

### 1. Normalize what the user already gave you

Categorize supplied material before searching:
- **Established** — stated confidently; accept without re-searching
- **Needs verification** — requires a source check
- **Open questions** — gaps the research pass must fill

Don't restart from zero. Treat user-supplied context as the cheapest source of evidence.

### 2. Pick a lane

Use the table above. When in doubt, start with `exa-search` and escalate.

### 3. Execute the lightest useful pass first

Start with `exa-search`. Escalate to `deep-research` when results conflict or 4+ sources are needed. Use `market-research` only when the deliverable is a ranked recommendation.
→ See `references/evidence-guide.md` for query construction tips.

### 4. Calibrate evidence sufficiency

Label every claim (High / Medium / Low / Insufficient) before writing.
→ See `references/evidence-guide.md` for the calibration table.

### 5. Handle conflicting sources

Name both positions, note which is more recent, label your synthesis as inference.
→ See `references/evidence-guide.md` for the full protocol.

### 6. Report with explicit evidence boundaries

Every claim must be traceable: sourced fact, user-provided context, inference, or recommendation.

### 7. Assess recurrence

If the user will ask this again in 2–4 weeks, say so and recommend a monitoring path.
→ See `references/evidence-guide.md` for recurrence signals and setup options.

## Output Format

```text
## [Topic] — Research Summary

**Question type:** factual | comparison | enrichment | synthesis

**Evidence**
- [Source: <name/URL>, <date>] Fact stated here
- [User-provided] Context the user supplied

**Conflicting signals** (if any)
- [Source A] says X; [Source B] says Y. Source B is more recent (YYYY-MM).

**Inference**
- What follows from the evidence (labeled as inference)

**Recommendation**
- Answer or recommended next move
- Confidence: high / medium / low

**Freshness note**
- Data sourced from <date>. Recheck if more than [N weeks] old matters.

**Recurring?**
- Yes / No. If yes: suggest monitoring setup.
```

## Guardrails

- Never mix inference into sourced facts without labeling it
- Never give freshness-sensitive answers without dates
- Do not spin up `deep-research` for a question local docs can answer
- Do not ignore user-supplied evidence — it is the cheapest source
- Say "insufficient evidence" when that is the truth

## Verification Checklist

- [ ] Every claim has an evidence type label
- [ ] Freshness-sensitive claims include dates
- [ ] Conflicting sources are named, not averaged
- [ ] Confidence level matches the evidence actually gathered
- [ ] Recommendation derives from the evidence, not prior assumptions
