// Helper to parse "00:00 / 01:41" into just "01:41"
const extractDuration = (htmlString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const timer = doc.querySelector('[role="timer"]');
    if (timer) {
        return timer.textContent.split('/')[1]?.trim() || "??";
    }
    return null;
};

// Function to add the duration column
const updateTableUI = () => {
    const headerRow = document.querySelector('.dig-Table-row--header');
    if (headerRow && !document.getElementById('duration-header')) {
        const durHeader = document.createElement('div');
        durHeader.id = 'duration-header';
        durHeader.className = 'dig-Table-header-cell';
        durHeader.style.width = '15%';
        durHeader.innerHTML = '<span class="dig-Text--variant-label">Duration</span>';
        headerRow.appendChild(durHeader);
    }

    const rows = document.querySelectorAll('div[data-testid="ROW_TEST_ID"]');
    rows.forEach(async (row) => {
        if (row.hasAttribute('data-duration-loaded')) return;

        // Create the cell even if empty to keep alignment
        const cell = document.createElement('div');
        cell.className = 'dig-Table-cell';
        cell.style.width = '15%';
        row.appendChild(cell);
        row.setAttribute('data-duration-loaded', 'true');

        const link = row.querySelector('a[data-testid="sl-list-column--name"]');
        if (link && link.href.includes('.mp4')) {
            cell.innerText = 'Loading...';
            try {
                const response = await fetch(link.href);
                const html = await response.text();
                const duration = extractDuration(html);
                cell.innerText = duration || 'N/A';
                // Trigger a custom event to recalculate SUM here
            } catch (e) {
                cell.innerText = 'Error';
            }
        }
    });
};

// Dropbox is an SPA, so we watch for DOM changes
const observer = new MutationObserver(() => updateTableUI());
observer.observe(document.body, { childList: true, subtree: true });
