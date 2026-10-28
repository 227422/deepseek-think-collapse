const input = document.getElementById("enabled");

chrome.storage.local.get({ enabled: true }, (res) => {
  input.checked = res.enabled !== false;
});

input.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: input.checked });
});
