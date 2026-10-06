import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Check, ChefHat, CirclePlus, Clock3, Cloud, CookingPot,
  Leaf, ListFilter, LogOut, MessageSquareText, Minus, PackageOpen, Pencil, Plus, Search, Send,
  ShoppingBasket, Sparkles, Trash2, TriangleAlert, Undo2, X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import AuthScreen from './AuthScreen'
import { recipes, seedInventory } from './data'
import { parseSmartEntry } from './smartEntry'
import { cloudEnabled, getHouseholdId, loadCloudKitchen, markHouseholdInitialized, saveGrocerySnapshot, saveInventorySnapshot, submitFeedback, supabase } from './supabase'
import type { Category, GroceryItem, InventoryItem, Location, Recipe } from './types'

type View = 'home' | 'kitchen' | 'recipes' | 'grocery'
type RecipeMatch = Recipe & { available: number; missing: GroceryItem[]; urgent: number; score: number }
type SmartReviewItem = InventoryItem & { merge: boolean }
type ToastState = { message: string; undo?: () => void }

const categories: Category[] = ['Protein', 'Produce', 'Dairy', 'Pantry', 'Other']
const categoryEmoji: Record<Category, string> = { Protein: '🥩', Produce: '🥬', Dairy: '🥛', Pantry: '🌾', Other: '🧂' }
const foodIcons = ['🍗', '🥩', '🐟', '🥚', '🥬', '🥦', '🥕', '🥑', '🍅', '🌽', '🫛', '🍎', '🍌', '🫐', '🍓', '🍋', '🍊', '🧅', '🧄', '🥔', '🍄', '🥛', '🧀', '🧈', '🥣', '🍚', '🌾', '🍞', '🍝', '🥫', '🧊', '🧂']

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function App() {
  const [view, setView] = useState<View>('home')
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-inventory-v1') || '') || seedInventory } catch { return seedInventory }
  })
  const [grocery, setGrocery] = useState<GroceryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-grocery-v1') || '') || [] } catch { return [] }
  })
  const [addOpen, setAddOpen] = useState(false)
  const [smartOpen, setSmartOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeMatch | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!cloudEnabled)
  const [demoMode, setDemoMode] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [syncState, setSyncState] = useState<'saved' | 'syncing' | 'error'>('saved')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) setDemoMode(false)
      setAuthReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || demoMode) { setHouseholdId(null); setCloudReady(false); return }
    let active = true
    async function hydrate() {
      try {
        setSyncState('syncing')
        const id = await getHouseholdId(session!.user.id)
        if (!id) throw new Error('No kitchen was created for this account.')
        const cloud = await loadCloudKitchen(id)
        if (!active) return
        setHouseholdId(id)
        if (!cloud.initialized) {
          const starterInventory = inventory.length ? inventory : seedInventory
          setInventory(starterInventory)
          await Promise.all([saveInventorySnapshot(id, starterInventory), saveGrocerySnapshot(id, grocery)])
          await markHouseholdInitialized(id)
        } else {
          setInventory(cloud.inventory)
          setGrocery(cloud.grocery)
        }
        setCloudReady(true)
        setSyncState('saved')
      } catch (error) {
        console.error(error)
        if (active) setSyncState('error')
      }
    }
    hydrate()
    return () => { active = false }
  }, [session, demoMode])

  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-inventory-v1', JSON.stringify(inventory))
  }, [inventory, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-grocery-v1', JSON.stringify(grocery))
  }, [grocery, session, demoMode])

  useEffect(() => {
    if (!householdId || !cloudReady) return
    setSyncState('syncing')
    const timer = setTimeout(() => saveInventorySnapshot(householdId, inventory).then(() => setSyncState('saved')).catch((error) => { console.error(error); setSyncState('error') }), 450)
    return () => clearTimeout(timer)
  }, [inventory, householdId, cloudReady])

  useEffect(() => {
    if (!householdId || !cloudReady) return
    setSyncState('syncing')
    const timer = setTimeout(() => saveGrocerySnapshot(householdId, grocery).then(() => setSyncState('saved')).catch((error) => { console.error(error); setSyncState('error') }), 450)
    return () => clearTimeout(timer)
  }, [grocery, householdId, cloudReady])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.undo ? 6500 : 3200)
    return () => clearTimeout(timer)
  }, [toast])

  const recipeMatches = useMemo<RecipeMatch[]>(() => recipes.map((recipe) => {
    const missing = recipe.ingredients.filter((ingredient) => {
      const item = inventory.find((entry) => normalize(entry.name) === normalize(ingredient.name))
      return !item || item.quantity < ingredient.amount
    }).map((ingredient) => ({ ...ingredient, checked: false }))
    const used = recipe.ingredients.filter((ingredient) => {
      const item = inventory.find((entry) => normalize(entry.name) === normalize(ingredient.name))
      return item && item.quantity >= Math.min(ingredient.amount, item.quantity)
    })
    const urgent = used.filter((ingredient) => {
      const item = inventory.find((entry) => normalize(entry.name) === normalize(ingredient.name))
      return item?.expiresIn !== null && Number(item?.expiresIn) <= 3
    }).length
    const available = Math.round(((recipe.ingredients.length - missing.length) / recipe.ingredients.length) * 100)
    return { ...recipe, missing, available, urgent, score: available + urgent * 8 }
  }).sort((a, b) => b.score - a.score), [inventory])

  const urgentItems = [...inventory].filter((item) => item.expiresIn !== null && item.expiresIn <= 3).sort((a, b) => Number(a.expiresIn) - Number(b.expiresIn))
  const counts = categories.map((category) => ({ category, count: inventory.filter((item) => item.category === category).length }))
  const readyCount = recipeMatches.filter((recipe) => recipe.missing.length === 0).length

  function notify(message: string) { setToast({ message }) }

  function addSmartItems(items: SmartReviewItem[]) {
    const validItems = items.filter((item) => item.name.trim() && item.quantity > 0)
    const previous = inventory.map((item) => ({ ...item }))
    let merged = 0
    setInventory((current) => {
      const next = current.map((item) => ({ ...item }))
      validItems.forEach(({ merge, ...item }) => {
        const existing = merge ? next.find((entry) => normalize(entry.name) === normalize(item.name) && normalize(entry.unit) === normalize(item.unit)) : undefined
        if (existing) {
          existing.quantity = Number((existing.quantity + item.quantity).toFixed(2))
          if (item.expiresIn !== null) existing.expiresIn = existing.expiresIn === null ? item.expiresIn : Math.min(existing.expiresIn, item.expiresIn)
          merged += 1
        } else {
          next.push({ ...item, id: `${normalize(item.name).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${next.length}` })
        }
      })
      return next
    })
    setSmartOpen(false)
    const added = validItems.length - merged
    const summary = [added ? `${added} added` : '', merged ? `${merged} merged` : ''].filter(Boolean).join(', ')
    setToast({
      message: `${summary} in your kitchen`,
      undo: () => {
        setInventory(previous)
        setToast({ message: 'Smart add undone' })
      },
    })
  }

  async function sendFeedback(category: string, message: string) {
    if (!session || !householdId) throw new Error('Sign in to send feedback.')
    await submitFeedback(householdId, session.user.id, category, message, {
      view,
      inventoryCount: inventory.length,
      groceryCount: grocery.length,
      syncState,
    })
    setFeedbackOpen(false)
    notify('Thank you — your feedback was sent')
  }

  async function leaveAccount() {
    if (session && supabase) await supabase.auth.signOut()
    else setDemoMode(false)
    setHouseholdId(null)
    setCloudReady(false)
  }

  function addToGrocery(items: GroceryItem[]) {
    setGrocery((current) => {
      const next = [...current]
      items.forEach((item) => {
        const existing = next.find((entry) => normalize(entry.name) === normalize(item.name))
        if (existing) existing.amount = Math.max(existing.amount, item.amount)
        else next.push({ ...item, checked: false })
      })
      return next
    })
    notify(`${items.length} item${items.length === 1 ? '' : 's'} added to your grocery list`)
  }

  function cookRecipe(recipe: RecipeMatch, scale = 1) {
    const missing = recipe.ingredients.flatMap((ingredient) => {
      const needed = Number((ingredient.amount * scale).toFixed(2))
      const current = inventory.find((item) => normalize(item.name) === normalize(ingredient.name))?.quantity || 0
      return current < needed ? [{ ...ingredient, amount: Number((needed - current).toFixed(2)), checked: false }] : []
    })
    if (missing.length) { addToGrocery(missing); setSelectedRecipe(null); return }
    setInventory((current) => current.flatMap((item) => {
      const needed = recipe.ingredients.find((ingredient) => normalize(ingredient.name) === normalize(item.name))
      if (!needed) return [item]
      const quantity = Math.max(0, Number((item.quantity - needed.amount * scale).toFixed(2)))
      return quantity === 0 ? [] : [{ ...item, quantity }]
    }))
    setSelectedRecipe(null)
    notify(`Kitchen updated after making ${recipe.name}`)
  }

  if (cloudEnabled && !authReady) return <div className="app-loading"><span className="brand-mark"><Leaf /></span><strong>Opening your kitchen…</strong></div>
  if (cloudEnabled && !session && !demoMode) return <AuthScreen onDemo={() => setDemoMode(true)} />

  const displayName = session?.user.user_metadata.display_name || session?.user.email?.split('@')[0] || 'Gourav'
  const initials = String(displayName).split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('home')} aria-label="Go home">
          <span className="brand-mark"><Leaf size={21} /></span>
          <span>Mise</span>
        </button>
        <nav>
          <NavButton active={view === 'home'} icon={<Sparkles />} label="Overview" onClick={() => setView('home')} />
          <NavButton active={view === 'kitchen'} icon={<PackageOpen />} label="My kitchen" badge={inventory.length} onClick={() => setView('kitchen')} />
          <NavButton active={view === 'recipes'} icon={<CookingPot />} label="What can I make?" badge={readyCount} onClick={() => setView('recipes')} />
          <NavButton active={view === 'grocery'} icon={<ShoppingBasket />} label="Grocery list" badge={grocery.filter((item) => !item.checked).length} onClick={() => setView('grocery')} />
        </nav>
        <div className="sidebar-note">
          <span><Leaf size={15} /> This week</span>
          <strong>{urgentItems.length} items</strong>
          <p>deserve a spot on your plate soon.</p>
        </div>
        <div className="profile"><span>{initials}</span><div><strong>{displayName}</strong><small>{session ? 'Cloud kitchen' : 'Local demo'}</small></div>{cloudEnabled && <button onClick={leaveAccount} aria-label={session ? 'Sign out' : 'Leave demo'} title={session ? 'Sign out' : 'Sign in'}><LogOut size={15} /></button>}</div>
      </aside>

      <main>
        <header className="topbar">
          <div className="mobile-brand"><Leaf size={18} /> Mise</div>
          <button className="search-button"><Search size={17} /><span>Search your kitchen</span><kbd>⌘ K</kbd></button>
          {session && <span className={`sync-state ${syncState}`}><Cloud size={14} /> {syncState === 'saved' ? 'Saved' : syncState === 'syncing' ? 'Saving…' : 'Sync issue'}</span>}
          {session && <button className="feedback-button" onClick={() => setFeedbackOpen(true)}><MessageSquareText size={16} /><span>Feedback</span></button>}
          <button className="smart-button" onClick={() => setSmartOpen(true)}><Sparkles size={16} /> Smart add</button>
          <button className="add-button" onClick={() => setAddOpen(true)}><Plus size={18} /> Add food</button>
        </header>

        <div className="page">
          {view === 'home' && <Home displayName={displayName} inventory={inventory} counts={counts} urgentItems={urgentItems} recipes={recipeMatches} readyCount={readyCount} groceryCount={grocery.filter((item) => !item.checked).length} setView={setView} setSelectedRecipe={setSelectedRecipe} />}
          {view === 'kitchen' && <Kitchen inventory={inventory} setInventory={setInventory} onAdd={() => setAddOpen(true)} onSmartAdd={() => setSmartOpen(true)} onEdit={setEditingItem} />}
          {view === 'recipes' && <Recipes recipes={recipeMatches} setSelectedRecipe={setSelectedRecipe} />}
          {view === 'grocery' && <Grocery grocery={grocery} setGrocery={setGrocery} setInventory={setInventory} notify={notify} />}
        </div>
      </main>

      {addOpen && <AddFood onClose={() => setAddOpen(false)} onAdd={(item) => { setInventory((current) => [...current, item]); setAddOpen(false); notify(`${item.name} added to your kitchen`) }} />}
      {smartOpen && <SmartAdd inventory={inventory} onClose={() => setSmartOpen(false)} onAdd={addSmartItems} />}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} onSubmit={sendFeedback} />}
      {editingItem && <AddFood initialItem={editingItem} onClose={() => setEditingItem(null)} onAdd={(item) => { setInventory((current) => current.map((entry) => entry.id === item.id ? item : entry)); setEditingItem(null); notify(`${item.name} updated`) }} />}
      {selectedRecipe && <RecipeSheet recipe={selectedRecipe} inventory={inventory} onClose={() => setSelectedRecipe(null)} onAction={(scale) => cookRecipe(selectedRecipe, scale)} />}
      {toast && <div className="toast"><Check size={17} /><span>{toast.message}</span>{toast.undo && <button onClick={toast.undo}><Undo2 size={14} /> Undo</button>}</div>}
    </div>
  )
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>{icon}<span>{label}</span>{badge !== undefined && <em>{badge}</em>}</button>
}

function Home({ displayName, inventory, counts, urgentItems, recipes, readyCount, groceryCount, setView, setSelectedRecipe }: {
  displayName: string;
  inventory: InventoryItem[]; counts: { category: Category; count: number }[]; urgentItems: InventoryItem[]; recipes: RecipeMatch[];
  readyCount: number; groceryCount: number; setView: (view: View) => void; setSelectedRecipe: (recipe: RecipeMatch) => void
}) {
  const best = recipes[0]
  return <>
    <section className="welcome">
      <div><span className="eyebrow">Saturday, your kitchen at a glance</span><h1>{getGreeting()}, {displayName}.</h1><p>Everything looks good. A few ingredients are asking to be used soon.</p></div>
      <div className="fresh-score"><span><Leaf size={18} /></span><div><small>Kitchen freshness</small><strong>86%</strong></div></div>
    </section>

    <section className="status-grid">
      <article className="kitchen-card panel">
        <div className="section-heading"><div><span className="eyebrow">Kitchen status</span><h2>{inventory.length} ingredients at home</h2></div><button className="text-button" onClick={() => setView('kitchen')}>See everything <ArrowRight size={15} /></button></div>
        <div className="category-grid">{counts.filter((entry) => entry.count > 0).map(({ category, count }) => <button key={category} onClick={() => setView('kitchen')}><span>{categoryEmoji[category]}</span><strong>{count}</strong><small>{category}</small></button>)}</div>
      </article>

      <article className="urgent-card panel">
        <div className="section-heading"><div><span className="eyebrow warning"><TriangleAlert size={13} /> Use soon</span><h2>Give these a plan</h2></div></div>
        <div className="urgent-list">{urgentItems.slice(0, 3).map((item) => <div key={item.id}><span className="food-icon">{item.emoji}</span><p><strong>{item.name}</strong><small>{item.expiresIn === 0 ? 'Use today' : `${item.expiresIn} day${item.expiresIn === 1 ? '' : 's'} left`}</small></p><span className={`day-pill day-${Math.min(item.expiresIn || 0, 3)}`}>{item.expiresIn}d</span></div>)}</div>
        <button className="soft-button" onClick={() => setView('recipes')}>Find recipes that use these <ArrowRight size={15} /></button>
      </article>
    </section>

    <section className="cook-section">
      <div className="section-heading"><div><span className="eyebrow">Made for tonight</span><h2>What can I make?</h2></div><button className="text-button" onClick={() => setView('recipes')}>Explore all {recipes.length} <ArrowRight size={15} /></button></div>
      <div className="recipe-grid">{recipes.slice(0, 3).map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} featured={index === 0} onClick={() => setSelectedRecipe(recipe)} />)}</div>
    </section>

    <section className="quick-stats">
      <div><span className="stat-icon green"><ChefHat /></span><p><strong>{readyCount} recipes</strong><small>ready without a grocery run</small></p></div>
      <div><span className="stat-icon gold"><Clock3 /></span><p><strong>{best?.time || 0} min</strong><small>to your best match tonight</small></p></div>
      <button onClick={() => setView('grocery')}><span className="stat-icon berry"><ShoppingBasket /></span><p><strong>{groceryCount || 'No'} items</strong><small>{groceryCount ? 'waiting on your grocery list' : 'your grocery list is clear'}</small></p><ArrowRight /></button>
    </section>
  </>
}

function RecipeCard({ recipe, featured, onClick }: { recipe: RecipeMatch; featured?: boolean; onClick: () => void }) {
  return <button className={featured ? 'recipe-card featured' : 'recipe-card'} onClick={onClick} style={{ '--accent': recipe.accent } as React.CSSProperties}>
    <div className="recipe-art"><span>{recipe.emoji}</span>{recipe.urgent > 0 && <em><Leaf size={13} /> Uses {recipe.urgent} use-soon</em>}</div>
    <div className="recipe-info"><div className="match-line"><span className={recipe.missing.length ? 'match almost' : 'match'}>{recipe.missing.length ? `${recipe.available}% match` : 'Ready now'}</span><small><Clock3 size={13} /> {recipe.time} min</small></div><h3>{recipe.name}</h3><p>{recipe.description}</p><div className="recipe-footer"><span>{recipe.protein}g protein</span><strong>{recipe.missing.length ? `Needs ${recipe.missing.length}` : 'Cook this'} <ArrowRight size={14} /></strong></div></div>
  </button>
}

function Kitchen({ inventory, setInventory, onAdd, onSmartAdd, onEdit }: { inventory: InventoryItem[]; setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>; onAdd: () => void; onSmartAdd: () => void; onEdit: (item: InventoryItem) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'All' | Category>('All')
  const filtered = inventory.filter((item) => (category === 'All' || item.category === category) && normalize(item.name).includes(normalize(query)))
  return <section className="inner-page">
    <div className="page-title"><div><span className="eyebrow">Your ingredients</span><h1>My kitchen</h1><p>Keep a light touch on what you have, where it lives, and what needs attention.</p></div><div className="title-actions"><button className="secondary-button" onClick={onSmartAdd}><Sparkles size={17} /> Smart add</button><button className="primary-button" onClick={onAdd}><CirclePlus size={18} /> Add food</button></div></div>
    <div className="toolbar"><label><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ingredients…" /></label><div className="filter-tabs">{(['All', ...categories] as const).map((option) => <button className={category === option ? 'active' : ''} onClick={() => setCategory(option)} key={option}>{option}</button>)}</div></div>
    <div className="inventory-table panel"><div className="table-head"><span>Ingredient</span><span>Quantity</span><span>Stored in</span><span>Freshness</span><span /></div>{filtered.map((item) => <div className="inventory-row" key={item.id}><button className="ingredient-cell edit-trigger" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}><span>{item.emoji}</span><p><strong>{item.name}</strong><small>{item.category}</small></p></button><div className="quantity-control"><button onClick={() => setInventory((all) => all.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.max(0, Number((entry.quantity - 1).toFixed(1))) } : entry))}><Minus /></button><strong>{item.quantity}</strong><small>{item.unit}</small><button onClick={() => setInventory((all) => all.map((entry) => entry.id === item.id ? { ...entry, quantity: Number((entry.quantity + 1).toFixed(1)) } : entry))}><Plus /></button></div><span className="location-pill">{item.location}</span><Freshness item={item} /><div className="row-actions"><button className="icon-button edit" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`} title="Edit ingredient"><Pencil /></button><button className="icon-button delete" onClick={() => setInventory((all) => all.filter((entry) => entry.id !== item.id))} aria-label={`Delete ${item.name}`} title="Delete ingredient"><Trash2 /></button></div></div>)}</div>
    {!filtered.length && <Empty title="Nothing found" copy="Try another search or add a new ingredient." />}
  </section>
}

function Freshness({ item }: { item: InventoryItem }) {
  if (item.expiresIn === null) return <span className="freshness neutral">Shelf stable</span>
  if (item.expiresIn <= 1) return <span className="freshness danger">Use {item.expiresIn === 0 ? 'today' : 'tomorrow'}</span>
  if (item.expiresIn <= 3) return <span className="freshness soon">{item.expiresIn} days left</span>
  return <span className="freshness fresh">Fresh · {item.expiresIn}d</span>
}

function Recipes({ recipes, setSelectedRecipe }: { recipes: RecipeMatch[]; setSelectedRecipe: (recipe: RecipeMatch) => void }) {
  const [sort, setSort] = useState<'match' | 'time' | 'urgent'>('match')
  const [filter, setFilter] = useState<'all' | 'ready' | 'quick' | 'protein'>('all')
  const filtered = recipes.filter((recipe) => filter === 'ready' ? recipe.missing.length === 0 : filter === 'quick' ? recipe.time <= 20 : filter === 'protein' ? recipe.protein >= 35 : true)
  const sorted = [...filtered].sort((a, b) => sort === 'time' ? a.time - b.time : sort === 'urgent' ? b.urgent - a.urgent : b.score - a.score)
  return <section className="inner-page">
    <div className="page-title"><div><span className="eyebrow">Cook from what you have</span><h1>What can I make?</h1><p>Recipes are ranked by your kitchen, with extra love for ingredients that need using soon.</p></div></div>
    <div className="recipe-controls"><div className="recipe-filters">{([['all', 'All ideas'], ['ready', 'Ready now'], ['quick', '20 min or less'], ['protein', 'High protein']] as const).map(([value, label]) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{label}</button>)}</div><div className="recipe-toolbar"><span><ListFilter size={16} /> Sort by</span>{(['match', 'time', 'urgent'] as const).map((option) => <button className={sort === option ? 'active' : ''} onClick={() => setSort(option)} key={option}>{option === 'urgent' ? 'Use soon' : option[0].toUpperCase() + option.slice(1)}</button>)}</div></div>
    <div className="recipe-grid full">{sorted.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} featured={index === 0} onClick={() => setSelectedRecipe(recipe)} />)}</div>
    {!sorted.length && <Empty title="No recipes in this view" copy="Try another filter or add a few more ingredients to your kitchen." />}
  </section>
}

function Grocery({ grocery, setGrocery, setInventory, notify }: { grocery: GroceryItem[]; setGrocery: React.Dispatch<React.SetStateAction<GroceryItem[]>>; setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>; notify: (message: string) => void }) {
  const [draft, setDraft] = useState('')
  function addManual() {
    if (!draft.trim()) return
    setGrocery((items) => [...items, { name: draft.trim(), amount: 1, unit: 'item', checked: false }]); setDraft('')
  }
  function moveCheckedToKitchen() {
    const bought = grocery.filter((item) => item.checked)
    if (!bought.length) return
    setInventory((items) => [...items, ...bought.map((item) => ({ id: `${normalize(item.name).replace(/\s/g, '-')}-${Date.now()}`, name: item.name, emoji: '🥫', quantity: item.amount, unit: item.unit, category: 'Other' as Category, location: 'Pantry' as Location, expiresIn: null }))])
    setGrocery((items) => items.filter((item) => !item.checked)); notify(`${bought.length} purchased item${bought.length === 1 ? '' : 's'} moved to your kitchen`)
  }
  return <section className="inner-page">
    <div className="page-title"><div><span className="eyebrow">Only what you need</span><h1>Grocery list</h1><p>Missing recipe ingredients land here. When you buy them, send them straight to your kitchen.</p></div>{grocery.some((item) => item.checked) && <button className="primary-button" onClick={moveCheckedToKitchen}><PackageOpen size={18} /> Add purchased to kitchen</button>}</div>
    <div className="grocery-layout"><div className="grocery-list panel"><div className="quick-add"><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManual()} placeholder="Add something you need…" /><button onClick={addManual}><Plus /></button></div>{grocery.map((item, index) => <div className={item.checked ? 'grocery-row checked' : 'grocery-row'} key={`${item.name}-${index}`}><button className="check-box" onClick={() => setGrocery((items) => items.map((entry, i) => i === index ? { ...entry, checked: !entry.checked } : entry))}>{item.checked && <Check />}</button><p><strong>{item.name}</strong><small>{item.amount} {item.unit}</small></p><button className="icon-button" onClick={() => setGrocery((items) => items.filter((_, i) => i !== index))}><X /></button></div>)}{!grocery.length && <Empty title="Your list is clear" copy="Choose an almost-ready recipe or add an item above." />}</div><aside className="grocery-tip"><ShoppingBasket /><h3>Shop lighter</h3><p>Mise only adds what your recipes need and your kitchen doesn’t already have.</p><span>That means fewer duplicates and less food forgotten at the back of the fridge.</span></aside></div>
  </section>
}

function SmartAdd({ inventory, onClose, onAdd }: { inventory: InventoryItem[]; onClose: () => void; onAdd: (items: SmartReviewItem[]) => void }) {
  const [entry, setEntry] = useState('2 lb chicken breast, a bag of spinach, 6 eggs')
  const [items, setItems] = useState<SmartReviewItem[]>([])

  function understand() {
    setItems(parseSmartEntry(entry).map((item) => ({
      ...item,
      merge: inventory.some((existing) => normalize(existing.name) === normalize(item.name) && normalize(existing.unit) === normalize(item.unit)),
    })))
  }

  function updateItem(id: string, updates: Partial<SmartReviewItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...updates } : item))
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal smart-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow"><Sparkles size={12} /> Smarter food entry</span><h2>Tell Mise what you bought</h2></div><button type="button" onClick={onClose} aria-label="Close smart add"><X /></button></div><p className="modal-intro">Use everyday language. Mise will separate the foods, infer the details, and flag anything already in your kitchen.</p><label>Grocery note<textarea autoFocus value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="Try: 2 lb chicken, six eggs, a bag of spinach…" /></label><div className="smart-examples"><span>Try an example:</span><button type="button" onClick={() => setEntry('4 avocados, 2 cartons of milk, a box of blueberries')}>Produce run</button><button type="button" onClick={() => setEntry('1 lb salmon, 2 cups rice, broccoli and a lemon')}>Dinner ingredients</button></div><button type="button" className="understand-button" onClick={understand} disabled={!entry.trim()}><Sparkles size={16} /> Review my list</button>{items.length > 0 && <div className="smart-results"><div className="smart-results-head"><strong>{items.length} ingredient{items.length === 1 ? '' : 's'} found</strong><span>Everything stays editable</span></div><div className="smart-review-list">{items.map((item) => {
    const duplicate = inventory.find((existing) => normalize(existing.name) === normalize(item.name) && normalize(existing.unit) === normalize(item.unit))
    return <article className="smart-review-card" key={item.id}>
      <div className="smart-review-main"><button type="button" className="smart-emoji" onClick={() => { const current = foodIcons.indexOf(item.emoji); updateItem(item.id, { emoji: foodIcons[(current + 1 + foodIcons.length) % foodIcons.length] }) }} title="Change icon" aria-label={`Change icon for ${item.name}`}>{item.emoji}</button><label>Name<input aria-label={`Name for ${item.name}`} value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} /></label><button type="button" className="icon-button delete" onClick={() => setItems((current) => current.filter((entryItem) => entryItem.id !== item.id))} aria-label={`Remove ${item.name}`}><X /></button></div>
      <div className="smart-review-fields"><label>Quantity<input aria-label={`Quantity for ${item.name}`} type="number" min="0.1" step="0.1" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })} /></label><label>Unit<input aria-label={`Unit for ${item.name}`} value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} /></label><label>Category<select aria-label={`Category for ${item.name}`} value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value as Category })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Stored in<select aria-label={`Storage for ${item.name}`} value={item.location} onChange={(event) => updateItem(item.id, { location: event.target.value as Location })}><option>Fridge</option><option>Freezer</option><option>Pantry</option></select></label><label>Use in<input aria-label={`Freshness for ${item.name}`} type="number" min="0" placeholder="—" value={item.expiresIn ?? ''} onChange={(event) => updateItem(item.id, { expiresIn: event.target.value === '' ? null : Number(event.target.value) })} /><span>days</span></label></div>
      {duplicate && <label className="duplicate-choice"><input type="checkbox" checked={item.merge} onChange={(event) => updateItem(item.id, { merge: event.target.checked })} /><span><strong>Already in your kitchen</strong>{item.merge ? `Add to the existing ${duplicate.quantity} ${duplicate.unit}` : 'Keep this as a separate item'}</span></label>}
    </article>
  })}</div><button className="submit-button" type="button" disabled={!items.some((item) => item.name.trim() && item.quantity > 0)} onClick={() => onAdd(items)}>Save {items.length} ingredient{items.length === 1 ? '' : 's'} <ArrowRight /></button></div>}</section></div>
}

function FeedbackModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (category: string, message: string) => Promise<void> }) {
  const [category, setCategory] = useState('idea')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (message.trim().length < 3) return
    setLoading(true)
    setError('')
    try { await onSubmit(category, message.trim()) }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Feedback could not be sent. Please try again.'); setLoading(false) }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal feedback-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow"><MessageSquareText size={12} /> Help shape Mise</span><h2>Send feedback</h2></div><button type="button" onClick={onClose} aria-label="Close feedback"><X /></button></div><p className="modal-intro">Tell us what felt useful, confusing, or missing. Your current screen and item counts are included automatically.</p><label>What kind of feedback?<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="idea">Idea or request</option><option value="problem">Something went wrong</option><option value="confusing">Something was confusing</option><option value="other">Other</option></select></label><label>Your feedback<textarea autoFocus required minLength={3} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What happened, or what would make Mise better?" /></label><div className="feedback-meta"><Cloud size={14} /> Sent privately with basic app context. Never includes your password.</div>{error && <div className="form-error">{error}</div>}<button className="submit-button" disabled={loading || message.trim().length < 3}>{loading ? 'Sending…' : 'Send feedback'} <Send /></button></form></div>
}

function AddFood({ onClose, onAdd, initialItem }: { onClose: () => void; onAdd: (item: InventoryItem) => void; initialItem?: InventoryItem }) {
  const [name, setName] = useState(initialItem?.name || '')
  const [emoji, setEmoji] = useState(initialItem?.emoji || '🥑')
  const [quantity, setQuantity] = useState(initialItem?.quantity || 1)
  const [unit, setUnit] = useState(initialItem?.unit || 'item')
  const [category, setCategory] = useState<Category>(initialItem?.category || 'Produce')
  const [location, setLocation] = useState<Location>(initialItem?.location || 'Fridge')
  const [expiresIn, setExpiresIn] = useState(initialItem?.expiresIn === null ? '' : String(initialItem?.expiresIn ?? 7))
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (!name.trim()) return
    onAdd({ id: initialItem?.id || `${normalize(name).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`, name: name.trim(), emoji, quantity, unit, category, location, expiresIn: expiresIn === '' ? null : Number(expiresIn) })
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{initialItem ? 'Update your kitchen' : 'Stock your kitchen'}</span><h2>{initialItem ? 'Edit ingredient' : 'Add an ingredient'}</h2></div><button type="button" onClick={onClose}><X /></button></div><label>Food name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Avocados" /></label><fieldset className="icon-picker"><legend>Choose an icon</legend><div>{foodIcons.map((icon) => <button key={icon} type="button" className={emoji === icon ? 'selected' : ''} onClick={() => setEmoji(icon)} aria-label={`Use ${icon} icon`} aria-pressed={emoji === icon}>{icon}</button>)}</div></fieldset><div className="form-row"><label>Quantity<input type="number" min="0.1" step="0.1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label><label>Unit<input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="items" /></label></div><div className="form-row"><label>Category<select value={category} onChange={(e) => setCategory(e.target.value as Category)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Stored in<select value={location} onChange={(e) => setLocation(e.target.value as Location)}><option>Fridge</option><option>Freezer</option><option>Pantry</option></select></label></div><label>Use within <div className="input-suffix"><input type="number" min="0" value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)} placeholder="Optional" /><span>days</span></div></label><button className="submit-button" type="submit">{initialItem ? 'Save changes' : 'Add to my kitchen'} <ArrowRight /></button></form></div>
}

function RecipeSheet({ recipe, inventory, onClose, onAction }: { recipe: RecipeMatch; inventory: InventoryItem[]; onClose: () => void; onAction: (scale: number) => void }) {
  const [servings, setServings] = useState(recipe.servings)
  const scale = servings / recipe.servings
  const ingredientStatus = recipe.ingredients.map((ingredient) => {
    const needed = Number((ingredient.amount * scale).toFixed(2))
    const have = inventory.find((item) => normalize(item.name) === normalize(ingredient.name))?.quantity || 0
    return { ...ingredient, needed, missing: have < needed }
  })
  const missingCount = ingredientStatus.filter((ingredient) => ingredient.missing).length
  const match = Math.round(((ingredientStatus.length - missingCount) / ingredientStatus.length) * 100)
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="recipe-sheet" onMouseDown={(e) => e.stopPropagation()}><button className="sheet-close" onClick={onClose}><X /></button><div className="sheet-art" style={{ '--accent': recipe.accent } as React.CSSProperties}><span>{recipe.emoji}</span><em>{missingCount ? `${match}% match` : 'Everything available'}</em></div><div className="sheet-body"><span className="eyebrow">Your kitchen match</span><h2>{recipe.name}</h2><p>{recipe.description}</p><div className="sheet-stats"><span><Clock3 /> {recipe.time} min</span><span><Sparkles /> {recipe.protein}g protein</span></div><div className="serving-control"><div><strong>Servings</strong><small>Ingredients update automatically</small></div><div><button onClick={() => setServings((value) => Math.max(1, value - 1))}><Minus /></button><strong>{servings}</strong><button onClick={() => setServings((value) => Math.min(12, value + 1))}><Plus /></button></div></div><h3>From your kitchen</h3><div className="ingredient-list">{ingredientStatus.map((ingredient) => <div className={ingredient.missing ? 'missing' : ''} key={ingredient.name}><span>{ingredient.missing ? <Plus /> : <Check />}</span><strong>{ingredient.name}</strong><small>{ingredient.needed} {ingredient.unit}</small></div>)}</div>{recipe.urgent > 0 && <div className="rescue-note"><Leaf /> This meal uses {recipe.urgent} ingredient{recipe.urgent === 1 ? '' : 's'} that should be enjoyed soon.</div>}<button className="submit-button" onClick={() => onAction(scale)}>{missingCount ? `Add ${missingCount} missing item${missingCount === 1 ? '' : 's'} to grocery list` : `Cook ${servings} servings & update my kitchen`} <ArrowRight /></button></div></section></div>
}

function Empty({ title, copy }: { title: string; copy: string }) { return <div className="empty"><PackageOpen /><strong>{title}</strong><p>{copy}</p></div> }

export default App
