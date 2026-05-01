import { createStore } from "../../store.js";
import { metric, suiteResult } from "../report.js";
import { type EvalSuiteResult } from "../types.js";

export function runIsolationEval(): EvalSuiteResult {
  const store = createStore(":memory:");
  const projectA = "eval-project-a";
  const projectB = "eval-project-b";
  const ruleA = store.createRuleCandidate({
    projectId: projectA,
    category: "tooling",
    rule: "Use pnpm in project A.",
    reason: "Project A convention."
  });
  const ruleB = store.createRuleCandidate({
    projectId: projectB,
    category: "tooling",
    rule: "Use npm in project B.",
    reason: "Project B convention."
  });
  store.approveRule(ruleA.id);
  store.approveRule(ruleB.id);
  const projectARules = store.listApprovedRules(projectA);
  const projectBRules = store.listApprovedRules(projectB);
  const projectAIsolated =
    projectARules.length === 1 && projectARules[0]?.rule === "Use pnpm in project A.";
  const projectBIsolated =
    projectBRules.length === 1 && projectBRules[0]?.rule === "Use npm in project B.";

  return suiteResult({
    id: "isolation",
    title: "Project And Session Isolation",
    cases: [
      {
        id: "isolation.approved-rules-by-project",
        title: "Approved rules are scoped by project",
        status: projectAIsolated && projectBIsolated ? "pass" : "fail",
        summary: `projectA=${projectARules.length}, projectB=${projectBRules.length}`,
        metrics: [
          metric("project_a_rules", projectARules.length, "rules"),
          metric("project_b_rules", projectBRules.length, "rules")
        ],
        details: { projectARules, projectBRules }
      }
    ],
    metrics: [
      metric("project_isolation_failures", projectAIsolated && projectBIsolated ? 0 : 1, "failures")
    ]
  });
}
