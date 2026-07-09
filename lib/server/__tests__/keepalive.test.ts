/** @jest-environment node */
import { getKeepAliveHealthUrl } from "../services/keepalive.service";

describe("getKeepAliveHealthUrl", () => {
  const originalRenderUrl = process.env.RENDER_EXTERNAL_URL;

  afterEach(() => {
    if (originalRenderUrl === undefined) {
      delete process.env.RENDER_EXTERNAL_URL;
    } else {
      process.env.RENDER_EXTERNAL_URL = originalRenderUrl;
    }
  });

  it("builds /health URL from RENDER_EXTERNAL_URL", () => {
    process.env.RENDER_EXTERNAL_URL = "https://my-app.onrender.com/";
    expect(getKeepAliveHealthUrl()).toBe("https://my-app.onrender.com/health");
  });

  it("returns null when no public URL is configured", () => {
    delete process.env.RENDER_EXTERNAL_URL;
    // APP_URL is not set in test env by default.
    expect(getKeepAliveHealthUrl()).toBeNull();
  });
});
