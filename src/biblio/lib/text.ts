/** Minuscules, sans accents : pour comparer « Élodie » et « elodie ». */
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Identifiant d'un tag : « #Néon  Lights » et « neon lights » sont le même tag. */
export const tagKey = (name: string) => normalize(name).replace(/^#+/, '').replace(/\s+/g, ' ').trim()
