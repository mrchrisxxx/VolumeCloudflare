# Reku Volume Dashboard - Cloudflare Deploy

Cloudflare Pages version of the Reku Treasury volume monitoring dashboard.

## Structure

```text
index.html
style.css
script.js
_headers
_routes.json
functions/
  api/
    market-data.js
```

## Deploy With Cloudflare Pages

1. Create a new GitHub repository or branch for this folder.
2. Upload only the contents of this folder.
3. Open Cloudflare Dashboard.
4. Go to Workers & Pages.
5. Create application.
6. Select Pages.
7. Connect to GitHub.
8. Select the repository.
9. Use these build settings:

```text
Framework preset: None
Build command: empty
Build output directory: /
Root directory: /
```

10. Deploy.

## Test URLs

After deploy, open:

```text
https://your-project.pages.dev
https://your-project.pages.dev/api/market-data
```

The API should return JSON with:

```json
{
  "source": "live",
  "rows": []
}
```

## Notes

- The frontend calls `/api/market-data`.
- The API is implemented as a Cloudflare Pages Function.
- Reku top 10 ranking is based on Reku market page volume.
- Indodax volume uses `vol_idr`.
- Tokocrypto first tries per-pair ticker API, then falls back to parsing the public trade page data.

