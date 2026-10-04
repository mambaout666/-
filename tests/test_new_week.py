import tempfile
import unittest
from pathlib import Path
import crawler


def mod(id, stamp, likes=1):
    return dict(_idRow=id, _aGame={"_idRow":19567}, _tsDateAdded=stamp, _tsDateModified=199, _nLikeCount=likes)


class Client:
    def __init__(self, pages, totals=None):
        self.pages, self.calls, self.totals = pages, [], totals or {}

    def get(self, endpoint, **params):
        self.calls.append(endpoint)
        if endpoint != "Mod/Index":
            if endpoint not in self.totals:
                raise crawler.CrawlError("HTTP 403")
            total=self.totals[endpoint]
            return {"_aRecords":[] if total==0 else [{"_aSubmitter":{"_idRow":1},"_tsDateAdded":150}],"_aMetadata":{"_nRecordCount":total,"_nPerpage":50}}
        return {"_aRecords":self.pages[params["_nPage"]-1], "_aMetadata":{"_nRecordCount":5650,"_nPerpage":2}}


class NewWeekTests(unittest.TestCase):
    def state(self):
        return dict(scope="new_week", start=100, end=200, mods=[], counts={}, errors={})

    def test_boundary_dedup_ranking_and_no_like_requests(self):
        client=Client([[mod(1,200),mod(2,199,4)],[mod(2,199,4),mod(3,100,7)],[mod(4,99,900)]])
        state=self.state()
        with tempfile.TemporaryDirectory() as folder:
            crawler.fetch_new_week(client,state,Path(folder)/"checkpoint.json")
        self.assertEqual(client.calls,["Mod/Index"]*3)
        report=crawler.make_report(state,10)
        self.assertEqual(report["status"],"complete")
        self.assertEqual([(r["id"],r["weekly_likes"]) for r in report["results"]],[(3,7),(2,4)])
        self.assertEqual(report["selection"]["mode"],"new_week")

    def test_invalid_page_does_not_commit(self):
        for rows in [[mod(1,99),mod(2,150)],[mod(1,150,None)],[mod(1,None)]]:
            state=self.state()
            with tempfile.TemporaryDirectory() as folder, self.assertRaises(crawler.CrawlError):
                crawler.fetch_new_week(Client([rows]),state,Path(folder)/"checkpoint.json")
            self.assertEqual(state["mods"],[])
            self.assertEqual(crawler.make_report(state,10)["status"],"partial")

    def test_resume_and_empty_week(self):
        state=self.state()
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/"checkpoint.json"
            crawler.fetch_new_week(Client([[mod(1,99)]]),state,target)
            crawler.fetch_new_week(Client([]),state,target)
        self.assertEqual(crawler.make_report(state,10)["status"],"complete")
        state["index_changed"]=True
        self.assertEqual(crawler.make_report(state,10)["status"],"partial")

    def test_omitted_zero_and_null_counts_are_verified(self):
        omitted=mod(1,190)
        del omitted["_nLikeCount"]
        client=Client([[omitted,mod(2,180,None),mod(3,99)]],{"Mod/1/Likes":0,"Mod/2/Likes":3})
        state=self.state()
        with tempfile.TemporaryDirectory() as folder:
            crawler.fetch_new_week(client,state,Path(folder)/"checkpoint.json")
        self.assertEqual(client.calls,["Mod/Index","Mod/1/Likes","Mod/2/Likes"])
        report=crawler.make_report(state,10)
        self.assertEqual(report["status"],"complete")
        self.assertEqual([(r["id"],r["weekly_likes"]) for r in report["results"]],[(2,3),(1,0)])
        self.assertEqual(state["mods"][0]["likes_source"],"likes_metadata")

    def test_zero_and_digit_strings_do_not_request_fallback(self):
        client=Client([])
        for value,expected in [(0,0),(12,12),("0",0),("12",12)]:
            self.assertEqual(crawler.total_likes(client,1,value),(expected,"index"))
        self.assertEqual(client.calls,[])

    def test_failed_fallback_does_not_commit_and_can_retry(self):
        state=self.state()
        rows=[[mod(1,190,7),mod(2,180,None),mod(3,99)]]
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"checkpoint.json"
            with self.assertRaisesRegex(crawler.CrawlError,"Mod #2.*HTTP 403"):
                crawler.fetch_new_week(Client(rows),state,path)
            self.assertEqual(state["mods"],[])
            self.assertFalse(state.get("index_done"))
            crawler.fetch_new_week(Client(rows,{"Mod/2/Likes":0}),state,path)
        self.assertEqual(crawler.make_report(state,10)["status"],"complete")
