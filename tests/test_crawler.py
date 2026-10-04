import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import crawler


def like(member, stamp):
    return {"_tsDateAdded": stamp, "_aSubmitter": {"_idRow": member}}


def page(rows, total, complete=False, perpage=50):
    return {"_aRecords": rows, "_aMetadata": {
        "_nRecordCount": total, "_nPerpage": perpage, "_bIsComplete": complete}}


class FakeClient:
    def __init__(self, pages):
        self.pages = pages
        self.calls = 0

    def get(self, endpoint, **params):
        self.calls += 1
        return self.pages[params["_nPage"] - 1]


class WeeklyTests(unittest.TestCase):
    def test_beijing_week_crosses_month_and_utc_day(self):
        start, end = crawler.week_window(datetime.fromisoformat("2026-10-02T12:00:00+00:00"))
        self.assertEqual(crawler.iso(start), "2026-09-28T00:00:00+08:00")
        self.assertEqual(crawler.iso(end), "2026-10-02T20:00:00+08:00")

    def test_monday_boundary_not_rolling_week(self):
        start, end = crawler.week_window(datetime.fromisoformat("2026-09-27T16:00:00+00:00"))
        self.assertEqual(start, end)

    def test_counts_creation_not_modified_and_excludes_cutoff(self):
        rows = [like(1, 200), like(2, 199), like(3, 100), like(4, 99)]
        rows[-1]["_tsDateModified"] = 190
        client = FakeClient([page(rows, 100)])
        self.assertEqual(crawler.count_weekly_likes(client, 1, 100, 200)["weekly_likes"], 2)
        self.assertEqual(client.calls, 1)

    def test_cross_page_duplicates_and_week_boundary(self):
        client = FakeClient([
            page([like(1, 199), like(2, 180)], 5, perpage=2),
            page([like(2, 180), like(3, 100)], 5, perpage=2),
            page([like(4, 99)], 5, True, perpage=2),
        ])
        result = crawler.count_weekly_likes(client, 1, 100, 200)
        self.assertEqual(result["weekly_likes"], 3)
        self.assertEqual(result["like_pages_read"], 3)

    def test_unordered_likes_are_error(self):
        client = FakeClient([page([like(1, 150), like(2, 180)], 2, True)])
        with self.assertRaises(crawler.CrawlError):
            crawler.count_weekly_likes(client, 1, 100, 200)

    def test_duplicate_page_is_error(self):
        client = FakeClient([page([like(1, 180)], 100), page([like(1, 180)], 101)])
        with self.assertRaises(crawler.CrawlError):
            crawler.count_weekly_likes(client, 1, 100, 200)

    def test_empty_premature_page_is_error(self):
        with self.assertRaises(crawler.CrawlError):
            crawler.count_weekly_likes(FakeClient([page([], 100)]), 1, 100, 200)

    def test_no_likes_is_zero(self):
        self.assertEqual(crawler.count_weekly_likes(FakeClient([page([], 0, True)]), 1, 100, 200)["weekly_likes"], 0)

    def state(self):
        return {"start": 100, "end": 200, "mods": [{"id": 2, "name": "B", "url": "https://gamebanana.com/mods/2"},
                {"id": 1, "name": "A", "url": "https://gamebanana.com/mods/1"}],
                "counts": {"1": {"weekly_likes": 3, "total_likes_at_scan": 10},
                           "2": {"weekly_likes": 3, "total_likes_at_scan": 20}},
                "errors": {}, "index_done": True, "site_total": 2}

    def test_ties_stable_by_id(self):
        report = crawler.make_report(self.state(), 10)
        self.assertEqual(report["status"], "complete")
        self.assertEqual([r["id"] for r in report["results"]], [1, 2])

    def test_failed_missing_limited_or_changed_never_complete(self):
        for field, value in [("errors", {"3": "HTTP 403"}), ("limited", True),
                             ("index_changed", True), ("site_total", 3), ("index_done", False)]:
            state = self.state()
            state[field] = value
            self.assertEqual(crawler.make_report(state, 10)["status"], "partial")
        state = self.state()
        del state["counts"]["2"]
        self.assertEqual(crawler.make_report(state, 10)["status"], "partial")

    def test_partial_filenames_and_html_escaping(self):
        state = self.state()
        state["limited"] = True
        state["mods"][0]["name"] = '<script>alert("x")</script>'
        with tempfile.TemporaryDirectory() as temp:
            _, path = crawler.export_report(state, Path(temp), 10)
            rendered = path.read_text(encoding="utf-8")
            self.assertEqual(path.name, "partial_ranking.html")
            self.assertIn("非全站前十", rendered)
            self.assertNotIn('<script>alert("x")</script>', rendered)
            self.assertIn('\\u003cscript>', rendered)
            self.assertEqual(len(list(Path(temp).iterdir())), 4)

    def test_spreadsheet_formula_escaped(self):
        self.assertEqual(crawler.csv_safe("=1+1"), "'=1+1")

    def test_index_wrong_game_is_error(self):
        client = FakeClient([page([{"_idRow": 1, "_aGame": {"_idRow": 999}}], 1, True)])
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(crawler.CrawlError):
                crawler.fetch_index(client, {"mods": []}, Path(temp) / "state.json")


if __name__ == "__main__":
    unittest.main()
