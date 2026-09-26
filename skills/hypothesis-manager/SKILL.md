---
name: hypothesis-manager
description: Manages hypothesis lifecycle — creation, evidence attachment, confidence updates, state transitions, and refinement
---

# Hypothesis Manager

You manage the lifecycle of scientific hypotheses throughout a research campaign. Hypotheses are the core scientific constructs that drive the research loop.

## Hypothesis Lifecycle

```
proposed → under_investigation → supported | refuted | inconclusive
                ↑                              │
                └──────── re-opened ───────────┘
```

### Valid State Transitions

| From | To | When |
|------|----|------|
| `proposed` | `under_investigation` | Campaign starts investigating |
| `under_investigation` | `supported` | Confidence > 0.8 with ≥ 3 supporting evidence |
| `under_investigation` | `refuted` | Confidence < 0.2 with ≥ 2 contradicting evidence |
| `under_investigation` | `inconclusive` | Budget exhausted or evidence insufficient |
| `supported` | `under_investigation` | New contradictory evidence found |
| `refuted` | `under_investigation` | Refutation was based on weak evidence |
| `inconclusive` | `under_investigation` | New data available for re-investigation |

## Evidence Weighting

When updating confidence, weight evidence by source type:

| Source Type | Weight | Rationale |
|-------------|--------|-----------|
| `literature` | 1.0 | Peer-reviewed, highest trust |
| `computational_prediction` | 0.6 | Useful but not validated |
| `model_hypothesis` | 0.3 | Agent reasoning, lowest trust |

### Confidence Calculation

```
weighted_for = Σ (type_weight × confidence) for supporting evidence
weighted_against = Σ (type_weight × confidence) for contradicting evidence
confidence = weighted_for / (weighted_for + weighted_against)
```

Clamped to [0.05, 0.95] — never express absolute certainty.

## Hypothesis Generation

When creating hypotheses from a research question:

1. **Decompose** the question into 2-5 testable claims
2. **Set initial confidence** to 0.5 (neutral — no evidence yet)
3. **Mark as `model_hypothesis`** — these are agent-generated
4. **Define evidence requirements** — what would support or refute each

Example for "Is EGFR a good target for NSCLC?":

```json
[
  {
    "statement": "EGFR is a validated therapeutic target in NSCLC with clinical evidence of efficacy",
    "evidence_type": "model_hypothesis",
    "initial_confidence": 0.5
  },
  {
    "statement": "Known EGFR inhibitors show favorable drug-likeness properties",
    "evidence_type": "model_hypothesis",
    "initial_confidence": 0.5
  },
  {
    "statement": "EGFR target structures are available with sufficient quality for computational study",
    "evidence_type": "model_hypothesis",
    "initial_confidence": 0.5
  }
]
```

## Hypothesis Refinement (Branching)

When a hypothesis is too broad, refine it into child hypotheses:

- **Parent**: "EGFR inhibitors are effective for NSCLC"
- **Child 1**: "First-generation EGFR TKIs are effective for exon 19 deletion mutants"
- **Child 2**: "Third-generation inhibitors overcome T790M resistance"

Children start at `parent_confidence × 0.8` (slightly lower).

## Belief Update Triggers

| Trigger | Typical Effect |
|---------|----------------|
| `evidence_added` | Adjust confidence toward supporting direction |
| `evidence_contradicted` | Adjust confidence toward contradicting direction |
| `experiment_completed` | Update based on experiment outputs |
| `critic_review` | Usually decreases confidence (adversarial) |
| `human_feedback` | Direct override if human sets confidence |
| `re_evaluation` | Periodic recalculation during re-planning |

## Rules
- EVERY confidence change must be logged with reasoning
- NEVER auto-transition to `supported` without ≥ 3 supporting evidence
- NEVER auto-transition to `refuted` without ≥ 2 contradicting evidence
- ALWAYS clamp confidence to [0.05, 0.95] — no absolute certainty
- Hypothesis refinement creates NEW hypotheses — it does NOT modify the parent
- Record the full evidence chain for reproducibility
