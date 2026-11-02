export type Status = "processing" | "ready" | "error";

export interface PaperSummary {
  id: string;
  filename: string;
  title: string | null;
  size_bytes: number;
  model: string;
  effort: Effort | null;
  /** Extra instructions used for the latest analysis. */
  instructions: string | null;
  status: Status;
  error: string | null;
  created_at: string;
}

export interface Method {
  name: string;
  kind: "proposed" | "existing" | "baseline" | "dataset" | "tool";
  what_it_is: string;
  used_for: string;
  how_it_works: string;
  eli5: string;
  pages: number[];
}

export interface ResearchQuestion {
  type: "hypothesis" | "research_question";
  statement: string;
  answer: string;
  eli5: string;
}

export interface Gap {
  type: "addressed" | "remaining";
  gap: string;
  eli5: string;
}

export interface Evaluation {
  setup: string;
  datasets: string[];
  metrics: string[];
  baselines: string[];
  findings: string[];
  validity: string;
  eli5: string;
}

export interface ConceptMethod {
  name: string;
  relation: "proposed" | "used" | "compared" | "related";
  summary: string;
}

export type ConceptCategory = "foundation" | "method" | "math" | "domain" | "tool" | "metric" | "result";

export type Relevance = "essential" | "important" | "helpful" | "peripheral";

export interface Concept {
  term: string;
  relevance: Relevance;
  relevance_reason: string;
  category: ConceptCategory;
  difficulty: "beginner" | "intermediate" | "advanced";
  short_definition: string;
  explanation: string;
  role_in_paper: string;
  /** Older analyses have an analogy instead of eli5, and no methods. */
  analogy?: string;
  eli5?: string;
  methods?: ConceptMethod[];
  prerequisites: string[];
  pages: number[];
}

export interface PaperAnalysis {
  title: string;
  authors: string[];
  year: string;
  venue: string;
  field: string;
  tldr: string;
  /** Fields below marked optional are missing from analyses made before they were added. */
  eli5?: string;
  summary: string;
  problem: string;
  research_questions?: ResearchQuestion[];
  gaps?: Gap[];
  key_contributions: string[];
  methodology: string;
  methods?: Method[];
  evaluation?: Evaluation;
  results: string;
  limitations: string[];
  reading_plan: string[];
  concepts: Concept[];
  /** Only in older analyses. */
  check_questions?: { question: string; answer: string }[];
}

export interface PaperDetail extends PaperSummary {
  analysis: PaperAnalysis | null;
}

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
}

export type Relation = "same" | "similar" | "extends" | "contrasts" | "prerequisite" | "applies" | "part_of";

export interface ConceptRef {
  paperId: string;
  concept: number;
}

export interface ComparisonLink {
  from: ConceptRef;
  to: ConceptRef;
  relation: Relation;
  strength: number;
  explanation: string;
}

export interface ComparisonResult {
  overview: string;
  shared_themes: string[];
  key_differences: string[];
  learning_path: string[];
  papers: {
    id: string;
    label: string;
    title: string;
    concepts: { term: string; relevance?: Relevance; category: ConceptCategory; short_definition: string }[];
  }[];
  links: ComparisonLink[];
}

export interface ComparisonSummary {
  id: string;
  paper_ids: string[];
  paper_titles?: string[];
  model: string;
  effort: Effort | null;
  status: Status;
  error: string | null;
  created_at: string;
}

export interface ComparisonDetail extends ComparisonSummary {
  result: ComparisonResult | null;
}

export type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AiSettings {
  model: string;
  /** null = let the model use its default reasoning effort */
  effort: Effort | null;
}

export interface ModelList {
  default: string;
  models: { id: string; note: string }[];
  efforts: Effort[];
  error?: string;
}
