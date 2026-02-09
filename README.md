# Semantic Scholar Fetcher for Zotero
<img width="1329" height="197" alt="image" src="https://github.com/user-attachments/assets/b22bcac9-1b7e-4c68-89e4-21620ad38ed5" />
<br/><br/> 
A Zotero 7 plugin that fetches citation counts and metadata from [Semantic Scholar](https://www.semanticscholar.org/).

## Features

- **Citation Counts**: Fetch citation counts for your papers
- **Other Metadata**: Fetch information like journal or abstract
- **Custom Columns**: Show (influential) citation counts directly in the library
- **Auto-fetch**: Automatically fetch data when new items are added
- **Batch Updates**: Update multiple items at once

## Installation

1. Download the latest `.xpi` file from [Releases](https://github.com/StillJosh/semantic-scholar-fetcher/releases)
2. In Zotero, go to **Tools → Add-ons**
3. Click the gear icon → **Install Add-on From File**
4. Select the downloaded `.xpi` file

## Usage

### Fetch data for selected items
1. Select one or more items in your library
2. Right-click → **Fetch Semantic Scholar Data**

### View citation data
- **Columns**: Right-click the column header → enable "Citations" or "Influential Citations"
- **Item Pane**: Select an item and look for the "Semantic Scholar" section in the right panel

### Settings
Go to **Zotero → Settings → Semantic Scholar Fetcher** to configure:
- Auto-fetch for new items
- Update on startup
- Which fields to fetch (DOI, abstract, venue, etc.)
- Search mode (identifiers only vs. title search)

## How It Works

The plugin looks up papers using:
1. DOI (most reliable)
2. arXiv ID
3. PubMed ID (PMID)
4. Existing Semantic Scholar ID
5. Title search (optional, requires exact title match)

Data is stored in the item's "Extra" field and displayed in custom columns and the item pane.

## Rate Limiting

The Semantic Scholar API has rate limits. The plugin handles this automatically by:
- Adding delays between requests
- Queuing rate-limited items for automatic retry
- Using exponential backoff

## Development

### Building

```bash
./make-xpi
```

This creates `build/semantic-scholar-fetcher-{version}.xpi`

### Project Structure

```
src/
├── bootstrap.js      # Plugin lifecycle
├── manifest.json     # Plugin metadata
├── plugin.js         # Main plugin logic (UI, columns, sections)
├── prefs.js          # Default preferences
├── prefs.xhtml       # Preferences UI
├── lib/
│   ├── api.js        # Semantic Scholar API client
│   └── item-utils.js # Zotero item utilities
└── locale/
    └── en-US/
        └── semantic-scholar.ftl
```

### Testing

```bash
npm test
```

## Credits

- Uses the [Semantic Scholar Academic Graph API](https://api.semanticscholar.org/)
- Inspired by the [Zotero Plugin Template](https://github.com/zotero/make-it-red)
