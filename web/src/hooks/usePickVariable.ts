import { useState } from 'react';
import { VarName, getAvailableNames, setActiveEnvVariable } from '../api/client';
import { useT } from '../i18n';

// Shared hook that saves a response value as an active env variable and manages the toast.
// onNames: use when you want the latest variable list after saving (e.g. autocomplete refresh).
export function usePickVariable(onNames?: (names: VarName[]) => void) {
  const t = useT();
  const [toast, setToast] = useState<string | null>(null);

  const pick = async (name: string, value: string) => {
    try {
      await setActiveEnvVariable(name, value);
      if (onNames) {
        const fresh = await getAvailableNames().catch(() => null);
        if (fresh) onNames(fresh);
      }
      setToast(t('pick.saved', { name }));
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      setToast(e?.response?.data?.message || t('pick.saveFail'));
      setTimeout(() => setToast(null), 3500);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast(t('pick.copied'));
    } catch {
      setToast(t('pick.copyFail'));
    }
    setTimeout(() => setToast(null), 2000);
  };

  return { pick, copy, toast };
}
