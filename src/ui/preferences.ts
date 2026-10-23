import type { SaveStorage } from '../game/save.ts'

export const TUTORIAL_KEY = 'guild-keeper.tutorial.v1'
export function tutorialSeen(storage: SaveStorage): boolean {
  try { return storage.getItem(TUTORIAL_KEY) === 'seen' } catch { return false }
}
export function rememberTutorial(storage: SaveStorage): boolean {
  try { storage.setItem(TUTORIAL_KEY, 'seen'); return true } catch { return false }
}
