export function LoadingState({ label = '正在整理纸张…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-state__roller" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <p>{label}</p>
    </div>
  );
}
