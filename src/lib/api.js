/**
 * Semantic Scholar API Module
 * Handles all API communication, rate limiting, and retries
 */

var SemanticScholarAPI = {
	// API configuration
	BASE_URL: "https://api.semanticscholar.org/graph/v1",
	
	// Rate limiting state
	retryQueue: [],
	isProcessingRetryQueue: false,
	retryDelay: 2000,
	maxRetryDelay: 60000,
	maxRetries: 5,
	
	// Available fields that can be fetched from the API
	AVAILABLE_FIELDS: {
		// Citation metrics (shown in section)
		citationCount: { label: "Citation Count", type: "metric", default: true },
		influentialCitationCount: { label: "Influential Citation Count", type: "metric", default: true },
		referenceCount: { label: "Reference Count", type: "metric", default: false },
		// Zotero field overwrites
		DOI: { label: "DOI", type: "field", zoteroField: "DOI", default: false },
		abstract: { label: "Abstract", type: "field", zoteroField: "abstractNote", default: false },
		publicationDate: { label: "Publication Date", type: "field", zoteroField: "date", default: false },
		venue: { label: "Publication/Venue", type: "field", zoteroField: "publicationTitle", default: false },
		openAccessPdf: { label: "Open Access PDF URL", type: "field", zoteroField: "url", default: false },
		arXivId: { label: "arXiv ID", type: "extra", default: false },
		fieldsOfStudy: { label: "Fields of Study", type: "extra", default: false },
	},
	
	/**
	 * Initialize the API module
	 */
	init() {
		this.retryQueue = [];
		this.isProcessingRetryQueue = false;
		this.retryDelay = 2000;
	},
	
	/**
	 * Log a message with the API prefix
	 */
	log(msg) {
		Zotero.debug("Semantic Scholar API: " + msg);
	},
	
	/**
	 * Build the fields parameter for API requests based on preferences
	 * @param {Function} shouldFetchField - Function to check if a field should be fetched
	 * @returns {string} Comma-separated list of fields
	 */
	buildFieldsParam(shouldFetchField) {
		const fields = ['paperId', 'citationCount']; // Always fetch these
		
		if (shouldFetchField('influentialCitationCount')) fields.push('influentialCitationCount');
		if (shouldFetchField('referenceCount')) fields.push('referenceCount');
		if (shouldFetchField('DOI')) fields.push('externalIds');
		if (shouldFetchField('arXivId')) fields.push('externalIds');
		if (shouldFetchField('abstract')) fields.push('abstract');
		if (shouldFetchField('publicationDate')) fields.push('publicationDate');
		if (shouldFetchField('venue')) fields.push('venue', 'journal');
		if (shouldFetchField('openAccessPdf')) fields.push('openAccessPdf');
		if (shouldFetchField('fieldsOfStudy')) fields.push('fieldsOfStudy');
		
		// Deduplicate
		return [...new Set(fields)].join(',');
	},
	
	/**
	 * Make an API GET request with rate limit detection
	 * @param {string} url - The URL to request
	 * @returns {Promise<{data: Object|null, rateLimited: boolean}>}
	 */
	async makeRequest(url) {
		try {
			const response = await Zotero.HTTP.request("GET", url, {
				headers: { "Accept": "application/json" },
				timeout: 30000
			});
			
			if (response.status === 429) {
				this.log("Rate limited! Status 429");
				return { data: null, rateLimited: true };
			}
			
			if (response.status !== 200) {
				this.log(`Request failed with status ${response.status}`);
				return { data: null, rateLimited: false };
			}
			
			const data = JSON.parse(response.responseText);
			return { data, rateLimited: false };
		} catch (error) {
			if (error.message && error.message.includes('429')) {
				return { data: null, rateLimited: true };
			}
			this.log(`Request error: ${error.message}`);
			return { data: null, rateLimited: false };
		}
	},
	
	/**
	 * Fetch paper by DOI
	 * @param {string} doi - The DOI to look up
	 * @param {string} fields - Fields to fetch
	 * @returns {Promise<{data: Object|null, rateLimited: boolean}>}
	 */
	async fetchByDOI(doi, fields) {
		this.log(`Fetching by DOI: ${doi}`);
		const url = `${this.BASE_URL}/paper/DOI:${encodeURIComponent(doi)}?fields=${fields}`;
		return await this.makeRequest(url);
	},
	
	/**
	 * Fetch paper by arXiv ID
	 * @param {string} arxivId - The arXiv ID to look up
	 * @param {string} fields - Fields to fetch
	 * @returns {Promise<{data: Object|null, rateLimited: boolean}>}
	 */
	async fetchByArxivId(arxivId, fields) {
		this.log(`Fetching by arXiv ID: ${arxivId}`);
		const url = `${this.BASE_URL}/paper/ARXIV:${encodeURIComponent(arxivId)}?fields=${fields}`;
		return await this.makeRequest(url);
	},
	
	/**
	 * Fetch paper by PMID
	 * @param {string} pmid - The PubMed ID to look up
	 * @param {string} fields - Fields to fetch
	 * @returns {Promise<{data: Object|null, rateLimited: boolean}>}
	 */
	async fetchByPMID(pmid, fields) {
		this.log(`Fetching by PMID: ${pmid}`);
		const url = `${this.BASE_URL}/paper/PMID:${encodeURIComponent(pmid)}?fields=${fields}`;
		return await this.makeRequest(url);
	},
	
	/**
	 * Fetch paper by Semantic Scholar ID
	 * @param {string} scholarId - The Semantic Scholar paper ID
	 * @param {string} fields - Fields to fetch
	 * @returns {Promise<{data: Object|null, rateLimited: boolean}>}
	 */
	async fetchByScholarId(scholarId, fields) {
		this.log(`Fetching by Scholar ID: ${scholarId}`);
		const url = `${this.BASE_URL}/paper/${scholarId}?fields=${fields}`;
		return await this.makeRequest(url);
	},
	
	/**
	 * Search for paper by title
	 * @param {string} title - The title to search for
	 * @param {string} fields - Fields to fetch
	 * @param {Function} normalizeTitle - Function to normalize titles for comparison
	 * @param {Function} isSimilarTitle - Function to check title similarity
	 * @returns {Promise<{data: Object|null, rateLimited: boolean}>}
	 */
	async fetchByTitle(title, fields, normalizeTitle, isSimilarTitle) {
		this.log(`Fetching by title: ${title}`);
		const url = `${this.BASE_URL}/paper/search?query=${encodeURIComponent(title)}&fields=${fields},title&limit=5`;
		
		try {
			const response = await Zotero.HTTP.request("GET", url, {
				headers: { "Accept": "application/json" },
				timeout: 30000
			});
			
			if (response.status === 429) {
				this.log("Rate limited on title search!");
				return { data: null, rateLimited: true };
			}
			
			if (response.status !== 200) {
				this.log(`Request failed with status ${response.status}`);
				return { data: null, rateLimited: false };
			}
			
			const responseData = JSON.parse(response.responseText);
			
			if (!responseData.data || responseData.data.length === 0) {
				this.log(`No results found for title: ${title}`);
				return { data: null, rateLimited: false };
			}
			
			// Find the best match by comparing titles
			const normalizedSearchTitle = normalizeTitle(title);
			
			for (const paper of responseData.data) {
				const normalizedPaperTitle = normalizeTitle(paper.title);
				if (paper.title && normalizedPaperTitle === normalizedSearchTitle) {
					this.log(`Exact match found! ID: ${paper.paperId}`);
					return { data: paper, rateLimited: false };
				}
			}
			
			this.log(`No matching title found among ${responseData.data.length} results`);
			return { data: null, rateLimited: false };
		} catch (error) {
			if (error.message && error.message.includes('429')) {
				return { data: null, rateLimited: true };
			}
			this.log(`Title search error: ${error.message}`);
			return { data: null, rateLimited: false };
		}
	},
	
	/**
	 * Batch fetch papers by their Semantic Scholar IDs
	 * @param {string[]} ids - Array of Semantic Scholar paper IDs
	 * @param {string} fields - Fields to fetch
	 * @returns {Promise<{results: Object[], rateLimited: boolean}>}
	 */
	async batchFetch(ids, fields) {
		if (ids.length === 0) {
			return { results: [], rateLimited: false };
		}
		
		this.log(`Batch fetching ${ids.length} papers`);
		
		const batchSize = 500;
		const results = [];
		let rateLimited = false;
		
		for (let i = 0; i < ids.length; i += batchSize) {
			const batch = ids.slice(i, i + batchSize);
			
			try {
				const response = await Zotero.HTTP.request("POST", 
					`${this.BASE_URL}/paper/batch?fields=${fields}`, {
					headers: {
						"Accept": "application/json",
						"Content-Type": "application/json"
					},
					body: JSON.stringify({ ids: batch }),
					timeout: 60000
				});
				
				if (response.status === 429) {
					this.log("Batch request rate limited");
					rateLimited = true;
					break;
				}
				
				if (response.status === 200) {
					const data = JSON.parse(response.responseText);
					results.push(...data);
					this.log(`Batch ${Math.floor(i / batchSize) + 1}: Got ${data.filter(d => d).length} results`);
				}
			} catch (error) {
				if (error.message && error.message.includes('429')) {
					rateLimited = true;
					break;
				}
				this.log(`Batch request error: ${error.message}`);
			}
			
			// Delay between batches
			if (i + batchSize < ids.length) {
				await Zotero.Promise.delay(200);
			}
		}
		
		return { results, rateLimited };
	},
	
	/**
	 * Add an item to the retry queue
	 * @param {Object} item - Zotero item to retry
	 * @param {number} retryCount - Current retry count
	 */
	addToRetryQueue(item, retryCount = 0) {
		if (retryCount >= this.maxRetries) {
			this.log(`Max retries reached for: ${item.getField('title')}`);
			return;
		}
		
		const exists = this.retryQueue.some(q => q.item.id === item.id);
		if (!exists) {
			this.retryQueue.push({ item, retryCount });
			this.log(`Added to retry queue: ${item.getField('title')} (attempt ${retryCount + 1})`);
		}
	},
	
	/**
	 * Process the retry queue with exponential backoff
	 * @param {Function} fetchCallback - Callback to fetch data for an item
	 * @param {Function} applyCallback - Callback to apply fetched data to an item
	 */
	async processRetryQueue(fetchCallback, applyCallback) {
		if (this.isProcessingRetryQueue || this.retryQueue.length === 0) {
			return;
		}
		
		this.isProcessingRetryQueue = true;
		this.log(`Processing retry queue: ${this.retryQueue.length} items`);
		
		const delay = Math.min(this.retryDelay, this.maxRetryDelay);
		this.log(`Waiting ${delay}ms before retry...`);
		await Zotero.Promise.delay(delay);
		
		while (this.retryQueue.length > 0) {
			const { item, retryCount } = this.retryQueue.shift();
			const title = item.getField('title');
			
			this.log(`Retrying: ${title} (attempt ${retryCount + 2})`);
			
			const result = await fetchCallback(item);
			
			if (result.rateLimited) {
				this.retryQueue.unshift({ item, retryCount: retryCount + 1 });
				this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
				this.log(`Rate limited, increasing delay to ${this.retryDelay}ms`);
				await Zotero.Promise.delay(this.retryDelay);
			} else if (result.data) {
				await applyCallback(item, result.data);
				this.log(`Retry successful: ${title}`);
				this.retryDelay = 2000; // Reset delay on success
			} else {
				this.log(`Retry failed (no result): ${title}`);
			}
			
			await Zotero.Promise.delay(500);
		}
		
		this.isProcessingRetryQueue = false;
		this.log("Retry queue processing complete");
	},
	
	/**
	 * Check if there are items in the retry queue
	 * @returns {boolean}
	 */
	hasQueuedItems() {
		return this.retryQueue.length > 0;
	},
	
	/**
	 * Get the number of items in the retry queue
	 * @returns {number}
	 */
	getQueueLength() {
		return this.retryQueue.length;
	}
};
