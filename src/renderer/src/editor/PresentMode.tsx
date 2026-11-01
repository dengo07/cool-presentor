import { useEffect, useState } from 'react'
import type { Scene } from '@core/scene'
import { SceneView } from '../preview/SceneView'
import { useStore } from '../store'
import { useUi } from '../ui'

/** Full-screen presenting with Morph-style animation between slides. */
export function PresentMode({ scenes, start }: { scenes: Scene[]; start: number }): React.JSX.Element {
  const [i, setI] = useState(start)
  const [vw, setVw] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [fadeKey, setFadeKey] = useState(0)
  const exit = (): void => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    useStore.getState().select(i)
    useUi.getState().present(null)
  }

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => undefined)
    const onResize = (): void => setVw({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const go = (d: number): void =>
      setI((cur) => {
        const n = Math.max(0, Math.min(scenes.length - 1, cur + d))
        if (n !== cur && scenes[n].transition !== 'morph') setFadeKey((k) => k + 1)
        return n
      })
    const key = (e: KeyboardEvent): void => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) go(1)
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) go(-1)
      else if (e.key === 'Home') setI(0)
      else if (e.key === 'End') setI(scenes.length - 1)
      else if (e.key === 'Escape') exit()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const width = Math.min(vw.w, (vw.h * 16) / 9)
  const scene = scenes[Math.min(i, scenes.length - 1)]
  return (
    <div className="present" onClick={() => setI((c) => Math.min(scenes.length - 1, c + 1))}>
      <div key={fadeKey} className={scene.transition === 'fade' ? 'fade-in' : ''}>
        <SceneView scene={scene} width={width} animate={scene.transition === 'morph'} className="present-slide" />
      </div>
      <div className="present-hud">
        {i + 1} / {scenes.length} · ← → to navigate · Esc to exit
      </div>
    </div>
  )
}
