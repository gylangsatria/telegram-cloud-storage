let currentFolderId = null;
let currentPath = "";

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

// Display folders and files
function displayContents(data) {
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

  // Add event listeners
  document.querySelectorAll(".folder-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (!e.target.closest(".delete-folder")) {
        const folderId = card.dataset.id;
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
      '<a href="#" onclick="loadContents(null)">My Drive</a>';
    return;
  }

  // Get folder path
  const response = await fetch(`/api/browse?folderId=${currentFolderId}`);
  const data = await response.json();

  // Build breadcrumb (simplified version)
  breadcrumbDiv.innerHTML =
    '<a href="#" onclick="loadContents(null)">My Drive</a>';

  // You can implement full path tracking by storing path when creating folders
  const folder = data.folders.find((f) => f.id == currentFolderId);
  if (folder) {
    const parts = folder.path.split("/").filter((p) => p);
    let currentPath = "";
    for (const part of parts) {
      // This is simplified - you'd need to get folder IDs for each part
      breadcrumbDiv.innerHTML += ` / ${escapeHtml(part)}`;
    }
  } else {
    breadcrumbDiv.innerHTML += ` / ...`;
  }
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

// Close modal when clicking X or outside
document.querySelector(".close").addEventListener("click", () => {
  document.getElementById("folderModal").style.display = "none";
});

window.onclick = (event) => {
  const modal = document.getElementById("folderModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
};

// Load initial content
loadContents();
