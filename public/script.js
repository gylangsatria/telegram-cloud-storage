let currentFolderId = null;
let currentView = "grid"; // 'grid' or 'list'

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

// Display contents based on current view
function displayContents(data) {
  if (currentView === "grid") {
    displayGrid(data);
  } else {
    displayList(data);
  }
}

// Grid view display
function displayGrid(data) {
  const contentDiv = document.getElementById("content");

  if (data.folders.length === 0 && data.files.length === 0) {
    contentDiv.innerHTML =
      '<div class="empty"><i class="fas fa-folder-open"></i><p>This folder is empty</p></div>';
    return;
  }

  let html = '<div class="item-grid">';

  // Display folders
  data.folders.forEach((folder) => {
    html += `
            <div class="item-card folder-card" data-type="folder" data-id="${folder.id}">
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

  // Display files
  data.files.forEach((file) => {
    const size = formatFileSize(file.file_size);
    const icon = getFileIcon(file.file_type);

    html += `
            <div class="item-card file-card" data-type="file" data-id="${file.id}">
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
}

// List view display
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

  // Display folders
  data.folders.forEach((folder) => {
    html += `
            <div class="list-item folder-item" data-type="folder" data-id="${folder.id}">
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

  // Display files
  data.files.forEach((file) => {
    const size = formatFileSize(file.file_size);
    const icon = getFileIcon(file.file_type);

    html += `
            <div class="list-item file-item" data-type="file" data-id="${file.id}">
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
}

// Attach event listeners for both views
function attachEventListeners() {
  // Folder click (navigate)
  document.querySelectorAll(".folder-card, .folder-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (!e.target.closest(".delete-folder")) {
        const folderId = item.dataset.id;
        loadContents(folderId);
      }
    });
  });

  // Delete folder
  document.querySelectorAll(".delete-folder").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const folderId = btn.dataset.id;
      if (confirm("Delete this folder and all its contents?")) {
        await deleteFolder(folderId);
      }
    });
  });

  // Delete file
  document.querySelectorAll(".delete-file").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const fileId = btn.dataset.id;
      if (confirm("Delete this file?")) {
        await deleteFile(fileId);
      }
    });
  });

  // Download file
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

  // Build breadcrumb path
  let path = [];
  let currentId = currentFolderId;
  let maxDepth = 10; // Prevent infinite loop
  let depth = 0;

  while (currentId && depth < maxDepth) {
    depth++;
    try {
      const response = await fetch(`/api/browse?folderId=${currentId}`);
      const data = await response.json();

      // Find current folder
      const currentFolder = data.folders.find((f) => f.id == currentId);
      if (currentFolder) {
        path.unshift({ id: currentId, name: currentFolder.name });
        currentId = currentFolder.parent_id;
      } else {
        break;
      }
    } catch (error) {
      console.error("Error building breadcrumb:", error);
      break;
    }
  }

  // Build HTML
  let html =
    '<a href="#" onclick="loadContents(null); return false;">My Drive</a>';

  for (let i = 0; i < path.length; i++) {
    html += " / ";
    if (i === path.length - 1) {
      // Last item - no link, just text
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
  } catch (error) {
    console.error("Upload error:", error);
    alert(`Failed to upload ${file.name}: ${error.message}`);
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

// Close about modal when clicking outside
window.addEventListener("click", (event) => {
  if (event.target === aboutModal) {
    aboutModal.style.display = "none";
  }
});

// Load initial content
loadContents();
