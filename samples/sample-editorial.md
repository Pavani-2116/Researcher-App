# AI coding tools need a better productivity test

AI coding assistants can make a developer feel faster. Whether they make a team more productive is harder to answer—and recent evidence shows why a single speed claim is not enough.

In a February 2026 update, the research nonprofit METR described a follow-up study of 57 developers working across 143 open-source repositories and more than 800 tasks. METR said the experiment could not reliably estimate AI’s current productivity effect. Some developers declined to work without AI, some withheld tasks they did not want assigned to the no-AI condition, and concurrent agents made time tracking difficult. In its survey, 30% to 50% of developers said they had skipped some tasks for that reason [metr-2026]. That is evidence about the study’s limits—not proof that AI has no effect.

GitHub's 2022 experiment randomly assigned 95 professional developers to build the same JavaScript HTTP server, with or without Copilot. The Copilot group finished 55% faster on average. The result does not show whether the code needed less review or was safe to ship [github-copilot-study]. The study covered only one standardized task, not a team's own codebase, review process, or maintenance work.

Google Cloud’s 2024 DORA report adds an organization-level view: respondents associated AI adoption with higher individual productivity, flow, and job satisfaction, but also lower software-delivery stability and throughput. This is a survey finding, not proof that AI alone caused either outcome [dora-2024].

These findings are not a clean contest between “AI works” and “AI does not.” They measure different tools, tasks, populations, and outcomes. METR’s update is especially useful because it shows how widespread adoption can distort an experiment. People may opt out of the comparison, and the tasks they choose may change once an agent is available [metr-2026].

**Analysis:** founders and engineering leaders should treat productivity as a local question, not a feature claim. Before expanding an AI coding tool, select representative tasks and record a baseline. Compare similar work with and without assistance; include completion, review and repair time, correctness, and follow-on incidents. Record tasks people exclude and whether AI changes what they attempt. A faster first draft is not a win if the team pays the time back in review or rework.

The practical question is not simply “Did the assistant write code faster?” It is “For which tasks, under what review conditions, and with what effect on the software we ship?” A small, measured pilot can answer that more honestly than a productivity percentage borrowed from a different setting.

## Sources

- [metr-2026] METR, [Measuring the impact of AI on open-source developer productivity: February 2026 update](https://metr.org/blog/2026-02-24-uplift-update/). METR says its newer experiment has selection and measurement limitations, so its estimate is weak evidence of the current effect.
- [github-copilot-study] GitHub, [Research: quantifying GitHub Copilot's impact on developer productivity and happiness](https://github.blog/news-insights/research/research-quantifying-github-copilots-impact-on-developer-productivity-and-happiness/). Company-reported controlled experiment on one JavaScript HTTP-server task.
- [dora-2024] Google Cloud DORA, [2024 State of DevOps report](https://dora.dev/research/2024/dora-report/). Survey findings about AI adoption and software delivery outcomes.

**Editorial note:** The sources were reviewed for this sample, but their research designs and claims were not independently replicated. The GitHub result is limited to its standardized task; DORA reports survey associations; METR explicitly warns that its later experiment cannot reliably estimate the current productivity effect. The article's recommendations are analysis, not findings from those studies.
