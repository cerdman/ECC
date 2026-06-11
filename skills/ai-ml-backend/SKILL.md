---
name: ai-ml-backend
description: Python-first DSPy-centered AI/ML backend conventions for hybrid retrieval systems. Enforces sequential multi-stage pipelines, strict confidence gating, deterministic fallbacks, safe degradation, and telemetry-isolated production operations.
origin: ECC
version: 1.2.0
---

# ai-ml-backend — Agentic AI/ML Backend Architecture & Conventions

You are a **Python-first, DSPy-centered AI/ML backend** operating a **hybrid retrieval + ensemble encoder** architecture.
Treat the system as a **sequential multi-stage pipeline**:

1. Input processing / entity extraction
2. Retrieval
3. Candidate scoring
4. Selection
5. Confidence gating

Never collapse this into a single monolithic model call when the task belongs in the backend pipeline.

Your primary directive is **operational safety**:
- prefer safe degradation over brittle behavior
- prefer explicit abstention over forced guesses
- prefer deterministic fallbacks over silent failure
- never hallucinate success when confidence is low

## When to Activate

- Building or reviewing AI/ML backend services in Python
- Designing hybrid retrieval or entity-resolution systems
- Implementing DSPy or LLM orchestration in backend pipelines
- Structuring FastAPI inference services with workers, caches, and telemetry
- Designing confidence gating, abstention contracts, or fallback logic
- Reviewing evaluation harnesses for retrieval, classification, or agent backends

## Core Architecture

### Pipeline Discipline
Always structure backend reasoning and implementation as staged execution:
- **Input Processing / NER** -> normalize and extract entities without mutating system state
- **Retrieval** -> query authoritative knowledge sources using hybrid search
- **Candidate Scoring** -> score candidates using ensemble methods
- **Selection** -> rank with deterministic tie-breaking
- **Confidence Gating** -> return result or abstain explicitly

Do not skip confidence gating.
Do not hide uncertainty.
Do not use freeform LLM memory as the source of truth for entity resolution.

### Specialized Inference Service Identity
The backend is a specialized FastAPI inference service, not a CRUD-first application.
It blends deterministic retrieval (vector + lexical) with LLM-based adjudication.
System design should prioritize auditable execution traces, pipeline metadata, and manual-review safety over opaque final answers.

Human-in-the-loop workflows such as feedback intake and manual review queues are first-class API boundaries.
The frontend should remain a thin client against a rigid, typed backend contract.
Authentication and authorization logic may exist in the broader system, but should remain cleanly separated from the inference routing contract.

### Canonical Stack
- **API layer:** FastAPI with strict Pydantic validation
- **Orchestration:** DSPy declarative pipelines
- **Retrieval:** hybrid dense + sparse search with GPU acceleration and CPU fallback
- **Input processing:** stateless parsing and hierarchical string decomposition
- **Observability:** OTLP-based telemetry, isolated from inference-critical logic
- **Infrastructure:** containerized services with separate API and worker roles
- **Logging:** structured machine-readable logs
- **Tooling:** pytest, mypy, ruff

## Runtime & Service Topology

### Service Separation
Keep the low-latency `api` inference path isolated from the `worker` cache warmup / indexing / initialization path.
Do not couple core ML inference behavior to frontend build or UI concerns.

### Configuration
Treat environment variables as the only source of runtime configuration for:
- model selection
- provider settings
- retrieval/index settings
- observability endpoints
- feature flags

Do not mutate config at runtime.
Require process or container restart for environment changes.

### Initialization Order
Initialize telemetry and tracing **before** allocating language model clients or retrieval resources.
Instrumentation must span the entire boot sequence.

### Local Iteration
Prefer live source and data mounts during local development so engineers can iterate without rebuilding containers for every code or dataset change.

### Deployment & Lifecycle
Service topology may separate `api`, background `worker` processes, and client proxying.
Prefer deterministic application boot through a factory pattern such as `uvicorn path:create_app --factory`.
Heavy ML dependencies should initialize inside protected, module-scoped singletons or equivalent lifecycle-managed containers.

If the system exposes streaming routes such as SSE, isolate blocking encode/search work into thread-pool or worker execution so the async event loop stays responsive.
Where required by infrastructure, set anti-buffering headers such as `X-Accel-Buffering: no` so streaming responses flush immediately.

## Input Processing & Parsing

### Stateless Parsers
Input processors must be pure and stateless.
Never mutate model state, caches, or KB state during parsing.

### Deterministic Fallback Chain
When extraction is uncertain, use an explicit fallback sequence:
1. standard structured extraction
2. delimited chunking / hierarchical splitting
3. single-term pass-through

Fallback behavior must be deterministic and testable.

### Conservative Decomposition
Preserve meaningful prefixes, namespace context, and metadata when splitting compound user inputs.
Do not over-normalize away information that may affect retrieval quality.

Delimiters and extraction logic should be bounded by token or character limits to avoid resource exhaustion.

## Knowledge Base & Retrieval

### Source of Truth
All entity resolution must ground against a database-backed or strictly versioned knowledge base.
Do not rely on parametric model memory for canonical IDs, aliases, or production entity lookup.

### Corpus Representation
Index canonical terms as primary retrieval units.
Store synonyms and aliases as metadata to improve contextual scoring, but do not let alias expansion dilute canonical embeddings.

### Hybrid Search
Use hybrid retrieval by default:
- dense / semantic retrieval for conceptual relevance
- sparse / lexical retrieval for exactness and rare identifiers

Start with embedding-heavy fusion such as:
- **0.6 dense / 0.4 sparse**

Then adapt weights based on query shape:
- favor sparse more for short or exact-entity queries
- favor dense more for longer semantic queries

### Retrieval Constraints
Knowledge Base entity targets should be embedded cleanly to prevent synonym dilution in dense vector space.
Lexical variations and aliases belong in metadata sidecars for reranking, not in the primary embedding target string.

Embedding caches must map against a composite hash of model version, KB version, and relevant runtime parameters.
Any mismatch must force rebuild rather than silent reuse.

### Hardware Safety
GPU acceleration is an optimization, not a requirement.
If GPU initialization or search fails, fall back cleanly to CPU retrieval.
Do not fail the request solely because the accelerator path is unavailable.

## Scoring, Selection & Confidence Gating

### Ensemble Execution
Run multiple scoring heads concurrently only within explicit concurrency limits.
Protect shared retrieval/index resources from unbounded parallel access.

### Deterministic Ranking
Apply this ranking hierarchy strictly:
1. **Ensemble votes**
2. **LLM reasoning score**
3. **Retrieval score**

Tie-breaking must be deterministic.
Repeated identical requests should produce identical ordering when inputs and indexes are unchanged.

### Traceable Rationale
Selection justifications must reference:
- ensemble agreement
- retrieved evidence
- candidate metadata
- confidence thresholds

Do not invent freeform rationales that are unsupported by retrieval or scoring artifacts.

### Canonical Cross-Validation
Extracted string entities must be cross-validated against the canonical KB.
The agent must never synthesize valid-looking but non-existent target identifiers or codes.

Where deterministic retrieval metrics exceed high-confidence thresholds, it is acceptable to bypass unnecessary LLM adjudication entirely.

### Low-Confidence Contract
If confidence is below threshold, return an explicit abstention payload such as:

```json
{
  "status": "LOW_CONFIDENCE",
  "result": null,
  "rationale": "Insufficient ensemble agreement and weak retrieval evidence"
}
```

Never return silent nulls.
Never force a best guess when the system should abstain.

## API Contract Boundaries

- **Validation Dominance:** Reject empty, blank, malformed, or structurally invalid requests at the Pydantic boundary to avoid wasting GPU/LLM cycles.
- **Casing Serialization:** Standardize API payloads on `snake_case` unless a stronger local contract already exists.
- **Discrete Targeting:** If one request expands into multiple extracted items, return discrete typed prediction objects for each item.
- **Limits:** Bind maximum array sizes, text lengths, and pagination windows in schema definitions.

## Observability & Persistence

### Telemetry Requirements
Telemetry must be useful but non-critical.
Capture ranking order, similarity scores, metadata context, prompt traces where appropriate, and execution evidence for each prediction.

### Observability Isolation
Telemetry or MLOps SDKs must not be allowed to destabilize inference dependencies.
Prefer OTLP-over-HTTP or similarly decoupled exporters so observability dependency trees stay isolated from the main serving path.

### Telemetry Fault Tolerance
Telemetry wrappers, decorators, and exporters must swallow export/connectivity failures.
Observability outages must never degrade core inference availability.

### Artifact Storage
Operational artifacts such as review queues, feedback logs, and trace streams may be stored in append-only filesystem formats such as CSV or JSONL when that improves forensic auditability.

Operational convention: **containers for serving, files for evidence**.

### Hardware Health
Startup logic should validate expected hardware availability and configured accelerator limits before advertising ready status to load balancers or orchestrators.

## Hard-Fought Failure Modes

### GPU Concurrency Hazards
Unbounded concurrent retrieval against GPU-backed indexes can crash the process.
Serialize critical FAISS or GPU index search sections with async locks or thread locks where needed.

### CUDA Device Drift
Do not assume stable CUDA-visible device numbering.
Implement explicit device mapping and automatic CPU fallback if the configured GPU is unavailable.

### Cache Invalidation
Invalidate dense vector caches immediately when any of these change:
- KB version
- embedding model hash
- canonical ID ordering
- runtime retrieval parameters that affect vector semantics

Cache reuse across mismatched versions is a correctness bug.

### Lexical and Semantic Segregation
Do not pollute dense embedding vectors by injecting domain synonyms directly into the target string.
Embed primary targets purely for spatial semantics, and retain synonyms strictly for parallel lexical scoring operations.

### File-System Auditability
Append-only plain-text or structured artifact storage is often preferable to premature database complexity when preserving adjudication evidence and manual-review traces.

### Opaque Prompt Isolation
Multi-vote LLM ensembles inherently leak contextual contamination if reasoning states are shared or aggressively cached.
Isolate and uniquely track every independent prompt rollout execution.

### Hierarchy Dominates Guesswork
Inject domain ontology or category hierarchy constraints directly into retrieval/scoring context so the system does not make illogical cross-category jumps.

### UUID Correlation Tracing
Spawn distinct correlation IDs for each prediction item, not only per request, so array-expanded outputs remain traceable across asynchronous flows.

## Evaluation Discipline

### L1–L4 Altitude Model
Stratify evaluation across four levels:
- **L1:** schema and contract correctness
- **L2:** retrieval and classification precision
- **L3:** trajectory / reasoning integrity
- **L4:** end-to-end exact match with stratified confidence analysis

### Data Leakage Prevention
Use immutable, deterministic train/test splits.
Holdout datasets must remain protected by CI and never be mutated casually.

### Honest Missingness
If an evaluator lacks data or capability, emit:
- `skipped`, or
- `insufficient_data`

Do not fabricate zeros.
Do not silently omit missing metrics.

### Human-in-the-Loop Priority
Human review is the final authority for gold labels and production evaluation decisions.
Model-generated evaluations may assist, but must not automatically rewrite canonical gold datasets.

### Experimental Containment
New rerankers, prompt strategies, reasoning loops, and fast paths must be off by default.
Promote only after controlled evaluation or A/B testing against canonical baselines.

## Implementation Rules

- Prefer small, testable pipeline stages over large mixed-responsibility functions.
- Validate every request and response schema explicitly.
- Keep retrieval, scoring, gating, and telemetry concerns separated.
- Make fallback paths observable and deterministic.
- Fail fast at system boundaries, but degrade safely inside the pipeline.
- Record enough metadata to explain why a result was selected or abstained.

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
