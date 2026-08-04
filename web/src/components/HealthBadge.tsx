import { useEffect, useState } from 'react';
import { getHealth } from '../api/client';
import { useT } from '../i18n';

type State = 'checking' | 'ok' | 'degraded' | 'down';

export default function HealthBadge() {
  const t = useT();
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const h = await getHealth();
        if (alive) setState(h.status === 'ok' ? 'ok' : 'degraded');
      } catch {
        if (alive) setState('down');
      }
    };
    check();
    const t = setInterval(check, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const label: Record<State, string> = {
    checking: t('health.checking'),
    ok: t('health.ok'),
    degraded: t('health.degraded'),
    down: t('health.down'),
  };

  return (
    <span className={`health-badge health-${state}`}>
      <span className="dot" /> {label[state]}
    </span>
  );
}
