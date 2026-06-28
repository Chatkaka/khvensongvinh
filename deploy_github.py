import os
import base64
import json
import urllib.request
import urllib.error

def make_request(url, token, data=None, method='GET'):
    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ERP-Deployer'
    }
    
    req_data = None
    if data is not None:
        req_data = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            return json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            err_json = json.loads(err_body)
            print(f"Error details: {err_json.get('message')}")
        except Exception:
            print(f"Error details: {err_body}")
        raise e

def main():
    print("=========================================================")
    print("      TỰ ĐỘNG TRIỂN KHAI WEBSITE ERP LÊN GITHUB PAGES     ")
    print("=========================================================")
    
    username = input("1. Nhập GitHub Username: ").strip()
    token = input("2. Nhập GitHub Personal Access Token (PAT): ").strip()
    repo_name = input("3. Nhập Tên Repository (Mặc định: erp-goi-thau-vsv): ").strip()
    if not repo_name:
        repo_name = "erp-goi-thau-vsv"
        
    # Step 1: Create repository
    print(f"\n[+] Đang tạo repository '{repo_name}' trên GitHub...")
    create_url = "https://api.github.com/user/repos"
    create_data = {
        "name": repo_name,
        "description": "He thong ERP Quan ly Goi thau VSV tich hop Gemini AI",
        "private": False,
        "has_issues": True,
        "has_projects": True,
        "has_wiki": True
    }
    
    try:
        make_request(create_url, token, create_data, method='POST')
        print("[✔] Đã tạo repository thành công!")
    except urllib.error.HTTPError as e:
        if e.code == 422: # Already exists
            print("[!] Repository đã tồn tại. Đang tiến hành cập nhật file...")
        else:
            print(f"[✘] Lỗi tạo repository: {e}")
            return
            
    # Step 2: Upload files
    files_to_upload = [
        "index.html",
        "style.css",
        "app.js",
        "database.js",
        "ai-service.js",
        "TDG_Masterfile BQLDA.xlsx"
    ]
    
    for filename in files_to_upload:
        if not os.path.exists(filename):
            print(f"[!] Bỏ qua {filename} do không tìm thấy file.")
            continue
            
        print(f"[+] Đang tải lên {filename}...")
        with open(filename, "rb") as f:
            content_bytes = f.read()
            base64_content = base64.b64encode(content_bytes).decode('utf-8')
            
        # Check if file exists to get its SHA (needed for updates)
        file_url = f"https://api.github.com/repos/{username}/{repo_name}/contents/{filename}"
        sha = None
        try:
            file_info = make_request(file_url, token)
            sha = file_info.get('sha')
        except urllib.error.HTTPError as e:
            if e.code != 404:
                print(f"[!] Lỗi khi kiểm tra file {filename}: {e}")
                
        upload_data = {
            "message": f"Upload {filename}",
            "content": base64_content
        }
        if sha:
            upload_data["sha"] = sha
            
        try:
            make_request(file_url, token, upload_data, method='PUT')
            print(f"[✔] Đã tải lên {filename}!")
        except Exception as e:
            print(f"[✘] Lỗi khi tải lên {filename}: {e}")
            return
            
    # Step 3: Enable GitHub Pages
    print("\n[+] Đang cấu hình GitHub Pages...")
    pages_url = f"https://api.github.com/repos/{username}/{repo_name}/pages"
    pages_data = {
        "source": {
            "branch": "main",
            "path": "/"
        }
    }
    
    # Check pages status first
    try:
        make_request(pages_url, token)
        print("[✔] GitHub Pages đã được kích hoạt trước đó!")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # Create pages
            try:
                # Wait 2 seconds for GitHub to process files
                import time
                time.sleep(2)
                make_request(pages_url, token, pages_data, method='POST')
                print("[✔] Đã kích hoạt GitHub Pages thành công!")
            except Exception as e2:
                print(f"[✘] Không thể tự động kích hoạt Pages: {e2}")
                print("    Bạn có thể kích hoạt thủ công trong mục Settings -> Pages trên GitHub.")
        else:
            print(f"[!] Lỗi kiểm tra Pages: {e}")
            
    print("\n=========================================================")
    print(" 🎉 QUÁ TRÌNH TRIỂN KHAI HOÀN TẤT!")
    print(f" 👉 URL ứng dụng của bạn: https://{username}.github.io/{repo_name}/")
    print(" (Lưu ý: Có thể mất 1-2 phút để GitHub Pages cập nhật và hiển thị trang web)")
    print("=========================================================")

if __name__ == "__main__":
    main()
