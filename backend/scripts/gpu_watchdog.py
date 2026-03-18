#!/usr/bin/env python3
"""GPU resource watchdog — monitors Omelette and cleans up GPU resources on exit.

Runs as an independent process. When the monitored Omelette process dies
(including kill -9, OOM, crash), this script kills MinerU and clears GPU caches.

Usage:
    python scripts/gpu_watchdog.py                      # foreground
    python scripts/gpu_watchdog.py --daemon              # background (detach)
    python scripts/gpu_watchdog.py --pid-file /path.pid  # custom PID file
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | gpu_watchdog | %(message)s",
)
logger = logging.getLogger("gpu_watchdog")


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def find_pid_by_port(port: int) -> int | None:
    """Find PID listening on a TCP port."""
    try:
        with open("/proc/net/tcp") as f:
            hex_port = f":{port:04X}"
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 10 and hex_port in parts[1] and parts[3] == "0A":
                    inode = parts[9]
                    for pid_dir in os.listdir("/proc"):
                        if not pid_dir.isdigit():
                            continue
                        try:
                            fd_dir = f"/proc/{pid_dir}/fd"
                            for fd in os.listdir(fd_dir):
                                link = os.readlink(f"{fd_dir}/{fd}")
                                if f"socket:[{inode}]" in link:
                                    return int(pid_dir)
                        except (OSError, PermissionError):
                            continue
    except (OSError, PermissionError):
        pass

    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return int(result.stdout.strip().split("\n")[0])
    except (subprocess.TimeoutExpired, ValueError, OSError, FileNotFoundError):
        pass
    return None


def is_mineru_process(pid: int) -> bool:
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            return "mineru" in f.read().decode(errors="replace").lower()
    except (OSError, PermissionError):
        return False


def kill_mineru(port: int) -> None:
    pid = find_pid_by_port(port)
    if pid and is_mineru_process(pid):
        logger.info("Killing MinerU pid=%d on port %d", pid, port)
        try:
            os.kill(pid, signal.SIGTERM)
            for _ in range(10):
                time.sleep(1)
                if not pid_alive(pid):
                    logger.info("MinerU pid=%d terminated", pid)
                    return
            os.kill(pid, signal.SIGKILL)
            logger.info("Force-killed MinerU pid=%d", pid)
        except (OSError, ProcessLookupError):
            pass
    else:
        logger.info("No MinerU found on port %d", port)


def cleanup(pid_file: Path, mineru_port: int) -> None:
    logger.info("Omelette process gone — running cleanup")
    kill_mineru(mineru_port)
    if pid_file.exists():
        try:
            pid_file.unlink()
            logger.info("Removed PID file: %s", pid_file)
        except OSError:
            pass
    logger.info("Cleanup complete")


def wait_for_pid_file(pid_file: Path, timeout: int = 60) -> int | None:
    """Wait for PID file to appear and return the PID."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if pid_file.exists():
            try:
                pid = int(pid_file.read_text().strip())
                if pid_alive(pid):
                    return pid
            except (ValueError, OSError):
                pass
        time.sleep(2)
    return None


def daemonize() -> None:
    """Double-fork to detach from terminal."""
    if os.fork() > 0:
        sys.exit(0)
    os.setsid()
    if os.fork() > 0:
        sys.exit(0)
    devnull_r = open(os.devnull)  # noqa: SIM115
    devnull_w = open(os.devnull, "w")  # noqa: SIM115
    sys.stdin = devnull_r
    sys.stdout = devnull_w
    sys.stderr = devnull_w


def main() -> None:
    parser = argparse.ArgumentParser(description="GPU watchdog for Omelette")
    parser.add_argument("--pid-file", default="./data/omelette.pid", help="Path to PID file")
    parser.add_argument("--interval", type=int, default=5, help="Check interval in seconds")
    parser.add_argument("--mineru-port", type=int, default=8010, help="MinerU port")
    parser.add_argument("--daemon", action="store_true", help="Run as daemon")
    args = parser.parse_args()

    pid_file = Path(args.pid_file)

    if args.daemon:
        daemonize()

    logger.info(
        "GPU watchdog started (pid_file=%s, interval=%ds, mineru_port=%d)", pid_file, args.interval, args.mineru_port
    )

    target_pid = wait_for_pid_file(pid_file, timeout=120)
    if target_pid is None:
        logger.warning("No Omelette process found within timeout, exiting")
        return
    logger.info("Monitoring Omelette pid=%d", target_pid)

    try:
        while True:
            time.sleep(args.interval)
            if not pid_alive(target_pid):
                cleanup(pid_file, args.mineru_port)
                return
    except KeyboardInterrupt:
        logger.info("Watchdog stopped by user")


if __name__ == "__main__":
    main()
