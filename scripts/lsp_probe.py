#!/usr/bin/env python3

import argparse
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path


class ProtocolError(RuntimeError):
    pass


def read_exact(stream, length):
    chunks = []
    remaining = length
    while remaining:
        chunk = stream.read(remaining)
        if not chunk:
            raise ProtocolError("unexpected EOF in JSON-RPC payload")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def read_message(stream):
    headers = {}
    while True:
        line = stream.readline()
        if not line:
            raise EOFError
        if line in (b"\n", b"\r\n"):
            break
        try:
            name, value = line.decode("ascii").split(":", 1)
        except (UnicodeDecodeError, ValueError) as error:
            raise ProtocolError("malformed JSON-RPC header") from error
        headers[name.strip().lower()] = value.strip()

    try:
        length = int(headers["content-length"])
    except (KeyError, ValueError) as error:
        raise ProtocolError("missing or invalid Content-Length header") from error
    if length < 0:
        raise ProtocolError("negative Content-Length header")

    payload = read_exact(stream, length)
    try:
        return json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProtocolError("invalid JSON-RPC payload") from error


def write_message(stream, message):
    payload = json.dumps(
        message, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    header = "Content-Length: {}\r\n\r\n".format(len(payload)).encode("ascii")
    stream.write(header)
    stream.write(payload)
    stream.flush()


def reader_loop(stream, messages):
    try:
        while True:
            messages.put(read_message(stream))
    except EOFError:
        messages.put(None)
    except BaseException as error:
        messages.put(error)


def normalize_position(position):
    return {
        "line": int(position.get("line", 0)),
        "character": int(position.get("character", 0)),
    }


def normalize_diagnostics(by_uri):
    normalized = []
    for uri, diagnostics in by_uri.items():
        for diagnostic in diagnostics:
            range_value = diagnostic.get("range", {})
            normalized.append(
                {
                    "uri": uri,
                    "range": {
                        "start": normalize_position(range_value.get("start", {})),
                        "end": normalize_position(range_value.get("end", {})),
                    },
                    "message": str(diagnostic.get("message", "")).replace(
                        "\r\n", "\n"
                    ),
                }
            )

    normalized.sort(
        key=lambda item: (
            item["uri"],
            item["range"]["start"]["line"],
            item["range"]["start"]["character"],
            item["range"]["end"]["line"],
            item["range"]["end"]["character"],
            item["message"],
        )
    )
    return normalized


class LspSession:
    def __init__(self, server, timeout):
        self.timeout = timeout
        self.stderr_file = tempfile.TemporaryFile()
        self.process = subprocess.Popen(
            [server, "--wait-on-shutdown"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self.stderr_file,
        )
        self.messages = queue.Queue()
        self.diagnostics = {}
        self.reader = threading.Thread(
            target=reader_loop,
            args=(self.process.stdout, self.messages),
            daemon=True,
        )
        self.reader.start()

    def send(self, message):
        if self.process.stdin is None:
            raise ProtocolError("language server stdin is unavailable")
        write_message(self.process.stdin, message)

    def stderr_text(self):
        self.stderr_file.flush()
        self.stderr_file.seek(0)
        return self.stderr_file.read().decode("utf-8", errors="replace")

    def handle_server_request(self, message):
        method = message.get("method")
        if method == "workspace/configuration":
            items = message.get("params", {}).get("items", [])
            result = [None for _ in items]
        else:
            result = None
        self.send({"jsonrpc": "2.0", "id": message["id"], "result": result})

    def handle_message(self, message):
        if message.get("method") == "textDocument/publishDiagnostics":
            params = message.get("params", {})
            uri = str(params.get("uri", ""))
            self.diagnostics[uri] = list(params.get("diagnostics", []))
        elif "method" in message and "id" in message:
            self.handle_server_request(message)

    def wait_for_response(self, request_id):
        deadline = time.monotonic() + self.timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProtocolError(
                    "timed out waiting for response {}".format(request_id)
                )
            try:
                message = self.messages.get(timeout=remaining)
            except queue.Empty as error:
                raise ProtocolError(
                    "timed out waiting for response {}".format(request_id)
                ) from error

            if message is None:
                raise ProtocolError("language server closed stdout")
            if isinstance(message, BaseException):
                raise message
            self.handle_message(message)
            if message.get("id") == request_id and (
                "result" in message or "error" in message
            ):
                if "error" in message:
                    raise ProtocolError(
                        "language server returned an error: {}".format(
                            json.dumps(message["error"], ensure_ascii=False)
                        )
                    )
                return message.get("result")

    def wait_for_diagnostics(self, uri):
        deadline = time.monotonic() + self.timeout
        while uri not in self.diagnostics:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProtocolError(
                    "timed out waiting for diagnostics for {}".format(uri)
                )
            try:
                message = self.messages.get(timeout=remaining)
            except queue.Empty as error:
                raise ProtocolError(
                    "timed out waiting for diagnostics for {}".format(uri)
                ) from error

            if message is None:
                raise ProtocolError(
                    "language server closed stdout before publishing diagnostics"
                )
            if isinstance(message, BaseException):
                raise message
            self.handle_message(message)

    def close_stdin(self):
        if self.process.stdin is not None and not self.process.stdin.closed:
            self.process.stdin.close()

    def drain_until_eof(self):
        deadline = time.monotonic() + self.timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProtocolError("timed out draining language server messages")
            try:
                message = self.messages.get(timeout=remaining)
            except queue.Empty as error:
                raise ProtocolError(
                    "timed out draining language server messages"
                ) from error

            if message is None:
                return
            if isinstance(message, BaseException):
                raise message
            self.handle_message(message)

    def close(self):
        timed_out = False
        return_code = None
        stderr = ""
        self.close_stdin()
        try:
            try:
                return_code = self.process.wait(timeout=self.timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                self.process.terminate()
                try:
                    return_code = self.process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    return_code = self.process.wait()
            self.reader.join(timeout=self.timeout)
            stderr = self.stderr_text()
        finally:
            if self.reader.is_alive() and self.process.stdout is not None:
                self.process.stdout.close()
                self.reader.join(timeout=1)
            if self.process.stdout is not None and not self.process.stdout.closed:
                self.process.stdout.close()
            if not self.stderr_file.closed:
                self.stderr_file.close()

        if self.reader.is_alive():
            raise ProtocolError("language server reader thread did not stop")
        if timed_out:
            raise ProtocolError("language server did not exit after shutdown")
        if return_code != 0:
            raise ProtocolError(
                "language server exited with status {}: {}".format(
                    return_code, stderr.strip()
                )
            )

    def abort(self):
        try:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait()
        finally:
            if self.process.stdin is not None and not self.process.stdin.closed:
                self.process.stdin.close()
            self.reader.join(timeout=self.timeout)
            if self.reader.is_alive() and self.process.stdout is not None:
                self.process.stdout.close()
                self.reader.join(timeout=1)
            if self.process.stdout is not None and not self.process.stdout.closed:
                self.process.stdout.close()
            if not self.stderr_file.closed:
                self.stderr_file.close()
        if self.reader.is_alive():
            raise ProtocolError("language server reader thread did not stop during abort")


def probe(server, fixture, timeout):
    fixture_path = Path(fixture).resolve()
    text = fixture_path.read_text(encoding="utf-8")
    uri = fixture_path.as_uri()
    session = LspSession(server, timeout)
    try:
        session.send(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "processId": os.getpid(),
                    "rootUri": fixture_path.parent.as_uri(),
                    "capabilities": {
                        "textDocument": {
                            "publishDiagnostics": {"relatedInformation": True}
                        }
                    },
                    "clientInfo": {"name": "tree-sitter-mojo-oracle"},
                },
            }
        )
        session.wait_for_response(1)
        session.send({"jsonrpc": "2.0", "method": "initialized", "params": {}})
        session.send(
            {
                "jsonrpc": "2.0",
                "method": "textDocument/didOpen",
                "params": {
                    "textDocument": {
                        "uri": uri,
                        "languageId": "mojo",
                        "version": 1,
                        "text": text,
                    }
                },
            }
        )
        session.wait_for_diagnostics(uri)
        session.send(
            {"jsonrpc": "2.0", "id": 2, "method": "shutdown", "params": None}
        )
        session.wait_for_response(2)
        session.send({"jsonrpc": "2.0", "method": "exit", "params": None})
        session.close_stdin()
        session.drain_until_eof()
        session.close()
        return normalize_diagnostics(session.diagnostics)
    except BaseException:
        session.abort()
        raise


def parse_args():
    parser = argparse.ArgumentParser(
        description="Probe Mojo LSP diagnostics for one fixture"
    )
    parser.add_argument("--server", required=True)
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--timeout", type=float, default=10.0)
    return parser.parse_args()


def main():
    args = parse_args()
    server = Path(args.server).resolve()
    fixture = Path(args.fixture).resolve()
    if not server.is_file() or not os.access(str(server), os.X_OK):
        raise SystemExit("LSP server is not executable: {}".format(server))
    if not fixture.is_file():
        raise SystemExit("fixture does not exist: {}".format(fixture))
    if args.timeout <= 0:
        raise SystemExit("timeout must be greater than zero")

    try:
        diagnostics = probe(str(server), str(fixture), args.timeout)
    except (OSError, ProtocolError) as error:
        raise SystemExit("LSP probe failed: {}".format(error))
    json.dump(diagnostics, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
