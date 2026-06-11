---
name: ai-ml-backend
description: Python-first DSPy-centered AI/ML backend conventions for pipeline-first inference systems. Defines retrieval-first architecture, confidence gating, deterministic fallbacks, service topology, evaluation discipline, and links to related ECC backend skills.
origin: ECC
version: 1.1.0
---

# AI/ML Backend

Top-level architectural guidance for Python-first, DSPy-centered AI/ML backend systems.

Use this skill when the backend is a **bounded inference pipeline**, not a generic CRUD service.
The canonical shape is a **pipeline-first architecture**:

`extract -> retrieve -> score -> select -> gate`

The operational stance is **safety by abstention**:

- prefer explicit abstention over forced guesses
- prefer deterministic fallbacks over silent failure
- prefer safe degradation over brittle success
- prefer authoritative retrieval over parametric memory

## When to Activate

- Building or reviewing AI/ML backend services in Python
- Designing hybrid retrieval or entity-resolution systems
- Implementing DSPy or LLM orchestration in backend pipelines
- Structuring FastAPI inference services with workers, caches, and telemetry
- Designing confidence gating, abstention contracts, or fallback logic
- Reviewing evaluation harnesses for retrieval, classification, or agent backends

## Core Identity

Treat the system as a specialized inference service, not a monolithic model wrapper and not a CRUD-first backend.

The default execution path is staged:

1. input processing / extraction
2. retrieval
3. candidate scoring
4. deterministic selection
5. confidence gating

Do not collapse backend pipeline work into one opaque LLM call when the task belongs in a structured inference pipeline.

## Canonical Stack

| Domain | Standard |
|---|---|
| Runtime | Python 3.10+ |
| Service Layer | FastAPI + Pydantic v2 |
| Orchestration | DSPy or equivalent declarative LM pipeline |
| Dense Retrieval | Sentence transformers + FAISS or equivalent |
| Sparse Retrieval | BM25 or equivalent lexical search |
| Input Processing | Stateless parsing and bounded extraction |
| Tracing | OpenTelemetry / OTLP |
| Logging | Structured JSON logs |
| Tooling | pytest, mypy, ruff |
| Deployment | Docker, GPU-aware runtime, isolated api/worker services |

## Runtime and Service Topology

### Deployment Isolation

Separate the low-latency `api` inference path from background `worker` responsibilities such as:

- cache warmup
- indexing
- background materialization
- deferred exports
- heavy initialization tasks

Do not let frontend build concerns or worker warmup logic shape the primary inference latency path.

### Configuration Discipline

Drive model, provider, retrieval, and observability configuration through environment variables.
Do not mutate effective configuration at runtime.
Require restart or redeploy for environment changes.

### Initialization Order

Initialize telemetry and tracing before allocating model clients or retrieval resources so boot-time instrumentation is complete.

### Local Development

Prefer live source/data mounts for rapid iteration instead of forcing image rebuilds for every code or dataset change.

## Pipeline Architecture

### 1. Input Processing

Input processing must remain stateless and deterministic.

Rules:

- do not mutate model or KB state during parsing
- preserve meaningful prefixes, separators, and namespace context
- enforce bounded token/character windows
- define fallback order explicitly

Typical fallback chain:

1. structured extraction / NER
2. delimiter-aware chunking
3. single-item pass-through

### 2. Retrieval

Retrieval must ground against an authoritative knowledge source:

- versioned KB
- database-backed KB
- reproducible indexed corpus

Do not rely on LLM parameter memory for canonical IDs, entity existence, or production mapping.

#### Corpus Representation

Embed canonical terms as the dense retrieval substrate.
Keep synonyms, aliases, and variants as metadata sidecars for reranking and lexical scoring.
Do not dilute dense vectors by embedding synonym soup as the primary string.

#### Hybrid Retrieval

Use dense + sparse retrieval together by default.

Suggested baseline:

- 0.6 dense
- 0.4 sparse

Tune toward sparse for:

- short queries
- exact identifiers
- entity codes

Tune toward dense for:

- longer semantic descriptions
- paraphrased user intent

### 3. Scoring and Selection

Candidate scoring should operate over a bounded top-k set, not the full corpus.

Use ensemble or multi-head scoring when needed, but keep concurrency bounded.

Ranking hierarchy:

1. ensemble votes
2. LLM reasoning score
3. retrieval score

Tie-breaking must be deterministic.
Selection rationale must reference retrieval evidence, metadata, and agreement signals rather than freeform unsupported prose.

### 4. Confidence Gating

Confidence gating is mandatory.

If the system cannot support a confident result, return an explicit abstention payload.
Do not emit silent nulls.
Do not force guesses.

```json
{
  "status": "LOW_CONFIDENCE",
  "result": null,
  "rationale": "Weak retrieval evidence and insufficient ensemble agreement"
}
```

## API Contract Rules

- reject invalid input at the Pydantic boundary
- keep JSON payloads explicitly typed
- standardize casing deliberately, usually `snake_case` for Python APIs
- return arrays of typed prediction objects when one request expands into multiple items
- hard-bound string lengths, array sizes, and pagination windows

The frontend should remain a thin client against a rigid backend contract.

## Caching and Lifecycle Rules

Heavy resources may be cached in-process, but cache validity must be strict.

Invalidate embedding or retrieval caches on any mismatch in:

- model hash
- KB version
- canonical ordering
- runtime parameters that affect vector interpretation

Partial cache matches are correctness bugs.

## Observability and Persistence

Telemetry must be useful but non-critical.

Rules:

- emit structured traces and ranking metadata per prediction
- isolate observability dependency trees from serving-critical dependencies
- swallow exporter/connectivity failures
- never let telemetry outages degrade inference availability

For auditability, append-only file artifacts are acceptable for:

- review queues
- feedback streams
- trace snapshots
- JSONL/CSV evidence logs

Operational convention: containers serve; files preserve evidence.

## Hard-Fought Failure Modes

### GPU Concurrency Hazards

Unbounded concurrent FAISS or GPU-backed retrieval can crash the process.
Protect critical search sections with explicit locks and concurrency caps.

### Hardware Renumbering

CUDA device numbering drifts.
Map devices explicitly and fail over to CPU when GPU initialization fails.

### Lexical/Semantic Contamination

Do not inject domain synonym bags into canonical embedding targets.
Keep dense semantics and lexical alias scoring separate.

### Prompt Contamination Across Ensembles

Independent ensemble heads must be independently tracked.
Do not reuse contaminated reasoning state across prompt rollouts.
Assign unique execution IDs per head or vote stream.

### Hierarchy Before Guesswork

Inject domain constraints and ontology boundaries directly into selection context so the model cannot jump across impossible categories.

### Per-Item Trace IDs

When one request expands into many prediction items, generate correlation IDs per item, not just per request.

## Evaluation Discipline

Use a layered evaluation model:

- **L1** schema / contract correctness
- **L2** retrieval and classification precision
- **L3** trajectory / reasoning integrity
- **L4** end-to-end exact match and confidence behavior

Rules:

- train/test splits are immutable and deterministic
- holdouts remain protected in CI
- missing evaluator capability must emit `skipped` or `insufficient_data`
- never fabricate zeros to satisfy dashboards
- human review remains the final authority for gold labels
- new rerankers, prompt strategies, and fast paths stay off by default until controlled evaluation proves value

## Implementation Rules

- prefer small explicit pipeline stages over large mixed-responsibility functions
- keep retrieval, scoring, gating, and telemetry decoupled
- validate request and response contracts strictly
- make fallback paths deterministic and testable
- preserve enough metadata to explain every result or abstention
- fail fast at boundaries and degrade safely inside the pipeline

## How This Skill Relates to Other ECC Skills

This skill is the **architecture policy layer** for bounded inference backends.
Use it first, then apply specialized skills for implementation detail.

- **FastAPI patterns** for HTTP-layer construction, dependencies, auth boundaries, and app structure
- **Python patterns** for Pythonic implementation, typing, async, and packaging
- **Backend patterns** for service layering, caching, background jobs, and API discipline
- **Error handling** for stable exception contracts and retry boundaries

## Related Skills

- `fastapi-patterns`
- `python-patterns`
- `backend-patterns`
- `error-handling`
- `api-design`
- `ai-regression-testing`
- `eval-harness`
- `mle-workflow`

## See Also

- Skill: `skills/fastapi-patterns/SKILL.md`
- Skill: `skills/python-patterns/SKILL.md`
- Skill: `skills/backend-patterns/SKILL.md`
- Skill: `skills/error-handling/SKILL.md`
- Skill: `skills/ai-regression-testing/SKILL.md`
- Skill: `skills/eval-harness/SKILL.md`
