# pixelsaft-uptime-monitor-website

Automated uptime monitoring for web services, servers, and network ports with GitHub Actions.

That’s it!

## Features

- **Automated monitoring** - Runs every 15 minutes via GitHub Actions
- **Multiple protocols** - HTTP/HTTPS URLs and TCP port monitoring
- **Uptime tracking** - All-time plus rolling 30-day and 365-day uptime percentages with monitor coverage
- **Mobile responsive** - Clean, minimal design inspired by [pixelsaft.wtf](https://pixelsaft.wtf/)
- **Zero maintenance** - Fully automated with GitHub Actions + Pages
- **Semantic HTML** - Accessible and SEO-friendly structure

## Quick Start

1. **Fork this repository**
2. **Configure services** in `docs/status.json` (see below)
3. **Commit changes** to your fork
4. **Enable GitHub Pages** in Settings → Pages → Source: GitHub Actions
5. **Your monitor** will be at `https://username.github.io/repo-name/`

## Live Example

See it in action: **<https://status.pixelsaft.wtf>**

## Service Configuration

Edit `docs/status.json` to add your services:

### URL Monitoring

```json
{
  "config": {
    "address": "https://example.com",
    "type": "url",
    "timeout": 5,
    "checkInterval": 300
  },
  "status": { "isUp": true, "lastCheck": 0, "lastResultDuration": 0 },
  "stats": {
    "allTime": { "total": 0, "successful": 0, "uptime": 100, "expected": 0, "coverage": 100, "since": 0 },
    "30d": { "total": 0, "successful": 0, "uptime": 100, "expected": 0, "coverage": 100, "since": 0 },
    "365d": { "total": 0, "successful": 0, "uptime": 100, "expected": 0, "coverage": 100, "since": 0 }
  }
}
```

### Port Monitoring

```json
{
  "config": {
    "address": "mail.example.com",
    "type": "host",
    "port": "993",
    "timeout": 5,
    "checkInterval": 300
  },
  "status": { "isUp": true, "lastCheck": 0, "lastResultDuration": 0 },
  "stats": {
    "allTime": { "total": 0, "successful": 0, "uptime": 100, "expected": 0, "coverage": 100, "since": 0 },
    "30d": { "total": 0, "successful": 0, "uptime": 100, "expected": 0, "coverage": 100, "since": 0 },
    "365d": { "total": 0, "successful": 0, "uptime": 100, "expected": 0, "coverage": 100, "since": 0 }
  }
}
```

## Local Development

```bash
npm install
npm run dev              # Start development server with auto-reload
npm run checkAndUpdateDb # Run uptime check manually
```

Open the local site at <http://localhost:3000>.

## Architecture

- **Frontend**: Static HTML/CSS/JS served from `docs/`
- **Backend**: Node.js monitoring script using built-in modules only
- **Status data**: Lightweight public JSON file `docs/status.json`
- **History data**: Historical check data in `history.json` (not deployed to GitHub Pages)
- **Deployment**: GitHub Actions + Pages (zero config)

## File Structure

```
├── .github/workflows/check-uptime-and-update-db.yml  # GitHub Actions workflow
├── docs/                               # Static site files
│   ├── index.html                      # Main page
│   ├── style.css                       # Minimal CSS
│   ├── app.js                          # Frontend logic
│   └── status.json                     # Public service status and stats
├── history.json                        # Full historical check data
├── check-and-update-db.js              # Monitoring script
├── server.js                           # Development server
└── package.json                        # Dependencies & scripts
```

## Design Philosophy

Following the **pixelsaft.wtf** approach:

- ✅ **Minimal and functional** - No unnecessary features
- ✅ **Semantic HTML** - Proper accessibility and SEO
- ✅ **Mobile-first** - Responsive design that works everywhere
- ✅ **Monospace fonts** - Clean typography, no web fonts
- ✅ **Dark mode support** - Respects system preferences
- ✅ **Zero maintenance** - Set it and forget it

## How It Works

1. **GitHub Actions** runs every 15 minutes
2. **Node.js script** checks each service (HTTP/TCP)
3. **Updates `docs/status.json` with public status/stats and `history.json` with historical check data**
4. **Commits changes** back to repository
5. **GitHub Pages** serves the updated site

Uptime percentages are calculated from recorded service checks. The public page fetches the lightweight `docs/status.json`; historical check data is kept separately in `history.json`. The frontend shows uptime plus the number of recorded checks. All-time totals are kept as aggregate counters, while detailed history is kept for rolling 30d/365d calculations.

## License

MIT
