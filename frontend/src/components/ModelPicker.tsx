import { useEffect, useState } from "react";
import { api } from "../api";

const STORAGE_KEY = "reasoner.model";
const CUSTOM = "__custom__";

export interface ModelChoice {
  model: string;
  setModel: (m: string) => void;
  available: string[];
  defaultModel: string;
  listError: string | null;
}

/** The selected OpenAI model, remembered in localStorage and validated against what the server's key can use. */
export function useModelChoice(): ModelChoice {
  const [model, setModelState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [available, setAvailable] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listModels()
      .then((list) => {
        setAvailable(list.models);
        setDefaultModel(list.default);
        setListError(list.error ?? null);
        setModelState((current) => current || list.default);
      })
      .catch((err) => setListError(err instanceof Error ? err.message : "Could not load models"));
  }, []);

  const setModel = (m: string) => {
    setModelState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  return { model: model || defaultModel, setModel, available, defaultModel, listError };
}

export function ModelPicker({ model, setModel, available, defaultModel, listError }: ModelChoice) {
  const options = [...new Set([defaultModel, ...available].filter(Boolean))];
  const isCustom = !!model && !options.includes(model);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
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
    );
  }

  return (
    <label className="model-picker" title={listError ?? "Model used for new analyses, maps and chat"}>
      <span className="muted small">Model</span>
      <select
        value={model}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setDraft(model);
            setEditing(true);
          } else {
            setModel(e.target.value);
          }
        }}
      >
        {isCustom && <option value={model}>{model}</option>}
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
            {m === defaultModel ? " (default)" : ""}
          </option>
        ))}
        <option value={CUSTOM}>Custom model id…</option>
      </select>
    </label>
  );
}
