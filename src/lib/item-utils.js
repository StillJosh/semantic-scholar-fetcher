/**
 * Item Utilities Module
 * Handles parsing and manipulation of Zotero item fields
 */

var ItemUtils = {
	/**
	 * Log a message with the utility prefix
	 */
	log(msg) {
		Zotero.debug("Semantic Scholar ItemUtils: " + msg);
	},
	
	// ============================================
	// Title Matching Utilities
	// ============================================
	
	/**
	 * Normalize a title for comparison
	 * @param {string} title - The title to normalize
	 * @returns {string} Normalized title
	 */
	normalizeTitle(title) {
		return title.toLowerCase()
			.replace(/[^\w\s]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	},
	
	// ============================================
	// Identifier Extraction from Items
	// ============================================
	
	/**
	 * Get arXiv ID from a Zotero item
	 * Checks both the Extra field and URL
	 * @param {Object} item - Zotero item
	 * @returns {string|null} arXiv ID or null
	 */
	getArxivId(item) {
		// Check Extra field
		const extra = item.getField('extra') || "";
		const extraMatch = extra.match(/arXiv:\s*(\d+\.\d+)/i);
		if (extraMatch) return extraMatch[1];
		
		// Check URL
		const url = item.getField('url') || "";
		const urlMatch = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/i);
		return urlMatch ? urlMatch[1] : null;
	},
	
	/**
	 * Get PMID from a Zotero item's Extra field
	 * @param {Object} item - Zotero item
	 * @returns {string|null} PMID or null
	 */
	getPMID(item) {
		const extra = item.getField('extra') || "";
		const match = extra.match(/PMID:\s*(\d+)/i);
		return match ? match[1] : null;
	},
	
	/**
	 * Get DOI from a Zotero item
	 * @param {Object} item - Zotero item
	 * @returns {string|null} DOI or null
	 */
	getDOI(item) {
		return item.getField('DOI') || null;
	},
	
	// ============================================
	// Semantic Scholar Data Extra Note
	// ============================================
	
	/**
	 * Get or create a hidden note for storing plugin data
	 * @param {Object} item - Zotero item
	 * @returns {Object|null} Note item or null
	 */
	_getStorageNote(item) {
		if (!item || !item.isRegularItem()) return null;
		
		// Look for existing storage note
		const notes = Zotero.Items.get(item.getNotes());
		for (let note of notes) {
			const noteText = note.getNote();
			if (noteText.includes('<semantic-scholar-data>')) {
				return note;
			}
		}
		return null;
	},
	
	/**
	 * Get stored plugin data from item
	 * @param {Object} item - Zotero item
	 * @returns {Object|null} Parsed data or null
	 */
	_getStoredData(item) {
		const note = this._getStorageNote(item);
		if (!note) return null;
		
		const noteText = note.getNote();
		const match = noteText.match(/<semantic-scholar-data>([\s\S]*?)<\/semantic-scholar-data>/);
		if (!match) return null;
		
		try {
			return JSON.parse(match[1]);
		} catch (e) {
			return null;
		}
	},
	
	/**
	 * Store plugin data on item
	 * @param {Object} item - Zotero item
	 * @param {Object} data - Data to store
	 */
	async _setStoredData(item, data) {
		if (!item || !item.isRegularItem()) return;
		
		let note = this._getStorageNote(item);
		const jsonData = JSON.stringify(data);
		const noteContent = `<semantic-scholar-data>${jsonData}</semantic-scholar-data>`;
		
		if (note) {
			note.setNote(noteContent);
			await note.saveTx();
		} else {
			note = new Zotero.Item('note');
			note.libraryID = item.libraryID;
			note.setNote(noteContent);
			note.parentID = item.id;
			await note.saveTx();
		}
	},
	
	/**
	 * Get citation count from item data storage
	 * @param {Object} item - Zotero item
	 * @returns {string} Citation count or empty string
	 */
	getCitationCount(item) {
		if (!item || !item.isRegularItem()) return "";
		const data = this._getStoredData(item);
		if (!data) return "";
		return data.citationCount !== undefined ? String(data.citationCount) : "";
	},
	
	/**
	 * Get influential citation count from item data storage
	 * @param {Object} item - Zotero item
	 * @returns {string} Influential citation count or empty string
	 */
	getInfluentialCitationCount(item) {
		if (!item || !item.isRegularItem()) return "";
		const data = this._getStoredData(item);
		if (!data) return "";
		return data.influentialCitationCount !== undefined ? String(data.influentialCitationCount) : "";
	},
	
	/**
	 * Get reference count from item data storage
	 * @param {Object} item - Zotero item
	 * @returns {string} Reference count or empty string
	 */
	getReferenceCount(item) {
		if (!item || !item.isRegularItem()) return "";
		const data = this._getStoredData(item);
		if (!data) return "";
		return data.referenceCount !== undefined ? String(data.referenceCount) : "";
	},
	
	/**
	 * Get Semantic Scholar paper ID from item data storage
	 * @param {Object} item - Zotero item
	 * @returns {string|null} Scholar ID or null
	 */
	getScholarId(item) {
		if (!item || !item.isRegularItem()) return null;
		const data = this._getStoredData(item);
		if (!data) return null;
		return data.paperId || null;
	},
	
	/**
	 * Get last updated date from item data storage
	 * @param {Object} item - Zotero item
	 * @returns {string|null} Last updated date or null
	 */
	getLastUpdated(item) {
		if (!item || !item.isRegularItem()) return null;
		const data = this._getStoredData(item);
		if (!data) return null;
		return data.lastUpdated || null;
	},
	
	// ============================================
	// Apply API Data to Items
	// ============================================
	
	/**
	 * Apply fetched Semantic Scholar data to a Zotero item
	 * @param {Object} item - Zotero item
	 * @param {Object} data - Data from Semantic Scholar API
	 * @param {Function} shouldFetchField - Function to check if a field should be updated
	 * @param {boolean} overwriteExisting - Whether to overwrite existing field values
	 * @param {Function} log - Logging function
	 */
	async applyDataToItem(item, data, shouldFetchField, overwriteExisting, log) {
		if (!item || !item.isRegularItem() || !data) return;
		
		// Build object to store in item data (won't be exported)
		const storedData = {};
		
		if (data.citationCount !== undefined) {
			storedData.citationCount = data.citationCount;
		}
		if (data.influentialCitationCount !== undefined && shouldFetchField('influentialCitationCount')) {
			storedData.influentialCitationCount = data.influentialCitationCount;
		}
		if (data.referenceCount !== undefined && shouldFetchField('referenceCount')) {
			storedData.referenceCount = data.referenceCount;
		}
		if (data.paperId) {
			storedData.paperId = data.paperId;
		}
		storedData.lastUpdated = new Date().toLocaleDateString();
		
		// Add arXiv ID if enabled
		if (shouldFetchField('arXivId') && data.externalIds?.ArXiv) {
			storedData.arXivId = data.externalIds.ArXiv;
		}
		
		// Add fields of study if enabled
		if (shouldFetchField('fieldsOfStudy') && data.fieldsOfStudy?.length) {
			storedData.fieldsOfStudy = data.fieldsOfStudy;
		}
		
		// Store data in hidden note (won't be exported)
		await this._setStoredData(item, storedData);
		
		// Apply Zotero field overwrites based on preferences
		// Only overwrite if overwriteExisting is true OR the field is empty
		if (shouldFetchField('DOI') && data.externalIds?.DOI) {
			const currentDOI = item.getField('DOI');
			if (overwriteExisting || !currentDOI) {
				item.setField('DOI', data.externalIds.DOI);
				log(`Set DOI field to: ${data.externalIds.DOI}`);
			} else {
				log(`Skipped DOI (field not empty): ${currentDOI}`);
			}
		}
		
		if (shouldFetchField('abstract') && data.abstract) {
			const currentAbstract = item.getField('abstractNote');
			if (overwriteExisting || !currentAbstract) {
				item.setField('abstractNote', data.abstract);
				log("Updated abstract");
			} else {
				log("Skipped abstract (field not empty)");
			}
		}
		
		if (shouldFetchField('publicationDate') && data.publicationDate) {
			const currentDate = item.getField('date');
			if (overwriteExisting || !currentDate) {
				item.setField('date', data.publicationDate);
				log(`Updated date: ${data.publicationDate}`);
			} else {
				log(`Skipped date (field not empty): ${currentDate}`);
			}
		}
		
		if (shouldFetchField('venue')) {
			const venue = data.journal?.name || data.venue;
			if (venue) {
				// Different item types use different fields for venue/journal
				const itemType = item.itemType;
				let venueField = 'publicationTitle'; // default for journal articles
				
				if (itemType === 'conferencePaper') {
					venueField = 'proceedingsTitle';
				} else if (itemType === 'bookSection') {
					venueField = 'bookTitle';
				}
				
				const currentVenue = item.getField(venueField);
				log(`Venue check: itemType=${itemType}, field=${venueField}, overwriteExisting=${overwriteExisting}, currentVenue="${currentVenue}", newVenue="${venue}"`);
				if (overwriteExisting || !currentVenue) {
					item.setField(venueField, venue);
					log(`Updated ${venueField}: ${venue}`);
				} else {
					log(`Skipped ${venueField} (field not empty): ${currentVenue}`);
				}
			}
		}
		
		if (shouldFetchField('openAccessPdf') && data.openAccessPdf?.url) {
			const currentUrl = item.getField('url');
			if (overwriteExisting || !currentUrl) {
				item.setField('url', data.openAccessPdf.url);
				log(`Updated URL to open access PDF: ${data.openAccessPdf.url}`);
			} else {
				log(`Skipped URL (field not empty): ${currentUrl}`);
			}
		}
		
		await item.saveTx();
		log(`Applied data to "${item.getField('title')}"`);
	}
};
