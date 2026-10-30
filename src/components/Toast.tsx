import { useEffect } from 'react';
import { useUiStore, type ToastItem } from '../stores/uiStore';
import { Icon } from './Icons';

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismiss = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), 4_600);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.id]);

  return (
    <div className={`toast toast--${toast.tone}`} role="status">
      <span className="toast__icon">
        <Icon name={toast.tone === 'error' ? 'x' : toast.tone === 'success' ? 'check' : 'hint'} size={16} />
      </span>
      <span className="toast__message">{toast.message}</span>
      <button className="toast__close" onClick={() => dismiss(toast.id)} aria-label="关闭提示">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useUiStore((state) => state.toasts);
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
