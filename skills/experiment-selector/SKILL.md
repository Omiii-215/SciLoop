---
name: experiment-selector
description: Selects the highest-value next experiment based on scientific uncertainty, relevance, and budget
---

# Experiment Selector

You choose the next computational experiment to run based on what would most advance the research campaign. You do NOT follow a fixed pipeline — you evaluate the current state and pick the experiment that maximizes scientific value.

## When to Activate

The experiment selector runs after EVERY experiment completes. It evaluates the updated belief state and decides what to do next.

## Selection Criteria

Score each candidate experiment on these dimensions:

| Dimension | Weight | What it Measures |
|-----------|--------|------------------|
| **Uncertainty reduction** | 30% | How much this experiment reduces unknowns |
| **Relevance** | 25% | How relevant to unresolved hypotheses |
| **Novelty** | 20% | Whether this brings new types of evidence |
| **Cost efficiency** | 15% | Information gain per API call |
| **Context boost** | 10% | Situational urgency |

## Available Experiments

| Experiment Type | Cost | Produces | Prerequisites |
|-----------------|------|----------|---------------|
| `literature_search` | Low | Evidence | None |
| `target_assessment` | Medium | Evidence | None |
| `structure_retrieval` | Medium | Evidence | target_assessment |
| `compound_search` | Medium | Candidates | target_assessment |
| `molecular_filtering` | High | Candidates | compound_search |
| `molecular_scoring` | High | Candidates | molecular_filtering |
| `scientific_critique` | Medium | Evidence | literature_search |
| `contradiction_search` | Low | Evidence | literature_search |
| `hypothesis_generation` | Low | Hypotheses | None |
| `re_planning` | Low | Plan | None |

## Context-Aware Boosts

Apply these boosts to the selection score:

- **No evidence yet?** → Boost `literature_search` (+0.5)
- **Candidates exist but no criticism?** → Boost `scientific_critique` (+0.4)
- **Hypothesis confidence 0.4-0.6?** → Boost `contradiction_search` (+0.3)
- **All hypotheses resolved?** → Boost `report_generation` (+0.5)

## Decision Process

```
1. Get current campaign state
2. List all experiments with prerequisites met
3. Filter by budget constraints and tool permissions
4. Score each candidate experiment
5. Select the highest-scoring experiment
6. Log reasoning and alternatives considered
7. Return the selected experiment
```

## Output Format

```json
{
  "selected_experiment": "scientific_critique",
  "score": 0.745,
  "reasoning": "Candidates scored but no criticism yet. Contradiction search would most reduce uncertainty.",
  "alternatives": [
    { "type": "contradiction_search", "score": 0.680 },
    { "type": "re_planning", "score": 0.420 }
  ]
}
```

## Rules
- NEVER skip the criticism step — if it hasn't run, prioritize it
- NEVER run the same experiment type twice in one iteration without new inputs
- ALWAYS check budget before selecting an experiment
- ALWAYS log why the selected experiment was chosen over alternatives
- If no experiments are available, recommend moving to report generation
