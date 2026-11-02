import type { Status } from "../types";

export function StatusDot({ status }: { status: Status }) {
  return <span className={`status-dot ${status}`} title={status} />;
}
