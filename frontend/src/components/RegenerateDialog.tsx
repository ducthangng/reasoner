import { useCallback, useState } from "react";
import type { AiSettings } from "../types";
import { aiLabel } from "./ModelPicker";

export interface RegenerateRequest {
  instructions: string;
  password: string;
}

interface Pending {
  title: string;
  initialInstructions: string;
  resolve: (value: RegenerateRequest | null) => void;
}

const MAX = 4000;

/** Asks for optional extra instructions plus the analysis password. `ask()` resolves to null if cancelled. */
export function useRegenerateDialog(ai: AiSettings) {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback(
    (title: string, initialInstructions: string) =>
      new Promise<RegenerateRequest | null>((resolve) => setPending({ title, initialInstructions, resolve })),
    [],
  );

  const close = (value: RegenerateRequest | null) => {
    pending?.resolve(value);
    setPending(null);
  };

  const dialog = pending ? (
    <RegenerateDialog
      title={pending.title}
      initialInstructions={pending.initialInstructions}
      aiText={aiLabel(ai.model, ai.effort)}
      onDone={close}
    />
  ) : null;
  return { ask, dialog };
}

function RegenerateDialog({
  title,
  initialInstructions,
  aiText,
  onDone,
}: {
  title: string;
  initialInstructions: string;
  aiText: string;
  onDone: (value: RegenerateRequest | null) => void;
}) {
  const [instructions, setInstructions] = useState(initialInstructions);
  const [password, setPassword] = useState("");

  return (
    <div className="modal-backdrop" onMouseDown={() => onDone(null)}>
      <form
        className="modal wide"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
        onSubmit={(e) => {
          e.preventDefault();
          if (password) onDone({ instructions: instructions.trim(), password });
        }}
      >
        <h3>{title}</h3>
        <p className="muted small">
          Analyzes the paper again with <strong>{aiText}</strong> (change it in the top bar). The new analysis
          replaces the current one.
        </p>
        <label className="field-label" htmlFor="regen-instructions">
          Extra instructions <span className="muted">(optional)</span>
        </label>
        <textarea
          id="regen-instructions"
          autoFocus
          rows={5}
          maxLength={MAX}
          placeholder={
            'e.g. "Focus on the statistical methods and explain every equation in section 3" or "I already know deep learning basics, go deeper on the novel architecture"'
          }
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <div className="muted small right">
          {instructions.length}/{MAX}
        </div>
        <label className="field-label" htmlFor="regen-password">
          Password
        </label>
        <input
          id="regen-password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="modal-actions">
          <button type="button" className="link" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button className="primary" disabled={!password}>
            Regenerate
          </button>
        </div>
      </form>
    </div>
  );
}
