import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { fr } from '../i18n/fr';

export function Dialog(props: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);
  return (
    <div class="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        data-testid={props.testId}
      >
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  );
}

/* ---- Confirmation dialog, usable from anywhere via `confirmDialog()` ---- */

interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

let pushRequest: ((r: ConfirmRequest) => void) | null = null;

export function confirmDialog(
  message: string,
  opts: { confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushRequest) return resolve(window.confirm(message));
    pushRequest({
      message,
      confirmLabel: opts.confirmLabel ?? fr.confirm,
      danger: opts.danger ?? false,
      resolve,
    });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  useEffect(() => {
    pushRequest = setReq;
    return () => {
      pushRequest = null;
    };
  }, []);
  if (!req) return null;
  const done = (ok: boolean) => {
    setReq(null);
    req.resolve(ok);
  };
  return (
    <Dialog title={fr.confirm} onClose={() => done(false)} testId="confirm-dialog">
      <p>{req.message}</p>
      <div class="row end">
        <button class="btn" onClick={() => done(false)}>
          {fr.cancel}
        </button>
        <button
          class={`btn ${req.danger ? 'danger' : 'primary'}`}
          onClick={() => done(true)}
          data-testid="confirm-ok"
        >
          {req.confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

/* ---- Toast ---- */

let pushToast: ((msg: string) => void) | null = null;

export function toast(message: string) {
  pushToast?.(message);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    pushToast = (m) => {
      setMsg(m);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2200);
    };
    return () => {
      pushToast = null;
      clearTimeout(timer);
    };
  }, []);
  return msg ? (
    <div class="toast" role="status" data-testid="toast">
      {msg}
    </div>
  ) : null;
}
