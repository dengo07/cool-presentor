import { useMemo } from 'react'
import { buildDeck } from '@core/layout/engine'
import type { Scene } from '@core/scene'
import { useStore } from '../store'
import { useUi } from '../ui'
import { canvasMeasurer } from './fonts'

/** Layout for the whole deck, recomputed when content or fonts change. */
export function useScenes(): Scene[] {
  const deck = useStore((s) => s.deck)
  const fontsReady = useUi((s) => s.fontsReady)
  return useMemo(() => buildDeck(deck, canvasMeasurer), [deck, fontsReady])
}
