export type EvalStatus = "pass" | "fail" | "warn" | "skip";

export type EvalMetric = {
  name: string;
  value: number;
  unit?: string;
};

export type EvalCaseResult = {
  id: string;
  title: string;
  status: EvalStatus;
  summary: string;
  metrics?: EvalMetric[];
  details?: Record<string, unknown>;
};

export type EvalSuiteResult = {
  id: string;
  title: string;
  status: EvalStatus;
  cases: EvalCaseResult[];
  metrics?: EvalMetric[];
};

export type EvalReport = {
  generatedAt: string;
  mode: "local" | "live";
  status: EvalStatus;
  suites: EvalSuiteResult[];
  metrics: EvalMetric[];
};

export type EvalSuite = {
  id: string;
  title: string;
  run(): Promise<EvalSuiteResult> | EvalSuiteResult;
};
