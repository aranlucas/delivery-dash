import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { decodeServerMessage } from "../../src/shared/wire-schema";

test("create Free Drive, start, inspect the city and leave", async ({ app, screen }) => {
  await app.open("/");
  await screen.getByLabel("DRIVER NAME", { exact: true }).fill("CI Driver");
  await screen.getByRole("radio", /Free Drive/).check();
  await screen.getByRole("button", "EXPLORE THE CITY", { exact: true }).click();
  await expect(screen.getByText("CI Driver", { exact: true })).toBeVisible();
  await screen.getByRole("button", "READY TO EXPLORE", { exact: true }).click();
  await screen.getByRole("button", /CITY VIEW/).click();
  await expect(screen.getByRole("navigation", "City camera views")).toBeVisible();
  await screen.getByRole("button", "OVERHEAD", { exact: true }).click();
  await expect(screen.getByRole("button", "OVERHEAD", { exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await screen.getByRole("button", /BACK TO DRIVING/).click();
  await expect(screen.getByRole("navigation", "City camera views")).toHaveCount(0);
  await screen.getByRole("button", /Change mode \/ Leave/i).click();
  await expect(screen.getByLabel("DRIVER NAME", { exact: true })).toBeVisible();
});

test("joining an existing room adopts its mode and shows both members", async ({ app, screen }) => {
  const socket = new WebSocket(app.baseUrl.replace("http:", "ws:") + "/api/room/JOIN/ws");

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Room fixture did not join")), 15_000);
      socket.addEventListener("open", () =>
        socket.send(JSON.stringify({ t: "join", name: "Host", mode: "free" })),
      );
      socket.addEventListener("message", (event) => {
        if (decodeServerMessage(String(event.data)).t === "welcome") {
          clearTimeout(timer);
          resolve();
        }
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Room fixture connection failed"));
      });
    });
    await app.open("/");
    await screen.getByLabel("DRIVER NAME", { exact: true }).fill("Guest");
    await screen.getByRole("radio", /Delivery Race/).check();
    await screen.getByLabel("Room code", { exact: true }).fill("JOIN");
    await screen.getByRole("button", "JOIN", { exact: true }).click();
    await expect(screen.getByText("Host", { exact: true })).toBeVisible();
    await expect(screen.getByText("Guest", { exact: true })).toBeVisible();
    await expect(screen.getByRole("button", "READY TO EXPLORE", { exact: true })).toBeVisible();
    await screen.getByRole("button", "LEAVE ROOM", { exact: true }).click();
    await expect(screen.getByLabel("DRIVER NAME", { exact: true })).toBeVisible();
  } finally {
    socket.close();
  }
});

test("lost racing connection offers rejoin even in City View", async ({ app, browser, screen }) => {
  await app.open("/");
  // Capture the real transport before connecting, then close it without resetting app state.
  await browser.evaluate(() => {
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        globalThis.addEventListener("disconnect-room", () => this.close(), { once: true });
      }
    };

    return true;
  });
  await screen.getByLabel("DRIVER NAME", { exact: true }).fill("Recovering Driver");
  await screen.getByRole("radio", /Free Drive/).check();
  await screen.getByRole("button", "EXPLORE THE CITY", { exact: true }).click();
  await screen.getByRole("button", "READY TO EXPLORE", { exact: true }).click();
  await screen.getByRole("button", /CITY VIEW/).click();
  await expect(screen.getByRole("navigation", "City camera views")).toBeVisible();
  await browser.evaluate(() => {
    return globalThis.dispatchEvent(new Event("disconnect-room"));
  });
  await expect(screen.getByRole("heading", "CONNECTION LOST", { exact: true })).toBeVisible();
  await screen.getByRole("button", "REJOIN RACE", { exact: true }).click();
  await expect(screen.getByRole("button", "READY TO EXPLORE", { exact: true })).toBeVisible();
  await screen.getByRole("button", "LEAVE ROOM", { exact: true }).click();
  await expect(screen.getByLabel("DRIVER NAME", { exact: true })).toBeVisible();
});
