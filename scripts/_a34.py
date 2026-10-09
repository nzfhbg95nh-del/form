def rd(p): return open(p, encoding='utf-8').read()
def wr(p, s): open(p, 'w', encoding='utf-8', newline='').write(s)
def sub(s, a, b):
    assert a in s, a
    return s.replace(a, b, 1)

p = 'src/lib/recipes.ts'
s = rd(p)
s = sub(s, "export const RECIPE_SORTS: { id: RecipeSort; label: string }[] = [\n  { id: 'name', label: 'Nom (A → Z)' },\n  { id: 'rating', label: 'Note (les mieux notées d\'abord)' },\n  { id: 'prep', label: 'Préparation (la plus courte d\'abord)' },\n  { id: 'difficulty', label: 'Difficulté (la plus facile d\'abord)' },\n]",
"export const RECIPE_SORTS: { id: RecipeSort; label: string }[] = [\n  { id: 'name', label: 'Nom' },\n  { id: 'rating', label: 'Note' },\n  { id: 'prep', label: 'Temps de préparation' },\n  { id: 'difficulty', label: 'Difficulté' },\n]")
s = sub(s, "sort: RecipeSort, nameOf: (r: T) => string): T[] {", "sort: RecipeSort, nameOf: (r: T) => string, descending = false): T[] {")
s = sub(s, "    if (sort === 'rating') { const m = /^r([1-5])$/.exec(String(v[RECIPE.rating] ?? '')); return m ? -Number(m[1]) : null }",
"    if (sort === 'rating') { const m = /^r([1-5])$/.exec(String(v[RECIPE.rating] ?? '')); return m ? Number(m[1]) : null }")
s = sub(s, "    if (a !== b) { if (a === null) return 1; if (b === null) return -1; return a - b }\n    return nameOf(x).localeCompare(nameOf(y), 'fr')",
"    const sign = descending ? -1 : 1\n    if (a !== b) { if (a === null) return 1; if (b === null) return -1; return (a - b) * sign }\n    return nameOf(x).localeCompare(nameOf(y), 'fr') * sign")
# note : ascendant = de la moins bonne à la meilleure ; par défaut la note se lit du meilleur au moins bon → géré côté vue
wr(p, s)

p = 'src/lib/recipes.test.ts'
s = rd(p)
s = sub(s, "toBe('CBA'))\n  it('par préparation", "toBe('ABC'.split('').reverse().join('')))\n  it('par préparation")
wr(p, s)
