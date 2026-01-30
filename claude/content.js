// content.js - Main content script that runs on Dropbox folder pages

class DropboxVideoDuration {
    constructor() {
        this.durations = new Map();
        this.processing = false;
        this.observer = null;
        this.totalDuration = 0;
    }

    init() {
        console.log('Dropbox Video Duration Extension: Initialized');
        this.addDurationColumn();
        this.processVideos();
        this.watchForChanges();
    }

    // Add a new "Duration" column header
    addDurationColumn() {
        const headerRow = document.querySelector('[role="row"].dig-Table-row--header');
        if (!headerRow || document.querySelector('[data-testid="sl-list-header--duration"]')) {
            return; // Already added or header not found
        }

        // Find the Size column to insert after it
        const sizeHeader = headerRow.querySelector('[data-testid="sl-list-header--size"]');
        if (!sizeHeader) return;

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
    }

    // Get all video rows from the page
    getVideoRows() {
        const rows = document.querySelectorAll('[role="row"][data-testid="ROW_TEST_ID"]');
        return Array.from(rows).filter(row => {
            const link = row.querySelector('a[href*=".mp4"], a[href*=".mov"], a[href*=".avi"], a[href*=".mkv"], a[href*=".webm"]');
            return link !== null;
        });
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

    // Fetch duration for a single video
    async fetchVideoDuration(url, row) {
        try {
            const response = await fetch(url);
            const html = await response.text();

            // Parse the HTML to find the duration
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Look for the time display element
            const timeDisplay = doc.querySelector('._timeDisplay_1yfie_1, [role="timer"]');

            if (timeDisplay) {
                const timeText = timeDisplay.textContent.trim();
                // Extract total duration (format: "00:00 / MM:SS")
                const match = timeText.match(/\/\s*(\d{1,2}:\d{2}(?::\d{2})?)/);

                if (match) {
                    const duration = match[1];
                    this.durations.set(url, duration);
                    this.updateDurationCell(row, duration);

                    // Add to total
                    this.totalDuration += this.parseDurationToSeconds(duration);
                    this.updateTotalDisplay();

                    return duration;
                }
            }

            // If not found, mark as unavailable
            this.updateDurationCell(row, 'N/A');
            return null;

        } catch (error) {
            console.error('Error fetching duration:', error);
            this.updateDurationCell(row, 'Error');
            return null;
        }
    }

    // Update duration cell with the fetched duration
    updateDurationCell(row, duration) {
        const cell = row.querySelector('[data-testid="sl-list-column--duration"]');
        if (cell) {
            const span = cell.querySelector('span');
            if (span) {
                span.textContent = duration;
                span.style.color = duration === 'Loading...' ? '#999' : '';
            }
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
        if (this.processing) return;
        this.processing = true;
        this.totalDuration = 0;

        const videoRows = this.getVideoRows();
        console.log(`Found ${videoRows.length} video(s)`);

        for (const row of videoRows) {
            const link = row.querySelector('a[href*=".mp4"], a[href*=".mov"], a[href*=".avi"], a[href*=".mkv"], a[href*=".webm"]');
            if (!link) continue;

            const url = link.getAttribute('href');
            this.addDurationCell(row);

            // Check if we already have this duration cached
            if (this.durations.has(url)) {
                this.updateDurationCell(row, this.durations.get(url));
                this.totalDuration += this.parseDurationToSeconds(this.durations.get(url));
            } else {
                // Fetch duration with a small delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.fetchVideoDuration(url, row);
            }
        }

        this.processing = false;
    }

    // Watch for DOM changes (new videos loaded via infinite scroll, etc.)
    watchForChanges() {
        const tableBody = document.querySelector('[role="rowgroup"].dig-Table-body');
        if (!tableBody) return;

        this.observer = new MutationObserver((mutations) => {
            let shouldProcess = false;

            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                    break;
                }
            }

            if (shouldProcess && !this.processing) {
                setTimeout(() => this.processVideos(), 1000);
            }
        });

        this.observer.observe(tableBody, {
            childList: true,
            subtree: true
        });
    }

    // Cleanup
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
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
