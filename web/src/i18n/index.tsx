import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { DICTS, Lang } from './translations';

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

function detectInitial(): Lang {
  const saved = localStorage.getItem('lang') as Lang | null;
  if (saved === 'ko' || saved === 'en') return saved;
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'ko';
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitial);

  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nCtx>(() => {
    const dict = DICTS[lang];
    const t = (key: string, vars?: Record<string, string | number>) => {
      let s = dict[key] ?? DICTS.ko[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return s;
    };
    return { lang, setLang: setLangState, t };
  }, [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n must be used within LangProvider');
  return c;
}

// Convenience hook: when you only need the t function
export function useT() {
  return useI18n().t;
}
