import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useT } from '../i18n';

// Modal dialog replacing native window.confirm/prompt/alert.
// OS popups cannot be translated and look inconsistent, so use a unified in-app modal.

type Kind = 'confirm' | 'prompt' | 'alert';

interface ConfirmOpts {
  message: string;
  title?: string;
  tone?: 'warn' | 'normal';
  confirmLabel?: string;
  cancelLabel?: string;
}
interface PromptOpts {
  message: string;
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}
interface AlertOpts {
  message: string;
  title?: string;
}

interface DialogState extends ConfirmOpts, PromptOpts {
  kind: Kind;
}

interface DialogApi {
  confirm: (o: ConfirmOpts | string) => Promise<boolean>;
  prompt: (o: PromptOpts | string) => Promise<string | null>;
  alert: (o: AlertOpts | string) => Promise<void>;
}

const Ctx = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [state, setState] = useState<DialogState | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((v: unknown) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback((s: DialogState): Promise<unknown> => {
    setState(s);
    setValue(s.defaultValue ?? '');
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((v: unknown) => {
    resolver.current?.(v);
    resolver.current = null;
    setState(null);
  }, []);

  const api = useRef<DialogApi>({
    confirm: (o) =>
      open({
        kind: 'confirm',
        ...(typeof o === 'string' ? { message: o } : o),
      }) as Promise<boolean>,
    prompt: (o) =>
      open({
        kind: 'prompt',
        ...(typeof o === 'string' ? { message: o } : o),
      }) as Promise<string | null>,
    alert: (o) =>
      open({
        kind: 'alert',
        ...(typeof o === 'string' ? { message: o } : o),
      }) as Promise<void>,
  }).current;

  // The confirm/cancel result value depends on the dialog type.
  const onConfirm = () =>
    settle(state?.kind === 'prompt' ? value : state?.kind === 'alert' ? undefined : true);
  const onCancel = () =>
    settle(state?.kind === 'prompt' ? null : state?.kind === 'alert' ? undefined : false);

  // Auto-focus the prompt input; Enter=confirm / Esc=cancel
  useEffect(() => {
    if (!state) return;
    if (state.kind === 'prompt') inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter' && state.kind !== 'prompt') onConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, value]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultTitle =
    state?.kind === 'alert'
      ? t('dialog.noticeTitle')
      : state?.kind === 'prompt'
        ? t('dialog.inputTitle')
        : t('dialog.confirmTitle');

  return (
    <Ctx.Provider value={api}>
      {children}
      {state && (
        <div className="modal-overlay" onClick={onCancel}>
          <div
            className={`modal ${state.tone === 'warn' ? 'modal-warn' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{state.title ?? defaultTitle}</h3>
              <button className="mini" onClick={onCancel}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="dialog-message">{state.message}</p>
              {state.kind === 'prompt' && (
                <input
                  ref={inputRef}
                  className="dialog-input"
                  value={value}
                  placeholder={state.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onConfirm();
                  }}
                />
              )}
            </div>
            <div className="modal-foot">
              {state.kind !== 'alert' && (
                <button className="btn-ghost" onClick={onCancel}>
                  {state.cancelLabel ?? t('common.cancel')}
                </button>
              )}
              <button className="btn" onClick={onConfirm}>
                {state.confirmLabel ?? t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useDialog(): DialogApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDialog must be used within DialogProvider');
  return c;
}
