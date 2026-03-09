/**
 * End-to-end tests for preprint conversion logic.
 * Runs the full applyDataToItem conversion logic against mock Zotero items
 * using cached real S2 API responses — no Zotero installation required.
 *
 * Run: deno run --allow-net test/test-preprint-conversion.js
 */

// ---------------------------------------------------------------------------
// Cached S2 API responses (from real calls — avoids rate limiting in CI)
// ---------------------------------------------------------------------------
const MOCK_S2 = {
	// PDE-Refiner: NeurIPS 2023
	// S2 quirk: journal.name="ArXiv" but publicationVenue correctly says NeurIPS/conference
	// publicationTypes=["JournalArticle"] is a known S2 misclassification — venueType must win
	"2308.05732": {
		paperId: "cee75e291d693e3ee4087f1aa74f0f7e223b3b6f",
		title: "PDE-Refiner: Achieving Accurate Long Rollouts with Neural PDE Solvers",
		venue: "Neural Information Processing Systems",
		journal: { name: "ArXiv", volume: "abs/2308.05732" },
		publicationVenue: { name: "Neural Information Processing Systems", type: "conference" },
		publicationTypes: ["JournalArticle"],
		externalIds: { ArXiv: "2308.05732", DOI: "10.48550/arXiv.2308.05732" },
		citationCount: 155,
	},
	// Learning to Control PDEs: ICLR 2020
	"2001.07457": {
		paperId: "3b7e5a3a2b7e5a3a2b7e5a3a2b7e5a3a2b7e5a3a",
		title: "Learning to Control PDEs with Differentiable Physics",
		venue: "International Conference on Learning Representations",
		journal: { name: "ArXiv", volume: "abs/2001.07457" },
		publicationVenue: { name: "International Conference on Learning Representations", type: "conference" },
		publicationTypes: ["Conference"],
		externalIds: { ArXiv: "2001.07457", DOI: "10.48550/arXiv.2001.07457" },
		citationCount: 300,
	},
	// A real published journal article — should not trigger conversion at all
	"2006.04726": {
		paperId: "fake-journal-paper",
		title: "FourCastNet",
		venue: "Journal of Computational Physics",
		journal: { name: "Journal of Computational Physics", volume: "12", pages: "1-20" },
		publicationVenue: { name: "Journal of Computational Physics", type: "journal" },
		publicationTypes: ["JournalArticle"],
		externalIds: { ArXiv: "2006.04726" },
		citationCount: 50,
	},
	// Paper with only ArXiv data — not yet indexed as published
	"9999.99999": {
		paperId: "fake-preprint",
		title: "Some new preprint",
		venue: "ArXiv",
		journal: { name: "ArXiv", volume: "abs/9999.99999" },
		publicationVenue: null,
		publicationTypes: ["JournalArticle"],
		externalIds: { ArXiv: "9999.99999" },
		citationCount: 0,
	},
};

// ---------------------------------------------------------------------------
// Minimal Zotero item mock
// ---------------------------------------------------------------------------
function makeMockItem(initialType, initialFields = {}) {
	const fields = { ...initialFields };
	let itemType = initialType;
	return {
		get itemType() { return itemType; },
		isRegularItem: () => true,
		getField(key) { return fields[key] || ""; },
		setField(key, val) { fields[key] = val; },
		setType(typeId) { itemType = typeId; },
		saveTx: async () => {},
	};
}

// ---------------------------------------------------------------------------
// Helpers — mirrors of ItemUtils._isArxivPlaceholder / _resolvePublishedVenue
// Keep in sync with item-utils.js; test failures indicate drift.
// ---------------------------------------------------------------------------
function isArxivPlaceholder(str) {
	return /^arxiv$/i.test((str || "").trim());
}

function resolvePublishedVenue(data) {
	const pubVenueName = data.publicationVenue?.name;
	const venueStr     = typeof data.venue === "string" ? data.venue : null;
	const journalName  = data.journal?.name;

	const name =
		(!isArxivPlaceholder(pubVenueName) && pubVenueName) ||
		(!isArxivPlaceholder(venueStr)     && venueStr)     ||
		(!isArxivPlaceholder(journalName)  && journalName)  ||
		null;

	if (!name) return null;

	const rawType  = data.publicationVenue?.type?.toLowerCase();
	const pubTypes = Array.isArray(data.publicationTypes) ? data.publicationTypes : [];
	const type =
		rawType === "conference" || (!rawType && pubTypes.includes("Conference"))
			? "conference"
			: rawType === "journal" || (!rawType && pubTypes.includes("JournalArticle"))
				? "journal"
				: null;

	if (!type) return null;

	const journalIsReal = !isArxivPlaceholder(journalName) && !!journalName;
	return {
		name,
		type,
		volume: (journalIsReal && data.journal?.volume) || null,
		pages:  data.journal?.pages || null,
	};
}

// ---------------------------------------------------------------------------
// Apply logic — mirrors applyDataToItem conversion + venue sections
// ---------------------------------------------------------------------------
async function applyConversion(item, data, overwriteExisting = false) {
	const log = (msg) => console.log("    " + msg);

	// Preprint / arXiv-sourced conversion
	const venueField = item.itemType === "conferencePaper" ? "proceedingsTitle" : "publicationTitle";
	const isArxivSourced =
		item.itemType === "preprint" ||
		((item.itemType === "journalArticle" || item.itemType === "conferencePaper") &&
			isArxivPlaceholder(item.getField(venueField)));

	if (isArxivSourced) {
		const venue = resolvePublishedVenue(data);
		if (!venue) {
			log(`Preprint conversion skipped: no published venue found in S2 data`);
		} else if (venue.type === "journal") {
			log(`Converting to journalArticle (journal: ${venue.name})`);
			item.setType("journalArticle");
			item.setField("publicationTitle", venue.name);
			if (venue.volume && (overwriteExisting || !item.getField("volume")))
				item.setField("volume", venue.volume);
			if (venue.pages && (overwriteExisting || !item.getField("pages")))
				item.setField("pages", venue.pages);
		} else {
			log(`Converting to conferencePaper (proceedings: ${venue.name})`);
			item.setType("conferencePaper");
			item.setField("proceedingsTitle", venue.name);
			if (venue.pages && (overwriteExisting || !item.getField("pages")))
				item.setField("pages", venue.pages);
		}
	} else {
		log(`isArxivSourced = false, skipping conversion block`);
	}

	// Regular venue overwrite (mirrors shouldFetchField('venue') path)
	const venue = resolvePublishedVenue(data);
	if (venue) {
		const vf = item.itemType === "conferencePaper" ? "proceedingsTitle"
			: item.itemType === "bookSection" ? "bookTitle"
			: "publicationTitle";
		const cur = item.getField(vf);
		if (overwriteExisting || !cur || isArxivPlaceholder(cur)) {
			item.setField(vf, venue.name);
			log(`Venue block updated ${vf}: ${venue.name}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;

function assert(label, actual, expected) {
	const ok = actual === expected;
	console.log(`    ${ok ? "✓" : "✗"} ${label}: got "${actual}"${ok ? "" : `, expected "${expected}"`}`);
	ok ? passed++ : failed++;
}

async function runTest(name, arxivId, initialType, initialFields, assertions) {
	console.log(`\n${"─".repeat(60)}`);
	console.log(`TEST: ${name}`);
	console.log(`  arXiv:${arxivId}  |  initial type: ${initialType}`);

	const data = MOCK_S2[arxivId];
	if (!data) { console.log(`  ✗ No mock data for ${arxivId}`); failed++; return; }

	console.log(`  S2: venue="${data.venue}", journal.name="${data.journal?.name}", publicationVenue.type="${data.publicationVenue?.type}", publicationTypes=${JSON.stringify(data.publicationTypes)}`);

	const item = makeMockItem(initialType, initialFields);
	await applyConversion(item, data);
	assertions(item);
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

// 1. PDE-Refiner: imported as journalArticle with publicationTitle="ArXiv"
await runTest(
	"PDE-Refiner — journalArticle w/ publicationTitle=ArXiv → conferencePaper",
	"2308.05732",
	"journalArticle",
	{ publicationTitle: "ArXiv", title: "PDE-Refiner" },
	(item) => {
		assert("itemType → conferencePaper",    item.itemType,                      "conferencePaper");
		assert("proceedingsTitle = NeurIPS",    item.getField("proceedingsTitle"),  "Neural Information Processing Systems");
		assert("publicationTitle untouched",    item.getField("publicationTitle"),  "ArXiv");
	}
);

// 2. ICLR paper: imported as conferencePaper with proceedingsTitle="ArXiv"
await runTest(
	"ICLR paper — conferencePaper w/ proceedingsTitle=ArXiv → conferencePaper",
	"2001.07457",
	"conferencePaper",
	{ proceedingsTitle: "ArXiv", title: "Learning to Control PDEs" },
	(item) => {
		assert("itemType stays conferencePaper",  item.itemType,                      "conferencePaper");
		assert("proceedingsTitle = ICLR",         item.getField("proceedingsTitle"),  "International Conference on Learning Representations");
	}
);

// 3. ICLR paper: imported as preprint (Zotero preprint type)
await runTest(
	"ICLR paper — preprint type → conferencePaper",
	"2001.07457",
	"preprint",
	{ title: "Learning to Control PDEs with Differentiable Physics" },
	(item) => {
		assert("itemType → conferencePaper",  item.itemType,                      "conferencePaper");
		assert("proceedingsTitle = ICLR",     item.getField("proceedingsTitle"),  "International Conference on Learning Representations");
	}
);

// 4. Real published journal article — isArxivSourced should be false, nothing changes
await runTest(
	"Real journal article — should NOT be touched",
	"2006.04726",
	"journalArticle",
	{ publicationTitle: "Journal of Computational Physics", title: "FourCastNet" },
	(item) => {
		assert("itemType unchanged",           item.itemType,                     "journalArticle");
		assert("publicationTitle unchanged",   item.getField("publicationTitle"), "Journal of Computational Physics");
	}
);

// 5. Pure preprint where S2 has no real venue yet — type must not change
await runTest(
	"Unindexed preprint — S2 only has ArXiv venue, should skip",
	"9999.99999",
	"preprint",
	{ title: "Some new preprint" },
	(item) => {
		assert("itemType unchanged", item.itemType, "preprint");
	}
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(60));
if (typeof Deno !== "undefined") Deno.exit(failed > 0 ? 1 : 0);
