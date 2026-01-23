/**
 * A-Shot Picker - Smart Photo Selection Tool
 * 
 * Algorithm: Swiss-System with Elo Rating
 * 
 * Phase 1: Initial Selection (click to pick candidates from grid)
 * Phase 2: Swiss-System Comparisons (photos gain/lose Elo points)
 * Phase 3: Results (top N by Elo rating)
 * 
 * This minimizes regret because:
 * - No elimination: every photo can still be selected at the end
 * - Elo adjusts based on comparison difficulty
 * - Swiss-system pairs similar-rated photos for maximum information gain
 */

// ============================================
// State Management
// ============================================
const state = {
    // Directory handle for persistence
    dirHandle: null,
    
    // All photos loaded from folder
    allPhotos: [],
    
    // Photos selected as candidates (Phase 1 output)
    candidates: [],
    
    // Settings
    targetCount: 25,
    shufflePhotos: false,
    
    // Phase 1: Selection grid state
    currentPage: 0,
    photosPerPage: 60,
    selectedIds: new Set(),
    viewMode: 'swipe', // 'grid', 'swipe', or 'cluster'
    swipeIndex: 0, // Current photo index in swipe mode
    
    // Clustering state
    clusters: [], // Array of clusters, each is array of photo objects
    clusterFingerprints: new Map(), // Photo ID -> fingerprint data
    clusterThreshold: 15, // Similarity threshold (lower = more similar required)
    expandedClusters: new Set(), // Track which clusters are expanded
    
    // Phase 2: Ranking state
    comparisonHistory: [], // For undo
    comparisonsCompleted: 0,
    currentPair: null,
    currentSelection: new Set(),
    
    // Current phase for restoration
    currentPhase: 'selection', // 'selection', 'ranking', 'results'
    
    // Final selection
    finalSelection: [],
    
    // Photo cache - thumbnails (small, fast) and full-size (on-demand)
    thumbnailCache: new Map(),
    fullSizeCache: new Map()
};

// Cache file name
const CACHE_FILENAME = '.ashot-picker-cache.json';
const DB_NAME = 'AshotPickerDB';
const DB_STORE = 'folderHandles';

// Elo rating constants
const ELO_K = 32; // How much ratings change per comparison
const ELO_DEFAULT = 1500; // Starting rating

// ============================================
// DOM Elements
// ============================================
const elements = {
    // Screens
    landingScreen: document.getElementById('landing-screen'),
    loadingScreen: document.getElementById('loading-screen'),
    selectionScreen: document.getElementById('selection-screen'),
    selectedReviewScreen: document.getElementById('selected-review-screen'),
    rankingScreen: document.getElementById('ranking-screen'),
    resultsScreen: document.getElementById('results-screen'),
    
    // Landing
    selectFolderBtn: document.getElementById('select-folder-btn'),
    targetCountInput: document.getElementById('target-count'),
    shufflePhotosSelect: document.getElementById('shuffle-photos'),
    
    // Loading
    loadingStatus: document.getElementById('loading-status'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    
    // Selection (Phase 1)
    selectionGrid: document.getElementById('selection-grid'),
    selectionProgress: document.getElementById('selection-progress'),
    selectionCount: document.getElementById('selection-count'),
    selectionPrev: document.getElementById('selection-prev'),
    selectionNext: document.getElementById('selection-next'),
    currentPage: document.getElementById('current-page'),
    totalPages: document.getElementById('total-pages'),
    viewSelectedBtn: document.getElementById('view-selected-btn'),
    proceedToRanking: document.getElementById('proceed-to-ranking'),
    gridViewBtn: document.getElementById('grid-view-btn'),
    swipeViewBtn: document.getElementById('swipe-view-btn'),
    clusterViewBtn: document.getElementById('cluster-view-btn'),
    gridInstruction: document.getElementById('grid-instruction'),
    swipeInstruction: document.getElementById('swipe-instruction'),
    clusterInstruction: document.getElementById('cluster-instruction'),
    gridControls: document.getElementById('grid-controls'),
    swipeControls: document.getElementById('swipe-controls'),
    clusterView: document.getElementById('cluster-view'),
    clusterThresholdSlider: document.getElementById('cluster-threshold'),
    clusterCountDisplay: document.getElementById('cluster-count'),
    
    // Swipe view
    swipeView: document.getElementById('swipe-view'),
    swipeImage: document.getElementById('swipe-image'),
    swipeBadge: document.getElementById('swipe-badge'),
    swipeFilename: document.getElementById('swipe-filename'),
    swipeCounter: document.getElementById('swipe-counter'),
    swipePrev: document.getElementById('swipe-prev'),
    swipeNext: document.getElementById('swipe-next'),
    swipeSelectBtn: document.getElementById('swipe-select-btn'),
    swipeProgressFill: document.getElementById('swipe-progress-fill'),
    
    // Selection Sidebar
    selectionSidebar: document.getElementById('selection-sidebar'),
    sidebarCount: document.getElementById('sidebar-count'),
    sidebarThumbnails: document.getElementById('sidebar-thumbnails'),
    sidebarClear: document.getElementById('sidebar-clear'),
    
    // Review Selected
    reviewGrid: document.getElementById('review-grid'),
    reviewCount: document.getElementById('review-count'),
    backToSelection: document.getElementById('back-to-selection'),
    startRanking: document.getElementById('start-ranking'),
    
    // Ranking (Phase 2)
    rankingArena: document.getElementById('ranking-arena'),
    comparisonProgress: document.getElementById('comparison-progress'),
    rankingPool: document.getElementById('ranking-pool'),
    targetDisplay: document.getElementById('target-display'),
    confidenceFill: document.getElementById('confidence-fill'),
    confidencePercent: document.getElementById('confidence-percent'),
    skipComparison: document.getElementById('skip-comparison'),
    undoComparison: document.getElementById('undo-comparison'),
    confirmRanking: document.getElementById('confirm-ranking'),
    finishRanking: document.getElementById('finish-ranking'),
    
    // Results
    finalCount: document.getElementById('final-count'),
    resultsGrid: document.getElementById('results-grid'),
    copyFilenames: document.getElementById('copy-filenames'),
    downloadList: document.getElementById('download-list'),
    continueRanking: document.getElementById('continue-ranking'),
    
    // Photo viewer
    photoViewer: document.getElementById('photo-viewer'),
    viewerImage: document.getElementById('viewer-image'),
    viewerFilename: document.getElementById('viewer-filename'),
    closeViewer: document.querySelector('.close-viewer'),
    
    // Import modal
    importSelectionBtn: document.getElementById('import-selection-btn'),
    importModal: document.getElementById('import-modal'),
    importModalClose: document.getElementById('import-modal-close'),
    importTextarea: document.getElementById('import-textarea'),
    importPreview: document.getElementById('import-preview'),
    importConfirmBtn: document.getElementById('import-confirm-btn'),
    importFileInput: document.getElementById('import-file-input'),
    importFileBtn: document.getElementById('import-file-btn'),
    importFileName: document.getElementById('import-file-name'),
    
    // Top ranked preview modal
    previewTopBtn: document.getElementById('preview-top-btn'),
    topRankedModal: document.getElementById('top-ranked-modal'),
    topRankedClose: document.getElementById('top-ranked-close'),
    topRankedGrid: document.getElementById('top-ranked-grid'),
    
    // Ranking screen additional buttons
    rankingImportBtn: document.getElementById('ranking-import-btn'),
    addMoreCandidatesBtn: document.getElementById('add-more-candidates-btn'),
    exportCandidatesBtn: document.getElementById('export-candidates-btn'),
    exportAshotsBtn: document.getElementById('export-ashots-btn')
};

// ============================================
// Utility Functions
// ============================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw'];
    const lower = filename.toLowerCase();
    return imageExtensions.some(ext => lower.endsWith(ext));
}

// ============================================
// Persistence - IndexedDB for folder handle
// ============================================

async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
                db.createObjectStore(DB_STORE, { keyPath: 'id' });
            }
        };
    });
}

async function saveFolderHandle(dirHandle) {
    try {
        const db = await openDatabase();
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        await store.put({ id: 'lastFolder', handle: dirHandle });
        console.log('📁 Folder handle saved to IndexedDB');
    } catch (err) {
        console.warn('Failed to save folder handle:', err);
    }
}

async function loadFolderHandle() {
    try {
        const db = await openDatabase();
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const request = store.get('lastFolder');
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result?.handle || null);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('Failed to load folder handle:', err);
        return null;
    }
}

async function clearFolderHandle() {
    try {
        const db = await openDatabase();
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        await store.delete('lastFolder');
    } catch (err) {
        console.warn('Failed to clear folder handle:', err);
    }
}

// ============================================
// Persistence - Cache file in photo folder
// ============================================

function getSessionData() {
    // Convert selectedIds to photo names for persistence (IDs are regenerated on reload)
    const selectedNames = [];
    for (const id of state.selectedIds) {
        const photo = state.allPhotos.find(p => p.id === id);
        if (photo) selectedNames.push(photo.name);
    }
    
    return {
        version: 1,
        timestamp: Date.now(),
        targetCount: state.targetCount,
        currentPhase: state.currentPhase,
        swipeIndex: state.swipeIndex,
        selectedIds: selectedNames,
        candidates: state.candidates.map(p => ({
            name: p.name,
            path: p.path,
            elo: p.elo,
            comparisons: p.comparisons
        })),
        comparisonHistory: state.comparisonHistory,
        comparisonsCompleted: state.comparisonsCompleted,
        finalSelection: state.finalSelection.map(p => p.name)
    };
}

async function saveSessionToFolder() {
    if (!state.dirHandle) return;
    
    try {
        const data = getSessionData();
        const json = JSON.stringify(data, null, 2);
        
        const fileHandle = await state.dirHandle.getFileHandle(CACHE_FILENAME, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        
        console.log('💾 Session saved to folder');
    } catch (err) {
        console.warn('Failed to save session to folder:', err);
    }
}

async function loadSessionFromFolder(dirHandle) {
    try {
        const fileHandle = await dirHandle.getFileHandle(CACHE_FILENAME);
        const file = await fileHandle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);
        
        console.log('📂 Found cached session from', new Date(data.timestamp).toLocaleString());
        return data;
    } catch (err) {
        // No cache file exists
        return null;
    }
}

async function deleteSessionFromFolder() {
    if (!state.dirHandle) return;
    
    try {
        await state.dirHandle.removeEntry(CACHE_FILENAME);
        console.log('🗑️ Session cache deleted');
    } catch (err) {
        // File doesn't exist, ignore
    }
}

// Auto-save debounced
let saveTimeout = null;
function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveSessionToFolder();
        saveFolderHandle(state.dirHandle);
    }, 2000);
}

// ============================================
// Elo Rating System
// ============================================

function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateEloRatings(winner, loser) {
    const expectedWin = expectedScore(winner.elo, loser.elo);
    const expectedLose = expectedScore(loser.elo, winner.elo);
    
    winner.elo += ELO_K * (1 - expectedWin);
    loser.elo += ELO_K * (0 - expectedLose);
    
    // Track comparison count for confidence
    winner.comparisons = (winner.comparisons || 0) + 1;
    loser.comparisons = (loser.comparisons || 0) + 1;
}

function updateEloTie(photoA, photoB) {
    const expectedA = expectedScore(photoA.elo, photoB.elo);
    const expectedB = expectedScore(photoB.elo, photoA.elo);
    
    // Tie = 0.5 points each
    photoA.elo += ELO_K * (0.5 - expectedA);
    photoB.elo += ELO_K * (0.5 - expectedB);
    
    photoA.comparisons = (photoA.comparisons || 0) + 1;
    photoB.comparisons = (photoB.comparisons || 0) + 1;
}

// Swiss-system: pair photos with similar ratings, ensuring uniform coverage
function getNextPair() {
    if (state.candidates.length < 2) return null;
    
    // Prioritize photos with fewer comparisons for uniform coverage
    const sortedByComparisons = [...state.candidates].sort((a, b) => {
        // First priority: fewer comparisons
        const compDiff = (a.comparisons || 0) - (b.comparisons || 0);
        if (compDiff !== 0) return compDiff;
        // Second priority: similar Elo rating
        return b.elo - a.elo;
    });
    
    // Get the photos with the fewest comparisons
    const minComparisons = sortedByComparisons[0].comparisons || 0;
    const underCompared = sortedByComparisons.filter(p => (p.comparisons || 0) <= minComparisons + 1);
    
    // If we have enough under-compared photos, pick from them
    if (underCompared.length >= 2) {
        // Shuffle to avoid always picking the same ones
        const shuffled = [...underCompared].sort(() => Math.random() - 0.5);
        
        // Find a pair that hasn't been compared recently
        for (let i = 0; i < shuffled.length; i++) {
            for (let j = i + 1; j < shuffled.length; j++) {
                const a = shuffled[i];
                const b = shuffled[j];
                
                const recentlyCompared = state.comparisonHistory.slice(-10).some(
                    h => (h.a === a.id && h.b === b.id) || (h.a === b.id && h.b === a.id)
                );
                
                if (!recentlyCompared) {
                    return [a, b];
                }
            }
        }
    }
    
    // Fallback: sort by Elo and pair adjacent ratings (classic Swiss)
    const sortedByElo = [...state.candidates].sort((a, b) => b.elo - a.elo);
    
    // Shuffle starting position to avoid always starting from top
    const startOffset = Math.floor(Math.random() * (sortedByElo.length - 1));
    
    for (let i = 0; i < sortedByElo.length - 1; i++) {
        const idx = (i + startOffset) % (sortedByElo.length - 1);
        const a = sortedByElo[idx];
        const b = sortedByElo[idx + 1];
        
        const recentlyCompared = state.comparisonHistory.slice(-15).some(
            h => (h.a === a.id && h.b === b.id) || (h.a === b.id && h.b === a.id)
        );
        
        if (!recentlyCompared) {
            return [a, b];
        }
    }
    
    // Last resort: random pair
    const shuffledAll = [...state.candidates].sort(() => Math.random() - 0.5);
    return [shuffledAll[0], shuffledAll[1]];
}

// Track previous top N sets for stability measurement
let previousTopNSets = [];

function calculateConfidence() {
    // Confidence based on how stable the TOP N SET is (not the order within it)
    // The progress bar measures whether the same photos stay in the top N
    
    const n = state.candidates.length;
    const targetN = Math.min(state.targetCount, n);
    
    if (targetN < 2 || state.comparisonsCompleted < 2) {
        return 0;
    }
    
    // Get current top N photo IDs as a Set
    const sortedByElo = [...state.candidates].sort((a, b) => b.elo - a.elo);
    const currentTopNIds = new Set(sortedByElo.slice(0, targetN).map(p => p.id));
    
    // Add to history (keep last 10 snapshots)
    previousTopNSets.push(currentTopNIds);
    if (previousTopNSets.length > 10) {
        previousTopNSets.shift();
    }
    
    // Need at least 3 snapshots to measure stability
    if (previousTopNSets.length < 3) {
        return Math.min(20, state.comparisonsCompleted * 5);
    }
    
    // Calculate stability: how many of the last snapshots have the same set
    let stableCount = 0;
    for (let i = 1; i < previousTopNSets.length; i++) {
        const prevSet = previousTopNSets[i - 1];
        const currSet = previousTopNSets[i];
        
        // Check if sets are identical (same photos, regardless of order)
        let identical = true;
        if (prevSet.size !== currSet.size) {
            identical = false;
        } else {
            for (const id of currSet) {
                if (!prevSet.has(id)) {
                    identical = false;
                    break;
                }
            }
        }
        
        if (identical) {
            stableCount++;
        }
    }
    
    // Stability ratio (how many consecutive snapshots were stable)
    const stabilityRatio = stableCount / (previousTopNSets.length - 1);
    
    // Also factor in basic coverage (has everyone been compared at least once?)
    const comparedCount = state.candidates.filter(p => (p.comparisons || 0) >= 1).length;
    const coverageRatio = comparedCount / n;
    
    // Confidence: mostly stability, with coverage as a baseline
    // Need good coverage AND stability to reach high confidence
    const baseConfidence = coverageRatio * 30; // Up to 30% from coverage
    const stabilityConfidence = stabilityRatio * 70; // Up to 70% from stability
    
    const confidence = baseConfidence + stabilityConfidence;
    
    return Math.min(100, Math.round(confidence));
}

// ============================================
// File System Access
// ============================================

async function selectFolder() {
    try {
        if (!('showDirectoryPicker' in window)) {
            alert('Your browser does not support the File System Access API. Please use Chrome, Edge, or another Chromium-based browser.');
            return;
        }

        const dirHandle = await window.showDirectoryPicker();
        await loadPhotosFromDirectory(dirHandle);
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Error selecting folder:', err);
            alert('Error selecting folder: ' + err.message);
        }
    }
}

async function loadPhotosFromDirectory(dirHandle, skipCacheCheck = false) {
    showScreen('loading-screen');
    elements.loadingStatus.textContent = 'Scanning folder...';
    elements.progressFill.style.width = '0%';
    
    // Store directory handle for persistence
    state.dirHandle = dirHandle;
    
    // Check for existing session cache
    let cachedSession = null;
    if (!skipCacheCheck) {
        cachedSession = await loadSessionFromFolder(dirHandle);
        if (cachedSession) {
            const resumeSession = confirm(
                `Found a saved session from ${new Date(cachedSession.timestamp).toLocaleString()}.\n\n` +
                `Phase: ${cachedSession.currentPhase}\n` +
                `Selected: ${cachedSession.selectedIds?.length || 0} photos\n` +
                `Candidates: ${cachedSession.candidates?.length || 0} photos\n\n` +
                `Resume this session?`
            );
            
            if (!resumeSession) {
                cachedSession = null;
                await deleteSessionFromFolder();
            }
        }
    }
    
    state.allPhotos = [];
    state.thumbnailCache.clear();
    state.fullSizeCache.clear();
    
    // Recursively collect all image files
    const photoFiles = [];
    await scanDirectory(dirHandle, photoFiles, '');
    
    elements.loadingStatus.textContent = `Found ${photoFiles.length} photos. Preparing...`;
    
    const totalPhotos = photoFiles.length;
    
    // Create a map of paths to cached data for quick lookup
    const cachedPhotoData = new Map();
    if (cachedSession) {
        for (const cp of cachedSession.candidates || []) {
            cachedPhotoData.set(cp.path, cp);
        }
    }
    
    for (let i = 0; i < photoFiles.length; i++) {
        const { handle, path } = photoFiles[i];
        
        try {
            const cached = cachedPhotoData.get(path);
            const photo = {
                id: `photo-${i}`,
                name: handle.name,
                path: path,
                handle: handle,
                elo: cached?.elo || ELO_DEFAULT,
                comparisons: cached?.comparisons || 0
            };
            
            state.allPhotos.push(photo);
        } catch (err) {
            console.warn(`Failed to load ${handle.name}:`, err);
        }
        
        // Update progress every 100 files
        if (i % 100 === 0 || i === photoFiles.length - 1) {
            const progress = ((i + 1) / totalPhotos) * 100;
            elements.progressFill.style.width = `${progress}%`;
            elements.progressText.textContent = `${i + 1} / ${totalPhotos}`;
            await new Promise(r => setTimeout(r, 0));
        }
    }
    
    if (state.allPhotos.length === 0) {
        alert('No image files found in the selected folder.');
        showScreen('landing-screen');
        return;
    }
    
    // Sort by filename (natural sort)
    state.allPhotos.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    
    // Get settings (use cached if restoring)
    state.targetCount = cachedSession?.targetCount || parseInt(elements.targetCountInput.value) || 25;
    
    // Restore session state if we have a cache
    if (cachedSession) {
        await restoreSession(cachedSession);
    } else {
        // Fresh start
        state.shufflePhotos = elements.shufflePhotosSelect.value === 'shuffle';
        if (state.shufflePhotos) {
            state.allPhotos = shuffleArray(state.allPhotos);
        }
        startSelectionPhase();
    }
    
    // Save folder handle for browser refresh
    await saveFolderHandle(dirHandle);
}

async function restoreSession(cachedSession) {
    elements.loadingStatus.textContent = 'Restoring session...';
    
    // Build a map of photo names/paths to photo objects
    const photoByPath = new Map();
    const photoByName = new Map();
    for (const photo of state.allPhotos) {
        photoByPath.set(photo.path, photo);
        photoByName.set(photo.name, photo);
    }
    
    // Restore selectedIds
    state.selectedIds.clear();
    for (const name of cachedSession.selectedIds || []) {
        // Try to find by path first, then by name
        const photo = photoByPath.get(name) || photoByName.get(name) || 
                      state.allPhotos.find(p => p.id === name || p.name === name);
        if (photo) {
            state.selectedIds.add(photo.id);
        }
    }
    
    // Restore candidates with Elo ratings
    state.candidates = [];
    for (const cp of cachedSession.candidates || []) {
        const photo = photoByPath.get(cp.path) || photoByName.get(cp.name);
        if (photo) {
            photo.elo = cp.elo;
            photo.comparisons = cp.comparisons;
            state.candidates.push(photo);
        }
    }
    
    // Restore other state
    state.swipeIndex = cachedSession.swipeIndex || 0;
    state.comparisonsCompleted = cachedSession.comparisonsCompleted || 0;
    state.comparisonHistory = cachedSession.comparisonHistory || [];
    state.currentPhase = cachedSession.currentPhase || 'selection';
    
    // Restore final selection
    state.finalSelection = [];
    for (const name of cachedSession.finalSelection || []) {
        const photo = photoByName.get(name);
        if (photo) state.finalSelection.push(photo);
    }
    
    console.log(`📂 Session restored: ${state.selectedIds.size} selected, ${state.candidates.length} candidates`);
    
    // Navigate to the appropriate phase
    switch (state.currentPhase) {
        case 'ranking':
            if (state.candidates.length >= 2) {
                showScreen('ranking-screen');
                elements.rankingPool.textContent = `Candidates: ${state.candidates.length}`;
                elements.targetDisplay.textContent = `Target: ${state.targetCount}`;
                showNextComparison();
            } else {
                startSelectionPhase(true); // Keep restored selections
            }
            break;
        case 'results':
            if (state.finalSelection.length > 0) {
                showResults();
            } else {
                startSelectionPhase(true); // Keep restored selections
            }
            break;
        default:
            startSelectionPhase(true); // Keep restored selections
    }
}

async function scanDirectory(dirHandle, results, currentPath) {
    for await (const entry of dirHandle.values()) {
        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        
        if (entry.kind === 'file' && isImageFile(entry.name)) {
            results.push({ handle: entry, path: entryPath });
        } else if (entry.kind === 'directory') {
            await scanDirectory(entry, results, entryPath);
        }
    }
}

// Get or create URL for a photo (lazy loading)
async function getPhotoUrl(photo) {
    if (state.fullSizeCache.has(photo.id)) {
        return state.fullSizeCache.get(photo.id);
    }
    
    const file = await photo.handle.getFile();
    const url = URL.createObjectURL(file);
    state.fullSizeCache.set(photo.id, url);
    return url;
}

// Create a thumbnail from a file
async function createThumbnail(file, maxSize = 300) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            
            // Calculate thumbnail size
            if (width > height) {
                if (width > maxSize) {
                    height = (height * maxSize) / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width = (width * maxSize) / height;
                    height = maxSize;
                }
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob(blob => {
                URL.revokeObjectURL(url); // Free the full-size blob
                if (blob) {
                    resolve(URL.createObjectURL(blob));
                } else {
                    reject(new Error('Failed to create thumbnail'));
                }
            }, 'image/jpeg', 0.7);
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };
        
        img.src = url;
    });
}

// Get or create thumbnail (lazy, cached)
async function getThumbnail(photo) {
    if (state.thumbnailCache.has(photo.id)) {
        return state.thumbnailCache.get(photo.id);
    }
    
    try {
        const file = await photo.handle.getFile();
        const thumbnailUrl = await createThumbnail(file, 300);
        state.thumbnailCache.set(photo.id, thumbnailUrl);
        return thumbnailUrl;
    } catch (err) {
        console.warn(`Failed to create thumbnail for ${photo.name}:`, err);
        return null;
    }
}

// Preload thumbnails for a batch of photos (parallel with concurrency limit)
async function preloadThumbnails(photos, concurrency = 6) {
    const results = new Map();
    
    // Process in chunks to avoid overwhelming the browser
    for (let i = 0; i < photos.length; i += concurrency) {
        const chunk = photos.slice(i, i + concurrency);
        const promises = chunk.map(async (photo) => {
            const url = await getThumbnail(photo);
            results.set(photo.id, url);
        });
        await Promise.all(promises);
    }
    
    return results;
}

// ============================================
// Phase 1: Selection (Click to Pick Candidates)
// ============================================

async function startSelectionPhase(keepSelections = false) {
    state.currentPage = 0;
    state.currentPhase = 'selection';
    state.viewMode = 'swipe';
    
    // Only clear selections if not restoring
    if (!keepSelections) {
        state.selectedIds.clear();
        state.swipeIndex = 0;
        // Clear cluster data for fresh start
        state.clusters = [];
        state.clusterFingerprints.clear();
        state.expandedClusters.clear();
    }
    
    const totalPages = Math.ceil(state.allPhotos.length / state.photosPerPage);
    elements.totalPages.textContent = totalPages;
    
    // Reset view mode UI - default to swipe
    elements.gridViewBtn.classList.remove('active');
    elements.swipeViewBtn.classList.add('active');
    elements.clusterViewBtn.classList.remove('active');
    elements.selectionGrid.classList.add('hidden');
    elements.swipeView.classList.remove('hidden');
    elements.clusterView.classList.add('hidden');
    elements.gridControls.classList.add('hidden');
    elements.swipeControls.classList.remove('hidden');
    elements.gridInstruction.classList.add('hidden');
    elements.swipeInstruction.classList.remove('hidden');
    elements.clusterInstruction.classList.add('hidden');
    
    showScreen('selection-screen');
    await renderSwipeView();
    updateSelectionStats();
}

async function renderSelectionPage() {
    const start = state.currentPage * state.photosPerPage;
    const end = Math.min(start + state.photosPerPage, state.allPhotos.length);
    const pagePhotos = state.allPhotos.slice(start, end);
    
    elements.currentPage.textContent = state.currentPage + 1;
    elements.selectionProgress.textContent = `Page ${state.currentPage + 1} of ${elements.totalPages.textContent}`;
    
    // Render placeholders immediately
    elements.selectionGrid.innerHTML = pagePhotos.map(photo => `
        <div class="selection-photo ${state.selectedIds.has(photo.id) ? 'selected' : ''}" 
             data-id="${photo.id}">
            <img src="${state.thumbnailCache.get(photo.id) || ''}" alt="${photo.name}" loading="lazy">
            <span class="photo-name">${photo.name}</span>
            <span class="select-indicator">✓</span>
        </div>
    `).join('');
    
    // Add click handlers
    elements.selectionGrid.querySelectorAll('.selection-photo').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.detail === 2) {
                openPhotoViewer(el.dataset.id);
            } else {
                toggleSelection(el.dataset.id);
            }
        });
    });
    
    // Update navigation buttons
    elements.selectionPrev.disabled = state.currentPage === 0;
    const totalPages = Math.ceil(state.allPhotos.length / state.photosPerPage);
    elements.selectionNext.disabled = state.currentPage >= totalPages - 1;
    
    updateSelectionStats();
    
    // Load thumbnails progressively (don't block UI)
    const uncachedPhotos = pagePhotos.filter(p => !state.thumbnailCache.has(p.id));
    if (uncachedPhotos.length > 0) {
        loadThumbnailsProgressively(uncachedPhotos);
    }
}

// Load thumbnails one by one and update the DOM progressively
async function loadThumbnailsProgressively(photos) {
    for (const photo of photos) {
        if (state.thumbnailCache.has(photo.id)) continue;
        
        try {
            const url = await getThumbnail(photo);
            if (url) {
                // Update the image in the DOM if it's still visible
                const img = elements.selectionGrid.querySelector(`[data-id="${photo.id}"] img`);
                if (img) {
                    img.src = url;
                }
            }
        } catch (err) {
            // Skip failed thumbnails
        }
    }
}

function toggleSelection(photoId) {
    if (state.selectedIds.has(photoId)) {
        state.selectedIds.delete(photoId);
    } else {
        state.selectedIds.add(photoId);
    }
    
    const el = elements.selectionGrid.querySelector(`[data-id="${photoId}"]`);
    if (el) {
        el.classList.toggle('selected', state.selectedIds.has(photoId));
    }
    
    updateSelectionStats();
    scheduleSave(); // Auto-save on selection change
}

function updateSelectionStats() {
    const count = state.selectedIds.size;
    elements.selectionCount.textContent = `${count} selected`;
    
    // Enable/disable buttons based on selection
    elements.viewSelectedBtn.disabled = count === 0;
    elements.proceedToRanking.disabled = count < 2;
    
    // Update button text with helpful info
    if (count < state.targetCount) {
        elements.proceedToRanking.textContent = `Select at least ${state.targetCount - count} more`;
        elements.proceedToRanking.disabled = true;
    } else {
        elements.proceedToRanking.textContent = `Proceed to Ranking →`;
        elements.proceedToRanking.disabled = false;
    }
    
    // Update sidebar
    updateSelectionSidebar();
}

async function updateSelectionSidebar() {
    const count = state.selectedIds.size;
    elements.sidebarCount.textContent = count;
    elements.sidebarClear.disabled = count === 0;
    
    if (count === 0) {
        elements.sidebarThumbnails.innerHTML = '<p class="sidebar-empty">No photos selected yet</p>';
        return;
    }
    
    // Get selected photos in order
    const selectedPhotos = state.allPhotos.filter(p => state.selectedIds.has(p.id));
    
    // Render thumbnails
    elements.sidebarThumbnails.innerHTML = selectedPhotos.map(photo => `
        <div class="sidebar-thumb" data-id="${photo.id}" title="${photo.name}">
            <img src="${state.thumbnailCache.get(photo.id) || ''}" alt="${photo.name}">
            <button class="remove-btn" data-id="${photo.id}">×</button>
        </div>
    `).join('');
    
    // Load thumbnails for any that don't have cached versions
    for (const photo of selectedPhotos) {
        if (!state.thumbnailCache.has(photo.id)) {
            getThumbnail(photo).then(url => {
                const img = elements.sidebarThumbnails.querySelector(`[data-id="${photo.id}"] img`);
                if (img && url) img.src = url;
            });
        }
    }
    
    // Add click handlers
    elements.sidebarThumbnails.querySelectorAll('.sidebar-thumb').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) {
                // Remove from selection
                const photoId = e.target.dataset.id;
                state.selectedIds.delete(photoId);
                updateSelectionStats();
                
                // Update grid/swipe view
                const gridEl = elements.selectionGrid.querySelector(`[data-id="${photoId}"]`);
                if (gridEl) gridEl.classList.remove('selected');
                
                // Update swipe badge if viewing this photo
                const currentPhoto = state.allPhotos[state.swipeIndex];
                if (currentPhoto && currentPhoto.id === photoId) {
                    elements.swipeBadge.classList.add('hidden');
                    elements.swipeSelectBtn.textContent = 'Select Photo ';
                    elements.swipeSelectBtn.innerHTML += '<kbd>Space</kbd>';
                }
            } else {
                // Navigate to this photo in swipe view
                const photoId = el.dataset.id;
                const index = state.allPhotos.findIndex(p => p.id === photoId);
                if (index >= 0 && state.viewMode === 'swipe') {
                    state.swipeIndex = index;
                    renderSwipeView();
                } else {
                    // Open in viewer
                    openPhotoViewer(photoId);
                }
            }
        });
    });
}

function clearAllSelections() {
    state.selectedIds.clear();
    
    // Update grid view
    elements.selectionGrid.querySelectorAll('.selection-photo').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Update swipe view
    elements.swipeBadge.classList.add('hidden');
    elements.swipeSelectBtn.textContent = 'Select Photo ';
    elements.swipeSelectBtn.innerHTML += '<kbd>Space</kbd>';
    
    updateSelectionStats();
}

async function selectionPrevPage() {
    if (state.currentPage > 0) {
        state.currentPage--;
        await renderSelectionPage();
    }
}

async function selectionNextPage() {
    const totalPages = Math.ceil(state.allPhotos.length / state.photosPerPage);
    if (state.currentPage < totalPages - 1) {
        state.currentPage++;
        await renderSelectionPage();
    }
}

async function showSelectedReview() {
    const selectedPhotos = state.allPhotos.filter(p => state.selectedIds.has(p.id));
    
    elements.reviewCount.textContent = `${selectedPhotos.length} photos`;
    elements.reviewGrid.innerHTML = selectedPhotos.map(photo => `
        <div class="review-photo selected" data-id="${photo.id}">
            <img src="${state.thumbnailCache.get(photo.id) || ''}" alt="${photo.name}">
            <span class="photo-name">${photo.name}</span>
            <button class="remove-btn" data-id="${photo.id}">×</button>
        </div>
    `).join('');
    
    // Add remove handlers
    elements.reviewGrid.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromSelection(btn.dataset.id);
        });
    });
    
    // Add click to view
    elements.reviewGrid.querySelectorAll('.review-photo').forEach(el => {
        el.addEventListener('click', () => openPhotoViewer(el.dataset.id));
    });
    
    showScreen('selected-review-screen');
}

function removeFromSelection(photoId) {
    state.selectedIds.delete(photoId);
    
    const el = elements.reviewGrid.querySelector(`[data-id="${photoId}"]`);
    if (el) {
        el.remove();
    }
    
    elements.reviewCount.textContent = `${state.selectedIds.size} photos`;
    
    // Update main selection stats
    updateSelectionStats();
}

function backToSelection() {
    showScreen('selection-screen');
    if (state.viewMode === 'grid') {
        renderSelectionPage();
    } else {
        renderSwipeView();
    }
}

// ============================================
// View Mode Toggle
// ============================================

function setViewMode(mode) {
    state.viewMode = mode;
    
    // Update toggle buttons
    elements.gridViewBtn.classList.toggle('active', mode === 'grid');
    elements.swipeViewBtn.classList.toggle('active', mode === 'swipe');
    elements.clusterViewBtn.classList.toggle('active', mode === 'cluster');
    
    // Show/hide appropriate views
    elements.selectionGrid.classList.toggle('hidden', mode !== 'grid');
    elements.swipeView.classList.toggle('hidden', mode !== 'swipe');
    elements.clusterView.classList.toggle('hidden', mode !== 'cluster');
    elements.gridControls.classList.toggle('hidden', mode !== 'grid');
    elements.swipeControls.classList.toggle('hidden', mode !== 'swipe');
    elements.gridInstruction.classList.toggle('hidden', mode !== 'grid');
    elements.swipeInstruction.classList.toggle('hidden', mode !== 'swipe');
    elements.clusterInstruction.classList.toggle('hidden', mode !== 'cluster');
    
    // Update progress display based on mode
    if (mode === 'swipe') {
        elements.selectionProgress.textContent = `${state.swipeIndex + 1} of ${state.allPhotos.length}`;
        renderSwipeView();
    } else if (mode === 'cluster') {
        elements.selectionProgress.textContent = `${state.clusters.length} clusters`;
        renderClusterView();
    } else {
        elements.selectionProgress.textContent = `Page ${state.currentPage + 1} of ${elements.totalPages.textContent}`;
        renderSelectionPage();
    }
}

// ============================================
// Clustering - Image Fingerprinting & Grouping
// ============================================

// Create a fingerprint from an image by downsampling to a small grid
async function createFingerprint(photo, size = 8) {
    if (state.clusterFingerprints.has(photo.id)) {
        return state.clusterFingerprints.get(photo.id);
    }
    
    try {
        const file = await photo.handle.getFile();
        const fingerprint = await computeImageFingerprint(file, size);
        state.clusterFingerprints.set(photo.id, fingerprint);
        return fingerprint;
    } catch (err) {
        console.warn(`Failed to create fingerprint for ${photo.name}:`, err);
        return null;
    }
}

// Reusable canvas for fingerprinting (memory optimization)
let fingerprintCanvas = null;
let fingerprintCtx = null;

// Compute fingerprint from a File object - memory optimized
function computeImageFingerprint(file, size = 8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            // Reuse canvas to avoid memory leaks
            if (!fingerprintCanvas) {
                fingerprintCanvas = document.createElement('canvas');
                fingerprintCanvas.width = size;
                fingerprintCanvas.height = size;
                fingerprintCtx = fingerprintCanvas.getContext('2d', { willReadFrequently: true });
            }
            
            // Clear and draw
            fingerprintCtx.clearRect(0, 0, size, size);
            fingerprintCtx.drawImage(img, 0, 0, size, size);
            
            const imageData = fingerprintCtx.getImageData(0, 0, size, size);
            const data = imageData.data;
            
            // Extract grayscale values (more compact, faster comparison)
            const fingerprint = new Uint8Array(size * size);
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                // Grayscale: 0.299*R + 0.587*G + 0.114*B
                fingerprint[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            }
            
            // Clean up
            URL.revokeObjectURL(url);
            img.src = ''; // Help garbage collection
            
            resolve(fingerprint);
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(url);
            img.src = '';
            reject(new Error('Failed to load image'));
        };
        
        img.src = url;
    });
}

// Calculate similarity distance between two fingerprints (lower = more similar)
function fingerprintDistance(fp1, fp2) {
    if (!fp1 || !fp2 || fp1.length !== fp2.length) {
        return Infinity;
    }
    
    let sum = 0;
    for (let i = 0; i < fp1.length; i++) {
        const diff = fp1[i] - fp2[i];
        sum += diff * diff;
    }
    
    // Return RMS difference (0-255 scale)
    return Math.sqrt(sum / fp1.length);
}

// Format seconds into human-readable time
function formatETA(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}m ${secs}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    }
}

// Request notification permission
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        return false;
    }
    
    if (Notification.permission === 'granted') {
        return true;
    }
    
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    
    return false;
}

// Send browser notification
function sendNotification(title, body) {
    if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: body,
            icon: 'favicon.svg',
            tag: 'ashot-picker'
        });
        
        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);
        
        // Focus window when clicked
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }
}

// Build clusters from all photos based on sequential similarity
async function buildClusters() {
    const photos = state.allPhotos;
    if (photos.length === 0) return;
    
    // Request notification permission upfront
    await requestNotificationPermission();
    
    elements.loadingStatus.textContent = 'Analyzing photos for clustering...';
    elements.progressFill.style.width = '0%';
    showScreen('loading-screen');
    
    // Build clusters incrementally - only keep current and previous fingerprint in memory
    const clusters = [];
    let currentCluster = [photos[0]];
    let prevFp = await createFingerprint(photos[0]);
    
    const startTime = Date.now();
    const BATCH_SIZE = 50; // Process in batches to allow GC
    
    for (let i = 1; i < photos.length; i++) {
        const currFp = await createFingerprint(photos[i]);
        const distance = fingerprintDistance(prevFp, currFp);
        
        if (distance <= state.clusterThreshold) {
            // Similar to previous, add to current cluster
            currentCluster.push(photos[i]);
        } else {
            // Different, start new cluster
            clusters.push(currentCluster);
            currentCluster = [photos[i]];
        }
        
        // Move to next - only keep current fingerprint for next comparison
        prevFp = currFp;
        
        // Update UI and allow GC every batch
        if (i % BATCH_SIZE === 0 || i === photos.length - 1) {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const progress = ((i + 1) / photos.length) * 100;
            const avgTimePerPhoto = elapsed / (i + 1);
            const remaining = photos.length - (i + 1);
            const etaSeconds = remaining * avgTimePerPhoto;
            
            elements.progressFill.style.width = `${progress}%`;
            elements.progressText.textContent = `Processing ${i + 1} / ${photos.length} • ETA: ${formatETA(etaSeconds)}`;
            
            // Longer pause every batch for garbage collection
            await new Promise(r => setTimeout(r, 10));
        }
    }
    
    // Don't forget the last cluster
    if (currentCluster.length > 0) {
        clusters.push(currentCluster);
    }
    
    state.clusters = clusters;
    state.expandedClusters.clear();
    
    // Clear the reusable canvas to free memory
    fingerprintCanvas = null;
    fingerprintCtx = null;
    
    console.log(`📊 Created ${clusters.length} clusters from ${photos.length} photos`);
    
    // Send browser notification
    sendNotification(
        '📊 Clustering Complete!',
        `Created ${clusters.length} clusters from ${photos.length} photos`
    );
    
    // Return to selection screen
    showScreen('selection-screen');
    
    if (state.viewMode === 'cluster') {
        renderClusterView();
    }
}

// Re-cluster with new threshold
async function recluster() {
    const photos = state.allPhotos;
    if (photos.length === 0) return;
    
    // Use cached fingerprints to rebuild clusters
    const clusters = [];
    let currentCluster = [photos[0]];
    
    for (let i = 1; i < photos.length; i++) {
        const prevFp = state.clusterFingerprints.get(photos[i - 1].id);
        const currFp = state.clusterFingerprints.get(photos[i].id);
        const distance = fingerprintDistance(prevFp, currFp);
        
        if (distance <= state.clusterThreshold) {
            currentCluster.push(photos[i]);
        } else {
            clusters.push(currentCluster);
            currentCluster = [photos[i]];
        }
    }
    
    if (currentCluster.length > 0) {
        clusters.push(currentCluster);
    }
    
    state.clusters = clusters;
    state.expandedClusters.clear();
    
    elements.clusterCountDisplay.textContent = `${clusters.length} clusters`;
    elements.selectionProgress.textContent = `${clusters.length} clusters`;
    
    renderClusterView();
}

// Render the cluster view
async function renderClusterView() {
    if (state.clusters.length === 0) {
        // Need to build clusters first
        await buildClusters();
        return;
    }
    
    elements.clusterCountDisplay.textContent = `${state.clusters.length} clusters`;
    
    const container = elements.clusterView.querySelector('.cluster-container') || elements.clusterView;
    
    let html = '';
    
    for (let i = 0; i < state.clusters.length; i++) {
        const cluster = state.clusters[i];
        const isExpanded = state.expandedClusters.has(i);
        const representativePhoto = cluster[0]; // First photo as representative
        const selectedCount = cluster.filter(p => state.selectedIds.has(p.id)).length;
        
        html += `
            <div class="cluster-group ${isExpanded ? 'expanded' : ''}" data-cluster-index="${i}">
                <div class="cluster-header" data-cluster-index="${i}">
                    <div class="cluster-preview">
                        <img src="${state.thumbnailCache.get(representativePhoto.id) || ''}" 
                             alt="${representativePhoto.name}" 
                             data-photo-id="${representativePhoto.id}">
                        ${cluster.length > 1 ? `<span class="cluster-stack-indicator">+${cluster.length - 1}</span>` : ''}
                    </div>
                    <div class="cluster-info">
                        <span class="cluster-size">${cluster.length} photo${cluster.length > 1 ? 's' : ''}</span>
                        ${selectedCount > 0 ? `<span class="cluster-selected">${selectedCount} selected</span>` : ''}
                    </div>
                    <button class="cluster-expand-btn">${isExpanded ? '▼' : '▶'}</button>
                </div>
                ${isExpanded ? `
                    <div class="cluster-photos">
                        ${cluster.map(photo => `
                            <div class="cluster-photo ${state.selectedIds.has(photo.id) ? 'selected' : ''}" 
                                 data-id="${photo.id}">
                                <img src="${state.thumbnailCache.get(photo.id) || ''}" alt="${photo.name}">
                                <span class="photo-name">${photo.name}</span>
                                <span class="select-indicator">✓</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // Load missing thumbnails
    for (const cluster of state.clusters) {
        for (const photo of cluster) {
            if (!state.thumbnailCache.has(photo.id)) {
                getThumbnail(photo).then(url => {
                    const imgs = container.querySelectorAll(`[data-photo-id="${photo.id}"], [data-id="${photo.id}"] img`);
                    imgs.forEach(img => {
                        if (img.tagName === 'IMG' && url) img.src = url;
                    });
                });
            }
        }
    }
    
    // Add event listeners
    container.querySelectorAll('.cluster-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('cluster-expand-btn') || e.target === header) {
                toggleClusterExpand(parseInt(header.dataset.clusterIndex));
            }
        });
    });
    
    container.querySelectorAll('.cluster-photo').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.detail === 2) {
                openPhotoViewer(el.dataset.id);
            } else {
                toggleSelectionInCluster(el.dataset.id);
            }
        });
    });
}

function toggleClusterExpand(clusterIndex) {
    if (state.expandedClusters.has(clusterIndex)) {
        state.expandedClusters.delete(clusterIndex);
    } else {
        state.expandedClusters.add(clusterIndex);
    }
    renderClusterView();
}

function toggleSelectionInCluster(photoId) {
    if (state.selectedIds.has(photoId)) {
        state.selectedIds.delete(photoId);
    } else {
        state.selectedIds.add(photoId);
    }
    
    // Update UI for this photo
    const el = elements.clusterView.querySelector(`[data-id="${photoId}"]`);
    if (el) {
        el.classList.toggle('selected', state.selectedIds.has(photoId));
    }
    
    updateSelectionStats();
    renderClusterView(); // Re-render to update cluster selected counts
    scheduleSave();
}

// ============================================
// Swipe View
// ============================================

async function renderSwipeView() {
    if (state.allPhotos.length === 0) return;
    
    const photo = state.allPhotos[state.swipeIndex];
    const isSelected = state.selectedIds.has(photo.id);
    
    // Update UI
    elements.swipeFilename.textContent = photo.name;
    elements.swipeCounter.textContent = `${state.swipeIndex + 1} / ${state.allPhotos.length}`;
    elements.swipeBadge.classList.toggle('hidden', !isSelected);
    elements.swipeSelectBtn.classList.toggle('selected', isSelected);
    elements.swipeSelectBtn.textContent = isSelected ? '✓ Selected (Space)' : 'Select Photo (Space)';
    
    // Update navigation buttons
    elements.swipePrev.disabled = state.swipeIndex === 0;
    elements.swipeNext.disabled = state.swipeIndex >= state.allPhotos.length - 1;
    
    // Update progress bar
    const progress = ((state.swipeIndex + 1) / state.allPhotos.length) * 100;
    elements.swipeProgressFill.style.width = `${progress}%`;
    
    // Update header progress
    elements.selectionProgress.textContent = `${state.swipeIndex + 1} of ${state.allPhotos.length}`;
    
    // Load the image (use full size for swipe view)
    const url = await getPhotoUrl(photo);
    elements.swipeImage.src = url;
    
    // Preload next and previous images
    preloadAdjacentSwipeImages();
}

async function preloadAdjacentSwipeImages() {
    // Preload next 2 and previous 1 images
    const indices = [
        state.swipeIndex - 1,
        state.swipeIndex + 1,
        state.swipeIndex + 2
    ].filter(i => i >= 0 && i < state.allPhotos.length);
    
    for (const idx of indices) {
        const photo = state.allPhotos[idx];
        if (!state.fullSizeCache.has(photo.id)) {
            getPhotoUrl(photo); // Fire and forget
        }
    }
}

function swipePrev() {
    if (state.swipeIndex > 0) {
        state.swipeIndex--;
        renderSwipeView();
    }
}

function swipeNext() {
    if (state.swipeIndex < state.allPhotos.length - 1) {
        state.swipeIndex++;
        renderSwipeView();
    }
}

function swipeToggleSelect() {
    const photo = state.allPhotos[state.swipeIndex];
    
    if (state.selectedIds.has(photo.id)) {
        state.selectedIds.delete(photo.id);
    } else {
        state.selectedIds.add(photo.id);
    }
    
    // Update swipe view UI
    const isSelected = state.selectedIds.has(photo.id);
    elements.swipeBadge.classList.toggle('hidden', !isSelected);
    elements.swipeSelectBtn.classList.toggle('selected', isSelected);
    elements.swipeSelectBtn.textContent = isSelected ? '✓ Selected (Space)' : 'Select Photo (Space)';
    
    // Flash the badge
    if (isSelected) {
        elements.swipeBadge.style.animation = 'none';
        elements.swipeBadge.offsetHeight; // Trigger reflow
        elements.swipeBadge.style.animation = 'badgePop 0.2s ease';
    }
    
    updateSelectionStats();
    scheduleSave(); // Auto-save on selection change
}

// ============================================
// Phase 2: Ranking (Swiss-System Comparisons)
// ============================================

function startRankingPhase() {
    // Check if we're returning from "Add More" mode (candidates already exist)
    if (state.candidates.length > 0 && state.currentPhase === 'selection') {
        // Adding more candidates to existing ranking
        returnToRankingWithNewCandidates();
        return;
    }
    
    // Fresh start - prepare candidates from selection
    state.candidates = state.allPhotos
        .filter(p => state.selectedIds.has(p.id))
        .map(p => ({
            ...p,
            elo: ELO_DEFAULT,
            comparisons: 0
        }));
    
    state.comparisonHistory = [];
    state.comparisonsCompleted = 0;
    state.currentPhase = 'ranking';
    previousTopNSets = []; // Reset stability tracking
    
    elements.rankingPool.textContent = `Candidates: ${state.candidates.length}`;
    elements.targetDisplay.textContent = `Target: ${state.targetCount}`;
    
    showScreen('ranking-screen');
    showNextComparison();
    
    scheduleSave(); // Save phase transition
}

async function showNextComparison() {
    const pair = getNextPair();
    
    if (!pair) {
        finishRanking();
        return;
    }
    
    state.currentPair = pair;
    state.currentSelection = new Set();
    
    // Update progress
    elements.comparisonProgress.textContent = `Comparison ${state.comparisonsCompleted + 1}`;
    
    // Update confidence
    const confidence = calculateConfidence();
    elements.confidenceFill.style.width = `${confidence}%`;
    elements.confidencePercent.textContent = `${confidence}%`;
    
    // Render the pair with placeholder, then load full-size images
    elements.rankingArena.className = 'ranking-arena grid-2';
    elements.rankingArena.innerHTML = pair.map((photo, index) => `
        <div class="ranking-photo" data-id="${photo.id}" data-index="${index}">
            <span class="photo-number">${index + 1}</span>
            <img src="${state.thumbnailCache.get(photo.id) || ''}" alt="${photo.name}" class="loading">
            <button class="zoom-btn" data-id="${photo.id}">🔍</button>
            <span class="photo-name">${photo.name}</span>
            <span class="photo-elo">Rating: ${Math.round(photo.elo)}</span>
        </div>
    `).join('');
    
    // Load full-size images
    for (const photo of pair) {
        getPhotoUrl(photo).then(url => {
            const img = elements.rankingArena.querySelector(`[data-id="${photo.id}"] img`);
            if (img) {
                img.src = url;
                img.classList.remove('loading');
            }
        });
    }
    
    // Add click handlers
    elements.rankingArena.querySelectorAll('.ranking-photo').forEach(el => {
        el.addEventListener('click', (e) => {
            if (!e.target.classList.contains('zoom-btn')) {
                toggleRankingSelection(el.dataset.id);
            }
        });
    });
    
    // Add zoom handlers
    elements.rankingArena.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPhotoViewer(btn.dataset.id);
        });
    });
    
    updateRankingConfirmButton();
    elements.undoComparison.disabled = state.comparisonHistory.length === 0;
}

function toggleRankingSelection(photoId) {
    if (state.currentSelection.has(photoId)) {
        state.currentSelection.delete(photoId);
    } else {
        // In head-to-head, only one can be selected at a time
        state.currentSelection.clear();
        state.currentSelection.add(photoId);
    }
    
    elements.rankingArena.querySelectorAll('.ranking-photo').forEach(el => {
        el.classList.toggle('selected', state.currentSelection.has(el.dataset.id));
    });
    
    updateRankingConfirmButton();
}

function updateRankingConfirmButton() {
    const hasSelection = state.currentSelection.size > 0;
    elements.confirmRanking.disabled = !hasSelection;
    elements.confirmRanking.textContent = hasSelection ? 'Confirm Winner' : 'Select a photo';
}

function confirmComparison() {
    const [photoA, photoB] = state.currentPair;
    const winnerId = [...state.currentSelection][0];
    
    // Save state for undo
    state.comparisonHistory.push({
        a: photoA.id,
        b: photoB.id,
        winner: winnerId,
        prevEloA: photoA.elo,
        prevEloB: photoB.elo,
        prevCompA: photoA.comparisons,
        prevCompB: photoB.comparisons
    });
    
    // Update Elo ratings
    const winner = state.candidates.find(p => p.id === winnerId);
    const loser = state.candidates.find(p => p.id !== winnerId && (p.id === photoA.id || p.id === photoB.id));
    
    if (winner && loser) {
        updateEloRatings(winner, loser);
    }
    
    state.comparisonsCompleted++;
    showNextComparison();
    scheduleSave(); // Auto-save after comparison
}

function skipComparison() {
    const [photoA, photoB] = state.currentPair;
    
    // Save state for undo
    state.comparisonHistory.push({
        a: photoA.id,
        b: photoB.id,
        winner: null, // tie
        prevEloA: photoA.elo,
        prevEloB: photoB.elo,
        prevCompA: photoA.comparisons,
        prevCompB: photoB.comparisons
    });
    
    // Treat as tie
    updateEloTie(photoA, photoB);
    
    state.comparisonsCompleted++;
    showNextComparison();
}

function undoComparison() {
    if (state.comparisonHistory.length === 0) return;
    
    const lastComparison = state.comparisonHistory.pop();
    
    // Restore Elo ratings
    const photoA = state.candidates.find(p => p.id === lastComparison.a);
    const photoB = state.candidates.find(p => p.id === lastComparison.b);
    
    if (photoA) {
        photoA.elo = lastComparison.prevEloA;
        photoA.comparisons = lastComparison.prevCompA;
    }
    if (photoB) {
        photoB.elo = lastComparison.prevEloB;
        photoB.comparisons = lastComparison.prevCompB;
    }
    
    state.comparisonsCompleted--;
    showNextComparison();
}

function finishRanking() {
    // Sort by Elo rating and take top N
    state.candidates.sort((a, b) => b.elo - a.elo);
    state.currentPhase = 'results';
    
    showResults();
    scheduleSave(); // Save final results
}

function continueRanking() {
    // Go back to ranking phase from results
    state.currentPhase = 'ranking';
    
    showScreen('ranking-screen');
    elements.rankingPool.textContent = `Candidates: ${state.candidates.length}`;
    elements.targetDisplay.textContent = `Target: ${state.targetCount}`;
    showNextComparison();
    
    scheduleSave();
}

// ============================================
// Phase 3: Results
// ============================================

async function showResults() {
    showScreen('results-screen');
    
    // Take top N by Elo
    const topPhotos = state.candidates.slice(0, state.targetCount);
    state.finalSelection = topPhotos;
    
    // Preload thumbnails for results
    await preloadThumbnails(topPhotos);
    
    elements.finalCount.textContent = `${topPhotos.length} photos selected`;
    
    elements.resultsGrid.innerHTML = topPhotos.map((photo, index) => `
        <div class="result-photo" data-id="${photo.id}">
            <span class="photo-rank">#${index + 1}</span>
            <span class="photo-rating">⭐ ${Math.round(photo.elo)}</span>
            <img src="${state.thumbnailCache.get(photo.id) || ''}" alt="${photo.name}">
            <span class="photo-name">${photo.name}</span>
        </div>
    `).join('');
    
    // Add click handlers for viewing
    elements.resultsGrid.querySelectorAll('.result-photo').forEach(el => {
        el.addEventListener('click', () => openPhotoViewer(el.dataset.id));
    });
}

function copyFilenames() {
    const filenames = state.finalSelection.map(p => p.name).join('\n');
    navigator.clipboard.writeText(filenames).then(() => {
        alert('Filenames copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy filenames.');
    });
}

function downloadList() {
    const content = state.finalSelection.map((p, i) => 
        `${i + 1}. ${p.path || p.name} (Rating: ${Math.round(p.elo)})`
    ).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selected-photos.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function startOver() {
    // Clean up blob URLs to free memory
    state.thumbnailCache.forEach(url => URL.revokeObjectURL(url));
    state.fullSizeCache.forEach(url => URL.revokeObjectURL(url));
    
    // Delete session cache
    deleteSessionFromFolder();
    clearFolderHandle();
    
    state.dirHandle = null;
    state.allPhotos = [];
    state.candidates = [];
    state.selectedIds.clear();
    state.thumbnailCache.clear();
    state.fullSizeCache.clear();
    state.clusterFingerprints.clear();
    state.clusters = [];
    state.expandedClusters.clear();
    state.currentPhase = 'selection';
    
    showScreen('landing-screen');
}

// ============================================
// Photo Viewer
// ============================================

async function openPhotoViewer(photoId) {
    const photo = state.allPhotos.find(p => p.id === photoId) || 
                  state.candidates.find(p => p.id === photoId);
    
    if (!photo) return;
    
    elements.viewerFilename.textContent = photo.name;
    elements.photoViewer.classList.remove('hidden');
    
    const url = await getPhotoUrl(photo);
    elements.viewerImage.src = url;
}

function closePhotoViewer() {
    elements.photoViewer.classList.add('hidden');
    elements.viewerImage.src = '';
}

// ============================================
// Import Selection
// ============================================

function openImportModal() {
    importMode = 'selection';
    elements.importModal.classList.remove('hidden');
    elements.importTextarea.value = '';
    elements.importTextarea.focus();
    updateImportPreview();
}

function closeImportModal() {
    elements.importModal.classList.add('hidden');
    importMode = 'selection'; // Reset mode
}

// Parse import text - supports multiple formats:
// 1. Plain numbers: "123 456 789" or "123, 456, 789" or "123/456/789"
// 2. Export format: "1. DSC_1234.jpg (Rating: 1623, Comparisons: 8)"
// 3. Just filenames: "DSC_1234.jpg"
function parseImportData(text) {
    const lines = text.split('\n');
    const filenames = [];
    const numbers = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Try to match export format: "1. filename.jpg (Rating: ...)"
        const exportMatch = trimmed.match(/^\d+\.\s+(.+?)\s+\(Rating:/);
        if (exportMatch) {
            filenames.push(exportMatch[1].trim());
            continue;
        }
        
        // Try to match just a filename (contains a dot and image extension)
        const filenameMatch = trimmed.match(/^([^(]+\.(jpg|jpeg|png|gif|webp|bmp|tiff|tif|heic|heif|raw|cr2|nef|arw))$/i);
        if (filenameMatch) {
            filenames.push(filenameMatch[1].trim());
            continue;
        }
        
        // Otherwise extract numbers from the line
        const lineNumbers = trimmed.match(/\d+/g);
        if (lineNumbers) {
            numbers.push(...lineNumbers.map(n => parseInt(n, 10)));
        }
    }
    
    return {
        filenames: [...new Set(filenames)],
        numbers: [...new Set(numbers)].sort((a, b) => a - b)
    };
}

// Legacy function for preview (show count of detected items)
function parseImportNumbers(text) {
    const { filenames, numbers } = parseImportData(text);
    // For backwards compatibility, return numbers if no filenames found
    if (filenames.length > 0) {
        return filenames; // Return filenames as the "matches"
    }
    return numbers;
}

function updateImportPreview() {
    const text = elements.importTextarea.value;
    const { filenames, numbers } = parseImportData(text);
    
    if (filenames.length > 0 && numbers.length > 0) {
        elements.importPreview.textContent = `${filenames.length} filenames + ${numbers.length} numbers detected`;
        elements.importPreview.style.color = 'var(--success)';
    } else if (filenames.length > 0) {
        elements.importPreview.textContent = `${filenames.length} filenames detected`;
        elements.importPreview.style.color = 'var(--success)';
    } else if (numbers.length > 0) {
        elements.importPreview.textContent = `${numbers.length} numbers detected`;
        elements.importPreview.style.color = 'var(--success)';
    } else {
        elements.importPreview.textContent = '0 items detected';
        elements.importPreview.style.color = 'var(--text-muted)';
    }
}

function matchPhotoByImportData(photo, filenames, numbers) {
    // First try exact filename match
    if (filenames.includes(photo.name)) {
        return true;
    }
    
    // Then try number matching in filename
    if (numbers.length > 0) {
        const filenameNumbers = photo.name.match(/\d+/g);
        if (filenameNumbers) {
            const photoNumbers = filenameNumbers.map(n => parseInt(n, 10));
            for (const importedNum of numbers) {
                if (photoNumbers.includes(importedNum)) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

function confirmImport() {
    // Route to appropriate handler based on mode
    if (importMode === 'ranking') {
        confirmImportForRanking();
        return;
    }
    
    const text = elements.importTextarea.value;
    const { filenames, numbers } = parseImportData(text);
    
    if (filenames.length === 0 && numbers.length === 0) {
        closeImportModal();
        return;
    }
    
    // Apply the selection immediately
    let matchCount = 0;
    
    for (const photo of state.allPhotos) {
        if (matchPhotoByImportData(photo, filenames, numbers)) {
            state.selectedIds.add(photo.id);
            matchCount++;
        }
    }
    
    closeImportModal();
    
    // Update the UI
    updateSelectionStats();
    
    // Update grid view if visible
    elements.selectionGrid.querySelectorAll('.selection-photo').forEach(el => {
        if (state.selectedIds.has(el.dataset.id)) {
            el.classList.add('selected');
        }
    });
    
    // Update swipe view badge
    const currentPhoto = state.allPhotos[state.swipeIndex];
    if (currentPhoto && state.selectedIds.has(currentPhoto.id)) {
        elements.swipeBadge.classList.remove('hidden');
        elements.swipeSelectBtn.innerHTML = 'Deselect Photo <kbd>Space</kbd>';
    }
    
    // Show feedback
    const totalItems = filenames.length + numbers.length;
    console.log(`📥 Imported selection: matched ${matchCount} photos from ${totalItems} items`);
    
    // Update button to show result
    elements.importSelectionBtn.textContent = `✓ ${matchCount} matched`;
    elements.importSelectionBtn.style.background = 'var(--success)';
    elements.importSelectionBtn.style.color = 'white';
    
    // Reset button after a few seconds
    setTimeout(() => {
        elements.importSelectionBtn.textContent = '📥 Import';
        elements.importSelectionBtn.style.background = '';
        elements.importSelectionBtn.style.color = '';
    }, 3000);
}

// Track which mode triggered the import modal
let importMode = 'selection'; // 'selection' or 'ranking'

function openImportModalForRanking() {
    importMode = 'ranking';
    elements.importModal.classList.remove('hidden');
    elements.importTextarea.value = '';
    elements.importTextarea.focus();
    updateImportPreview();
}

function confirmImportForRanking() {
    const text = elements.importTextarea.value;
    const { filenames, numbers } = parseImportData(text);
    
    if (filenames.length === 0 && numbers.length === 0) {
        closeImportModal();
        return;
    }
    
    // Find matching photos that are NOT already candidates
    const existingCandidateIds = new Set(state.candidates.map(c => c.id));
    let matchCount = 0;
    let addedCount = 0;
    
    for (const photo of state.allPhotos) {
        if (matchPhotoByImportData(photo, filenames, numbers)) {
            matchCount++;
            
            // Add to candidates if not already there
            if (!existingCandidateIds.has(photo.id)) {
                state.candidates.push({
                    ...photo,
                    elo: ELO_DEFAULT,
                    comparisons: 0
                });
                state.selectedIds.add(photo.id);
                addedCount++;
            }
        }
    }
    
    closeImportModal();
    
    // Update ranking UI
    elements.rankingPool.textContent = `Candidates: ${state.candidates.length}`;
    
    // Show feedback
    console.log(`📥 Ranking import: matched ${matchCount}, added ${addedCount} new candidates`);
    
    elements.rankingImportBtn.textContent = `✓ +${addedCount} added`;
    elements.rankingImportBtn.style.background = 'var(--success)';
    elements.rankingImportBtn.style.color = 'white';
    
    setTimeout(() => {
        elements.rankingImportBtn.textContent = '📥 Import';
        elements.rankingImportBtn.style.background = '';
        elements.rankingImportBtn.style.color = '';
    }, 3000);
    
    scheduleSave();
}

function addMoreCandidates() {
    // Go back to selection phase but keep existing candidates
    state.currentPhase = 'selection';
    
    // Make sure all current candidates are marked as selected
    for (const candidate of state.candidates) {
        state.selectedIds.add(candidate.id);
    }
    
    showScreen('selection-screen');
    
    // Render the appropriate view
    if (state.viewMode === 'swipe') {
        renderSwipeView();
    } else if (state.viewMode === 'cluster') {
        renderClusterView();
    } else {
        renderSelectionPage();
    }
    
    updateSelectionStats();
}

function returnToRankingWithNewCandidates() {
    // Called when user proceeds from selection after adding more
    // Find newly selected photos that aren't already candidates
    const existingCandidateIds = new Set(state.candidates.map(c => c.id));
    
    for (const id of state.selectedIds) {
        if (!existingCandidateIds.has(id)) {
            const photo = state.allPhotos.find(p => p.id === id);
            if (photo) {
                state.candidates.push({
                    ...photo,
                    elo: ELO_DEFAULT,
                    comparisons: 0
                });
            }
        }
    }
    
    state.currentPhase = 'ranking';
    
    elements.rankingPool.textContent = `Candidates: ${state.candidates.length}`;
    showScreen('ranking-screen');
    showNextComparison();
    
    scheduleSave();
}

// ============================================
// Export Candidates as Zip
// ============================================

async function exportCandidatesAsZip() {
    if (state.candidates.length === 0) {
        alert('No candidates to export.');
        return;
    }
    
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
        alert('Zip library not loaded. Please check your internet connection and reload.');
        return;
    }
    
    const btn = elements.exportCandidatesBtn;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Preparing...';
    
    try {
        const zip = new JSZip();
        const candidates = state.candidates;
        
        // Create filenames list (sorted by Elo rating)
        const sortedCandidates = [...candidates].sort((a, b) => b.elo - a.elo);
        const filenamesList = sortedCandidates.map((photo, index) => 
            `${index + 1}. ${photo.name} (Rating: ${Math.round(photo.elo)}, Comparisons: ${photo.comparisons || 0})`
        ).join('\n');
        
        // Add the text file with filenames
        const header = `A-Shot Picker - Candidate Photos Export
Generated: ${new Date().toLocaleString()}
Total Candidates: ${candidates.length}
Target Selection: ${state.targetCount}

Ranked by Elo Rating:
${'='.repeat(50)}

`;
        zip.file('_filenames.txt', header + filenamesList);
        
        // Add each photo to the zip
        for (let i = 0; i < candidates.length; i++) {
            const photo = candidates[i];
            
            btn.textContent = `📦 ${i + 1}/${candidates.length}`;
            
            try {
                const file = await photo.handle.getFile();
                const arrayBuffer = await file.arrayBuffer();
                
                // Preserve original filename
                zip.file(photo.name, arrayBuffer);
            } catch (err) {
                console.warn(`Failed to add ${photo.name} to zip:`, err);
            }
            
            // Allow UI to update every 10 files
            if (i % 10 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }
        
        btn.textContent = '⏳ Compressing...';
        
        // Generate the zip file
        const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        }, (metadata) => {
            // Progress callback
            btn.textContent = `📦 ${Math.round(metadata.percent)}%`;
        });
        
        // Create download link
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ashot-candidates-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        btn.textContent = '✓ Exported!';
        btn.style.background = 'var(--success)';
        btn.style.color = 'white';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
            btn.style.color = '';
            btn.disabled = false;
        }, 3000);
        
    } catch (err) {
        console.error('Export failed:', err);
        alert('Export failed: ' + err.message);
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function exportAshotsAsZip() {
    if (state.candidates.length === 0) {
        alert('No candidates to export.');
        return;
    }
    
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
        alert('Zip library not loaded. Please check your internet connection and reload.');
        return;
    }
    
    const btn = elements.exportAshotsBtn;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Preparing...';
    
    try {
        const zip = new JSZip();
        
        // Get top N by Elo rating (the A-shots)
        const sortedCandidates = [...state.candidates].sort((a, b) => b.elo - a.elo);
        const ashots = sortedCandidates.slice(0, state.targetCount);
        
        // Create filenames list
        const filenamesList = ashots.map((photo, index) => 
            `${index + 1}. ${photo.name} (Rating: ${Math.round(photo.elo)}, Comparisons: ${photo.comparisons || 0})`
        ).join('\n');
        
        // Add the text file with filenames
        const header = `A-Shot Picker - Selected A-Shots Export
Generated: ${new Date().toLocaleString()}
Total A-Shots: ${ashots.length}
Total Candidates: ${state.candidates.length}
Comparisons Done: ${state.comparisonsCompleted}

Top ${ashots.length} Photos by Elo Rating:
${'='.repeat(50)}

`;
        zip.file('_ashots.txt', header + filenamesList);
        
        // Add each A-shot photo to the zip
        for (let i = 0; i < ashots.length; i++) {
            const photo = ashots[i];
            
            btn.textContent = `📦 ${i + 1}/${ashots.length}`;
            
            try {
                const file = await photo.handle.getFile();
                const arrayBuffer = await file.arrayBuffer();
                
                // Preserve original filename
                zip.file(photo.name, arrayBuffer);
            } catch (err) {
                console.warn(`Failed to add ${photo.name} to zip:`, err);
            }
            
            // Allow UI to update
            if (i % 5 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }
        
        btn.textContent = '⏳ Compressing...';
        
        // Generate the zip file
        const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        }, (metadata) => {
            btn.textContent = `📦 ${Math.round(metadata.percent)}%`;
        });
        
        // Create download link
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ashots-top${ashots.length}-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        btn.textContent = '✓ Exported!';
        btn.style.background = 'var(--success)';
        btn.style.color = 'white';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
            btn.style.color = '';
            btn.disabled = false;
        }, 3000);
        
    } catch (err) {
        console.error('Export failed:', err);
        alert('Export failed: ' + err.message);
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ============================================
// Top Ranked Preview
// ============================================

async function openTopRankedPreview() {
    // Sort candidates by Elo rating
    const sorted = [...state.candidates].sort((a, b) => b.elo - a.elo);
    const topN = sorted.slice(0, state.targetCount);
    
    // Preload thumbnails
    await preloadThumbnails(topN);
    
    // Render the grid
    elements.topRankedGrid.innerHTML = topN.map((photo, index) => `
        <div class="top-ranked-photo" data-id="${photo.id}" title="${photo.name}">
            <img src="${state.thumbnailCache.get(photo.id) || ''}" alt="${photo.name}">
            <span class="rank-badge">#${index + 1}</span>
            <span class="elo-badge">${Math.round(photo.elo)}</span>
        </div>
    `).join('');
    
    // Add click handlers for viewing full size
    elements.topRankedGrid.querySelectorAll('.top-ranked-photo').forEach(el => {
        el.addEventListener('click', () => {
            openPhotoViewer(el.dataset.id);
        });
    });
    
    elements.topRankedModal.classList.remove('hidden');
}

function closeTopRankedPreview() {
    elements.topRankedModal.classList.add('hidden');
}

// ============================================
// Keyboard Shortcuts
// ============================================

document.addEventListener('keydown', (e) => {
    // Ranking screen shortcuts
    if (document.getElementById('ranking-screen').classList.contains('active')) {
        // Number keys 1-2 to select
        if (e.key === '1' && state.currentPair?.[0]) {
            toggleRankingSelection(state.currentPair[0].id);
        }
        if (e.key === '2' && state.currentPair?.[1]) {
            toggleRankingSelection(state.currentPair[1].id);
        }
        
        // Enter to confirm
        if (e.key === 'Enter' && state.currentSelection.size > 0) {
            confirmComparison();
        }
        
        // S to skip (tie)
        if (e.key === 's' || e.key === 'S') {
            skipComparison();
        }
        
        // Z to undo
        if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            undoComparison();
        }
    }
    
    // Selection screen shortcuts
    if (document.getElementById('selection-screen').classList.contains('active')) {
        if (state.viewMode === 'grid') {
            // Arrow keys for pagination in grid mode
            if (e.key === 'ArrowLeft') {
                selectionPrevPage();
            }
            if (e.key === 'ArrowRight') {
                selectionNextPage();
            }
        } else {
            // Swipe mode keyboard controls
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                swipePrev();
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                swipeNext();
            }
            if (e.key === ' ') {
                e.preventDefault();
                swipeToggleSelect();
            }
            if (e.key === 'Enter' && state.selectedIds.size >= state.targetCount) {
                startRankingPhase();
            }
        }
    }
    
    // Photo viewer
    if (!elements.photoViewer.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closePhotoViewer();
        }
    }
    
    // Import modal
    if (!elements.importModal.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closeImportModal();
        }
    }
    
    // Top ranked preview modal
    if (!elements.topRankedModal.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closeTopRankedPreview();
        }
    }
});

// ============================================
// Event Listeners
// ============================================

// Landing
elements.selectFolderBtn.addEventListener('click', selectFolder);

// Selection (Phase 1)
elements.selectionPrev.addEventListener('click', selectionPrevPage);
elements.selectionNext.addEventListener('click', selectionNextPage);
elements.viewSelectedBtn.addEventListener('click', showSelectedReview);
elements.proceedToRanking.addEventListener('click', startRankingPhase);
elements.gridViewBtn.addEventListener('click', () => setViewMode('grid'));
elements.swipeViewBtn.addEventListener('click', () => setViewMode('swipe'));
elements.clusterViewBtn.addEventListener('click', () => setViewMode('cluster'));

// Cluster view threshold slider
elements.clusterThresholdSlider.addEventListener('input', (e) => {
    state.clusterThreshold = parseInt(e.target.value);
    document.getElementById('threshold-value').textContent = state.clusterThreshold;
});
elements.clusterThresholdSlider.addEventListener('change', () => {
    // Re-cluster when slider is released
    if (state.clusterFingerprints.size > 0) {
        recluster();
    }
});

// Swipe view
elements.swipePrev.addEventListener('click', swipePrev);
elements.swipeNext.addEventListener('click', swipeNext);
elements.swipeSelectBtn.addEventListener('click', swipeToggleSelect);

// Selection sidebar
elements.sidebarClear.addEventListener('click', clearAllSelections);

// Review
elements.backToSelection.addEventListener('click', backToSelection);
elements.startRanking.addEventListener('click', startRankingPhase);

// Ranking (Phase 2)
elements.skipComparison.addEventListener('click', skipComparison);
elements.undoComparison.addEventListener('click', undoComparison);
elements.confirmRanking.addEventListener('click', confirmComparison);
elements.finishRanking.addEventListener('click', finishRanking);
elements.rankingImportBtn.addEventListener('click', openImportModalForRanking);
elements.addMoreCandidatesBtn.addEventListener('click', addMoreCandidates);
elements.exportCandidatesBtn.addEventListener('click', exportCandidatesAsZip);
elements.exportAshotsBtn.addEventListener('click', exportAshotsAsZip);

// Results
elements.copyFilenames.addEventListener('click', copyFilenames);
elements.downloadList.addEventListener('click', downloadList);
elements.continueRanking.addEventListener('click', continueRanking);

// Photo viewer
elements.closeViewer.addEventListener('click', closePhotoViewer);
elements.photoViewer.addEventListener('click', (e) => {
    if (e.target === elements.photoViewer) {
        closePhotoViewer();
    }
});

// Import modal
elements.importSelectionBtn.addEventListener('click', openImportModal);
elements.importModalClose.addEventListener('click', closeImportModal);
elements.importModal.addEventListener('click', (e) => {
    if (e.target === elements.importModal) {
        closeImportModal();
    }
});
elements.importTextarea.addEventListener('input', updateImportPreview);
elements.importConfirmBtn.addEventListener('click', confirmImport);

// File input for loading .txt files
elements.importFileBtn.addEventListener('click', () => {
    elements.importFileInput.click();
});
elements.importFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            const text = await file.text();
            elements.importTextarea.value = text;
            elements.importFileName.textContent = file.name;
            updateImportPreview();
        } catch (err) {
            console.error('Error reading file:', err);
            alert('Error reading file: ' + err.message);
        }
    }
    // Reset the input so the same file can be selected again
    e.target.value = '';
});

// Top ranked preview modal
elements.previewTopBtn.addEventListener('click', openTopRankedPreview);
elements.topRankedClose.addEventListener('click', closeTopRankedPreview);
elements.topRankedModal.addEventListener('click', (e) => {
    if (e.target === elements.topRankedModal) {
        closeTopRankedPreview();
    }
});

// ============================================
// Initialize
// ============================================

async function init() {
    console.log('📸 A-Shot Picker initialized (Swiss-System + Elo Rating)');
    
    // Try to restore last session from browser storage
    try {
        const savedHandle = await loadFolderHandle();
        if (savedHandle) {
            // Verify we still have permission
            const permissionStatus = await savedHandle.queryPermission({ mode: 'readwrite' });
            
            if (permissionStatus === 'granted') {
                // We have permission, automatically load
                console.log('📁 Found saved folder, restoring session...');
                await loadPhotosFromDirectory(savedHandle);
                return;
            } else if (permissionStatus === 'prompt') {
                // Need to ask for permission - show a button
                const resumeBtn = document.createElement('button');
                resumeBtn.className = 'secondary-btn';
                resumeBtn.innerHTML = '🔄 Resume Last Session';
                resumeBtn.style.marginTop = '1rem';
                resumeBtn.addEventListener('click', async () => {
                    // Request permission
                    const newPermission = await savedHandle.requestPermission({ mode: 'readwrite' });
                    if (newPermission === 'granted') {
                        await loadPhotosFromDirectory(savedHandle);
                    } else {
                        await clearFolderHandle();
                        resumeBtn.remove();
                    }
                });
                
                // Add the button after the select folder button
                elements.selectFolderBtn.parentNode.insertBefore(
                    resumeBtn, 
                    elements.selectFolderBtn.nextSibling
                );
            }
        }
    } catch (err) {
        console.warn('Failed to restore session:', err);
    }
}

// Run initialization
init();
