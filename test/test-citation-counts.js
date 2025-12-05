/**
 * Tests for Citation Counts plugin
 * 
 * Test papers:
 * 1. "Adaptive Conformal Inference Under Distribution Shift" (NeurIPS 2021)
 * 2. "Conformal prediction bands for multivariate functional data" (J. Multivar. Anal. 2022)
 *    DOI: 10.1016/J.JMVA.2021.104879
 * 3. "Conformal Inference for Online Prediction with Arbitrary Distribution Shifts" (JMLR 2024)
 */

const API_BASE_URL = "https://api.semanticscholar.org/graph/v1";

// Test data based on provided BibTeX entries
const TEST_PAPERS = [
	{
		name: "Gibbs & Candès NeurIPS 2021",
		title: "Adaptive Conformal Inference Under Distribution Shift",
		doi: null,
		year: 2021,
		expectedToHaveCitations: true
	},
	{
		name: "Diquigiovanni et al. JMVA 2022",
		title: "Conformal prediction bands for multivariate functional data",
		doi: "10.1016/J.JMVA.2021.104879",
		year: 2022,
		expectedToHaveCitations: true
	},
	{
		name: "Gibbs & Candès JMLR 2024",
		title: "Conformal Inference for Online Prediction with Arbitrary Distribution Shifts",
		doi: null,
		year: 2024,
		expectedToHaveCitations: true
	}
];

// Title normalization utilities (shared logic with semantic-scholar.js)
const TitleUtils = {
	normalize(title) {
		return title.toLowerCase()
			.replace(/[^\w\s]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	},
	
	isSimilar(title1, title2) {
		const norm1 = this.normalize(title1);
		const norm2 = this.normalize(title2);
		
		// Exact match only
		return norm1 === norm2;
	}
};

// Test: Fetch by DOI
async function testFetchByDOI(doi) {
	const url = `${API_BASE_URL}/paper/DOI:${encodeURIComponent(doi)}?fields=citationCount,title`;
	
	try {
		const response = await fetch(url, {
			headers: { "Accept": "application/json" }
		});
		
		if (response.status !== 200) {
			return { success: false, error: `HTTP ${response.status}` };
		}
		
		const data = await response.json();
		return {
			success: true,
			title: data.title,
			citationCount: data.citationCount
		};
	} catch (error) {
		return { success: false, error: error.message };
	}
}

// Test: Fetch by title
async function testFetchByTitle(title) {
	const url = `${API_BASE_URL}/paper/search?query=${encodeURIComponent(title)}&fields=citationCount,title&limit=5`;
	
	try {
		const response = await fetch(url, {
			headers: { "Accept": "application/json" }
		});
		
		if (response.status !== 200) {
			return { success: false, error: `HTTP ${response.status}` };
		}
		
		const data = await response.json();
		
		if (!data.data || data.data.length === 0) {
			return { success: false, error: "No results found" };
		}
		
		// Find best match
		const normalizedSearchTitle = TitleUtils.normalize(title);
		
		for (const paper of data.data) {
			if (paper.title && TitleUtils.normalize(paper.title) === normalizedSearchTitle) {
				return {
					success: true,
					title: paper.title,
					citationCount: paper.citationCount,
					matchType: "exact"
				};
			}
		}
		
		// Check first result for similarity
		const firstResult = data.data[0];
		if (firstResult && TitleUtils.isSimilar(title, firstResult.title)) {
			return {
				success: true,
				title: firstResult.title,
				citationCount: firstResult.citationCount,
				matchType: "similar"
			};
		}
		
		return { 
			success: false, 
			error: "No matching title found",
			candidates: data.data.map(p => p.title)
		};
	} catch (error) {
		return { success: false, error: error.message };
	}
}

// Run all tests
async function runTests() {
	console.log("=".repeat(60));
	console.log("Citation Counts Plugin - API Tests");
	console.log("=".repeat(60));
	console.log();
	
	let passed = 0;
	let failed = 0;
	
	for (const paper of TEST_PAPERS) {
		console.log(`\nTesting: ${paper.name}`);
		console.log("-".repeat(50));
		console.log(`Title: ${paper.title}`);
		console.log(`DOI: ${paper.doi || "N/A"}`);
		console.log();
		
		let result;
		
		// Test by DOI if available
		if (paper.doi) {
			console.log("  [DOI Lookup]");
			result = await testFetchByDOI(paper.doi);
			
			if (result.success) {
				console.log(`    ✓ Found paper: "${result.title}"`);
				console.log(`    ✓ Citation count: ${result.citationCount}`);
				passed++;
			} else {
				console.log(`    ✗ Failed: ${result.error}`);
				failed++;
			}
			
			// Wait to respect rate limits
			await new Promise(resolve => setTimeout(resolve, 3000));
		}
		
		// Test by title
		console.log("  [Title Search]");
		result = await testFetchByTitle(paper.title);
		
		if (result.success) {
			console.log(`    ✓ Found paper: "${result.title}"`);
			console.log(`    ✓ Match type: ${result.matchType}`);
			console.log(`    ✓ Citation count: ${result.citationCount}`);
			
			if (paper.expectedToHaveCitations && result.citationCount > 0) {
				console.log(`    ✓ Has citations as expected`);
			} else if (paper.expectedToHaveCitations && result.citationCount === 0) {
				console.log(`    ⚠ Expected citations but found 0`);
			}
			passed++;
		} else {
			console.log(`    ✗ Failed: ${result.error}`);
			if (result.candidates) {
				console.log(`    Candidates found:`);
				result.candidates.forEach((c, i) => console.log(`      ${i + 1}. ${c}`));
			}
			failed++;
		}
		
		// Wait to respect rate limits
		await new Promise(resolve => setTimeout(resolve, 3000));
	}
	
	console.log();
	console.log("=".repeat(60));
	console.log(`Results: ${passed} passed, ${failed} failed`);
	console.log("=".repeat(60));
	
	return { passed, failed };
}

// Export for Node.js or run directly
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { runTests, testFetchByDOI, testFetchByTitle, TEST_PAPERS };
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
	runTests().then(results => {
		process.exit(results.failed > 0 ? 1 : 0);
	});
}
