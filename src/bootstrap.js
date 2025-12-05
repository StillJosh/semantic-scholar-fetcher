var SemanticScholarAPI;
var ItemUtils;
var SemanticScholar;

function install() {
	Zotero.debug("Semantic Scholar: Installed 2.0.0");
}

async function startup({ id, version, rootURI }) {
	Zotero.debug("Semantic Scholar: Starting 2.0.0");
	
	// Load modules in order (dependencies first)
	Services.scriptloader.loadSubScript(rootURI + 'lib/api.js');
	Services.scriptloader.loadSubScript(rootURI + 'lib/item-utils.js');
	Services.scriptloader.loadSubScript(rootURI + 'plugin.js');
	
	SemanticScholar.init({ id, version, rootURI });
	SemanticScholar.addToAllWindows();
	await SemanticScholar.main();
}

function onMainWindowLoad({ window }) {
	SemanticScholar.addToWindow(window);
}

function onMainWindowUnload({ window }) {
	SemanticScholar.removeFromWindow(window);
}

async function shutdown() {
	Zotero.debug("Semantic Scholar: Shutting down 2.0.0");
	await SemanticScholar.shutdown();
	SemanticScholar.removeFromAllWindows();
	SemanticScholar = undefined;
	SemanticScholarAPI = undefined;
	ItemUtils = undefined;
}

function uninstall() {
	Zotero.debug("Semantic Scholar: Uninstalled 2.0.0");
}
