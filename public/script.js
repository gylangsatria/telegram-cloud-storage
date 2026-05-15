let currentFolderId = null;
let currentView = "grid"; // 'grid' or 'list'
let selectedItems = new Set(); // Store selected item IDs
let isSelectionMode = false;
let currentShareFile = null;
let currentPreviewFile = null;

// ============ UTILITY FUNCTIONS ============

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function getFileIcon(mimeType) {
  if (!mimeType) return "fas fa-file";
  if (mimeType.startsWith("image/")) return "fas fa-image";
  if (mimeType.startsWith("video/")) return "fas fa-video";
  if (mimeType.startsWith("audio/")) return "fas fa-music";
  if (mimeType.includes("pdf")) return "fas fa-file-pdf";
  if (mimeType.includes("word")) return "fas fa-file-word";
  if (mimeType.includes("excel")) return "fas fa-file-excel";
  if (mimeType.includes("zip")) return "fas fa-file-archive";
  return "fas fa-file";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  const contentDiv = document.getElementById("content");
  contentDiv.innerHTML = `<div class="empty"><i class="fas fa-exclamation-triangle"></i><p>${message}</p></div>`;
}

// ============ AUTHENTICATION ============

async function checkAuth() {
  try {
    const response = await fetch("/api/me");
    if (!response.ok) {
      window.location.href = "/login";
      return false;
    }
    const user = await response.json();

    const usernameSpan = document.getElementById("username");
    const userRoleSpan = document.getElementById("userRole");
    if (usernameSpan) usernameSpan.textContent = user.username;
    if (userRoleSpan) userRoleSpan.textContent = user.role;

    if (user.role === "admin") {
      const toolbar = document.querySelector(".toolbar-left");
      if (toolbar && !document.getElementById("adminBtn")) {
        const adminBtn = document.createElement("button");
        adminBtn.id = "adminBtn";
        adminBtn.className = "btn";
        adminBtn.style.background = "#6c757d";
        adminBtn.innerHTML = '<i class="fas fa-user-shield"></i> Admin Panel';
        adminBtn.onclick = () => (window.location.href = "/admin.html");
        toolbar.appendChild(adminBtn);
      }
    }

    const logoutLink = document.getElementById("logoutLink");
    if (logoutLink) {
      const newLogoutLink = logoutLink.cloneNode(true);
      logoutLink.parentNode.replaceChild(newLogoutLink, logoutLink);
      newLogoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch("/api/logout", { method: "POST" });
        window.location.href = "/login";
      });
    }

    const changePasswordLink = document.getElementById("changePasswordLink");
    if (changePasswordLink) {
      const newChangePasswordLink = changePasswordLink.cloneNode(true);
      changePasswordLink.parentNode.replaceChild(
        newChangePasswordLink,
        changePasswordLink,
      );
      newChangePasswordLink.addEventListener("click", (e) => {
        e.preventDefault();
        changePassword();
      });
    }

    return user;
  } catch (error) {
    console.error("Auth error:", error);
    window.location.href = "/login";
    return false;
  }
}

async function changePassword() {
  const currentPassword = prompt("Enter your current password:");
  if (!currentPassword) return;

  const newPassword = prompt("Enter new password (min 4 characters):");
  if (!newPassword) return;

  if (newPassword.length < 4) {
    alert("Password must be at least 4 characters");
    return;
  }

  const confirmPassword = prompt("Confirm new password:");
  if (newPassword !== confirmPassword) {
    alert("Passwords do not match");
    return;
  }

  try {
    const response = await fetch("/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await response.json();

    if (response.ok) {
      alert("Password changed successfully! Please login again.");
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login";
    } else {
      alert("Error: " + (data.error || "Failed to change password"));
    }
  } catch (error) {
    console.error("Change password error:", error);
    alert("Error: " + error.message);
  }
}

// ============ SELECTION & BATCH DELETE ============

function toggleSelectionMode(enable) {
  isSelectionMode = enable;
  const batchDeleteBtn = document.getElementById("batchDeleteBtn");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const clearSelectionBtn = document.getElementById("clearSelectionBtn");

  if (enable && selectedItems.size > 0) {
    batchDeleteBtn.style.display = "inline-flex";
    document.getElementById("selectedCount").textContent = selectedItems.size;
  } else {
    batchDeleteBtn.style.display = "none";
  }

  if (selectAllBtn) selectAllBtn.style.opacity = enable ? "1" : "0.5";
  if (clearSelectionBtn) clearSelectionBtn.style.opacity = enable ? "1" : "0.5";
}

function toggleItemSelection(itemId, type, event) {
  event.stopPropagation();
  const key = `${type}_${itemId}`;

  if (selectedItems.has(key)) {
    selectedItems.delete(key);
    document.querySelectorAll(`[data-id="${itemId}"]`).forEach((el) => {
      el.classList.remove("selected");
    });
  } else {
    selectedItems.add(key);
    document.querySelectorAll(`[data-id="${itemId}"]`).forEach((el) => {
      el.classList.add("selected");
    });
  }

  const batchDeleteBtn = document.getElementById("batchDeleteBtn");
  const selectedCountSpan = document.getElementById("selectedCount");

  if (selectedItems.size > 0) {
    batchDeleteBtn.style.display = "inline-flex";
    selectedCountSpan.textContent = selectedItems.size;
  } else {
    batchDeleteBtn.style.display = "none";
    selectedCountSpan.textContent = "0";
  }

  toggleSelectionMode(true);
}

function selectAllItems() {
  const items = document.querySelectorAll(
    ".folder-card, .file-card, .folder-item, .file-item",
  );
  items.forEach((item) => {
    const itemId = item.dataset.id;
    const itemType =
      item.classList.contains("folder-card") ||
      item.classList.contains("folder-item")
        ? "folder"
        : "file";
    if (itemId) {
      const key = `${itemType}_${itemId}`;
      if (!selectedItems.has(key)) {
        selectedItems.add(key);
        item.classList.add("selected");
        const checkbox = item.querySelector(".item-checkbox");
        if (checkbox) checkbox.checked = true;
      }
    }
  });

  const batchDeleteBtn = document.getElementById("batchDeleteBtn");
  const selectedCountSpan = document.getElementById("selectedCount");
  if (selectedItems.size > 0) {
    batchDeleteBtn.style.display = "inline-flex";
    selectedCountSpan.textContent = selectedItems.size;
  }
}

function clearSelection() {
  selectedItems.clear();
  document
    .querySelectorAll(".selected")
    .forEach((el) => el.classList.remove("selected"));
  document
    .querySelectorAll(".item-checkbox")
    .forEach((checkbox) => (checkbox.checked = false));

  const batchDeleteBtn = document.getElementById("batchDeleteBtn");
  const selectedCountSpan = document.getElementById("selectedCount");
  batchDeleteBtn.style.display = "none";
  selectedCountSpan.textContent = "0";
  toggleSelectionMode(false);
}

async function batchDelete() {
  if (selectedItems.size === 0) return;

  if (
    !confirm(
      `Are you sure you want to delete ${selectedItems.size} item(s)? This cannot be undone.`,
    )
  )
    return;

  const itemsToDelete = Array.from(selectedItems);
  let successCount = 0;
  let failCount = 0;

  for (const item of itemsToDelete) {
    const [type, id] = item.split("_");
    try {
      const response = await fetch(`/api/${type}s/${id}`, { method: "DELETE" });
      if (response.ok) successCount++;
      else failCount++;
    } catch (error) {
      console.error(`Error deleting ${type} ${id}:`, error);
      failCount++;
    }
  }

  alert(`Deleted ${successCount} item(s). Failed: ${failCount}`);
  clearSelection();
  loadContents(currentFolderId);
}

function attachCheckboxListeners() {
  document.querySelectorAll(".item-checkbox").forEach((checkbox) => {
    checkbox.removeEventListener("click", checkbox._listener);
    const listener = (e) => {
      e.stopPropagation();
      toggleItemSelection(checkbox.dataset.id, checkbox.dataset.type, e);
    };
    checkbox.addEventListener("click", listener);
    checkbox._listener = listener;
  });
}

// ============ PREVIEW FUNCTIONS ============

async function previewFile(fileId, fileName, fileType) {
  const modal = document.getElementById("previewModal");
  const previewContent = document.getElementById("previewContent");

  modal.style.display = "block";
  previewContent.innerHTML =
    '<div class="preview-loading"><i class="fas fa-spinner"></i><p>Loading preview...</p></div>';

  try {
    const response = await fetch(`/api/download/${fileId}`);
    if (!response.ok) throw new Error("Failed to load file");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    let html = "";

    if (fileType && fileType.startsWith("video/")) {
      html = `<video class="preview-video" controls autoplay><source src="${url}" type="${fileType}"></video>`;
    } else if (fileType && fileType.startsWith("audio/")) {
      html = `<div class="preview-audio"><audio controls style="width:100%"><source src="${url}" type="${fileType}"></audio><div class="preview-file-info"><i class="fas fa-music"></i><h3>${escapeHtml(fileName)}</h3><p>Audio file ready to play</p></div></div>`;
    } else if (fileType && fileType.startsWith("image/")) {
      html = `<img class="preview-image" src="${url}" alt="${escapeHtml(fileName)}">`;
    } else if (fileType === "application/pdf") {
      html = `<iframe class="preview-pdf" src="${url}" title="${escapeHtml(fileName)}"></iframe>`;
    } else if (
      fileType &&
      (fileType.includes("text/") ||
        fileType.includes("javascript") ||
        fileType.includes("json") ||
        fileType.includes("html"))
    ) {
      const text = await blob.text();
      html = `<div style="background:#f5f5f5;padding:20px;border-radius:8px;max-height:70vh;overflow:auto;"><pre style="white-space:pre-wrap;font-family:monospace;font-size:13px;">${escapeHtml(text)}</pre></div>`;
    } else {
      html = `<div class="preview-file-info"><i class="fas fa-file"></i><h3>${escapeHtml(fileName)}</h3><p>Preview not available.</p><a href="${url}" download="${escapeHtml(fileName)}" class="btn btn-primary"><i class="fas fa-download"></i> Download File</a></div>`;
    }

    previewContent.innerHTML = html;
    currentPreviewFile = { url, fileName };
  } catch (error) {
    previewContent.innerHTML = `<div class="preview-file-info"><i class="fas fa-exclamation-triangle" style="color:#dc3545;"></i><h3>Preview Failed</h3><p>${error.message}</p><button onclick="location.reload()" class="btn btn-primary">Try Again</button></div>`;
  }
}

function closePreview() {
  const modal = document.getElementById("previewModal");
  if (modal) {
    modal.style.display = "none";
    const previewContent = document.getElementById("previewContent");
    if (previewContent)
      previewContent.innerHTML =
        '<div class="preview-loading">Loading preview...</div>';
  }
  if (currentPreviewFile && currentPreviewFile.url) {
    URL.revokeObjectURL(currentPreviewFile.url);
    currentPreviewFile = null;
  }
}

function addPreviewButton() {
  document.querySelectorAll(".file-card, .file-item").forEach((item) => {
    if (item.querySelector(".preview-file")) return;
    const actionsDiv = item.querySelector(".item-actions");
    if (actionsDiv) {
      const previewBtn = document.createElement("button");
      previewBtn.className = "action-btn preview-file";
      previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
      previewBtn.title = "Preview";
      previewBtn.onclick = async (e) => {
        e.stopPropagation();
        const fileId = item.dataset.id;
        const fileName =
          item.querySelector(".item-name")?.textContent || "File";
        try {
          const response = await fetch(
            `/api/browse?folderId=${currentFolderId}`,
          );
          const data = await response.json();
          const file = data.files.find((f) => f.id == fileId);
          previewFile(fileId, file?.name || fileName, file?.file_type || null);
        } catch (error) {
          previewFile(fileId, fileName, null);
        }
      };
      actionsDiv.insertBefore(previewBtn, actionsDiv.firstChild);
    }
  });
}

// Initialize share modal once
function initShareModalElements() {
  let modal = document.getElementById("shareModal");
  if (!modal) return false;

  // Remove existing listeners to avoid duplicates
  const closeBtn = modal.querySelector(".close-share");
  const genBtn = document.getElementById("generateShareBtn");
  const copyBtn = document.getElementById("copyShareUrlBtn");
  const closeResultBtn = document.getElementById("closeShareResultBtn");

  // Replace with new listeners
  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.onclick = function () {
      modal.style.display = "none";
    };
  }

  if (genBtn) {
    const newGenBtn = genBtn.cloneNode(true);
    genBtn.parentNode.replaceChild(newGenBtn, genBtn);
    newGenBtn.onclick = async function () {
      await generateShareLinkFixed();
    };
  }

  if (copyBtn) {
    const newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
    newCopyBtn.onclick = function () {
      const urlInput = document.getElementById("shareUrl");
      if (urlInput && urlInput.value) {
        urlInput.select();
        document.execCommand("copy");
        alert("Share link copied to clipboard!");
      }
    };
  }

  if (closeResultBtn) {
    const newCloseResultBtn = closeResultBtn.cloneNode(true);
    closeResultBtn.parentNode.replaceChild(newCloseResultBtn, closeResultBtn);
    newCloseResultBtn.onclick = function () {
      document.getElementById("shareResult").style.display = "none";
      modal.style.display = "none";
    };
  }

  // Close when clicking outside
  window.addEventListener("click", function (e) {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  return true;
}

// Show share modal for file
async function showShareModalFixed(fileId, fileName) {
  let modal = document.getElementById("shareModal");

  // Create modal if not exists
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "shareModal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content share-modal">
        <span class="close-share">&times;</span>
        <h2><i class="fas fa-share-alt"></i> Share File</h2>
        <p id="shareFileName"><strong>Loading...</strong></p>
        <div class="share-expiry">
          <label>Link expires after:</label>
          <select id="shareExpiry">
            <option value="0">Never</option>
            <option value="1">1 hour</option>
            <option value="24">24 hours</option>
            <option value="168">7 days</option>
            <option value="720">30 days</option>
          </select>
        </div>
        <button id="generateShareBtn" class="btn btn-primary" style="width:100%">
          <i class="fas fa-link"></i> Generate Share Link
        </button>
        <div id="shareResult" style="display:none;margin-top:20px">
          <div class="share-url-container">
            <input type="text" id="shareUrl" readonly>
            <button id="copyShareUrlBtn" class="btn btn-copy">
              <i class="fas fa-copy"></i> Copy
            </button>
          </div>
          <div class="share-stats">
            <p><i class="fas fa-clock"></i> Expires: <span id="shareExpires">Never</span></p>
            <p><i class="fas fa-download"></i> <span id="shareStats">0 downloads</span></p>
          </div>
          <button id="closeShareResultBtn" class="btn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Initialize modal elements
  initShareModalElements();

  // Update UI
  const title = modal.querySelector("h2");
  if (title) title.innerHTML = '<i class="fas fa-share-alt"></i> Share File';

  const fileNameEl = document.getElementById("shareFileName");
  if (fileNameEl)
    fileNameEl.innerHTML = `<strong>${escapeHtml(fileName)}</strong>`;

  document.getElementById("shareResult").style.display = "none";

  currentShareFile = { id: fileId, name: fileName, isFolder: false };
  modal.style.display = "block";
}

// Show share modal for folder
async function showShareFolderModalFixed(folderId, folderName) {
  let modal = document.getElementById("shareModal");

  if (!modal) {
    await showShareModalFixed(null, null);
    modal = document.getElementById("shareModal");
  }

  initShareModalElements();

  const title = modal.querySelector("h2");
  if (title)
    title.innerHTML = '<i class="fas fa-folder-open"></i> Share Folder';

  const fileNameEl = document.getElementById("shareFileName");
  if (fileNameEl)
    fileNameEl.innerHTML = `<strong>📁 ${escapeHtml(folderName)}</strong><br><small style="color:#666;">All files in this folder will be shared</small>`;

  document.getElementById("shareResult").style.display = "none";

  currentShareFile = { id: folderId, name: folderName, isFolder: true };
  modal.style.display = "block";
}

// Generate share link
async function generateShareLinkFixed() {
  if (!currentShareFile) {
    alert("No file/folder selected");
    return;
  }

  const expiry = document.getElementById("shareExpiry").value;
  const expiresInHours = parseInt(expiry);
  const generateBtn = document.getElementById("generateShareBtn");
  const originalText = generateBtn.innerHTML;

  generateBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Generating...';
  generateBtn.disabled = true;

  try {
    let response;
    if (currentShareFile.isFolder) {
      response = await fetch(`/api/share-folder/${currentShareFile.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInHours: expiresInHours || null }),
      });
    } else {
      response = await fetch(`/api/share/${currentShareFile.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInHours: expiresInHours || null }),
      });
    }

    const data = await response.json();

    if (response.ok) {
      document.getElementById("shareUrl").value = data.shareUrl;
      document.getElementById("shareExpires").textContent = data.expiresAt
        ? new Date(data.expiresAt).toLocaleString()
        : "Never";
      document.getElementById("shareStats").textContent = "0 downloads";
      document.getElementById("shareResult").style.display = "block";

      // Refresh share list if open
      const sharesPanel = document.getElementById("sharesPanel");
      if (sharesPanel && sharesPanel.style.transform === "translateX(0)") {
        await loadSharesList();
      }
    } else {
      alert("Error: " + (data.error || "Failed to generate share link"));
    }
  } catch (error) {
    console.error("Generate share error:", error);
    alert("Failed to generate share link: " + error.message);
  } finally {
    generateBtn.innerHTML = originalText;
    generateBtn.disabled = false;
  }
}

// Update the button handlers
function updateShareButtonHandlers() {
  // Update file share buttons
  document.querySelectorAll(".share-file").forEach((btn) => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.onclick = async (e) => {
      e.stopPropagation();
      const fileId = newBtn.closest("[data-id]")?.dataset.id;
      const fileName =
        newBtn.closest("[data-id]")?.querySelector(".item-name")?.textContent ||
        "File";
      if (fileId) {
        await showShareModalFixed(fileId, fileName);
      }
    };
  });

  // Update folder share buttons
  document.querySelectorAll(".share-folder").forEach((btn) => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.onclick = async (e) => {
      e.stopPropagation();
      const folderId = newBtn.closest("[data-id]")?.dataset.id;
      const folderName =
        newBtn.closest("[data-id]")?.querySelector(".item-name")?.textContent ||
        "Folder";
      if (folderId) {
        await showShareFolderModalFixed(folderId, folderName);
      }
    };
  });
}

async function loadSharesList() {
  try {
    const response = await fetch("/api/shares");
    const shares = await response.json();

    let panel = document.getElementById("sharesPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "sharesPanel";
      panel.style.cssText = `position:fixed;right:0;top:0;width:400px;height:100%;background:white;box-shadow:-2px 0 10px rgba(0,0,0,0.1);z-index:1001;transform:translateX(100%);transition:transform 0.3s ease;display:flex;flex-direction:column;`;
      panel.innerHTML = `<div style="padding:20px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;"><h3><i class="fas fa-share-alt"></i> Shared Links</h3><button id="closeSharesPanel" style="background:none;font-size:24px;border:none;">&times;</button></div><div id="sharesList" style="flex:1;overflow-y:auto;padding:15px;"></div>`;
      document.body.appendChild(panel);
      document
        .getElementById("closeSharesPanel")
        .addEventListener(
          "click",
          () => (panel.style.transform = "translateX(100%)"),
        );
    }

    const listContainer = document.getElementById("sharesList");
    if (shares.length === 0) {
      listContainer.innerHTML =
        '<div style="text-align:center;padding:40px;color:#999;">No shared links yet</div>';
    } else {
      listContainer.innerHTML = shares
        .map(
          (share) => `
        <div class="share-item">
          <div class="share-item-info">
            <div class="file-name">${escapeHtml(share.file_name)}</div>
            <div class="share-stats-small"><i class="fas fa-download"></i> ${share.download_count} downloads | <i class="fas fa-calendar"></i> ${new Date(share.created_at).toLocaleDateString()}</div>
            <div class="share-link">${window.location.origin}/share/${share.share_token}</div>
          </div>
          <div class="share-item-actions">
            <button class="btn btn-copy" onclick="copyToClipboard('${window.location.origin}/share/${share.share_token}')"><i class="fas fa-copy"></i></button>
            <button class="btn btn-revoke" onclick="revokeShareLink('${share.share_token}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `,
        )
        .join("");
    }
    panel.style.transform = "translateX(0)";
  } catch (error) {
    console.error("Load shares error:", error);
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  alert("Link copied!");
}

async function revokeShareLink(token) {
  if (!confirm("Revoke this share link?")) return;
  try {
    const response = await fetch(`/api/share/${token}`, { method: "DELETE" });
    if (response.ok) loadSharesList();
    else alert("Error: " + (await response.json()).error);
  } catch (error) {
    alert("Failed to revoke");
  }
}

function addShareButton() {
  document.querySelectorAll(".file-card, .file-item").forEach((item) => {
    if (item.querySelector(".share-file")) return;
    const actionsDiv = item.querySelector(".item-actions");
    if (actionsDiv) {
      const shareBtn = document.createElement("button");
      shareBtn.className = "action-btn share-file";
      shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
      shareBtn.title = "Share";
      shareBtn.onclick = async (e) => {
        e.stopPropagation();
        const fileId = item.dataset.id;
        const fileName =
          item.querySelector(".item-name")?.textContent || "File";
        try {
          const response = await fetch(
            `/api/browse?folderId=${currentFolderId}`,
          );
          const data = await response.json();
          const file = data.files.find((f) => f.id == fileId);
          await showShareModalFixed(fileId, file?.name || fileName);
        } catch (error) {
          await showShareModalFixed(fileId, fileName);
        }
      };
      actionsDiv.appendChild(shareBtn);
    }
  });
}

function addFolderShareButton() {
  document.querySelectorAll(".folder-card, .folder-item").forEach((item) => {
    if (item.querySelector(".share-folder")) return;
    const actionsDiv = item.querySelector(".item-actions");
    if (actionsDiv) {
      const shareBtn = document.createElement("button");
      shareBtn.className = "action-btn share-folder";
      shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
      shareBtn.title = "Share Folder";
      shareBtn.onclick = (e) => {
        e.stopPropagation();
        const folderId = item.dataset.id;
        const folderName =
          item.querySelector(".item-name")?.textContent || "Folder";
        showShareFolderModalFixed(folderId, folderName);
      };
      actionsDiv.appendChild(shareBtn);
    }
  });
}

function addSharesButton() {
  const toolbar = document.querySelector(".toolbar-left");
  if (toolbar && !document.getElementById("sharesBtn")) {
    const sharesBtn = document.createElement("button");
    sharesBtn.id = "sharesBtn";
    sharesBtn.className = "btn";
    sharesBtn.innerHTML = '<i class="fas fa-share-alt"></i> My Shares';
    sharesBtn.onclick = () => loadSharesList();
    toolbar.appendChild(sharesBtn);
  }
}

// ============ MAIN FUNCTIONS ============

async function loadContents(folderId = null) {
  currentFolderId = folderId;
  const url = `/api/browse${folderId ? `?folderId=${folderId}` : ""}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    displayContents(data);
    updateBreadcrumb();
  } catch (error) {
    console.error("Error loading contents:", error);
    showError("Failed to load contents");
  }
}

function displayContents(data) {
  if (currentView === "grid") displayGrid(data);
  else displayList(data);
}

function displayGrid(data) {
  const contentDiv = document.getElementById("content");
  if (data.folders.length === 0 && data.files.length === 0) {
    contentDiv.innerHTML =
      '<div class="empty"><i class="fas fa-folder-open"></i><p>This folder is empty</p></div>';
    return;
  }
  let html = '<div class="item-grid">';
  data.folders.forEach((folder) => {
    const isSelected = selectedItems.has(`folder_${folder.id}`);
    html += `<div class="item-card folder-card ${isSelected ? "selected" : ""}" data-type="folder" data-id="${folder.id}">
      <input type="checkbox" class="item-checkbox" data-id="${folder.id}" data-type="folder" ${isSelected ? "checked" : ""}>
      <div class="item-icon"><i class="fas fa-folder" style="color:#0088cc;font-size:48px;"></i></div>
      <div class="item-name">${escapeHtml(folder.name)}</div>
      <div class="item-info">Folder • ${new Date(folder.created_at).toLocaleDateString()}</div>
      <div class="item-actions"><button class="action-btn delete-folder" data-id="${folder.id}"><i class="fas fa-trash"></i></button></div>
    </div>`;
  });
  data.files.forEach((file) => {
    const size = formatFileSize(file.file_size);
    const icon = getFileIcon(file.file_type);
    const isSelected = selectedItems.has(`file_${file.id}`);
    html += `<div class="item-card file-card ${isSelected ? "selected" : ""}" data-type="file" data-id="${file.id}">
      <input type="checkbox" class="item-checkbox" data-id="${file.id}" data-type="file" ${isSelected ? "checked" : ""}>
      <div class="item-icon"><i class="${icon}" style="font-size:48px;"></i></div>
      <div class="item-name">${escapeHtml(file.name)}</div>
      <div class="item-info">${size} • ${new Date(file.created_at).toLocaleDateString()}</div>
      <div class="item-actions">
        <button class="action-btn download-file" data-id="${file.id}"><i class="fas fa-download"></i></button>
        <button class="action-btn delete-file" data-id="${file.id}"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  });
  html += "</div>";
  contentDiv.innerHTML = html;
  attachEventListeners();
  attachCheckboxListeners();
}

function displayList(data) {
  const contentDiv = document.getElementById("content");
  if (data.folders.length === 0 && data.files.length === 0) {
    contentDiv.innerHTML =
      '<div class="empty"><i class="fas fa-folder-open"></i><p>This folder is empty</p></div>';
    return;
  }
  let html = `<div class="item-list"><div class="list-header"><div class="header-icon"></div><div class="header-name">Name</div><div class="header-info">Size / Type</div><div class="header-date">Date</div><div class="header-actions">Actions</div></div>`;
  data.folders.forEach((folder) => {
    const isSelected = selectedItems.has(`folder_${folder.id}`);
    html += `<div class="list-item folder-item ${isSelected ? "selected" : ""}" data-type="folder" data-id="${folder.id}">
      <input type="checkbox" class="item-checkbox" data-id="${folder.id}" data-type="folder" ${isSelected ? "checked" : ""}>
      <div class="item-icon"><i class="fas fa-folder" style="color:#0088cc;"></i></div>
      <div class="item-name">${escapeHtml(folder.name)}</div>
      <div class="item-info">Folder</div>
      <div class="item-date">${new Date(folder.created_at).toLocaleDateString()}</div>
      <div class="item-actions"><button class="action-btn delete-folder" data-id="${folder.id}"><i class="fas fa-trash"></i></button></div>
    </div>`;
  });
  data.files.forEach((file) => {
    const size = formatFileSize(file.file_size);
    const icon = getFileIcon(file.file_type);
    const isSelected = selectedItems.has(`file_${file.id}`);
    html += `<div class="list-item file-item ${isSelected ? "selected" : ""}" data-type="file" data-id="${file.id}">
      <input type="checkbox" class="item-checkbox" data-id="${file.id}" data-type="file" ${isSelected ? "checked" : ""}>
      <div class="item-icon"><i class="${icon}"></i></div>
      <div class="item-name">${escapeHtml(file.name)}</div>
      <div class="item-info">${size} • ${file.file_type || "Unknown"}</div>
      <div class="item-date">${new Date(file.created_at).toLocaleDateString()}</div>
      <div class="item-actions">
        <button class="action-btn download-file" data-id="${file.id}"><i class="fas fa-download"></i></button>
        <button class="action-btn delete-file" data-id="${file.id}"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  });
  html += "</div>";
  contentDiv.innerHTML = html;
  attachEventListeners();
  attachCheckboxListeners();
}

function attachEventListeners() {
  document.querySelectorAll(".folder-card, .folder-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (
        !e.target.closest(".delete-folder") &&
        !e.target.closest(".item-checkbox")
      ) {
        loadContents(item.dataset.id);
      }
    });
  });
  document.querySelectorAll(".delete-folder").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Delete this folder and all its contents?"))
        await deleteFolder(btn.dataset.id);
    });
  });
  document.querySelectorAll(".delete-file").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Delete this file?")) await deleteFile(btn.dataset.id);
    });
  });
  document.querySelectorAll(".download-file").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      window.open(`/api/download/${btn.dataset.id}`, "_blank");
    });
  });
}

async function updateBreadcrumb() {
  const breadcrumbDiv = document.getElementById("breadcrumb");
  if (!currentFolderId) {
    breadcrumbDiv.innerHTML =
      '<a href="#" onclick="loadContents(null); return false;">My Drive</a>';
    return;
  }
  let path = [],
    currentId = currentFolderId;
  while (currentId) {
    try {
      const response = await fetch(`/api/folder/${currentId}`);
      if (!response.ok) break;
      const folder = await response.json();
      path.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parent_id;
    } catch (error) {
      break;
    }
  }
  let html =
    '<a href="#" onclick="loadContents(null); return false;">My Drive</a>';
  for (let i = 0; i < path.length; i++) {
    html += " / ";
    if (i === path.length - 1)
      html += `<span>${escapeHtml(path[i].name)}</span>`;
    else
      html += `<a href="#" onclick="loadContents(${path[i].id}); return false;">${escapeHtml(path[i].name)}</a>`;
  }
  breadcrumbDiv.innerHTML = html;
}

// Create new folder
document.getElementById("newFolderBtn").addEventListener("click", () => {
  document.getElementById("folderModal").style.display = "block";
  document.getElementById("folderName").value = "";
});

document
  .getElementById("createFolderBtn")
  .addEventListener("click", async () => {
    const name = document.getElementById("folderName").value.trim();
    if (!name) {
      alert("Please enter folder name");
      return;
    }
    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: currentFolderId }),
      });
      if (response.ok) {
        document.getElementById("folderModal").style.display = "none";
        loadContents(currentFolderId);
      } else {
        alert("Error: " + (await response.json()).error);
      }
    } catch (error) {
      alert("Failed to create folder");
    }
  });

// Upload file
document
  .getElementById("uploadBtn")
  .addEventListener("click", () =>
    document.getElementById("fileInput").click(),
  );
document.getElementById("fileInput").addEventListener("change", async (e) => {
  const files = e.target.files;
  if (files.length === 0) return;
  for (const file of files) await uploadFile(file);
  e.target.value = "";
  loadContents(currentFolderId);
});

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  if (currentFolderId) formData.append("folderId", currentFolderId);
  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error((await response.json()).error);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    alert(`Failed to upload ${file.name}: ${error.message}`);
  }
}

async function deleteFolder(folderId) {
  try {
    const response = await fetch(`/api/folders/${folderId}`, {
      method: "DELETE",
    });
    if (response.ok) loadContents(currentFolderId);
    else alert("Error: " + (await response.json()).error);
  } catch (error) {
    alert("Failed to delete folder");
  }
}

async function deleteFile(fileId) {
  try {
    const response = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    if (response.ok) loadContents(currentFolderId);
    else alert("Error: " + (await response.json()).error);
  } catch (error) {
    alert("Failed to delete file");
  }
}

// View toggle
document.getElementById("gridViewBtn").addEventListener("click", () => {
  currentView = "grid";
  document.getElementById("gridViewBtn").classList.add("active");
  document.getElementById("listViewBtn").classList.remove("active");
  loadContents(currentFolderId);
});

document.getElementById("listViewBtn").addEventListener("click", () => {
  currentView = "list";
  document.getElementById("listViewBtn").classList.add("active");
  document.getElementById("gridViewBtn").classList.remove("active");
  loadContents(currentFolderId);
});

// Batch delete button
document
  .getElementById("batchDeleteBtn")
  ?.addEventListener("click", batchDelete);
document
  .getElementById("selectAllBtn")
  ?.addEventListener("click", selectAllItems);
document
  .getElementById("clearSelectionBtn")
  ?.addEventListener("click", clearSelection);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && selectedItems.size > 0) clearSelection();
});

// Close modal
document
  .querySelector(".close")
  ?.addEventListener(
    "click",
    () => (document.getElementById("folderModal").style.display = "none"),
  );
window.onclick = (event) => {
  const modal = document.getElementById("folderModal");
  if (event.target === modal) modal.style.display = "none";
};

// About Modal
const aboutModal = document.getElementById("aboutModal"),
  aboutBtn = document.getElementById("aboutBtn"),
  closeAbout = document.querySelector(".close-about");
if (aboutBtn)
  aboutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    aboutModal.style.display = "block";
  });
if (closeAbout)
  closeAbout.addEventListener(
    "click",
    () => (aboutModal.style.display = "none"),
  );
window.addEventListener("click", (event) => {
  if (event.target === aboutModal) aboutModal.style.display = "none";
});

// Preview modal close handlers
document.addEventListener("DOMContentLoaded", () => {
  const closePreviewBtn = document.querySelector(".close-preview");
  if (closePreviewBtn) closePreviewBtn.addEventListener("click", closePreview);
  window.addEventListener("click", (event) => {
    if (event.target === document.getElementById("previewModal"))
      closePreview();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePreview();
  });
});

// ============ INITIALIZATION ============

const originalAttachEventListeners = attachEventListeners;
attachEventListeners = function () {
  originalAttachEventListeners();
  addPreviewButton();
  addShareButton();
  addFolderShareButton();
  setTimeout(updateShareButtonHandlers, 100);
};

const originalLoadContents = loadContents;
loadContents = async function (folderId = null) {
  await originalLoadContents(folderId);
  setTimeout(() => {
    addPreviewButton();
    addShareButton();
    addFolderShareButton();
    updateShareButtonHandlers();
  }, 100);
};

setTimeout(() => addSharesButton(), 500);

// Load initial content
checkAuth().then((user) => {
  if (user) loadContents();
});
