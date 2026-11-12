import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { translate, type Lang, type TKey } from './i18n'

const LangContext = createContext<Lang>('ru')

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

/** Returns the active language and a translator function. */
export function useT() {
  const lang = useContext(LangContext)
  const t = useMemo(
    () => (key: TKey, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  )
  return { lang, t }
}
