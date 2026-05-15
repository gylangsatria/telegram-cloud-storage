let currentFolderId = null;
let currentView = "grid"; // 'grid' or 'list'
let selectedItems = new Set(); // Store selected item IDs
let isSelectionMode = false;

// Toggle selection mode
function toggleSelectionMode(enable) {
  isSelectionMode = enable;
  const batchDeleteBtn = document.getElementById("batchDeleteBtn");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const clearSelectionBtn = document.getElementById("clearSelectionBtn");

  if (enable && selectedItems.size > 0) {
    batchDeleteBtn.style.display = "inline-flex";
    document.getElementById("selectedCount").textContent = selectedItems.size;
  } else if (enable && selectedItems.size === 0) {
    batchDeleteBtn.style.display = "none";
  } else {
    batchDeleteBtn.style.display = "none";
  }

  if (selectAllBtn) {
    selectAllBtn.style.opacity = enable ? "1" : "0.5";
  }
  if (clearSelectionBtn) {
    clearSelectionBtn.style.opacity = enable ? "1" : "0.5";
  }
}

// Select/Deselect item
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

// Select all items in current view
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
        // Also check the checkbox if exists
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

// Clear all selections
function clearSelection() {
  selectedItems.clear();
  document.querySelectorAll(".selected").forEach((el) => {
    el.classList.remove("selected");
  });
  document.querySelectorAll(".item-checkbox").forEach((checkbox) => {
    checkbox.checked = false;
  });

  const batchDeleteBtn = document.getElementById("batchDeleteBtn");
  const selectedCountSpan = document.getElementById("selectedCount");

  batchDeleteBtn.style.display = "none";
  selectedCountSpan.textContent = "0";
  toggleSelectionMode(false);
}

// Batch delete selected items
async function batchDelete() {
  if (selectedItems.size === 0) return;

  const confirmMsg = `Are you sure you want to delete ${selectedItems.size} item(s)? This cannot be undone.`;
  if (!confirm(confirmMsg)) return;

  const itemsToDelete = Array.from(selectedItems);
  let successCount = 0;
  let failCount = 0;

  for (const item of itemsToDelete) {
    const [type, id] = item.split("_");

    try {
      const response = await fetch(`/api/${type}s/${id}`, { method: "DELETE" });
      if (response.ok) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      console.error(`Error deleting ${type} ${id}:`, error);
      failCount++;
    }
  }

  alert(`Deleted ${successCount} item(s). Failed: ${failCount}`);

  clearSelection();
  loadContents(currentFolderId);
}

// Attach checkbox listeners
function attachCheckboxListeners() {
  document.querySelectorAll(".item-checkbox").forEach((checkbox) => {
    checkbox.removeEventListener("click", checkbox._listener);
    const listener = (e) => {
      e.stopPropagation();
      const itemId = checkbox.dataset.id;
      const itemType = checkbox.dataset.type;
      toggleItemSelection(itemId, itemType, e);
    };
    checkbox.addEventListener("click", listener);
    checkbox._listener = listener;
  });
}

// Check authentication
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
      logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch("/api/logout", { method: "POST" });
        window.location.href = "/login";
      });
    }

    const changePasswordLink = document.getElementById("changePasswordLink");
    if (changePasswordLink) {
      changePasswordLink.addEventListener("click", (e) => {
        e.preventDefault();
        alert("Change password feature coming soon");
      });
    }

    return user;
  } catch (error) {
    console.error("Auth error:", error);
    window.location.href = "/login";
    return false;
  }
}

// Load folder contents
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
  if (currentView === "grid") {
    displayGrid(data);
  } else {
    displayList(data);
  }
}

// Grid view display with checkboxes
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
    html += `
      <div class="item-card folder-card ${isSelected ? "selected" : ""}" data-type="folder" data-id="${folder.id}">
        <input type="checkbox" class="item-checkbox" data-id="${folder.id}" data-type="folder" ${isSelected ? "checked" : ""}>
        <div class="item-icon">
          <i class="fas fa-folder" style="color: #0088cc; font-size: 48px;"></i>
        </div>
        <div class="item-name">${escapeHtml(folder.name)}</div>
        <div class="item-info">Folder • ${new Date(folder.created_at).toLocaleDateString()}</div>
        <div class="item-actions">
          <button class="action-btn delete-folder" data-id="${folder.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });

  data.files.forEach((file) => {
    const size = formatFileSize(file.file_size);
    const icon = getFileIcon(file.file_type);
    const isSelected = selectedItems.has(`file_${file.id}`);

    html += `
      <div class="item-card file-card ${isSelected ? "selected" : ""}" data-type="file" data-id="${file.id}">
        <input type="checkbox" class="item-checkbox" data-id="${file.id}" data-type="file" ${isSelected ? "checked" : ""}>
        <div class="item-icon">
          <i class="${icon}" style="font-size: 48px;"></i>
        </div>
        <div class="item-name">${escapeHtml(file.name)}</div>
        <div class="item-info">${size} • ${new Date(file.created_at).toLocaleDateString()}</div>
        <div class="item-actions">
          <button class="action-btn download-file" data-id="${file.id}">
            <i class="fas fa-download"></i>
          </button>
          <button class="action-btn delete-file" data-id="${file.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });

  html += "</div>";
  contentDiv.innerHTML = html;
  attachEventListeners();
  attachCheckboxListeners();
}

// List view display with checkboxes
function displayList(data) {
  const contentDiv = document.getElementById("content");

  if (data.folders.length === 0 && data.files.length === 0) {
    contentDiv.innerHTML =
      '<div class="empty"><i class="fas fa-folder-open"></i><p>This folder is empty</p></div>';
    return;
  }

  let html = `
    <div class="item-list">
      <div class="list-header">
        <div class="header-icon"></div>
        <div class="header-name">Name</div>
        <div class="header-info">Size / Type</div>
        <div class="header-date">Date</div>
        <div class="header-actions">Actions</div>
      </div>
  `;

  data.folders.forEach((folder) => {
    const isSelected = selectedItems.has(`folder_${folder.id}`);
    html += `
      <div class="list-item folder-item ${isSelected ? "selected" : ""}" data-type="folder" data-id="${folder.id}">
        <input type="checkbox" class="item-checkbox" data-id="${folder.id}" data-type="folder" ${isSelected ? "checked" : ""}>
        <div class="item-icon">
          <i class="fas fa-folder" style="color: #0088cc;"></i>
        </div>
        <div class="item-name">${escapeHtml(folder.name)}</div>
        <div class="item-info">Folder</div>
        <div class="item-date">${new Date(folder.created_at).toLocaleDateString()}</div>
        <div class="item-actions">
          <button class="action-btn delete-folder" data-id="${folder.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });

  data.files.forEach((file) => {
    const size = formatFileSize(file.file_size);
    const icon = getFileIcon(file.file_type);
    const isSelected = selectedItems.has(`file_${file.id}`);

    html += `
      <div class="list-item file-item ${isSelected ? "selected" : ""}" data-type="file" data-id="${file.id}">
        <input type="checkbox" class="item-checkbox" data-id="${file.id}" data-type="file" ${isSelected ? "checked" : ""}>
        <div class="item-icon">
          <i class="${icon}"></i>
        </div>
        <div class="item-name">${escapeHtml(file.name)}</div>
        <div class="item-info">${size} • ${file.file_type || "Unknown"}</div>
        <div class="item-date">${new Date(file.created_at).toLocaleDateString()}</div>
        <div class="item-actions">
          <button class="action-btn download-file" data-id="${file.id}">
            <i class="fas fa-download"></i>
          </button>
          <button class="action-btn delete-file" data-id="${file.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });

  html += "</div>";
  contentDiv.innerHTML = html;
  attachEventListeners();
  attachCheckboxListeners();
}

// Attach event listeners
function attachEventListeners() {
  document.querySelectorAll(".folder-card, .folder-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (
        !e.target.closest(".delete-folder") &&
        !e.target.closest(".item-checkbox")
      ) {
        const folderId = item.dataset.id;
        loadContents(folderId);
      }
    });
  });

  document.querySelectorAll(".delete-folder").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const folderId = btn.dataset.id;
      if (confirm("Delete this folder and all its contents?")) {
        await deleteFolder(folderId);
      }
    });
  });

  document.querySelectorAll(".delete-file").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const fileId = btn.dataset.id;
      if (confirm("Delete this file?")) {
        await deleteFile(fileId);
      }
    });
  });

  document.querySelectorAll(".download-file").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const fileId = btn.dataset.id;
      window.open(`/api/download/${fileId}`, "_blank");
    });
  });
}

// Update breadcrumb navigation
async function updateBreadcrumb() {
  const breadcrumbDiv = document.getElementById("breadcrumb");

  if (!currentFolderId) {
    breadcrumbDiv.innerHTML =
      '<a href="#" onclick="loadContents(null); return false;">My Drive</a>';
    return;
  }

  let path = [];
  let currentId = currentFolderId;

  while (currentId) {
    try {
      const response = await fetch(`/api/folder/${currentId}`);
      if (!response.ok) break;

      const folder = await response.json();
      path.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parent_id;
    } catch (error) {
      console.error("Error:", error);
      break;
    }
  }

  let html =
    '<a href="#" onclick="loadContents(null); return false;">My Drive</a>';

  for (let i = 0; i < path.length; i++) {
    html += " / ";
    if (i === path.length - 1) {
      html += `<span>${escapeHtml(path[i].name)}</span>`;
    } else {
      html += `<a href="#" onclick="loadContents(${path[i].id}); return false;">${escapeHtml(path[i].name)}</a>`;
    }
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
        const error = await response.json();
        alert("Error: " + error.error);
      }
    } catch (error) {
      console.error("Error creating folder:", error);
      alert("Failed to create folder");
    }
  });

// Upload file
document.getElementById("uploadBtn").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});

document.getElementById("fileInput").addEventListener("change", async (e) => {
  const files = e.target.files;
  if (files.length === 0) return;

  for (const file of files) {
    await uploadFile(file);
  }

  e.target.value = "";
  loadContents(currentFolderId);
});

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  if (currentFolderId) {
    formData.append("folderId", currentFolderId);
  }

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    console.error("Upload error:", error);
    alert(`Failed to upload ${file.name}: ${error.message}`);
  }
}

// Change password function
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
      alert("✓ Password changed successfully! Please login again.");
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login";
    } else {
      alert("✗ Error: " + (data.error || "Failed to change password"));
    }
  } catch (error) {
    console.error("Change password error:", error);
    alert("✗ Error: " + error.message);
  }
}

// Update checkAuth function to add change password event
async function checkAuth() {
  try {
    const response = await fetch("/api/me");
    if (!response.ok) {
      window.location.href = "/login";
      return false;
    }
    const user = await response.json();

    // Update user info di header
    const usernameSpan = document.getElementById("username");
    const userRoleSpan = document.getElementById("userRole");
    if (usernameSpan) usernameSpan.textContent = user.username;
    if (userRoleSpan) userRoleSpan.textContent = user.role;

    // Add admin link if admin
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

    // Logout link event
    const logoutLink = document.getElementById("logoutLink");
    if (logoutLink) {
      // Remove existing listener to avoid duplicate
      const newLogoutLink = logoutLink.cloneNode(true);
      logoutLink.parentNode.replaceChild(newLogoutLink, logoutLink);
      newLogoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch("/api/logout", { method: "POST" });
        window.location.href = "/login";
      });
    }

    // Change password link event (FIXED)
    const changePasswordLink = document.getElementById("changePasswordLink");
    if (changePasswordLink) {
      // Remove existing listener to avoid duplicate
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

// Delete functions
async function deleteFolder(folderId) {
  try {
    const response = await fetch(`/api/folders/${folderId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      loadContents(currentFolderId);
    } else {
      const error = await response.json();
      alert("Error: " + error.error);
    }
  } catch (error) {
    console.error("Delete folder error:", error);
    alert("Failed to delete folder");
  }
}

async function deleteFile(fileId) {
  try {
    const response = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    if (response.ok) {
      loadContents(currentFolderId);
    } else {
      const error = await response.json();
      alert("Error: " + error.error);
    }
  } catch (error) {
    console.error("Delete file error:", error);
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
const batchDeleteBtn = document.getElementById("batchDeleteBtn");
if (batchDeleteBtn) {
  batchDeleteBtn.addEventListener("click", batchDelete);
}

// Select all button
const selectAllBtn = document.getElementById("selectAllBtn");
if (selectAllBtn) {
  selectAllBtn.addEventListener("click", () => {
    selectAllItems();
  });
}

// Clear selection button
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
if (clearSelectionBtn) {
  clearSelectionBtn.addEventListener("click", () => {
    clearSelection();
  });
}

// Escape key to clear selection
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && selectedItems.size > 0) {
    clearSelection();
  }
});

// Utility functions
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

// Close modal
document.querySelector(".close").addEventListener("click", () => {
  document.getElementById("folderModal").style.display = "none";
});

window.onclick = (event) => {
  const modal = document.getElementById("folderModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
};

// About Modal
const aboutModal = document.getElementById("aboutModal");
const aboutBtn = document.getElementById("aboutBtn");
const closeAbout = document.querySelector(".close-about");

if (aboutBtn) {
  aboutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    aboutModal.style.display = "block";
  });
}

if (closeAbout) {
  closeAbout.addEventListener("click", () => {
    aboutModal.style.display = "none";
  });
}

window.addEventListener("click", (event) => {
  if (event.target === aboutModal) {
    aboutModal.style.display = "none";
  }
});

// Preview Functions
let currentPreviewFile = null;

async function previewFile(fileId, fileName, fileType) {
  const modal = document.getElementById("previewModal");
  const previewContent = document.getElementById("previewContent");

  // Show modal with loading
  modal.style.display = "block";
  previewContent.innerHTML =
    '<div class="preview-loading"><i class="fas fa-spinner"></i><p>Loading preview...</p></div>';

  try {
    // Get file info and URL
    const response = await fetch(`/api/download/${fileId}`);
    if (!response.ok) throw new Error("Failed to load file");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    // Generate preview based on file type
    let html = "";

    // Video files
    if (fileType && fileType.startsWith("video/")) {
      html = `
        <video class="preview-video" controls autoplay>
          <source src="${url}" type="${fileType}">
          Your browser does not support video playback.
        </video>
      `;
    }
    // Audio files
    else if (fileType && fileType.startsWith("audio/")) {
      html = `
        <div class="preview-audio">
          <audio controls style="width: 100%;">
            <source src="${url}" type="${fileType}">
            Your browser does not support audio playback.
          </audio>
          <div class="preview-file-info" style="margin-top: 20px;">
            <i class="fas fa-music"></i>
            <h3>${escapeHtml(fileName)}</h3>
            <p>Audio file ready to play</p>
          </div>
        </div>
      `;
    }
    // Image files
    else if (fileType && fileType.startsWith("image/")) {
      html = `<img class="preview-image" src="${url}" alt="${escapeHtml(fileName)}">`;
    }
    // PDF files
    else if (fileType === "application/pdf") {
      html = `<iframe class="preview-pdf" src="${url}" title="${escapeHtml(fileName)}"></iframe>`;
    }
    // Word/Excel/PowerPoint
    else if (
      fileType &&
      (fileType.includes("word") ||
        fileType.includes("document") ||
        fileType.includes("msword"))
    ) {
      html = `
        <div class="document-placeholder">
          <i class="fas fa-file-word"></i>
          <h4>Microsoft Word Document</h4>
          <p>${escapeHtml(fileName)}</p>
          <a href="${url}" download="${escapeHtml(fileName)}" class="btn btn-primary">
            <i class="fas fa-download"></i> Download to View
          </a>
        </div>
      `;
    } else if (
      fileType &&
      (fileType.includes("excel") || fileType.includes("spreadsheet"))
    ) {
      html = `
        <div class="document-placeholder">
          <i class="fas fa-file-excel"></i>
          <h4>Microsoft Excel Spreadsheet</h4>
          <p>${escapeHtml(fileName)}</p>
          <a href="${url}" download="${escapeHtml(fileName)}" class="btn btn-primary">
            <i class="fas fa-download"></i> Download to View
          </a>
        </div>
      `;
    } else if (
      fileType &&
      (fileType.includes("powerpoint") || fileType.includes("presentation"))
    ) {
      html = `
        <div class="document-placeholder">
          <i class="fas fa-file-powerpoint"></i>
          <h4>Microsoft PowerPoint Presentation</h4>
          <p>${escapeHtml(fileName)}</p>
          <a href="${url}" download="${escapeHtml(fileName)}" class="btn btn-primary">
            <i class="fas fa-download"></i> Download to View
          </a>
        </div>
      `;
    }
    // Text files
    else if (
      fileType &&
      (fileType.includes("text/") ||
        fileType.includes("javascript") ||
        fileType.includes("json") ||
        fileType.includes("html"))
    ) {
      const text = await blob.text();
      html = `
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; max-height: 70vh; overflow: auto;">
          <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: monospace; font-size: 13px;">${escapeHtml(text)}</pre>
        </div>
      `;
    }
    // Default (download only)
    else {
      html = `
        <div class="preview-file-info">
          <i class="fas fa-file"></i>
          <h3>${escapeHtml(fileName)}</h3>
          <p>File type: ${fileType || "Unknown"}</p>
          <p>Preview not available for this file type.</p>
          <a href="${url}" download="${escapeHtml(fileName)}" class="btn btn-primary">
            <i class="fas fa-download"></i> Download File
          </a>
        </div>
      `;
    }

    previewContent.innerHTML = html;
    currentPreviewFile = { url, fileName };
  } catch (error) {
    console.error("Preview error:", error);
    previewContent.innerHTML = `
      <div class="preview-file-info">
        <i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i>
        <h3>Preview Failed</h3>
        <p>${error.message}</p>
        <button onclick="location.reload()" class="btn btn-primary">Try Again</button>
      </div>
    `;
  }
}

// Close preview modal
function closePreview() {
  const modal = document.getElementById("previewModal");
  if (modal) {
    modal.style.display = "none";
    const previewContent = document.getElementById("previewContent");
    if (previewContent) {
      previewContent.innerHTML =
        '<div class="preview-loading">Loading preview...</div>';
    }
  }
  if (currentPreviewFile && currentPreviewFile.url) {
    URL.revokeObjectURL(currentPreviewFile.url);
    currentPreviewFile = null;
  }
}

// Add preview button to items
function addPreviewButton() {
  // For grid view - add preview button to file cards
  document.querySelectorAll(".file-card, .file-item").forEach((item) => {
    // Check if preview button already exists
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

        // Get file type from database
        try {
          const response = await fetch(
            `/api/browse?folderId=${currentFolderId}`,
          );
          const data = await response.json();
          const file = data.files.find((f) => f.id == fileId);
          if (file) {
            previewFile(fileId, file.name, file.file_type);
          } else {
            previewFile(fileId, fileName, "application/octet-stream");
          }
        } catch (error) {
          console.error("Error getting file info:", error);
          previewFile(fileId, fileName, "application/octet-stream");
        }
      };

      // Insert preview button as first button
      actionsDiv.insertBefore(previewBtn, actionsDiv.firstChild);
    }
  });
}

// Override attachEventListeners to add preview buttons
const originalAttachEventListeners = attachEventListeners;
attachEventListeners = function () {
  originalAttachEventListeners();
  addPreviewButton();
};

// Preview modal close handlers
document.addEventListener("DOMContentLoaded", () => {
  const closePreviewBtn = document.querySelector(".close-preview");
  if (closePreviewBtn) {
    closePreviewBtn.addEventListener("click", closePreview);
  }

  window.addEventListener("click", (event) => {
    const modal = document.getElementById("previewModal");
    if (event.target === modal) {
      closePreview();
    }
  });

  // Escape key to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("previewModal");
      if (modal && modal.style.display === "block") {
        closePreview();
      }
    }
  });
});

// Also add preview to list view when refreshed
function refreshPreviewButtons() {
  setTimeout(addPreviewButton, 100);
}

// Call refresh after each load
const originalLoadContents = loadContents;
loadContents = async function (folderId = null) {
  await originalLoadContents(folderId);
  refreshPreviewButtons();
};

// Load initial content
checkAuth().then((user) => {
  if (user) {
    loadContents();
  }
});
