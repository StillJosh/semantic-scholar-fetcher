/**
 * Semantic Scholar Plugin for Zotero 7
 * Main plugin orchestration - UI, columns, sections, menus, and preferences
 */

var SemanticScholar = {
	id: null,
	version: null,
	rootURI: null,
	initialized: false,
	addedElementIDs: [],
	notifierID: null,
	sectionID: null,
	
	/**
	 * Initialize the plugin
	 */
	init({ id, version, rootURI }) {
		if (this.initialized) return;
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
		this.initialized = true;
		
		// Initialize the API module
		SemanticScholarAPI.init();
	},
	
	/**
	 * Log a message with plugin prefix
	 */
	log(msg) {
		Zotero.debug("Semantic Scholar: " + msg);
	},
	
	// ============================================
	// Preferences
	// ============================================
	
	/**
	 * Get a preference value with default
	 */
	getPref(key, defaultValue) {
		const fullKey = `extensions.zotero.semanticScholar.${key}`;
		try {
			const value = Zotero.Prefs.get(fullKey, true);
			if (value === undefined) {
				return defaultValue;
			}
			return value;
		} catch (e) {
			this.log(`Error getting pref ${fullKey}: ${e}`);
			return defaultValue;
		}
	},
	
	/**
	 * Set a preference value
	 */
	setPref(key, value) {
		Zotero.Prefs.set(`extensions.zotero.semanticScholar.${key}`, value, true);
	},
	
	/**
	 * Get search mode preference
	 */
	getSearchMode() {
		return this.getPref('searchMode', 'identifiers');
	},
	
	/**
	 * Check if a field should be fetched based on preferences
	 */
	shouldFetchField(fieldName) {
		const fieldInfo = SemanticScholarAPI.AVAILABLE_FIELDS[fieldName];
		if (!fieldInfo) {
			this.log(`shouldFetchField: Unknown field ${fieldName}`);
			return false;
		}
		return this.getPref(`fetch.${fieldName}`, fieldInfo.default);
	},
	
	// ============================================
	// Column Registration
	// ============================================
	
	/**
	 * Register custom columns for citation counts
	 */
	async registerColumn() {
		await Zotero.ItemTreeManager.registerColumns({
			dataKey: "citationCount",
			label: "Citations",
			pluginID: this.id,
			dataProvider: (item, dataKey) => {
				return ItemUtils.getCitationCount(item);
			}
		});
		
		await Zotero.ItemTreeManager.registerColumns({
			dataKey: "influentialCitationCount",
			label: "Influential Citations",
			pluginID: this.id,
			dataProvider: (item, dataKey) => {
				return ItemUtils.getInfluentialCitationCount(item);
			}
		});
		
		this.log("Registered columns");
	},
	
	/**
	 * Unregister custom columns
	 */
	async unregisterColumn() {
		await Zotero.ItemTreeManager.unregisterColumns("citationCount");
		await Zotero.ItemTreeManager.unregisterColumns("influentialCitationCount");
		this.log("Unregistered columns");
	},
	
	// ============================================
	// Item Pane Section
	// ============================================
	
	/**
	 * Register the item pane section
	 */
	registerSection() {
		const self = this;
		
		this.sectionID = Zotero.ItemPaneManager.registerSection({
			paneID: "semantic-scholar-section",
			pluginID: this.id,
			header: {
				l10nID: "semantic-scholar-section-header",
				icon: "chrome://zotero/skin/16/universal/bookmark.svg",
			},
			sidenav: {
				l10nID: "semantic-scholar-section-sidenav",
				icon: "chrome://zotero/skin/20/universal/bookmark.svg",
			},
			bodyXHTML: `
				<div id="semantic-scholar-container" xmlns="http://www.w3.org/1999/xhtml">
					<div class="ss-row"><span class="ss-label">Citation Count</span><span id="ss-citation-count" class="ss-value">--</span></div>
					<div class="ss-row"><span class="ss-label">Influential Citations</span><span id="ss-influential-count" class="ss-value">--</span></div>
					<div class="ss-row"><span class="ss-label">Reference Count</span><span id="ss-reference-count" class="ss-value">--</span></div>
					<div class="ss-row"><span class="ss-label">Semantic Scholar ID</span><span id="ss-paper-id" class="ss-value ss-id">--</span></div>
					<div class="ss-row"><span class="ss-label">Last Updated</span><span id="ss-updated" class="ss-value">--</span></div>
					<div class="ss-actions">
						<button id="ss-refresh-btn" class="ss-btn">Refresh</button>
						<button id="ss-view-btn" class="ss-btn">View on Semantic Scholar</button>
					</div>
					<style>
						#semantic-scholar-container { padding: 12px 8px; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; }
						.ss-row { display: flex; flex-direction: column; gap: 4px; padding: 10px 0; border-bottom: 1px solid var(--fill-quinary, #e0e0e0); }
						.ss-row:last-of-type { border-bottom: none; }
						.ss-label { font-weight: 500; color: var(--fill-secondary, #666); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
						.ss-value { font-weight: 600; color: var(--fill-primary, #333); font-size: 14px; word-break: break-all; }
						.ss-id { font-family: monospace; font-size: 11px; font-weight: 400; opacity: 0.8; }
						.ss-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--fill-quinary, #e0e0e0); }
						.ss-btn { padding: 8px 12px; border: 1px solid var(--fill-quinary, #ccc); border-radius: 4px; background: var(--material-button, #f5f5f5); cursor: pointer; font-size: 12px; text-align: center; }
						.ss-btn:hover { background: var(--fill-quinary, #e8e8e8); }
						.ss-btn:disabled { opacity: 0.5; cursor: not-allowed; }
					</style>
				</div>
			`,
			onRender: ({ body, item, editable, tabType }) => {
				if (!item || !item.isRegularItem()) {
					body.textContent = "Select a regular item to view Semantic Scholar data.";
					return;
				}
				
				const citationCount = ItemUtils.getCitationCount(item);
				const influentialCount = ItemUtils.getInfluentialCitationCount(item);
				const referenceCount = ItemUtils.getReferenceCount(item);
				const scholarId = ItemUtils.getScholarId(item);
				const lastUpdated = ItemUtils.getLastUpdated(item);
				
				const countEl = body.querySelector('#ss-citation-count');
				const influentialEl = body.querySelector('#ss-influential-count');
				const referenceEl = body.querySelector('#ss-reference-count');
				const scholarIdEl = body.querySelector('#ss-paper-id');
				const updatedEl = body.querySelector('#ss-updated');
				const refreshBtn = body.querySelector('#ss-refresh-btn');
				const viewBtn = body.querySelector('#ss-view-btn');
				
				if (countEl) countEl.textContent = citationCount || '--';
				if (influentialEl) influentialEl.textContent = influentialCount || '--';
				if (referenceEl) referenceEl.textContent = referenceCount || '--';
				if (scholarIdEl) scholarIdEl.textContent = scholarId || '--';
				if (updatedEl) updatedEl.textContent = lastUpdated || '--';
				
				if (refreshBtn) {
					refreshBtn.onclick = async () => {
						refreshBtn.disabled = true;
						refreshBtn.textContent = 'Fetching...';
						
						try {
							const result = await self.fetchDataForItem(item);
							if (result.data) {
								await self.applyDataToItem(item, result.data);
								if (countEl) countEl.textContent = result.data.citationCount?.toString() || '--';
								if (influentialEl) influentialEl.textContent = result.data.influentialCitationCount?.toString() || '--';
								if (referenceEl) referenceEl.textContent = result.data.referenceCount?.toString() || '--';
								if (scholarIdEl && result.data.paperId) scholarIdEl.textContent = result.data.paperId;
								if (updatedEl) updatedEl.textContent = new Date().toLocaleDateString();
							} else if (result.rateLimited) {
								SemanticScholarAPI.addToRetryQueue(item);
								if (countEl) countEl.textContent = 'Rate limited, queued';
								// Process retry queue
								SemanticScholarAPI.processRetryQueue(
									(i) => self.fetchDataForItem(i),
									(i, data) => self.applyDataToItem(i, data)
								);
							}
						} catch (e) {
							self.log(`Error refreshing: ${e.message}`);
						}
						
						refreshBtn.disabled = false;
						refreshBtn.textContent = 'Refresh';
					};
				}
				
				if (viewBtn) {
					if (scholarId) {
						viewBtn.onclick = () => {
							Zotero.launchURL(`https://www.semanticscholar.org/paper/${scholarId}`);
						};
						viewBtn.disabled = false;
					} else {
						viewBtn.disabled = true;
					}
				}
			},
		});
		
		this.log("Registered item pane section");
	},
	
	/**
	 * Unregister the item pane section
	 */
	unregisterSection() {
		if (this.sectionID) {
			Zotero.ItemPaneManager.unregisterSection(this.sectionID);
			this.sectionID = null;
			this.log("Unregistered item pane section");
		}
	},
	
	/**
	 * Register the preferences pane
	 */
	registerPrefsPane() {
		Zotero.PreferencePanes.register({
			pluginID: this.id,
			src: "prefs.xhtml",
			label: "Semantic Scholar Fetcher",
			image: "chrome://zotero/skin/16/universal/bookmark.svg"
		});
		this.log("Registered preferences pane");
	},
	
	// ============================================
	// Data Fetching
	// ============================================
	
	/**
	 * Fetch data for a single item using all available identifiers
	 */
	async fetchDataForItem(item) {
		if (!item || !item.isRegularItem()) {
			return { data: null, rateLimited: false };
		}
		
		const fields = SemanticScholarAPI.buildFieldsParam(
			(fieldName) => this.shouldFetchField(fieldName)
		);
		const searchMode = this.getSearchMode();
		
		try {
			// Try DOI first
			const doi = ItemUtils.getDOI(item);
			if (doi) {
				const result = await SemanticScholarAPI.fetchByDOI(doi, fields);
				if (result.rateLimited) return result;
				if (result.data) return result;
			}
			
			// Try arXiv ID
			const arxivId = ItemUtils.getArxivId(item);
			if (arxivId) {
				const result = await SemanticScholarAPI.fetchByArxivId(arxivId, fields);
				if (result.rateLimited) return result;
				if (result.data) return result;
			}
			
			// Try PMID
			const pmid = ItemUtils.getPMID(item);
			if (pmid) {
				const result = await SemanticScholarAPI.fetchByPMID(pmid, fields);
				if (result.rateLimited) return result;
				if (result.data) return result;
			}
			
			// Try existing Scholar ID
			const scholarId = ItemUtils.getScholarId(item);
			if (scholarId) {
				const result = await SemanticScholarAPI.fetchByScholarId(scholarId, fields);
				if (result.rateLimited) return result;
				if (result.data) return result;
			}
			
			// Fall back to title search only if enabled
			if (searchMode === 'title') {
				const title = item.getField('title');
				if (title) {
					return await SemanticScholarAPI.fetchByTitle(
						title, 
						fields,
						(t) => ItemUtils.normalizeTitle(t),
						(t1, t2) => ItemUtils.isSimilarTitle(t1, t2)
					);
				}
			}
			
			return { data: null, rateLimited: false };
		} catch (error) {
			this.log(`Error fetching data: ${error.message}`);
			return { data: null, rateLimited: false };
		}
	},
	
	/**
	 * Apply fetched data to an item
	 */
	async applyDataToItem(item, data) {
		const overwriteExisting = this.getPref('overwriteExistingFields', false);
		await ItemUtils.applyDataToItem(
			item, 
			data, 
			(fieldName) => this.shouldFetchField(fieldName),
			overwriteExisting,
			(msg) => this.log(msg)
		);
	},
	
	/**
	 * Batch fetch for items with known Scholar IDs
	 */
	async batchFetchByScholarIds(items) {
		const itemsWithIds = [];
		for (const item of items) {
			const scholarId = ItemUtils.getScholarId(item);
			if (scholarId) {
				itemsWithIds.push({ item, scholarId });
			}
		}
		
		if (itemsWithIds.length === 0) {
			return { results: new Map(), rateLimited: false };
		}
		
		const fields = SemanticScholarAPI.buildFieldsParam(
			(fieldName) => this.shouldFetchField(fieldName)
		);
		
		const ids = itemsWithIds.map(i => i.scholarId);
		const { results: apiResults, rateLimited } = await SemanticScholarAPI.batchFetch(ids, fields);
		
		// Map results back to items
		const results = new Map();
		for (let i = 0; i < itemsWithIds.length && i < apiResults.length; i++) {
			const { item } = itemsWithIds[i];
			const paperData = apiResults[i];
			if (paperData) {
				results.set(item.id, paperData);
			}
		}
		
		return { results, rateLimited };
	},
	
	/**
	 * Fetch for selected items in the library
	 */
	async fetchForSelectedItems() {
		const zoteroPane = Zotero.getActiveZoteroPane();
		const items = zoteroPane.getSelectedItems();
		
		if (!items || items.length === 0) {
			this.log("No items selected");
			return;
		}
		
		const regularItems = items.filter(item => item.isRegularItem());
		
		if (regularItems.length === 0) {
			this.log("No regular items selected");
			return;
		}
		
		this.log(`Fetching data for ${regularItems.length} items`);
		
		const progressWin = new Zotero.ProgressWindow({ closeOnClick: true });
		progressWin.changeHeadline("Fetching Semantic Scholar Data");
		progressWin.show();
		
		let successCount = 0;
		let failCount = 0;
		let rateLimitedCount = 0;
		
		try {
			// Batch fetch for items with known Scholar IDs
			const { results: batchResults, rateLimited: batchRateLimited } = 
				await this.batchFetchByScholarIds(regularItems);
			
			// Apply batch results
			for (const [itemId, data] of batchResults) {
				const item = regularItems.find(i => i.id === itemId);
				if (item) {
					await this.applyDataToItem(item, data);
					successCount++;
				}
			}
			
			// Process remaining items individually
			const itemsToFetch = regularItems.filter(item => !batchResults.has(item.id));
			this.log(`${batchResults.size} items updated via batch, ${itemsToFetch.length} remaining`);
			
			for (let i = 0; i < itemsToFetch.length; i++) {
				const item = itemsToFetch[i];
				
				progressWin.changeHeadline(`Processing ${i + 1}/${itemsToFetch.length}...`);
				
				const result = await this.fetchDataForItem(item);
				
				if (result.rateLimited) {
					SemanticScholarAPI.addToRetryQueue(item);
					rateLimitedCount++;
				} else if (result.data) {
					await this.applyDataToItem(item, result.data);
					successCount++;
				} else {
					failCount++;
				}
				
				if (i < itemsToFetch.length - 1) {
					await Zotero.Promise.delay(200);
				}
			}
		} catch (e) {
			this.log(`Error during batch fetch: ${e}`, 'error');
			failCount = regularItems.length - successCount;
		}
		
		let message = `Found: ${successCount}, Not found: ${failCount}`;
		if (rateLimitedCount > 0) {
			message += `, Queued: ${rateLimitedCount}`;
		}
		progressWin.changeHeadline(`Semantic Scholar: ${message}`);
		progressWin.startCloseTimer(3000);
		
		// Process retry queue if needed
		if (SemanticScholarAPI.hasQueuedItems()) {
			SemanticScholarAPI.processRetryQueue(
				(item) => this.fetchDataForItem(item),
				(item, data) => this.applyDataToItem(item, data)
			);
		}
	},
	
	/**
	 * Fetch for a single new item (auto-fetch)
	 */
	async fetchForNewItem(item) {
		if (!item || !item.isRegularItem()) return;
		
		const autoFetch = this.getPref('autoFetch', true);
		if (!autoFetch) return;
		
		this.log(`Auto-fetching data for new item: ${item.getField('title')}`);
		
		const result = await this.fetchDataForItem(item);
		
		if (result.rateLimited) {
			SemanticScholarAPI.addToRetryQueue(item);
			SemanticScholarAPI.processRetryQueue(
				(item) => this.fetchDataForItem(item),
				(item, data) => this.applyDataToItem(item, data)
			);
		} else if (result.data) {
			await this.applyDataToItem(item, result.data);
		}
	},
	
	// ============================================
	// Notifier for New Items
	// ============================================
	
	/**
	 * Set up notifier for automatically fetching data for new items
	 */
	setupNotifier() {
		const self = this;
		this.notifierID = Zotero.Notifier.registerObserver(
			{
				notify: async (event, type, ids, extraData) => {
					if (type === 'item' && event === 'add') {
						for (const id of ids) {
							const item = await Zotero.Items.getAsync(id);
							if (item && item.isRegularItem()) {
								await Zotero.Promise.delay(500);
								await self.fetchForNewItem(item);
							}
						}
					}
				}
			},
			['item'],
			'semanticScholar'
		);
		
		this.log("Notifier registered for new items");
	},
	
	/**
	 * Remove the notifier
	 */
	removeNotifier() {
		if (this.notifierID) {
			Zotero.Notifier.unregisterObserver(this.notifierID);
			this.notifierID = null;
			this.log("Notifier unregistered");
		}
	},
	
	// ============================================
	// Window Management
	// ============================================
	
	/**
	 * Add UI elements to a window
	 */
	addToWindow(window) {
		let doc = window.document;
		
		window.MozXULElement.insertFTLIfNeeded("semantic-scholar.ftl");
		
		const menuitem = doc.createXULElement('menuitem');
		menuitem.id = 'semantic-scholar-fetch-menuitem';
		menuitem.setAttribute('label', 'Fetch Semantic Scholar Data');
		menuitem.addEventListener('command', () => {
			SemanticScholar.fetchForSelectedItems();
		});
		
		const itemMenu = doc.getElementById('zotero-itemmenu');
		if (itemMenu) {
			itemMenu.appendChild(menuitem);
			this.storeAddedElement(menuitem);
		}
		
		this.log("Added context menu item");
	},
	
	/**
	 * Add UI elements to all windows
	 */
	addToAllWindows() {
		var windows = Zotero.getMainWindows();
		for (let win of windows) {
			if (!win.ZoteroPane) continue;
			this.addToWindow(win);
		}
	},
	
	/**
	 * Store reference to added element for cleanup
	 */
	storeAddedElement(elem) {
		if (!elem.id) {
			throw new Error("Element must have an id");
		}
		this.addedElementIDs.push(elem.id);
	},
	
	/**
	 * Remove UI elements from a window
	 */
	removeFromWindow(window) {
		var doc = window.document;
		for (let id of this.addedElementIDs) {
			doc.getElementById(id)?.remove();
		}
		doc.querySelector('[href="semantic-scholar.ftl"]')?.remove();
	},
	
	/**
	 * Remove UI elements from all windows
	 */
	removeFromAllWindows() {
		var windows = Zotero.getMainWindows();
		for (let win of windows) {
			if (!win.ZoteroPane) continue;
			this.removeFromWindow(win);
		}
	},
	
	// ============================================
	// Startup Library Update
	// ============================================
	
	/**
	 * Update all library items on startup
	 */
	async updateLibraryOnStartup() {
		const updateOnStartup = this.getPref('updateOnStartup', false);
		if (!updateOnStartup) {
			this.log("Startup library update disabled");
			return;
		}
		
		this.log("Starting library update...");
		
		const libraries = Zotero.Libraries.getAll();
		let updatedItems = 0;
		let failedItems = 0;
		let rateLimitedItems = 0;
		
		const progressWin = new Zotero.ProgressWindow({ closeOnClick: true });
		progressWin.changeHeadline("Updating Semantic Scholar Data");
		progressWin.show();
		
		let allItems = [];
		for (const library of libraries) {
			const libraryID = library.libraryID;
			const items = await Zotero.Items.getAll(libraryID, false, false);
			const regularItems = items.filter(item => item.isRegularItem());
			allItems = allItems.concat(regularItems);
			this.log(`Found ${regularItems.length} items in library ${library.name}`);
		}
		
		const totalItems = allItems.length;
		
		// Separate items with known Scholar IDs from those without
		const itemsWithScholarId = [];
		const itemsWithoutScholarId = [];
		
		for (const item of allItems) {
			const scholarId = ItemUtils.getScholarId(item);
			if (scholarId) {
				itemsWithScholarId.push(item);
			} else {
				itemsWithoutScholarId.push(item);
			}
		}
		
		this.log(`Items with Scholar ID: ${itemsWithScholarId.length}, without: ${itemsWithoutScholarId.length}`);
		
		// Batch fetch items with known Scholar IDs
		if (itemsWithScholarId.length > 0) {
			const { results: batchResults } = await this.batchFetchByScholarIds(itemsWithScholarId);
			
			for (const [itemId, data] of batchResults) {
				const item = itemsWithScholarId.find(i => i.id === itemId);
				if (item) {
					await this.applyDataToItem(item, data);
					updatedItems++;
				}
			}
			
			failedItems += itemsWithScholarId.length - batchResults.size;
			
			progressWin.changeHeadline(`Updated ${updatedItems}/${totalItems}...`);
			this.log(`Batch fetch complete: ${batchResults.size} updated`);
		}
		
		// Individually fetch items without Scholar IDs
		if (itemsWithoutScholarId.length > 0) {
			let searchedCount = 0;
			
			for (const item of itemsWithoutScholarId) {
				const title = item.getField('title');
				searchedCount++;
				progressWin.changeHeadline(`Searching ${searchedCount}/${itemsWithoutScholarId.length} new papers...`);
				
				try {
					const result = await this.fetchDataForItem(item);
					
					if (result.rateLimited) {
						SemanticScholarAPI.addToRetryQueue(item);
						rateLimitedItems++;
						await Zotero.Promise.delay(3000);
					} else if (result.data) {
						await this.applyDataToItem(item, result.data);
						updatedItems++;
						this.log(`Updated: ${title}`);
					} else {
						failedItems++;
					}
				} catch (e) {
					this.log(`Error updating ${title}: ${e.message}`);
					failedItems++;
				}
				
				await Zotero.Promise.delay(500);
			}
		}
		
		let message = `Updated: ${updatedItems}, Failed: ${failedItems}`;
		if (rateLimitedItems > 0) {
			message += `, Queued: ${rateLimitedItems}`;
		}
		progressWin.changeHeadline("Semantic Scholar Updated");
		progressWin.startCloseTimer(5000);
		
		this.log(`Library update complete. ${message}`);
		
		// Process retry queue
		if (SemanticScholarAPI.hasQueuedItems()) {
			SemanticScholarAPI.processRetryQueue(
				(item) => this.fetchDataForItem(item),
				(item, data) => this.applyDataToItem(item, data)
			);
		}
	},
	
	// ============================================
	// Lifecycle
	// ============================================
	
	/**
	 * Main initialization
	 */
	async main() {
		await this.registerColumn();
		this.registerSection();
		this.registerPrefsPane();
		this.setupNotifier();
		
		this.log("Plugin initialized successfully");
		
		// Delay startup update to let Zotero finish loading
		Zotero.Promise.delay(3000).then(() => {
			this.updateLibraryOnStartup();
		});
	},
	
	/**
	 * Shutdown and cleanup
	 */
	async shutdown() {
		await this.unregisterColumn();
		this.unregisterSection();
		this.removeNotifier();
		
		this.log("Plugin shut down");
	}
};
