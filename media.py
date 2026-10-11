"""Normalize GameBanana profile data for presentation; never invent media/files."""
from html import unescape
from html.parser import HTMLParser
import re
from urllib.parse import urlparse, parse_qs
from games import state_game


def https_url(value):
    try:
        parsed = urlparse(str(value))
        return str(value) if parsed.scheme == "https" and parsed.netloc and not parsed.username else ""
    except ValueError:
        return ""


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"): self.skip += 1
        if tag in ("p", "br", "div"): self.parts.append("\n")
    def handle_endtag(self, tag):
        if tag in ("script", "style"): self.skip = max(0, self.skip - 1)
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)


def video_url(value):
    url = https_url(unescape(str(value)))
    if not url: return None
    parsed = urlparse(url); host = parsed.hostname; code = None
    if host in ("www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtu.be"):
        if host == "youtu.be": code = parsed.path.strip("/")
        elif parsed.path.startswith(("/embed/", "/shorts/")): code = parsed.path.split("/")[2]
        else: code = parse_qs(parsed.query).get("v", [None])[0]
        if code and re.fullmatch(r"[A-Za-z0-9_-]{11}", code):
            return {"type": "youtube", "url": "https://www.youtube-nocookie.com/embed/" + code}
    if host in ("vimeo.com", "www.vimeo.com", "player.vimeo.com"):
        code = parsed.path.strip("/").split("/")[-1]
        if code.isdigit(): return {"type": "vimeo", "url": "https://player.vimeo.com/video/" + code}
    if parsed.path.lower().endswith((".mp4", ".webm", ".ogv")):
        return {"type": "video", "url": url}
    return None


def normalize_details(detail):
    images = []
    for row in detail.get("_aPreviewMedia", {}).get("_aImages", []):
        url = https_url(str(row.get("_sBaseUrl", "")).rstrip("/") + "/" + str(row.get("_sFile", "")))
        if url: images.append({"url": url, "caption": row.get("_sCaption", "")})
    raw_text = detail.get("_sText", "") or ""
    candidates = re.findall(r'''https://[^\s<>"']+''', raw_text)
    def walk(value):
        if isinstance(value, str): candidates.append(value)
        elif isinstance(value, dict):
            for child in value.values(): walk(child)
        elif isinstance(value, list):
            for child in value: walk(child)
    walk(detail.get("_aPreviewMedia", {})); walk(detail.get("_aPreviewContent", {}))
    videos = []; seen = set()
    for candidate in candidates:
        item = video_url(candidate)
        if item and item["url"] not in seen: videos.append(item); seen.add(item["url"])
    files = []
    for row in detail.get("_aFiles", []):
        url = https_url(row.get("_sDownloadUrl")); parsed = urlparse(url)
        if row.get("_bIsArchived") or parsed.netloc != "gamebanana.com" or not re.fullmatch(r"/dl/\d+/?", parsed.path): continue
        files.append({"name": row.get("_sFile", "Download"), "url": url, "size": row.get("_nFilesize"), "version": row.get("_sVersion", "")})
    parser = PlainText(); parser.feed(raw_text)
    ratings = detail.get("_aContentRatings", {}) or {}
    return {"media_schema": 2, "source_visibility": detail.get("_sInitialVisibility", "unknown"),
            "images": images, "videos": videos, "files": files,
            "view_count": detail.get("_nViewCount"), "total_likes_at_scan": detail.get("_nLikeCount"),
            "download_count": detail.get("_nDownloadCount"), "author": detail.get("_aSubmitter", {}).get("_sName", ""),
            "category": detail.get("_aCategory", {}).get("_sName", "Mod"),
            "description": re.sub(r"\n{3,}", "\n\n", "".join(parser.parts)).strip()[:2000],
            "sensitive": detail.get("_sInitialVisibility") == "hide" or bool(set(ratings) & {"nu", "pn", "sc", "ft"})}


def enrich_state(client, state, top=10):
    eligible = [m for m in state["mods"] if str(m["id"]) in state["counts"]]
    eligible.sort(key=lambda m: (-state["counts"][str(m["id"])]["weekly_likes"], m["id"]))
    details = state.setdefault("details", {})
    for mod in eligible[:top]:
        key = str(mod["id"])
        if key in details and details[key].get("media_schema") == 2 and not details[key].get("media_error"): continue
        try:
            item = client.get(f"Mod/{key}/ProfilePage", records=False)
            if item.get("_idRow") != mod["id"] or item.get("_aGame", {}).get("_idRow") != state_game(state)["id"]:
                raise ValueError("Detail ID/game mismatch")
            details[key] = normalize_details(item)
        except Exception as error:
            details[key] = {"media_error": str(error)}
