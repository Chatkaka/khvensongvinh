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
            saveDatabase();
        }
        sanitizeInitialData();
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

    // Ensure all numeric values are clean and sub-tables have proper structure
    function sanitizeInitialData() {
        if (!db.master) db.master = [];
        if (!db.s01) db.s01 = [];
        if (!db.s02) db.s02 = [];
        if (!db.s03) db.s03 = [];
        if (!db.s04) db.s04 = [];
        if (!db.s05) db.s05 = [];
        
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
            document.getElementById("active-tab-desc").textContent = desc;

            // Render matching tabs
            if (tabId === 'dashboard') renderDashboard();
            if (tabId === 'master') renderMasterGrid();
            if (tabId === 's01') renderS01();
            if (tabId === 's02') renderS02();
            if (tabId === 's03') renderS03();
            if (tabId === 's04') renderS04();
            if (tabId === 's05') renderS05();
        });
    });

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
            const x = ((time - minTime) / (maxTime - minTime)) * (totalWidth - 200) + 180;
            
            if (x >= 180 && x <= totalWidth) {
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
        const todayX = ((todayTime - minTime) / (maxTime - minTime)) * (totalWidth - 200) + 180;
        if (todayX >= 180 && todayX <= totalWidth) {
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
            text.textContent = String(p.ma_bsc).substring(0, 15) + (String(p.ma_bsc).length > 15 ? '..' : '');
            
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

            const xPlan = ((planStart - minTime) / (maxTime - minTime)) * (totalWidth - 200) + 180;
            const wPlan = ((planEnd - planStart) / (maxTime - minTime)) * (totalWidth - 200);

            const xActual = ((actualStart - minTime) / (maxTime - minTime)) * (totalWidth - 200) + 180;
            const wActual = ((actualEnd - actualStart) / (maxTime - minTime)) * (totalWidth - 200);

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
                    th.style.width = "120px";
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
                <th rowspan="2" class="freeze-2" style="width: 120px;">Mã BSC</th>
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
                    tt: goiThauPl,
                    nhom_ct: row.nhom_ct,
                    hang_muc_work: `Gói thầu ${goiThauPl} (${row.nhom_ct})`,
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
                for (let k = flatHierarchy.length - 1; k >= 0; k--) {
                    if (flatHierarchy[k].type === "parent") {
                        parentBsc = flatHierarchy[k].id;
                        break;
                    }
                }
                flatHierarchy.push({
                    type: "child",
                    id: String(row.tt),
                    parentId: parentBsc,
                    grandParentId: goiThauPl,
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
                    tdOps.innerHTML = `
                        <div style="display: flex; gap: 4px; justify-content: center;">
                            <button class="btn-action btn-edit-row" data-idx="${masterRowIndex}" style="color: var(--color-ai-primary); border-color: rgba(59, 130, 246, 0.3); padding: 4px 8px;" title="Chỉnh sửa dòng"><i class="fa-solid fa-pen-to-square"></i> Sửa</button>
                            <button class="btn-action reject btn-delete-row" data-idx="${masterRowIndex}" style="color: #ff5252; border-color: rgba(255, 82, 82, 0.3); padding: 4px 8px;" title="Xóa dòng"><i class="fa-solid fa-trash-can"></i> Xoá</button>
                        </div>
                    `;
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
                    tdOps.innerHTML = `
                        <div style="display: flex; gap: 4px; justify-content: center;">
                            <button class="btn-action btn-edit-row" data-idx="${masterRowIndex}" style="color: var(--color-ai-primary); border-color: rgba(59, 130, 246, 0.3); padding: 4px 8px;" title="Chỉnh sửa dòng"><i class="fa-solid fa-pen-to-square"></i> Sửa</button>
                            <button class="btn-action reject btn-delete-row" data-idx="${masterRowIndex}" style="color: #ff5252; border-color: rgba(255, 82, 82, 0.3); padding: 4px 8px;" title="Xóa dòng"><i class="fa-solid fa-trash-can"></i> Xoá</button>
                        </div>
                    `;
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
        let html = `<select class="grid-select" data-row="${rowIdx}" data-field="${field}">`;
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
                td.innerHTML = `<input type="number" step="0.01" class="grid-input" value="${row.gia_tri_hdcu || ''}" data-row="${rowIdx}" data-field="gia_tri_hdcu" style="width:70px; text-align:right;">`;
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
            td.innerHTML = isParent ? `
                <input type="date" class="grid-input" value="${row.ngay_bd_khoi_cong || ''}" 
                    data-row="${rowIdx}" data-field="ngay_bd_khoi_cong" 
                    ${row.dieu_kien_du !== 'ĐỦ ĐK KHỞI CÔNG' ? 'disabled title="Khóa chốt chặn: Chưa đủ điều kiện khởi công!"' : ''}>
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
                td.textContent = isNaN(num) ? (val || "") : (num * 100).toFixed(0) + "%";
                td.style.textAlign = "center";
            } else {
                td.textContent = val || "";
            }
        }
    }

    function openEditModalForm(rowIdx) {
        editRowIndex = rowIdx;
        currentFormTarget = "master_edit";
        const row = db.master[rowIdx];
        
        const titleEl = document.getElementById("modal-form-title");
        const bodyEl = document.getElementById("modal-form-body");
        bodyEl.innerHTML = "";
        
        titleEl.textContent = `Chỉnh Sửa Gói Thầu / Hạng Mục (Dòng ${row.tt})`;
        
        bodyEl.innerHTML = `
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
        `;
        
        formModal.style.display = "flex";
    }

    function renderOptionsWithSelect(array, selectedVal) {
        if (!array) return "";
        return array.map(v => `<option value="${v}" ${v === selectedVal ? 'selected' : ''}>${v}</option>`).join("");
    }

    function deleteMasterRow(rowIdx) {
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

        db.s01.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
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
                </td>
                <td>
                    ${row['TT duyệt'] !== 'Đã duyệt' ? `
                        <button class="btn-action approve btn-approve-s01" data-idx="${index}"><i class="fa-solid fa-check"></i> Duyệt</button>
                    ` : ""}
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Attach events
        document.querySelectorAll(".btn-approve-s01").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                db.s01[idx]['TT duyệt'] = 'Đã duyệt';
                
                // Rollup real-time
                calculateRollups();
                saveDatabase();
                renderS01();
                showToast("Duyệt Hồ Sơ", "Đã duyệt hồ sơ khởi công thành công. Đã cộng dồn điều kiện khởi công.", "success");
            });
        });
    }

    // SO 02: Kế hoạch Tháng/Tuần
    function renderS02() {
        const tbody = document.getElementById("s02-tbody");
        tbody.innerHTML = "";
        const search = document.getElementById("s02-search-input").value.toLowerCase();

        db.s02.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
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
                </td>
                <td>${row['Người lập'] || ""}/${row['Người duyệt'] || ""}</td>
                <td>${row['Ngày duyệt'] || ""}</td>
                <td>
                    ${row['TT duyệt'] !== 'Đã duyệt' ? `
                        <button class="btn-action approve btn-approve-s02" data-idx="${index}"><i class="fa-solid fa-check"></i> Duyệt</button>
                    ` : ""}
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll(".btn-approve-s02").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                db.s02[idx]['TT duyệt'] = 'Đã duyệt';
                db.s02[idx]['Ngày duyệt'] = new Date().toISOString().substring(0, 10);
                
                calculateRollups();
                saveDatabase();
                renderS02();
                showToast("Duyệt Kế Hoạch", "Kế hoạch tuần/tháng đã được TVGS phê duyệt.", "success");
            });
        });
    }

    // SO 03: Phát sinh hợp đồng B - B' (Chốt chặn Ngân sách)
    function renderS03() {
        const tbody = document.getElementById("s03-tbody");
        tbody.innerHTML = "";
        const search = document.getElementById("s03-search-input").value.toLowerCase();

        db.s03.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
            const valPs = parseFloat(row['Giá trị (tỷ)'] || 0);

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
                </td>
                <td>${row['Người duyệt'] || ""}<br><small>${row['Ngày duyệt'] || ""}</small></td>
                <td>
                    ${row['TT duyệt'] === 'Chờ duyệt' ? `
                        <button class="btn-action approve btn-approve-s03" data-idx="${index}" data-bsc="${bsc}"><i class="fa-solid fa-check"></i> Duyệt</button>
                        <button class="btn-action reject btn-reject-s03" data-idx="${index}"><i class="fa-solid fa-xmark"></i> Từ chối</button>
                    ` : ""}
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
                db.s03[idx]['Người duyệt'] = 'GĐDA';
                db.s03[idx]['Ngày duyệt'] = new Date().toISOString().substring(0, 10);

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
                db.s03[idx]['TT duyệt'] = 'Từ chối';
                db.s03[idx]['Người duyệt'] = 'GĐDA';
                db.s03[idx]['Ngày duyệt'] = new Date().toISOString().substring(0, 10);

                saveDatabase();
                renderS03();
                showToast("Phát Sinh", "Đã từ chối phát sinh hợp đồng.", "info");
            });
        });
    }

    // SO 04: Cung ứng đặc thù
    function renderS04() {
        const tbody = document.getElementById("s04-tbody");
        tbody.innerHTML = "";
        const search = document.getElementById("s04-search-input").value.toLowerCase();

        db.s04.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
            const valCu = parseFloat(row['Giá trị (tỷ)'] || 0);

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
                </td>
                <td>
                    <span class="badge ${row['TT cung ứng'] === 'Đã cung ứng' ? 'success' : (row['TT cung ứng'] === 'Đang cung ứng' ? 'warning' : 'danger')}">
                        ${row['TT cung ứng'] || "Chưa cung ứng"}
                    </span>
                </td>
                <td>
                    ${row['TT duyệt'] === 'Chờ duyệt' ? `
                        <button class="btn-action approve btn-approve-s04" data-idx="${index}" data-bsc="${bsc}"><i class="fa-solid fa-check"></i> Duyệt</button>
                    ` : ""}
                    ${row['TT duyệt'] === 'Đã duyệt' && row['TT cung ứng'] !== 'Đã cung ứng' ? `
                        <button class="btn-action approve btn-supply-s04" data-idx="${index}" style="color:var(--color-yellow); border-color:var(--color-yellow);"><i class="fa-solid fa-truck"></i> Cấp vật tư</button>
                    ` : ""}
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
                db.s04[idx]['TT cung ứng'] = 'Đang cung ứng';
                
                saveDatabase();
                renderS04();
                showToast("Cung Ứng", "Đã phê duyệt yêu cầu cung ứng vật tư.", "success");
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
    }

    // SO 05: Bù tiến độ
    function renderS05() {
        const tbody = document.getElementById("s05-tbody");
        tbody.innerHTML = "";
        const search = document.getElementById("s05-search-input").value.toLowerCase();

        db.s05.forEach((row, index) => {
            const bsc = String(row['Mã BSC']);
            if (search && !bsc.toLowerCase().includes(search)) return;

            const tr = document.createElement("tr");
            const delayDays = parseInt(row['Mức chậm (ngày)'] || 0);

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
                    <span class="badge ${row['TT duyệt'] === 'Đã duyệt' ? 'success' : 'warning'}">
                        ${row['TT duyệt'] || "Chờ duyệt"}
                    </span>
                </td>
                <td>${row['KQ thực hiện bù'] || ""}</td>
                <td>
                    <span class="badge ${row['TT thực hiện'] === 'Đã hoàn thành' ? 'success' : 'warning'}">
                        ${row['TT thực hiện'] || "Đang thực hiện"}
                    </span>
                </td>
                <td>
                    ${row['TT duyệt'] === 'Chờ duyệt' ? `
                        <button class="btn-action approve btn-approve-s05" data-idx="${index}"><i class="fa-solid fa-check"></i> Duyệt</button>
                    ` : ""}
                    ${row['TT thực hiện'] !== 'Đã hoàn thành' ? `
                        <button class="btn-action approve btn-complete-s05" data-idx="${index}" style="color:var(--color-green); border-color:var(--color-green);"><i class="fa-solid fa-circle-check"></i> Hoàn thành bù</button>
                    ` : ""}
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll(".btn-approve-s05").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                db.s05[idx]['TT duyệt'] = 'Đã duyệt';
                
                calculateRollups();
                saveDatabase();
                renderS05();
                showToast("Bù Tiến Độ", "Đã phê duyệt phương án bù tiến độ của Tổng thầu.", "success");
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

    function openModalForm(target) {
        currentFormTarget = target;
        const titleEl = document.getElementById("modal-form-title");
        const bodyEl = document.getElementById("modal-form-body");
        bodyEl.innerHTML = ""; // Clear

        // Fetch valid Mã BSC list with names for user-friendly dropdowns
        const bscOptions = db.master
            .filter(r => String(r.ma_bsc || "").trim() !== "")
            .map(r => ({
                code: String(r.ma_bsc).trim(),
                name: `${String(r.ma_bsc).trim()} - ${r.hang_muc_work} (${r.nhom_ct})`
            }));

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
                <div class="form-group">
                    <label>Công trình / Gói thầu liên kết</label>
                    <select id="form-bsc" class="form-control">${renderBscOptions(bscOptions)}</select>
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
        } else if (target === 's03') {
            titleEl.textContent = "Ghi Nhận Phát Sinh & Sai Khác Hợp Đồng";
            bodyEl.innerHTML = `
                <div class="form-group">
                    <label>Công trình / Gói thầu liên kết</label>
                    <select id="form-bsc" class="form-control">${renderBscOptions(bscOptions)}</select>
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
                <div class="form-group">
                    <label>Công trình / Gói thầu liên kết</label>
                    <select id="form-bsc" class="form-control">${renderBscOptions(bscOptions)}</select>
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
                <div class="form-group">
                    <label>Công trình / Gói thầu liên kết</label>
                    <select id="form-bsc" class="form-control">${renderBscOptions(bscOptions)}</select>
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
    }

    function renderOptions(array) {
        if (!array) return "";
        return array.map(v => `<option value="${v}">${v}</option>`).join("");
    }

    function renderBscOptions(options) {
        if (!options) return "";
        return options.map(opt => `<option value="${opt.code}">${opt.name}</option>`).join("");
    }

    function closeModal() {
        formModal.style.display = "none";
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

            showToast("Cập nhật thầu", `Đã lưu thay đổi cho dòng ${row.tt} thành công.`, "success");
            renderMasterGrid();
        } else if (currentFormTarget === 's01') {
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
            renderS01();
        } else if (currentFormTarget === 's03') {
            const bsc = document.getElementById("form-bsc").value;
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
                "Ngày duyệt": ""
            };
            db.s03.push(newPs);
            showToast("Sổ 03", "Đã ghi nhận yêu cầu phát sinh mới thành công.", "success");
            renderS03();
        } else if (currentFormTarget === 's04') {
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
                "TT cung ứng": "Chưa cung ứng"
            };
            db.s04.push(newCu);
            showToast("Sổ 04", "Đã đăng ký yêu cầu vật tư cung ứng đặc thù.", "success");
            renderS04();
        } else if (currentFormTarget === 's05') {
            const bsc = document.getElementById("form-bsc").value;
            const delayDays = parseInt(document.getElementById("form-delay").value) || 0;
            
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
                "TT thực hiện": "Đang thực hiện"
            };
            db.s05.push(newS05);
            showToast("Sổ 05", "Đã đăng ký hồ sơ bù tiến độ.", "success");

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
        }

        // Recalculate Master values instantly
        calculateRollups();
        saveDatabase();
        closeModal();
    });

    // Opening modals buttons mapping
    document.getElementById("btn-add-package").addEventListener("click", () => openModalForm('master'));
    document.getElementById("btn-add-s01").addEventListener("click", () => openModalForm('s01'));
    document.getElementById("btn-add-s03").addEventListener("click", () => openModalForm('s03'));
    document.getElementById("btn-add-s04").addEventListener("click", () => openModalForm('s04'));
    document.getElementById("btn-add-s05").addEventListener("click", () => openModalForm('s05'));

    // 9. GEMINI AI AGENT INTERFACE (Speech, Synthesis, OCR Forms fill)
    const chatInput = document.getElementById("ai-chat-input");
    const sendBtn = document.getElementById("ai-send-btn");
    const micBtn = document.getElementById("ai-mic-btn");
    const chatHistory = document.getElementById("ai-chat-history");

    // Send chat text command to Gemini
    async function handleAiSubmit() {
        const text = chatInput.value.trim();
        if (text === "") return;

        appendChatMessage("user", text);
        chatInput.value = "";

        const botBubble = appendChatMessage("bot", "<i>Gemini AI Agent đang phân tích...</i>");

        try {
            const answer = await GeminiAI.callGeminiAPI(text);
            botBubble.innerHTML = formatMarkdown(answer);
        } catch (e) {
            botBubble.innerHTML = `<span style="color:var(--color-red);">Lỗi: ${e.message}</span>`;
        }
        
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    sendBtn.addEventListener("click", handleAiSubmit);
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleAiSubmit();
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
                        "hs_tien_kc_duyet", "luy_ke_ab", "luy_ke_bb", "luy_ke_tong_chi_phi"
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

    dropzone.addEventListener("click", () => fileInput.click());
    
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            importExcelData(file);
        } else {
            simulateOCRIngestion('s03'); // OCR simulation for other files
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
            simulateOCRIngestion('s03');
        }
    });

    // Click demo files handler
    document.getElementById("demo-doc-s03").addEventListener("click", () => simulateOCRIngestion('s03'));
    document.getElementById("demo-doc-s04").addEventListener("click", () => simulateOCRIngestion('s04'));
    document.getElementById("demo-doc-s05").addEventListener("click", () => simulateOCRIngestion('s05'));

    async function simulateOCRIngestion(docType) {
        showToast("Gemini OCR", "Bắt đầu quét tài liệu bằng Trí tuệ nhân tạo (OCR)...", "info");
        
        // Go to AI tab first to show the chat bubble loading
        navItems.forEach(nav => nav.classList.remove("active"));
        document.querySelector('[data-tab="ai-center"]').classList.add("active");
        tabPanes.forEach(pane => pane.classList.remove("active"));
        document.getElementById("tab-ai-center").classList.add("active");
        document.getElementById("active-tab-title").textContent = "AI Command Center";

        const botBubble = appendChatMessage("bot", `<i>Gemini AI Agent đang OCR quét tài liệu... Vui lòng đợi.</i>`);

        try {
            const extractedData = await GeminiAI.ingestDocument(docType);
            botBubble.innerHTML = `
                <h4>ĐÃ TRÍCH XUẤT THÀNH CÔNG!</h4>
                Tôi đã hoàn thành OCR tài liệu dạng <b>${docType === 's03' ? 'Tờ trình Phát sinh' : (docType === 's04' ? 'Cung ứng Đặc thù' : 'Kế hoạch Bù tiến độ')}</b>.<br>
                <div style="background: rgba(0,0,0,0.3); padding:8px; border-radius:6px; font-size:0.75rem; margin:8px 0; border:1px solid var(--border-color);">
                    <b>Mã BSC:</b> ${extractedData.ma_bsc}<br>
                    ${docType === 's03' ? `<b>Giá trị:</b> ${extractedData.gia_tri} tỷ | <b>Ảnh hưởng:</b> Chậm ${extractedData.tre_han} ngày` : ''}
                    ${docType === 's04' ? `<b>Vật tư:</b> ${extractedData.vattu} | <b>Giá trị:</b> ${extractedData.gia_tri} tỷ` : ''}
                    ${docType === 's05' ? `<b>Mức chậm:</b> ${extractedData.muc_cham} ngày | <b>Mốc cam kết:</b> ${extractedData.moc_cam_ket}` : ''}
                </div>
                Đang mở form tương ứng để điền tự động...
            `;

            // Open corresponding Modal form and fill values
            setTimeout(() => {
                openModalForm(docType);
                // Fill form values based on extracted data
                setTimeout(() => {
                    document.getElementById("form-bsc").value = extractedData.ma_bsc;
                    if (docType === 's03') {
                        document.getElementById("form-hang-muc").value = "Hạng mục xử lý nền móng";
                        document.getElementById("form-loai").value = extractedData.loai_ps;
                        document.getElementById("form-desc").value = extractedData.mo_ta;
                        document.getElementById("form-cause").value = extractedData.nguyen_nhan;
                        document.getElementById("form-propose").value = extractedData.de_xuat;
                        document.getElementById("form-val").value = extractedData.gia_tri;
                        document.getElementById("form-delay").value = extractedData.tre_han;
                        document.getElementById("form-link").value = extractedData.link_hs;
                    } else if (docType === 's04') {
                        document.getElementById("form-hang-muc").value = "Ốp lát sảnh nhà mẫu";
                        document.getElementById("form-loai").value = extractedData.loai_yc;
                        document.getElementById("form-vattu").value = extractedData.vattu;
                        document.getElementById("form-spec").value = extractedData.dac_ta;
                        document.getElementById("form-kl").value = extractedData.kl;
                        document.getElementById("form-dvt").value = extractedData.dvt;
                        document.getElementById("form-val").value = extractedData.gia_tri;
                        document.getElementById("form-target").value = extractedData.trong_ngoai;
                        document.getElementById("form-link").value = extractedData.link_hs;
                    } else if (docType === 's05') {
                        document.getElementById("form-hang-muc").value = "Cọc + móng CT-01";
                        document.getElementById("form-delay").value = extractedData.muc_cham;
                        document.getElementById("form-cause").value = extractedData.nguyen_nhan;
                        document.getElementById("form-solution").value = extractedData.giai_phap;
                        document.getElementById("form-detail").value = extractedData.chi_tiet;
                        document.getElementById("form-moc").value = extractedData.moc_cam_ket;
                        document.getElementById("form-link").value = extractedData.link_hs;
                    }
                    showToast("Gemini Auto-Fill", "Đã điền tự động dữ liệu trích xuất vào biểu mẫu thành công!", "success");
                }, 400);
            }, 1000);
        } catch (e) {
            botBubble.innerHTML = `<span style="color:var(--color-red);">Lỗi trích xuất: ${e.message}</span>`;
        }
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
        handleAiSubmit();
    });

    document.getElementById("shortcut-synthesis").addEventListener("click", () => {
        chatInput.value = "Xuất báo cáo phân tích sức khỏe dự án hàng tháng";
        handleAiSubmit();
    });

    document.getElementById("shortcut-ct01").addEventListener("click", () => {
        chatInput.value = "Tóm tắt phương án bù tiến độ gói thầu VSV_QLTC_TT.01";
        handleAiSubmit();
    });

    document.getElementById("ai-quick-query-btn").addEventListener("click", () => {
        // Direct click asking Gemini AI quick query
        chatInput.value = "Mã BSC nào đang gặp rủi ro tài chính cao nhất?";
        navItems.forEach(nav => nav.classList.remove("active"));
        document.querySelector('[data-tab="ai-center"]').classList.add("active");
        tabPanes.forEach(pane => pane.classList.remove("active"));
        document.getElementById("tab-ai-center").classList.add("active");
        handleAiSubmit();
    });

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
    const saveSettingsBtn = document.getElementById("btn-save-settings");
    const resetFactoryBtn = document.getElementById("btn-reset-db-factory");

    // Load initial settings
    apiKeyInput.value = GeminiAI.apiKey;
    updateAiStatusIndicator();

    saveSettingsBtn.addEventListener("click", () => {
        const key = apiKeyInput.value.trim();
        GeminiAI.setApiKey(key);
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
        
        // Start system clock
        updateSystemTime();
        setInterval(updateSystemTime, 1000);
    }

    initApp();
});
