document.getElementById('refresh').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab.url && tab.url.includes('dropbox.com')) {
        chrome.tabs.reload(tab.id);
    } else {
        alert('Please navigate to a Dropbox folder page first.');
    }
});
