/**
 * GEMINI AI COGNITIVE LAYER & DATA INGESTION SERVICE
 * Harness Engineer Implementation for Construction Life Cycle
 */

class GeminiAIService {
    constructor() {
        this.apiKey = localStorage.getItem('gemini_api_key') || '';
        this.model = localStorage.getItem('gemini_model') || 'gemini-3.5-flash';
        this.isSimulation = !this.apiKey;
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('gemini_api_key', key);
        this.isSimulation = !key;
    }

    setModel(modelName) {
        this.model = modelName || 'gemini-3.5-flash';
        localStorage.setItem('gemini_model', this.model);
    }

    getAiStatus() {
        if (this.isSimulation) {
            return {
                mode: 'simulation',
                text: 'Đang ở chế độ Giả lập (Simulation Mode - Không cần API Key)',
                color: 'var(--color-yellow)'
            };
        } else {
            return {
                mode: 'live',
                text: `Gemini AI Live (${this.model}) - Sẵn sàng kết nối`,
                color: 'var(--color-green)'
            };
        }
    }

    /**
     * Call Google Gemini API (Dynamic Model)
     */
    async callGeminiAPI(prompt, systemInstruction = '') {
        if (this.isSimulation) {
            return this.getMockResponse(prompt);
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }]
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error?.message || 'Lỗi kết nối Gemini API');
            }

            const resData = await response.json();
            return resData.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('Gemini API Error, falling back to simulation:', error);
            return `[Lỗi API: ${error.message}]. Phản hồi giả lập:\n\n` + this.getMockResponse(prompt);
        }
    }

    /**
     * Simulate PDF/PNG OCR Ingestion
     */
    async ingestDocument(docType) {
        // Simulating network delay for OCR
        await new Promise(resolve => setTimeout(resolve, 2000));

        switch(docType) {
            case 's03': // Variation
                return {
                    ma_bsc: 'VSV_QLTC_TT.01',
                    ngay_ps: '2026-06-12',
                    loai_ps: 'Phát sinh khối lượng',
                    mo_ta: 'Phát sinh xử lý nền móng đất yếu khu vực nhà mẫu CT-01: Bổ sung 450 cọc tre d100 l=4m và đắp cát nền đệm thay thế đất bùn yếu dày 1.2m.',
                    nguyen_nhan: 'Địa chất thực tế hố móng sai khác so với báo cáo khảo sát thiết kế ban đầu (gặp túi bùn cục bộ).',
                    de_xuat: 'Bổ sung biện pháp gia cố cọc tre và thay cát đệm, tính toán bổ sung khối lượng thực tế A-B.',
                    gia_tri: 0.8,
                    tre_han: 5,
                    link_hs: 'PS01_NenYeu.pdf'
                };
            case 's04': // Supply
                return {
                    ma_bsc: 'VSV_QLTC_TT.01',
                    ngay_yc: '2026-06-14',
                    loai_yc: 'Đặc thù',
                    vattu: 'Đá Marble Crema Marfil Tây Ban Nha',
                    dac_ta: 'Cung cấp đá Marble cao cấp ốp lát mặt tiền sảnh chính nhà mẫu CT-01 để phục vụ bán hàng theo chỉ định thẩm mỹ mới từ CĐT.',
                    kl: 120,
                    dvt: 'm2',
                    gia_tri: 1.2,
                    trong_ngoai: 'Ngoài HĐCU',
                    link_hs: 'YC01_Marble.pdf'
                };
            case 's05': // Delay Recovery
                return {
                    ma_bsc: 'VSV_QLTC_TT.01',
                    ngay_phat_hien: '2026-06-20',
                    muc_cham: 9,
                    nguyen_nhan: 'Mưa lớn kéo dài liên tục do ảnh hưởng bão số 2 tại Vinh dẫn đến hố móng bị ngập úng không thể thi công đổ bê tông.',
                    giai_phap: 'Tăng ca',
                    chi_tiet: 'Bố trí thêm 2 máy bơm công suất lớn hút nước liên tục 24/24h, tăng ca đêm 3 giờ/ngày (từ 19:00 đến 22:00) cho tổ cốt thép cốp pha.',
                    moc_cam_ket: '2026-07-05',
                    link_hs: 'PA_BuTienDo_T6_CT01.pdf'
                };
            default:
                throw new Error("Không hỗ trợ loại văn bản này");
        }
    }

    /**
     * Multi-dimensional synthesis (Project Health Report)
     */
    async generateSynthesisReport(masterData, s03Data, s05Data) {
        const approvedVariations = s03Data.filter(d => d['TT duyệt'] === 'Đã duyệt');
        const totalVariations = approvedVariations.reduce((sum, d) => sum + parseFloat(d['Giá trị (tỷ)'] || 0), 0);
        
        const activeDelays = s05Data.filter(d => d['TT thực hiện'] !== 'Đã hoàn thành');
        const maxDelay = activeDelays.reduce((max, d) => Math.max(max, parseInt(d['Mức chậm (ngày)'] || 0)), 0);
        
        const prompt = `Hãy đóng vai trò Chuyên gia Kiểm soát Dự án ERP, phân tích dữ liệu sau:
- Tổng ngân sách điều hành: ${masterData.reduce((sum, d) => sum + parseFloat(d.ngan_sach || 0), 0)} tỷ.
- Lũy kế phát sinh hợp đồng B-B' đã duyệt: ${totalVariations} tỷ (chiếm ${approvedVariations.length} vụ việc).
- Dự án đang có ${activeDelays.length} gói thầu bị chậm tiến độ, mức chậm lớn nhất là ${maxDelay} ngày.
Hãy lập báo cáo Phân tích Sức khỏe Dự án ngắn gọn dạng Markdown, chỉ rõ nguyên nhân gốc rễ (Root Cause Analysis) và cảnh báo tài chính quan trọng.`;

        return this.callGeminiAPI(prompt, "Bạn là Chuyên gia C-Level ERP kiểm soát chi phí và tiến độ xây dựng. Hãy trả lời bằng tiếng Việt, súc tích và có tính hành động cao.");
    }

    /**
     * Prescriptive AI for Delays > 7 days
     */
    prescriptiveDelayAdvice(packageBsc, delayDays, plannedEndDate) {
        // Calculate predicted end date
        const planDate = new Date(plannedEndDate);
        const predictedDate = new Date(planDate.getTime() + delayDays * 24 * 60 * 60 * 1000);
        const formattedPredicted = predictedDate.toLocaleDateString('vi-VN');

        const warningMsg = `⚠️ [CẢNH BÁO TIẾN ĐỘ]: Gói thầu ${packageBsc} đang bị chậm ${delayDays} ngày. Ngày hoàn thành kế hoạch (${planDate.toLocaleDateString('vi-VN')}) dự báo sẽ bị kéo dài sang ngày ${formattedPredicted} (Trễ đường găng tổng thể CĐT).`;

        const options = [
            {
                index: 1,
                solution: "Tăng ca tối đa & Tăng cường nhân lực",
                detail: "Bổ sung thêm 1 tổ đội thi công (12-15 công nhân), thực hiện tăng ca tối từ 18:00 - 21:30 hàng ngày để bù lại tiến độ kết cấu móng.",
                cost: 0.15, // tỷ
                timeSaved: 7 // ngày
            },
            {
                index: 2,
                solution: "Thay đổi biện pháp thi công (Sử dụng bê tông R7)",
                detail: "Thay đổi cấp phối bê tông thường sang bê tông cường độ cao đông kết nhanh R7 để rút ngắn thời gian tháo cốp pha dầm sàn từ 7 ngày xuống còn 3 ngày.",
                cost: 0.08, // tỷ
                timeSaved: 4 // ngày
            },
            {
                index: 3,
                solution: "Điều chuyển một phần khối lượng cho nhà thầu phụ hỗ trợ",
                detail: "Cắt chuyển phần xây tô ngoài nhà và trát hoàn thiện sảnh cho tổ đội thầu phụ địa phương chuyên nghiệp phụ trách song song.",
                cost: 0.12, // tỷ
                timeSaved: 6 // ngày
            }
        ];

        return {
            warning: warningMsg,
            predictedEndDate: formattedPredicted,
            options: options
        };
    }

    /**
     * Custom Fallback Responses for Simulation Mode
     */
    getMockResponse(prompt) {
        const query = prompt.toLowerCase();
        
        if (query.includes('rủi ro tài chính') || query.includes('vượt trần') || query.includes('rủi ro cao nhất')) {
            return `### BÁO CÁO PHÂN TÍCH RỦI RO TÀI CHÍNH (GEMINI AGENT)

Dựa trên việc quét Bảng Master và các Sổ nghiệp vụ, tôi phát hiện các rủi ro tài chính sau:

1. **Gói thầu nguy cấp nhất: VSV_QLTC_TT.01 (CT-01: Thi công & lắp đặt thiết bị Nhà mẫu)**
   - **Lũy kế Tổng Chi phí:** **1.34 tỷ** (Giá trị HĐ A-B) + **0.80 tỷ** (Phát sinh đã duyệt Sổ 03) = **2.14 tỷ**.
   - **Ngân sách CĐT duyệt:** **2.18 tỷ**.
   - **Tỷ lệ chi phí/ngân sách:** **98.17%** (Đã vượt ngưỡng an toàn **95%**).
   - **Tác động:** Hệ thống đã kích hoạt **Chốt chặn Ngân sách (Financial Hard Gate)**, lập tức khóa phê duyệt các phát sinh mới tại Sổ 03 (đang có 1 phát sinh chờ duyệt trị giá 0.8 tỷ) và Sổ 04 (đang có 1 yêu cầu trị giá 1.2 tỷ).
   
2. **Khuyến nghị điều hành (Prescriptive Action):**
   - Giám đốc dự án cần làm việc với CĐT để ký **Phụ lục hợp đồng điều chỉnh tăng ngân sách gói thầu CT-01** lên tối thiểu **3.5 tỷ** để giải phóng chốt chặn, cho phép phê duyệt đá marble sảnh chính và các hạng mục bổ sung hố móng.`;
        }

        if (query.includes('tóm tắt phương án bù tiến độ') || query.includes('ct-01') || query.includes('vsv_qltc_tt.01')) {
            return `### TÓM TẮT PHƯƠNG ÁN BÙ TIẾN ĐỘ - GÓI THẦU VSV_QLTC_TT.01

Gói thầu **VSV_QLTC_TT.01** ghi nhận chậm tiến độ **5 ngày** tại hạng mục Cọc + Móng phát hiện ngày 16/06/2026.

* **Nguyên nhân gốc rễ:** Mưa lớn kéo dài kết hợp xuất hiện túi bùn địa chất yếu cục bộ tại khu vực hố móng.
* **Biện pháp khắc phục đã duyệt (Sổ 05):**
  - Thực hiện tăng ca đêm 2h/ngày.
  - Bổ sung 1 máy ép cọc chuyên dụng đẩy nhanh tiến độ cọc đại trà.
  - Tổ chức lại dây chuyền đổ bê tông phân đoạn cuốn chiếu.
* **Kết quả thực hiện:** Đã bù lại được **2/5 ngày** chậm trễ. Trạng thái thực hiện hiện tại là **Đang triển khai**, đảm bảo mốc bàn giao móng trước ngày 05/07/2026.`;
        }

        if (query.includes('báo cáo sức khỏe') || query.includes('synthesis')) {
            return `### BÁO CÁO PHÂN TÍCH SỨC KHỎE DỰ ÁN TOÀN DIỆN (THÁNG 06/2026)

**1. Chỉ số tiến độ (Schedule Health):**
- Dự án ghi nhận 1 gói thầu bị chậm tiến độ là **VSV_QLTC_TT.01** (chậm 5 ngày do thời tiết và địa chất). 
- Đã lập phương án bù tiến độ tăng ca thành công, rủi ro ảnh hưởng đường găng tổng thể CĐT ở mức **Thấp**.

**2. Chỉ số chi phí (Cost Health):**
- Tổng chi phí phát sinh toàn dự án đạt **0.80 tỷ** (đều tập trung tại gói CT-01).
- Gói thầu **VSV_QLTC_TT.01** đang chạm ngưỡng **98.17%** ngân sách điều hành. Đây là điểm nóng cần được giải quyết về mặt hồ sơ phụ lục tăng chi phí ngay lập tức.
- Các gói thầu khác (HT-PL02-01, CT-05...) có tỷ lệ chi phí/ngân sách dưới **90%**, hoạt động an toàn.

**3. Đánh giá chất lượng QA/QC:**
- Kết quả nghiệm thu tuần 1-4 đạt trung bình **92%** yêu cầu kỹ thuật. Công tác phối hợp hiện trường giữa Tổng thầu và Tư vấn giám sát đạt hiệu quả cao.`;
        }

        return `### Trợ Lý AI Gemini trả lời:
Tôi đã nhận được câu hỏi của bạn về dự án. Dưới đây là phân tích nhanh:
- Hiện tại hệ thống ghi nhận **107 gói thầu/hạng mục** trong CSDL Master.
- Có **1** gói thầu vượt ngưỡng ngân sách cảnh báo đỏ (CT-01).
- Bạn có thể hỏi sâu hơn bằng cách dùng các shortcut hoặc ra lệnh: *"Mã BSC nào đang gặp rủi ro tài chính cao nhất?"* hoặc *"Tóm tắt bù tiến độ gói thầu CT-01"*.`;
    }

    /**
     * Senior Data Engineer document parsing workflow using prompt chaining
     */
    async parseDocumentWithPrompt(fileContent, docType) {
        if (this.isSimulation) {
            const mockData = await this.ingestDocument(docType);
            let simulatedJson = {};
            if (docType === 's01') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc || 'VSV_QLTC_TT.01',
                    hang_muc: 'CT-01 Nhà mẫu',
                    loai_ho_so: 'Biện pháp thi công',
                    ten_san_pham: 'Bản vẽ biện pháp thi công sảnh chính',
                    link_luu_tru: 'AP-BPTC-01.pdf',
                    nguoi_lap: 'Nguyễn Đình Hùng'
                };
            } else if (docType === 's02') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc || 'VSV_QLTC_TT.01',
                    hang_muc: 'CT-01 Nhà mẫu',
                    loai_tai_lieu: 'Biện pháp thi công',
                    thang_tuan: 'Tuần 28 - Tháng 07/2026',
                    noi_dung: 'Triển khai thi công hoàn thiện phần thô kết cấu sảnh chính nhà mẫu CT-01.',
                    dat_yckt: 'Đạt',
                    link: 'KeHoach_T28.pdf',
                    nguoi_lap: 'Trần Quốc Huy'
                };
            } else if (docType === 's03') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc,
                    hang_muc: 'CT-01 Nhà mẫu',
                    loai_ps: mockData.loai_ps,
                    mo_ta: mockData.mo_ta,
                    nguyen_nhan: mockData.nguyen_nhan,
                    de_xuat: mockData.de_xuat,
                    gia_tri: mockData.gia_tri,
                    tre_han: mockData.tre_han,
                    link_hs: mockData.link_hs
                };
            } else if (docType === 's04') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc,
                    hang_muc: 'CT-01 Nhà mẫu',
                    loai_yc: mockData.loai_yc,
                    vattu: mockData.vattu,
                    dac_ta: mockData.dac_ta,
                    kl: mockData.kl,
                    dvt: mockData.dvt,
                    gia_tri: mockData.gia_tri,
                    trong_ngoai: mockData.trong_ngoai,
                    link_hs: mockData.link_hs
                };
            } else if (docType === 's05') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc,
                    hang_muc: 'CT-01 Nhà mẫu',
                    ngay_phat_hien: mockData.ngay_phat_hien,
                    muc_cham: mockData.muc_cham,
                    nguyen_nhan: mockData.nguyen_nhan,
                    giai_phap: mockData.giai_phap,
                    chi_tiet: mockData.chi_tiet,
                    moc_cam_ket: mockData.moc_cam_ket,
                    link_hs: mockData.link_hs
                };
            }
            return `\`\`\`json\n${JSON.stringify(simulatedJson, null, 2)}\n\`\`\``;
        }

        const systemInstruction = `
Mục tiêu:
Bạn là một Kỹ sư Dữ liệu (Data Engineer) cấp cao và là Chuyên gia Tích hợp Hệ thống trên nền tảng Antigravity. Nhiệm vụ của bạn là đọc kỹ các file tài liệu thô (Excel, Word, PDF), phân tích cấu trúc, bóc tách thông tin và điền dữ liệu vào cấu trúc Form của Web App một cách chính xác tuyệt đối (100%).

Bối cảnh:
Hệ thống Web App này quản lý luồng dữ liệu thời gian thực. Bất kỳ một sai sót nhỏ nào trong việc nhập liệu (sai số tiền, sai ngày tháng, nhầm trường thông tin) đều sẽ gây ra hậu quả nghiêm trọng cho hệ thống cơ sở dữ liệu. Độ chính xác được ưu tiên cao hơn tốc độ.

Hướng dẫn thực hiện (Chuỗi suy luận từng bước):
Hãy thực hiện việc xử lý dữ liệu một cách cực kỳ hệ thống theo 4 bước sau. Trước khi trả về kết quả cuối cùng, hãy suy luận ngầm trong hệ thống của bạn:

Bước 1: Quét và Phân tích cấu trúc gốc (Data Ingestion)
Đọc toàn bộ nội dung file đính kèm (PDF, Word, Excel).
Nhận diện các bảng biểu, đoạn văn chứa thông tin cốt lõi (Tên, Ngày tháng, Số liệu tài chính, Mã dự án...).

Bước 2: Ánh xạ dữ liệu (Data Mapping)
Đối chiếu thông tin vừa tìm được với "Cấu trúc Form Web App" được cung cấp bên dưới.
Xác định chính xác giá trị nào thuộc về trường dữ liệu (field) nào.

Bước 3: Thẩm định chéo (Cross-Validation - BƯỚC BẮT BUỘC)
Kiểm tra lại 1 lần nữa xem giá trị chuẩn bị điền có khớp chính xác từng dấu phẩy, chữ số với file gốc hay không.
Kiểm tra định dạng (Ví dụ: Ngày tháng phải đúng chuẩn YYYY-MM-DD nếu là ngày điền form, số tiền không chứa ký tự chữ).

Bước 4: Đóng gói và Trích xuất (Payload Execution)
Trình bày kết quả đầu ra dưới dạng dữ liệu có cấu trúc (JSON) để hệ thống Antigravity tự động đẩy (push) vào Web App, hoặc định dạng bảng đối chiếu rõ ràng tùy theo yêu cầu của hệ thống.

Giới hạn và Quy chuẩn đầu ra (Constraints):
Chính xác tuyệt đối (Strict Grounding): CHỈ trích xuất dữ liệu có sự hiện diện thực tế trong file. TUYỆT ĐỐI KHÔNG tự suy diễn, đoán mò, hoặc tính toán lại nếu không có yêu cầu.
Xử lý dữ liệu trống (Null Handling): Nếu Cấu trúc Form yêu cầu một thông tin nhưng trong file gốc không có, bắt buộc phải trả về giá trị null hoặc ghi rõ "Không có dữ liệu". Tuyệt đối không tự bịa dữ liệu để lấp đầy form.
Xử lý xung đột: Nếu trong file có hai dữ liệu mâu thuẫn cho cùng một trường thông tin, hãy dừng lại, để trống trường đó và ghi chú cảnh báo [CẢNH BÁO: Dữ liệu mâu thuẫn].
Định dạng đầu ra: Toàn bộ kết quả điền form phải được đặt trong một khối mã (Code Block) định dạng JSON để API của Antigravity có thể đọc trực tiếp.
`;

        const schemas = {
            s01: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục công việc (ví dụ: Nhà mẫu CT-01)",
                loai_ho_so: "Loại hồ sơ (chọn một trong các giá trị: Biện pháp thi công, Specs, Bản vẽ, BOQ/KL, LCNT, Ký HĐCU, KHCU)",
                ten_san_pham: "Tên sản phẩm / Số hiệu (ví dụ: Báo cáo biện pháp thi công phần ngầm số AP-BPTC-01)",
                link_luu_tru: "Đường dẫn tài liệu đính kèm (tên file hoặc URL)",
                nguoi_lap: "Tên người lập biểu mẫu"
            },
            s02: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục công việc (ví dụ: Nhà mẫu CT-01)",
                loai_tai_lieu: "Loại tài liệu (ví dụ: Biện pháp thi công, Kế hoạch cung ứng, Biểu đồ...)",
                thang_tuan: "Tháng/Tuần kế hoạch (ví dụ: Tuần 28 - Tháng 07/2026)",
                noi_dung: "Nội dung kế hoạch chính",
                dat_yckt: "Đạt YCKT CĐT (chọn 'Đạt' hoặc 'Chưa đạt')",
                link: "Đường dẫn tài liệu đính kèm (tên file hoặc URL)",
                nguoi_lap: "Tên người lập kế hoạch"
            },
            s03: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục (ví dụ: Nhà mẫu CT-01)",
                loai_ps: "Loại phát sinh (ví dụ: Phát sinh khối lượng)",
                mo_ta: "Mô tả chi tiết hạng mục phát sinh",
                nguyen_nhan: "Nguyên nhân chính dẫn tới phát sinh",
                de_xuat: "Đề xuất giải pháp khắc phục",
                gia_tri: "Giá trị phát sinh dự kiến (số thực đơn vị tỷ đồng, ví dụ: 0.8)",
                tre_han: "Ảnh hưởng tiến độ nếu có (số nguyên số ngày chậm trễ, ví dụ: 5)",
                link_hs: "Hồ sơ đính kèm (tên tệp hoặc link)"
            },
            s04: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục (ví dụ: Nhà mẫu CT-01)",
                loai_yc: "Loại yêu cầu cung ứng (ví dụ: Đặc thù)",
                vattu: "Tên vật tư / thiết bị",
                dac_ta: "Đặc tả kỹ thuật của vật tư",
                kl: "Khối lượng yêu cầu",
                dvt: "Đơn vị tính",
                gia_tri: "Dự kiến chi phí (số thực đơn vị tỷ đồng, ví dụ: 1.2)",
                trong_ngoai: "Trong hay Ngoài HĐCU (chọn 'Trong HĐCU' hoặc 'Ngoài HĐCU')",
                link_hs: "Hồ sơ đính kèm (tên tệp hoặc link)"
            },
            s05: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục (ví dụ: Nhà mẫu CT-01)",
                ngay_phat_hien: "Ngày phát hiện chậm tiến độ (định dạng YYYY-MM-DD)",
                muc_cham: "Mức độ chậm trễ (số ngày, ví dụ: 9)",
                nguyen_nhan: "Nguyên nhân gây chậm tiến độ",
                giai_phap: "Giải pháp khắc phục",
                chi_tiet: "Chi tiết hành động cụ thể",
                moc_cam_ket: "Mốc cam kết hoàn thành (định dạng YYYY-MM-DD)",
                link_hs: "Hồ sơ đính kèm (tên tệp hoặc link)"
            }
        };

        const targetSchema = schemas[docType] || schemas.s03;

        const prompt = `
Dưới đây là nội dung tài liệu thô được cung cấp:
---
NỘI DUNG TÀI LIỆU:
${fileContent}
---

Hãy trích xuất và trả về dữ liệu tương ứng với cấu trúc JSON sau:
${JSON.stringify(targetSchema, null, 2)}
`;

        return this.callGeminiAPI(prompt, systemInstruction);
    }

    /**
     * Parse uploaded PDF/images/text documents directly as multimodal data
     */
    async parseMultimodalDocument(base64Data, mimeType, docType) {
        if (this.isSimulation) {
            const mockData = await this.ingestDocument(docType);
            let simulatedJson = {};
            if (docType === 's01') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc || 'VSV_QLTC_TT.01',
                    hang_muc: 'CT-01 Nhà mẫu',
                    loai_ho_so: 'Biện pháp thi công',
                    ten_san_pham: 'Bản vẽ biện pháp thi công sảnh chính',
                    link_luu_tru: 'AP-BPTC-01.pdf',
                    nguoi_lap: 'Nguyễn Đình Hùng'
                };
            } else if (docType === 's02') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc || 'VSV_QLTC_TT.01',
                    hang_muc: 'CT-01 Nhà mẫu',
                    loai_tai_lieu: 'Biện pháp thi công',
                    thang_tuan: 'Tuần 28 - Tháng 07/2026',
                    noi_dung: 'Triển khai thi công hoàn thiện phần thô kết cấu sảnh chính nhà mẫu CT-01.',
                    dat_yckt: 'Đạt',
                    link: 'KeHoach_T28.pdf',
                    nguoi_lap: 'Trần Quốc Huy'
                };
            } else if (docType === 's03') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc,
                    hang_muc: 'CT-01 Nhà mẫu',
                    loai_ps: mockData.loai_ps,
                    mo_ta: mockData.mo_ta,
                    nguyen_nhan: mockData.nguyen_nhan,
                    de_xuat: mockData.de_xuat,
                    gia_tri: mockData.gia_tri,
                    tre_han: mockData.tre_han,
                    link_hs: mockData.link_hs
                };
            } else if (docType === 's04') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc,
                    hang_muc: 'CT-01 Nhà mẫu',
                    loai_yc: mockData.loai_yc,
                    vattu: mockData.vattu,
                    dac_ta: mockData.dac_ta,
                    kl: mockData.kl,
                    dvt: mockData.dvt,
                    gia_tri: mockData.gia_tri,
                    trong_ngoai: mockData.trong_ngoai,
                    link_hs: mockData.link_hs
                };
            } else if (docType === 's05') {
                simulatedJson = {
                    ma_bsc: mockData.ma_bsc,
                    hang_muc: 'CT-01 Nhà mẫu',
                    ngay_phat_hien: mockData.ngay_phat_hien,
                    muc_cham: mockData.muc_cham,
                    nguyen_nhan: mockData.nguyen_nhan,
                    giai_phap: mockData.giai_phap,
                    chi_tiet: mockData.chi_tiet,
                    moc_cam_ket: mockData.moc_cam_ket,
                    link_hs: mockData.link_hs
                };
            }
            return `\`\`\`json
${JSON.stringify(simulatedJson, null, 2)}
\`\`\``;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        
        const schemas = {
            s01: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục công việc (ví dụ: Nhà mẫu CT-01)",
                loai_ho_so: "Loại hồ sơ (chọn một trong các giá trị: Biện pháp thi công, Specs, Bản vẽ, BOQ/KL, LCNT, Ký HĐCU, KHCU)",
                ten_san_pham: "Tên sản phẩm / Số hiệu (ví dụ: Báo cáo biện pháp thi công phần ngầm số AP-BPTC-01)",
                link_luu_tru: "Đường dẫn tài liệu đính kèm (tên file hoặc URL)",
                nguoi_lap: "Tên người lập biểu mẫu"
            },
            s02: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục công việc (ví dụ: Nhà mẫu CT-01)",
                loai_tai_lieu: "Loại tài liệu (ví dụ: Biện pháp thi công, Kế hoạch cung ứng...)",
                thang_tuan: "Tháng/Tuần kế hoạch (ví dụ: Tuần 28 - Tháng 07/2026)",
                noi_dung: "Nội dung kế hoạch chính",
                dat_yckt: "Đạt YCKT CĐT (chọn 'Đạt' hoặc 'Chưa đạt')",
                link: "Đường dẫn tài liệu đính kèm (tên file hoặc URL)",
                nguoi_lap: "Tên người lập kế hoạch"
            },
            s03: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục (ví dụ: Nhà mẫu CT-01)",
                loai_ps: "Loại phát sinh (ví dụ: Phát sinh khối lượng)",
                mo_ta: "Mô tả chi tiết hạng mục phát sinh",
                nguyen_nhan: "Nguyên nhân chính dẫn tới phát sinh",
                de_xuat: "Đề xuất giải pháp khắc phục",
                gia_tri: "Giá trị phát sinh dự kiến (số thực đơn vị tỷ đồng, ví dụ: 0.8)",
                tre_han: "Ảnh hưởng tiến độ nếu có (số nguyên số ngày chậm trễ, ví dụ: 5)",
                link_hs: "Hồ sơ đính kèm (tên tệp hoặc link)"
            },
            s04: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục (ví dụ: Nhà mẫu CT-01)",
                loai_yc: "Loại yêu cầu cung ứng (ví dụ: Đặc thù)",
                vattu: "Tên vật tư / thiết bị",
                dac_ta: "Đặc tả kỹ thuật của vật tư",
                kl: "Khối lượng yêu cầu",
                dvt: "Đơn vị tính",
                gia_tri: "Dự kiến chi phí (số thực đơn vị tỷ đồng, ví dụ: 1.2)",
                trong_ngoai: "Trong hay Ngoài HĐCU (chọn 'Trong HĐCU' hoặc 'Ngoài HĐCU')",
                link_hs: "Hồ sơ đính kèm (tên tệp hoặc link)"
            },
            s05: {
                ma_bsc: "Mã BSC / Gói thầu liên kết (ví dụ: VSV_QLTC_TT.01)",
                hang_muc: "Hạng mục (ví dụ: Nhà mẫu CT-01)",
                ngay_phat_hien: "Ngày phát hiện chậm tiến độ (định dạng YYYY-MM-DD)",
                muc_cham: "Mức độ chậm trễ (số ngày, ví dụ: 9)",
                nguyen_nhan: "Nguyên nhân gây chậm tiến độ",
                giai_phap: "Giải pháp khắc phục",
                chi_tiet: "Chi tiết hành động cụ thể",
                moc_cam_ket: "Mốc cam kết hoàn thành (định dạng YYYY-MM-DD)",
                link_hs: "Hồ sơ đính kèm (tên tệp hoặc link)"
            }
        };

        const targetSchema = schemas[docType] || schemas.s03;

        const systemInstruction = `
Mục tiêu:
Bạn là một Kỹ sư Dữ liệu (Data Engineer) cấp cao và là Chuyên gia Tích hợp Hệ thống trên nền tảng Antigravity. Nhiệm vụ của bạn là đọc kỹ các file tài liệu thô (Excel, Word, PDF), phân tích cấu trúc, bóc tách thông tin và điền dữ liệu vào cấu trúc Form của Web App một cách chính xác tuyệt đối (100%).

Bối cảnh:
Hệ thống Web App này quản lý luồng dữ liệu thời gian thực. Bất kỳ một sai sót nhỏ nào trong việc nhập liệu (sai số tiền, sai ngày tháng, nhầm trường thông tin) đều sẽ gây ra hậu quả nghiêm trọng cho hệ thống cơ sở dữ liệu. Độ chính xác được ưu tiên cao hơn tốc độ.

Hướng dẫn thực hiện (Chuỗi suy luận từng bước):
Hãy thực hiện việc xử lý dữ liệu một cách cực kỳ hệ thống theo 4 bước sau:
Bước 1: Quét và Phân tích cấu trúc gốc (Data Ingestion)
Bước 2: Ánh xạ dữ liệu (Data Mapping)
Bước 3: Thẩm định chéo (Cross-Validation - BƯỚC BẮT BUỘC)
Bước 4: Đóng gói và Trích xuất (Payload Execution)

Giới hạn và Quy chuẩn đầu ra (Constraints):
- Chính xác tuyệt đối (Strict Grounding): CHỈ trích xuất dữ liệu có sự hiện diện thực tế trong file. TUYỆT ĐỐI KHÔNG tự suy diễn.
- Xử lý dữ liệu trống (Null Handling): Nếu trong file gốc không có, bắt buộc phải trả về giá trị null.
- Định dạng đầu ra: Toàn bộ kết quả điền form phải được đặt trong một khối mã (Code Block) định dạng JSON để API của Antigravity có thể đọc trực tiếp.
`;

        const requestBody = {
            contents: [{
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data
                        }
                    },
                    {
                        text: `Hãy trích xuất và trả về dữ liệu tương ứng với cấu trúc JSON sau:\n${JSON.stringify(targetSchema, null, 2)}`
                    }
                ]
            }]
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'Lỗi kết nối Gemini API');
        }

        const resData = await response.json();
        return resData.candidates[0].content.parts[0].text;
    }
}

const GeminiAI = new GeminiAIService();
window.GeminiAI = GeminiAI; // Global share
