import { useMemo } from 'react';
import { useT } from '../i18n';

// Simple JSON syntax highlighting. Falls back to the raw text if parsing fails.
function highlight(json: string): string {
  const esc = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'j-num';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'j-key' : 'j-str';
      } else if (/true|false/.test(match)) {
        cls = 'j-bool';
      } else if (/null/.test(match)) {
        cls = 'j-null';
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

interface Props {
  raw: string | null;
  pretty: boolean;
}

export default function JsonView({ raw, pretty }: Props) {
  const t = useT();
  const { html, isJson } = useMemo(() => {
    if (raw == null || raw === '') return { html: '', isJson: false };
    try {
      const parsed = JSON.parse(raw);
      const text = pretty ? JSON.stringify(parsed, null, 2) : raw;
      return { html: highlight(text), isJson: true };
    } catch {
      return { html: null, isJson: false };
    }
  }, [raw, pretty]);

  if (raw == null || raw === '') {
    return <div className="body-empty">{t('json.empty')}</div>;
  }
  if (!isJson || html == null) {
    return <pre className="code-block">{raw}</pre>;
  }
  return (
    <pre className="code-block" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
