> ⚠️ 本文档的中文翻译正在进行中。以下为英文原文。

# Analysis API

Base path: `/api/v1/projects/{project_id}/analysis`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/analysis/contradictions` | Detect contradictions across project papers |
| GET | `/projects/{id}/analysis/author-network` | Get author collaboration network |
| GET | `/projects/{id}/analysis/trends` | Get research trend analysis |
| POST | `/projects/{id}/analysis/gaps` | Detect literature gaps and research opportunities |
| GET | `/projects/{id}/analysis/impact-scores` | Get citation impact scores for papers |

## Contradictions

`POST /projects/{id}/analysis/contradictions` — Analyze all papers to find contradictory claims or findings using LLM.

**Response fields:**
- `contradictions[]` — Each with `paper_a_id`, `paper_a_title`, `paper_b_id`, `paper_b_title`, `claim`, `position_a`, `position_b`, `confidence`, `topic`
- `topics[]` — List of topics where contradictions were found
- `total_contradictions` — Count

Returns empty for projects with fewer than 2 papers.

## Author Network

`GET /projects/{id}/analysis/author-network` — Build a co-authorship collaboration graph.

**Query parameters:**
- `min_collaborations` (default: 1) — Minimum co-authorship count for an edge
- `max_nodes` (default: 100, max: 500) — Maximum author nodes to return

**Response fields:**
- `nodes[]` — Each with `name`, `paper_count`, `paper_ids`, `coauthors`, `h_index_estimate`
- `edges[]` — Each with `source`, `target`, `collaboration_count`
- `metrics` — `total_authors`, `total_edges`, `density`, `top_authors`

## Trends

`GET /projects/{id}/analysis/trends` — Analyze how research topics evolved over time.

**Response fields:**
- `publication_timeline[]` — Each with `year`, `count`, `citations`
- `topic_trends[]` — Each with `topic`, `slope`, `r_squared`, `trend`, `total_papers`, `yearly_counts`
- `emerging_topics[]` — Each with `topic`, `yoy_growth`
- `declining_topics[]` — Each with `topic`, `yoy_growth`
- `summary_stats` — `total_papers`, `year_span`, `first_year`, `last_year`, `total_topics`, `emerging_count`, `declining_count`

## Gap Analysis

`POST /projects/{id}/analysis/gaps` — Identify under-researched areas and generate research questions using LLM.

**Response fields:**
- `gaps[]` — Each with `topic`, `description`, `evidence`, `related_paper_ids`, `gap_score`
- `research_questions[]` — Each with `question`, `addresses_gap`, `novelty_score`, `feasibility_score`
- `summary` — `total_gaps`, `total_questions`

Returns empty for projects with fewer than 2 papers.

## Impact Scores

`GET /projects/{id}/analysis/impact-scores` — Compute Omelette Impact Score (0-100) for each paper.

**Response fields:**
- `scores[]` — Each with `paper_id`, `title`, `score`, `factors` (breakdown of score components)
- `total` — Number of scored papers
- `avg_score` — Average score across all papers
- `top_paper_id` — ID of the highest-scoring paper
