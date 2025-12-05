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
	// Semantic Scholar Data in Extra Field
	// ============================================
	
	/**
	 * Get citation count from item's Extra field
	 * @param {Object} item - Zotero item
	 * @returns {string} Citation count or empty string
	 */
	getCitationCount(item) {
		if (!item || !item.isRegularItem()) return "";
		const extra = item.getField('extra');
		if (!extra) return "";
		const match = extra.match(/^Citation Count:\s*(\d+)/m);
		return match ? match[1] : "";
	},
	
	/**
	 * Get influential citation count from item's Extra field
	 * @param {Object} item - Zotero item
	 * @returns {string} Influential citation count or empty string
	 */
	getInfluentialCitationCount(item) {
		if (!item || !item.isRegularItem()) return "";
		const extra = item.getField('extra');
		if (!extra) return "";
		const match = extra.match(/^Influential Citation Count:\s*(\d+)/m);
		return match ? match[1] : "";
	},
	
	/**
	 * Get reference count from item's Extra field
	 * @param {Object} item - Zotero item
	 * @returns {string} Reference count or empty string
	 */
	getReferenceCount(item) {
		if (!item || !item.isRegularItem()) return "";
		const extra = item.getField('extra');
		if (!extra) return "";
		const match = extra.match(/^Reference Count:\s*(\d+)/m);
		return match ? match[1] : "";
	},
	
	/**
	 * Get Semantic Scholar paper ID from item's Extra field
	 * @param {Object} item - Zotero item
	 * @returns {string|null} Scholar ID or null
	 */
	getScholarId(item) {
		if (!item || !item.isRegularItem()) return null;
		const extra = item.getField('extra') || "";
		const match = extra.match(/^Semantic Scholar ID:\s*([a-f0-9]+)/im);
		return match ? match[1] : null;
	},
	
	/**
	 * Get last updated date from item's Extra field
	 * @param {Object} item - Zotero item
	 * @returns {string|null} Last updated date or null
	 */
	getLastUpdated(item) {
		if (!item || !item.isRegularItem()) return null;
		const extra = item.getField('extra') || "";
		const match = extra.match(/^Semantic Scholar Updated:\s*(.+)$/im);
		return match ? match[1] : null;
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
		
		let extra = item.getField('extra') || "";
		
		// Remove existing Semantic Scholar lines
		extra = extra.replace(/^Citation Count:\s*\d+\n?/gm, "");
		extra = extra.replace(/^Influential Citation Count:\s*\d+\n?/gm, "");
		extra = extra.replace(/^Reference Count:\s*\d+\n?/gm, "");
		extra = extra.replace(/^Semantic Scholar ID:\s*[a-f0-9]+\n?/gim, "");
		extra = extra.replace(/^Semantic Scholar Updated:\s*.+\n?/gim, "");
		extra = extra.replace(/^arXiv:\s*[\d.]+\n?/gim, "");
		extra = extra.replace(/^Fields of Study:\s*.+\n?/gim, "");
		
		// Build new extra content for metrics
		let newContent = "";
		
		if (data.citationCount !== undefined) {
			newContent += `Citation Count: ${data.citationCount}\n`;
		}
		if (data.influentialCitationCount !== undefined && shouldFetchField('influentialCitationCount')) {
			newContent += `Influential Citation Count: ${data.influentialCitationCount}\n`;
		}
		if (data.referenceCount !== undefined && shouldFetchField('referenceCount')) {
			newContent += `Reference Count: ${data.referenceCount}\n`;
		}
		if (data.paperId) {
			newContent += `Semantic Scholar ID: ${data.paperId}\n`;
		}
		newContent += `Semantic Scholar Updated: ${new Date().toLocaleDateString()}\n`;
		
		// Add arXiv ID if enabled
		if (shouldFetchField('arXivId') && data.externalIds?.ArXiv) {
			newContent += `arXiv: ${data.externalIds.ArXiv}\n`;
		}
		
		// Add fields of study if enabled
		if (shouldFetchField('fieldsOfStudy') && data.fieldsOfStudy?.length) {
			newContent += `Fields of Study: ${data.fieldsOfStudy.join(', ')}\n`;
		}
		
		extra = (newContent + extra).trim();
		item.setField('extra', extra);
		
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
				const currentVenue = item.getField('publicationTitle');
				if (overwriteExisting || !currentVenue) {
					item.setField('publicationTitle', venue);
					log(`Updated venue: ${venue}`);
				} else {
					log(`Skipped venue (field not empty): ${currentVenue}`);
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
