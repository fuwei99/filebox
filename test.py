#!/usr/bin/env python3
import argparse
import json
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def ok(msg: str) -> None:
    print(f"[OK] {msg}")


def warn(msg: str) -> None:
    print(f"[WARN] {msg}")


def fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def normalize_endpoint(endpoint: str) -> str:
    endpoint = (endpoint or "").strip()
    if not endpoint:
        return ""
    if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
        endpoint = "https://" + endpoint
    return endpoint.rstrip("/")


def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        raise FileNotFoundError(f"配置文件不存在: {config_path}")
    with config_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def test_dns(host: str, port: int, timeout: float) -> bool:
    try:
        socket.setdefaulttimeout(timeout)
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        ips = sorted({item[4][0] for item in infos})
        ok(f"DNS 解析成功: {host} -> {', '.join(ips[:6])}")
        if len(ips) > 6:
            print(f"      (其余 {len(ips) - 6} 个 IP 已省略)")
        return True
    except Exception as e:
        fail(f"DNS 解析失败: {host}, 错误: {e}")
        return False


def test_tcp(host: str, port: int, timeout: float) -> bool:
    start = time.time()
    sock = None
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        cost = (time.time() - start) * 1000
        ok(f"TCP 连接成功: {host}:{port} ({cost:.0f} ms)")
        return True
    except Exception as e:
        fail(f"TCP 连接失败: {host}:{port}, 错误: {e}")
        return False
    finally:
        if sock:
            sock.close()


def test_tls(host: str, port: int, timeout: float) -> bool:
    raw_sock = None
    tls_sock = None
    try:
        raw_sock = socket.create_connection((host, port), timeout=timeout)
        ctx = ssl.create_default_context()
        tls_sock = ctx.wrap_socket(raw_sock, server_hostname=host)
        cipher = tls_sock.cipher()
        ok(f"TLS 握手成功: {host}:{port}, 协议={tls_sock.version()}, 加密套件={cipher[0] if cipher else 'unknown'}")
        return True
    except Exception as e:
        fail(f"TLS 握手失败: {host}:{port}, 错误: {e}")
        return False
    finally:
        if tls_sock:
            tls_sock.close()
        elif raw_sock:
            raw_sock.close()


def test_http(url: str, timeout: float) -> bool:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            code = resp.getcode()
            ctype = resp.headers.get("content-type", "unknown")
            ok(f"HTTP 可达: {url} -> {code}, content-type={ctype}")
            return True
    except urllib.error.HTTPError as e:
        # 4xx/5xx 也说明“网络可达 + 服务有响应”
        ctype = e.headers.get("content-type", "unknown") if e.headers else "unknown"
        ok(f"HTTP 可达(返回错误码也算连通): {url} -> {e.code}, content-type={ctype}")
        return True
    except Exception as e:
        fail(f"HTTP 请求失败: {url}, 错误: {e}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="测试本机到 Cloudflare R2 Endpoint 的连通性（DNS/TCP/TLS/HTTP）")
    parser.add_argument("--config", default="config.json", help="配置文件路径，默认 config.json")
    parser.add_argument("--timeout", type=float, default=8.0, help="超时时间（秒），默认 8")
    args = parser.parse_args()

    config_path = Path(args.config).resolve()
    print(f"[*] 使用配置: {config_path}")

    try:
        config = load_config(config_path)
    except Exception as e:
        fail(str(e))
        return 2

    r2 = (config or {}).get("r2", {})
    endpoint = normalize_endpoint(r2.get("endpoint", ""))
    bucket = (r2.get("bucketName", "") or "").strip()

    if not endpoint:
        fail("config.json 里 r2.endpoint 为空，无法测试")
        return 2

    parsed = urllib.parse.urlparse(endpoint)
    host = parsed.hostname
    if not host:
        fail(f"endpoint 解析失败: {endpoint}")
        return 2

    is_https = parsed.scheme == "https"
    port = parsed.port or (443 if is_https else 80)

    print("\n=== 基础信息 ===")
    print(f"endpoint: {endpoint}")
    print(f"bucket:   {bucket or '(未配置)'}")
    print(f"host:     {host}")
    print(f"port:     {port}")
    print(f"scheme:   {parsed.scheme}")

    print("\n=== 连通性测试 ===")
    dns_ok = test_dns(host, port, args.timeout)
    tcp_ok = test_tcp(host, port, args.timeout) if dns_ok else False
    tls_ok = test_tls(host, port, args.timeout) if (dns_ok and tcp_ok and is_https) else (tcp_ok if not is_https else False)

    print("\n=== HTTP 测试 ===")
    http_root_ok = test_http(endpoint + "/", args.timeout) if (dns_ok and tcp_ok) else False
    http_bucket_ok = False
    if bucket and dns_ok and tcp_ok:
        http_bucket_ok = test_http(f"{endpoint}/{bucket}", args.timeout)
    elif not bucket:
        warn("未配置 bucketName，跳过 bucket 路径测试")

    print("\n=== 结论 ===")
    if dns_ok and tcp_ok and (tls_ok or not is_https) and (http_root_ok or http_bucket_ok):
        ok("你的网络到 R2 Endpoint 是连通的。")
        print("    说明：如果项目上传仍 413，通常是部署平台网关限制，不是你本地到 R2 的网络问题。")
        return 0

    fail("你的网络到 R2 Endpoint 存在连通性问题（见上面 FAIL 项）。")
    print("    建议：关闭/开启 VPN 各测一次，对比结果。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
