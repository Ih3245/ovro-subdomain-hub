# ovro-dns-portal

A clean, authentic, zero-slop DNS and Subdomain Manager for `ovro.me`, integrated directly with Cloudflare DNS API.

## Features
- **Zero Mock Data:** Directly queries and mutates live DNS records on Cloudflare Edge.
- **Quick Connect:** 1-click subdomain deployment to your Google Cloud VPS (`35.253.1.131`), Vercel (`cname.vercel-dns.com`), or root domain.
- **Custom Zone Editor:** Full support for `A`, `CNAME`, `TXT`, and `MX` records with Cloudflare Proxy (CDN/WAF) toggle.
- **Real-time Filter & Search:** Instantly filter subdomains and IP addresses.
- **Responsive & Lightweight:** Pure HTML/CSS/Vanilla JS with Node.js backend. No bloated runtime or client bundles.

## Running Locally
```bash
npm install
npm start
```
Open [http://localhost:3000](http://localhost:3000)

## Running on your VPS (`35.253.1.131`)
```bash
docker compose up -d --build
```
Access at `http://35.253.1.131:3000` (or proxy via Cloudflare Tunnel / Nginx to `dns.ovro.me`).
