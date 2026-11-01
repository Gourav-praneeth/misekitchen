import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUp, BellRing, Bookmark, BookmarkCheck, CalendarDays, Camera, Check, ChefHat, ChevronLeft, ChevronRight, CirclePlus, Clock3, Cloud, CookingPot, Copy, Flashlight,
  ExternalLink, House, KeyRound, Leaf, LogOut, Mail, MessageSquareText, Minus, MoreHorizontal, PackageOpen, Pencil, Plus, RefreshCw, Search, Send,
  Settings as SettingsIcon, ShieldCheck, ShoppingBasket, Sparkles, Trash2, TriangleAlert, Undo2, UserPlus, UserRound, UsersRound, WifiOff, X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import AuthScreen from './AuthScreen'
import { addBarcodeBatchItem, barcodeBatchLabel, removeBarcodeBatchItem } from './barcodeBatch'
import { inventoryItemFromBarcodeProduct, inventoryItemFromHouseholdProduct, rememberedHouseholdProduct, rememberedInventoryProduct, rememberHouseholdProducts } from './barcodeInventory'
import { applyBarcodeToGroceryPurchase, barcodeProductFromRemembered, bestGroceryBarcodeMatch, groceryBarcodeMatchScore, groceryItemFromBarcodeProduct } from './groceryBarcode'
import { recipes, seedInventory } from './data'
import { cookingHistoryEntry, cookingHistoryStats, recentCookingHistory } from './cookingHistory'
import { acceptKitchenCollections, acceptKitchenSnapshot, acknowledgeForcedCollections, changedKitchenCollections, forceKitchenCollections, kitchenFingerprints, pendingForcedCollections, rebasePendingKitchen, retainExistingGroceryItemIds, unseenGroceryItemIds, type CollaborativeKitchenSnapshot, type ForcedCollectionVersions, type KitchenCollection, type KitchenFingerprints } from './collaborationSync'
import { expirationWarning, suggestedExpirationDate, type FreshnessState } from './expirationIntelligence'
import { daysUntilDate, daysUntilExpiration, expirationDateFromDays, withExpirationDate } from './freshness'
import { foodCatalog, getFoodIntelligence } from './foodCatalog'
import { addOrUpdateStaple, groceryFromStaples, moveStaple, moveStapleGroup, orderedStapleGroups, orderedStaples } from './groceryStaples'
import { cleanGroceryReviewItems, groceryReviewStatuses, isValidGroceryReviewItem } from './groceryReview'
import { inviteCodeIsValid, normalizeInviteCode } from './household'
import { legacyFoodMappings, normalizeLegacyGrocery, normalizeLegacyInventory, resolveGroceryPresentation, resolveInventoryPresentation } from './legacyCompatibility'
import { groceryCategory, groceryEmoji, groceryItemsFromText, inventoryItemFromGrocery, mergeGroceryItems, mergeInventoryItems, purchasedGroceryAmount } from './inventoryIntelligence'
import { dietPreferences, emptyFoodPreferences, foodIntolerances, foodPreferenceSummary } from './foodPreferences'
import { addWeeks, applyMealPlanTemplate, copyMealPlanDay, groceryForMealPlan, localDateKey, mealPlanEntryId, mealPlanTemplateFromWeek, mealSlots, repeatMealPlanWeek, startOfWeek, weekDates } from './mealPlanner'
import { defaultMealReminderPreferences, mealReminderLabel, mealRemindersForToday, normalizeMealReminderPreferences, type MealReminder, type MealReminderPreferences } from './mealReminders'
import { formatAmount } from './measurements'
import { collapseInventoryPresence, hasIngredient, removeIngredients } from './inventoryPresence'
import { isNewerKitchenMessage, releaseSyncLease, sameKitchenContents, syncLeaseKey, tryAcquireSyncLease } from './multiTabSync'
import { matchRecipes, recommendationGuidance, type RecipeMatch, type RecommendationGuidance } from './recipeIntelligence'
import { recipeIcons } from './recipeIcons'
import { mergeRecipeIngredients, parseRecipeIngredients } from './recipeIngredients'
import { scanReceiptImage } from './receiptScanner'
import { lookupBarcodeProduct, ProductNotFoundError } from './productLookup'
import { isValidBarcode, normalizeBarcode, productMetadata, type BarcodeProduct } from './productIdentity'
import { saveableDiscoveredRecipe } from './savedRecipe'
import { loadDiscoverRecipe, searchDiscoverRecipes, type DiscoverRecipe, type DiscoverRecipeDetails } from './spoonacular'
import { normalizeFoodName, parseSmartEntry, sameFoodAndUnit } from './smartEntry'
import type { SmartEntryItem } from './smartEntry'
import { cloudEnabled, createHouseholdInvite, deleteCookingHistoryEntry, deleteMealPlanTemplate, getHouseholdId, joinHousehold, loadActiveHouseholdInvite, loadCloudKitchen, loadFoodPreferences, loadGroceryLastSeen, loadHouseholdActivity, loadHouseholdFoodMappings, loadHouseholdMembers, loadHouseholds, loadRememberedProduct, markGrocerySeen, markHouseholdInitialized, recordUnknownFoodTerm, removeHouseholdMember, renameHousehold, revokeHouseholdInvite, saveCookingHistoryEntry, saveFoodPreferences, saveHouseholdFoodMapping, saveKitchenSnapshot, saveStorageAreas, setActiveHousehold, setMiseRecipeHidden, submitFeedback, supabase, updateHouseholdMemberRole } from './supabase'
import { createLatestSaveQueue, shouldHydrateKitchen, withRetry } from './sync'
import type { Category, CookingHistoryEntry, FoodGroup, FoodIntolerance, FoodPreferences, FreshnessPolicy, GroceryItem, GroceryStaple, GroceryStapleGroup, HouseholdActivity, HouseholdFoodMapping, HouseholdInvite, HouseholdMember, HouseholdProduct, HouseholdSummary, InventoryItem, MealPlanEntry, MealPlanTemplate, MealSlot, Recipe, StorageArea, StorageCondition } from './types'
import UnitPicker from './UnitPicker'
import { activeStorageAreas, currentStorageAreaId, defaultStorageAreas, foodGroups, freshnessLabel, legacyCategoryForFoodGroup, legacyLocationForCondition, storageAreaForId } from './storageAreas'

type View = 'home' | 'kitchen' | 'recipes' | 'planner' | 'grocery' | 'settings'
type KitchenFoodGroup = 'All' | FoodGroup
type SyncState = 'saved' | 'syncing' | 'error' | 'offline' | 'conflict'
type SmartReviewItem = SmartEntryItem & { merge: boolean }
type ToastState = { message: string; undo?: () => void }
type UndoNotice = (message: string, undo: () => void, restoredMessage?: string, collections?: KitchenCollection[]) => void
type GroceryPurchaseDraft = GroceryItem & { purchase: NonNullable<GroceryItem['purchase']> }
type GroceryAddSource = 'recipe' | 'recommendation' | 'meal plan' | 'Discover' | 'staples' | 'bulk add' | 'restock'
type GroceryReviewRequest = { items: GroceryItem[]; source: GroceryAddSource; onComplete?: () => void }
type CookingDraft = { recipe: RecipeMatch; scale: number }
type SettingsArea = 'general' | 'food' | 'household' | 'account'
type StoredKitchen = { householdId: string; inventory: InventoryItem[]; grocery: GroceryItem[]; stapleGroups?: GroceryStapleGroup[]; staples?: GroceryStaple[]; recipes?: Recipe[]; mealPlan?: MealPlanEntry[]; mealPlanTemplates?: MealPlanTemplate[]; cookingHistory?: CookingHistoryEntry[]; productMemory?: HouseholdProduct[]; storageAreas?: StorageArea[]; hiddenMiseRecipeIds?: string[]; savedAt: string }
type KitchenSyncMessage = { type: 'kitchen-saved'; senderId: string; revision: number; snapshot: StoredKitchen }

const categories: Category[] = ['Protein', 'Produce', 'Dairy', 'Pantry', 'Other']
const categoryEmoji: Record<Category, string> = { Protein: '🥩', Produce: '🥬', Dairy: '🥛', Pantry: '🌾', Other: '🧂' }
const defaultIngredientIcon = '◌'
const foodIcons = Array.from(new Set([defaultIngredientIcon, ...foodCatalog.map((profile) => profile.emoji)]))

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
  const [kitchenLocation, setKitchenLocation] = useState('all')
  const [kitchenFoodGroup, setKitchenFoodGroup] = useState<KitchenFoodGroup>('All')
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('mise-inventory-v1') || '') || seedInventory
      return collapseInventoryPresence(normalizeLegacyInventory(stored).items.map((item) => withExpirationDate(item)))
    } catch { return seedInventory.map((item) => withExpirationDate(item)) }
  })
  const [grocery, setGrocery] = useState<GroceryItem[]>(() => {
    try { return normalizeLegacyGrocery(JSON.parse(localStorage.getItem('mise-grocery-v1') || '') || []).items } catch { return [] }
  })
  const groceryRef = useRef(grocery)
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
  const [productMemory, setProductMemory] = useState<HouseholdProduct[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-product-memory-v1') || '') || [] } catch { return [] }
  })
  const [storageAreas, setStorageAreas] = useState<StorageArea[]>(() => {
    try { return JSON.parse(localStorage.getItem('mise-storage-areas-v1') || '') || defaultStorageAreas } catch { return defaultStorageAreas }
  })
  const [foodMappings, setFoodMappings] = useState<HouseholdFoodMapping[]>([])
  const [foodMappingsReady, setFoodMappingsReady] = useState(false)
  const [newGroceryIds, setNewGroceryIds] = useState<Set<string>>(new Set())
  const visibleNewGroceryIds = useMemo(() => retainExistingGroceryItemIds(newGroceryIds, grocery), [newGroceryIds, grocery])
  const previousView = useRef<View>('home')
  const [addOpen, setAddOpen] = useState(false)
  const [smartOpen, setSmartOpen] = useState(false)
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [topMenuOpen, setTopMenuOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [recipeEditorOpen, setRecipeEditorOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeMatch | null>(null)
  const [planningRecipe, setPlanningRecipe] = useState<RecipeMatch | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [groceryReview, setGroceryReview] = useState<GroceryReviewRequest | null>(null)
  const [cookingDraft, setCookingDraft] = useState<CookingDraft | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!cloudEnabled)
  const [demoMode, setDemoMode] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const cloudReadyRef = useRef(cloudReady)
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
  const remoteRefreshPending = useRef(false)
  const remoteRefreshTimer = useRef<number | null>(null)
  const remoteRefreshRequest = useRef(0)
  const syncBaseline = useRef<Partial<KitchenFingerprints>>({})
  const syncBaselineSnapshot = useRef<CollaborativeKitchenSnapshot | null>(null)
  const forceAllCollectionsSave = useRef(false)
  const forcedCollectionVersions = useRef<ForcedCollectionVersions>({})
  const legacyIconBackfillHousehold = useRef<string | null>(null)
  const syncConflict = useRef(false)
  const applyingRemoteSnapshot = useRef(false)
  const skipNextCloudSave = useRef(false)

  useEffect(() => { groceryRef.current = grocery }, [grocery])
  useEffect(() => { cloudReadyRef.current = cloudReady }, [cloudReady])

  const reconcileRemoteKitchen = useCallback(async () => {
    if (!session || !householdId || demoMode || localChangesPending.current) {
      remoteRefreshPending.current = true
      return
    }
    const targetHousehold = householdId
    const request = ++remoteRefreshRequest.current
    try {
      const [cloud, mappings] = await Promise.all([loadCloudKitchen(targetHousehold), loadHouseholdFoodMappings(targetHousehold)])
      if (request !== remoteRefreshRequest.current) return
      if (localChangesPending.current) {
        remoteRefreshPending.current = true
        return
      }
      const nextInventory = collapseInventoryPresence(normalizeLegacyInventory(cloud.inventory).items.map((item) => withExpirationDate(resolveInventoryPresentation(item, mappings))))
      const nextGrocery = normalizeLegacyGrocery(cloud.grocery).items.map((item) => resolveGroceryPresentation(item, mappings))
      const shared: CollaborativeKitchenSnapshot = {
        inventory: nextInventory, grocery: nextGrocery, stapleGroups: cloud.stapleGroups, staples: cloud.staples,
        recipes: cloud.recipes, mealPlan: cloud.mealPlan, mealPlanTemplates: cloud.mealPlanTemplates,
      }
      applyingRemoteSnapshot.current = true
      syncBaseline.current = kitchenFingerprints(shared)
      syncBaselineSnapshot.current = shared
      setInventory(nextInventory)
      setGrocery(nextGrocery)
      setStapleGroups(cloud.stapleGroups)
      setStaples(cloud.staples)
      setCustomRecipes(cloud.recipes)
      setMealPlan(cloud.mealPlan)
      setMealPlanTemplates(cloud.mealPlanTemplates)
      setCookingHistory(cloud.cookingHistory)
      setProductMemory(cloud.productMemory)
      setStorageAreas(cloud.storageAreas)
      setHiddenMiseRecipeIds(cloud.hiddenMiseRecipeIds)
      setFoodMappings(mappings)
      setFoodMappingsReady(true)
      mealPlanTemplatesDirty.current = false
      const snapshot = { householdId: targetHousehold, ...shared, cookingHistory: cloud.cookingHistory, productMemory: cloud.productMemory, storageAreas: cloud.storageAreas, hiddenMiseRecipeIds: cloud.hiddenMiseRecipeIds, savedAt: new Date().toISOString() }
      writeStoredKitchen('cache', session.user.id, snapshot)
      setSyncState('saved')
    } catch (error) {
      console.error('Household changes could not be reconciled.', error)
      if (request === remoteRefreshRequest.current && !localChangesPending.current && !syncConflict.current) {
        setSyncState(navigator.onLine ? 'error' : 'offline')
      }
    }
  }, [session, householdId, demoMode])

  const scheduleRemoteRefresh = useCallback(() => {
    if (remoteRefreshTimer.current !== null) window.clearTimeout(remoteRefreshTimer.current)
    remoteRefreshTimer.current = window.setTimeout(() => {
      remoteRefreshTimer.current = null
      void reconcileRemoteKitchen()
    }, 180)
  }, [reconcileRemoteKitchen])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (nextSession) setDemoMode(false)
      else {
        setHouseholdId(null)
        setCloudReady(false)
        syncBaseline.current = {}
        syncBaselineSnapshot.current = null
        setProductMemory([])
        setFoodMappings([])
        setFoodMappingsReady(false)
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
    if (!topMenuOpen) return
    const close = () => setTopMenuOpen(false)
    const closeWithKeyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', closeWithKeyboard)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', closeWithKeyboard)
    }
  }, [topMenuOpen])

  useEffect(() => () => {
    if (remoteRefreshTimer.current !== null) window.clearTimeout(remoteRefreshTimer.current)
    remoteRefreshRequest.current += 1
  }, [])

  useEffect(() => {
    if (!authReady || !window.location.href.endsWith('#')) return
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  }, [authReady])

  useEffect(() => {
    if (!session || demoMode) return
    if (!shouldHydrateKitchen(isOnline, cloudReadyRef.current)) return
    let active = true
    async function hydrate() {
      setCloudReady(false)
      setFoodMappingsReady(false)
      syncBaseline.current = {}
      syncBaselineSnapshot.current = null
      legacyIconBackfillHousehold.current = null
      try {
        const pendingKitchen = readStoredKitchen('pending', session!.user.id)
        const cachedKitchen = readStoredKitchen('cache', session!.user.id)
        const localKitchen = pendingKitchen || cachedKitchen
        if (!isOnline) {
          if (localKitchen) {
            setHouseholdId(localKitchen.householdId)
            setInventory(collapseInventoryPresence(normalizeLegacyInventory(localKitchen.inventory).items.map((item) => withExpirationDate(item))))
            setGrocery(normalizeLegacyGrocery(localKitchen.grocery).items)
            setStapleGroups(localKitchen.stapleGroups || [])
            setStaples(localKitchen.staples || [])
            setCustomRecipes(localKitchen.recipes || [])
            setMealPlan(localKitchen.mealPlan || [])
            setMealPlanTemplates(localKitchen.mealPlanTemplates || [])
            setCookingHistory(localKitchen.cookingHistory || [])
            setProductMemory(localKitchen.productMemory || [])
            setStorageAreas(localKitchen.storageAreas || defaultStorageAreas)
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
        setStorageAreas(cloud.storageAreas)
        const normalizedCloud: CollaborativeKitchenSnapshot = {
          inventory: normalizeLegacyInventory(cloud.inventory).items,
          grocery: normalizeLegacyGrocery(cloud.grocery).items,
          stapleGroups: cloud.stapleGroups,
          staples: cloud.staples,
          recipes: cloud.recipes,
          mealPlan: cloud.mealPlan,
          mealPlanTemplates: cloud.mealPlanTemplates,
        }
        syncBaselineSnapshot.current = normalizedCloud
        syncBaseline.current = kitchenFingerprints(normalizedCloud)
        const pending = pendingKitchen
        if (pending?.householdId === id) {
          const pendingShared: CollaborativeKitchenSnapshot = {
            inventory: normalizeLegacyInventory(pending.inventory).items,
            grocery: normalizeLegacyGrocery(pending.grocery).items,
            stapleGroups: pending.stapleGroups || [], staples: pending.staples || [],
            recipes: pending.recipes || [], mealPlan: pending.mealPlan || [], mealPlanTemplates: pending.mealPlanTemplates || [],
          }
          const cachedShared: CollaborativeKitchenSnapshot | null = cachedKitchen?.householdId === id ? {
            inventory: normalizeLegacyInventory(cachedKitchen.inventory).items,
            grocery: normalizeLegacyGrocery(cachedKitchen.grocery).items,
            stapleGroups: cachedKitchen.stapleGroups || [], staples: cachedKitchen.staples || [],
            recipes: cachedKitchen.recipes || [], mealPlan: cachedKitchen.mealPlan || [], mealPlanTemplates: cachedKitchen.mealPlanTemplates || [],
          } : null
          const rebased = rebasePendingKitchen(normalizedCloud, pendingShared, cachedShared)
          setInventory(collapseInventoryPresence(rebased.inventory.map((item) => withExpirationDate(item))))
          setGrocery(rebased.grocery)
          setStapleGroups(rebased.stapleGroups)
          setStaples(rebased.staples)
          setCustomRecipes(rebased.recipes)
          setMealPlan(rebased.mealPlan)
          setMealPlanTemplates(rebased.mealPlanTemplates)
          setCookingHistory(pending.cookingHistory || cloud.cookingHistory)
          setProductMemory(pending.productMemory || cloud.productMemory)
          setStorageAreas(pending.storageAreas || cloud.storageAreas)
          mealPlanTemplatesDirty.current = pendingShared.mealPlanTemplates.length > 0
          setHiddenMiseRecipeIds(pending.hiddenMiseRecipeIds || [])
        } else if (!cloud.initialized) {
          const initialInventory = starterInventory.current.length ? starterInventory.current : seedInventory.map((item) => withExpirationDate(item))
          setInventory(collapseInventoryPresence(initialInventory))
          setCustomRecipes(starterRecipes.current)
          setMealPlan(starterMealPlan.current)
          setMealPlanTemplates(starterMealPlanTemplates.current)
          setCookingHistory([])
          setProductMemory(cloud.productMemory)
          setStorageAreas(cloud.storageAreas)
          mealPlanTemplatesDirty.current = false
          setHiddenMiseRecipeIds([])
          setStapleGroups(starterStapleGroups.current)
          setStaples(starterStaples.current)
          const initialShared: CollaborativeKitchenSnapshot = { inventory: initialInventory, grocery: starterGrocery.current, stapleGroups: starterStapleGroups.current, staples: starterStaples.current, recipes: starterRecipes.current, mealPlan: starterMealPlan.current, mealPlanTemplates: starterMealPlanTemplates.current }
          await saveKitchenSnapshot(id, initialShared)
          syncBaselineSnapshot.current = initialShared
          syncBaseline.current = kitchenFingerprints(initialShared)
          await markHouseholdInitialized(id)
        } else {
          const legacyInventory = normalizeLegacyInventory(cloud.inventory)
          const legacyGrocery = normalizeLegacyGrocery(cloud.grocery)
          setInventory(collapseInventoryPresence(normalizedCloud.inventory))
          setGrocery(normalizedCloud.grocery)
          setStapleGroups(cloud.stapleGroups)
          setStaples(cloud.staples)
          setCustomRecipes(cloud.recipes)
          setMealPlan(cloud.mealPlan)
          setMealPlanTemplates(cloud.mealPlanTemplates)
          setCookingHistory(cloud.cookingHistory)
          setProductMemory(cloud.productMemory)
          setStorageAreas(cloud.storageAreas)
          mealPlanTemplatesDirty.current = false
          setHiddenMiseRecipeIds(cloud.hiddenMiseRecipeIds)
          writeStoredKitchen('cache', session!.user.id, { householdId: id, inventory: legacyInventory.items, grocery: legacyGrocery.items, stapleGroups: cloud.stapleGroups, staples: cloud.staples, recipes: cloud.recipes, mealPlan: cloud.mealPlan, mealPlanTemplates: cloud.mealPlanTemplates, cookingHistory: cloud.cookingHistory, productMemory: cloud.productMemory, storageAreas: cloud.storageAreas, hiddenMiseRecipeIds: cloud.hiddenMiseRecipeIds, savedAt: new Date().toISOString() })
          if (legacyInventory.changed) forcedCollectionVersions.current = forceKitchenCollections(forcedCollectionVersions.current, ['inventory'])
          if (legacyGrocery.changed) forcedCollectionVersions.current = forceKitchenCollections(forcedCollectionVersions.current, ['grocery'])
        }
        // Enable outbound sync on the next task so every hydrated collection has
        // rendered before the snapshot effect can run. Without this boundary, a
        // newly introduced collection can briefly save its empty initial state.
        window.setTimeout(() => {
          if (!active) return
          localChangesPending.current = Boolean(pending?.householdId === id)
          forceAllCollectionsSave.current = Boolean(pending?.householdId === id)
          skipNextCloudSave.current = !pending?.householdId || pending.householdId !== id
          setCloudReady(true)
          setSyncState(pending?.householdId === id ? 'syncing' : 'saved')
          if (pendingForcedCollections(forcedCollectionVersions.current).length) window.setTimeout(() => setRetryToken((value) => value + 1), 0)
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
    if (!session || demoMode) localStorage.setItem('mise-product-memory-v1', JSON.stringify(productMemory))
  }, [productMemory, session, demoMode])
  useEffect(() => {
    if (!session || demoMode) localStorage.setItem('mise-storage-areas-v1', JSON.stringify(storageAreas))
  }, [storageAreas, session, demoMode])

  useEffect(() => {
    if (!session || demoMode) return
    let active = true
    loadFoodPreferences(session.user.id)
      .then((preferences) => { if (active) setFoodPreferences(preferences) })
      .catch((error) => console.error('Food preferences could not be loaded.', error))
    return () => { active = false }
  }, [session, demoMode])

  useEffect(() => {
    if (!session || !householdId || !cloudReady || demoMode) return
    let active = true
    Promise.all([loadHouseholdFoodMappings(householdId), loadGroceryLastSeen(householdId, session.user.id)])
      .then(([mappings, lastSeen]) => {
        if (!active) return
        setFoodMappings(mappings)
        setFoodMappingsReady(true)
        setInventory((current) => current.map((item) => resolveInventoryPresentation(item, mappings)))
        const decoratedGrocery = groceryRef.current.map((item) => resolveGroceryPresentation(item, mappings))
        setGrocery(decoratedGrocery)
        setNewGroceryIds(unseenGroceryItemIds(decoratedGrocery, session.user.id, lastSeen))
        if (!lastSeen) void markGrocerySeen(householdId, session.user.id)
      })
      .catch((error) => console.error('Household collaboration details could not be loaded.', error))
    return () => { active = false }
  }, [session, householdId, cloudReady, demoMode])

  useEffect(() => {
    if (!session || !householdId || demoMode || !foodMappingsReady || legacyIconBackfillHousehold.current === householdId) return
    legacyIconBackfillHousehold.current = householdId
    const additions = legacyFoodMappings(inventory, foodMappings)
    if (!additions.length) return
    let active = true
    void Promise.allSettled(additions.map((mapping) => saveHouseholdFoodMapping(householdId, mapping))).then((results) => {
      if (!active) return
      results.forEach((result) => { if (result.status === 'rejected') console.error('Legacy food icon could not be remembered.', result.reason) })
      const saved = additions.filter((_, index) => results[index]?.status === 'fulfilled')
      setFoodMappings((current) => [...current, ...saved.filter((mapping) => !current.some((candidate) => candidate.normalizedName === mapping.normalizedName))])
      setInventory((current) => current.map((item) => resolveInventoryPresentation(item, saved)))
      setGrocery((current) => current.map((item) => resolveGroceryPresentation(item, saved)))
    })
    return () => { active = false }
  }, [session, householdId, demoMode, foodMappingsReady, inventory, foodMappings])

  useEffect(() => {
    if (!session || !householdId || !cloudReady || !supabase || demoMode) return
    const client = supabase
    const tables = ['inventory_items', 'grocery_items', 'household_recipes', 'meal_plan_entries', 'meal_plan_templates', 'grocery_staple_groups', 'grocery_staples', 'cooking_history', 'household_products', 'household_food_mappings', 'household_storage_areas']
    const channel = client.channel(`mise-household-${householdId}`)
    tables.forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` }, (payload) => {
        const row = (payload.new || {}) as Record<string, unknown>
        if (table === 'grocery_items' && payload.eventType === 'INSERT' && row.created_by && row.created_by !== session.user.id && row.id) {
          setNewGroceryIds((current) => new Set(current).add(String(row.id)))
        }
        if (localChangesPending.current) {
          remoteRefreshPending.current = true
          return
        }
        scheduleRemoteRefresh()
      })
    })
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${householdId}` }, () => {
      if (localChangesPending.current) remoteRefreshPending.current = true
      else scheduleRemoteRefresh()
    })
    channel.subscribe()
    return () => {
      remoteRefreshRequest.current += 1
      void client.removeChannel(channel)
    }
  }, [session, householdId, cloudReady, demoMode, scheduleRemoteRefresh])

  useEffect(() => {
    const was = previousView.current
    previousView.current = view
    if (!session || !householdId || demoMode) return
    if (view !== 'grocery' && was === 'grocery') {
      void markGrocerySeen(householdId, session.user.id)
      setNewGroceryIds(new Set())
    }
  }, [view, session, householdId, demoMode])

  useEffect(() => {
    if (!session || !householdId || !cloudReady || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(`mise-kitchen-sync-v1-${session.user.id}-${householdId}`)
    syncChannel.current = channel
    channel.onmessage = (event: MessageEvent<KitchenSyncMessage>) => {
      const message = event.data
      if (message?.type !== 'kitchen-saved' || message.snapshot.householdId !== householdId) return
      if (!isNewerKitchenMessage(syncRevision.current, message.revision, message.senderId, tabId.current)) return
      const pending = readStoredKitchen('pending', session.user.id)
      const hasPending = pending?.householdId === householdId
      const matchesPending = hasPending && sameKitchenContents(pending as unknown as Record<string, unknown>, message.snapshot as unknown as Record<string, unknown>)
      if (syncConflict.current || (hasPending && !matchesPending)) {
        syncConflict.current = true
        setSyncState('conflict')
        return
      }
      syncConflict.current = false
      applyingRemoteSnapshot.current = true
      syncRevision.current = message.revision
      const snapshot = message.snapshot
      const shared: CollaborativeKitchenSnapshot = {
        inventory: collapseInventoryPresence(normalizeLegacyInventory(snapshot.inventory).items.map((item) => withExpirationDate(item))),
        grocery: normalizeLegacyGrocery(snapshot.grocery).items,
        stapleGroups: snapshot.stapleGroups || [], staples: snapshot.staples || [],
        recipes: snapshot.recipes || [], mealPlan: snapshot.mealPlan || [], mealPlanTemplates: snapshot.mealPlanTemplates || [],
      }
      syncBaselineSnapshot.current = shared
      syncBaseline.current = kitchenFingerprints(shared)
      setInventory(shared.inventory)
      setGrocery(shared.grocery)
      setStapleGroups(snapshot.stapleGroups || [])
      setStaples(snapshot.staples || [])
      setCustomRecipes(snapshot.recipes || [])
      setMealPlan(snapshot.mealPlan || [])
      setMealPlanTemplates(snapshot.mealPlanTemplates || [])
      mealPlanTemplatesDirty.current = false
      setCookingHistory(snapshot.cookingHistory || [])
      setProductMemory(snapshot.productMemory || [])
      setStorageAreas(snapshot.storageAreas || defaultStorageAreas)
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
    const shared: CollaborativeKitchenSnapshot = { inventory, grocery, stapleGroups, staples, recipes: customRecipes, mealPlan, mealPlanTemplates }
    const fingerprints = kitchenFingerprints(shared)
    if (applyingRemoteSnapshot.current) {
      applyingRemoteSnapshot.current = false
      syncBaseline.current = fingerprints
      localChangesPending.current = false
      return
    }
    if (skipNextCloudSave.current) {
      skipNextCloudSave.current = false
      syncBaseline.current = fingerprints
      localChangesPending.current = false
      return
    }
    if (syncConflict.current) { setSyncState('conflict'); return }
    const forcedVersions = { ...forcedCollectionVersions.current }
    const forcedCollections = pendingForcedCollections(forcedVersions)
    const dirtyCollections = [...new Set([
      ...changedKitchenCollections(fingerprints, syncBaseline.current, forceAllCollectionsSave.current),
      ...forcedCollections,
    ])]
    const snapshot = { householdId, ...shared, cookingHistory, productMemory, storageAreas, hiddenMiseRecipeIds, savedAt: new Date().toISOString() }
    if (!dirtyCollections.length) {
      writeStoredKitchen('cache', session.user.id, snapshot)
      if (localChangesPending.current) {
        localStorage.removeItem(kitchenStorageKey('pending', session.user.id))
        localChangesPending.current = false
        setSyncState('saved')
      }
      return
    }
    const reservation = saveQueue.current.reserve()
    const baselineSnapshot = syncBaselineSnapshot.current
    localChangesPending.current = true
    writeStoredKitchen('pending', session.user.id, snapshot)
    setSyncState(isOnline ? 'syncing' : 'offline')
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
          await withRetry(() => saveKitchenSnapshot(householdId, shared, dirtyCollections, baselineSnapshot, forcedCollections))
        } finally {
          releaseSyncLease(localStorage, leaseKey, tabId.current)
        }
      })
      if (!result.latest) return
      if (!result.error) {
        localStorage.removeItem(kitchenStorageKey('pending', session.user.id))
        writeStoredKitchen('cache', session.user.id, snapshot)
        syncBaseline.current = acceptKitchenCollections(syncBaseline.current, fingerprints, dirtyCollections)
        syncBaselineSnapshot.current = acceptKitchenSnapshot(syncBaselineSnapshot.current, shared, dirtyCollections)
        forceAllCollectionsSave.current = false
        forcedCollectionVersions.current = acknowledgeForcedCollections(forcedCollectionVersions.current, forcedVersions)
        if (dirtyCollections.includes('mealPlanTemplates')) mealPlanTemplatesDirty.current = false
        localChangesPending.current = false
        const revision = Date.now()
        syncRevision.current = revision
        syncChannel.current?.postMessage({ type: 'kitchen-saved', senderId: tabId.current, revision, snapshot } satisfies KitchenSyncMessage)
        setSyncState('saved')
        remoteRefreshPending.current = false
        scheduleRemoteRefresh()
      } else {
        console.error(result.error instanceof Error ? result.error.message : String(result.error))
        setSyncState(navigator.onLine ? 'error' : 'offline')
      }
    }, retryToken ? 50 : 450)
    return () => window.clearTimeout(timer)
  }, [inventory, grocery, stapleGroups, staples, customRecipes, mealPlan, mealPlanTemplates, cookingHistory, productMemory, storageAreas, hiddenMiseRecipeIds, householdId, cloudReady, session, isOnline, retryToken, scheduleRemoteRefresh])

  useEffect(() => {
    if (syncState === 'saved') return
    function protectUnsaved(event: BeforeUnloadEvent) { event.preventDefault() }
    window.addEventListener('beforeunload', protectUnsaved)
    return () => window.removeEventListener('beforeunload', protectUnsaved)
  }, [syncState])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.undo ? 5000 : 3200)
    return () => clearTimeout(timer)
  }, [toast])

  const recipeMatches = useMemo<RecipeMatch[]>(
    () => matchRecipes(
      [...customRecipes, ...recipes.filter((recipe) => !hiddenMiseRecipeIds.includes(recipe.id))],
      inventory,
      foodPreferences,
      { cookingHistory, mealPlan, now: clock },
    ),
    [customRecipes, hiddenMiseRecipeIds, inventory, foodPreferences, cookingHistory, mealPlan, clock],
  )
  const todayMealReminders = useMemo(
    () => mealRemindersForToday(mealPlan, recipeMatches, clock, mealReminderPreferences),
    [mealPlan, recipeMatches, clock, mealReminderPreferences],
  )
  const recipeGuidance = useMemo(() => recommendationGuidance(recipeMatches, inventory), [recipeMatches, inventory])

  const urgentItems = [...inventory].filter((item) => {
    if (item.freshnessPolicy === 'none') return false
    const days = daysUntilExpiration(item)
    return days !== null && days <= 3
  }).sort((a, b) => Number(daysUntilExpiration(a)) - Number(daysUntilExpiration(b)))
  const counts = categories.map((category) => ({ category, count: inventory.filter((item) => item.category === category).length }))
  const readyCount = recipeMatches.filter((recipe) => recipe.missing.length === 0).length

  function notify(message: string) { setToast({ message }) }

  function offerUndo(message: string, undo: () => void, restoredMessage = 'Item restored', collections: KitchenCollection[] = []) {
    setToast({
      message,
      undo: () => {
        undo()
        if (collections.length) {
          forcedCollectionVersions.current = forceKitchenCollections(forcedCollectionVersions.current, collections)
          setRetryToken((value) => value + 1)
        }
        setToast({ message: restoredMessage })
      },
    })
  }

  function applyFoodMapping(item: InventoryItem) {
    const mapped = resolveInventoryPresentation(item, foodMappings)
    const requestedArea = storageAreas.find((area) => area.id === mapped.storageAreaId)
    if (requestedArea && !requestedArea.archivedAt) return mapped
    const desiredCondition: StorageCondition = requestedArea?.condition || (mapped.location === 'Fridge' ? 'chilled' : mapped.location === 'Freezer' ? 'frozen' : 'ambient')
    const fallback = activeStorageAreas(storageAreas).find((area) => area.condition === desiredCondition) || activeStorageAreas(storageAreas)[0] || defaultStorageAreas[2]
    return { ...mapped, storageAreaId: fallback.id, location: legacyLocationForCondition(fallback.condition) }
  }

  function rememberIngredient(item: InventoryItem) {
    const known = Boolean(getFoodIntelligence(item.name))
    const mapping: HouseholdFoodMapping = { normalizedName: normalize(item.name), displayName: item.name.trim(), emoji: item.emoji, category: item.category, location: item.location, foodGroup: item.foodGroup, storageAreaId: item.storageAreaId, freshnessPolicy: item.freshnessPolicy }
    setFoodMappings((current) => [...current.filter((candidate) => candidate.normalizedName !== mapping.normalizedName), mapping])
    setGrocery((current) => current.map((entry) => resolveGroceryPresentation(entry, [mapping])))
    if (householdId && session && !demoMode) {
      void saveHouseholdFoodMapping(householdId, mapping).catch((error) => console.error('Food icon choice could not be remembered.', error))
      if (!known) void recordUnknownFoodTerm(item.name).catch((error) => console.error('Unknown food trend could not be recorded.', error))
    }
  }

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

  async function updateStorageAreas(nextAreas: StorageArea[]) {
    const previous = storageAreas
    setStorageAreas(nextAreas)
    try {
      if (session && householdId && !demoMode) await saveStorageAreas(householdId, nextAreas)
    } catch (error) {
      setStorageAreas(previous)
      throw error
    }
  }

  async function createStorageArea(name: string, condition: StorageCondition) {
    const cleanName = name.trim()
    const duplicate = storageAreas.find((area) => normalize(area.name) === normalize(cleanName))
    if (duplicate) {
      if (!duplicate.archivedAt) return duplicate
      const restored = { ...duplicate, condition, archivedAt: null }
      await updateStorageAreas(storageAreas.map((area) => area.id === duplicate.id ? restored : area))
      return restored
    }
    const area: StorageArea = { id: `custom-${crypto.randomUUID()}`, name: cleanName, condition, sortOrder: storageAreas.length, archivedAt: null }
    await updateStorageAreas([...storageAreas, area])
    return area
  }

  async function archiveStorageArea(areaId: string, replacementId: string) {
    const replacement = storageAreaForId(storageAreas, replacementId)
    const nextAreas = storageAreas.map((area) => area.id === areaId ? { ...area, archivedAt: new Date().toISOString() } : area)
    setInventory((current) => current.map((item) => item.storageAreaId === areaId ? { ...item, storageAreaId: replacement.id, location: legacyLocationForCondition(replacement.condition) } : item))
    const nextMappings = foodMappings.map((mapping) => mapping.storageAreaId === areaId ? { ...mapping, storageAreaId: replacement.id, location: legacyLocationForCondition(replacement.condition) } : mapping)
    setFoodMappings(nextMappings)
    if (session && householdId && !demoMode) await Promise.all([updateStorageAreas(nextAreas), ...nextMappings.filter((mapping, index) => mapping !== foodMappings[index]).map((mapping) => saveHouseholdFoodMapping(householdId, mapping))])
    else setStorageAreas(nextAreas)
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
        const item: InventoryItem = applyFoodMapping({
          id: reviewItem.id,
          name: reviewItem.name,
          emoji: reviewItem.emoji,
          quantity: 1,
          unit: 'item',
          category: reviewItem.category,
          location: reviewItem.location,
          foodGroup: reviewItem.foodGroup,
          storageAreaId: reviewItem.storageAreaId,
          freshnessPolicy: reviewItem.freshnessPolicy,
          expiresIn: reviewItem.expiresIn,
          expiresOn: reviewItem.freshnessPolicy === 'none' ? null : reviewItem.expiresOn,
        })
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
    validItems.forEach((item) => rememberIngredient(applyFoodMapping({ ...item, quantity: 1, unit: 'item' })))
    setSmartOpen(false)
    const added = validItems.length - merged
    const summary = [added ? `${added} added` : '', merged ? `${merged} merged` : ''].filter(Boolean).join(', ')
    offerUndo(`${summary} in your kitchen`, () => setInventory(previous), 'Smart add undone', ['inventory'])
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

  function commitGrocery(items: GroceryItem[]) {
    setGrocery((current) => mergeGroceryItems(current, items.map((item) => ({ ...item, checked: false }))))
    if (session && !demoMode) items.filter((item) => !getFoodIntelligence(item.name)).forEach((item) => {
      void recordUnknownFoodTerm(item.name).catch((error) => console.error('Unknown food trend could not be recorded.', error))
    })
    notify(`${items.length} item${items.length === 1 ? '' : 's'} added to your grocery list`)
  }

  function reviewGrocery(items: GroceryItem[], source: GroceryAddSource = 'recipe', onComplete?: () => void) {
    if (!items.length) return
    setGroceryReview({ items: items.map((item) => ({ ...item, checked: false })), source, onComplete })
  }

  function cookRecipe(recipe: RecipeMatch, scale = 1) {
    const missing = recipe.ingredients.flatMap((ingredient) => {
      const needed = Number((ingredient.amount * scale).toFixed(2))
      return hasIngredient(inventory, ingredient) ? [] : [{ ...ingredient, amount: needed, checked: false }]
    })
    if (missing.length) { reviewGrocery(missing, 'recipe'); setSelectedRecipe(null); return }
    setCookingDraft({ recipe, scale })
    setSelectedRecipe(null)
  }

  function completeCooking(recipe: RecipeMatch, scale: number, restock: GroceryItem[]) {
    const previousInventory = inventory
    const previousGrocery = grocery
    const actorName = [session?.user.user_metadata?.display_name, session?.user.user_metadata?.full_name, session?.user.user_metadata?.name, session?.user.email?.split('@')[0]]
      .find((value) => typeof value === 'string' && value.trim()) || 'You'
    const historyEntry = cookingHistoryEntry(recipe, scale, { userId: session?.user.id, name: actorName })
    setInventory((current) => removeIngredients(current, restock))
    if (restock.length) commitGrocery(restock)
    setCookingHistory((current) => recentCookingHistory([historyEntry, ...current], 100))
    if (householdId && session && !demoMode) {
      void saveCookingHistoryEntry(householdId, historyEntry).catch((error) => console.error('Cooking history could not be synced.', error))
    }
    setCookingDraft(null)
    offerUndo(`${recipe.name} added to cooking history`, () => {
      setInventory(previousInventory)
      setGrocery(previousGrocery)
      setCookingHistory((current) => current.filter((entry) => entry.id !== historyEntry.id))
      if (householdId && session && !demoMode) void deleteCookingHistoryEntry(householdId, historyEntry.id)
    }, 'Cooking update undone', ['inventory', 'grocery'])
  }

  function restockIngredient(item: InventoryItem) {
    const previousInventory = inventory
    const previousGrocery = grocery
    setInventory((current) => current.filter((entry) => entry.id !== item.id))
    setGrocery((current) => mergeGroceryItems(current, [{ name: item.name, amount: 1, unit: item.packageUnit || 'item', checked: false }]))
    offerUndo(`${item.name} moved to your grocery list`, () => {
      setInventory(previousInventory)
      setGrocery(previousGrocery)
    }, 'Restock undone', ['inventory', 'grocery'])
  }

  function planRecommendedRecipe(recipe: RecipeMatch, date: string, mealSlot: MealSlot, servings: number) {
    setMealPlan((current) => [
      ...current.filter((entry) => !(entry.date === date && entry.mealSlot === mealSlot)),
      { id: mealPlanEntryId(date, mealSlot), date, recipeId: recipe.id, servings, mealSlot },
    ])
    setPlanningRecipe(null)
    const slot = mealSlots.find((candidate) => candidate.value === mealSlot)?.label || 'Meal'
    const day = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    notify(`${recipe.name} planned for ${slot.toLowerCase()} on ${day}`)
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
      offerUndo('Cooking history entry removed', () => {
        setCookingHistory((current) => current.some((candidate) => candidate.id === entry.id) ? current : [entry, ...current])
        if (householdId && session && !demoMode) void saveCookingHistoryEntry(householdId, entry)
      }, 'Cooking history entry restored')
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
    offerUndo(`${recipe.name} deleted`, () => setCustomRecipes(previous), 'Recipe restored', ['recipes'])
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
          <NavButton active={view === 'kitchen'} icon={<PackageOpen />} label="My kitchen" badge={inventory.length} onClick={() => { setKitchenLocation('all'); setKitchenFoodGroup('All'); setView('kitchen') }} />
          <NavButton active={view === 'recipes'} icon={<CookingPot />} label="What can I make?" badge={readyCount} onClick={() => setView('recipes')} />
          <NavButton active={view === 'planner'} icon={<CalendarDays />} label="Meal plan" badge={mealPlan.length} onClick={() => setView('planner')} />
          <NavButton active={view === 'grocery'} icon={<ShoppingBasket />} label="Grocery list" badge={grocery.filter((item) => !item.checked).length} newBadge={visibleNewGroceryIds.size} onClick={() => setView('grocery')} />
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
          <div className="topbar-menu-wrap" onPointerDown={(event) => event.stopPropagation()}>
            <button className="topbar-menu-button" onClick={() => setTopMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={topMenuOpen}><MoreHorizontal size={18} /><span>Menu</span></button>
            {topMenuOpen && <div className="topbar-menu" role="menu">
              <button role="menuitem" onClick={() => { setTopMenuOpen(false); setAddOpen(true) }}><Plus /> Add ingredients</button>
              <button role="menuitem" onClick={() => { setTopMenuOpen(false); setSmartOpen(true) }}><Sparkles /> Smart add</button>
              <button role="menuitem" onClick={() => { setTopMenuOpen(false); setFeedbackOpen(true) }}><MessageSquareText /> Send feedback</button>
            </div>}
          </div>
        </header>

        <div className="page">
          {view === 'home' && <Home displayName={greetingName} inventory={inventory} counts={counts} urgentItems={urgentItems} recipes={recipeMatches} guidance={recipeGuidance} mealReminders={todayMealReminders} readyCount={readyCount} groceryCount={grocery.filter((item) => !item.checked).length} setView={setView} openKitchen={(category = 'All') => { setKitchenLocation('all'); setKitchenFoodGroup(category === 'Dairy' ? 'Dairy & alternatives' : category === 'Pantry' ? 'All' : category); setView('kitchen') }} setSelectedRecipe={setSelectedRecipe} onRecipeAction={cookRecipe} onPlanRecipe={setPlanningRecipe} onAddToGrocery={(items) => reviewGrocery(items, 'recommendation')} />}
          {view === 'kitchen' && <Kitchen inventory={inventory} storageAreas={storageAreas} locationId={kitchenLocation} setLocationId={setKitchenLocation} foodGroup={kitchenFoodGroup} setFoodGroup={setKitchenFoodGroup} syncState={session ? syncState : 'saved'} isOnline={isOnline} onRetry={retrySync} onAdd={() => setAddOpen(true)} onEdit={setEditingItem} onRestock={restockIngredient} onDelete={(item) => { setInventory((current) => current.filter((entry) => entry.id !== item.id)); offerUndo(`${item.name} deleted`, () => setInventory((current) => current.some((entry) => entry.id === item.id) ? current : [...current, item]), `${item.name} restored`, ['inventory']) }} />}
          {view === 'recipes' && <Recipes recipes={recipeMatches} guidance={recipeGuidance} cookingHistory={cookingHistory} inventory={inventory} preferences={foodPreferences} accessToken={session?.access_token || ''} savedExternalIds={customRecipes.flatMap((recipe) => recipe.externalId ? [recipe.externalId] : [])} setSelectedRecipe={setSelectedRecipe} onRemoveHistory={removeCookingHistory} onAdd={() => { setEditingRecipe(null); setRecipeEditorOpen(true) }} onSaveDiscovered={saveDiscoveredRecipe} onAddToGrocery={(items) => reviewGrocery(items, 'Discover')} onRecipeAction={cookRecipe} onPlanRecipe={setPlanningRecipe} onOpenKitchen={() => { setKitchenLocation('all'); setKitchenFoodGroup('All'); setView('kitchen') }} />}
          {view === 'planner' && <MealPlanner recipes={recipeMatches} inventory={inventory} entries={mealPlan} templates={mealPlanTemplates} setEntries={setMealPlan} setTemplates={updateMealPlanTemplates} onDeleteTemplate={removeMealPlanTemplate} onAddToGrocery={(items) => reviewGrocery(items, 'meal plan')} notify={notify} offerUndo={offerUndo} />}
          {view === 'grocery' && <Grocery grocery={grocery} newGroceryIds={visibleNewGroceryIds} stapleGroups={stapleGroups} staples={staples} inventory={inventory} storageAreas={storageAreas} rememberedProducts={productMemory} householdId={householdId} accessToken={session?.access_token || ''} syncState={session ? syncState : 'saved'} isOnline={isOnline} onRetry={retrySync} setGrocery={setGrocery} setStapleGroups={setStapleGroups} setStaples={setStaples} setInventory={setInventory} onReviewItems={reviewGrocery} onRememberProducts={(items) => setProductMemory((current) => rememberHouseholdProducts(current, items))} notify={notify} offerUndo={offerUndo} />}
          {view === 'settings' && <SettingsPage session={session} householdId={householdId} displayName={displayName} preferences={foodPreferences} reminderPreferences={mealReminderPreferences} storageAreas={storageAreas} inventory={inventory} syncState={syncState} isOnline={isOnline} inventoryCount={inventory.length} groceryCount={grocery.length} onRetry={retrySync} onResetPassword={sendPasswordReset} onUpdateName={updateProfileName} onUpdatePreferences={updateFoodPreferences} onUpdateReminderPreferences={setMealReminderPreferences} onUpdateStorageAreas={updateStorageAreas} onArchiveStorageArea={archiveStorageArea} onActivateHousehold={activateHousehold} onJoinHousehold={joinSharedHousehold} onOpenFeedback={() => setFeedbackOpen(true)} onSignOut={leaveAccount} />}
        </div>
      </main>

      {addOpen && <AddFood storageAreas={storageAreas} onCreateStorageArea={createStorageArea} onClose={() => setAddOpen(false)} onAdd={(rawItem) => { const item = applyFoodMapping(rawItem); rememberIngredient(item); const result = mergeInventoryItems(inventory, [item]); setInventory(result.items); setAddOpen(false); notify(result.merged ? `${item.name} refreshed in your kitchen` : `${item.name} added to your kitchen`) }} />}
      {smartOpen && <SmartAdd inventory={inventory} storageAreas={storageAreas} onClose={() => setSmartOpen(false)} onScanBarcode={() => { setSmartOpen(false); setBarcodeOpen(true) }} onAdd={addSmartItems} />}
      {barcodeOpen && <BarcodeScanner inventory={inventory} storageAreas={storageAreas} rememberedProducts={productMemory} householdId={householdId} accessToken={session?.access_token || ''} isOnline={isOnline} onClose={() => setBarcodeOpen(false)} onAdd={(rawItems) => { const items = rawItems.map(applyFoodMapping); items.forEach(rememberIngredient); const before = inventory; const beforeMemory = productMemory; const result = mergeInventoryItems(inventory, items); setProductMemory((current) => rememberHouseholdProducts(current, items)); setInventory(result.items); setBarcodeOpen(false); offerUndo(`${barcodeBatchLabel(items.length)} saved to your kitchen`, () => { setInventory(before); setProductMemory(beforeMemory) }, 'Barcode scan undone', ['inventory']) }} />}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} onSubmit={sendFeedback} />}
      {passwordRecoveryOpen && <PasswordRecoveryModal onClose={() => setPasswordRecoveryOpen(false)} />}
      {editingItem && <AddFood initialItem={editingItem} storageAreas={storageAreas} onCreateStorageArea={createStorageArea} onClose={() => setEditingItem(null)} onAdd={(item) => { rememberIngredient(item); setInventory((current) => current.map((entry) => entry.id === item.id ? item : entry)); setEditingItem(null); notify(`${item.name} updated`) }} />}
      {recipeEditorOpen && <RecipeEditor inventory={inventory.map((item) => ({ ...item, unit: getFoodIntelligence(item.name)?.profile.defaultUnit || 'item' }))} initialRecipe={editingRecipe || undefined} onClose={() => { setRecipeEditorOpen(false); setEditingRecipe(null) }} onSave={saveCustomRecipe} />}
      {selectedRecipe && <RecipeSheet recipe={selectedRecipe} inventory={inventory} onClose={() => setSelectedRecipe(null)} onAction={(scale) => cookRecipe(selectedRecipe, scale)} onEdit={selectedRecipe.source === 'user' ? () => { setEditingRecipe(selectedRecipe); setSelectedRecipe(null); setRecipeEditorOpen(true) } : undefined} onDelete={() => void deleteRecipe(selectedRecipe)} />}
      {planningRecipe && <RecommendationPlanner recipe={planningRecipe} onClose={() => setPlanningRecipe(null)} onPlan={(date, mealSlot, servings) => planRecommendedRecipe(planningRecipe, date, mealSlot, servings)} />}
      {groceryReview && <GroceryAddReview request={groceryReview} existing={grocery} mappings={foodMappings} onClose={() => setGroceryReview(null)} onConfirm={(items) => { commitGrocery(items); groceryReview.onComplete?.(); setGroceryReview(null) }} />}
      {cookingDraft && <CookingCompletion recipe={cookingDraft.recipe} scale={cookingDraft.scale} inventory={inventory} onClose={() => setCookingDraft(null)} onComplete={(items) => completeCooking(cookingDraft.recipe, cookingDraft.scale, items)} />}
      {toast && <div className={`toast${toast.undo ? ' undo-toast' : ''}`} role="status" aria-live="polite"><Check size={17} /><span>{toast.message}</span>{toast.undo && <button className="toast-undo" onClick={toast.undo}><Undo2 size={14} /> Undo</button>}{toast.undo && <i className="toast-life" aria-hidden="true" />}</div>}
    </div>
  )
}

function NavButton({ active, icon, label, badge, newBadge, className = '', onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; newBadge?: number; className?: string; onClick: () => void }) {
  return <button className={`nav-item${active ? ' active' : ''}${className ? ` ${className}` : ''}`} onClick={onClick} aria-label={label}>{icon}<span>{label}</span>{newBadge ? <b className="nav-new-badge">{newBadge} new</b> : badge !== undefined && <em>{badge}</em>}</button>
}

function NumberField({ value, onValueChange, onEmpty, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & { value: number; onValueChange: (value: number) => void; onEmpty?: () => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  return <input {...props} type="number" value={draft ?? String(value)} onChange={(event) => {
    const next = event.target.value
    setDraft(next)
    if (next === '') onEmpty?.()
    else if (Number.isFinite(Number(next))) onValueChange(Number(next))
  }} onBlur={(event) => {
    setDraft(null)
    props.onBlur?.(event)
  }} />
}

function Home({ displayName, inventory, counts, urgentItems, recipes, guidance, mealReminders, readyCount, groceryCount, setView, openKitchen, setSelectedRecipe, onRecipeAction, onPlanRecipe, onAddToGrocery }: {
  displayName: string;
  inventory: InventoryItem[]; counts: { category: Category; count: number }[]; urgentItems: InventoryItem[]; recipes: RecipeMatch[];
  guidance: RecommendationGuidance | null; mealReminders: MealReminder[]; readyCount: number; groceryCount: number; setView: (view: View) => void; openKitchen: (category?: 'All' | Category) => void; setSelectedRecipe: (recipe: RecipeMatch) => void;
  onRecipeAction: (recipe: RecipeMatch) => void; onPlanRecipe: (recipe: RecipeMatch) => void; onAddToGrocery: (items: GroceryItem[]) => void
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
      <div className="section-heading"><div><span className="eyebrow">Recommended for you</span><h2>What fits your kitchen now?</h2></div><button className="text-button" onClick={() => setView('recipes')}>Explore all {recipes.length} <ArrowRight size={15} /></button></div>
      {guidance && <RecommendationNudge guidance={guidance} onAddToGrocery={onAddToGrocery} onOpenKitchen={() => openKitchen('All')} onAddRecipe={() => setView('recipes')} />}
      <div className="recipe-grid">{recipes.slice(0, 3).map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} featured={index === 0} onClick={() => setSelectedRecipe(recipe)} onPrimary={() => onRecipeAction(recipe)} onPlan={() => onPlanRecipe(recipe)} />)}</div>
    </section>

    <section className="quick-stats">
      <div><span className="stat-icon green"><ChefHat /></span><p><strong>{readyCount} recipes</strong><small>ready without a grocery run</small></p></div>
      <div><span className="stat-icon gold"><Clock3 /></span><p><strong>{best?.time || 0} min</strong><small>to your best match tonight</small></p></div>
      <button onClick={() => setView('grocery')}><span className="stat-icon berry"><ShoppingBasket /></span><p><strong>{groceryCount || 'No'} items</strong><small>{groceryCount ? 'waiting on your grocery list' : 'your grocery list is clear'}</small></p><ArrowRight /></button>
    </section>
  </>
}

function RecipeCard({ recipe, featured, onClick, onPrimary, onPlan }: { recipe: RecipeMatch; featured?: boolean; onClick: () => void; onPrimary: () => void; onPlan: () => void }) {
  return <article className={featured ? 'recipe-card featured' : 'recipe-card'} style={{ '--accent': recipe.accent } as React.CSSProperties}>
    <button className="recipe-card-main" onClick={onClick} aria-label={`Open ${recipe.name}`}>
      <div className="recipe-art">{recipe.imageUrl ? <img src={recipe.imageUrl} alt="" /> : <span>{recipe.emoji}</span>}{recipe.source === 'user' && <b>My recipe</b>}{recipe.source === 'spoonacular' && <b>Saved</b>}{recipe.preferenceWarnings.length > 0 && <i><TriangleAlert size={12} /> Check preferences</i>}{recipe.urgent > 0 && <em><Leaf size={13} /> Uses {recipe.urgent} use-soon</em>}</div>
      <div className="recipe-info"><div className="match-line"><span className={recipe.missing.length ? 'match almost' : 'match'}>{recipe.missing.length ? `${recipe.available}% match` : 'Ready now'}</span><small><Clock3 size={13} /> {recipe.time} min</small></div><h3>{recipe.name}</h3><p>{recipe.description}</p><div className="recommendation-reasons" aria-label={`Why ${recipe.name} is recommended`}>{recipe.recommendationReasons.slice(0, 3).map((reason) => <span key={reason}>{reason}</span>)}</div><div className="recipe-footer"><span>{recipe.protein}g protein</span><strong>View recipe <ArrowRight size={14} /></strong></div></div>
    </button>
    <div className="recipe-quick-actions"><button onClick={onPrimary}>{recipe.missing.length ? <><ShoppingBasket /> Add {recipe.missing.length} missing</> : <><CookingPot /> Cook now</>}</button><button onClick={onPlan}><CalendarDays /> Plan</button></div>
  </article>
}

function RecommendationNudge({ guidance, onAddToGrocery, onOpenKitchen, onAddRecipe }: { guidance: RecommendationGuidance; onAddToGrocery: (items: GroceryItem[]) => void; onOpenKitchen: () => void; onAddRecipe: () => void }) {
  return <aside className="recommendation-nudge">
    <span><Sparkles /></span>
    <div><strong>{guidance.title}</strong><p>{guidance.message}</p></div>
    <div className="recommendation-nudge-actions">{guidance.unlockItems.length > 0 ? <button onClick={() => onAddToGrocery(guidance.unlockItems)}><ShoppingBasket /> Add {guidance.unlockItems.length} to grocery list</button> : <button onClick={onAddRecipe}><CirclePlus /> Add a recipe</button>}<button onClick={onOpenKitchen}><PackageOpen /> Review kitchen</button></div>
  </aside>
}

function RecommendationPlanner({ recipe, onClose, onPlan }: { recipe: RecipeMatch; onClose: () => void; onPlan: (date: string, mealSlot: MealSlot, servings: number) => void }) {
  const today = localDateKey(new Date())
  const [date, setDate] = useState(today)
  const [mealSlot, setMealSlot] = useState<MealSlot>('dinner')
  const [servings, setServings] = useState(recipe.servings)
  function submit(event: React.FormEvent) {
    event.preventDefault()
    onPlan(date, mealSlot, Math.max(1, servings))
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal recommendation-planner" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Plan from a recommendation</span><h2>Add {recipe.name}</h2><p>Choose when this meal fits your week.</p></div><button type="button" onClick={onClose} aria-label="Close meal planner"><X /></button></div><div className="recommendation-plan-recipe"><span>{recipe.imageUrl ? <img src={recipe.imageUrl} alt="" /> : recipe.emoji}</span><p><strong>{recipe.name}</strong><small>{recipe.time} min · {recipe.missing.length ? `${recipe.missing.length} missing` : 'Kitchen ready'}</small></p></div><div className="form-row"><label>Date<input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Meal<select value={mealSlot} onChange={(event) => setMealSlot(event.target.value as MealSlot)}>{mealSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label></div><label>Servings<NumberField min="1" max="24" value={servings} onValueChange={setServings} /></label><button className="submit-button" type="submit"><CalendarDays /> Add to meal plan</button></form></div>
}

function Kitchen({ inventory, storageAreas, locationId, setLocationId, foodGroup, setFoodGroup, syncState, isOnline, onRetry, onAdd, onEdit, onRestock, onDelete }: { inventory: InventoryItem[]; storageAreas: StorageArea[]; locationId: string; setLocationId: (id: string) => void; foodGroup: KitchenFoodGroup; setFoodGroup: (group: KitchenFoodGroup) => void; syncState: SyncState; isOnline: boolean; onRetry: () => void; onAdd: () => void; onEdit: (item: InventoryItem) => void; onRestock: (item: InventoryItem) => void; onDelete: (item: InventoryItem) => void }) {
  const [query, setQuery] = useState('')
  const [openActions, setOpenActions] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const areas = activeStorageAreas(storageAreas)
  const itemAreaId = (item: InventoryItem) => currentStorageAreaId(item.storageAreaId || item.location.toLowerCase())
  const searched = inventory.filter((item) => {
    const profile = getFoodIntelligence(item.name)?.profile
    const searchable = [item.name, ...(profile?.aliases || [])].join(' ')
    return normalize(searchable).includes(normalize(query))
  })
  const filtered = searched.filter((item) => (locationId === 'all' || itemAreaId(item) === locationId) && (foodGroup === 'All' || item.foodGroup === foodGroup))
  const locationCounts = Object.fromEntries(areas.map((area) => [area.id, inventory.filter((item) => itemAreaId(item) === area.id).length]))
  const groupCounts = Object.fromEntries(foodGroups.map((option) => [option, inventory.filter((item) => item.foodGroup === option).length])) as Record<FoodGroup, number>
  const attentionCount = inventory.filter((item) => item.freshnessPolicy !== 'none' && (() => {
    const days = daysUntilExpiration(item)
    return days !== null && days <= 3
  })()).length
  const hasFilters = locationId !== 'all' || foodGroup !== 'All' || query.trim().length > 0
  const grouped = areas.map((area) => ({ area, items: filtered.filter((item) => itemAreaId(item) === area.id) })).filter((group) => group.items.length)
  const unassigned = filtered.filter((item) => !areas.some((area) => area.id === itemAreaId(item)))
  if (unassigned.length) grouped.push({ area: { id: 'other-storage', name: 'Other storage', condition: 'ambient', sortOrder: 999, archivedAt: null }, items: unassigned })

  useEffect(() => {
    if (!openActions) return
    const closeActions = () => setOpenActions(null)
    const closeWithKeyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') closeActions() }
    document.addEventListener('pointerdown', closeActions)
    document.addEventListener('keydown', closeWithKeyboard)
    return () => { document.removeEventListener('pointerdown', closeActions); document.removeEventListener('keydown', closeWithKeyboard) }
  }, [openActions])

  function clearFilters() {
    setQuery('')
    setLocationId('all')
    setFoodGroup('All')
  }

  function renderRow(item: InventoryItem) {
    const menuOpen = openActions === item.id
    const menuId = `kitchen-actions-${item.id}`
    const area = storageAreaForId(storageAreas, itemAreaId(item))
    return <div className="inventory-row" key={item.id}><button className="ingredient-cell edit-trigger" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}><span>{item.emoji}</span><p><strong>{item.name}</strong><small>{item.foodGroup || item.category}<span className="mobile-item-location"> · {area.name}</span></small></p></button><span className="availability-pill"><Check /> At home</span><span className="location-pill">{area.name}</span><Freshness item={item} /><div className="row-actions" onPointerDown={(event) => event.stopPropagation()}><button className="icon-button restock" onClick={() => onRestock(item)} aria-label={`Move ${item.name} to grocery list`} title="Ran out — restock"><ShoppingBasket /><span className="restock-label">Restock</span></button><button className="icon-button more-actions" onClick={() => setOpenActions((current) => current === item.id ? null : item.id)} aria-label={`More actions for ${item.name}`} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId}><MoreHorizontal /></button>{menuOpen && <div className="item-action-menu" id={menuId} role="menu"><button role="menuitem" onClick={() => { setOpenActions(null); onEdit(item) }}><Pencil /> Edit ingredient</button><button className="delete" role="menuitem" onClick={() => { setOpenActions(null); onDelete(item) }}><Trash2 /> Delete from kitchen</button></div>}</div></div>
  }

  return <section className="inner-page kitchen-page">
    <div className="page-title"><div><span className="eyebrow">Your ingredients</span><h1>My kitchen</h1><p>See what is at home, where it is stored, and what needs attention.</p></div><div className="title-actions"><button className="primary-button" onClick={onAdd}><CirclePlus size={18} /> Add ingredients</button></div></div>
    <KitchenSyncNotice state={syncState} isOnline={isOnline} onRetry={onRetry} />
    <div className="toolbar kitchen-toolbar"><label><Search size={17} /><input aria-label="Search kitchen ingredients" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ingredients…" /></label><div className="location-filter-row"><div className="filter-tabs" aria-label="Filter ingredients by storage area"><button className={locationId === 'all' ? 'active' : ''} aria-pressed={locationId === 'all'} onClick={() => setLocationId('all')}><span>All</span><em>{inventory.length}</em></button>{areas.map((area) => <button className={locationId === area.id ? 'active' : ''} aria-pressed={locationId === area.id} onClick={() => setLocationId(area.id)} key={area.id}><span>{area.name}</span><em>{locationCounts[area.id] || 0}</em></button>)}</div><button className={`food-type-filter${foodGroup !== 'All' ? ' active' : ''}`} onClick={() => setFiltersOpen(true)}><Leaf /> {foodGroup === 'All' ? 'Food type' : foodGroup}</button></div></div>
    {filtersOpen && <div className="modal-backdrop" onMouseDown={() => setFiltersOpen(false)}><section className="modal food-type-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h2>Filter by food type</h2><p>Location remains the main kitchen view.</p></div><button onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X /></button></div><div className="food-type-options"><button className={foodGroup === 'All' ? 'selected' : ''} onClick={() => { setFoodGroup('All'); setFiltersOpen(false) }}><span>All food types</span><em>{inventory.length}</em></button>{foodGroups.map((group) => <button className={foodGroup === group ? 'selected' : ''} onClick={() => { setFoodGroup(group); setFiltersOpen(false) }} key={group}><span>{group}</span><em>{groupCounts[group]}</em></button>)}</div></section></div>}
    <div className="kitchen-result-summary" aria-live="polite"><span><strong>{filtered.length}</strong> {filtered.length === 1 ? 'ingredient' : 'ingredients'} shown</span>{attentionCount > 0 && <span className="attention-summary"><TriangleAlert /> {attentionCount} {attentionCount === 1 ? 'needs' : 'need'} attention</span>}</div>
    {filtered.length > 0 ? <div className="inventory-location-groups">{grouped.map(({ area, items }) => <section className="inventory-location-group" key={area.id}><header><div><h2>{area.name}</h2><span>{area.condition === 'chilled' ? 'Chilled' : area.condition === 'frozen' ? 'Frozen' : 'Room temperature'}</span></div><em>{items.length} item{items.length === 1 ? '' : 's'}</em></header><div className="inventory-table presence-table panel"><div className="table-head"><span>Ingredient</span><span>Status</span><span>Stored in</span><span>Freshness</span><span>Actions</span></div>{items.map(renderRow)}</div></section>)}</div> : <div className="kitchen-empty panel"><PackageOpen /><strong>{inventory.length ? 'No matching ingredients' : 'Your kitchen is ready to fill'}</strong><p>{inventory.length ? 'Clear the search or filters to see everything at home.' : 'Add the foods you have once, then simply mark them for restocking when they run out.'}</p><div>{hasFilters && <button className="secondary-button" onClick={clearFilters}>Clear filters</button>}<button className="primary-button" onClick={onAdd}><CirclePlus /> Add ingredients</button></div></div>}
  </section>
}

function Freshness({ item }: { item: InventoryItem }) {
  if (item.freshnessPolicy === 'none') return <span className="freshness neutral no-date" aria-label="Shelf-stable; expiry not tracked">—</span>
  const days = daysUntilExpiration(item)
  if (days === null) return <span className="freshness neutral">Add use-by date</span>
  if (days < 0) return <span className="freshness danger">Expired · {Math.abs(days)}d ago</span>
  if (days <= 1) return <span className="freshness danger">Use {days === 0 ? 'today' : 'tomorrow'}</span>
  if (days <= 3) return <span className="freshness soon">Use soon · {days}d</span>
  return <span className="freshness fresh">Fresh · {days}d</span>
}

function Recipes({ recipes, guidance, cookingHistory, inventory, preferences, accessToken, savedExternalIds, setSelectedRecipe, onRemoveHistory, onAdd, onSaveDiscovered, onAddToGrocery, onRecipeAction, onPlanRecipe, onOpenKitchen }: { recipes: RecipeMatch[]; guidance: RecommendationGuidance | null; cookingHistory: CookingHistoryEntry[]; inventory: InventoryItem[]; preferences: FoodPreferences; accessToken: string; savedExternalIds: number[]; setSelectedRecipe: (recipe: RecipeMatch) => void; onRemoveHistory: (entry: CookingHistoryEntry) => void; onAdd: () => void; onSaveDiscovered: (preview: DiscoverRecipe, details: DiscoverRecipeDetails) => void; onAddToGrocery: (items: GroceryItem[]) => void; onRecipeAction: (recipe: RecipeMatch) => void; onPlanRecipe: (recipe: RecipeMatch) => void; onOpenKitchen: () => void }) {
  const [sort, setSort] = useState<'match' | 'time' | 'urgent'>('match')
  const [filter, setFilter] = useState<'all' | 'mine' | 'ready' | 'discover' | 'history'>('all')
  const filtered = recipes.filter((recipe) => filter === 'mine' ? recipe.source !== 'mise' : filter === 'ready' ? recipe.missing.length === 0 : true)
  const sorted = [...filtered].sort((a, b) => sort === 'time' ? a.time - b.time : sort === 'urgent' ? b.urgent - a.urgent : b.score - a.score)
  return <section className="inner-page">
    <div className="page-title"><div><span className="eyebrow">Cook from what you have</span><h1>What can I make?</h1><p>Ranked by your kitchen, use-by dates, available time, preferences, recent meals, and meal plan.</p></div><button className="primary-button" onClick={onAdd}><CirclePlus size={18} /> Add my recipe</button></div>
    {filter === 'all' && guidance && <RecommendationNudge guidance={guidance} onAddToGrocery={onAddToGrocery} onOpenKitchen={onOpenKitchen} onAddRecipe={onAdd} />}
    <div className="recipe-controls"><div className="recipe-filters">{([['all', 'All recipes'], ['mine', 'My saved'], ['ready', 'Ready now'], ['discover', 'Discover'], ['history', `History${cookingHistory.length ? ` ${cookingHistory.length}` : ''}`]] as const).map(([value, label]) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value === 'discover' && <Sparkles size={12} />}{value === 'history' && <Clock3 size={12} />}{label}</button>)}</div>{filter !== 'discover' && filter !== 'history' && <label className="recipe-sort">Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="match">Best match</option><option value="time">Quickest</option><option value="urgent">Uses food soon</option></select></label>}</div>
    {filter === 'discover'
      ? <DiscoverRecipes inventory={inventory} preferences={preferences} accessToken={accessToken} savedExternalIds={savedExternalIds} onSaveDiscovered={onSaveDiscovered} onAddToGrocery={onAddToGrocery} />
      : filter === 'history'
        ? <CookingHistory entries={cookingHistory} recipes={recipes} onOpenRecipe={setSelectedRecipe} onRemove={onRemoveHistory} />
        : <><div className="recipe-grid full">{sorted.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} featured={index === 0} onClick={() => setSelectedRecipe(recipe)} onPrimary={() => onRecipeAction(recipe)} onPlan={() => onPlanRecipe(recipe)} />)}</div>{!sorted.length && <Empty title="No recipes in this view" copy="Try another filter or add a few more ingredients to your kitchen." />}</>}
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

function MealPlanner({ recipes, inventory, entries, templates, setEntries, setTemplates, onDeleteTemplate, onAddToGrocery, notify, offerUndo }: {
  recipes: RecipeMatch[]; inventory: InventoryItem[]; entries: MealPlanEntry[]; templates: MealPlanTemplate[];
  setEntries: React.Dispatch<React.SetStateAction<MealPlanEntry[]>>; setTemplates: React.Dispatch<React.SetStateAction<MealPlanTemplate[]>>; onDeleteTemplate: (templateId: string) => Promise<void>;
  onAddToGrocery: (items: GroceryItem[]) => void; notify: (message: string) => void; offerUndo: UndoNotice
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
    const removed = entries.filter((entry) => entry.date === date)
    setEntries((current) => current.filter((entry) => entry.date !== date))
    offerUndo('Day cleared from your meal plan', () => setEntries((current) => [
      ...current.filter((entry) => !removed.some((candidate) => candidate.id === entry.id)),
      ...removed,
    ]), 'Day restored', ['mealPlan'])
  }

  function removeMeal(entry: MealPlanEntry, recipeName: string) {
    const index = entries.findIndex((candidate) => candidate.id === entry.id)
    setEntries((current) => current.filter((candidate) => candidate.id !== entry.id))
    offerUndo(`${recipeName} removed from the meal plan`, () => setEntries((current) => {
      if (current.some((candidate) => candidate.id === entry.id)) return current
      const next = [...current]
      next.splice(Math.max(0, Math.min(index, next.length)), 0, entry)
      return next
    }), `${recipeName} restored`, ['mealPlan'])
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
            <div className="slot-controls"><span>Servings</span><button onClick={() => changeServings(entry, -1)} aria-label={`Decrease servings for ${recipe.name}`}><Minus /></button><strong>{entry.servings}</strong><button onClick={() => changeServings(entry, 1)} aria-label={`Increase servings for ${recipe.name}`}><Plus /></button><button className="delete" onClick={() => removeMeal(entry, recipe.name)} aria-label={`Remove ${recipe.name} from ${slot.label}`}><Trash2 /></button></div>
          </div> : <button className="empty-slot" key={slot.value} onClick={() => setPicking({ date: dateKey, mealSlot: slot.value })}><span>{slot.emoji}</span><p><strong>{slot.label}</strong><small>Add a recipe</small></p><CirclePlus /></button>
        })}</div>
      </article>
    })}</div>
    <div className="planner-summary panel"><div><CalendarDays /><p><strong>{weekEntries.length} meal{weekEntries.length === 1 ? '' : 's'} planned across {plannedDays} day{plannedDays === 1 ? '' : 's'}</strong><small>{groceries.length ? `${groceries.length} grocery item${groceries.length === 1 ? '' : 's'} complete the week` : weekEntries.length ? 'Everything planned is already in your kitchen' : 'Start with a meal that uses food expiring soon'}</small></p></div>{groceries.length > 0 && <button className="secondary-button" onClick={() => onAddToGrocery(groceries)}>Build grocery list <ArrowRight /></button>}</div>
    {picking && <MealPicker date={picking.date} mealSlot={picking.mealSlot} recipes={recipes} onClose={() => setPicking(null)} onChoose={(recipe) => chooseRecipe(picking.date, picking.mealSlot, recipe)} />}
    {copyingDate && <CopyDayPicker sourceDate={copyingDate} dates={dates} onClose={() => setCopyingDate(null)} onCopy={copyDay} />}
    {templatesOpen && <MealPlanTemplateManager templates={templates} weekEntries={weekEntries} weekStart={weekStart} recipes={recipes} setEntries={setEntries} setTemplates={setTemplates} onDeleteTemplate={onDeleteTemplate} onClose={() => setTemplatesOpen(false)} notify={notify} offerUndo={offerUndo} />}
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

function MealPlanTemplateManager({ templates, weekEntries, weekStart, recipes, setEntries, setTemplates, onDeleteTemplate, onClose, notify, offerUndo }: {
  templates: MealPlanTemplate[]; weekEntries: MealPlanEntry[]; weekStart: Date; recipes: RecipeMatch[];
  setEntries: React.Dispatch<React.SetStateAction<MealPlanEntry[]>>; setTemplates: React.Dispatch<React.SetStateAction<MealPlanTemplate[]>>;
  onDeleteTemplate: (templateId: string) => Promise<void>; onClose: () => void; notify: (message: string) => void; offerUndo: UndoNotice
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
      offerUndo(`${template.name} deleted`, () => setTemplates((current) => current.some((candidate) => candidate.id === template.id) ? current : [template, ...current]), `${template.name} restored`, ['mealPlanTemplates'])
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

function Grocery({ grocery, newGroceryIds, stapleGroups, staples, inventory, storageAreas, rememberedProducts, householdId, accessToken, syncState, isOnline, onRetry, setGrocery, setStapleGroups, setStaples, setInventory, onReviewItems, onRememberProducts, notify, offerUndo }: {
  grocery: GroceryItem[]; newGroceryIds: Set<string>; stapleGroups: GroceryStapleGroup[]; staples: GroceryStaple[]; inventory: InventoryItem[]; storageAreas: StorageArea[]; rememberedProducts: HouseholdProduct[];
  householdId: string | null; accessToken: string; syncState: SyncState; isOnline: boolean; onRetry: () => void;
  setGrocery: React.Dispatch<React.SetStateAction<GroceryItem[]>>; setStapleGroups: React.Dispatch<React.SetStateAction<GroceryStapleGroup[]>>;
  setStaples: React.Dispatch<React.SetStateAction<GroceryStaple[]>>; setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  onReviewItems: (items: GroceryItem[], source: GroceryAddSource, onComplete?: () => void) => void; onRememberProducts: (items: InventoryItem[]) => void; notify: (message: string) => void; offerUndo: UndoNotice
}) {
  const [draft, setDraft] = useState('')
  const [bulkEntryOpen, setBulkEntryOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'needed' | 'checked'>('all')
  const [editing, setEditing] = useState<{ index: number; item: GroceryItem } | null>(null)
  const [adding, setAdding] = useState(false)
  const [staplesOpen, setStaplesOpen] = useState(false)
  const [storeMode, setStoreMode] = useState(false)
  const [aisleEditorOpen, setAisleEditorOpen] = useState(false)
  const [purchaseReviewOpen, setPurchaseReviewOpen] = useState(false)
  const [utilityMenuOpen, setUtilityMenuOpen] = useState(false)
  const [openItemActions, setOpenItemActions] = useState<string | null>(null)
  const [aisleOrder, setAisleOrder] = useState<Category[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('mise-aisle-order-v1') || '[]') as Category[]
      const valid = stored.filter((category) => categories.includes(category))
      return valid.length ? [...valid, ...categories.filter((category) => !valid.includes(category))] : ['Produce', 'Protein', 'Dairy', 'Pantry', 'Other']
    } catch { return ['Produce', 'Protein', 'Dairy', 'Pantry', 'Other'] }
  })
  useEffect(() => { localStorage.setItem('mise-aisle-order-v1', JSON.stringify(aisleOrder)) }, [aisleOrder])
  useEffect(() => {
    if (!utilityMenuOpen && !openItemActions) return
    const closeMenu = () => { setUtilityMenuOpen(false); setOpenItemActions(null) }
    const closeWithKeyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu() }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeWithKeyboard)
    return () => { document.removeEventListener('pointerdown', closeMenu); document.removeEventListener('keydown', closeWithKeyboard) }
  }, [utilityMenuOpen, openItemActions])
  const checkedCount = grocery.filter((item) => item.checked).length
  const neededCount = grocery.length - checkedCount
  const visible = grocery.map((item, index) => ({ item, index })).filter(({ item }) => storeMode ? !item.checked : filter === 'all' || (filter === 'checked' ? item.checked : !item.checked))
  const sections = aisleOrder.map((category) => ({ category, entries: visible.filter(({ item }) => groceryCategory(item) === category) })).filter((section) => section.entries.length)
  function addManual() {
    const items = groceryItemsFromText(draft)
    if (!items.length) return
    onReviewItems(items, 'bulk add', () => { setDraft(''); setBulkEntryOpen(false) })
  }
  function moveCheckedToKitchen(bought: GroceryItem[]) {
    if (!bought.length) return
    const incoming = bought.map((item, index) => inventoryItemFromGrocery(item, `${normalize(item.name).replace(/\s/g, '-')}-${Date.now()}-${index}`))
    const result = mergeInventoryItems(inventory, incoming)
    setInventory(result.items)
    onRememberProducts(incoming)
    setGrocery((items) => items.filter((item) => !item.checked))
    setPurchaseReviewOpen(false)
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
  function removeGroceryItem(item: GroceryItem, index: number) {
    setGrocery((items) => items.filter((_, itemIndex) => itemIndex !== index))
    offerUndo(`${item.name} removed from your grocery list`, () => setGrocery((items) => {
      if (item.id && items.some((candidate) => candidate.id === item.id)) return items
      const next = [...items]
      next.splice(Math.max(0, Math.min(index, next.length)), 0, item)
      return next
    }), `${item.name} restored`, ['grocery'])
  }
  return <section className={`inner-page grocery-page${storeMode ? ' store-mode' : ''}`}>
    <div className="page-title"><div><span className="eyebrow">Shop with a plan</span><h1>Grocery List 2.1</h1><p>{storeMode ? 'Only the items left to collect, grouped in your aisle order.' : 'Add what you need, check it off while shopping, then move purchases into your kitchen.'}</p></div><div className="title-actions grocery-primary-actions">{!storeMode && <button className="primary-button" onClick={() => setAdding(true)}><CirclePlus /> Add item</button>}<button className="secondary-button" onClick={() => { setStoreMode((current) => !current); setFilter('needed'); setUtilityMenuOpen(false) }}><ShoppingBasket /> {storeMode ? 'Finish shopping' : 'Start shopping'}</button>{!storeMode && <div className="grocery-utility-wrap" onPointerDown={(event) => event.stopPropagation()}><button className="secondary-button grocery-more-button" onClick={() => setUtilityMenuOpen((current) => !current)} aria-label="More grocery list actions" aria-haspopup="menu" aria-expanded={utilityMenuOpen} aria-controls="grocery-utility-menu"><MoreHorizontal /><span>More</span></button>{utilityMenuOpen && <div className="grocery-utility-menu" id="grocery-utility-menu" role="menu"><button role="menuitem" onClick={() => { setBulkEntryOpen(true); setUtilityMenuOpen(false) }} aria-expanded={bulkEntryOpen} aria-controls="grocery-bulk-entry"><Plus /> Paste a list</button><button role="menuitem" onClick={() => { setAisleEditorOpen(true); setUtilityMenuOpen(false) }}><ArrowUp /> Change aisle order</button><button role="menuitem" onClick={() => { setStaplesOpen(true); setUtilityMenuOpen(false) }}><Bookmark /> Manage staples</button>{neededCount > 0 && <button role="menuitem" onClick={() => { setGrocery((items) => items.map((item) => ({ ...item, checked: true }))); setUtilityMenuOpen(false) }}><Check /> Mark all as purchased</button>}</div>}</div>}</div></div>
    <KitchenSyncNotice state={syncState} isOnline={isOnline} onRetry={onRetry} />
    {!storeMode && bulkEntryOpen && <section className="grocery-add-panel panel" id="grocery-bulk-entry"><header><div><h2>Paste a grocery list</h2><p>Add one item per line. You will review everything before it is saved.</p></div><button onClick={() => setBulkEntryOpen(false)} aria-label="Close pasted list"><X /></button></header><div className="grocery-add"><label>Items<textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') addManual() }} placeholder={'2 bags spinach\n1 gallon milk\n6 apples'} /><small>Tip: include a quantity and unit when you know them.</small></label><button onClick={addManual} disabled={!draft.trim()}><ArrowRight /> Review items</button></div></section>}
    {newGroceryIds.size > 0 && <div className="new-grocery-banner"><Sparkles /><p><strong>{newGroceryIds.size} new item{newGroceryIds.size === 1 ? '' : 's'} from your household</strong><small>{grocery.filter((item) => item.id && newGroceryIds.has(item.id)).map((item) => item.name).join(' · ')}</small></p><span>New</span></div>}
    {checkedCount > 0 && <div className="grocery-next-step panel"><div><PackageOpen /><p><strong>{checkedCount} purchase{checkedCount === 1 ? '' : 's'} ready to put away</strong><small>Review storage and optional use-by dates before moving them into your kitchen.</small></p></div><button className="primary-button" onClick={() => setPurchaseReviewOpen(true)}>Review purchases <ArrowRight /></button></div>}
    <div className="grocery-progress panel"><div><span><strong>{checkedCount}</strong> of {grocery.length} collected</span><small>{neededCount ? `${neededCount} item${neededCount === 1 ? '' : 's'} left to find` : grocery.length ? 'Shopping complete — ready for your kitchen' : 'Add items or build a list from a recipe'}</small></div><div role="progressbar" aria-label="Shopping progress" aria-valuemin={0} aria-valuemax={grocery.length} aria-valuenow={checkedCount}><span style={{ width: `${grocery.length ? (checkedCount / grocery.length) * 100 : 0}%` }} /></div></div>
    <div className="grocery-layout"><div className="grocery-list panel">
      {grocery.length > 0 && <div className="grocery-toolbar">{storeMode ? <strong className="store-mode-label"><ShoppingBasket /> {neededCount} item{neededCount === 1 ? '' : 's'} left to collect</strong> : <div className="filter-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All {grocery.length}</button><button className={filter === 'needed' ? 'active' : ''} onClick={() => setFilter('needed')}>To buy {neededCount}</button><button className={filter === 'checked' ? 'active' : ''} onClick={() => setFilter('checked')}>Collected {checkedCount}</button></div>}<small>{storeMode ? 'Tap an item as it goes into your cart' : 'Items are grouped by aisle automatically'}</small></div>}
      <div className="grocery-sections">{sections.map(({ category, entries }) => <section className="grocery-section" key={category}><header><strong>{category}</strong><small>{entries.length}</small></header>{entries.map(({ item, index }) => {
        const bought = purchasedGroceryAmount(item)
        const isNew = Boolean(item.id && newGroceryIds.has(item.id))
        const actionKey = item.id || `${normalize(item.name)}-${index}`
        const itemMenuOpen = openItemActions === actionKey
        const itemMenuId = `grocery-actions-${actionKey}`
        return <div className={`${item.checked ? 'grocery-row checked' : 'grocery-row'}${isNew ? ' is-new' : ''}`} key={item.id || `${item.name}-${item.unit}-${index}`}><button className="check-box" onClick={() => setGrocery((items) => items.map((entry, i) => i === index ? { ...entry, checked: !entry.checked, ...(!entry.checked ? {} : { purchase: undefined }) } : entry))} aria-label={`${item.checked ? 'Return' : 'Mark'} ${item.name} ${item.checked ? 'to list' : 'as collected'}`}>{item.checked && <Check />}</button><span className="grocery-food-icon" aria-hidden="true">{groceryEmoji(item)}</span><p><strong>{item.name}{isNew && <em className="grocery-new-pill">New</em>}</strong><small>{item.checked && item.purchase ? `Bought ${formatAmount(bought.amount)} ${bought.unit} · needed ${formatAmount(item.amount)} ${item.unit}` : `${formatAmount(item.amount)} ${item.unit}`}</small></p>{!storeMode && <div className="grocery-row-actions" onPointerDown={(event) => event.stopPropagation()}><div className="grocery-direct-actions"><button className="icon-button staple" onClick={() => saveAsStaple(item)} aria-label={`Save ${item.name} as staple`}><Bookmark /></button><button className="icon-button edit" onClick={() => setEditing({ index, item })} aria-label={`Edit ${item.name}`}><Pencil /></button><button className="icon-button delete" onClick={() => removeGroceryItem(item, index)} aria-label={`Remove ${item.name}`}><Trash2 /></button></div><button className="icon-button grocery-row-more" onClick={() => setOpenItemActions((current) => current === actionKey ? null : actionKey)} aria-label={`More actions for ${item.name}`} aria-haspopup="menu" aria-expanded={itemMenuOpen} aria-controls={itemMenuId}><MoreHorizontal /></button>{itemMenuOpen && <div className="item-action-menu grocery-item-action-menu" id={itemMenuId} role="menu"><button role="menuitem" onClick={() => { setOpenItemActions(null); saveAsStaple(item) }}><Bookmark /> Save as staple</button><button role="menuitem" onClick={() => { setOpenItemActions(null); setEditing({ index, item }) }}><Pencil /> Edit item</button><button className="delete" role="menuitem" onClick={() => { setOpenItemActions(null); removeGroceryItem(item, index) }}><Trash2 /> Remove from list</button></div>}</div>}</div>
      })}</section>)}</div>
      {!grocery.length && <Empty title="Your list is clear" copy="Add one item now, or paste a full list from More." action={<button className="primary-button" onClick={() => setAdding(true)}><CirclePlus /> Add first item</button>} />}
      {grocery.length > 0 && !visible.length && <Empty title={filter === 'checked' ? 'Nothing collected yet' : 'Everything is collected'} copy={filter === 'checked' ? 'Tap an item while shopping to move it here.' : 'Review collected items or return to the full list.'} action={<button className="secondary-button" onClick={() => setFilter(filter === 'checked' ? 'needed' : 'all')}>{filter === 'checked' ? 'Show items to buy' : 'Show all items'}</button>} />}
    </div>{!storeMode && <StaplesPanel groups={stapleGroups} staples={staples} onAdd={(items) => onReviewItems(groceryFromStaples(items), 'staples')} onManage={() => setStaplesOpen(true)} />}</div>
    {editing && <GroceryItemEditor item={editing.item} onClose={() => setEditing(null)} onSave={saveEditedItem} />}
    {adding && <GroceryItemEditor item={{ name: '', amount: 1, unit: 'item', checked: false }} mode="add" onClose={() => setAdding(false)} onSave={saveNewItem} />}
    {aisleEditorOpen && <AisleOrderEditor order={aisleOrder} onChange={setAisleOrder} onClose={() => setAisleEditorOpen(false)} />}
    {purchaseReviewOpen && <PurchaseReview items={grocery.filter((item) => item.checked)} inventory={inventory} storageAreas={storageAreas} rememberedProducts={rememberedProducts} householdId={householdId} accessToken={accessToken} isOnline={isOnline} onClose={() => setPurchaseReviewOpen(false)} onConfirm={moveCheckedToKitchen} />}
    {staplesOpen && <StaplesManager groups={stapleGroups} staples={staples} setGroups={setStapleGroups} setStaples={setStaples} onAddToGrocery={(items) => onReviewItems(groceryFromStaples(items), 'staples')} onClose={() => setStaplesOpen(false)} notify={notify} offerUndo={offerUndo} />}
  </section>
}

function AisleOrderEditor({ order, onChange, onClose }: { order: Category[]; onChange: (order: Category[]) => void; onClose: () => void }) {
  function move(category: Category, offset: number) {
    const index = order.indexOf(category)
    const target = index + offset
    if (index < 0 || target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal aisle-order-editor" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Match your store</span><h2>Aisle order</h2><p>Arrange categories in the order you usually walk through the store.</p></div><button onClick={onClose} aria-label="Close aisle order"><X /></button></div><ol>{order.map((category, index) => <li key={category}><span>{index + 1}</span><strong>{category}</strong><div><button disabled={index === 0} onClick={() => move(category, -1)} aria-label={`Move ${category} up`}><ArrowUp /></button><button disabled={index === order.length - 1} onClick={() => move(category, 1)} aria-label={`Move ${category} down`}><ArrowDown /></button></div></li>)}</ol><button className="submit-button" onClick={onClose}>Save aisle order <Check /></button></section></div>
}

function PurchaseReview({ items, inventory, storageAreas, rememberedProducts, householdId, accessToken, isOnline, onClose, onConfirm }: {
  items: GroceryItem[]; inventory: InventoryItem[]; storageAreas: StorageArea[]; rememberedProducts: HouseholdProduct[]; householdId: string | null; accessToken: string; isOnline: boolean;
  onClose: () => void; onConfirm: (items: GroceryItem[]) => void
}) {
  const [drafts, setDrafts] = useState<GroceryPurchaseDraft[]>(() => items.map((item) => {
    const profile = getFoodIntelligence(item.name)?.profile
    return {
      ...item,
      purchase: item.purchase || { packageCount: 1, packageSize: item.amount, packageUnit: item.unit, location: profile?.location || 'Pantry', foodGroup: profile?.foodGroup || 'Other', storageAreaId: profile?.storageAreaId || 'pantry', freshnessPolicy: profile?.freshnessPolicy || 'none', expiresOn: profile?.freshnessPolicy === 'tracked' ? expirationDateFromDays(profile.shelfLifeDays) : null },
    }
  }))
  const [scanTarget, setScanTarget] = useState<number | null | 'auto'>(null)
  function update(index: number, purchase: Partial<GroceryPurchaseDraft['purchase']>) {
    setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, purchase: { ...item.purchase, ...purchase } } : item))
  }
  function applyScan(index: number, product: BarcodeProduct) {
    setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? applyBarcodeToGroceryPurchase(item, product) as GroceryPurchaseDraft : item))
    setScanTarget(null)
  }
  function addUnplanned(product: BarcodeProduct) {
    setDrafts((current) => [...current, groceryItemFromBarcodeProduct(product) as GroceryPurchaseDraft])
    setScanTarget(null)
  }
  const valid = drafts.length > 0
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal purchase-review" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Put groceries away</span><h2>Add purchases to your kitchen</h2><p>No quantities needed. Confirm where each ingredient belongs, or scan a barcode to remember the product.</p></div><button onClick={onClose} aria-label="Close purchase review"><X /></button></div><button type="button" className="purchase-scan-all" onClick={() => setScanTarget('auto')}><Camera /> Scan a purchased item <span>Optional · match it to this list automatically</span><ArrowRight /></button><div className="purchase-review-list">{drafts.map((item, index) => <article key={`${item.name}-${item.unit}-${index}`}><div className="purchase-item-heading"><span>{item.purchase.productImageUrl ? <img src={item.purchase.productImageUrl} alt="" /> : groceryEmoji(item)}</span><p><strong>{item.name}</strong><small>Available at home{item.purchase.brand ? ` · ${item.purchase.brand}` : ''}</small></p><button type="button" className="purchase-item-scan" onClick={() => setScanTarget(index)}><Camera /> Scan</button></div><div className="purchase-fields presence-fields"><label>Food type<select value={item.purchase.foodGroup || 'Other'} onChange={(event) => update(index, { foodGroup: event.target.value as FoodGroup })}>{foodGroups.map((group) => <option key={group}>{group}</option>)}</select></label><label>Store in<select value={item.purchase.storageAreaId || 'pantry'} onChange={(event) => { const area = storageAreaForId(storageAreas, event.target.value); update(index, { storageAreaId: area.id, location: legacyLocationForCondition(area.condition) }) }}>{activeStorageAreas(storageAreas).map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label><label>Freshness<select value={item.purchase.freshnessPolicy || 'none'} onChange={(event) => { const freshnessPolicy = event.target.value as FreshnessPolicy; update(index, { freshnessPolicy, expiresOn: freshnessPolicy === 'none' ? null : item.purchase.expiresOn }) }}><option value="tracked">Track date</option><option value="none">No date needed</option></select></label>{item.purchase.freshnessPolicy !== 'none' && <label>Use-by date (optional)<input type="date" value={item.purchase.expiresOn || ''} onChange={(event) => update(index, { expiresOn: event.target.value || null })} /></label>}</div>{item.purchase.barcode && <div className="purchase-barcode"><Check /> Product remembered · {item.purchase.barcode}</div>}</article>)}</div><button className="submit-button" disabled={!valid} onClick={() => onConfirm(drafts)}><PackageOpen /> Add purchases to kitchen</button>{scanTarget !== null && <PurchaseBarcodeCapture items={drafts} targetIndex={scanTarget === 'auto' ? null : scanTarget} inventory={inventory} rememberedProducts={rememberedProducts} householdId={householdId} accessToken={accessToken} isOnline={isOnline} onApply={applyScan} onAddUnplanned={addUnplanned} onClose={() => setScanTarget(null)} />}</section></div>
}

function PurchaseBarcodeCapture({ items, targetIndex, inventory, rememberedProducts, householdId, accessToken, isOnline, onApply, onAddUnplanned, onClose }: {
  items: GroceryItem[]; targetIndex: number | null; inventory: InventoryItem[]; rememberedProducts: HouseholdProduct[];
  householdId: string | null; accessToken: string; isOnline: boolean; onApply: (index: number, product: BarcodeProduct) => void;
  onAddUnplanned: (product: BarcodeProduct) => void; onClose: () => void
}) {
  const [phase, setPhase] = useState<'start' | 'camera' | 'lookup' | 'review'>('start')
  const [barcode, setBarcode] = useState('')
  const [message, setMessage] = useState('')
  const [product, setProduct] = useState<BarcodeProduct | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const scannerControls = useRef<{ stop: () => void } | null>(null)

  function stopCamera() {
    scannerControls.current?.stop()
    scannerControls.current = null
  }
  useEffect(() => () => stopCamera(), [])

  function manualProduct(code: string, copy: string) {
    setProduct({ barcode: code, name: targetIndex === null ? 'Packaged product' : items[targetIndex].name, productSource: 'household' })
    setMessage(copy)
    setPhase('review')
  }

  function setReviewProduct(found: BarcodeProduct) {
    const metadata = productMetadata(found)
    setProduct({ ...found, packageAmount: metadata.packageAmount, packageUnit: metadata.packageUnit })
  }

  async function identify(value: string) {
    const code = normalizeBarcode(value)
    setBarcode(code)
    if (!isValidBarcode(code)) { setMessage('Enter a valid UPC, EAN, or GTIN barcode.'); setPhase('start'); return }
    stopCamera()
    setPhase('lookup')
    setMessage('Checking your kitchen and product data…')
    try {
      const current = rememberedInventoryProduct(inventory, code)
      const cached = rememberedHouseholdProduct(rememberedProducts, code)
      const remembered = current || cached || (isOnline && householdId ? await loadRememberedProduct(householdId, code) : null)
      if (remembered) {
        setReviewProduct(barcodeProductFromRemembered({ ...remembered, barcode: code }))
        setMessage(current ? 'Recognized from your kitchen.' : 'Recognized from your household corrections.')
        setPhase('review')
        return
      }
      if (!isOnline) {
        manualProduct(code, 'This product is new to your kitchen and you are offline. Enter the package details from its label.')
        return
      }
      const found = await lookupBarcodeProduct(code, accessToken)
      setReviewProduct(found)
      setMessage('Product found. Verify the package details before using them.')
      setPhase('review')
    } catch (error) {
      if (error instanceof ProductNotFoundError) {
        manualProduct(code, 'This barcode is not in Open Food Facts. Enter the label details once and Mise will remember them.')
      } else {
        manualProduct(code, `${errorMessage(error, 'Product lookup is unavailable.')} You can still enter the label details manually.`)
      }
    }
  }

  async function startCamera() {
    setPhase('camera')
    setMessage('Starting the rear camera…')
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 800 })
      const controls = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' } } }, video.current || undefined, (result) => {
        if (!result) return
        controls.stop()
        void identify(result.getText())
      })
      scannerControls.current = controls
      setMessage('Center the package barcode inside the frame.')
    } catch (error) {
      stopCamera()
      setPhase('start')
      const denied = error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)
      setMessage(denied ? 'Camera permission is off. Allow camera access in Safari settings, or enter the barcode below.' : 'The camera could not start. Enter the barcode numbers below instead.')
    }
  }

  const bestMatch = product ? bestGroceryBarcodeMatch(items, product) : null
  const targetScore = product && targetIndex !== null ? groceryBarcodeMatchScore(items[targetIndex], product) : 0
  const suggestedIndex = bestMatch?.index ?? null
  const differentSuggestion = targetIndex !== null && suggestedIndex !== null && suggestedIndex !== targetIndex && (bestMatch?.score || 0) > targetScore
  const packageLabel = product?.packageAmount && product.packageUnit ? `${formatAmount(product.packageAmount)} ${product.packageUnit}` : 'Package size not found'

  return <div className="modal-backdrop purchase-barcode-backdrop" onMouseDown={onClose}><section className="modal purchase-barcode-capture" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow"><Camera size={12} /> Purchase scanner</span><h2>{targetIndex === null ? 'Scan what you bought' : `Scan ${items[targetIndex].name}`}</h2></div><button type="button" onClick={onClose} aria-label="Close purchase scanner"><X /></button></div>
    {phase !== 'review' && <><p className="modal-intro">Mise will use the barcode to fill the real package size and match it to your shopping list.</p>{phase === 'camera' ? <div className="barcode-camera"><video ref={video} autoPlay muted playsInline /><div className="barcode-frame"><span /></div></div> : <button type="button" className="start-camera-button" disabled={phase === 'lookup'} onClick={() => void startCamera()}><Camera /> Use rear camera</button>}<div className="barcode-status" role="status" aria-live="polite">{phase === 'lookup' && <i />}{message || 'Works with UPC, EAN, and GTIN package labels.'}</div><div className="smart-divider"><span>or enter the numbers</span></div><form className="barcode-manual" onSubmit={(event) => { event.preventDefault(); void identify(barcode) }}><label>Barcode<input inputMode="numeric" autoComplete="off" value={barcode} onChange={(event) => setBarcode(normalizeBarcode(event.target.value).slice(0, 14))} placeholder="e.g. 034000470693" /></label><button type="submit" disabled={phase === 'lookup' || !barcode}>Find product <ArrowRight /></button></form></>}
    {phase === 'review' && product && <div className="purchase-product-review"><div className="product-preview">{product.productImageUrl ? <img src={product.productImageUrl} alt="" /> : <span>{targetIndex === null ? '📦' : groceryEmoji(items[targetIndex])}</span>}<div><small>{product.brand || 'Packaged product'}</small><strong>{product.name}</strong><em>{product.barcode}</em></div></div><div className="barcode-status ready">{message}</div><div className="form-row"><label>Product name<input value={product.name} onChange={(event) => setProduct((current) => current ? { ...current, name: event.target.value } : current)} /></label><label>Size each<NumberField min="0.01" step="0.01" value={product.packageAmount || 1} onValueChange={(packageAmount) => setProduct((current) => current ? { ...current, packageAmount } : current)} /></label></div><label>Package unit<UnitPicker value={product.packageUnit || 'pack'} onChange={(packageUnit) => setProduct((current) => current ? { ...current, packageUnit } : current)} ariaLabel="Scanned package unit" required /></label><div className="purchase-match-summary"><Sparkles /><span><strong>{suggestedIndex !== null ? `Best match: ${items[suggestedIndex].name}` : 'No confident list match'}</strong>{packageLabel}. Review the package label before confirming.</span></div>{differentSuggestion && <div className="expiration-warning"><TriangleAlert /> This looks more like {items[suggestedIndex!].name} than {items[targetIndex!].name}.</div>}<div className="purchase-scan-actions">{suggestedIndex !== null && (targetIndex === null || differentSuggestion) && <button type="button" className="primary-button" onClick={() => onApply(suggestedIndex, product)}><Check /> Apply to {items[suggestedIndex].name}</button>}{targetIndex !== null && <button type="button" className={differentSuggestion ? 'secondary-button' : 'primary-button'} onClick={() => onApply(targetIndex, product)}><Check /> Use for {items[targetIndex].name}</button>}<button type="button" className="secondary-button" onClick={() => onAddUnplanned(product)}><Plus /> Add as unplanned purchase</button></div></div>}
  </section></div>
}

function StaplesPanel({ groups, staples, onAdd, onManage }: { groups: GroceryStapleGroup[]; staples: GroceryStaple[]; onAdd: (items: GroceryStaple[]) => void; onManage: () => void }) {
  const orderedGroups = orderedStapleGroups(groups)
  return <aside className="staples-panel panel"><div className="staples-panel-head"><div><span className="eyebrow">Buy again</span><h3>Your staples</h3></div><button onClick={onManage}><SettingsIcon /> Manage</button></div>{orderedGroups.length ? <div className="staple-group-list">{orderedGroups.map((group) => { const items = orderedStaples(staples, group.id); return <section key={group.id}><header><div><strong>{group.name}</strong><small>{items.length} item{items.length === 1 ? '' : 's'}</small></div>{items.length > 0 && <button onClick={() => onAdd(items)}><Plus /> Add all</button>}</header><div>{items.slice(0, 5).map((item) => <button key={item.id} onClick={() => onAdd([item])}><span>{groceryEmoji(item)}</span><p><strong>{item.name}</strong><small>{formatAmount(item.amount)} {item.unit}</small></p><Plus /></button>)}{items.length > 5 && <small className="more-staples">+{items.length - 5} more in Manage</small>}</div></section> })}</div> : <div className="staples-empty"><Bookmark /><strong>Save your weekly essentials</strong><p>Use the bookmark on a grocery item or create a custom staple group.</p><button className="secondary-button" onClick={onManage}>Create staples</button></div>}<div className="staples-tip"><ShoppingBasket /><p>Staples keep their usual quantity and merge safely with items already on your list.</p></div></aside>
}

function StaplesManager({ groups, staples, setGroups, setStaples, onAddToGrocery, onClose, notify, offerUndo }: {
  groups: GroceryStapleGroup[]; staples: GroceryStaple[]; setGroups: React.Dispatch<React.SetStateAction<GroceryStapleGroup[]>>;
  setStaples: React.Dispatch<React.SetStateAction<GroceryStaple[]>>; onAddToGrocery: (items: GroceryStaple[]) => void; onClose: () => void; notify: (message: string) => void; offerUndo: UndoNotice
}) {
  const orderedGroups = orderedStapleGroups(groups)
  const [activeGroupId, setActiveGroupId] = useState(orderedGroups[0]?.id || '')
  const [groupDraft, setGroupDraft] = useState('')
  const [stapleDraft, setStapleDraft] = useState('')
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single')
  const [singleName, setSingleName] = useState('')
  const [singleAmount, setSingleAmount] = useState(1)
  const [singleUnit, setSingleUnit] = useState('item')
  const [singleUnitTouched, setSingleUnitTouched] = useState(false)
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
  function addSingleStaple(event: React.FormEvent) {
    event.preventDefault()
    if (!activeGroup || !singleName.trim() || singleAmount <= 0 || !singleUnit.trim()) return
    const candidate: GroceryStaple = {
      id: localId('staple'), groupId: activeGroup.id, name: singleName.trim(), amount: singleAmount,
      unit: singleUnit.trim(), sortOrder: activeStaples.length,
    }
    setStaples((current) => addOrUpdateStaple(current, candidate))
    notify(`${candidate.name} saved to ${activeGroup.name}`)
    setSingleName(''); setSingleAmount(1); setSingleUnit('item'); setSingleUnitTouched(false)
  }
  function updateSingleName(value: string) {
    setSingleName(value)
    const suggestion = getFoodIntelligence(value)?.profile
    if (!singleUnitTouched && suggestion) setSingleUnit(suggestion.defaultUnit)
  }
  function removeGroup(group: GroceryStapleGroup) {
    if (!window.confirm(`Remove “${group.name}” and all of its staples?`)) return
    const groupIndex = groups.findIndex((entry) => entry.id === group.id)
    const removedStaples = staples.filter((entry) => entry.groupId === group.id)
    const remaining = orderedStapleGroups(groups.filter((entry) => entry.id !== group.id))
    setActiveGroupId(remaining[0]?.id || '')
    setGroups((current) => current.filter((entry) => entry.id !== group.id))
    setStaples((current) => current.filter((entry) => entry.groupId !== group.id))
    offerUndo(`${group.name} deleted`, () => {
      setGroups((current) => {
        if (current.some((entry) => entry.id === group.id)) return current
        const next = [...current]
        next.splice(Math.max(0, Math.min(groupIndex, next.length)), 0, group)
        return next
      })
      setStaples((current) => [...current.filter((entry) => !removedStaples.some((removed) => removed.id === entry.id)), ...removedStaples])
      setActiveGroupId(group.id)
    }, `${group.name} restored`, ['staples'])
  }
  function removeStaple(staple: GroceryStaple, index: number) {
    setStaples((current) => current.filter((item) => item.id !== staple.id))
    offerUndo(`${staple.name} deleted`, () => setStaples((current) => {
      if (current.some((item) => item.id === staple.id)) return current
      const next = [...current]
      const groupPositions = next.map((item, itemIndex) => item.groupId === staple.groupId ? itemIndex : -1).filter((itemIndex) => itemIndex >= 0)
      const insertionIndex = groupPositions[index] ?? (groupPositions.length ? groupPositions[groupPositions.length - 1] + 1 : next.length)
      next.splice(insertionIndex, 0, staple)
      return next
    }), `${staple.name} restored`, ['staples'])
  }
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal staples-manager" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Reusable grocery lists</span><h2>Manage staples</h2><p>Build household groups with the quantities you usually buy.</p></div><button type="button" onClick={onClose} aria-label="Close staples manager"><X /></button></div>
      <form className="staple-group-create" onSubmit={createGroup}><input value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} placeholder="New group, e.g. Costco run" aria-label="New staple group name" /><button type="submit" disabled={!groupDraft.trim()}><Plus /> Add group</button></form>
      <div className="staples-manager-layout">
        <nav>{orderedGroups.map((group, index) => <div className={group.id === resolvedActiveGroupId ? 'active' : ''} key={group.id}><button className="group-select" onClick={() => setActiveGroupId(group.id)}><strong>{group.name}</strong><small>{orderedStaples(staples, group.id).length}</small></button><div><button disabled={index === 0} onClick={() => setGroups((current) => moveStapleGroup(current, group.id, -1))} aria-label={`Move ${group.name} up`}><ArrowUp /></button><button disabled={index === orderedGroups.length - 1} onClick={() => setGroups((current) => moveStapleGroup(current, group.id, 1))} aria-label={`Move ${group.name} down`}><ArrowDown /></button></div></div>)}</nav>
        <div className="staple-editor-area">{activeGroup ? <>
          <div className="staple-group-title"><input value={activeGroup.name} onChange={(event) => setGroups((current) => current.map((group) => group.id === activeGroup.id ? { ...group, name: event.target.value } : group))} aria-label="Staple group name" /><button className="icon-button delete" onClick={() => removeGroup(activeGroup)} aria-label={`Remove ${activeGroup.name} group`}><Trash2 /></button></div>
          <div className="staple-add-tabs" role="group" aria-label="Staple entry method"><button className={addMode === 'single' ? 'active' : ''} onClick={() => setAddMode('single')}><CirclePlus /> Add one</button><button className={addMode === 'bulk' ? 'active' : ''} onClick={() => setAddMode('bulk')}><Sparkles /> Bulk add</button></div>
          {addMode === 'single' ? <form className="staple-single-form" onSubmit={addSingleStaple}>
            <span className="staple-single-icon" aria-hidden="true">{groceryEmoji({ name: singleName })}</span>
            <label>Name<input autoFocus value={singleName} onChange={(event) => updateSingleName(event.target.value)} placeholder="e.g. Greek yogurt" /></label>
            <label>Quantity<NumberField min="0.01" step="0.01" value={singleAmount} onValueChange={setSingleAmount} /></label>
            <label>Unit<UnitPicker value={singleUnit} onChange={(value) => { setSingleUnitTouched(true); setSingleUnit(value) }} ariaLabel="New staple unit" required /></label>
            <button type="submit" disabled={!singleName.trim() || !singleUnit.trim()}><Plus /> Add staple</button>
          </form> : <form className="staple-add-form" onSubmit={addStaples}><textarea autoFocus value={stapleDraft} onChange={(event) => setStapleDraft(event.target.value)} placeholder={'Add several staples:\n2 cartons eggs\n1 gallon milk'} aria-label="New staples" /><button type="submit" disabled={!stapleDraft.trim()}><Plus /> Add staples</button></form>}
          {activeStaples.length ? <div className="staple-editor-list">{activeStaples.map((staple, index) => <div key={staple.id}><span>{groceryEmoji(staple)}</span><label>Name<input value={staple.name} onChange={(event) => setStaples((current) => current.map((item) => item.id === staple.id ? { ...item, name: event.target.value } : item))} /></label><label>Quantity<NumberField min="0.01" step="0.01" value={staple.amount} onValueChange={(amount) => setStaples((current) => current.map((item) => item.id === staple.id ? { ...item, amount } : item))} /></label><label>Unit<UnitPicker value={staple.unit} onChange={(unit) => setStaples((current) => current.map((item) => item.id === staple.id ? { ...item, unit } : item))} ariaLabel={`Unit for ${staple.name}`} required /></label><div className="staple-row-actions"><button disabled={index === 0} onClick={() => setStaples((current) => moveStaple(current, staple.id, -1))} aria-label={`Move ${staple.name} up`}><ArrowUp /></button><button disabled={index === activeStaples.length - 1} onClick={() => setStaples((current) => moveStaple(current, staple.id, 1))} aria-label={`Move ${staple.name} down`}><ArrowDown /></button><button onClick={() => onAddToGrocery([staple])} aria-label={`Add ${staple.name} to grocery list`}><ShoppingBasket /></button><button className="delete" onClick={() => removeStaple(staple, index)} aria-label={`Remove ${staple.name} staple`}><Trash2 /></button></div></div>)}</div> : <div className="staples-manager-empty"><Bookmark /><p>Add the foods your household buys regularly.</p></div>}
          {activeStaples.length > 0 && <button className="submit-button" onClick={() => onAddToGrocery(activeStaples)}>Add group to grocery list <ArrowRight /></button>}
        </> : <div className="staples-manager-empty"><Bookmark /><h3>Create your first group</h3><p>Try Weekly essentials, Breakfast, or Costco run.</p></div>}</div>
      </div>
    </section>
  </div>
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
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal grocery-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Grocery List 2.1</span><h2>{mode === 'add' ? 'Add grocery item' : 'Edit grocery item'}</h2></div><button type="button" onClick={onClose} aria-label="Close grocery item editor"><X /></button></div><div className="grocery-edit-preview"><span>{groceryEmoji({ name })}</span><p><strong>{name || 'Grocery item'}</strong><small>{groceryCategory({ name })} aisle</small></p></div><label>Item name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Milk" /></label><div className="form-row"><label>Quantity<NumberField min="0.01" step="0.01" value={amount} onValueChange={setAmount} /></label><label>Unit<UnitPicker value={unit} onChange={setUnit} ariaLabel="Grocery item unit" required /></label></div><button className="submit-button" type="submit">{mode === 'add' ? 'Add to grocery list' : 'Save changes'} <ArrowRight /></button></form></div>
}

function SettingsPage({ session, householdId, displayName, preferences, reminderPreferences, storageAreas, inventory, syncState, isOnline, inventoryCount, groceryCount, onRetry, onResetPassword, onUpdateName, onUpdatePreferences, onUpdateReminderPreferences, onUpdateStorageAreas, onArchiveStorageArea, onActivateHousehold, onJoinHousehold, onOpenFeedback, onSignOut }: {
  session: Session | null; householdId: string | null; displayName: string; preferences: FoodPreferences; reminderPreferences: MealReminderPreferences; storageAreas: StorageArea[]; inventory: InventoryItem[]; syncState: SyncState; isOnline: boolean; inventoryCount: number; groceryCount: number;
  onRetry: () => void; onResetPassword: () => Promise<void>; onUpdateName: (name: string) => Promise<void>; onUpdatePreferences: (preferences: FoodPreferences) => Promise<void>;
  onUpdateReminderPreferences: React.Dispatch<React.SetStateAction<MealReminderPreferences>>; onUpdateStorageAreas: (areas: StorageArea[]) => Promise<void>; onArchiveStorageArea: (areaId: string, replacementId: string) => Promise<void>; onActivateHousehold: (householdId: string) => Promise<void>; onJoinHousehold: (code: string) => Promise<void>; onOpenFeedback: () => void; onSignOut: () => Promise<void>
}) {
  const [settingsArea, setSettingsArea] = useState<SettingsArea>('general')
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
  const settingsAreaCopy: Record<SettingsArea, { title: string; description: string }> = {
    general: { title: 'Everyday settings', description: 'Update your profile, cloud sync, and meal reminders.' },
    food: { title: 'Recipes & dietary needs', description: 'Tune recipe ideas around the way you eat.' },
    household: { title: 'People & sharing', description: 'Manage members, invitations, and recent household activity.' },
    account: { title: 'Help & account', description: 'Send feedback or manage your sign-in and security.' },
  }

  useEffect(() => {
    if (!session || !householdId) return
    let active = true
    let refreshTimer: number | null = null
    async function refreshSharedKitchen() {
      try {
        const [nextHouseholds, nextMembers, nextActivity] = await Promise.all([loadHouseholds(), loadHouseholdMembers(householdId!), loadHouseholdActivity(householdId!)])
        if (!active) return
        setHouseholds(nextHouseholds)
        setMembers(nextMembers)
        setActivity(nextActivity)
        setKitchenName(nextHouseholds.find((household) => household.id === householdId)?.name || '')
        if (nextHouseholds.find((household) => household.id === householdId)?.role === 'owner') {
          const activeInvite = await loadActiveHouseholdInvite(householdId!)
          if (active) setInvite(activeInvite)
        } else setInvite(null)
      } catch (error) {
        if (active) setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Shared kitchen details could not be loaded.' })
      }
    }
    void refreshSharedKitchen()
    if (!supabase) return () => { active = false }
    const client = supabase
    function scheduleRefresh() {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => { refreshTimer = null; void refreshSharedKitchen() }, 180)
    }
    const channel = client.channel(`mise-household-settings-${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members', filter: `household_id=eq.${householdId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_activity', filter: `household_id=eq.${householdId}` }, scheduleRefresh)
      .subscribe()
    return () => {
      active = false
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      void client.removeChannel(channel)
    }
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
    <div className="page-title"><div><span className="eyebrow">Your Mise</span><h1>Settings</h1><p>Your preferences, household, reminders, and account in one place.</p></div></div>
    {message && <div className={`settings-message ${message.type}`}>{message.text}</div>}
    <div className="settings-workspace">
      <nav className="settings-area-nav" aria-label="Settings areas">
        <button type="button" className={settingsArea === 'general' ? 'active' : ''} aria-current={settingsArea === 'general' ? 'page' : undefined} onClick={() => setSettingsArea('general')}><UserRound /><span><strong>General</strong><small>Profile, sync, reminders</small></span></button>
        <button type="button" className={settingsArea === 'food' ? 'active' : ''} aria-current={settingsArea === 'food' ? 'page' : undefined} onClick={() => setSettingsArea('food')}><Leaf /><span><strong>Food</strong><small>Diet and recipe matching</small></span></button>
        <button type="button" className={settingsArea === 'household' ? 'active' : ''} aria-current={settingsArea === 'household' ? 'page' : undefined} onClick={() => setSettingsArea('household')}><UsersRound /><span><strong>Household</strong><small>Members and activity</small></span></button>
        <button type="button" className={settingsArea === 'account' ? 'active' : ''} aria-current={settingsArea === 'account' ? 'page' : undefined} onClick={() => setSettingsArea('account')}><ShieldCheck /><span><strong>Account</strong><small>Feedback and security</small></span></button>
      </nav>
      <div className="settings-area-content">
        <header className="settings-area-heading"><h2>{settingsAreaCopy[settingsArea].title}</h2><p>{settingsAreaCopy[settingsArea].description}</p></header>
        <div className="settings-grid">
      <article className="settings-card panel" hidden={settingsArea !== 'general'}>
        <div className="settings-card-head"><span><UserRound /></span><div><h2>Profile</h2><p>How you appear in your kitchen.</p></div></div>
        {session ? <form onSubmit={saveName}><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Email address<input value={session.user.email || ''} disabled /></label><button className="secondary-button" disabled={working === 'name' || !name.trim() || name.trim() === displayName}>{working === 'name' ? 'Saving…' : 'Save profile'}</button></form> : <p className="settings-copy">You are using the local demo. Sign in when you want this kitchen on your other devices.</p>}
      </article>
      <article className="settings-card panel" hidden={settingsArea !== 'general'}>
        <div className="settings-card-head"><span className={syncState === 'saved' ? 'healthy' : 'warning'}>{syncState === 'offline' ? <WifiOff /> : <Cloud />}</span><div><h2>Kitchen sync</h2><p>{syncCopy[syncState]}</p></div></div>
        <div className="settings-stats"><span><strong>{inventoryCount}</strong> ingredients</span><span><strong>{groceryCount}</strong> grocery items</span><span><strong>{isOnline ? 'Online' : 'Offline'}</strong> connection</span></div>
        {session && syncState !== 'saved' && <button className="secondary-button" onClick={onRetry}><RefreshCw /> {syncState === 'conflict' ? 'Reload latest kitchen' : 'Retry sync'}</button>}
      </article>
      <article className="settings-card reminder-settings-card panel" hidden={settingsArea !== 'general'}>
        <div className="settings-card-head"><span className={reminderPreferences.enabled ? 'healthy' : ''}><BellRing /></span><div><h2>Meal reminders</h2><p>See timely prompts for meals you planned today.</p></div></div>
        <label className="reminder-toggle"><span><strong>In-app reminders</strong><small>Shown on your Overview while Mise is open.</small></span><input type="checkbox" role="switch" checked={reminderPreferences.enabled} onChange={(event) => onUpdateReminderPreferences((current) => ({ ...current, enabled: event.target.checked }))} /></label>
        <label>Remind me before<select disabled={!reminderPreferences.enabled} value={reminderPreferences.leadMinutes} onChange={(event) => onUpdateReminderPreferences((current) => ({ ...current, leadMinutes: Number(event.target.value) }))}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option></select></label>
        <div className="reminder-time-grid">{mealSlots.map((slot) => <label key={slot.value}>{slot.label}<input type="time" disabled={!reminderPreferences.enabled} value={reminderPreferences.times[slot.value]} onChange={(event) => onUpdateReminderPreferences((current) => ({ ...current, times: { ...current.times, [slot.value]: event.target.value } }))} /></label>)}</div>
        <p className="reminder-privacy">These times stay on this device. No paid notification or tracking service is used.</p>
      </article>
      <StorageAreaManager areas={storageAreas} inventory={inventory} hidden={settingsArea !== 'general'} onChange={onUpdateStorageAreas} onArchive={onArchiveStorageArea} />
      <article className="settings-card shared-kitchen-card panel" hidden={settingsArea !== 'household'}>
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
      <article className="settings-card preferences-card panel" hidden={settingsArea !== 'food'}>
        <div className="settings-card-head"><span><Leaf /></span><div><h2>Food preferences</h2><p>Personalize recipe discovery around how you eat.</p></div></div>
        <form onSubmit={savePreferences}>
          <label>Diet<select value={preferenceDraft.diet} onChange={(event) => setPreferenceDraft((current) => ({ ...current, diet: event.target.value as FoodPreferences['diet'] }))}><option value="">No diet preference</option>{dietPreferences.map((diet) => <option key={diet}>{diet}</option>)}</select></label>
          <fieldset className="preference-options"><legend>Allergies & intolerances</legend><div>{foodIntolerances.map((intolerance) => <button type="button" key={intolerance} className={preferenceDraft.intolerances.includes(intolerance) ? 'selected' : ''} aria-pressed={preferenceDraft.intolerances.includes(intolerance)} onClick={() => toggleIntolerance(intolerance)}>{preferenceDraft.intolerances.includes(intolerance) && <Check />} {intolerance}</button>)}</div></fieldset>
          <label>Ingredients to avoid<input value={excludedDraft} onChange={(event) => setExcludedDraft(event.target.value)} placeholder="e.g. mushrooms, cilantro" /><small>Separate multiple ingredients with commas.</small></label>
          <div className="preference-save"><button className="secondary-button" disabled={working === 'preferences'}>{working === 'preferences' ? 'Saving…' : 'Save food preferences'}</button><p><TriangleAlert /> For severe allergies, always verify the original recipe and product labels. Mise’s saved-recipe warnings are ingredient-name checks, not medical guarantees.</p></div>
        </form>
      </article>
      <article className="settings-card settings-feedback-card panel" hidden={settingsArea !== 'account'}>
        <div className="settings-card-head"><span><MessageSquareText /></span><div><h2>Help shape Mise</h2><p>Share an idea, report a problem, or tell us what feels confusing.</p></div></div>
        <button className="secondary-button" onClick={onOpenFeedback}><Send /> Send feedback</button>
      </article>
      <article className="settings-card account-settings-card panel" hidden={settingsArea !== 'account'}>
        <div className="settings-card-head"><span><ShieldCheck /></span><div><h2>Account & security</h2><p>{session ? `Signed in with ${provider}.` : 'Local demo mode.'}</p></div></div>
        {session && <div className="settings-actions"><button className="secondary-button" onClick={resetPassword} disabled={working === 'password'}><Mail /> {working === 'password' ? 'Sending…' : 'Send password reset email'}</button><button className="danger-button" onClick={onSignOut}><LogOut /> Sign out</button></div>}
        <p className="privacy-note"><KeyRound /> Mise never stores your password. Authentication is handled securely by Supabase.</p>
      </article>
        </div>
      </div>
    </div>
  </section>
}

function StorageAreaNameInput({ area, onCommit }: { area: StorageArea; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(area.name)
  // The parent may rename or restore this shared location from another device.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(area.name), [area.name])
  function commit() {
    const next = draft.trim()
    if (!next) setDraft(area.name)
    else if (next !== area.name) onCommit(next)
  }
  return <input aria-label={`Name for ${area.name}`} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(area.name); event.currentTarget.blur() } }} />
}

function StorageAreaManager({ areas, inventory, hidden, onChange, onArchive }: { areas: StorageArea[]; inventory: InventoryItem[]; hidden: boolean; onChange: (areas: StorageArea[]) => Promise<void>; onArchive: (areaId: string, replacementId: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [condition, setCondition] = useState<StorageCondition>('ambient')
  const [archiving, setArchiving] = useState<string | null>(null)
  const [replacement, setReplacement] = useState('')
  const [working, setWorking] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const ordered = [...areas].sort((a, b) => a.sortOrder - b.sortOrder)
  const active = activeStorageAreas(ordered)
  async function save(next: StorageArea[]) { setWorking(true); try { await onChange(next.map((area, index) => ({ ...area, sortOrder: index }))) } finally { setWorking(false) } }
  async function addArea() {
    if (!name.trim()) return
    const duplicate = areas.find((area) => normalize(area.name) === normalize(name))
    if (duplicate) { if (duplicate.archivedAt) await save(areas.map((area) => area.id === duplicate.id ? { ...area, archivedAt: null, condition } : area)); setName(''); return }
    await save([...areas, { id: `custom-${crypto.randomUUID()}`, name: name.trim(), condition, sortOrder: areas.length, archivedAt: null }]); setName('')
  }
  function patchArea(id: string, updates: Partial<StorageArea>) { void save(areas.map((area) => area.id === id ? { ...area, ...updates } : area)) }
  function move(id: string, direction: -1 | 1) {
    const current = active.findIndex((area) => area.id === id); const swap = current + direction
    if (current < 0 || swap < 0 || swap >= active.length) return
    const reordered = [...active]; [reordered[current], reordered[swap]] = [reordered[swap], reordered[current]]
    void save([...reordered, ...ordered.filter((area) => area.archivedAt)])
  }
  async function confirmArchive(area: StorageArea) {
    if (active.length <= 1) return
    const used = inventory.some((item) => item.storageAreaId === area.id)
    const target = used ? replacement : active.find((candidate) => candidate.id !== area.id)?.id || ''
    if (used && !target) return
    setWorking(true); try { await onArchive(area.id, target); setArchiving(null); setReplacement('') } finally { setWorking(false) }
  }
  const countFor = (area: StorageArea) => inventory.filter((item) => currentStorageAreaId(item.storageAreaId || item.location.toLowerCase()) === area.id).length
  const conditionLabel = (area: StorageArea) => area.condition === 'chilled' ? 'Chilled' : area.condition === 'frozen' ? 'Frozen' : 'Room temperature'
  return <article className="settings-card storage-area-card panel" hidden={hidden}>
    <div className="settings-card-head"><span><House /></span><div><h2>Kitchen locations</h2><p>Four simple places cover most kitchens. Mise chooses one automatically when it recognizes a food.</p></div></div>
    {!manageOpen && <div className="storage-area-summary">{active.map((area) => <div key={area.id}><strong>{area.name}</strong><small>{conditionLabel(area)}</small><span>{countFor(area)} item{countFor(area) === 1 ? '' : 's'}</span></div>)}</div>}
    <button type="button" className="storage-manage-toggle" onClick={() => setManageOpen((open) => !open)}><Pencil /> {manageOpen ? 'Done managing' : 'Manage locations'}</button>
    {manageOpen && <div className="storage-area-management">
      <div className="storage-area-list">{active.map((area, index) => { const inUse = countFor(area); return <div className="storage-area-row" key={area.id}><StorageAreaNameInput area={area} onCommit={(name) => patchArea(area.id, { name })} /><select aria-label={`Condition for ${area.name}`} value={area.condition} onChange={(event) => patchArea(area.id, { condition: event.target.value as StorageCondition })}><option value="ambient">Room temperature</option><option value="chilled">Chilled</option><option value="frozen">Frozen</option></select><span>{inUse} item{inUse === 1 ? '' : 's'}</span><div><button type="button" disabled={index === 0 || working} onClick={() => move(area.id, -1)} aria-label={`Move ${area.name} up`}><ArrowUp /></button><button type="button" disabled={index === active.length - 1 || working} onClick={() => move(area.id, 1)} aria-label={`Move ${area.name} down`}><ArrowDown /></button><button type="button" disabled={active.length <= 1 || working} onClick={() => setArchiving(area.id)} aria-label={`Archive ${area.name}`}><Trash2 /></button></div>{archiving === area.id && <div className="storage-archive-confirm">{inUse > 0 && <label>Move {inUse} item{inUse === 1 ? '' : 's'} to<select value={replacement} onChange={(event) => setReplacement(event.target.value)}><option value="">Choose a location</option>{active.filter((candidate) => candidate.id !== area.id).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select></label>}<p>Archive {area.name}? You can restore it later.</p><button type="button" onClick={() => setArchiving(null)}>Cancel</button><button type="button" disabled={inUse > 0 && !replacement} onClick={() => void confirmArchive(area)}>Archive</button></div>}</div>})}</div>
      <div className="storage-area-add"><label>New location<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Garage freezer" /></label><label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value as StorageCondition)}><option value="ambient">Room temperature</option><option value="chilled">Chilled</option><option value="frozen">Frozen</option></select></label><button type="button" className="secondary-button" disabled={!name.trim() || working} onClick={() => void addArea()}><Plus /> Add location</button></div>
      {ordered.some((area) => area.archivedAt && area.id !== 'counter') && <div className="archived-storage-areas"><strong>Archived</strong>{ordered.filter((area) => area.archivedAt && area.id !== 'counter').map((area) => <button type="button" key={area.id} onClick={() => patchArea(area.id, { archivedAt: null })}>{area.name} <span>Restore</span></button>)}</div>}
    </div>}
  </article>
}

function SmartAdd({ inventory, storageAreas, onClose, onScanBarcode, onAdd }: { inventory: InventoryItem[]; storageAreas: StorageArea[]; onClose: () => void; onScanBarcode: () => void; onAdd: (items: SmartReviewItem[]) => void }) {
  const [entry, setEntry] = useState('2 lb chicken breast, a bag of spinach, 6 eggs')
  const [items, setItems] = useState<SmartReviewItem[]>([])
  const [ignoredReceiptLines, setIgnoredReceiptLines] = useState<string[]>([])
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
    setIgnoredReceiptLines([])
    review(entry)
  }

  async function scanReceipt(file?: File) {
    if (!file) return
    scanController.current?.abort()
    const controller = new AbortController()
    scanController.current = controller
    setItems([])
    setIgnoredReceiptLines([])
    setScan({ phase: 'scanning', progress: 0, message: `Preparing ${file.name || 'receipt photo'}…` })
    try {
      const result = await scanReceiptImage(file, ({ progress, status }) => {
        const percent = Math.max(1, Math.round(progress * 100))
        const label = status.includes('recognizing') ? 'Reading receipt text' : 'Preparing receipt scanner'
        setScan({ phase: 'scanning', progress: percent, message: `${label}…` })
      }, controller.signal)
      const combinedText = [result.text, result.reviewText].filter(Boolean).join('\n')
      setEntry(combinedText)
      review(combinedText)
      setIgnoredReceiptLines(result.ignoredLines)
      const reviewCount = result.reviewText ? result.reviewText.split('\n').filter(Boolean).length : 0
      setScan({ phase: 'ready', progress: 100, message: `Receipt processed. ${reviewCount ? `${reviewCount} uncertain line${reviewCount === 1 ? '' : 's'} need review. ` : ''}${result.ignoredLines.length} receipt line${result.ignoredLines.length === 1 ? '' : 's'} ignored.` })
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
  const readyItems = items.filter((item) => item.confidence !== 'low')
  const reviewItems = items.filter((item) => item.confidence === 'low')

  function restoreIgnoredLine(line: string) {
    const restored = parseSmartEntry(line).map((item) => ({
      ...withExpirationDate(item),
      confidence: 'low' as const,
      explanation: 'Restored from ignored receipt text · check every detail',
      merge: inventory.some((existing) => sameFoodAndUnit(existing, item)),
    }))
    setItems((current) => [...current, ...restored])
    setIgnoredReceiptLines((current) => current.filter((entryLine) => entryLine !== line))
  }

  function renderReviewItem(item: SmartReviewItem) {
    const duplicate = inventory.find((existing) => sameFoodAndUnit(existing, item))
    return <article className="smart-review-card" key={item.id}>
      <div className="smart-review-main"><button type="button" className="smart-emoji" onClick={() => { const current = foodIcons.indexOf(item.emoji); updateItem(item.id, { emoji: foodIcons[(current + 1 + foodIcons.length) % foodIcons.length] }) }} title="Change icon" aria-label={`Change icon for ${item.name}`}>{item.emoji}</button><label>Name<input aria-label={`Name for ${item.name}`} value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} /></label><button type="button" className="icon-button delete" onClick={() => setItems((current) => current.filter((entryItem) => entryItem.id !== item.id))} aria-label={`Remove ${item.name}`}><X /></button></div>
      <div className="smart-review-fields presence-fields"><label>Food type<select aria-label={`Food type for ${item.name}`} value={item.foodGroup || 'Other'} onChange={(event) => { const foodGroup = event.target.value as FoodGroup; updateItem(item.id, { foodGroup, category: legacyCategoryForFoodGroup(foodGroup) }) }}>{foodGroups.map((group) => <option key={group}>{group}</option>)}</select></label><label>Stored in<select aria-label={`Storage for ${item.name}`} value={item.storageAreaId || 'pantry'} onChange={(event) => { const area = storageAreaForId(storageAreas, event.target.value); const location = legacyLocationForCondition(area.condition); updateItem(item.id, { storageAreaId: area.id, location, expirationWarning: item.freshnessPolicy === 'none' ? null : expirationWarning(item.expiresOn, getFoodIntelligence(item.name)?.profile, location) }) }}>{activeStorageAreas(storageAreas).map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label><label>Freshness<select value={item.freshnessPolicy || 'none'} onChange={(event) => { const freshnessPolicy = event.target.value as FreshnessPolicy; updateItem(item.id, { freshnessPolicy, expiresOn: freshnessPolicy === 'none' ? null : item.expiresOn, expiresIn: freshnessPolicy === 'none' ? null : item.expiresIn }) }}><option value="tracked">Track date</option><option value="none">No date needed</option></select></label>{item.freshnessPolicy !== 'none' && <label>Use by (optional)<input aria-label={`Use-by date for ${item.name}`} type="date" value={item.expiresOn || ''} onChange={(event) => { const nextDate = event.target.value || null; updateItem(item.id, { expiresOn: nextDate, expiresIn: daysUntilDate(nextDate), expirationWarning: expirationWarning(nextDate, getFoodIntelligence(item.name)?.profile, item.location) }) }} /></label>}</div><div className={`smart-confidence ${item.confidence}`}><Sparkles size={12} /> {item.explanation}</div>
      {item.expirationWarning && <div className="expiration-warning"><TriangleAlert size={13} /> {item.expirationWarning}</div>}
      {duplicate && <label className="duplicate-choice"><input type="checkbox" checked={item.merge} onChange={(event) => updateItem(item.id, { merge: event.target.checked })} /><span><strong>Already in your kitchen</strong>{item.merge ? 'Refresh its details and keep one ingredient' : 'Keep this as a separate item'}</span></label>}
    </article>
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal smart-modal" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow"><Sparkles size={12} /> Smart Entry 2.0</span><h2>Tell Mise what you bought</h2></div><button type="button" onClick={onClose} aria-label="Close smart add"><X /></button></div>
    <p className="modal-intro">Scan a receipt, type naturally, or paste a list. Mise turns it into editable ingredient suggestions before anything is saved.</p>
    <button type="button" className="barcode-launch" onClick={onScanBarcode}><span><Camera /></span><div><strong>Scan a product barcode</strong><small>Use UPC, EAN, or GTIN to identify a packaged grocery.</small></div><ArrowRight /></button>
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
    {items.length > 0 && <div className="smart-results"><div className="smart-results-head"><strong>{items.length} ingredient{items.length === 1 ? '' : 's'} found</strong><span>{reviewCount ? `${reviewCount} need${reviewCount === 1 ? 's' : ''} a quick check` : 'All details recognized'}</span></div>{readyItems.length > 0 && <section className="receipt-review-group"><div><strong>Ready to add</strong><span>{readyItems.length} recognized</span></div><div className="smart-review-list">{readyItems.map(renderReviewItem)}</div></section>}{reviewItems.length > 0 && <section className="receipt-review-group needs-review"><div><strong>Needs review</strong><span>Confirm the product name and details</span></div><div className="smart-review-list">{reviewItems.map(renderReviewItem)}</div></section>}<button className="submit-button" type="button" disabled={!items.some((item) => item.name.trim() && item.quantity > 0)} onClick={() => onAdd(items)}>Save {items.length} ingredient{items.length === 1 ? '' : 's'} <ArrowRight /></button></div>}
    {ignoredReceiptLines.length > 0 && <details className="receipt-ignored"><summary><span>Ignored receipt text</span><small>{ignoredReceiptLines.length} payment, discount, non-food, or unreadable line{ignoredReceiptLines.length === 1 ? '' : 's'}</small></summary><div>{ignoredReceiptLines.map((line) => <article key={line}><span>{line}</span><button type="button" onClick={() => restoreIgnoredLine(line)}>Restore</button></article>)}</div></details>}
  </section></div>
}

function BarcodeScanner({ inventory, storageAreas, rememberedProducts, householdId, accessToken, isOnline, onClose, onAdd }: { inventory: InventoryItem[]; storageAreas: StorageArea[]; rememberedProducts: HouseholdProduct[]; householdId: string | null; accessToken: string; isOnline: boolean; onClose: () => void; onAdd: (items: InventoryItem[]) => void }) {
  const [phase, setPhase] = useState<'start' | 'camera' | 'lookup' | 'review'>('start')
  const [barcode, setBarcode] = useState('')
  const [message, setMessage] = useState('')
  const [product, setProduct] = useState<BarcodeProduct | null>(null)
  const [draft, setDraft] = useState<InventoryItem | null>(null)
  const [queue, setQueue] = useState<InventoryItem[]>([])
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const scannerControls = useRef<{ stop: () => void; switchTorch?: (on: boolean) => Promise<void> } | null>(null)

  function stopCamera() {
    scannerControls.current?.stop()
    scannerControls.current = null
    setTorchAvailable(false)
    setTorchOn(false)
  }

  useEffect(() => () => stopCamera(), [])

  async function identify(rawBarcode: string) {
    const code = normalizeBarcode(rawBarcode)
    setBarcode(code)
    if (!isValidBarcode(code)) { setMessage('Scan or enter a valid UPC, EAN, or GTIN barcode.'); setPhase('start'); return }
    stopCamera()
    setMessage('Checking your kitchen…')
    setPhase('lookup')
    const manualReview = (copy: string) => {
      const manual: BarcodeProduct = { barcode: code, name: 'Packaged product', productSource: 'household' }
      setProduct(manual)
      setDraft(inventoryItemFromBarcodeProduct(manual, `barcode-${code}-${Date.now()}`))
      setMessage(copy)
      setPhase('review')
    }
    try {
      const current = rememberedInventoryProduct(inventory, code)
      const cached = rememberedHouseholdProduct(rememberedProducts, code)
      const remembered = current || cached || (isOnline && householdId ? await loadRememberedProduct(householdId, code) : null)
      if (remembered) {
        const recalled = inventoryItemFromHouseholdProduct({ ...remembered, barcode: code }, `barcode-${code}-${Date.now()}`)
        setProduct({
          barcode: code, name: recalled.name, brand: recalled.brand, productImageUrl: recalled.productImageUrl,
          packageAmount: recalled.packageAmount, packageUnit: recalled.packageUnit, productSource: 'household',
        })
        setDraft(recalled)
        setMessage(current ? 'Already in your kitchen. Your saved details are ready to merge.' : 'Recognized from your kitchen. Your saved corrections were applied.')
        setPhase('review')
        return
      }
      if (!isOnline) {
        manualReview('You are offline and this barcode is new to your kitchen. Enter the package details now; Mise will remember them when you reconnect.')
        return
      }
      setMessage('Looking up this product…')
      const found = await lookupBarcodeProduct(code, accessToken)
      setProduct(found)
      setDraft(inventoryItemFromBarcodeProduct(found, `barcode-${code}-${Date.now()}`))
      setMessage('Product found. Check the details before adding it.')
      setPhase('review')
    } catch (error) {
      if (error instanceof ProductNotFoundError) {
        manualReview('This barcode is not in Open Food Facts yet. Add the product details once and Mise will keep the barcode with it.')
        return
      }
      manualReview(`${errorMessage(error, 'Product lookup is unavailable.')} Enter the package details manually; you can still add it to this scan list.`)
    }
  }

  async function startCamera() {
    setMessage('Starting the rear camera…')
    setPhase('camera')
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 800 })
      const controls = await reader.decodeFromConstraints({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      }, video.current || undefined, (result) => {
        if (!result) return
        controls.stop()
        void identify(result.getText())
      })
      scannerControls.current = controls
      setTorchAvailable(typeof controls.switchTorch === 'function')
      setMessage('Center the barcode inside the frame.')
    } catch (error) {
      stopCamera()
      setPhase('start')
      const denied = error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)
      const missing = error instanceof DOMException && ['NotFoundError', 'DevicesNotFoundError'].includes(error.name)
      setMessage(denied
        ? 'Camera permission is off. On iPhone, open Settings › Safari › Camera, choose Allow, then try again. You can also enter the barcode below.'
        : missing ? 'No camera was found on this device. Enter the barcode numbers below.'
          : 'The camera could not start. Check that no other app is using it, then try again or enter the barcode below.')
    }
  }

  function updateDraft(updates: Partial<InventoryItem>) {
    setDraft((current) => current ? { ...current, ...updates } : current)
  }

  function resetProduct(nextMessage = '') {
    setProduct(null)
    setDraft(null)
    setBarcode('')
    setPhase('start')
    setMessage(nextMessage)
  }

  function queuedWithDraft() {
    if (!draft?.name.trim()) return queue
    return addBarcodeBatchItem(queue, { ...draft, quantity: 1, unit: 'item', expiresIn: daysUntilDate(draft.expiresOn) })
  }

  function addAndContinue() {
    const next = queuedWithDraft()
    setQueue(next)
    resetProduct(`${barcodeBatchLabel(next.length)} ready to save. Scan the next package.`)
  }

  function addAndScanNext() {
    const next = queuedWithDraft()
    setQueue(next)
    resetProduct(`${barcodeBatchLabel(next.length)} ready to save.`)
    window.setTimeout(() => void startCamera(), 0)
  }

  function saveBatch(items = queue) {
    if (items.length) onAdd(items)
  }

  async function toggleTorch() {
    if (!scannerControls.current?.switchTorch) return
    const next = !torchOn
    try { await scannerControls.current.switchTorch(next); setTorchOn(next) } catch { setTorchAvailable(false) }
  }

  const duplicate = draft ? inventory.find((item) => sameFoodAndUnit(item, draft)) : null
  const queuedDuplicate = draft ? rememberedInventoryProduct(queue, draft.barcode || '') : null
  const dateWarning = draft?.freshnessPolicy !== 'none' && draft ? expirationWarning(draft.expiresOn, getFoodIntelligence(draft.name)?.profile, draft.location) : null

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal barcode-modal" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow"><Camera size={12} /> Smart Entry</span><h2>{queue.length ? `Scan list · ${queue.length}` : 'Scan products'}</h2></div><button type="button" onClick={() => { stopCamera(); onClose() }} aria-label="Close barcode scanner"><X /></button></div>
    {phase !== 'review' && <>
      <p className="modal-intro">Scan packaged groceries one after another. Review each product, then save the whole list to your kitchen together.</p>
      {phase === 'camera' ? <div className="barcode-camera"><video ref={video} autoPlay muted playsInline /><div className="barcode-frame"><span /></div>{torchAvailable && <button type="button" onClick={() => void toggleTorch()}><Flashlight /> {torchOn ? 'Light off' : 'Light on'}</button>}</div>
        : <button type="button" className="start-camera-button" disabled={phase === 'lookup'} onClick={() => void startCamera()}><Camera /> Use rear camera</button>}
      <div className="barcode-status" role="status" aria-live="polite">{phase === 'lookup' && <i />}{message || 'Works with UPC-A, UPC-E, EAN-8, EAN-13, and GTIN labels.'}</div>
      <div className="smart-divider"><span>or enter the numbers</span></div>
      <form className="barcode-manual" onSubmit={(event) => { event.preventDefault(); void identify(barcode) }}><label>Barcode<input inputMode="numeric" autoComplete="off" value={barcode} onChange={(event) => setBarcode(normalizeBarcode(event.target.value).slice(0, 14))} placeholder="e.g. 3017624010701" /></label><button type="submit" disabled={phase === 'lookup' || !barcode}>Find product <ArrowRight /></button></form>
    </>}
    {phase === 'review' && draft && product && <form className="barcode-review" onSubmit={(event) => { event.preventDefault(); saveBatch(queuedWithDraft()) }}>
      <div className="product-preview">{draft.productImageUrl ? <img src={draft.productImageUrl} alt="" /> : <span>{draft.emoji}</span>}<div><small>{draft.brand || (draft.productSource === 'household' ? 'Household product' : 'Open Food Facts')}</small><strong>{product.name}</strong><em>{barcode}</em></div><button type="button" onClick={() => resetProduct()}>Scan a different code</button></div>
      <div className="barcode-status ready">{message}</div>
      <label>Ingredient name<input autoFocus required value={draft.name} onChange={(event) => { const name = event.target.value; const intelligence = getFoodIntelligence(name); updateDraft({ name, ...(intelligence ? { emoji: intelligence.profile.emoji, category: intelligence.profile.category, location: intelligence.profile.location, foodGroup: intelligence.profile.foodGroup, storageAreaId: intelligence.profile.storageAreaId, freshnessPolicy: intelligence.profile.freshnessPolicy, expiresOn: intelligence.profile.freshnessPolicy === 'none' ? null : draft.expiresOn } : {}) }) }} /></label>
      <div className="form-row"><label>Food type<select value={draft.foodGroup || 'Other'} onChange={(event) => { const foodGroup = event.target.value as FoodGroup; updateDraft({ foodGroup, category: legacyCategoryForFoodGroup(foodGroup) }) }}>{foodGroups.map((group) => <option key={group}>{group}</option>)}</select></label><label>Stored in<select value={draft.storageAreaId || 'pantry'} onChange={(event) => { const area = storageAreaForId(storageAreas, event.target.value); updateDraft({ storageAreaId: area.id, location: legacyLocationForCondition(area.condition) }) }}>{activeStorageAreas(storageAreas).map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label></div>
      <label>Freshness<select value={draft.freshnessPolicy || 'none'} onChange={(event) => { const freshnessPolicy = event.target.value as FreshnessPolicy; updateDraft({ freshnessPolicy, expiresOn: freshnessPolicy === 'none' ? null : draft.expiresOn, expiresIn: freshnessPolicy === 'none' ? null : draft.expiresIn }) }}><option value="tracked">Track a use-by date</option><option value="none">No date needed</option></select></label>
      {draft.freshnessPolicy !== 'none' && <label>Use-by date (optional)<input type="date" value={draft.expiresOn || ''} onChange={(event) => updateDraft({ expiresOn: event.target.value || null })} /></label>}
      {draft.packageAmount && draft.packageUnit && <p className="package-note">Package details are remembered for future scans, but Mise only tracks that this ingredient is available.</p>}
      {dateWarning && <div className="expiration-warning"><TriangleAlert /> {dateWarning}</div>}
      {duplicate && <div className="duplicate-product"><Copy /><span><strong>Already in your kitchen</strong>This will refresh the saved details for {duplicate.name}.</span></div>}
      {queuedDuplicate && <div className="duplicate-product"><Copy /><span><strong>Already in your scan list</strong>This package will be combined with {queuedDuplicate.name}.</span></div>}
      <p className="product-data-note"><TriangleAlert /> Product information can be incomplete. Always verify the package label for allergens and use-by dates.</p>
      <div className="barcode-review-actions"><button type="button" className="secondary-button" disabled={!draft.name.trim()} onClick={addAndContinue}><Plus /> Add to scan list</button><button type="button" className="secondary-button" disabled={!draft.name.trim()} onClick={addAndScanNext}><Camera /> Add & scan next</button></div>
      <button className="submit-button" disabled={!draft.name.trim()}>Save {barcodeBatchLabel(queuedWithDraft().length)} to my kitchen <ArrowRight /></button>
    </form>}
    {queue.length > 0 && <section className="barcode-queue" aria-label="Scanned products"><div className="barcode-queue-head"><div><strong>{barcodeBatchLabel(queue.length)} ready</strong><small>Repeated products are combined automatically.</small></div>{phase !== 'review' && <button type="button" onClick={() => saveBatch()}>Save all <ArrowRight /></button>}</div><div>{queue.map((item) => <article key={item.id}><span>{item.productImageUrl ? <img src={item.productImageUrl} alt="" /> : item.emoji}</span><p><strong>{item.name}</strong><small>Available{item.brand ? ` · ${item.brand}` : ''}</small></p><button type="button" onClick={() => setQueue((current) => removeBarcodeBatchItem(current, item.id))} aria-label={`Remove ${item.name} from scan list`}><Trash2 /></button></article>)}</div></section>}
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

function GroceryAddReview({ request, existing, mappings, onClose, onConfirm }: { request: GroceryReviewRequest; existing: GroceryItem[]; mappings: HouseholdFoodMapping[]; onClose: () => void; onConfirm: (items: GroceryItem[]) => void }) {
  const [items, setItems] = useState(() => request.items.map((item) => {
    const mapping = mappings.find((candidate) => candidate.normalizedName === normalize(item.name))
    return mapping ? { ...item, name: mapping.displayName, emoji: mapping.emoji } : { ...item }
  }))
  const sourceCopy: Record<GroceryAddSource, string> = {
    recipe: 'a recipe', recommendation: 'a Mise recommendation', 'meal plan': 'your weekly meal plan', Discover: 'a discovered recipe', staples: 'your staples', 'bulk add': 'your pasted list', restock: 'a restock check',
  }
  function update(index: number, updates: Partial<GroceryItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item))
  }
  const statuses = groceryReviewStatuses(existing, items)
  const mergeCount = statuses.filter((status) => status !== 'new').length
  const allValid = items.length > 0 && items.every(isValidGroceryReviewItem)
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!allValid) return
    onConfirm(cleanGroceryReviewItems(items))
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal grocery-add-review" role="dialog" aria-modal="true" aria-labelledby="grocery-review-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Review before adding</span><h2 id="grocery-review-title">Review grocery items</h2><p>From {sourceCopy[request.source]}. Check each shopping quantity before anything changes.</p></div><button type="button" onClick={onClose} aria-label="Close grocery review"><X /></button></div><div className="grocery-review-summary"><span><strong>{items.length}</strong> item{items.length === 1 ? '' : 's'} to add</span><span><strong>{mergeCount}</strong> will merge</span></div><div className="grocery-review-list">{items.map((item, index) => { const status = statuses[index]; const valid = isValidGroceryReviewItem(item); return <article className={valid ? '' : 'has-error'} key={`${index}-${item.id || 'draft'}`}><div className="grocery-review-identity"><span className="grocery-review-icon">{groceryEmoji(item)}</span><small>{groceryCategory(item)}</small></div><label>Item name<input value={item.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="e.g. Milk" aria-invalid={!item.name.trim()} /></label><label>Quantity<NumberField min="0.01" step="0.01" value={item.amount} onValueChange={(amount) => update(index, { amount })} onEmpty={() => update(index, { amount: 0 })} aria-label={`Quantity for ${item.name || `item ${index + 1}`}`} /></label><label>Unit<UnitPicker value={item.unit} onChange={(unit) => update(index, { unit })} ariaLabel={`Unit for ${item.name || `item ${index + 1}`}`} required /></label><button type="button" className="icon-button delete" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${item.name || `item ${index + 1}`}`}><Trash2 /></button>{status === 'merge-existing' && <small className="grocery-review-notice"><RefreshCw /> Already on your list — Mise will keep the larger compatible quantity.</small>}{status === 'merge-draft' && <small className="grocery-review-notice"><RefreshCw /> Matches another item in this review — they will combine.</small>}{!valid && <small className="grocery-review-error"><TriangleAlert /> Add a name, positive quantity, and unit to continue.</small>}</article>})}</div>{!items.length && <div className="grocery-review-empty"><strong>No items in this review</strong><span>Add a row or cancel without changing your grocery list.</span></div>}<button type="button" className="secondary-button grocery-review-add" onClick={() => setItems((current) => [...current, { name: '', amount: 1, unit: 'item', checked: false }])}><Plus /> Add another item</button><div className="grocery-review-footer"><span>{allValid ? `${items.length} item${items.length === 1 ? '' : 's'} ready${mergeCount ? ` · ${mergeCount} merging` : ''}` : 'Complete every row to continue'}</span><div><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="submit-button" disabled={!allValid}><ShoppingBasket /> Add {items.length || ''} item{items.length === 1 ? '' : 's'}</button></div></div></form></div>
}

function CookingCompletion({ recipe, scale, inventory, onClose, onComplete }: { recipe: RecipeMatch; scale: number; inventory: InventoryItem[]; onClose: () => void; onComplete: (items: GroceryItem[]) => void }) {
  const available = recipe.ingredients.filter((ingredient) => hasIngredient(inventory, ingredient))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<GroceryItem[]>(() => available.map((ingredient) => ({ ...ingredient, amount: Number((ingredient.amount * scale).toFixed(2)), checked: false })))
  function toggle(name: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(normalize(name))) next.delete(normalize(name)); else next.add(normalize(name)); return next })
  }
  function update(index: number, updates: Partial<GroceryItem>) { setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item)) }
  const restock = drafts.filter((item) => selected.has(normalize(item.name)))
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal cooking-completion" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow"><CookingPot /> Finish cooking</span><h2>What ran out?</h2><p>Select only ingredients that are gone or need restocking. Everything else stays in your kitchen.</p></div><button onClick={onClose} aria-label="Close cooking update"><X /></button></div><div className="cooking-restock-list">{drafts.map((item, index) => { const checked = selected.has(normalize(item.name)); return <article className={checked ? 'selected' : ''} key={`${item.name}-${index}`}><button className="restock-check" onClick={() => toggle(item.name)} aria-pressed={checked}>{checked ? <Check /> : <Plus />}</button><span>{groceryEmoji(item)}</span><p><strong>{item.name}</strong><small>{checked ? 'Remove from kitchen and add to groceries' : 'Still available at home'}</small></p>{checked && <><NumberField aria-label={`Restock amount for ${item.name}`} min="0.01" step="0.01" value={item.amount} onValueChange={(amount) => update(index, { amount })} /><UnitPicker value={item.unit} onChange={(unit) => update(index, { unit })} ariaLabel={`Restock unit for ${item.name}`} required /></>}</article>})}</div><button className="submit-button" onClick={() => onComplete(restock)}><Check /> Finish cooking{restock.length ? ` & restock ${restock.length}` : ''}</button></section></div>
}

function AddFood({ storageAreas, onCreateStorageArea, onClose, onAdd, initialItem }: { storageAreas: StorageArea[]; onCreateStorageArea: (name: string, condition: StorageCondition) => Promise<StorageArea>; onClose: () => void; onAdd: (item: InventoryItem) => void; initialItem?: InventoryItem }) {
  const [name, setName] = useState(initialItem?.name || '')
  const [emoji, setEmoji] = useState(initialItem?.emoji || defaultIngredientIcon)
  const initialIntelligence = initialItem ? getFoodIntelligence(initialItem.name) : null
  const [foodGroup, setFoodGroup] = useState<FoodGroup>(initialItem?.foodGroup || initialIntelligence?.profile.foodGroup || 'Other')
  const [storageAreaId, setStorageAreaId] = useState(initialItem?.storageAreaId || initialIntelligence?.profile.storageAreaId || 'pantry')
  const [freshnessPolicy, setFreshnessPolicy] = useState<FreshnessPolicy>(initialItem?.freshnessPolicy || initialIntelligence?.profile.freshnessPolicy || 'none')
  const [expiresOn, setExpiresOn] = useState(initialItem ? (initialItem.expiresOn || expirationDateFromDays(initialItem.expiresIn) || '') : '')
  const [freshnessState, setFreshnessState] = useState<FreshnessState>('purchased')
  const [detailsOpen, setDetailsOpen] = useState(Boolean(initialItem))
  const [detailsTouched, setDetailsTouched] = useState(Boolean(initialItem))
  const [newLocationOpen, setNewLocationOpen] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [newLocationCondition, setNewLocationCondition] = useState<StorageCondition>('ambient')
  const [creatingLocation, setCreatingLocation] = useState(false)
  const intelligence = useMemo(() => getFoodIntelligence(name), [name])
  const activeAreas = activeStorageAreas(storageAreas)
  const selectedArea = storageAreaForId(storageAreas, storageAreaId)
  const hasName = Boolean(name.trim())
  const summaryTitle = intelligence?.profile.name || (hasName ? name.trim() : 'Ingredient details')
  const summaryDescription = hasName
    ? `${foodGroup} · ${selectedArea.name} · ${freshnessLabel(freshnessPolicy)}`
    : 'Enter a food name and Mise will suggest the details.'
  const legacyLocation = legacyLocationForCondition(selectedArea.condition)
  const dateWarning = useMemo(() => freshnessPolicy === 'tracked' ? expirationWarning(expiresOn, intelligence?.profile, legacyLocation) : null, [expiresOn, freshnessPolicy, intelligence, legacyLocation])
  const suggestedDate = intelligence?.profile.freshnessPolicy === 'tracked' ? suggestedExpirationDate(intelligence.profile, legacyLocation, freshnessState) : null
  useEffect(() => {
    if (initialItem || detailsTouched || !intelligence) return
    const profile = intelligence.profile
    const preferred = storageAreas.find((area) => !area.archivedAt && area.id === profile.storageAreaId) || activeStorageAreas(storageAreas).find((area) => area.condition === (profile.location === 'Fridge' ? 'chilled' : profile.location === 'Freezer' ? 'frozen' : 'ambient'))
    // Keep the name-first flow instant: recognized foods populate their editable draft metadata.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmoji(profile.emoji)
    setFoodGroup(profile.foodGroup)
    if (preferred) setStorageAreaId(preferred.id)
    setFreshnessPolicy(profile.freshnessPolicy)
    setExpiresOn(profile.freshnessPolicy === 'tracked' ? suggestedExpirationDate(profile, legacyLocationForCondition(preferred?.condition || 'ambient'), freshnessState) || '' : '')
  }, [detailsTouched, freshnessState, initialItem, intelligence, storageAreas])
  function updateName(value: string) {
    setName(value)
    if (initialItem || detailsTouched || getFoodIntelligence(value)) return
    setEmoji(defaultIngredientIcon)
    setFoodGroup('Other')
    setStorageAreaId('pantry')
    setFreshnessPolicy('none')
    setExpiresOn('')
  }
  async function createLocation() {
    if (!newLocationName.trim()) return
    setCreatingLocation(true)
    try {
      const area = await onCreateStorageArea(newLocationName, newLocationCondition)
      setStorageAreaId(area.id)
      setNewLocationOpen(false)
      setNewLocationName('')
    } finally { setCreatingLocation(false) }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (!name.trim()) return
    const area = storageAreaForId(storageAreas, storageAreaId)
    const finalExpiry = freshnessPolicy === 'tracked' ? expiresOn || null : null
    onAdd({ ...initialItem, id: initialItem?.id || `${normalize(name).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`, name: name.trim(), emoji, quantity: 1, unit: 'item', foodGroup, storageAreaId: area.id, freshnessPolicy, category: legacyCategoryForFoodGroup(foodGroup), location: legacyLocationForCondition(area.condition), expiresIn: daysUntilDate(finalExpiry), expiresOn: finalExpiry })
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal add-food-modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{initialItem ? 'Update your kitchen' : 'Stock your kitchen'}</span><h2>{initialItem ? 'Edit ingredient' : 'Add an ingredient'}</h2><p>No measuring required — Mise only tracks whether it is at home.</p></div><button type="button" onClick={onClose} aria-label="Close ingredient form"><X /></button></div><label>Food name<input autoFocus value={name} onChange={(e) => updateName(e.target.value)} placeholder="e.g. Avocados" /></label><div className={`ingredient-detail-summary${hasName ? '' : ' is-empty'}`}><span>{hasName ? emoji : <PackageOpen aria-hidden="true" />}</span><p><strong>{summaryTitle}</strong><small>{summaryDescription}</small></p><button type="button" onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? 'Hide details' : 'Change details'}</button></div>{detailsOpen && <div className="ingredient-details"><fieldset className="icon-picker ingredient-icon-picker"><legend>Icon</legend><div>{foodIcons.map((icon) => <button key={icon} type="button" className={emoji === icon ? 'selected' : ''} onClick={() => { setDetailsTouched(true); setEmoji(icon) }} aria-label={`Use ${icon} icon`} aria-pressed={emoji === icon}>{icon}</button>)}</div></fieldset><div className="form-row"><label>Food type<select value={foodGroup} onChange={(e) => { setDetailsTouched(true); setFoodGroup(e.target.value as FoodGroup) }}>{foodGroups.map((item) => <option key={item}>{item}</option>)}</select></label><label>Stored in<select value={storageAreaId} onChange={(e) => { if (e.target.value === '__new__') { setNewLocationOpen(true); return } setDetailsTouched(true); const id = e.target.value; setStorageAreaId(id); const area = storageAreaForId(storageAreas, id); if (!initialItem && intelligence && freshnessPolicy === 'tracked') setExpiresOn(suggestedExpirationDate(intelligence.profile, legacyLocationForCondition(area.condition), freshnessState) || '') }}><option value="" disabled>Choose a location</option>{activeAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}<option value="__new__">+ Add a location</option></select></label></div>{newLocationOpen && <div className="new-location-inline"><label>Location name<input value={newLocationName} onChange={(event) => setNewLocationName(event.target.value)} placeholder="e.g. Garage freezer" /></label><label>Condition<select value={newLocationCondition} onChange={(event) => setNewLocationCondition(event.target.value as StorageCondition)}><option value="ambient">Room temperature</option><option value="chilled">Chilled</option><option value="frozen">Frozen</option></select></label><button type="button" className="secondary-button" disabled={!newLocationName.trim() || creatingLocation} onClick={() => void createLocation()}>{creatingLocation ? 'Adding…' : 'Add location'}</button></div>}<div className="form-row"><label>Freshness<select value={freshnessPolicy} onChange={(event) => { setDetailsTouched(true); const policy = event.target.value as FreshnessPolicy; setFreshnessPolicy(policy); if (policy === 'none') setExpiresOn(''); else if (!initialItem && intelligence) setExpiresOn(suggestedDate || '') }}><option value="tracked">Track a use-by date</option><option value="none">No date needed</option></select></label>{freshnessPolicy === 'tracked' && !initialItem && intelligence && <label>Freshness status<select value={freshnessState} onChange={(e) => { setDetailsTouched(true); const nextState = e.target.value as FreshnessState; setFreshnessState(nextState); setExpiresOn(suggestedExpirationDate(intelligence.profile, legacyLocation, nextState) || '') }}><option value="purchased">Purchased today</option><option value="opened">Opened today</option></select></label>}</div>{freshnessPolicy === 'tracked' && <label>Use-by date (optional)<input type="date" value={expiresOn} onChange={(e) => { setDetailsTouched(true); setExpiresOn(e.target.value) }} />{initialItem && suggestedDate && suggestedDate !== expiresOn && <button type="button" className="inline-suggestion" onClick={() => setExpiresOn(suggestedDate)}>Use Mise suggestion: {new Date(`${suggestedDate}T12:00:00`).toLocaleDateString()}</button>}</label>}{dateWarning && <div className="expiration-warning"><TriangleAlert size={13} /> {dateWarning}</div>}</div>}<button className="submit-button" type="submit">{initialItem ? 'Save changes' : 'Add to kitchen'} <ArrowRight /></button></form></div>
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
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal recipe-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">My recipes</span><h2>{initialRecipe ? 'Edit your recipe' : 'Add your own recipe'}</h2></div><button type="button" onClick={onClose} aria-label="Close recipe form"><X /></button></div><p className="modal-intro">Mise will compare these ingredients with your kitchen and automatically show what is ready or missing.</p><label>Recipe name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sunday vegetable soup" /></label><fieldset className="icon-picker recipe-icon-picker"><legend>Choose a recipe icon</legend><div>{selectableIcons.map(({ icon, label }) => <button key={icon} type="button" className={emoji === icon ? 'selected' : ''} onClick={() => setEmoji(icon)} aria-label={`Use ${label} icon`} aria-pressed={emoji === icon} title={label}><span>{icon}</span><small>{label}</small></button>)}</div></fieldset><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short note about this recipe…" /></label><div className="recipe-number-fields"><label>Time (min)<NumberField min="1" value={time} onValueChange={setTime} /></label><label>Servings<NumberField min="1" max="24" value={servings} onValueChange={setServings} /></label><label>Protein / serving (g)<NumberField min="0" step="1" value={protein} onValueChange={setProtein} /></label></div><div className="recipe-editor-heading"><div><strong>Ingredients</strong><small>Use the same units as your kitchen for accurate matching.</small></div><div className="recipe-editor-actions"><button type="button" className={quickAddOpen ? 'active' : ''} onClick={() => setQuickAddOpen((open) => !open)}><Sparkles /> Quick add</button><button type="button" onClick={() => setIngredients((current) => [...current, { name: '', amount: 1, unit: 'item' }])}><Plus /> Add row</button></div></div>{quickAddOpen && <section className="recipe-quick-add"><label>Paste or type ingredients<textarea autoFocus value={quickIngredientText} onChange={(event) => setQuickIngredientText(event.target.value)} placeholder={'2 cups rice\n1 tbsp olive oil\n3 cloves garlic'} /></label>{quickIngredients.length > 0 && <div className="recipe-quick-preview">{quickIngredients.map((ingredient, index) => <span key={`${ingredient.name}-${ingredient.unit}-${index}`}><strong>{ingredient.name}</strong><small>{ingredient.amount} {ingredient.unit}</small></span>)}</div>}<button type="button" className="secondary-button" disabled={!quickIngredients.length} onClick={addQuickIngredients}><Plus /> Add {quickIngredients.length || ''} ingredient{quickIngredients.length === 1 ? '' : 's'}</button></section>}<datalist id="kitchen-ingredient-names">{inventory.map((item) => <option key={item.id} value={item.name} />)}</datalist><div className="recipe-ingredient-editor">{ingredients.map((ingredient, index) => <div key={index}><label>Name<input list="kitchen-ingredient-names" required value={ingredient.name} onChange={(event) => { const matched = inventory.find((item) => normalize(item.name) === normalize(event.target.value)); updateIngredient(index, { name: event.target.value, ...(matched ? { unit: matched.unit } : {}) }) }} placeholder="Ingredient" /></label><label>Amount<NumberField min="0.01" step="0.01" value={ingredient.amount} onValueChange={(amount) => updateIngredient(index, { amount })} /></label><label>Unit<UnitPicker value={ingredient.unit} onChange={(unit) => updateIngredient(index, { unit })} ariaLabel={`Unit for ingredient ${index + 1}`} required /></label><button type="button" className="icon-button delete" onClick={() => setIngredients((current) => current.filter((_, ingredientIndex) => ingredientIndex !== index))} disabled={ingredients.length === 1} aria-label={`Remove ingredient ${index + 1}`}><Trash2 /></button></div>)}</div><label>Method<textarea className="recipe-method" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder={'One step per line\nPrepare the ingredients\nCook until tender\nServe and enjoy'} /></label><button className="submit-button" disabled={!valid}>{initialRecipe ? 'Save recipe changes' : 'Add to My recipes'} <ArrowRight /></button></form></div>
}

function RecipeSheet({ recipe, inventory, onClose, onAction, onEdit, onDelete }: { recipe: RecipeMatch; inventory: InventoryItem[]; onClose: () => void; onAction: (scale: number) => void; onEdit?: () => void; onDelete?: () => void }) {
  const [servings, setServings] = useState(recipe.servings)
  const scale = servings / recipe.servings
  const ingredientStatus = recipe.ingredients.map((ingredient) => {
    const needed = Number((ingredient.amount * scale).toFixed(2))
    return { ...ingredient, needed, missing: !hasIngredient(inventory, ingredient) }
  })
  const missingCount = ingredientStatus.filter((ingredient) => ingredient.missing).length
  const match = Math.round(((ingredientStatus.length - missingCount) / ingredientStatus.length) * 100)
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="recipe-sheet" onMouseDown={(e) => e.stopPropagation()}><button className="sheet-close" onClick={onClose} aria-label="Close recipe"><X /></button><div className="sheet-art" style={{ '--accent': recipe.accent } as React.CSSProperties}>{recipe.imageUrl ? <img src={recipe.imageUrl} alt="" /> : <span>{recipe.emoji}</span>}<em>{missingCount ? `${match}% match` : 'Everything available'}</em></div><div className="sheet-body"><div className="recipe-owner-actions"><span>{recipe.source === 'mise' ? 'Mise recipe' : recipe.source === 'spoonacular' ? 'Saved recipe' : 'My recipe'}</span>{recipe.source === 'user' && <button onClick={onEdit}><Pencil /> Edit</button>}<button className="delete" onClick={onDelete}><Trash2 /> Remove</button></div><span className="eyebrow">Your kitchen match</span><h2>{recipe.name}</h2><p>{recipe.description}</p><div className="sheet-recommendation"><Sparkles /><div><strong>Why Mise recommends this</strong><span>{recipe.recommendationReasons.slice(0, 3).join(' · ')}</span></div></div>{recipe.preferenceWarnings.length > 0 && <div className="preference-warning"><TriangleAlert /><div><strong>Check against your preferences</strong><span>{recipe.preferenceWarnings.join(' · ')}</span></div></div>}<div className="sheet-stats"><span><Clock3 /> {recipe.time} min</span><span><Sparkles /> {recipe.protein}g protein</span></div><div className="serving-control"><div><strong>Servings</strong><small>Ingredients update automatically</small></div><div><button onClick={() => setServings((value) => Math.max(1, value - 1))}><Minus /></button><strong>{servings}</strong><button onClick={() => setServings((value) => Math.min(12, value + 1))}><Plus /></button></div></div><h3>From your kitchen</h3><div className="ingredient-list">{ingredientStatus.map((ingredient) => <div className={ingredient.missing ? 'missing' : ''} key={`${ingredient.name}-${ingredient.unit}`}><span>{ingredient.missing ? <Plus /> : <Check />}</span><strong>{ingredient.name}</strong><small>{formatAmount(ingredient.needed)} {ingredient.unit}</small></div>)}</div>{recipe.urgent > 0 && <div className="rescue-note"><Leaf /> This meal uses {recipe.urgent} ingredient{recipe.urgent === 1 ? '' : 's'} that should be enjoyed soon.</div>}{Boolean(recipe.instructions?.length) && <div className="recipe-steps"><h3>Method</h3><ol>{recipe.instructions!.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol></div>}{recipe.sourceUrl && <a className="source-recipe-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer">View original recipe <ExternalLink /></a>}<button className="submit-button" onClick={() => onAction(scale)}>{missingCount ? `Add ${missingCount} missing item${missingCount === 1 ? '' : 's'} to grocery list` : `Cook ${servings} servings & update my kitchen`} <ArrowRight /></button></div></section></div>
}

function KitchenSyncNotice({ state, isOnline, onRetry }: { state: SyncState; isOnline: boolean; onRetry: () => void }) {
  if (state === 'saved') return null
  const content = state === 'syncing'
    ? { icon: <Cloud />, title: 'Saving household changes…', copy: 'You can keep working while Mise finishes.' }
    : state === 'conflict'
      ? { icon: <RefreshCw />, title: 'A newer kitchen is available', copy: 'Reload the household copy before making more changes.' }
      : state === 'offline' || !isOnline
        ? { icon: <WifiOff />, title: 'Working offline', copy: 'Your changes are safe on this device and will sync when you reconnect.' }
        : { icon: <TriangleAlert />, title: 'Household sync needs another try', copy: 'Your changes are safe on this device.' }
  const actionable = state === 'conflict' || (state === 'error' && isOnline)
  return <div className={`kitchen-sync-notice ${state}`} role={state === 'error' || state === 'conflict' ? 'alert' : 'status'} aria-live={state === 'error' || state === 'conflict' ? 'assertive' : 'polite'}>
    <span>{content.icon}</span><p><strong>{content.title}</strong><small>{content.copy}</small></p>{actionable && <button onClick={onRetry}>{state === 'conflict' ? 'Reload latest' : 'Try again'} <ArrowRight /></button>}
  </div>
}

function Empty({ title, copy, action }: { title: string; copy: string; action?: React.ReactNode }) { return <div className="empty"><PackageOpen /><strong>{title}</strong><p>{copy}</p>{action}</div> }

export default App
