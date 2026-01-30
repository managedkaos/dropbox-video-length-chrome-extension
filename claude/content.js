// content.js - Main content script that runs on Dropbox folder pages
// DEBUG VERSION with extensive logging

class DropboxVideoDuration {
    constructor() {
        this.durations = new Map();
        this.processing = false;
        this.observer = null;
        this.totalDuration = 0;
    }

    init() {
        console.log('🎬 Dropbox Video Duration Extension: Initialized');
        this.addDurationColumn();
        this.processVideos();
        this.watchForChanges();

        // Make available for manual debugging
        window.debugExtension = this;
        console.log('💡 Debug tip: Use window.debugExtension in console to access extension methods');
    }

    // Add a new "Duration" column header
    addDurationColumn() {
        const headerRow = document.querySelector('[role="row"].dig-Table-row--header');
        if (!headerRow || document.querySelector('[data-testid="sl-list-header--duration"]')) {
            console.log('⏭️ Duration column already exists or header not found');
            return;
        }

        // Find the Size column to insert after it
        const sizeHeader = headerRow.querySelector('[data-testid="sl-list-header--size"]');
        if (!sizeHeader) {
            console.log('❌ Size header not found');
            return;
        }

        // Create duration header
        const durationHeader = document.createElement('div');
        durationHeader.setAttribute('role', 'columnheader');
        durationHeader.setAttribute('data-testid', 'sl-list-header--duration');
        durationHeader.className = sizeHeader.className;
        durationHeader.style.width = '15%';
        durationHeader.innerHTML = `
        <button class="dig-Table-header-sort-button dig-cwil8ce_23-4-0">
          <span>
            <span class="dig-Text dig-Text--variant-label dig-Text--size-medium dig-Text--color-standard dig-Text--size-standard dig-6lejgsc_23-4-0 dig-6lejgs0_23-4-0 dig-6lejgsn_23-4-0 dig-6lejgsq_23-4-0 dig-6lejgsk_23-4-0 dig-6lejgsv_23-4-0 dig-6lejgsd_23-4-0 dig-6lejgsz_23-4-0">
              Duration
            </span>
          </span>
        </button>
      `;

        sizeHeader.parentNode.insertBefore(durationHeader, sizeHeader.nextSibling);
        console.log('✅ Duration column added');
    }

    // Get all video rows from the page
    getVideoRows() {
        const rows = document.querySelectorAll('[role="row"][data-testid="ROW_TEST_ID"]');
        const videoRows = Array.from(rows).filter(row => {
            const link = row.querySelector('a[href*=".mp4"], a[href*=".mov"], a[href*=".avi"], a[href*=".mkv"], a[href*=".webm"]');
            return link !== null;
        });
        console.log(`📹 Found ${videoRows.length} video row(s)`);
        return videoRows;
    }

    // Add duration cell to a row
    addDurationCell(row, duration = null) {
        // Check if duration cell already exists
        if (row.querySelector('[data-testid="sl-list-column--duration"]')) {
            return row.querySelector('[data-testid="sl-list-column--duration"]');
        }

        const sizeCell = row.querySelector('[data-testid="sl-list-column--size"]');
        if (!sizeCell) return null;

        const durationCell = document.createElement('div');
        durationCell.setAttribute('role', 'cell');
        durationCell.setAttribute('data-testid', 'sl-list-column--duration');
        durationCell.className = sizeCell.className;

        const span = document.createElement('span');
        span.className = sizeCell.querySelector('span').className;
        span.textContent = duration || 'Loading...';
        span.style.color = duration ? '' : '#999';

        durationCell.appendChild(span);
        sizeCell.parentNode.insertBefore(durationCell, sizeCell.nextSibling);

        return durationCell;
    }

    // Helper method to find HTML snippets around keywords
    findHTMLSnippet(html, keyword, contextLength = 100) {
        const lowerHTML = html.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        const index = lowerHTML.indexOf(lowerKeyword);

        if (index === -1) return `Keyword "${keyword}" not found`;

        const start = Math.max(0, index - contextLength);
        const end = Math.min(html.length, index + keyword.length + contextLength);

        return html.substring(start, end);
    }

    // Scan document for all time-related elements
    scanForTimeElements(doc) {
        console.log('🔍 === Scanning for time-related elements ===');

        // Get all elements
        const allElements = doc.querySelectorAll('*');
        console.log('📊 Total elements in document:', allElements.length);

        // Find elements with time-related classes
        const timeRelated = Array.from(allElements).filter(el => {
            const className = el.className || '';
            const id = el.id || '';
            return className.includes('time') ||
                className.includes('duration') ||
                className.includes('timer') ||
                id.includes('time') ||
                id.includes('duration');
        });

        console.log('⏱️ Elements with time-related classes/ids:', timeRelated.length);
        timeRelated.forEach((el, i) => {
            console.log(`  ${i + 1}. Class: "${el.className}", ID: "${el.id}", Text: "${el.textContent.substring(0, 50)}"`);
        });

        // Find elements with role="timer"
        const timers = doc.querySelectorAll('[role="timer"]');
        console.log('⏲️ Elements with role="timer":', timers.length);
        timers.forEach((el, i) => {
            console.log(`  ${i + 1}. Text: "${el.textContent}"`);
        });

        // Find spans with time format text
        const allSpans = doc.querySelectorAll('span');
        const timeFormatSpans = Array.from(allSpans).filter(span => {
            const text = span.textContent.trim();
            return /\d{1,2}:\d{2}/.test(text);
        });

        console.log('🕐 Spans with time format (MM:SS):', timeFormatSpans.length);
        timeFormatSpans.forEach((span, i) => {
            console.log(`  ${i + 1}. Class: "${span.className}", Text: "${span.textContent}"`);
        });

        return {
            timeRelated,
            timers,
            timeFormatSpans
        };
    }

    // Fetch duration for a single video - IFRAME APPROACH for dynamic content
    async fetchVideoDuration(url, row) {
        console.log('\n🎯 === Fetching duration for URL ===');
        console.log('🔗 URL:', url);

        // Check if we already have a valid duration for this URL
        if (this.durations.has(url)) {
            const cachedDuration = this.durations.get(url);
            console.log('✓ Already have cached duration:', cachedDuration);
            return cachedDuration;
        }

        return new Promise((resolve) => {
            try {
                // Create a hidden iframe to load the video page
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.style.position = 'absolute';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = 'none';

                let timeoutId;
                let checkInterval;

                // Cleanup function
                const cleanup = () => {
                    clearTimeout(timeoutId);
                    clearInterval(checkInterval);
                    if (iframe.parentNode) {
                        document.body.removeChild(iframe);
                    }
                };

                // Set timeout to prevent hanging
                timeoutId = setTimeout(() => {
                    console.warn('⏱️ Timeout waiting for video duration');
                    cleanup();
                    this.updateDurationCell(row, 'Timeout');
                    resolve(null);
                }, 15000); // 15 second timeout

                iframe.onload = () => {
                    console.log('📄 Iframe loaded');

                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

                        // Function to check for time display
                        const checkForTime = () => {
                            try {
                                // Try all possible selectors
                                const selectors = [
                                    '#fvsdk-container > div > div > div > div > div._videoControlsWrapper_he7vi_1 > div._videoControlsToolbar_he7vi_25 > span',
                                    '._videoControlsToolbar_he7vi_25 > span',
                                    '[class*="videoControlsToolbar"] > span',
                                    '[class*="timeDisplay"]',
                                    '[role="timer"]',
                                    '#fvsdk-container span[class*="time"]'
                                ];

                                for (const selector of selectors) {
                                    const timeDisplay = iframeDoc.querySelector(selector);
                                    if (timeDisplay && timeDisplay.textContent.includes('/')) {
                                        const timeText = timeDisplay.textContent.trim();
                                        console.log('✅ Found time display:', timeText, 'using selector:', selector);
                                        console.log('   Raw textContent:', JSON.stringify(timeDisplay.textContent));
                                        console.log('   Trimmed text:', JSON.stringify(timeText));

                                        // Extract total duration (format: "00:00 / MM:SS")
                                        // Match the time AFTER the slash
                                        const match = timeText.match(/\/\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
                                        console.log('   Regex match result:', match);

                                        if (match) {
                                            const duration = match[1]; // This captures the group after the slash
                                            console.log('🎉 Duration extracted:', duration, 'from text:', timeText);
                                            this.durations.set(url, duration);
                                            this.updateDurationCell(row, duration);

                                            // Add to total
                                            this.totalDuration += this.parseDurationToSeconds(duration);
                                            this.updateTotalDisplay();

                                            cleanup();
                                            resolve(duration);
                                            return true;
                                        } else {
                                            console.warn('⚠️ Regex did not match for text:', timeText);
                                        }
                                    }
                                }

                                // Also check for any span with time format
                                const allSpans = iframeDoc.querySelectorAll('span');
                                for (const span of allSpans) {
                                    const text = span.textContent.trim();
                                    if (/\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/.test(text)) {
                                        console.log('✅ Found time in span:', text);
                                        console.log('   Raw span textContent:', JSON.stringify(span.textContent));
                                        console.log('   Trimmed text:', JSON.stringify(text));

                                        const match = text.match(/\/\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
                                        console.log('   Regex match result:', match);

                                        if (match) {
                                            const duration = match[1];
                                            console.log('🎉 Duration extracted from span:', duration, 'from text:', text);
                                            this.durations.set(url, duration);
                                            this.updateDurationCell(row, duration);
                                            this.totalDuration += this.parseDurationToSeconds(duration);
                                            this.updateTotalDisplay();
                                            cleanup();
                                            resolve(duration);
                                            return true;
                                        } else {
                                            console.warn('⚠️ Regex did not match for span text:', text);
                                        }
                                    }
                                }

                                return false;
                            } catch (e) {
                                console.log('Error checking for time:', e);
                                return false;
                            }
                        };

                        // Check immediately
                        if (checkForTime()) return;

                        // If not found immediately, check every 500ms
                        console.log('🔄 Time display not found immediately, polling...');
                        let attempts = 0;
                        checkInterval = setInterval(() => {
                            attempts++;
                            console.log(`⏳ Attempt ${attempts} to find time display...`);

                            if (checkForTime()) {
                                clearInterval(checkInterval);
                            }

                            // Debug: log what's in the iframe
                            if (attempts === 3) {
                                console.log('🔍 Debug: Looking for video controls in iframe...');
                                const doc = iframe.contentDocument;
                                const videoControls = doc.querySelectorAll('[class*="video"]');
                                console.log('  Found elements with "video" in class:', videoControls.length);
                                videoControls.forEach((el, i) => {
                                    if (i < 5) console.log(`    ${i + 1}. ${el.className}`);
                                });

                                const allSpans = doc.querySelectorAll('span');
                                console.log('  Total spans in iframe:', allSpans.length);
                                const timeSpans = Array.from(allSpans).filter(s => /\d{1,2}:\d{2}/.test(s.textContent));
                                console.log('  Spans with time format:', timeSpans.length);
                                timeSpans.forEach((s, i) => {
                                    if (i < 5) console.log(`    ${i + 1}. "${s.textContent}" (class: ${s.className})`);
                                });
                            }

                            if (attempts >= 20) { // Stop after 10 seconds (20 * 500ms)
                                console.warn('❌ Could not find time display after 20 attempts');
                                cleanup();
                                this.updateDurationCell(row, 'N/A');
                                resolve(null);
                            }
                        }, 500);

                    } catch (error) {
                        console.error('❌ Error accessing iframe:', error);
                        cleanup();
                        this.updateDurationCell(row, 'Error');
                        resolve(null);
                    }
                };

                iframe.onerror = (error) => {
                    console.error('❌ Iframe load error:', error);
                    cleanup();
                    this.updateDurationCell(row, 'Error');
                    resolve(null);
                };

                // Add iframe to page and load URL
                document.body.appendChild(iframe);
                iframe.src = url;
                console.log('⏳ Loading URL in hidden iframe...');

            } catch (error) {
                console.error('❌ Error creating iframe:', error);
                this.updateDurationCell(row, 'Error');
                resolve(null);
            }
        });
    }

    // Update duration cell with the fetched duration
    updateDurationCell(row, duration) {
        console.log('📝 Updating cell with duration:', duration);
        const cell = row.querySelector('[data-testid="sl-list-column--duration"]');
        if (cell) {
            const span = cell.querySelector('span');
            if (span) {
                const oldValue = span.textContent;

                // Don't overwrite a valid duration with N/A, Error, Timeout, or Loading...
                if (oldValue &&
                    oldValue !== 'Loading...' &&
                    oldValue !== 'N/A' &&
                    oldValue !== 'Error' &&
                    oldValue !== 'Timeout' &&
                    (duration === 'N/A' || duration === 'Error' || duration === 'Timeout')) {
                    console.log('   ⏭️ Skipping update - keeping existing valid duration:', oldValue);
                    return;
                }

                span.textContent = duration;
                span.style.color = duration === 'Loading...' ? '#999' : '';
                console.log('   Cell updated from:', oldValue, 'to:', duration);
            } else {
                console.warn('   ⚠️ No span found in duration cell');
            }
        } else {
            console.warn('   ⚠️ No duration cell found');
        }
    }

    // Convert duration string to seconds
    parseDurationToSeconds(duration) {
        const parts = duration.split(':').map(Number);
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1]; // MM:SS
        } else if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
        }
        return 0;
    }

    // Convert seconds to duration string
    formatSecondsAsDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    // Add or update the total duration display
    updateTotalDisplay() {
        let totalElement = document.querySelector('#video-duration-total');

        if (!totalElement) {
            // Create the total display
            const table = document.querySelector('[role="table"]');
            if (!table) return;

            totalElement = document.createElement('div');
            totalElement.id = 'video-duration-total';
            totalElement.style.cssText = `
          padding: 12px 16px;
          background: #f7f9fa;
          border-top: 1px solid #e0e0e0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          font-size: 14px;
          font-weight: 600;
          color: #1e1919;
        `;

            table.parentNode.insertBefore(totalElement, table.nextSibling);
        }

        const formattedDuration = this.formatSecondsAsDuration(this.totalDuration);
        totalElement.textContent = `Total Duration: ${formattedDuration}`;
    }

    // Process all videos on the page
    async processVideos() {
        if (this.processing) {
            console.log('⏸️ Already processing, skipping...');
            return;
        }

        this.processing = true;
        this.totalDuration = 0;

        const videoRows = this.getVideoRows();
        console.log(`\n🎬 Processing ${videoRows.length} video(s)...`);

        for (let i = 0; i < videoRows.length; i++) {
            const row = videoRows[i];
            const link = row.querySelector('a[href*=".mp4"], a[href*=".mov"], a[href*=".avi"], a[href*=".mkv"], a[href*=".webm"]');
            if (!link) continue;

            const url = link.getAttribute('href');
            const filename = link.getAttribute('aria-label') || 'Unknown';
            console.log(`\n📹 [${i + 1}/${videoRows.length}] Processing: ${filename}`);

            this.addDurationCell(row);

            // Check if we already have this duration cached
            if (this.durations.has(url)) {
                console.log('✓ Using cached duration');
                this.updateDurationCell(row, this.durations.get(url));
                this.totalDuration += this.parseDurationToSeconds(this.durations.get(url));
            } else {
                // Fetch duration - each one completes before starting the next
                await this.fetchVideoDuration(url, row);
            }
        }

        this.processing = false;
        console.log('\n✅ Finished processing all videos');
        console.log('📊 Total cached durations:', this.durations.size);
    }

    // Watch for DOM changes (new videos loaded via infinite scroll, etc.)
    watchForChanges() {
        const tableBody = document.querySelector('[role="rowgroup"].dig-Table-body');
        if (!tableBody) {
            console.log('❌ Could not find table body to watch');
            return;
        }

        console.log('👀 Watching for DOM changes...');

        this.observer = new MutationObserver((mutations) => {
            let shouldProcess = false;

            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                    break;
                }
            }

            if (shouldProcess && !this.processing) {
                console.log('🔄 DOM changed, re-processing videos...');
                setTimeout(() => this.processVideos(), 1000);
            }
        });

        this.observer.observe(tableBody, {
            childList: true,
            subtree: true
        });
    }

    // Manual debug helpers
    debugSingleVideo() {
        const firstVideoRow = this.getVideoRows()[0];
        if (!firstVideoRow) {
            console.log('❌ No video rows found');
            return;
        }

        const link = firstVideoRow.querySelector('a');
        const url = link.getAttribute('href');

        console.log('🔗 Opening URL in new tab for manual inspection:', url);
        window.open(url, '_blank');
    }

    // Cleanup
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        console.log('🛑 Extension destroyed');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const extension = new DropboxVideoDuration();
        extension.init();
    });
} else {
    const extension = new DropboxVideoDuration();
    extension.init();
}

console.log('🚀 Dropbox Video Duration Extension script loaded');
