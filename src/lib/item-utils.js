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
		if (urlMatch) return urlMatch[1];
		
		// Check DOI — arXiv preprints have DOIs in the form 10.48550/arXiv.XXXX.XXXXX
		const doi = item.getField('DOI') || "";
		const doiMatch = doi.match(/10\.48550\/arXiv\.(\d+\.\d+)/i);
		return doiMatch ? doiMatch[1] : null;
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
	 * Returns true if the string is an ArXiv placeholder value ("ArXiv", "arxiv", etc.)
	 * Used to treat such values as empty when deciding whether to overwrite.
	 * @param {string} str
	 * @returns {boolean}
	 */
	_isArxivPlaceholder(str) {
		return /^arxiv$/i.test((str || '').trim());
	},

	/**
	 * Resolve a real published venue from a Semantic Scholar API response.
	 * Returns null if S2 only has ArXiv-level data (paper not yet indexed as published).
	 *
	 * Priority: publicationVenue.name > venue string > journal.name
	 * All three sources are skipped if their value is the "ArXiv" placeholder.
	 * Type ('journal' | 'conference') comes from publicationVenue.type when available,
	 * falling back to publicationTypes — because S2 sometimes mis-classifies conference
	 * papers as "JournalArticle" in publicationTypes.
	 *
	 * @param {Object} data - Semantic Scholar API response
	 * @returns {{ name: string, type: 'journal'|'conference', pages: string|null, volume: string|null }|null}
	 */
	_resolvePublishedVenue(data) {
		const pubVenueName  = data.publicationVenue?.name;
		const venueStr      = typeof data.venue === 'string' ? data.venue : null;
		const journalName   = data.journal?.name;

		const name = (!this._isArxivPlaceholder(pubVenueName)  && pubVenueName)
			|| (!this._isArxivPlaceholder(venueStr)   && venueStr)
			|| (!this._isArxivPlaceholder(journalName) && journalName)
			|| null;

		if (!name) return null;

		// Determine type — publicationVenue.type is most reliable
		const rawType  = data.publicationVenue?.type?.toLowerCase();
		const pubTypes = Array.isArray(data.publicationTypes) ? data.publicationTypes : [];
		const type = rawType === 'conference' || (!rawType && pubTypes.includes('Conference'))
			? 'conference'
			: rawType === 'journal'  || (!rawType && pubTypes.includes('JournalArticle'))
				? 'journal'
				: null;

		if (!type) return null;

		// Only include volume/pages from journal when journal.name itself is real
		const journalIsReal = !this._isArxivPlaceholder(journalName) && !!journalName;
		return {
			name,
			type,
			volume: (journalIsReal && data.journal?.volume) || null,
			pages:  data.journal?.pages || null,
		};
	},

	async applyDataToItem(item, data, shouldFetchField, overwriteExisting, log) {
		if (!item || !item.isRegularItem() || !data) return;

		// ── Stored metrics (hidden note, not exported) ────────────────────────
		const storedData = {};
		if (data.citationCount !== undefined) storedData.citationCount = data.citationCount;
		if (data.influentialCitationCount !== undefined && shouldFetchField('influentialCitationCount'))
			storedData.influentialCitationCount = data.influentialCitationCount;
		if (data.referenceCount !== undefined && shouldFetchField('referenceCount'))
			storedData.referenceCount = data.referenceCount;
		if (data.paperId) storedData.paperId = data.paperId;
		storedData.lastUpdated = new Date().toLocaleDateString();
		if (shouldFetchField('arXivId') && data.externalIds?.ArXiv)
			storedData.arXivId = data.externalIds.ArXiv;
		if (shouldFetchField('fieldsOfStudy') && data.fieldsOfStudy?.length)
			storedData.fieldsOfStudy = data.fieldsOfStudy;
		await this._setStoredData(item, storedData);

		// ── Preprint / arXiv-sourced item conversion ──────────────────────────
		// Triggers for: Zotero preprint type, or journal/conference items whose
		// venue field still holds the "ArXiv" placeholder from the import.
		// NOTE: "ArXiv" placeholder values are always overwritten here, regardless
		// of overwriteExisting — they are never considered real publication data.
		if (shouldFetchField('preprintConversion')) {
			const venueField = item.itemType === 'conferencePaper' ? 'proceedingsTitle' : 'publicationTitle';
			const isArxivSourced = item.itemType === 'preprint'
				|| ((item.itemType === 'journalArticle' || item.itemType === 'conferencePaper')
					&& this._isArxivPlaceholder(item.getField(venueField)));

			if (isArxivSourced) {
				const venue = this._resolvePublishedVenue(data);
				if (!venue) {
					log(`Preprint conversion skipped: no published venue found in S2 data`);
				} else if (venue.type === 'journal') {
					log(`Converting to journalArticle (journal: ${venue.name})`);
					item.setType(Zotero.ItemTypes.getID('journalArticle'));
					item.setField('publicationTitle', venue.name);
					if (venue.volume && (overwriteExisting || !item.getField('volume')))
						item.setField('volume', venue.volume);
					if (venue.pages && (overwriteExisting || !item.getField('pages')))
						item.setField('pages', venue.pages);
				} else {
					log(`Converting to conferencePaper (proceedings: ${venue.name})`);
					item.setType(Zotero.ItemTypes.getID('conferencePaper'));
					item.setField('proceedingsTitle', venue.name);
					if (venue.pages && (overwriteExisting || !item.getField('pages')))
						item.setField('pages', venue.pages);
				}
			}
		}

		// ── Individual field overwrites (user-configurable) ───────────────────
		if (shouldFetchField('DOI') && data.externalIds?.DOI) {
			const cur = item.getField('DOI');
			if (overwriteExisting || !cur) {
				item.setField('DOI', data.externalIds.DOI);
				log(`Set DOI: ${data.externalIds.DOI}`);
			} else {
				log(`Skipped DOI (not empty): ${cur}`);
			}
		}

		if (shouldFetchField('abstract') && data.abstract) {
			const cur = item.getField('abstractNote');
			if (overwriteExisting || !cur) {
				item.setField('abstractNote', data.abstract);
				log('Updated abstract');
			} else {
				log('Skipped abstract (not empty)');
			}
		}

		if (shouldFetchField('publicationDate') && data.publicationDate) {
			const cur = item.getField('date');
			if (overwriteExisting || !cur) {
				item.setField('date', data.publicationDate);
				log(`Updated date: ${data.publicationDate}`);
			} else {
				log(`Skipped date (not empty): ${cur}`);
			}
		}

		if (shouldFetchField('venue')) {
			// Use _resolvePublishedVenue so ArXiv placeholder values are never written
			const venue = this._resolvePublishedVenue(data);
			if (venue) {
				const venueField = item.itemType === 'conferencePaper' ? 'proceedingsTitle'
					: item.itemType === 'bookSection' ? 'bookTitle'
					: 'publicationTitle';
				const cur = item.getField(venueField);
				log(`Venue check: field=${venueField}, current="${cur}", new="${venue.name}"`);
				if (overwriteExisting || !cur || this._isArxivPlaceholder(cur)) {
					item.setField(venueField, venue.name);
					log(`Updated ${venueField}: ${venue.name}`);
				} else {
					log(`Skipped ${venueField} (not empty): ${cur}`);
				}
			}
		}

		if (shouldFetchField('openAccessPdf') && data.openAccessPdf?.url) {
			const cur = item.getField('url');
			if (overwriteExisting || !cur) {
				item.setField('url', data.openAccessPdf.url);
				log(`Updated URL: ${data.openAccessPdf.url}`);
			} else {
				log(`Skipped URL (not empty): ${cur}`);
			}
		}

		await item.saveTx();
		log(`Applied data to "${item.getField('title')}"`);
	}
};
