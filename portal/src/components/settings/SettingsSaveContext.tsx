import { createContext, useContext, useEffect } from 'react'

/**
 * Lets the active settings panel publish its "unsaved changes" state and
 * save/reset handlers up to the page header, so a single global
 * "Сбросить / Сохранить изменения" control can drive the current form
 * (as on the reference design).
 */
export type SettingsSaveState = {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
}

type Ctx = {
  state: SettingsSaveState | null
  setState: (state: SettingsSaveState | null) => void
}

export const SettingsSaveContext = createContext<Ctx>({
  state: null,
  setState: () => undefined,
})

/** Publish the current panel's save state to the page header. */
export function useRegisterSettingsSave(state: SettingsSaveState) {
  const { setState } = useContext(SettingsSaveContext)
  const { dirty, saving, onSave, onReset } = state

  useEffect(() => {
    setState({ dirty, saving, onSave, onReset })
    return () => setState(null)
  }, [dirty, saving, onSave, onReset, setState])
}
