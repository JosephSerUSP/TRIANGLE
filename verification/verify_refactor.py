from playwright.sync_api import sync_playwright

def verify_app_loads():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Navigate to the app
            page.goto("http://localhost:8080")

            # Wait for canvas to be present (indicates Three.js is running)
            page.wait_for_selector("canvas", state="visible")

            # Wait a bit for the scene to render
            page.wait_for_timeout(2000)

            # Take a screenshot
            page.screenshot(path="verification/app_running.png")
            print("Screenshot taken: verification/app_running.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_app_loads()
