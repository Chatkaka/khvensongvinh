import streamlit as st
import requests
import json
import time
import threading
import websocket
from datetime import datetime, date
from streamlit.runtime import get_instance
from streamlit.runtime.scriptrunner import get_script_run_ctx

# Thiết lập cấu hình trang
st.set_page_config(
    page_title="HỢP ĐỒNG MANAGER",
    layout="wide",
    initial_sidebar_state="collapsed"
)

BACKEND_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws"

# =====================================================================
# TẦNG 2: REAL-TIME WEBSOCKET LISTENER THREAD (English logs only)
# =====================================================================
def start_websocket_listener():
    ctx = get_script_run_ctx()
    if ctx is None:
        return
    session_id = ctx.session_id

    if "ws_thread_started" not in st.session_state:
        st.session_state.ws_thread_started = True
        
        def run_listener():
            while True:
                try:
                    ws = websocket.WebSocket()
                    ws.connect(WS_URL)
                    print(f"[WS Listener] Connected to {WS_URL}")
                    
                    while True:
                        msg = ws.recv()
                        if msg:
                            runtime = get_instance()
                            if runtime:
                                runtime.trigger_on_script_run_start(session_id)
                except Exception as e:
                    print(f"[WS Listener] Error or connection lost: {e}. Retrying...")
                    time.sleep(2)

        t = threading.Thread(target=run_listener)
        t.daemon = True
        t.start()

start_websocket_listener()

# =====================================================================
# ĐỊNH NGHĨA PHONG CÁCH GIAO DIỆN TỐI CAO CẤP (DARK THEME)
# =====================================================================
st.markdown("""
<style>
    /* Nhập font chữ Inter */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
        background-color: #0B132B;
        color: #F8FAFC;
    }
    
    /* Thiết kế tiêu đề chính */
    .header-bar {
        background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
        padding: 24px 30px;
        border-radius: 14px;
        border: 1px solid #334155;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
        margin-bottom: 25px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .app-title-main {
        font-size: 26px;
        font-weight: 800;
        margin: 0;
        letter-spacing: 0.5px;
        background: linear-gradient(to right, #818CF8, #34D399);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    
    .app-subtitle-main {
        font-size: 13px;
        color: #94A3B8;
        margin-top: 4px;
        font-weight: 500;
    }

    /* Thẻ chỉ số tổng quan (KPI Metrics) */
    .kpi-container {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 25px;
    }
    
    .kpi-card {
        background: #1E293B;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #334155;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    
    .kpi-label {
        font-size: 11px;
        font-weight: 700;
        color: #94A3B8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
    }
    
    .kpi-value {
        font-size: 22px;
        font-weight: 700;
        color: #F8FAFC;
    }
    
    .kpi-desc {
        font-size: 11px;
        color: #64748B;
        margin-top: 4px;
    }
    
    /* Panel chứa quy ước màu sắc */
    .color-legend-bar {
        background: #111827;
        padding: 12px 20px;
        border-radius: 8px;
        border: 1px solid #374151;
        margin-bottom: 25px;
        font-size: 12.5px;
        display: flex;
        align-items: center;
        gap: 15px;
        flex-wrap: wrap;
    }
    
    .legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
    }
    
    .dot-indigo { width: 8px; height: 8px; background-color: #818CF8; border-radius: 50%; }
    .dot-green { width: 8px; height: 8px; background-color: #34D399; border-radius: 50%; }
    .dot-orange { width: 8px; height: 8px; background-color: #F59E0B; border-radius: 50%; }
    .dot-purple { width: 8px; height: 8px; background-color: #A78BFA; border-radius: 50%; }

    /* Hộp cảnh báo Observability */
    .alert-box-critical {
        background: linear-gradient(135deg, #450A0A 0%, #7F1D1D 100%);
        border-left: 5px solid #EF4444;
        color: #FECACA;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 10px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        font-size: 13px;
        border-top: 1px solid #991B1B;
        border-right: 1px solid #991B1B;
        border-bottom: 1px solid #991B1B;
    }
    
    .alert-box-warning {
        background: linear-gradient(135deg, #451A03 0%, #78350F 100%);
        border-left: 5px solid #F59E0B;
        color: #FEF3C7;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 10px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        font-size: 13px;
        border-top: 1px solid #92400E;
        border-right: 1px solid #92400E;
        border-bottom: 1px solid #92400E;
    }

    /* Accordion / Project group styling */
    .project-header-row {
        background-color: #1F2937;
        padding: 14px 20px;
        border-radius: 10px;
        border: 1px solid #374151;
        margin-top: 20px;
        margin-bottom: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .project-title {
        font-size: 15px;
        font-weight: 700;
        color: #F8FAFC;
    }
    
    .project-metrics {
        font-size: 12.5px;
        color: #9CA3AF;
        display: flex;
        gap: 15px;
    }
</style>
""", unsafe_allow_html=True)

# =====================================================================
# RENDER HEADER & ĐỒNG BỘ DỮ LIỆU
# =====================================================================
col_header_title, col_header_btn = st.columns([7, 3])

with col_header_title:
    st.markdown("""
    <div style="margin-bottom: 15px;">
        <h1 style="font-size: 26px; font-weight: 800; margin: 0; background: linear-gradient(to right, #818CF8, #34D399); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            HỢP ĐỒNG MANAGER
        </h1>
        <p style="font-size: 13px; color: #94A3B8; margin: 4px 0 0 0; font-weight: 500;">
            Harness Engineering 5-Layers | Hệ thống cập nhật tự động từ file Excel gốc
        </p>
    </div>
    """, unsafe_allow_html=True)

with col_header_btn:
    st.markdown("<div style='height: 10px;'></div>", unsafe_allow_html=True)
    btn_col1, btn_col2 = st.columns(2)
    with btn_col1:
        sync_db = st.button("🔄 Đồng bộ Excel", use_container_width=True, help="Đọc file Excel gốc và nạp dữ liệu vào SQLite")
    with btn_col2:
        add_contract = st.button("➕ Thêm hợp đồng", use_container_width=True)

# Trình xử lý nút đồng bộ Excel
if sync_db:
    with st.spinner("Đang đồng bộ dữ liệu từ file Excel..."):
        try:
            res = requests.post(f"{BACKEND_URL}/api/excel/import")
            if res.status_code == 200:
                result = res.json()
                st.toast(f"Đã đồng bộ {result.get('imported_count')} gói thầu thành công!", icon="✅")
                time.sleep(1)
                st.rerun()
            else:
                st.error(f"Đồng bộ thất bại: {res.json().get('detail')}")
        except Exception as e:
            st.error(f"Lỗi kết nối tới Backend: {e}")

# =====================================================================
# FETCH DỮ LIỆU TỪ BACKEND
# =====================================================================
hd_list = []
cb_list = []

try:
    hd_list = requests.get(f"{BACKEND_URL}/api/hop_dong").json()
    cb_list = requests.get(f"{BACKEND_URL}/api/canh_bao").json()
except Exception:
    st.error(f"Không thể kết nối đến máy chủ Backend ({BACKEND_URL}). Vui lòng chắc chắn uvicorn đã khởi chạy.")
    st.stop()

# Helper chuyển tỷ đồng thành chuỗi Đồng hoặc Tỷ dễ đọc
def format_money_dong(ty_value):
    if not ty_value or ty_value == 0:
        return "0đ"
    # 1 Tỷ = 1,000,000,000đ
    real_dong = int(ty_value * 1_000_000_000)
    return f"{real_dong:,.0f}đ"

# =====================================================================
# RENDER METRIC CARDS
# =====================================================================
total_packages = len(hd_list)
total_budget_ty = sum(item["ngan_sach"] for item in hd_list)
total_actual_contract_ty = sum(item["gia_tri_hdcu"] for item in hd_list)

avg_ratio = 0.0
if total_budget_ty > 0:
    avg_ratio = (total_actual_contract_ty / total_budget_ty) * 100

st.markdown(f"""
<div class="kpi-container">
    <div class="kpi-card">
        <div class="kpi-label">Tổng số hợp đồng / Gói thầu</div>
        <div class="kpi-value">{total_packages}</div>
        <div class="kpi-desc">Tổng số hạng mục đang quản lý</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-label">Tổng ngân sách được duyệt</div>
        <div class="kpi-value">{format_money_dong(total_budget_ty)}</div>
        <div class="kpi-desc">Ngân sách CĐT cấp ({total_budget_ty:,.2f} tỷ)</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-label">Tổng giá trị ký kết thực tế</div>
        <div class="kpi-value" style="color: #34D399;">{format_money_dong(total_actual_contract_ty)}</div>
        <div class="kpi-desc">Giá trị hợp đồng cung ứng ({total_actual_contract_ty:,.2f} tỷ)</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-label">Tỷ lệ Ký kết / Ngân sách</div>
        <div class="kpi-value" style="color: { '#EF4444' if avg_ratio > 100 else '#A78BFA' };">{avg_ratio:.1f}%</div>
        <div class="kpi-desc">Hạn mức chi phí thực tế / Dự toán</div>
    </div>
</div>
""", unsafe_allow_html=True)

# Quy ước màu sắc (Color Legend)
st.markdown("""
<div class="color-legend-bar">
    <span style="font-weight:700; color:#9CA3AF;">QUY ƯỚC MÀU SẮC:</span>
    <div class="legend-item"><div class="dot-indigo"></div> Giá trị Hợp đồng (Indigo)</div>
    <div class="legend-item"><div class="dot-green"></div> Nghiệm thu sản lượng (Teal/Green)</div>
    <div class="legend-item"><div class="dot-orange"></div> Thực tế thanh toán (Orange)</div>
    <div class="legend-item"><div class="dot-purple"></div> Tạm ứng & Bản nháp (Purple)</div>
</div>
""", unsafe_allow_html=True)

# =====================================================================
# MODAL/FORM THÊM HỢP ĐỒNG MỚI
# =====================================================================
if add_contract:
    st.markdown("### 📝 Thêm Gói thầu / Hợp đồng mới")
    with st.form("add_contract_form", clear_on_submit=True):
        f_nhom = st.text_input("Nhóm Công trình *", placeholder="Hạ tầng kỹ thuật, Xây dựng dân dụng...")
        f_ma = st.text_input("Mã BSC", placeholder="HT-PL02-01...")
        f_goi = st.text_input("Gói thầu (PL)", placeholder="PL02...")
        f_hm = st.text_input("Hạng mục / Công việc chi tiết *", placeholder="Thi công cọc...")
        f_pt = st.text_input("Đối tác phụ trách", placeholder="Tên nhà thầu phụ...")
        
        c1, c2 = st.columns(2)
        with c1:
            f_ns = st.number_input("Ngân sách (Tỷ đồng)", min_value=0.0, value=0.0, step=0.1)
            f_bd = st.date_input("Ngày BĐ kế hoạch", value=date.today())
        with c2:
            f_hd = st.number_input("Giá trị ký HĐ thực tế (Tỷ đồng)", min_value=0.0, value=0.0, step=0.1)
            f_kt = st.date_input("Ngày KT kế hoạch", value=date.today())
            
        c3, c4 = st.columns(2)
        with c3:
            f_dk = st.selectbox("Điều kiện khởi công", ["ĐỦ ĐK KHỞI CÔNG", "THIẾU ĐK"])
        with c4:
            f_tt = st.selectbox("Trạng thái thi công", ["Chưa khởi công", "Đang thực hiện", "Đã kết thúc"])

        f_submit = st.form_submit_button("Lưu Hợp Đồng")
        if f_submit:
            if not f_nhom or not f_hm:
                st.warning("Vui lòng nhập đầy đủ Nhóm công trình và Hạng mục công việc.")
            else:
                payload = {
                    "nhom_ct": f_nhom,
                    "ma_bsc": f_ma,
                    "goi_thau": f_goi,
                    "hang_muc": f_hm,
                    "phu_trach": f_pt,
                    "ngan_sach": f_ns,
                    "gia_tri_hdcu": f_hd,
                    "ngay_bd": f_bd.strftime("%Y-%m-%d"),
                    "ngay_kt": f_kt.strftime("%Y-%m-%d"),
                    "dieu_kien_du": f_dk,
                    "trang_thai": f_tt
                }
                res = requests.post(f"{BACKEND_URL}/api/hop_dong", json=payload)
                if res.status_code == 200:
                    st.success("Thêm hợp đồng mới thành công!")
                    time.sleep(1)
                    st.rerun()
                else:
                    st.error(f"Lỗi: {res.json().get('detail')}")

# =====================================================================
# BỘ LỌC DỮ LIỆU & TÌM KIẾM
# =====================================================================
st.markdown("<div style='height:10px;'></div>", unsafe_allow_html=True)
col_search, col_f1, col_f2 = st.columns([5, 2.5, 2.5])

# Thu thập danh sách duy nhất các nhóm công trình
unique_groups = sorted(list(set(item["nhom_ct"] for item in hd_list)))
unique_statuses = sorted(list(set(item["trang_thai"] for item in hd_list)))

with col_search:
    search_query = st.text_input("🔍 Tìm kiếm", placeholder="Tìm theo Mã BSC, hạng mục, nhà thầu, đối tác phụ trách...")

with col_f1:
    group_filter = st.selectbox("📂 Tất cả Công trình", ["Tất cả Công trình"] + unique_groups)

with col_f2:
    status_filter = st.selectbox("⚡ Tất cả Trạng thái", ["Tất cả Trạng thái"] + unique_statuses)

# Lọc danh sách hợp đồng
filtered_hds = []
for hd in hd_list:
    # Lọc theo Tìm kiếm
    if search_query:
        q = search_query.lower()
        if (q not in hd["hang_muc"].lower() and 
            q not in (hd["ma_bsc"] or "").lower() and 
            q not in (hd["phu_trach"] or "").lower()):
            continue
            
    # Lọc theo Nhóm CT
    if group_filter != "Tất cả Công trình" and hd["nhom_ct"] != group_filter:
        continue
        
    # Lọc theo Trạng thái
    if status_filter != "Tất cả Trạng thái" and hd["trang_thai"] != status_filter:
        continue
        
    filtered_hds.append(hd)

# Nhóm các dòng dữ liệu sau khi lọc để hiển thị phân cấp Accordion
grouped_data = {}
for hd in filtered_hds:
    nhom = hd["nhom_ct"]
    if nhom not in grouped_data:
        grouped_data[nhom] = []
    grouped_data[nhom].append(hd)

# =====================================================================
# CHATBOT AI VÀ HIỂN THỊ CẢNH BÁO (DÀNH CHO SIDEBAR/BÊN CẠNH)
# =====================================================================
st.markdown("<br>", unsafe_allow_html=True)
col_dashboard_main, col_chat_ai = st.columns([7, 3])

with col_chat_ai:
    st.markdown('<div class="panel-title">🤖 Trợ lý AI Kiểm toán & Phân tích</div>', unsafe_allow_html=True)
    st.info("Chat hoặc tải ảnh hóa đơn để AI tự bóc tách thông tin hạng mục.")
    
    ai_text = st.text_area("Nhập mô tả hạng mục tự do:", placeholder="Ví dụ: Thêm hạng mục Xây tường rào mã BSC VSV-XT-01 gói thầu PL12 đối tác Song Nam ngân sách 1.5 tỷ...", height=100)
    ai_file = st.file_uploader("Hoặc tải lên hình ảnh biên nhận vật tư/hợp đồng:", type=["png", "jpg", "jpeg"])
    
    if st.button("🚀 Gửi AI Xử lý", use_container_width=True):
        if not ai_text and not ai_file:
            st.warning("Vui lòng nhập văn bản mô tả hoặc tải lên ảnh.")
        else:
            with st.spinner("Gemini đang bóc tách và đối soát dữ liệu..."):
                try:
                    files = None
                    data = {}
                    if ai_text:
                        data["text_content"] = ai_text
                    if ai_file:
                        files = {"file": (ai_file.name, ai_file.read(), ai_file.type)}
                        
                    res = requests.post(f"{BACKEND_URL}/api/ai/parse", data=data, files=files)
                    if res.status_code == 200:
                        result = res.json()
                        if result.get("success"):
                            st.success(f"AI bóc tách thành công hạng mục: '{result['data']['hang_muc']}'!")
                            st.toast("Dữ liệu đã tự động chèn vào SQLite!", icon="💾")
                            with st.expander("🔍 Chi tiết phân tích & Lập luận của AI", expanded=True):
                                st.write("Lập luận của AI:", result.get("reasoning"))
                                val = result.get("validation", {})
                                if val.get("is_anomaly"):
                                    st.error(f"⚠️ Phát hiện bất thường: {val.get('warning_content')}")
                                st.write("Dữ liệu:", result.get("data"))
                        else:
                            st.warning(result.get("message"))
                    else:
                        st.error(f"Backend báo lỗi: {res.json().get('detail')}")
                except Exception as e:
                    st.error(f"Lỗi: {e}")

    # Hiển thị log cảnh báo thời gian thực
    st.markdown('<div class="panel-title" style="margin-top:25px;">🚨 Luồng Cảnh Báo Đối Soát</div>', unsafe_allow_html=True)
    if not cb_list:
        st.success("Hệ thống an toàn. Chưa ghi nhận cảnh báo bất thường.")
    else:
        for cb in cb_list[:5]:
            is_crit = cb["muc_do"] == "Critical"
            c_class = "alert-box-critical" if is_crit else "alert-box-warning"
            icon = "🔴 CRITICAL" if is_crit else "⚠️ WARNING"
            
            try:
                dt = datetime.strptime(cb["timestamp"], "%Y-%m-%dT%H:%M:%S.%f")
                time_str = dt.strftime("%H:%M:%S - %d/%m/%Y")
            except Exception:
                time_str = cb["timestamp"]
                
            st.markdown(f"""
            <div class="{c_class}">
                <strong>{icon}</strong> - {cb['noi_dung']}
                <div style="font-size:10px; color:#9CA3AF; text-align:right; margin-top:4px;">{time_str}</div>
            </div>
            """, unsafe_allow_html=True)

with col_dashboard_main:
    st.markdown('<div class="panel-title">📋 Danh Sách Gói Thầu & Công Trình</div>', unsafe_allow_html=True)
    
    if not grouped_data:
        st.info("Không tìm thấy dữ liệu gói thầu nào phù hợp với bộ lọc.")
    else:
        # Loop qua từng phân nhóm công trình để vẽ Accordion
        for nhom_name, items in grouped_data.items():
            # Tính toán nhanh tổng ngân sách và giá trị thực tế của nhóm này
            nhom_budget = sum(it["ngan_sach"] for it in items)
            nhom_actual = sum(it["gia_tri_hdcu"] for it in items)
            
            # Tiêu đề Accordion
            header_html = f"""
            <div class="project-header-row">
                <span class="project-title">📂 {nhom_name} ({len(items)} gói)</span>
                <span class="project-metrics">
                    <span>Ngân sách: <b>{format_money_dong(nhom_budget)}</b></span>
                    <span>Ký kết: <b style="color:#34D399;">{format_money_dong(nhom_actual)}</b></span>
                </span>
            </div>
            """
            st.markdown(header_html, unsafe_allow_html=True)
            
            # Xây dựng bảng HTML chi tiết cho nhóm này
            html_table = """
            <div style="overflow-x: auto; border-radius: 8px; border: 1px solid #374151; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12.5px; background-color: #111827; color: #F3F4F6;">
              <thead style="background-color: #1F2937; color: #9CA3AF; border-bottom: 2px solid #374151;">
                <tr>
                  <th style="padding: 10px 12px; width: 60px;">TT</th>
                  <th style="padding: 10px 12px; width: 140px;">Ký hiệu HĐ (Mã BSC)</th>
                  <th style="padding: 10px 12px;">Hạng mục / Công việc</th>
                  <th style="padding: 10px 12px; width: 120px;">Đối tác phụ trách</th>
                  <th style="padding: 10px 12px; width: 140px; text-align: right;">Giá trị HĐ (Ngân sách)</th>
                  <th style="padding: 10px 12px; width: 140px; text-align: right;">Thực tế ký kết (HĐCU)</th>
                  <th style="padding: 10px 12px; width: 80px; text-align: center;">Tỷ lệ ký / NS</th>
                  <th style="padding: 10px 12px; width: 100px; text-align: center;">Trạng thái</th>
                  <th style="padding: 10px 12px; width: 80px; text-align: center;">Thao tác</th>
                </tr>
              </thead>
              <tbody>
            """
            
            for it in items:
                is_flagged = it["status"] == "Flagged"
                row_bg = "#450A0A" if is_flagged else "#111827"
                row_border = "1px solid #7F1D1D" if is_flagged else "1px solid #374151"
                
                # Format các giá trị tiền tệ
                ns_str = format_money_dong(it["ngan_sach"])
                hdcu_str = format_money_dong(it["gia_tri_hdcu"])
                
                # Trạng thái điều kiện chốt chặn khởi công
                dk = it["dieu_kien_du"]
                dk_badge = ""
                if dk == "ĐỦ ĐK KHỞI CÔNG":
                    dk_badge = '<span style="background-color: #065F46; color: #34D399; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">Đủ ĐKKC</span>'
                else:
                    dk_badge = '<span style="background-color: #78350F; color: #F59E0B; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">Thiếu ĐKKC</span>'

                # Tỷ lệ phần trăm
                tile = it["tile_hdcu_ns"]
                tile_color = "#EF4444" if tile > 100 else ("#34D399" if tile > 0 else "#9CA3AF")
                
                # ID Ký hiệu HĐ
                id_hd = it["ma_bsc"] if it["ma_bsc"] else (it["goi_thau"] if it["goi_thau"] else f"ID: {it['id']}")

                html_table += f"""
                <tr style="background-color: {row_bg}; border-bottom: {row_border};">
                  <td style="padding: 10px 12px; font-weight:600; color:#9CA3AF;">{it['tt']}</td>
                  <td style="padding: 10px 12px; font-weight:600; color:#818CF8;">{id_hd}</td>
                  <td style="padding: 10px 12px; font-weight:500;">
                    {it['hang_muc']}
                    <div style="font-size:10px; color:#6B7280; margin-top:2px;">
                        Gói thầu: {it['goi_thau'] or 'N/A'} | Hạn: {it['ngay_bd'] or 'N/A'} đến {it['ngay_kt'] or 'N/A'}
                    </div>
                  </td>
                  <td style="padding: 10px 12px; color:#D1D5DB;">{it['phu_trach']}</td>
                  <td style="padding: 10px 12px; text-align: right; color:#818CF8; font-weight:600;">{ns_str}</td>
                  <td style="padding: 10px 12px; text-align: right; color:#34D399; font-weight:600;">{hdcu_str}</td>
                  <td style="padding: 10px 12px; text-align: center; color:{tile_color}; font-weight:700;">{tile:.1f}%</td>
                  <td style="padding: 10px 12px; text-align: center;">
                    <div style="margin-bottom:4px;">{dk_badge}</div>
                    <span style="font-size: 10px; color: #9CA3AF; background-color: #374151; padding: 1px 5px; border-radius: 4px;">{it['trang_thai']}</span>
                  </td>
                  <td style="padding: 10px 12px; text-align: center;">
                    <span style="color:#6B7280; font-size:11px;">[Chi tiết]</span>
                  </td>
                </tr>
                """
            html_table += "</tbody></table></div>"
            st.markdown(html_table, unsafe_allow_html=True)
