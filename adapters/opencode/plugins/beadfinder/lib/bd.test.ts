import { describe, expect, test } from "bun:test";
import { extractFirstId, personaFromArg, personaFromRoleLabel } from "./bd.ts";

describe("persona vocabulary", () => {
  test("role labels route to personas, v0.6 aliases included", () => {
    expect(personaFromRoleLabel("architecture")).toBe("architect");
    expect(personaFromRoleLabel("architect")).toBe("architect");
    expect(personaFromRoleLabel("wayfinder")).toBe("wayfinder");
    expect(personaFromRoleLabel("wayfind")).toBe("wayfinder");
    expect(personaFromRoleLabel("research")).toBe("research");
    expect(personaFromRoleLabel("implementation")).toBe("implementer");
    expect(personaFromRoleLabel("review")).toBe("reviewer");
    expect(personaFromRoleLabel("product")).toBe("product");
    expect(personaFromRoleLabel("nonsense")).toBe("");
  });

  test("script persona args", () => {
    expect(personaFromArg("research")).toBe("research");
    expect(personaFromArg("wayfinder")).toBe("wayfinder");
    expect(personaFromArg("architect")).toBe("architect");
    expect(personaFromArg("")).toBe("");
  });
});

describe("extractFirstId", () => {
  test("matches dotted-prefix ids like agent-workflow-change-cny.4", () => {
    expect(extractFirstId("agent-workflow-change-cny.4")).toBe("agent-workflow-change-cny.4");
    expect(extractFirstId("claimed agent-workflow-change-cny.7 in progress")).toBe(
      "agent-workflow-change-cny.7",
    );
  });

  test("still matches plain ids", () => {
    expect(extractFirstId("bd-12")).toBe("bd-12");
    expect(extractFirstId("abc-12.3")).toBe("abc-12.3");
  });

  test("does not match version strings", () => {
    expect(extractFirstId("bump to v0.7 for release")).toBe("");
    expect(extractFirstId("release v1.2.3 notes")).toBe("");
  });

  test("json path wins when output is json", () => {
    const json = JSON.stringify([{ id: "agent-workflow-change-cny.4", title: "x", status: "open" }]);
    expect(extractFirstId(json)).toBe("agent-workflow-change-cny.4");
  });
});
