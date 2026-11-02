import { useCallback, useRef, useState } from "react";

interface Pending {
  message: string;
  resolve: (password: string | null) => void;
}

/** Asks for the analysis password in a modal. `ask()` resolves to the password, or null if cancelled. */
export function usePasswordPrompt() {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback(
    (message: string) => new Promise<string | null>((resolve) => setPending({ message, resolve })),
    [],
  );

  const close = (value: string | null) => {
    pending?.resolve(value);
    setPending(null);
  };

  const dialog = pending ? <PasswordDialog message={pending.message} onDone={close} /> : null;
  return { ask, dialog };
}

function PasswordDialog({ message, onDone }: { message: string; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="modal-backdrop" onMouseDown={() => onDone(null)}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onDone(value);
          else input.current?.focus();
        }}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
      >
        <h3>Password required</h3>
        <p className="muted">{message}</p>
        <input
          ref={input}
          autoFocus
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="modal-actions">
          <button type="button" className="link" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button className="primary" disabled={!value}>
            Start analysis
          </button>
        </div>
      </form>
    </div>
  );
}
