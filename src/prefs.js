// General settings
pref("extensions.zotero.semanticScholar.autoFetch", true);
pref("extensions.zotero.semanticScholar.updateOnStartup", true);

// Search mode: 'identifiers' (DOI/arXiv/PMID only) or 'title' (fall back to title search)
pref("extensions.zotero.semanticScholar.searchMode", "title");

// Citation metrics (stored in Extra field)
pref("extensions.zotero.semanticScholar.fetch.citationCount", true);
pref("extensions.zotero.semanticScholar.fetch.influentialCitationCount", true);
pref("extensions.zotero.semanticScholar.fetch.referenceCount", false);

// Field overwrites (overwrite existing Zotero fields)
pref("extensions.zotero.semanticScholar.overwriteExistingFields", false);
pref("extensions.zotero.semanticScholar.fetch.DOI", false);
pref("extensions.zotero.semanticScholar.fetch.abstract", false);
pref("extensions.zotero.semanticScholar.fetch.publicationDate", false);
pref("extensions.zotero.semanticScholar.fetch.venue", false);
pref("extensions.zotero.semanticScholar.fetch.openAccessPdf", false);

// Additional metadata (stored in Extra field)
pref("extensions.zotero.semanticScholar.fetch.arXivId", false);
pref("extensions.zotero.semanticScholar.fetch.fieldsOfStudy", false);
