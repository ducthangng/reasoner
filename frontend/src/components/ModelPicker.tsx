import { useEffect, useState } from "react";
import { api } from "../api";
import type { AiSettings, Effort } from "../types";

const MODEL_KEY = "reasoner.model";
const EFFORT_KEY = "reasoner.effort";
const CUSTOM = "__custom__";
const MODEL_DEFAULT_EFFORT = "default";

export const EFFORT_LABEL: Record<Effort, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

export interface AiChoice {
  ai: AiSettings;
  setModel: (m: string) => void;
  setEffort: (e: Effort | null) => void;
  available: string[];
  efforts: Effort[];
  defaultModel: string;
  listError: string | null;
}

/** The selected model and reasoning effort, remembered in localStorage. */
export function useAiSettings(): AiChoice {
  const [model, setModelState] = useState(() => localStorage.getItem(MODEL_KEY) ?? "");
  const [effort, setEffortState] = useState<Effort | null>(() => {
    const saved = localStorage.getItem(EFFORT_KEY);
    return saved === null ? "high" : saved === MODEL_DEFAULT_EFFORT ? null : (saved as Effort);
  });
  const [available, setAvailable] = useState<string[]>([]);
  const [efforts, setEfforts] = useState<Effort[]>(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
  const [defaultModel, setDefaultModel] = useState("");
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listModels()
      .then((list) => {
        setAvailable(list.models);
        setEfforts(list.efforts);
        setDefaultModel(list.default);
        setListError(list.error ?? null);
      })
      .catch((err) => setListError(err instanceof Error ? err.message : "Could not load models"));
  }, []);

  return {
    ai: { model: model || defaultModel, effort },
    setModel: (m) => {
      setModelState(m);
      localStorage.setItem(MODEL_KEY, m);
    },
    setEffort: (e) => {
      setEffortState(e);
      localStorage.setItem(EFFORT_KEY, e ?? MODEL_DEFAULT_EFFORT);
    },
    available,
    efforts,
    defaultModel,
    listError,
  };
}

/** Short label for a model + effort pair, e.g. "gpt-5.5 · High". */
export function aiLabel(model: string, effort: Effort | null): string {
  return effort ? `${model} · ${EFFORT_LABEL[effort]}` : model;
}

export function ModelPicker({ ai, setModel, setEffort, available, efforts, defaultModel, listError }: AiChoice) {
  const options = [...new Set([defaultModel, ...available].filter(Boolean))];
  const isCustom = !!ai.model && !options.includes(ai.model);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="model-picker">
      {editing ? (
        <form
          className="model-picker"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) setModel(draft.trim());
            setEditing(false);
          }}
        >
          <input autoFocus placeholder="Model id, e.g. gpt-5.5" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="link small" type="submit">
            Use
          </button>
          <button className="link small" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <label className="model-picker" title={listError ?? "Model used for new analyses, maps and chat"}>
          <span className="muted small">Model</span>
          <select
            value={ai.model}
            onChange={(e) => {
              if (e.target.value === CUSTOM) {
                setDraft(ai.model);
                setEditing(true);
              } else {
                setModel(e.target.value);
              }
            }}
          >
            {isCustom && <option value={ai.model}>{ai.model}</option>}
            {options.map((m) => (
              <option key={m} value={m}>
                {m}
                {m === defaultModel ? " (default)" : ""}
              </option>
            ))}
            <option value={CUSTOM}>Custom model id…</option>
          </select>
        </label>
      )}
      <label
        className="model-picker"
        title="Reasoning effort: how long the model thinks before answering. Higher is deeper but slower and more expensive. Not every model supports every level."
      >
        <span className="muted small">Mode</span>
        <select
          value={ai.effort ?? MODEL_DEFAULT_EFFORT}
          onChange={(e) => setEffort(e.target.value === MODEL_DEFAULT_EFFORT ? null : (e.target.value as Effort))}
        >
          <option value={MODEL_DEFAULT_EFFORT}>Model default</option>
          {efforts.map((level) => (
            <option key={level} value={level}>
              {EFFORT_LABEL[level] ?? level}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
