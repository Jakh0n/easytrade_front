/** @jest-environment node */
import { signToken, verifyToken } from "../utils/token";

describe("token utils", () => {
  it("signs and verifies a payload round-trip", () => {
    const token = signToken({ userId: "user-123" });
    expect(typeof token).toBe("string");
    expect(verifyToken(token).userId).toBe("user-123");
  });

  it("throws on a malformed token", () => {
    expect(() => verifyToken("not-a-real-token")).toThrow();
  });
});
