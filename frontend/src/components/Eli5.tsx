/** "Explain like I'm 5" callout. */
export function Eli5({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <div className="eli5">
      <span className="eli5-label">Like I'm 5</span>
      {children}
    </div>
  );
}
