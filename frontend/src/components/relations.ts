import type { Relation } from "../types";

export const RELATION_STYLE: Record<Relation, { label: string; verb: string; color: string; dash?: string }> = {
  same: { label: "Same idea", verb: "is the same as", color: "#2563eb" },
  similar: { label: "Similar", verb: "is similar to", color: "#0891b2" },
  extends: { label: "Builds on", verb: "is extended by", color: "#16a34a" },
  prerequisite: { label: "Prerequisite", verb: "is needed for", color: "#ca8a04" },
  applies: { label: "Applied in", verb: "is applied in", color: "#9333ea" },
  part_of: { label: "Part of", verb: "is part of", color: "#64748b" },
  contrasts: { label: "Contrasts", verb: "contrasts with", color: "#dc2626", dash: "6 4" },
};
