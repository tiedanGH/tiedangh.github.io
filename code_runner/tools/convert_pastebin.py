# -*- coding: utf-8 -*-
"""
将 mirai-compiler-framework 的 PastebinData.yml 转换为 code_runner 沙箱的「导入全部」存档（cr-full）。

- 仅保存代码链接（codeSource='url'），不下载代码内容——沙箱执行时会自动从 URL 获取。
- 逐个访问 URL 校验有效性：404 等失效链接回退读取 bot 的 CodeCache.yml 代码缓存，
  直接把缓存代码写入项目（codeSource='textarea'）；缓存中也没有才警告跳过。
- 沙箱执行器不支持的链接（如 hastebin.com）同样回退代码缓存。
- hiddenUrl 列表中的隐藏项目不放入存档。
- 读取 PastebinBucket.yml：录入全部存储库（仅 id/名称/描述）及其与项目的关联关系；
  不复制存储内容（content）与备份（backups）。关联按项目名解析到存档内的项目。
- 运行日志写入 txt；有效项目写入 cr-full JSON，可在沙箱「项目管理 → 导入全部」直接导入
  （全盘替换，导入前会自动下载当前数据备份）。

用法:
    python convert_pastebin.py [--input PastebinData.yml] [--buckets PastebinBucket.yml]
                               [--output pastebin-archive.json] [--log convert-log.txt]
                               [--delay 0.3] [--timeout 15] [--only 名称1,名称2]
"""
import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
import yaml

DEFAULT_DATA_DIR = r"D:\0Linux传输\overflow\data\site.tiedan.mirai-compiler-framework"
DEFAULT_INPUT = str(Path(DEFAULT_DATA_DIR) / "PastebinData.yml")
SCRIPT_DIR = Path(__file__).resolve().parent

# 沙箱支持的语言下拉值与输出格式（用于规范化/告警）
SANDBOX_LANGUAGES = {"python", "c", "cpp", "java", "javascript", "typescript",
                     "go", "rust", "ruby", "php", "swift", "bash", "text"}
SANDBOX_FORMATS = {"text", "markdown", "base64", "image", "LaTeX", "json", "ForwardMessage", "Audio"}

# 沙箱执行器（executor.js fetchCodeFromUrl）支持的 URL 前缀；不在列表内的链接运行时无法获取
SANDBOX_URL_PREFIXES = (
    "https://pastebin.ubuntu.com/p/",
    "https://glot.io/snippets/",
    "https://pastebin.com/raw/",
    "https://gist.githubusercontent.com/",
    "https://bytebin.lucko.me/",
    "https://pastes.dev/",
    "https://p.ip.fi/",
)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


class Logger:
    def __init__(self, path):
        self.f = open(path, "w", encoding="utf-8")

    def log(self, level, msg):
        line = "[%s] [%s] %s" % (datetime.now().strftime("%H:%M:%S"), level, msg)
        print(line, flush=True)
        self.f.write(line + "\n")
        self.f.flush()

    def close(self):
        self.f.close()


def extract_url(url):
    """bot 支持 [url] 包裹形式（PastebinUrlHelper.extractUrl）。"""
    url = str(url or "").strip()
    if url.startswith("[") and "]" in url:
        return url[1:url.index("]")]
    return url


def normalize_url(url):
    """规范化为沙箱执行器可用的链接（pastebin.com 非 raw 链接转 raw）。"""
    if url.startswith("https://pastebin.com/") and "/raw/" not in url:
        return url.replace("https://pastebin.com/", "https://pastebin.com/raw/")
    return url


def check_url(session, url, timeout):
    """访问 URL 校验有效性（不保存内容）。返回 error，None 表示有效。"""
    # pastes.dev 页面是前端应用，校验其 raw API
    probe = url
    if url.startswith("https://pastes.dev/"):
        probe = url.replace("https://pastes.dev/", "https://api.pastes.dev/")
    with session.get(probe, timeout=timeout, stream=True) as r:
        if r.status_code == 200:
            return None
        return "HTTP %d" % r.status_code


def normalize_language(lang, log, name):
    lang = str(lang or "").strip().lower()
    if lang and lang not in SANDBOX_LANGUAGES:
        log.log("WARN", "项目「%s」语言 %s 不在沙箱语言下拉列表中，导入后需手动选择语言" % (name, lang))
    return lang


def normalize_format(fmt, log, name):
    fmt = str(fmt or "text").strip()
    if fmt not in SANDBOX_FORMATS:
        log.log("WARN", "项目「%s」输出格式 %s 无效，已回退为 text" % (name, fmt))
        return "text"
    return fmt


def main():
    ap = argparse.ArgumentParser(description="PastebinData.yml -> code_runner cr-full 存档（仅链接）")
    ap.add_argument("--input", default=DEFAULT_INPUT)
    ap.add_argument("--cache", default="", help="CodeCache.yml 路径（默认取 --input 同目录）")
    ap.add_argument("--buckets", default="", help="PastebinBucket.yml 路径（默认取 --input 同目录）")
    ap.add_argument("--output", default=str(SCRIPT_DIR / "pastebin-archive.json"))
    ap.add_argument("--log", default=str(SCRIPT_DIR / "convert-log.txt"))
    ap.add_argument("--delay", type=float, default=0.3, help="两次请求间隔秒数")
    ap.add_argument("--timeout", type=float, default=15)
    ap.add_argument("--only", default="", help="仅处理这些项目名（逗号分隔，用于测试）")
    args = ap.parse_args()

    log = Logger(args.log)
    log.log("INFO", "输入: %s" % args.input)
    log.log("INFO", "输出: %s" % args.output)

    with open(args.input, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    pastebin = data.get("pastebin") or {}
    log.log("INFO", "共读取 %d 个项目" % len(pastebin))

    # bot 的代码缓存（项目名 -> 代码），用于失效/不支持链接的回退
    cache_path = Path(args.cache) if args.cache else Path(args.input).parent / "CodeCache.yml"
    code_cache = {}
    if cache_path.is_file():
        with open(cache_path, "r", encoding="utf-8") as f:
            code_cache = (yaml.safe_load(f) or {}).get("CodeCache") or {}
        log.log("INFO", "代码缓存: %s（%d 条）" % (cache_path, len(code_cache)))
    else:
        log.log("WARN", "未找到代码缓存文件 %s，失效链接将无法回退" % cache_path)

    # 隐藏URL的项目（hiddenUrl 列表）不放入存档
    hidden = {str(n) for n in (data.get("hiddenUrl") or [])}
    if hidden:
        excluded = [n for n in pastebin if str(n) in hidden]
        pastebin = {k: v for k, v in pastebin.items() if str(k) not in hidden}
        for n in excluded:
            log.log("INFO", "项目「%s」为隐藏URL项目，已过滤" % n)
        log.log("INFO", "已过滤 %d 个隐藏URL项目，剩余 %d 个" % (len(excluded), len(pastebin)))

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    if only:
        pastebin = {k: v for k, v in pastebin.items() if k in only}
        log.log("INFO", "--only 过滤后剩余 %d 个项目" % len(pastebin))

    session = requests.Session()
    session.headers["User-Agent"] = UA

    now_ms = int(time.time() * 1000)
    projects = {}
    name_to_pid = {}     # 项目名 -> 存档内 pid（用于解析存储库关联）
    ok = cached = skipped = 0

    for idx, (name, item) in enumerate(pastebin.items(), 1):
        item = item or {}
        url = normalize_url(extract_url(item.get("url")))
        prefix = "(%d/%d) %s" % (idx, len(pastebin), name)

        # 链接校验：失败时给出回退原因
        reason = None
        if not url:
            reason = "缺少 URL"
        elif not url.startswith(SANDBOX_URL_PREFIXES):
            reason = "沙箱执行器不支持此链接"
        else:
            try:
                err = check_url(session, url, args.timeout)
            except requests.RequestException as e:
                err = "请求异常：%s" % e
            if err is not None:
                reason = "404 链接失效" if "404" in err else err
            time.sleep(args.delay)

        cache_code = None
        if reason is not None:
            cache_code = code_cache.get(str(name))
            if not (isinstance(cache_code, str) and cache_code.strip()):
                skipped += 1
                log.log("WARN", "%s：%s，且代码缓存中无此项目，跳过（%s）" % (prefix, reason, url or "无链接"))
                continue

        fmt = normalize_format(item.get("format"), log, name)
        storage_on = str(item.get("storage")).lower() == "true"
        for extra in ("util", "width"):
            if item.get(extra) is not None:
                log.log("INFO", "项目「%s」含 %s=%s（沙箱暂不支持此配置，已忽略）" % (name, extra, item.get(extra)))

        pid = "p_imp%04d" % idx
        entry = {
            "name": str(name),
            "language": normalize_language(item.get("language"), log, name),
            "codeSource": "url",                 # 运行时由沙箱自动从 URL 获取代码
            "codeUrl": url,
            "code": "",
            "stdin": str(item.get("stdin") or ""),
            "outputFormat": fmt,
            "storageOption": "enabled" if storage_on else "disabled",
            "updatedAt": now_ms,
        }
        info = "%s, %s%s" % (entry["language"] or "?", fmt, ", 存储" if storage_on else "")
        if cache_code is not None:
            # 链接不可用：改用 bot 代码缓存，直接内置代码
            entry["codeSource"] = "textarea"
            entry["code"] = cache_code.replace("\r\n", "\n")
            cached += 1
            log.log("OK", "%s：%s，已使用代码缓存（%d 字符）（%s）" % (prefix, reason, len(entry["code"]), info))
        else:
            ok += 1
            log.log("OK", "%s：链接有效（%s）%s" % (prefix, info, url))
        projects[pid] = entry
        name_to_pid[str(name)] = pid

    # 存储库：录入 id/名称/描述 + 项目关联（不复制 content / backups）
    bucket_path = Path(args.buckets) if args.buckets else Path(args.input).parent / "PastebinBucket.yml"
    buckets_out = {}                 # str(id) -> cr_buckets 条目
    storage_projects = {}            # pid -> {global, storage, links}
    n_buckets = n_links = n_unresolved = n_encrypted = 0
    if bucket_path.is_file():
        with open(bucket_path, "r", encoding="utf-8") as f:
            bucket_data = (yaml.safe_load(f) or {}).get("bucket") or {}
        log.log("INFO", "=" * 50)
        log.log("INFO", "存储库: %s（%d 个）" % (bucket_path, len(bucket_data)))
        for bid, binfo in bucket_data.items():
            binfo = binfo or {}
            try:
                bid = int(bid)
            except (TypeError, ValueError):
                log.log("WARN", "存储库编号 %r 非整数，跳过" % bid)
                continue
            name = str(binfo.get("name") or ("存储库" + str(bid)))
            # 加密存储库不导出、不关联任何项目
            if str(binfo.get("encrypt")).lower() == "true":
                n_encrypted += 1
                log.log("WARN", "存储库 id=%d「%s」已加密，已跳过（不导出、不关联）" % (bid, name))
                continue
            desc = str(binfo.get("desc") or "")
            buckets_out[str(bid)] = {
                "id": bid, "name": name, "content": "", "desc": desc,
                "createdAt": now_ms, "updatedAt": now_ms,
                "backups": [None, None, None],   # 不复制备份
            }
            n_buckets += 1
            proj_names = str(binfo.get("projects") or "").split()
            linked = []
            for pn in proj_names:
                pid = name_to_pid.get(pn)
                if pid:
                    sp = storage_projects.setdefault(pid, {"global": "", "storage": {}, "links": []})
                    if bid not in sp["links"]:
                        sp["links"].append(bid)
                        linked.append(pn)
                        n_links += 1
                else:
                    n_unresolved += 1
                    log.log("WARN", "存储库「%s」(id=%d) 关联项目「%s」不在存档中，已跳过此关联" % (name, bid, pn))
            log.log("OK", "存储库 id=%d「%s」：关联 %d/%d 个项目%s"
                    % (bid, name, len(linked), len(proj_names), ("（%s）" % " ".join(linked)) if linked else ""))
    else:
        log.log("WARN", "未找到存储库文件 %s，存档将不含存储库" % bucket_path)

    archive = {
        "schema": 1,
        "kind": "cr-full",
        "exportedAt": now_ms,
        "projects": {"version": 1, "activeId": "default", "projects": projects},
        "storage": {"version": 1, "projects": storage_projects},
        "buckets": {"version": 1, "buckets": buckets_out},
    }
    out_text = json.dumps(archive, ensure_ascii=False, indent=1)
    Path(args.output).write_text(out_text, encoding="utf-8")

    size_mb = len(out_text.encode("utf-8")) / 1024 / 1024
    log.log("INFO", "=" * 50)
    log.log("INFO", "完成：链接有效 %d，代码缓存回退 %d，跳过（链接失效且无缓存） %d" % (ok, cached, skipped))
    log.log("INFO", "存储库 %d 个（跳过加密库 %d 个），建立项目关联 %d 条，未解析关联 %d 条"
            % (n_buckets, n_encrypted, n_links, n_unresolved))
    log.log("INFO", "存档已写入 %s（%.2f MB）" % (args.output, size_mb))
    if size_mb > 4:
        log.log("WARN", "存档超过 4MB，可能超出浏览器 localStorage 配额，导入时请留意保存失败提示")
    log.log("INFO", "导入方式：沙箱「项目管理 → 导入全部」选择该文件（全盘替换，导入前会自动下载当前数据备份）")
    log.close()


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    main()
