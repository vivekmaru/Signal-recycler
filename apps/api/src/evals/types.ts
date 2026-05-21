export type {
  EvalCaseResult,
  EvalMetric,
  EvalReport,
  EvalStatus,
  EvalSuiteResult
} from "@signal-recycler/shared";

import { type EvalSuiteResult } from "@signal-recycler/shared";

export type EvalSuite = {
  id: string;
  title: string;
  run(): Promise<EvalSuiteResult> | EvalSuiteResult;
};
