# Default CSS Community Server

A simple PHP backend for the WebToEpub community CSS selector database, hosted at `webtoepub.devomin.de`.

## Overview

This server allows WebToEpub users to share their working Default Parser CSS selectors with the community. When a user visits a site that the Default Parser doesn't have a config for, the extension automatically checks for community-submitted configs.

### How it works

1. User configures CSS selectors for a site using the Default Parser and packs an EPUB.
2. After a successful pack, a one-time prompt asks if they'd like to share their config.
3. The config is POSTed to the server and added to the shared JSON.
4. Other users visiting the same site automatically get the community config applied.

### Config resolution order

1. **User's own localStorage config** (highest priority)
2. **Online server JSON** (fetched automatically for unknown sites)
3. **Bundled `defaultParserCommunity.json`** (offline fallback, updated each release)
4. **Error message** if none of the above have a config

## JSON Format

```json
{
    "last_updated": 1691834241,
    "configs": {
        "example.com": {
            "contentCss": "div.chapter-content",
            "titleCss": "h1.title",
            "removeCss": ".ads, .nav"
        }
    }
}
```

- `last_updated` — Unix timestamp, updated every time any config is added/changed. The extension compares this against its local bundled version to decide whether to use the online data.
- `configs` — Object keyed by hostname, each containing `contentCss` (required), `titleCss` (optional), `removeCss` (optional).

## Endpoints

### `GET /defaultcss.json`
Returns the full JSON. Served directly by the web server (no PHP needed).

### `POST /save_css.php`
Submits or overwrites CSS selectors for a hostname.

**Parameters (form-encoded):**

| Parameter   | Required | Description                              |
|-------------|----------|------------------------------------------|
| hostname    | Yes      | The site hostname (e.g. `example.com`)   |
| contentCss  | Yes      | CSS selector for the content element     |
| titleCss    | No       | CSS selector for the chapter title       |
| removeCss   | No       | CSS selector for elements to remove      |

**Example:**
```bash
curl -X POST http://webtoepub.devomin.de/save_css.php \
  -d "hostname=example.com" \
  -d "contentCss=div.chapter-content" \
  -d "titleCss=h1.title" \
  -d "removeCss=.ads, .nav"
```

## Deployment

### Requirements
- PHP 7.0+
- A web server (Apache, Nginx, etc.) that can serve PHP files
- Write permissions on `defaultcss.json` for the web server user

### Setup
1. Upload `save_css.php` and `defaultcss.json` to your web server.
2. Ensure the web server user has write access to `defaultcss.json`:
   ```bash
   chmod 664 defaultcss.json
   ```
3. The `defaultcss.json` file is served directly by the web server for GET requests.

## Release Process

The GitHub Actions workflow (`AutoRelease.yml`) automatically fetches the latest JSON from the server and bundles it into `plugin/defaultParserCommunity.json` before each dev release. No manual steps needed.

## Extension Files

| File | Purpose |
|------|---------|
| `plugin/defaultParserCommunity.json` | Bundled offline fallback, auto-updated each release |
| `plugin/js/DefaultParserUI.js` | Client-side fetch/submit logic and post-pack prompt |
| `plugin/popup.html` | "Submit My Config" button in Default Parser section |
| `.github/workflows/AutoRelease.yml` | Auto-fetches latest JSON before building release |
