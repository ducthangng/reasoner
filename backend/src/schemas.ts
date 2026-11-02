import { z } from "zod";

export const RELEVANCE_TIERS = ["essential", "important", "helpful", "peripheral"] as const;

export const ConceptSchema = z.object({
  term: z.string().describe("The concept, term, method or idea as it is usually named"),
  relevance: z
    .enum(RELEVANCE_TIERS)
    .describe("How much a learner needs this concept to understand the paper"),
  relevance_reason: z.string().describe("One sentence on why this concept has this rank for this paper"),
  category: z
    .enum(["foundation", "method", "math", "domain", "tool", "metric", "result"])
    .describe("What kind of concept this is"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  short_definition: z.string().describe("One plain-language sentence a newcomer understands"),
  explanation: z
    .string()
    .describe("2-4 short paragraphs teaching the concept from scratch, building intuition first"),
  role_in_paper: z.string().describe("How and why this paper uses the concept"),
  analogy: z.string().describe("A concrete everyday analogy or example; empty string if none fits"),
  prerequisites: z
    .array(z.string())
    .describe("Terms (ideally other concepts in this list) a learner should know first"),
  pages: z.array(z.number()).describe("1-indexed PDF pages where the concept appears or is defined"),
});

const ELI5_HINT =
  "Explain it like I'm 5: 2-4 short sentences, simple everyday words, a concrete comparison from a child's world, no jargon";

export const MethodSchema = z.object({
  name: z.string().describe("The specific name of the method, model, algorithm, technique, dataset or tool"),
  kind: z
    .enum(["proposed", "existing", "baseline", "dataset", "tool"])
    .describe("proposed: introduced by this paper; existing: prior method the paper builds on or uses; baseline: compared against; dataset/tool: data or software used"),
  what_it_is: z.string().describe("A precise technical description of what it is"),
  used_for: z.string().describe("What this paper uses it for, and why this choice"),
  how_it_works: z
    .string()
    .describe("Step by step: inputs, the key steps or equations in words, outputs, important settings (markdown allowed)"),
  eli5: z.string().describe(ELI5_HINT),
  pages: z.array(z.number()).describe("1-indexed PDF pages where it is described or used"),
});

export const PaperAnalysisSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  year: z.string().describe("Publication year, or empty string if unknown"),
  venue: z.string().describe("Journal/conference/preprint server, or empty string if unknown"),
  field: z.string().describe("Research field and sub-field"),
  tldr: z.string().describe("One or two sentences: what the paper does and why it matters"),
  eli5: z.string().describe(`The whole paper, explained like I'm 5. ${ELI5_HINT}`),
  summary: z.string().describe("A 3-5 paragraph plain-language summary for a newcomer (markdown allowed)"),
  problem: z.string().describe("The problem the paper addresses and why it is hard"),
  research_questions: z
    .array(
      z.object({
        type: z.enum(["hypothesis", "research_question"]),
        statement: z.string().describe("The hypothesis or question, stated precisely as the paper frames it"),
        answer: z.string().describe("What the paper found about it: supported, refuted, or partially, with evidence"),
        eli5: z.string().describe(ELI5_HINT),
      }),
    )
    .describe("The paper's hypotheses and research questions, stated explicitly or clearly implied"),
  gaps: z
    .array(
      z.object({
        type: z
          .enum(["addressed", "remaining"])
          .describe("addressed: a gap in prior work this paper fills; remaining: a gap still open after this paper"),
        gap: z.string().describe("The gap, specifically: what was missing, unknown or not working, and in which prior work"),
        eli5: z.string().describe(ELI5_HINT),
      }),
    )
    .describe("Research gaps: first the ones this paper addresses, then the ones that remain open"),
  key_contributions: z.array(z.string()),
  methodology: z.string().describe("How the authors approach the problem: the overall pipeline, step by step"),
  methods: z
    .array(MethodSchema)
    .describe("Every specific named method, model, algorithm, technique, dataset and tool the paper proposes or relies on"),
  evaluation: z
    .object({
      setup: z.string().describe("How the authors test their claims: experimental design, procedure, conditions"),
      datasets: z.array(z.string()).describe("Datasets, benchmarks, participants or data sources, with sizes when given"),
      metrics: z.array(z.string()).describe("Each metric, with what it measures and whether higher or lower is better"),
      baselines: z.array(z.string()).describe("What the proposed approach is compared against"),
      findings: z.array(z.string()).describe("The key quantitative and qualitative results, with the actual numbers"),
      validity: z.string().describe("How convincing the evaluation is: strengths, weaknesses, threats to validity"),
      eli5: z.string().describe(ELI5_HINT),
    })
    .describe("How the paper evaluates its claims"),
  results: z.string().describe("The main findings, with key numbers where they help"),
  limitations: z.array(z.string()),
  reading_plan: z
    .array(z.string())
    .describe("Ordered steps for reading this paper as a beginner, naming sections and pages"),
  concepts: z
    .array(ConceptSchema)
    .describe("Every concept a learner needs, ranked from most to least relevant to understanding the paper"),
  check_questions: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .describe("5-8 self-check questions with answers to test understanding"),
});
export type PaperAnalysis = z.infer<typeof PaperAnalysisSchema>;

export const RelationEnum = z.enum([
  "same",
  "similar",
  "extends",
  "contrasts",
  "prerequisite",
  "applies",
  "part_of",
]);

export const ComparisonModelSchema = z.object({
  overview: z.string().describe("How these papers relate overall, 2-3 paragraphs (markdown allowed)"),
  shared_themes: z.array(z.string()),
  key_differences: z.array(z.string()),
  links: z.array(
    z.object({
      from: z.string().describe("Concept key from one paper, e.g. 'A.c3'"),
      to: z.string().describe("Concept key from a DIFFERENT paper, e.g. 'B.c7'"),
      relation: RelationEnum.describe(
        "same: identical idea under same/different name; similar: closely related; extends: 'from' is built on by 'to'; contrasts: competing/opposite approaches; prerequisite: 'from' is needed to understand 'to'; applies: 'to' applies 'from' to a new setting; part_of: 'from' is a component of 'to'",
      ),
      strength: z.number().describe("1 = loose connection, 2 = clear, 3 = essentially the same"),
      explanation: z.string().describe("1-3 sentences a learner can read to connect the dots"),
    }),
  ),
  learning_path: z
    .array(z.string())
    .describe("Suggested order for a learner to study these papers and concepts together"),
});
export type ComparisonModelOutput = z.infer<typeof ComparisonModelSchema>;
