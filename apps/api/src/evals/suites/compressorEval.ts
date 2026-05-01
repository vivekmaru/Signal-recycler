import { compressHistory } from "../../compressor.js";
import { metric, suiteResult } from "../report.js";
import { type EvalCaseResult, type EvalSuiteResult } from "../types.js";

type CompressionCase = {
  id: string;
  title: string;
  output: string;
  shouldCompress: boolean;
  retainedNeedles: string[];
  minReductionRatio: number;
};

export function runCompressorEval(): EvalSuiteResult {
  const cases: CompressionCase[] = [
    {
      id: "vitest-tail-error",
      title: "Vitest tail failure is retained",
      output: [
        "RUN v4.1.5",
        ".".repeat(1800),
        "FAIL src/example.test.ts",
        "AssertionError: expected true to be false"
      ].join("\n"),
      shouldCompress: true,
      retainedNeedles: ["FAIL src/example.test.ts", "AssertionError: expected true to be false"],
      minReductionRatio: 0.4
    },
    {
      id: "zero-errors",
      title: "Successful zero-error output is not compressed",
      output: `Build complete. Found 0 errors and 0 failures.${".".repeat(1600)}`,
      shouldCompress: false,
      retainedNeedles: ["Found 0 errors"],
      minReductionRatio: 0
    }
  ];

  const results: EvalCaseResult[] = cases.map((testCase) => {
    const beforeChars = testCase.output.length;
    const result = compressHistory([{ type: "shell_call_output", output: testCase.output }]);
    const compressedOutput = String((result.items[0] as { output: string }).output);
    const afterChars = compressedOutput.length;
    const reductionRatio = beforeChars === 0 ? 0 : (beforeChars - afterChars) / beforeChars;
    const retained = testCase.retainedNeedles.every((needle) => compressedOutput.includes(needle));
    const compressionExpectationMet = testCase.shouldCompress
      ? result.compressions === 1 && reductionRatio >= testCase.minReductionRatio
      : result.compressions === 0;
    const status = retained && compressionExpectationMet ? "pass" : "fail";

    return {
      id: `compressor.${testCase.id}`,
      title: testCase.title,
      status,
      summary:
        status === "pass"
          ? `retained ${testCase.retainedNeedles.length} gold line(s), reduction ${Math.round(reductionRatio * 100)}%`
          : `retained=${retained}, compressions=${result.compressions}, reduction=${Math.round(reductionRatio * 100)}%`,
      metrics: [
        metric("chars_before", beforeChars, "chars"),
        metric("chars_after", afterChars, "chars"),
        metric("compression_reduction_ratio", Number(reductionRatio.toFixed(3)), "ratio"),
        metric("tokens_saved", result.tokensRemoved, "tokens")
      ],
      details: {
        retainedNeedles: testCase.retainedNeedles,
        charsRemoved: result.charsRemoved
      }
    };
  });

  const totalTokensSaved = results.reduce(
    (sum, testCase) =>
      sum + Number(testCase.metrics?.find((item) => item.name === "tokens_saved")?.value ?? 0),
    0
  );

  return suiteResult({
    id: "compressor",
    title: "Compression Retention",
    cases: results,
    metrics: [metric("tokens_saved_by_compression", totalTokensSaved, "tokens")]
  });
}
