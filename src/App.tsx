import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Camera, Check, ChefHat, CirclePlus, Clock3, Cloud, CookingPot,
  ExternalLink, KeyRound, Leaf, ListFilter, LogOut, Mail, MessageSquareText, Minus, PackageOpen, Pencil, Plus, RefreshCw, Search, Send,
  Settings as SettingsIcon, ShieldCheck, ShoppingBasket, Sparkles, Trash2, TriangleAlert, Undo2, UserRound, WifiOff, X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import AuthScreen from './AuthScreen'
import { recipes, seedInventory } from './data'
import { expirationWarning, suggestedExpirationDate, type FreshnessState } from './expirationIntelligence'
import { daysUntilDate, daysUntilExpiration, expirationDateFromDays, withExpirationDate } from './freshness'
import { getFoodIntelligence } from './foodCatalog'
import { matchRecipes, type RecipeMatch } from './recipeIntelligence'
import { scanReceiptImage } from './receiptScanner'
import { loadDiscoverRecipe, searchDiscoverRecipes, type DiscoverRecipe, type DiscoverRecipeDetails } from './spoonacular'
import { normalizeFoodName, parseSmartEntry, sameFoodAndUnit } from './smartEntry'
import type { SmartEntryItem } from './smartEntry'
import { cloudEnabled, getHouseholdId, loadCloudKitchen, markHouseholdInitialized, saveGrocerySnapshot, saveInventorySnapshot, saveRecipeSnapshot, submitFeedback, supabase } from './supabase'
import { withRetry } from './sync'
import type { Category, GroceryItem, InventoryItem, Location, Recipe } from './types'

type View = 'home' | 'kitchen' | 'recipes' | 'grocery' | 'settings'
type KitchenCategory = 'All' | Category
type SyncState = 'saved' | 'syncing' | 'error' | 'offline'
type SmartReviewItem = SmartEntryItem & { merge: boolean }
type ToastState = { message: string; undo?: () => void }
type StoredKitchen = { householdId: string; inventory: InventoryItem[]; grocery: GroceryItem[]; recipes?: Recipe[]; savedAt: string }

const categories: Category[] = ['Protein', 'Produce', 'Dairy', 'Pantry', 'Other']
const categoryEmoji: Record<Category, string> = { Protein: '🥩', Produce: '🥬', Dairy: '🥛', Pantry: '🌾', Other: '🧂' }
const foodIcons = ['🍗', '🥩', '🥓', '🐟', '🍤', '🥚', '🥬', '🥦', '🥕', '🥑', '🍅', '🥒', '🫑', '🌽', '🫛', '🍎', '🍌', '🫐', '🍓', '🍇', '🍋', '🍊', '🧅', '🧄', '🥔', '🍠', '🍄', '🌿', '🥛', '🧀', '🧈', '🥣', '🍚', '🌾', '🍞', '🫓', '🍝', '🥫', '🥜', '🫒', '☕', '🧊', '🧂']

function kitchenStorageKey(kind: 'cache' | 'pending', userId: string) {
  return `mise-cloud-${kind}-v1-${userId}`
}

function readStoredKitchen(kind: 'cache' | 'pending', userId: string): StoredKitchen | null {
  try { return JSON.parse(localStorage.getItem(kitchenStorageKey(kind, userId)) || '') || null } catch { return null }
}

function writeStoredKitchen(kind: 'cache' | 'pending', userId: string, kitchen: StoredKitchen) {
  localStorage.setItem(kitchenStorageKey(kind, userId), JSON.stringify(kitchen))
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function normalize(value: string) {
  return normalizeFoodName(value)
}

function App() {
  const [view, setView] = useState<View>('home')
  const [kitchenCategory, setKitchenCategory] = useState<KitchenCategory>('All')
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('mise-inventory-v1') || '') || seedInventory
      return stored.map((item: InventoryItem) => withExpirationDate(item))
    } catch { return seedInventory.map((item) => withExpirationDate(item)) }
  })
  const [grocery, setGrocery] = useState<GroceryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-grocery-v1') || '') || [] } catch { return [] }
  })
  const [customRecipes, setCustomRecipes] = useState<Recipe[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-recipes-v1') || '') || [] } catch { return [] }
  })
  const [addOpen, setAddOpen] = useState(false)
  const [smartOpen, setSmartOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [recipeEditorOpen, setRecipeEditorOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeMatch | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!cloudEnabled)
  const [demoMode, setDemoMode] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>('saved')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [retryToken, setRetryToken] = useState(0)
  const [loadRetryToken, setLoadRetryToken] = useState(0)
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false)
  const starterInventory = useRef(inventory)
  const starterGrocery = useRef(grocery)
  const starterRecipes = useRef(customRecipes)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (nextSession) setDemoMode(false)
      else {
        setHouseholdId(null)
        setCloudReady(false)
      }
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryOpen(true)
      setAuthReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    function online() { setIsOnline(true); setRetryToken((value) => value + 1) }
    function offline() { setIsOnline(false); setSyncState('offline') }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])

  useEffect(() => {
    if (!authReady || !window.location.href.endsWith('#')) return
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  }, [authReady])

  useEffect(() => {
    if (!session || demoMode) return
    let active = true
    async function hydrate() {
      try {
        const localKitchen = readStoredKitchen('pending', session!.user.id) || readStoredKitchen('cache', session!.user.id)
        if (!isOnline) {
          if (localKitchen) {
            setHouseholdId(localKitchen.householdId)
            setInventory(localKitchen.inventory.map((item) => withExpirationDate(item)))
            setGrocery(localKitchen.grocery)
            setCustomRecipes(localKitchen.recipes || [])
            setCloudReady(true)
          }
          setSyncState('offline')
          return
        }
        setSyncState('syncing')
        const id = await getHouseholdId(session!.user.id)
        if (!id) throw new Error('No kitchen was created for this account.')
        const cloud = await loadCloudKitchen(id)
        if (!active) return
        setHouseholdId(id)
        const pending = readStoredKitchen('pending', session!.user.id)
        if (pending?.householdId === id) {
          setInventory(pending.inventory.map((item) => withExpirationDate(item)))
          setGrocery(pending.grocery)
          setCustomRecipes(pending.recipes || [])
        } else if (!cloud.initialized) {
          const initialInventory = starterInventory.current.length ? starterInventory.current : seedInventory.map((item) => withExpirationDate(item))
          setInventory(initialInventory)
          setCustomRecipes(starterRecipes.current)
          await Promise.all([saveInventorySnapshot(id, initialInventory), saveGrocerySnapshot(id, starterGrocery.current), saveRecipeSnapshot(id, starterRecipes.current)])
          await markHouseholdInitialized(id)
        } else {
          setInventory(cloud.inventory)
          setGrocery(cloud.grocery)
          setCustomRecipes(cloud.recipes)
          writeStoredKitchen('cache', session!.user.id, { householdId: id, inventory: cloud.inventory, grocery: cloud.grocery, recipes: cloud.recipes, savedAt: new Date().toISOString() })
        }
        setCloudReady(true)
        setSyncState(pending?.householdId === id ? 'syncing' : 'saved')
      } catch (error) {
        console.error(error)
        if (active) setSyncState(navigator.onLine ? 'error' : 'offline')
      }
    }
    hydrate()
    return () => { active = false }
  }, [session, demoMode, isOnline, loadRetryToken])

  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-inventory-v1', JSON.stringify(inventory))
  }, [inventory, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-grocery-v1', JSON.stringify(grocery))
  }, [grocery, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-recipes-v1', JSON.stringify(customRecipes))
  }, [customRecipes, session, demoMode])

  useEffect(() => {
    if (!householdId || !cloudReady || !session) return
    const snapshot = { householdId, inventory, grocery, recipes: customRecipes, savedAt: new Date().toISOString() }
    writeStoredKitchen('pending', session.user.id, snapshot)
    const timer = window.setTimeout(async () => {
      if (!isOnline) { setSyncState('offline'); return }
      setSyncState('syncing')
      try {
        await withRetry(() => Promise.all([saveInventorySnapshot(householdId, inventory), saveGrocerySnapshot(householdId, grocery), saveRecipeSnapshot(householdId, customRecipes)]))
        localStorage.removeItem(kitchenStorageKey('pending', session.user.id))
        writeStoredKitchen('cache', session.user.id, snapshot)
        setSyncState('saved')
      } catch (error) {
        console.error(error)
        setSyncState(navigator.onLine ? 'error' : 'offline')
      }
    }, retryToken ? 50 : 450)
    return () => window.clearTimeout(timer)
  }, [inventory, grocery, customRecipes, householdId, cloudReady, session, isOnline, retryToken])

  useEffect(() => {
    if (syncState === 'saved') return
    function protectUnsaved(event: BeforeUnloadEvent) { event.preventDefault() }
    window.addEventListener('beforeunload', protectUnsaved)
    return () => window.removeEventListener('beforeunload', protectUnsaved)
  }, [syncState])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.undo ? 6500 : 3200)
    return () => clearTimeout(timer)
  }, [toast])

  const recipeMatches = useMemo<RecipeMatch[]>(
    () => matchRecipes([...customRecipes, ...recipes], inventory),
    [customRecipes, inventory],
  )

  const urgentItems = [...inventory].filter((item) => {
    const days = daysUntilExpiration(item)
    return days !== null && days <= 3
  }).sort((a, b) => Number(daysUntilExpiration(a)) - Number(daysUntilExpiration(b)))
  const counts = categories.map((category) => ({ category, count: inventory.filter((item) => item.category === category).length }))
  const readyCount = recipeMatches.filter((recipe) => recipe.missing.length === 0).length

  function notify(message: string) { setToast({ message }) }

  function retrySync() {
    if (!navigator.onLine) { setSyncState('offline'); notify('You are still offline. Mise will retry when you reconnect.'); return }
    setIsOnline(true)
    setSyncState('syncing')
    setRetryToken((value) => value + 1)
  }

  function retryKitchenLoad() {
    setIsOnline(navigator.onLine)
    setSyncState(navigator.onLine ? 'syncing' : 'offline')
    setLoadRetryToken((value) => value + 1)
  }

  async function sendPasswordReset() {
    const email = session?.user.email
    if (!supabase || !email) throw new Error('No email address is available for this account.')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` })
    if (error) throw error
    notify('Password reset email sent')
  }

  async function updateProfileName(name: string) {
    if (!supabase) throw new Error('Profile updates are unavailable.')
    const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } })
    if (error) throw error
    notify('Profile name updated')
  }

  function addSmartItems(items: SmartReviewItem[]) {
    const validItems = items.filter((item) => item.name.trim() && item.quantity > 0)
    const previous = inventory.map((item) => ({ ...item }))
    let merged = 0
    setInventory((current) => {
      const next = current.map((item) => ({ ...item }))
      validItems.forEach((reviewItem) => {
        const item: InventoryItem = {
          id: reviewItem.id,
          name: reviewItem.name,
          emoji: reviewItem.emoji,
          quantity: reviewItem.quantity,
          unit: reviewItem.unit,
          category: reviewItem.category,
          location: reviewItem.location,
          expiresIn: reviewItem.expiresIn,
          expiresOn: reviewItem.expiresOn,
        }
        const existing = reviewItem.merge ? next.find((entry) => sameFoodAndUnit(entry, item)) : undefined
        if (existing) {
          existing.quantity = Number((existing.quantity + item.quantity).toFixed(2))
          const existingDate = existing.expiresOn || expirationDateFromDays(existing.expiresIn)
          const itemDate = item.expiresOn || expirationDateFromDays(item.expiresIn)
          if (itemDate && (!existingDate || itemDate < existingDate)) {
            existing.expiresOn = itemDate
            existing.expiresIn = daysUntilDate(itemDate)
          }
          merged += 1
        } else {
          next.push({ ...withExpirationDate(item), id: `${normalize(item.name).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${next.length}` })
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

  function saveCustomRecipe(recipe: Recipe) {
    setCustomRecipes((current) => current.some((entry) => entry.id === recipe.id)
      ? current.map((entry) => entry.id === recipe.id ? recipe : entry)
      : [recipe, ...current])
    setRecipeEditorOpen(false)
    setEditingRecipe(null)
    setSelectedRecipe(null)
    notify(`${recipe.name} saved to My recipes`)
  }

  function deleteCustomRecipe(recipe: Recipe) {
    const previous = customRecipes
    setCustomRecipes((current) => current.filter((entry) => entry.id !== recipe.id))
    setSelectedRecipe(null)
    setToast({
      message: `${recipe.name} deleted`,
      undo: () => {
        setCustomRecipes(previous)
        setToast({ message: 'Recipe restored' })
      },
    })
  }

  if (cloudEnabled && !authReady) return <div className="app-loading"><span className="brand-mark"><Leaf /></span><strong>Opening your kitchen…</strong></div>
  if (cloudEnabled && !session && !demoMode) return <AuthScreen onDemo={() => setDemoMode(true)} />
  if (cloudEnabled && session && !cloudReady) return <div className="app-loading cloud-startup"><span className="brand-mark">{isOnline ? <Leaf /> : <WifiOff />}</span><div><strong>{!isOnline ? 'You are offline' : syncState === 'error' ? 'Kitchen could not load' : 'Opening your kitchen…'}</strong><small>{!isOnline ? 'Reconnect to load this kitchen on this device.' : syncState === 'error' ? 'Your connection is available, but cloud loading failed.' : 'Loading your saved ingredients.'}</small>{(!isOnline || syncState === 'error') && <button onClick={retryKitchenLoad}><RefreshCw /> Try again</button>}</div></div>

  const metadata = session?.user.user_metadata
  const displayName = [metadata?.display_name, metadata?.full_name, metadata?.name, metadata?.given_name]
    .find((value) => typeof value === 'string' && value.trim())?.trim()
    || session?.user.email?.split('@')[0]
    || 'Gourav'
  const greetingName = displayName.split(/\s+/)[0]
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
          <NavButton active={view === 'kitchen'} icon={<PackageOpen />} label="My kitchen" badge={inventory.length} onClick={() => { setKitchenCategory('All'); setView('kitchen') }} />
          <NavButton active={view === 'recipes'} icon={<CookingPot />} label="What can I make?" badge={readyCount} onClick={() => setView('recipes')} />
          <NavButton active={view === 'grocery'} icon={<ShoppingBasket />} label="Grocery list" badge={grocery.filter((item) => !item.checked).length} onClick={() => setView('grocery')} />
          <NavButton active={view === 'settings'} icon={<SettingsIcon />} label="Settings" onClick={() => setView('settings')} />
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
          {session && (syncState === 'error' || syncState === 'offline'
            ? <button className={`sync-state ${syncState}`} onClick={retrySync} title="Retry cloud sync">{syncState === 'offline' ? <WifiOff size={14} /> : <RefreshCw size={14} />} {syncState === 'offline' ? 'Offline' : 'Retry sync'}</button>
            : <span className={`sync-state ${syncState}`}><Cloud size={14} /> {syncState === 'saved' ? 'Saved' : 'Saving…'}</span>)}
          {session && <button className="feedback-button" onClick={() => setFeedbackOpen(true)}><MessageSquareText size={16} /><span>Feedback</span></button>}
          <button className="smart-button" onClick={() => setSmartOpen(true)}><Sparkles size={16} /> Smart add</button>
          <button className="add-button" onClick={() => setAddOpen(true)}><Plus size={18} /> Add ingredients</button>
        </header>

        <div className="page">
          {view === 'home' && <Home displayName={greetingName} inventory={inventory} counts={counts} urgentItems={urgentItems} recipes={recipeMatches} readyCount={readyCount} groceryCount={grocery.filter((item) => !item.checked).length} setView={setView} openKitchen={(category = 'All') => { setKitchenCategory(category); setView('kitchen') }} setSelectedRecipe={setSelectedRecipe} />}
          {view === 'kitchen' && <Kitchen inventory={inventory} setInventory={setInventory} category={kitchenCategory} setCategory={setKitchenCategory} onAdd={() => setAddOpen(true)} onSmartAdd={() => setSmartOpen(true)} onEdit={setEditingItem} />}
          {view === 'recipes' && <Recipes recipes={recipeMatches} inventory={inventory} accessToken={session?.access_token || ''} setSelectedRecipe={setSelectedRecipe} onAdd={() => { setEditingRecipe(null); setRecipeEditorOpen(true) }} onAddToGrocery={addToGrocery} />}
          {view === 'grocery' && <Grocery grocery={grocery} setGrocery={setGrocery} setInventory={setInventory} notify={notify} />}
          {view === 'settings' && <SettingsPage session={session} displayName={displayName} syncState={syncState} isOnline={isOnline} inventoryCount={inventory.length} groceryCount={grocery.length} onRetry={retrySync} onResetPassword={sendPasswordReset} onUpdateName={updateProfileName} onSignOut={leaveAccount} />}
        </div>
      </main>

      {addOpen && <AddFood onClose={() => setAddOpen(false)} onAdd={(item) => { setInventory((current) => [...current, item]); setAddOpen(false); notify(`${item.name} added to your kitchen`) }} />}
      {smartOpen && <SmartAdd inventory={inventory} onClose={() => setSmartOpen(false)} onAdd={addSmartItems} />}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} onSubmit={sendFeedback} />}
      {passwordRecoveryOpen && <PasswordRecoveryModal onClose={() => setPasswordRecoveryOpen(false)} />}
      {editingItem && <AddFood initialItem={editingItem} onClose={() => setEditingItem(null)} onAdd={(item) => { setInventory((current) => current.map((entry) => entry.id === item.id ? item : entry)); setEditingItem(null); notify(`${item.name} updated`) }} />}
      {recipeEditorOpen && <RecipeEditor inventory={inventory} initialRecipe={editingRecipe || undefined} onClose={() => { setRecipeEditorOpen(false); setEditingRecipe(null) }} onSave={saveCustomRecipe} />}
      {selectedRecipe && <RecipeSheet recipe={selectedRecipe} inventory={inventory} onClose={() => setSelectedRecipe(null)} onAction={(scale) => cookRecipe(selectedRecipe, scale)} onEdit={selectedRecipe.source === 'user' ? () => { setEditingRecipe(selectedRecipe); setSelectedRecipe(null); setRecipeEditorOpen(true) } : undefined} onDelete={selectedRecipe.source === 'user' ? () => deleteCustomRecipe(selectedRecipe) : undefined} />}
      {toast && <div className="toast"><Check size={17} /><span>{toast.message}</span>{toast.undo && <button onClick={toast.undo}><Undo2 size={14} /> Undo</button>}</div>}
    </div>
  )
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick} aria-label={label}>{icon}<span>{label}</span>{badge !== undefined && <em>{badge}</em>}</button>
}

function Home({ displayName, inventory, counts, urgentItems, recipes, readyCount, groceryCount, setView, openKitchen, setSelectedRecipe }: {
  displayName: string;
  inventory: InventoryItem[]; counts: { category: Category; count: number }[]; urgentItems: InventoryItem[]; recipes: RecipeMatch[];
  readyCount: number; groceryCount: number; setView: (view: View) => void; openKitchen: (category?: KitchenCategory) => void; setSelectedRecipe: (recipe: RecipeMatch) => void
}) {
  const best = recipes[0]
  return <>
    <section className="welcome">
      <div><span className="eyebrow">Saturday, your kitchen at a glance</span><h1>{getGreeting()}, {displayName}.</h1><p>Everything looks good. A few ingredients are asking to be used soon.</p></div>
      <div className="fresh-score"><span><Leaf size={18} /></span><div><small>Kitchen freshness</small><strong>86%</strong></div></div>
    </section>

    <section className="status-grid">
      <article className="kitchen-card panel">
        <div className="section-heading"><div><span className="eyebrow">Kitchen status</span><h2>{inventory.length} ingredients at home</h2></div><button className="text-button" onClick={() => openKitchen()}>See everything <ArrowRight size={15} /></button></div>
        <div className="category-grid">{counts.filter((entry) => entry.count > 0).map(({ category, count }) => <button key={category} onClick={() => openKitchen(category)}><span>{categoryEmoji[category]}</span><strong>{count}</strong><small>{category}</small></button>)}</div>
      </article>

      <article className="urgent-card panel">
        <div className="section-heading"><div><span className="eyebrow warning"><TriangleAlert size={13} /> Use soon</span><h2>Give these a plan</h2></div></div>
        <div className="urgent-list">{urgentItems.slice(0, 3).map((item) => {
          const days = daysUntilExpiration(item) ?? 0
          return <div key={item.id}><span className="food-icon">{item.emoji}</span><p><strong>{item.name}</strong><small>{days < 0 ? 'Past use-by date' : days === 0 ? 'Use today' : `${days} day${days === 1 ? '' : 's'} left`}</small></p><span className={`day-pill day-${Math.min(Math.max(days, 0), 3)}`}>{days < 0 ? '!' : `${days}d`}</span></div>
        })}</div>
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
    <div className="recipe-art"><span>{recipe.emoji}</span>{recipe.source === 'user' && <b>My recipe</b>}{recipe.urgent > 0 && <em><Leaf size={13} /> Uses {recipe.urgent} use-soon</em>}</div>
    <div className="recipe-info"><div className="match-line"><span className={recipe.missing.length ? 'match almost' : 'match'}>{recipe.missing.length ? `${recipe.available}% match` : 'Ready now'}</span><small><Clock3 size={13} /> {recipe.time} min</small></div><h3>{recipe.name}</h3><p>{recipe.description}</p><div className="recipe-footer"><span>{recipe.protein}g protein</span><strong>{recipe.missing.length ? `Needs ${recipe.missing.length}` : 'Cook this'} <ArrowRight size={14} /></strong></div></div>
  </button>
}

function Kitchen({ inventory, setInventory, category, setCategory, onAdd, onSmartAdd, onEdit }: { inventory: InventoryItem[]; setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>; category: KitchenCategory; setCategory: (category: KitchenCategory) => void; onAdd: () => void; onSmartAdd: () => void; onEdit: (item: InventoryItem) => void }) {
  const [query, setQuery] = useState('')
  const filtered = inventory.filter((item) => (category === 'All' || item.category === category) && normalize(item.name).includes(normalize(query)))
  return <section className="inner-page">
    <div className="page-title"><div><span className="eyebrow">Your ingredients</span><h1>My kitchen</h1><p>Keep a light touch on what you have, where it lives, and what needs attention.</p></div><div className="title-actions"><button className="secondary-button" onClick={onSmartAdd}><Sparkles size={17} /> Smart add</button><button className="primary-button" onClick={onAdd}><CirclePlus size={18} /> Add ingredients</button></div></div>
    <div className="toolbar"><label><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ingredients…" /></label><div className="filter-tabs">{(['All', ...categories] as const).map((option) => <button className={category === option ? 'active' : ''} onClick={() => setCategory(option)} key={option}>{option}</button>)}</div></div>
    <div className="inventory-table panel"><div className="table-head"><span>Ingredient</span><span>Quantity</span><span>Stored in</span><span>Freshness</span><span /></div>{filtered.map((item) => <div className="inventory-row" key={item.id}><button className="ingredient-cell edit-trigger" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}><span>{item.emoji}</span><p><strong>{item.name}</strong><small>{item.category}</small></p></button><div className="quantity-control"><button onClick={() => setInventory((all) => all.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.max(0, Number((entry.quantity - 1).toFixed(1))) } : entry))}><Minus /></button><strong>{item.quantity}</strong><small>{item.unit}</small><button onClick={() => setInventory((all) => all.map((entry) => entry.id === item.id ? { ...entry, quantity: Number((entry.quantity + 1).toFixed(1)) } : entry))}><Plus /></button></div><span className="location-pill">{item.location}</span><Freshness item={item} /><div className="row-actions"><button className="icon-button edit" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`} title="Edit ingredient"><Pencil /></button><button className="icon-button delete" onClick={() => setInventory((all) => all.filter((entry) => entry.id !== item.id))} aria-label={`Delete ${item.name}`} title="Delete ingredient"><Trash2 /></button></div></div>)}</div>
    {!filtered.length && <Empty title="Nothing found" copy="Try another search or add a new ingredient." />}
  </section>
}

function Freshness({ item }: { item: InventoryItem }) {
  const days = daysUntilExpiration(item)
  if (days === null) return <span className="freshness neutral">Shelf stable</span>
  if (days < 0) return <span className="freshness danger">Past use-by</span>
  if (days <= 1) return <span className="freshness danger">Use {days === 0 ? 'today' : 'tomorrow'}</span>
  if (days <= 3) return <span className="freshness soon">{days} days left</span>
  return <span className="freshness fresh">Fresh · {days}d</span>
}

function Recipes({ recipes, inventory, accessToken, setSelectedRecipe, onAdd, onAddToGrocery }: { recipes: RecipeMatch[]; inventory: InventoryItem[]; accessToken: string; setSelectedRecipe: (recipe: RecipeMatch) => void; onAdd: () => void; onAddToGrocery: (items: GroceryItem[]) => void }) {
  const [sort, setSort] = useState<'match' | 'time' | 'urgent'>('match')
  const [filter, setFilter] = useState<'all' | 'mine' | 'ready' | 'quick' | 'protein' | 'discover'>('all')
  const filtered = recipes.filter((recipe) => filter === 'mine' ? recipe.source === 'user' : filter === 'ready' ? recipe.missing.length === 0 : filter === 'quick' ? recipe.time <= 20 : filter === 'protein' ? recipe.protein >= 35 : true)
  const sorted = [...filtered].sort((a, b) => sort === 'time' ? a.time - b.time : sort === 'urgent' ? b.urgent - a.urgent : b.score - a.score)
  return <section className="inner-page">
    <div className="page-title"><div><span className="eyebrow">Cook from what you have</span><h1>What can I make?</h1><p>Your recipes and Mise ideas are ranked by what is already in your kitchen.</p></div><button className="primary-button" onClick={onAdd}><CirclePlus size={18} /> Add my recipe</button></div>
    <div className="recipe-controls"><div className="recipe-filters">{([['all', 'All ideas'], ['mine', 'My recipes'], ['ready', 'Ready now'], ['quick', '20 min or less'], ['protein', 'High protein'], ['discover', 'Discover']] as const).map(([value, label]) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'discover' && <Sparkles size={12} />}{label}</button>)}</div>{filter !== 'discover' && <div className="recipe-toolbar"><span><ListFilter size={16} /> Sort by</span>{(['match', 'time', 'urgent'] as const).map((option) => <button className={sort === option ? 'active' : ''} onClick={() => setSort(option)} key={option}>{option === 'urgent' ? 'Use soon' : option[0].toUpperCase() + option.slice(1)}</button>)}</div>}</div>
    {filter === 'discover' ? <DiscoverRecipes inventory={inventory} accessToken={accessToken} onAddToGrocery={onAddToGrocery} /> : <><div className="recipe-grid full">{sorted.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} featured={index === 0} onClick={() => setSelectedRecipe(recipe)} />)}</div>{!sorted.length && <Empty title="No recipes in this view" copy="Try another filter or add a few more ingredients to your kitchen." />}</>}
  </section>
}

function DiscoverRecipes({ inventory, accessToken, onAddToGrocery }: { inventory: InventoryItem[]; accessToken: string; onAddToGrocery: (items: GroceryItem[]) => void }) {
  const [recipes, setRecipes] = useState<DiscoverRecipe[]>([])
  const [selected, setSelected] = useState<DiscoverRecipe | null>(null)
  const [details, setDetails] = useState<DiscoverRecipeDetails | null>(null)
  const [loading, setLoading] = useState<'search' | 'details' | null>(null)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null)
  const ingredientNames = useMemo(() => [...inventory].sort((a, b) => {
    const aDays = daysUntilExpiration(a) ?? 9999
    const bDays = daysUntilExpiration(b) ?? 9999
    return aDays - bDays
  }).slice(0, 15).map((item) => item.name), [inventory])

  async function search() {
    if (!accessToken || !ingredientNames.length) return
    setLoading('search'); setError(''); setSearched(true)
    try {
      const result = await searchDiscoverRecipes(ingredientNames, accessToken)
      setRecipes(result.data || [])
      const used = result.quota?.used
      if (used !== null && used !== undefined) setQuotaUsed((current) => current === null ? used : Math.max(current, used))
    } catch (searchError) {
      setRecipes([])
      setError(searchError instanceof Error ? searchError.message : 'Recipe discovery failed.')
    } finally { setLoading(null) }
  }

  async function openRecipe(recipe: DiscoverRecipe) {
    setSelected(recipe); setDetails(null); setLoading('details'); setError('')
    try {
      const result = await loadDiscoverRecipe(recipe.id, accessToken)
      setDetails(result.data || null)
      const used = result.quota?.used
      if (used !== null && used !== undefined) setQuotaUsed((current) => current === null ? used : Math.max(current, used))
    } catch (detailError) {
      setSelected(null)
      setError(detailError instanceof Error ? detailError.message : 'Recipe details could not be loaded.')
    } finally { setLoading(null) }
  }

  function addMissing() {
    if (!selected?.missedIngredients.length) return
    onAddToGrocery(selected.missedIngredients.map((item) => ({ name: item.name, amount: item.amount || 1, unit: item.unit || 'item', checked: false })))
    setSelected(null); setDetails(null)
  }

  if (!accessToken) return <div className="discover-empty panel"><Sparkles /><h2>Sign in to discover recipes</h2><p>External discovery is protected so Mise’s shared daily API allowance cannot be drained anonymously.</p></div>
  return <div className="discover-area">
    {!searched && <div className="discover-hero panel"><div><span className="eyebrow"><Sparkles size={12} /> Spoonacular discovery</span><h2>Find more ways to use your kitchen</h2><p>Mise will search with up to 15 ingredients, prioritizing food that should be used soon. A search happens only when you ask, protecting the free daily allowance.</p><div className="discover-chips">{ingredientNames.slice(0, 10).map((name) => <span key={name}>{name}</span>)}</div></div><button className="primary-button" onClick={() => void search()} disabled={!ingredientNames.length || loading === 'search'}>{loading === 'search' ? <RefreshCw className="spin" /> : <Search />} {loading === 'search' ? 'Searching…' : 'Find recipes'}</button></div>}
    {searched && <div className="discover-summary"><div><strong>{recipes.length ? `${recipes.length} new ideas` : 'Recipe discovery'}</strong><small>Based on {ingredientNames.length} kitchen ingredients{quotaUsed !== null ? ` · ${quotaUsed} API points used today` : ''}</small></div><button className="secondary-button" onClick={() => void search()} disabled={loading === 'search'}><RefreshCw className={loading === 'search' ? 'spin' : ''} /> Search again</button></div>}
    {error && <div className="discover-error"><TriangleAlert /> <span>{error}</span></div>}
    {loading === 'search' && searched && <div className="discover-loading"><RefreshCw className="spin" /><strong>Looking beyond your saved recipes…</strong></div>}
    {!loading && searched && !error && !recipes.length && <Empty title="No external matches found" copy="Your Mise recipes are still available. Try again after adding more ingredients." />}
    <div className="discover-grid">{recipes.map((recipe) => <button className="discover-card" key={recipe.id} onClick={() => void openRecipe(recipe)}><div className="discover-image">{recipe.image ? <img src={recipe.image} alt="" /> : <span>🍽️</span>}<em>{recipe.usedIngredientCount} ingredients matched</em></div><div><h3>{recipe.title}</h3><p>{recipe.missedIngredientCount ? `Missing ${recipe.missedIngredientCount} ingredient${recipe.missedIngredientCount === 1 ? '' : 's'}` : 'Ready from your kitchen'}</p><strong>View recipe <ArrowRight /></strong></div></button>)}</div>
    <p className="spoonacular-credit">Recipe discovery powered by <a href="https://spoonacular.com/food-api" target="_blank" rel="noreferrer">Spoonacular <ExternalLink /></a></p>
    {selected && <ExternalRecipeSheet preview={selected} details={details} loading={loading === 'details'} onClose={() => { setSelected(null); setDetails(null) }} onAddMissing={addMissing} />}
  </div>
}

function ExternalRecipeSheet({ preview, details, loading, onClose, onAddMissing }: { preview: DiscoverRecipe; details: DiscoverRecipeDetails | null; loading: boolean; onClose: () => void; onAddMissing: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="external-recipe-sheet" onMouseDown={(event) => event.stopPropagation()}><button className="sheet-close" onClick={onClose} aria-label="Close discovered recipe"><X /></button><div className="external-recipe-image">{preview.image ? <img src={preview.image} alt="" /> : <span>🍽️</span>}<em>Discovered for your kitchen</em></div><div className="external-recipe-body"><span className="eyebrow">Spoonacular recipe</span><h2>{preview.title}</h2>{loading && <div className="discover-loading compact"><RefreshCw className="spin" /> Loading recipe details…</div>}{details && <><div className="sheet-stats"><span><Clock3 /> {details.readyInMinutes || '—'} min</span><span><ChefHat /> {details.servings} servings</span></div><h3>Ingredients</h3><div className="external-ingredients">{details.ingredients.map((item, index) => <div key={`${item.name}-${index}`}><span>{preview.missedIngredients.some((missing) => normalize(missing.name) === normalize(item.name)) ? <Plus /> : <Check />}</span><p><strong>{item.name}</strong><small>{item.original || `${item.amount} ${item.unit}`}</small></p></div>)}</div>{details.instructions.length > 0 && <div className="recipe-steps"><h3>Method</h3><ol>{details.instructions.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol></div>}<div className="external-actions">{preview.missedIngredientCount > 0 && <button className="submit-button" onClick={onAddMissing}>Add {preview.missedIngredientCount} missing item{preview.missedIngredientCount === 1 ? '' : 's'} <ShoppingBasket /></button>}{details.sourceUrl && <a className="secondary-button" href={details.sourceUrl} target="_blank" rel="noreferrer">View full original recipe <ExternalLink /></a>}</div><p className="spoonacular-credit">Powered by <a href="https://spoonacular.com/food-api" target="_blank" rel="noreferrer">Spoonacular <ExternalLink /></a></p></>}</div></section></div>
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
    setInventory((items) => [...items, ...bought.map((item) => ({ id: `${normalize(item.name).replace(/\s/g, '-')}-${Date.now()}`, name: item.name, emoji: '🥫', quantity: item.amount, unit: item.unit, category: 'Other' as Category, location: 'Pantry' as Location, expiresIn: null, expiresOn: null }))])
    setGrocery((items) => items.filter((item) => !item.checked)); notify(`${bought.length} purchased item${bought.length === 1 ? '' : 's'} moved to your kitchen`)
  }
  return <section className="inner-page">
    <div className="page-title"><div><span className="eyebrow">Only what you need</span><h1>Grocery list</h1><p>Missing recipe ingredients land here. When you buy them, send them straight to your kitchen.</p></div>{grocery.some((item) => item.checked) && <button className="primary-button" onClick={moveCheckedToKitchen}><PackageOpen size={18} /> Add purchased to kitchen</button>}</div>
    <div className="grocery-layout"><div className="grocery-list panel"><div className="quick-add"><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManual()} placeholder="Add something you need…" /><button onClick={addManual}><Plus /></button></div>{grocery.map((item, index) => <div className={item.checked ? 'grocery-row checked' : 'grocery-row'} key={`${item.name}-${index}`}><button className="check-box" onClick={() => setGrocery((items) => items.map((entry, i) => i === index ? { ...entry, checked: !entry.checked } : entry))}>{item.checked && <Check />}</button><p><strong>{item.name}</strong><small>{item.amount} {item.unit}</small></p><button className="icon-button" onClick={() => setGrocery((items) => items.filter((_, i) => i !== index))}><X /></button></div>)}{!grocery.length && <Empty title="Your list is clear" copy="Choose an almost-ready recipe or add an item above." />}</div><aside className="grocery-tip"><ShoppingBasket /><h3>Shop lighter</h3><p>Mise only adds what your recipes need and your kitchen doesn’t already have.</p><span>That means fewer duplicates and less food forgotten at the back of the fridge.</span></aside></div>
  </section>
}

function SettingsPage({ session, displayName, syncState, isOnline, inventoryCount, groceryCount, onRetry, onResetPassword, onUpdateName, onSignOut }: {
  session: Session | null; displayName: string; syncState: SyncState; isOnline: boolean; inventoryCount: number; groceryCount: number;
  onRetry: () => void; onResetPassword: () => Promise<void>; onUpdateName: (name: string) => Promise<void>; onSignOut: () => Promise<void>
}) {
  const [name, setName] = useState(displayName)
  const [working, setWorking] = useState<'name' | 'password' | null>(null)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const provider = session?.user.app_metadata.provider === 'google' ? 'Google' : 'Email and password'
  const syncCopy: Record<SyncState, string> = {
    saved: 'Everything is safely stored in your cloud kitchen.',
    syncing: 'Your latest changes are being saved now.',
    error: 'Your changes are safe on this device and waiting to sync.',
    offline: 'You can keep working. Changes will sync when you reconnect.',
  }

  async function saveName(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || name.trim() === displayName) return
    setWorking('name'); setMessage(null)
    try { await onUpdateName(name); setMessage({ type: 'success', text: 'Your name was updated.' }) }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Name could not be updated.' }) }
    finally { setWorking(null) }
  }

  async function resetPassword() {
    setWorking('password'); setMessage(null)
    try { await onResetPassword(); setMessage({ type: 'success', text: 'Check your inbox for the secure password link.' }) }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Reset email could not be sent.' }) }
    finally { setWorking(null) }
  }

  return <section className="inner-page settings-page">
    <div className="page-title"><div><span className="eyebrow">Your Mise</span><h1>Settings</h1><p>Manage your profile, account security, and kitchen sync.</p></div></div>
    {message && <div className={`settings-message ${message.type}`}>{message.text}</div>}
    <div className="settings-grid">
      <article className="settings-card panel">
        <div className="settings-card-head"><span><UserRound /></span><div><h2>Profile</h2><p>How you appear in your kitchen.</p></div></div>
        {session ? <form onSubmit={saveName}><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Email address<input value={session.user.email || ''} disabled /></label><button className="secondary-button" disabled={working === 'name' || !name.trim() || name.trim() === displayName}>{working === 'name' ? 'Saving…' : 'Save profile'}</button></form> : <p className="settings-copy">You are using the local demo. Sign in when you want this kitchen on your other devices.</p>}
      </article>
      <article className="settings-card panel">
        <div className="settings-card-head"><span className={syncState === 'saved' ? 'healthy' : 'warning'}>{syncState === 'offline' ? <WifiOff /> : <Cloud />}</span><div><h2>Kitchen sync</h2><p>{syncCopy[syncState]}</p></div></div>
        <div className="settings-stats"><span><strong>{inventoryCount}</strong> ingredients</span><span><strong>{groceryCount}</strong> grocery items</span><span><strong>{isOnline ? 'Online' : 'Offline'}</strong> connection</span></div>
        {session && syncState !== 'saved' && <button className="secondary-button" onClick={onRetry}><RefreshCw /> Retry sync</button>}
      </article>
      <article className="settings-card panel">
        <div className="settings-card-head"><span><ShieldCheck /></span><div><h2>Account & security</h2><p>{session ? `Signed in with ${provider}.` : 'Local demo mode.'}</p></div></div>
        {session && <div className="settings-actions"><button className="secondary-button" onClick={resetPassword} disabled={working === 'password'}><Mail /> {working === 'password' ? 'Sending…' : 'Send password reset email'}</button><button className="danger-button" onClick={onSignOut}><LogOut /> Sign out</button></div>}
        <p className="privacy-note"><KeyRound /> Mise never stores your password. Authentication is handled securely by Supabase.</p>
      </article>
    </div>
  </section>
}

function SmartAdd({ inventory, onClose, onAdd }: { inventory: InventoryItem[]; onClose: () => void; onAdd: (items: SmartReviewItem[]) => void }) {
  const [entry, setEntry] = useState('2 lb chicken breast, a bag of spinach, 6 eggs')
  const [items, setItems] = useState<SmartReviewItem[]>([])
  const [scan, setScan] = useState<{ phase: 'idle' | 'scanning' | 'ready' | 'error'; progress: number; message: string }>({ phase: 'idle', progress: 0, message: '' })
  const receiptInput = useRef<HTMLInputElement>(null)
  const scanController = useRef<AbortController | null>(null)

  useEffect(() => () => scanController.current?.abort(), [])

  function review(text: string) {
    setItems(parseSmartEntry(text).map((item) => ({
      ...withExpirationDate(item),
      merge: inventory.some((existing) => sameFoodAndUnit(existing, item)),
    })))
  }

  function understand() {
    review(entry)
  }

  async function scanReceipt(file?: File) {
    if (!file) return
    scanController.current?.abort()
    const controller = new AbortController()
    scanController.current = controller
    setItems([])
    setScan({ phase: 'scanning', progress: 0, message: `Preparing ${file.name || 'receipt photo'}…` })
    try {
      const result = await scanReceiptImage(file, ({ progress, status }) => {
        const percent = Math.max(1, Math.round(progress * 100))
        const label = status.includes('recognizing') ? 'Reading receipt text' : 'Preparing receipt scanner'
        setScan({ phase: 'scanning', progress: percent, message: `${label}…` })
      }, controller.signal)
      setEntry(result.text)
      review(result.text)
      setScan({ phase: 'ready', progress: 100, message: 'Receipt text extracted. Review the highlighted details below.' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setScan({ phase: 'error', progress: 0, message: error instanceof Error ? error.message : 'The receipt could not be scanned. Try another photo.' })
    } finally {
      if (scanController.current === controller) scanController.current = null
      if (receiptInput.current) receiptInput.current.value = ''
    }
  }

  function updateItem(id: string, updates: Partial<SmartReviewItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...updates } : item))
  }

  const reviewCount = items.filter((item) => item.confidence === 'low').length

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal smart-modal" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow"><Sparkles size={12} /> Smart Entry 2.0</span><h2>Tell Mise what you bought</h2></div><button type="button" onClick={onClose} aria-label="Close smart add"><X /></button></div>
    <p className="modal-intro">Scan a receipt, type naturally, or paste a list. Mise turns it into editable ingredient suggestions before anything is saved.</p>
    <div className="receipt-scan">
      <input ref={receiptInput} className="receipt-file-input" type="file" accept="image/*" capture="environment" onChange={(event) => void scanReceipt(event.target.files?.[0])} />
      <button type="button" className="receipt-scan-button" disabled={scan.phase === 'scanning'} onClick={() => receiptInput.current?.click()}><Camera size={19} /> {scan.phase === 'scanning' ? 'Scanning receipt…' : 'Scan receipt photo'}</button>
      <div><strong>Photo to editable list</strong><small>Processed on this device. Receipt images are never saved or uploaded to Mise.</small></div>
    </div>
    {scan.phase !== 'idle' && <div className={`receipt-scan-state ${scan.phase}`} role="status" aria-live="polite"><span>{scan.message}</span>{scan.phase === 'scanning' && <div className="receipt-progress" aria-label={`${scan.progress}% complete`}><i style={{ width: `${scan.progress}%` }} /></div>}</div>}
    <div className="smart-divider"><span>or enter items yourself</span></div>
    <label>Grocery note<textarea value={entry} onChange={(event) => { setEntry(event.target.value); setScan({ phase: 'idle', progress: 0, message: '' }) }} placeholder={'Try one item per line:\n2 lb frozen chicken, use within 30 days\n6 eggs\n500 g rice'} /></label>
    <div className="smart-examples"><span>Try an example:</span><button type="button" onClick={() => setEntry('• 4 avocados $5.99\n• 2 cartons of milk $7.98\n• a box of blueberries $4.25')}>Receipt lines</button><button type="button" onClick={() => setEntry('2 lb frozen chicken use within 30 days, 500 g rice, broccoli and a lemon')}>Freezer restock</button></div>
    <button type="button" className="understand-button" onClick={understand} disabled={!entry.trim() || scan.phase === 'scanning'}><Sparkles size={16} /> Review my list</button>
    {items.length > 0 && <div className="smart-results"><div className="smart-results-head"><strong>{items.length} ingredient{items.length === 1 ? '' : 's'} found</strong><span>{reviewCount ? `${reviewCount} need${reviewCount === 1 ? 's' : ''} a quick check` : 'All details recognized'}</span></div><div className="smart-review-list">{items.map((item) => {
      const duplicate = inventory.find((existing) => sameFoodAndUnit(existing, item))
      return <article className="smart-review-card" key={item.id}>
        <div className="smart-review-main"><button type="button" className="smart-emoji" onClick={() => { const current = foodIcons.indexOf(item.emoji); updateItem(item.id, { emoji: foodIcons[(current + 1 + foodIcons.length) % foodIcons.length] }) }} title="Change icon" aria-label={`Change icon for ${item.name}`}>{item.emoji}</button><label>Name<input aria-label={`Name for ${item.name}`} value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} /></label><button type="button" className="icon-button delete" onClick={() => setItems((current) => current.filter((entryItem) => entryItem.id !== item.id))} aria-label={`Remove ${item.name}`}><X /></button></div>
        <div className="smart-review-fields"><label>Quantity<input aria-label={`Quantity for ${item.name}`} type="number" min="0.1" step="0.1" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })} /></label><label>Unit<input aria-label={`Unit for ${item.name}`} value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} /></label><label>Category<select aria-label={`Category for ${item.name}`} value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value as Category })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Stored in<select aria-label={`Storage for ${item.name}`} value={item.location} onChange={(event) => { const nextLocation = event.target.value as Location; updateItem(item.id, { location: nextLocation, expirationWarning: expirationWarning(item.expiresOn, getFoodIntelligence(item.name)?.profile, nextLocation) }) }}><option>Fridge</option><option>Freezer</option><option>Pantry</option></select></label><label>Use by<input aria-label={`Use-by date for ${item.name}`} type="date" value={item.expiresOn || ''} onChange={(event) => { const nextDate = event.target.value || null; updateItem(item.id, { expiresOn: nextDate, expiresIn: daysUntilDate(nextDate), expirationWarning: expirationWarning(nextDate, getFoodIntelligence(item.name)?.profile, item.location) }) }} /></label></div><div className={`smart-confidence ${item.confidence}`}><Sparkles size={12} /> {item.explanation}</div>
        {item.expirationWarning && <div className="expiration-warning"><TriangleAlert size={13} /> {item.expirationWarning}</div>}
        {duplicate && <label className="duplicate-choice"><input type="checkbox" checked={item.merge} onChange={(event) => updateItem(item.id, { merge: event.target.checked })} /><span><strong>Already in your kitchen</strong>{item.merge ? `Add to the existing ${duplicate.quantity} ${duplicate.unit}` : 'Keep this as a separate item'}</span></label>}
      </article>
    })}</div><button className="submit-button" type="button" disabled={!items.some((item) => item.name.trim() && item.quantity > 0)} onClick={() => onAdd(items)}>Save {items.length} ingredient{items.length === 1 ? '' : 's'} <ArrowRight /></button></div>}
  </section></div>
}

function PasswordRecoveryModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase || password.length < 6) return
    if (password !== confirmation) { setMessage({ type: 'error', text: 'The passwords do not match.' }); return }
    setLoading(true); setMessage(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setMessage({ type: 'error', text: error.message }); return }
    setMessage({ type: 'success', text: 'Password updated. You can continue using Mise.' })
  }

  return <div className="modal-backdrop"><form className="modal recovery-modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow"><KeyRound size={12} /> Account recovery</span><h2>Choose a new password</h2></div>{message?.type === 'success' && <button type="button" onClick={onClose} aria-label="Close password recovery"><X /></button>}</div><p className="modal-intro">Use at least six characters. This will replace your previous email password.</p><label>New password<input autoFocus required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label><label>Confirm password<input required minLength={6} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" /></label>{message && <div className={`auth-message ${message.type}`}>{message.text}</div>}<button className="submit-button" disabled={loading || password.length < 6 || confirmation.length < 6}>{loading ? 'Updating…' : 'Update password'} <ArrowRight /></button></form></div>
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
  const [expiresOn, setExpiresOn] = useState(initialItem ? (initialItem.expiresOn || expirationDateFromDays(initialItem.expiresIn) || '') : (expirationDateFromDays(7) || ''))
  const [freshnessState, setFreshnessState] = useState<FreshnessState>('purchased')
  const intelligence = useMemo(() => getFoodIntelligence(name), [name])
  const dateWarning = useMemo(() => expirationWarning(expiresOn, intelligence?.profile, location), [expiresOn, intelligence, location])
  function applyIntelligence() {
    if (!intelligence) return
    const profile = intelligence.profile
    setName(profile.name)
    setEmoji(profile.emoji)
    setUnit(profile.defaultUnit)
    setCategory(profile.category)
    setLocation(profile.location)
    setExpiresOn(suggestedExpirationDate(profile, profile.location, freshnessState) || '')
  }
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (!name.trim()) return
    onAdd({ id: initialItem?.id || `${normalize(name).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`, name: name.trim(), emoji, quantity, unit, category, location, expiresIn: daysUntilDate(expiresOn), expiresOn: expiresOn || null })
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{initialItem ? 'Update your kitchen' : 'Stock your kitchen'}</span><h2>{initialItem ? 'Edit ingredient' : 'Add an ingredient'}</h2></div><button type="button" onClick={onClose} aria-label="Close ingredient form"><X /></button></div><label>Food name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Avocados" /></label>{!initialItem && intelligence && <div className="food-intelligence-suggestion"><span>{intelligence.profile.emoji}</span><div><strong>Mise recognizes {intelligence.profile.name}</strong><small>{intelligence.profile.category} · {intelligence.profile.location} · about {intelligence.profile.shelfLifeDays ?? '—'} days</small></div><button type="button" onClick={applyIntelligence}>Use suggestions</button></div>}<fieldset className="icon-picker"><legend>Choose an icon</legend><div>{foodIcons.map((icon) => <button key={icon} type="button" className={emoji === icon ? 'selected' : ''} onClick={() => setEmoji(icon)} aria-label={`Use ${icon} icon`} aria-pressed={emoji === icon}>{icon}</button>)}</div></fieldset><div className="form-row"><label>Quantity<input type="number" min="0.1" step="0.1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label><label>Unit<input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="items" /></label></div><div className="form-row"><label>Category<select value={category} onChange={(e) => setCategory(e.target.value as Category)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Stored in<select value={location} onChange={(e) => { const nextLocation = e.target.value as Location; setLocation(nextLocation); if (!initialItem && intelligence) setExpiresOn(suggestedExpirationDate(intelligence.profile, nextLocation, freshnessState) || '') }}><option>Fridge</option><option>Freezer</option><option>Pantry</option></select></label></div><div className="form-row">{!initialItem && intelligence && <label>Freshness status<select value={freshnessState} onChange={(e) => { const nextState = e.target.value as FreshnessState; setFreshnessState(nextState); setExpiresOn(suggestedExpirationDate(intelligence.profile, location, nextState) || '') }}><option value="purchased">Purchased today</option><option value="opened">Opened today</option></select></label>}<label>Use-by date<input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></label></div>{dateWarning && <div className="expiration-warning"><TriangleAlert size={13} /> {dateWarning}</div>}<button className="submit-button" type="submit">{initialItem ? 'Save changes' : 'Add to my kitchen'} <ArrowRight /></button></form></div>
}

function RecipeEditor({ inventory, initialRecipe, onClose, onSave }: { inventory: InventoryItem[]; initialRecipe?: Recipe; onClose: () => void; onSave: (recipe: Recipe) => void }) {
  const [name, setName] = useState(initialRecipe?.name || '')
  const [description, setDescription] = useState(initialRecipe?.description || '')
  const [emoji, setEmoji] = useState(initialRecipe?.emoji || '🍳')
  const [time, setTime] = useState(initialRecipe?.time || 20)
  const [servings, setServings] = useState(initialRecipe?.servings || 2)
  const [protein, setProtein] = useState(initialRecipe?.protein || 0)
  const [ingredients, setIngredients] = useState<Recipe['ingredients']>(initialRecipe?.ingredients || [{ name: '', amount: 1, unit: 'item' }])
  const [instructions, setInstructions] = useState((initialRecipe?.instructions || []).join('\n'))

  function updateIngredient(index: number, updates: Partial<Recipe['ingredients'][number]>) {
    setIngredients((current) => current.map((ingredient, ingredientIndex) => ingredientIndex === index ? { ...ingredient, ...updates } : ingredient))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const validIngredients = ingredients.filter((ingredient) => ingredient.name.trim() && ingredient.amount > 0 && ingredient.unit.trim())
    if (!name.trim() || !validIngredients.length) return
    onSave({
      id: initialRecipe?.id || `user-${normalize(name).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      name: name.trim(), description: description.trim(), emoji, time: Math.max(1, time),
      servings: Math.max(1, servings), protein: Math.max(0, protein), accent: initialRecipe?.accent || '#678669',
      ingredients: validIngredients.map((ingredient) => ({ ...ingredient, name: ingredient.name.trim(), unit: ingredient.unit.trim() })),
      instructions: instructions.split('\n').map((step) => step.trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean),
      source: 'user',
    })
  }

  const valid = name.trim() && ingredients.some((ingredient) => ingredient.name.trim() && ingredient.amount > 0 && ingredient.unit.trim())
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal recipe-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">My recipes</span><h2>{initialRecipe ? 'Edit your recipe' : 'Add your own recipe'}</h2></div><button type="button" onClick={onClose} aria-label="Close recipe form"><X /></button></div><p className="modal-intro">Mise will compare these ingredients with your kitchen and automatically show what is ready or missing.</p><div className="recipe-basics"><label className="recipe-emoji-field">Icon<button type="button" onClick={() => { const current = foodIcons.indexOf(emoji); setEmoji(foodIcons[(current + 1 + foodIcons.length) % foodIcons.length]) }}>{emoji}</button></label><label>Recipe name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sunday vegetable soup" /></label></div><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short note about this recipe…" /></label><div className="recipe-number-fields"><label>Time (min)<input type="number" min="1" value={time} onChange={(event) => setTime(Number(event.target.value))} /></label><label>Servings<input type="number" min="1" max="24" value={servings} onChange={(event) => setServings(Number(event.target.value))} /></label><label>Protein / serving (g)<input type="number" min="0" step="1" value={protein} onChange={(event) => setProtein(Number(event.target.value))} /></label></div><div className="recipe-editor-heading"><div><strong>Ingredients</strong><small>Use the same units as your kitchen for accurate matching.</small></div><button type="button" onClick={() => setIngredients((current) => [...current, { name: '', amount: 1, unit: 'item' }])}><Plus /> Add</button></div><datalist id="kitchen-ingredient-names">{inventory.map((item) => <option key={item.id} value={item.name} />)}</datalist><div className="recipe-ingredient-editor">{ingredients.map((ingredient, index) => <div key={index}><label>Name<input list="kitchen-ingredient-names" required value={ingredient.name} onChange={(event) => { const matched = inventory.find((item) => normalize(item.name) === normalize(event.target.value)); updateIngredient(index, { name: event.target.value, ...(matched ? { unit: matched.unit } : {}) }) }} placeholder="Ingredient" /></label><label>Amount<input type="number" min="0.01" step="0.01" value={ingredient.amount} onChange={(event) => updateIngredient(index, { amount: Number(event.target.value) })} /></label><label>Unit<input required value={ingredient.unit} onChange={(event) => updateIngredient(index, { unit: event.target.value })} placeholder="cup" /></label><button type="button" className="icon-button delete" onClick={() => setIngredients((current) => current.filter((_, ingredientIndex) => ingredientIndex !== index))} disabled={ingredients.length === 1} aria-label={`Remove ingredient ${index + 1}`}><Trash2 /></button></div>)}</div><label>Method<textarea className="recipe-method" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder={'One step per line\nPrepare the ingredients\nCook until tender\nServe and enjoy'} /></label><button className="submit-button" disabled={!valid}>{initialRecipe ? 'Save recipe changes' : 'Add to My recipes'} <ArrowRight /></button></form></div>
}

function RecipeSheet({ recipe, inventory, onClose, onAction, onEdit, onDelete }: { recipe: RecipeMatch; inventory: InventoryItem[]; onClose: () => void; onAction: (scale: number) => void; onEdit?: () => void; onDelete?: () => void }) {
  const [servings, setServings] = useState(recipe.servings)
  const scale = servings / recipe.servings
  const ingredientStatus = recipe.ingredients.map((ingredient) => {
    const needed = Number((ingredient.amount * scale).toFixed(2))
    const have = inventory.find((item) => normalize(item.name) === normalize(ingredient.name))?.quantity || 0
    return { ...ingredient, needed, missing: have < needed }
  })
  const missingCount = ingredientStatus.filter((ingredient) => ingredient.missing).length
  const match = Math.round(((ingredientStatus.length - missingCount) / ingredientStatus.length) * 100)
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="recipe-sheet" onMouseDown={(e) => e.stopPropagation()}><button className="sheet-close" onClick={onClose} aria-label="Close recipe"><X /></button><div className="sheet-art" style={{ '--accent': recipe.accent } as React.CSSProperties}><span>{recipe.emoji}</span><em>{missingCount ? `${match}% match` : 'Everything available'}</em></div><div className="sheet-body">{recipe.source === 'user' && <div className="recipe-owner-actions"><span>My recipe</span><button onClick={onEdit}><Pencil /> Edit</button><button className="delete" onClick={onDelete}><Trash2 /> Delete</button></div>}<span className="eyebrow">Your kitchen match</span><h2>{recipe.name}</h2><p>{recipe.description}</p><div className="sheet-stats"><span><Clock3 /> {recipe.time} min</span><span><Sparkles /> {recipe.protein}g protein</span></div><div className="serving-control"><div><strong>Servings</strong><small>Ingredients update automatically</small></div><div><button onClick={() => setServings((value) => Math.max(1, value - 1))}><Minus /></button><strong>{servings}</strong><button onClick={() => setServings((value) => Math.min(12, value + 1))}><Plus /></button></div></div><h3>From your kitchen</h3><div className="ingredient-list">{ingredientStatus.map((ingredient) => <div className={ingredient.missing ? 'missing' : ''} key={`${ingredient.name}-${ingredient.unit}`}><span>{ingredient.missing ? <Plus /> : <Check />}</span><strong>{ingredient.name}</strong><small>{ingredient.needed} {ingredient.unit}</small></div>)}</div>{recipe.urgent > 0 && <div className="rescue-note"><Leaf /> This meal uses {recipe.urgent} ingredient{recipe.urgent === 1 ? '' : 's'} that should be enjoyed soon.</div>}{Boolean(recipe.instructions?.length) && <div className="recipe-steps"><h3>Method</h3><ol>{recipe.instructions!.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol></div>}<button className="submit-button" onClick={() => onAction(scale)}>{missingCount ? `Add ${missingCount} missing item${missingCount === 1 ? '' : 's'} to grocery list` : `Cook ${servings} servings & update my kitchen`} <ArrowRight /></button></div></section></div>
}

function Empty({ title, copy }: { title: string; copy: string }) { return <div className="empty"><PackageOpen /><strong>{title}</strong><p>{copy}</p></div> }

export default App
