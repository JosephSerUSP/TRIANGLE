from playwright.sync_api import sync_playwright

def verify_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            print("Navigating to app...")
            page.goto("http://localhost:8000")

            # Wait for canvas to be present
            page.wait_for_selector("#canvas-container canvas", timeout=5000)

            # Click the start overlay to engage audio/system
            print("Clicking start overlay...")
            page.click("#start-overlay")

            # Wait a bit for the system to run and autopilot to generate data
            print("Waiting for autopilot...")
            page.wait_for_timeout(3000)

            # Take screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification/autopilot_active.png")
            print("Screenshot saved.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_app()
