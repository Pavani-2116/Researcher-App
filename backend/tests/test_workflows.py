import json
import os
import threading
import tempfile
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from unittest.mock import patch
from urllib.error import URLError

from backend.app import Handler, load_local_env
from backend.services import editorial as service


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.old_database = service.DATABASE
        service.DATABASE = Path(self.tempdir.name) / "test.sqlite3"

    def tearDown(self):
        service.DATABASE = self.old_database
        self.tempdir.cleanup()

    def test_metrics_and_word_count(self):
        metrics = service.writing_metrics("One small sentence. Here are five useful words in this sentence.")
        self.assertEqual(metrics["word_count"], 11)
        self.assertEqual(metrics["sentence_count"], 2)
        self.assertEqual(metrics["average_words_per_sentence"], 5.5)
        self.assertEqual(metrics["character_count"], len("One small sentence. Here are five useful words in this sentence."))

    def test_long_sentence_and_filler_are_flagged(self):
        text = "In order to help, " + " ".join(f"word{i}" for i in range(32)) + "."
        result = service.analyze_writing(text)
        categories = {item["category"] for item in result["suggestions"]}
        self.assertIn("long_sentence", categories)
        self.assertIn("filler", categories)

    def test_filler_detection_does_not_match_inside_other_words(self):
        result = service.analyze_writing("Every result was measured and the team really checked the draft.")
        fillers = [item["passage"] for item in result["suggestions"] if item["category"] == "filler"]
        self.assertEqual(fillers, ["really"])

    def test_short_social_post_can_be_used_in_research_brief(self):
        sources = service.process_sources([
            {"id": "post", "title": "Short social post", "url": "", "text": "AI helps teams."},
            {"id": "report", "title": "Research report", "url": "", "text": "The report recommends measuring task outcomes against an existing workflow before adoption."},
            {"id": "memo", "title": "Operator memo", "url": "", "text": "Operators should review failures and account for the time spent checking AI-generated work."},
        ])
        brief = service.analyze_research(sources)
        self.assertEqual(len(brief["sources"]), 3)
        self.assertEqual(brief["source_records"][0]["text"], "AI helps teams.")

    def test_long_sentence_rewrite_preserves_paired_question(self):
        sentence = "The practical question for a founder or operator is not only what was announced, but whether the reported change affects a real workflow, cost, or customer need."
        replacement = service._split_sentence(sentence)
        self.assertIn("First, identify what was announced", replacement)
        self.assertIn("Then consider whether the reported change affects a real workflow", replacement)
        self.assertNotIn("But whether", replacement)

    def test_possible_passive_voice_is_flagged(self):
        result = service.analyze_writing("The report was published yesterday.")
        self.assertIn("possible_passive", {item["category"] for item in result["suggestions"]})

    def test_jargon_detection_is_heuristic(self):
        result = service.analyze_writing("The team tested RAG with a new benchmark.")
        self.assertIn("possible_jargon", {item["category"] for item in result["suggestions"]})

    def test_original_draft_is_not_mutated_and_ids_are_stable(self):
        original = "This is basically a short sentence."
        first = service.analyze_writing(original)
        second = service.analyze_writing(original)
        self.assertEqual(original, "This is basically a short sentence.")
        self.assertEqual(first["suggestions"], second["suggestions"])
        self.assertEqual(first["suggestions"][0]["status"], "pending")

    def test_source_citations_point_to_real_source_records(self):
        sources = self.processed_sources()
        brief = service.analyze_research(sources)
        source_ids = {source["id"] for source in brief["source_records"]}
        self.assertTrue(brief["facts"])
        self.assertTrue(all(set(claim["source_ids"]).issubset(source_ids) for claim in brief["facts"]))
        for claim in brief["facts"]:
            self.assertTrue(any(claim["evidence"] in source["text"] for source in brief["source_records"]))

    def test_demo_newsletter_has_target_length_and_only_known_citations(self):
        brief = service.analyze_research(self.processed_sources())
        draft = service.generate_newsletter(brief, brief["recommended_angle_id"])
        self.assertGreaterEqual(service.word_count(draft["text"]), 300)
        self.assertLessEqual(service.word_count(draft["text"]), 500)
        self.assertEqual(set(draft["source_ids"]), {source["id"] for source in brief["source_records"]})

    def test_rejects_unsupported_source_reference(self):
        sources = self.processed_sources()
        brief = service.analyze_research(sources)
        brief["facts"][0]["source_ids"] = ["not-a-real-source"]
        with self.assertRaises(service.ServiceError):
            service.generate_newsletter(brief, brief["recommended_angle_id"])

    def test_rejects_local_and_private_urls(self):
        for url in ("http://localhost", "http://127.0.0.1:8000", "file:///etc/passwd"):
            with self.subTest(url=url), self.assertRaises(service.ServiceError):
                service.validate_public_url(url)

    def test_failed_url_is_reported_as_source_error(self):
        source = service.process_sources([
            {"id": "unsafe-source", "title": "Unsafe URL", "url": "http://127.0.0.1/", "text": ""}
        ])[0]
        self.assertEqual(source["status"], "error")
        self.assertIn("Unsafe or invalid URL", source["error"])
        self.assertNotIn("summary", source)

    def test_failed_url_does_not_block_brief_from_three_successful_sources(self):
        sources = [
            {"id": "good-1", "title": "Good 1", "url": "", "text": "A fictional source states that editors should compare reported evidence and remain cautious about uncertain outcomes."},
            {"id": "bad", "title": "Bad URL", "url": "http://127.0.0.1/", "text": ""},
            {"id": "good-2", "title": "Good 2", "url": "", "text": "A second fictional source recommends measuring a supervised workflow and documenting its limitations."},
            {"id": "good-3", "title": "Good 3", "url": "", "text": "A third fictional source says that follow-up questions should be answered before teams draw conclusions."},
        ]
        result = service.process_sources(sources)
        ready = [source for source in result if source["status"] in ("processed", "extracted")]
        brief = service.analyze_research(ready)
        self.assertEqual(len(ready), 3)
        self.assertEqual(len(brief["sources"]), 3)
        self.assertNotIn("bad", {source["id"] for source in brief["source_records"]})

    def test_url_source_can_use_editor_title_when_extraction_has_none(self):
        with patch.object(service, "extract_article", return_value={
            "title": "", "url": "", "text": "A sufficiently long extracted article passage with enough words to validate and retain as source material.", "status": "extracted"
        }), patch.object(service, "validate_public_url", side_effect=lambda url: url):
            records = service.process_sources([{"id": "untitled-url", "title": "Editor supplied title", "url": "https://example.com/story", "text": ""}])
        self.assertEqual(records[0]["title"], "Editor supplied title")
        self.assertEqual(records[0]["status"], "extracted")

    def test_model_failure_is_explicit(self):
        with patch.dict("os.environ", {"SIGNALDESK_LLM_API_KEY": "test-key", "SIGNALDESK_LLM_MODEL": "test-model"}):
            with patch.object(service, "urlopen", side_effect=URLError("offline")):
                with self.assertRaisesRegex(service.ServiceError, "provider request failed"):
                    service._provider_json("system", "user")

    def test_malformed_model_response_is_rejected(self):
        class FakeResponse:
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
            def read(self, _limit):
                return json.dumps({"choices": [{"message": {"content": "not json"}}]}).encode()

        with patch.dict("os.environ", {"SIGNALDESK_LLM_API_KEY": "test-key", "SIGNALDESK_LLM_MODEL": "test-model"}):
            with patch.object(service, "urlopen", return_value=FakeResponse()):
                with self.assertRaisesRegex(service.ServiceError, "malformed JSON"):
                    service._provider_json("system", "user")

    def test_save_and_retrieve_project(self):
        created = service.create_project({"title": "Test project", "data": {"draft": "saved text"}})
        loaded = service.get_project(created["id"])
        self.assertEqual(loaded["title"], "Test project")
        self.assertEqual(loaded["data"]["draft"], "saved text")
        self.assertEqual(len(service.list_projects()), 1)
        service.delete_project(created["id"])
        self.assertEqual(service.list_projects(), [])

    def test_project_markdown_export_contains_draft_and_source_links(self):
        created = service.create_project({
            "title": "Sample project",
            "data": {
                "articleHeadline": "Sample headline",
                "draft": "A source-supported claim [source-1].",
                "brief": {"source_records": [{"id": "source-1", "title": "Source title", "url": ""}]},
            },
        })
        markdown = service.export_project_markdown(created["id"])
        self.assertIn("# Sample headline", markdown)
        self.assertIn("A source-supported claim [source-1].", markdown)
        self.assertIn("- [source-1] Source title", markdown)
        self.assertIn("verify all source material", markdown)

    def test_project_export_requires_a_current_research_brief(self):
        created = service.create_project({"title": "No brief", "data": {"articleHeadline": "Draft", "draft": "Text"}})
        with self.assertRaisesRegex(service.ServiceError, "requires its research brief"):
            service.export_project_markdown(created["id"])

    def test_local_env_file_loads_without_overriding_existing_environment(self):
        env_file = Path(self.tempdir.name) / ".env"
        env_file.write_text('SIGNALDESK_TEST_VALUE="from file"\n# ignored\nINVALID LINE\n', encoding="utf-8")
        with patch.dict(os.environ, {"SIGNALDESK_TEST_EXISTING": "already set"}, clear=False):
            os.environ.pop("SIGNALDESK_TEST_VALUE", None)
            try:
                load_local_env(env_file)
                self.assertEqual(os.environ["SIGNALDESK_TEST_VALUE"], "from file")
                os.environ["SIGNALDESK_TEST_VALUE"] = "environment wins"
                load_local_env(env_file)
                self.assertEqual(os.environ["SIGNALDESK_TEST_VALUE"], "environment wins")
                self.assertEqual(os.environ["SIGNALDESK_TEST_EXISTING"], "already set")
            finally:
                os.environ.pop("SIGNALDESK_TEST_VALUE", None)

    def test_http_health_and_research_workflow(self):
        http_server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=http_server.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://127.0.0.1:{http_server.server_port}"
        try:
            with urlopen(f"{base_url}/api/health", timeout=3) as response:
                self.assertEqual(json.loads(response.read())["status"], "ok")
            sources = [
                {"id": f"http-source-{index}", "title": f"HTTP demo {index}", "url": "",
                 "text": f"HTTP fixture {index} reports that a fictional research team tested an illustrative workflow and documented the observed limits. This is demo content, not a real-world claim."}
                for index in range(1, 4)
            ]
            request = Request(
                f"{base_url}/api/research/process",
                data=json.dumps({"sources": sources}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=3) as response:
                processed = json.loads(response.read())["sources"]
            request = Request(
                f"{base_url}/api/research/analyze",
                data=json.dumps({"sources": processed}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=3) as response:
                brief = json.loads(response.read())
            self.assertEqual(len(brief["sources"]), 3)
            self.assertTrue(brief["angles"])
            self.assertTrue(all(claim["source_ids"] for claim in brief["facts"]))
            self.assertTrue(brief["who_should_care"])
            self.assertTrue(brief["opportunities"])
            request = Request(
                f"{base_url}/api/writing/analyze",
                data=json.dumps({"text": "In order to help, " + " ".join(f"word{i}" for i in range(32)) + "."}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=3) as response:
                analysis = json.loads(response.read())
            self.assertIn("long_sentence", {item["category"] for item in analysis["suggestions"]})
            self.assertIn("filler", {item["category"] for item in analysis["suggestions"]})
            request = Request(
                f"{base_url}/api/newsletter/generate",
                data=json.dumps({"brief": brief, "angle_id": brief["recommended_angle_id"]}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=3) as response:
                newsletter = json.loads(response.read())
            self.assertTrue(newsletter["source_ids"])
            self.assertGreaterEqual(service.word_count(newsletter["text"]), 300)
        finally:
            http_server.shutdown()
            http_server.server_close()
            thread.join(timeout=3)

    def processed_sources(self):
        records = [
            {"id": f"source-{index}", "title": f"Demo {index}", "url": "", "text": f"Source {index} reports that a fictional research team tested an illustrative workflow and documented the observed limits. This is demo content, not a real-world claim."}
            for index in range(1, 4)
        ]
        return service.process_sources(records)


if __name__ == "__main__":
    unittest.main()
