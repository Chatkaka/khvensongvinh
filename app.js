/**
 * ERP CORE SYSTEM CONTROLLER & CALCULATIONS ENGINE
 * Implementing Real-time Rollups, Chokepoints, Gantt SVG, and AI Commands
 */

document.addEventListener("DOMContentLoaded", () => {
    // 1. STATE MANAGEMENT & INITIALIZATION
    let db = {};
    // ==================== INDEXEDDB FILE STORAGE SYSTEM ====================
    let idb = null;
    const dbName = "ERP_FileStorage";
    const storeName = "files";

    function initIndexedDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open(dbName, 1);
            request.onerror = (e) => {
                console.error("IndexedDB error:", e);
                resolve(null);
            };
            request.onsuccess = (e) => {
                idb = e.target.result;
                resolve(idb);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
        });
    }

    function saveFileToIndexedDB(fileId, base64Data) {
        if (!idb) {
            initIndexedDB().then(db => {
                if (db) performSave();
            });
            return;
        }
        performSave();

        function performSave() {
            try {
                const transaction = idb.transaction([storeName], "readwrite");
                const store = transaction.objectStore(storeName);
                store.put(base64Data, fileId);
            } catch (e) {
                console.error("Error saving file to IndexedDB:", e);
            }
        }
    }

    function getFileFromIndexedDB(fileId) {
        return new Promise((resolve) => {
            if (!idb) {
                initIndexedDB().then(db => {
                    if (db) performGet();
                    else resolve(null);
                });
                return;
            }
            performGet();

            function performGet() {
                try {
                    const transaction = idb.transaction([storeName], "readonly");
                    const store = transaction.objectStore(storeName);
                    const request = store.get(fileId);
                    request.onsuccess = (e) => {
                        resolve(e.target.result || null);
                    };
                    request.onerror = () => {
                        resolve(null);
                    };
                } catch (e) {
                    console.error("Error reading file from IndexedDB:", e);
                    resolve(null);
                }
            }
        });
    }

    window.viewIndexedDBFile = function(fileId) {
        getFileFromIndexedDB(fileId).then(base64Data => {
            if (!base64Data) {
                alert("Không tìm thấy tệp tin đính kèm trong cơ sở dữ liệu IndexedDB của trình duyệt!");
                return;
            }
            
            // Open a new window and render the file
            const newWindow = window.open();
            if (!newWindow) {
                alert("Trình duyệt đã chặn cửa sổ bật lên (popup). Vui lòng cấp quyền cho trang web để hiển thị tệp tin!");
                return;
            }
            
            const parts = fileId.split("_");
            const filename = parts.slice(1).join("_") || "attachment";
            
            newWindow.document.title = filename;
            
            const mimeType = (base64Data.split(';')[0].split(':')[1] || "").toLowerCase();
            if (mimeType.includes("pdf")) {
                newWindow.document.body.innerHTML = `
                    <embed src="${base64Data}" type="application/pdf" width="100%" height="100%" style="border: none; position: fixed; top: 0; left: 0; bottom: 0; right: 0;">
                `;
            } else {
                newWindow.document.body.innerHTML = `
                    <div style="display:flex; justify-content:center; align-items:center; min-height:100vh; background:#121212;">
                        <img src="${base64Data}" style="max-width:100%; max-height:100vh; object-fit:contain; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    </div>
                `;
            }
        });
    };

    let defaultDb = (typeof INITIAL_DATABASE !== 'undefined' ? INITIAL_DATABASE : (window.INITIAL_DATABASE || { master: [], s01: [], s02: [], s03: [], s04: [], s05: [], danh_muc: {} }));
    
    // Fallback static configuration (Will be auto-baked during deployment)
    const fallbackGdriveUrl = "https://script.google.com/macros/s/AKfycbyhwxmcAAfPU5CPqCJMVFNvUjkcQrH9Vp4f_LGBuKEruxBgdg2PAJR3nAyeAHB4QBzR/exec";
    const fallbackGdriveFolderId = "Vòng đời gói thầu VSV";
    
    // View level and column sub-tabs state variables
    let activeLevel = "project"; // "project" (Cấp công trình) or "detail" (Cấp chi tiết)
    let activeSubtab = "cdt";    // "cdt", "cung_ung", "trien_khai", "khoi_cong", "ngan_sach", "thi_cong", "all"
    const expandedParents = new Set(); // Set of expanded parent IDs (Mã BSC / goi_thau_pl)
    let currentRole = "Admin";   // Active role: "Admin", "Supervisor", "Contractor", "Supply"
    let dashboardAlarmFilter = ""; // Active warning filter: "red", "orange", "yellow", "normal", or ""
    let s02FilterPending = false;  // Active filter for Sổ 02 pending approval rows
    let s02FilterOverdue = false;  // Active filter for Sổ 02 overdue pending rows
    let s03FilterPending = false;  // Active filter for Sổ 03 pending approval rows
    let s04FilterPending = false;  // Active filter for Sổ 04 pending approval rows
    
    // Helper to lock plan fields for non-admin users
    function getPlanLockAttr(val) {
        const isUserAdmin = currentUser && currentUser.quyen === 'Admin';
        if (isUserAdmin) return "";
        if (val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "0") {
            return 'disabled style="background: rgba(255,255,255,0.03); cursor: not-allowed;" title="Kế hoạch đã lưu ghi, chỉ tài khoản Admin mới được sửa!"';
        }
        return "";
    }

    // Helper to get system date formatted in GMT+7 (browser local time)
    function getSystemDateGMT7() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getSystemDateTimeGMT7() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    function getSystemDateTimeGMT7() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    async function uploadDatabaseToCloud() {
        const gdriveUrl = localStorage.getItem("gdrive_upload_url") || fallbackGdriveUrl;
        if (!gdriveUrl) return;
        try {
            console.log("Syncing database to Google Drive...");
            const resp = await fetch(gdriveUrl, {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({
                    action: "save_db",
                    dbData: db,
                    folderId: localStorage.getItem("gdrive_folder_id") || fallbackGdriveFolderId
                })
            });
            const res = await resp.json();
            if (res.status === "success") {
                console.log("Database synced to Google Drive successfully at:", res.last_updated);
            }
        } catch (err) {
            console.error("Failed to sync database to Google Drive:", err);
        }
    }

    async function loadDatabase() {
        let loadedFromCloud = false;
        
        // 1. Try fetching from Google Drive if configured
        const gdriveUrl = (defaultDb && defaultDb.system_config && defaultDb.system_config.gdrive_upload_url) || localStorage.getItem("gdrive_upload_url") || fallbackGdriveUrl;
        if (gdriveUrl) {
            try {
                console.log("Fetching database from Google Drive...");
                const folderId = (defaultDb && defaultDb.system_config && defaultDb.system_config.gdrive_folder_id) || localStorage.getItem("gdrive_folder_id") || fallbackGdriveFolderId;
                const fetchUrl = gdriveUrl + (gdriveUrl.includes("?") ? "&" : "?") + "action=load_db" + (folderId ? ("&folderId=" + folderId) : "");
                const resp = await fetch(fetchUrl);
                if (resp.ok) {
                    const res = await resp.json();
                    if (res && res.master) {
                        defaultDb = res;
                        loadedFromCloud = true;
                        console.log("Successfully dynamically loaded defaultDb from Google Drive:", defaultDb.last_updated);
                    } else if (res && res.status === "error") {
                        console.warn("erp_database.json not found on Google Drive.");
                        const isAdminDevice = localStorage.getItem("is_admin_device") === "true";
                        if (isAdminDevice) {
                            console.log("Admin device detected. Initializing cloud database file...");
                            setTimeout(() => {
                                uploadDatabaseToCloud();
                            }, 3000);
                        }
                    }
                }
            } catch (e) {
                console.warn("Google Drive fetch failed. Falling back to local/static database.", e);
            }
        }

        // 2. Fallback to fetching from GitHub Pages if Google Drive load failed/not configured
        if (!loadedFromCloud) {
            try {
                const fetchUrl = window.location.protocol === "file:" ? "database.js" : ("database.js?t=" + Date.now());
                const resp = await fetch(fetchUrl);
                if (resp.ok) {
                    const text = await resp.text();
                    const match = text.match(/INITIAL_DATABASE\s*=\s*(\{[\s\S]*?\});/);
                    if (match) {
                        const parsed = JSON.parse(match[1]);
                        if (parsed && parsed.master) {
                            defaultDb = parsed;
                            console.log("Dynamically loaded defaultDb from server:", defaultDb.last_updated);
                        }
                    }
                }
            } catch (e) {
                console.warn("Background fetch of database.js failed/offline, using statically loaded version.", e);
            }
        }

        const stored = localStorage.getItem("erp_db");
        let localDb = null;
        if (stored) {
            try {
                localDb = JSON.parse(stored);
            } catch (e) {
                console.error("Error parsing stored DB:", e);
            }
        }

        const serverUpdateStr = defaultDb && defaultDb.last_updated ? defaultDb.last_updated : "";
        const localUpdateStr = localDb && localDb.last_updated ? localDb.last_updated : "";

        // Determine if we should synchronize with defaultDb (the deployed database.js)
        let shouldSync = false;
        
        // CRITICAL PROTECTION: Admin device is the author/source-of-truth. Never overwrite Admin's local storage automatically unless server is newer
        const isAdminDevice = localStorage.getItem("is_admin_device") === "true";
        
        if (!isAdminDevice) {
            if (!localDb) {
                shouldSync = true;
            } else if (serverUpdateStr && (!localUpdateStr || serverUpdateStr > localUpdateStr)) {
                shouldSync = true;
            }
        } else {
            // Admin device will also auto-sync if the Google Drive database is strictly newer (bidirectional sync)
            if (serverUpdateStr && localUpdateStr && serverUpdateStr > localUpdateStr) {
                shouldSync = true;
            }
        }

        if (shouldSync) {
            db = JSON.parse(JSON.stringify(defaultDb));
            console.log("Automatically synchronized database with the server/deployed version:", serverUpdateStr);
        } else {
            db = localDb || JSON.parse(JSON.stringify(defaultDb));
        }

        sanitizeInitialData();
        
        // Sync system configuration fields from db to localStorage on startup
        if (db.system_config) {
            if (db.system_config.gemini_api_key !== undefined) {
                localStorage.setItem("gemini_api_key", db.system_config.gemini_api_key);
                if (typeof GeminiAI !== 'undefined') GeminiAI.apiKey = db.system_config.gemini_api_key;
            }
            if (db.system_config.gemini_model !== undefined) {
                localStorage.setItem("gemini_model", db.system_config.gemini_model);
                if (typeof GeminiAI !== 'undefined') GeminiAI.model = db.system_config.gemini_model;
            }
            if (db.system_config.telegram_bot_token !== undefined) {
                localStorage.setItem("telegram_bot_token", db.system_config.telegram_bot_token);
            }
            if (db.system_config.telegram_chat_id !== undefined) {
                localStorage.setItem("telegram_chat_id", db.system_config.telegram_chat_id);
            }
            if (db.system_config.gdrive_upload_url !== undefined) {
                localStorage.setItem("gdrive_upload_url", db.system_config.gdrive_upload_url);
            }
            if (db.system_config.gdrive_folder_id !== undefined) {
                localStorage.setItem("gdrive_folder_id", db.system_config.gdrive_folder_id);
            }
        }
        
        // Persist DB
        if (isAdminDevice) {
            saveDatabase();
        } else {
            localStorage.setItem("erp_db", JSON.stringify(db));
        }
    }

    function saveDatabase() {
        const isAdminDevice = localStorage.getItem("is_admin_device") === "true";
        if (db) {
            db.last_updated = getSystemDateTimeGMT7();
        }
        localStorage.setItem("erp_db", JSON.stringify(db));
        
        // Background upload database to Google Drive
        uploadDatabaseToCloud();
    }

    function resetDatabaseToFactory() {
        db = JSON.parse(JSON.stringify(defaultDb));
        saveDatabase();
        showToast("Hệ thống", "Đã đặt lại toàn bộ Cơ sở dữ liệu về trạng thái ban đầu.", "success");
        initApp();
    }

    // ==========================================================================
    // 16. TAB QUẢN LÝ TIẾN ĐỘ CÔNG VIỆC (ENTERPRISE GANTT CHART MANAGEMENT)
    let ganttCollapsedPackages = new Set();
    let ganttSelectedBsc = ""; 
    let ganttZoomMode = "month"; 
    let ganttControlsBound = false;
    let ganttBscDropdownInitialized = false;

    function groupMasterIntoPackages(masterArray) {
        if (!masterArray || masterArray.length === 0) return [];
        const flatRows = getFlatMasterRows(masterArray);
        const packages = [];
        let currentPackage = null;
        
        flatRows.forEach(row => {
            if (!row) return;
            const bsc = String(row.ma_bsc || "").trim();
            const isParent = bsc !== "";
            
            if (isParent) {
                currentPackage = {
                    parent: row,
                    children: []
                };
                packages.push(currentPackage);
            } else {
                if (currentPackage) {
                    currentPackage.children.push(row);
                } else {
                    currentPackage = {
                        parent: row,
                        children: []
                    };
                    packages.push(currentPackage);
                }
            }
        });
        return packages;
    }

    function formatGanttDateDMY(date) {
        if (!date) return "";
        if (date instanceof Date) {
            if (isNaN(date.getTime())) return "";
            const dd = String(date.getDate()).padStart(2, '0');
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const yyyy = date.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
        }
        const parts = String(date).trim().split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return date;
    }

    function formatGanttDateDM(date) {
        if (!date) return "";
        if (date instanceof Date) {
            if (isNaN(date.getTime())) return "";
            const dd = String(date.getDate()).padStart(2, '0');
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            return `${dd}/${mm}`;
        }
        const parts = String(date).trim().split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}/${parts[1]}`;
        }
        const dmyParts = String(date).trim().split("/");
        if (dmyParts.length === 3) {
            return `${dmyParts[0]}/${dmyParts[1]}`;
        }
        return date;
    }

    function initGanttSearchableSelect(inputId, optionsList, defaultVal = "") {
        const wrapper = document.getElementById(inputId + "-wrapper");
        const searchInput = document.getElementById(inputId + "-search");
        const dropdown = document.getElementById(inputId + "-dropdown");
        const hiddenInput = document.getElementById(inputId);
        
        if (!wrapper || !searchInput || !dropdown || !hiddenInput) return;
        
        let selectedValue = defaultVal;
        
        // Find default label
        const defaultOpt = optionsList.find(opt => opt.value === defaultVal);
        if (defaultOpt) {
            searchInput.value = defaultOpt.label;
        } else {
            searchInput.value = "";
        }
        hiddenInput.value = selectedValue;
        
        function renderOptionsList(filterText = "") {
            const query = filterText.toLowerCase().trim();
            const filtered = optionsList.filter(opt => opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query));
            
            if (filtered.length === 0) {
                dropdown.innerHTML = `<div class="searchable-select-no-results">Không tìm thấy kết quả...</div>`;
                return;
            }
            
            dropdown.innerHTML = filtered.map(opt => {
                const isSelected = opt.value === selectedValue;
                return `
                    <div class="searchable-select-option ${isSelected ? 'selected' : ''}" data-value="${opt.value}" style="background-color: #1f2937; color: #f3f4f6; padding: 10px 14px; cursor: pointer; transition: background 0.15s ease;">
                        <span>${opt.label}</span>
                    </div>
                `;
            }).join("");
            
            dropdown.querySelectorAll(".searchable-select-option").forEach(optEl => {
                optEl.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    selectedValue = optEl.getAttribute("data-value");
                    hiddenInput.value = selectedValue;
                    searchInput.value = optEl.querySelector("span").textContent;
                    
                    // Trigger change event
                    hiddenInput.dispatchEvent(new Event("change"));
                    
                    closeDropdown();
                });
                
                optEl.addEventListener("mouseenter", () => {
                    optEl.style.backgroundColor = "var(--color-ai-primary)";
                });
                optEl.addEventListener("mouseleave", () => {
                    optEl.style.backgroundColor = "#1f2937";
                });
            });
        }
        
        function openDropdown() {
            dropdown.style.display = "block";
            wrapper.classList.add("open");
            renderOptionsList(searchInput.value);
        }
        
        function closeDropdown() {
            dropdown.style.display = "none";
            wrapper.classList.remove("open");
            
            const matched = optionsList.find(opt => opt.label === searchInput.value);
            if (!matched) {
                const currentOpt = optionsList.find(opt => opt.value === selectedValue);
                searchInput.value = currentOpt ? currentOpt.label : "";
            }
        }
        
        searchInput.addEventListener("focus", openDropdown);
        searchInput.addEventListener("click", openDropdown);
        
        searchInput.addEventListener("input", (e) => {
            openDropdown();
            renderOptionsList(e.target.value);
        });
        
        searchInput.addEventListener("blur", () => {
            setTimeout(closeDropdown, 220);
        });
    }

    function populateGanttBscDropdown(structuredPackages) {
        if (!structuredPackages || structuredPackages.length === 0) return;
        if (ganttBscDropdownInitialized) return;
        ganttBscDropdownInitialized = true;

        const uniquePls = [...new Set(structuredPackages.map(pkg => {
            const p = pkg.parent;
            return p.goi_thau_pl || p["Gói thầu PL"] || p["Phân Lộ"] || p.PL || p.pl;
        }).filter(Boolean))].sort();

        const optionsList = [
            { value: "", label: `-- Tất cả Phụ lục (PL) (${uniquePls.length} PL) --` },
            ...uniquePls.map(pl => ({ value: pl, label: `Phụ lục: ${pl}` }))
        ];

        initGanttSearchableSelect("gantt-select-bsc", optionsList, ganttSelectedBsc);
    }

    function bindGanttControlsOnce() {
        if (ganttControlsBound) return;
        ganttControlsBound = true;

        const bscSelect = document.getElementById("gantt-select-bsc");
        if (bscSelect) {
            bscSelect.addEventListener("change", (e) => {
                ganttSelectedBsc = e.target.value;
                renderFullGanttManagementView();
            });
        }
    }

    function renderFullGanttManagementView() {
        const container = document.getElementById("gantt-management-container");
        if (!container) return;

        // Group master data into parent packages & children correctly
        const structuredPackages = groupMasterIntoPackages(db.master);

        // Populate PL Dropdown matching Master Tab exactly
        populateGanttBscDropdown(structuredPackages);

        // Bind Controls Once
        bindGanttControlsOnce();

        // Filter packages based on user selection in PL dropdown
        let displayPackages = structuredPackages;

        // Filter by PL selection (Phụ lục)
        if (ganttSelectedBsc && ganttSelectedBsc.trim() !== "") {
            const targetPl = ganttSelectedBsc.trim().toLowerCase();
            displayPackages = displayPackages.filter(pkg => {
                const pl = String(pkg.parent.goi_thau_pl || "").trim().toLowerCase();
                return pl === targetPl || pl.includes(targetPl) || targetPl.includes(pl);
            });
            displayPackages.forEach(pkg => {
                if (pkg.parent && pkg.parent.ma_bsc) {
                    ganttCollapsedPackages.delete(pkg.parent.ma_bsc);
                }
            });
        }

        // ABSOLUTE POKA-YOKE SAFEGUARD: Never render a blank empty screen!
        if (displayPackages.length === 0) {
            console.warn("Gantt filter yielded 0 packages, auto-resetting display to all packages.");
            displayPackages = structuredPackages;
        }

        const treeRows = [];
        let allDates = [];
        const seenGrandParents = new Set();

        displayPackages.forEach((pkg, pkgIdx) => {
            const p = pkg.parent;
            const isCollapsed = ganttCollapsedPackages.has(p.ma_bsc);
            const parentBsc = p.ma_bsc || `BSC-${p.tt || pkgIdx+1}`;
            const parentNhom = p.nhom_ct || 'Hạ tầng kỹ thuật';

            // Add Grand Parent PL Group Row if new
            const grandParentKey = `${parentNhom}_${p.goi_thau_pl}`;
            if (!seenGrandParents.has(grandParentKey)) {
                seenGrandParents.add(grandParentKey);
                treeRows.push({
                    type: 'grand_parent',
                    tt: '',
                    nhom_ct: parentNhom,
                    ma_bsc: parentBsc,
                    title: `Gói thầu ${parentNhom} (${p.goi_thau_pl || "PL"})`,
                    startDateStr: '',
                    endDateStr: '',
                    color: '#f59e0b'
                });
            }

            // Dates for Package Milestones:
            const m1DateStr = p.kh_phat_hanh_hstktc || p.kh_pd_khtk || "";
            const m1Date = parseGanttDateSafe(m1DateStr);
            
            const m2DateStr = p.kh_lcnt || "";
            const m2Date = parseGanttDateSafe(m2DateStr);

            const m3DateStr = p.kh_ky_hdcu || "";
            const m3Date = parseGanttDateSafe(m3DateStr);

            const m4DateStr = p.ngay_bd_khoi_cong || "";
            const m4Date = parseGanttDateSafe(m4DateStr);

            // Calculate Parent Start & End Dates with Exact User Directive (Default Start: 01/01/2026, Default End: 31/12/2026)
            let startDate = parseGanttDateSafe(p.ngay_bd_yc);
            let endDate = parseGanttDateSafe(p.ngay_kt_yc);

            const validMilestones = [m1Date, m2Date, m3Date, m4Date].filter(d => d !== null);
            if (!startDate && validMilestones.length > 0) {
                startDate = new Date(Math.min(...validMilestones.map(d => d.getTime())));
            }
            if (!endDate && validMilestones.length > 0) {
                endDate = new Date(Math.max(...validMilestones.map(d => d.getTime())));
            }
            
            // USER DIRECTIVE: Mặc nhiên lấy ngày bắt đầu là 01/01/2026 và ngày kết thúc là 31/12/2026 nếu rỗng
            if (!startDate) {
                startDate = new Date("2026-01-01");
            }
            if (!endDate) {
                endDate = new Date("2026-12-31");
            }

            if (startDate) allDates.push(startDate);
            if (endDate) allDates.push(endDate);
            validMilestones.forEach(d => allDates.push(d));

            // Add Parent Package Row (Level 1: ALWAYS populated TT, NHÓM CT, MÃ BSC, HẠNG MỤC, NGÀY BĐ, NGÀY KT)
            treeRows.push({
                type: 'parent',
                tt: p.tt || (pkgIdx + 1),
                nhom_ct: parentNhom,
                ma_bsc: parentBsc,
                title: p.hang_muc_work || `Gói thầu ${parentBsc}`,
                person: p.phu_trach || "BQLDA",
                startDate: startDate,
                endDate: endDate,
                startDateStr: formatGanttDateDMY(startDate),
                endDateStr: formatGanttDateDMY(endDate),
                status: calculatePackageGanttStatus(p),
                progress: calculatePackageProgress(p),
                isCollapsed: isCollapsed
            });

            if (!isCollapsed) {
                if (pkg.children && pkg.children.length > 0) {
                    pkg.children.forEach((c, cIdx) => {
                        let cStart = parseGanttDateSafe(c.ngay_bd_yc || c.kh_phat_hanh_hstktc);
                        let cEnd = parseGanttDateSafe(c.ngay_kt_yc || c.ngay_bd_khoi_cong);

                        if (!cStart) cStart = new Date("2026-01-01");
                        if (!cEnd) cEnd = new Date("2026-12-31");

                        allDates.push(cStart, cEnd);

                        const childTt = c.tt || `${p.tt || (pkgIdx + 1)}.${cIdx + 1}`;

                        // Add Level-2 Child Row (MÃ BSC: Rỗng theo yêu cầu)
                        treeRows.push({
                            type: 'child_work',
                            parentBsc: parentBsc,
                            tt: childTt,
                            nhom_ct: c.nhom_ct || parentNhom,
                            ma_bsc: "", // LEVEL 2: Rỗng!
                            title: c.hang_muc_work || `Hạng mục ${childTt}`,
                            person: c.phu_trach || p.phu_trach || "BQLDA",
                            startDate: cStart,
                            endDate: cEnd,
                            startDateStr: formatGanttDateDMY(cStart),
                            endDateStr: formatGanttDateDMY(cEnd),
                            status: c.progress_status || c.dieu_kien_du || "Đang thực hiện",
                            color: "#38bdf8"
                        });

                        const cm1Str = c.kh_phat_hanh_hstktc || m1DateStr;
                        const cm1Date = parseGanttDateSafe(cm1Str) || new Date("2026-03-31");
                        
                        const cm2Str = c.kh_lcnt || m2DateStr;
                        const cm2Date = parseGanttDateSafe(cm2Str) || new Date("2026-06-30");

                        const cm3Str = c.kh_ky_hdcu || m3DateStr;
                        const cm3Date = parseGanttDateSafe(cm3Str) || new Date("2026-08-31");

                        const cm4Str = c.ngay_bd_khoi_cong || m4DateStr;
                        const cm4Date = parseGanttDateSafe(cm4Str) || new Date("2026-10-31");

                        allDates.push(cm1Date, cm2Date, cm3Date, cm4Date);

                        treeRows.push({
                            type: 'level3_milestone',
                            mType: 1,
                            parentBsc: parentBsc,
                            childTt: childTt,
                            tt: `${childTt}.1`,
                            nhom_ct: c.nhom_ct || parentNhom,
                            ma_bsc: "", // LEVEL 3: Rỗng!
                            title: "🟢 1. KH HSTKTC (Hồ sơ Thiết kế Thi công)",
                            date: cm1Date,
                            startDateStr: formatGanttDateDMY(cm1Date),
                            endDateStr: formatGanttDateDMY(cm1Date),
                            status: c.tt_khtk || p.tt_khtk || (cm1Str ? "Đã lập KH" : "Chờ phê duyệt"),
                            color: "#10b981"
                        });

                        treeRows.push({
                            type: 'level3_milestone',
                            mType: 2,
                            parentBsc: parentBsc,
                            childTt: childTt,
                            tt: `${childTt}.2`,
                            nhom_ct: c.nhom_ct || parentNhom,
                            ma_bsc: "", // LEVEL 3: Rỗng!
                            title: "🟠 2. KH LCNT (Kế hoạch Lựa chọn Nhà thầu)",
                            date: cm2Date,
                            startDateStr: formatGanttDateDMY(cm2Date),
                            endDateStr: formatGanttDateDMY(cm2Date),
                            status: c.tt_lcnt || p.tt_lcnt || (cm2Str ? "Đã lập KH" : "Chờ LCNT"),
                            color: "#f59e0b"
                        });

                        treeRows.push({
                            type: 'level3_milestone',
                            mType: 3,
                            parentBsc: parentBsc,
                            childTt: childTt,
                            tt: `${childTt}.3`,
                            nhom_ct: c.nhom_ct || parentNhom,
                            ma_bsc: "", // LEVEL 3: Rỗng!
                            title: "🟣 3. KH ký HĐCU (Kế hoạch Ký hợp đồng Cung ứng)",
                            date: cm3Date,
                            startDateStr: formatGanttDateDMY(cm3Date),
                            endDateStr: formatGanttDateDMY(cm3Date),
                            status: c.tt_ky_hdcu || p.tt_ky_hdcu || (cm3Str ? "Đã ký" : "Chờ ký HĐ"),
                            color: "#8b5cf6"
                        });

                        treeRows.push({
                            type: 'level3_milestone',
                            mType: 4,
                            parentBsc: parentBsc,
                            childTt: childTt,
                            tt: `${childTt}.4`,
                            nhom_ct: c.nhom_ct || parentNhom,
                            ma_bsc: "", // LEVEL 3: Rỗng!
                            title: "🔴 4. Ngày BĐ khởi công (Mốc Bắt đầu Khởi công)",
                            date: cm4Date,
                            startDateStr: formatGanttDateDMY(cm4Date),
                            endDateStr: formatGanttDateDMY(cm4Date),
                            status: c.dieu_kien_du || p.dieu_kien_du || (cm4Str ? "Đã khởi công" : "Thiếu ĐK KC"),
                            color: "#ef4444"
                        });
                    });
                } else {
                    const pTt = p.tt || (pkgIdx + 1);

                    treeRows.push({
                        type: 'level3_milestone',
                        mType: 1,
                        parentBsc: parentBsc,
                        tt: `${pTt}.1`,
                        nhom_ct: parentNhom,
                        ma_bsc: "", // LEVEL 3: Rỗng!
                        title: "🟢 1. KH HSTKTC (Hồ sơ Thiết kế Thi công)",
                        date: m1Date || new Date("2026-03-31"),
                        startDateStr: formatGanttDateDMY(m1Date || new Date("2026-03-31")),
                        endDateStr: formatGanttDateDMY(m1Date || new Date("2026-03-31")),
                        status: p.tt_khtk || p.tt_hstktc || (m1DateStr ? "Đã lập KH" : "Chờ phê duyệt"),
                        color: "#10b981"
                    });
                    treeRows.push({
                        type: 'level3_milestone',
                        mType: 2,
                        parentBsc: parentBsc,
                        tt: `${pTt}.2`,
                        nhom_ct: parentNhom,
                        ma_bsc: "", // LEVEL 3: Rỗng!
                        title: "🟠 2. KH LCNT (Kế hoạch Lựa chọn Nhà thầu)",
                        date: m2Date || new Date("2026-06-30"),
                        startDateStr: formatGanttDateDMY(m2Date || new Date("2026-06-30")),
                        endDateStr: formatGanttDateDMY(m2Date || new Date("2026-06-30")),
                        status: p.tt_lcnt || (m2DateStr ? "Đã lập KH" : "Chờ LCNT"),
                        color: "#f59e0b"
                    });
                    treeRows.push({
                        type: 'level3_milestone',
                        mType: 3,
                        parentBsc: parentBsc,
                        tt: `${pTt}.3`,
                        nhom_ct: parentNhom,
                        ma_bsc: "", // LEVEL 3: Rỗng!
                        title: "🟣 3. KH ký HĐCU (Kế hoạch Ký hợp đồng Cung ứng)",
                        date: m3Date || new Date("2026-08-31"),
                        startDateStr: formatGanttDateDMY(m3Date || new Date("2026-08-31")),
                        endDateStr: formatGanttDateDMY(m3Date || new Date("2026-08-31")),
                        status: p.tt_ky_hdcu || (m3DateStr ? "Đã ký" : "Chờ ký HĐ"),
                        color: "#8b5cf6"
                    });
                    treeRows.push({
                        type: 'level3_milestone',
                        mType: 4,
                        parentBsc: parentBsc,
                        tt: `${pTt}.4`,
                        nhom_ct: parentNhom,
                        ma_bsc: "", // LEVEL 3: Rỗng!
                        title: "🔴 4. Ngày BĐ khởi công (Mốc Bắt đầu Khởi công)",
                        date: m4Date || new Date("2026-10-31"),
                        startDateStr: formatGanttDateDMY(m4Date || new Date("2026-10-31")),
                        endDateStr: formatGanttDateDMY(m4Date || new Date("2026-10-31")),
                        status: p.dieu_kien_du || (m4DateStr ? "Đã khởi công" : "Thiếu ĐK KC"),
                        color: "#ef4444"
                    });
                }
            }
        });

        let minTime = Infinity;
        let maxTime = -Infinity;

        allDates.forEach(d => {
            if (d && !isNaN(d)) {
                minTime = Math.min(minTime, d.getTime());
                maxTime = Math.max(maxTime, d.getTime());
            }
        });

        if (minTime === Infinity) minTime = new Date("2026-01-01").getTime();
        if (maxTime === -Infinity) maxTime = new Date("2026-12-31").getTime();

        const paddingStart = 15 * 24 * 60 * 60 * 1000;
        const paddingEnd = 30 * 24 * 60 * 60 * 1000;
        minTime -= paddingStart;
        maxTime += paddingEnd;

        const totalDays = Math.ceil((maxTime - minTime) / (24 * 60 * 60 * 1000));
        const dayWidth = 8;
        const ganttWidth = Math.max(totalDays * dayWidth, 1100);
        const rowHeight = 38;
        const headerHeight = 50;
        const ganttHeight = headerHeight + (treeRows.length * rowHeight);

        let html = `
            <div class="gantt-left-panel">
                <table class="gantt-left-table">
                    <colgroup>
                        <col style="width: 50px;">
                        <col style="width: 130px;">
                        <col style="width: 150px;">
                        <col style="width: 370px;">
                        <col style="width: 120px;">
                        <col style="width: 120px;">
                    </colgroup>
                    <thead>
                        <tr>
                            <th style="text-align: center; background: #1f2937; color: #ffffff;">TT</th>
                            <th style="background: #1f2937; color: #ffffff;">NHÓM CÔNG TRÌNH</th>
                            <th style="background: #1f2937; color: #ffffff;">MÃ BSC</th>
                            <th style="background: #1f2937; color: #38bdf8;">HẠNG MỤC / CÔNG VIỆC</th>
                            <th style="text-align: center; background: #1f2937; color: #10b981;">NGÀY BẮT ĐẦU</th>
                            <th style="text-align: center; background: #1f2937; color: #ef4444;">NGÀY KẾT THÚC</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        treeRows.forEach((row, idx) => {
            if (row.type === 'grand_parent') {
                html += `
                    <tr class="row-grand-parent-gantt" style="background-color: #27272a; font-weight: 700; color: #f59e0b;" data-row-idx="${idx}">
                        <td style="text-align: center; color: #f59e0b;">${escapeHtml(row.tt)}</td>
                        <td style="color: #f59e0b;">${escapeHtml(row.nhom_ct)}</td>
                        <td style="color: #f59e0b;">${escapeHtml(row.ma_bsc)}</td>
                        <td style="color: #f59e0b;">
                            <span class="gantt-tree-toggle" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;"><i class="fa-solid fa-minus"></i></span>
                            ${escapeHtml(row.title)}
                        </td>
                        <td style="text-align: center; color: #f59e0b;"></td>
                        <td style="text-align: center; color: #f59e0b;"></td>
                    </tr>
                `;
            } else if (row.type === 'parent') {
                const toggleIcon = row.isCollapsed ? '<i class="fa-solid fa-plus"></i>' : '<i class="fa-solid fa-minus"></i>';
                html += `
                    <tr class="row-parent-gantt" style="background-color: #1e293b; color: #ffffff;" data-row-idx="${idx}">
                        <td style="text-align: center; font-weight: 700; color: #93c5fd;">${escapeHtml(row.tt)}</td>
                        <td style="color: #cbd5e1; font-weight: 500;">${escapeHtml(row.nhom_ct)}</td>
                        <td style="font-weight: 700; color: #38bdf8;">${escapeHtml(row.ma_bsc)}</td>
                        <td title="${escapeHtml(row.title)}" style="color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <span class="gantt-tree-toggle" onclick="toggleGanttPackageCollapse('${row.ma_bsc}')" style="cursor: pointer;">${toggleIcon}</span>
                            <span style="font-weight: 700; color: #93c5fd;">${escapeHtml(row.title)}</span>
                        </td>
                        <td style="text-align: center; font-size: 0.78rem; font-weight: 600; color: #10b981;">${escapeHtml(row.startDateStr)}</td>
                        <td style="text-align: center; font-size: 0.78rem; font-weight: 600; color: #ef4444;">${escapeHtml(row.endDateStr)}</td>
                    </tr>
                `;
            } else if (row.type === 'child_work') {
                html += `
                    <tr class="row-child-gantt" style="background-color: rgba(56, 189, 248, 0.06); color: #ffffff;" data-row-idx="${idx}">
                        <td style="text-align: center; font-weight: 600; color: #cbd5e1;">${escapeHtml(row.tt)}</td>
                        <td style="color: #cbd5e1; font-weight: 500;">${escapeHtml(row.nhom_ct)}</td>
                        <td style="color: #38bdf8; font-weight: 600;">${escapeHtml(row.ma_bsc)}</td>
                        <td style="padding-left: 20px; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(row.title)}">
                            <span class="gantt-tree-toggle" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;"><i class="fa-solid fa-plus"></i></span>
                            <span style="color: #f1f5f9; font-weight: 600;">${escapeHtml(row.title)}</span>
                        </td>
                        <td style="text-align: center; font-size: 0.78rem; color: #34d399; font-weight: 600;">${escapeHtml(row.startDateStr)}</td>
                        <td style="text-align: center; font-size: 0.78rem; color: #f87171; font-weight: 600;">${escapeHtml(row.endDateStr)}</td>
                    </tr>
                `;
            } else if (row.type === 'level3_milestone') {
                html += `
                    <tr class="row-level3-gantt" style="background-color: rgba(15, 23, 42, 0.7); color: #94a3b8;" data-row-idx="${idx}">
                        <td style="text-align: center; font-size: 0.75rem; color: #94a3b8;">${escapeHtml(row.tt)}</td>
                        <td style="font-size: 0.75rem; color: #94a3b8;">${escapeHtml(row.nhom_ct)}</td>
                        <td style="font-size: 0.75rem; color: #38bdf8; font-weight: 500;">${escapeHtml(row.ma_bsc)}</td>
                        <td style="padding-left: 38px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(row.title)}">
                            <span style="color:${row.color}; font-weight:600; font-size: 0.8rem;">${escapeHtml(row.title)}</span>
                        </td>
                        <td style="text-align: center; font-size: 0.75rem; color: ${row.color}; font-weight: 600;">${escapeHtml(row.startDateStr)}</td>
                        <td style="text-align: center; font-size: 0.75rem; color: ${row.color}; font-weight: 600;">${escapeHtml(row.endDateStr)}</td>
                    </tr>
                `;
            }
        });

        html += `
                    </tbody>
                </table>
            </div>

            <div class="gantt-right-panel" id="gantt-right-scroll-pane">
                <svg class="gantt-svg" width="${ganttWidth}" height="${ganttHeight}">
                    <defs>
                        <marker id="gantt-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8" fill="#38bdf8" />
                        </marker>
                        <marker id="gantt-arrowhead-warn" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                            <polygon points="0 0, 8 4, 0 8" fill="#ef4444" />
                        </marker>
                    </defs>
                    ${buildGanttSvgContent(treeRows, minTime, maxTime, ganttWidth, ganttHeight, headerHeight, rowHeight, dayWidth)}
                </svg>
            </div>

            <div id="gantt-tooltip"></div>
        `;

        container.innerHTML = html;

        const leftPanel = container.querySelector('.gantt-left-panel');
        const rightPanel = container.querySelector('.gantt-right-panel');
        if (leftPanel && rightPanel) {
            rightPanel.addEventListener('scroll', () => { leftPanel.scrollTop = rightPanel.scrollTop; });
            leftPanel.addEventListener('scroll', () => { rightPanel.scrollTop = leftPanel.scrollTop; });
        }

        attachGanttInteractiveTooltips();
    }

    function buildGanttSvgContent(treeRows, minTime, maxTime, ganttWidth, ganttHeight, headerHeight, rowHeight, dayWidth) {
        let svg = '';
        svg += `<rect x="0" y="0" width="${ganttWidth}" height="${headerHeight}" class="gantt-header-bg" />`;
        const totalSpanMs = maxTime - minTime;

        let currDate = new Date(minTime);
        currDate.setDate(1);
        currDate.setHours(0,0,0,0);
        const endDateLimit = new Date(maxTime);

        while (currDate.getTime() <= endDateLimit.getTime()) {
            const monthStart = currDate.getTime();
            const monthName = `${currDate.getMonth() + 1}/${currDate.getFullYear().toString().substr(-2)}`;
            
            const nextMonth = new Date(currDate);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            
            const xStart = ((monthStart - minTime) / totalSpanMs) * ganttWidth;
            const xEnd = ((nextMonth.getTime() - minTime) / totalSpanMs) * ganttWidth;
            const monthWidth = Math.max(0, xEnd - xStart);

            svg += `
                <rect x="${xStart}" y="0" width="${monthWidth}" height="24" class="gantt-header-month-bg" />
                <text x="${xStart + (monthWidth / 2)}" y="17" class="gantt-header-month-text" text-anchor="middle">${monthName}</text>
                <line x1="${xStart}" y1="0" x2="${xStart}" y2="${ganttHeight}" class="gantt-grid-line-month" />
            `;

            // Draw vertical week division lines every 7 days (highly visible)
            let weekDate = new Date(currDate);
            while (weekDate.getTime() < nextMonth.getTime()) {
                const wX = ((weekDate.getTime() - minTime) / totalSpanMs) * ganttWidth;
                const dayOfMonth = weekDate.getDate();
                if (dayOfMonth > 1) {
                    svg += `
                        <text x="${wX + 2}" y="42" class="gantt-header-text" font-size="9" fill="#9ca3af">${dayOfMonth}</text>
                        <line x1="${wX}" y1="24" x2="${wX}" y2="${ganttHeight}" class="gantt-grid-line" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.2" stroke-dasharray="2,2" />
                    `;
                }
                weekDate.setDate(weekDate.getDate() + 7);
            }
            currDate = nextMonth;
        }

        const now = new Date().getTime();
        if (now >= minTime && now <= maxTime) {
            const todayX = ((now - minTime) / totalSpanMs) * ganttWidth;
            svg += `
                <line x1="${todayX}" y1="0" x2="${todayX}" y2="${ganttHeight}" class="gantt-today-line" />
                <text x="${todayX + 4}" y="16" class="gantt-today-text">HÔM NAY</text>
            `;
        }

        treeRows.forEach((row, idx) => {
            const y = headerHeight + (idx * rowHeight);
            svg += `<line x1="0" y1="${y + rowHeight}" x2="${ganttWidth}" y2="${y + rowHeight}" class="gantt-row-line" />`;

            if (row.type === 'grand_parent') {
                svg += `<rect x="0" y="${y}" width="${ganttWidth}" height="${rowHeight}" fill="rgba(245, 158, 11, 0.05)" />`;
            } else if (row.type === 'parent' || row.type === 'child_work') {
                if (row.startDate && row.endDate) {
                    const x1 = Math.max(0, ((row.startDate.getTime() - minTime) / totalSpanMs) * ganttWidth);
                    const x2 = Math.min(ganttWidth, ((row.endDate.getTime() - minTime) / totalSpanMs) * ganttWidth);
                    const width = Math.max(8, x2 - x1);
                    const barFill = row.type === 'parent' ? "#10b981" : "#38bdf8";
                    
                    svg += `
                        <rect x="${x1}" y="${y + 10}" width="${width}" height="18" fill="${barFill}" rx="4" ry="4" opacity="0.85"
                              data-tip="<b>${escapeHtml(row.title)}</b><br>Bắt đầu: ${formatGanttDateDMY(row.startDate)} ➔ Kết thúc: ${formatGanttDateDMY(row.endDate)}" style="cursor: pointer;" />
                    `;
                }
            } else if (row.type === 'level3_milestone') {
                if (row.date) {
                    const x = ((row.date.getTime() - minTime) / totalSpanMs) * ganttWidth;
                    svg += `
                        <path d="M ${x} ${y + 11} L ${x + 8} ${y + 19} L ${x} ${y + 27} L ${x - 8} ${y + 19} Z" 
                              fill="${row.color}" stroke="#ffffff" stroke-width="1.5"
                              data-tip="<b>${escapeHtml(row.title)}</b><br>Thời hạn KH: ${formatGanttDateDMY(row.date)}<br>Trạng thái: ${escapeHtml(row.status)}" style="cursor: pointer;" />
                        <text x="${x + 12}" y="${y + 23}" fill="${row.color}" font-size="10" font-weight="700">${formatGanttDateDM(row.date)}</text>
                    `;
                }
            }
        });

        return svg;
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

});
