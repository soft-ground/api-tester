import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import type { DesktopUpdateStatus } from '../desktop';

// Desktop-only: the Electron shell checks for updates in the background (no interruption, no
// native OS notification) and only tells us once there's something to act on.
//
// 'ready' (Windows only — see desktop/src/main.ts) means it's already downloaded and installs on
// restart: the button restarts immediately. 'manual' (macOS/Linux, which can't self-install a
// silent update here) just links to the releases page for a normal download. Either way the user
// picks the moment — closing the app also closes whatever they're in the middle of testing.
export default function DesktopUpdateBadge() {
  const t = useT();
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);

  useEffect(() => {
    if (!window.desktop) return;
    return window.desktop.onUpdateStatus(setStatus);
  }, []);

  if (!status) return null;

  const isReady = status.status === 'ready';
  return (
    <button
      className="update-badge"
      title={t(isReady ? 'update.readyTitle' : 'update.manualTitle', { version: status.version })}
      onClick={() =>
        isReady ? window.desktop?.restartToUpdate() : window.desktop?.openReleasesPage()
      }
    >
      <span className="dot" />{' '}
      {t(isReady ? 'update.readyBtn' : 'update.manualBtn', { version: status.version })}
    </button>
  );
}
