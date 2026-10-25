// Recherche par contenu : préparation de la requête. Le modèle comprend surtout l'anglais : les mots français courants
// (couleurs, objets, matières, formes) sont traduits, les autres mots sont gardés tels quels. Logique « pure », testée.

import { normalize } from './text.ts'

const WORDS: Record<string, string> = {
  // couleurs
  rouge: 'red', rouges: 'red', bleu: 'blue', bleue: 'blue', bleus: 'blue', vert: 'green', verte: 'green', verts: 'green',
  jaune: 'yellow', jaunes: 'yellow', noir: 'black', noire: 'black', noirs: 'black', blanc: 'white', blanche: 'white', blancs: 'white',
  rose: 'pink', roses: 'pink', violet: 'purple', violette: 'purple', gris: 'gray', grise: 'gray', marron: 'brown', brun: 'brown',
  dore: 'gold', doree: 'gold', or: 'gold', argente: 'silver', argentee: 'silver', argent: 'silver', turquoise: 'turquoise', fluo: 'neon',
  // objets
  chaise: 'chair', chaises: 'chair', fauteuil: 'armchair', canape: 'sofa', table: 'table', lampe: 'lamp', lampes: 'lamp', montre: 'watch',
  montres: 'watch', chaussure: 'shoe', chaussures: 'shoes', basket: 'sneaker', baskets: 'sneakers', sac: 'bag', sacs: 'bag',
  veste: 'jacket', manteau: 'coat', pantalon: 'pants', jean: 'jeans', robe: 'dress', jupe: 'skirt', chemise: 'shirt', pull: 'sweater',
  sweat: 'sweatshirt', capuche: 'hoodie', casquette: 'cap', chapeau: 'hat', bonnet: 'beanie', echarpe: 'scarf', gants: 'gloves',
  bague: 'ring', bagues: 'ring', collier: 'necklace', bracelet: 'bracelet', boucle: 'earring', boucles: 'earrings', bijou: 'jewelry',
  bijoux: 'jewelry', voiture: 'car', moto: 'motorcycle', velo: 'bicycle', avion: 'airplane', bateau: 'boat', bouteille: 'bottle',
  tasse: 'cup', mug: 'mug', verre: 'glass', assiette: 'plate', bol: 'bowl', vase: 'vase', bougie: 'candle', miroir: 'mirror',
  fleur: 'flower', fleurs: 'flowers', plante: 'plant', arbre: 'tree', feuille: 'leaf', chat: 'cat', chien: 'dog', oiseau: 'bird',
  cheval: 'horse', poisson: 'fish', visage: 'face', portrait: 'portrait', main: 'hand', mains: 'hands', oeil: 'eye', yeux: 'eyes',
  bouche: 'mouth', tete: 'head', corps: 'body', batiment: 'building', maison: 'house', immeuble: 'apartment building', escalier: 'stairs',
  fenetre: 'window', porte: 'door', cuisine: 'kitchen', salon: 'living room', chambre: 'bedroom', livre: 'book', livres: 'books',
  affiche: 'poster', affiches: 'posters', logo: 'logo', robot: 'robot', casque: 'helmet', lunettes: 'glasses', masque: 'mask',
  telephone: 'phone', ordinateur: 'computer', clavier: 'keyboard', ecran: 'screen', appareil: 'camera', camera: 'camera',
  guitare: 'guitar', enceinte: 'speaker', jouet: 'toy', peluche: 'plush toy', statue: 'statue', sculpture: 'sculpture',
  couteau: 'knife', ciseaux: 'scissors', cle: 'key', horloge: 'clock', montagne: 'mountain', mer: 'sea', ciel: 'sky', nuage: 'cloud',
  paysage: 'landscape', ville: 'city', rue: 'street', foret: 'forest', desert: 'desert', neige: 'snow', feu: 'fire', eau: 'water',
  // nourriture
  gateau: 'cake', pain: 'bread', fromage: 'cheese', fruit: 'fruit', fruits: 'fruits', legume: 'vegetable', legumes: 'vegetables',
  pizza: 'pizza', cafe: 'coffee', the: 'tea', vin: 'wine', plat: 'dish of food', repas: 'meal',
  // formes, matières, styles
  rond: 'round', ronde: 'round', ronds: 'round', carre: 'square', carree: 'square', triangle: 'triangle', cercle: 'circle',
  spirale: 'spiral', etoile: 'star', coeur: 'heart', geometrique: 'geometric', abstrait: 'abstract', abstraite: 'abstract',
  organique: 'organic', metal: 'metal', metallique: 'metallic', bois: 'wood', verre_: 'glass', ceramique: 'ceramic', plastique: 'plastic',
  tissu: 'fabric', cuir: 'leather', pierre: 'stone', papier: 'paper', beton: 'concrete', marbre: 'marble', chrome: 'chrome',
  transparent: 'transparent', brillant: 'shiny', mat: 'matte', grand: 'large', grande: 'large', petit: 'small', petite: 'small',
  ancien: 'vintage', vieux: 'old', moderne: 'modern', futuriste: 'futuristic', minimaliste: 'minimalist', dessin: 'drawing',
  peinture: 'painting', illustration: 'illustration', photo: 'photo', video: 'video', typographie: 'typography', lettres: 'letters',
  texte: 'text', motif: 'pattern', rayures: 'stripes', pois: 'polka dots', damier: 'checkerboard', degrade: 'gradient',
  // mots qui relient
  et: 'and', avec: 'with', sans: 'without', de: '', du: '', des: '', la: '', le: '', les: '', un: '', une: '', en: '', sur: 'on',
}

// Les différentes écritures de « t-shirt » deviennent une seule.
const TSHIRT = /\b(?:t[\s-]?shirts?|tee[\s-]?shirts?|tees?|tshirts?)\b/gi

/** Le mot anglais d'un mot français, au singulier ou au féminin si besoin (« noires » → « black ») ; sinon le mot lui-même. */
function lookup(word: string): string {
  for (const w of [word, word.replace(/s$/, ''), word.replace(/es$/, ''), word.replace(/e$/, '')]) {
    if (Object.hasOwn(WORDS, w)) return WORDS[w]
  }
  return word
}

/** « Chaise rouge » → « chair red » : un mot à la fois, les mots inconnus restent. */
export function translateQuery(query: string): string {
  const withShirts = query.replace(TSHIRT, ' t-shirt ')
  const words = normalize(withShirts).split(/[^a-z0-9'-]+/).filter(Boolean)
  return words
    .map((w) => (w === 't-shirt' ? w : lookup(w)))
    .filter((w) => w !== '')
    .join(' ')
}

/** Trois formulations de la même requête : le modèle comprend mieux une phrase qu'un mot seul. Leurs empreintes sont moyennées. */
export function searchPrompts(query: string): string[] {
  const q = translateQuery(query)
  return q === '' ? [] : [q, `a photo of ${q}`, `a photo of a ${q}`]
}

/** Moins de deux lettres : trop court pour chercher par contenu. */
export const isSearchable = (query: string): boolean => translateQuery(query).replace(/[^a-z0-9]/g, '').length >= 2
