// Locked two-page spread flipbook using PDF.js + turn.js
// Configure PDF URL:
const PDF_URL = 'sample.pdf'; // change to your PDF (CORS applies)

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

let pdfDoc = null;
const $flipbook = $('#flipbook');
const $wrapper = $('.book-wrapper');
const canvasesCache = {}; // cache rendered canvases by page number
let pageWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--page-width')) || 600;
let pageHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--page-height')) || 800;
let gutter = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gutter')) || 16;
let turnInitialized = false;

// create DOM slot for a page index
function ensurePageSlot(i) {
  let $pg = $flipbook.find(`.page[data-page="${i}"]`);
  if ($pg.length) return $pg;
  const $div = $('<div/>', { class: 'page rough-edge', 'data-page': i }).append(
    $('<canvas/>')
  );
  if (i % 2 === 0) $div.addClass('left');
  $div.append($('<div/>', { class: 'pagenum', text: i }));
  $flipbook.append($div);
  return $div;
}

// Render a PDF page into its canvas at the current computed pageWidth/pageHeight.
// scaleOverride (optional) can be provided to fine-tune DPI multiplier.
async function renderPage(pageNum, scaleOverride) {
  if (!pdfDoc) return;
  // If already rendered at the current target width/height, reuse
  const cacheKey = `${pageNum}@${pageWidth}x${pageHeight}`;
  if (canvasesCache[cacheKey]) return canvasesCache[cacheKey];

  const page = await pdfDoc.getPage(pageNum);
  const viewportBase = page.getViewport({ scale: 1 });
  // compute scale to map PDF units to desired canvas pixels.
  // We want canvas CSS width == pageWidth (CSS px). For crispness use devicePixelRatio.
  const cssScaleX = pageWidth / viewportBase.width;
  const cssScaleY = pageHeight / viewportBase.height;
  const chosenScale = Math.min(cssScaleX, cssScaleY);
  const deviceScale = (scaleOverride || 1) * window.devicePixelRatio;
  const finalScale = chosenScale * deviceScale;

  const vp = page.getViewport({ scale: finalScale });

  const $slot = ensurePageSlot(pageNum);
  const canvas = $slot.find('canvas')[0];
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  // Make the canvas visually fill the page element (CSS pixel size)
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const ctx = canvas.getContext('2d');
  // fill background to mimic paper color so partial transparency still shows
  ctx.save();
  ctx.fillStyle = '#faf6ee';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  canvasesCache[cacheKey] = canvas;
  return canvas;
}

// Compute sizes so a two-page spread fits the wrapper width and set CSS variables.
function computeLayoutFromWrapper() {
  // available width inside wrapper
  const wrapperWidth = Math.max(320, $wrapper.innerWidth());
  gutter = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gutter')) || 16;

  // compute pageWidth such that two pages + gutter fit the wrapper
  // leave a small margin inside the wrapper (16px)
  const maxSpreadWidth = wrapperWidth - 0; // already padded by wrapper styles
  const computedPageWidth = Math.floor((maxSpreadWidth - gutter) / 2);
  // keep some reasonable aspect ratio fallback until we know PDF page ratio
  const defaultAspect = 600 / 800; // width/height for fallback
  const computedPageHeight = Math.round(computedPageWidth / defaultAspect);

  pageWidth = computedPageWidth;
  pageHeight = computedPageHeight;

  // Set CSS vars to let styling and canvas sizing use them
  document.documentElement.style.setProperty('--page-width', `${pageWidth}px`);
  document.documentElement.style.setProperty('--page-height', `${pageHeight}px`);
  document.documentElement.style.setProperty('--gutter', `${gutter}px`);
}

// After PDF loads we can refine height based on the actual PDF first page aspect ratio.
async function refineLayoutFromPdfFirstPage() {
  if (!pdfDoc) return;
  const page1 = await pdfDoc.getPage(1);
  const vp = page1.getViewport({ scale: 1 });
  const pdfRatio = vp.width / vp.height; // width/height
  // compute pageHeight given current pageWidth and real aspect ratio
  pageHeight = Math.round(pageWidth / pdfRatio);
  document.documentElement.style.setProperty('--page-height', `${pageHeight}px`);
}

// Initialize turn.js with two-page display locked
function initTurn(spreadWidth, spreadHeight, totalPages) {
  if (turnInitialized) {
    try {
      // resize if already initialized
      $flipbook.turn('size', spreadWidth, spreadHeight);
      $flipbook.turn('pages', totalPages);
      return;
    } catch (e) {
      // if resizing fails, destroy & recreate
      try { $flipbook.turn('destroy'); } catch (e2) {}
      turnInitialized = false;
    }
  }

  // turn.js options: display double to lock two-up
  $flipbook.turn({
    width: spreadWidth,
    height: spreadHeight,
    autoCenter: true,
    duration: 700,
    acceleration: true,
    gradients: true,
    elevation: 50,
    display: 'double',
    pages: totalPages
  });

  turnInitialized = true;
}

// Render a small neighborhood of pages to ensure the spread is ready
function renderNeighborhood(centerPage) {
  const pagesToRender = new Set([centerPage - 1, centerPage, centerPage + 1, centerPage + 2, centerPage - 2]);
  for (const p of pagesToRender) {
    if (p >= 1 && p <= pdfDoc.numPages) {
      renderPage(p).catch(err => console.error('Render error', err));
    }
  }
}

// Top-level loader
async function loadPdfAndBuild(url) {
  computeLayoutFromWrapper();

  const loadingTask = pdfjsLib.getDocument(url);
  pdfDoc = await loadingTask.promise;

  // refine layout from actual PDF ratio
  await refineLayoutFromPdfFirstPage();

  // create page slots
  $flipbook.empty();
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    ensurePageSlot(i);
  }

  const spreadWidth = pageWidth * 2 + gutter;
  const spreadHeight = pageHeight;

  initTurn(spreadWidth, spreadHeight, pdfDoc.numPages);

  // initial render for first spread (pages 1 and 2)
  const initialPages = [1, 2, 3];
  await Promise.all(initialPages.filter(p => p <= pdfDoc.numPages).map(p => renderPage(p)));

  // When user starts turning, pre-render nearby pages
  $flipbook.bind('turning', function (e, page, view) {
    // page is the page being turned to
    renderNeighborhood(page);
  });

  // After the turn completes, ensure neighborhood rendered
  $flipbook.bind('turned', function (e, page, view) {
    renderNeighborhood(page);
  });

  // ensure initial neighborhood
  renderNeighborhood(1);
}

// debounce-based resize handler to keep spread visible on all sizes
let resizeTimer = null;
function handleResize() {
  if (!pdfDoc) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    // recompute layout dimensions
    computeLayoutFromWrapper();
    // refine height based on pdf ratio again (safe)
    await refineLayoutFromPdfFirstPage();

    const spreadWidth = pageWidth * 2 + gutter;
    const spreadHeight = pageHeight;

    // resize turn.js book
    try {
      if (turnInitialized) {
        $flipbook.turn('size', spreadWidth, spreadHeight);
      } else {
        initTurn(spreadWidth, spreadHeight, pdfDoc.numPages);
      }
    } catch (e) {
      // attempt full reinit
      try { $flipbook.turn('destroy'); } catch (e2) {}
      turnInitialized = false;
      initTurn(spreadWidth, spreadHeight, pdfDoc.numPages);
    }

    // Clear canvas caches (to re-render at new resolution). We only clear caches for visible pages to keep speed,
    // but simple approach: drop all caches to force re-rendering with new pageWidth/pageHeight.
    for (const k of Object.keys(canvasesCache)) delete canvasesCache[k];

    // Render pages around current page
    let current = 1;
    try { current = $flipbook.turn('page'); } catch (e) { current = 1; }
    renderNeighborhood(current);

  }, 180);
}

window.addEventListener('resize', handleResize);

// Start
loadPdfAndBuild(PDF_URL).catch(err => {
  console.error('Error loading PDF:', err);
  alert('Could not load the PDF. Check console and ensure the PDF exists and is served from the same origin or CORS is allowed.');
});