import { newId } from "../api.js";

export function createSampleSources() {
  return [
    {
      id: newId(),
      title: "Fictional product note — Northstar AI release update",
      url: "https://example.com/fictional/northstar-release",
      text: "SYNTHETIC SAMPLE — NOT LIVE REPORTING. This fictional release note describes an AI product update from the made-up company Northstar AI. It says the team changed a workflow and published a feature for evaluation. This text is illustrative, not evidence about a real company or product.",
      user_provided: true,
      status: "processed",
    },
    {
      id: newId(),
      title: "Fictional operator interview — Workflow review",
      url: "https://example.com/fictional/workflow-interview",
      text: "SYNTHETIC SAMPLE — NOT LIVE REPORTING. In this fictional interview, an operations lead says teams should measure time saved and error rates before adopting an AI tool. The example also notes that human review remains part of the described process. This material is invented and has not been independently verified.",
      user_provided: true,
      status: "processed",
    },
    {
      id: newId(),
      title: "Fictional evaluation memo — Reliability test plan",
      url: "https://example.com/fictional/reliability-evaluation",
      text: "SYNTHETIC SAMPLE — NOT LIVE REPORTING. This fictional evaluation memo recommends testing an AI system on representative tasks and recording failures. It does not report real benchmark results or a real deployment. The example demonstrates source IDs, excerpts, and cautious editorial framing.",
      user_provided: true,
      status: "processed",
    },
  ];
}
