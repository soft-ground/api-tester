import { useT } from '../i18n';

interface Props {
  title: string;
  milestone: string;
  desc: string;
}

// Screen skeleton only; filled in with real features at each milestone.
export default function Placeholder({ title, milestone, desc }: Props) {
  const t = useT();
  return (
    <div className="page">
      <header className="page-header">
        <h1>{title}</h1>
        <span className="ms-tag">{milestone}</span>
      </header>
      <p className="page-desc">{desc}</p>
      <div className="placeholder-box">
        {t('placeholder.notImplemented', { milestone })}
      </div>
    </div>
  );
}
