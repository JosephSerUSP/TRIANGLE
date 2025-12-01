from playwright.sync_api import sync_playwright

def verify_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Wait for Vite to start
            page.goto("http://localhost:5173")

            # Wait for canvas to be present
            page.wait_for_selector("#canvas-container canvas", timeout=10000)

            # Take screenshot
            page.screenshot(path="verification/app_screenshot.png")
            print("Screenshot taken successfully")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_app()
