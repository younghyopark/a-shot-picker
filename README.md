# 📸 A-Shot Picker

A web-based photo selection tool that helps photographers and clients select their best 20-30 photos (A-shots) from massive photoshoot results (5000+ photos) using a smart tournament-style algorithm.

**Live Demo:** [photo-selection.github.io](https://photo-selection.github.io)

## Features

- 🗂️ **Local Folder Access** - Select any folder from your computer containing photos
- ⚡ **Fast Thumbnail Generation** - Efficient client-side thumbnail creation
- 🔍 **Quick Pre-filter** - Rapid elimination phase for large photo sets (200+ photos)
- ⚔️ **Tournament Mode** - Compare photos head-to-head or in small groups
- ⌨️ **Keyboard Shortcuts** - Quick selection using number keys 1-6
- 🏆 **Ranked Results** - Your A-shots sorted by selection frequency
- 📋 **Export Options** - Copy filenames or download list

## How It Works

### 1. Pre-filter Phase (for 200+ photos)
When you have a large number of photos, the app first shows batches of 50 photos at a time. Quickly click to deselect obvious rejects. This rapidly narrows down your pool.

### 2. Tournament Phase
Photos are shown in groups (2, 4, or 6 at a time). Select the ones you want to keep, and they advance. Non-selected photos are eliminated. This continues until you reach your target count.

### 3. Results
View your curated A-shots, ranked by how many times they were selected. Export the list for your photo editor.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-6` | Toggle selection for photo 1-6 |
| `Enter` | Confirm current selection |
| `A` | Select all photos in current match |
| `Escape` | Deselect all / Close viewer |

## Browser Support

This app uses the **File System Access API** which is currently supported in:
- ✅ Google Chrome
- ✅ Microsoft Edge  
- ✅ Opera
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

## Privacy

All processing happens locally in your browser. Your photos are never uploaded to any server.

## Local Development

Simply open `index.html` in a modern browser, or serve with any static file server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

## Deployment to GitHub Pages

1. Create a repository named `photo-selection` (or your preferred name)
2. Push the files to the `main` branch
3. Go to Settings → Pages → Source: Deploy from branch → `main`
4. Your site will be available at `https://[username].github.io/photo-selection/`

## License

MIT License - Feel free to use and modify for your needs.
