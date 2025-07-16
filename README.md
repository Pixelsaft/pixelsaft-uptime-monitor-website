# pixelsaft-uptime-monitor-website

Automated uptime monitoring for web services, servers, and network ports with GitHub Actions.

**That's it!**

## Features

- **Automated monitoring** - Runs every 5 minutes via GitHub Actions
- **Multiple protocols** - HTTP/HTTPS URLs and TCP port monitoring
- **Uptime tracking** - 30-day and 365-day uptime percentages
- **Mobile responsive** - Clean, minimal design inspired by [pixelsaft.wtf](https://pixelsaft.wtf/)
- **Zero maintenance** - Fully automated with GitHub Actions + Pages
- **Semantic HTML** - Accessible and SEO-friendly structure

## Quick Start

1. **Fork this repository**
2. **Enable GitHub Pages** in Settings → Pages → Source: GitHub Actions
3. **Configure services** in `docs/db.json` (see below)
4. **Your monitor** will be at `https://username.github.io/repo-name/`

## Live Example

See it in action: **https://status.pixelsaft.wtf**

## Service Configuration

Edit `docs/db.json` to add your services:

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
    "allTime": { "total": 0, "successful": 0 },
    "30d": { "total": 0, "successful": 0, "uptime": 100, "lastReset": 0 },
    "365d": { "total": 0, "successful": 0, "uptime": 100, "lastReset": 0 }
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
    "allTime": { "total": 0, "successful": 0 },
    "30d": { "total": 0, "successful": 0, "uptime": 100, "lastReset": 0 },
    "365d": { "total": 0, "successful": 0, "uptime": 100, "lastReset": 0 }
  }
}
```

## Custom Domain

To use a custom domain:
1. Go to Settings → Pages
2. Enter your domain in "Custom domain"
3. Configure DNS A records to point to GitHub's IPs:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`  
   - `185.199.111.153`

## Local Development

```bash
npm install
npm run dev              # Start development server with auto-reload
npm run start            # Start production server
npm run checkAndUpdateDb # Run uptime check manually
```

## Architecture

- **Frontend**: Static HTML/CSS/JS served from `docs/`
- **Backend**: Node.js monitoring script using built-in modules only
- **Database**: Single JSON file `docs/db.json`
- **Deployment**: GitHub Actions + Pages (zero config)

## File Structure

```
├── .github/workflows/uptime-check.yml  # GitHub Actions workflow
├── docs/                               # Static site files
│   ├── index.html                      # Main page
│   ├── style.css                       # Minimal CSS
│   ├── app.js                          # Frontend logic
│   └── db.json                         # Service data
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

1. **GitHub Actions** runs every 5 minutes
2. **Node.js script** checks each service (HTTP/TCP)
3. **Updates JSON database** with results and uptime stats
4. **Commits changes** back to repository
5. **GitHub Pages** serves the updated site

## License

MIT
# Reactivate scheduled workflow
