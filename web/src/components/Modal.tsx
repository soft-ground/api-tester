import { useT } from '../i18n';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  tone?: 'warn' | 'normal';
}

export default function Modal({ title, onClose, children, tone = 'normal' }: Props) {
  const t = useT();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal ${tone === 'warn' ? 'modal-warn' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="mini" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
