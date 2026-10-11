"""GameBanana multi-game weekly likes: Python 3.11+, standard library only."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
from datetime import datetime, timedelta, timezone
import json
import logging
import os
from pathlib import Path
import socket
import sys
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import build_opener, ProxyHandler, Request
from media import enrich_state
from showcase import render as render_showcase
from games import GAMES, get_game, state_game

ROOT = Path(__file__).resolve().parent
API = "https://gamebanana.com/apiv12/"
GAME_ID = 19567
CHINA = timezone(timedelta(hours=8), "Asia/Shanghai")
PAGE_SIZE = 50
LOG = logging.getLogger("zzz")


class CrawlError(RuntimeError):
    pass


def week_window(now: datetime) -> tuple[int, int]:
    local = now.astimezone(CHINA)
    start = (local - timedelta(days=local.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return int(start.timestamp()), int(local.timestamp())


def iso(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp, CHINA).isoformat()


def save_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


class Client:
    def __init__(self, interval=0.4, timeout=25, retries=3, system_proxy=False):
        self.interval = interval
        self.timeout = timeout
        self.retries = retries
        self.system_proxy = system_proxy
        self.lock = threading.Lock()
        self.next_request = 0.0
        self.local = threading.local()

    def get(self, endpoint: str, *, records=True, **params) -> dict:
        url = API + endpoint + "?" + urlencode(params)
        if not hasattr(self.local, "opener"):
            self.local.opener = build_opener(
                ProxyHandler() if self.system_proxy else ProxyHandler({})
            )
        for attempt in range(self.retries + 1):
            with self.lock:
                wait = max(0, self.next_request - time.monotonic())
                self.next_request = max(time.monotonic(), self.next_request) + self.interval
            if wait:
                time.sleep(wait)
            request = Request(url, headers={
                "User-Agent": "ModJournalCollector/2.0 (personal read-only research)",
                "Accept": "application/json",
            })
            retry_after = 0
            try:
                with self.local.opener.open(request, timeout=self.timeout) as response:
                    payload = json.load(response)
                if not isinstance(payload, dict) or (records and not isinstance(payload.get("_aRecords"), list)):
                    raise CrawlError(f"API response schema changed: {endpoint}")
                return payload
            except HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504):
                    raise CrawlError(f"HTTP {exc.code}: {endpoint}; access denied or unavailable") from exc
                header = exc.headers.get("Retry-After", "0")
                if header.isdigit():
                    retry_after = int(header)
                error = exc
            except (URLError, TimeoutError, socket.timeout, OSError, ValueError) as exc:
                error = exc
            if attempt == self.retries:
                raise CrawlError(f"Request failed after retries: {endpoint}: {error}") from error
            delay = max(retry_after, 2 ** (attempt + 1))
            with self.lock:
                self.next_request = max(self.next_request, time.monotonic() + delay)
            LOG.warning("Retry %s in %ss", endpoint, delay)
        raise AssertionError("unreachable")


def records_page(client, endpoint, page, **params):
    data = client.get(endpoint, _nPage=page, _nPerpage=PAGE_SIZE, **params)
    metadata = data.get("_aMetadata", {})
    total = metadata.get("_nRecordCount")
    per_page = metadata.get("_nPerpage")
    if not isinstance(total, int) or total < 0 or not isinstance(per_page, int) or per_page < 1:
        raise CrawlError(f"Invalid pagination metadata: {endpoint}")
    rows = data["_aRecords"]
    complete = metadata.get("_bIsComplete") is True or page * per_page >= total
    if not rows and not complete:
        raise CrawlError(f"Unexpected empty page: {endpoint}, page {page}")
    return rows, total, complete


def fetch_index(client, state, checkpoint, max_mods=0):
    """Resume index pagination; detect duplicate-only pages and changing counts."""
    seen = {row["id"] for row in state["mods"]}
    page = state.get("next_index_page", 1)
    while not state.get("index_done"):
        rows, total, complete = records_page(
            client, "Mod/Index", page,
            **{"_aFilters[Generic_Game]": state_game(state)["id"], "_sSort": "Generic_Newest"},
        )
        if state.get("site_total") is not None and state["site_total"] != total:
            state["index_changed"] = True
        state["site_total"] = total
        added = 0
        for row in rows:
            if row.get("_aGame", {}).get("_idRow") != state_game(state)["id"]:
                raise CrawlError("Game filter was not respected; refusing mixed-game results")
            mod_id = row.get("_idRow")
            if not isinstance(mod_id, int):
                raise CrawlError("Missing Mod ID")
            if mod_id in seen:
                continue
            seen.add(mod_id)
            state["mods"].append({
                "id": mod_id,
                "name": str(row.get("_sName", "")),
                "url": f"https://gamebanana.com/mods/{mod_id}",
                "total_likes_at_index": row.get("_nLikeCount"),
                "published_at": row.get("_tsDateAdded"),
            })
            added += 1
        if rows and added == 0:
            raise CrawlError("Index pagination repeated; refusing an incomplete full ranking")
        state["next_index_page"] = page + 1
        if max_mods and len(state["mods"]) >= max_mods:
            state["mods"] = state["mods"][:max_mods]
            state["index_done"] = True
            state["limited"] = len(state["mods"]) < total
        elif complete:
            state["index_done"] = True
        save_json(checkpoint, state)
        LOG.info("Index: %s / %s mods", len(state["mods"]), total)
        page += 1


def total_likes(client, mod_id, value):
    if isinstance(value, str) and value.isascii() and value.isdecimal():
        value = int(value)
    if type(value) is int and 0 <= value <= 2**53 - 1:
        return value, "index"
    # Some zero-like index entries omit the field. Query only the total,
    # never assume zero and never paginate historical likes in fast mode.
    try:
        _, total, _ = records_page(client, f"Mod/{mod_id}/Likes", 1)
        if type(total) is not int or not 0 <= total <= 2**53 - 1:
            raise CrawlError("Invalid like total")
        return total, "likes_metadata"
    except (CrawlError, OSError, ValueError, KeyError) as error:
        raise CrawlError(f"Mod #{mod_id}: unable to verify total likes: {error}") from error


def fetch_new_week(client, state, checkpoint):
    """Read newest-first pages until Monday, using each new mod's list like count."""
    seen = set(state.get("new_week_seen", []))
    while not state.get("index_done"):
        page = state.get("next_index_page", 1)
        rows, total, done = records_page(client, "Mod/Index", page,
            **{"_aFilters[Generic_Game]": state_game(state)["id"], "_sSort": "Generic_Newest"})
        previous = state.get("previous_published")
        crossed, fresh, pending = False, 0, []
        page_seen = set(seen)
        # Validate a complete page before changing the checkpoint.
        for row in rows:
            stamp, mod_id, likes = row.get("_tsDateAdded"), row.get("_idRow"), row.get("_nLikeCount")
            if row.get("_aGame", {}).get("_idRow") != state_game(state)["id"] or type(mod_id) is not int or type(stamp) is not int:
                raise CrawlError("Missing publication timestamp or game identity")
            if mod_id in page_seen:
                continue
            if previous is not None and stamp > previous:
                raise CrawlError("Mod index is not ordered by publication time")
            previous = stamp
            page_seen.add(mod_id)
            fresh += 1
            crossed = crossed or stamp < state["start"]
            if not state["start"] <= stamp < state["end"]:
                continue
            likes, source = total_likes(client, mod_id, likes)
            pending.append({"id": mod_id, "name": str(row.get("_sName", "")),
                            "url": f"https://gamebanana.com/mods/{mod_id}",
                            "published_at": stamp, "total_likes_at_index": likes, "likes_source": source})
        if rows and not fresh:
            raise CrawlError("Mod index repeated the same page")
        if state.get("site_total") is not None and state["site_total"] != total:
            state["index_changed"] = True
        state["site_total"] = total
        checked_at = iso(int(time.time()))
        for mod in pending:
            state["mods"].append(mod)
            state["counts"][str(mod["id"])] = {"weekly_likes": mod["total_likes_at_index"],
                "total_likes_at_scan": mod["total_likes_at_index"], "like_pages_read": 0, "checked_at": checked_at}
        seen = page_seen
        state.update(new_week_seen=sorted(seen), previous_published=previous,
                     next_index_page=page + 1, index_done=crossed or done)
        save_json(checkpoint, state)
        LOG.info("New-week index: %s pages, %s new mods; older mods excluded", page, len(state["mods"]))


def count_weekly_likes(client, mod_id, start, end):
    """Count surviving likes added in [Monday 00:00 CST, crawl start)."""
    endpoint = f"Mod/{mod_id}/Likes"
    seen = set()
    count = 0
    previous_timestamp = None
    first_total = None
    for page in range(1, 10001):
        rows, total, complete = records_page(client, endpoint, page)
        if first_total is None:
            first_total = total
        oldest = None
        new_records = 0
        for row in rows:
            stamp = row.get("_tsDateAdded")
            member_id = row.get("_aSubmitter", {}).get("_idRow")
            if not isinstance(stamp, int) or not isinstance(member_id, int):
                raise CrawlError(f"Missing like timestamp or identity: {endpoint}")
            # New likes may shift pages during collection: ignore repeated records.
            if member_id in seen:
                continue
            if previous_timestamp is not None and stamp > previous_timestamp:
                raise CrawlError(f"Likes are no longer newest-first: {endpoint}")
            previous_timestamp = stamp
            oldest = stamp
            seen.add(member_id)
            new_records += 1
            if start <= stamp < end:
                count += 1
        if (oldest is not None and oldest < start) or complete:
            return {"weekly_likes": count, "total_likes_at_scan": first_total,
                    "like_pages_read": page, "checked_at": iso(int(time.time()))}
        if rows and new_records == 0:
            raise CrawlError(f"Likes pagination repeated: {endpoint}")
    raise CrawlError(f"Pagination safety limit reached: {endpoint}")


def make_report(state, top):
    new_week = state.get("scope") == "new_week"
    results = []
    for mod in state["mods"]:
        counted = state["counts"].get(str(mod["id"]))
        if counted is not None:
            results.append({**mod, **counted, **state.get("details", {}).get(str(mod["id"]), {})})
    results.sort(key=lambda row: (-row["weekly_likes"], row["id"]))
    complete = (state.get("index_done") and not state.get("limited")
                and not state.get("index_changed")
                and (new_week or len(state["mods"]) == state.get("site_total"))
                and len(results) == len(state["mods"]) and not state["errors"])
    return {
        "status": "complete" if complete else "partial",
        "game": state_game(state),
        "selection": {"mode": "new_week" if new_week else "latest_sample" if state.get("max_mods", 0) > 0 else "all_visible", "limit": state.get("max_mods", 0), "index_order": "newest", "ranking_metric": "new_mod_total_likes_at_collection" if new_week else "weekly_likes"},
        "scope": f"public unauthenticated {state_game(state)['english']} mods returned by GameBanana API",
        "metric": "cumulative likes observed during collection for mods published in the selected window; excludes older mods" if new_week else "currently visible likes whose creation timestamps fall in the window",
        "window_start_inclusive": iso(state["start"]),
        "window_end_exclusive": iso(state["end"]),
        "generated_at": iso(int(time.time())),
        "index_pages_read": state.get("next_index_page", 1) - 1,
        "site_total": state.get("site_total"),
        "indexed": len(state["mods"]), "checked": len(results),
        "errors": state["errors"],
        "caveat": "Live API is not an atomic snapshot; removed/private likes and mods are unavailable.",
        "results": [{"rank": i + 1, **row} for i, row in enumerate(results[:top])],
    }


def csv_safe(value):
    text = str(value)
    return "'" + text if text.startswith(("=", "+", "-", "@", "\t", "\r")) else text


def export_report(state, output, top):
    output.mkdir(parents=True, exist_ok=True)
    report = make_report(state, top)
    stem = "weekly_top10" if report["status"] == "complete" and top == 10 else (
        "weekly_ranking" if report["status"] == "complete" else "partial_ranking")
    new_week = report["selection"]["mode"] == "new_week"
    if new_week:
        stem = f"new_week_top{top}" if report["status"] == "complete" else "new_week_partial"
    save_json(output / f"{stem}.json", report)
    fields = ["rank", "name", "weekly_likes", "url", "total_likes_at_scan"]
    with (output / f"{stem}.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fields)
        writer.writeheader()
        writer.writerows({key: csv_safe(row[key]) for key in fields} for row in report["results"])
    title = "本周点赞排行" if report["status"] == "complete" else "部分采集结果（不是全站前十）"
    if new_week:
        title = "本周新作点赞排行（不含老 Mod）" if report["status"] == "complete" else "本周新作部分结果（尚未完整）"
    lines = [report["game"]["name"] + " · " + title, f"统计区间：{report['window_start_inclusive']} 至 {report['window_end_exclusive']}（不含结束时刻）",
             f"已检查 {report['checked']} / {report['site_total']} 个公开 Mod", ""]
    if new_week:
        lines[2] = f"发现本周新作 {report['checked']} 个；以上为发布时间区间，按列表采集时的累计点赞排序"
    for row in report["results"]:
        lines.extend([f"{row['rank']}. {row['name']} | 本周 {row['weekly_likes']} 赞", row["url"]])
    (output / f"{stem}.txt").write_text("\n".join(lines), encoding="utf-8")
    (output / f"{stem}.html").write_text(render_showcase(report), encoding="utf-8")
    return report, output / f"{stem}.html"


def run(args):
    game = get_game(args.game)
    data_dir = ROOT / "data" if game["id"] == GAME_ID else ROOT / "data" / game["key"]
    data_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = data_dir / "checkpoint.json"
    if args.resume:
        if not checkpoint.exists():
            raise CrawlError("No checkpoint to resume; run without --resume first")
        state = json.loads(checkpoint.read_text(encoding="utf-8"))
        if state.get("version") != 1:
            raise CrawlError("Checkpoint version is unsupported")
        if state_game(state)["id"] != game["id"]:
            raise CrawlError("Checkpoint belongs to a different game")
        if args.max_mods and args.max_mods != state["max_mods"]:
            raise CrawlError("Resume preserves the original --max-mods setting")
        LOG.info("Resuming fixed window %s to %s", iso(state["start"]), iso(state["end"]))
    else:
        start, end = week_window(datetime.now(CHINA))
        run_id = game["key"] + "_" + datetime.now(CHINA).strftime("%Y%m%d_%H%M%S_%f")
        state = {"version": 1, "start": start, "end": end, "run_id": run_id,
                 "game_id": game["id"],
                 "mods": [], "counts": {}, "errors": {}, "index_done": False,
                 "max_mods": args.max_mods, "limited": False,
                 "scope": "new_week" if args.scope == "new-week" and not args.max_mods else "all_visible"}
        if checkpoint.exists():
            previous = json.loads(checkpoint.read_text(encoding="utf-8"))
            save_json(data_dir / "archive" / f"{previous['run_id']}.json", previous)
        save_json(checkpoint, state)
    client = Client(interval=args.interval, timeout=args.timeout, system_proxy=args.system_proxy)
    output = ROOT / "results" / state["run_id"]
    try:
        if state.get("scope") == "new_week":
            fetch_new_week(client, state, checkpoint)
        else:
            fetch_index(client, state, checkpoint, state["max_mods"])
        pending = [m for m in state["mods"] if str(m["id"]) not in state["counts"]]
        LOG.info("Counting weekly likes for %s mods; Ctrl+C preserves a checkpoint", len(pending))
        # Only one bounded batch is submitted, so stopping does not leave thousands of queued calls.
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for offset in range(0, len(pending), args.workers):
                futures = {pool.submit(count_weekly_likes, client, m["id"], state["start"], state["end"]): m for m in pending[offset:offset + args.workers]}
                for future in as_completed(futures):
                    mod = futures[future]
                    key = str(mod["id"])
                    try:
                        state["counts"][key] = future.result()
                        state["errors"].pop(key, None)
                    except (CrawlError, OSError, ValueError) as exc:
                        state["errors"][key] = str(exc)
                        LOG.error("Mod %s: %s", key, exc)
                    save_json(checkpoint, state)
                LOG.info("Progress: %s/%s, errors=%s", len(state["counts"]), len(state["mods"]), len(state["errors"]))
        LOG.info("Fetching media, views and file URLs for the top %s entries", args.top)
        enrich_state(client, state, args.top)
    finally:
        save_json(checkpoint, state)
        report, report_path = export_report(state, output, args.top)
        LOG.info("Report: %s (%s)", report_path, report["status"])
    return 0 if report["status"] == "complete" else 2


def main():
    parser = argparse.ArgumentParser(description="GameBanana 多游戏本周新作点赞榜（默认不含老 Mod）")
    parser.add_argument("--game", choices=[game["key"] for game in GAMES], default="zzz", help="zzz=绝区零，genshin=原神，wuwa=鸣潮，hsr=星穹铁道")
    parser.add_argument("--resume", action="store_true", help="继续上次采集，保持原统计区间")
    parser.add_argument("--scope", choices=["new-week", "all"], default="new-week", help="默认仅本周新发布作品；all 包含老 Mod，逐条查点赞历史，较慢")
    parser.add_argument("--max-mods", type=int, default=0, help="仅用于试跑；0=全部，非零结果明确标为部分结果")
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--workers", type=int, default=4, help="并发数，1–8")
    parser.add_argument("--interval", type=float, default=0.4, help="全局请求最小间隔，至少 0.2 秒")
    parser.add_argument("--timeout", type=float, default=25)
    parser.add_argument("--system-proxy", action="store_true", help="使用系统代理（默认直连）")
    args = parser.parse_args()
    if args.max_mods < 0 or not 1 <= args.workers <= 8 or args.interval < 0.2 or args.top < 1 or args.timeout <= 0:
        parser.error("Invalid limits: max-mods>=0, workers=1..8, interval>=0.2, top>=1, timeout>0")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    (ROOT / "logs").mkdir(exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=[
        logging.StreamHandler(), logging.FileHandler(ROOT / "logs" / "crawler.log", encoding="utf-8")])
    lock_dir = ROOT / "data" if args.game == "zzz" else ROOT / "data" / args.game
    lock_path = lock_dir / "running.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        LOG.error("Another run may be active. If it was forcibly closed, remove data/running.lock after checking.")
        return 1
    try:
        with os.fdopen(descriptor, "w") as file:
            file.write(str(os.getpid()))
        return run(args)
    except KeyboardInterrupt:
        LOG.warning("Stopped; run with --resume to continue")
        return 130
    except (CrawlError, OSError, ValueError, KeyError) as exc:
        LOG.error("%s", exc)
        return 1
    finally:
        lock_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
