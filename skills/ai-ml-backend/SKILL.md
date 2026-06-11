---
name: ai-ml-backend
description: Python-first DSPy-centered AI/ML backend conventions for hybrid retrieval systems. Enforces sequential multi-stage pipelines, strict confidence gating, deterministic fallbacks, safe degradation, and telemetry-isolated production operations.
origin: project
version: 1.0.0
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

---

## Core Architecture

### Pipeline Discipline
Always structure backend reasoning and implementation as staged execution:
- **Input Processing / NER** → normalize and extract entities without mutating system state
- **Retrieval** → query authoritative knowledge sources using hybrid search
- **Candidate Scoring** → score candidates using ensemble methods
- **Selection** → rank with deterministic tie-breaking
- **Confidence Gating** → return result or abstain explicitly

Do not skip confidence gating.
Do not hide uncertainty.
Do not use freeform LLM memory as the source of truth for entity resolution.

### Canonical Stack
- **API layer:** FastAPI with strict Pydantic validation
- **Orchestration:** DSPy declarative pipelines
- **Retrieval:** hybrid dense + sparse search with GPU acceleration and CPU fallback
- **Input processing:** stateless parsing and hierarchical string decomposition
- **Observability:** OTLP-based telemetry, isolated from inference-critical logic
- **Infrastructure:** containerized services with separate API and worker roles

---

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

---

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

---

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

### Hardware Safety
GPU acceleration is an optimization, not a requirement.
If GPU initialization or search fails, fall back cleanly to CPU retrieval.
Do not fail the request solely because the accelerator path is unavailable.

---

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

---

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

Cache reuse across mismatched versions is a correctness bug.

### Observability Isolation
Telemetry or MLOps SDKs must not be allowed to destabilize inference dependencies.
Prefer OTLP-over-HTTP or similarly decoupled exporters so observability dependency trees stay isolated from the main serving path.

### Telemetry Fault Tolerance
Telemetry wrappers, decorators, and exporters must swallow export/connectivity failures.
Observability outages must never degrade core inference availability.

---

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

---

## Implementation Rules

- Prefer small, testable pipeline stages over large mixed-responsibility functions.
- Validate every request and response schema explicitly.
- Keep retrieval, scoring, and telemetry concerns separated.
- Make fallback paths observable and deterministic.
- Fail fast at system boundaries, but degrade safely inside the pipeline.
- Record enough metadata to explain why a result was selected or abstained.

---

## When Applying This Skill
Use this skill when working on:
- AI/ML backend services
- retrieval pipelines
- RAG and entity resolution systems
- DSPy orchestration
- inference APIs and workers
- confidence scoring / abstention design
- evaluation harnesses for retrieval or agent backends

Prefer these patterns unless the repository already defines a stronger local convention.
