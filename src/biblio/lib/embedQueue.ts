/**
 * À la fin d'une analyse d'IA : faut-il en relancer une tout de suite ?
 * Oui si de nouvelles images sont arrivées pendant l'analyse (`requested`) et qu'il reste des images à faire
 * autres que celles qui n'ont pas pu être lues (`failed`) : sinon on tournerait en rond sur des images illisibles.
 */
export function shouldEmbedAgain(p: { requested: boolean; pending: number; failed: number }): boolean {
  return p.requested && p.pending > p.failed
}
