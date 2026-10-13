import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import type { DesktopUpdateStatus } from '../desktop';

const DISMISSED_KEY = 'updateCardDismissed';

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

// Desktop-only floating notice that an update is waiting. Rendered once at the app root (see
// main.tsx), outside both the sidebar and header layouts, so it looks and behaves the same
// whichever layout is active, whether the sidebar is collapsed, and across layout switches.
//
// The Electron shell checks GitHub Releases in the background and only tells us when there's
// something to act on:
//  - 'ready' (Windows): already downloaded; the button restarts and applies it.
//  - 'manual' (macOS/Linux, which can't self-install a silent update here): links to the releases
//    page for a normal download.
// The user picks the moment — closing the app also closes whatever they're in the middle of.
export default function DesktopUpdateCard() {
  const t = useT();
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;
    let alive = true;
    // The shell sends 'update:status' only once, so ask for the current value on mount too.
    desktop
      .getUpdateStatus()
      .then((s) => {
        if (alive && s) setStatus(s);
      })
      .catch(() => {});
    const off = desktop.onUpdateStatus((s) => setStatus(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!status || dismissed === status.version) return null;

  const ready = status.status === 'ready';
  const current = window.desktop?.version;
  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, status.version);
    } catch {
      /* storage blocked: just hide for this render session */
    }
    setDismissed(status.version);
  };

  return (
    <div className="update-card" role="status">
      <div className="update-card-head">
        <span className="dot" />
        <span className="update-card-title">
          {t(ready ? 'update.readyTitle' : 'update.manualTitle')}
        </span>
        <button
          className="update-card-close"
          onClick={dismiss}
          title={t('update.dismiss')}
          aria-label={t('update.dismiss')}
        >
          ×
        </button>
      </div>
      <div className="update-card-version">
        {current && current !== status.version ? `v${current} → v${status.version}` : `v${status.version}`}
      </div>
      <button
        className="update-card-action"
        onClick={() =>
          ready ? window.desktop?.restartToUpdate() : window.desktop?.openReleasesPage()
        }
      >
        {t(ready ? 'update.readyAction' : 'update.manualAction')}
      </button>
    </div>
  );
}
