# Writing Lab: before and after

> This example uses the Writing Assistant's deterministic checks. The draft below is illustrative copy, not a quotation from the cited research.

## Original draft

In order to explain GitHub's 2022 experiment, it is important to note that the Copilot group completed one JavaScript HTTP-server task 55% faster, which might help teams work more quickly, but this result does not show whether the code needed less review or was safe to ship.

## Writing Assistant feedback

The local Writing Assistant reported 47 words in one sentence, with an average of 47 words per sentence.

- **Long sentence:** it flagged the full sentence and did not offer an automatic split because it could not identify a safe boundary.
- **Filler:** it flagged “In order to” and “it is important to note that,” suggesting “to” and deletion, respectively.
- **No passive-voice or jargon flags** were returned for this passage.

## Editor's changes

I removed the filler, split the result from its limitation, and replaced the vague word “faster” with the reported 55% result. The revised wording keeps the scope to one task and retains the caveat that the study does not establish review effort or production safety. The metric was checked against the source before adding it.

## Revised version

GitHub's 2022 experiment randomly assigned 95 professional developers to build the same JavaScript HTTP server, with or without Copilot. The Copilot group finished 55% faster on average. The result does not show whether the code needed less review or was safe to ship [github-copilot-study].

The Writing Assistant returned no suggestions for the revised passage. It measured 44 words across three sentences, averaging 14.7 words per sentence. This is the revised wording used in the [sample editorial](./sample-editorial.md). The source and its study limits are described in [the GitHub research post](https://github.blog/news-insights/research/research-quantifying-github-copilots-impact-on-developer-productivity-and-happiness/).
