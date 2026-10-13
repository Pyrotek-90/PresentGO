import { guessLanguage } from './language'

// Song tags used by the editor (Details step) and the Song Library filters.
export const THEMES = ['Worship', 'Praise', 'Communion', 'Offering', 'Opening', 'Closing', 'Prayer', 'Salvation', 'Healing']

// Occasion songs are left out of the Song Library's default view.
export const OCCASIONS = ['Christmas', 'Easter', 'Good Friday', 'Baptism', 'Wedding', 'Funeral']

export const LANGUAGES = [
  'English', 'Hindi', 'Spanish', 'Portuguese', 'French', 'Tagalog', 'Indonesian', 'Swahili', 'German',
  'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Bengali', 'Punjabi', 'Gujarati', 'Urdu', 'Nepali', 'Marathi',
  'Korean', 'Chinese', 'Japanese', 'Arabic', 'Russian', 'Amharic',
]

export const DEFAULT_LIBRARY_LANGUAGE = 'English'

const isOccasion = t => OCCASIONS.some(o => o.toLowerCase() === String(t).toLowerCase())

// Themes saved before Occasions existed may include "Christmas" etc.; those count as occasions.
export const songThemes = song => (song?.metadata?.themes || []).filter(t => !isOccasion(t))
export const songOccasions = song => {
  const m = song?.metadata || {}
  const legacy = (m.themes || []).filter(isOccasion).map(t => OCCASIONS.find(o => o.toLowerCase() === t.toLowerCase()))
  return [...new Set([...(m.occasions || []), ...legacy])]
}
export const songLanguage = song => song?.metadata?.language || guessLanguage(song?.raw_lyrics) || 'English'
