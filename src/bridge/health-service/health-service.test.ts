import { describe, expect, it } from "vitest";
import { collectBridgeHealth } from "./health-service";

describe("health service", () => {
  it("collects health rows from bridges", async () => {
    const rows = await collectBridgeHealth([
      {
        id: "telegram",
        capabilities: {
          slashCommands: true,
          buttons: true,
          mediaUpload: true,
          mediaDownload: true,
          messageEdit: false,
          threads: false,
          markdown: "limited",
        },
        async start() {},
        async stop() {},
        async send() {},
        async setCommands() {},
        async health() {
          return { bridgeId: "telegram", status: "ready", details: "ok" };
        },
      },
    ]);

    expect(rows).toEqual(["- telegram: ready (ok)"]);
  });
});
