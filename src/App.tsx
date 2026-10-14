import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUp, BellRing, Bookmark, BookmarkCheck, CalendarDays, Camera, Check, ChefHat, ChevronLeft, ChevronRight, CirclePlus, Clock3, Cloud, CookingPot, Copy,
  ExternalLink, House, KeyRound, Leaf, LogOut, Mail, MessageSquareText, Minus, PackageOpen, Pencil, Plus, RefreshCw, Search, Send,
  Settings as SettingsIcon, ShieldCheck, ShoppingBasket, Sparkles, Trash2, TriangleAlert, Undo2, UserPlus, UserRound, UsersRound, WifiOff, X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import AuthScreen from './AuthScreen'
import { recipes, seedInventory } from './data'
import { cookingHistoryEntry, cookingHistoryStats, recentCookingHistory } from './cookingHistory'
import { expirationWarning, suggestedExpirationDate, type FreshnessState } from './expirationIntelligence'
import { daysUntilDate, daysUntilExpiration, expirationDateFromDays, withExpirationDate } from './freshness'
import { foodCatalog, getFoodIntelligence } from './foodCatalog'
import { addOrUpdateStaple, groceryFromStaples, moveStaple, moveStapleGroup, orderedStapleGroups, orderedStaples } from './groceryStaples'
import { inviteCodeIsValid, normalizeInviteCode } from './household'
import { groceryCategory, groceryEmoji, groceryItemsFromText, inventoryItemFromGrocery, mergeGroceryItems, mergeInventoryItems } from './inventoryIntelligence'
import { dietPreferences, emptyFoodPreferences, foodIntolerances, foodPreferenceSummary } from './foodPreferences'
import { addWeeks, applyMealPlanTemplate, copyMealPlanDay, groceryForMealPlan, localDateKey, mealPlanEntryId, mealPlanTemplateFromWeek, mealSlots, repeatMealPlanWeek, startOfWeek, weekDates } from './mealPlanner'
import { defaultMealReminderPreferences, mealReminderLabel, mealRemindersForToday, normalizeMealReminderPreferences, type MealReminder, type MealReminderPreferences } from './mealReminders'
import { availableAmount, deductIngredients, formatAmount } from './measurements'
import { isNewerKitchenMessage, releaseSyncLease, sameKitchenContents, syncLeaseKey, tryAcquireSyncLease } from './multiTabSync'
import { matchRecipes, type RecipeMatch } from './recipeIntelligence'
import { recipeIcons } from './recipeIcons'
import { mergeRecipeIngredients, parseRecipeIngredients } from './recipeIngredients'
import { scanReceiptImage } from './receiptScanner'
import { saveableDiscoveredRecipe } from './savedRecipe'
import { loadDiscoverRecipe, searchDiscoverRecipes, type DiscoverRecipe, type DiscoverRecipeDetails } from './spoonacular'
import { normalizeFoodName, parseSmartEntry, sameFoodAndUnit } from './smartEntry'
import type { SmartEntryItem } from './smartEntry'
import { cloudEnabled, createHouseholdInvite, deleteCookingHistoryEntry, deleteMealPlanTemplate, getHouseholdId, joinHousehold, loadActiveHouseholdInvite, loadCloudKitchen, loadFoodPreferences, loadHouseholdActivity, loadHouseholdMembers, loadHouseholds, markHouseholdInitialized, removeHouseholdMember, renameHousehold, revokeHouseholdInvite, saveCookingHistoryEntry, saveFoodPreferences, saveKitchenSnapshot, setActiveHousehold, setMiseRecipeHidden, submitFeedback, supabase, updateHouseholdMemberRole } from './supabase'
import { createLatestSaveQueue, withRetry } from './sync'
import type { Category, CookingHistoryEntry, FoodIntolerance, FoodPreferences, GroceryItem, GroceryStaple, GroceryStapleGroup, HouseholdActivity, HouseholdInvite, HouseholdMember, HouseholdSummary, InventoryItem, Location, MealPlanEntry, MealPlanTemplate, MealSlot, Recipe } from './types'

type View = 'home' | 'kitchen' | 'recipes' | 'planner' | 'grocery' | 'settings'
type KitchenCategory = 'All' | Category
type SyncState = 'saved' | 'syncing' | 'error' | 'offline' | 'conflict'
type SmartReviewItem = SmartEntryItem & { merge: boolean }
type ToastState = { message: string; undo?: () => void }
type StoredKitchen = { householdId: string; inventory: InventoryItem[]; grocery: GroceryItem[]; stapleGroups?: GroceryStapleGroup[]; staples?: GroceryStaple[]; recipes?: Recipe[]; mealPlan?: MealPlanEntry[]; mealPlanTemplates?: MealPlanTemplate[]; cookingHistory?: CookingHistoryEntry[]; hiddenMiseRecipeIds?: string[]; savedAt: string }
type KitchenSyncMessage = { type: 'kitchen-saved'; senderId: string; revision: number; snapshot: StoredKitchen }

const categories: Category[] = ['Protein', 'Produce', 'Dairy', 'Pantry', 'Other']
const categoryEmoji: Record<Category, string> = { Protein: '🥩', Produce: '🥬', Dairy: '🥛', Pantry: '🌾', Other: '🧂' }
const foodIcons = Array.from(new Set(foodCatalog.map((profile) => profile.emoji)))

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

function localId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : fallback
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
  const [stapleGroups, setStapleGroups] = useState<GroceryStapleGroup[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-staple-groups-v1') || '') || [] } catch { return [] }
  })
  const [staples, setStaples] = useState<GroceryStaple[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-staples-v1') || '') || [] } catch { return [] }
  })
  const [customRecipes, setCustomRecipes] = useState<Recipe[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-recipes-v1') || '') || [] } catch { return [] }
  })
  const [foodPreferences, setFoodPreferences] = useState<FoodPreferences>(() => {
    try { return JSON.parse(localStorage.getItem('mise-food-preferences-v1') || '') || emptyFoodPreferences } catch { return emptyFoodPreferences }
  })
  const [mealReminderPreferences, setMealReminderPreferences] = useState<MealReminderPreferences>(() => {
    try { return normalizeMealReminderPreferences(JSON.parse(localStorage.getItem('mise-meal-reminders-v1') || 'null')) } catch { return defaultMealReminderPreferences }
  })
  const [clock, setClock] = useState(() => new Date())
  const [mealPlan, setMealPlan] = useState<MealPlanEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-meal-plan-v1') || '') || [] } catch { return [] }
  })
  const [mealPlanTemplates, setMealPlanTemplates] = useState<MealPlanTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-meal-plan-templates-v1') || '') || [] } catch { return [] }
  })
  const [cookingHistory, setCookingHistory] = useState<CookingHistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-cooking-history-v1') || '') || [] } catch { return [] }
  })
  const [hiddenMiseRecipeIds, setHiddenMiseRecipeIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-hidden-recipes-v1') || '') || [] } catch { return [] }
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
  const starterStapleGroups = useRef(stapleGroups)
  const starterStaples = useRef(staples)
  const starterRecipes = useRef(customRecipes)
  const starterMealPlan = useRef(mealPlan)
  const starterMealPlanTemplates = useRef(mealPlanTemplates)
  const mealPlanTemplatesDirty = useRef(false)
  const saveQueue = useRef(createLatestSaveQueue())
  const tabId = useRef(crypto.randomUUID())
  const syncChannel = useRef<BroadcastChannel | null>(null)
  const syncRevision = useRef(0)
  const localChangesPending = useRef(false)
  const syncConflict = useRef(false)
  const applyingRemoteSnapshot = useRef(false)
  const skipNextCloudSave = useRef(false)

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
    const timer = window.setInterval(() => setClock(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!authReady || !window.location.href.endsWith('#')) return
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  }, [authReady])

  useEffect(() => {
    if (!session || demoMode) return
    let active = true
    async function hydrate() {
      setCloudReady(false)
      try {
        const localKitchen = readStoredKitchen('pending', session!.user.id) || readStoredKitchen('cache', session!.user.id)
        if (!isOnline) {
          if (localKitchen) {
            setHouseholdId(localKitchen.householdId)
            setInventory(localKitchen.inventory.map((item) => withExpirationDate(item)))
            setGrocery(localKitchen.grocery)
            setStapleGroups(localKitchen.stapleGroups || [])
            setStaples(localKitchen.staples || [])
            setCustomRecipes(localKitchen.recipes || [])
            setMealPlan(localKitchen.mealPlan || [])
            setMealPlanTemplates(localKitchen.mealPlanTemplates || [])
            setCookingHistory(localKitchen.cookingHistory || [])
            setHiddenMiseRecipeIds(localKitchen.hiddenMiseRecipeIds || [])
            setCloudReady(true)
          }
          setSyncState('offline')
          return
        }
        setSyncState('syncing')
        const id = await getHouseholdId()
        if (!id) throw new Error('No kitchen was created for this account.')
        const cloud = await loadCloudKitchen(id)
        if (!active) return
        syncRevision.current = Date.now()
        syncConflict.current = false
        setHouseholdId(id)
        const pending = readStoredKitchen('pending', session!.user.id)
        if (pending?.householdId === id) {
          const pendingTemplates = pending.mealPlanTemplates || []
          const pendingTemplateIds = new Set(pendingTemplates.map((template) => template.id))
          const mergedTemplates = [...pendingTemplates, ...cloud.mealPlanTemplates.filter((template) => !pendingTemplateIds.has(template.id))]
          setInventory(pending.inventory.map((item) => withExpirationDate(item)))
          setGrocery(pending.grocery)
          setStapleGroups(pending.stapleGroups || [])
          setStaples(pending.staples || [])
          setCustomRecipes(pending.recipes || [])
          setMealPlan(pending.mealPlan || [])
          setMealPlanTemplates(mergedTemplates)
          setCookingHistory(pending.cookingHistory || cloud.cookingHistory)
          mealPlanTemplatesDirty.current = pendingTemplates.length > 0
          setHiddenMiseRecipeIds(pending.hiddenMiseRecipeIds || [])
        } else if (!cloud.initialized) {
          const initialInventory = starterInventory.current.length ? starterInventory.current : seedInventory.map((item) => withExpirationDate(item))
          setInventory(initialInventory)
          setCustomRecipes(starterRecipes.current)
          setMealPlan(starterMealPlan.current)
          setMealPlanTemplates(starterMealPlanTemplates.current)
          setCookingHistory([])
          mealPlanTemplatesDirty.current = false
          setHiddenMiseRecipeIds([])
          setStapleGroups(starterStapleGroups.current)
          setStaples(starterStaples.current)
          await saveKitchenSnapshot(id, { inventory: initialInventory, grocery: starterGrocery.current, stapleGroups: starterStapleGroups.current, staples: starterStaples.current, recipes: starterRecipes.current, mealPlan: starterMealPlan.current, mealPlanTemplates: starterMealPlanTemplates.current })
          await markHouseholdInitialized(id)
        } else {
          setInventory(cloud.inventory)
          setGrocery(cloud.grocery)
          setStapleGroups(cloud.stapleGroups)
          setStaples(cloud.staples)
          setCustomRecipes(cloud.recipes)
          setMealPlan(cloud.mealPlan)
          setMealPlanTemplates(cloud.mealPlanTemplates)
          setCookingHistory(cloud.cookingHistory)
          mealPlanTemplatesDirty.current = false
          setHiddenMiseRecipeIds(cloud.hiddenMiseRecipeIds)
          writeStoredKitchen('cache', session!.user.id, { householdId: id, inventory: cloud.inventory, grocery: cloud.grocery, stapleGroups: cloud.stapleGroups, staples: cloud.staples, recipes: cloud.recipes, mealPlan: cloud.mealPlan, mealPlanTemplates: cloud.mealPlanTemplates, cookingHistory: cloud.cookingHistory, hiddenMiseRecipeIds: cloud.hiddenMiseRecipeIds, savedAt: new Date().toISOString() })
        }
        // Enable outbound sync on the next task so every hydrated collection has
        // rendered before the snapshot effect can run. Without this boundary, a
        // newly introduced collection can briefly save its empty initial state.
        window.setTimeout(() => {
          if (!active) return
          localChangesPending.current = Boolean(pending?.householdId === id)
          skipNextCloudSave.current = !pending?.householdId || pending.householdId !== id
          setCloudReady(true)
          setSyncState(pending?.householdId === id ? 'syncing' : 'saved')
        }, 0)
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
    if (!session || demoMode) localStorage.setItem('mise-staple-groups-v1', JSON.stringify(stapleGroups))
  }, [stapleGroups, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-staples-v1', JSON.stringify(staples))
  }, [staples, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-recipes-v1', JSON.stringify(customRecipes))
  }, [customRecipes, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-food-preferences-v1', JSON.stringify(foodPreferences))
  }, [foodPreferences, session, demoMode])
  useEffect(() => {
    localStorage.setItem('mise-meal-reminders-v1', JSON.stringify(mealReminderPreferences))
  }, [mealReminderPreferences])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-meal-plan-v1', JSON.stringify(mealPlan))
  }, [mealPlan, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-meal-plan-templates-v1', JSON.stringify(mealPlanTemplates))
  }, [mealPlanTemplates, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-cooking-history-v1', JSON.stringify(cookingHistory))
  }, [cookingHistory, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-hidden-recipes-v1', JSON.stringify(hiddenMiseRecipeIds))
  }, [hiddenMiseRecipeIds, session, demoMode])

  useEffect(() => {
    if (!session || demoMode) return
    let active = true
    loadFoodPreferences(session.user.id)
      .then((preferences) => { if (active) setFoodPreferences(preferences) })
      .catch((error) => console.error('Food preferences could not be loaded.', error))
    return () => { active = false }
  }, [session, demoMode])

  useEffect(() => {
    if (!session || !householdId || !cloudReady || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(`mise-kitchen-sync-v1-${session.user.id}-${householdId}`)
    syncChannel.current = channel
    channel.onmessage = (event: MessageEvent<KitchenSyncMessage>) => {
      const message = event.data
      if (message?.type !== 'kitchen-saved' || message.snapshot.householdId !== householdId) return
      if (!isNewerKitchenMessage(syncRevision.current, message.revision, message.senderId, tabId.current)) return
      const pending = readStoredKitchen('pending', session.user.id)
      const matchesPending = pending?.householdId === householdId && sameKitchenContents(pending as unknown as Record<string, unknown>, message.snapshot as unknown as Record<string, unknown>)
      if ((localChangesPending.current || syncConflict.current) && !matchesPending) {
        syncConflict.current = true
        setSyncState('conflict')
        return
      }
      syncConflict.current = false
      applyingRemoteSnapshot.current = true
      syncRevision.current = message.revision
      const snapshot = message.snapshot
      setInventory(snapshot.inventory.map((item) => withExpirationDate(item)))
      setGrocery(snapshot.grocery)
      setStapleGroups(snapshot.stapleGroups || [])
      setStaples(snapshot.staples || [])
      setCustomRecipes(snapshot.recipes || [])
      setMealPlan(snapshot.mealPlan || [])
      setMealPlanTemplates(snapshot.mealPlanTemplates || [])
      mealPlanTemplatesDirty.current = false
      setCookingHistory(snapshot.cookingHistory || [])
      setHiddenMiseRecipeIds(snapshot.hiddenMiseRecipeIds || [])
      writeStoredKitchen('cache', session.user.id, snapshot)
      localStorage.removeItem(kitchenStorageKey('pending', session.user.id))
      setSyncState('saved')
    }
    return () => {
      channel.close()
      if (syncChannel.current === channel) syncChannel.current = null
    }
  }, [session, householdId, cloudReady])

  useEffect(() => {
    if (!householdId || !cloudReady || !session) return
    if (applyingRemoteSnapshot.current) {
      applyingRemoteSnapshot.current = false
      localChangesPending.current = false
      return
    }
    if (skipNextCloudSave.current) {
      skipNextCloudSave.current = false
      localChangesPending.current = false
      return
    }
    if (syncConflict.current) { setSyncState('conflict'); return }
    const reservation = saveQueue.current.reserve()
    const templatesForCloud = mealPlanTemplatesDirty.current ? mealPlanTemplates : undefined
    const snapshot = { householdId, inventory, grocery, stapleGroups, staples, recipes: customRecipes, mealPlan, mealPlanTemplates, cookingHistory, hiddenMiseRecipeIds, savedAt: new Date().toISOString() }
    localChangesPending.current = true
    writeStoredKitchen('pending', session.user.id, snapshot)
    const timer = window.setTimeout(async () => {
      if (!isOnline) { setSyncState('offline'); return }
      if (syncConflict.current) { setSyncState('conflict'); return }
      setSyncState('syncing')
      const leaseKey = syncLeaseKey(session.user.id, householdId)
      if (!tryAcquireSyncLease(localStorage, leaseKey, tabId.current)) {
        window.setTimeout(() => setRetryToken((value) => value + 1), 700)
        return
      }
      const result = await reservation.run(async () => {
        try {
          await withRetry(() => saveKitchenSnapshot(householdId, { inventory, grocery, stapleGroups, staples, recipes: customRecipes, mealPlan, mealPlanTemplates: templatesForCloud }))
        } finally {
          releaseSyncLease(localStorage, leaseKey, tabId.current)
        }
      })
      if (!result.latest) return
      if (!result.error) {
        localStorage.removeItem(kitchenStorageKey('pending', session.user.id))
        writeStoredKitchen('cache', session.user.id, snapshot)
        if (templatesForCloud) mealPlanTemplatesDirty.current = false
        localChangesPending.current = false
        const revision = Date.now()
        syncRevision.current = revision
        syncChannel.current?.postMessage({ type: 'kitchen-saved', senderId: tabId.current, revision, snapshot } satisfies KitchenSyncMessage)
        setSyncState('saved')
      } else {
        console.error(result.error instanceof Error ? result.error.message : String(result.error))
        setSyncState(navigator.onLine ? 'error' : 'offline')
      }
    }, retryToken ? 50 : 450)
    return () => window.clearTimeout(timer)
  }, [inventory, grocery, stapleGroups, staples, customRecipes, mealPlan, mealPlanTemplates, cookingHistory, hiddenMiseRecipeIds, householdId, cloudReady, session, isOnline, retryToken])

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
    () => matchRecipes([...customRecipes, ...recipes.filter((recipe) => !hiddenMiseRecipeIds.includes(recipe.id))], inventory, foodPreferences),
    [customRecipes, hiddenMiseRecipeIds, inventory, foodPreferences],
  )
  const todayMealReminders = useMemo(
    () => mealRemindersForToday(mealPlan, recipeMatches, clock, mealReminderPreferences),
    [mealPlan, recipeMatches, clock, mealReminderPreferences],
  )

  const urgentItems = [...inventory].filter((item) => {
    const days = daysUntilExpiration(item)
    return days !== null && days <= 3
  }).sort((a, b) => Number(daysUntilExpiration(a)) - Number(daysUntilExpiration(b)))
  const counts = categories.map((category) => ({ category, count: inventory.filter((item) => item.category === category).length }))
  const readyCount = recipeMatches.filter((recipe) => recipe.missing.length === 0).length

  function notify(message: string) { setToast({ message }) }

  const updateMealPlanTemplates: React.Dispatch<React.SetStateAction<MealPlanTemplate[]>> = (update) => {
    mealPlanTemplatesDirty.current = true
    setMealPlanTemplates(update)
  }

  async function removeMealPlanTemplate(templateId: string) {
    if (!householdId || !session || demoMode) return
    await withRetry(() => deleteMealPlanTemplate(householdId, templateId))
  }

  function retrySync() {
    if (syncConflict.current) {
      if (!window.confirm('Reload the newest kitchen from the cloud? Unsaved changes in this tab will be discarded.')) return
      syncConflict.current = false
      localChangesPending.current = false
      if (session) localStorage.removeItem(kitchenStorageKey('pending', session.user.id))
      setCloudReady(false)
      setSyncState('syncing')
      setLoadRetryToken((value) => value + 1)
      return
    }
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
    if (!supabase || !session) throw new Error('Profile updates are unavailable.')
    const displayName = name.trim()
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } })
    if (error) throw error
    const { error: profileError } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', session.user.id)
    if (profileError) throw profileError
    notify('Profile name updated')
  }

  async function updateFoodPreferences(preferences: FoodPreferences) {
    if (session) await saveFoodPreferences(session.user.id, preferences)
    setFoodPreferences(preferences)
    notify('Food preferences saved')
  }

  async function activateHousehold(nextHouseholdId: string) {
    if (!session || !householdId || nextHouseholdId === householdId) return
    if (syncState !== 'saved') throw new Error('Wait for your current kitchen to finish saving, then try again.')
    const previousHouseholdId = householdId
    setCloudReady(false)
    setHouseholdId(null)
    try {
      await setActiveHousehold(nextHouseholdId)
      setLoadRetryToken((value) => value + 1)
    } catch (error) {
      setHouseholdId(previousHouseholdId)
      setCloudReady(true)
      throw error
    }
  }

  async function joinSharedHousehold(code: string) {
    if (!session || !householdId) throw new Error('Sign in before joining a shared kitchen.')
    if (syncState !== 'saved') throw new Error('Wait for your current kitchen to finish saving, then try again.')
    const previousHouseholdId = householdId
    setCloudReady(false)
    setHouseholdId(null)
    try {
      await joinHousehold(code)
      setLoadRetryToken((value) => value + 1)
    } catch (error) {
      setHouseholdId(previousHouseholdId)
      setCloudReady(true)
      throw error
    }
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
        if (reviewItem.merge) {
          const result = mergeInventoryItems(next, [item])
          next.splice(0, next.length, ...result.items)
          merged += result.merged
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
    setGrocery((current) => mergeGroceryItems(current, items.map((item) => ({ ...item, checked: false }))))
    notify(`${items.length} item${items.length === 1 ? '' : 's'} added to your grocery list`)
  }

  function cookRecipe(recipe: RecipeMatch, scale = 1) {
    const missing = recipe.ingredients.flatMap((ingredient) => {
      const needed = Number((ingredient.amount * scale).toFixed(2))
      const current = availableAmount(inventory, ingredient, normalize)
      return current < needed ? [{ ...ingredient, amount: Number((needed - current).toFixed(2)), checked: false }] : []
    })
    if (missing.length) { addToGrocery(missing); setSelectedRecipe(null); return }
    const previousInventory = inventory
    const actorName = [session?.user.user_metadata?.display_name, session?.user.user_metadata?.full_name, session?.user.user_metadata?.name, session?.user.email?.split('@')[0]]
      .find((value) => typeof value === 'string' && value.trim()) || 'You'
    const historyEntry = cookingHistoryEntry(recipe, scale, { userId: session?.user.id, name: actorName })
    setInventory((current) => deductIngredients(current, recipe.ingredients, scale, normalize))
    setCookingHistory((current) => recentCookingHistory([historyEntry, ...current], 100))
    if (householdId && session && !demoMode) {
      void saveCookingHistoryEntry(householdId, historyEntry).catch((error) => console.error('Cooking history could not be synced.', error))
    }
    setSelectedRecipe(null)
    setToast({
      message: `${recipe.name} added to cooking history`,
      undo: () => {
        setInventory(previousInventory)
        setCookingHistory((current) => current.filter((entry) => entry.id !== historyEntry.id))
        if (householdId && session && !demoMode) void deleteCookingHistoryEntry(householdId, historyEntry.id)
        setToast({ message: 'Cooking update undone' })
      },
    })
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

  function saveDiscoveredRecipe(preview: DiscoverRecipe, details: DiscoverRecipeDetails) {
    const recipe = saveableDiscoveredRecipe(preview, details)
    setCustomRecipes((current) => current.some((entry) => entry.id === recipe.id) ? current : [recipe, ...current])
    notify(`${recipe.name} saved to your recipes`)
  }

  async function removeCookingHistory(entry: CookingHistoryEntry) {
    if (!window.confirm(`Remove ${entry.recipeName} from cooking history?`)) return
    const previous = cookingHistory
    setCookingHistory((current) => current.filter((candidate) => candidate.id !== entry.id))
    try {
      if (householdId && session && !demoMode) await deleteCookingHistoryEntry(householdId, entry.id)
      notify('Cooking history entry removed')
    } catch (error) {
      setCookingHistory(previous)
      notify(errorMessage(error, 'The cooking history entry could not be removed.'))
    }
  }

  async function deleteRecipe(recipe: Recipe) {
    if (recipe.source === 'mise') {
      const previous = hiddenMiseRecipeIds
      setHiddenMiseRecipeIds((current) => [...new Set([...current, recipe.id])])
      setSelectedRecipe(null)
      try {
        if (householdId && session && !demoMode) await setMiseRecipeHidden(householdId, recipe.id, recipe.name, true)
      } catch (error) {
        setHiddenMiseRecipeIds(previous)
        notify(errorMessage(error, 'This Mise recipe could not be removed.'))
        return
      }
      setToast({
        message: `${recipe.name} removed`,
        undo: () => {
          setHiddenMiseRecipeIds(previous)
          if (householdId && session && !demoMode) void setMiseRecipeHidden(householdId, recipe.id, recipe.name, false)
          setToast({ message: 'Recipe restored' })
        },
      })
      return
    }
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('home')} aria-label="Go home">
          <span className="brand-mark"><Leaf size={21} /></span>
          <span>Mise</span>
        </button>
        <nav>
          <NavButton className="overview-nav" active={view === 'home'} icon={<Sparkles />} label="Overview" onClick={() => setView('home')} />
          <NavButton active={view === 'kitchen'} icon={<PackageOpen />} label="My kitchen" badge={inventory.length} onClick={() => { setKitchenCategory('All'); setView('kitchen') }} />
          <NavButton active={view === 'recipes'} icon={<CookingPot />} label="What can I make?" badge={readyCount} onClick={() => setView('recipes')} />
          <NavButton active={view === 'planner'} icon={<CalendarDays />} label="Meal plan" badge={mealPlan.length} onClick={() => setView('planner')} />
          <NavButton active={view === 'grocery'} icon={<ShoppingBasket />} label="Grocery list" badge={grocery.filter((item) => !item.checked).length} onClick={() => setView('grocery')} />
          <NavButton active={view === 'settings'} icon={<SettingsIcon />} label="Settings" onClick={() => setView('settings')} />
        </nav>
        <div className="sidebar-note">
          <span><Leaf size={15} /> This week</span>
          <strong>{urgentItems.length} items</strong>
          <p>deserve a spot on your plate soon.</p>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setView('home')} aria-label="Go to overview"><Leaf size={18} /> Mise</button>
          <button className="search-button"><Search size={17} /><span>Search your kitchen</span><kbd>⌘ K</kbd></button>
          {session && (syncState === 'error' || syncState === 'offline' || syncState === 'conflict'
            ? <button className={`sync-state ${syncState}`} onClick={retrySync} title={syncState === 'conflict' ? 'Reload the newest kitchen' : 'Retry cloud sync'}>{syncState === 'offline' ? <WifiOff size={14} /> : <RefreshCw size={14} />} {syncState === 'offline' ? 'Offline' : syncState === 'conflict' ? 'Newer changes found' : 'Retry sync'}</button>
            : <span className={`sync-state ${syncState}`}><Cloud size={14} /> {syncState === 'saved' ? 'Saved' : 'Saving…'}</span>)}
          {session && <button className="feedback-button" onClick={() => setFeedbackOpen(true)} aria-label="Open feedback"><MessageSquareText size={16} /><span>Feedback</span></button>}
          <button className="smart-button" onClick={() => setSmartOpen(true)}><Sparkles size={16} /> Smart add</button>
          <button className="add-button" onClick={() => setAddOpen(true)}><Plus size={18} /> Add ingredients</button>
        </header>

        <div className="page">
          {view === 'home' && <Home displayName={greetingName} inventory={inventory} counts={counts} urgentItems={urgentItems} recipes={recipeMatches} mealReminders={todayMealReminders} readyCount={readyCount} groceryCount={grocery.filter((item) => !item.checked).length} setView={setView} openKitchen={(category = 'All') => { setKitchenCategory(category); setView('kitchen') }} setSelectedRecipe={setSelectedRecipe} />}
          {view === 'kitchen' && <Kitchen inventory={inventory} setInventory={setInventory} category={kitchenCategory} setCategory={setKitchenCategory} onAdd={() => setAddOpen(true)} onSmartAdd={() => setSmartOpen(true)} onEdit={setEditingItem} />}
          {view === 'recipes' && <Recipes recipes={recipeMatches} cookingHistory={cookingHistory} inventory={inventory} preferences={foodPreferences} accessToken={session?.access_token || ''} savedExternalIds={customRecipes.flatMap((recipe) => recipe.externalId ? [recipe.externalId] : [])} setSelectedRecipe={setSelectedRecipe} onRemoveHistory={removeCookingHistory} onAdd={() => { setEditingRecipe(null); setRecipeEditorOpen(true) }} onSaveDiscovered={saveDiscoveredRecipe} onAddToGrocery={addToGrocery} />}
          {view === 'planner' && <MealPlanner recipes={recipeMatches} inventory={inventory} entries={mealPlan} templates={mealPlanTemplates} setEntries={setMealPlan} setTemplates={updateMealPlanTemplates} onDeleteTemplate={removeMealPlanTemplate} onAddToGrocery={addToGrocery} notify={notify} />}
          {view === 'grocery' && <Grocery grocery={grocery} stapleGroups={stapleGroups} staples={staples} inventory={inventory} setGrocery={setGrocery} setStapleGroups={setStapleGroups} setStaples={setStaples} setInventory={setInventory} notify={notify} />}
          {view === 'settings' && <SettingsPage session={session} householdId={householdId} displayName={displayName} preferences={foodPreferences} reminderPreferences={mealReminderPreferences} syncState={syncState} isOnline={isOnline} inventoryCount={inventory.length} groceryCount={grocery.length} onRetry={retrySync} onResetPassword={sendPasswordReset} onUpdateName={updateProfileName} onUpdatePreferences={updateFoodPreferences} onUpdateReminderPreferences={setMealReminderPreferences} onActivateHousehold={activateHousehold} onJoinHousehold={joinSharedHousehold} onOpenFeedback={() => setFeedbackOpen(true)} onSignOut={leaveAccount} />}
        </div>
      </main>

      {addOpen && <AddFood onClose={() => setAddOpen(false)} onAdd={(item) => { const result = mergeInventoryItems(inventory, [item]); setInventory(result.items); setAddOpen(false); notify(result.merged ? `${item.name} merged with your existing ingredient` : `${item.name} added to your kitchen`) }} />}
      {smartOpen && <SmartAdd inventory={inventory} onClose={() => setSmartOpen(false)} onAdd={addSmartItems} />}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} onSubmit={sendFeedback} />}
      {passwordRecoveryOpen && <PasswordRecoveryModal onClose={() => setPasswordRecoveryOpen(false)} />}
      {editingItem && <AddFood initialItem={editingItem} onClose={() => setEditingItem(null)} onAdd={(item) => { setInventory((current) => current.map((entry) => entry.id === item.id ? item : entry)); setEditingItem(null); notify(`${item.name} updated`) }} />}
      {recipeEditorOpen && <RecipeEditor inventory={inventory} initialRecipe={editingRecipe || undefined} onClose={() => { setRecipeEditorOpen(false); setEditingRecipe(null) }} onSave={saveCustomRecipe} />}
      {selectedRecipe && <RecipeSheet recipe={selectedRecipe} inventory={inventory} onClose={() => setSelectedRecipe(null)} onAction={(scale) => cookRecipe(selectedRecipe, scale)} onEdit={selectedRecipe.source === 'user' ? () => { setEditingRecipe(selectedRecipe); setSelectedRecipe(null); setRecipeEditorOpen(true) } : undefined} onDelete={() => void deleteRecipe(selectedRecipe)} />}
      {toast && <div className="toast"><Check size={17} /><span>{toast.message}</span>{toast.undo && <button onClick={toast.undo}><Undo2 size={14} /> Undo</button>}</div>}
    </div>
  )
}

function NavButton({ active, icon, label, badge, className = '', onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; className?: string; onClick: () => void }) {
  return <button className={`nav-item${active ? ' active' : ''}${className ? ` ${className}` : ''}`} onClick={onClick} aria-label={label}>{icon}<span>{label}</span>{badge !== undefined && <em>{badge}</em>}</button>
}

function NumberField({ value, onValueChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & { value: number; onValueChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  return <input {...props} type="number" value={draft ?? String(value)} onChange={(event) => {
    const next = event.target.value
    setDraft(next)
    if (next !== '' && Number.isFinite(Number(next))) onValueChange(Number(next))
  }} onBlur={(event) => {
    setDraft(null)
    props.onBlur?.(event)
  }} />
}

function Home({ displayName, inventory, counts, urgentItems, recipes, mealReminders, readyCount, groceryCount, setView, openKitchen, setSelectedRecipe }: {
  displayName: string;
  inventory: InventoryItem[]; counts: { category: Category; count: number }[]; urgentItems: InventoryItem[]; recipes: RecipeMatch[];
  mealReminders: MealReminder[]; readyCount: number; groceryCount: number; setView: (view: View) => void; openKitchen: (category?: KitchenCategory) => void; setSelectedRecipe: (recipe: RecipeMatch) => void
}) {
  const best = recipes[0]
  const activeReminder = mealReminders.find((reminder) => reminder.due)
  return <>
    <section className="welcome">
      <div><span className="eyebrow">{new Date().toLocaleDateString([], { weekday: 'long' })}, your kitchen at a glance</span><h1>{getGreeting()}, {displayName}.</h1><p>Everything looks good. A few ingredients are asking to be used soon.</p></div>
      <div className="fresh-score"><span><Leaf size={18} /></span><div><small>Kitchen freshness</small><strong>86%</strong></div></div>
    </section>

    {mealReminders.length > 0 && <section className={`meal-reminder-panel panel${activeReminder ? ' active' : ''}`}>
      <div className="meal-reminder-heading"><span><BellRing /></span><div><small>{activeReminder ? 'Coming up' : 'Today’s meal plan'}</small><h2>{activeReminder ? `${activeReminder.recipe.name} ${mealReminderLabel(activeReminder).toLowerCase()}` : `${mealReminders.length} planned meal${mealReminders.length === 1 ? '' : 's'} today`}</h2></div><button className="text-button" onClick={() => setView('planner')}>Open meal plan <ArrowRight /></button></div>
      <div className="meal-reminder-list">{mealReminders.map((reminder) => <button key={reminder.entry.id} className={reminder === activeReminder ? 'due' : ''} onClick={() => setSelectedRecipe(reminder.recipe as RecipeMatch)}><span>{reminder.recipe.emoji}</span><p><strong>{reminder.recipe.name}</strong><small>{reminder.entry.mealSlot} · {reminder.scheduledAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></p><em>{mealReminderLabel(reminder)}</em></button>)}</div>
    </section>}

    <section className="status-grid">
      <article className="kitchen-card panel">
        <div className="section-heading"><div><span className="eyebrow">Kitchen status</span><h2>{inventory.length} ingredients at home</h2></div><button className="text-button" onClick={() => openKitchen()}>See everything <ArrowRight size={15} /></button></div>
        <div className="category-grid">{counts.filter((entry) => entry.count > 0).map(({ category, count }) => <button key={category} onClick={() => openKitchen(category)}><span>{categoryEmoji[category]}</span><strong>{count}</strong><small>{category}</small></button>)}</div>
      </article>

      <article className="urgent-card panel">
        <div className="section-heading"><div><span className="eyebrow warning"><TriangleAlert size={13} /> Use soon</span><h2>Give these a plan</h2></div></div>
        <div className="urgent-list">{urgentItems.slice(0, 3).map((item) => {
          const days = daysUntilExpiration(item) ?? 0
          const overdue = Math.abs(days)
          return <div key={item.id}><span className="food-icon">{item.emoji}</span><p><strong>{item.name}</strong><small>{days < 0 ? `${overdue} day${overdue === 1 ? '' : 's'} past use-by` : days === 0 ? 'Use today' : `${days} day${days === 1 ? '' : 's'} left`}</small></p><span className={`day-pill day-${Math.min(Math.max(days, 0), 3)}`}>{days < 0 ? `${overdue}d late` : `${days}d`}</span></div>
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
    <div className="recipe-art">{recipe.imageUrl ? <img src={recipe.imageUrl} alt="" /> : <span>{recipe.emoji}</span>}{recipe.source === 'user' && <b>My recipe</b>}{recipe.source === 'spoonacular' && <b>Saved</b>}{recipe.preferenceWarnings.length > 0 && <i><TriangleAlert size={12} /> Check preferences</i>}{recipe.urgent > 0 && <em><Leaf size={13} /> Uses {recipe.urgent} use-soon</em>}</div>
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
  if (days < 0) return <span className="freshness danger">{Math.abs(days)}d past use-by</span>
  if (days <= 1) return <span className="freshness danger">Use {days === 0 ? 'today' : 'tomorrow'}</span>
  if (days <= 3) return <span className="freshness soon">{days} days left</span>
  return <span className="freshness fresh">Fresh · {days}d</span>
}

function Recipes({ recipes, cookingHistory, inventory, preferences, accessToken, savedExternalIds, setSelectedRecipe, onRemoveHistory, onAdd, onSaveDiscovered, onAddToGrocery }: { recipes: RecipeMatch[]; cookingHistory: CookingHistoryEntry[]; inventory: InventoryItem[]; preferences: FoodPreferences; accessToken: string; savedExternalIds: number[]; setSelectedRecipe: (recipe: RecipeMatch) => void; onRemoveHistory: (entry: CookingHistoryEntry) => void; onAdd: () => void; onSaveDiscovered: (preview: DiscoverRecipe, details: DiscoverRecipeDetails) => void; onAddToGrocery: (items: GroceryItem[]) => void }) {
  const [sort, setSort] = useState<'match' | 'time' | 'urgent'>('match')
  const [filter, setFilter] = useState<'all' | 'mine' | 'ready' | 'discover' | 'history'>('all')
  const filtered = recipes.filter((recipe) => filter === 'mine' ? recipe.source !== 'mise' : filter === 'ready' ? recipe.missing.length === 0 : true)
  const sorted = [...filtered].sort((a, b) => sort === 'time' ? a.time - b.time : sort === 'urgent' ? b.urgent - a.urgent : b.score - a.score)
  return <section className="inner-page">
    <div className="page-title"><div><span className="eyebrow">Cook from what you have</span><h1>What can I make?</h1><p>Your recipes and Mise ideas are ranked by what is already in your kitchen.</p></div><button className="primary-button" onClick={onAdd}><CirclePlus size={18} /> Add my recipe</button></div>
    <div className="recipe-controls"><div className="recipe-filters">{([['all', 'All recipes'], ['mine', 'My saved'], ['ready', 'Ready now'], ['discover', 'Discover'], ['history', `History${cookingHistory.length ? ` ${cookingHistory.length}` : ''}`]] as const).map(([value, label]) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'discover' && <Sparkles size={12} />}{value === 'history' && <Clock3 size={12} />}{label}</button>)}</div>{filter !== 'discover' && filter !== 'history' && <label className="recipe-sort">Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="match">Best match</option><option value="time">Quickest</option><option value="urgent">Uses food soon</option></select></label>}</div>
    {filter === 'discover'
      ? <DiscoverRecipes inventory={inventory} preferences={preferences} accessToken={accessToken} savedExternalIds={savedExternalIds} onSaveDiscovered={onSaveDiscovered} onAddToGrocery={onAddToGrocery} />
      : filter === 'history'
        ? <CookingHistory entries={cookingHistory} recipes={recipes} onOpenRecipe={setSelectedRecipe} onRemove={onRemoveHistory} />
        : <><div className="recipe-grid full">{sorted.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} featured={index === 0} onClick={() => setSelectedRecipe(recipe)} />)}</div>{!sorted.length && <Empty title="No recipes in this view" copy="Try another filter or add a few more ingredients to your kitchen." />}</>}
  </section>
}

function CookingHistory({ entries, recipes, onOpenRecipe, onRemove }: { entries: CookingHistoryEntry[]; recipes: RecipeMatch[]; onOpenRecipe: (recipe: RecipeMatch) => void; onRemove: (entry: CookingHistoryEntry) => void }) {
  const recent = recentCookingHistory(entries)
  const stats = cookingHistoryStats(entries)
  if (!recent.length) return <Empty title="No meals cooked yet" copy="When you cook a recipe and update your kitchen, it will appear here automatically." />
  return <section className="cooking-history">
    <div className="cooking-history-summary panel">
      <div><CookingPot /><p><strong>{stats.totalMeals}</strong><small>meals recorded</small></p></div>
      <div><CalendarDays /><p><strong>{stats.recentMeals}</strong><small>in the last 30 days</small></p></div>
      <div><UsersRound /><p><strong>{stats.totalServings}</strong><small>servings prepared</small></p></div>
    </div>
    <div className="cooking-history-list panel">
      <header><div><span className="eyebrow">Kitchen timeline</span><h2>Recently cooked</h2></div><small>Shared with your kitchen</small></header>
      <ol>{recent.map((entry) => {
        const recipe = recipes.find((candidate) => candidate.id === entry.recipeId)
        const cookedAt = new Date(entry.cookedAt)
        return <li key={entry.id}>
          <span className="cooking-history-icon">{entry.recipeEmoji}</span>
          <div><strong>{entry.recipeName}</strong><small>{cookedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: cookedAt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })} at {cookedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>
          <p><span>{entry.servings} serving{entry.servings === 1 ? '' : 's'}</span><small><Clock3 /> {entry.timeMinutes} min · {entry.cookedByName}</small></p>
          <div className="cooking-history-actions">{recipe ? <button onClick={() => onOpenRecipe(recipe)}>Cook again <ArrowRight /></button> : <em>Recipe unavailable</em>}<button className="delete" onClick={() => onRemove(entry)} aria-label={`Remove ${entry.recipeName} from cooking history`}><Trash2 /></button></div>
        </li>
      })}</ol>
    </div>
  </section>
}

function MealPlanner({ recipes, inventory, entries, templates, setEntries, setTemplates, onDeleteTemplate, onAddToGrocery, notify }: {
  recipes: RecipeMatch[]; inventory: InventoryItem[]; entries: MealPlanEntry[]; templates: MealPlanTemplate[];
  setEntries: React.Dispatch<React.SetStateAction<MealPlanEntry[]>>; setTemplates: React.Dispatch<React.SetStateAction<MealPlanTemplate[]>>; onDeleteTemplate: (templateId: string) => Promise<void>;
  onAddToGrocery: (items: GroceryItem[]) => void; notify: (message: string) => void
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek())
  const [picking, setPicking] = useState<{ date: string; mealSlot: MealSlot } | null>(null)
  const [copyingDate, setCopyingDate] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const dates = useMemo(() => weekDates(weekStart), [weekStart])
  const dateKeys = dates.map(localDateKey)
  const weekEntries = entries.filter((entry) => dateKeys.includes(entry.date))
  const groceries = useMemo(() => groceryForMealPlan(weekEntries, recipes, inventory), [weekEntries, recipes, inventory])
  const today = localDateKey(new Date())
  const weekLabel = `${dates[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${dates[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  const plannedDays = new Set(weekEntries.map((entry) => entry.date)).size

  function chooseRecipe(date: string, mealSlot: MealSlot, recipe: RecipeMatch) {
    setEntries((current) => [
      ...current.filter((entry) => !(entry.date === date && entry.mealSlot === mealSlot)),
      { id: mealPlanEntryId(date, mealSlot), date, recipeId: recipe.id, servings: recipe.servings, mealSlot },
    ])
    setPicking(null)
  }

  function changeServings(entry: MealPlanEntry, amount: number) {
    setEntries((current) => current.map((candidate) => candidate.id === entry.id
      ? { ...candidate, servings: Math.min(24, Math.max(1, candidate.servings + amount)) }
      : candidate))
  }

  function clearDay(date: string) {
    if (!window.confirm('Clear every planned meal from this day?')) return
    setEntries((current) => current.filter((entry) => entry.date !== date))
  }

  function copyDay(targetDate: string) {
    if (!copyingDate) return
    setEntries((current) => copyMealPlanDay(current, copyingDate, targetDate))
    setCopyingDate(null)
  }

  function repeatWeek() {
    setEntries((current) => repeatMealPlanWeek(current, weekStart))
    setWeekStart((current) => addWeeks(current, 1))
  }

  return <section className="inner-page planner-page">
    <div className="page-title"><div><span className="eyebrow">Plan every meal</span><h1>Weekly meal plan</h1><p>Plan breakfast, lunch, dinner, and snacks, then shop only for what your kitchen is missing.</p></div><div className="title-actions"><button className="secondary-button" onClick={() => setTemplatesOpen(true)}><Bookmark /> Templates{templates.length ? ` (${templates.length})` : ''}</button>{weekEntries.length > 0 && <button className="secondary-button" onClick={repeatWeek}><RefreshCw /> Repeat next week</button>}{groceries.length > 0 && <button className="primary-button" onClick={() => onAddToGrocery(groceries)}><ShoppingBasket /> Add {groceries.length} missing item{groceries.length === 1 ? '' : 's'}</button>}</div></div>
    <div className="week-toolbar panel"><button onClick={() => setWeekStart((current) => addWeeks(current, -1))} aria-label="Previous week"><ChevronLeft /></button><div><strong>{weekLabel}</strong><small>{weekEntries.length} meal{weekEntries.length === 1 ? '' : 's'} across {plannedDays} day{plannedDays === 1 ? '' : 's'}</small></div><button className="today-button" onClick={() => setWeekStart(startOfWeek())}>This week</button><button onClick={() => setWeekStart((current) => addWeeks(current, 1))} aria-label="Next week"><ChevronRight /></button></div>
    <div className="week-grid">{dates.map((date) => {
      const dateKey = localDateKey(date)
      const dayEntries = entries.filter((candidate) => candidate.date === dateKey)
      return <article className={`day-card panel${dateKey === today ? ' today' : ''}`} key={dateKey}>
        <div className="day-card-head"><div><span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong></div><div className="day-card-head-actions">{dateKey === today && <em>Today</em>}{dayEntries.length > 0 && <><button onClick={() => setCopyingDate(dateKey)} aria-label={`Copy meals from ${dateKey}`} title="Copy this day"><Copy /></button><button className="delete" onClick={() => clearDay(dateKey)} aria-label={`Clear meals from ${dateKey}`} title="Clear this day"><Trash2 /></button></>}</div></div>
        <div className="day-slots">{mealSlots.map((slot) => {
          const entry = dayEntries.find((candidate) => candidate.mealSlot === slot.value)
          const recipe = entry ? recipes.find((candidate) => candidate.id === entry.recipeId) : undefined
          return entry && recipe ? <div className="planned-slot" key={slot.value}>
            <button className="planned-slot-main" onClick={() => setPicking({ date: dateKey, mealSlot: slot.value })}><span>{recipe.imageUrl ? <img src={recipe.imageUrl} alt="" /> : recipe.emoji}</span><p><small>{slot.label}</small><strong>{recipe.name}</strong><em>{recipe.missing.length ? `${recipe.missing.length} missing` : 'Kitchen ready'}{recipe.urgent ? ` · uses ${recipe.urgent} soon` : ''}</em></p></button>
            <div className="slot-controls"><span>Servings</span><button onClick={() => changeServings(entry, -1)} aria-label={`Decrease servings for ${recipe.name}`}><Minus /></button><strong>{entry.servings}</strong><button onClick={() => changeServings(entry, 1)} aria-label={`Increase servings for ${recipe.name}`}><Plus /></button><button className="delete" onClick={() => setEntries((current) => current.filter((candidate) => candidate.id !== entry.id))} aria-label={`Remove ${recipe.name} from ${slot.label}`}><Trash2 /></button></div>
          </div> : <button className="empty-slot" key={slot.value} onClick={() => setPicking({ date: dateKey, mealSlot: slot.value })}><span>{slot.emoji}</span><p><strong>{slot.label}</strong><small>Add a recipe</small></p><CirclePlus /></button>
        })}</div>
      </article>
    })}</div>
    <div className="planner-summary panel"><div><CalendarDays /><p><strong>{weekEntries.length} meal{weekEntries.length === 1 ? '' : 's'} planned across {plannedDays} day{plannedDays === 1 ? '' : 's'}</strong><small>{groceries.length ? `${groceries.length} grocery item${groceries.length === 1 ? '' : 's'} complete the week` : weekEntries.length ? 'Everything planned is already in your kitchen' : 'Start with a meal that uses food expiring soon'}</small></p></div>{groceries.length > 0 && <button className="secondary-button" onClick={() => onAddToGrocery(groceries)}>Build grocery list <ArrowRight /></button>}</div>
    {picking && <MealPicker date={picking.date} mealSlot={picking.mealSlot} recipes={recipes} onClose={() => setPicking(null)} onChoose={(recipe) => chooseRecipe(picking.date, picking.mealSlot, recipe)} />}
    {copyingDate && <CopyDayPicker sourceDate={copyingDate} dates={dates} onClose={() => setCopyingDate(null)} onCopy={copyDay} />}
    {templatesOpen && <MealPlanTemplateManager templates={templates} weekEntries={weekEntries} weekStart={weekStart} recipes={recipes} setEntries={setEntries} setTemplates={setTemplates} onDeleteTemplate={onDeleteTemplate} onClose={() => setTemplatesOpen(false)} notify={notify} />}
  </section>
}

function MealPicker({ date, mealSlot, recipes, onClose, onChoose }: { date: string; mealSlot: MealSlot; recipes: RecipeMatch[]; onClose: () => void; onChoose: (recipe: RecipeMatch) => void }) {
  const [query, setQuery] = useState('')
  const matches = recipes.filter((recipe) => normalize(recipe.name).includes(normalize(query)))
  const heading = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const slotLabel = mealSlots.find((slot) => slot.value === mealSlot)?.label || 'Meal'
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal meal-picker" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{slotLabel} for {heading}</span><h2>Choose a recipe</h2></div><button onClick={onClose} aria-label="Close meal picker"><X /></button></div><label className="meal-picker-search"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recipes…" /></label><div className="meal-picker-list">{matches.map((recipe) => <button key={recipe.id} onClick={() => onChoose(recipe)}><span>{recipe.imageUrl ? <img src={recipe.imageUrl} alt="" /> : recipe.emoji}</span><p><strong>{recipe.name}</strong><small>{recipe.time} min · {recipe.missing.length ? `${recipe.missing.length} missing` : 'Ready now'}{recipe.urgent ? ` · uses ${recipe.urgent} soon` : ''}</small></p><ArrowRight /></button>)}</div>{!matches.length && <Empty title="No matching recipes" copy="Try a different recipe name." />}</section></div>
}

function CopyDayPicker({ sourceDate, dates, onClose, onCopy }: { sourceDate: string; dates: Date[]; onClose: () => void; onCopy: (targetDate: string) => void }) {
  const sourceLabel = new Date(`${sourceDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal copy-day-picker" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Copy {sourceLabel}</span><h2>Choose a day</h2></div><button onClick={onClose} aria-label="Close copy day picker"><X /></button></div><p className="modal-intro">Every meal on the destination day will be replaced with this day’s plan.</p><div className="copy-day-options">{dates.filter((date) => localDateKey(date) !== sourceDate).map((date) => { const key = localDateKey(date); return <button key={key} onClick={() => onCopy(key)}><span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong><ArrowRight /></button> })}</div></section></div>
}

function MealPlanTemplateManager({ templates, weekEntries, weekStart, recipes, setEntries, setTemplates, onDeleteTemplate, onClose, notify }: {
  templates: MealPlanTemplate[]; weekEntries: MealPlanEntry[]; weekStart: Date; recipes: RecipeMatch[];
  setEntries: React.Dispatch<React.SetStateAction<MealPlanEntry[]>>; setTemplates: React.Dispatch<React.SetStateAction<MealPlanTemplate[]>>;
  onDeleteTemplate: (templateId: string) => Promise<void>; onClose: () => void; notify: (message: string) => void
}) {
  const [name, setName] = useState('')
  const recipeIds = new Set(recipes.map((recipe) => recipe.id))

  function saveCurrentWeek(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !weekEntries.length) return
    const template = mealPlanTemplateFromWeek(localId('meal-template'), trimmed, weekEntries, weekStart)
    setTemplates((current) => [template, ...current])
    setName('')
    notify(`${template.name} saved as a meal plan template`)
  }

  function applyTemplate(template: MealPlanTemplate) {
    const availableEntries = template.entries.filter((entry) => recipeIds.has(entry.recipeId))
    if (!availableEntries.length) { notify('The recipes in this template are no longer available'); return }
    if (weekEntries.length && !window.confirm(`Replace this week with “${template.name}”?`)) return
    setEntries((current) => applyMealPlanTemplate(current, { ...template, entries: availableEntries }, weekStart))
    onClose()
    const skipped = template.entries.length - availableEntries.length
    notify(`${template.name} applied${skipped ? ` · ${skipped} unavailable recipe${skipped === 1 ? '' : 's'} skipped` : ''}`)
  }

  async function removeTemplate(template: MealPlanTemplate) {
    if (!window.confirm(`Delete “${template.name}”?`)) return
    try {
      await onDeleteTemplate(template.id)
      setTemplates((current) => current.filter((candidate) => candidate.id !== template.id))
      notify(`${template.name} deleted`)
    } catch (error) {
      console.error(error)
      notify(`${template.name} could not be deleted`)
    }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal meal-template-manager" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Reusable weeks</span><h2>Meal plan templates</h2><p>Save this week once, then reuse it whenever life gets busy.</p></div><button onClick={onClose} aria-label="Close meal plan templates"><X /></button></div><form className="meal-template-create" onSubmit={saveCurrentWeek}><label>Template name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Family favorites" /></label><button type="submit" disabled={!name.trim() || !weekEntries.length}><BookmarkCheck /> Save this week</button></form>{!weekEntries.length && <p className="template-hint">Add at least one meal to this week before saving it as a template.</p>}<div className="meal-template-list">{templates.map((template) => { const unavailable = template.entries.filter((entry) => !recipeIds.has(entry.recipeId)).length; const days = new Set(template.entries.map((entry) => entry.dayOffset)).size; return <article key={template.id}><div className="template-name"><MealTemplateName template={template} onRename={(nextName) => setTemplates((current) => current.map((candidate) => candidate.id === template.id ? { ...candidate, name: nextName } : candidate))} /><small>{template.entries.length} meal{template.entries.length === 1 ? '' : 's'} across {days} day{days === 1 ? '' : 's'}{unavailable ? ` · ${unavailable} unavailable` : ''}</small></div><div className="template-actions"><button onClick={() => applyTemplate(template)} disabled={template.entries.length === unavailable}><CalendarDays /> Use this week</button><button className="delete" onClick={() => removeTemplate(template)} aria-label={`Delete ${template.name}`}><Trash2 /></button></div></article> })}</div>{!templates.length && <div className="template-empty"><CalendarDays /><strong>No templates yet</strong><p>Plan a week, give it a name above, and save it for later.</p></div>}</section></div>
}

function MealTemplateName({ template, onRename }: { template: MealPlanTemplate; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(template.name)
  function commit() {
    const nextName = draft.trim()
    if (!nextName) { setDraft(template.name); return }
    setDraft(nextName)
    if (nextName !== template.name) onRename(nextName)
  }
  return <input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} aria-label={`Name for ${template.name}`} />
}

function DiscoverRecipes({ inventory, preferences, accessToken, savedExternalIds, onSaveDiscovered, onAddToGrocery }: { inventory: InventoryItem[]; preferences: FoodPreferences; accessToken: string; savedExternalIds: number[]; onSaveDiscovered: (preview: DiscoverRecipe, details: DiscoverRecipeDetails) => void; onAddToGrocery: (items: GroceryItem[]) => void }) {
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
  const preferenceLabels = foodPreferenceSummary(preferences)

  async function search() {
    if (!accessToken || !ingredientNames.length) return
    setLoading('search'); setError(''); setSearched(true)
    try {
      const result = await searchDiscoverRecipes(ingredientNames, accessToken, preferences)
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
    {!searched && <div className="discover-hero panel"><div><span className="eyebrow"><Sparkles size={12} /> Spoonacular discovery</span><h2>Find more ways to use your kitchen</h2><p>Mise will search with up to 15 ingredients, prioritizing food that should be used soon and applying your saved food preferences. A search happens only when you ask, protecting the free daily allowance.</p>{preferenceLabels.length > 0 && <div className="preference-summary"><ShieldCheck /> Filtered for {preferenceLabels.join(' · ')}</div>}<div className="discover-chips">{ingredientNames.slice(0, 10).map((name) => <span key={name}>{name}</span>)}</div></div><button className="primary-button" onClick={() => void search()} disabled={!ingredientNames.length || loading === 'search'}>{loading === 'search' ? <RefreshCw className="spin" /> : <Search />} {loading === 'search' ? 'Searching…' : 'Find recipes'}</button></div>}
    {searched && <div className="discover-summary"><div><strong>{recipes.length ? `${recipes.length} new ideas` : 'Recipe discovery'}</strong><small>Based on {ingredientNames.length} kitchen ingredients{quotaUsed !== null ? ` · ${quotaUsed} API points used today` : ''}</small></div><button className="secondary-button" onClick={() => void search()} disabled={loading === 'search'}><RefreshCw className={loading === 'search' ? 'spin' : ''} /> Search again</button></div>}
    {error && <div className="discover-error"><TriangleAlert /> <span>{error}</span></div>}
    {loading === 'search' && searched && <div className="discover-loading"><RefreshCw className="spin" /><strong>Looking beyond your saved recipes…</strong></div>}
    {!loading && searched && !error && !recipes.length && <Empty title="No external matches found" copy="Your Mise recipes are still available. Try again after adding more ingredients." />}
    <div className="discover-grid">{recipes.map((recipe) => <button className="discover-card" key={recipe.id} onClick={() => void openRecipe(recipe)}><div className="discover-image">{recipe.image ? <img src={recipe.image} alt="" /> : <span>🍽️</span>}<em>{recipe.usedIngredientCount} ingredients matched</em></div><div><h3>{recipe.title}</h3><p>{recipe.missedIngredientCount ? `Missing ${recipe.missedIngredientCount} ingredient${recipe.missedIngredientCount === 1 ? '' : 's'}` : 'Ready from your kitchen'}</p><strong>View recipe <ArrowRight /></strong></div></button>)}</div>
    <p className="spoonacular-credit">Recipe discovery powered by <a href="https://spoonacular.com/food-api" target="_blank" rel="noreferrer">Spoonacular <ExternalLink /></a></p>
    {selected && <ExternalRecipeSheet preview={selected} details={details} loading={loading === 'details'} isSaved={savedExternalIds.includes(selected.id)} onClose={() => { setSelected(null); setDetails(null) }} onSave={() => { if (details) onSaveDiscovered(selected, details) }} onAddMissing={addMissing} />}
  </div>
}

function ExternalRecipeSheet({ preview, details, loading, isSaved, onClose, onSave, onAddMissing }: { preview: DiscoverRecipe; details: DiscoverRecipeDetails | null; loading: boolean; isSaved: boolean; onClose: () => void; onSave: () => void; onAddMissing: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="external-recipe-sheet" onMouseDown={(event) => event.stopPropagation()}><button className="sheet-close" onClick={onClose} aria-label="Close discovered recipe"><X /></button><div className="external-recipe-image">{preview.image ? <img src={preview.image} alt="" /> : <span>🍽️</span>}<em>Discovered for your kitchen</em></div><div className="external-recipe-body"><span className="eyebrow">Spoonacular recipe</span><h2>{preview.title}</h2>{loading && <div className="discover-loading compact"><RefreshCw className="spin" /> Loading recipe details…</div>}{details && <><div className="sheet-stats"><span><Clock3 /> {details.readyInMinutes || '—'} min</span><span><ChefHat /> {details.servings} servings</span></div><h3>Ingredients</h3><div className="external-ingredients">{details.ingredients.map((item, index) => <div key={`${item.name}-${index}`}><span>{preview.missedIngredients.some((missing) => normalize(missing.name) === normalize(item.name)) ? <Plus /> : <Check />}</span><p><strong>{item.name}</strong><small>{item.original || `${item.amount} ${item.unit}`}</small></p></div>)}</div>{details.instructions.length > 0 && <div className="recipe-steps"><h3>Method</h3><ol>{details.instructions.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol></div>}<div className="external-actions"><button className="save-recipe-button" onClick={onSave} disabled={isSaved}>{isSaved ? <BookmarkCheck /> : <Bookmark />} {isSaved ? 'Saved to your recipes' : 'Save recipe'}</button>{preview.missedIngredientCount > 0 && <button className="submit-button" onClick={onAddMissing}>Add {preview.missedIngredientCount} missing item{preview.missedIngredientCount === 1 ? '' : 's'} <ShoppingBasket /></button>}{details.sourceUrl && <a className="secondary-button" href={details.sourceUrl} target="_blank" rel="noreferrer">View full original recipe <ExternalLink /></a>}</div><p className="spoonacular-credit">Powered by <a href="https://spoonacular.com/food-api" target="_blank" rel="noreferrer">Spoonacular <ExternalLink /></a></p></>}</div></section></div>
}

function Grocery({ grocery, stapleGroups, staples, inventory, setGrocery, setStapleGroups, setStaples, setInventory, notify }: {
  grocery: GroceryItem[]; stapleGroups: GroceryStapleGroup[]; staples: GroceryStaple[]; inventory: InventoryItem[];
  setGrocery: React.Dispatch<React.SetStateAction<GroceryItem[]>>; setStapleGroups: React.Dispatch<React.SetStateAction<GroceryStapleGroup[]>>;
  setStaples: React.Dispatch<React.SetStateAction<GroceryStaple[]>>; setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>; notify: (message: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<'all' | 'needed' | 'checked'>('all')
  const [editing, setEditing] = useState<{ index: number; item: GroceryItem } | null>(null)
  const [adding, setAdding] = useState(false)
  const [staplesOpen, setStaplesOpen] = useState(false)
  const checkedCount = grocery.filter((item) => item.checked).length
  const neededCount = grocery.length - checkedCount
  const visible = grocery.map((item, index) => ({ item, index })).filter(({ item }) => filter === 'all' || (filter === 'checked' ? item.checked : !item.checked))
  const sections = categories.map((category) => ({ category, entries: visible.filter(({ item }) => groceryCategory(item) === category) })).filter((section) => section.entries.length)
  function addManual() {
    const items = groceryItemsFromText(draft)
    if (!items.length) return
    setGrocery((current) => mergeGroceryItems(current, items)); setDraft('')
    notify(`${items.length} grocery item${items.length === 1 ? '' : 's'} added`)
  }
  function moveCheckedToKitchen() {
    const bought = grocery.filter((item) => item.checked)
    if (!bought.length) return
    const incoming = bought.map((item, index) => inventoryItemFromGrocery(item, `${normalize(item.name).replace(/\s/g, '-')}-${Date.now()}-${index}`))
    const result = mergeInventoryItems(inventory, incoming)
    setInventory(result.items)
    setGrocery((items) => items.filter((item) => !item.checked))
    const summary = [result.added ? `${result.added} added` : '', result.merged ? `${result.merged} merged` : ''].filter(Boolean).join(', ')
    notify(`${summary} in your kitchen`)
  }
  function saveEditedItem(next: GroceryItem) {
    setGrocery((items) => mergeGroceryItems(items.filter((_, index) => index !== editing!.index), [next]))
    setEditing(null)
    notify(`${next.name} updated`)
  }
  function saveNewItem(item: GroceryItem) {
    setGrocery((items) => mergeGroceryItems(items, [item]))
    setAdding(false)
    notify(`${item.name} added to your grocery list`)
  }
  function saveAsStaple(item: GroceryItem) {
    let group = orderedStapleGroups(stapleGroups)[0]
    if (!group) {
      group = { id: localId('group'), name: 'Weekly essentials', sortOrder: 0 }
      setStapleGroups([group])
    }
    const candidate: GroceryStaple = { id: localId('staple'), groupId: group.id, name: item.name, amount: item.amount, unit: item.unit, sortOrder: orderedStaples(staples, group.id).length }
    setStaples((current) => addOrUpdateStaple(current, candidate))
    notify(`${item.name} saved to ${group.name}`)
  }
  return <section className="inner-page">
    <div className="page-title"><div><span className="eyebrow">Shop with a plan</span><h1>Grocery List 2.0</h1><p>Organized by aisle, synced with your recipes, and ready to move purchases into your kitchen.</p></div><div className="title-actions">{neededCount > 0 && <button className="secondary-button" onClick={() => setGrocery((items) => items.map((item) => ({ ...item, checked: true })))}><Check /> Mark all purchased</button>}{checkedCount > 0 && <button className="primary-button" onClick={moveCheckedToKitchen}><PackageOpen size={18} /> Add {checkedCount} to kitchen</button>}</div></div>
    <div className="grocery-progress panel"><div><span><strong>{checkedCount}</strong> of {grocery.length} collected</span><small>{neededCount ? `${neededCount} item${neededCount === 1 ? '' : 's'} left to find` : grocery.length ? 'Shopping complete — ready for your kitchen' : 'Add items or build a list from a recipe'}</small></div><div role="progressbar" aria-label="Shopping progress" aria-valuemin={0} aria-valuemax={grocery.length} aria-valuenow={checkedCount}><span style={{ width: `${grocery.length ? (checkedCount / grocery.length) * 100 : 0}%` }} /></div></div>
    <div className="grocery-layout"><div className="grocery-list panel">
      <div className="grocery-add-head"><div><strong>Add grocery items</strong><small>Add one item with details, or paste several below.</small></div><button onClick={() => setAdding(true)}><CirclePlus /> Add one item</button></div>
      <div className="grocery-add"><label>Add several at once<textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') addManual() }} placeholder={'2 bags spinach\n1 gallon milk\n6 apples'} /></label><button onClick={addManual} disabled={!draft.trim()}><Plus /> Add items</button></div>
      {grocery.length > 0 && <div className="grocery-toolbar"><div className="filter-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All {grocery.length}</button><button className={filter === 'needed' ? 'active' : ''} onClick={() => setFilter('needed')}>To buy {neededCount}</button><button className={filter === 'checked' ? 'active' : ''} onClick={() => setFilter('checked')}>Collected {checkedCount}</button></div><small>Items are grouped by aisle automatically</small></div>}
      <div className="grocery-sections">{sections.map(({ category, entries }) => <section className="grocery-section" key={category}><header><strong>{category}</strong><small>{entries.length}</small></header>{entries.map(({ item, index }) => <div className={item.checked ? 'grocery-row checked' : 'grocery-row'} key={`${item.name}-${item.unit}-${index}`}><button className="check-box" onClick={() => setGrocery((items) => items.map((entry, i) => i === index ? { ...entry, checked: !entry.checked } : entry))} aria-label={`${item.checked ? 'Return' : 'Mark'} ${item.name} ${item.checked ? 'to list' : 'as collected'}`}>{item.checked && <Check />}</button><span className="grocery-food-icon" aria-hidden="true">{groceryEmoji(item)}</span><p><strong>{item.name}</strong><small>{formatAmount(item.amount)} {item.unit}</small></p><div className="grocery-row-actions"><button className="icon-button staple" onClick={() => saveAsStaple(item)} aria-label={`Save ${item.name} as staple`}><Bookmark /></button><button className="icon-button edit" onClick={() => setEditing({ index, item })} aria-label={`Edit ${item.name}`}><Pencil /></button><button className="icon-button delete" onClick={() => setGrocery((items) => items.filter((_, i) => i !== index))} aria-label={`Remove ${item.name}`}><Trash2 /></button></div></div>)}</section>)}</div>
      {!grocery.length && <Empty title="Your list is clear" copy="Add several items above or choose an almost-ready recipe." />}
      {grocery.length > 0 && !visible.length && <Empty title={filter === 'checked' ? 'Nothing collected yet' : 'Everything is collected'} copy={filter === 'checked' ? 'Tap an item while shopping to move it here.' : 'Switch to Collected to review your cart.'} />}
    </div><StaplesPanel groups={stapleGroups} staples={staples} onAdd={(items) => { setGrocery((current) => mergeGroceryItems(current, groceryFromStaples(items))); notify(`${items.length} staple${items.length === 1 ? '' : 's'} added to your grocery list`) }} onManage={() => setStaplesOpen(true)} /></div>
    {editing && <GroceryItemEditor item={editing.item} onClose={() => setEditing(null)} onSave={saveEditedItem} />}
    {adding && <GroceryItemEditor item={{ name: '', amount: 1, unit: 'item', checked: false }} mode="add" onClose={() => setAdding(false)} onSave={saveNewItem} />}
    {staplesOpen && <StaplesManager groups={stapleGroups} staples={staples} setGroups={setStapleGroups} setStaples={setStaples} onAddToGrocery={(items) => setGrocery((current) => mergeGroceryItems(current, groceryFromStaples(items)))} onClose={() => setStaplesOpen(false)} notify={notify} />}
  </section>
}

function StaplesPanel({ groups, staples, onAdd, onManage }: { groups: GroceryStapleGroup[]; staples: GroceryStaple[]; onAdd: (items: GroceryStaple[]) => void; onManage: () => void }) {
  const orderedGroups = orderedStapleGroups(groups)
  return <aside className="staples-panel panel"><div className="staples-panel-head"><div><span className="eyebrow">Buy again</span><h3>Your staples</h3></div><button onClick={onManage}><SettingsIcon /> Manage</button></div>{orderedGroups.length ? <div className="staple-group-list">{orderedGroups.map((group) => { const items = orderedStaples(staples, group.id); return <section key={group.id}><header><div><strong>{group.name}</strong><small>{items.length} item{items.length === 1 ? '' : 's'}</small></div>{items.length > 0 && <button onClick={() => onAdd(items)}><Plus /> Add all</button>}</header><div>{items.slice(0, 5).map((item) => <button key={item.id} onClick={() => onAdd([item])}><span>{groceryEmoji(item)}</span><p><strong>{item.name}</strong><small>{formatAmount(item.amount)} {item.unit}</small></p><Plus /></button>)}{items.length > 5 && <small className="more-staples">+{items.length - 5} more in Manage</small>}</div></section> })}</div> : <div className="staples-empty"><Bookmark /><strong>Save your weekly essentials</strong><p>Use the bookmark on a grocery item or create a custom staple group.</p><button className="secondary-button" onClick={onManage}>Create staples</button></div>}<div className="staples-tip"><ShoppingBasket /><p>Staples keep their usual quantity and merge safely with items already on your list.</p></div></aside>
}

function StaplesManager({ groups, staples, setGroups, setStaples, onAddToGrocery, onClose, notify }: {
  groups: GroceryStapleGroup[]; staples: GroceryStaple[]; setGroups: React.Dispatch<React.SetStateAction<GroceryStapleGroup[]>>;
  setStaples: React.Dispatch<React.SetStateAction<GroceryStaple[]>>; onAddToGrocery: (items: GroceryStaple[]) => void; onClose: () => void; notify: (message: string) => void
}) {
  const orderedGroups = orderedStapleGroups(groups)
  const [activeGroupId, setActiveGroupId] = useState(orderedGroups[0]?.id || '')
  const [groupDraft, setGroupDraft] = useState('')
  const [stapleDraft, setStapleDraft] = useState('')
  const resolvedActiveGroupId = groups.some((group) => group.id === activeGroupId) ? activeGroupId : orderedGroups[0]?.id || ''
  const activeGroup = groups.find((group) => group.id === resolvedActiveGroupId)
  const activeStaples = activeGroup ? orderedStaples(staples, activeGroup.id) : []
  function createGroup(event: React.FormEvent) {
    event.preventDefault()
    const name = groupDraft.trim()
    if (!name) return
    const group = { id: localId('group'), name, sortOrder: groups.length }
    setGroups((current) => [...current, group]); setActiveGroupId(group.id); setGroupDraft('')
    notify(`${name} created`)
  }
  function addStaples(event: React.FormEvent) {
    event.preventDefault()
    if (!activeGroup) return
    const parsed = groceryItemsFromText(stapleDraft)
    if (!parsed.length) return
    setStaples((current) => parsed.reduce((next, item, index) => addOrUpdateStaple(next, {
      id: `${localId('staple')}-${index}`, groupId: activeGroup.id, name: item.name, amount: item.amount, unit: item.unit,
      sortOrder: orderedStaples(next, activeGroup.id).length,
    }), current))
    setStapleDraft(''); notify(`${parsed.length} staple${parsed.length === 1 ? '' : 's'} saved`)
  }
  function removeGroup(group: GroceryStapleGroup) {
    if (!window.confirm(`Remove “${group.name}” and all of its staples?`)) return
    const remaining = orderedStapleGroups(groups.filter((entry) => entry.id !== group.id))
    setActiveGroupId(remaining[0]?.id || '')
    setGroups((current) => current.filter((entry) => entry.id !== group.id))
    setStaples((current) => current.filter((entry) => entry.groupId !== group.id))
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal staples-manager" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Reusable grocery lists</span><h2>Manage staples</h2><p>Build household groups with the quantities you usually buy.</p></div><button type="button" onClick={onClose} aria-label="Close staples manager"><X /></button></div><form className="staple-group-create" onSubmit={createGroup}><input value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} placeholder="New group, e.g. Costco run" aria-label="New staple group name" /><button type="submit" disabled={!groupDraft.trim()}><Plus /> Add group</button></form><div className="staples-manager-layout"><nav>{orderedGroups.map((group, index) => <div className={group.id === resolvedActiveGroupId ? 'active' : ''} key={group.id}><button className="group-select" onClick={() => setActiveGroupId(group.id)}><strong>{group.name}</strong><small>{orderedStaples(staples, group.id).length}</small></button><div><button disabled={index === 0} onClick={() => setGroups((current) => moveStapleGroup(current, group.id, -1))} aria-label={`Move ${group.name} up`}><ArrowUp /></button><button disabled={index === orderedGroups.length - 1} onClick={() => setGroups((current) => moveStapleGroup(current, group.id, 1))} aria-label={`Move ${group.name} down`}><ArrowDown /></button></div></div>)}</nav><div className="staple-editor-area">{activeGroup ? <><div className="staple-group-title"><input value={activeGroup.name} onChange={(event) => setGroups((current) => current.map((group) => group.id === activeGroup.id ? { ...group, name: event.target.value } : group))} aria-label="Staple group name" /><button className="icon-button delete" onClick={() => removeGroup(activeGroup)} aria-label={`Remove ${activeGroup.name} group`}><Trash2 /></button></div><form className="staple-add-form" onSubmit={addStaples}><textarea value={stapleDraft} onChange={(event) => setStapleDraft(event.target.value)} placeholder={'Add one or several staples:\n2 cartons eggs\n1 gallon milk'} aria-label="New staples" /><button type="submit" disabled={!stapleDraft.trim()}><Plus /> Add staples</button></form>{activeStaples.length ? <div className="staple-editor-list">{activeStaples.map((staple, index) => <div key={staple.id}><span>{groceryEmoji(staple)}</span><label>Name<input value={staple.name} onChange={(event) => setStaples((current) => current.map((item) => item.id === staple.id ? { ...item, name: event.target.value } : item))} /></label><label>Quantity<NumberField min="0.01" step="0.01" value={staple.amount} onValueChange={(amount) => setStaples((current) => current.map((item) => item.id === staple.id ? { ...item, amount } : item))} /></label><label>Unit<input value={staple.unit} onChange={(event) => setStaples((current) => current.map((item) => item.id === staple.id ? { ...item, unit: event.target.value } : item))} /></label><div className="staple-row-actions"><button disabled={index === 0} onClick={() => setStaples((current) => moveStaple(current, staple.id, -1))} aria-label={`Move ${staple.name} up`}><ArrowUp /></button><button disabled={index === activeStaples.length - 1} onClick={() => setStaples((current) => moveStaple(current, staple.id, 1))} aria-label={`Move ${staple.name} down`}><ArrowDown /></button><button onClick={() => { onAddToGrocery([staple]); notify(`${staple.name} added to your grocery list`) }} aria-label={`Add ${staple.name} to grocery list`}><ShoppingBasket /></button><button className="delete" onClick={() => setStaples((current) => current.filter((item) => item.id !== staple.id))} aria-label={`Remove ${staple.name} staple`}><Trash2 /></button></div></div>)}</div> : <div className="staples-manager-empty"><Bookmark /><p>Add the foods your household buys regularly.</p></div>} {activeStaples.length > 0 && <button className="submit-button" onClick={() => { onAddToGrocery(activeStaples); notify(`${activeStaples.length} staples added to your grocery list`) }}>Add group to grocery list <ArrowRight /></button>}</> : <div className="staples-manager-empty"><Bookmark /><h3>Create your first group</h3><p>Try Weekly essentials, Breakfast, or Costco run.</p></div>}</div></div></section></div>
}

function GroceryItemEditor({ item, mode = 'edit', onClose, onSave }: { item: GroceryItem; mode?: 'add' | 'edit'; onClose: () => void; onSave: (item: GroceryItem) => void }) {
  const [name, setName] = useState(item.name)
  const [amount, setAmount] = useState(item.amount)
  const [unit, setUnit] = useState(item.unit)
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0 || !unit.trim()) return
    onSave({ ...item, name: name.trim(), amount, unit: unit.trim() })
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal grocery-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Grocery List 2.0</span><h2>{mode === 'add' ? 'Add grocery item' : 'Edit grocery item'}</h2></div><button type="button" onClick={onClose} aria-label="Close grocery item editor"><X /></button></div><div className="grocery-edit-preview"><span>{groceryEmoji({ name })}</span><p><strong>{name || 'Grocery item'}</strong><small>{groceryCategory({ name })} aisle</small></p></div><label>Item name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Milk" /></label><div className="form-row"><label>Quantity<NumberField min="0.01" step="0.01" value={amount} onValueChange={setAmount} /></label><label>Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label></div><button className="submit-button" type="submit">{mode === 'add' ? 'Add to grocery list' : 'Save changes'} <ArrowRight /></button></form></div>
}

function SettingsPage({ session, householdId, displayName, preferences, reminderPreferences, syncState, isOnline, inventoryCount, groceryCount, onRetry, onResetPassword, onUpdateName, onUpdatePreferences, onUpdateReminderPreferences, onActivateHousehold, onJoinHousehold, onOpenFeedback, onSignOut }: {
  session: Session | null; householdId: string | null; displayName: string; preferences: FoodPreferences; reminderPreferences: MealReminderPreferences; syncState: SyncState; isOnline: boolean; inventoryCount: number; groceryCount: number;
  onRetry: () => void; onResetPassword: () => Promise<void>; onUpdateName: (name: string) => Promise<void>; onUpdatePreferences: (preferences: FoodPreferences) => Promise<void>;
  onUpdateReminderPreferences: React.Dispatch<React.SetStateAction<MealReminderPreferences>>; onActivateHousehold: (householdId: string) => Promise<void>; onJoinHousehold: (code: string) => Promise<void>; onOpenFeedback: () => void; onSignOut: () => Promise<void>
}) {
  const [name, setName] = useState(displayName)
  const [preferenceDraft, setPreferenceDraft] = useState(preferences)
  const [excludedDraft, setExcludedDraft] = useState(preferences.excludedIngredients.join(', '))
  const [households, setHouseholds] = useState<HouseholdSummary[]>([])
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [kitchenName, setKitchenName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [invite, setInvite] = useState<HouseholdInvite | null>(null)
  const [activity, setActivity] = useState<HouseholdActivity[]>([])
  const [working, setWorking] = useState<'name' | 'password' | 'preferences' | 'household' | 'invite' | 'revoke' | 'join' | 'switch' | 'member' | 'activity' | null>(null)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const provider = session?.user.app_metadata.provider === 'google' ? 'Google' : 'Email and password'
  const activeHousehold = households.find((household) => household.id === householdId)
  const syncCopy: Record<SyncState, string> = {
    saved: 'Everything is safely stored in your cloud kitchen.',
    syncing: 'Your latest changes are being saved now.',
    error: 'Your changes are safe on this device and waiting to sync.',
    offline: 'You can keep working. Changes will sync when you reconnect.',
    conflict: 'Another open tab saved newer changes. Reload before continuing so nothing is overwritten.',
  }

  useEffect(() => {
    if (!session || !householdId) return
    let active = true
    Promise.all([loadHouseholds(), loadHouseholdMembers(householdId), loadHouseholdActivity(householdId)])
      .then(async ([nextHouseholds, nextMembers, nextActivity]) => {
        if (!active) return
        setHouseholds(nextHouseholds)
        setMembers(nextMembers)
        setActivity(nextActivity)
        setKitchenName(nextHouseholds.find((household) => household.id === householdId)?.name || '')
        if (nextHouseholds.find((household) => household.id === householdId)?.role === 'owner') {
          const activeInvite = await loadActiveHouseholdInvite(householdId)
          if (active) setInvite(activeInvite)
        } else setInvite(null)
      })
      .catch((error) => { if (active) setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Shared kitchen details could not be loaded.' }) })
    return () => { active = false }
  }, [session, householdId])

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

  function toggleIntolerance(intolerance: FoodIntolerance) {
    setPreferenceDraft((current) => ({
      ...current,
      intolerances: current.intolerances.includes(intolerance)
        ? current.intolerances.filter((item) => item !== intolerance)
        : [...current.intolerances, intolerance],
    }))
  }

  async function savePreferences(event: React.FormEvent) {
    event.preventDefault(); setWorking('preferences'); setMessage(null)
    const excludedIngredients = [...new Set(excludedDraft.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 12)
    try {
      await onUpdatePreferences({ ...preferenceDraft, excludedIngredients })
      setMessage({ type: 'success', text: 'Your recipe preferences were saved.' })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Preferences could not be saved.' }) }
    finally { setWorking(null) }
  }

  async function saveKitchenName(event: React.FormEvent) {
    event.preventDefault()
    if (!householdId || !kitchenName.trim() || kitchenName.trim() === activeHousehold?.name) return
    setWorking('household'); setMessage(null)
    try {
      await renameHousehold(householdId, kitchenName)
      setHouseholds((current) => current.map((household) => household.id === householdId ? { ...household, name: kitchenName.trim() } : household))
      setMessage({ type: 'success', text: 'Kitchen name updated.' })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Kitchen name could not be updated.' }) }
    finally { setWorking(null) }
  }

  async function makeInvite() {
    if (!householdId) return
    setWorking('invite'); setMessage(null)
    try { setInvite(await createHouseholdInvite(householdId)) }
    catch (error) { setMessage({ type: 'error', text: errorMessage(error, 'Invite code could not be created.') }) }
    finally { setWorking(null) }
  }

  async function copyInvite() {
    if (!invite) return
    try { await navigator.clipboard.writeText(invite.code); setMessage({ type: 'success', text: 'Invite code copied.' }) }
    catch { setMessage({ type: 'error', text: 'Copying failed. Select the code and copy it manually.' }) }
  }

  async function revokeInvite() {
    if (!householdId || !invite) return
    setWorking('revoke'); setMessage(null)
    try {
      await revokeHouseholdInvite(householdId)
      setInvite(null)
      setActivity(await loadHouseholdActivity(householdId))
      setMessage({ type: 'success', text: 'Invite code revoked. It can no longer be used.' })
    } catch (error) { setMessage({ type: 'error', text: errorMessage(error, 'Invite code could not be revoked.') }) }
    finally { setWorking(null) }
  }

  async function changeMemberRole(member: HouseholdMember, role: HouseholdMember['role']) {
    if (!householdId || member.role === role) return
    setWorking('member'); setMessage(null)
    try {
      await updateHouseholdMemberRole(householdId, member.userId, role)
      setMembers((current) => current.map((candidate) => candidate.userId === member.userId ? { ...candidate, role } : candidate))
      setActivity(await loadHouseholdActivity(householdId))
      setMessage({ type: 'success', text: `${member.displayName} is now a kitchen ${role}.` })
    } catch (error) { setMessage({ type: 'error', text: errorMessage(error, 'Member role could not be updated.') }) }
    finally { setWorking(null) }
  }

  async function removeMember(member: HouseholdMember) {
    if (!householdId || !window.confirm(`Remove ${member.displayName} from this kitchen? Their account and personal kitchen will not be deleted.`)) return
    setWorking('member'); setMessage(null)
    try {
      await removeHouseholdMember(householdId, member.userId)
      setMembers((current) => current.filter((candidate) => candidate.userId !== member.userId))
      setHouseholds((current) => current.map((household) => household.id === householdId ? { ...household, memberCount: Math.max(1, household.memberCount - 1) } : household))
      setActivity(await loadHouseholdActivity(householdId))
      setMessage({ type: 'success', text: `${member.displayName} was removed from this kitchen.` })
    } catch (error) { setMessage({ type: 'error', text: errorMessage(error, 'Member could not be removed.') }) }
    finally { setWorking(null) }
  }

  async function refreshActivity() {
    if (!householdId) return
    setWorking('activity')
    try { setActivity(await loadHouseholdActivity(householdId)) }
    catch (error) { setMessage({ type: 'error', text: errorMessage(error, 'Recent activity could not be refreshed.') }) }
    finally { setWorking(null) }
  }

  async function switchKitchen(nextHouseholdId: string) {
    if (!nextHouseholdId || nextHouseholdId === householdId) return
    setWorking('switch'); setMessage(null)
    try { await onActivateHousehold(nextHouseholdId) }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Kitchen could not be opened.' }); setWorking(null) }
  }

  async function joinKitchen(event: React.FormEvent) {
    event.preventDefault()
    if (!joinCode.trim()) return
    setWorking('join'); setMessage(null)
    try { await onJoinHousehold(joinCode) }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Kitchen could not be joined.' }); setWorking(null) }
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
        {session && syncState !== 'saved' && <button className="secondary-button" onClick={onRetry}><RefreshCw /> {syncState === 'conflict' ? 'Reload latest kitchen' : 'Retry sync'}</button>}
      </article>
      <article className="settings-card reminder-settings-card panel">
        <div className="settings-card-head"><span className={reminderPreferences.enabled ? 'healthy' : ''}><BellRing /></span><div><h2>Meal reminders</h2><p>See timely prompts for meals you planned today.</p></div></div>
        <label className="reminder-toggle"><span><strong>In-app reminders</strong><small>Shown on your Overview while Mise is open.</small></span><input type="checkbox" role="switch" checked={reminderPreferences.enabled} onChange={(event) => onUpdateReminderPreferences((current) => ({ ...current, enabled: event.target.checked }))} /></label>
        <label>Remind me before<select disabled={!reminderPreferences.enabled} value={reminderPreferences.leadMinutes} onChange={(event) => onUpdateReminderPreferences((current) => ({ ...current, leadMinutes: Number(event.target.value) }))}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option></select></label>
        <div className="reminder-time-grid">{mealSlots.map((slot) => <label key={slot.value}>{slot.label}<input type="time" disabled={!reminderPreferences.enabled} value={reminderPreferences.times[slot.value]} onChange={(event) => onUpdateReminderPreferences((current) => ({ ...current, times: { ...current.times, [slot.value]: event.target.value } }))} /></label>)}</div>
        <p className="reminder-privacy">These times stay on this device. No paid notification or tracking service is used.</p>
      </article>
      <article className="settings-card shared-kitchen-card panel">
        <div className="settings-card-head"><span><UsersRound /></span><div><h2>Shared kitchen</h2><p>Plan, shop, and manage ingredients with the people you live with.</p></div></div>
        {session && householdId ? <div className="shared-kitchen-layout">
          <div className="shared-kitchen-main">
            {households.length > 1 && <label>Active kitchen<select value={householdId} disabled={working === 'switch' || syncState !== 'saved'} onChange={(event) => switchKitchen(event.target.value)}>{households.map((household) => <option value={household.id} key={household.id}>{household.name} · {household.memberCount} member{household.memberCount === 1 ? '' : 's'}</option>)}</select></label>}
            {activeHousehold?.role === 'owner' ? <form className="kitchen-name-form" onSubmit={saveKitchenName}><label>Kitchen name<input value={kitchenName} maxLength={40} onChange={(event) => setKitchenName(event.target.value)} /></label><button className="secondary-button" disabled={working === 'household' || kitchenName.trim() === activeHousehold.name}>{working === 'household' ? 'Saving…' : 'Rename kitchen'}</button></form> : <div className="active-kitchen-name"><House /><div><strong>{activeHousehold?.name || 'Shared kitchen'}</strong><small>You joined as a member.</small></div></div>}
            <div className="household-members"><span>Members</span>{members.map((member) => <div key={member.userId}><em>{member.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</em><p><strong>{member.displayName}{member.userId === session.user.id ? ' · You' : ''}</strong><small>{member.role === 'owner' ? 'Kitchen owner' : 'Member'}</small></p>{activeHousehold?.role === 'owner' && member.userId !== session.user.id && <div className="member-actions"><select aria-label={`Role for ${member.displayName}`} value={member.role} disabled={working === 'member'} onChange={(event) => void changeMemberRole(member, event.target.value as HouseholdMember['role'])}><option value="member">Member</option><option value="owner">Owner</option></select><button type="button" className="icon-button delete" disabled={working === 'member' || member.role === 'owner'} onClick={() => void removeMember(member)} aria-label={`Remove ${member.displayName}`} title={member.role === 'owner' ? 'Change this owner to a member before removing them' : 'Remove member'}><Trash2 /></button></div>}</div>)}</div>
          </div>
          <div className="shared-kitchen-actions">
            {activeHousehold?.role === 'owner' && <section><UserPlus /><h3>Invite someone</h3><p>Create a private code they can enter in their Mise settings. Codes expire after seven days.</p>{invite ? <div className="invite-code"><strong>{invite.code}</strong><button onClick={copyInvite} aria-label="Copy invite code"><Copy /></button><small>Expires {new Date(invite.expiresAt).toLocaleDateString()} · {invite.useCount}/{invite.maxUses} uses</small><button className="revoke-invite" onClick={() => void revokeInvite()} disabled={working === 'revoke'}><X /> {working === 'revoke' ? 'Revoking…' : 'Revoke code'}</button></div> : <button className="secondary-button" onClick={makeInvite} disabled={working === 'invite'}>{working === 'invite' ? 'Creating…' : 'Create invite code'}</button>}</section>}
            <form onSubmit={joinKitchen}><House /><h3>Join another kitchen</h3><p>Your personal kitchen stays available, and you can switch back at any time.</p><label>Invite code<input value={joinCode} maxLength={10} autoCapitalize="characters" onChange={(event) => setJoinCode(normalizeInviteCode(event.target.value))} placeholder="10-character code" /></label><button className="secondary-button" disabled={working === 'join' || !inviteCodeIsValid(joinCode) || syncState !== 'saved'}>{working === 'join' ? 'Joining…' : 'Join kitchen'}</button></form>
          </div>
          <section className="household-activity"><div><span>Recent activity</span><button type="button" onClick={() => void refreshActivity()} disabled={working === 'activity'}><RefreshCw /> {working === 'activity' ? 'Refreshing…' : 'Refresh'}</button></div>{activity.length ? <ol>{activity.slice(0, 15).map((entry) => <li key={entry.id}><em>{entry.actorName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</em><p><strong>{entry.actorName}</strong> {entry.description.toLowerCase()}<small>{new Date(entry.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></p></li>)}</ol> : <p>No shared-kitchen changes yet.</p>}</section>
        </div> : <p className="settings-copy">Sign in to invite household members and share a kitchen.</p>}
      </article>
      <article className="settings-card preferences-card panel">
        <div className="settings-card-head"><span><Leaf /></span><div><h2>Food preferences</h2><p>Personalize recipe discovery around how you eat.</p></div></div>
        <form onSubmit={savePreferences}>
          <label>Diet<select value={preferenceDraft.diet} onChange={(event) => setPreferenceDraft((current) => ({ ...current, diet: event.target.value as FoodPreferences['diet'] }))}><option value="">No diet preference</option>{dietPreferences.map((diet) => <option key={diet}>{diet}</option>)}</select></label>
          <fieldset className="preference-options"><legend>Allergies & intolerances</legend><div>{foodIntolerances.map((intolerance) => <button type="button" key={intolerance} className={preferenceDraft.intolerances.includes(intolerance) ? 'selected' : ''} aria-pressed={preferenceDraft.intolerances.includes(intolerance)} onClick={() => toggleIntolerance(intolerance)}>{preferenceDraft.intolerances.includes(intolerance) && <Check />} {intolerance}</button>)}</div></fieldset>
          <label>Ingredients to avoid<input value={excludedDraft} onChange={(event) => setExcludedDraft(event.target.value)} placeholder="e.g. mushrooms, cilantro" /><small>Separate multiple ingredients with commas.</small></label>
          <div className="preference-save"><button className="secondary-button" disabled={working === 'preferences'}>{working === 'preferences' ? 'Saving…' : 'Save food preferences'}</button><p><TriangleAlert /> For severe allergies, always verify the original recipe and product labels. Mise’s saved-recipe warnings are ingredient-name checks, not medical guarantees.</p></div>
        </form>
      </article>
      <article className="settings-card settings-feedback-card panel">
        <div className="settings-card-head"><span><MessageSquareText /></span><div><h2>Help shape Mise</h2><p>Share an idea, report a problem, or tell us what feels confusing.</p></div></div>
        <button className="secondary-button" onClick={onOpenFeedback}><Send /> Send feedback</button>
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
        <div className="smart-review-fields"><label>Quantity<NumberField aria-label={`Quantity for ${item.name}`} min="0.1" step="0.1" value={item.quantity} onValueChange={(quantity) => updateItem(item.id, { quantity })} /></label><label>Unit<input aria-label={`Unit for ${item.name}`} value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} /></label><label>Category<select aria-label={`Category for ${item.name}`} value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value as Category })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Stored in<select aria-label={`Storage for ${item.name}`} value={item.location} onChange={(event) => { const nextLocation = event.target.value as Location; updateItem(item.id, { location: nextLocation, expirationWarning: expirationWarning(item.expiresOn, getFoodIntelligence(item.name)?.profile, nextLocation) }) }}><option>Fridge</option><option>Freezer</option><option>Pantry</option></select></label><label>Use by<input aria-label={`Use-by date for ${item.name}`} type="date" value={item.expiresOn || ''} onChange={(event) => { const nextDate = event.target.value || null; updateItem(item.id, { expiresOn: nextDate, expiresIn: daysUntilDate(nextDate), expirationWarning: expirationWarning(nextDate, getFoodIntelligence(item.name)?.profile, item.location) }) }} /></label></div><div className={`smart-confidence ${item.confidence}`}><Sparkles size={12} /> {item.explanation}</div>
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
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{initialItem ? 'Update your kitchen' : 'Stock your kitchen'}</span><h2>{initialItem ? 'Edit ingredient' : 'Add an ingredient'}</h2></div><button type="button" onClick={onClose} aria-label="Close ingredient form"><X /></button></div><label>Food name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Avocados" /></label>{!initialItem && intelligence && <div className="food-intelligence-suggestion"><span>{intelligence.profile.emoji}</span><div><strong>{intelligence.profile.name}</strong><small>{intelligence.profile.category} · {intelligence.profile.location} · about {intelligence.profile.shelfLifeDays ?? '—'} days</small></div><button type="button" onClick={applyIntelligence}>Use suggestions</button></div>}<fieldset className="icon-picker ingredient-icon-picker"><legend>Choose an icon</legend><div>{foodIcons.map((icon) => <button key={icon} type="button" className={emoji === icon ? 'selected' : ''} onClick={() => setEmoji(icon)} aria-label={`Use ${icon} icon`} aria-pressed={emoji === icon}>{icon}</button>)}</div></fieldset><div className="form-row"><label>Quantity<NumberField min="0.1" step="0.1" value={quantity} onValueChange={setQuantity} /></label><label>Unit<input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="items" /></label></div><div className="form-row"><label>Category<select value={category} onChange={(e) => setCategory(e.target.value as Category)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Stored in<select value={location} onChange={(e) => { const nextLocation = e.target.value as Location; setLocation(nextLocation); if (!initialItem && intelligence) setExpiresOn(suggestedExpirationDate(intelligence.profile, nextLocation, freshnessState) || '') }}><option>Fridge</option><option>Freezer</option><option>Pantry</option></select></label></div><div className="form-row">{!initialItem && intelligence && <label>Freshness status<select value={freshnessState} onChange={(e) => { const nextState = e.target.value as FreshnessState; setFreshnessState(nextState); setExpiresOn(suggestedExpirationDate(intelligence.profile, location, nextState) || '') }}><option value="purchased">Purchased today</option><option value="opened">Opened today</option></select></label>}<label>Use-by date<input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></label></div>{dateWarning && <div className="expiration-warning"><TriangleAlert size={13} /> {dateWarning}</div>}<button className="submit-button" type="submit">{initialItem ? 'Save changes' : 'Add to my kitchen'} <ArrowRight /></button></form></div>
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
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickIngredientText, setQuickIngredientText] = useState('')
  const quickIngredients = useMemo(() => parseRecipeIngredients(quickIngredientText), [quickIngredientText])

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

  function addQuickIngredients() {
    if (!quickIngredients.length) return
    setIngredients((current) => mergeRecipeIngredients(current, quickIngredients))
    setQuickIngredientText('')
    setQuickAddOpen(false)
  }

  const valid = name.trim() && ingredients.some((ingredient) => ingredient.name.trim() && ingredient.amount > 0 && ingredient.unit.trim())
  const selectableIcons = recipeIcons.some(({ icon }) => icon === emoji) ? recipeIcons : [{ icon: emoji, label: 'Current icon' }, ...recipeIcons]
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal recipe-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">My recipes</span><h2>{initialRecipe ? 'Edit your recipe' : 'Add your own recipe'}</h2></div><button type="button" onClick={onClose} aria-label="Close recipe form"><X /></button></div><p className="modal-intro">Mise will compare these ingredients with your kitchen and automatically show what is ready or missing.</p><label>Recipe name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sunday vegetable soup" /></label><fieldset className="icon-picker recipe-icon-picker"><legend>Choose a recipe icon</legend><div>{selectableIcons.map(({ icon, label }) => <button key={icon} type="button" className={emoji === icon ? 'selected' : ''} onClick={() => setEmoji(icon)} aria-label={`Use ${label} icon`} aria-pressed={emoji === icon} title={label}><span>{icon}</span><small>{label}</small></button>)}</div></fieldset><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short note about this recipe…" /></label><div className="recipe-number-fields"><label>Time (min)<NumberField min="1" value={time} onValueChange={setTime} /></label><label>Servings<NumberField min="1" max="24" value={servings} onValueChange={setServings} /></label><label>Protein / serving (g)<NumberField min="0" step="1" value={protein} onValueChange={setProtein} /></label></div><div className="recipe-editor-heading"><div><strong>Ingredients</strong><small>Use the same units as your kitchen for accurate matching.</small></div><div className="recipe-editor-actions"><button type="button" className={quickAddOpen ? 'active' : ''} onClick={() => setQuickAddOpen((open) => !open)}><Sparkles /> Quick add</button><button type="button" onClick={() => setIngredients((current) => [...current, { name: '', amount: 1, unit: 'item' }])}><Plus /> Add row</button></div></div>{quickAddOpen && <section className="recipe-quick-add"><label>Paste or type ingredients<textarea autoFocus value={quickIngredientText} onChange={(event) => setQuickIngredientText(event.target.value)} placeholder={'2 cups rice\n1 tbsp olive oil\n3 cloves garlic'} /></label>{quickIngredients.length > 0 && <div className="recipe-quick-preview">{quickIngredients.map((ingredient, index) => <span key={`${ingredient.name}-${ingredient.unit}-${index}`}><strong>{ingredient.name}</strong><small>{ingredient.amount} {ingredient.unit}</small></span>)}</div>}<button type="button" className="secondary-button" disabled={!quickIngredients.length} onClick={addQuickIngredients}><Plus /> Add {quickIngredients.length || ''} ingredient{quickIngredients.length === 1 ? '' : 's'}</button></section>}<datalist id="kitchen-ingredient-names">{inventory.map((item) => <option key={item.id} value={item.name} />)}</datalist><div className="recipe-ingredient-editor">{ingredients.map((ingredient, index) => <div key={index}><label>Name<input list="kitchen-ingredient-names" required value={ingredient.name} onChange={(event) => { const matched = inventory.find((item) => normalize(item.name) === normalize(event.target.value)); updateIngredient(index, { name: event.target.value, ...(matched ? { unit: matched.unit } : {}) }) }} placeholder="Ingredient" /></label><label>Amount<NumberField min="0.01" step="0.01" value={ingredient.amount} onValueChange={(amount) => updateIngredient(index, { amount })} /></label><label>Unit<input required value={ingredient.unit} onChange={(event) => updateIngredient(index, { unit: event.target.value })} placeholder="cup" /></label><button type="button" className="icon-button delete" onClick={() => setIngredients((current) => current.filter((_, ingredientIndex) => ingredientIndex !== index))} disabled={ingredients.length === 1} aria-label={`Remove ingredient ${index + 1}`}><Trash2 /></button></div>)}</div><label>Method<textarea className="recipe-method" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder={'One step per line\nPrepare the ingredients\nCook until tender\nServe and enjoy'} /></label><button className="submit-button" disabled={!valid}>{initialRecipe ? 'Save recipe changes' : 'Add to My recipes'} <ArrowRight /></button></form></div>
}

function RecipeSheet({ recipe, inventory, onClose, onAction, onEdit, onDelete }: { recipe: RecipeMatch; inventory: InventoryItem[]; onClose: () => void; onAction: (scale: number) => void; onEdit?: () => void; onDelete?: () => void }) {
  const [servings, setServings] = useState(recipe.servings)
  const scale = servings / recipe.servings
  const ingredientStatus = recipe.ingredients.map((ingredient) => {
    const needed = Number((ingredient.amount * scale).toFixed(2))
    const have = availableAmount(inventory, ingredient, normalize)
    return { ...ingredient, needed, missing: have < needed }
  })
  const missingCount = ingredientStatus.filter((ingredient) => ingredient.missing).length
  const match = Math.round(((ingredientStatus.length - missingCount) / ingredientStatus.length) * 100)
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="recipe-sheet" onMouseDown={(e) => e.stopPropagation()}><button className="sheet-close" onClick={onClose} aria-label="Close recipe"><X /></button><div className="sheet-art" style={{ '--accent': recipe.accent } as React.CSSProperties}>{recipe.imageUrl ? <img src={recipe.imageUrl} alt="" /> : <span>{recipe.emoji}</span>}<em>{missingCount ? `${match}% match` : 'Everything available'}</em></div><div className="sheet-body"><div className="recipe-owner-actions"><span>{recipe.source === 'mise' ? 'Mise recipe' : recipe.source === 'spoonacular' ? 'Saved recipe' : 'My recipe'}</span>{recipe.source === 'user' && <button onClick={onEdit}><Pencil /> Edit</button>}<button className="delete" onClick={onDelete}><Trash2 /> Remove</button></div><span className="eyebrow">Your kitchen match</span><h2>{recipe.name}</h2><p>{recipe.description}</p>{recipe.preferenceWarnings.length > 0 && <div className="preference-warning"><TriangleAlert /><div><strong>Check against your preferences</strong><span>{recipe.preferenceWarnings.join(' · ')}</span></div></div>}<div className="sheet-stats"><span><Clock3 /> {recipe.time} min</span><span><Sparkles /> {recipe.protein}g protein</span></div><div className="serving-control"><div><strong>Servings</strong><small>Ingredients update automatically</small></div><div><button onClick={() => setServings((value) => Math.max(1, value - 1))}><Minus /></button><strong>{servings}</strong><button onClick={() => setServings((value) => Math.min(12, value + 1))}><Plus /></button></div></div><h3>From your kitchen</h3><div className="ingredient-list">{ingredientStatus.map((ingredient) => <div className={ingredient.missing ? 'missing' : ''} key={`${ingredient.name}-${ingredient.unit}`}><span>{ingredient.missing ? <Plus /> : <Check />}</span><strong>{ingredient.name}</strong><small>{formatAmount(ingredient.needed)} {ingredient.unit}</small></div>)}</div>{recipe.urgent > 0 && <div className="rescue-note"><Leaf /> This meal uses {recipe.urgent} ingredient{recipe.urgent === 1 ? '' : 's'} that should be enjoyed soon.</div>}{Boolean(recipe.instructions?.length) && <div className="recipe-steps"><h3>Method</h3><ol>{recipe.instructions!.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol></div>}{recipe.sourceUrl && <a className="source-recipe-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer">View original recipe <ExternalLink /></a>}<button className="submit-button" onClick={() => onAction(scale)}>{missingCount ? `Add ${missingCount} missing item${missingCount === 1 ? '' : 's'} to grocery list` : `Cook ${servings} servings & update my kitchen`} <ArrowRight /></button></div></section></div>
}

function Empty({ title, copy }: { title: string; copy: string }) { return <div className="empty"><PackageOpen /><strong>{title}</strong><p>{copy}</p></div> }

export default App
