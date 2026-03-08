import { describe, expect, it } from "vitest";
import { Council } from "../src/client.js";

describe("Command Namespace", () => {
  const client = new Council({
    apiKey: "test_key",
    baseUrl: "http://localhost:3001",
  });

  it("exposes command namespace", () => {
    expect(client.command).toBeDefined();
  });

  it("has agent registration method", () => {
    expect(typeof client.command.registerAgent).toBe("function");
  });

  it("has action request method", () => {
    expect(typeof client.command.requestAction).toBe("function");
  });

  it("has deployment methods", () => {
    expect(typeof client.command.createDeployment).toBe("function");
    expect(typeof client.command.listDeployments).toBe("function");
  });

  it("has fleet methods", () => {
    expect(typeof client.command.createFleet).toBe("function");
    expect(typeof client.command.listFleets).toBe("function");
  });
});
