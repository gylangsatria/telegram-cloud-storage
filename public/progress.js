// Progress Bar System
(function () {
  // Create progress bar element
  const progressContainer = document.createElement("div");
  progressContainer.className = "progress-container";
  progressContainer.innerHTML = '<div class="progress-bar"></div>';
  document.body.appendChild(progressContainer);

  let activeRequests = 0;
  let progressBar = progressContainer.querySelector(".progress-bar");
  let uploadInterval = null;

  // Show progress bar
  function showProgress() {
    progressContainer.style.display = "block";
    progressBar.style.width = "20%";
  }

  // Set progress percentage
  function setProgress(percent) {
    progressBar.style.width = percent + "%";
  }

  // Hide progress bar
  function hideProgress() {
    setProgress(100);
    setTimeout(() => {
      progressContainer.style.display = "none";
      setProgress(0);
    }, 300);
  }

  // Intercept fetch requests (GET, POST, DELETE)
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = args[0];
    const options = args[1] || {};
    const isUpload =
      url.includes("/upload") || options.body instanceof FormData;

    activeRequests++;
    if (activeRequests === 1) showProgress();

    // Untuk upload, simulasikan progress
    if (isUpload) {
      let progress = 20;
      setProgress(progress);

      // Simulasi progress upload
      if (uploadInterval) clearInterval(uploadInterval);
      uploadInterval = setInterval(() => {
        if (progress < 85) {
          progress += 5;
          setProgress(progress);
        }
      }, 200);
    } else {
      let progress = Math.min(20 + activeRequests * 15, 85);
      setProgress(progress);
    }

    try {
      const response = await originalFetch.apply(this, args);
      return response;
    } finally {
      if (isUpload && uploadInterval) {
        clearInterval(uploadInterval);
        uploadInterval = null;
      }

      activeRequests--;
      if (activeRequests === 0) {
        hideProgress();
      } else {
        let progress = Math.min(20 + activeRequests * 15, 85);
        setProgress(progress);
      }
    }
  };

  // Intercept XMLHttpRequest untuk upload progress yang lebih akurat
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method,
    url,
    async,
    user,
    password,
  ) {
    this._url = url;
    this._method = method;
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const isUpload =
      this._method === "POST" &&
      (this._url.includes("/upload") || body instanceof FormData);

    activeRequests++;
    if (activeRequests === 1) showProgress();

    if (isUpload) {
      let progress = 20;
      setProgress(progress);

      if (uploadInterval) clearInterval(uploadInterval);
      uploadInterval = setInterval(() => {
        if (progress < 85) {
          progress += 5;
          setProgress(progress);
        }
      }, 200);

      // Track upload progress if available
      if (this.upload) {
        this.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 70) + 20;
            setProgress(Math.min(percent, 90));
          }
        });
      }
    } else {
      let progress = Math.min(20 + activeRequests * 15, 85);
      setProgress(progress);
    }

    this.addEventListener("loadend", () => {
      if (isUpload && uploadInterval) {
        clearInterval(uploadInterval);
        uploadInterval = null;
      }

      activeRequests--;
      if (activeRequests === 0) {
        hideProgress();
      } else {
        let progress = Math.min(20 + activeRequests * 15, 85);
        setProgress(progress);
      }
    });

    return originalXHRSend.apply(this, arguments);
  };

  // Monitor upload function di script.js (override uploadFile)
  function monitorUploadFunction() {
    // Tunggu sampai script.js loaded
    setTimeout(() => {
      if (window.originalUploadFile) return;

      // Backup original function if exists
      if (window.uploadFile && !window.originalUploadFile) {
        window.originalUploadFile = window.uploadFile;

        window.uploadFile = async function (file) {
          showProgress();
          setProgress(20);

          // Simulasi progress
          let progress = 20;
          const interval = setInterval(() => {
            if (progress < 85) {
              progress += 8;
              setProgress(progress);
            }
          }, 300);

          try {
            const result = await window.originalUploadFile(file);
            return result;
          } finally {
            clearInterval(interval);
            setProgress(100);
            setTimeout(() => {
              hideProgress();
            }, 500);
          }
        };
      }
    }, 1000);
  }

  // Setup saat DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      monitorUploadFunction();
    });
  } else {
    monitorUploadFunction();
  }
})();
