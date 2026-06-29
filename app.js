/**
 * ERP CORE SYSTEM CONTROLLER & CALCULATIONS ENGINE
 * Implementing Real-time Rollups, Chokepoints, Gantt SVG, and AI Commands
 */

document.addEventListener("DOMContentLoaded", () => {
    // 1. STATE MANAGEMENT & INITIALIZATION
    let db = {};
    const defaultDb = window.INITIAL_DATABASE || { master: [], s01: [], s02: [], s03: [], s04: [], s05: [], danh_muc: {} };
    
    // View level and column sub-tabs state variables
    let activeLevel = "project"; // "project" (Cấp công trình) or "detail" (Cấp chi tiết)
    let activeSubtab = "cdt";    // "cdt", "cung_ung", "trien_khai", "khoi_cong", "ngan_sach", "thi_cong", "all"
    const expandedParents = new Set(); // Set of expanded parent IDs (Mã BSC / goi_thau_pl)
    let currentRole = "Admin";   // Active role: "Admin", "Supervisor", "Contractor", "Supply"

    // Helper to get system date formatted in GMT+7 (browser local time)
    function getSystemDateGMT7() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function loadDatabase() {
        const stored = localStorage.getItem("erp_db");
        if (stored) {
            try {
                db = JSON.parse(stored);
            } catch (e) {
                console.error("Error loading localStorage DB, resetting...", e);
                db = JSON.parse(JSON.stringify(defaultDb));
            }
        } else {
            db = JSON.parse(JSON.stringify(defaultDb));
        }
        sanitizeInitialData();
        saveDatabase(); // Persist the sanitized/healed database configuration
    }

    function saveDatabase() {
        localStorage.setItem("erp_db", JSON.stringify(db));
    }

    function resetDatabaseToFactory() {
        db = JSON.parse(JSON.stringify(defaultDb));
        saveDatabase();
        showToast("Hệ thống", "Đã đặt lại toàn bộ Cơ sở dữ liệu về trạng thái ban đầu.", "success");
        initApp();
    }

    function restructureMasterData(masterArray) {
        if (!masterArray || masterArray.length === 0) return [];
        
        const packages = [];
        let currentPackage = null;
        
        masterArray.forEach(row => {
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
                    packages.push({
                        parent: row,
                        children: []
                    });
                }
            }
        });

        packages.forEach(pkg => {
            let parentGroup = String(pkg.parent.nhom_ct || "").trim();
            
            // Standardize business serving group
            if (["9", "10", "11", "12"].includes(String(pkg.parent.ma_bsc)) || String(pkg.parent.hang_muc_work).includes("KD-")) {
                parentGroup = "Công trình phục vụ KD";
                pkg.parent.nhom_ct = parentGroup;
            }
            
            pkg.children.forEach(child => {
                child.nhom_ct = parentGroup;
            });
        });

        const groupOrder = {
            "Hạ tầng kỹ thuật": 1,
            "Công trình phục vụ KD": 2,
            "Công trình phục vụ kinh doanh": 2,
            "Xây dựng dân dụng": 3,
            "Công trình dân dụng": 3
        };

        function getGroupOrderValue(groupName) {
            return groupOrder[groupName] || 99;
        }

        packages.forEach((pkg, index) => {
            pkg.originalIndex = index;
        });

        packages.sort((a, b) => {
            const orderA = getGroupOrderValue(a.parent.nhom_ct);
            const orderB = getGroupOrderValue(b.parent.nhom_ct);
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return a.originalIndex - b.originalIndex;
        });

        const newMasterList = [];
        let parentCount = 0;
        
        packages.forEach(pkg => {
            parentCount++;
            pkg.parent.tt = parentCount;
            newMasterList.push(pkg.parent);
            
            pkg.children.forEach((child, childIdx) => {
                child.tt = `${parentCount}.${childIdx + 1}`;
                newMasterList.push(child);
            });
        });

        return newMasterList;
    }

    // Ensure all numeric values are clean and sub-tables have proper structure
    function sanitizeInitialData() {
        if (!db.master) db.master = [];
        else db.master = restructureMasterData(db.master);

        if (!db.s01) db.s01 = [];
        if (!db.s02) db.s02 = [];
        if (!db.s03) db.s03 = [];
        if (!db.s04) db.s04 = [];
        if (!db.s05) db.s05 = [];
        if (!db.nhan_su) {
            db.nhan_su = defaultDb.nhan_su || [];
        } else if (defaultDb.nhan_su) {
            defaultDb.nhan_su.forEach(defaultNs => {
                const exists = db.nhan_su.some(ns => String(ns.email).toLowerCase().trim() === String(defaultNs.email).toLowerCase().trim());
                if (!exists) {
                    db.nhan_su.push(defaultNs);
                }
            });
        }
        if (!db.danh_muc) db.danh_muc = {};
        if (defaultDb.danh_muc) {
            for (const key in defaultDb.danh_muc) {
                if (!db.danh_muc[key] || db.danh_muc[key].length === 0) {
                    db.danh_muc[key] = defaultDb.danh_muc[key];
                }
            }
        }
        
        // Ensure every personnel member has a password and Proper CRUD flags
        db.nhan_su.forEach(ns => {
            const nameLower = String(ns.ho_ten || "").toLowerCase().trim();
            if (nameLower.includes("nguyễn đình hùng") || nameLower.includes("nguyen dinh hung")) {
                ns.quyen = "Admin";
                ns.quyen_them = true;
                ns.quyen_sua = true;
                ns.quyen_xoa = true;
                ns.vai_tro = "Cán bộ quản lý (Admin)";
            }

            if (!ns.mat_khau) ns.mat_khau = "123456";
            if (ns.quyen_them === undefined) {
                if (ns.quyen === 'Admin') ns.quyen_them = true;
                else if (ns.quyen === 'Supervisor') ns.quyen_them = false;
                else if (ns.quyen === 'Contractor') ns.quyen_them = true;
                else ns.quyen_them = false;
            }
            if (ns.quyen_sua === undefined) ns.quyen_sua = true;
            if (ns.quyen_xoa === undefined) {
                if (ns.quyen === 'Admin' || ns.quyen === 'Contractor') ns.quyen_xoa = true;
                else ns.quyen_xoa = false;
            }
        });

        // Add unique ID counters if not present
        db.s03.forEach((item, index) => {
            if (!item['Mã PS']) item['Mã PS'] = `PS.CT01.${String(index + 1).padStart(2, '0')}`;
        });
        db.s04.forEach((item, index) => {
            if (!item['Mã YC']) item['Mã YC'] = `YC.CT01.${String(index + 1).padStart(2, '0')}`;
        });
    }

    // 2. REAL-TIME CALCULATION ENGINE & ROLLUPS (Real-time Roll-up)
    // Runs automatically in < 50ms upon any state change
    function calculateRollups() {
        // Map to quickly find parent packages by index/Mã BSC
        const parents = {};
        db.master.forEach(row => {
            const bsc = String(row.ma_bsc || "").trim();
            if (bsc !== "") {
                parents[bsc] = row;
            }
        });

        // Step A: Calculate parent package rollups from their sub-items (hierarchical rollup)
        // Group sub-rows by their parent TT prefix. e.g. "2.1", "2.2" -> parent "2"
        const subItemsGrouped = {};
        db.master.forEach(row => {
            const tt = String(row.tt || "");
            if (tt.includes(".")) {
                const parentPrefix = tt.split(".")[0];
                if (!subItemsGrouped[parentPrefix]) subItemsGrouped[parentPrefix] = [];
                subItemsGrouped[parentPrefix].push(row);
            }
        });

        // Rollup sub-items budget and contract values to parent row
        db.master.forEach(row => {
            const tt = String(row.tt || "");
            if (subItemsGrouped[tt]) {
                // Parent row budget is sum of sub budgets
                const sumBudget = subItemsGrouped[tt].reduce((sum, sub) => sum + parseFloat(sub.ngan_sach || 0), 0);
                row.ngan_sach = sumBudget > 0 ? sumBudget : "";

                // Parent row contract value is sum of sub contract values
                const sumContract = subItemsGrouped[tt].reduce((sum, sub) => sum + parseFloat(sub.gia_tri_hdcu || 0), 0);
                row.gia_tri_hdcu = sumContract > 0 ? sumContract : "";

                // Rollup monthly & weekly plan/actual monetary values to parent row
                const fieldsToRollup = [
                    "qa_kh_klcv_thang", "qa_kq_klcv_thang",
                    "t1_kh", "t1_kq",
                    "t2_kh", "t2_kq",
                    "t3_kh", "t3_kq",
                    "t4_kh", "t4_kq"
                ];
                fieldsToRollup.forEach(field => {
                    const sum = subItemsGrouped[tt].reduce((s, sub) => s + parseFloat(sub[field] || 0), 0);
                    row[field] = sum > 0 ? sum : "";
                });
            }
        });

        // Step B: Calculate rollups from Sổ nghiệp vụ (01-05) referencing Mã BSC
        db.master.forEach(row => {
            const bsc = String(row.ma_bsc || "").trim();
            if (bsc === "") {
                // If it is a sub-item, we clean its fields
                row.luy_ke_ab = "";
                row.luy_ke_bb = "";
                row.luy_ke_tong_chi_phi = "";
                
                // Keep percentage calculations for sub-items
                const ns = parseFloat(row.ngan_sach || 0);
                const hd = parseFloat(row.gia_tri_hdcu || 0);
                row.percent_hdcu_ns = ns > 0 ? (hd / ns) : 0;
                return;
            }

            // 1. Lũy kế HĐ A-B is equal to its contract value (which could be rolled up from sub-items)
            const contractVal = parseFloat(row.gia_tri_hdcu || 0);
            row.luy_ke_ab = contractVal;

            // 2. Lũy kế Phát sinh B-B' = sum of approved Sổ 03 variations matching this BSC
            const variations = db.s03
                .filter(v => String(v['Mã BSC']).trim() === bsc && v['TT duyệt'] === 'Đã duyệt')
                .reduce((sum, v) => sum + parseFloat(v['Giá trị (tỷ)'] || 0), 0);
            row.luy_ke_bb = variations;

            // 3. Lũy kế Tổng chi phí = Lũy kế A-B + Lũy kế Phát sinh B-B'
            row.luy_ke_tong_chi_phi = row.luy_ke_ab + row.luy_ke_bb;

            // 4. Percentage of budget used
            const budgetVal = parseFloat(row.ngan_sach || 0);
            row.percent_hdcu_ns = budgetVal > 0 ? (row.luy_ke_tong_chi_phi / budgetVal) : 0;

            // 5. Rollup count fields for display columns in Master Grid:
            // Sổ 01: HS tiền KC (duyệt)
            const s01Duyet = db.s01.filter(s => String(s['Mã BSC']).trim() === bsc && s['TT duyệt'] === 'Đã duyệt').length;
            row.hs_tien_kc_duyet = s01Duyet;

            // Sổ 02: Tài liệu KH tháng (duyệt/tổng)
            const s02Total = db.s02.filter(s => String(s['Mã BSC']).trim() === bsc).length;
            const s02Duyet = db.s02.filter(s => String(s['Mã BSC']).trim() === bsc && s['TT duyệt'] === 'Đã duyệt').length;
            row.tai_lieu_kh_thang = `${s02Duyet}/${s02Total}`;

            // Sổ 03: Phát sinh chưa duyệt
            const s03Pending = db.s03.filter(s => String(s['Mã BSC']).trim() === bsc && s['TT duyệt'] === 'Chờ duyệt').length;
            row.phat_sinh_chua_duyet = s03Pending;

            // Sổ 04: YC cung ứng chờ duyệt
            const s04Pending = db.s04.filter(s => String(s['Mã BSC']).trim() === bsc && s['TT duyệt'] === 'Chờ duyệt').length;
            row.yc_cung_ung_cho_duyet = s04Pending;

            // Sổ 05: Bù tiến độ đang chạy
            const s05Active = db.s05.filter(s => String(s['Mã BSC']).trim() === bsc && s['TT thực hiện'] === 'Đang thực hiện').length;
            row.bu_tien_do_dang_chay = s05Active;

            // 6. Automatically calculate Chốt chặn Điều kiện Khởi công
            // ĐK1 HSKT đủ = (K6="Đang phát hành" or K6="Hoàn thiện") and M6="Đã bàn giao"
            const hstktc = String(row.tt_hstktc).trim();
            const boq = String(row.tt_boq_kl).trim();
            const dk1 = (hstktc === 'Hoàn thiện' || hstktc === 'Đã phát hành') && boq === 'Đã bàn giao';
            row.dk1_hskt = dk1 ? '✔' : '✘';

            // ĐK2 HĐCU ký = Q6="Đã CU"
            const hdcu = String(row.tt_ky_hdcu).trim();
            const dk2 = hdcu === 'Đã CU';
            row.dk2_hdcu = dk2 ? '✔' : '✘';

            // ĐK3 KHTK duyệt = Y6="Đã duyệt"
            const khtk = String(row.tt_khtk).trim();
            const dk3 = khtk === 'Đã duyệt';
            row.dk3_khtk = dk3 ? '✔' : '✘';

            // ĐIỀU KIỆN ĐỦ = AND(DK1, DK2, DK3)
            if (dk1 && dk2 && dk3) {
                row.dieu_kien_du = 'ĐỦ ĐK KHỞI CÔNG';
            } else {
                row.dieu_kien_du = 'THIẾU ĐK';
            }
        });

        // Trigger alarms for budget alerts
        checkFinancialHardGates();
    }

    // 3. OPERATIONAL EXCELLENCE CHOKEPOINTS (Chốt chặn Vận hành)
    const activeAlarms = new Set();
    
    function checkFinancialHardGates() {
        db.master.forEach(row => {
            const bsc = String(row.ma_bsc || "").trim();
            if (bsc === "") return;

            const totalCost = parseFloat(row.luy_ke_tong_chi_phi || 0);
            const budget = parseFloat(row.ngan_sach || 0);
            
            if (budget > 0 && (totalCost / budget) > 0.95) {
                if (!activeAlarms.has(bsc)) {
                    activeAlarms.add(bsc);
                    // Trigger alert notification once
                    showToast(
                        "CẢNH BÁO KHẨN CẤP (C-Level)", 
                        `Gói thầu ${bsc} (${row.hang_muc_work}) đạt tổng chi phí ${totalCost.toFixed(2)} tỷ, vượt quá 95% ngân sách (${budget.toFixed(2)} tỷ). ĐÃ KHÓA PHÊ DUYỆT PHÁT SINH MỚI!`, 
                        "danger"
                    );
                }
            } else {
                activeAlarms.delete(bsc);
            }
        });
    }

    // Checking if a package is locked due to budget overrun
    function isPackageLocked(bsc) {
        bsc = String(bsc).trim();
        const pRow = db.master.find(r => String(r.ma_bsc).trim() === bsc);
        if (!pRow) return false;
        
        const totalCost = parseFloat(pRow.luy_ke_tong_chi_phi || 0);
        const budget = parseFloat(pRow.ngan_sach || 0);
        return budget > 0 && (totalCost / budget) > 0.95;
    }

    // 4. SPA TAB SYSTEM NAVIGATION
    const navItems = document.querySelectorAll(".nav-item");
    const tabPanes = document.querySelectorAll(".tab-pane");

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const tabId = item.getAttribute("data-tab");
            
            navItems.forEach(nav => nav.classList.remove("active"));
            item.classList.add("active");

            tabPanes.forEach(pane => pane.classList.remove("active"));
            document.getElementById(`tab-${tabId}`).classList.add("active");

            // Update header title and desc
            const tabTitle = item.textContent.trim();
            document.getElementById("active-tab-title").textContent = tabTitle;
            
            let desc = "Quản lý vòng đời triển khai chi tiết hạng mục thi công";
            if (tabId === 'dashboard') desc = "Tổng hợp chỉ số sức khoẻ tài chính & tiến độ đường găng toàn dự án";
            if (tabId === 'master') desc = "Bảng điều hành xương sống, chốt chặn điều kiện khởi công";
            if (tabId === 'ai-center') desc = "Trí tuệ nhân tạo Gemini phân tích sức khoẻ dự án và đọc tờ trình tự động";
            if (tabId === 'personnel') desc = "Quản lý danh sách nhân sự, vai trò nhiệm vụ và phân quyền truy cập hệ thống";
            document.getElementById("active-tab-desc").textContent = desc;

            // Render matching tabs
            if (tabId === 'dashboard') renderDashboard();
            if (tabId === 'master') renderMasterGrid();
            if (tabId === 's01') renderS01();
            if (tabId === 's02') renderS02();
            if (tabId === 's03') renderS03();
            if (tabId === 's04') renderS04();
            if (tabId === 's05') renderS05();
            if (tabId === 'personnel') renderPersonnel();
        });
    });

    // 4.1 LOGIN & SESSION MANAGEMENT
    let currentUser = null;

    function checkUserSession() {
        const storedUser = sessionStorage.getItem("current_user");
        if (storedUser) {
            try {
                currentUser = JSON.parse(storedUser);
                currentRole = currentUser.quyen;
                applyUserSession();
            } catch (e) {
                showLoginOverlay();
            }
        } else {
            showLoginOverlay();
        }
    }

    function showLoginOverlay() {
        // Populate select list with registered emails
        const selectEl = document.getElementById("login-email-select");
        if (selectEl) {
            selectEl.innerHTML = db.nhan_su.map(ns => `<option value="${ns.email}">${ns.ho_ten} (${ns.vai_tro})</option>`).join("");
        }
        document.getElementById("login-screen").style.display = "flex";
    }

    function hideLoginOverlay() {
        document.getElementById("login-screen").style.display = "none";
    }

    function handleLoginSubmit() {
        const email = document.getElementById("login-email-select").value;
        const pass = document.getElementById("login-password-input").value.trim();
        
        const user = db.nhan_su.find(ns => String(ns.email).trim().toLowerCase() === String(email).trim().toLowerCase());
        if (!user) {
            showToast("Đăng nhập", "Tài khoản không tồn tại trên hệ thống!", "danger");
            return;
        }
        
        if (user.mat_khau !== pass) {
            showToast("Đăng nhập", "Mật khẩu không đúng. Vui lòng thử lại! (Mặc định: 123456)", "danger");
            return;
        }
        
        // Successful login
        currentUser = user;
        currentRole = user.quyen;
        sessionStorage.setItem("current_user", JSON.stringify(user));
        
        hideLoginOverlay();
        applyUserSession();
        
        // Reset password input
        document.getElementById("login-password-input").value = "";
        
        showToast("Đăng nhập", `Chào mừng ${user.ho_ten} quay trở lại làm việc!`, "success");
        
        // Trigger dashboard re-render
        renderDashboard();
    }

    function handleLogout() {
        currentUser = null;
        currentRole = null;
        sessionStorage.removeItem("current_user");
        showToast("Hệ thống", "Bạn đã đăng xuất khỏi phiên làm việc.", "info");
        showLoginOverlay();
    }

    function applyUserSession() {
        if (!currentUser) return;
        
        // Update header user profiles
        const nameEl = document.getElementById("user-display-name");
        const roleEl = document.getElementById("user-display-role");
        const avatarEl = document.getElementById("user-avatar-initial");
        
        if (nameEl) nameEl.textContent = currentUser.ho_ten;
        if (roleEl) roleEl.textContent = `${currentUser.vai_tro} (${currentUser.phong_ban})`;
        
        if (avatarEl) {
            const initials = currentUser.ho_ten.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }
        
        // Auto refresh permissions on current active view
        const activeNav = document.querySelector(".nav-menu .nav-item.active");
        if (activeNav) {
            const tabId = activeNav.getAttribute("data-tab");
            if (tabId === 'dashboard') renderDashboard();
            if (tabId === 'master') renderMasterGrid();
            if (tabId === 's01') renderS01();
            if (tabId === 's02') renderS02();
            if (tabId === 's03') renderS03();
            if (tabId === 's04') renderS04();
            if (tabId === 's05') renderS05();
            if (tabId === 'personnel') renderPersonnel();
        }
    }

    // Bind login elements
    const submitLoginBtn = document.getElementById("btn-submit-login");
    if (submitLoginBtn) {
        submitLoginBtn.addEventListener("click", handleLoginSubmit);
    }
    const passInput = document.getElementById("login-password-input");
    if (passInput) {
        passInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") handleLoginSubmit();
        });
    }
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }

    document.getElementById("open-settings-btn").addEventListener("click", () => {
        // Go to settings tab
        navItems.forEach(nav => nav.classList.remove("active"));
        tabPanes.forEach(pane => pane.classList.remove("active"));
        document.getElementById("tab-settings").classList.add("active");
        document.getElementById("active-tab-title").textContent = "Cấu Hình Hệ Thống";
        document.getElementById("active-tab-desc").textContent = "Cấu hình API Key và đặt lại dữ liệu";
    });

    // 5. RENDER EXECUTIVES DASHBOARD (KPI, Gantt, Towers)
    function renderDashboard() {
        calculateRollups();
        
        // 1. KPI Values
        let totalBudget = 0;
        let totalContract = 0;
        let totalVariations = 0;
        let totalDelayDays = 0;
        let delayedPackagesCount = 0;

        db.master.forEach(row => {
            // Only count parent packages (non-empty ma_bsc) to avoid double counting
            if (String(row.ma_bsc || "").trim() !== "") {
                totalBudget += parseFloat(row.ngan_sach || 0);
                totalContract += parseFloat(row.luy_ke_ab || 0);
                totalVariations += parseFloat(row.luy_ke_bb || 0);
            }
        });

        db.s05.forEach(d => {
            if (d['TT thực hiện'] !== 'Đã hoàn thành') {
                totalDelayDays += parseInt(d['Mức chậm (ngày)'] || 0);
                delayedPackagesCount++;
            }
        });

        document.getElementById("kpi-total-budget").textContent = totalBudget.toFixed(2) + " tỷ";
        document.getElementById("kpi-total-contract").textContent = totalContract.toFixed(2) + " tỷ";
        document.getElementById("kpi-total-variations").textContent = totalVariations.toFixed(2) + " tỷ";

        // Calculate dashboard system overview status counts dynamically
        let totalMonitored = 0;
        let redAlerts = 0;
        let orangeAlerts = 0;
        let yellowAlerts = 0;
        let normalAlerts = 0;

        db.master.forEach(row => {
            const bsc = String(row.ma_bsc || "").trim();
            // Count unique parent packages
            if (bsc !== "" && row.goi_thau_pl) {
                totalMonitored++;
                
                // Find delays in s05
                const delays = db.s05.filter(d => String(d['Mã BSC']).trim() === bsc && d['TT thực hiện'] === 'Đang thực hiện');
                const maxDelay = delays.length > 0 ? Math.max(...delays.map(d => parseInt(d['Mức chậm (ngày)'] || 0))) : 0;

                const dk = row.dieu_kien_du || 'THIẾU ĐK';
                if (dk === 'THIẾU ĐK') {
                    redAlerts++;
                } else {
                    if (maxDelay > 5) {
                        orangeAlerts++;
                    } else if (maxDelay > 0) {
                        yellowAlerts++;
                    } else {
                        normalAlerts++;
                    }
                }
            }
        });

        // Set text content
        const elTotal = document.getElementById("dashboard-total-monitored");
        const elRed = document.getElementById("dashboard-red-alerts");
        const elOrange = document.getElementById("dashboard-orange-alerts");
        const elYellow = document.getElementById("dashboard-yellow-alerts");
        const elNormal = document.getElementById("dashboard-normal");

        if (elTotal) elTotal.textContent = totalMonitored;
        if (elRed) elRed.textContent = redAlerts;
        if (elOrange) elOrange.textContent = orangeAlerts;
        if (elYellow) elYellow.textContent = yellowAlerts;
        if (elNormal) elNormal.textContent = normalAlerts;
        
        const variationPct = totalBudget > 0 ? (totalVariations / totalBudget * 100) : 0;
        document.getElementById("kpi-variation-percentage").innerHTML = `<i class="fa-solid fa-calculator"></i> ${variationPct.toFixed(1)}% ngân sách gốc`;

        document.getElementById("kpi-total-delays").textContent = totalDelayDays + " ngày";
        document.getElementById("kpi-delay-alert-count").textContent = `${delayedPackagesCount} gói thầu đang xử lý chậm trễ`;

        // 2. Budget Alarm Badge
        const alarmBadge = document.getElementById("budget-alarm-badge");
        if (activeAlarms.size > 0) {
            alarmBadge.style.display = "inline-flex";
            alarmBadge.textContent = `${activeAlarms.size} CẢNH BÁO PHÁT SINH ĐỎ`;
        } else {
            alarmBadge.style.display = "none";
        }

        // 3. Render SVG Gantt Chart
        renderGanttChart();

        // 4. Render Budget Towers
        renderBudgetTowers();
    }

    function renderGanttChart() {
        const container = document.getElementById("gantt-chart-container");
        container.innerHTML = ""; // Clear

        // Extract parent packages that have schedule dates
        const schedulePackages = db.master.filter(r => 
            String(r.ma_bsc || "").trim() !== "" && r.ngay_bd_yc && r.ngay_kt_yc
        );

        if (schedulePackages.length === 0) {
            container.innerHTML = `<div style="padding:40px; text-align:center; color: var(--text-muted);">Không có dữ liệu tiến độ kế hoạch.</div>`;
            return;
        }

        // Find min and max dates to scale the chart
        let minTime = Infinity;
        let maxTime = -Infinity;

        schedulePackages.forEach(p => {
            const planStart = new Date(p.ngay_bd_yc).getTime();
            const planEnd = new Date(p.ngay_kt_yc).getTime();
            
            // Get delays for this package
            const delayDays = db.s05
                .filter(d => String(d['Mã BSC']).trim() === String(p.ma_bsc).trim() && d['TT thực hiện'] !== 'Đã hoàn thành')
                .reduce((sum, d) => sum + parseInt(d['Mức chậm (ngày)'] || 0), 0);

            const actualStart = p.ngay_bd_khoi_cong ? new Date(p.ngay_bd_khoi_cong).getTime() : planStart;
            const actualEnd = planEnd + (delayDays * 24 * 60 * 60 * 1000);

            minTime = Math.min(minTime, planStart, actualStart);
            maxTime = Math.max(maxTime, planEnd, actualEnd);
        });

        // Add padding to dates (1 month buffer)
        minTime -= 15 * 24 * 60 * 60 * 1000;
        maxTime += 30 * 24 * 60 * 60 * 1000;

        const totalWidth = container.clientWidth || 800;
        const rowHeight = 45;
        const headerHeight = 40;
        const totalHeight = headerHeight + (schedulePackages.length * rowHeight);
        
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "gantt-svg");
        svg.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
        svg.setAttribute("height", totalHeight);

        // Draw vertical grid lines & month labels
        const startYear = new Date(minTime).getFullYear();
        const startMonth = new Date(minTime).getMonth();
        const endYear = new Date(maxTime).getFullYear();
        const endMonth = new Date(maxTime).getMonth();
        
        let currentDate = new Date(startYear, startMonth, 1);
        const monthPositions = [];

        while (currentDate.getTime() <= maxTime) {
            const time = currentDate.getTime();
            const x = ((time - minTime) / (maxTime - minTime)) * (totalWidth - 240) + 220;
            
            if (x >= 220 && x <= totalWidth) {
                monthPositions.push({ x, label: `${currentDate.getMonth() + 1}/${currentDate.getFullYear().toString().substr(-2)}` });
            }
            
            // Go to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        // Draw header background
        const headerBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        headerBg.setAttribute("x", 0);
        headerBg.setAttribute("y", 0);
        headerBg.setAttribute("width", totalWidth);
        headerBg.setAttribute("height", headerHeight);
        headerBg.setAttribute("fill", "rgba(22, 28, 40, 0.6)");
        svg.appendChild(headerBg);

        // Month Labels and Grid Lines
        monthPositions.forEach(m => {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", m.x);
            line.setAttribute("y1", 0);
            line.setAttribute("x2", m.x);
            line.setAttribute("y2", totalHeight);
            line.setAttribute("class", "gantt-grid-line");
            svg.appendChild(line);

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", m.x + 5);
            text.setAttribute("y", 25);
            text.setAttribute("class", "gantt-header-text");
            text.textContent = m.label;
            svg.appendChild(text);
        });

        // Today Line (Simulating June 28, 2026)
        const todayTime = new Date("2026-06-28").getTime();
        const todayX = ((todayTime - minTime) / (maxTime - minTime)) * (totalWidth - 240) + 220;
        if (todayX >= 220 && todayX <= totalWidth) {
            const todayLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            todayLine.setAttribute("x1", todayX);
            todayLine.setAttribute("y1", 0);
            todayLine.setAttribute("x2", todayX);
            todayLine.setAttribute("y2", totalHeight);
            todayLine.setAttribute("class", "gantt-today-line");
            svg.appendChild(todayLine);

            const todayText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            todayText.setAttribute("x", todayX + 5);
            todayText.setAttribute("y", 12);
            todayText.setAttribute("class", "gantt-today-text");
            todayText.textContent = "HÔM NAY";
            svg.appendChild(todayText);
        }

        // Draw rows
        schedulePackages.forEach((p, idx) => {
            const y = headerHeight + (idx * rowHeight);

            // Row background line
            const rowLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            rowLine.setAttribute("x1", 0);
            rowLine.setAttribute("y1", y + rowHeight);
            rowLine.setAttribute("x2", totalWidth);
            rowLine.setAttribute("y2", y + rowHeight);
            rowLine.setAttribute("stroke", "var(--border-color)");
            rowLine.setAttribute("stroke-width", "0.5");
            svg.appendChild(rowLine);

            // Package text label
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", 15);
            text.setAttribute("y", y + 25);
            text.setAttribute("class", "gantt-text");
            text.textContent = String(p.ma_bsc);
            
            const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
            title.textContent = `[${p.ma_bsc}] ${p.hang_muc_work}`;
            text.appendChild(title);
            svg.appendChild(text);

            // Process Plan & Actual Bars
            const planStart = new Date(p.ngay_bd_yc).getTime();
            const planEnd = new Date(p.ngay_kt_yc).getTime();
            
            const delayDays = db.s05
                .filter(d => String(d['Mã BSC']).trim() === String(p.ma_bsc).trim() && d['TT thực hiện'] !== 'Đã hoàn thành')
                .reduce((sum, d) => sum + parseInt(d['Mức chậm (ngày)'] || 0), 0);

            const actualStart = p.ngay_bd_khoi_cong ? new Date(p.ngay_bd_khoi_cong).getTime() : planStart;
            const actualEnd = planEnd + (delayDays * 24 * 60 * 60 * 1000);

            const xPlan = ((planStart - minTime) / (maxTime - minTime)) * (totalWidth - 240) + 220;
            const wPlan = ((planEnd - planStart) / (maxTime - minTime)) * (totalWidth - 240);

            const xActual = ((actualStart - minTime) / (maxTime - minTime)) * (totalWidth - 240) + 220;
            const wActual = ((actualEnd - actualStart) / (maxTime - minTime)) * (totalWidth - 240);

            // Planned Bar (Upper)
            const planBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            planBar.setAttribute("x", xPlan);
            planBar.setAttribute("y", y + 10);
            planBar.setAttribute("width", Math.max(wPlan, 4));
            planBar.setAttribute("height", 8);
            planBar.setAttribute("class", "gantt-bar-plan");
            
            const planTip = document.createElementNS("http://www.w3.org/2000/svg", "title");
            planTip.textContent = `Kế hoạch: ${p.ngay_bd_yc} -> ${p.ngay_kt_yc}`;
            planBar.appendChild(planTip);
            svg.appendChild(planBar);

            // Actual Bar (Lower)
            const actualBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            actualBar.setAttribute("x", xActual);
            actualBar.setAttribute("y", y + 23);
            actualBar.setAttribute("width", Math.max(wActual, 4));
            actualBar.setAttribute("height", 12);
            
            let statusClass = "gantt-bar-actual on-track";
            if (delayDays > 5) {
                statusClass = "gantt-bar-actual delayed";
            } else if (delayDays > 0) {
                statusClass = "gantt-bar-actual"; // Yellow
            }
            actualBar.setAttribute("class", statusClass);
            
            const actTip = document.createElementNS("http://www.w3.org/2000/svg", "title");
            actTip.textContent = `Thực tế: ${p.ngay_bd_khoi_cong || 'Chưa khởi công'} -> Dự kiến hoàn thành: ${new Date(actualEnd).toLocaleDateString('vi-VN')} (Chậm ${delayDays} ngày)`;
            actualBar.appendChild(actTip);
            svg.appendChild(actualBar);
        });

        container.appendChild(svg);
    }

    function renderBudgetTowers() {
        const list = document.getElementById("budget-tower-list-container");
        list.innerHTML = ""; // Clear

        const packages = db.master.filter(r => String(r.ma_bsc || "").trim() !== "");
        
        packages.forEach(p => {
            const total = parseFloat(p.luy_ke_tong_chi_phi || 0);
            const budget = parseFloat(p.ngan_sach || 0);
            
            let pct = 0;
            let barClass = "safe";
            
            if (budget > 0) {
                pct = (total / budget) * 100;
                if (pct > 95) barClass = "danger";
                else if (pct > 85) barClass = "warning";
            }

            const item = document.createElement("div");
            item.className = "budget-tower-item";
            
            item.innerHTML = `
                <div class="budget-tower-info">
                    <span class="budget-tower-bsc">${p.ma_bsc} - ${p.hang_muc_work}</span>
                    <span class="budget-tower-values">${total.toFixed(2)} tỷ / ${budget.toFixed(2)} tỷ (${pct.toFixed(1)}%)</span>
                </div>
                <div class="budget-tower-bar-container">
                    <div class="budget-tower-bar-fill ${barClass}" style="width: ${Math.min(pct, 100)}%;"></div>
                </div>
            `;
            list.appendChild(item);
        });
    }

    // 6. BẢNG TỔNG HỢP MASTER GRID RENDERER (DYNAMIC COLUMNS & MULTI-TAB STRUCTURE)
    let editRowIndex = -1; // Index of row being edited

    const SUBTAB_COLUMNS = {
        cdt: {
            title: "A. Đầu vào CĐT (Tiến độ - Ngân sách - HSKT)",
            headers: ["TT", "Nhóm Công Trình", "Mã BSC", "Hạng Mục / Công Việc", "Phụ Trách", "Ngày BĐ (YC)", "Ngày KT (YC)", "Ngân Sách (tỷ)", "KH HSTKTC", "TT HSTKTC", "TT SPECS", "TT BOQ/KL", "Thao Tác"],
            fields: ["tt", "nhom_ct", "ma_bsc", "hang_muc_work", "phu_trach", "ngay_bd_yc", "ngay_kt_yc", "ngan_sach", "kh_phat_hang_hstktc", "tt_hstktc", "tt_specs", "tt_boq_kl"]
        },
        cung_ung: {
            title: "B. Cung ứng & Hợp đồng",
            headers: ["TT", "Mã BSC", "Hạng Mục / Công Việc", "KH LCNT", "TT LCNT", "KH Ký HĐCU", "TT Ký HĐCU", "KH PD KHCU", "TT KHCU", "Giá Trị HĐCU (tỷ)", "% HĐCU/NS", "Thao Tác"],
            fields: ["tt", "ma_bsc", "hang_muc_work", "kh_lcnt", "tt_lcnt", "kh_ky_hdcu", "tt_ky_hdcu", "kh_pd_khcu", "tt_khcu", "gia_tri_hdcu", "percent_hdcu_ns"]
        },
        trien_khai: {
            title: "C. Kế hoạch Triển khai",
            headers: ["TT", "Mã BSC", "Hạng Mục / Công Việc", "KH Ký PLHĐ CĐT", "TT Ký PLHĐ CĐT", "KH PD KHTK", "TT KHTK", "Thao Tác"],
            fields: ["tt", "ma_bsc", "hang_muc_work", "kh_ky_plhd_cdt", "tt_ky_plhd_cdt", "kh_pd_khtk", "tt_khtk"]
        },
        khoi_cong: {
            title: "D. Chốt Chặn Khởi Công",
            headers: ["TT", "Mã BSC", "Hạng Mục / Công Việc", "ĐK1 HSKT", "ĐK2 HĐCU", "ĐK3 KHTK", "ĐIỀU KIỆN ĐỦ", "NGÀY BĐ KHỞI CÔNG", "Thao Tác"],
            fields: ["tt", "ma_bsc", "hang_muc_work", "dk1_hskt", "dk2_hdcu", "dk3_khtk", "dieu_kien_du", "ngay_bd_khoi_cong"]
        },
        ngan_sach: {
            title: "E. Ngân sách & Chi phí",
            headers: ["TT", "Mã BSC", "Hạng Mục / Công Việc", "Ngân Sách (tỷ)", "Lũy Kế HĐ A-B (tỷ)", "Lũy Kế Phát Sinh B-B' (tỷ)", "Lũy Kế Tổng Chi Phí (tỷ)", "Thao Tác"],
            fields: ["tt", "ma_bsc", "hang_muc_work", "ngan_sach", "luy_ke_ab", "luy_ke_bb", "luy_ke_tong_chi_phi"]
        },
        thi_cong: {
            title: "G. Quản lý Thi công",
            headers: ["TT", "Mã BSC", "Hạng Mục / Công Việc", "KH KLCV Tháng", "KQ KLCV Tháng", "Đánh giá & giải pháp tháng", "T1 KH", "T1 KQ", "T1 Đánh giá", "T2 KH", "T2 KQ", "T2 Đánh giá", "T3 KH", "T3 KQ", "T3 Đánh giá", "T4 KH", "T4 KQ", "T4 Đánh giá", "Thao Tác"],
            fields: ["tt", "ma_bsc", "hang_muc_work", "qa_kh_klcv_thang", "qa_kq_klcv_thang", "qa_danh_gia_thang", "t1_kh", "t1_kq", "t1_dg", "t2_kh", "t2_kq", "t2_dg", "t3_kh", "t3_kq", "t3_dg", "t4_kh", "t4_kq", "t4_dg"]
        },
        all: {
            title: "Tất cả dữ liệu",
            headers: [], // Handled by double-row header
            fields: []
        }
    };

    function renderMasterGrid() {
        calculateRollups();
        
        // Show/hide Add Package button based on quyen_them
        const btnAddPkg = document.getElementById("btn-add-package");
        if (btnAddPkg) {
            const hasAddAccess = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_them);
            btnAddPkg.style.display = hasAddAccess ? 'inline-block' : 'none';
        }

        const thead = document.getElementById("master-grid-thead");
        const tbody = document.getElementById("master-grid-tbody");
        thead.innerHTML = "";
        tbody.innerHTML = "";

        const search = document.getElementById("master-search-input").value.toLowerCase();
        const groupFilter = document.getElementById("master-filter-group").value;

        // A. Render Table Headers
        const config = SUBTAB_COLUMNS[activeSubtab];
        if (activeSubtab !== 'all') {
            const tr = document.createElement("tr");
            config.headers.forEach(h => {
                const th = document.createElement("th");
                th.textContent = h;
                
                // Freeze columns styles
                if (h === "TT") {
                    th.className = "freeze";
                    th.style.width = "50px";
                } else if (h === "Mã BSC") {
                    th.className = "freeze-2";
                    th.style.width = "220px";
                } else if (h === "Nhóm Công Trình") {
                    th.style.width = "150px";
                } else if (h === "Hạng Mục / Công Việc") {
                    th.style.width = "280px";
                } else if (h === "Thao Tác") {
                    th.style.width = "100px";
                    th.style.textAlign = "center";
                }
                tr.appendChild(th);
            });
            thead.appendChild(tr);
        } else {
            // ALL Columns - Two-Row Excel layout
            const tr1 = document.createElement("tr");
            tr1.innerHTML = `
                <th rowspan="2" class="freeze" style="width: 50px;">TT</th>
                <th rowspan="2" class="freeze-2" style="width: 220px;">Mã BSC</th>
                <th rowspan="2" style="width: 100px;">Gói thầu (PL)</th>
                <th rowspan="2" style="width: 160px;">Nhóm CT</th>
                <th rowspan="2" style="width: 280px;">Hạng mục / Công việc</th>
                <th rowspan="2" style="width: 140px;">Phụ trách</th>
                <th colspan="7" style="text-align: center; background-color: rgba(59, 130, 246, 0.1);">A. Đầu vào CĐT (Tiến độ - Ngân sách - HSKT)</th>
                <th colspan="7" style="text-align: center; background-color: rgba(16, 185, 129, 0.1);">B. Kế hoạch Cung ứng & Triển khai</th>
                <th colspan="5" style="text-align: center; background-color: rgba(245, 158, 11, 0.1);">D. Chốt Chặn Khởi Công</th>
                <th colspan="3" style="text-align: center; background-color: rgba(239, 68, 68, 0.1);">E. Ngân sách & Chi phí</th>
                <th colspan="4" style="text-align: center; background-color: rgba(139, 92, 246, 0.1);">F. Giám sát Biến Động Hàng Tháng / Tuần</th>
                <th rowspan="2" style="width: 100px; text-align: center;">Thao Tác</th>
            `;
            const tr2 = document.createElement("tr");
            tr2.innerHTML = `
                <th style="background-color: rgba(59, 130, 246, 0.05);">Ngày BĐ (YC)</th>
                <th style="background-color: rgba(59, 130, 246, 0.05);">Ngày KT (YC)</th>
                <th style="background-color: rgba(59, 130, 246, 0.05);">Ngân sách (tỷ)</th>
                <th style="background-color: rgba(59, 130, 246, 0.05);">KH HSTKTC</th>
                <th style="background-color: rgba(59, 130, 246, 0.05);">TT HSTKTC</th>
                <th style="background-color: rgba(59, 130, 246, 0.05);">TT SPECS</th>
                <th style="background-color: rgba(59, 130, 246, 0.05);">TT BOQ/KL</th>
                <th style="background-color: rgba(16, 185, 129, 0.05);">KH LCNT</th>
                <th style="background-color: rgba(16, 185, 129, 0.05);">TT LCNT</th>
                <th style="background-color: rgba(16, 185, 129, 0.05);">KH Ký HĐCU</th>
                <th style="background-color: rgba(16, 185, 129, 0.05);">TT Ký HĐCU</th>
                <th style="background-color: rgba(16, 185, 129, 0.05);">KH PD KHCU</th>
                <th style="background-color: rgba(16, 185, 129, 0.05);">TT KHCU</th>
                <th style="background-color: rgba(16, 185, 129, 0.05);">Giá trị HĐCU (tỷ)</th>
                <th style="background-color: rgba(245, 158, 11, 0.05);">ĐK1 HSKT</th>
                <th style="background-color: rgba(245, 158, 11, 0.05);">ĐK2 HĐCU</th>
                <th style="background-color: rgba(245, 158, 11, 0.05);">ĐK3 KHTK</th>
                <th style="background-color: rgba(245, 158, 11, 0.05);">ĐIỀU KIỆN ĐỦ</th>
                <th style="background-color: rgba(245, 158, 11, 0.05);">NGÀY BĐ KHỞI CÔNG</th>
                <th style="background-color: rgba(239, 68, 68, 0.05);">Lũy Kế HĐ A-B (tỷ)</th>
                <th style="background-color: rgba(239, 68, 68, 0.05);">Lũy Kế Phát Sinh B-B' (tỷ)</th>
                <th style="background-color: rgba(239, 68, 68, 0.05);">Lũy Kế Tổng Chi Phí (tỷ)</th>
                <th style="background-color: rgba(139, 92, 246, 0.05);">Tài liệu KH Tháng</th>
                <th style="background-color: rgba(139, 92, 246, 0.05);">Phát sinh chưa duyệt</th>
                <th style="background-color: rgba(139, 92, 246, 0.05);">Yêu cầu Cung ứng</th>
                <th style="background-color: rgba(139, 92, 246, 0.05);">Bù Tiến Độ đang chạy</th>
            `;
            thead.appendChild(tr1);
            thead.appendChild(tr2);
        }

        // B. Grouping and Hierarchical Processing
        const flatHierarchy = [];
        const seenGrandParents = new Set();

        db.master.forEach(row => {
            const bsc = String(row.ma_bsc || "").trim();
            const goiThauPl = String(row.goi_thau_pl || "").trim();
            const isParentPackage = bsc !== "";

            // Insert Grand Parent package row if new
            if (isParentPackage && goiThauPl !== "" && !seenGrandParents.has(goiThauPl)) {
                seenGrandParents.add(goiThauPl);
                flatHierarchy.push({
                    type: "grand_parent",
                    id: goiThauPl,
                    tt: "",
                    nhom_ct: row.nhom_ct,
                    hang_muc_work: `Gói thầu ${row.nhom_ct} (${goiThauPl})`,
                    phu_trach: "",
                    row_ref: null
                });
            }

            if (isParentPackage) {
                flatHierarchy.push({
                    type: "parent",
                    id: bsc,
                    parentId: goiThauPl,
                    row_ref: row
                });
            } else {
                // Sub-item (Child row)
                let parentBsc = "";
                let parentGrandParentId = "";
                for (let k = flatHierarchy.length - 1; k >= 0; k--) {
                    if (flatHierarchy[k].type === "parent") {
                        parentBsc = flatHierarchy[k].id;
                        parentGrandParentId = flatHierarchy[k].parentId;
                        break;
                    }
                }
                flatHierarchy.push({
                    type: "child",
                    id: String(row.tt),
                    parentId: parentBsc,
                    grandParentId: parentGrandParentId,
                    row_ref: row
                });
            }
        });

        // Search & Group filters
        const filteredHierarchy = flatHierarchy.filter(item => {
            if (item.type === "grand_parent") return true;
            const row = item.row_ref;
            const textMatch = 
                String(row.ma_bsc || "").toLowerCase().includes(search) || 
                String(row.hang_muc_work || "").toLowerCase().includes(search);
            const groupMatch = groupFilter === "" || String(row.nhom_ct) === groupFilter;
            return textMatch && groupMatch;
        });

        // Set visibility values based on expandedParents state
        filteredHierarchy.forEach(item => {
            if (item.type === "grand_parent") {
                item.visible = true;
                item.isExpanded = expandedParents.has(item.id);
            } else if (item.type === "parent") {
                const gpExpanded = expandedParents.has(item.parentId);
                item.visible = gpExpanded;
                item.isExpanded = expandedParents.has(item.id);
            } else if (item.type === "child") {
                const gpExpanded = expandedParents.has(item.grandParentId);
                const pExpanded = expandedParents.has(item.parentId);
                item.visible = gpExpanded && pExpanded;
            }
        });

        // Clean empty Grand Parents (those with no visible sub-rows)
        for (let i = 0; i < filteredHierarchy.length; i++) {
            const item = filteredHierarchy[i];
            if (item.type === "grand_parent") {
                let hasVisibleChildren = false;
                for (let j = i + 1; j < filteredHierarchy.length; j++) {
                    const next = filteredHierarchy[j];
                    if (next.type === "grand_parent") break;
                    if (next.visible) {
                        hasVisibleChildren = true;
                        break;
                    }
                }
                if (!hasVisibleChildren && activeLevel === 'project') {
                    item.visible = false;
                }
            }
        }

        // C. Render Rows HTML
        filteredHierarchy.forEach(item => {
            if (!item.visible) return;

            const tr = document.createElement("tr");
            
            // Set Row styling classes
            if (item.type === "grand_parent") {
                tr.className = "row-grand-parent";
            } else {
                const bsc = String(item.row_ref.ma_bsc || "").trim();
                const isParent = bsc !== "";
                const isCritical = isParent && isPackageLocked(bsc);
                
                if (isCritical) {
                    tr.className = "critical-alert";
                } else if (isParent) {
                    tr.className = "row-parent-master";
                } else {
                    tr.className = "row-parent";
                }
            }

            const masterRowIndex = db.master.indexOf(item.row_ref);

            if (activeSubtab !== 'all') {
                config.fields.forEach(field => {
                    const td = document.createElement("td");
                    
                    if (field === 'tt') {
                        td.className = "freeze";
                        td.textContent = item.type === 'grand_parent' ? item.tt : item.row_ref.tt;
                    } else if (field === 'ma_bsc') {
                        td.className = "freeze-2";
                        td.textContent = item.type === 'grand_parent' ? "" : item.row_ref.ma_bsc;
                        td.style.fontWeight = "700";
                    } else {
                        if (item.type === 'grand_parent') {
                            if (field === 'nhom_ct') td.textContent = item.nhom_ct;
                            else if (field === 'hang_muc_work') {
                                td.innerHTML = `<button class="toggle-children-btn" data-id="${item.id}"><i class="fa-solid ${item.isExpanded ? 'fa-circle-minus' : 'fa-circle-plus'}"></i></button> ${item.hang_muc_work}`;
                            } else {
                                td.textContent = "";
                            }
                        } else {
                            renderFieldValue(td, item.row_ref, field, masterRowIndex, item.type);
                        }
                    }
                    tr.appendChild(td);
                });

                // Operations column
                const tdOps = document.createElement("td");
                if (item.type === 'grand_parent') {
                    tdOps.textContent = "";
                } else {
                    const row = item.row_ref;
                    const canEdit = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_sua);
                    const canDelete = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_xoa);
                    
                    const getProgressStatusBadge = (status) => {
                        if (!status) return "";
                        if (status === 'Chờ duyệt') return `<span class="badge warning" style="font-size:0.7rem; padding:2px 4px; display:inline-block; margin-top:2px;">Chờ duyệt</span>`;
                        if (status === 'Đã duyệt') return `<span class="badge success" style="font-size:0.7rem; padding:2px 4px; display:inline-block; margin-top:2px;">Đã duyệt</span>`;
                        if (status === 'Từ chối') return `<span class="badge danger" style="font-size:0.7rem; padding:2px 4px; display:inline-block; margin-top:2px;">Từ chối</span>`;
                        return "";
                    };
                    
                    if (canEdit || canDelete) {
                        tdOps.innerHTML = `
                            <div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
                                <div style="display: flex; gap: 4px; justify-content: center;">
                                    ${canEdit ? `<button class="btn-action btn-edit-row" data-idx="${masterRowIndex}" style="color: var(--color-ai-primary); border-color: rgba(59, 130, 246, 0.3); padding: 4px 8px;" title="Chỉnh sửa dòng"><i class="fa-solid fa-pen-to-square"></i> Sửa</button>` : ""}
                                    ${canDelete ? `<button class="btn-action reject btn-delete-row" data-idx="${masterRowIndex}" style="color: #ff5252; border-color: rgba(255, 82, 82, 0.3); padding: 4px 8px;" title="Xóa dòng"><i class="fa-solid fa-trash-can"></i> Xoá</button>` : ""}
                                </div>
                                ${getProgressStatusBadge(row.progress_status)}
                            </div>
                        `;
                    } else {
                        tdOps.innerHTML = `<span style="font-size:0.75rem; color: var(--text-muted); text-align: center; display: block;">Chỉ đọc</span>`;
                    }
                }
                tr.appendChild(tdOps);

            } else {
                // ALL DATA RENDERING
                if (item.type === 'grand_parent') {
                    tr.innerHTML = `
                        <td class="freeze">${item.tt}</td>
                        <td class="freeze-2"></td>
                        <td>${item.id}</td>
                        <td>${item.nhom_ct}</td>
                        <td colspan="29">
                            <button class="toggle-children-btn" data-id="${item.id}"><i class="fa-solid ${item.isExpanded ? 'fa-circle-minus' : 'fa-circle-plus'}"></i></button> <b>${item.hang_muc_work}</b>
                        </td>
                        <td></td>
                    `;
                } else {
                    const row = item.row_ref;
                    const isParent = item.type === 'parent';
                    const nganSachVal = parseFloat(row.ngan_sach || 0);
                    const luyKeABVal = parseFloat(row.luy_ke_ab || 0);
                    const luyKeBBVal = parseFloat(row.luy_ke_bb || 0);
                    const luyKeTongVal = parseFloat(row.luy_ke_tong_chi_phi || 0);

                    tr.innerHTML = `
                        <td class="freeze">${row.tt || ""}</td>
                        <td class="freeze-2">${row.ma_bsc || ""}</td>
                        <td>${row.goi_thau_pl || ""}</td>
                        <td>${row.nhom_ct || ""}</td>
                        <td>
                            ${isParent ? `<button class="toggle-children-btn" data-id="${row.ma_bsc}"><i class="fa-solid ${item.isExpanded ? 'fa-circle-minus' : 'fa-circle-plus'}"></i></button>` : ""}
                            ${row.hang_muc_work || ""}
                        </td>
                        <td>${row.phu_trach || ""}</td>
                        <td>${row.ngay_bd_yc || ""}</td>
                        <td>${row.ngay_kt_yc || ""}</td>
                        <td style="text-align:right; font-weight:600;">${nganSachVal > 0 ? nganSachVal.toFixed(2) : ""}</td>
                        <td>${row.kh_phat_hinh_hstktc || row.kh_phat_hanh_hstktc || ""}</td>
                        <td>${isParent ? renderCellDropdown(masterRowIndex, 'tt_hstktc', row.tt_hstktc, 'TT HSTKTC') : (row.tt_hstktc || "")}</td>
                        <td>${isParent ? renderCellDropdown(masterRowIndex, 'tt_specs', row.tt_specs, 'TT SPECS') : (row.tt_specs || "")}</td>
                        <td>${isParent ? renderCellDropdown(masterRowIndex, 'tt_boq_kl', row.tt_boq_kl, 'TT BOQ/KL') : (row.tt_boq_kl || "")}</td>
                        <td>${row.kh_lcnt || ""}</td>
                        <td>${isParent ? renderCellDropdown(masterRowIndex, 'tt_lcnt', row.tt_lcnt, 'TT LCNT') : (row.tt_lcnt || "")}</td>
                        <td>${row.kh_ky_hdcu || ""}</td>
                        <td>${isParent ? renderCellDropdown(masterRowIndex, 'tt_ky_hdcu', row.tt_ky_hdcu, 'TT Ký HĐCU') : (row.tt_ky_hdcu || "")}</td>
                        <td>${row.kh_pd_khcu || ""}</td>
                        <td>${isParent ? renderCellDropdown(masterRowIndex, 'tt_khcu', row.tt_khcu, 'TT KHCU') : (row.tt_khcu || "")}</td>
                        <td style="text-align:right;">
                            ${isParent ? row.gia_tri_hdcu : `<input type="number" step="0.01" class="grid-input" value="${row.gia_tri_hdcu || ''}" data-row="${masterRowIndex}" data-field="gia_tri_hdcu" style="width:70px; text-align:right;">`}
                        </td>
                        <td style="text-align:center;">${isParent ? (row.dk1_hskt === '✔' ? '<span class="badge success">Đạt</span>' : '<span class="badge danger">Chưa đạt</span>') : ""}</td>
                        <td style="text-align:center;">${isParent ? (row.dk2_hdcu === '✔' ? '<span class="badge success">Đạt</span>' : '<span class="badge danger">Chưa đạt</span>') : ""}</td>
                        <td style="text-align:center;">${isParent ? (row.dk3_khtk === '✔' ? '<span class="badge success">Đạt</span>' : '<span class="badge danger">Chưa đạt</span>') : ""}</td>
                        <td style="text-align:center;">
                            ${isParent ? (row.dieu_kien_du === 'ĐỦ ĐK KHỞI CÔNG' ? 
                                '<span class="badge success" style="box-shadow: 0 0 8px var(--color-green);">ĐỦ ĐIỀU KIỆN</span>' : 
                                '<span class="badge danger">CHƯA ĐỦ ĐK</span>') : ""}
                        </td>
                        <td>
                            ${isParent ? `
                                <input type="date" class="grid-input" value="${row.ngay_bd_khoi_cong || ''}" 
                                    data-row="${masterRowIndex}" data-field="ngay_bd_khoi_cong" 
                                    ${row.dieu_kien_du !== 'ĐỦ ĐK KHỞI CÔNG' ? 'disabled title="Khóa chốt chặn: Chưa đủ điều kiện khởi công!"' : ''}>
                            ` : ""}
                        </td>
                        <td style="text-align:right; font-weight:600; background-color: rgba(255,255,255,0.02);">${isParent ? luyKeABVal.toFixed(2) : ""}</td>
                        <td style="text-align:right; font-weight:600; background-color: rgba(255,255,255,0.02);">${isParent ? luyKeBBVal.toFixed(2) : ""}</td>
                        <td style="text-align:right; font-weight:700; background-color: rgba(255,255,255,0.04);">${isParent ? luyKeTongVal.toFixed(2) : ""}</td>
                        <td style="text-align:center;">${isParent ? `<span class="badge info">${row.tai_lieu_kh_thang}</span>` : ""}</td>
                        <td style="text-align:center;">${isParent && row.phat_sinh_chua_duyet > 0 ? `<span class="badge danger">${row.phat_sinh_chua_duyet}</span>` : (isParent ? '<span class="badge success">0</span>' : "")}</td>
                        <td style="text-align:center;">${isParent && row.yc_cung_ung_cho_duyet > 0 ? `<span class="badge danger">${row.yc_cung_ung_cho_duyet}</span>` : (isParent ? '<span class="badge success">0</span>' : "")}</td>
                        <td style="text-align:center;">${isParent && row.bu_tien_do_dang_chay > 0 ? `<span class="badge warning">${row.bu_tien_do_dang_chay} Đang bù</span>` : (isParent ? '<span class="badge success">0</span>' : "")}</td>
                    `;
                    
                    // Add Operation cell in all mode
                    const tdOps = document.createElement("td");
                    const canEdit = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_sua);
                    const canDelete = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_xoa);
                    
                    const getProgressStatusBadge = (status) => {
                        if (!status) return "";
                        if (status === 'Chờ duyệt') return `<span class="badge warning" style="font-size:0.7rem; padding:2px 4px; display:inline-block; margin-top:2px;">Chờ duyệt</span>`;
                        if (status === 'Đã duyệt') return `<span class="badge success" style="font-size:0.7rem; padding:2px 4px; display:inline-block; margin-top:2px;">Đã duyệt</span>`;
                        if (status === 'Từ chối') return `<span class="badge danger" style="font-size:0.7rem; padding:2px 4px; display:inline-block; margin-top:2px;">Từ chối</span>`;
                        return "";
                    };
                    
                    if (canEdit || canDelete) {
                        tdOps.innerHTML = `
                            <div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
                                <div style="display: flex; gap: 4px; justify-content: center;">
                                    ${canEdit ? `<button class="btn-action btn-edit-row" data-idx="${masterRowIndex}" style="color: var(--color-ai-primary); border-color: rgba(59, 130, 246, 0.3); padding: 4px 8px;" title="Chỉnh sửa dòng"><i class="fa-solid fa-pen-to-square"></i> Sửa</button>` : ""}
                                    ${canDelete ? `<button class="btn-action reject btn-delete-row" data-idx="${masterRowIndex}" style="color: #ff5252; border-color: rgba(255, 82, 82, 0.3); padding: 4px 8px;" title="Xóa dòng"><i class="fa-solid fa-trash-can"></i> Xoá</button>` : ""}
                                </div>
                                ${getProgressStatusBadge(row.progress_status)}
                            </div>
                        `;
                    } else {
                        tdOps.innerHTML = `<span style="font-size:0.75rem; color: var(--text-muted); text-align: center; display: block;">Chỉ đọc</span>`;
                    }
                    tr.appendChild(tdOps);
                }
            }

            tbody.appendChild(tr);
        });

        // Re-attach listeners
        attachGridEventListeners();
        attachToggleEventListeners();
    }

    function renderCellDropdown(rowIdx, field, currentVal, category) {
        const options = db.danh_muc[category] || [];
        const isEditable = currentUser && (currentUser.quyen === 'Admin' || (currentUser.quyen_sua && currentUser.quyen === 'Supervisor'));
        let html = `<select class="grid-select" data-row="${rowIdx}" data-field="${field}" ${!isEditable ? 'disabled title="Khóa: Chỉ Admin/TVGS có quyền sửa mới được chỉnh sửa!"' : ''}>`;
        html += `<option value=""></option>`;
        options.forEach(opt => {
            html += `<option value="${opt}" ${opt === currentVal ? 'selected' : ''}>${opt}</option>`;
        });
        html += `</select>`;
        return html;
    }

    function renderFieldValue(td, row, field, rowIdx, levelType) {
        const isParent = levelType === 'parent';

        if (field === 'hang_muc_work') {
            let html = "";
            if (isParent) {
                const hasChildren = db.master.some(r => r !== row && String(r.tt).startsWith(row.tt + "."));
                if (hasChildren) {
                    const isExpanded = expandedParents.has(row.ma_bsc);
                    html += `<button class="toggle-children-btn" data-id="${row.ma_bsc}"><i class="fa-solid ${isExpanded ? 'fa-circle-minus' : 'fa-circle-plus'}"></i></button>`;
                }
            }
            td.innerHTML = html + (row.hang_muc_work || "");
        } 
        else if (field === 'nhom_ct' || field === 'goi_thau_pl' || field === 'phu_trach' || field === 'ngay_bd_yc' || field === 'ngay_kt_yc' || field === 'kh_phat_hang_hstktc' || field === 'kh_lcnt' || field === 'kh_ky_hdcu' || field === 'kh_pd_khcu' || field === 'kh_ky_plhd_cdt' || field === 'kh_pd_khtk') {
            td.textContent = row[field] || "";
        }
        else if (field === 'ngan_sach') {
            const val = parseFloat(row.ngan_sach || 0);
            td.textContent = val > 0 ? val.toFixed(2) : "";
            td.style.textAlign = "right";
            td.style.fontWeight = isParent ? "600" : "400";
        }
        else if (field === 'gia_tri_hdcu') {
            if (isParent) {
                const val = parseFloat(row.gia_tri_hdcu || 0);
                td.textContent = val > 0 ? val.toFixed(2) : "";
                td.style.fontWeight = "600";
                td.style.textAlign = "right";
            } else {
                const isEditable = currentUser && (currentUser.quyen === 'Admin' || (currentUser.quyen_sua && currentUser.quyen === 'Contractor'));
                td.innerHTML = `<input type="number" step="0.01" class="grid-input" value="${row.gia_tri_hdcu || ''}" data-row="${rowIdx}" data-field="gia_tri_hdcu" style="width:70px; text-align:right;" ${!isEditable ? 'disabled title="Khóa: Chỉ Admin/Tổng thầu có quyền sửa mới được chỉnh sửa!"' : ''}>`;
            }
        }
        else if (field === 'percent_hdcu_ns') {
            const val = parseFloat(row.percent_hdcu_ns || 0);
            td.textContent = val > 0 ? (val * 100).toFixed(1) + "%" : "";
            td.style.textAlign = "right";
        }
        else if (field === 'tt_hstktc') {
            td.innerHTML = isParent ? renderCellDropdown(rowIdx, 'tt_hstktc', row.tt_hstktc, 'TT HSTKTC') : (row.tt_hstktc || "");
        }
        else if (field === 'tt_specs') {
            td.innerHTML = isParent ? renderCellDropdown(rowIdx, 'tt_specs', row.tt_specs, 'TT SPECS') : (row.tt_specs || "");
        }
        else if (field === 'tt_boq_kl') {
            td.innerHTML = isParent ? renderCellDropdown(rowIdx, 'tt_boq_kl', row.tt_boq_kl, 'TT BOQ/KL') : (row.tt_boq_kl || "");
        }
        else if (field === 'tt_lcnt') {
            td.innerHTML = isParent ? renderCellDropdown(rowIdx, 'tt_lcnt', row.tt_lcnt, 'TT LCNT') : (row.tt_lcnt || "");
        }
        else if (field === 'tt_ky_hdcu') {
            td.innerHTML = isParent ? renderCellDropdown(rowIdx, 'tt_ky_hdcu', row.tt_ky_hdcu, 'TT Ký HĐCU') : (row.tt_ky_hdcu || "");
        }
        else if (field === 'tt_khcu') {
            td.innerHTML = isParent ? renderCellDropdown(rowIdx, 'tt_khcu', row.tt_khcu, 'TT KHCU') : (row.tt_khcu || "");
        }
        else if (field === 'tt_ky_plhd_cdt') {
            td.innerHTML = isParent ? renderCellDropdown(rowIdx, 'tt_ky_plhd_cdt', row.tt_ky_plhd_cdt, 'TT Ký PLHĐ') : (row.tt_ky_plhd_cdt || "");
        }
        else if (field === 'tt_khtk') {
            td.innerHTML = isParent ? renderCellDropdown(rowIdx, 'tt_khtk', row.tt_khtk, 'TT KHTK') : (row.tt_khtk || "");
        }
        else if (field === 'dk1_hskt') {
            td.innerHTML = isParent ? (row.dk1_hskt === '✔' ? '<span class="badge success">Đạt</span>' : '<span class="badge danger">Chưa đạt</span>') : "";
            td.style.textAlign = "center";
        }
        else if (field === 'dk2_hdcu') {
            td.innerHTML = isParent ? (row.dk2_hdcu === '✔' ? '<span class="badge success">Đạt</span>' : '<span class="badge danger">Chưa đạt</span>') : "";
            td.style.textAlign = "center";
        }
        else if (field === 'dk3_khtk') {
            td.innerHTML = isParent ? (row.dk3_khtk === '✔' ? '<span class="badge success">Đạt</span>' : '<span class="badge danger">Chưa đạt</span>') : "";
            td.style.textAlign = "center";
        }
        else if (field === 'dieu_kien_du') {
            td.innerHTML = isParent ? (row.dieu_kien_du === 'ĐỦ ĐK KHỞI CÔNG' ? 
                '<span class="badge success" style="box-shadow: 0 0 8px var(--color-green);">ĐỦ ĐIỀU KIỆN</span>' : 
                '<span class="badge danger">CHƯA ĐỦ ĐK</span>') : "";
            td.style.textAlign = "center";
        }
        else if (field === 'ngay_bd_khoi_cong') {
            const isEditable = currentUser && (currentUser.quyen === 'Admin' || (currentUser.quyen_sua && currentUser.quyen === 'Supervisor'));
            td.innerHTML = isParent ? `
                <input type="date" class="grid-input" value="${row.ngay_bd_khoi_cong || ''}" 
                    data-row="${rowIdx}" data-field="ngay_bd_khoi_cong" 
                    ${!isEditable || row.dieu_kien_du !== 'ĐỦ ĐK KHỞI CÔNG' ? 'disabled title="Khóa: Chưa đủ điều kiện hoặc tài khoản không có quyền sửa!"' : ''}>
            ` : "";
        }
        else if (field === 'luy_ke_ab') {
            const val = parseFloat(row.luy_ke_ab || 0);
            td.textContent = isParent && val > 0 ? val.toFixed(2) : "";
            td.style.textAlign = "right";
            td.style.fontWeight = "600";
        }
        else if (field === 'luy_ke_bb') {
            const val = parseFloat(row.luy_ke_bb || 0);
            td.textContent = isParent ? val.toFixed(2) : "";
            td.style.textAlign = "right";
            td.style.fontWeight = "600";
        }
        else if (field === 'luy_ke_tong_chi_phi') {
            const val = parseFloat(row.luy_ke_tong_chi_phi || 0);
            td.textContent = isParent && val > 0 ? val.toFixed(2) : "";
            td.style.textAlign = "right";
            td.style.fontWeight = "700";
        }
        else if (field.startsWith('t') || field.startsWith('qa') || field.startsWith('tc')) {
            const val = row[field];
            if (field.endsWith('kh') || field.endsWith('kq') || field.includes('klcv')) {
                const num = parseFloat(val);
                td.textContent = isNaN(num) ? (val || "") : num.toFixed(2);
                td.style.textAlign = "right";
            } else {
                td.textContent = val || "";
            }
        }
    }

        // Progress and Weekly plans approval helpers
    function renderProgressApprovalBanner(row, rowIdx) {
        if (!row.progress_status) return "";
        const isApprover = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen === 'Supervisor');
        
        if (row.progress_status === 'Chờ duyệt') {
            if (isApprover) {
                return `
                    <div style="background-color: rgba(245,158,11,0.15); border: 1px solid var(--color-yellow); border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 0.85rem;">
                        <div style="font-weight: 700; color: var(--color-yellow); margin-bottom: 6px;">
                            <i class="fa-solid fa-circle-exclamation"></i> Đề xuất cập nhật tiến độ thi công từ Chỉ huy trưởng (CHT) đang chờ duyệt:
                        </div>
                        <div style="font-size: 0.8rem; margin-bottom: 10px; color: var(--text-secondary);">
                            Vui lòng kiểm tra số liệu đề xuất bên dưới và phê duyệt hoặc từ chối.
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="btn-action approve" onclick="approveProgressProposal(${rowIdx})" style="padding: 4px 12px; font-size: 0.8rem; background-color: var(--color-green); border: none; color: white; cursor: pointer; border-radius: 4px;">
                                <i class="fa-solid fa-check"></i> Phê Duyệt Đề Xuất
                            </button>
                            <button type="button" class="btn-action reject" onclick="rejectProgressProposal(${rowIdx})" style="padding: 4px 12px; font-size: 0.8rem; background-color: #ff5252; border: none; color: white; cursor: pointer; border-radius: 4px;">
                                <i class="fa-solid fa-xmark"></i> Từ Chối Đề Xuất
                            </button>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div style="background-color: rgba(245,158,11,0.15); border: 1px solid var(--color-yellow); border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 0.85rem; color: var(--color-yellow);">
                        <i class="fa-solid fa-clock"></i> Đề xuất cập nhật tiến độ đang chờ TVGS / Ban QLDA phê duyệt. Các trường nhập liệu tạm thời bị khóa.
                    </div>
                `;
            }
        } else if (row.progress_status === 'Từ chối') {
            return `
                <div style="background-color: rgba(255,82,82,0.15); border: 1px solid #ff5252; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 0.85rem;">
                    <div style="font-weight: 700; color: #ff5252;">
                        <i class="fa-solid fa-circle-xmark"></i> Đề xuất cập nhật tiến độ bị từ chối!
                    </div>
                    <div style="font-size: 0.8rem; margin-top: 4px; color: var(--text-secondary);">
                        Lý do từ chối: <span style="color: #ff5252; font-style: italic;">${row.progress_ly_do_tu_choi || 'Không nêu lý do'}</span>
                    </div>
                </div>
            `;
        } else if (row.progress_status === 'Đã duyệt') {
            return `
                <div style="background-color: rgba(16,185,129,0.15); border: 1px solid var(--color-green); border-radius: 6px; padding: 8px 12px; margin-bottom: 16px; font-size: 0.85rem; color: var(--color-green);">
                    <i class="fa-solid fa-circle-check"></i> Cập nhật tiến độ gần nhất đã được phê duyệt chính thức.
                </div>
            `;
        }
        return "";
    }

    function renderProgressFieldsInput(row, rowIdx) {
        const isContractor = currentUser && currentUser.quyen === 'Contractor';
        const isLocked = isContractor && row.progress_status === 'Chờ duyệt';
        
        const source = (row.progress_status === 'Chờ duyệt' || row.progress_status === 'Từ chối') && row.pending_progress
            ? row.pending_progress
            : row;
            
        const getBillion = (val) => {
            if (val === undefined || val === null || val === "") return "";
            const num = parseFloat(val);
            return isNaN(num) ? "" : num.toFixed(2);
        };
        
        const getVal = (val) => val || "";

        return `
            <div style="background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; display: grid; gap: 12px; ${isLocked ? 'opacity: 0.7;' : ''}">
                <div style="font-weight: 600; font-size: 0.8rem; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-bottom: 4px;">
                    TIẾN ĐỘ THÁNG HIỆN TẠI
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 12px;">
                    <div class="form-group">
                        <label style="font-size:0.75rem;">KH KLCV Tháng (tỷ)</label>
                        <input type="number" step="0.01" min="0" id="form-p-kh-thang" class="form-control" value="${getBillion(source.qa_kh_klcv_thang)}" ${isLocked ? 'disabled' : ''}>
                    </div>
                    <div class="form-group">
                        <label style="font-size:0.75rem;">KQ KLCV Tháng (tỷ)</label>
                        <input type="number" step="0.01" min="0" id="form-p-kq-thang" class="form-control" value="${getBillion(source.qa_kq_klcv_thang)}" ${isLocked ? 'disabled' : ''}>
                    </div>
                    <div class="form-group">
                        <label style="font-size:0.75rem;">Đánh giá & giải pháp tháng</label>
                        <input type="text" id="form-p-dg-thang" class="form-control" value="${getVal(source.qa_danh_gia_thang)}" placeholder="Đạt kế hoạch, chậm do..." ${isLocked ? 'disabled' : ''}>
                    </div>
                </div>
                
                <div style="font-weight: 600; font-size: 0.8rem; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-bottom: 4px; margin-top: 8px;">
                    TIẾN ĐỘ CHI TIẾT 4 TUẦN KẾ TIẾP
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                    ${[1, 2, 3, 4].map(w => {
                        const khVal = source[`t${w}_kh`];
                        const kqVal = source[`t${w}_kq`];
                        const dgVal = source[`t${w}_dg`];
                        return `
                            <div style="border: 1px solid var(--border-color); padding: 8px; border-radius: 6px; background-color: rgba(255,255,255,0.02);">
                                <h4 style="font-size:0.75rem; margin-bottom:6px; color: var(--color-ai-primary); font-weight:700;">Tuần ${w}</h4>
                                <div class="form-group" style="margin-bottom:6px;">
                                    <label style="font-size:0.7rem; color: var(--text-secondary);">KH (tỷ)</label>
                                    <input type="number" step="0.01" min="0" id="form-p-t${w}-kh" class="form-control" style="font-size:0.75rem; padding:4px 6px;" value="${getBillion(khVal)}" ${isLocked ? 'disabled' : ''}>
                                </div>
                                <div class="form-group" style="margin-bottom:6px;">
                                    <label style="font-size:0.7rem; color: var(--text-secondary);">KQ (tỷ)</label>
                                    <input type="number" step="0.01" min="0" id="form-p-t${w}-kq" class="form-control" style="font-size:0.75rem; padding:4px 6px;" value="${getBillion(kqVal)}" ${isLocked ? 'disabled' : ''}>
                                </div>
                                <div class="form-group" style="margin-bottom:0;">
                                    <label style="font-size:0.7rem; color: var(--text-secondary);">Đánh giá</label>
                                    <input type="text" id="form-p-t${w}-dg" class="form-control" style="font-size:0.75rem; padding:4px 6px;" value="${getVal(dgVal)}" placeholder="..." ${isLocked ? 'disabled' : ''}>
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    }

    window.approveProgressProposal = function(rowIdx) {
        const row = db.master[rowIdx];
        if (row && row.pending_progress) {
            Object.assign(row, row.pending_progress);
            row.progress_status = "Đã duyệt";
            row.progress_ly_do_tu_choi = "";
            row.pending_progress = null;
            // Record approver and date
            row.progress_nguoi_duyet = currentUser ? currentUser.ho_ten : "Hệ thống";
            row.progress_ngay_duyet = getSystemDateGMT7();
            
            calculateRollups();
            saveDatabase();
            showToast("Phê duyệt", `Đã phê duyệt cập nhật tiến độ dòng ${row.tt} thành công.`, "success");
            closeModal();
            renderMasterGrid();
        }
    };

    window.rejectProgressProposal = function(rowIdx) {
        const row = db.master[rowIdx];
        if (row) {
            const reason = prompt("Nhập lý do từ chối phê duyệt tiến độ:");
            if (reason === null) return;
            if (!reason.trim()) { alert("Lý do từ chối không được để trống!"); return; }
            
            row.progress_status = "Từ chối";
            row.progress_ly_do_tu_choi = reason.trim();
            // Record rejecter and date
            row.progress_nguoi_duyet = currentUser ? currentUser.ho_ten : "Hệ thống";
            row.progress_ngay_duyet = getSystemDateGMT7();
            
            calculateRollups();
            saveDatabase();
            showToast("Từ chối", `Đã từ chối đề xuất cập nhật tiến độ dòng ${row.tt}.`, "warning");
            closeModal();
            renderMasterGrid();
        }
    };

function openEditModalForm(rowIdx) {
        // Enforce Update permission
        const canEdit = currentUser ? (currentUser.quyen === 'Admin' || currentUser.quyen_sua) : false;
        if (!canEdit) {
            showToast("Bảo Mật", "Quyền hạn hạn chế: Tài khoản của bạn không có quyền SỬA dữ liệu!", "danger");
            return;
        }
        editRowIndex = rowIdx;
        currentFormTarget = "master_edit";
        const row = db.master[rowIdx];
        
        const titleEl = document.getElementById("modal-form-title");
        const bodyEl = document.getElementById("modal-form-body");
        bodyEl.innerHTML = "";
        
        titleEl.textContent = `Chỉnh Sửa Gói Thầu / Hạng Mục (Dòng ${row.tt})`;
        
        const isContractor = currentUser && currentUser.quyen === 'Contractor';
        
        bodyEl.innerHTML = `
            <fieldset ${isContractor ? 'disabled' : ''} style="border:none; padding:0; margin:0; display:contents;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="form-group">
                        <label>TT (Thứ tự dòng)</label>
                        <input type="text" id="edit-form-tt" class="form-control" value="${row.tt || ''}">
                    </div>
                    <div class="form-group">
                        <label>Mã BSC</label>
                        <input type="text" id="edit-form-ma-bsc" class="form-control" value="${row.ma_bsc || ''}" placeholder="Để trống nếu là hạng mục con">
                    </div>
                    <div class="form-group">
                        <label>Gói thầu (PL)</label>
                        <input type="text" id="edit-form-goi-thau-pl" class="form-control" value="${row.goi_thau_pl || ''}">
                    </div>
                    <div class="form-group">
                        <label>Nhóm CT / Hạng mục cha</label>
                        <input type="text" id="edit-form-nhom-ct" class="form-control" value="${row.nhom_ct || ''}">
                    </div>
                    <div class="form-group" style="grid-column: span 2;">
                        <label>Hạng mục / Công việc</label>
                        <input type="text" id="edit-form-work-name" class="form-control" value="${row.hang_muc_work || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Phụ trách</label>
                        <input type="text" id="edit-form-phu-trach" class="form-control" value="${row.phu_trach || ''}">
                    </div>
                    <div class="form-group">
                        <label>Ngân sách (tỷ)</label>
                        <input type="number" step="0.01" id="edit-form-ngan-sach" class="form-control" value="${row.ngan_sach || 0}">
                    </div>
                    <div class="form-group">
                        <label>Giá trị HĐCU (tỷ)</label>
                        <input type="number" step="0.01" id="edit-form-gia-tri-hdcu" class="form-control" value="${row.gia_tri_hdcu || 0}">
                    </div>
                    <div class="form-group">
                        <label>Ngày bắt đầu (Yêu cầu)</label>
                        <input type="date" id="edit-form-start-date" class="form-control" value="${row.ngay_bd_yc || ''}">
                    </div>
                    <div class="form-group">
                        <label>Ngày kết thúc (Yêu cầu)</label>
                        <input type="date" id="edit-form-end-date" class="form-control" value="${row.ngay_kt_yc || ''}">
                    </div>
                    <div class="form-group">
                        <label>Ngày khởi công (Thực tế)</label>
                        <input type="date" id="edit-form-start-actual" class="form-control" value="${row.ngay_bd_khoi_cong || ''}">
                    </div>
                </div>
                
                <div style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div class="form-group">
                        <label>TT HSTKTC</label>
                        <select id="edit-form-tt-hstktc" class="form-control">
                            <option value=""></option>
                            ${renderOptionsWithSelect(db.danh_muc['TT HSTKTC'] || [], row.tt_hstktc)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>TT SPECS</label>
                        <select id="edit-form-tt-specs" class="form-control">
                            <option value=""></option>
                            ${renderOptionsWithSelect(db.danh_muc['TT SPECS'] || [], row.tt_specs)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>TT BOQ/KL</label>
                        <select id="edit-form-tt-boq-kl" class="form-control">
                            <option value=""></option>
                            ${renderOptionsWithSelect(db.danh_muc['TT BOQ/KL'] || [], row.tt_boq_kl)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>TT LCNT</label>
                        <select id="edit-form-tt-lcnt" class="form-control">
                            <option value=""></option>
                            ${renderOptionsWithSelect(db.danh_muc['TT LCNT'] || [], row.tt_lcnt)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>TT Ký HĐCU</label>
                        <select id="edit-form-tt-ky-hdcu" class="form-control">
                            <option value=""></option>
                            ${renderOptionsWithSelect(db.danh_muc['TT Ký HĐCU'] || [], row.tt_ky_hdcu)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>TT KHCU</label>
                        <select id="edit-form-tt-khcu" class="form-control">
                            <option value=""></option>
                            ${renderOptionsWithSelect(db.danh_muc['TT KHCU'] || [], row.tt_khcu)}
                        </select>
                    </div>
                </div>
            </fieldset>

            <!-- Section 3: Kế hoạch & Tiến độ thi công -->
            <div style="margin-top: 20px; border-top: 2px dashed var(--border-color); padding-top: 16px;">
                <h3 style="font-size: 0.95rem; margin-bottom: 12px; color: var(--color-ai-primary); display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-person-digging"></i> Kế hoạch & Tiến độ Thi công (Tuần/Tháng)
                </h3>
                ${renderProgressApprovalBanner(row, rowIdx)}
                ${renderProgressFieldsInput(row, rowIdx)}
            </div>
        `;
        
        formModal.style.display = "flex";
    }

    function renderOptionsWithSelect(array, selectedVal) {
        if (!array) return "";
        return array.map(v => `<option value="${v}" ${v === selectedVal ? 'selected' : ''}>${v}</option>`).join("");
    }

    function deleteMasterRow(rowIdx) {
        // Enforce Delete permission
        const canDelete = currentUser ? (currentUser.quyen === 'Admin' || currentUser.quyen_xoa) : false;
        if (!canDelete) {
            showToast("Bảo Mật", "Quyền hạn hạn chế: Tài khoản của bạn không có quyền XÓA dữ liệu!", "danger");
            return;
        }
        const row = db.master[rowIdx];
        const confirmation = confirm(`Bạn có chắc chắn muốn xóa hạng mục này?\n- TT: ${row.tt}\n- Hạng mục: ${row.hang_muc_work}\n\nLưu ý: Hành động này sẽ xóa vĩnh viễn dòng này và cập nhật lại rollup ngân sách của gói thầu.`);
        if (!confirmation) return;
        
        db.master.splice(rowIdx, 1);
        calculateRollups();
        saveDatabase();
        renderMasterGrid();
        showToast("Xóa dòng", `Đã xóa thành công hạng mục dòng ${row.tt}`, "warning");
    }

    function attachToggleEventListeners() {
        document.querySelectorAll(".toggle-children-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const parentId = btn.getAttribute("data-id");
                
                if (expandedParents.has(parentId)) {
                    expandedParents.delete(parentId);
                } else {
                    expandedParents.add(parentId);
                }
                
                renderMasterGrid();
            });
        });
    }

    function attachGridEventListeners() {
        // Dropdown select change
        document.querySelectorAll(".grid-select").forEach(select => {
            select.addEventListener("change", (e) => {
                const rowIdx = parseInt(e.target.getAttribute("data-row"));
                const field = e.target.getAttribute("data-field");
                const val = e.target.value;

                db.master[rowIdx][field] = val;
                
                calculateRollups();
                saveDatabase();
                renderMasterGrid();
                showToast("Cập nhật Master", `Đã lưu thay đổi cho cột ${field}`, "success");
            });
        });

        // Numeric inputs
        document.querySelectorAll(".grid-input").forEach(input => {
            input.addEventListener("change", (e) => {
                const rowIdx = parseInt(e.target.getAttribute("data-row"));
                const field = e.target.getAttribute("data-field");
                let val = e.target.value;

                if (e.target.type === "number") {
                    val = parseFloat(val) || 0;
                }

                if (field === "ngay_bd_khoi_cong") {
                    const row = db.master[rowIdx];
                    if (row.dieu_kien_du !== "ĐỦ ĐK KHỞI CÔNG") {
                        showToast("Chốt chặn Khởi công", "CẤM CẬP NHẬT: Chưa đủ điều kiện khởi công!", "danger");
                        e.target.value = row.ngay_bd_khoi_cong || "";
                        return;
                    }
                }

                db.master[rowIdx][field] = val;
                
                const start = performance.now();
                calculateRollups();
                const end = performance.now();
                console.log(`Rollup calculation took ${(end - start).toFixed(2)} ms`);

                saveDatabase();
                renderMasterGrid();
                showToast("Cập nhật Real-time", "Đã đồng bộ dữ liệu lên Bảng tổng hợp Master.", "success");
            });
        });

        // Bind Edit buttons
        document.querySelectorAll(".btn-edit-row").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute("data-idx"));
                openEditModalForm(idx);
            });
        });

        // Bind Delete buttons
        document.querySelectorAll(".btn-delete-row").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute("data-idx"));
                deleteMasterRow(idx);
            });
        });
    }

    // Filter master search on keyup
    document.getElementById("master-search-input").addEventListener("keyup", renderMasterGrid);
    document.getElementById("master-filter-group").addEventListener("change", renderMasterGrid);
    document.getElementById("btn-reset-master").addEventListener("click", () => {
        loadDatabase();
        renderMasterGrid();
        showToast("Hệ thống", "Đã khôi phục dữ liệu Master từ bộ nhớ đệm.", "info");
    });

    // Level buttons click listeners
    const btnProject = document.getElementById("btn-level-project");
    const btnDetail = document.getElementById("btn-level-detail");

    btnProject.addEventListener("click", () => {
        activeLevel = "project";
        btnProject.classList.add("active-level");
        btnDetail.classList.remove("active-level");
        
        btnProject.style.backgroundColor = "rgba(255, 82, 82, 0.1)";
        btnProject.style.borderColor = "#ff5252";
        btnProject.style.color = "#ff5252";
        
        btnDetail.style.backgroundColor = "transparent";
        btnDetail.style.borderColor = "var(--border-color)";
        btnDetail.style.color = "var(--text-primary)";
        
        renderMasterGrid();
    });

    btnDetail.addEventListener("click", () => {
        activeLevel = "detail";
        btnDetail.classList.add("active-level");
        btnProject.classList.remove("active-level");
        
        btnDetail.style.backgroundColor = "rgba(255, 82, 82, 0.1)";
        btnDetail.style.borderColor = "#ff5252";
        btnDetail.style.color = "#ff5252";
        
        btnProject.style.backgroundColor = "transparent";
        btnProject.style.borderColor = "var(--border-color)";
        btnProject.style.color = "var(--text-primary)";
        
        renderMasterGrid();
    });

    // Expand / Collapse all buttons
    const btnExpandAll = document.getElementById("btn-expand-all");
    const btnCollapseAll = document.getElementById("btn-collapse-all");

    if (btnExpandAll) {
        btnExpandAll.addEventListener("click", () => {
            expandedParents.clear();
            db.master.forEach(row => {
                const bsc = String(row.ma_bsc || "").trim();
                const gp = String(row.goi_thau_pl || "").trim();
                if (bsc) expandedParents.add(bsc);
                if (gp) expandedParents.add(gp);
            });
            renderMasterGrid();
            showToast("Mở rộng", "Đã bung toàn bộ các gói thầu và hạng mục chi tiết.", "success");
        });
    }

    if (btnCollapseAll) {
        btnCollapseAll.addEventListener("click", () => {
            expandedParents.clear();
            renderMasterGrid();
            showToast("Thu gọn", "Đã thu gọn toàn bộ các gói thầu.", "info");
        });
    }

    // Sub-tab buttons click listeners
    const subTabButtons = document.querySelectorAll("#master-sub-tabs .btn-action");
    subTabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            subTabButtons.forEach(b => {
                b.classList.remove("active-subtab");
                b.style.backgroundColor = "transparent";
                b.style.borderColor = "var(--border-color)";
                b.style.color = "var(--text-primary)";
            });
            
            btn.classList.add("active-subtab");
            activeSubtab = btn.getAttribute("data-subtab");
            
            btn.style.backgroundColor = "var(--color-ai-primary)";
            btn.style.borderColor = "var(--color-ai-primary)";
            btn.style.color = "#fff";
            
            renderMasterGrid();
        });
    });

    // 7. RELATIONAL SUB-TABLES RENDERING (Sổ 01 - 05)
    
    // Helper to render URL link or base64 file attachment dynamically
    function renderLinkHtml(val) {
        if (!val) return `<span style="color:var(--text-muted); font-size:0.8rem;">(Không có)</span>`;
        const valStr = String(val).trim();
        const isBase64 = valStr.startsWith("data:");
        const isUrl = valStr.startsWith("http://") || valStr.startsWith("https://");
        
        if (isBase64) {
            const mimeType = (valStr.split(';')[0].split(':')[1] || "").toLowerCase();
            if (mimeType.includes("pdf")) {
                return `<a href="${valStr}" target="_blank" class="btn-action" style="color:var(--color-green); font-weight:600;"><i class="fa-solid fa-file-pdf" style="color: #ff5252; margin-right:4px;"></i> Xem PDF đính kèm</a>`;
            } else {
                return `<a href="${valStr}" target="_blank" class="btn-action" style="color:var(--color-green); font-weight:600;"><i class="fa-solid fa-image" style="color: #3b82f6; margin-right:4px;"></i> Xem ảnh đính kèm</a>`;
            }
        }
        
        if (isUrl) {
            return `<a href="${valStr}" target="_blank" class="btn-action" style="color:var(--color-ai-primary); font-weight:600;"><i class="fa-solid fa-arrow-up-right-from-square" style="margin-right:4px;"></i> Mở liên kết</a>`;
        } else {
            return `<a href="#" class="btn-action" onclick="alert('Đang mở tài liệu mẫu: ${valStr}'); return false;"><i class="fa-solid fa-link" style="margin-right:4px;"></i> ${valStr}</a>`;
        }
    }

    // SO 01: Hồ sơ tiền khởi công
    function renderS01() {
        const tbody = document.getElementById("s01-tbody");
        tbody.innerHTML = "";
        const search = document.getElementById("s01-search-input").value.toLowerCase();

        // Lock Add Button if not Admin or Contractor with quyen_them
        const btnAdd = document.getElementById("btn-add-s01");
        if (btnAdd) {
            const hasAddAccess = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_them);
            btnAdd.style.display = hasAddAccess ? 'inline-block' : 'none';
        }

        db.s01.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
            
            const canApprove = row['TT duyệt'] !== 'Đã duyệt' && row['TT duyệt'] !== 'Từ chối' && (currentUser && (currentUser.quyen === 'Admin' || (currentUser.quyen_sua && currentUser.quyen === 'Supervisor')));
            const canResubmit = row['TT duyệt'] === 'Từ chối' && (currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_sua));
            const canDelete = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_xoa);

            tr.innerHTML = `
                <td>${index + 1}</td>
                <td style="font-weight:700;">${bsc}</td>
                <td>${row['Hạng mục'] || ""}</td>
                <td><span class="badge info">${row['Loại hồ sơ'] || ""}</span></td>
                <td>${row['Tên sản phẩm / Số hiệu'] || ""}</td>
                <td>${renderLinkHtml(row['LINK lưu trữ'])}</td>
                <td>${row['Ngày HT'] || ""}</td>
                <td>${row['Người lập'] || ""}</td>
                <td>${row['Người duyệt'] || ""}</td>
                <td>
                    <span class="badge ${row['TT duyệt'] === 'Đã duyệt' ? 'success' : (row['TT duyệt'] === 'Từ chối' ? 'danger' : 'warning')}">
                        ${row['TT duyệt'] || "Chờ duyệt"}
                    </span>
                    ${row['TT duyệt'] === 'Từ chối' && row['Lý do từ chối'] ? `<br><small style="color:#ff5252; font-style:italic; display:block; margin-top:4px; max-width:150px; word-wrap:break-word;">Lý do: ${row['Lý do từ chối']}</small>` : ""}
                </td>
                <td>
                    <div style="display:flex; gap:4px; justify-content:center;">
                        ${canApprove ? `
                            <button class="btn-action approve btn-approve-s01" data-idx="${index}"><i class="fa-solid fa-check"></i> Duyệt</button>
                            <button class="btn-action reject btn-reject-s01" data-idx="${index}"><i class="fa-solid fa-xmark"></i> Từ chối</button>
                        ` : ""}
                        ${canResubmit ? `<button class="btn-action approve btn-resubmit-s01" data-idx="${index}" style="color:var(--color-ai-primary); border-color:rgba(59,130,246,0.3);" title="Trình lại hồ sơ"><i class="fa-solid fa-paper-plane"></i> Trình lại</button>` : ""}
                        ${canDelete ? `<button class="btn-action reject btn-delete-s01" data-idx="${index}" style="color:#ff5252; border-color:rgba(255,82,82,0.3);"><i class="fa-solid fa-trash-can"></i> Xoá</button>` : ""}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Attach events
        document.querySelectorAll(".btn-approve-s01").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                db.s01[idx]['TT duyệt'] = 'Đã duyệt';
                db.s01[idx]['Lý do từ chối'] = '';
                db.s01[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'CĐT';
                db.s01[idx]['Ngày duyệt'] = getSystemDateGMT7();
                
                // Rollup real-time
                calculateRollups();
                saveDatabase();
                renderS01();
                showToast("Duyệt Hồ Sơ", "Đã duyệt hồ sơ khởi công thành công. Đã cộng dồn điều kiện khởi công.", "success");
            });
        });

        document.querySelectorAll(".btn-reject-s01").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                const reason = prompt("Nhập lý do từ chối phê duyệt hồ sơ khởi công:");
                if (reason === null) return;
                if (!reason.trim()) { alert("Lý do từ chối không được để trống!"); return; }
                
                db.s01[idx]['TT duyệt'] = 'Từ chối';
                db.s01[idx]['Lý do từ chối'] = reason.trim();
                db.s01[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'CĐT';
                db.s01[idx]['Ngày duyệt'] = getSystemDateGMT7();
                
                calculateRollups();
                saveDatabase();
                renderS01();
                showToast("Từ Chối Duyệt", "Đã từ chối hồ sơ tiền khởi công.", "info");
            });
        });

        document.querySelectorAll(".btn-resubmit-s01").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                editRegistrationIndex = idx;
                openModalForm('s01');
            });
        });

        document.querySelectorAll(".btn-delete-s01").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                if (confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) {
                    db.s01.splice(idx, 1);
                    calculateRollups();
                    saveDatabase();
                    renderS01();
                    showToast("Xóa hồ sơ", "Đã xóa hồ sơ khởi công thành công.", "warning");
                }
            });
        });
    }

    // SO 02: Kế hoạch Tháng/Tuần
    function renderS02() {
        const tbody = document.getElementById("s02-tbody");
        tbody.innerHTML = "";
        const search = document.getElementById("s02-search-input").value.toLowerCase();

        // Lock Add Button if not Admin or Contractor with quyen_them
        const btnAdd = document.getElementById("btn-add-s02");
        if (btnAdd) {
            const hasAddAccess = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_them);
            btnAdd.style.display = hasAddAccess ? 'inline-block' : 'none';
        }

        db.s02.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
            
            const canApprove = row['TT duyệt'] !== 'Đã duyệt' && row['TT duyệt'] !== 'Từ chối' && (currentUser && (currentUser.quyen === 'Admin' || (currentUser.quyen_sua && currentUser.quyen === 'Supervisor')));
            const canResubmit = row['TT duyệt'] === 'Từ chối' && (currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_sua));
            const canDelete = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_xoa);

            tr.innerHTML = `
                <td>${index + 1}</td>
                <td style="font-weight:700;">${bsc}</td>
                <td>${row['Hạng mục'] || ""}</td>
                <td>${row['Tháng'] || ""}</td>
                <td>${row['Loại tài liệu'] || ""}</td>
                <td>${row['Nội dung chính'] || ""}</td>
                <td>${row['Đạt YCKT CĐT'] === 'Có' ? '<span class="badge success">Đạt</span>' : '<span class="badge danger">Chưa đạt</span>'}</td>
                <td>${renderLinkHtml(row['LINK tài liệu'])}</td>
                <td>${row['TT lập'] || ""}</td>
                <td>
                    <span class="badge ${row['TT duyệt'] === 'Đã duyệt' ? 'success' : 'warning'}">
                        ${row['TT duyệt'] || "Chờ duyệt"}
                    </span>
                    ${row['TT duyệt'] === 'Từ chối' && row['Lý do từ chối'] ? `<br><small style="color:#ff5252; font-style:italic; display:block; margin-top:4px; max-width:150px; word-wrap:break-word;">Lý do: ${row['Lý do từ chối']}</small>` : ""}
                </td>
                <td>${row['Người lập'] || ""}/${row['Người duyệt'] || ""}</td>
                <td>${row['Ngày duyệt'] || ""}</td>
                <td>
                    <div style="display:flex; gap:4px; justify-content:center;">
                        ${canApprove ? `
                            <button class="btn-action approve btn-approve-s02" data-idx="${index}"><i class="fa-solid fa-check"></i> Duyệt</button>
                            <button class="btn-action reject btn-reject-s02" data-idx="${index}"><i class="fa-solid fa-xmark"></i> Từ chối</button>
                        ` : ""}
                        ${canResubmit ? `<button class="btn-action approve btn-resubmit-s02" data-idx="${index}" style="color:var(--color-ai-primary); border-color:rgba(59,130,246,0.3);" title="Trình lại kế hoạch"><i class="fa-solid fa-paper-plane"></i> Trình lại</button>` : ""}
                        ${canDelete ? `<button class="btn-action reject btn-delete-s02" data-idx="${index}" style="color:#ff5252; border-color:rgba(255,82,82,0.3);"><i class="fa-solid fa-trash-can"></i> Xoá</button>` : ""}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Attach events
        document.querySelectorAll(".btn-approve-s02").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                db.s02[idx]['TT duyệt'] = 'Đã duyệt';
                db.s02[idx]['Lý do từ chối'] = '';
                db.s02[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'TVGS';
                db.s02[idx]['Ngày duyệt'] = getSystemDateGMT7();
                db.s02[idx]['Ngày duyệt'] = new Date().toISOString().substring(0, 10);
                
                calculateRollups();
                saveDatabase();
                renderS02();
                showToast("Duyệt Kế Hoạch", "Kế hoạch tuần/tháng đã được TVGS phê duyệt.", "success");
            });
        });

        document.querySelectorAll(".btn-reject-s02").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                const reason = prompt("Nhập lý do từ chối phê duyệt kế hoạch tuần/tháng:");
                if (reason === null) return;
                if (!reason.trim()) { alert("Lý do từ chối không được để trống!"); return; }
                
                db.s02[idx]['TT duyệt'] = 'Từ chối';
                db.s02[idx]['Lý do từ chối'] = reason.trim();
                db.s02[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'TVGS';
                db.s02[idx]['Ngày duyệt'] = getSystemDateGMT7();
                
                calculateRollups();
                saveDatabase();
                renderS02();
                showToast("Từ Chối Duyệt", "Đã từ chối kế hoạch tuần/tháng.", "info");
            });
        });

        document.querySelectorAll(".btn-resubmit-s02").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                editRegistrationIndex = idx;
                openModalForm('s02');
            });
        });

        document.querySelectorAll(".btn-delete-s02").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                if (confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) {
                    db.s02.splice(idx, 1);
                    calculateRollups();
                    saveDatabase();
                    renderS02();
                    showToast("Xóa hồ sơ", "Đã xóa kế hoạch thành công.", "warning");
                }
            });
        });
    }

    // SO 03: Phát sinh hợp đồng B - B' (Chốt chặn Ngân sách)
    function renderS03() {
        const tbody = document.getElementById("s03-tbody");
        tbody.innerHTML = "";
        const search = document.getElementById("s03-search-input").value.toLowerCase();

        // Lock Add Button if not Admin or Contractor with quyen_them
        const btnAdd = document.getElementById("btn-add-s03");
        if (btnAdd) {
            const hasAddAccess = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_them);
            btnAdd.style.display = hasAddAccess ? 'inline-block' : 'none';
        }

        db.s03.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
            const valPs = parseFloat(row['Giá trị (tỷ)'] || 0);

            const canApprove = row['TT duyệt'] === 'Chờ duyệt' && (currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_sua));
            const canResubmit = row['TT duyệt'] === 'Từ chối' && (currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_sua));
            const canDelete = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_xoa);

            tr.innerHTML = `
                <td style="font-weight:600;">${row['Mã PS']}</td>
                <td style="font-weight:700;">${bsc}</td>
                <td>${row['Hạng mục'] || ""}</td>
                <td>${row['Ngày PS'] || ""}</td>
                <td><span class="badge info">${row['Loại'] || ""}</span></td>
                <td>${row['Mô tả'] || ""}</td>
                <td>${row['Nguyên nhân'] || ""}</td>
                <td>${row['Đề xuất xử lý'] || ""}</td>
                <td style="text-align:right; font-weight:700; color:var(--color-yellow);">${valPs.toFixed(2)} tỷ</td>
                <td>${row['Ảnh hưởng TĐ (ngày)'] || 0} ngày</td>
                <td>${renderLinkHtml(row['LINK hồ sơ'])}</td>
                <td>
                    <span class="badge ${row['TT duyệt'] === 'Đã duyệt' ? 'success' : (row['TT duyệt'] === 'Từ chối' ? 'danger' : 'warning')}">
                        ${row['TT duyệt'] || "Chờ duyệt"}
                    </span>
                    ${row['TT duyệt'] === 'Từ chối' && row['Lý do từ chối'] ? `<br><small style="color:#ff5252; font-style:italic; display:block; margin-top:4px; max-width:150px; word-wrap:break-word;">Lý do: ${row['Lý do từ chối']}</small>` : ""}
                </td>
                <td>${row['Người duyệt'] || ""}<br><small>${row['Ngày duyệt'] || ""}</small></td>
                <td>
                    <div style="display:flex; gap:4px; justify-content:center;">
                        ${canApprove ? `
                            <button class="btn-action approve btn-approve-s03" data-idx="${index}" data-bsc="${bsc}"><i class="fa-solid fa-check"></i> Duyệt</button>
                            <button class="btn-action reject btn-reject-s03" data-idx="${index}"><i class="fa-solid fa-xmark"></i> Từ chối</button>
                        ` : ""}
                        ${canResubmit ? `<button class="btn-action approve btn-resubmit-s03" data-idx="${index}" style="color:var(--color-ai-primary); border-color:rgba(59,130,246,0.3);" title="Trình lại phát sinh"><i class="fa-solid fa-paper-plane"></i> Trình lại</button>` : ""}
                        ${canDelete ? `<button class="btn-action reject btn-delete-s03" data-idx="${index}" style="color:#ff5252; border-color:rgba(255,82,82,0.3);"><i class="fa-solid fa-trash-can"></i> Xoá</button>` : ""}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Approve Variations Event Handler
        document.querySelectorAll(".btn-approve-s03").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                const bsc = btn.getAttribute("data-bsc");

                // HARD FINANCIAL CHOKEPOINT: Check if package budget exceeds 95%
                if (isPackageLocked(bsc)) {
                    showToast(
                        "CHỐT CHẶN NGÂN SÁCH (LOCKED)", 
                        `Cấm phê duyệt phát sinh! Gói thầu ${bsc} đã vượt quá 95% ngân sách gốc. Cần trình duyệt điều chỉnh ngân sách trước!`, 
                        "danger"
                    );
                    return;
                }

                db.s03[idx]['TT duyệt'] = 'Đã duyệt';
                db.s03[idx]['Lý do từ chối'] = '';
                db.s03[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'GĐDA';
                db.s03[idx]['Ngày duyệt'] = getSystemDateGMT7();

                // Real-time synchronization rollup < 0.5s
                calculateRollups();
                saveDatabase();
                renderS03();
                showToast("Phát Sinh", "Đã duyệt phát sinh hợp đồng B-B' và cập nhật tức thì lên Master Grid.", "success");
            });
        });

        document.querySelectorAll(".btn-reject-s03").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                const reason = prompt("Nhập lý do từ chối phê duyệt yêu cầu phát sinh hợp đồng:");
                if (reason === null) return;
                if (!reason.trim()) { alert("Lý do từ chối không được để trống!"); return; }
                
                db.s03[idx]['TT duyệt'] = 'Từ chối';
                db.s03[idx]['Lý do từ chối'] = reason.trim();
                db.s03[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'GĐDA';
                db.s03[idx]['Ngày duyệt'] = getSystemDateGMT7();

                saveDatabase();
                renderS03();
                showToast("Phát Sinh", "Đã từ chối phát sinh hợp đồng.", "info");
            });
        });

        document.querySelectorAll(".btn-resubmit-s03").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                editRegistrationIndex = idx;
                openModalForm('s03');
            });
        });

        document.querySelectorAll(".btn-delete-s03").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                if (confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) {
                    db.s03.splice(idx, 1);
                    calculateRollups();
                    saveDatabase();
                    renderS03();
                    showToast("Xóa hồ sơ", "Đã xóa phát sinh hợp đồng thành công.", "warning");
                }
            });
        });
    }

    // SO 04: Cung ứng đặc thù
    function renderS04() {
        const tbody = document.getElementById("s04-tbody");
        tbody.innerHTML = "";
        const search = document.getElementById("s04-search-input").value.toLowerCase();

        // Lock Add Button if not Admin or Contractor with quyen_them
        const btnAdd = document.getElementById("btn-add-s04");
        if (btnAdd) {
            const hasAddAccess = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_them);
            btnAdd.style.display = hasAddAccess ? 'inline-block' : 'none';
        }

        db.s04.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
            const valCu = parseFloat(row['Giá trị (tỷ)'] || 0);

            const canApprove = row['TT duyệt'] === 'Chờ duyệt' && (currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_sua));
            const canSupply = row['TT duyệt'] === 'Đã duyệt' && row['TT cung ứng'] !== 'Đã cung ứng' && (currentUser && (currentUser.quyen === 'Admin' || (currentUser.quyen_sua && currentUser.quyen === 'Supply')));
            const canResubmit = row['TT duyệt'] === 'Từ chối' && (currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_sua));
            const canDelete = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_xoa);

            tr.innerHTML = `
                <td style="font-weight:600;">${row['Mã YC']}</td>
                <td style="font-weight:700;">${bsc}</td>
                <td>${row['Hạng mục'] || ""}</td>
                <td>${row['Ngày YC'] || ""}</td>
                <td><span class="badge info">${row['Loại YC'] || ""}</span></td>
                <td>${row['Vật tư/Thiết bị'] || ""}</td>
                <td>${row['Đặc tả KT / Lý do'] || ""}</td>
                <td>${row['KL'] || ""}</td>
                <td>${row['ĐVT'] || ""}</td>
                <td style="text-align:right; font-weight:600; color:var(--color-yellow);">${valCu.toFixed(2)} tỷ</td>
                <td>${row['Trong/Target Ngoài HĐCU'] || row['Trong/Ngoài HĐCU'] || ""}</td>
                <td>${renderLinkHtml(row['LINK hồ sơ'])}</td>
                <td>
                    <span class="badge ${row['TT duyệt'] === 'Đã duyệt' ? 'success' : (row['TT duyệt'] === 'Từ chối' ? 'danger' : 'warning')}">
                        ${row['TT duyệt'] || "Chờ duyệt"}
                    </span>
                    ${row['TT duyệt'] === 'Từ chối' && row['Lý do từ chối'] ? `<br><small style="color:#ff5252; font-style:italic; display:block; margin-top:4px; max-width:150px; word-wrap:break-word;">Lý do: ${row['Lý do từ chối']}</small>` : ""}
                </td>
                <td>
                    <span class="badge ${row['TT cung ứng'] === 'Đã cung ứng' ? 'success' : (row['TT cung ứng'] === 'Đang cung ứng' ? 'warning' : 'danger')}">
                        ${row['TT cung ứng'] || "Chưa cung ứng"}
                    </span>
                </td>
                <td>
                    <div style="display:flex; gap:4px; justify-content:center; align-items:center;">
                        ${canApprove ? `
                            <button class="btn-action approve btn-approve-s04" data-idx="${index}" data-bsc="${bsc}"><i class="fa-solid fa-check"></i> Duyệt</button>
                            <button class="btn-action reject btn-reject-s04" data-idx="${index}"><i class="fa-solid fa-xmark"></i> Từ chối</button>
                        ` : ""}
                        ${canSupply ? `<button class="btn-action approve btn-supply-s04" data-idx="${index}" style="color:var(--color-yellow); border-color:var(--color-yellow);"><i class="fa-solid fa-truck"></i> Cấp vật tư</button>` : ""}
                        ${canResubmit ? `<button class="btn-action approve btn-resubmit-s04" data-idx="${index}" style="color:var(--color-ai-primary); border-color:rgba(59,130,246,0.3);" title="Trình lại cung ứng"><i class="fa-solid fa-paper-plane"></i> Trình lại</button>` : ""}
                        ${canDelete ? `<button class="btn-action reject btn-delete-s04" data-idx="${index}" style="color:#ff5252; border-color:rgba(255,82,82,0.3);"><i class="fa-solid fa-trash-can"></i> Xoá</button>` : ""}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Approve Supply Event Handler
        document.querySelectorAll(".btn-approve-s04").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                const bsc = btn.getAttribute("data-bsc");

                // HARD FINANCIAL CHOKEPOINT: Check budget lock
                if (isPackageLocked(bsc)) {
                    showToast(
                        "CHỐT CHẶN NGÂN SÁCH (LOCKED)", 
                        `Cấm phê duyệt cung ứng! Gói thầu ${bsc} đã vượt quá 95% ngân sách gốc. Cần bổ sung ngân sách trước khi duyệt vật tư đặc thù.`, 
                        "danger"
                    );
                    return;
                }

                db.s04[idx]['TT duyệt'] = 'Đã duyệt';
                db.s04[idx]['Lý do từ chối'] = '';
                db.s04[idx]['TT cung ứng'] = 'Đang cung ứng';
                db.s04[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'BQLDA';
                db.s04[idx]['Ngày duyệt'] = getSystemDateGMT7();
                
                saveDatabase();
                renderS04();
                showToast("Cung Ứng", "Đã phê duyệt yêu cầu cung ứng vật tư.", "success");
            });
        });

        document.querySelectorAll(".btn-reject-s04").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                const reason = prompt("Nhập lý do từ chối phê duyệt yêu cầu cung ứng:");
                if (reason === null) return;
                if (!reason.trim()) { alert("Lý do từ chối không được để trống!"); return; }
                
                db.s04[idx]['TT duyệt'] = 'Từ chối';
                db.s04[idx]['Lý do từ chối'] = reason.trim();
                db.s04[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'BQLDA';
                db.s04[idx]['Ngày duyệt'] = getSystemDateGMT7();
                
                saveDatabase();
                renderS04();
                showToast("Từ Chối Cung Ứng", "Đã từ chối yêu cầu cung ứng vật tư.", "info");
            });
        });

        document.querySelectorAll(".btn-resubmit-s04").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                editRegistrationIndex = idx;
                openModalForm('s04');
            });
        });

        document.querySelectorAll(".btn-supply-s04").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                db.s04[idx]['TT cung ứng'] = 'Đã cung ứng';
                
                saveDatabase();
                renderS04();
                showToast("Cung Ứng", "Đã bàn giao vật tư ra hiện trường thi công.", "success");
            });
        });

        document.querySelectorAll(".btn-delete-s04").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                if (confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) {
                    db.s04.splice(idx, 1);
                    calculateRollups();
                    saveDatabase();
                    renderS04();
                    showToast("Xóa hồ sơ", "Đã xóa yêu cầu cung ứng thành công.", "warning");
                }
            });
        });
    }

    // SO 05: Bù tiến độ
    function renderS05() {
        const tbody = document.getElementById("s05-tbody");
        tbody.innerHTML = "";
        const search = document.getElementById("s05-search-input").value.toLowerCase();

        // Lock Add Button if not Admin or Contractor with quyen_them
        const btnAdd = document.getElementById("btn-add-s05");
        if (btnAdd) {
            const hasAddAccess = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_them);
            btnAdd.style.display = hasAddAccess ? 'inline-block' : 'none';
        }

        db.s05.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
            const delayDays = parseInt(row['Mức chậm (ngày)'] || 0);

            const canApprove = row['TT duyệt'] === 'Chờ duyệt' && (currentUser && (currentUser.quyen === 'Admin' || (currentUser.quyen_sua && currentUser.quyen === 'Supervisor')));
            const canComplete = row['TT thực hiện'] !== 'Đã hoàn thành' && (currentUser && (currentUser.quyen === 'Admin' || (currentUser.quyen_sua && currentUser.quyen === 'Supervisor')));
            const canResubmit = row['TT duyệt'] === 'Từ chối' && (currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_sua));
            const canDelete = currentUser && (currentUser.quyen === 'Admin' || currentUser.quyen_xoa);

            tr.innerHTML = `
                <td>${index + 1}</td>
                <td style="font-weight:700;">${bsc}</td>
                <td>${row['Hạng mục'] || ""}</td>
                <td>${row['Ngày phát hiện'] || ""}</td>
                <td style="text-align:center;">
                    <span class="badge ${delayDays > 7 ? 'danger' : 'warning'}" style="font-weight:700; font-size:0.8rem;">
                        Chậm ${delayDays} ngày
                    </span>
                </td>
                <td>${row['Nguyên nhân'] || ""}</td>
                <td><span class="badge info">${row['Giải pháp bù'] || ""}</span></td>
                <td>${row['Chi tiết giải pháp'] || row['Chi tiết phương án'] || ""}</td>
                <td>${row['Mốc cam kết HT'] || ""}</td>
                <td>${renderLinkHtml(row['LINK phương án'] || row['LINK phương án chi tiết'])}</td>
                <td>
                    <span class="badge ${row['TT duyệt'] === 'Đã duyệt' ? 'success' : (row['TT duyệt'] === 'Từ chối' ? 'danger' : 'warning')}">
                        ${row['TT duyệt'] || "Chờ duyệt"}
                    </span>
                    ${row['TT duyệt'] === 'Từ chối' && row['Lý do từ chối'] ? `<br><small style="color:#ff5252; font-style:italic; display:block; margin-top:4px; max-width:150px; word-wrap:break-word;">Lý do: ${row['Lý do từ chối']}</small>` : ""}
                </td>
                <td>${row['KQ thực hiện bù'] || ""}</td>
                <td>
                    <span class="badge ${row['TT thực hiện'] === 'Đã hoàn thành' ? 'success' : 'warning'}">
                        ${row['TT thực hiện'] || "Đang thực hiện"}
                    </span>
                </td>
                <td>
                    <div style="display:flex; gap:4px; justify-content:center; align-items:center;">
                        ${canApprove ? `
                            <button class="btn-action approve btn-approve-s05" data-idx="${index}"><i class="fa-solid fa-check"></i> Duyệt</button>
                            <button class="btn-action reject btn-reject-s05" data-idx="${index}"><i class="fa-solid fa-xmark"></i> Từ chối</button>
                        ` : ""}
                        ${canComplete ? `<button class="btn-action approve btn-complete-s05" data-idx="${index}" style="color:var(--color-green); border-color:var(--color-green);"><i class="fa-solid fa-circle-check"></i> Hoàn thành bù</button>` : ""}
                        ${canResubmit ? `<button class="btn-action approve btn-resubmit-s05" data-idx="${index}" style="color:var(--color-ai-primary); border-color:rgba(59,130,246,0.3);" title="Trình lại phương án"><i class="fa-solid fa-paper-plane"></i> Trình lại</button>` : ""}
                        ${canDelete ? `<button class="btn-action reject btn-delete-s05" data-idx="${index}" style="color:#ff5252; border-color:rgba(255,82,82,0.3);"><i class="fa-solid fa-trash-can"></i> Xoá</button>` : ""}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll(".btn-approve-s05").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                db.s05[idx]['TT duyệt'] = 'Đã duyệt';
                db.s05[idx]['Lý do từ chối'] = '';
                db.s05[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'BQLDA';
                db.s05[idx]['Ngày duyệt'] = getSystemDateGMT7();
                
                calculateRollups();
                saveDatabase();
                renderS05();
                showToast("Bù Tiến Độ", "Đã phê duyệt phương án bù tiến độ của Tổng thầu.", "success");
            });
        });

        document.querySelectorAll(".btn-reject-s05").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                const reason = prompt("Nhập lý do từ chối phê duyệt phương án bù tiến độ:");
                if (reason === null) return;
                if (!reason.trim()) { alert("Lý do từ chối không được để trống!"); return; }
                
                db.s05[idx]['TT duyệt'] = 'Từ chối';
                db.s05[idx]['Lý do từ chối'] = reason.trim();
                db.s05[idx]['Người duyệt'] = currentUser ? currentUser.ho_ten : 'BQLDA';
                db.s05[idx]['Ngày duyệt'] = getSystemDateGMT7();
                
                calculateRollups();
                saveDatabase();
                renderS05();
                showToast("Từ Chối Duyệt", "Đã từ chối phương án bù tiến độ.", "info");
            });
        });

        document.querySelectorAll(".btn-resubmit-s05").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                editRegistrationIndex = idx;
                openModalForm('s05');
            });
        });

        document.querySelectorAll(".btn-complete-s05").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                db.s05[idx]['TT thực hiện'] = 'Đã hoàn thành';
                db.s05[idx]['KQ thực hiện bù'] = 'Đã bù hết số ngày trễ hạn, đưa tiến độ về hằng số ban đầu.';
                
                calculateRollups();
                saveDatabase();
                renderS05();
                showToast("Bù Tiến Độ", "Đã đóng hồ sơ bù tiến độ. Gói thầu trở về trạng thái bình thường.", "success");
            });
        });

        document.querySelectorAll(".btn-delete-s05").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                if (confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) {
                    db.s05.splice(idx, 1);
                    calculateRollups();
                    saveDatabase();
                    renderS05();
                    showToast("Xóa hồ sơ", "Đã xóa phương án bù tiến độ thành công.", "warning");
                }
            });
        });
    }

    // Attach search events for sub-tables
    document.getElementById("s01-search-input").addEventListener("keyup", renderS01);
    document.getElementById("s02-search-input").addEventListener("keyup", renderS02);
    document.getElementById("s03-search-input").addEventListener("keyup", renderS03);
    document.getElementById("s04-search-input").addEventListener("keyup", renderS04);
    document.getElementById("s05-search-input").addEventListener("keyup", renderS05);

    // 8. ADD NEW RECORD DIALOG FORMS IN SPA
    const formModal = document.getElementById("form-modal");
    const modalCloseBtn = document.getElementById("modal-close-btn");
    const modalCancelBtn = document.getElementById("modal-cancel-btn");
    const modalSaveBtn = document.getElementById("modal-save-btn");
    let currentFormTarget = "";
    let editRegistrationIndex = -1;

    function openModalForm(target) {
        // Enforce Create permission - Allow if they have quyen_them OR if they are resubmitting/editing an existing rejected document
        const canAdd = currentUser ? (currentUser.quyen === 'Admin' || currentUser.quyen_them || editRegistrationIndex !== -1) : false;
        if (!canAdd) {
            showToast("Bảo Mật", "Quyền hạn hạn chế: Tài khoản của bạn không có quyền THÊM dữ liệu mới!", "danger");
            return;
        }
        currentFormTarget = target;
        const titleEl = document.getElementById("modal-form-title");
        const bodyEl = document.getElementById("modal-form-body");
        bodyEl.innerHTML = ""; // Clear

        // Fetch valid Mã BSC / TT list with names for user-friendly dropdowns (both parent packages & child detailed work items)
        const bscOptions = db.master.map(r => {
            const isParent = String(r.ma_bsc || "").trim() !== "";
            const code = isParent ? String(r.ma_bsc).trim() : String(r.tt).trim();
            const prefix = isParent ? `[Gói] ${r.ma_bsc}` : `[Chi tiết ${r.tt}]`;
            return {
                code: code,
                name: `${prefix} - ${r.hang_muc_work} (${r.nhom_ct || ""})`
            };
        });

        if (target === 'master') {
            titleEl.textContent = "Thêm Gói Thầu Mới (Master Package)";
            bodyEl.innerHTML = `
                <div class="form-group">
                    <label>Mã BSC (Giá trị duy nhất)</label>
                    <input type="text" id="form-ma-bsc" class="form-control" placeholder="ví dụ: CT-09" required>
                </div>
                <div class="form-group">
                    <label>Hạng mục / Công việc</label>
                    <input type="text" id="form-work-name" class="form-control" placeholder="Tên gói thầu..." required>
                </div>
                <div class="form-group">
                    <label>Gói thầu (PL)</label>
                    <select id="form-goi-thau-pl" class="form-control">
                        <option value="PL02">PL02</option>
                        <option value="PL10">PL10</option>
                        <option value="PL17">PL17</option>
                        <option value="PL14">PL14</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Nhóm CT</label>
                    <select id="form-nhom-ct" class="form-control">
                        <option value="Hạ tầng kỹ thuật">Hạ tầng kỹ thuật</option>
                        <option value="Xây dựng dân dụng">Xây dựng dân dụng</option>
                        <option value="Công trình phục vụ KD">Công trình phục vụ KD</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Phụ trách</label>
                    <input type="text" id="form-phu-trach" class="form-control" value="An Dương">
                </div>
                <div class="form-group">
                    <label>Ngân sách điều hành (Tỷ)</label>
                    <input type="number" step="0.1" id="form-ngan-sach" class="form-control" value="10.0">
                </div>
                <div class="form-group">
                    <label>Ngày bắt đầu (Yêu cầu)</label>
                    <input type="date" id="form-start-date" class="form-control" value="2026-07-01">
                </div>
                <div class="form-group">
                    <label>Ngày kết thúc (Yêu cầu)</label>
                    <input type="date" id="form-end-date" class="form-control" value="2026-12-31">
                </div>
            `;
        } else if (target === 's01') {
            titleEl.textContent = "Đăng Ký Hồ Sơ Tiền Khởi Công";
            bodyEl.innerHTML = `
                <div class="form-group" style="position: relative;">
                    <label>Công trình / Gói thầu liên kết</label>
                    ${renderSearchableBscSelect('form-bsc')}
                </div>
                <div class="form-group">
                    <label>Hạng mục</label>
                    <input type="text" id="form-hang-muc" class="form-control" placeholder="Tên dự án/hạng mục...">
                </div>
                <div class="form-group">
                    <label>Loại hồ sơ</label>
                    <select id="form-loai" class="form-control">${renderOptions(db.danh_muc['Loại hồ sơ tiền KC'])}</select>
                </div>
                <div class="form-group">
                    <label>Tên sản phẩm / Số hiệu bản vẽ</label>
                    <input type="text" id="form-name" class="form-control" placeholder="ví dụ: SPECS_CT09.pdf" required>
                </div>
                <div class="form-group">
                    <label>Link, hồ sơ đính kèm</label>
                    <div style="display: flex; gap: 8px; flex-direction: column;">
                        <input type="text" id="form-link" class="form-control" placeholder="Nhập Link liên kết (URL) hoặc chọn tệp..." value="SPECS_CT09.pdf">
                        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Hoặc tải tệp (PDF/ảnh):</span>
                            <input type="file" id="form-file-upload" accept="image/*,application/pdf" style="display: none;">
                            <button type="button" class="btn-action" onclick="document.getElementById('form-file-upload').click()" style="padding: 4px 10px; font-size: 0.75rem; border-color: rgba(59,130,246,0.3);">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Chọn Tệp
                            </button>
                            <span id="form-file-status" style="font-size: 0.75rem; color: var(--color-green); font-weight: 600;"></span>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Người lập</label>
                    <input type="text" id="form-maker" class="form-control" value="Tổng thầu">
                </div>
            `;
        } else if (target === 's02') {
            titleEl.textContent = "Lập Kế Hoạch Tuần/Tháng";
            bodyEl.innerHTML = `
                <div class="form-group" style="position: relative;">
                    <label>Công trình / Gói thầu liên kết</label>
                    ${renderSearchableBscSelect('form-bsc')}
                </div>
                <div class="form-group">
                    <label>Hạng mục</label>
                    <input type="text" id="form-hang-muc" class="form-control" placeholder="Tên dự án/hạng mục...">
                </div>
                <div class="form-group">
                    <label>Tháng / Tuần</label>
                    <input type="text" id="form-thang" class="form-control" placeholder="ví dụ: Tháng 07/2026, Tuần 28..." required>
                </div>
                <div class="form-group">
                    <label>Loại tài liệu</label>
                    <select id="form-loai" class="form-control">${renderOptions(db.danh_muc['Loại tài liệu KH tháng'])}</select>
                </div>
                <div class="form-group">
                    <label>Nội dung chính</label>
                    <textarea id="form-noi-dung" class="form-control" style="height:80px;" placeholder="Tóm tắt nội dung chính kế hoạch..."></textarea>
                </div>
                <div class="form-group">
                    <label>Đạt YCKT CĐT</label>
                    <select id="form-dat-yckt" class="form-control">${renderOptions(db.danh_muc['Đạt YCKT CĐT'])}</select>
                </div>
                <div class="form-group">
                    <label>Link, hồ sơ đính kèm</label>
                    <div style="display: flex; gap: 8px; flex-direction: column;">
                        <input type="text" id="form-link" class="form-control" placeholder="Nhập Link liên kết (URL) hoặc chọn tệp..." value="KH_TaiLieu.pdf">
                        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Hoặc tải tệp (PDF/ảnh):</span>
                            <input type="file" id="form-file-upload" accept="image/*,application/pdf" style="display: none;">
                            <button type="button" class="btn-action" onclick="document.getElementById('form-file-upload').click()" style="padding: 4px 10px; font-size: 0.75rem; border-color: rgba(59,130,246,0.3);">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Chọn Tệp
                            </button>
                            <span id="form-file-status" style="font-size: 0.75rem; color: var(--color-green); font-weight: 600;"></span>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Người lập</label>
                    <input type="text" id="form-maker" class="form-control" value="Tổng thầu">
                </div>
            `;
        } else if (target === 's03') {
            titleEl.textContent = "Ghi Nhận Phát Sinh & Sai Khác Hợp Đồng";
            bodyEl.innerHTML = `
                <div class="form-group" style="position: relative;">
                    <label>Công trình / Gói thầu liên kết</label>
                    ${renderSearchableBscSelect('form-bsc')}
                </div>
                <div class="form-group">
                    <label>Hạng mục</label>
                    <input type="text" id="form-hang-muc" class="form-control" placeholder="Tên cấu kiện phát sinh...">
                </div>
                <div class="form-group">
                    <label>Loại phát sinh</label>
                    <select id="form-loai" class="form-control">${renderOptions(db.danh_muc['Loại phát sinh'])}</select>
                </div>
                <div class="form-group">
                    <label>Mô tả chi tiết</label>
                    <textarea id="form-desc" class="form-control" style="height:80px;"></textarea>
                </div>
                <div class="form-group">
                    <label>Nguyên nhân gốc rễ</label>
                    <input type="text" id="form-cause" class="form-control">
                </div>
                <div class="form-group">
                    <label>Đề xuất giải pháp</label>
                    <input type="text" id="form-propose" class="form-control">
                </div>
                <div class="form-group">
                    <label>Giá trị dự kiến (Tỷ)</label>
                    <input type="number" step="0.01" id="form-val" class="form-control" value="0.5">
                </div>
                <div class="form-group">
                    <label>Ảnh hưởng tiến độ (Ngày chậm)</label>
                    <input type="number" id="form-delay" class="form-control" value="0">
                </div>
                <div class="form-group">
                    <label>Link, hồ sơ đính kèm</label>
                    <div style="display: flex; gap: 8px; flex-direction: column;">
                        <input type="text" id="form-link" class="form-control" placeholder="Nhập Link liên kết (URL) hoặc chọn tệp..." value="PS_TaiLieu.pdf">
                        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Hoặc tải tệp (PDF/ảnh):</span>
                            <input type="file" id="form-file-upload" accept="image/*,application/pdf" style="display: none;">
                            <button type="button" class="btn-action" onclick="document.getElementById('form-file-upload').click()" style="padding: 4px 10px; font-size: 0.75rem; border-color: rgba(59,130,246,0.3);">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Chọn Tệp
                            </button>
                            <span id="form-file-status" style="font-size: 0.75rem; color: var(--color-green); font-weight: 600;"></span>
                        </div>
                    </div>
                </div>
            `;
        } else if (target === 's04') {
            titleEl.textContent = "Đăng Ký Cung Ứng Vật Tư Đặc Thù";
            bodyEl.innerHTML = `
                <div class="form-group" style="position: relative;">
                    <label>Công trình / Gói thầu liên kết</label>
                    ${renderSearchableBscSelect('form-bsc')}
                </div>
                <div class="form-group">
                    <label>Hạng mục</label>
                    <input type="text" id="form-hang-muc" class="form-control">
                </div>
                <div class="form-group">
                    <label>Loại yêu cầu</label>
                    <select id="form-loai" class="form-control">${renderOptions(db.danh_muc['Loại YC cung ứng'])}</select>
                </div>
                <div class="form-group">
                    <label>Vật tư / Thiết bị đặc thù</label>
                    <input type="text" id="form-vattu" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Đặc tả kỹ thuật / Lý do cấp</label>
                    <input type="text" id="form-spec" class="form-control">
                </div>
                <div class="form-group">
                    <label>Khối lượng</label>
                    <input type="number" id="form-kl" class="form-control" value="100">
                </div>
                <div class="form-group">
                    <label>Đơn vị tính (ĐVT)</label>
                    <input type="text" id="form-dvt" class="form-control" value="m2">
                </div>
                <div class="form-group">
                    <label>Giá trị dự toán (Tỷ)</label>
                    <input type="number" step="0.01" id="form-val" class="form-control" value="0.2">
                </div>
                <div class="form-group">
                    <label>Target cung ứng</label>
                    <select id="form-target" class="form-control">
                        <option value="Ngoài HĐCU">Ngoài HĐCU</option>
                        <option value="Trong HĐCU">Trong HĐCU</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Link, hồ sơ đính kèm</label>
                    <div style="display: flex; gap: 8px; flex-direction: column;">
                        <input type="text" id="form-link" class="form-control" placeholder="Nhập Link liên kết (URL) hoặc chọn tệp..." value="YC_TaiLieu.pdf">
                        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Hoặc tải tệp (PDF/ảnh):</span>
                            <input type="file" id="form-file-upload" accept="image/*,application/pdf" style="display: none;">
                            <button type="button" class="btn-action" onclick="document.getElementById('form-file-upload').click()" style="padding: 4px 10px; font-size: 0.75rem; border-color: rgba(59,130,246,0.3);">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Chọn Tệp
                            </button>
                            <span id="form-file-status" style="font-size: 0.75rem; color: var(--color-green); font-weight: 600;"></span>
                        </div>
                    </div>
                </div>
            `;
        } else if (target === 's05') {
            titleEl.textContent = "Đăng Ký Phương Án Bù Tiến Độ Thi Công";
            bodyEl.innerHTML = `
                <div class="form-group" style="position: relative;">
                    <label>Công trình / Gói thầu liên kết</label>
                    ${renderSearchableBscSelect('form-bsc')}
                </div>
                <div class="form-group">
                    <label>Hạng mục</label>
                    <input type="text" id="form-hang-muc" class="form-control">
                </div>
                <div class="form-group">
                    <label>Mức độ chậm tiến độ (Ngày)</label>
                    <input type="number" id="form-delay" class="form-control" value="8" required>
                </div>
                <div class="form-group">
                    <label>Nguyên nhân chậm</label>
                    <input type="text" id="form-cause" class="form-control" placeholder="do thời tiết/nhân công...">
                </div>
                <div class="form-group">
                    <label>Giải pháp bù</label>
                    <select id="form-solution" class="form-control">${renderOptions(db.danh_muc['Giải pháp bù'])}</select>
                </div>
                <div class="form-group">
                    <label>Chi tiết phương án hành động</label>
                    <textarea id="form-detail" class="form-control" style="height:80px;"></textarea>
                </div>
                <div class="form-group">
                    <label>Mốc cam kết hoàn thành</label>
                    <input type="date" id="form-moc" class="form-control" value="2026-07-20">
                </div>
                <div class="form-group">
                    <label>Link, hồ sơ đính kèm</label>
                    <div style="display: flex; gap: 8px; flex-direction: column;">
                        <input type="text" id="form-link" class="form-control" placeholder="Nhập Link liên kết (URL) hoặc chọn tệp..." value="PA_BuTienDo.pdf">
                        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Hoặc tải tệp (PDF/ảnh):</span>
                            <input type="file" id="form-file-upload" accept="image/*,application/pdf" style="display: none;">
                            <button type="button" class="btn-action" onclick="document.getElementById('form-file-upload').click()" style="padding: 4px 10px; font-size: 0.75rem; border-color: rgba(59,130,246,0.3);">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Chọn Tệp
                            </button>
                            <span id="form-file-status" style="font-size: 0.75rem; color: var(--color-green); font-weight: 600;"></span>
                        </div>
                    </div>
                </div>
            `;
        }

        formModal.style.display = "flex";

        // Bind Base64 File Ingestion reader to form-file-upload
        const fileUploadEl = document.getElementById("form-file-upload");
        if (fileUploadEl) {
            fileUploadEl.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = function(event) {
                    // Update target input value to the Base64 Data URL
                    document.getElementById("form-link").value = event.target.result;
                    document.getElementById("form-file-status").textContent = `✔ Đã chọn: ${file.name}`;
                    showToast("Tải file", `Đã trích xuất và đính kèm tệp ${file.name} thành công.`, "success");
                };
                reader.readAsDataURL(file);
            });
        }

        // Initialize searchable select for BSC if wrapper exists
        if (document.getElementById("form-bsc-wrapper")) {
            const defaultVal = editRegistrationIndex !== -1 ? db[target][editRegistrationIndex]["Mã BSC"] : "";
            initSearchableSelect('form-bsc', bscOptions.map(opt => ({ value: opt.code, label: opt.name })), defaultVal);
        }

        // Auto pre-fill and disable form-maker with logged-in user
        if (document.getElementById("form-maker")) {
            document.getElementById("form-maker").value = currentUser ? currentUser.ho_ten : "Tổng thầu";
            document.getElementById("form-maker").disabled = true;
        }

        // Pre-fill input values if editing/resubmitting
        if (editRegistrationIndex !== -1) {
            titleEl.textContent = `Trình Lại & Cập Nhật Hồ Sơ: Sổ ${target.substring(1)}`;
            if (target === 's01') {
                const doc = db.s01[editRegistrationIndex];
                document.getElementById("form-hang-muc").value = doc["Hạng mục"] || "";
                document.getElementById("form-loai").value = doc["Loại hồ sơ"] || "";
                document.getElementById("form-name").value = doc["Tên sản phẩm / Số hiệu"] || "";
                document.getElementById("form-link").value = doc["LINK lưu trữ"] || "";
                document.getElementById("form-maker").value = doc["Người lập"] || "";
            } else if (target === 's02') {
                const doc = db.s02[editRegistrationIndex];
                document.getElementById("form-hang-muc").value = doc["Hạng mục"] || "";
                document.getElementById("form-thang").value = doc["Tháng"] || "";
                document.getElementById("form-loai").value = doc["Loại tài liệu"] || "";
                document.getElementById("form-noi-dung").value = doc["Nội dung chính"] || "";
                document.getElementById("form-dat-yckt").value = doc["Đạt YCKT CĐT"] || "Có";
                document.getElementById("form-link").value = doc["LINK tài liệu"] || "";
                document.getElementById("form-maker").value = doc["Người lập"] || "";
            } else if (target === 's03') {
                const doc = db.s03[editRegistrationIndex];
                document.getElementById("form-hang-muc").value = doc["Hạng mục"] || "";
                document.getElementById("form-loai").value = doc["Loại"] || "";
                document.getElementById("form-desc").value = doc["Mô tả"] || "";
                document.getElementById("form-cause").value = doc["Nguyên nhân"] || "";
                document.getElementById("form-propose").value = doc["Đề xuất xử lý"] || "";
                document.getElementById("form-val").value = doc["Giá trị (tỷ)"] || 0;
                document.getElementById("form-delay").value = doc["Ảnh hưởng TĐ (ngày)"] || 0;
                document.getElementById("form-link").value = doc["LINK hồ sơ"] || "";
            } else if (target === 's04') {
                const doc = db.s04[editRegistrationIndex];
                document.getElementById("form-hang-muc").value = doc["Hạng mục"] || "";
                document.getElementById("form-loai").value = doc["Loại YC"] || "";
                document.getElementById("form-vattu").value = doc["Vật tư/Thiết bị"] || "";
                document.getElementById("form-spec").value = doc["Đặc tả KT / Lý do"] || "";
                document.getElementById("form-kl").value = doc["KL"] || 100;
                document.getElementById("form-dvt").value = doc["ĐVT"] || "m2";
                document.getElementById("form-val").value = doc["Giá trị (tỷ)"] || 0;
                document.getElementById("form-target").value = doc["Trong/Target Ngoài HĐCU"] || doc["Trong/Ngoài HĐCU"] || "Ngoài HĐCU";
                document.getElementById("form-link").value = doc["LINK hồ sơ"] || "";
            } else if (target === 's05') {
                const doc = db.s05[editRegistrationIndex];
                document.getElementById("form-hang-muc").value = doc["Hạng mục"] || "";
                document.getElementById("form-delay").value = doc["Mức chậm (ngày)"] || 0;
                document.getElementById("form-cause").value = doc["Nguyên nhân"] || "";
                document.getElementById("form-solution").value = doc["Giải pháp bù"] || "";
                document.getElementById("form-detail").value = doc["Chi tiết giải pháp"] || doc["Chi tiết phương án"] || "";
                document.getElementById("form-moc").value = doc["Mốc cam kết HT"] || "";
                document.getElementById("form-link").value = doc["LINK phương án"] || "";
            }
        }
    }

    function renderOptions(array) {
        if (!array) return "";
        return array.map(v => `<option value="${v}">${v}</option>`).join("");
    }

    function renderBscOptions(options) {
        if (!options) return "";
        return options.map(opt => `<option value="${opt.code}">${opt.name}</option>`).join("");
    }

    function renderSearchableBscSelect(id, placeholder = "Nhập để tìm kiếm công trình / gói thầu...") {
        return `
            <div class="searchable-select-wrapper" id="${id}-wrapper">
                <input type="hidden" id="${id}" value="">
                <input type="text" id="${id}-search" class="form-control searchable-select-input" placeholder="${placeholder}" autocomplete="off">
                <div class="searchable-select-dropdown" id="${id}-dropdown" style="display: none;"></div>
            </div>
        `;
    }

    function initSearchableSelect(inputId, optionsList, defaultVal = "") {
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
                    <div class="searchable-select-option ${isSelected ? 'selected' : ''}" data-value="${opt.value}">
                        <span>${opt.label}</span>
                    </div>
                `;
            }).join("");
            
            // Bind mousedown to options (mousedown fires before blur closes dropdown!)
            dropdown.querySelectorAll(".searchable-select-option").forEach(optEl => {
                optEl.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    selectedValue = optEl.getAttribute("data-value");
                    hiddenInput.value = selectedValue;
                    searchInput.value = optEl.querySelector("span").textContent;
                    
                    // Trigger change event
                    hiddenInput.dispatchEvent(new Event("change"));
                    
                    // Auto fill Hạng mục for Sổ 01-05
                    const matchedPackage = db.master.find(r => String(r.ma_bsc).trim() === selectedValue);
                    const hangMucInput = document.getElementById("form-hang-muc");
                    if (matchedPackage && hangMucInput) {
                        hangMucInput.value = matchedPackage.hang_muc_work;
                    }

                    closeDropdown();
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
            
            // Revert search text to current selected label if invalid
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
            // Close dropdown shortly after blur to allow mousedown on options to register
            setTimeout(closeDropdown, 220);
        });
    }

    function closeModal() {
        formModal.style.display = "none";
        editRegistrationIndex = -1;
    }

    modalCloseBtn.addEventListener("click", closeModal);
    modalCancelBtn.addEventListener("click", closeModal);

    // Save Form Values to Local Database
    modalSaveBtn.addEventListener("click", () => {
        if (currentFormTarget === 'master') {
            const bsc = document.getElementById("form-ma-bsc").value.trim();
            if (bsc === "") { alert("Vui lòng nhập Mã BSC"); return; }
            
            // Check uniqueness
            const exist = db.master.find(r => String(r.ma_bsc).trim() === bsc);
            if (exist) { alert("Mã BSC này đã tồn tại!"); return; }

            const newRow = {
                tt: db.master.length + 1,
                ma_bsc: bsc,
                goi_thau_pl: document.getElementById("form-goi-thau-pl").value,
                nhom_ct: document.getElementById("form-nhom-ct").value,
                hang_muc_work: document.getElementById("form-work-name").value,
                phu_trach: document.getElementById("form-phu-trach").value,
                ngay_bd_yc: document.getElementById("form-start-date").value,
                ngay_kt_yc: document.getElementById("form-end-date").value,
                ngan_sach: parseFloat(document.getElementById("form-ngan-sach").value) || 0,
                tt_hstktc: 'Chưa có TK',
                tt_specs: 'Chưa có',
                tt_boq_kl: 'Chưa bàn giao',
                tt_lcnt: 'Chưa LCNT',
                tt_ky_hdcu: 'Chưa CU',
                tt_khcu: 'Chưa lập',
                tt_khtk: 'Chưa trình',
                gia_tri_hdcu: 0,
                percent_hdcu_ns: 0,
                dieu_kien_du: 'THIẾU ĐK'
            };

            db.master.push(newRow);
            showToast("Thêm gói thầu", "Đã khởi tạo gói thầu mới trên bảng Master Grid.", "success");
            renderMasterGrid();
        } else if (currentFormTarget === 'master_edit') {
            if (editRowIndex < 0) return;
            const row = db.master[editRowIndex];
            
            const bsc = document.getElementById("edit-form-ma-bsc").value.trim();
            
            if (bsc !== "" && bsc !== row.ma_bsc) {
                const exist = db.master.find((r, idx) => idx !== editRowIndex && String(r.ma_bsc).trim() === bsc);
                if (exist) { alert("Mã BSC này đã tồn tại!"); return; }
            }
            
            row.tt = document.getElementById("edit-form-tt").value;
            row.ma_bsc = bsc;
            row.goi_thau_pl = document.getElementById("edit-form-goi-thau-pl").value;
            row.nhom_ct = document.getElementById("edit-form-nhom-ct").value;
            row.hang_muc_work = document.getElementById("edit-form-work-name").value;
            row.phu_trach = document.getElementById("edit-form-phu-trach").value;
            row.ngan_sach = parseFloat(document.getElementById("edit-form-ngan-sach").value) || 0;
            row.gia_tri_hdcu = parseFloat(document.getElementById("edit-form-gia-tri-hdcu").value) || 0;
            row.ngay_bd_yc = document.getElementById("edit-form-start-date").value;
            row.ngay_kt_yc = document.getElementById("edit-form-end-date").value;
            row.ngay_bd_khoi_cong = document.getElementById("edit-form-start-actual").value;
            
            row.tt_hstktc = document.getElementById("edit-form-tt-hstktc").value;
            row.tt_specs = document.getElementById("edit-form-tt-specs").value;
            row.tt_boq_kl = document.getElementById("edit-form-tt-boq-kl").value;
            row.tt_lcnt = document.getElementById("edit-form-tt-lcnt").value;
            row.tt_ky_hdcu = document.getElementById("edit-form-tt-ky-hdcu").value;
            row.tt_khcu = document.getElementById("edit-form-tt-khcu").value;

            // Save progress fields safely
            const getBillionInput = (id) => {
                const el = document.getElementById(id);
                if (!el || el.value === "") return "";
                const val = parseFloat(el.value);
                return isNaN(val) ? "" : val;
            };
            const getValInput = (id) => {
                const el = document.getElementById(id);
                return el ? el.value.trim() : "";
            };

            const isContractor = currentUser && currentUser.quyen === 'Contractor';
            const isLocked = isContractor && row.progress_status === 'Chờ duyệt';

            if (!isLocked) {
                const progData = {
                    qa_kh_klcv_thang: getBillionInput("form-p-kh-thang"),
                    qa_kq_klcv_thang: getBillionInput("form-p-kq-thang"),
                    qa_danh_gia_thang: getValInput("form-p-dg-thang"),
                    
                    t1_kh: getBillionInput("form-p-t1-kh"),
                    t1_kq: getBillionInput("form-p-t1-kq"),
                    t1_dg: getValInput("form-p-t1-dg"),
                    
                    t2_kh: getBillionInput("form-p-t2-kh"),
                    t2_kq: getBillionInput("form-p-t2-kq"),
                    t2_dg: getValInput("form-p-t2-dg"),
                    
                    t3_kh: getBillionInput("form-p-t3-kh"),
                    t3_kq: getBillionInput("form-p-t3-kq"),
                    t3_dg: getValInput("form-p-t3-dg"),
                    
                    t4_kh: getBillionInput("form-p-t4-kh"),
                    t4_kq: getBillionInput("form-p-t4-kq"),
                    t4_dg: getValInput("form-p-t4-dg")
                };

                if (isContractor) {
                    row.pending_progress = progData;
                    row.progress_status = "Chờ duyệt";
                    row.progress_ly_do_tu_choi = "";
                    showToast("Gửi đề xuất", `Đã gửi đề xuất cập nhật tiến độ dòng ${row.tt} cho TVGS/Ban QLDA phê duyệt.`, "success");
                } else {
                    // Admins and TVGS update directly
                    Object.assign(row, progData);
                    row.progress_status = "Đã duyệt";
                    row.progress_ly_do_tu_choi = "";
                    row.pending_progress = null;
                    showToast("Cập nhật thầu", `Đã lưu và phê duyệt trực tiếp tiến độ dòng ${row.tt} thành công.`, "success");
                }
            } else {
                showToast("Cập nhật thầu", `Đã lưu thông tin chung cho dòng ${row.tt} thành công.`, "success");
            }

            saveDatabase();
            closeModal();
            renderMasterGrid();
        } else if (currentFormTarget === 's01') {
            if (editRegistrationIndex !== -1) {
                const doc = db.s01[editRegistrationIndex];
                doc["Mã BSC"] = document.getElementById("form-bsc").value;
                doc["Hạng mục"] = document.getElementById("form-hang-muc").value;
                doc["Loại hồ sơ"] = document.getElementById("form-loai").value;
                doc["Tên sản phẩm / Số hiệu"] = document.getElementById("form-name").value;
                doc["LINK lưu trữ"] = document.getElementById("form-link").value;
                doc["Ngày HT"] = getSystemDateGMT7();
                doc["Người lập"] = document.getElementById("form-maker").value;
                doc["TT duyệt"] = "Chờ duyệt";
                doc["Lý do từ chối"] = "";
                showToast("Sổ 01", "Đã cập nhật và trình lại hồ sơ khởi công thành công.", "success");
                editRegistrationIndex = -1;
            } else {
                const newDoc = {
                    "STT": db.s01.length + 1,
                    "Mã BSC": document.getElementById("form-bsc").value,
                    "Hạng mục": document.getElementById("form-hang-muc").value,
                    "Loại hồ sơ": document.getElementById("form-loai").value,
                    "Tên sản phẩm / Số hiệu": document.getElementById("form-name").value,
                    "LINK lưu trữ": document.getElementById("form-link").value,
                    "Ngày HT": getSystemDateGMT7(),
                    "Người lập": document.getElementById("form-maker").value,
                    "Người duyệt": "CĐT",
                    "TT duyệt": "Chờ duyệt"
                };
                db.s01.push(newDoc);
                showToast("Sổ 01", "Đã đăng ký hồ sơ khởi công. Đang chờ duyệt.", "success");
            }
            renderS01();
        } else if (currentFormTarget === 's02') {
            if (editRegistrationIndex !== -1) {
                const doc = db.s02[editRegistrationIndex];
                doc["Mã BSC"] = document.getElementById("form-bsc").value;
                doc["Hạng mục"] = document.getElementById("form-hang-muc").value;
                doc["Tháng"] = document.getElementById("form-thang").value;
                doc["Loại tài liệu"] = document.getElementById("form-loai").value;
                doc["Nội dung chính"] = document.getElementById("form-noi-dung").value;
                doc["Đạt YCKT CĐT"] = document.getElementById("form-dat-yckt").value;
                doc["LINK tài liệu"] = document.getElementById("form-link").value;
                doc["Người lập"] = document.getElementById("form-maker").value;
                doc["TT lập"] = "Tổng thầu";
                doc["TT duyệt"] = "Chờ duyệt";
                doc["Lý do từ chối"] = "";
                showToast("Sổ 02", "Đã cập nhật và trình lại kế hoạch tuần/tháng thành công.", "success");
                editRegistrationIndex = -1;
            } else {
                const newDoc = {
                    "STT": db.s02.length + 1,
                    "Mã BSC": document.getElementById("form-bsc").value,
                    "Hạng mục": document.getElementById("form-hang-muc").value,
                    "Tháng": document.getElementById("form-thang").value,
                    "Loại tài liệu": document.getElementById("form-loai").value,
                    "Nội dung chính": document.getElementById("form-noi-dung").value,
                    "Đạt YCKT CĐT": document.getElementById("form-dat-yckt").value,
                    "LINK tài liệu": document.getElementById("form-link").value,
                    "TT lập": "Tổng thầu",
                    "TT duyệt": "Chờ duyệt",
                    "Người lập": document.getElementById("form-maker").value,
                    "Người duyệt": "TVGS",
                    "Ngày duyệt": ""
                };
                db.s02.push(newDoc);
                showToast("Sổ 02", "Đã đăng ký kế hoạch tuần/tháng thành công.", "success");
            }
            renderS02();
        } else if (currentFormTarget === 's03') {
            const bsc = document.getElementById("form-bsc").value;
            if (editRegistrationIndex !== -1) {
                const doc = db.s03[editRegistrationIndex];
                doc["Mã BSC"] = bsc;
                doc["Hạng mục"] = document.getElementById("form-hang-muc").value;
                doc["Ngày PS"] = getSystemDateGMT7();
                doc["Loại"] = document.getElementById("form-loai").value;
                doc["Mô tả"] = document.getElementById("form-desc").value;
                doc["Nguyên nhân"] = document.getElementById("form-cause").value;
                doc["Đề xuất xử lý"] = document.getElementById("form-propose").value;
                doc["Giá trị (tỷ)"] = parseFloat(document.getElementById("form-val").value) || 0;
                doc["Ảnh hưởng TĐ (ngày)"] = parseInt(document.getElementById("form-delay").value) || 0;
                doc["LINK hồ sơ"] = document.getElementById("form-link").value;
                doc["TT duyệt"] = "Chờ duyệt";
                doc["Lý do từ chối"] = "";
                showToast("Sổ 03", "Đã cập nhật và trình lại yêu cầu phát sinh thành công.", "success");
                editRegistrationIndex = -1;
            } else {
                const newPs = {
                    "Mã PS": `PS.CT01.${String(db.s03.length + 1).padStart(2, '0')}`,
                    "Mã BSC": bsc,
                    "Hạng mục": document.getElementById("form-hang-muc").value,
                    "Ngày PS": getSystemDateGMT7(),
                    "Loại": document.getElementById("form-loai").value,
                    "Mô tả": document.getElementById("form-desc").value,
                    "Nguyên nhân": document.getElementById("form-cause").value,
                    "Đề xuất xử lý": document.getElementById("form-propose").value,
                    "Giá trị (tỷ)": parseFloat(document.getElementById("form-val").value) || 0,
                    "Ảnh hưởng TĐ (ngày)": parseInt(document.getElementById("form-delay").value) || 0,
                    "LINK hồ sơ": document.getElementById("form-link").value,
                    "TT duyệt": "Chờ duyệt",
                    "Người duyệt": "",
                    "Ngày duyệt": "",
                    "Người lập": currentUser ? currentUser.ho_ten : "Tổng thầu"
                };
                db.s03.push(newPs);
                showToast("Sổ 03", "Đã ghi nhận yêu cầu phát sinh mới thành công.", "success");
            }
            renderS03();
        } else if (currentFormTarget === 's04') {
            if (editRegistrationIndex !== -1) {
                const doc = db.s04[editRegistrationIndex];
                doc["Mã BSC"] = document.getElementById("form-bsc").value;
                doc["Hạng mục"] = document.getElementById("form-hang-muc").value;
                doc["Ngày YC"] = getSystemDateGMT7();
                doc["Loại YC"] = document.getElementById("form-loai").value;
                doc["Vật tư/Thiết bị"] = document.getElementById("form-vattu").value;
                doc["Đặc tả KT / Lý do"] = document.getElementById("form-spec").value;
                doc["KL"] = parseFloat(document.getElementById("form-kl").value) || 0;
                doc["ĐVT"] = document.getElementById("form-dvt").value;
                doc["Giá trị (tỷ)"] = parseFloat(document.getElementById("form-val").value) || 0;
                doc["Trong/Target Ngoài HĐCU"] = document.getElementById("form-target").value;
                doc["LINK hồ sơ"] = document.getElementById("form-link").value;
                doc["TT duyệt"] = "Chờ duyệt";
                doc["Lý do từ chối"] = "";
                showToast("Sổ 04", "Đã cập nhật và trình lại yêu cầu cung ứng vật tư thành công.", "success");
                editRegistrationIndex = -1;
            } else {
                const newCu = {
                    "Mã YC": `YC.CT01.${String(db.s04.length + 1).padStart(2, '0')}`,
                    "Mã BSC": document.getElementById("form-bsc").value,
                    "Hạng mục": document.getElementById("form-hang-muc").value,
                    "Ngày YC": getSystemDateGMT7(),
                    "Loại YC": document.getElementById("form-loai").value,
                    "Vật tư/Thiết bị": document.getElementById("form-vattu").value,
                    "Đặc tả KT / Lý do": document.getElementById("form-spec").value,
                    "KL": parseFloat(document.getElementById("form-kl").value) || 0,
                    "ĐVT": document.getElementById("form-dvt").value,
                    "Giá trị (tỷ)": parseFloat(document.getElementById("form-val").value) || 0,
                    "Trong/Target Ngoài HĐCU": document.getElementById("form-target").value,
                    "LINK hồ sơ": document.getElementById("form-link").value,
                    "TT duyệt": "Chờ duyệt",
                    "TT cung ứng": "Chưa cung ứng",
                    "Người lập": currentUser ? currentUser.ho_ten : "Tổng thầu"
                };
                db.s04.push(newCu);
                showToast("Sổ 04", "Đã đăng ký yêu cầu vật tư cung ứng đặc thù.", "success");
            }
            renderS04();
        } else if (currentFormTarget === 's05') {
            const bsc = document.getElementById("form-bsc").value;
            const delayDays = parseInt(document.getElementById("form-delay").value) || 0;
            if (editRegistrationIndex !== -1) {
                const doc = db.s05[editRegistrationIndex];
                doc["Mã BSC"] = bsc;
                doc["Hạng mục"] = document.getElementById("form-hang-muc").value;
                doc["Ngày phát hiện"] = getSystemDateGMT7();
                doc["Mức chậm (ngày)"] = delayDays;
                doc["Nguyên nhân"] = document.getElementById("form-cause").value;
                doc["Giải pháp bù"] = document.getElementById("form-solution").value;
                doc["Chi tiết giải pháp"] = document.getElementById("form-detail").value;
                doc["Mốc cam kết HT"] = document.getElementById("form-moc").value;
                doc["LINK phương án"] = document.getElementById("form-link").value;
                doc["TT duyệt"] = "Chờ duyệt";
                doc["Lý do từ chối"] = "";
                showToast("Sổ 05", "Đã cập nhật và trình lại phương án bù tiến độ thành công.", "success");
                editRegistrationIndex = -1;
            } else {
                const newS05 = {
                    "STT": db.s05.length + 1,
                    "Mã BSC": bsc,
                    "Hạng mục": document.getElementById("form-hang-muc").value,
                    "Ngày phát hiện": getSystemDateGMT7(),
                    "Mức chậm (ngày)": delayDays,
                    "Nguyên nhân": document.getElementById("form-cause").value,
                    "Giải pháp bù": document.getElementById("form-solution").value,
                    "Chi tiết giải pháp": document.getElementById("form-detail").value,
                    "Mốc cam kết HT": document.getElementById("form-moc").value,
                    "LINK phương án": document.getElementById("form-link").value,
                    "TT duyệt": "Chờ duyệt",
                    "KQ thực hiện bù": "Tổng thầu cam kết bù tiến độ",
                    "TT thực hiện": "Đang thực hiện",
                    "Người lập": currentUser ? currentUser.ho_ten : "Tổng thầu"
                };
                db.s05.push(newS05);
                showToast("Sổ 05", "Đã đăng ký hồ sơ bù tiến độ.", "success");
            }

            // PREDICTIVE AI TRIGGER: If delay days > 7 days
            if (delayDays > 7) {
                const packageRow = db.master.find(r => String(r.ma_bsc).trim() === bsc);
                const plannedEnd = packageRow ? packageRow.ngay_kt_yc : "2026-09-30";
                
                // Fetch prescriptive recommendations
                const advice = GeminiAI.prescriptiveDelayAdvice(bsc, delayDays, plannedEnd);
                
                // Format response in chatbot sidebar
                triggerAiChatAlert(advice);
            }

            renderS05();
        } else if (currentFormTarget === 'personnel') {
            const name = document.getElementById("p-name").value.trim();
            const email = document.getElementById("p-email").value.trim();
            if (name === "" || email === "") { alert("Vui lòng điền đủ Họ tên và Email"); return; }
            
            const newP = {
                stt: db.nhan_su.length + 1,
                ho_ten: name,
                email: email,
                phong_ban: document.getElementById("p-dept").value,
                vai_tro: document.getElementById("p-role").value,
                quyen: document.getElementById("p-auth").value,
                mat_khau: document.getElementById("p-password").value.trim() || "123456",
                quyen_them: document.getElementById("p-can-add").checked,
                quyen_sua: document.getElementById("p-can-edit").checked,
                quyen_xoa: document.getElementById("p-can-delete").checked,
                goi_thau: document.getElementById("p-package").value || "Tất cả các gói"
            };
            db.nhan_su.push(newP);
            showToast("Thêm Nhân Sự", `Đã đăng ký nhân sự ${name} vào dự án.`, "success");
            renderPersonnel();
        } else if (currentFormTarget === 'personnel_edit') {
            if (editPersonnelIndex < 0) return;
            const row = db.nhan_su[editPersonnelIndex];
            row.ho_ten = document.getElementById("p-name").value.trim();
            row.email = document.getElementById("p-email").value.trim();
            row.phong_ban = document.getElementById("p-dept").value;
            row.vai_tro = document.getElementById("p-role").value;
            row.quyen = document.getElementById("p-auth").value;
            row.mat_khau = document.getElementById("p-password").value.trim() || "123456";
            row.quyen_them = document.getElementById("p-can-add").checked;
            row.quyen_sua = document.getElementById("p-can-edit").checked;
            row.quyen_xoa = document.getElementById("p-can-delete").checked;
            row.goi_thau = document.getElementById("p-package").value || "Tất cả các gói";
            
            // If edited user is the current active session user, update session details
            if (currentUser && currentUser.email === row.email) {
                currentUser = row;
                currentRole = row.quyen;
                sessionStorage.setItem("current_user", JSON.stringify(row));
                applyUserSession();
            }
            
            showToast("Sửa Nhân Sự", `Đã cập nhật thông tin cho nhân sự ${row.ho_ten}.`, "success");
            renderPersonnel();
        }

        // Recalculate Master values instantly
        calculateRollups();
        saveDatabase();
        closeModal();
    });

    // 8.5 EXCEL EXPORT (PRESERVING ORIGINAL TEMPLATE STYLING & FORMULAS)
    function copyCellFormat(srcCell, destCell) {
        if (srcCell.font) destCell.font = Object.assign({}, srcCell.font);
        if (srcCell.fill) destCell.fill = Object.assign({}, srcCell.fill);
        if (srcCell.border) destCell.border = Object.assign({}, srcCell.border);
        if (srcCell.alignment) destCell.alignment = Object.assign({}, srcCell.alignment);
        if (srcCell.numFmt) destCell.numFmt = srcCell.numFmt;
    }

    async function fillRegistrySheet(workbook, sheetName, startRow, dbData, totalCols, mapRowFunc, headers) {
        let sheet = workbook.getWorksheet(sheetName);
        if (!sheet) {
            sheet = workbook.addWorksheet(sheetName);
        }
        
        // Add headers programmatically if sheet is newly created/empty
        if (sheet.rowCount < startRow && headers) {
            sheet.addRow([]); // Row 1
            const hRow = sheet.addRow(headers); // Row 2
            hRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            hRow.height = 24;
            for (let c = 1; c <= totalCols; c++) {
                hRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
                hRow.getCell(c).border = {
                    top: { style: 'thin', color: { argb: 'FF334155' } },
                    bottom: { style: 'thin', color: { argb: 'FF334155' } },
                    left: { style: 'thin', color: { argb: 'FF334155' } },
                    right: { style: 'thin', color: { argb: 'FF334155' } }
                };
            }
        }
        
        // Clear extra rows in the template
        const totalRowsInSheet = sheet.rowCount;
        for (let r = startRow + dbData.length; r <= totalRowsInSheet; r++) {
            const row = sheet.getRow(r);
            for (let c = 1; c <= totalCols; c++) {
                row.getCell(c).value = null;
            }
        }
        
        // Write records
        dbData.forEach((rowObj, i) => {
            const r = startRow + i;
            // Copy styles if new row (only if template rows exist)
            if (r > startRow && sheet.getRow(startRow) && !sheet.getRow(r).getCell(1).font) {
                const srcRow = sheet.getRow(startRow);
                const destRow = sheet.getRow(r);
                destRow.height = srcRow.height || 20;
                for (let c = 1; c <= totalCols; c++) {
                    copyCellFormat(srcRow.getCell(c), destRow.getCell(c));
                }
            } else if (r > startRow && !sheet.getRow(r).getCell(1).font) {
                // Add clean fallback borders and styles for generated sheets
                const destRow = sheet.getRow(r);
                destRow.height = 20;
                for (let c = 1; c <= totalCols; c++) {
                    destRow.getCell(c).font = { name: 'Arial', size: 9 };
                    destRow.getCell(c).border = {
                        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                    };
                }
            }
            
            const row = sheet.getRow(r);
            mapRowFunc(row, rowObj, r, i);
        });
    }

    async function exportToExcel() {
        showToast("Xuất Excel", "Đang phân tích dữ liệu và khởi tạo tệp Excel...", "info");
        
        function parseDateSafe(val) {
            if (!val) return null;
            const str = String(val).trim().toLowerCase();
            if (str === "" || str === "none" || str === "null" || str === "undefined" || str === "invalid date") return null;
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d;
        }

        try {
            let templateLoaded = false;
            const workbook = new ExcelJS.Workbook();
            
            try {
                const res = await fetch("TDG_Masterfile BQLDA.xlsx");
                if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    await workbook.xlsx.load(arrayBuffer);
                    templateLoaded = true;
                    console.log("Successfully loaded local Excel template file.");
                } else {
                    console.warn("Template fetch returned status:", res.status);
                }
            } catch (err) {
                console.warn("Failed to load local Excel template file, building programmatically...", err);
            }

            // Build dynamic tree hierarchy
            const flatHierarchy = [];
            const seenGrandParents = new Set();

            db.master.forEach(row => {
                const bsc = String(row.ma_bsc || "").trim();
                const goiThauPl = String(row.goi_thau_pl || "").trim();
                const isParentPackage = bsc !== "";

                if (isParentPackage && goiThauPl !== "" && !seenGrandParents.has(goiThauPl)) {
                    seenGrandParents.add(goiThauPl);
                    flatHierarchy.push({
                        type: "grand_parent",
                        id: goiThauPl,
                        tt: "",
                        nhom_ct: row.nhom_ct,
                        hang_muc_work: `GÓI THẦU ${row.nhom_ct} (${goiThauPl})`,
                        phu_trach: "",
                        row_ref: row
                    });
                }

                if (isParentPackage) {
                    flatHierarchy.push({
                        type: "parent",
                        id: bsc,
                        parentId: goiThauPl,
                        row_ref: row
                    });
                } else {
                    let parentBsc = "";
                    let parentGrandParentId = "";
                    for (let k = flatHierarchy.length - 1; k >= 0; k--) {
                        if (flatHierarchy[k].type === "parent") {
                            parentBsc = flatHierarchy[k].id;
                            parentGrandParentId = flatHierarchy[k].parentId;
                            break;
                        }
                    }
                    flatHierarchy.push({
                        type: "child",
                        id: String(row.tt),
                        parentId: parentBsc,
                        grandParentId: parentGrandParentId,
                        row_ref: row
                    });
                }
            });

            if (!templateLoaded) {
                console.log("Creating BANG TONG HOP sheet from scratch.");
                const sheetMaster = workbook.addWorksheet('BANG TONG HOP');
                
                // Add header info
                const titleRow = sheetMaster.addRow(["BÁO CÁO TỔNG HỢP TIẾN ĐỘ & NGÂN SÁCH DỰ ÁN VSV - TDG GROUP"]);
                titleRow.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
                sheetMaster.addRow([]); // empty spacing
                
                const headerRow1 = sheetMaster.addRow([
                    "TT", "Mã BSC", "Gói thầu (PL)", "Nhóm CT", "Hạng mục / Công việc", "Phụ trách",
                    "A. Đầu vào CĐT (Tiến độ - Ngân sách - HSKT)", "", "", "", "", "", "",
                    "B. Kế hoạch Cung ứng & Triển khai", "", "", "", "", "", "",
                    "D. Chốt Chặn Khởi Công", "", "", "", "",
                    "E. Ngân sách & Chi phí", "", "",
                    "F. Giám sát Biến Động Hàng Tháng / Tuần", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
                ]);
                headerRow1.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
                headerRow1.height = 24;
                
                const headerRow2 = sheetMaster.addRow([
                    "", "", "", "", "", "",
                    "Ngày BĐ (YC)", "Ngày KT (YC)", "Ngân sách (tỷ)", "KH HSTKTC", "TT HSTKTC", "TT SPECS", "TT BOQ/KL",
                    "KH LCNT", "TT LCNT", "KH Ký HĐCU", "TT Ký HĐCU", "KH PD KHCU", "TT KHCU", "Giá trị HĐCU (tỷ)", "Tỷ lệ HĐ/NS",
                    "KH Ký PLHĐ", "TT Ký PLHĐ", "KH PD KHTK", "TT KHTK",
                    "ĐK1 HSKT", "ĐK2 HĐCU", "ĐK3 KHTK", "ĐIỀU KIỆN ĐỦ", "NGÀY BĐ KHỞI CÔNG",
                    "Lũy Kế HĐ A-B (tỷ)", "Lũy Kế Phát Sinh B-B' (tỷ)", "Lũy Kế Tổng Chi Phí (tỷ)",
                    "Tài liệu KH Tháng", "Phát sinh chưa duyệt", "Yêu cầu Cung ứng", "Bù Tiến Độ đang chạy",
                    "QA KH Tháng", "QA KQ Tháng", "QA ĐG Tháng",
                    "TC KH Tháng", "TC KQ Tháng", "TC ĐG Tháng",
                    "T1 KH", "T1 KQ", "T1 DG",
                    "T2 KH", "T2 KQ", "T2 DG",
                    "T3 KH", "T3 KQ", "T3 DG",
                    "T4 KH", "T4 KQ", "T4 DG"
                ]);
                headerRow2.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
                headerRow2.height = 24;

                // Style scratch header rows
                for (let col = 1; col <= 56; col++) {
                    headerRow1.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
                    headerRow2.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
                    headerRow1.getCell(col).border = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
                }
            }

            const sheetMaster = workbook.getWorksheet('BANG TONG HOP');
            const startRow = templateLoaded ? 6 : 5;

            if (sheetMaster) {
                // Clear extra rows
                const totalRowsInSheet = sheetMaster.rowCount;
                for (let r = startRow + flatHierarchy.length; r <= totalRowsInSheet; r++) {
                    const row = sheetMaster.getRow(r);
                    for (let c = 1; c <= 56; c++) {
                        row.getCell(c).value = null;
                    }
                }

                // Write rows
                flatHierarchy.forEach((item, i) => {
                    const r = startRow + i;
                    const row = sheetMaster.getRow(r);
                    const rowObj = item.row_ref;

                    if (templateLoaded && r > startRow && !row.getCell(1).font) {
                        const srcRow = sheetMaster.getRow(startRow);
                        row.height = srcRow.height;
                        for (let c = 1; c <= 56; c++) {
                            copyCellFormat(srcRow.getCell(c), row.getCell(c));
                        }
                    } else if (!templateLoaded) {
                        row.height = 20;
                        for (let c = 1; c <= 56; c++) {
                            row.getCell(c).font = { name: 'Arial', size: 9 };
                            row.getCell(c).border = {
                                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                            };
                        }
                    }

                    if (item.type === 'grand_parent') {
                        sheetMaster.mergeCells(r, 1, r, 56);
                        const cell = row.getCell(1);
                        cell.value = item.hang_muc_work.toUpperCase();
                        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
                        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                        row.height = 26;
                    } else if (rowObj) {
                        row.getCell(1).value = rowObj.tt;
                        row.getCell(2).value = rowObj.ma_bsc;
                        row.getCell(3).value = rowObj.goi_thau_pl;
                        row.getCell(4).value = rowObj.nhom_ct;
                        row.getCell(5).value = item.type === 'child' ? "   " + rowObj.hang_muc_work : rowObj.hang_muc_work;
                        row.getCell(6).value = rowObj.phu_trach;
                        row.getCell(7).value = parseDateSafe(rowObj.ngay_bd_yc);
                        row.getCell(8).value = parseDateSafe(rowObj.ngay_kt_yc);
                        row.getCell(9).value = parseFloat(rowObj.ngan_sach) || 0;
                        row.getCell(10).value = parseDateSafe(rowObj.kh_phat_hanh_hstktc);
                        row.getCell(11).value = rowObj.tt_hstktc || null;
                        row.getCell(12).value = rowObj.tt_specs || null;
                        row.getCell(13).value = rowObj.tt_boq_kl || null;
                        row.getCell(14).value = parseDateSafe(rowObj.kh_lcnt);
                        row.getCell(15).value = rowObj.tt_lcnt || null;
                        row.getCell(16).value = parseDateSafe(rowObj.kh_ky_hdcu);
                        row.getCell(17).value = rowObj.tt_ky_hdcu || null;
                        row.getCell(18).value = parseDateSafe(rowObj.kh_pd_khcu);
                        row.getCell(19).value = rowObj.tt_khcu || null;
                        row.getCell(20).value = parseFloat(rowObj.gia_tri_hdcu) || 0;

                        row.getCell(21).value = { formula: `IF(OR(I${r}="",T${r}=""),"",T${r}/I${r})` };
                        
                        row.getCell(22).value = parseDateSafe(rowObj.kh_ky_plhd_cdt);
                        row.getCell(23).value = rowObj.tt_ky_plhd_cdt || null;
                        row.getCell(24).value = parseDateSafe(rowObj.kh_pd_khtk);
                        row.getCell(25).value = rowObj.tt_khtk || null;

                        row.getCell(26).value = { formula: `IF($B${r}="","",IF(AND(OR(K${r}="Đã phát hành",K${r}="Hoàn thiện"),M${r}="Đã bàn giao"),"✔","✘"))` };
                        row.getCell(27).value = { formula: `IF($B${r}="","",IF(Q${r}="Đã CU","✔","✘"))` };
                        row.getCell(28).value = { formula: `IF($B${r}="","",IF(Y${r}="Đã duyệt","✔","✘"))` };
                        row.getCell(29).value = { formula: `IF($B${r}="","",IF(AND(Z${r}="✔",AA${r}="✔",AB${r}="✔"),"ĐỦ ĐK KHỞI CÔNG","THIẾU ĐK"))` };

                        row.getCell(30).value = parseDateSafe(rowObj.ngay_bd_khoi_cong);

                        row.getCell(31).value = { formula: `IF($B${r}="","",COUNTIFS('01_HSo TienKC'!$B:$B,$B${r},'01_HSo TienKC'!$J:$J,"Đã duyệt"))` };

                        row.getCell(32).value = { formula: `T${r}` };
                        row.getCell(33).value = { formula: `SUMIFS('03_Phat sinh'!$J:$J,'03_Phat sinh'!$C:$C,$B${r},'03_Phat sinh'!$M:$M,"Đã duyệt")` };
                        row.getCell(34).value = { formula: `AF${r}+AG${r}` };

                        row.getCell(35).value = { formula: `IF($B${r}="","",COUNTIFS('02_KH Thang_Tuan'!$B:$B,$B${r},'02_KH Thang_Tuan'!$J:$J,"Đã duyệt")&"/"&COUNTIFS('02_KH Thang_Tuan'!$B:$B,$B${r}))` };
                        row.getCell(36).value = { formula: `IF($B${r}="","",COUNTIFS('03_Phat sinh'!$C:$C,$B${r},'03_Phat sinh'!$M:$M,"<>Đã duyệt"))` };
                        row.getCell(37).value = { formula: `IF($B${r}="","",COUNTIFS('04_CU dac thu'!$C:$C,$B${r},'04_CU dac thu'!$N:$N,"<>Đã duyệt"))` };
                        row.getCell(38).value = { formula: `IF($B${r}="","",COUNTIFS('05_Bu tien do'!$B:$B,$B${r},'05_Bu tien do'!$N:$N,"<>Đã hoàn thành"))` };

                        row.getCell(39).value = rowObj.qa_kh_klcv_thang !== undefined ? parseFloat(rowObj.qa_kh_klcv_thang) : null;
                        row.getCell(40).value = rowObj.qa_kq_klcv_thang !== undefined ? parseFloat(rowObj.qa_kq_klcv_thang) : null;
                        row.getCell(41).value = rowObj.qa_danh_gia_thang || null;
                        row.getCell(42).value = rowObj.tc_kh_klcv_thang !== undefined ? parseFloat(rowObj.tc_kh_klcv_thang) : null;
                        row.getCell(43).value = rowObj.tc_kq_klcv_thang !== undefined ? parseFloat(rowObj.tc_kq_klcv_thang) : null;
                        row.getCell(44).value = rowObj.tc_danh_gia_thang || null;

                        row.getCell(45).value = rowObj.t1_kh !== undefined ? parseFloat(rowObj.t1_kh) : null;
                        row.getCell(46).value = rowObj.t1_kq !== undefined ? parseFloat(rowObj.t1_kq) : null;
                        row.getCell(47).value = rowObj.t1_dg || null;

                        row.getCell(48).value = rowObj.t2_kh !== undefined ? parseFloat(rowObj.t2_kh) : null;
                        row.getCell(49).value = rowObj.t2_kq !== undefined ? parseFloat(rowObj.t2_kq) : null;
                        row.getCell(50).value = rowObj.t2_dg || null;

                        row.getCell(51).value = rowObj.t3_kh !== undefined ? parseFloat(rowObj.t3_kh) : null;
                        row.getCell(52).value = rowObj.t3_kq !== undefined ? parseFloat(rowObj.t3_kq) : null;
                        row.getCell(53).value = rowObj.t3_dg || null;

                        row.getCell(54).value = rowObj.t4_kh !== undefined ? parseFloat(rowObj.t4_kh) : null;
                        row.getCell(55).value = rowObj.t4_kq !== undefined ? parseFloat(rowObj.t4_kq) : null;
                        row.getCell(56).value = rowObj.t4_dg || null;

                        if (item.type === 'parent') {
                            const isCritical = isPackageLocked(item.id);
                            const bgColor = isCritical ? 'FFFEE2E2' : 'FFF1F5F9';
                            const fgColor = isCritical ? 'FFB91C1C' : 'FF334155';
                            for (let c = 1; c <= 56; c++) {
                                const cell = row.getCell(c);
                                cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: fgColor } };
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                            }
                        } else if (item.type === 'child') {
                            for (let c = 1; c <= 56; c++) {
                                const cell = row.getCell(c);
                                cell.font = { name: 'Arial', size: 9, bold: false, color: { argb: 'FF475569' } };
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
                            }
                        }
                    }
                });
            }

            // 2. Write Sổ 01
            await fillRegistrySheet(workbook, '01_HSo TienKC', 3, db.s01, 10, (row, rowObj, r, i) => {
                row.getCell(1).value = i + 1;
                row.getCell(2).value = rowObj["Mã BSC"];
                row.getCell(3).value = rowObj["Hạng mục"];
                row.getCell(4).value = rowObj["Loại hồ sơ"];
                row.getCell(5).value = rowObj["Tên sản phẩm / Số hiệu"];
                row.getCell(6).value = rowObj["LINK lưu trữ"];
                row.getCell(7).value = parseDateSafe(rowObj["Ngày HT"]);
                row.getCell(8).value = rowObj["Người lập"];
                row.getCell(9).value = rowObj["Người duyệt"];
                row.getCell(10).value = rowObj["TT duyệt"];
            }, ["STT", "Mã BSC", "Hạng mục", "Loại hồ sơ", "Tên sản phẩm / Số hiệu", "LINK lưu trữ", "Ngày HT", "Người lập", "Người duyệt", "TT duyệt"]);

            // 3. Write Sổ 02
            await fillRegistrySheet(workbook, '02_KH Thang_Tuan', 3, db.s02, 13, (row, rowObj, r, i) => {
                row.getCell(1).value = i + 1;
                row.getCell(2).value = rowObj["Mã BSC"];
                row.getCell(3).value = rowObj["Hạng mục"];
                row.getCell(4).value = rowObj["Tháng"];
                row.getCell(5).value = rowObj["Loại tài liệu"];
                row.getCell(6).value = rowObj["Nội dung chính"];
                row.getCell(7).value = rowObj["Đạt YCKT CĐT"];
                row.getCell(8).value = rowObj["LINK tài liệu"];
                row.getCell(9).value = rowObj["TT lập"];
                row.getCell(10).value = rowObj["TT duyệt"];
                row.getCell(11).value = rowObj["Người lập"];
                row.getCell(12).value = rowObj["Người duyệt"];
                row.getCell(13).value = parseDateSafe(rowObj["Ngày duyệt"]);
            }, ["STT", "Mã BSC", "Hạng mục", "Tháng", "Loại tài liệu", "Nội dung chính", "Đạt YCKT CĐT", "LINK tài liệu", "TT lập", "TT duyệt", "Người lập", "Người duyệt", "Ngày duyệt"]);

            // 4. Write Sổ 03
            await fillRegistrySheet(workbook, '03_Phat sinh', 3, db.s03, 17, (row, rowObj, r, i) => {
                row.getCell(1).value = i + 1;
                row.getCell(2).value = rowObj["Mã PS"];
                row.getCell(3).value = rowObj["Mã BSC"];
                row.getCell(4).value = rowObj["Hạng mục"];
                row.getCell(5).value = parseDateSafe(rowObj["Ngày PS"]);
                row.getCell(6).value = rowObj["Loại"];
                row.getCell(7).value = rowObj["Mô tả"];
                row.getCell(8).value = rowObj["Nguyên nhân"];
                row.getCell(9).value = rowObj["Đề xuất xử lý"];
                row.getCell(10).value = parseFloat(rowObj["Giá trị (tỷ)"]) || 0;
                row.getCell(11).value = parseInt(rowObj["Ảnh hưởng TĐ (ngày)"]) || 0;
                row.getCell(12).value = rowObj["LINK hồ sơ"];
                row.getCell(13).value = rowObj["TT duyệt"];
                row.getCell(14).value = rowObj["Người duyệt"];
                row.getCell(15).value = parseDateSafe(rowObj["Ngày duyệt"]);
                row.getCell(16).value = rowObj["Nội dung điều chỉnh (KH→KQ)"] || rowObj["Nội dung điều chỉnh"] || "";
                row.getCell(17).value = rowObj["Ghi chú"] || "";
            }, ["STT", "Mã PS", "Mã BSC", "Hạng mục", "Ngày PS", "Loại", "Mô tả", "Nguyên nhân", "Đề xuất xử lý", "Giá trị (tỷ)", "Ảnh hưởng TĐ (ngày)", "LINK hồ sơ", "TT duyệt", "Người duyệt", "Ngày duyệt", "Nội dung điều chỉnh", "Ghi chú"]);

            // 5. Write Sổ 04
            await fillRegistrySheet(workbook, '04_CU dac thu', 3, db.s04, 18, (row, rowObj, r, i) => {
                row.getCell(1).value = i + 1;
                row.getCell(2).value = rowObj["Mã YC"];
                row.getCell(3).value = rowObj["Mã BSC"];
                row.getCell(4).value = rowObj["Hạng mục"];
                row.getCell(5).value = parseDateSafe(rowObj["Ngày YC"]);
                row.getCell(6).value = rowObj["Loại YC"];
                row.getCell(7).value = rowObj["Vật tư / Thiết bị"] || rowObj["Vật tư/Thiết bị"];
                row.getCell(8).value = rowObj["Đặc tả KT / Lý do"];
                row.getCell(9).value = parseFloat(rowObj["KL"]) || 0;
                row.getCell(10).value = rowObj["ĐVT"];
                row.getCell(11).value = parseFloat(rowObj["Giá trị (tỷ)"]) || 0;
                row.getCell(12).value = rowObj["Trong/Target Ngoài HĐCU"] || rowObj["Trong/Ngoài HĐCU"];
                row.getCell(13).value = rowObj["LINK hồ sơ"];
                row.getCell(14).value = rowObj["TT duyệt"];
                row.getCell(15).value = rowObj["Người duyệt"];
                row.getCell(16).value = parseDateSafe(rowObj["Ngày cần"]);
                row.getCell(17).value = rowObj["TT cung ứng"];
                row.getCell(18).value = rowObj["Ghi chú"] || "";
            }, ["STT", "Mã YC", "Mã BSC", "Hạng mục", "Ngày YC", "Loại YC", "Vật tư / Thiết bị", "Đặc tả KT / Lý do", "KL", "ĐVT", "Giá trị (tỷ)", "Trong/Ngoài HĐCU", "LINK hồ sơ", "TT duyệt", "Người duyệt", "Ngày cần", "TT cung ứng", "Ghi chú"]);

            // 6. Write Sổ 05
            await fillRegistrySheet(workbook, '05_Bu tien do', 3, db.s05, 15, (row, rowObj, r, i) => {
                row.getCell(1).value = i + 1;
                row.getCell(2).value = rowObj["Mã BSC"];
                row.getCell(3).value = rowObj["Hạng mục"];
                row.getCell(4).value = parseDateSafe(rowObj["Ngày phát hiện"]);
                row.getCell(5).value = parseInt(rowObj["Mức chậm (ngày)"]) || 0;
                row.getCell(6).value = rowObj["Nguyên nhân"];
                row.getCell(7).value = rowObj["Giải pháp bù"];
                row.getCell(8).value = rowObj["Chi tiết giải pháp"] || rowObj["Chi tiết phương án"];
                row.getCell(9).value = parseDateSafe(rowObj["Mốc cam kết HT"]);
                row.getCell(10).value = rowObj["LINK phương án"];
                row.getCell(11).value = rowObj["TT duyệt"];
                row.getCell(12).value = rowObj["Người duyệt"] || "";
                row.getCell(13).value = rowObj["KQ thực hiện bù"];
                row.getCell(14).value = rowObj["TT thực hiện"];
                row.getCell(15).value = rowObj["Ghi chú"] || "";
            }, ["STT", "Mã BSC", "Hạng mục", "Ngày phát hiện", "Mức chậm (ngày)", "Nguyên nhân", "Giải pháp bù", "Chi tiết giải pháp", "Mốc cam kết HT", "LINK phương án", "TT duyệt", "Người duyệt", "KQ thực hiện bù", "TT thực hiện", "Ghi chú"]);

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `TDG_Masterfile_Exported_${new Date().toISOString().substring(0, 10)}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast("Xuất Excel", "Đã xuất dữ liệu Excel bảo lưu định dạng gốc thành công!", "success");
        } catch (error) {
            console.error("Lỗi xuất Excel:", error);
            showToast("Lỗi Xuất Excel", "Có lỗi xảy ra khi tạo file Excel: " + error.message, "danger");
        }
    }

    // Opening modals buttons mapping
    document.getElementById("btn-add-package").addEventListener("click", () => openModalForm('master'));
    document.getElementById("btn-export-excel").addEventListener("click", exportToExcel);
    document.getElementById("btn-add-s01").addEventListener("click", () => openModalForm('s01'));
    document.getElementById("btn-add-s02").addEventListener("click", () => openModalForm('s02'));
    document.getElementById("btn-add-s03").addEventListener("click", () => openModalForm('s03'));
    document.getElementById("btn-add-s04").addEventListener("click", () => openModalForm('s04'));
    document.getElementById("btn-add-s05").addEventListener("click", () => openModalForm('s05'));

    // 9. GEMINI AI AGENT INTERFACE (Speech, Synthesis, OCR Forms fill)
    const chatInput = document.getElementById("ai-chat-input");
    const sendBtn = document.getElementById("ai-send-btn");
    const micBtn = document.getElementById("ai-mic-btn");
    const chatHistory = document.getElementById("ai-chat-history");

    // Send chat text command to Gemini (Supports prompt check and document OCR routing)
    async function handleAiSubmit() {
        const text = chatInput.value.trim();
        if (text === "") return;

        appendChatMessage("user", text);
        chatInput.value = "";

        const docMatch = text.match(/\[TÀI LIỆU:\s*(.*?)\]/);
        
        if (docMatch) {
            let docType = 's03';
            if (text.toLowerCase().includes('biểu mẫu s01')) docType = 's01';
            else if (text.toLowerCase().includes('biểu mẫu s02')) docType = 's02';
            else if (text.toLowerCase().includes('biểu mẫu s03')) docType = 's03';
            else if (text.toLowerCase().includes('biểu mẫu s04')) docType = 's04';
            else if (text.toLowerCase().includes('biểu mẫu s05')) docType = 's05';
            
            // Extract file content between --- boundaries
            const contentMatch = text.match(/---([\s\S]*?)---/);
            const fileContent = contentMatch ? contentMatch[1].trim() : text;
            const filename = docMatch[1].trim();
            
            await runRealAIOCR(fileContent, docType, filename);
        } else {
            const botBubble = appendChatMessage("bot", "<i>Gemini AI Agent đang phân tích...</i>");
            try {
                const answer = await GeminiAI.callGeminiAPI(text);
                botBubble.innerHTML = formatMarkdown(answer);
            } catch (e) {
                botBubble.innerHTML = `<span style="color:var(--color-red);">Lỗi: ${e.message}</span>`;
            }
        }
        
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    sendBtn.addEventListener("click", handleAiSubmit);
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleAiSubmit();
        }
    });

    // AI speech query (Web Speech API)
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'vi-VN';

        micBtn.addEventListener("click", () => {
            if (micBtn.classList.contains("listening")) {
                recognition.stop();
            } else {
                micBtn.classList.add("listening");
                recognition.start();
                showToast("Giọng nói", "Đang nghe... Vui lòng nói to rõ ràng.", "info");
            }
        });

        recognition.onresult = (event) => {
            const result = event.results[0][0].transcript;
            chatInput.value = result;
            micBtn.classList.remove("listening");
            handleAiSubmit();
        };

        recognition.onerror = (event) => {
            console.error(event.error);
            micBtn.classList.remove("listening");
            showToast("Giọng nói", "Lỗi nhận dạng giọng nói, vui lòng thử lại.", "danger");
        };

        recognition.onend = () => {
            micBtn.classList.remove("listening");
        };
    } else {
        micBtn.style.display = "none"; // Hide if not supported
    }

    // Ingestion File OCR & Excel Importer
    const dropzone = document.getElementById("ai-upload-dropzone");
    const fileInput = document.getElementById("ai-file-input");

    async function importExcelData(file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const data = new Uint8Array(e.target.result);
            let workbook;
            try {
                workbook = XLSX.read(data, {type: 'array', cellDates: true});
            } catch (err) {
                showToast("Lỗi Excel", "Không thể đọc file Excel. Vui lòng kiểm tra định dạng file.", "danger");
                return;
            }
            
            // Show loading bubble in AI chat
            appendChatMessage("user", `Tôi muốn tải lên file Excel: ${file.name}`);
            const botBubble = appendChatMessage("bot", `<i>Gemini AI Agent đang đọc và phân tích cấu trúc file Excel "${file.name}"...</i>`);
            
            try {
                let masterRows = [];
                let s01Rows = [];
                let s02Rows = [];
                let s03Rows = [];
                let s04Rows = [];
                let s05Rows = [];
                
                // 1. Parse BANG TONG HOP
                if (workbook.Sheets['BANG TONG HOP']) {
                    const sheet = workbook.Sheets['BANG TONG HOP'];
                    const rows = XLSX.utils.sheet_to_json(sheet, {header: 1});
                    
                    const headers = [
                        "tt", "ma_bsc", "goi_thau_pl", "nhom_ct", "hang_muc_work", "phu_trach",
                        "ngay_bd_yc", "ngay_kt_yc", "ngan_sach", "kh_phat_hanh_hstktc",
                        "tt_hstktc", "tt_specs", "tt_boq_kl", "kh_lcnt", "tt_lcnt", "kh_ky_hdcu",
                        "tt_ky_hdcu", "kh_pd_khcu", "tt_khcu", "gia_tri_hdcu", "percent_hdcu_ns",
                        "kh_ky_plhd_cdt", "tt_ky_plhd_cdt", "kh_pd_khtk", "tt_khtk",
                        "dk1_hskt", "dk2_hdcu", "dk3_khtk", "dieu_kien_du", "ngay_bd_khoi_cong",
                        "hs_tien_kc_duyet", "luy_ke_ab", "luy_ke_bb", "luy_ke_tong_chi_phi",
                        "tai_lieu_kh_thang", "phat_sinh_chua_duyet", "yc_cung_ung_cho_duyet", "bu_tien_do_dang_chay",
                        "qa_kh_klcv_thang", "qa_kq_klcv_thang", "qa_danh_gia_thang",
                        "tc_kh_klcv_thang", "tc_kq_klcv_thang", "tc_danh_gia_thang",
                        "t1_kh", "t1_kq", "t1_dg",
                        "t2_kh", "t2_kq", "t2_dg",
                        "t3_kh", "t3_kq", "t3_dg",
                        "t4_kh", "t4_kq", "t4_dg"
                    ];
                    
                    for (let i = 5; i < rows.length; i++) {
                        const r = rows[i];
                        if (!r || r.length === 0) continue;
                        const ttVal = r[0];
                        if (!ttVal || String(ttVal).trim() === "" || String(ttVal).includes("TRANG") || String(ttVal).includes("HOÀN THÀNH")) {
                            continue;
                        }
                        
                        const rec = {};
                        headers.forEach((h, colIdx) => {
                            let val = r[colIdx];
                            if (val === undefined || val === null) {
                                rec[h] = "";
                            } else if (val instanceof Date) {
                                rec[h] = val.toISOString().substring(0, 10);
                            } else {
                                rec[h] = val;
                            }
                        });
                        masterRows.push(rec);
                    }
                }
                
                // Helper to parse sub sheets
                function parseSubSheet(sheetName, headerRowIndex) {
                    if (!workbook.Sheets[sheetName]) return [];
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, {header: 1});
                    if (rows.length <= headerRowIndex) return [];
                    
                    const sheetHeaders = rows[headerRowIndex].map(h => String(h || "").trim());
                    const parsed = [];
                    for (let i = headerRowIndex + 1; i < rows.length; i++) {
                        const r = rows[i];
                        if (!r || r.length === 0 || !r[0] || String(r[0]).trim() === "") continue;
                        
                        const rec = {};
                        sheetHeaders.forEach((h, colIdx) => {
                            let val = r[colIdx];
                            if (val === undefined || val === null) {
                                rec[h] = "";
                            } else if (val instanceof Date) {
                                rec[h] = val.toISOString().substring(0, 10);
                            } else {
                                rec[h] = val;
                            }
                        });
                        parsed.push(rec);
                    }
                    return parsed;
                }
                
                s01Rows = parseSubSheet('01_HSo TienKC', 1);
                s02Rows = parseSubSheet('02_KH Thang_Tuan', 1);
                s03Rows = parseSubSheet('03_Phat sinh', 1);
                s04Rows = parseSubSheet('04_CU dac thu', 1);
                s05Rows = parseSubSheet('05_Bu tien do', 1);
                
                // Trigger Gemini AI validation prompt
                const aiReport = await GeminiAI.callGeminiAPI(`
                Tôi vừa tải lên file CSDL dự án mới chứa:
                - ${masterRows.length} dòng gói thầu Master
                - ${s01Rows.length} dòng Sổ 01 (Tiền khởi công)
                - ${s02Rows.length} dòng Sổ 02 (KH tuần/tháng)
                - ${s03Rows.length} dòng Sổ 03 (Phát sinh)
                - ${s04Rows.length} dòng Sổ 04 (Cung ứng)
                - ${s05Rows.length} dòng Sổ 05 (Bù tiến độ)
                Hãy viết báo cáo phân tích kiểm tra định dạng và cấu trúc dữ liệu, xác nhận import thành công các bảng vào hệ thống ERP.
                `);
                
                // Merge data back to state
                if (masterRows.length > 0) db.master = masterRows;
                if (s01Rows.length > 0) db.s01 = s01Rows;
                if (s02Rows.length > 0) db.s02 = s02Rows;
                if (s03Rows.length > 0) db.s03 = s03Rows;
                if (s04Rows.length > 0) db.s04 = s04Rows;
                if (s05Rows.length > 0) db.s05 = s05Rows;
                
                calculateRollups();
                saveDatabase();
                
                botBubble.innerHTML = `
                    <h4><i class="fa-solid fa-circle-check" style="color:var(--color-green);"></i> IMPORT CSDL THÀNH CÔNG!</h4>
                    Dữ liệu từ file Excel đã được Gemini AI đọc và ghi nhận chính xác vào cấu trúc quan hệ ERP:<br>
                    <ul style="margin: 8px 0 8px 18px; font-size: 0.8rem; display:flex; flex-direction:column; gap:4px;">
                        <li><b>Bảng Master:</b> Đã cập nhật ${masterRows.length} hạng mục/gói thầu.</li>
                        <li><b>Sổ 01 (Tiền khởi công):</b> Đã cập nhật ${s01Rows.length} hồ sơ.</li>
                        <li><b>Sổ 02 (KH Tuần/Tháng):</b> Đã cập nhật ${s02Rows.length} tài liệu kế hoạch.</li>
                        <li><b>Sổ 03 (Phát sinh):</b> Đã cập nhật ${s03Rows.length} bản ghi phát sinh.</li>
                        <li><b>Sổ 04 (Cung ứng đặc thù):</b> Đã cập nhật ${s04Rows.length} yêu cầu vật tư.</li>
                        <li><b>Sổ 05 (Bù tiến độ):</b> Đã cập nhật ${s05Rows.length} mốc bù tiến độ thi công.</li>
                    </ul>
                    <hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">
                    ${formatMarkdown(aiReport)}
                `;
                
                showToast("AI Excel Ingestor", "Đã đọc và import dữ liệu Excel thành công!", "success");
                
                renderDashboard();
                renderMasterGrid();
                
            } catch (error) {
                console.error(error);
                botBubble.innerHTML = `<span style="color:var(--color-red);"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi Import Excel: ${error.message}</span>`;
                showToast("AI Excel Ingestor", "Lỗi đọc file Excel. Vui lòng kiểm tra lại định dạng.", "danger");
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // Dynamically create a hidden input for document uploads
    const docPicker = document.createElement("input");
    docPicker.type = "file";
    docPicker.id = "ai-document-picker";
    docPicker.accept = ".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx";
    docPicker.style.display = "none";
    document.body.appendChild(docPicker);

    let activeOcrDocType = 's03';

    docPicker.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const isTxt = file.name.endsWith('.txt');
        if (isTxt) {
            const textReader = new FileReader();
            textReader.onload = async function(evt) {
                const plainText = evt.target.result;
                const base64Text = btoa(unescape(encodeURIComponent(plainText)));
                await processDocumentDirectly(base64Text, "text/plain", activeOcrDocType, file.name);
            };
            textReader.readAsText(file);
        } else {
            const reader = new FileReader();
            reader.onload = async function(evt) {
                const dataUrl = evt.target.result;
                const base64Data = dataUrl.split(',')[1];
                const mimeType = file.type || "application/pdf";
                await processDocumentDirectly(base64Data, mimeType, activeOcrDocType, file.name);
            };
            reader.readAsDataURL(file);
        }
        // Reset picker
        docPicker.value = "";
    });

    async function processDocumentDirectly(base64Data, mimeType, docType, filename) {
        showToast("Gemini OCR", `Đang phân tích tài liệu "${filename}"...`, "info");
        
        // Show a premium loading overlay
        const loadingDiv = document.createElement("div");
        loadingDiv.id = "ocr-loading-overlay";
        loadingDiv.style = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #fff; font-family: inherit;";
        loadingDiv.innerHTML = `
            <div class="spinner" style="border: 4px solid rgba(255,255,255,0.1); border-left-color: var(--color-ai-primary); width: 50px; height: 50px; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px;"></div>
            <div style="font-weight: 600; font-size: 1.15rem; color: var(--color-ai-primary);">Gemini AI đang bóc tách tài liệu...</div>
            <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 8px;">Vui lòng đợi trong giây lát.</div>
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;
        document.body.appendChild(loadingDiv);

        try {
            const answer = await GeminiAI.parseMultimodalDocument(base64Data, mimeType, docType);
            
            // Extract JSON
            let jsonStr = answer;
            const match = answer.match(/```json\s*([\s\S]*?)\s*```/) || answer.match(/```\s*([\s\S]*?)\s*```/);
            if (match) {
                jsonStr = match[1];
            }
            
            let data = {};
            try {
                data = JSON.parse(jsonStr.trim());
            } catch (err) {
                console.error("Failed to parse JSON from AI response:", jsonStr);
                throw new Error("Phản hồi từ AI không đúng định dạng JSON yêu cầu.");
            }

            // Remove loading overlay
            const overlay = document.getElementById("ocr-loading-overlay");
            if (overlay) overlay.remove();

            // Open the target form modal
            openModalForm(docType);
            
            // Auto fill fields
            setTimeout(() => {
                if (docType === 's01') {
                    if (document.getElementById("form-bsc")) document.getElementById("form-bsc").value = data.ma_bsc || "";
                    if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                    if (document.getElementById("form-loai")) document.getElementById("form-loai").value = data.loai_ho_so || "";
                    if (document.getElementById("form-name")) document.getElementById("form-name").value = data.ten_san_pham || "";
                    if (document.getElementById("form-link")) document.getElementById("form-link").value = data.link_luu_tru || "";
                    if (document.getElementById("form-maker")) document.getElementById("form-maker").value = data.nguoi_lap || "";
                } else if (docType === 's02') {
                    if (document.getElementById("form-bsc")) document.getElementById("form-bsc").value = data.ma_bsc || "";
                    if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                    if (document.getElementById("form-s02-loai")) document.getElementById("form-s02-loai").value = data.loai_tai_lieu || "";
                    if (document.getElementById("form-s02-tuan-thang")) document.getElementById("form-s02-tuan-thang").value = data.thang_tuan || "";
                    if (document.getElementById("form-s02-noi-dung")) document.getElementById("form-s02-noi-dung").value = data.noi_dung || "";
                    if (document.getElementById("form-s02-dat-yckt")) document.getElementById("form-s02-dat-yckt").value = data.dat_yckt || "Đạt";
                    if (document.getElementById("form-s02-link")) document.getElementById("form-s02-link").value = data.link || "";
                    if (document.getElementById("form-s02-nguoi-lap")) document.getElementById("form-s02-nguoi-lap").value = data.nguoi_lap || "";
                } else if (docType === 's03') {
                    if (document.getElementById("form-bsc")) document.getElementById("form-bsc").value = data.ma_bsc || "";
                    if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                    if (document.getElementById("form-loai")) document.getElementById("form-loai").value = data.loai_ps || "";
                    if (document.getElementById("form-desc")) document.getElementById("form-desc").value = data.mo_ta || "";
                    if (document.getElementById("form-cause")) document.getElementById("form-cause").value = data.nguyen_nhan || "";
                    if (document.getElementById("form-propose")) document.getElementById("form-propose").value = data.de_xuat || "";
                    if (document.getElementById("form-val")) document.getElementById("form-val").value = data.gia_tri || "";
                    if (document.getElementById("form-delay")) document.getElementById("form-delay").value = data.tre_han || "";
                    if (document.getElementById("form-link")) document.getElementById("form-link").value = data.link_hs || "";
                } else if (docType === 's04') {
                    if (document.getElementById("form-bsc")) document.getElementById("form-bsc").value = data.ma_bsc || "";
                    if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                    if (document.getElementById("form-loai")) document.getElementById("form-loai").value = data.loai_yc || "";
                    if (document.getElementById("form-vattu")) document.getElementById("form-vattu").value = data.vattu || "";
                    if (document.getElementById("form-spec")) document.getElementById("form-spec").value = data.dac_ta || "";
                    if (document.getElementById("form-kl")) document.getElementById("form-kl").value = data.kl || "";
                    if (document.getElementById("form-dvt")) document.getElementById("form-dvt").value = data.dvt || "";
                    if (document.getElementById("form-val")) document.getElementById("form-val").value = data.gia_tri || "";
                    if (document.getElementById("form-target")) document.getElementById("form-target").value = data.trong_ngoai || "";
                    if (document.getElementById("form-link")) document.getElementById("form-link").value = data.link_hs || "";
                } else if (docType === 's05') {
                    if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                    if (document.getElementById("form-date")) document.getElementById("form-date").value = data.ngay_phat_hien || "";
                    if (document.getElementById("form-delay")) document.getElementById("form-delay").value = data.muc_cham || "";
                    if (document.getElementById("form-cause")) document.getElementById("form-cause").value = data.nguyen_nhan || "";
                    if (document.getElementById("form-solution")) document.getElementById("form-solution").value = data.giai_phap || "";
                    if (document.getElementById("form-detail")) document.getElementById("form-detail").value = data.chi_tiet || "";
                    if (document.getElementById("form-moc")) document.getElementById("form-moc").value = data.moc_cam_ket || "";
                    if (document.getElementById("form-link")) document.getElementById("form-link").value = data.link_hs || "";
                }
                showToast("Form Filler", "Đã bóc tách và điền tự động dữ liệu vào form thành công!", "success");
            }, 400);

        } catch (e) {
            console.error(e);
            const overlay = document.getElementById("ocr-loading-overlay");
            if (overlay) overlay.remove();
            showToast("Lỗi Phân Tích", "Lỗi phân tích tài liệu: " + e.message, "danger");
        }
    }

dropzone.addEventListener("click", () => fileInput.click());
    
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            importExcelData(file);
        } else {
            let docType = 's03';
            if (file.name.toLowerCase().includes('s01') || file.name.toLowerCase().includes('tiền khởi công') || file.name.toLowerCase().includes('tienkc')) docType = 's01';
            else if (file.name.toLowerCase().includes('s02') || file.name.toLowerCase().includes('kế hoạch') || file.name.toLowerCase().includes('kehoach')) docType = 's02';
            else if (file.name.toLowerCase().includes('s03') || file.name.toLowerCase().includes('phát sinh') || file.name.toLowerCase().includes('phatsinh')) docType = 's03';
            else if (file.name.toLowerCase().includes('s04') || file.name.toLowerCase().includes('cung ứng') || file.name.toLowerCase().includes('cungung')) docType = 's04';
            else if (file.name.toLowerCase().includes('s05') || file.name.toLowerCase().includes('bù tiến độ') || file.name.toLowerCase().includes('butiendo')) docType = 's05';

            const isTxt = file.name.endsWith('.txt');
            if (isTxt) {
                const textReader = new FileReader();
                textReader.onload = async function(evt) {
                    const plainText = evt.target.result;
                    const base64Text = btoa(unescape(encodeURIComponent(plainText)));
                    await processDocumentDirectly(base64Text, "text/plain", docType, file.name);
                };
                textReader.readAsText(file);
            } else {
                const reader = new FileReader();
                reader.onload = async function(evt) {
                    const dataUrl = evt.target.result;
                    const base64Data = dataUrl.split(',')[1];
                    const mimeType = file.type || "application/pdf";
                    await processDocumentDirectly(base64Data, mimeType, docType, file.name);
                };
                reader.readAsDataURL(file);
            }
        }
    });

    // Drag-and-drop handlers
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--color-ai-primary)";
    });
    
    dropzone.addEventListener("dragleave", () => {
        dropzone.style.borderColor = "var(--border-color-glow)";
    });
    
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--border-color-glow)";
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            importExcelData(file);
        } else {
            let docType = 's03';
            if (file.name.toLowerCase().includes('s01') || file.name.toLowerCase().includes('tiền khởi công') || file.name.toLowerCase().includes('tienkc')) docType = 's01';
            else if (file.name.toLowerCase().includes('s02') || file.name.toLowerCase().includes('kế hoạch') || file.name.toLowerCase().includes('kehoach')) docType = 's02';
            else if (file.name.toLowerCase().includes('s03') || file.name.toLowerCase().includes('phát sinh') || file.name.toLowerCase().includes('phatsinh')) docType = 's03';
            else if (file.name.toLowerCase().includes('s04') || file.name.toLowerCase().includes('cung ứng') || file.name.toLowerCase().includes('cungung')) docType = 's04';
            else if (file.name.toLowerCase().includes('s05') || file.name.toLowerCase().includes('bù tiến độ') || file.name.toLowerCase().includes('butiendo')) docType = 's05';

            const isTxt = file.name.endsWith('.txt');
            if (isTxt) {
                const textReader = new FileReader();
                textReader.onload = async function(evt) {
                    const plainText = evt.target.result;
                    const base64Text = btoa(unescape(encodeURIComponent(plainText)));
                    await processDocumentDirectly(base64Text, "text/plain", docType, file.name);
                };
                textReader.readAsText(file);
            } else {
                const reader = new FileReader();
                reader.onload = async function(evt) {
                    const dataUrl = evt.target.result;
                    const base64Data = dataUrl.split(',')[1];
                    const mimeType = file.type || "application/pdf";
                    await processDocumentDirectly(base64Data, mimeType, docType, file.name);
                };
                reader.readAsDataURL(file);
            }
        }
    });

    // Click demo files handler
    document.getElementById("demo-doc-s03").addEventListener("click", () => {
        activeOcrDocType = 's03';
        docPicker.click();
    });
    
    document.getElementById("demo-doc-s04").addEventListener("click", () => {
        activeOcrDocType = 's04';
        docPicker.click();
    });
    
    document.getElementById("demo-doc-s05").addEventListener("click", () => {
        activeOcrDocType = 's05';
        docPicker.click();
    });

    // Helper functions for proposal formatting
    function generateProposalTableRows(data, docType) {
        const labels = {
            ma_bsc: "Mã BSC / Gói thầu",
            hang_muc: "Hạng mục công việc",
            loai_ho_so: "Loại hồ sơ",
            ten_san_pham: "Tên sản phẩm / Số hiệu",
            link_luu_tru: "Tệp đính kèm",
            nguoi_lap: "Người lập",
            loai_tai_lieu: "Loại tài liệu",
            thang_tuan: "Tháng/Tuần",
            noi_dung: "Nội dung chính",
            dat_yckt: "Đạt YCKT CĐT",
            link: "Tệp đính kèm",
            loai_ps: "Loại phát sinh",
            mo_ta: "Mô tả chi tiết",
            nguyen_nhan: "Nguyên nhân chính",
            de_xuat: "Đề xuất giải pháp",
            gia_tri: "Giá trị (tỷ đồng)",
            tre_han: "Trễ hạn (ngày)",
            link_hs: "Tệp đính kèm",
            loai_yc: "Loại yêu cầu",
            vattu: "Tên vật tư",
            dac_ta: "Đặc tả kỹ thuật",
            kl: "Khối lượng",
            dvt: "Đơn vị tính",
            trong_ngoai: "Trong/Ngoài HĐCU",
            ngay_phat_hien: "Ngày phát hiện",
            muc_cham: "Mức chậm (ngày)",
            giai_phap: "Giải pháp khắc phục",
            chi_tiet: "Chi tiết hành động",
            moc_cam_ket: "Mốc cam kết hoàn thành"
        };
        
        return Object.entries(data).map(([key, val]) => {
            const label = labels[key] || key;
            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 6px 4px; font-weight:600; color: var(--color-ai-primary);">${label}</td>
                    <td style="padding: 6px 4px; color: var(--text-primary);">${val !== null && val !== undefined ? val : '<span style="color:var(--text-muted); font-style:italic;">Không có</span>'}</td>
                </tr>
            `;
        }).join("");
    }

    window.acceptAIProposal = function(docType) {
        const data = window.lastExtractedData;
        if (!data) return;
        
        openModalForm(docType);
        
        setTimeout(() => {
            if (docType === 's01') {
                if (document.getElementById("form-bsc")) document.getElementById("form-bsc").value = data.ma_bsc || "";
                if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                if (document.getElementById("form-loai")) document.getElementById("form-loai").value = data.loai_ho_so || "";
                if (document.getElementById("form-name")) document.getElementById("form-name").value = data.ten_san_pham || "";
                if (document.getElementById("form-link")) document.getElementById("form-link").value = data.link_luu_tru || "";
                if (document.getElementById("form-maker")) document.getElementById("form-maker").value = data.nguoi_lap || "";
            } else if (docType === 's02') {
                if (document.getElementById("form-bsc")) document.getElementById("form-bsc").value = data.ma_bsc || "";
                if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                if (document.getElementById("form-s02-loai")) document.getElementById("form-s02-loai").value = data.loai_tai_lieu || "";
                if (document.getElementById("form-s02-tuan-thang")) document.getElementById("form-s02-tuan-thang").value = data.thang_tuan || "";
                if (document.getElementById("form-s02-noi-dung")) document.getElementById("form-s02-noi-dung").value = data.noi_dung || "";
                if (document.getElementById("form-s02-dat-yckt")) document.getElementById("form-s02-dat-yckt").value = data.dat_yckt || "Đạt";
                if (document.getElementById("form-s02-link")) document.getElementById("form-s02-link").value = data.link || "";
                if (document.getElementById("form-s02-nguoi-lap")) document.getElementById("form-s02-nguoi-lap").value = data.nguoi_lap || "";
            } else if (docType === 's03') {
                if (document.getElementById("form-bsc")) document.getElementById("form-bsc").value = data.ma_bsc || "";
                if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                if (document.getElementById("form-loai")) document.getElementById("form-loai").value = data.loai_ps || "";
                if (document.getElementById("form-desc")) document.getElementById("form-desc").value = data.mo_ta || "";
                if (document.getElementById("form-cause")) document.getElementById("form-cause").value = data.nguyen_nhan || "";
                if (document.getElementById("form-propose")) document.getElementById("form-propose").value = data.de_xuat || "";
                if (document.getElementById("form-val")) document.getElementById("form-val").value = data.gia_tri || "";
                if (document.getElementById("form-delay")) document.getElementById("form-delay").value = data.tre_han || "";
                if (document.getElementById("form-link")) document.getElementById("form-link").value = data.link_hs || "";
            } else if (docType === 's04') {
                if (document.getElementById("form-bsc")) document.getElementById("form-bsc").value = data.ma_bsc || "";
                if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                if (document.getElementById("form-loai")) document.getElementById("form-loai").value = data.loai_yc || "";
                if (document.getElementById("form-vattu")) document.getElementById("form-vattu").value = data.vattu || "";
                if (document.getElementById("form-spec")) document.getElementById("form-spec").value = data.dac_ta || "";
                if (document.getElementById("form-kl")) document.getElementById("form-kl").value = data.kl || "";
                if (document.getElementById("form-dvt")) document.getElementById("form-dvt").value = data.dvt || "";
                if (document.getElementById("form-val")) document.getElementById("form-val").value = data.gia_tri || "";
                if (document.getElementById("form-target")) document.getElementById("form-target").value = data.trong_ngoai || "";
                if (document.getElementById("form-link")) document.getElementById("form-link").value = data.link_hs || "";
            } else if (docType === 's05') {
                if (document.getElementById("form-hang-muc")) document.getElementById("form-hang-muc").value = data.hang_muc || "";
                if (document.getElementById("form-date")) document.getElementById("form-date").value = data.ngay_phat_hien || "";
                if (document.getElementById("form-delay")) document.getElementById("form-delay").value = data.muc_cham || "";
                if (document.getElementById("form-cause")) document.getElementById("form-cause").value = data.nguyen_nhan || "";
                if (document.getElementById("form-solution")) document.getElementById("form-solution").value = data.giai_phap || "";
                if (document.getElementById("form-detail")) document.getElementById("form-detail").value = data.chi_tiet || "";
                if (document.getElementById("form-moc")) document.getElementById("form-moc").value = data.moc_cam_ket || "";
                if (document.getElementById("form-link")) document.getElementById("form-link").value = data.link_hs || "";
            }
            showToast("Form Filler", "Đã điền tự động dữ liệu trích xuất vào form thành công!", "success");
        }, 400);
    };

    window.rejectAIProposal = function(btn) {
        const section = btn.closest('div.proposal-card-container');
        if (section) {
            section.style.opacity = '0.5';
            btn.parentElement.innerHTML = '<span style="color:var(--text-secondary); font-size:0.8rem;"><i class="fa-solid fa-ban"></i> Đã bỏ qua đề xuất điền dữ liệu</span>';
        }
    };

    async function runRealAIOCR(fileContent, docType, filename) {
        showToast("Gemini OCR", `Đang gửi nội dung tài liệu "${filename}" sang Gemini AI để trích xuất cấu trúc...`, "info");
        
        // Go to AI tab first to show the chat bubble loading
        navItems.forEach(nav => nav.classList.remove("active"));
        document.querySelector('[data-tab="ai-center"]').classList.add("active");
        tabPanes.forEach(pane => pane.classList.remove("active"));
        document.getElementById("tab-ai-center").classList.add("active");
        document.getElementById("active-tab-title").textContent = "AI Command Center";

        const botBubble = appendChatMessage("bot", `<i>Gemini AI Agent đang phân tích nội dung tài liệu "${filename}" theo cấu trúc Form ${docType.toUpperCase()}...</i>`);

        try {
            const answer = await GeminiAI.parseDocumentWithPrompt(fileContent, docType);
            
            // Extract JSON from markdown code block
            let jsonStr = answer;
            const match = answer.match(/```json\s*([\s\S]*?)\s*```/) || answer.match(/```\s*([\s\S]*?)\s*```/);
            if (match) {
                jsonStr = match[1];
            }
            
            let data = {};
            try {
                data = JSON.parse(jsonStr.trim());
            } catch (err) {
                console.error("Failed to parse JSON from AI response:", jsonStr);
                throw new Error("Phản hồi từ AI không đúng định dạng JSON yêu cầu.");
            }

            // Cache data globally for accept handler
            window.lastExtractedData = data;
            
            const tabNames = {
                s01: "Sổ 01 (Hồ sơ Tiền khởi công)",
                s02: "Sổ 02 (Kế hoạch tuần/tháng)",
                s03: "Sổ 03 (Nghiệp vụ Phát sinh)",
                s04: "Sổ 04 (Cung ứng đặc thù)",
                s05: "Sổ 05 (Bù tiến độ thi công)"
            };

            botBubble.innerHTML = `
                <h4><i class="fa-solid fa-circle-check" style="color:var(--color-green);"></i> ĐÃ PHÂN TÍCH XONG TÀI LIỆU!</h4>
                Tôi đã hoàn thành phân tích nội dung file <b>"${filename}"</b> bằng chuỗi tư duy 4 bước của Kỹ sư Dữ liệu.<br>
                <div class="proposal-card-container" style="background: rgba(30, 41, 59, 0.7); border: 1px solid var(--color-ai-primary); border-radius: 8px; padding: 16px; margin-top: 12px; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
                    <h4 style="color: var(--color-ai-primary); margin-bottom: 8px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> AI Đề Xuất Điền Dữ Liệu
                    </h4>
                    <div style="margin-bottom: 12px; color: var(--text-secondary); font-size: 0.8rem; text-align:left;">
                        Đề xuất điền thông tin chi tiết vào <b>${tabNames[docType] || docType.toUpperCase()}</b>:
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05);">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-secondary); background-color: rgba(0,0,0,0.2);">
                                <th style="text-align: left; padding: 6px;">Trường dữ liệu</th>
                                <th style="text-align: left; padding: 6px;">Giá trị đề xuất</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${generateProposalTableRows(data, docType)}
                        </tbody>
                    </table>
                    
                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn-action approve" onclick="acceptAIProposal('${docType}')" style="padding: 6px 12px; font-size: 0.8rem; background-color: var(--color-ai-primary); border: none; color: white; cursor: pointer; border-radius: 4px;">
                            <i class="fa-solid fa-file-signature"></i> Chấp nhận & Điền Form
                        </button>
                        <button type="button" class="btn-action reject" onclick="rejectAIProposal(this)" style="padding: 6px 12px; font-size: 0.8rem; background-color: transparent; border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; border-radius: 4px;">
                            Bỏ qua
                        </button>
                    </div>
                </div>
            `;
        } catch (e) {
            console.error(e);
            botBubble.innerHTML = `<span style="color:var(--color-red);"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi Phân Tích: ${e.message}</span>`;
            showToast("Gemini OCR", "Lỗi phân tích tài liệu.", "danger");
        }
    }

    async function simulateOCRIngestion(docType) {
        let sampleText = "";
        if (docType === 's03') {
            sampleText = `Tờ trình phát sinh ngày 2026-06-12 gửi BQLDA VSV. Tổng thầu An Phong báo cáo túi bùn địa chất yếu cục bộ tại khu vực hố móng nhà mẫu CT-01 (Mã gói thầu: VSV_QLTC_TT.01). Đề xuất gia cố bổ sung 450 cọc tre d100 l=4m và thay đệm cát dày 1.2m. Giá trị phát sinh dự tính là 0.8 tỷ đồng. Thời gian ảnh hưởng tiến độ dự báo chậm 5 ngày. Đính kèm hồ sơ kỹ thuật PS01_NenYeu.pdf. Người trình: CHT Trần Quốc Huy.`;
        } else if (docType === 's04') {
            sampleText = `Yêu cầu cung ứng đặc thù ngày 2026-06-14. Để phục vụ bán sảnh chính nhà mẫu CT-01 (Mã gói thầu: VSV_QLTC_TT.01), chúng tôi yêu cầu cung ứng 120 m2 đá Marble Crema Marfil Tây Ban Nha cao cấp ốp lát mặt tiền sảnh chính ngoài HĐCU đã ký. Dự toán chi phí là 1.2 tỷ đồng. Đính kèm YC01_Marble.pdf. Kính trình phê duyệt.`;
        } else if (docType === 's05') {
            sampleText = `Báo cáo bù tiến độ ngày 2026-06-20 cho gói thầu VSV_QLTC_TT.01 (CT-01). Mức độ chậm trễ phát hiện là 9 ngày. Nguyên nhân do mưa lớn ngập úng hố móng. Giải pháp khắc phục đề xuất tăng ca đêm và lắp thêm 2 máy bơm công suất lớn hút nước liên tục 24/24. Chi tiết hành động: Tăng ca thêm 3 giờ/ngày cho đội cốt thép cốp pha. Cam kết mốc hoàn thành mới là 2026-07-05. Đính kèm PA_BuTienDo_T6_CT01.pdf.`;
        }
        await runRealAIOCR(sampleText, docType, `Demo_${docType.toUpperCase()}_Text`);
    }

    // Auto trigger chat alerts for delays > 7 days
    function triggerAiChatAlert(advice) {
        // Go to AI Center tab
        navItems.forEach(nav => nav.classList.remove("active"));
        document.querySelector('[data-tab="ai-center"]').classList.add("active");
        tabPanes.forEach(pane => pane.classList.remove("active"));
        document.getElementById("tab-ai-center").classList.add("active");

        const warnBubble = appendChatMessage("bot", `<div style="color:var(--color-red); font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> CẢNH BÁO TIẾN ĐỘ ĐƯỜNG GĂNG (PRESCRIPTIVE AI)</div>${advice.warning}`);
        
        setTimeout(() => {
            let optionsHtml = `<h4>ĐỀ XUẤT 03 GIẢI PHÁP TỐI ƯU CỦA GEMINI AI:</h4><div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">`;
            advice.options.forEach(opt => {
                optionsHtml += `
                    <div style="background: rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:10px; border-radius:8px; font-size:0.8rem;">
                        <b style="color:var(--color-ai-primary);">Phương án ${opt.index}: ${opt.solution}</b>
                        <div style="color:var(--text-secondary); margin:4px 0;">${opt.detail}</div>
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:600; color:var(--text-primary);">
                            <span><i class="fa-solid fa-clock"></i> Bù được: ${opt.timeSaved} ngày</span>
                            <span style="color:var(--color-yellow);"><i class="fa-solid fa-sack-dollar"></i> Chi phí phát sinh: ${opt.cost} tỷ</span>
                        </div>
                    </div>
                `;
            });
            optionsHtml += `</div>`;
            appendChatMessage("bot", optionsHtml);
        }, 1200);
    }

    // Chat queries shortcuts
    document.getElementById("shortcut-risk").addEventListener("click", () => {
        chatInput.value = "Mã BSC nào đang gặp rủi ro tài chính cao nhất?";
        chatInput.focus();
        showToast("AI Prompt", "Đã nạp câu hỏi vào ô chat. Bạn có thể chỉnh sửa và ấn nút Gửi.", "info");
    });

    document.getElementById("shortcut-synthesis").addEventListener("click", () => {
        chatInput.value = "Xuất Báo cáo Phân tích Sức khỏe Dự án hàng tháng";
        chatInput.focus();
        showToast("AI Prompt", "Đã nạp câu hỏi vào ô chat. Bạn có thể chỉnh sửa và ấn nút Gửi.", "info");
    });

    document.getElementById("shortcut-ct01").addEventListener("click", () => {
        chatInput.value = "Tóm tắt phương án bù tiến độ gói thầu VSV_QLTC_TT.01";
        chatInput.focus();
        showToast("AI Prompt", "Đã nạp câu hỏi vào ô chat. Bạn có thể chỉnh sửa và ấn nút Gửi.", "info");
    });

    document.getElementById("ai-quick-query-btn").addEventListener("click", () => {
        // Direct click asking Gemini AI quick query (fills prompt and wait)
        chatInput.value = "Mã BSC nào đang gặp rủi ro tài chính cao nhất?";
        navItems.forEach(nav => nav.classList.remove("active"));
        document.querySelector('[data-tab="ai-center"]').classList.add("active");
        tabPanes.forEach(pane => pane.classList.remove("active"));
        document.getElementById("tab-ai-center").classList.add("active");
        document.getElementById("active-tab-title").textContent = "AI Command Center";
        chatInput.focus();
        showToast("AI Prompt", "Đã chuyển sang AI Center và nạp câu hỏi. Bạn hãy ấn nút Gửi để AI trả lời.", "info");
    });

    // 9.1 PERSONNEL MANAGEMENT (Danh sách nhân sự & Phân quyền)
    let editPersonnelIndex = -1;

    function renderPersonnel() {
        const tbody = document.getElementById("personnel-tbody");
        const btnAdd = document.getElementById("btn-add-personnel");
        if (!tbody || !btnAdd) return;
        tbody.innerHTML = "";

        // Lock Add Button if not Admin
        if (currentRole === 'Admin') {
            btnAdd.removeAttribute("disabled");
            btnAdd.style.opacity = "1";
            btnAdd.style.cursor = "pointer";
        } else {
            btnAdd.setAttribute("disabled", "true");
            btnAdd.style.opacity = "0.5";
            btnAdd.style.cursor = "not-allowed";
        }

        const list = db.nhan_su || [];
        list.forEach((row, index) => {
            const tr = document.createElement("tr");
            
            // Format Access Level badges
            let accessBadge = "";
            if (row.quyen === 'Admin') accessBadge = `<span class="badge danger" style="box-shadow: 0 0 6px var(--color-red); font-weight:700;">Giám đốc / C-Level</span>`;
            else if (row.quyen === 'Supervisor') accessBadge = `<span class="badge success" style="font-weight:700;">Supervisor / TVGS</span>`;
            else if (row.quyen === 'Contractor') accessBadge = `<span class="badge info" style="font-weight:700;">Contractor / Thầu</span>`;
            else if (row.quyen === 'Supply') accessBadge = `<span class="badge warning" style="font-weight:700;">Supply / Cung ứng</span>`;

            // Format CRUD checkmarks
            const canAdd = row.quyen_them ? '<span style="color:var(--color-green); font-weight:bold; margin:0 4px;" title="Thêm: Đạt">➕</span>' : '<span style="color:var(--text-muted); margin:0 4px;" title="Thêm: Khóa">➖</span>';
            const canEdit = row.quyen_sua ? '<span style="color:var(--color-yellow); font-weight:bold; margin:0 4px;" title="Sửa: Đạt">📝</span>' : '<span style="color:var(--text-muted); margin:0 4px;" title="Sửa: Khóa">➖</span>';
            const canDelete = row.quyen_xoa ? '<span style="color:#ff5252; font-weight:bold; margin:0 4px;" title="Xóa: Đạt">❌</span>' : '<span style="color:var(--text-muted); margin:0 4px;" title="Xóa: Khóa">➖</span>';
            const crudBadges = `${canAdd} ${canEdit} ${canDelete}`;

            // Check if current user is Admin or if they are editing their own profile row
            const canUserEditThisRow = currentRole === 'Admin' || (currentUser && currentUser.email === row.email);

            tr.innerHTML = `
                <td>${index + 1}</td>
                <td style="font-weight:600; color: #fff;">${row.ho_ten}</td>
                <td>${row.email}</td>
                <td>${row.phong_ban}</td>
                <td>${row.vai_tro}</td>
                <td>${accessBadge}</td>
                <td style="text-align:center;">
                    <div style="display:flex; justify-content:center; gap:8px; font-size:1.05rem;">
                        ${crudBadges}
                    </div>
                </td>
                <td style="text-align:center; font-family:monospace; font-weight:600; color:var(--color-yellow);">${row.mat_khau || "123456"}</td>
                <td><span style="font-size:0.8rem; font-weight:600; color:var(--color-ai-primary);">${row.goi_thau || "(Chưa phân công)"}</span></td>
                <td style="text-align:center;">
                    ${canUserEditThisRow ? `
                        <div style="display:flex; gap:4px; justify-content:center;">
                            <button class="btn-action btn-edit-personnel" data-idx="${index}" style="padding:4px 8px; border-color: rgba(59,130,246,0.3); color: var(--color-ai-primary);" title="Sửa thông tin / Đổi mật khẩu"><i class="fa-solid fa-user-pen"></i></button>
                            ${currentRole === 'Admin' ? `
                                <button class="btn-action reject btn-delete-personnel" data-idx="${index}" style="padding:4px 8px; border-color: rgba(255,82,82,0.3); color: #ff5252;" title="Xóa nhân viên"><i class="fa-solid fa-user-xmark"></i></button>
                            ` : ""}
                        </div>
                    ` : `<span style="font-size:0.75rem; color:var(--text-muted);">Khóa</span>`}
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Bind events for edit & delete buttons
        document.querySelectorAll(".btn-edit-personnel").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                openEditPersonnelModal(idx);
            });
        });

        document.querySelectorAll(".btn-delete-personnel").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                deletePersonnel(idx);
            });
        });
    }

    // Add Personnel Button Trigger
    document.getElementById("btn-add-personnel").addEventListener("click", () => {
        if (currentRole !== 'Admin') {
            showToast("Bảo Mật", "Chỉ có Admin / Giám đốc dự án mới có quyền thêm nhân sự!", "danger");
            return;
        }
        openPersonnelModal();
    });

    function openPersonnelModal() {
        editPersonnelIndex = -1;
        currentFormTarget = "personnel";
        
        const titleEl = document.getElementById("modal-form-title");
        const bodyEl = document.getElementById("modal-form-body");
        
        titleEl.textContent = "Thêm Nhân Sự Mới Vào Hệ Thống";
        bodyEl.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr; gap:12px;">
                <div class="form-group">
                    <label>Họ và Tên</label>
                    <input type="text" id="p-name" class="form-control" placeholder="Nhập họ và tên..." required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="p-email" class="form-control" placeholder="example@tdggroup.vn" required>
                </div>
                <div class="form-group">
                    <label>Phòng Ban</label>
                    <input type="text" id="p-dept" class="form-control" placeholder="Ban QLDA / Tổng thầu / TVGS..." required>
                </div>
                <div class="form-group">
                    <label>Vai Trò / Chức Danh</label>
                    <input type="text" id="p-role" class="form-control" placeholder="Giám sát trưởng / Kế sư trưởng..." required>
                </div>
                <div class="form-group">
                    <label>Quyền Truy Cập Hệ Thống (Mức Phân Quyền)</label>
                    <select id="p-auth" class="form-control" onchange="window.syncDefaultCrudCheckboxes()">
                        <option value="Admin">Admin / C-Level (Toàn quyền quản trị)</option>
                        <option value="Supervisor">Supervisor / TVGS (Phê duyệt kỹ thuật)</option>
                        <option value="Contractor">Contractor / Tổng Thầu (Nộp hồ sơ)</option>
                        <option value="Supply">Supply / Cung Ứng (Cấp vật tư)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Mật Khẩu Đăng Nhập</label>
                    <input type="text" id="p-password" class="form-control" value="123456" required>
                </div>
                <div class="form-group">
                    <label>Phân quyền thao tác (CRUD)</label>
                    <div style="display:flex; gap:16px; margin-top:6px;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" id="p-can-add" checked> THÊM (Create)
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" id="p-can-edit" checked> SỬA (Update)
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" id="p-can-delete" checked> XÓA (Delete)
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Gói Thầu Phụ Trách</label>
                    <input type="text" id="p-package" class="form-control" placeholder="Mã gói thầu, ví dụ: VSV_QLTC_TT.01, hoặc Tất cả các gói">
                </div>
            </div>
        `;
        
        window.syncDefaultCrudCheckboxes = () => {
            const auth = document.getElementById("p-auth").value;
            const addCb = document.getElementById("p-can-add");
            const editCb = document.getElementById("p-can-edit");
            const deleteCb = document.getElementById("p-can-delete");
            if (!addCb || !editCb || !deleteCb) return;
            
            if (auth === 'Admin') {
                addCb.checked = true; editCb.checked = true; deleteCb.checked = true;
            } else if (auth === 'Supervisor') {
                addCb.checked = false; editCb.checked = true; deleteCb.checked = false;
            } else if (auth === 'Contractor') {
                addCb.checked = true; editCb.checked = true; deleteCb.checked = true;
            } else if (auth === 'Supply') {
                addCb.checked = false; editCb.checked = true; deleteCb.checked = false;
            }
        };

        formModal.style.display = "flex";
    }

    function openEditPersonnelModal(idx) {
        editPersonnelIndex = idx;
        currentFormTarget = "personnel_edit";
        const row = db.nhan_su[idx];
        
        const titleEl = document.getElementById("modal-form-title");
        const bodyEl = document.getElementById("modal-form-body");
        
        const isSelfEditOnly = currentUser && currentUser.email === row.email && currentUser.quyen !== 'Admin';
        const disabledAttr = isSelfEditOnly ? 'disabled style="background:rgba(255,255,255,0.03); cursor:not-allowed;"' : '';

        titleEl.textContent = `Chỉnh Sửa Thông Tin Nhân Sự: ${row.ho_ten}`;
        bodyEl.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr; gap:12px;">
                <div class="form-group">
                    <label>Họ và Tên</label>
                    <input type="text" id="p-name" class="form-control" value="${row.ho_ten || ''}" ${disabledAttr} required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="p-email" class="form-control" value="${row.email || ''}" ${disabledAttr} required>
                </div>
                <div class="form-group">
                    <label>Phòng Ban</label>
                    <input type="text" id="p-dept" class="form-control" value="${row.phong_ban || ''}" ${disabledAttr} required>
                </div>
                <div class="form-group">
                    <label>Vai Trò / Chức Danh</label>
                    <input type="text" id="p-role" class="form-control" value="${row.vai_tro || ''}" ${disabledAttr} required>
                </div>
                <div class="form-group">
                    <label>Quyền Truy Cập Hệ Thống (Mức Phân Quyền)</label>
                    <select id="p-auth" class="form-control" onchange="window.syncDefaultCrudCheckboxes()" ${disabledAttr}>
                        <option value="Admin" ${row.quyen === 'Admin' ? 'selected' : ''}>Admin / C-Level (Toàn quyền quản trị)</option>
                        <option value="Supervisor" ${row.quyen === 'Supervisor' ? 'selected' : ''}>Supervisor / TVGS (Phê duyệt kỹ thuật)</option>
                        <option value="Contractor" ${row.quyen === 'Contractor' ? 'selected' : ''}>Contractor / Tổng Thầu (Nộp hồ sơ)</option>
                        <option value="Supply" ${row.quyen === 'Supply' ? 'selected' : ''}>Supply / Cung Ứng (Cấp vật tư)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Mật Khẩu Đăng Nhập</label>
                    <input type="text" id="p-password" class="form-control" value="${row.mat_khau || '123456'}" required>
                </div>
                <div class="form-group">
                    <label>Phân quyền thao tác (CRUD)</label>
                    <div style="display:flex; gap:16px; margin-top:6px;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" id="p-can-add" ${row.quyen_them ? 'checked' : ''} ${disabledAttr}> THÊM (Create)
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" id="p-can-edit" ${row.quyen_sua ? 'checked' : ''} ${disabledAttr}> SỬA (Update)
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" id="p-can-delete" ${row.quyen_xoa ? 'checked' : ''} ${disabledAttr}> XÓA (Delete)
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Gói Thầu Phụ Trách</label>
                    <input type="text" id="p-package" class="form-control" value="${row.goi_thau || ''}" placeholder="Mã gói thầu, ví dụ: VSV_QLTC_TT.01, hoặc Tất cả các gói" ${disabledAttr}>
                </div>
            </div>
        `;
        
        window.syncDefaultCrudCheckboxes = () => {
            const auth = document.getElementById("p-auth").value;
            const addCb = document.getElementById("p-can-add");
            const editCb = document.getElementById("p-can-edit");
            const deleteCb = document.getElementById("p-can-delete");
            if (!addCb || !editCb || !deleteCb) return;
            
            if (auth === 'Admin') {
                addCb.checked = true; editCb.checked = true; deleteCb.checked = true;
            } else if (auth === 'Supervisor') {
                addCb.checked = false; editCb.checked = true; deleteCb.checked = false;
            } else if (auth === 'Contractor') {
                addCb.checked = true; editCb.checked = true; deleteCb.checked = true;
            } else if (auth === 'Supply') {
                addCb.checked = false; editCb.checked = true; deleteCb.checked = false;
            }
        };

        formModal.style.display = "flex";
    }

    function deletePersonnel(idx) {
        if (currentRole !== 'Admin') {
            showToast("Bảo Mật", "Chỉ có Admin / Giám đốc dự án mới có quyền xóa nhân sự!", "danger");
            return;
        }
        const row = db.nhan_su[idx];
        const conf = confirm(`Bạn có chắc chắn muốn xóa nhân sự ${row.ho_ten} khỏi dự án?`);
        if (!conf) return;
        
        db.nhan_su.splice(idx, 1);
        saveDatabase();
        renderPersonnel();
        showToast("Xóa Nhân Sự", `Đã xóa nhân viên ${row.ho_ten} khỏi hệ thống thành công.`, "warning");
    }

    // Helper functions for chat bubble rendering
    function appendChatMessage(sender, text) {
        const bubble = document.createElement("div");
        bubble.className = `ai-chat-bubble ${sender}`;
        bubble.innerHTML = text;
        chatHistory.appendChild(bubble);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return bubble;
    }

    function formatMarkdown(text) {
        // Simple markdown formatter helper for presentation
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/### (.*?)(<br>|$)/g, '<h4 style="color:var(--color-ai-primary); margin-top:12px; font-family:var(--font-heading); font-size:1rem;">$1</h4>')
            .replace(/## (.*?)(<br>|$)/g, '<h3 style="color:var(--color-ai-primary); margin-top:16px; font-family:var(--font-heading); font-size:1.15rem;">$1</h3>')
            .replace(/- (.*?)(<br>|$)/g, '<li>$1</li>');
    }

    // 10. SYSTEM NOTIFICATIONS TOAST BOX
    function showToast(title, message, type = "info") {
        const container = document.getElementById("notification-panel");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        
        toast.innerHTML = `
            <div class="toast-header">
                <span>${title}</span>
                <span onclick="this.parentElement.parentElement.remove()" style="cursor:pointer;">&times;</span>
            </div>
            <div class="toast-body">${message}</div>
        `;
        
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.style.animation = "toastSlideIn 0.3s reverse forwards";
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // 11. SETTINGS PANEL INTERACTIVES
    const apiKeyInput = document.getElementById("gemini-api-key-input");
    const modelSelect = document.getElementById("gemini-model-select");
    const saveSettingsBtn = document.getElementById("btn-save-settings");
    const resetFactoryBtn = document.getElementById("btn-reset-db-factory");

    // Load initial settings
    apiKeyInput.value = GeminiAI.apiKey;
    if (modelSelect) {
        modelSelect.value = GeminiAI.model;
    }
    updateAiStatusIndicator();

    saveSettingsBtn.addEventListener("click", () => {
        const key = apiKeyInput.value.trim();
        const model = modelSelect ? modelSelect.value : 'gemini-3.5-flash';
        GeminiAI.setApiKey(key);
        GeminiAI.setModel(model);
        updateAiStatusIndicator();
        showToast("Hệ thống", "Đã lưu cài đặt và kết nối Gemini AI thành công.", "success");
    });

    resetFactoryBtn.addEventListener("click", () => {
        if (confirm("CẢNH BÁO: Hành động này sẽ xóa toàn bộ thay đổi và đặt lại dữ liệu gốc. Bạn có chắc chắn muốn đặt lại?")) {
            resetDatabaseToFactory();
        }
    });

    function updateAiStatusIndicator() {
        const status = GeminiAI.getAiStatus();
        const el = document.getElementById("ai-status-indicator");
        
        if (status.mode === 'live') {
            el.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${status.text}`;
            el.style.color = "var(--color-green)";
        } else {
            el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${status.text}`;
            el.style.color = "var(--color-yellow)";
        }
    }

    // 12. INITIALIZE APPLICATION SETUP
    function updateSystemTime() {
        const d = new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        
        const timeStr = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        const el = document.getElementById("system-time");
        if (el) {
            el.textContent = timeStr;
        }
    }

    function initApp() {
        loadDatabase();
        calculateRollups();
        renderDashboard();
        
        checkUserSession();

        // Start system clock
        updateSystemTime();
        setInterval(updateSystemTime, 1000);
    }

    initApp();
});
