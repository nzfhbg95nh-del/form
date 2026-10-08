def rd(p):
    return open(p, encoding='utf-8').read()


def wr(p, s):
    open(p, 'w', encoding='utf-8', newline='').write(s)


def sub(p, a, b):
    s = rd(p)
    assert a in s, (p, a)
    wr(p, s.replace(a, b, 1))


# ---- schéma : nouveau genre de base
p = 'src/lib/database.ts'
sub(p, "  kind?: 'tasks' | 'mail' | 'agenda'\n}", "  kind?: 'tasks' | 'mail' | 'agenda' | 'recipes'\n}")
sub(p, "  return kind === 'mail' || kind === 'agenda'\n", "  return kind === 'mail' || kind === 'agenda' || kind === 'recipes'\n")
sub(p, "/** Bases « système » : le courrier (propre entrée dans « Mon entreprise ») et l'agenda du calendrier d'accueil. Elles n'apparaissent pas dans les pages. */",
    "/** Bases « système » : le courrier, l'agenda du calendrier d'accueil et les recettes (chacune a sa propre entrée). Elles n'apparaissent pas dans les pages. */")

# ---- store
p = 'src/store/app.ts'
sub(p, "  createRecipePage(recipe: Recipe): Promise<void>\n", "  /** Range la recette lue par l'assistant dans la base « Recettes » et l'ouvre. */\n  createRecipePage(recipe: Recipe): Promise<void>\n  /** Ouvre la base « Recettes » (la crée au premier usage). */\n  openRecipes(): Promise<void>\n  /** Nouvelle recette vide dans la base « Recettes », ouverte aussitôt. */\n  addRecipe(): Promise<void>\n")
s = rd(p)
a = s.index("  async createRecipePage(recipe) {")
b = s.index("  async ", a + 10)
new_block = """  async openRecipes() {
    const db = await ensureRecipesDb(get, set)
    if (db) get().select(db.id)
  },

  async addRecipe() {
    await addRecipeRow(get, set, {})
  },

  async createRecipePage(recipe) {
    await addRecipeRow(get, set, { title: recipe.title, values: recipeValues(recipe), content: recipeBodyBlocks(recipe) })
  },

"""
s = s[:a] + new_block + s[b:]
wr(p, s)

# createRow : une ligne ajoutée dans « Recettes » reçoit le modèle de recette et s'ouvre
sub(p, """    const row = await repo.createPage(databaseId, 'row', JSON.stringify(values ?? {}))
    set((s) => ({ objects: [...s.objects, row] }))
  },""", """    const db = get().objects.find((o) => o.id === databaseId)
    if (db && parseSchema(db.properties).kind === 'recipes') {
      await addRecipeRow(get, set, { values })
      return
    }
    const row = await repo.createPage(databaseId, 'row', JSON.stringify(values ?? {}))
    set((s) => ({ objects: [...s.objects, row] }))
  },""")

# modèle « Recette » du menu : même chose que « nouvelle recette »
sub(p, """    const tpl = PAGE_TEMPLATES.find((t) => t.id === templateId)
    if (!repo || !tpl) return
""", """    const tpl = PAGE_TEMPLATES.find((t) => t.id === templateId)
    if (!repo || !tpl) return
    if (templateId === 'recette') return get().addRecipe()
""")

# fonctions d'aide, avant « export const useApp »
s = rd(p)
marker = "export const useApp"
assert marker in s
helpers = """/** La base « Recettes » (créée au premier usage). */
async function ensureRecipesDb(get: () => AppState, set: SetFn): Promise<ObjectRow | null> {
  const repo = get().repo
  if (!repo) return null
  const existing = get().objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'recipes')
  if (existing) return existing
  const created = await repo.createPage(null, 'database', JSON.stringify(recipesSchema()))
  const patch = { title: 'Recettes', icon: '🍳' }
  await repo.updateObject(created.id, patch)
  const db = { ...created, ...patch }
  set((s) => ({ objects: [...s.objects, db] }))
  return db
}

/** Ajoute une recette (modèle vide si rien n'est fourni) dans la base « Recettes » et l'ouvre. */
async function addRecipeRow(get: () => AppState, set: SetFn, input: { title?: string; values?: Record<string, unknown>; content?: unknown[] }) {
  const repo = get().repo
  const db = await ensureRecipesDb(get, set)
  if (!repo || !db) return
  const row = await repo.createPage(db.id, 'row', JSON.stringify(input.values ?? {}))
  const patch = { title: input.title ?? 'Nouvelle recette', icon: '🍳', content: JSON.stringify(input.content ?? emptyRecipeBlocks()) }
  await repo.updateObject(row.id, patch)
  set((s) => ({ objects: [...s.objects, { ...row, ...patch }] }))
  get().select(row.id)
}

"""
s = s.replace(marker, helpers + marker, 1)
s = s.replace("import { recipeBlocks, type AiMode, type AiTask, type Recipe } from '@/lib/ai'", "import { emptyRecipeBlocks, recipeBodyBlocks, recipesSchema, recipeValues } from '@/lib/recipes'\nimport type { AiMode, AiTask, Recipe } from '@/lib/ai'", 1)
wr(p, s)

# ---- barre latérale : entrée « Recettes »
p = 'src/components/Sidebar.tsx'
sub(p, """      <Item onClick={() => setAssistant('recipe')}>
        <Sparkles size={14} /> Assistant IA
      </Item>""", """      <Item onClick={() => setAssistant('recipe')}>
        <Sparkles size={14} /> Assistant IA
      </Item>
      <Item active={view === 'page' && !!recipesDb && selectedId === recipesDb.id} onClick={() => void openRecipes()}>
        <ChefHat size={14} /> Recettes
      </Item>""")
sub(p, "openMail, theme, toggleTheme,\n  } = useApp()", "openMail, openRecipes, selectedId, theme, toggleTheme,\n  } = useApp()")
sub(p, "  const roots = childrenOf(objects, null)\n", "  const roots = childrenOf(objects, null)\n  const recipesDb = objects.find((o) => o.type === 'database' && !o.deleted_at && parseSchema(o.properties).kind === 'recipes')\n")
