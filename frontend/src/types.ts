export type Status = "processing" | "ready" | "error";

export interface PaperSummary {
  id: string;
  filename: string;
  title: string | null;
  size_bytes: number;
  model: string;
  effort: Effort | null;
  status: Status;
  error: string | null;
  created_at: string;
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
  analogy: string;
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
  summary: string;
  problem: string;
  key_contributions: string[];
  methodology: string;
  results: string;
  limitations: string[];
  reading_plan: string[];
  concepts: Concept[];
  check_questions: { question: string; answer: string }[];
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
