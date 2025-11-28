```markdown
# Zine-style PDF flipbook — locked two-page spread

What this change does
- The flipbook is now locked to a two-page spread (display: 'double' in turn.js) and will always show the full spread as one unit on both desktop and mobile.
- The JS computes page dimensions so the two pages + gutter fit the wrapper width; on window resize the spread is resized and visible canvases are re-rendered for crisp output.
- Lazy rendering remains to keep performance acceptable for larger PDFs.

How to run
1. Place these files (index.html, styles.css, script.js, README.md) in a folder.
2. Put your PDF named `sample.pdf` in the same folder OR edit `PDF_URL` in `script.js` to point to your PDF (CORS applies).
3. Serve over HTTP (file:// will block PDF.js worker):
   - Python 3:
     ```
     python -m http.server 8000
     ```
   - Open `http://localhost:8000/` and the book will show a two-page spread.

Notes & tips
- If you want the pages to be larger on small screens you can reduce the wrapper padding or change the page aspect ratio logic in script.js.
- For very large PDFs consider more aggressive lazy-rendering (render only visible pages and maybe one spread ahead).
- If you want to remove jQuery/turn.js and replace with a vanilla library I can convert this to use a modern page-flip library (e.g., page-flip or StPageFlip).

If you'd like, I can:
- Convert this into a responsive React component that always shows a locked two-up spread.
- Add UI controls (zoom, thumbnails, single-spread toggle) while still forcing two-up on mobile.

```